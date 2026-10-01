import { Router, Request, Response } from 'express';
import { join } from 'path';
import { exportToCapCut, checkCapcutDoctor } from '../services/capcutService.js';
import { OUTPUT_DIR } from '../services/outputStorage.js';

const router = Router();

const uploadDirRel = process.env.UPLOAD_DIR || './uploads';
const uploadDirAbs = join(process.cwd(), uploadDirRel);

// El frontend maneja archivos como rutas servidas por HTTP (/uploads/... o
// /outputs/..., ver videoQueue.ts para el mismo patrón) — capcut-cli necesita la ruta
// real en disco.
function resolveUploadPath(path: string): string {
  if (path.startsWith('/uploads/')) return join(uploadDirAbs, path.replace('/uploads/', ''));
  if (path.startsWith('/outputs/')) return join(OUTPUT_DIR, decodeURIComponent(path.replace('/outputs/', '')));
  return path;
}

interface JobStatus {
  isProcessing: boolean;
  events: Array<{ type: string; message: string; percent?: number }>;
  currentPercent: number;
  draftPath?: string;
  openHint?: string[];
  clients: Response[];
}

const jobs = new Map<string, JobStatus>();

function getOrCreateJob(jobId: string): JobStatus {
  let job = jobs.get(jobId);
  if (!job) {
    job = { isProcessing: false, events: [], currentPercent: 0, clients: [] };
    jobs.set(jobId, job);
  }
  return job;
}

function broadcast(jobId: string) {
  const job = jobs.get(jobId);
  if (!job) return;
  const payload = {
    isCompiling: job.isProcessing,
    events: job.events,
    currentPercent: job.currentPercent,
    draftPath: job.draftPath,
    openHint: job.openHint,
  };
  job.clients.forEach(client => client.write(`data: ${JSON.stringify(payload)}\n\n`));
}

function addEvent(jobId: string, type: string, message: string, percent?: number) {
  const job = getOrCreateJob(jobId);
  job.events.push({ type, message, percent });
  if (percent !== undefined) job.currentPercent = percent;
  broadcast(jobId);
}

/** Diagnóstico rápido: si CapCut/JianYing, ffmpeg y whisper están disponibles en esta
 *  máquina — se consulta al entrar a la sección, antes de intentar exportar nada. */
router.get('/doctor', async (_req: Request, res: Response) => {
  try {
    const result = await checkCapcutDoctor();
    res.json(result);
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Error desconocido',
    });
  }
});

interface ExportRequestBody {
  jobId: string;
  name: string;
  videoPath: string;
  srtPath?: string;
}

router.post('/export', async (req: Request<{}, {}, ExportRequestBody>, res: Response) => {
  try {
    const body = req.body;

    if (!body.videoPath) {
      return res.status(400).json({ error: 'videoPath es requerido' });
    }

    const jobId = body.jobId;
    const job = getOrCreateJob(jobId);
    job.isProcessing = true;

    res.json({ message: 'Exportación a CapCut iniciada', jobId });

    exportToCapCut(
      body.name || 'lumina-export',
      resolveUploadPath(body.videoPath),
      body.srtPath ? resolveUploadPath(body.srtPath) : undefined,
      (type, message, percent) => addEvent(jobId, type, message, percent)
    )
      .then(result => {
        const j = jobs.get(jobId);
        if (j) {
          j.isProcessing = false;
          j.draftPath = result.draftPath;
          j.openHint = result.openHint;
        }
        broadcast(jobId);
      })
      .catch(error => {
        const errorMsg = error instanceof Error ? error.message : 'Error desconocido';
        addEvent(jobId, 'error', `❌ Exportación fallida: ${errorMsg}`);
        const j = jobs.get(jobId);
        if (j) j.isProcessing = false;
      });
  } catch (error) {
    console.error('Error in capcut export route:', error);
    res.status(500).json({
      error: 'Failed to start CapCut export',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

router.get('/status/:jobId', (req: Request, res: Response) => {
  const jobId = req.params.jobId;
  const job = getOrCreateJob(jobId);

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');

  job.clients.push(res);

  res.write(
    `data: ${JSON.stringify({
      isCompiling: job.isProcessing,
      events: job.events,
      currentPercent: job.currentPercent,
      draftPath: job.draftPath,
      openHint: job.openHint,
    })}\n\n`
  );

  const interval = setInterval(() => res.write(': heartbeat\n\n'), 30000);

  req.on('close', () => {
    clearInterval(interval);
    const idx = job.clients.indexOf(res);
    if (idx > -1) job.clients.splice(idx, 1);
    res.end();
  });
});

export default router;
