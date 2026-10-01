import { Router, Request, Response } from 'express';
import {
  searchStockVideos,
  searchPixabayVideos,
  searchPexelsVideos,
  searchPixabayImages,
  searchPexelsImages,
  downloadStockVideosAuto,
} from '../services/stockService.js';

const router = Router();

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
  resolution?: '720p' | '1080p' | '4k' | 'any';
  quantity?: number;
  sources?: ('pixabay' | 'pexels')[];
}

router.post('/download-auto', async (req: Request<{}, {}, DownloadAutoRequest>, res: Response) => {
  try {
    const { theme, minDuration, maxDuration, resolution, quantity = 3, sources } = req.body;

    if (!theme) {
      return res.status(400).json({ error: 'theme is required' });
    }

    // Download sincronously and return results with real durations
    const results = await downloadStockVideosAuto({
      theme,
      minDuration,
      maxDuration,
      resolution,
      quantity,
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
