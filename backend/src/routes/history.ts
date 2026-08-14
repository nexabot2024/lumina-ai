import { Router, Request, Response } from 'express';
import { getVideoHistory } from '../services/databaseService.js';

const router = Router();

// Historial unificado de las 4 herramientas que generan video (Cola de Edición,
// Secuencia de Imágenes, Compilación, Editor de Clips) — todas escriben a la misma
// tabla video_history vía recordVideoHistory(), distinguidas por "source".
router.get('/', (req: Request, res: Response) => {
  try {
    const days = req.query.days ? parseInt(req.query.days as string, 10) : 2;
    const history = getVideoHistory(days);
    res.json({ history, daysBack: days });
  } catch (error) {
    console.error('Error fetching unified history:', error);
    res.status(500).json({
      error: 'Failed to fetch history',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

export default router;
