import ffmpeg from 'fluent-ffmpeg';
import { existsSync, promises as fs } from 'fs';
import { join, resolve, dirname, basename, extname } from 'path';
import { tmpdir } from 'os';
import { execFile } from 'child_process';
import { v4 as uuidv4 } from 'uuid';
import { OUTPUT_DIR } from './outputStorage.js';

/**
 * Escribe el filtro complejo a un archivo temporal en vez de pasarlo como argumento de
 * línea de comandos: grafos de filtros muy grandes (muchos clips) pueden superar el
 * límite de longitud de línea de comandos de Windows.
 */
async function writeFilterScript(filterString: string): Promise<string> {
  const scriptPath = join(tmpdir(), `ffmpeg-filter-${uuidv4()}.txt`);
  await fs.writeFile(scriptPath, filterString, 'utf-8');
  return scriptPath;
}

// En Windows se conserva la instalación local existente; en macOS/Linux se usa el
// binario disponible en PATH (por ejemplo, instalado con `brew install ffmpeg`).
const ffmpegPath = process.env.FFMPEG_PATH || (process.platform === 'win32' ? 'C:\\ffmpeg\\bin\\ffmpeg.exe' : 'ffmpeg');
const ffprobePath = process.env.FFPROBE_PATH || (process.platform === 'win32' ? 'C:\\ffmpeg\\bin\\ffprobe.exe' : 'ffprobe');

if (existsSync(ffmpegPath)) ffmpeg.setFfmpegPath(ffmpegPath);
if (existsSync(ffprobePath)) ffmpeg.setFfprobePath(ffprobePath);

export interface SceneBoundary {
  start: number;
  end: number;
  /** Factor de cámara lenta aplicado en el render (ver syncTimelineToAudio); 1 = sin cambio. */
  speedFactor?: number;
}

export interface TimelineSegment {
  inputIndex: number;
  start: number;
  end: number;
  isImage?: boolean;
  /** Factor de cámara lenta aplicado en el render (ver syncTimelineToAudio); 1 = sin cambio. */
  speedFactor?: number;
}

export interface TextOverlay {
  start: number;
  end: number;
  text: string;
}

export interface BackgroundMusicConfig {
  enabled: boolean;
  path?: string;
  volume?: number;
}

export type TransitionType = 'fade' | 'dissolve' | 'wipeleft' | 'wiperight' | 'slideup' | 'slidedown';

export interface TransitionConfig {
  enabled: boolean;
  type: TransitionType;
  duration: number;
}

export type AnimationType = 'zoomin' | 'zoomout' | 'pan' | 'none';

export interface AnimationConfig {
  enabled: boolean;
  type: AnimationType;
}

export interface ProcessConfig {
  videoPaths: string[];
  splicePoints?: number[];
  sourceTypes?: Array<'video' | 'image'>;
  imageDurations?: number[];
  audioPath: string;
  subtitles: boolean;
  backgroundMusic?: BackgroundMusicConfig;
  textOverlays?: TextOverlay[];
  outputFilename?: string;
  /**
   * Imágenes/clips de relleno: si el contenido principal queda más corto que el audio,
   * se usan primero para llenar ese hueco (en vez de solo repetir clips ya usados); si
   * aun así falta tiempo, se estira levemente el ritmo del conjunto (cámara lenta) y solo
   * como último recurso se repite lo mínimo indispensable.
   */
  complementaryPaths?: string[];
  complementarySourceTypes?: Array<'video' | 'image'>;
  complementaryImageDurations?: number[];
  resolution?: '720p' | '1080p' | '2k' | '4k';
  fps?: number;
  splitScenes?: boolean;
  allowClipRepeat?: boolean;
  /**
   * Al desagrupar en escenas, mezcla los fragmentos por todo el video (en vez de solo
   * intercambiar cada par de vecinos). Da un resultado más distinto del original —
   * ideal para nichos genéricos donde no importa que el video ya no siga el ritmo
   * exacto de la narración. Desactivado, el intercambio de vecinos mantiene cada
   * fragmento cerca de su posición original, para cuando sí importa la sincronización.
   */
  fullShuffle?: boolean;
  transitions?: TransitionConfig;
  animations?: AnimationConfig;
  maxClipDuration?: number;
}

export interface EventExtra {
  currentSeconds?: number;
  totalSeconds?: number;
}

export type EventCallback = (type: string, message: string, percent?: number, extra?: EventExtra) => void;

function parseTimemarkToSeconds(timemark: string): number {
  const parts = timemark.split(':').map(Number);
  if (parts.some(isNaN)) return 0;
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return parts[0] || 0;
}

function formatDuration(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => n.toString().padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

const RESOLUTION_MAP = {
  '720p': { width: 1280, height: 720 },
  '1080p': { width: 1920, height: 1080 },
  '2k': { width: 2560, height: 1440 },
  '4k': { width: 3840, height: 2160 },
};

const SCENE_THRESHOLD = 0.3;
const SCENE_THRESHOLD_FALLBACK = 0.1;
const MIN_CLIP_DURATION = 0.5;
const MIN_CLIPS_EXPECTED = 100;
// Con más clips que esto, el grafo de filtros de FFmpeg (trim+scale+pad+concat por cada
// uno) puede tardar minutos/horas en inicializarse o directamente colgarse, incluso sin
// transiciones. Se agrupan clips consecutivos para no superar este máximo.
const MAX_CLIPS_SAFETY_CAP = 400;
// Duración máxima permitida para una imagen de referencia convertida en clip animado.
const MAX_IMAGE_CLIP_DURATION = 60;

async function getDuration(filePath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err, data) => {
      if (err) return reject(err);
      resolve(data.format.duration || 0);
    });
  });
}

let qsvAvailableCache: boolean | null = null;

async function isQsvAvailable(): Promise<boolean> {
  if (qsvAvailableCache !== null) return qsvAvailableCache;

  return new Promise(resolve => {
    // Se invoca el binario de ffmpeg directamente (sin pasar por las utilidades de
    // capacidades de fluent-ffmpeg, que pueden fallar al parsear builds muy recientes).
    execFile(
      ffmpegPath,
      ['-f', 'lavfi', '-i', 'color=black:s=320x240:d=0.1', '-c:v', 'h264_qsv', '-frames:v', '1', '-f', 'null', '-'],
      (error) => {
        qsvAvailableCache = !error;
        resolve(!error);
      }
    );
  });
}

async function hasAudioStream(filePath: string): Promise<boolean> {
  return new Promise((resolve) => {
    ffmpeg.ffprobe(filePath, (err, data) => {
      if (err) return resolve(false);
      resolve((data.streams || []).some((s: any) => s.codec_type === 'audio'));
    });
  });
}

async function getVideoCodec(filePath: string): Promise<string | null> {
  return new Promise((resolve) => {
    ffmpeg.ffprobe(filePath, (err, data) => {
      if (err) return resolve(null);
      const videoStream = (data.streams || []).find((s: any) => s.codec_type === 'video');
      resolve(videoStream?.codec_name || null);
    });
  });
}

const CODEC_CONVERSION_CACHE_DIR = join(tmpdir(), '_h264_conversions');
const CACHE_MAX_AGE_DAYS = 7;

async function cleanupOldCacheFiles(): Promise<void> {
  if (!existsSync(CODEC_CONVERSION_CACHE_DIR)) return;

  const now = Date.now();
  const maxAge = CACHE_MAX_AGE_DAYS * 24 * 60 * 60 * 1000;

  try {
    const files = await fs.readdir(CODEC_CONVERSION_CACHE_DIR);
    for (const file of files) {
      const filePath = join(CODEC_CONVERSION_CACHE_DIR, file);
      const stat = await fs.stat(filePath);
      if (now - stat.mtimeMs > maxAge) {
        await fs.unlink(filePath).catch(() => {});
      }
    }
  } catch {
    // Ignorar errores de cleanup
  }
}

async function ensureH264Compatible(
  videoPath: string,
  onEvent?: EventCallback
): Promise<string> {
  const codec = await getVideoCodec(videoPath);

  if (codec === 'h264' || codec === 'h265' || codec === 'hevc') {
    return videoPath;
  }

  if (codec !== 'av1') {
    onEvent?.('info', `ℹ️ Codec ${codec || 'desconocido'}, procesando como está`);
    return videoPath;
  }

  onEvent?.('info', '⚠️ Detectado AV1, pre-convirtiendo a H.264 (esto toma varios minutos)...');

  if (!existsSync(CODEC_CONVERSION_CACHE_DIR)) {
    await fs.mkdir(CODEC_CONVERSION_CACHE_DIR, { recursive: true });
  }

  const originalHash = basename(videoPath, extname(videoPath));
  const cachedPath = join(CODEC_CONVERSION_CACHE_DIR, `${originalHash}_h264.mp4`);

  if (existsSync(cachedPath)) {
    onEvent?.('info', '✓ H.264 convertido encontrado en caché');
    return cachedPath;
  }

  const AV1_CONVERSION_TIMEOUT = 45 * 60 * 1000; // 45 minutos máximo

  return new Promise((resolve, reject) => {
    let resolved = false;
    let command: any = null;

    const timeoutHandle = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        if (command) {
          try {
            command.kill('SIGKILL');
          } catch (e) {}
        }
        onEvent?.('error', `❌ Conversión AV1→H.264 excedió el tiempo máximo (45 minutos). Usando video original.`);
        resolve(videoPath);
      }
    }, AV1_CONVERSION_TIMEOUT);

    try {
      command = ffmpeg(videoPath)
        .videoCodec('libx264')
        .audioCodec('aac')
        .outputOptions('-preset veryfast')
        .outputOptions('-crf 28')
        .outputOptions('-an')
        .on('progress', (progress) => {
          if (!resolved) {
            const percent = Math.round((progress.frames || 0) / 10);
            onEvent?.('progress', `🔄 Convirtiendo AV1→H.264...`, Math.min(percent, 99));
          }
        })
        .on('error', (err) => {
          if (!resolved) {
            resolved = true;
            clearTimeout(timeoutHandle);
            onEvent?.('warning', `⚠️ Error en conversión AV1 (${err.message}). Usando video original.`);
            resolve(videoPath);
          }
        })
        .on('end', () => {
          if (!resolved) {
            resolved = true;
            clearTimeout(timeoutHandle);
            onEvent?.('info', '✅ H.264 listo');
            resolve(cachedPath);
          }
        })
        .save(cachedPath);
    } catch (err) {
      if (!resolved) {
        resolved = true;
        clearTimeout(timeoutHandle);
        onEvent?.('warning', `⚠️ Error iniciando conversión AV1. Usando video original.`);
        resolve(videoPath);
      }
    }
  });
}

async function scanScenesAtThreshold(
  videoPath: string,
  duration: number,
  threshold: number,
  onEvent?: EventCallback
): Promise<SceneBoundary[]> {
  const timestamps: number[] = [0];

  // El filtro "select" descarta casi todos los fotogramas, así que el evento 'progress'
  // estándar de ffmpeg apenas se actualiza. El % real se reporta cuando se detecta un
  // corte de escena (viene del propio decodificador); mientras tanto, un latido por
  // tiempo transcurrido evita que el Monitor parezca colgado, sin inventar un %.
  const scanStart = Date.now();
  let lastReportedSeconds = 0;

  function reportProgress(currentSeconds: number) {
    if (!duration || currentSeconds <= lastReportedSeconds) return;
    lastReportedSeconds = currentSeconds;
    const percent = Math.max(0, Math.min(100, (currentSeconds / duration) * 100));
    onEvent?.(
      'progress',
      `🔍 Analizando escenas... ${Math.round(percent)}% (${formatDuration(currentSeconds)} de ${formatDuration(duration)})`,
      percent,
      { currentSeconds, totalSeconds: duration }
    );
  }

  const heartbeat = onEvent
    ? setInterval(() => {
        const elapsedSeconds = Math.round((Date.now() - scanStart) / 1000);
        onEvent('progress', `🔍 Analizando escenas... (${elapsedSeconds}s transcurridos)`, undefined, {
          currentSeconds: lastReportedSeconds,
          totalSeconds: duration,
        });
      }, 2000)
    : undefined;

  try {
    await new Promise<void>((resolve, reject) => {
      ffmpeg(videoPath)
        .outputOptions([`-vf select='gt(scene,${threshold})',showinfo`, '-an', '-f null'])
        .output('-')
        .on('stderr', (line: string) => {
          const match = line.match(/pts_time:([\d.]+)/);
          if (match) {
            const pts = parseFloat(match[1]);
            timestamps.push(pts);
            reportProgress(pts);
          }
        })
        .on('end', () => resolve())
        .on('error', (err: Error) => reject(err))
        .run();
    });
  } finally {
    if (heartbeat) clearInterval(heartbeat);
  }

  timestamps.push(duration);
  const sorted = Array.from(new Set(timestamps)).sort((a, b) => a - b);

  const boundaries: SceneBoundary[] = [];
  for (let i = 0; i < sorted.length - 1; i++) {
    const start = sorted[i];
    const end = sorted[i + 1];
    if (end - start >= MIN_CLIP_DURATION) {
      boundaries.push({ start, end });
    } else if (boundaries.length > 0) {
      boundaries[boundaries.length - 1].end = end;
    }
  }

  return boundaries.length > 0 ? boundaries : [{ start: 0, end: duration }];
}

/**
 * Agrupa clips consecutivos para no superar maxClips. Se usa cuando la detección de
 * escenas (sobre todo con el threshold de respaldo, más sensible) produce demasiados
 * clips para un video largo, lo que puede colgar la construcción del grafo de filtros.
 */
function capClipCount(boundaries: SceneBoundary[], maxClips: number): SceneBoundary[] {
  if (boundaries.length <= maxClips) return boundaries;

  const groupSize = Math.ceil(boundaries.length / maxClips);
  const result: SceneBoundary[] = [];
  for (let i = 0; i < boundaries.length; i += groupSize) {
    const group = boundaries.slice(i, i + groupSize);
    result.push({ start: group[0].start, end: group[group.length - 1].end });
  }
  return result;
}

export async function detectScenes(videoPath: string, onEvent?: EventCallback): Promise<SceneBoundary[]> {
  const duration = await getDuration(videoPath);

  let boundaries = await scanScenesAtThreshold(videoPath, duration, SCENE_THRESHOLD, onEvent);

  // Videos con transiciones muy suaves (documentales, cámara lenta) pueden generar
  // muy pocos cortes con el threshold estándar. Si el resultado se ve sospechosamente
  // bajo, se reintenta una vez con un threshold más sensible en vez de reportar éxito
  // con un reordenamiento que apenas mezcla el video.
  if (boundaries.length < MIN_CLIPS_EXPECTED) {
    onEvent?.(
      'warning',
      `⚠️ Solo se detectaron ${boundaries.length} escenas con threshold ${SCENE_THRESHOLD}; reintentando con ${SCENE_THRESHOLD_FALLBACK}...`
    );
    boundaries = await scanScenesAtThreshold(videoPath, duration, SCENE_THRESHOLD_FALLBACK, onEvent);
  }

  if (boundaries.length > MAX_CLIPS_SAFETY_CAP) {
    onEvent?.(
      'warning',
      `⚠️ Se detectaron ${boundaries.length} escenas, demasiadas para procesar de forma fiable. Se agrupan en ${MAX_CLIPS_SAFETY_CAP} clips para evitar que el ensamblaje se cuelgue.`
    );
    boundaries = capClipCount(boundaries, MAX_CLIPS_SAFETY_CAP);
  }

  return boundaries;
}

/**
 * Intercambia cada par de clips consecutivos: 1↔2, 3↔4, 5↔6, etc., a lo largo de
 * todo el video. No se pierde contenido. Si el total es impar, el último clip
 * queda sin pareja y se conserva en su posición.
 */
export function reorderClips<T>(clips: T[]): T[] {
  const result = [...clips];
  for (let i = 0; i + 1 < result.length; i += 2) {
    [result[i], result[i + 1]] = [result[i + 1], result[i]];
  }
  return result;
}

/**
 * Baraja el orden de los clips de punta a punta (Fisher-Yates) — a diferencia de
 * reorderClips (que solo intercambia parejas vecinas), esto dispersa fragmentos de
 * una misma toma continua por todo el video en vez de dejarlos adyacentes. Con el
 * umbral sensible de detección de escenas, una sola toma seguida se puede partir en
 * fragmentos casi idénticos — dejarlos vecinos (como hace el intercambio de pares)
 * se ve como si el clip se repitiera; dispersarlos por todo el video no. Sigue siendo
 * una permutación pura: no se pierde ni se duplica ningún clip.
 */
export function shuffleClips<T>(clips: T[]): T[] {
  const result = [...clips];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/**
 * Subdivide cualquier clip que supere maxDuration en trozos iguales, ninguno mayor a maxDuration.
 */
export function applyMaxClipDuration(boundaries: SceneBoundary[], maxDuration?: number): SceneBoundary[] {
  if (!maxDuration || maxDuration <= 0) return boundaries;

  const result: SceneBoundary[] = [];
  for (const b of boundaries) {
    const duration = b.end - b.start;
    if (duration <= maxDuration) {
      result.push(b);
      continue;
    }

    const pieces = Math.ceil(duration / maxDuration);
    const pieceDuration = duration / pieces;
    for (let i = 0; i < pieces; i++) {
      const start = b.start + i * pieceDuration;
      const end = i === pieces - 1 ? b.end : start + pieceDuration;
      result.push({ start, end });
    }
  }
  return result;
}

export async function buildTimeline(
  videoPaths: string[],
  splicePoints: number[] = [],
  splitScenes: boolean = true,
  maxClipDuration?: number,
  onEvent?: EventCallback,
  sourceTypes?: Array<'video' | 'image'>,
  fullShuffle: boolean = false
): Promise<{ segments: TimelineSegment[]; perVideoBoundaries: SceneBoundary[][] }> {
  const perVideoBoundaries: SceneBoundary[][] = [];
  for (let vi = 0; vi < videoPaths.length; vi++) {
    const path = videoPaths[vi];
    const isImage = sourceTypes?.[vi] === 'image';
    let boundaries: SceneBoundary[];

    if (isImage) {
      // El clip generado a partir de la imagen ya trae el zoom/paneo incrustado de punta
      // a punta; dividirlo por "escenas" o por duración máxima rompería esa animación
      // continua en pedazos que el reordenamiento por pares dejaría saltando.
      const duration = await getDuration(path);
      boundaries = [{ start: 0, end: duration }];
    } else {
      if (splitScenes) {
        boundaries = await detectScenes(path, onEvent);
      } else {
        const duration = await getDuration(path);
        boundaries = [{ start: 0, end: duration }];
      }
      boundaries = applyMaxClipDuration(boundaries, maxClipDuration);
      if (boundaries.length > MAX_CLIPS_SAFETY_CAP) {
        onEvent?.(
          'warning',
          `⚠️ El límite de duración por clip generó ${boundaries.length} fragmentos, demasiados para procesar de forma fiable. Se agrupan en ${MAX_CLIPS_SAFETY_CAP}.`
        );
        boundaries = capClipCount(boundaries, MAX_CLIPS_SAFETY_CAP);
      }
    }

    perVideoBoundaries.push(fullShuffle ? shuffleClips(boundaries) : reorderClips(boundaries));
  }

  const segments: TimelineSegment[] = [];

  if (videoPaths.length === 1) {
    for (const b of perVideoBoundaries[0]) {
      segments.push({ inputIndex: 0, start: b.start, end: b.end, isImage: sourceTypes?.[0] === 'image' });
    }
    return { segments, perVideoBoundaries };
  }

  let cursor = 0;

  for (let vi = 0; vi < videoPaths.length; vi++) {
    const boundaries = perVideoBoundaries[vi];
    const nextSplice = splicePoints[vi];
    const isImage = sourceTypes?.[vi] === 'image';

    for (const b of boundaries) {
      const segDuration = b.end - b.start;

      if (nextSplice !== undefined && cursor + segDuration > nextSplice) {
        const allowed = nextSplice - cursor;
        if (allowed > 0.05) {
          segments.push({ inputIndex: vi, start: b.start, end: b.start + allowed, isImage });
          cursor += allowed;
        }
        break;
      }

      segments.push({ inputIndex: vi, start: b.start, end: b.end, isImage });
      cursor += segDuration;
    }
  }

  return { segments, perVideoBoundaries };
}

// Tope de cámara lenta al estirar contenido corto para llenar el audio: por encima de
// esto ya se nota artificial, así que se prefiere repetir el mínimo indispensable en
// vez de ralentizar más allá de este factor.
const MAX_STRETCH_FACTOR = 1.5;

export function syncTimelineToAudio<T extends { start: number; end: number; speedFactor?: number }>(
  segments: T[],
  audioDuration: number,
  allowRepeat: boolean = true
): { segments: T[]; repeated: boolean; trimmed: boolean; stretched: boolean } {
  if (segments.length === 0) return { segments, repeated: false, trimmed: false, stretched: false };

  const effDuration = (seg: T) => (seg.end - seg.start) * (seg.speedFactor ?? 1);
  const originalTotal = segments.reduce((s, seg) => s + effDuration(seg), 0);
  let result = [...segments];
  let total = originalTotal;
  let stretched = false;
  let repeated = false;

  if (originalTotal > 0 && total < audioDuration - 0.05) {
    // Antes esto repetía el timeline completo desde el inicio para llenar el hueco,
    // duplicando visiblemente los mismos clips/imágenes. En vez de eso, primero se
    // estira levemente la velocidad de reproducción (más tiempo real con el mismo
    // contenido, sin repetir nada) hasta MAX_STRETCH_FACTOR — esto se intenta siempre,
    // sin importar `allowRepeat`, porque no duplica ningún recurso. Solo si ni así
    // alcanza, y `allowRepeat` lo permite, se repite lo mínimo indispensable como
    // último recurso.
    const neededFactor = audioDuration / originalTotal;
    const appliedFactor = Math.min(neededFactor, MAX_STRETCH_FACTOR);
    result = result.map(seg => ({ ...seg, speedFactor: (seg.speedFactor ?? 1) * appliedFactor }));
    total = originalTotal * appliedFactor;
    stretched = appliedFactor > 1.001;

    if (allowRepeat && total < audioDuration - 0.05) {
      const stretchedBase = result;
      while (total < audioDuration - 0.05) {
        result = [...result, ...stretchedBase];
        total += originalTotal * appliedFactor;
        repeated = true;
      }
    }
  }

  let trimmed = false;
  if (total > audioDuration + 0.05) {
    let acc = 0;
    const trimmedSegments: T[] = [];
    for (const seg of result) {
      const segDuration = effDuration(seg);
      if (acc + segDuration <= audioDuration) {
        trimmedSegments.push(seg);
        acc += segDuration;
      } else {
        const remaining = audioDuration - acc;
        if (remaining > 0.05) {
          const factor = seg.speedFactor ?? 1;
          trimmedSegments.push({ ...seg, end: seg.start + remaining / factor });
          acc += remaining;
        }
        trimmed = true;
        break;
      }
    }
    result = trimmedSegments;
  }

  return { segments: result, repeated, trimmed, stretched };
}

function buildSegmentFilter(
  seg: TimelineSegment,
  label: string,
  width: number,
  height: number,
  fps: number,
  animation?: AnimationConfig
): string {
  const duration = Math.max(0.1, seg.end - seg.start);
  const base = `[${seg.inputIndex}:v]trim=start=${seg.start.toFixed(3)}:end=${seg.end.toFixed(3)},setpts=PTS-STARTPTS`;
  // Cámara lenta leve para estirar la duración real de salida sin repetir contenido (ver
  // syncTimelineToAudio) — se aplica siempre al final de la cadena, después de cualquier
  // animación, para no alterar el cálculo de frames del zoompan/paneo (que se basa en la
  // duración original del clip).
  const stretch = seg.speedFactor && seg.speedFactor > 1.001 ? `,setpts=PTS*${seg.speedFactor.toFixed(4)}` : '';

  if (!animation?.enabled || animation.type === 'none') {
    return `${base},scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:black${stretch}[${label}]`;
  }

  if (animation.type === 'zoomin' || animation.type === 'zoomout') {
    const frames = Math.max(1, Math.round(duration * fps));
    // Escalado a la duración exacta (ver comentario en buildImageSegmentFilter):
    // llega al zoom objetivo justo en el último frame, sin congelarse antes.
    // Sobremuestreo al doble + x/y centrados explícitos: da margen a zoompan para que
    // el redondeo de la ventana de recorte (iw/zoom, fraccionario) no salte de forma
    // visible entre frames, sin perder el encuadre centrado.
    const targetZoom = 1.15;
    const zoomExpr =
      animation.type === 'zoomin'
        ? `1+(${targetZoom}-1)*on/${frames}`
        : `${targetZoom}-(${targetZoom}-1)*on/${frames}`;
    return `${base},scale=${width * 2}:${height * 2}:force_original_aspect_ratio=decrease,pad=${width * 2}:${height * 2}:(ow-iw)/2:(oh-ih)/2:black,zoompan=z='${zoomExpr}':d=${frames}:s=${width}x${height}:fps=${fps}:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)'${stretch}[${label}]`;
  }

  // pan: paneo diagonal (no lateral puro) a lo largo de toda la duración exacta,
  // con recorrido corto para que el encuadre se siga viendo casi completo
  const panWidth = Math.round(width * 1.1);
  const panHeight = Math.round(height * 1.1);
  const maxDx = panWidth - width;
  const maxDy = panHeight - height;
  return `${base},scale=${panWidth}:${panHeight}:force_original_aspect_ratio=increase,crop=${width}:${height}:x='${maxDx}*t/${duration.toFixed(3)}':y='${maxDy}*t/${duration.toFixed(3)}'${stretch}[${label}]`;
}

/**
 * Convierte una imagen de referencia en un clip de video con zoom/paneo (Ken Burns)
 * incrustado, de la duración pedida. Se usa antes de armar el timeline para que el
 * resto del pipeline (detección de escenas, reordenamiento, splice points) trate la
 * imagen exactamente igual que cualquier otro video de referencia.
 */
async function renderImageClip(
  imagePath: string,
  durationSeconds: number,
  outputPath: string,
  width: number,
  height: number,
  fps: number,
  animation: AnimationType,
  qsvAvailable: boolean
): Promise<void> {
  const { w: canvasW, h: canvasH } = blurFillCanvasSize(width, height, animation);
  const preprocessedPath = join(tmpdir(), `blurfill-${uuidv4().slice(0, 8)}.png`);
  await preprocessBlurFillImage(imagePath, canvasW, canvasH, preprocessedPath);

  const filterLine = buildImageSegmentFilter(0, 'vout', width, height, fps, durationSeconds, animation);
  const filterScriptPath = await writeFilterScript(filterLine);
  const videoCodecArgs = qsvAvailable
    ? [`-c:v h264_qsv`, `-preset veryfast`, `-profile:v high`]
    : [`-c:v libx264`, `-preset veryfast`, `-profile:v high`];

  return new Promise((resolvePromise, reject) => {
    ffmpeg()
      .input(preprocessedPath)
      // -framerate explícito: sin esto, el demuxer de imagen en loop entrega frames a
      // su propio ritmo por defecto (no necesariamente el fps del proyecto), y zoompan
      // — que calcula el zoom por frame de SALIDA— se desincroniza con ese ritmo de
      // entrada, produciendo un temblor/parpadeo en vez de un zoom suave.
      .inputOptions(['-loop', '1', '-framerate', String(fps), '-t', durationSeconds.toFixed(3)])
      .outputOptions([
        '-filter_complex_script', filterScriptPath,
        '-map [vout]',
        ...videoCodecArgs,
        '-pix_fmt yuv420p',
        `-r ${fps}`,
        '-an',
        `-t ${durationSeconds.toFixed(3)}`,
        '-y',
      ])
      .output(outputPath)
      .on('end', () => {
        fs.unlink(filterScriptPath).catch(() => {});
        fs.unlink(preprocessedPath).catch(() => {});
        resolvePromise();
      })
      .on('error', (err: Error) => {
        fs.unlink(filterScriptPath).catch(() => {});
        fs.unlink(preprocessedPath).catch(() => {});
        reject(err);
      })
      .run();
  });
}

function buildConcatOrTransition(
  syncedSegments: TimelineSegment[],
  transitions: TransitionConfig | undefined
): { filterLines: string[]; outputLabel: string; finalDuration: number } {
  const n = syncedSegments.length;
  const durations = syncedSegments.map(s => (s.end - s.start) * (s.speedFactor ?? 1));
  const filterLines: string[] = [];

  if (!transitions?.enabled || n < 2) {
    const labels = syncedSegments.map((_, i) => `[v${i}]`).join('');
    filterLines.push(`${labels}concat=n=${n}:v=1:a=0[vconcat]`);
    const finalDuration = durations.reduce((a, b) => a + b, 0);
    return { filterLines, outputLabel: 'vconcat', finalDuration };
  }

  const td = Math.min(transitions.duration, Math.min(...durations) / 2);
  let mergedDuration = durations[0];
  let prevLabel = 'v0';

  for (let i = 1; i < n; i++) {
    const outLabel = i === n - 1 ? 'vconcat' : `vx${i}`;
    const offset = Math.max(0, mergedDuration - td);
    filterLines.push(
      `[${prevLabel}][v${i}]xfade=transition=${transitions.type}:duration=${td.toFixed(3)}:offset=${offset.toFixed(3)}[${outLabel}]`
    );
    mergedDuration = mergedDuration + durations[i] - td;
    prevLabel = outLabel;
  }

  return { filterLines, outputLabel: 'vconcat', finalDuration: mergedDuration };
}

function escapeForDrawtext(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/:/g, '\\:').replace(/'/g, "\\'");
}

function escapeSubtitlesPath(p: string): string {
  return p.replace(/\\/g, '/').replace(/:/g, '\\:');
}

export async function transcribeToSrt(audioPath: string, onEvent?: EventCallback): Promise<string> {
  const { nodewhisper } = await import('nodejs-whisper');

  const ext = extname(audioPath).toLowerCase();
  const wavPath = ext === '.wav' ? audioPath : join(dirname(audioPath), `${basename(audioPath, ext)}.wav`);

  await nodewhisper(audioPath, {
    modelName: 'base',
    autoDownloadModelName: 'base',
    removeWavFileAfterTranscription: false,
    logger: {
      debug: () => {},
      log: (...args: any[]) => onEvent?.('info', `🎙️ ${args.join(' ')}`),
      error: (...args: any[]) => onEvent?.('warning', `🎙️ ${args.join(' ')}`),
    },
    whisperOptions: {
      outputInSrt: true,
      language: 'es',
    },
  });

  const srtPath = `${wavPath}.srt`;
  if (!existsSync(srtPath)) {
    throw new Error(
      'No se generó el archivo .srt. Verifica que tengas instalado MinGW-w64/MSYS2 y CMake, y ejecuta "npx nodejs-whisper download" para preparar el modelo.'
    );
  }
  return srtPath;
}

/**
 * Renderiza un lote de segmentos del timeline (trim+scale+pad+animación+concat, sin
 * transiciones ni audio) a un archivo silencioso. Mismo principio que
 * renderReorderBatch: un grafo de filtros pequeño por llamada a FFmpeg en vez de uno
 * gigante para todo el video, para que el editor de clips no se cuelgue con muchos
 * fragmentos. Solo se usa cuando las transiciones están desactivadas (con transiciones
 * activas el conteo de clips ya está limitado a MAX_TRANSITION_CLIPS, manejable en un
 * solo grafo porque xfade necesita clips adyacentes en la misma pasada).
 */
async function renderAssembleBatch(
  inputPaths: string[],
  batchSegments: TimelineSegment[],
  batchIndex: number,
  outputDir: string,
  opts: { width: number; height: number; fps: number; qsvAvailable: boolean; animations?: AnimationConfig }
): Promise<string> {
  const { width, height, fps, qsvAvailable, animations } = opts;
  const command = ffmpeg();
  inputPaths.forEach(p => command.input(p));

  const filterParts: string[] = [];
  batchSegments.forEach((seg, i) => {
    const segAnimation = seg.isImage ? undefined : animations;
    filterParts.push(buildSegmentFilter(seg, `v${i}`, width, height, fps, segAnimation));
  });
  const labels = batchSegments.map((_, i) => `[v${i}]`).join('');
  filterParts.push(`${labels}concat=n=${batchSegments.length}:v=1:a=0[vout]`);

  const filterScriptPath = await writeFilterScript(filterParts.join(';'));
  const batchOutputPath = join(outputDir, `assemble_batch_${batchIndex}.mp4`);
  const videoCodecArgs = qsvAvailable
    ? [`-c:v h264_qsv`, `-preset veryfast`, `-profile:v high`]
    : [`-c:v libx264`, `-preset veryfast`, `-profile:v high`];

  return new Promise((resolve, reject) => {
    command
      .outputOptions([
        '-filter_complex_script', filterScriptPath,
        '-map [vout]',
        ...videoCodecArgs,
        '-pix_fmt yuv420p',
        '-color_range tv',
        `-r ${fps}`,
        '-an',
        `-g 30`,
        `-keyint_min 30`,
        `-max_muxing_queue_size 9999`,
        '-y',
      ])
      .output(batchOutputPath)
      .on('end', () => {
        fs.unlink(filterScriptPath).catch(() => {});
        resolve(batchOutputPath);
      })
      .on('error', (err: Error) => {
        fs.unlink(filterScriptPath).catch(() => {});
        reject(err);
      })
      .run();
  });
}

export async function assembleVideo(config: ProcessConfig, onEvent?: EventCallback): Promise<string> {
  const {
    videoPaths,
    splicePoints = [],
    sourceTypes,
    imageDurations = [],
    audioPath,
    subtitles,
    backgroundMusic,
    textOverlays = [],
    outputFilename,
    resolution = '1080p',
    fps = 30,
    splitScenes = true,
    allowClipRepeat = true,
    fullShuffle = false,
    transitions: rawTransitions,
    animations,
    maxClipDuration,
    complementaryPaths = [],
    complementarySourceTypes,
    complementaryImageDurations = [],
  } = config;

  const { width, height } = RESOLUTION_MAP[resolution];

  const tempImageClips: string[] = [];
  let tempImageDir: string | undefined;

  // Convierte cada imagen de referencia en un clip animado (zoom/paneo) de la duración
  // pedida; los videos pasan sin tocar. Se reutiliza tanto para el contenido principal
  // como para el complementario — ambos son "referencias" en el mismo sentido.
  // isQsvAvailable() ya memoiza su resultado, así que llamarla varias veces no repite el sondeo.
  async function preRenderImageRefs(
    paths: string[],
    types: Array<'video' | 'image'> | undefined,
    durations: number[],
    label: string
  ): Promise<string[]> {
    const imageIdx = types
      ? types.reduce<number[]>((acc, t, i) => (t === 'image' ? [...acc, i] : acc), [])
      : [];
    if (imageIdx.length === 0) return paths;

    onEvent?.('info', `🖼️ Generando ${imageIdx.length} clip(s) animado(s) a partir de ${label} (zoom + movimiento)...`);
    const qsvAvailable = await isQsvAvailable();
    if (!tempImageDir) {
      tempImageDir = join(tmpdir(), `vidspa-ref-images-${uuidv4().slice(0, 8)}`);
      await fs.mkdir(tempImageDir, { recursive: true });
    }

    const rendered = [...paths];
    for (let i = 0; i < imageIdx.length; i++) {
      const idx = imageIdx[i];
      const duration = Math.min(MAX_IMAGE_CLIP_DURATION, Math.max(1, durations[idx] ?? 5));
      const animType: AnimationType =
        animations?.enabled && animations.type !== 'none'
          ? animations.type
          : DEFAULT_ANIMATION_CYCLE[idx % DEFAULT_ANIMATION_CYCLE.length];
      const clipPath = join(tempImageDir, `ref-image-${idx}-${uuidv4().slice(0, 8)}.mp4`);
      onEvent?.('progress', `🖼️ Renderizando imagen ${i + 1}/${imageIdx.length} de ${label} (${duration}s, ${animType})...`);
      await renderImageClip(paths[idx], duration, clipPath, width, height, fps, animType, qsvAvailable);
      rendered[idx] = clipPath;
      tempImageClips.push(clipPath);
    }
    return rendered;
  }

  let effectiveVideoPaths = await preRenderImageRefs(videoPaths, sourceTypes, imageDurations, 'imágenes de referencia');

  onEvent?.('info', splitScenes ? '🔍 Detectando escenas y construyendo timeline...' : '📋 Usando videos completos (sin dividir escenas)...');
  let { segments } = await buildTimeline(effectiveVideoPaths, splicePoints, splitScenes, maxClipDuration, onEvent, sourceTypes, fullShuffle);

  const audioDuration = await getDuration(audioPath);

  // Si el contenido principal queda más corto que el audio, se usa primero el material
  // complementario (una vez, completo) para llenar ese hueco; syncTimelineToAudio de más
  // abajo se encarga de repetir todo el conjunto (principal + complementario) si aun así
  // sigue faltando tiempo, y de recortar si sobra.
  if (complementaryPaths.length > 0) {
    const mainTotal = segments.reduce((s, seg) => s + (seg.end - seg.start), 0);
    if (mainTotal < audioDuration - 0.05) {
      const effectiveComplementaryPaths = await preRenderImageRefs(
        complementaryPaths,
        complementarySourceTypes,
        complementaryImageDurations,
        'material complementario'
      );
      const { segments: complementarySegments } = await buildTimeline(
        effectiveComplementaryPaths,
        [],
        false,
        undefined,
        onEvent,
        complementarySourceTypes
      );
      const offset = effectiveVideoPaths.length;
      segments = [
        ...segments,
        ...complementarySegments.map(seg => ({ ...seg, inputIndex: seg.inputIndex + offset })),
      ];
      effectiveVideoPaths = [...effectiveVideoPaths, ...effectiveComplementaryPaths];
      onEvent?.('info', `🎞️ Se agregó material complementario (${effectiveComplementaryPaths.length} archivo(s)) para llenar el tiempo restante`);
    }
  }

  onEvent?.(
    'info',
    maxClipDuration
      ? `📋 ${segments.length} clips en el timeline (máx. ${maxClipDuration}s por clip)`
      : `📋 ${segments.length} clips en el timeline`
  );

  // Encadenar xfade entre muchos clips escala mal en FFmpeg (el grafo de filtros puede
  // tardar minutos/horas en inicializarse). Por encima de este umbral, se desactiva sola.
  const MAX_TRANSITION_CLIPS = 60;
  let transitions = rawTransitions;
  if (transitions?.enabled && segments.length > MAX_TRANSITION_CLIPS) {
    onEvent?.(
      'warning',
      `⚠️ Se desactivaron las transiciones automáticamente: con ${segments.length} clips, encadenar transiciones dejaría el proceso extremadamente lento o colgado. Se usará corte directo entre clips.`
    );
    transitions = { ...transitions, enabled: false };
  }

  let syncResult = syncTimelineToAudio(segments, audioDuration, allowClipRepeat);
  if (transitions?.enabled) {
    for (let iter = 0; iter < 3; iter++) {
      const n = syncResult.segments.length;
      if (n < 2) break;
      const compensatedTarget = audioDuration + (n - 1) * transitions.duration;
      const nextResult = syncTimelineToAudio(segments, compensatedTarget, allowClipRepeat);
      const converged = nextResult.segments.length === syncResult.segments.length;
      syncResult = nextResult;
      if (converged) break;
    }
  }
  const { segments: syncedSegments, repeated, trimmed, stretched } = syncResult;

  if (stretched) onEvent?.('info', '🎞️ Contenido más corto que el audio: se estiró levemente el ritmo (cámara lenta) para llenar el tiempo sin repetir clips ni imágenes');
  if (repeated) onEvent?.('warning', '🔁 Aun estirando al máximo el contenido sigue siendo más corto que el audio: se repitió lo mínimo indispensable para sincronizar');
  if (trimmed) onEvent?.('warning', '✂️ Video más largo que el audio: se recortó para sincronizar');
  if (!allowClipRepeat && !repeated) {
    const total = syncedSegments.reduce((s, seg) => s + (seg.end - seg.start) * (seg.speedFactor ?? 1), 0);
    if (total < audioDuration - 0.5) {
      onEvent?.('warning', `⚠️ El video (${total.toFixed(1)}s) queda más corto que el audio (${audioDuration.toFixed(1)}s) porque desactivaste la repetición de clips`);
    }
  }

  const outputId = outputFilename || `clip-edit-${uuidv4()}`;
  const outputPath = join(OUTPUT_DIR, `${outputId}.mp4`);

  let srtPath: string | undefined;
  if (subtitles) {
    onEvent?.('info', '🎙️ Transcribiendo audio para subtítulos (puede tardar varios minutos)...');
    try {
      srtPath = await transcribeToSrt(audioPath, onEvent);
      onEvent?.('info', '✅ Subtítulos generados');
    } catch (err) {
      onEvent?.('warning', `⚠️ No se pudieron generar subtítulos: ${err instanceof Error ? err.message : 'error desconocido'}`);
    }
  }

  const qsvAvailable = await isQsvAvailable();

  // Con transiciones activas (encadenamiento xfade), el conteo de clips ya está acotado
  // por MAX_TRANSITION_CLIPS más arriba, así que un solo grafo de filtros es manejable:
  // xfade necesita los clips adyacentes en la misma pasada, por lo que no se puede
  // batchear sin cambiar el resultado visual. Sin transiciones (el caso común con
  // muchos clips) se batchea igual que en reorderVideoOnly.
  let mergedVideoPath: string;
  let transitionedDuration: number;
  const tempBatchDir = join(tmpdir(), `._tmp_assemble_${uuidv4().slice(0, 8)}`);
  await fs.mkdir(tempBatchDir, { recursive: true });

  if (transitions?.enabled && syncedSegments.length >= 2) {
    const filterParts: string[] = [];
    syncedSegments.forEach((seg, i) => {
      const segAnimation = seg.isImage ? undefined : animations;
      filterParts.push(buildSegmentFilter(seg, `v${i}`, width, height, fps, segAnimation));
    });
    const { filterLines, outputLabel, finalDuration } = buildConcatOrTransition(syncedSegments, transitions);
    filterParts.push(...filterLines);
    transitionedDuration = finalDuration;

    mergedVideoPath = join(tempBatchDir, 'merged.mp4');
    const filterScriptPath = await writeFilterScript(filterParts.join(';'));
    const videoCodecArgs = qsvAvailable
      ? [`-c:v h264_qsv`, `-preset veryfast`, `-profile:v high`]
      : [`-c:v libx264`, `-preset veryfast`, `-profile:v high`];

    onEvent?.('info', '🎬 Ensamblando clips con transiciones...');
    await new Promise<void>((resolve, reject) => {
      const command = ffmpeg();
      effectiveVideoPaths.forEach(p => command.input(p));
      command
        .outputOptions([
          '-filter_complex_script', filterScriptPath,
          `-map [${outputLabel}]`,
          ...videoCodecArgs,
          '-pix_fmt yuv420p',
          '-color_range tv',
          `-r ${fps}`,
          '-an',
          `-g 30`,
          `-keyint_min 30`,
          `-max_muxing_queue_size 9999`,
          '-y',
        ])
        .output(mergedVideoPath)
        .on('end', () => {
          fs.unlink(filterScriptPath).catch(() => {});
          resolve();
        })
        .on('error', (err: Error) => {
          fs.unlink(filterScriptPath).catch(() => {});
          reject(err);
        })
        .run();
    });
  } else {
    onEvent?.('info', qsvAvailable ? '⚡ Usando aceleración por hardware (Intel Quick Sync)' : '🐢 Sin aceleración por hardware disponible, usando CPU');

    const batches: TimelineSegment[][] = [];
    for (let i = 0; i < syncedSegments.length; i += REORDER_BATCH_SIZE) {
      batches.push(syncedSegments.slice(i, i + REORDER_BATCH_SIZE));
    }

    const totalSegDuration = syncedSegments.reduce((s, seg) => s + (seg.end - seg.start) * (seg.speedFactor ?? 1), 0);
    const batchPaths: string[] = [];
    let processedSeconds = 0;

    for (let b = 0; b < batches.length; b++) {
      onEvent?.(
        'progress',
        `🎬 Procesando lote ${b + 1}/${batches.length}...`,
        (b / batches.length) * 100,
        { currentSeconds: processedSeconds, totalSeconds: totalSegDuration }
      );
      const batchPath = await renderAssembleBatch(effectiveVideoPaths, batches[b], b, tempBatchDir, {
        width,
        height,
        fps,
        qsvAvailable,
        animations,
      });
      batchPaths.push(batchPath);
      processedSeconds += batches[b].reduce((s, seg) => s + (seg.end - seg.start) * (seg.speedFactor ?? 1), 0);
    }

    mergedVideoPath = join(tempBatchDir, 'merged.mp4');
    onEvent?.('info', '🔗 Uniendo lotes...', 95, { currentSeconds: totalSegDuration, totalSeconds: totalSegDuration });
    await concatBatches(batchPaths, mergedVideoPath);
    for (const p of batchPaths) await fs.unlink(p).catch(() => {});
    transitionedDuration = totalSegDuration;
  }

  // A partir de aquí el video ya está reordenado/concatenado (grafo de filtros pequeño,
  // sin importar cuántos clips había en el timeline): la pasada final solo agrega
  // subtítulos, overlays de texto y mezcla de audio, así que se mantiene rápida siempre.
  const command = ffmpeg();
  command.input(mergedVideoPath);
  command.input(audioPath);
  const audioInputIndex = 1;

  let musicInputIndex = -1;
  if (backgroundMusic?.enabled && backgroundMusic.path) {
    command.input(backgroundMusic.path);
    musicInputIndex = 2;
  }

  const filterParts: string[] = [];
  let lastVideoLabel: string | undefined;

  if (srtPath) {
    filterParts.push(`[0:v]subtitles='${escapeSubtitlesPath(srtPath)}'[vsubs]`);
    lastVideoLabel = 'vsubs';
  }

  textOverlays.forEach((overlay, i) => {
    const inputLabel = lastVideoLabel ? `[${lastVideoLabel}]` : '[0:v]';
    const nextLabel = `vtext${i}`;
    filterParts.push(
      `${inputLabel}drawtext=text='${escapeForDrawtext(overlay.text)}':fontcolor=white:fontsize=48:borderw=3:bordercolor=black:x=(w-text_w)/2:y=h-th-80:enable='between(t\\,${overlay.start}\\,${overlay.end})'[${nextLabel}]`
    );
    lastVideoLabel = nextLabel;
  });

  let audioMapArg = `${audioInputIndex}:a`; // raw stream specifier, no brackets
  if (musicInputIndex >= 0) {
    const volume = backgroundMusic?.volume ?? 0.15;
    filterParts.push(`[${musicInputIndex}:a]aloop=loop=-1:size=2147483647,volume=${volume}[music]`);
    filterParts.push(`[${audioInputIndex}:a][music]amix=inputs=2:duration=first:dropout_transition=2[aout]`);
    audioMapArg = '[aout]'; // filter label, needs brackets
  }

  // Antes se usaba Math.min(audioDuration, transitionedDuration) como salvaguarda, pero con
  // "Repetir clips si hace falta" desactivado el video puede quedar más corto a propósito —
  // ese min() recortaba también el AUDIO a la duración del video, cortando la narración. El
  // video simplemente se queda congelado en su último fotograma mientras el audio termina.
  const finalDuration = audioDuration;

  // Sin subtítulos ni overlays de texto, el video del merge ya quedó en el formato final
  // (H.264/yuv420p): se copia el stream de video en vez de recodificarlo de nuevo.
  const needsVideoFilter = filterParts.length > 0 || lastVideoLabel !== undefined;
  const filterScriptPath = needsVideoFilter ? await writeFilterScript(filterParts.join(';')) : undefined;
  const videoMapArgs = needsVideoFilter
    ? [`-map [${lastVideoLabel}]`]
    : [`-map 0:v`];
  const videoOutputArgs = needsVideoFilter
    ? [`-c:v libx264`, `-preset medium`, `-profile:v high`, `-color_range tv`, `-pix_fmt yuv420p`, `-r ${fps}`]
    : [`-c:v copy`];

  return new Promise((resolve, reject) => {
    const outputOptions = [
      ...(filterScriptPath ? ['-filter_complex_script', filterScriptPath] : []),
      ...videoMapArgs,
      `-map ${audioMapArg}`,
      ...videoOutputArgs,
      `-c:a aac`,
      `-b:a 192k`,
      `-movflags +faststart`,
      `-g 30`,
      `-keyint_min 30`,
      `-max_muxing_queue_size 9999`,
      `-t ${finalDuration.toFixed(3)}`,
      `-y`,
    ];

    const cleanup = () => {
      if (filterScriptPath) fs.unlink(filterScriptPath).catch(() => {});
      tempImageClips.forEach(p => fs.unlink(p).catch(() => {}));
      if (tempImageDir) fs.rmdir(tempImageDir).catch(() => {});
      fs.unlink(mergedVideoPath).catch(() => {});
      fs.rmdir(tempBatchDir).catch(() => {});
    };

    command
      .outputOptions(outputOptions)
      .output(outputPath)
      .on('start', cmdline => {
        console.log(`FFmpeg clip-editing: ${cmdline}`);
        onEvent?.('info', '🎬 Iniciando ensamblaje final...');
      })
      .on('progress', progress => {
        const percent = Math.max(0, Math.min(100, progress.percent || 0));
        const timemark = (progress.timemark || '00:00:00').split('.')[0];
        const currentSeconds = Math.min(parseTimemarkToSeconds(timemark), finalDuration);
        onEvent?.(
          'progress',
          `Ensamblando... ${Math.round(percent)}% (${timemark} de ${formatDuration(finalDuration)})`,
          percent,
          { currentSeconds, totalSeconds: finalDuration }
        );
      })
      .on('end', () => {
        cleanup();
        onEvent?.('success', `✅ Video final creado: ${outputPath}`, 100, {
          currentSeconds: finalDuration,
          totalSeconds: finalDuration,
        });
        resolve(outputPath);
      })
      .on('error', (err: Error) => {
        cleanup();
        onEvent?.('error', `❌ Error en ensamblaje: ${err.message}`);
        reject(err);
      })
      .run();
  });
}

/**
 * Divide un video en fragmentos uniformes de máximo `maxClipDuration` segundos (sin
 * detección de escenas), aplica el reordenamiento (clip 1 se mantiene, clip 2 se
 * elimina, el resto se desplaza) y reensambla, conservando el audio original del video.
 * No requiere audio de narración externo — pensado para procesar videos sueltos en cola.
 */
// Tamaño de lote para reordenar clips: el mismo que usamos manualmente en la sesión de
// FFmpeg (16). Procesar cientos de "trim" en un único grafo de filtros es justo lo que
// hacía que el ensamblaje tardara minutos/horas en inicializarse o se colgara (ver el
// comentario de MAX_CLIPS_SAFETY_CAP más arriba). Cada lote se renderiza en su propia
// llamada a FFmpeg (grafo pequeño, rápido) y los lotes se unen al final con el demuxer
// concat + copia directa (sin recodificar), igual que en el pipeline manual verificado.
const REORDER_BATCH_SIZE = 16;

async function renderReorderBatch(
  videoPath: string,
  batchBoundaries: SceneBoundary[],
  batchIndex: number,
  outputDir: string,
  opts: { width: number; height: number; fps: number; hasAudio: boolean; qsvAvailable: boolean }
): Promise<string> {
  const { width, height, fps, hasAudio, qsvAvailable } = opts;

  const filterParts: string[] = [];
  batchBoundaries.forEach((b, i) => {
    // Cámara lenta leve para llenar el audio de narración sin repetir clips (ver
    // syncTimelineToAudio) — no coexiste con hasAudio: cuando hay audio de sincronización
    // (el único caso donde se aplica speedFactor) el audio original del video se descarta.
    const stretch = b.speedFactor && b.speedFactor > 1.001 ? `,setpts=PTS*${b.speedFactor.toFixed(4)}` : '';
    filterParts.push(
      `[0:v]trim=start=${b.start.toFixed(3)}:end=${b.end.toFixed(3)},setpts=PTS-STARTPTS,scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:black${stretch}[v${i}]`
    );
    if (hasAudio) {
      filterParts.push(`[0:a]atrim=start=${b.start.toFixed(3)}:end=${b.end.toFixed(3)},asetpts=PTS-STARTPTS[a${i}]`);
    }
  });

  const concatInputs = hasAudio
    ? batchBoundaries.map((_, i) => `[v${i}][a${i}]`).join('')
    : batchBoundaries.map((_, i) => `[v${i}]`).join('');
  const concatOutputs = hasAudio ? '[vout][aout]' : '[vout]';
  filterParts.push(`${concatInputs}concat=n=${batchBoundaries.length}:v=1:a=${hasAudio ? 1 : 0}${concatOutputs}`);

  const filterScriptPath = await writeFilterScript(filterParts.join(';'));
  const batchOutputPath = join(outputDir, `batch_${batchIndex}.mp4`);

  const mapArgs = hasAudio ? [`-map [vout]`, `-map [aout]`] : [`-map [vout]`];
  const audioCodecArgs = hasAudio ? [`-c:a aac`, `-b:a 192k`] : [];
  const videoCodecArgs = qsvAvailable
    ? [`-c:v h264_qsv`, `-preset veryfast`, `-profile:v high`]
    : [`-c:v libx264`, `-preset veryfast`, `-profile:v high`];

  return new Promise((resolve, reject) => {
    ffmpeg(videoPath)
      .outputOptions([
        '-filter_complex_script', filterScriptPath,
        ...mapArgs,
        ...videoCodecArgs,
        ...audioCodecArgs,
        `-pix_fmt yuv420p`,
        `-color_range tv`,
        `-r ${fps}`,
        `-g 30`,
        `-keyint_min 30`,
        `-max_muxing_queue_size 9999`,
        `-y`,
      ])
      .output(batchOutputPath)
      .on('end', () => {
        fs.unlink(filterScriptPath).catch(() => {});
        resolve(batchOutputPath);
      })
      .on('error', (err: Error) => {
        fs.unlink(filterScriptPath).catch(() => {});
        reject(err);
      })
      .run();
  });
}

export async function reorderVideoOnly(
  videoPath: string,
  options: {
    maxClipDuration?: number;
    splitScenes?: boolean;
    /**
     * Al desagrupar en escenas, mezcla los fragmentos por todo el video (en vez de solo
     * intercambiar cada par de vecinos). Da un resultado más distinto del original —
     * ideal para nichos genéricos donde no importa que el video ya no siga el ritmo
     * exacto de la narración. Desactivado, el intercambio de vecinos mantiene cada
     * fragmento cerca de su posición original, para cuando sí importa la sincronización.
     */
    fullShuffle?: boolean;
    resolution?: '720p' | '1080p' | '2k' | '4k';
    fps?: number;
    /**
     * Narración a sincronizar con este video específico (Cola de Edición: cada video
     * puede traer su propio audio). Reemplaza el audio original del video — el
     * timeline se recorta o repite (igual que en assembleVideo) para encajar
     * exactamente en la duración de este audio.
     */
    audioPath?: string;
    /** Imágenes adicionales que se insertan automáticamente sobre el montaje final. */
    insertImagePaths?: string[];
    animateInsertedImages?: boolean;
  } = {},
  onEvent?: EventCallback
): Promise<string> {
  const maxClipDuration = options.maxClipDuration;
  const splitScenes = options.splitScenes ?? false;
  const fullShuffle = options.fullShuffle ?? false;
  const { width, height } = RESOLUTION_MAP[options.resolution || '1080p'];
  const fps = options.fps || 30;
  const syncAudioPath = options.audioPath;
  const insertImagePaths = options.insertImagePaths || [];
  const animateInsertedImages = !!options.animateInsertedImages;

  await cleanupOldCacheFiles();
  const compatibleVideoPath = await ensureH264Compatible(videoPath, onEvent);

  onEvent?.('info', `🔍 Analizando ${basename(compatibleVideoPath)}...`);
  const duration = await getDuration(compatibleVideoPath);
  const hasOriginalAudio = await hasAudioStream(compatibleVideoPath);
  const qsvAvailable = await isQsvAvailable();

  // Si hay audio de sincronización, se descarta el audio original del video (se
  // reemplaza al final) — no tiene sentido recortar/mezclar ambos.
  const hasAudio = hasOriginalAudio && !syncAudioPath;
  if (!hasOriginalAudio && !syncAudioPath) {
    onEvent?.('warning', '⚠️ El video no tiene pista de audio detectable; se procesará solo el video');
  }
  onEvent?.('info', qsvAvailable ? '⚡ Usando aceleración por hardware (Intel Quick Sync)' : '🐢 Sin aceleración por hardware disponible, usando CPU');

  let boundaries: SceneBoundary[] = splitScenes
    ? await detectScenes(compatibleVideoPath, onEvent)
    : [{ start: 0, end: duration }];
  if (maxClipDuration) {
    boundaries = applyMaxClipDuration(boundaries, maxClipDuration);
  }
  // fullShuffle mezcla los fragmentos por todo el video (mejor para contenido genérico
  // sin necesidad de sincronía visual con la narración); desactivado, se mantiene el
  // intercambio de pares vecinos (cada fragmento se queda cerca de su posición
  // original, útil cuando sí importa la sincronización). Ambos son permutaciones puras:
  // ningún clip se pierde ni se duplica.
  if (splitScenes) {
    boundaries = fullShuffle ? shuffleClips(boundaries) : reorderClips(boundaries);
  }

  let syncAudioDuration: number | undefined;
  if (syncAudioPath) {
    syncAudioDuration = await getDuration(syncAudioPath);
    const { segments: synced, trimmed, stretched } = syncTimelineToAudio(boundaries, syncAudioDuration, false);
    boundaries = synced;
    if (stretched) onEvent?.('info', '🎞️ Video más corto que el audio: se estiró levemente el ritmo (cámara lenta) para llenar el tiempo sin repetir clips');
    if (trimmed) onEvent?.('warning', '✂️ Video más largo que el audio: se recortó para sincronizar');
  }

  const reorderLabel = fullShuffle ? 'mezclados por todo el video' : 'reordenados';
  onEvent?.(
    'info',
    maxClipDuration
      ? `📋 ${boundaries.length} fragmentos de máx. ${maxClipDuration}s, desagrupados y ${reorderLabel} (sin repetir ninguno)`
      : `📋 ${boundaries.length} fragmentos desagrupados y ${reorderLabel} (sin repetir ninguno)`
  );

  const base = basename(videoPath, extname(videoPath));
  const outputPath = join(OUTPUT_DIR, `${base}-reordenado-${uuidv4().slice(0, 8)}.mp4`);
  const finalDuration = boundaries.reduce((s, b) => s + (b.end - b.start) * (b.speedFactor ?? 1), 0);

  const tempDir = join(tmpdir(), `._tmp_reorder_${uuidv4().slice(0, 8)}`);
  await fs.mkdir(tempDir, { recursive: true });

  const batches: SceneBoundary[][] = [];
  for (let i = 0; i < boundaries.length; i += REORDER_BATCH_SIZE) {
    batches.push(boundaries.slice(i, i + REORDER_BATCH_SIZE));
  }

  const batchPaths: string[] = [];
  let processedSeconds = 0;

  try {
    for (let b = 0; b < batches.length; b++) {
      onEvent?.(
        'progress',
        `🎬 Procesando lote ${b + 1}/${batches.length}...`,
        (b / batches.length) * 100,
        { currentSeconds: processedSeconds, totalSeconds: finalDuration }
      );
      const batchPath = await renderReorderBatch(compatibleVideoPath, batches[b], b, tempDir, {
        width,
        height,
        fps,
        hasAudio,
        qsvAvailable,
      });
      batchPaths.push(batchPath);
      processedSeconds += batches[b].reduce((s, seg) => s + (seg.end - seg.start) * (seg.speedFactor ?? 1), 0);
    }

    if (syncAudioPath) {
      const videoOnlyPath = join(tempDir, `video-only-${uuidv4().slice(0, 8)}.mp4`);
      onEvent?.('info', '🔗 Uniendo lotes...', 92, { currentSeconds: finalDuration, totalSeconds: finalDuration });
      await concatBatches(batchPaths, videoOnlyPath);
      let videoForMux = videoOnlyPath;
      let overlaidVideoPath: string | undefined;
      if (insertImagePaths.length > 0) {
        overlaidVideoPath = join(tempDir, `video-insert-images-${uuidv4().slice(0, 8)}.mp4`);
        await overlayInsertImages(videoOnlyPath, insertImagePaths, overlaidVideoPath, width, height, fps, onEvent, animateInsertedImages);
        videoForMux = overlaidVideoPath;
      }
      onEvent?.('info', '🎵 Sincronizando audio...', 97, { currentSeconds: finalDuration, totalSeconds: finalDuration });
      // Sin repetir clips (ver syncTimelineToAudio más arriba), el video puede quedar más
      // corto que la narración — cutToShortest=false para que el audio no se corte también,
      // y así el usuario pueda oír la narración completa y rellenar el resto a mano.
      await muxReplaceAudio(videoForMux, syncAudioPath, outputPath, false);
      await fs.unlink(videoOnlyPath).catch(() => {});
      if (overlaidVideoPath) await fs.unlink(overlaidVideoPath).catch(() => {});
    } else {
      onEvent?.('info', '🔗 Uniendo lotes...', 95, { currentSeconds: finalDuration, totalSeconds: finalDuration });
      if (insertImagePaths.length > 0) {
        const assembledPath = join(tempDir, `assembled-${uuidv4().slice(0, 8)}.mp4`);
        await concatBatches(batchPaths, assembledPath);
        await overlayInsertImages(assembledPath, insertImagePaths, outputPath, width, height, fps, onEvent, animateInsertedImages);
        await fs.unlink(assembledPath).catch(() => {});
      } else {
        await concatBatches(batchPaths, outputPath);
      }
    }

    onEvent?.('success', `✅ Completado: ${outputPath}`, 100, {
      currentSeconds: finalDuration,
      totalSeconds: finalDuration,
    });
    return outputPath;
  } catch (err) {
    onEvent?.('error', `❌ Error: ${err instanceof Error ? err.message : 'desconocido'}`);
    throw err;
  } finally {
    for (const p of batchPaths) await fs.unlink(p).catch(() => {});
    await fs.rmdir(tempDir).catch(() => {});
  }
}

export interface TextOverlayItem {
  text: string;
  /** Segundos relativos al INICIO de este item (no del video final ya compuesto). */
  startSec: number;
  endSec: number;
  position: 'centro' | 'arriba' | 'abajo';
  fontSize?: number;
}

export interface ShapeOverlayItem {
  shape: 'rectangulo';
  startSec: number;
  endSec: number;
  position: 'centro' | 'arriba' | 'abajo';
  color?: string;
}

export interface SequenceItem {
  path: string;
  /** Un video se usa sin su audio original (silencioso) y en bucle si es más corto que su duración asignada. */
  type: 'image' | 'video';
  /** Fija la animación de este item (en vez de la rotación/azar automática) — viene de una
   * instrucción "item N zoom=..." (ver instructionsParser.ts). */
  animationOverride?: AnimationType;
  /** Overlays de texto/forma sobre este item — mismas instrucciones "item N texto=.../forma=...". */
  textOverlays?: TextOverlayItem[];
  shapeOverlays?: ShapeOverlayItem[];
}

export interface ImageSequenceConfig {
  items: SequenceItem[];
  outputFilename?: string;
  totalDurationSeconds?: number;
  perImageDuration?: number;
  resolution?: '720p' | '1080p' | '2k' | '4k';
  fps?: number;
  transitionTypes?: TransitionType[];
  animationTypes?: AnimationType[];
  transitionDuration?: number;
  batchSize?: number;
  /**
   * Duración distinta por imagen (repartida aleatoriamente pero sumando el total
   * pedido), y transición/animación elegidas al azar en vez de rotar en orden fijo.
   */
  randomMode?: boolean;
  /**
   * Duración ya calculada por item (mismo orden que `items`) — si viene, se usa tal cual
   * en vez de llamar a generateImageDurations() internamente. Para cuando el llamador ya
   * necesitó esa duración ANTES de invocar esta función (ej. Composición con Remotion,
   * que la usa para "desagrupar" un item de video a la duración exacta que le toca antes
   * de pasarlo aquí) — recalcularla de nuevo aquí sería inconsistente en modo aleatorio
   * (dos llamadas a Math.random() no dan el mismo resultado).
   */
  explicitDurationsSeconds?: number[];
  /**
   * Fija la transición DESPUÉS del item N (índice = posición del item que la precede), en
   * vez de la rotación/azar automática — viene de una instrucción "item N->M transicion=..."
   * (ver instructionsParser.ts).
   */
  transitionOverrides?: Record<number, TransitionType>;
  /**
   * Retomar un trabajo interrumpido (el servidor murió a mitad de proceso): reutiliza
   * el tempDir y los lotes que ya quedaron renderizados en disco, en vez de volver a
   * procesar todo desde cero. Los lotes en `resumeCompletedBatches` se saltan.
   */
  resumeTempDir?: string;
  resumeCompletedBatches?: Record<number, string>;
  /**
   * Narración a incluir en el video (Secuencia de Imágenes no tiene audio propio).
   * Se asume que `totalDurationSeconds` ya se calculó para coincidir con la
   * duración de este audio — aquí solo se agrega como pista final.
   */
  audioPath?: string;
}

export const DEFAULT_TRANSITION_CYCLE: TransitionType[] = ['fade', 'dissolve', 'wipeleft', 'wiperight', 'slideup', 'slidedown'];
export const DEFAULT_ANIMATION_CYCLE: AnimationType[] = ['zoomin', 'zoomout', 'pan'];
export const IMAGE_BATCH_SIZE = 15;

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * Reparte totalDuration entre `count` imágenes. En modo aleatorio, cada imagen recibe
 * un peso al azar entre el 40% y el 180% de la duración media, y luego se reescala todo
 * para que la suma coincida exactamente con totalDuration. En modo uniforme, reparte
 * el mismo valor a todas. Exportada para que otros motores de renderizado (ej. Remotion)
 * repartan la duración de forma consistente con Secuencia de Imágenes.
 */
export function generateImageDurations(count: number, totalDuration: number, random: boolean): number[] {
  const avg = totalDuration / count;
  if (!random) return Array.from({ length: count }, () => avg);

  const minRatio = 0.4;
  const maxRatio = 1.8;
  const raw = Array.from({ length: count }, () => avg * (minRatio + Math.random() * (maxRatio - minRatio)));
  const rawSum = raw.reduce((a, b) => a + b, 0);
  const scale = totalDuration / rawSum;
  return raw.map(d => d * scale);
}

/**
 * Encaja `imgLabel` en un lienzo de w×h SIN recortar contenido: si la imagen no es
 * 16:9, el sobrante se rellena con una copia de la misma imagen agrandada y
 * difuminada (en vez de barras negras), como hacen Instagram/TikTok con fotos que
 * no calzan en el formato del video.
 */
function buildBlurFillChain(srcLabel: string, w: number, h: number, outLabel: string): string {
  const bg = `${outLabel}bg`;
  const fg = `${outLabel}fg`;
  return (
    `[${srcLabel}]split=2[${bg}][${fg}];` +
    `[${bg}]scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h},gblur=sigma=30[${bg}b];` +
    `[${fg}]scale=${w}:${h}:force_original_aspect_ratio=decrease[${fg}s];` +
    `[${bg}b][${fg}s]overlay=(${w}-w)/2:(${h}-h)/2[${outLabel}]`
  );
}

/** Tamaño de lienzo que necesita el relleno con blur según la animación a aplicar. */
function blurFillCanvasSize(width: number, height: number, animation: AnimationType): { w: number; h: number } {
  if (animation === 'zoomin' || animation === 'zoomout') return { w: width * 2, h: height * 2 };
  if (animation === 'pan') return { w: Math.round(width * 1.1), h: Math.round(height * 1.1) };
  return { w: width, h: height };
}

/**
 * Aplica el relleno con blur UNA sola vez y guarda el resultado como imagen estática.
 * Antes este relleno vivía dentro de la cadena de zoompan/crop animada, así que
 * FFmpeg lo recalculaba en cada fotograma de salida (gblur es un filtro caro) — con
 * el "-loop 1" alimentando el mismo frame repetido cientos de veces por imagen, eso
 * multiplicaba el costo real por la cantidad de fotogramas de la animación, y con
 * varias imágenes en un mismo lote con transiciones, el grafo de filtros se volvía
 * tan pesado que el proceso se quedaba colgado en vez de solo tardar más. Al
 * precalcular el lienzo con blur una vez, la animación que sigue (zoompan/crop) solo
 * recorta y escala sobre una imagen ya lista — barato incluso repetido muchas veces.
 */
async function preprocessBlurFillImage(
  imagePath: string,
  w: number,
  h: number,
  outputPath: string
): Promise<void> {
  const filterLine = buildBlurFillChain('0:v', w, h, 'out');
  const filterScriptPath = await writeFilterScript(filterLine);
  return new Promise((resolvePromise, reject) => {
    ffmpeg(imagePath)
      .outputOptions(['-filter_complex_script', filterScriptPath, '-map [out]', '-frames:v 1', '-y'])
      .output(outputPath)
      .on('end', () => {
        fs.unlink(filterScriptPath).catch(() => {});
        resolvePromise();
      })
      .on('error', (err: Error) => {
        fs.unlink(filterScriptPath).catch(() => {});
        reject(err);
      })
      .run();
  });
}

/**
 * Anima (zoom/paneo) una imagen que YA viene con el relleno de blur aplicado y al
 * tamaño de lienzo correcto (ver preprocessBlurFillImage) — por eso no repite el
 * relleno aquí, solo el recorrido de cámara sobre el lienzo ya armado.
 */
function buildImageSegmentFilter(
  inputIndex: number,
  label: string,
  width: number,
  height: number,
  fps: number,
  duration: number,
  animation: AnimationType
): string {
  const base = `[${inputIndex}:v]`;

  // Cada imagen puede traer su propio framerate "nativo" en los metadatos (ej. 25fps),
  // y zoompan fuerza explícitamente el fps de salida mientras que scale/crop no — eso
  // produce timebases distintas entre imágenes y xfade falla al mezclarlas. Se fuerza
  // "fps=${fps}" en todas las ramas para que todos los segmentos salgan sincronizados.
  if (animation === 'none') {
    return `${base}setsar=1,fps=${fps}[${label}]`;
  }

  const frames = Math.max(1, Math.round(duration * fps));

  if (animation === 'zoomin' || animation === 'zoomout') {
    // Ver comentario detallado en preprocessBlurFillImage/blurFillCanvasSize: el
    // lienzo de entrada ya viene al doble de tamaño con el relleno de blur puesto,
    // así que zoompan solo necesita centrar y recortar — sin recalcular blur.
    const targetZoom = 1.15;
    const zoomExpr =
      animation === 'zoomin'
        ? `1+(${targetZoom}-1)*on/${frames}`
        : `${targetZoom}-(${targetZoom}-1)*on/${frames}`;
    return `${base}zoompan=z='${zoomExpr}':d=${frames}:s=${width}x${height}:fps=${fps}:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)',setsar=1[${label}]`;
  }

  // pan: paneo diagonal sutil (no puramente lateral, que se ve mal) sobre un
  // encuadre apenas más grande que el final — así el recorrido es corto y la
  // imagen se sigue viendo casi completa en todo momento, no solo un detalle. El
  // lienzo de entrada ya viene al tamaño panW×panH con el relleno de blur puesto.
  const panScale = 1.1;
  const panW = Math.round(width * panScale);
  const panH = Math.round(height * panScale);
  const maxDx = panW - width;
  const maxDy = panH - height;
  return `${base}crop=${width}:${height}:x='${maxDx}*t/${duration.toFixed(3)}':y='${maxDy}*t/${duration.toFixed(3)}',setsar=1,fps=${fps}[${label}]`;
}

/**
 * Encaja un video (sin animación propia, ya tiene su propio movimiento) en el lienzo
 * final con barras negras si no calza el aspect ratio — mismo criterio que el resto del
 * ensamblaje de video en la app (a diferencia de las imágenes, que usan relleno con blur).
 */
function buildVideoSegmentFilter(inputIndex: number, label: string, width: number, height: number, fps: number): string {
  return `[${inputIndex}:v]scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:black,setsar=1,fps=${fps}[${label}]`;
}

/** "arriba"/"centro"/"abajo" a una expresión Y de ffmpeg — heightExpr es la altura del
 * elemento (ej. "text_h" para drawtext, o un número fijo para drawbox). `frameH` es la
 * variable que representa la altura del FRAME en cada filtro — en drawtext "h" ya es la
 * altura del frame, pero en drawbox "h" es la altura de la propia caja (su parámetro h,
 * autorreferenciado) y la altura del frame es "ih" — usar "h" ahí deja y en negativo
 * (se recorta a 0) y la caja termina siempre arriba en vez de abajo/centrada. */
function overlayYExpr(position: 'centro' | 'arriba' | 'abajo', heightExpr: string, frameH: string = 'h'): string {
  if (position === 'arriba') return '40';
  if (position === 'abajo') return `${frameH}-${heightExpr}-40`;
  return `(${frameH}-${heightExpr})/2`;
}

/**
 * Overlays de texto/forma de un item (instrucciones "item N texto=.../forma=...", ver
 * instructionsParser.ts) — mismo patrón drawtext que ya usa assembleVideo para el
 * timeline global (`enable='between(t,start,end)'`), pero encadenados DENTRO del
 * segmento del item: como el trim previo ya resetea "t" a 0 (setpts=PTS-STARTPTS),
 * start/end aquí son relativos al inicio de ESTE item, tal cual pide el formato.
 */
function buildOverlayFilterLines(item: SequenceItem, inputLabel: string, finalLabel: string): string[] {
  type Overlay = { kind: 'text' | 'shape'; startSec: number; endSec: number; position: 'centro' | 'arriba' | 'abajo'; text?: string; fontSize?: number; color?: string };
  const overlays: Overlay[] = [
    ...(item.textOverlays ?? []).map(o => ({ kind: 'text' as const, ...o })),
    ...(item.shapeOverlays ?? []).map(o => ({ kind: 'shape' as const, ...o })),
  ];
  if (overlays.length === 0) return [];

  const lines: string[] = [];
  let currentLabel = inputLabel;
  overlays.forEach((ov, idx) => {
    const nextLabel = idx === overlays.length - 1 ? finalLabel : `${inputLabel}_ov${idx}`;
    const enable = `enable='between(t\\,${ov.startSec.toFixed(3)}\\,${ov.endSec.toFixed(3)})'`;
    if (ov.kind === 'text') {
      const y = overlayYExpr(ov.position, 'text_h');
      lines.push(
        `[${currentLabel}]drawtext=text='${escapeForDrawtext(ov.text!)}':fontcolor=white:fontsize=${ov.fontSize || 48}:borderw=3:bordercolor=black:x=(w-text_w)/2:y=${y}:${enable}[${nextLabel}]`
      );
    } else {
      const boxHeight = 80;
      const y = overlayYExpr(ov.position, String(boxHeight), 'ih');
      const color = (ov.color || '#E63946').replace('#', '0x');
      lines.push(`[${currentLabel}]drawbox=x=0:y=${y}:w=iw:h=${boxHeight}:color=${color}@0.6:t=fill:${enable}[${nextLabel}]`);
    }
    currentLabel = nextLabel;
  });
  return lines;
}

function buildBatchXfadeFilter(
  labels: string[],
  durations: number[],
  transitionTypes: TransitionType[],
  transitionDuration: number,
  randomMode: boolean = false,
  transitionOverrides?: Record<number, TransitionType>,
  globalStartIndex: number = 0
): { filterLines: string[]; outputLabel: string; totalDuration: number } {
  const n = labels.length;
  if (n === 1) return { filterLines: [], outputLabel: labels[0], totalDuration: durations[0] };

  const filterLines: string[] = [];
  let mergedDuration = durations[0];
  let prevLabel = labels[0];

  for (let i = 1; i < n; i++) {
    const globalFromIndex = globalStartIndex + i - 1;
    const type =
      transitionOverrides?.[globalFromIndex] ??
      (randomMode ? pickRandom(transitionTypes) : transitionTypes[(i - 1) % transitionTypes.length]);
    const td = Math.min(transitionDuration, Math.min(durations[i - 1], durations[i]) / 2);
    const outLabel = i === n - 1 ? 'batchout' : `bx${i}`;
    const offset = Math.max(0, mergedDuration - td);
    filterLines.push(
      `[${prevLabel}][${labels[i]}]xfade=transition=${type}:duration=${td.toFixed(3)}:offset=${offset.toFixed(3)}[${outLabel}]`
    );
    mergedDuration = mergedDuration + durations[i] - td;
    prevLabel = outLabel;
  }

  return { filterLines, outputLabel: prevLabel, totalDuration: mergedDuration };
}

async function renderImageBatch(
  items: SequenceItem[],
  durations: number[],
  batchIndex: number,
  globalImageIndex: number,
  outputDir: string,
  opts: {
    resolution: '720p' | '1080p' | '2k' | '4k';
    fps: number;
    transitionTypes: TransitionType[];
    animationTypes: AnimationType[];
    transitionDuration: number;
    qsvAvailable: boolean;
    randomMode: boolean;
    transitionOverrides?: Record<number, TransitionType>;
  },
  progressCtx?: {
    onEvent?: EventCallback;
    totalBatches: number;
    elapsedTargetSeconds: number;
    projectTotalSeconds: number;
  }
): Promise<string> {
  const { width, height } = RESOLUTION_MAP[opts.resolution];

  // La animación de cada imagen se decide ANTES de preprocesar, porque el tamaño de
  // lienzo del relleno con blur depende de ella (zoomin/zoomout necesita el doble,
  // pan un poco más grande, "none" el tamaño final) — ver preprocessBlurFillImage. Los
  // videos no llevan animación propia (ya tienen su propio movimiento), así que no
  // necesitan lienzo de relleno con blur ni entran en este cálculo. animationOverride
  // (instrucción "item N zoom=...") gana siempre sobre la rotación/azar automática.
  const animTypes = items.map((item, i) =>
    item.type === 'video'
      ? 'none'
      : item.animationOverride
        ? item.animationOverride
        : opts.randomMode
          ? pickRandom(opts.animationTypes)
          : opts.animationTypes[(globalImageIndex + i) % opts.animationTypes.length]
  );

  // Un lote usa PNG temporales con el fondo difuminado. En algunos equipos Windows
  // uno puede no estar disponible justo al iniciar FFmpeg; lo regeneramos desde la
  // imagen original sin alterar la secuencia ni sus ajustes visuales.
  const createBlurFill = async (item: SequenceItem, index: number, outputPath: string) => {
    const { w, h } = blurFillCanvasSize(width, height, animTypes[index] as AnimationType);
    await preprocessBlurFillImage(item.path, w, h, outputPath);
  };

  // Para imágenes: precalcula el lienzo con blur (archivo temporal a limpiar después).
  // Para videos: se usa el archivo original tal cual, sin preprocesar ni tocar.
  const preprocessedItems = await Promise.all(
    items.map(async (item, i) => {
      if (item.type === 'video') return { path: item.path, temp: false };
      const outPath = join(outputDir, `blurfill_${batchIndex}_${i}.png`);
      await createBlurFill(item, i, outPath);
      return { path: outPath, temp: true };
    })
  );

  const filterParts: string[] = [];
  const labels: string[] = [];
  items.forEach((item, i) => {
    const hasOverlays = !!(item.textOverlays?.length || item.shapeOverlays?.length);
    const label = `img${i}`;
    const baseLabel = hasOverlays ? `imgbase${i}` : label;
    filterParts.push(
      item.type === 'video'
        ? buildVideoSegmentFilter(i, baseLabel, width, height, opts.fps)
        : buildImageSegmentFilter(i, baseLabel, width, height, opts.fps, durations[i], animTypes[i] as AnimationType)
    );
    if (hasOverlays) {
      filterParts.push(...buildOverlayFilterLines(item, baseLabel, label));
    }
    labels.push(label);
  });

  const { filterLines, outputLabel, totalDuration } = buildBatchXfadeFilter(
    labels,
    durations,
    opts.transitionTypes,
    opts.transitionDuration,
    opts.randomMode,
    opts.transitionOverrides,
    globalImageIndex
  );
  filterParts.push(...filterLines);

  const batchOutputPath = join(outputDir, `batch_${batchIndex}.mp4`);

  const cleanupTemp = (filterScriptPath: string) => {
    fs.unlink(filterScriptPath).catch(() => {});
  };

  // Lanza el encode del lote una vez, con el códec indicado. Cada intento arma su
  // propio comando de FFmpeg desde cero (un comando de fluent-ffmpeg solo se puede
  // ejecutar una vez) para poder reintentar limpio si falla.
  const runEncodeAttempt = async (useQsv: boolean): Promise<string> => {
    // Evita el fallo "No such file or directory" si un temporal fue eliminado o
    // bloqueado entre el preprocesado y el inicio del encoder.
    for (let i = 0; i < preprocessedItems.length; i++) {
      const prepared = preprocessedItems[i];
      if (prepared.temp && !existsSync(prepared.path)) {
        await createBlurFill(items[i], i, prepared.path);
      }
    }
    const filterScriptPath = await writeFilterScript(filterParts.join(';'));
    const videoCodecArgs = useQsv
      ? [`-c:v h264_qsv`, `-preset veryfast`, `-profile:v high`]
      : [`-c:v libx264`, `-preset veryfast`, `-profile:v high`];

    const command = ffmpeg();
    preprocessedItems.forEach((preprocessed, i) => {
      if (items[i].type === 'video') {
        // Sin audio (video mudo por diseño) y en bucle si es más corto que la
        // duración asignada — si es más largo, "-t" simplemente lo recorta.
        command.input(preprocessed.path).inputOptions(['-stream_loop', '-1', '-t', durations[i].toFixed(3), '-an']);
      } else {
        // -framerate explícito (ver comentario en renderImageClip): evita el temblor de
        // zoompan al mantener el ritmo de entrada sincronizado con el fps del proyecto.
        command.input(preprocessed.path).inputOptions(['-loop', '1', '-framerate', String(opts.fps), '-t', durations[i].toFixed(3)]);
      }
    });

    return new Promise((resolve, reject) => {
      command
        .outputOptions([
          '-filter_complex_script', filterScriptPath,
          `-map [${outputLabel}]`,
          ...videoCodecArgs,
          `-pix_fmt yuv420p`,
          `-r ${opts.fps}`,
          `-g 30`,
          `-keyint_min 30`,
          `-max_muxing_queue_size 9999`,
          `-t ${totalDuration.toFixed(3)}`,
          `-y`,
        ])
        .output(batchOutputPath)
        .on('progress', progress => {
          if (!progressCtx?.onEvent) return;
          // Antes esto era mudo hasta que TODO el lote terminaba — con lotes de
          // imágenes de duración larga (varios minutos de video final por lote), eso
          // podía dejar el mensaje "Procesando lote X/Y..." sin cambiar por varios
          // minutos, dando la sensación de que el proceso se colgó aunque siguiera
          // trabajando. Reporta el avance real dentro del lote actual.
          const timemark = (progress.timemark || '00:00:00').split('.')[0];
          const batchSeconds = Math.min(parseTimemarkToSeconds(timemark), totalDuration);
          const combinedSeconds = Math.min(
            progressCtx.elapsedTargetSeconds + batchSeconds,
            progressCtx.projectTotalSeconds
          );
          const percent = progressCtx.projectTotalSeconds > 0 ? (combinedSeconds / progressCtx.projectTotalSeconds) * 100 : 0;
          progressCtx.onEvent(
            'progress',
            `🎬 Lote ${batchIndex + 1}/${progressCtx.totalBatches}: ${timemark} de ${formatDuration(totalDuration)} de este lote`,
            percent,
            { currentSeconds: combinedSeconds, totalSeconds: progressCtx.projectTotalSeconds }
          );
        })
        .on('end', () => {
          cleanupTemp(filterScriptPath);
          resolve(batchOutputPath);
        })
        .on('error', (err: Error) => {
          cleanupTemp(filterScriptPath);
          reject(err);
        })
        .run();
    });
  };

  // Reintentos: el encoder de hardware (Intel Quick Sync) puede volverse inestable
  // en sesiones muy largas/pesadas (lotes de varios minutos con muchas imágenes y
  // transiciones) y morir a mitad de proceso sin motivo claro. Si eso pasa, se
  // reintenta por software (libx264, más lento pero mucho más estable) en vez de
  // dejar todo el trabajo del lote perdido — y si el fallo no era de QSV, un
  // segundo intento por software también cubre fallos transitorios sueltos.
  const attempts: Array<{ useQsv: boolean; label: string }> = opts.qsvAvailable
    ? [
        { useQsv: true, label: 'con aceleración por hardware' },
        { useQsv: false, label: 'por software tras fallo de hardware' },
        { useQsv: false, label: 'por software (segundo intento)' },
      ]
    : [
        { useQsv: false, label: 'por software' },
        { useQsv: false, label: 'por software (reintento)' },
      ];

  let lastError: Error | undefined;
  for (let i = 0; i < attempts.length; i++) {
    try {
      const result = await runEncodeAttempt(attempts[i].useQsv);
      for (const p of preprocessedItems) if (p.temp) fs.unlink(p.path).catch(() => {});
      return result;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error('Error desconocido');
      if (i < attempts.length - 1) {
        progressCtx?.onEvent?.(
          'warning',
          `⚠️ Lote ${batchIndex + 1}/${progressCtx.totalBatches ?? '?'} falló ${attempts[i].label}, reintentando ${attempts[i + 1].label}...`
        );
      }
    }
  }
  for (const p of preprocessedItems) if (p.temp) fs.unlink(p.path).catch(() => {});
  throw lastError;
}

async function concatBatches(batchPaths: string[], outputPath: string): Promise<void> {
  const demuxerPath = join(tmpdir(), `image-seq-concat-${uuidv4()}.txt`);
  // Rutas absolutas y con "/" en vez de "\": el demuxer de concat de FFmpeg tiene sus
  // propias reglas de escape para las comillas, y las barras invertidas de Windows en
  // rutas relativas pueden interpretarse mal.
  const demuxerContent = batchPaths
    .map(p => `file '${resolve(p).replace(/\\/g, '/').replace(/'/g, "'\\''")}'`)
    .join('\n');
  await fs.writeFile(demuxerPath, demuxerContent, 'utf-8');

  return new Promise((resolve, reject) => {
    ffmpeg()
      .input(demuxerPath)
      .inputOptions(['-f', 'concat', '-safe', '0'])
      .outputOptions(['-c copy', '-movflags +faststart', '-y'])
      .output(outputPath)
      .on('end', () => {
        fs.unlink(demuxerPath).catch(() => {});
        resolve();
      })
      .on('error', (err: Error) => {
        fs.unlink(demuxerPath).catch(() => {});
        reject(err);
      })
      .run();
  });
}

/**
 * Reemplaza la pista de audio de un video ya generado por otra (ej. narración a
 * sincronizar), sin recodificar el video (-c:v copy). Requiere que el video y el
 * audio ya tengan duraciones compatibles (usar syncTimelineToAudio antes de armar
 * el video para que coincidan) — aquí solo se usa "-shortest" como salvaguarda.
 */
async function muxReplaceAudio(videoPath: string, audioPath: string, outputPath: string, cutToShortest: boolean = true): Promise<void> {
  return new Promise((resolvePromise, reject) => {
    ffmpeg()
      .input(videoPath)
      .input(audioPath)
      .outputOptions([
        '-map 0:v:0',
        '-map 1:a:0',
        '-c:v copy',
        '-c:a aac',
        '-b:a 192k',
        ...(cutToShortest ? ['-shortest'] : []),
        '-movflags +faststart',
        '-y',
      ])
      .output(outputPath)
      .on('end', () => resolvePromise())
      .on('error', (err: Error) => reject(err))
      .run();
  });
}

function getInsertImageSlots(count: number, videoDuration: number): Array<{ start: number; end: number }> {
  if (count <= 0 || videoDuration < 1) return [];

  const displayDuration = Math.min(4, Math.max(1, videoDuration / Math.max(count * 3, 1)));
  return Array.from({ length: count }, (_, i) => {
    const center = ((i + 1) * videoDuration) / (count + 1);
    const start = Math.max(0, Math.min(videoDuration - displayDuration, center - displayDuration / 2));
    return { start, end: Math.min(videoDuration, start + displayDuration) };
  }).filter(slot => slot.end - slot.start >= 0.5);
}

async function overlayInsertImages(
  videoPath: string,
  imagePaths: string[],
  outputPath: string,
  width: number,
  height: number,
  fps: number,
  onEvent?: EventCallback,
  animateImages: boolean = false
): Promise<void> {
  const validImages = imagePaths.filter(p => existsSync(p));
  if (validImages.length === 0) {
    await fs.copyFile(videoPath, outputPath);
    return;
  }

  const videoDuration = await getDuration(videoPath);
  const slots = getInsertImageSlots(validImages.length, videoDuration);
  if (slots.length === 0) {
    onEvent?.('warning', '⚠️ El video es demasiado corto para insertar imágenes sin amontonarlas; se omite la inserción.');
    await fs.copyFile(videoPath, outputPath);
    return;
  }

  const hasAudio = await hasAudioStream(videoPath);
  const command = ffmpeg();
  command.input(videoPath);
  validImages.slice(0, slots.length).forEach(imagePath => {
    command.input(imagePath).inputOptions(['-loop 1']);
  });

  const filterParts: string[] = [];
  let currentLabel = '0:v';
  const fgMaxW = Math.round(width * 0.86);
  const fgMaxH = Math.round(height * 0.86);

  slots.forEach((slot, i) => {
    const inputIndex = i + 1;
    const splitA = `insert${i}a`;
    const splitB = `insert${i}b`;
    const bg = `insert${i}bg`;
    const fg = `insert${i}fg`;
    const frame = `insert${i}frame`;
    const nextLabel = `vinsert${i}`;
    const duration = slot.end - slot.start;
    // Los cuatro movimientos se alternan para que la galería no parezca una sucesión
    // de diapositivas estáticas. Se calculan con el tiempo local de cada imagen.
    const motion = i % 4;
    const foregroundPosition = !animateImages ? `x=(W-w)/2:y=(H-h)/2` : motion === 0
      ? `x=(W-w)/2+14*t/${duration.toFixed(3)}:y=(H-h)/2`
      : motion === 1
        ? `x=(W-w)/2-14*t/${duration.toFixed(3)}:y=(H-h)/2`
        : motion === 2
          ? `x=(W-w)/2:y=(H-h)/2+10*t/${duration.toFixed(3)}`
          : `x=(W-w)/2:y=(H-h)/2-10*t/${duration.toFixed(3)}`;
    const fadeFilters = animateImages
      ? `,format=rgba,fade=t=in:st=0:d=0.35:alpha=1,fade=t=out:st=${Math.max(0, duration - 0.35).toFixed(3)}:d=0.35:alpha=1`
      : ',format=yuv420p';

    filterParts.push(`[${inputIndex}:v]trim=duration=${duration.toFixed(3)},setpts=PTS-STARTPTS,split=2[${splitA}][${splitB}]`);
    filterParts.push(`[${splitA}]scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height},gblur=sigma=30[${bg}]`);
    filterParts.push(`[${splitB}]scale=${fgMaxW}:${fgMaxH}:force_original_aspect_ratio=decrease,gblur=sigma=1[${fg}]`);
    filterParts.push(`[${bg}][${fg}]overlay=${foregroundPosition}${fadeFilters},setpts=PTS+${slot.start.toFixed(3)}/TB[${frame}]`);
    filterParts.push(`[${currentLabel}][${frame}]overlay=0:0:enable='between(t\\,${slot.start.toFixed(3)}\\,${slot.end.toFixed(3)})'[${nextLabel}]`);
    currentLabel = nextLabel;
  });

  const filterScriptPath = await writeFilterScript(filterParts.join(';'));
  const audioArgs = hasAudio ? ['-map 0:a:0?', '-c:a copy'] : ['-an'];

  return new Promise((resolvePromise, reject) => {
    command
      .outputOptions([
        '-filter_complex_script', filterScriptPath,
        `-map [${currentLabel}]`,
        ...audioArgs,
        '-c:v libx264',
        '-preset veryfast',
        '-profile:v high',
        '-pix_fmt yuv420p',
        `-r ${fps}`,
        '-movflags +faststart',
        '-max_muxing_queue_size 9999',
        '-y',
      ])
      .output(outputPath)
      .on('start', () => {
        onEvent?.('info', `🖼️ Insertando ${slots.length} imagen(es) con blur repartidas por el video...`);
      })
      .on('end', () => {
        fs.unlink(filterScriptPath).catch(() => {});
        resolvePromise();
      })
      .on('error', (err: Error) => {
        fs.unlink(filterScriptPath).catch(() => {});
        reject(err);
      })
      .run();
  });
}

export interface ProductSegmentInput {
  name: string;
  /** Tramo dentro del único video de referencia — se usa tal cual, sin detectar/reordenar escenas. */
  videoStart: number;
  videoEnd: number;
  /** Duración objetivo de este producto en el video final (según cuánto dura su narración). */
  assignedDurationSeconds: number;
  /** Imágenes de relleno para este producto, usadas en orden si el tramo de video queda corto. */
  imagePaths?: string[];
}

export interface ProductSegmentsConfig {
  videoPath: string;
  audioPath: string;
  segments: ProductSegmentInput[];
  outputFilename?: string;
  resolution?: '720p' | '1080p' | '2k' | '4k';
  fps?: number;
  animations?: AnimationConfig;
  /**
   * Igual que en Cola de Edición: dentro del tramo de cada producto (sin tocar el orden
   * de los productos entre sí), detecta escenas y las reordena por pares (1↔2, 3↔4...).
   */
  splitScenes?: boolean;
}

/**
 * Recorta con precisión de fotograma un tramo del video (sin audio, sin reescalar) a un
 * archivo temporal — se usa solo para poder pasarle ese tramo aislado a detectScenes() y
 * así detectar escenas DENTRO de ese tramo exacto. Antes se escaneaba el video de
 * referencia completo UNA sola vez y esos cortes globales se recortaban por rango con
 * clipBoundariesToRange(): si un corte real no caía justo en el límite entre dos
 * productos, el mismo plano quedaba partido en dos — la mitad como último clip de un
 * producto y la otra mitad como primer clip del siguiente — y al reproducirse seguidos
 * se ve como si el clip "se repitiera". Escaneando cada tramo por separado, cada producto
 * solo puede reordenar planos que están enteros dentro de su propio tramo.
 */
async function extractRangeForSceneAnalysis(videoPath: string, start: number, end: number, outputPath: string): Promise<void> {
  const duration = Math.max(0.1, end - start);
  return new Promise((resolvePromise, reject) => {
    ffmpeg(videoPath)
      .inputOptions([`-ss ${start.toFixed(3)}`])
      .outputOptions([`-t ${duration.toFixed(3)}`, '-c:v libx264', '-preset ultrafast', '-an', '-y'])
      .output(outputPath)
      .on('end', () => resolvePromise())
      .on('error', (err: Error) => reject(err))
      .run();
  });
}

/**
 * Arma un video de "recopilación por producto": un único video de referencia se recorta
 * en tramos por producto, en su orden original (el orden de los productos nunca cambia)
 * y, si un tramo queda más corto que la duración asignada a ese producto, se completa con
 * las imágenes de relleno de ese mismo producto — en vez de repetir/reordenar clips
 * globalmente como hace assembleVideo. El audio de narración se usa completo, sin tocar.
 * Con splitScenes activo, dentro de cada tramo (no entre productos) se detectan escenas
 * y se reordenan por pares, igual que en Cola de Edición.
 */
export async function assembleProductSegments(config: ProductSegmentsConfig, onEvent?: EventCallback): Promise<string> {
  const { videoPath, audioPath, segments, outputFilename, resolution = '1080p', fps = 30, animations, splitScenes = false } = config;

  if (segments.length === 0) {
    throw new Error('Se necesita al menos un segmento de producto');
  }

  const { width, height } = RESOLUTION_MAP[resolution];
  const qsvAvailable = await isQsvAvailable();

  const assignedTotal = segments.reduce((s, seg) => s + seg.assignedDurationSeconds, 0);
  const audioDuration = await getDuration(audioPath);
  if (Math.abs(assignedTotal - audioDuration) > 2) {
    onEvent?.(
      'warning',
      `⚠️ La suma de duraciones asignadas (${assignedTotal.toFixed(1)}s) no coincide con la duración del audio (${audioDuration.toFixed(1)}s) — el resultado se recortará al más corto de los dos.`
    );
  }

  const tempDir = join(tmpdir(), `._tmp_product_segments_${uuidv4().slice(0, 8)}`);
  await fs.mkdir(tempDir, { recursive: true });
  const piecePaths: string[] = [];

  try {
    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      onEvent?.(
        'progress',
        `🎬 Procesando "${seg.name}" (${i + 1}/${segments.length})...`,
        (i / segments.length) * 100
      );

      const videoSegDuration = Math.max(0, seg.videoEnd - seg.videoStart);
      const targetDuration = Math.max(0.1, seg.assignedDurationSeconds);
      const usedVideoDuration = Math.min(videoSegDuration, targetDuration);

      if (usedVideoDuration > 0.05) {
        const rangeEnd = seg.videoStart + usedVideoDuration;
        let videoPieces: TimelineSegment[];
        if (splitScenes) {
          onEvent?.('info', `🔍 Detectando escenas en "${seg.name}"...`);
          const analysisPath = join(tempDir, `analysis-${i}-${uuidv4().slice(0, 8)}.mp4`);
          await extractRangeForSceneAnalysis(videoPath, seg.videoStart, rangeEnd, analysisPath);
          let localBoundaries: SceneBoundary[];
          try {
            localBoundaries = await detectScenes(analysisPath, onEvent);
          } finally {
            await fs.unlink(analysisPath).catch(() => {});
          }
          videoPieces = reorderClips(localBoundaries).map(b => ({
            inputIndex: 0,
            start: seg.videoStart + b.start,
            end: Math.min(rangeEnd, seg.videoStart + b.end),
          }));
        } else {
          videoPieces = [{ inputIndex: 0, start: seg.videoStart, end: rangeEnd }];
        }

        if (videoPieces.length > 0) {
          const piecePath = await renderAssembleBatch([videoPath], videoPieces, piecePaths.length, tempDir, {
            width,
            height,
            fps,
            qsvAvailable,
          });
          piecePaths.push(piecePath);
        }
      }

      const gap = targetDuration - usedVideoDuration;
      if (gap > 0.5 && seg.imagePaths && seg.imagePaths.length > 0) {
        onEvent?.('info', `🖼️ "${seg.name}": completando ${gap.toFixed(1)}s con ${seg.imagePaths.length} imagen(es) de relleno...`);
        // Reparte el hueco entre las imágenes provistas; syncTimelineToAudio se encarga de
        // estirar el ciclo (más tiempo por imagen, sin repetir ninguna) si no alcanzan, o
        // recortar la última si sobran.
        const perImage = Math.max(1, gap / seg.imagePaths.length);
        const imageSlots: { start: number; end: number; speedFactor?: number }[] = seg.imagePaths.map(() => ({ start: 0, end: perImage }));
        const { segments: fittedSlots } = syncTimelineToAudio(imageSlots, gap, true);

        for (let j = 0; j < fittedSlots.length; j++) {
          const dur = (fittedSlots[j].end - fittedSlots[j].start) * (fittedSlots[j].speedFactor ?? 1);
          if (dur < 0.2) continue;
          const imgPath = seg.imagePaths[j % seg.imagePaths.length];
          const animType: AnimationType =
            animations?.enabled && animations.type !== 'none'
              ? animations.type
              : DEFAULT_ANIMATION_CYCLE[j % DEFAULT_ANIMATION_CYCLE.length];
          const imgPiecePath = join(tempDir, `piece-${piecePaths.length}-${uuidv4().slice(0, 8)}.mp4`);
          await renderImageClip(imgPath, dur, imgPiecePath, width, height, fps, animType, qsvAvailable);
          piecePaths.push(imgPiecePath);
        }
      } else if (gap > 0.5) {
        onEvent?.(
          'warning',
          `⚠️ "${seg.name}" queda ${gap.toFixed(1)}s corto y no tiene imágenes de relleno asignadas`
        );
      }
    }

    if (piecePaths.length === 0) {
      throw new Error('No se generó ningún contenido de video a partir de los segmentos');
    }

    onEvent?.('info', '🔗 Uniendo todos los segmentos...', 95);
    const concatenatedPath = join(tempDir, 'concatenated.mp4');
    await concatBatches(piecePaths, concatenatedPath);

    const outputId = outputFilename || `product-segments-${uuidv4()}`;
    const outputPath = join(OUTPUT_DIR, `${outputId}.mp4`);
    onEvent?.('info', '🎧 Añadiendo el audio de narración...');
    await muxReplaceAudio(concatenatedPath, audioPath, outputPath);

    onEvent?.('success', '✅ Video por producto completado');
    return outputPath;
  } finally {
    for (const p of piecePaths) await fs.unlink(p).catch(() => {});
    await fs.unlink(join(tempDir, 'concatenated.mp4')).catch(() => {});
    await fs.rmdir(tempDir).catch(() => {});
  }
}

export interface TimelineClipInput {
  path: string;
  start: number;
  end: number;
}

export interface TimelineJoinConfig {
  clips: TimelineClipInput[];
  outputFilename?: string;
  resolution?: '720p' | '1080p' | '2k' | '4k';
  fps?: number;
}

/**
 * Recorta un tramo exacto de un clip (conservando su audio original) y lo re-escala al
 * tamaño del proyecto. El seek de entrada (-ss antes de -i) + recodificación da un corte
 * preciso al frame sin tener que decodificar el archivo completo desde el principio.
 */
async function trimClipWithAudio(
  inputPath: string,
  start: number,
  end: number,
  outputPath: string,
  width: number,
  height: number,
  fps: number,
  qsvAvailable: boolean
): Promise<void> {
  const duration = Math.max(0.1, end - start);
  const videoCodecArgs = qsvAvailable
    ? [`-c:v h264_qsv`, `-preset veryfast`, `-profile:v high`]
    : [`-c:v libx264`, `-preset veryfast`, `-profile:v high`];

  return new Promise((resolvePromise, reject) => {
    ffmpeg(inputPath)
      .inputOptions([`-ss ${start.toFixed(3)}`])
      .outputOptions([
        `-t ${duration.toFixed(3)}`,
        `-vf scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:black,setsar=1`,
        ...videoCodecArgs,
        '-pix_fmt yuv420p',
        `-r ${fps}`,
        '-c:a aac',
        '-b:a 192k',
        '-ar 48000',
        '-g 30',
        '-keyint_min 30',
        '-y',
      ])
      .output(outputPath)
      .on('end', () => resolvePromise())
      .on('error', (err: Error) => reject(err))
      .run();
  });
}

/**
 * Editor de línea de tiempo simple: recorta cada clip a su tramo exacto (con audio
 * original) y los une en el orden dado, para armar un "rough cut" que luego se pueda
 * seguir editando en Editor de Clips o Cola de Edición.
 */
export async function assembleTimelineJoin(config: TimelineJoinConfig, onEvent?: EventCallback): Promise<string> {
  const { clips, outputFilename, resolution = '1080p', fps = 30 } = config;

  if (clips.length === 0) {
    throw new Error('Se necesita al menos un clip');
  }

  const { width, height } = RESOLUTION_MAP[resolution];
  const qsvAvailable = await isQsvAvailable();

  const tempDir = join(tmpdir(), `._tmp_timeline_join_${uuidv4().slice(0, 8)}`);
  await fs.mkdir(tempDir, { recursive: true });
  const piecePaths: string[] = [];

  try {
    for (let i = 0; i < clips.length; i++) {
      const clip = clips[i];
      onEvent?.('progress', `✂️ Recortando clip ${i + 1}/${clips.length}...`, (i / clips.length) * 100);
      const piecePath = join(tempDir, `piece-${i}-${uuidv4().slice(0, 8)}.mp4`);
      await trimClipWithAudio(clip.path, clip.start, clip.end, piecePath, width, height, fps, qsvAvailable);
      piecePaths.push(piecePath);
    }

    const outputId = outputFilename || `timeline-join-${uuidv4()}`;
    const outputPath = join(OUTPUT_DIR, `${outputId}.mp4`);

    if (piecePaths.length === 1) {
      await fs.copyFile(piecePaths[0], outputPath);
    } else {
      onEvent?.('info', '🔗 Uniendo clips...', 95);
      await concatBatches(piecePaths, outputPath);
    }

    onEvent?.('success', '✅ Clips unidos y recortados');
    return outputPath;
  } finally {
    for (const p of piecePaths) await fs.unlink(p).catch(() => {});
    await fs.rmdir(tempDir).catch(() => {});
  }
}

/**
 * "Desagrupa" un video por escenas — igual que hace Cola de Edición con un video
 * completo (detectScenes + reorderClips/shuffleClips), pero aquí el resultado se ajusta a
 * una duración objetivo (sin repetir, ver syncTimelineToAudio) y se renderiza a UN SOLO
 * archivo de video (sin audio) en OUTPUT_DIR. Ese archivo se trata después como un item
 * de video normal por cualquiera de los dos motores de Composición con Remotion — así
 * "desagrupar" funciona igual en FFmpeg y en Remotion sin tocar ninguno de los dos
 * pipelines de ensamblaje.
 */
export async function prepareDesagrupadoVideoItem(
  videoPath: string,
  targetDurationSeconds: number,
  fullShuffle: boolean,
  onEvent?: EventCallback
): Promise<string> {
  onEvent?.('info', `🔍 Desagrupando "${basename(videoPath)}"...`);
  let boundaries = await detectScenes(videoPath, onEvent);
  boundaries = fullShuffle ? shuffleClips(boundaries) : reorderClips(boundaries);

  const { segments: fitted } = syncTimelineToAudio(boundaries, Math.max(0.1, targetDurationSeconds), false);
  const segments: TimelineSegment[] = fitted.map(b => ({ inputIndex: 0, start: b.start, end: b.end, speedFactor: b.speedFactor }));

  const qsvAvailable = await isQsvAvailable();
  const tempDir = join(tmpdir(), `._tmp_desagrupar_${uuidv4().slice(0, 8)}`);
  await fs.mkdir(tempDir, { recursive: true });
  try {
    const rendered = await renderAssembleBatch([videoPath], segments, 0, tempDir, {
      width: 1920,
      height: 1080,
      fps: 30,
      qsvAvailable,
    });
    const outputPath = join(OUTPUT_DIR, `desagrupado-${uuidv4()}.mp4`);
    await fs.copyFile(rendered, outputPath);
    onEvent?.('info', `✅ "${basename(videoPath)}" desagrupado (${fitted.length} fragmentos)`);
    return outputPath;
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
}

/**
 * Crea un video a partir de una secuencia de imágenes, con animaciones (zoom in/out,
 * paneo) y transiciones (fade, disolvencia, wipe, deslizar) que van variando imagen a
 * imagen para evitar que se vea repetitivo/artificial. Procesa las imágenes en lotes
 * pequeños (con xfade real dentro de cada lote) y luego une los lotes con concat +
 * copia directa, para poder escalar a cientos de imágenes sin colgar el grafo de
 * filtros de FFmpeg.
 */
export async function assembleImageSequence(
  config: ImageSequenceConfig,
  onEvent?: EventCallback,
  onBatchComplete?: (batchIndex: number, outputPath: string, tempDir: string) => void
): Promise<string> {
  const {
    items,
    outputFilename,
    totalDurationSeconds,
    perImageDuration: fixedPerImageDuration,
    resolution = '1080p',
    fps = 30,
    transitionTypes = DEFAULT_TRANSITION_CYCLE,
    animationTypes = DEFAULT_ANIMATION_CYCLE,
    transitionDuration = 0.6,
    batchSize = IMAGE_BATCH_SIZE,
    randomMode = false,
    resumeTempDir,
    resumeCompletedBatches,
    audioPath,
    explicitDurationsSeconds,
    transitionOverrides,
  } = config;

  if (items.length === 0) throw new Error('No hay imágenes ni videos para procesar');

  // El orden de "items" (tal cual llega, mezclando imágenes y videos) se respeta tal
  // cual a lo largo de todo el ensamblaje — batching, duraciones y transiciones solo
  // dividen/agrupan esa secuencia, nunca la reordenan.
  const batches: SequenceItem[][] = [];
  for (let i = 0; i < items.length; i += batchSize) {
    batches.push(items.slice(i, i + batchSize));
  }

  // Cada transición xfade DENTRO de un lote solapa (y por tanto acorta) la duración
  // final; los cortes ENTRE lotes son directos, sin solape. Se compensa la duración
  // pedida por elemento para que el video final, ya con las transiciones aplicadas,
  // termine coincidiendo con el objetivo en vez de quedar corto.
  const numIntraBatchTransitions = items.length - batches.length;
  const estimatedShrinkage = Math.max(0, numIntraBatchTransitions) * transitionDuration;

  const rawTargetTotal =
    fixedPerImageDuration !== undefined
      ? fixedPerImageDuration * items.length
      : totalDurationSeconds ?? items.length * 5;

  const imageDurations =
    explicitDurationsSeconds ?? generateImageDurations(items.length, rawTargetTotal + estimatedShrinkage, randomMode);
  const totalDuration = rawTargetTotal;

  onEvent?.(
    'info',
    randomMode
      ? `🖼️ ${items.length} elementos, duración variable por elemento (~${formatDuration(totalDuration)} en total)`
      : `🖼️ ${items.length} elementos, ${(rawTargetTotal / items.length).toFixed(2)}s cada uno (~${formatDuration(totalDuration)} en total)`
  );

  const tempDir = resumeTempDir || join(tmpdir(), `._tmp_batches_${uuidv4().slice(0, 8)}`);
  await fs.mkdir(tempDir, { recursive: true });

  if (resumeCompletedBatches && Object.keys(resumeCompletedBatches).length > 0) {
    onEvent?.('info', `♻️ Retomando trabajo interrumpido: ${Object.keys(resumeCompletedBatches).length}/${batches.length} lotes ya estaban listos`);
  }

  const qsvAvailable = await isQsvAvailable();
  onEvent?.(
    'info',
    qsvAvailable ? '⚡ Usando aceleración por hardware (Intel Quick Sync)' : '🐢 Sin aceleración por hardware disponible, usando CPU'
  );

  const batchOutputPaths: string[] = [];
  let globalIndex = 0;
  let elapsedTargetSeconds = 0;

  try {
    for (let b = 0; b < batches.length; b++) {
      const batchDurations = imageDurations.slice(globalIndex, globalIndex + batches[b].length);
      const reusablePath = resumeCompletedBatches?.[b];

      if (reusablePath && existsSync(reusablePath)) {
        onEvent?.(
          'progress',
          `♻️ Lote ${b + 1}/${batches.length} ya estaba listo, reutilizando...`,
          (b / batches.length) * 100,
          { currentSeconds: elapsedTargetSeconds, totalSeconds: totalDuration }
        );
        batchOutputPaths.push(reusablePath);
      } else {
        onEvent?.(
          'progress',
          `🎬 Procesando lote ${b + 1}/${batches.length} (${globalIndex}/${items.length} elementos)...`,
          (b / batches.length) * 100,
          { currentSeconds: elapsedTargetSeconds, totalSeconds: totalDuration }
        );

        const batchPath = await renderImageBatch(
          batches[b],
          batchDurations,
          b,
          globalIndex,
          tempDir,
          {
            resolution,
            fps,
            transitionTypes,
            animationTypes,
            transitionDuration,
            qsvAvailable,
            randomMode,
            transitionOverrides,
          },
          { onEvent, totalBatches: batches.length, elapsedTargetSeconds, projectTotalSeconds: totalDuration }
        );
        batchOutputPaths.push(batchPath);
        onBatchComplete?.(b, batchPath, tempDir);
      }
      globalIndex += batches[b].length;
      elapsedTargetSeconds += batchDurations.reduce((a, b2) => a + b2, 0) - Math.max(0, batchDurations.length - 1) * transitionDuration;
    }

    const outputId = outputFilename || `image-sequence-${uuidv4()}`;
    const outputPath = join(OUTPUT_DIR, `${outputId}.mp4`);

    onEvent?.('info', `🔗 Uniendo ${batchOutputPaths.length} lotes...`);
    if (audioPath) {
      const videoOnlyPath = join(tempDir, `video-only-${uuidv4().slice(0, 8)}.mp4`);
      await concatBatches(batchOutputPaths, videoOnlyPath);
      onEvent?.('info', '🎵 Agregando narración...', 98);
      await muxReplaceAudio(videoOnlyPath, audioPath, outputPath);
      await fs.unlink(videoOnlyPath).catch(() => {});
    } else {
      await concatBatches(batchOutputPaths, outputPath);
    }

    onEvent?.('success', `✅ Video creado: ${outputPath}`, 100, {
      currentSeconds: totalDuration,
      totalSeconds: totalDuration,
    });
    return outputPath;
  } finally {
    for (const p of batchOutputPaths) {
      await fs.unlink(p).catch(() => {});
    }
    await fs.rmdir(tempDir).catch(() => {});
  }
}
