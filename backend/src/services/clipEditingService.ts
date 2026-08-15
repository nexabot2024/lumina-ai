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

const ffmpegPath = process.env.FFMPEG_PATH || 'C:\\ffmpeg\\bin\\ffmpeg.exe';
const ffprobePath = process.env.FFPROBE_PATH || 'C:\\ffmpeg\\bin\\ffprobe.exe';

if (existsSync(ffmpegPath)) ffmpeg.setFfmpegPath(ffmpegPath);
if (existsSync(ffprobePath)) ffmpeg.setFfprobePath(ffprobePath);

export interface SceneBoundary {
  start: number;
  end: number;
}

export interface TimelineSegment {
  inputIndex: number;
  start: number;
  end: number;
  isImage?: boolean;
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
  resolution?: '720p' | '1080p' | '2k' | '4k';
  fps?: number;
  splitScenes?: boolean;
  allowClipRepeat?: boolean;
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
  sourceTypes?: Array<'video' | 'image'>
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

    perVideoBoundaries.push(reorderClips(boundaries));
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

export function syncTimelineToAudio<T extends { start: number; end: number }>(
  segments: T[],
  audioDuration: number,
  allowRepeat: boolean = true
): { segments: T[]; repeated: boolean; trimmed: boolean } {
  if (segments.length === 0) return { segments, repeated: false, trimmed: false };

  const originalTotal = segments.reduce((s, seg) => s + (seg.end - seg.start), 0);
  let result = [...segments];
  let total = originalTotal;
  let repeated = false;

  if (allowRepeat) {
    while (total < audioDuration - 0.05) {
      result = [...result, ...segments];
      total += originalTotal;
      repeated = true;
    }
  }

  let trimmed = false;
  if (total > audioDuration + 0.05) {
    let acc = 0;
    const trimmedSegments: T[] = [];
    for (const seg of result) {
      const segDuration = seg.end - seg.start;
      if (acc + segDuration <= audioDuration) {
        trimmedSegments.push(seg);
        acc += segDuration;
      } else {
        const remaining = audioDuration - acc;
        if (remaining > 0.05) {
          trimmedSegments.push({ ...seg, end: seg.start + remaining });
          acc += remaining;
        }
        trimmed = true;
        break;
      }
    }
    result = trimmedSegments;
  }

  return { segments: result, repeated, trimmed };
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

  if (!animation?.enabled || animation.type === 'none') {
    return `${base},scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:black[${label}]`;
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
    return `${base},scale=${width * 2}:${height * 2}:force_original_aspect_ratio=decrease,pad=${width * 2}:${height * 2}:(ow-iw)/2:(oh-ih)/2:black,zoompan=z='${zoomExpr}':d=${frames}:s=${width}x${height}:fps=${fps}:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)'[${label}]`;
  }

  // pan: paneo diagonal (no lateral puro) a lo largo de toda la duración exacta,
  // con recorrido corto para que el encuadre se siga viendo casi completo
  const panWidth = Math.round(width * 1.1);
  const panHeight = Math.round(height * 1.1);
  const maxDx = panWidth - width;
  const maxDy = panHeight - height;
  return `${base},scale=${panWidth}:${panHeight}:force_original_aspect_ratio=increase,crop=${width}:${height}:x='${maxDx}*t/${duration.toFixed(3)}':y='${maxDy}*t/${duration.toFixed(3)}'[${label}]`;
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
  const durations = syncedSegments.map(s => s.end - s.start);
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
    transitions: rawTransitions,
    animations,
    maxClipDuration,
  } = config;

  const { width, height } = RESOLUTION_MAP[resolution];

  let effectiveVideoPaths = videoPaths;
  const tempImageClips: string[] = [];
  let tempImageDir: string | undefined;

  const imageIndices = sourceTypes
    ? sourceTypes.reduce<number[]>((acc, t, i) => (t === 'image' ? [...acc, i] : acc), [])
    : [];

  if (imageIndices.length > 0) {
    onEvent?.('info', `🖼️ Generando ${imageIndices.length} clip(s) animado(s) a partir de imágenes de referencia (zoom + movimiento)...`);
    const qsvAvailable = await isQsvAvailable();
    tempImageDir = join(tmpdir(), `vidspa-ref-images-${uuidv4().slice(0, 8)}`);
    await fs.mkdir(tempImageDir, { recursive: true });

    const rendered = [...videoPaths];
    for (let i = 0; i < imageIndices.length; i++) {
      const idx = imageIndices[i];
      const duration = Math.min(MAX_IMAGE_CLIP_DURATION, Math.max(1, imageDurations[idx] ?? 5));
      const animType: AnimationType =
        animations?.enabled && animations.type !== 'none'
          ? animations.type
          : DEFAULT_ANIMATION_CYCLE[idx % DEFAULT_ANIMATION_CYCLE.length];
      const clipPath = join(tempImageDir, `ref-image-${idx}-${uuidv4().slice(0, 8)}.mp4`);
      onEvent?.('progress', `🖼️ Renderizando imagen ${i + 1}/${imageIndices.length} (${duration}s, ${animType})...`);
      await renderImageClip(videoPaths[idx], duration, clipPath, width, height, fps, animType, qsvAvailable);
      rendered[idx] = clipPath;
      tempImageClips.push(clipPath);
    }
    effectiveVideoPaths = rendered;
  }

  onEvent?.('info', splitScenes ? '🔍 Detectando escenas y construyendo timeline...' : '📋 Usando videos completos (sin dividir escenas)...');
  const { segments } = await buildTimeline(effectiveVideoPaths, splicePoints, splitScenes, maxClipDuration, onEvent, sourceTypes);
  onEvent?.(
    'info',
    maxClipDuration
      ? `📋 ${segments.length} clips en el timeline (máx. ${maxClipDuration}s por clip)`
      : `📋 ${segments.length} clips en el timeline`
  );

  const audioDuration = await getDuration(audioPath);

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
  const { segments: syncedSegments, repeated, trimmed } = syncResult;

  if (repeated) onEvent?.('warning', '🔁 Video más corto que el audio: se repitieron clips para sincronizar');
  if (trimmed) onEvent?.('warning', '✂️ Video más largo que el audio: se recortó para sincronizar');
  if (!allowClipRepeat && !repeated) {
    const total = syncedSegments.reduce((s, seg) => s + (seg.end - seg.start), 0);
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

    const totalSegDuration = syncedSegments.reduce((s, seg) => s + (seg.end - seg.start), 0);
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
      processedSeconds += batches[b].reduce((s, seg) => s + (seg.end - seg.start), 0);
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

  const finalDuration = Math.min(audioDuration, transitionedDuration);

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
    filterParts.push(
      `[0:v]trim=start=${b.start.toFixed(3)}:end=${b.end.toFixed(3)},setpts=PTS-STARTPTS,scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:black[v${i}]`
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
    resolution?: '720p' | '1080p' | '2k' | '4k';
    fps?: number;
    /**
     * Narración a sincronizar con este video específico (Cola de Edición: cada video
     * puede traer su propio audio). Reemplaza el audio original del video — el
     * timeline se recorta o repite (igual que en assembleVideo) para encajar
     * exactamente en la duración de este audio.
     */
    audioPath?: string;
  } = {},
  onEvent?: EventCallback
): Promise<string> {
  const maxClipDuration = options.maxClipDuration;
  const splitScenes = options.splitScenes ?? false;
  const { width, height } = RESOLUTION_MAP[options.resolution || '1080p'];
  const fps = options.fps || 30;
  const syncAudioPath = options.audioPath;

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
  boundaries = reorderClips(boundaries);

  let syncAudioDuration: number | undefined;
  if (syncAudioPath) {
    syncAudioDuration = await getDuration(syncAudioPath);
    const { segments: synced, repeated, trimmed } = syncTimelineToAudio(boundaries, syncAudioDuration, true);
    boundaries = synced;
    if (repeated) onEvent?.('warning', '🔁 Video más corto que el audio: se repitieron clips para sincronizar');
    if (trimmed) onEvent?.('warning', '✂️ Video más largo que el audio: se recortó para sincronizar');
  }

  onEvent?.(
    'info',
    maxClipDuration
      ? `📋 ${boundaries.length} fragmentos de máx. ${maxClipDuration}s, reordenados`
      : `📋 ${boundaries.length} fragmentos, reordenados`
  );

  const base = basename(videoPath, extname(videoPath));
  const outputPath = join(OUTPUT_DIR, `${base}-reordenado-${uuidv4().slice(0, 8)}.mp4`);
  const finalDuration = boundaries.reduce((s, b) => s + (b.end - b.start), 0);

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
      processedSeconds += batches[b].reduce((s, seg) => s + (seg.end - seg.start), 0);
    }

    if (syncAudioPath) {
      const videoOnlyPath = join(tempDir, `video-only-${uuidv4().slice(0, 8)}.mp4`);
      onEvent?.('info', '🔗 Uniendo lotes...', 92, { currentSeconds: finalDuration, totalSeconds: finalDuration });
      await concatBatches(batchPaths, videoOnlyPath);
      onEvent?.('info', '🎵 Sincronizando audio...', 97, { currentSeconds: finalDuration, totalSeconds: finalDuration });
      await muxReplaceAudio(videoOnlyPath, syncAudioPath, outputPath);
      await fs.unlink(videoOnlyPath).catch(() => {});
    } else {
      onEvent?.('info', '🔗 Uniendo lotes...', 95, { currentSeconds: finalDuration, totalSeconds: finalDuration });
      await concatBatches(batchPaths, outputPath);
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

export interface ImageSequenceConfig {
  imagePaths: string[];
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

const DEFAULT_TRANSITION_CYCLE: TransitionType[] = ['fade', 'dissolve', 'wipeleft', 'wiperight', 'slideup', 'slidedown'];
const DEFAULT_ANIMATION_CYCLE: AnimationType[] = ['zoomin', 'zoomout', 'pan'];
export const IMAGE_BATCH_SIZE = 15;

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * Reparte totalDuration entre `count` imágenes. En modo aleatorio, cada imagen recibe
 * un peso al azar entre el 40% y el 180% de la duración media, y luego se reescala todo
 * para que la suma coincida exactamente con totalDuration. En modo uniforme, reparte
 * el mismo valor a todas.
 */
function generateImageDurations(count: number, totalDuration: number, random: boolean): number[] {
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

function buildBatchXfadeFilter(
  labels: string[],
  durations: number[],
  transitionTypes: TransitionType[],
  transitionDuration: number,
  randomMode: boolean = false
): { filterLines: string[]; outputLabel: string; totalDuration: number } {
  const n = labels.length;
  if (n === 1) return { filterLines: [], outputLabel: labels[0], totalDuration: durations[0] };

  const filterLines: string[] = [];
  let mergedDuration = durations[0];
  let prevLabel = labels[0];

  for (let i = 1; i < n; i++) {
    const type = randomMode ? pickRandom(transitionTypes) : transitionTypes[(i - 1) % transitionTypes.length];
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
  images: string[],
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
  // pan un poco más grande, "none" el tamaño final) — ver preprocessBlurFillImage.
  const animTypes = images.map((_, i) =>
    opts.randomMode
      ? pickRandom(opts.animationTypes)
      : opts.animationTypes[(globalImageIndex + i) % opts.animationTypes.length]
  );

  const preprocessedPaths = await Promise.all(
    images.map(async (img, i) => {
      const { w, h } = blurFillCanvasSize(width, height, animTypes[i]);
      const outPath = join(outputDir, `blurfill_${batchIndex}_${i}.png`);
      await preprocessBlurFillImage(img, w, h, outPath);
      return outPath;
    })
  );

  const filterParts: string[] = [];
  const labels: string[] = [];
  images.forEach((_, i) => {
    const label = `img${i}`;
    filterParts.push(buildImageSegmentFilter(i, label, width, height, opts.fps, durations[i], animTypes[i]));
    labels.push(label);
  });

  const { filterLines, outputLabel, totalDuration } = buildBatchXfadeFilter(
    labels,
    durations,
    opts.transitionTypes,
    opts.transitionDuration,
    opts.randomMode
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
    const filterScriptPath = await writeFilterScript(filterParts.join(';'));
    const videoCodecArgs = useQsv
      ? [`-c:v h264_qsv`, `-preset veryfast`, `-profile:v high`]
      : [`-c:v libx264`, `-preset veryfast`, `-profile:v high`];

    const command = ffmpeg();
    preprocessedPaths.forEach((img, i) => {
      // -framerate explícito (ver comentario en renderImageClip): evita el temblor de
      // zoompan al mantener el ritmo de entrada sincronizado con el fps del proyecto.
      command.input(img).inputOptions(['-loop', '1', '-framerate', String(opts.fps), '-t', durations[i].toFixed(3)]);
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
      for (const p of preprocessedPaths) fs.unlink(p).catch(() => {});
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
  for (const p of preprocessedPaths) fs.unlink(p).catch(() => {});
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
async function muxReplaceAudio(videoPath: string, audioPath: string, outputPath: string): Promise<void> {
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
        '-shortest',
        '-movflags +faststart',
        '-y',
      ])
      .output(outputPath)
      .on('end', () => resolvePromise())
      .on('error', (err: Error) => reject(err))
      .run();
  });
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
    imagePaths,
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
  } = config;

  if (imagePaths.length === 0) throw new Error('No hay imágenes para procesar');

  const batches: string[][] = [];
  for (let i = 0; i < imagePaths.length; i += batchSize) {
    batches.push(imagePaths.slice(i, i + batchSize));
  }

  // Cada transición xfade DENTRO de un lote solapa (y por tanto acorta) la duración
  // final; los cortes ENTRE lotes son directos, sin solape. Se compensa la duración
  // pedida por imagen para que el video final, ya con las transiciones aplicadas,
  // termine coincidiendo con el objetivo en vez de quedar corto.
  const numIntraBatchTransitions = imagePaths.length - batches.length;
  const estimatedShrinkage = Math.max(0, numIntraBatchTransitions) * transitionDuration;

  const rawTargetTotal =
    fixedPerImageDuration !== undefined
      ? fixedPerImageDuration * imagePaths.length
      : totalDurationSeconds ?? imagePaths.length * 5;

  const imageDurations = generateImageDurations(imagePaths.length, rawTargetTotal + estimatedShrinkage, randomMode);
  const totalDuration = rawTargetTotal;

  onEvent?.(
    'info',
    randomMode
      ? `🖼️ ${imagePaths.length} imágenes, duración variable por imagen (~${formatDuration(totalDuration)} en total)`
      : `🖼️ ${imagePaths.length} imágenes, ${(rawTargetTotal / imagePaths.length).toFixed(2)}s cada una (~${formatDuration(totalDuration)} en total)`
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
          `🎬 Procesando lote ${b + 1}/${batches.length} (${globalIndex}/${imagePaths.length} imágenes)...`,
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
