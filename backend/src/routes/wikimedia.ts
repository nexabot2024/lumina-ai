import { Router, Request, Response } from 'express';
import {
  searchWikimediaCommons,
  searchWikimediaImages,
  searchWikimediaVideos,
  searchWikimediaAudio,
  getWikimediaAssetDetails,
  type WikimediaSearchOptions,
} from '../services/wikimediaService.js';

const router = Router();

// ==================== WIKIMEDIA COMMONS ====================

router.get('/search', async (req: Request<{}, {}, {}, WikimediaSearchOptions>, res: Response) => {
  try {
    const { query, type = 'all', limit = 20, offset = 0, sortBy = 'relevance' } = req.query as any;

    if (!query) {
      return res.status(400).json({ error: 'query parameter is required' });
    }

    const results = await searchWikimediaCommons({
      query,
      type,
      limit: parseInt(limit) || 20,
      offset: parseInt(offset) || 0,
      sortBy,
    });

    res.json({
      success: true,
      query,
      type,
      count: results.length,
      results,
    });
  } catch (error) {
    console.error('Error searching Wikimedia:', error);
    res.status(500).json({
      error: 'Failed to search Wikimedia Commons',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

router.get('/images', async (req: Request<{}, {}, {}, { query: string; limit?: string }>, res: Response) => {
  try {
    const { query, limit = '20' } = req.query;

    if (!query) {
      return res.status(400).json({ error: 'query parameter is required' });
    }

    const results = await searchWikimediaImages(query as string, parseInt(limit) || 20);

    res.json({
      success: true,
      type: 'image',
      query,
      count: results.length,
      results,
    });
  } catch (error) {
    console.error('Error searching Wikimedia images:', error);
    res.status(500).json({
      error: 'Failed to search Wikimedia images',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

router.get('/videos', async (req: Request<{}, {}, {}, { query: string; limit?: string }>, res: Response) => {
  try {
    const { query, limit = '20' } = req.query;

    if (!query) {
      return res.status(400).json({ error: 'query parameter is required' });
    }

    const results = await searchWikimediaVideos(query as string, parseInt(limit) || 20);

    res.json({
      success: true,
      type: 'video',
      query,
      count: results.length,
      results,
    });
  } catch (error) {
    console.error('Error searching Wikimedia videos:', error);
    res.status(500).json({
      error: 'Failed to search Wikimedia videos',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

router.get('/audio', async (req: Request<{}, {}, {}, { query: string; limit?: string }>, res: Response) => {
  try {
    const { query, limit = '20' } = req.query;

    if (!query) {
      return res.status(400).json({ error: 'query parameter is required' });
    }

    const results = await searchWikimediaAudio(query as string, parseInt(limit) || 20);

    res.json({
      success: true,
      type: 'audio',
      query,
      count: results.length,
      results,
    });
  } catch (error) {
    console.error('Error searching Wikimedia audio:', error);
    res.status(500).json({
      error: 'Failed to search Wikimedia audio',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

router.get('/details/:title', async (req: Request<{ title: string }>, res: Response) => {
  try {
    const { title } = req.params;

    if (!title) {
      return res.status(400).json({ error: 'title parameter is required' });
    }

    const asset = await getWikimediaAssetDetails(title);

    if (!asset) {
      return res.status(404).json({ error: 'Asset not found' });
    }

    res.json({
      success: true,
      asset,
    });
  } catch (error) {
    console.error('Error getting Wikimedia asset details:', error);
    res.status(500).json({
      error: 'Failed to get asset details',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

export default router;
