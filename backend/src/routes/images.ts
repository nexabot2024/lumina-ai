import { Router, Request, Response } from 'express';
import { join } from 'path';
import {
  generateImageNanoBanana,
  checkImageStatus,
  generateBatchImages as generateBatchImagesNanoBanana,
} from '../services/nanobananService.js';

const router = Router();

const uploadDirRel = process.env.UPLOAD_DIR || './uploads';
const uploadDirAbs = join(process.cwd(), uploadDirRel);

function resolveUploadPath(path: string): string {
  return path.startsWith('/uploads/') ? join(uploadDirAbs, path.replace('/uploads/', '')) : path;
}

interface GenerateNanoBananaRequest {
  prompt: string;
  model?: 'nano_banana_2' | 'nano_banana_pro';
  aspectRatio?: '1:1' | '16:9' | '9:16';
  referenceImages?: string[];
  upscale?: string[];
  outputFolder?: string;
}

// ==================== NANOBANANA IMAGE GENERATION ====================

router.post('/generate-nanobanana', async (req: Request<{}, {}, GenerateNanoBananaRequest>, res: Response) => {
  try {
    const { prompt, model, aspectRatio, referenceImages, upscale, outputFolder } = req.body;

    if (!prompt) {
      return res.status(400).json({ error: 'prompt is required' });
    }

    const image = await generateImageNanoBanana(prompt, {
      model,
      aspectRatio,
      referenceImages: referenceImages?.map(resolveUploadPath),
      upscale,
      outputFolder,
    });

    res.json({
      success: true,
      image,
      message: 'Image generation started. Check status using taskId.',
    });
  } catch (error) {
    console.error('Error generating image with NanoBanana:', error);
    const errorMessage = (error as Error).message;

    // Return 503 Service Unavailable if G-Labs is not running
    if (errorMessage.includes('G-Labs API server is not running')) {
      return res.status(503).json({
        error: 'G-Labs service unavailable',
        details: errorMessage,
        requiresSetup: true,
      });
    }

    res.status(500).json({
      error: 'Failed to generate image',
      details: errorMessage,
    });
  }
});

router.get('/nanobanana/status/:taskId', async (req: Request<{ taskId: string }>, res: Response) => {
  try {
    const { taskId } = req.params;

    if (!taskId) {
      return res.status(400).json({ error: 'taskId is required' });
    }

    const image = await checkImageStatus(taskId);

    if (!image) {
      return res.status(404).json({ error: 'Task not found' });
    }

    res.json({
      success: true,
      image,
    });
  } catch (error) {
    console.error('Error checking image status:', error);
    res.status(500).json({
      error: 'Failed to check image status',
      details: (error as Error).message,
    });
  }
});

router.post('/batch-nanobanana', async (req: Request<{}, {}, { prompts: string[]; model?: 'nano_banana_2' | 'nano_banana_pro'; outputFolder?: string; referenceImages?: string[] }>, res: Response) => {
  try {
    const { prompts, model, outputFolder, referenceImages } = req.body;

    if (!Array.isArray(prompts) || prompts.length === 0) {
      return res.status(400).json({ error: 'prompts must be a non-empty array' });
    }

    res.json({ message: 'Batch image generation started', status: 'processing' });

    generateBatchImagesNanoBanana(prompts, {
      model,
      outputFolder,
      referenceImages: referenceImages?.map(resolveUploadPath),
    })
      .then(images => {
        console.log(`Generated ${images.length} images with NanoBanana`);
      })
      .catch(error => {
        console.error('Batch generation failed:', error);
      });
  } catch (error) {
    console.error('Error starting batch image generation:', error);
    res.status(500).json({ error: 'Failed to start batch image generation' });
  }
});

export default router;
