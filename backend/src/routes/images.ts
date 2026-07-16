import { Router, Request, Response } from 'express';
import {
  generateImageDALLE,
  generateBatchImages,
} from '../services/imageService.js';
import {
  generateImageNanoBanana,
  checkImageStatus,
  generateBatchImages as generateBatchImagesNanoBanana,
} from '../services/nanobananService.js';

const router = Router();

interface GenerateImageRequest {
  prompt: string;
  service?: 'dalle' | 'stable-diffusion';
}

interface GenerateBatchRequest {
  prompts: string[];
  service?: 'dalle' | 'stable-diffusion';
}

interface GenerateNanoBananaRequest {
  prompt: string;
  model?: 'nano_banana_2' | 'nano_banana_pro';
  aspectRatio?: '1:1' | '16:9' | '9:16';
  referenceImages?: string[];
  upscale?: string[];
}

// ==================== NANOBANANA IMAGE GENERATION ====================

router.post('/generate-nanobanana', async (req: Request<{}, {}, GenerateNanoBananaRequest>, res: Response) => {
  try {
    const { prompt, model, aspectRatio, referenceImages, upscale } = req.body;

    if (!prompt) {
      return res.status(400).json({ error: 'prompt is required' });
    }

    const image = await generateImageNanoBanana(prompt, {
      model,
      aspectRatio,
      referenceImages,
      upscale,
    });

    res.json({
      success: true,
      image,
      message: 'Image generation started. Check status using taskId.',
    });
  } catch (error) {
    console.error('Error generating image with NanoBanana:', error);
    res.status(500).json({
      error: 'Failed to generate image',
      details: (error as Error).message,
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

router.post('/batch-nanobanana', async (req: Request<{}, {}, { prompts: string[]; model?: 'nano_banana_2' | 'nano_banana_pro' }>, res: Response) => {
  try {
    const { prompts, model } = req.body;

    if (!Array.isArray(prompts) || prompts.length === 0) {
      return res.status(400).json({ error: 'prompts must be a non-empty array' });
    }

    res.json({ message: 'Batch image generation started', status: 'processing' });

    generateBatchImagesNanoBanana(prompts, { model })
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

// ==================== DALLE IMAGE GENERATION ====================

router.post('/generate', async (req: Request<{}, {}, GenerateImageRequest>, res: Response) => {
  try {
    const { prompt, service = 'dalle' } = req.body;

    if (!prompt) {
      return res.status(400).json({ error: 'prompt is required' });
    }

    const image = await generateImageDALLE(prompt);

    res.json({
      success: true,
      image,
    });
  } catch (error) {
    console.error('Error generating image:', error);
    res.status(500).json({
      error: 'Failed to generate image',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

router.post('/batch', async (req: Request<{}, {}, GenerateBatchRequest>, res: Response) => {
  try {
    const { prompts, service = 'dalle' } = req.body;

    if (!Array.isArray(prompts) || prompts.length === 0) {
      return res.status(400).json({ error: 'prompts must be a non-empty array' });
    }

    res.json({ message: 'Batch generation started', status: 'processing' });

    generateBatchImages(prompts, { service })
      .then(images => {
        // Store results or notify client
        console.log(`Generated ${images.length} images`);
      })
      .catch(error => {
        console.error('Batch generation failed:', error);
      });
  } catch (error) {
    console.error('Error starting batch generation:', error);
    res.status(500).json({ error: 'Failed to start batch generation' });
  }
});

export default router;
