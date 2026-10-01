import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { v4 as uuidv4 } from 'uuid';
import { bundle } from '@remotion/bundler';
import { selectComposition, renderMedia } from '@remotion/renderer';
import { OUTPUT_DIR } from './outputStorage.js';
import { generateImageDurations, DEFAULT_TRANSITION_CYCLE, DEFAULT_ANIMATION_CYCLE } from './clipEditingService.js';
import type { EventCallback } from './clipEditingService.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REMOTION_ENTRY_POINT = join(__dirname, '..', '..', 'remotion', 'index.tsx');

// El navegador headless de Remotion (Chromium) bloquea cargar archivos locales (file://)
// desde una página servida en http://localhost — igual que un navegador normal. En vez de
// luchar contra esa restricción, se sirven las imágenes/videos vía HTTP normal, desde este
// mismo backend (que ya sirve /uploads y /outputs estáticos — ver outputStorage.ts y
// server.ts) — así es un fetch http:// común y corriente, sin restricciones de esquema.
const SELF_BASE_URL = `http://localhost:${process.env.PORT || 5000}`;

// tsc de este proyecto usa rootDir: "./src", así que no puede importar directamente desde
// backend/remotion/types.ts (fuera de ese rootDir — Remotion bundlea esa carpeta por su
// cuenta, con su propio esbuild). Se duplican aquí los mismos tipos — deben mantenerse
// iguales a backend/remotion/types.ts si se cambian.
type RemotionAnimationType = 'zoomin' | 'zoomout' | 'pan' | 'none';
type RemotionTransitionType = 'fade' | 'dissolve' | 'wipeleft' | 'wiperight' | 'slideup' | 'slidedown';
type OverlayPosition = 'centro' | 'arriba' | 'abajo';
interface RemotionTextOverlay {
  text: string;
  startSec: number;
  endSec: number;
  position: OverlayPosition;
  fontSize?: number;
}
interface RemotionShapeOverlay {
  shape: 'rectangulo';
  startSec: number;
  endSec: number;
  position: OverlayPosition;
  color?: string;
}
interface RemotionSequenceItem {
  path: string;
  type: 'image' | 'video';
  durationInFrames: number;
  animation: RemotionAnimationType;
  transitionToNext?: RemotionTransitionType;
  textOverlays?: RemotionTextOverlay[];
  shapeOverlays?: RemotionShapeOverlay[];
}
interface SequenceCompositionProps {
  items: RemotionSequenceItem[];
  transitionDurationInFrames: number;
  resolution: { width: number; height: number };
  fps: number;
  audioSrc?: string;
}

export interface RemotionSequenceItemInput {
  path: string;
  type: 'image' | 'video';
  /** Fija la animación de este item (instrucción "item N zoom=..."). */
  animationOverride?: RemotionAnimationType;
  textOverlays?: RemotionTextOverlay[];
  shapeOverlays?: RemotionShapeOverlay[];
}

const RESOLUTION_MAP = {
  '720p': { width: 1280, height: 720 },
  '1080p': { width: 1920, height: 1080 },
  '2k': { width: 2560, height: 1440 },
  '4k': { width: 3840, height: 2160 },
};

export interface RemotionRenderConfig {
  items: RemotionSequenceItemInput[];
  outputFilename?: string;
  totalDurationSeconds?: number;
  perImageDuration?: number;
  resolution?: '720p' | '1080p' | '2k' | '4k';
  fps?: number;
  transitionTypes?: RemotionTransitionType[];
  animationTypes?: RemotionAnimationType[];
  transitionDuration?: number;
  randomMode?: boolean;
  audioPath?: string;
  /** Ver el mismo campo en ImageSequenceConfig (clipEditingService.ts) — si viene, se usa
   * tal cual en vez de recalcularla (evita resultados distintos en modo aleatorio cuando
   * el llamador ya necesitó la duración antes de invocar esta función). */
  explicitDurationsSeconds?: number[];
  /** Ver el mismo campo en ImageSequenceConfig — índice = posición del item que precede a
   * la transición fijada (instrucción "item N->M transicion=..."). */
  transitionOverrides?: Record<number, RemotionTransitionType>;
}

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

// El bundle (empaquetado webpack de la composición React) es caro y no depende de los
// props del render — se arma una sola vez y se reutiliza en todos los renders siguientes,
// igual que isQsvAvailable() memoiza su sondeo en clipEditingService.ts.
let bundlePromise: Promise<string> | null = null;
function getRemotionBundle(): Promise<string> {
  if (!bundlePromise) {
    bundlePromise = bundle({ entryPoint: REMOTION_ENTRY_POINT }).catch(err => {
      bundlePromise = null; // Un fallo no se queda cacheado — el próximo render reintenta.
      throw err;
    });
  }
  return bundlePromise;
}

/** `path` puede venir ya como URL absoluta (http/https) o como ruta relativa servida por
 * este mismo backend (ej. "/uploads/xxx.png") — en ese caso se completa con SELF_BASE_URL. */
function toServableUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) return path;
  return `${SELF_BASE_URL}${path.startsWith('/') ? '' : '/'}${path}`;
}

export async function renderWithRemotion(config: RemotionRenderConfig, onEvent?: EventCallback): Promise<string> {
  const {
    items,
    outputFilename,
    totalDurationSeconds,
    perImageDuration: fixedPerItemDuration,
    resolution = '1080p',
    fps = 30,
    transitionTypes = DEFAULT_TRANSITION_CYCLE as unknown as RemotionTransitionType[],
    animationTypes = DEFAULT_ANIMATION_CYCLE as unknown as RemotionAnimationType[],
    transitionDuration = 0.6,
    randomMode = false,
    audioPath,
    explicitDurationsSeconds,
    transitionOverrides,
  } = config;

  if (items.length === 0) throw new Error('No hay imágenes ni videos para procesar');

  const { width, height } = RESOLUTION_MAP[resolution];

  const rawTargetTotal =
    fixedPerItemDuration !== undefined ? fixedPerItemDuration * items.length : totalDurationSeconds ?? items.length * 5;
  // Igual que en Secuencia de Imágenes: se compensa el solape que cada transición le va a
  // quitar a la duración final, para que el resultado ya con transiciones aplicadas
  // termine coincidiendo con el objetivo pedido.
  const estimatedShrinkage = Math.max(0, items.length - 1) * transitionDuration;
  const itemDurationsSeconds =
    explicitDurationsSeconds ?? generateImageDurations(items.length, rawTargetTotal + estimatedShrinkage, randomMode);

  onEvent?.(
    'info',
    randomMode
      ? `🎬 ${items.length} elementos, duración variable (~${rawTargetTotal.toFixed(0)}s en total)`
      : `🎬 ${items.length} elementos, ${(rawTargetTotal / items.length).toFixed(2)}s cada uno (~${rawTargetTotal.toFixed(0)}s en total)`
  );

  const remotionItems: RemotionSequenceItem[] = items.map((item, i) => {
    const animation: RemotionAnimationType =
      item.type === 'video'
        ? 'none'
        : item.animationOverride
          ? item.animationOverride
          : randomMode
            ? pickRandom(animationTypes)
            : animationTypes[i % animationTypes.length];
    const rotatedOrRandomTransition = randomMode ? pickRandom(transitionTypes) : transitionTypes[i % transitionTypes.length];
    const transitionToNext: RemotionTransitionType | undefined =
      i < items.length - 1 ? transitionOverrides?.[i] ?? rotatedOrRandomTransition : undefined;

    return {
      path: toServableUrl(item.path),
      type: item.type,
      durationInFrames: Math.max(1, Math.round(itemDurationsSeconds[i] * fps)),
      animation,
      transitionToNext,
      textOverlays: item.textOverlays,
      shapeOverlays: item.shapeOverlays,
    };
  });

  const inputProps: SequenceCompositionProps = {
    items: remotionItems,
    transitionDurationInFrames: Math.max(1, Math.round(transitionDuration * fps)),
    resolution: { width, height },
    fps,
    audioSrc: audioPath ? toServableUrl(audioPath) : undefined,
  };

  onEvent?.('info', '📦 Preparando el motor Remotion (primera vez puede tardar más)...');
  const serveUrl = await getRemotionBundle();

  const composition = await selectComposition({
    serveUrl,
    id: 'Sequence',
    inputProps: inputProps as unknown as Record<string, unknown>,
  });

  const outputId = outputFilename || `remotion-${uuidv4()}`;
  const outputPath = join(OUTPUT_DIR, `${outputId}.mp4`);

  onEvent?.('info', '🎬 Renderizando con Remotion (Chromium headless)...');
  let lastReportedPercent = -1;
  await renderMedia({
    composition,
    serveUrl,
    codec: 'h264',
    outputLocation: outputPath,
    inputProps: inputProps as unknown as Record<string, unknown>,
    onProgress: progress => {
      const percent = Math.round((progress.progress || 0) * 100);
      if (percent === lastReportedPercent) return;
      lastReportedPercent = percent;
      onEvent?.('progress', `🎬 Renderizando... ${percent}%`, percent);
    },
  });

  onEvent?.('success', `✅ Video creado con Remotion: ${outputPath}`, 100);
  return outputPath;
}
