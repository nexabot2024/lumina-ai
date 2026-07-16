import { Router, Request, Response } from 'express';
import {
  compileVideo,
  createVideoFromImages,
  addWatermark,
  extractAudioFromVideo,
  getVideoMetadata,
  validateVideoAssets,
  type VideoProject,
  type CompilationOptions,
} from '../services/videoCompilationService.js';

const router = Router();

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

    // Validate assets
    const validationErrors = validateVideoAssets(project.assets);
    if (validationErrors.length > 0) {
      return res.status(400).json({ errors: validationErrors });
    }

    res.json({ message: 'Compilation started', projectId: project.id });

    // Compile in background
    compileVideo(project, options)
      .then(outputPath => {
        console.log(`✅ Compilation complete: ${outputPath}`);
      })
      .catch(error => {
        console.error(`❌ Compilation failed: ${error.message}`);
      });
  } catch (error) {
    console.error('Error in compilation route:', error);
    res.status(500).json({
      error: 'Failed to compile video',
      details: error instanceof Error ? error.message : 'Unknown error',
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

export default router;
