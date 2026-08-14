import { v4 as uuidv4 } from 'uuid';

export interface VideoStructureConfig {
  totalDuration: number; // segundos
  aiVideoDurationMins: number; // primeros X minutos de IA (default 5)
  theme: string;
  iaImagePercentage: number; // % de imágenes IA en la segunda parte (default 40)
  stockVideoPercentage: number; // % de videos stock en la segunda parte (default 60)
}

export interface StructuredAssetPlan {
  id: string;
  theme: string;
  aiVideoDuration: number; // segundos
  secondPartDuration: number; // segundos
  structure: {
    phase: 'ai-video' | 'mixed';
    assets: {
      type: 'ai-video' | 'ai-image' | 'stock-video';
      count: number;
      duration: number;
      keywords: string[];
    }[];
  };
  totalAssets: number;
  estimatedCost: {
    iaVideos: number;
    iaImages: number;
    stockVideos: number;
  };
}

export function generateVideoStructure(
  config: VideoStructureConfig
): StructuredAssetPlan {
  const {
    totalDuration,
    aiVideoDurationMins = 5,
    theme,
    iaImagePercentage = 40,
    stockVideoPercentage = 60,
  } = config;

  const aiVideoDuration = aiVideoDurationMins * 60; // Convertir a segundos
  const secondPartDuration = totalDuration - aiVideoDuration;

  // Validar que el video IA no sea más largo que la duración total
  if (aiVideoDuration > totalDuration) {
    throw new Error(
      `AI video duration (${aiVideoDurationMins}min) cannot exceed total duration (${totalDuration}s)`
    );
  }

  // Configuración de la primera parte (IA Video)
  const aiVideoAssets = {
    type: 'ai-video' as const,
    count: Math.ceil(aiVideoDuration / 8), // SnapGen genera videos de ~8s
    duration: aiVideoDuration,
    keywords: [theme, `${theme} cinematic`, `${theme} professional`],
  };

  // Configuración de la segunda parte (Mezcla IA + Stock)
  const iaImageCount = Math.ceil(secondPartDuration * (iaImagePercentage / 100) / 5); // ~5s por imagen
  const stockVideoCount = Math.ceil(secondPartDuration * (stockVideoPercentage / 100) / 10); // ~10s por video

  const iaImageAssets = {
    type: 'ai-image' as const,
    count: iaImageCount,
    duration: Math.round((secondPartDuration * iaImagePercentage) / 100),
    keywords: [theme, `${theme} visual`, `${theme} scene`],
  };

  const stockVideoAssets = {
    type: 'stock-video' as const,
    count: stockVideoCount,
    duration: Math.round((secondPartDuration * stockVideoPercentage) / 100),
    keywords: [theme, `${theme} footage`, `${theme} stock`],
  };

  // Costo estimado (aproximado)
  const estimatedCost = {
    iaVideos: aiVideoAssets.count * 0.15, // ~$0.15 por video SnapGen
    iaImages: iaImageAssets.count * 0.02, // ~$0.02 por imagen NanoBanana
    stockVideos: 0, // Stock es gratis (Pixabay/Pexels/Wikimedia)
  };

  const plan: StructuredAssetPlan = {
    id: uuidv4(),
    theme,
    aiVideoDuration,
    secondPartDuration,
    structure: {
      phase: 'ai-video',
      assets: [aiVideoAssets, iaImageAssets, stockVideoAssets],
    },
    totalAssets: aiVideoAssets.count + iaImageAssets.count + stockVideoAssets.count,
    estimatedCost,
  };

  return plan;
}

export function generateSearchKeywords(theme: string, assetType: 'video' | 'image'): string[] {
  const baseKeywords = [
    theme,
    `${theme} scene`,
    `${theme} footage`,
    `${theme} cinematic`,
    `${theme} professional`,
  ];

  if (assetType === 'video') {
    return [
      ...baseKeywords,
      `${theme} video`,
      `${theme} clip`,
      `moving ${theme}`,
      `${theme} background`,
    ];
  } else {
    return [
      ...baseKeywords,
      `${theme} image`,
      `${theme} photo`,
      `${theme} visual`,
      `${theme} picture`,
    ];
  }
}

export function calculateAssetDistribution(
  structure: StructuredAssetPlan,
  availableAssets: {
    iaVideos: string[];
    iaImages: string[];
    stockVideos: string[];
  }
): {
  phase1: Array<{ type: string; asset: string; duration: number }>;
  phase2: Array<{ type: string; asset: string; duration: number }>;
} {
  const phase1: Array<{ type: string; asset: string; duration: number }> = [];
  const phase2: Array<{ type: string; asset: string; duration: number }> = [];

  // Fase 1: Videos de IA
  const aiVideoDurationPerAsset = Math.round(structure.aiVideoDuration / availableAssets.iaVideos.length);
  availableAssets.iaVideos.forEach((asset) => {
    phase1.push({
      type: 'ai-video',
      asset,
      duration: aiVideoDurationPerAsset,
    });
  });

  // Fase 2: Mezcla
  const iaImageDurationPerAsset = Math.round(
    structure.secondPartDuration * (40 / 100) / availableAssets.iaImages.length
  );
  const stockVideoDurationPerAsset = Math.round(
    structure.secondPartDuration * (60 / 100) / availableAssets.stockVideos.length
  );

  availableAssets.iaImages.forEach((asset) => {
    phase2.push({
      type: 'ai-image',
      asset,
      duration: iaImageDurationPerAsset,
    });
  });

  availableAssets.stockVideos.forEach((asset) => {
    phase2.push({
      type: 'stock-video',
      asset,
      duration: stockVideoDurationPerAsset,
    });
  });

  return { phase1, phase2 };
}

export function getThematicSearchTerms(theme: string): {
  forAIVideos: string[];
  forAIImages: string[];
  forStockVideos: string[];
} {
  return {
    forAIVideos: generateSearchKeywords(theme, 'video'),
    forAIImages: generateSearchKeywords(theme, 'image'),
    forStockVideos: generateSearchKeywords(theme, 'video'),
  };
}
