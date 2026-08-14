import { Router, Request, Response } from 'express';
import { join, basename } from 'path';
import { recordVideoHistory } from '../services/databaseService.js';

// Compilation status store (in-memory, in production use Redis)
const compilationStatus = new Map<string, {
  isCompiling: boolean;
  events: Array<{ type: string; message: string; percent?: number }>;
  currentPercent: number;
  estimatedSize?: number;
  totalDuration?: number;
  clients: Response[];
}>();
import {
  compileVideo,
  preValidateProject,
  createVideoFromImages,
  addWatermark,
  extractAudioFromVideo,
  getVideoMetadata,
  validateVideoAssets,
  type VideoProject,
  type CompilationOptions,
} from '../services/videoCompilationService.js';
import {
  distributeAssetsByPercentage,
  createAutomatedTimeline,
  generateFFmpegCommand,
  type AutomationConfig,
} from '../services/videoAutomationService.js';
import {
  generateVideoStructure,
  getThematicSearchTerms,
  calculateAssetDistribution,
  type VideoStructureConfig,
} from '../services/videoStructureService.js';

const router = Router();

function broadcastToClients(projectId: string, event: any) {
  const status = compilationStatus.get(projectId);
  if (!status) return;

  const eventData = {
    isCompiling: status.isCompiling,
    events: status.events,
    currentPercent: status.currentPercent,
    estimatedSize: status.estimatedSize,
    totalDuration: status.totalDuration,
  };

  status.clients.forEach(client => {
    client.write(`data: ${JSON.stringify(eventData)}\n\n`);
  });
}

function addEvent(projectId: string, type: string, message: string, percent?: number) {
  let status = compilationStatus.get(projectId);
  if (!status) {
    status = {
      isCompiling: true,
      events: [],
      currentPercent: 0,
      clients: [],
    };
    compilationStatus.set(projectId, status);
  }

  status.events.push({ type, message, percent });
  status.currentPercent = percent || status.currentPercent;
  broadcastToClients(projectId, { type, message, percent });
}

interface CompileRequest {
  project: VideoProject;
  options?: CompilationOptions;
}

interface CreateFromImagesRequest {
  imagePaths: string[];
  audioPath?: string;
  options?: CompilationOptions;
}

interface WatermarkRequest {
  videoPath: string;
  watermarkPath: string;
  position?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
  opacity?: number;
}

router.post('/compile', async (req: Request<{}, {}, CompileRequest>, res: Response) => {
  try {
    const { project, options } = req.body;

    if (!project || !project.assets) {
      return res.status(400).json({ error: 'Invalid project structure' });
    }

    const projectId = project.id;

    // Pre-validate before compilation
    const validation = await preValidateProject(project, options);

    if (!validation.isValid) {
      addEvent(projectId, 'error', `Validación fallida: ${validation.errors.join(', ')}`);
      return res.status(400).json({
        error: 'Validation failed before compilation',
        errors: validation.errors,
        warnings: validation.warnings,
      });
    }

    if (validation.warnings.length > 0) {
      validation.warnings.forEach(w => addEvent(projectId, 'warning', w));
    }

    // Initialize compilation status
    let status = compilationStatus.get(projectId);
    if (!status) {
      status = {
        isCompiling: true,
        events: [],
        currentPercent: 0,
        estimatedSize: validation.metadata.estimatedSize,
        totalDuration: validation.metadata.totalDuration,
        clients: [],
      };
      compilationStatus.set(projectId, status);
    } else {
      status.isCompiling = true;
      status.estimatedSize = validation.metadata.estimatedSize;
      status.totalDuration = validation.metadata.totalDuration;
    }

    addEvent(projectId, 'info', `📊 Iniciando compilación: ${validation.metadata.assetCount} assets, ${validation.metadata.totalDuration.toFixed(1)}s`);

    // Convert relative paths to absolute paths
    const uploadDirRel = process.env.UPLOAD_DIR || './uploads';
    const uploadDirAbs = join(process.cwd(), uploadDirRel);

    const projectWithAbsolutePaths = {
      ...project,
      assets: project.assets.map(asset => ({
        ...asset,
        path: asset.path.startsWith('/uploads/')
          ? join(uploadDirAbs, asset.path.replace('/uploads/', ''))
          : asset.path,
      })),
      audioTracks: project.audioTracks?.map(track =>
        track.startsWith('/uploads/')
          ? join(uploadDirAbs, track.replace('/uploads/', ''))
          : track
      ) || [],
    };

    res.json({
      message: 'Compilation started',
      projectId,
      validation: {
        warnings: validation.warnings,
        metadata: validation.metadata,
      }
    });

    // Compile in background
    compileVideo(projectWithAbsolutePaths, options, (type, message, percent) => {
      addEvent(projectId, type, message, percent);
    })
      .then(outputPath => {
        status = compilationStatus.get(projectId);
        if (status) status.isCompiling = false;
        recordVideoHistory(
          'compilation',
          basename(outputPath),
          `${validation.metadata.assetCount} assets`,
          outputPath,
          'completed',
          Math.round(validation.metadata.totalDuration)
        );
      })
      .catch(error => {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        addEvent(projectId, 'error', `❌ Compilación fallida: ${errorMsg}`);
        status = compilationStatus.get(projectId);
        if (status) status.isCompiling = false;
        recordVideoHistory(
          'compilation',
          project.id || 'compilacion.mp4',
          `${validation.metadata.assetCount} assets`,
          '',
          'failed',
          0,
          errorMsg
        );
      });
  } catch (error) {
    const projectId = (req.body as any)?.project?.id || 'unknown';
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    addEvent(projectId, 'error', `Error en validación: ${errorMsg}`);
    console.error('Error in compilation route:', error);
    res.status(500).json({
      error: 'Failed to validate project',
      details: errorMsg,
    });
  }
});

router.post('/from-images', async (req: Request<{}, {}, CreateFromImagesRequest>, res: Response) => {
  try {
    const { imagePaths, audioPath, options } = req.body;

    if (!imagePaths || imagePaths.length === 0) {
      return res.status(400).json({ error: 'imagePaths is required and must not be empty' });
    }

    const result = await createVideoFromImages(imagePaths, audioPath || null, options);

    res.json({
      success: true,
      video: result,
    });
  } catch (error) {
    console.error('Error creating video from images:', error);
    res.status(500).json({
      error: 'Failed to create video',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

router.post('/add-watermark', async (req: Request<{}, {}, WatermarkRequest>, res: Response) => {
  try {
    const { videoPath, watermarkPath, position = 'bottom-right', opacity = 0.8 } = req.body;

    if (!videoPath || !watermarkPath) {
      return res.status(400).json({ error: 'videoPath and watermarkPath are required' });
    }

    const outputPath = await addWatermark(videoPath, watermarkPath, { position, opacity });

    res.json({
      success: true,
      outputPath,
    });
  } catch (error) {
    console.error('Error adding watermark:', error);
    res.status(500).json({
      error: 'Failed to add watermark',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

router.post('/extract-audio', async (req: Request<{}, {}, { videoPath: string }>, res: Response) => {
  try {
    const { videoPath } = req.body;

    if (!videoPath) {
      return res.status(400).json({ error: 'videoPath is required' });
    }

    const audioPath = await extractAudioFromVideo(videoPath);

    res.json({
      success: true,
      audioPath,
    });
  } catch (error) {
    console.error('Error extracting audio:', error);
    res.status(500).json({
      error: 'Failed to extract audio',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

router.post('/metadata', async (req: Request<{}, {}, { videoPath: string }>, res: Response) => {
  try {
    const { videoPath } = req.body;

    if (!videoPath) {
      return res.status(400).json({ error: 'videoPath is required' });
    }

    const metadata = await getVideoMetadata(videoPath);

    res.json({
      success: true,
      metadata,
    });
  } catch (error) {
    console.error('Error getting metadata:', error);
    res.status(500).json({
      error: 'Failed to get metadata',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// ==================== VIDEO STRUCTURE ====================
router.post('/structure-plan', async (req: Request<{}, {}, VideoStructureConfig>, res: Response) => {
  try {
    const config = req.body;

    if (!config.totalDuration || !config.theme) {
      return res.status(400).json({
        error: 'totalDuration and theme are required',
      });
    }

    const plan = generateVideoStructure({
      totalDuration: config.totalDuration,
      aiVideoDurationMins: config.aiVideoDurationMins || 5,
      theme: config.theme,
      iaImagePercentage: config.iaImagePercentage || 40,
      stockVideoPercentage: config.stockVideoPercentage || 60,
    });

    const searchTerms = getThematicSearchTerms(config.theme);

    res.json({
      success: true,
      plan,
      searchTerms,
      instructions: {
        step1: `Search for ${plan.structure.assets[0].count} AI videos with theme: "${config.theme}"`,
        step2: `Search for ${plan.structure.assets[1].count} AI images with theme: "${config.theme}"`,
        step3: `Search for ${plan.structure.assets[2].count} Stock videos with theme: "${config.theme}"`,
      },
    });
  } catch (error) {
    console.error('Error generating video structure:', error);
    res.status(500).json({
      error: 'Failed to generate video structure',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// ==================== AUTOMATED COMPILATION ====================
router.post('/automated', async (req: Request<{}, {}, {
  stockAssets: string[];
  iaAssets: string[];
  audioPath?: string;
  config: AutomationConfig;
}>, res: Response) => {
  try {
    const { stockAssets, iaAssets, audioPath, config } = req.body;

    if (!stockAssets || !iaAssets || stockAssets.length === 0 && iaAssets.length === 0) {
      return res.status(400).json({
        error: 'stockAssets and iaAssets are required and must not be empty',
      });
    }

    if (!config) {
      return res.status(400).json({ error: 'config is required' });
    }

    // Distribuir assets según porcentajes
    const distributedAssets = distributeAssetsByPercentage(
      stockAssets,
      iaAssets,
      config.stockPercentage,
      config.videoDuration
    );

    // Crear timeline automatizada con transiciones y animaciones
    const timeline = createAutomatedTimeline(distributedAssets, config);

    // Generar comandos FFmpeg
    const ffmpegFilters = generateFFmpegCommand(timeline);

    res.json({
      success: true,
      timeline,
      ffmpegFilters,
      summary: {
        totalAssets: timeline.assets.length,
        totalDuration: timeline.totalDuration,
        stockCount: timeline.assets.filter(a => a.source === 'stock').length,
        iaCount: timeline.assets.filter(a => a.source === 'ia').length,
        transitionCount: timeline.transitions.length,
        animationCount: timeline.animations.length,
      },
    });
  } catch (error) {
    console.error('Error in automated compilation:', error);
    res.status(500).json({
      error: 'Failed to create automated timeline',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// ==================== COMPILATION MONITORING ====================
router.get('/status/:projectId', (req: Request, res: Response) => {
  const projectId = req.params.projectId;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');

  let status = compilationStatus.get(projectId);
  if (!status) {
    status = {
      isCompiling: false,
      events: [],
      currentPercent: 0,
      clients: [],
    };
    compilationStatus.set(projectId, status);
  }

  status.clients.push(res);

  // Send initial state
  res.write(
    `data: ${JSON.stringify({
      isCompiling: status.isCompiling,
      events: status.events,
      currentPercent: status.currentPercent,
      estimatedSize: status.estimatedSize,
      totalDuration: status.totalDuration,
    })}\n\n`
  );

  // Keep connection alive
  const interval = setInterval(() => {
    res.write(': heartbeat\n\n');
  }, 30000);

  req.on('close', () => {
    clearInterval(interval);
    const idx = status!.clients.indexOf(res);
    if (idx > -1) status!.clients.splice(idx, 1);
    res.end();
  });
});

export default router;
export { addEvent, compilationStatus };
