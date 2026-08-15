import { Router, Request, Response } from 'express';
import { existsSync } from 'fs';
import { getVideoHistory } from '../services/databaseService.js';
import { OUTPUT_DIR, toOutputUrl } from '../services/outputStorage.js';

const router = Router();

// Historial unificado de las 4 herramientas que generan video (Cola de Edición,
// Secuencia de Imágenes, Compilación, Editor de Clips) — todas escriben a la misma
// tabla video_history vía recordVideoHistory(), distinguidas por "source".
router.get('/', (req: Request, res: Response) => {
  try {
    const days = req.query.days ? parseInt(req.query.days as string, 10) : 2;
    const history = getVideoHistory(days).map(entry => ({
      ...entry,
      // Entradas de antes del rediseño apuntan a una ruta en el disco del usuario,
      // no del servidor — solo se ofrece descarga cuando el archivo vive en OUTPUT_DIR.
      downloadUrl:
        entry.outputPath && entry.outputPath.startsWith(OUTPUT_DIR) && existsSync(entry.outputPath)
          ? toOutputUrl(entry.outputPath)
          : undefined,
    }));
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
