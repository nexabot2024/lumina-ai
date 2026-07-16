import { Router, Request, Response } from 'express';
import {
  generateImageDALLE,
  generateBatchImages,
} from '../services/imageService.js';

const router = Router();

interface GenerateImageRequest {
  prompt: string;
  service?: 'dalle' | 'stable-diffusion';
}

interface GenerateBatchRequest {
  prompts: string[];
  service?: 'dalle' | 'stable-diffusion';
}

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
