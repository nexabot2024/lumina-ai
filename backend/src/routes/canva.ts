import { Router, Request, Response } from 'express';
import ffmpeg from 'fluent-ffmpeg';
import {
  buildAuthorizationUrl,
  handleAuthorizationCallback,
  isCanvaConnected,
  disconnectCanva,
  listDesigns,
  importDesign,
} from '../services/canvaService.js';

const router = Router();

function getMediaDuration(filePath: string): Promise<number> {
  return new Promise(resolve => {
    ffmpeg.ffprobe(filePath, (err, metadata) => {
      if (err) return resolve(0);
      resolve(Math.round((metadata.format?.duration || 0) * 10) / 10);
    });
  });
}

router.get('/status', (_req: Request, res: Response) => {
  res.json({ connected: isCanvaConnected() });
});

router.get('/auth', (_req: Request, res: Response) => {
  try {
    const url = buildAuthorizationUrl();
    res.redirect(url);
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Error desconocido' });
  }
});

router.get('/callback', async (req: Request, res: Response) => {
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
  const { code, state, error } = req.query;

  if (error) {
    return res.redirect(`${frontendUrl}/?canva=error&message=${encodeURIComponent(String(error))}`);
  }
  if (typeof code !== 'string' || typeof state !== 'string') {
    return res.redirect(`${frontendUrl}/?canva=error&message=${encodeURIComponent('Faltan parámetros de Canva')}`);
  }

  try {
    await handleAuthorizationCallback(code, state);
    res.redirect(`${frontendUrl}/?canva=connected`);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error desconocido';
    res.redirect(`${frontendUrl}/?canva=error&message=${encodeURIComponent(message)}`);
  }
});

router.post('/disconnect', (_req: Request, res: Response) => {
  disconnectCanva();
  res.json({ success: true });
});

router.get('/designs', async (req: Request, res: Response) => {
  try {
    const continuation = typeof req.query.continuation === 'string' ? req.query.continuation : undefined;
    const result = await listDesigns(continuation);
    res.json(result);
  } catch (error) {
    console.error('Error listando diseños de Canva:', error);
    res.status(500).json({ error: error instanceof Error ? error.message : 'Error desconocido' });
  }
});

interface ImportRequestBody {
  title: string;
  format?: 'png' | 'jpg' | 'pdf' | 'mp4';
}

router.post('/designs/:id/import', async (req: Request<{ id: string }, {}, ImportRequestBody>, res: Response) => {
  try {
    const { id } = req.params;
    const { title, format } = req.body;

    const result = await importDesign(id, title || id, format || 'png');
    const fileType = result.filename.endsWith('.mp4') ? 'video' : 'image';
    const duration = fileType === 'video' ? await getMediaDuration(result.fullPath) : undefined;

    res.json({
      success: true,
      file: {
        name: title || result.filename,
        type: fileType,
        path: result.path,
        filename: result.filename,
        duration,
      },
    });
  } catch (error) {
    console.error('Error importando diseño de Canva:', error);
    res.status(500).json({ error: error instanceof Error ? error.message : 'Error desconocido' });
  }
});

export default router;
