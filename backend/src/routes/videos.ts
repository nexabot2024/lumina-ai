import { Router, Request, Response } from 'express';
import {
  searchStockVideos,
  searchPixabayVideos,
  searchPexelsVideos,
  searchPixabayImages,
  searchPexelsImages,
} from '../services/stockService.js';
import {
  generateVideoVeoLite,
  checkVideoStatus,
  listActiveTasks,
} from '../services/veoService.js';

const router = Router();

// ==================== VEO VIDEO GENERATION ====================

interface GenerateVideoRequest {
  prompt: string;
  videoLength?: 4 | 6 | 8;
  aspectRatio?: '16:9' | '9:16';
  resolution?: '720p' | '1080p';
  mode?: 'text_to_video' | 'start_image' | 'components';
  referenceImages?: string[];
}

router.post('/generate-veo', async (req: Request<{}, {}, GenerateVideoRequest>, res: Response) => {
  try {
    const { prompt, videoLength, aspectRatio, resolution, mode, referenceImages } = req.body;

    if (!prompt) {
      return res.status(400).json({ error: 'prompt is required' });
    }

    const video = await generateVideoVeoLite(prompt, {
      videoLength,
      aspectRatio,
      resolution,
      mode,
      referenceImages,
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

    const video = await checkVideoStatus(taskId);

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

router.get('/veo/tasks', async (req: Request, res: Response) => {
  try {
    const tasks = await listActiveTasks();

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
    const { query, source = 'both', limit = 5 } = req.body;

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
      videos: videos.slice(0, limit),
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

export default router;
