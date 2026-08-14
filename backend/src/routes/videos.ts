import { Router, Request, Response } from 'express';
import {
  searchStockVideos,
  searchPixabayVideos,
  searchPexelsVideos,
  searchPixabayImages,
  searchPexelsImages,
  downloadStockVideosAuto,
} from '../services/stockService.js';
import {
  generateVideoSnapGen,
  checkSnapGenVideoStatus,
  listSnapGenVideoHistory,
  type SnapGenVideoModel,
} from '../services/snapgenService.js';

const router = Router();

// ==================== SNAPGEN VIDEO GENERATION ====================

interface GenerateVideoRequest {
  prompt: string;
  model?: SnapGenVideoModel;
  duration?: 4 | 6 | 8 | 10;
  aspectRatio?: '16:9' | '9:16';
  resolution?: '720p' | '1080p';
  referenceImages?: string[];
  outputFolder?: string;
}

router.post('/generate-veo', async (req: Request<{}, {}, GenerateVideoRequest>, res: Response) => {
  try {
    const { prompt, model, duration, aspectRatio, resolution, referenceImages, outputFolder } = req.body;

    if (!prompt) {
      return res.status(400).json({ error: 'prompt is required' });
    }

    const video = await generateVideoSnapGen(prompt, {
      model,
      duration,
      aspectRatio,
      resolution,
      referenceImages,
      outputFolder,
    });

    res.json({
      success: true,
      video,
      message: 'Video generation started. Check status using taskId.',
    });
  } catch (error) {
    console.error('Error generating video:', error);
    res.status(500).json({
      error: 'Failed to generate video',
      details: (error as Error).message,
    });
  }
});

router.get('/veo/status/:taskId', async (req: Request<{ taskId: string }>, res: Response) => {
  try {
    const { taskId } = req.params;

    if (!taskId) {
      return res.status(400).json({ error: 'taskId is required' });
    }

    const video = await checkSnapGenVideoStatus(taskId);

    if (!video) {
      return res.status(404).json({ error: 'Task not found' });
    }

    res.json({
      success: true,
      video,
    });
  } catch (error) {
    console.error('Error checking video status:', error);
    res.status(500).json({
      error: 'Failed to check video status',
      details: (error as Error).message,
    });
  }
});

router.post('/batch-veo', async (req: Request<{}, {}, { prompts: string[]; outputFolder?: string }>, res: Response) => {
  try {
    const { prompts, outputFolder } = req.body;

    if (!Array.isArray(prompts) || prompts.length === 0) {
      return res.status(400).json({ error: 'prompts must be a non-empty array' });
    }

    // SnapGen solo encola el trabajo y devuelve un taskId de inmediato,
    // así que se lanzan todos en paralelo y se generan de forma concurrente.
    const videos = await Promise.all(
      prompts.map(async (prompt) => {
        try {
          return await generateVideoSnapGen(prompt, { outputFolder });
        } catch (error) {
          console.error(`Failed to start video generation for prompt: ${prompt}`, error);
          return null;
        }
      })
    );

    res.json({
      success: true,
      count: videos.filter(Boolean).length,
      videos,
    });
  } catch (error) {
    console.error('Error starting batch video generation:', error);
    res.status(500).json({ error: 'Failed to start batch video generation' });
  }
});

router.get('/veo/tasks', async (req: Request, res: Response) => {
  try {
    const tasks = await listSnapGenVideoHistory();

    res.json({
      success: true,
      tasks,
      count: tasks.length,
    });
  } catch (error) {
    console.error('Error listing active tasks:', error);
    res.status(500).json({
      error: 'Failed to list active tasks',
      details: (error as Error).message,
    });
  }
});

// ==================== STOCK VIDEOS ====================

interface SearchStockRequest {
  keywords: string[];
  limit?: number;
  sources?: ('pixabay' | 'pexels')[];
}

interface SearchVideosRequest {
  query: string;
  source?: 'pixabay' | 'pexels' | 'both';
  limit?: number;
}

interface SearchImagesRequest {
  query: string;
  source?: 'pixabay' | 'pexels' | 'both';
  limit?: number;
}

router.post('/search-stock', async (req: Request<{}, {}, SearchStockRequest>, res: Response) => {
  try {
    const { keywords, limit = 5, sources = ['pixabay', 'pexels'] } = req.body;

    if (!Array.isArray(keywords) || keywords.length === 0) {
      return res.status(400).json({ error: 'keywords must be a non-empty array' });
    }

    const videos = await searchStockVideos(keywords, { limit, sources });

    res.json({
      success: true,
      count: videos.length,
      videos,
    });
  } catch (error) {
    console.error('Error searching stock videos:', error);
    res.status(500).json({ error: 'Failed to search stock videos' });
  }
});

router.post('/search-videos', async (req: Request<{}, {}, SearchVideosRequest>, res: Response) => {
  try {
    const { query, source = 'both', limit = 500 } = req.body;

    if (!query) {
      return res.status(400).json({ error: 'query is required' });
    }

    let videos = [];

    if (source === 'pixabay' || source === 'both') {
      const pixabayResults = await searchPixabayVideos(query, limit);
      videos.push(...pixabayResults);
    }

    if (source === 'pexels' || source === 'both') {
      const pexelsResults = await searchPexelsVideos(query, limit);
      videos.push(...pexelsResults);
    }

    res.json({
      success: true,
      count: videos.length,
      videos,
    });
  } catch (error) {
    console.error('Error searching videos:', error);
    res.status(500).json({ error: 'Failed to search videos' });
  }
});

router.post('/search-images', async (req: Request<{}, {}, SearchImagesRequest>, res: Response) => {
  try {
    const { query, source = 'both', limit = 5 } = req.body;

    if (!query) {
      return res.status(400).json({ error: 'query is required' });
    }

    let images = [];

    if (source === 'pixabay' || source === 'both') {
      const pixabayResults = await searchPixabayImages(query, limit);
      images.push(...pixabayResults);
    }

    if (source === 'pexels' || source === 'both') {
      const pexelsResults = await searchPexelsImages(query, limit);
      images.push(...pexelsResults);
    }

    res.json({
      success: true,
      count: images.length,
      images: images.slice(0, limit),
    });
  } catch (error) {
    console.error('Error searching images:', error);
    res.status(500).json({ error: 'Failed to search images' });
  }
});

// ==================== AUTO DOWNLOAD STOCK VIDEOS ====================

interface DownloadAutoRequest {
  theme: string;
  minDuration?: number;
  maxDuration?: number;
  resolution?: '720p' | '1080p' | '4k';
  quantity?: number;
  outputFolder: string;
  sources?: ('pixabay' | 'pexels')[];
}

router.post('/download-auto', async (req: Request<{}, {}, DownloadAutoRequest>, res: Response) => {
  try {
    const { theme, minDuration, maxDuration, resolution, quantity = 3, outputFolder, sources } = req.body;

    if (!theme) {
      return res.status(400).json({ error: 'theme is required' });
    }

    if (!outputFolder) {
      return res.status(400).json({ error: 'outputFolder is required' });
    }

    // Download sincronously and return results with real durations
    const results = await downloadStockVideosAuto({
      theme,
      minDuration,
      maxDuration,
      resolution,
      quantity,
      outputFolder,
      sources,
    });

    console.log(`✅ Downloaded ${results.length} videos for theme: ${theme}`);
    res.json({
      message: 'Download completed',
      status: 'success',
      results,
      count: results.length,
    });
  } catch (error) {
    console.error('Error downloading auto:', error);
    res.status(500).json({ error: 'Failed to download videos', details: error instanceof Error ? error.message : 'Unknown error' });
  }
});

export default router;
