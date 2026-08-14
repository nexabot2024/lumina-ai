import { v4 as uuidv4 } from 'uuid';

export interface AutomationConfig {
  stockPercentage: number; // 0-100 (e.g., 80)
  iaPercentage: number;    // 0-100 (e.g., 20)
  transitionType: 'fade' | 'slide' | 'dissolve' | 'wipeLeft' | 'wipeRight' | 'random';
  transitionDuration: number; // milliseconds (300-1000)
  animationType: 'zoom' | 'pan' | 'rotate' | 'bounce' | 'slideIn' | 'random';
  animationDuration: number; // milliseconds (500-2000)
  videoDuration: number; // segundos
  fps: number;
}

export interface AutomatedTimeline {
  id: string;
  assets: AutomatedAsset[];
  totalDuration: number;
  transitions: Transition[];
  animations: Animation[];
}

export interface AutomatedAsset {
  id: string;
  type: 'image' | 'video' | 'audio';
  source: 'stock' | 'ia';
  path: string;
  duration: number;
  startTime: number;
  effects?: string[];
}

export interface Transition {
  fromAssetId: string;
  toAssetId: string;
  type: string;
  duration: number;
  ffmpegFilter: string;
}

export interface Animation {
  assetId: string;
  type: string;
  duration: number;
  intensity: 'light' | 'medium' | 'heavy';
  ffmpegFilter: string;
}

const TRANSITION_FILTERS = {
  fade: (duration: number, fps: number) =>
    `fade=t=in:st=0:d=${duration / 1000},fade=t=out:st=${duration / 1000}:d=${duration / 1000}`,

  slide: (duration: number, fps: number) =>
    `hstack=inputs=2:shortest=1,scale=${1920}:${1080}`,

  dissolve: (duration: number, fps: number) =>
    `xfade=transition=dissolve:duration=${duration / 1000}:offset=0`,

  wipeLeft: (duration: number, fps: number) =>
    `xfade=transition=wipeleft:duration=${duration / 1000}:offset=0`,

  wipeRight: (duration: number, fps: number) =>
    `xfade=transition=wiperight:duration=${duration / 1000}:offset=0`,
};

const ANIMATION_FILTERS = {
  zoom: (duration: number, intensity: 'light' | 'medium' | 'heavy') => {
    const scales = { light: '1.05', medium: '1.15', heavy: '1.3' };
    return `scale=iw*${scales[intensity]}:ih*${scales[intensity]},fps=${30}`;
  },

  pan: (duration: number, intensity: 'light' | 'medium' | 'heavy') => {
    const panAmounts = { light: '10', medium: '30', heavy: '60' };
    return `pan=1920:1080:${panAmounts[intensity]}:0`;
  },

  rotate: (duration: number, intensity: 'light' | 'medium' | 'heavy') => {
    const rotations = { light: '2', medium: '5', heavy: '10' };
    return `rotate=${rotations[intensity]}*PI/180:ow=rotated_w:oh=rotated_h`;
  },

  bounce: (duration: number, intensity: 'light' | 'medium' | 'heavy') => {
    return `format=yuv420p,scale=1920:1080`;
  },

  slideIn: (duration: number, intensity: 'light' | 'medium' | 'heavy') => {
    return `fps=${30}`;
  },
};

export function generateRandomTransition(): keyof typeof TRANSITION_FILTERS {
  const types = Object.keys(TRANSITION_FILTERS) as (keyof typeof TRANSITION_FILTERS)[];
  return types[Math.floor(Math.random() * types.length)];
}

export function generateRandomAnimation(): keyof typeof ANIMATION_FILTERS {
  const types = Object.keys(ANIMATION_FILTERS) as (keyof typeof ANIMATION_FILTERS)[];
  return types[Math.floor(Math.random() * types.length)];
}

export function distributeAssetsByPercentage(
  stockAssets: string[],
  iaAssets: string[],
  stockPercentage: number,
  videoDuration: number
): { source: 'stock' | 'ia'; path: string; duration: number }[] {
  const totalAssets = stockAssets.length + iaAssets.length;
  if (totalAssets === 0) return [];

  const iaPercentage = 100 - stockPercentage;

  // Calcular cuántos assets de cada tipo necesitamos
  const stockCount = Math.ceil((totalAssets * stockPercentage) / 100);
  const iaCount = totalAssets - stockCount;

  const distributed: { source: 'stock' | 'ia'; path: string; duration: number }[] = [];

  // Distribuir assets manteniendo el porcentaje
  let stockUsed = 0;
  let iaUsed = 0;

  for (let i = 0; i < totalAssets; i++) {
    const shouldUseStock = stockUsed < stockCount &&
      (iaUsed >= iaCount || Math.random() < (stockPercentage / 100));

    if (shouldUseStock && stockUsed < stockAssets.length) {
      distributed.push({
        source: 'stock',
        path: stockAssets[stockUsed],
        duration: videoDuration / totalAssets,
      });
      stockUsed++;
    } else if (iaUsed < iaAssets.length) {
      distributed.push({
        source: 'ia',
        path: iaAssets[iaUsed],
        duration: videoDuration / totalAssets,
      });
      iaUsed++;
    }
  }

  return distributed;
}

export function createAutomatedTimeline(
  assets: { source: 'stock' | 'ia'; path: string; duration: number }[],
  config: AutomationConfig
): AutomatedTimeline {
  const timeline: AutomatedTimeline = {
    id: uuidv4(),
    assets: [],
    totalDuration: 0,
    transitions: [],
    animations: [],
  };

  let currentTime = 0;
  let previousAssetId: string | null = null;

  // Crear assets automatizados
  assets.forEach((asset, index) => {
    const assetId = uuidv4();

    const automatedAsset: AutomatedAsset = {
      id: assetId,
      type: asset.path.endsWith('.mp3') ? 'audio' : (asset.path.endsWith('.mp4') ? 'video' : 'image'),
      source: asset.source,
      path: asset.path,
      duration: asset.duration,
      startTime: currentTime,
      effects: [],
    };

    timeline.assets.push(automatedAsset);

    // Crear transición del asset anterior
    if (previousAssetId && index > 0) {
      const transitionType = config.transitionType === 'random'
        ? generateRandomTransition()
        : config.transitionType;

      const transition: Transition = {
        fromAssetId: previousAssetId,
        toAssetId: assetId,
        type: transitionType,
        duration: config.transitionDuration,
        ffmpegFilter: TRANSITION_FILTERS[transitionType](
          config.transitionDuration,
          config.fps
        ),
      };

      timeline.transitions.push(transition);
    }

    // Crear animación para el asset actual
    const animationType = config.animationType === 'random'
      ? generateRandomAnimation()
      : config.animationType;

    const intensity = config.animationDuration > 1500 ? 'heavy' :
                     config.animationDuration > 1000 ? 'medium' : 'light';

    const animation: Animation = {
      assetId,
      type: animationType,
      duration: config.animationDuration,
      intensity,
      ffmpegFilter: ANIMATION_FILTERS[animationType](
        config.animationDuration,
        intensity
      ),
    };

    timeline.animations.push(animation);

    currentTime += asset.duration * 1000; // Convertir a milisegundos
    previousAssetId = assetId;
  });

  timeline.totalDuration = currentTime / 1000; // Convertir de vuelta a segundos

  return timeline;
}

export function generateFFmpegCommand(timeline: AutomatedTimeline): string[] {
  const filters: string[] = [];

  // Agregar animaciones a cada asset
  timeline.animations.forEach(anim => {
    filters.push(anim.ffmpegFilter);
  });

  // Agregar transiciones
  timeline.transitions.forEach(trans => {
    filters.push(trans.ffmpegFilter);
  });

  return filters;
}
