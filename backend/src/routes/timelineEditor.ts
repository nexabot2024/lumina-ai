import { Router, Request, Response } from 'express';
import { join, basename } from 'path';
import { existsSync } from 'fs';
import {
  assembleTimelineJoin,
  type TimelineClipInput,
} from '../services/clipEditingService.js';
import { recordVideoHistory } from '../services/databaseService.js';
import { toOutputUrl } from '../services/outputStorage.js';

const router = Router();

const uploadDirRel = process.env.UPLOAD_DIR || './uploads';
const uploadDirAbs = join(process.cwd(), uploadDirRel);

function resolveUploadPath(path: string): string {
  return path.startsWith('/uploads/') ? join(uploadDirAbs, path.replace('/uploads/', '')) : path;
}

interface JobStatus {
  isProcessing: boolean;
  events: Array<{ type: string; message: string; percent?: number }>;
  currentPercent: number;
  outputUrl?: string;
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
    outputUrl: job.outputUrl,
  };
  job.clients.forEach(client => client.write(`data: ${JSON.stringify(payload)}\n\n`));
}

function addEvent(jobId: string, type: string, message: string, percent?: number) {
  const job = getOrCreateJob(jobId);
  job.events.push({ type, message, percent });
  if (percent !== undefined) job.currentPercent = percent;
  broadcast(jobId);
}

interface StartRequestBody {
  jobId: string;
  clips: TimelineClipInput[];
  resolution?: '720p' | '1080p' | '2k' | '4k';
  fps?: number;
}

router.post('/process', async (req: Request<{}, {}, StartRequestBody>, res: Response) => {
  try {
    const body = req.body;

    if (!body.clips || body.clips.length === 0) {
      return res.status(400).json({ error: 'clips es requerido y no puede estar vacío' });
    }
    for (const clip of body.clips) {
      if (clip.end <= clip.start) {
        return res.status(400).json({ error: `Tramo inválido para ${clip.path}: fin debe ser mayor que inicio` });
      }
    }

    const jobId = body.jobId;
    const job = getOrCreateJob(jobId);
    job.isProcessing = true;

    res.json({ message: 'Procesamiento iniciado', jobId });

    const resolvedClips = body.clips.map(c => ({ ...c, path: resolveUploadPath(c.path) }));
    const missingFiles = resolvedClips.map(c => c.path).filter(p => !existsSync(p));
    if (missingFiles.length > 0) {
      addEvent(jobId, 'error', `❌ Archivo(s) no encontrado(s): ${missingFiles.join(', ')}`);
      job.isProcessing = false;
      return;
    }

    assembleTimelineJoin(
      { clips: resolvedClips, resolution: body.resolution, fps: body.fps },
      (type, message, percent) => addEvent(jobId, type, message, percent)
    )
      .then(outputPath => {
        const j = jobs.get(jobId);
        if (j) {
          j.isProcessing = false;
          j.outputUrl = toOutputUrl(outputPath);
        }
        broadcast(jobId);
        recordVideoHistory('clip-editing', basename(outputPath), `${resolvedClips.length} clips`, outputPath, 'completed', 0);
      })
      .catch(error => {
        const errorMsg = error instanceof Error ? error.message : 'Error desconocido';
        addEvent(jobId, 'error', `❌ Procesamiento fallido: ${errorMsg}`);
        const j = jobs.get(jobId);
        if (j) j.isProcessing = false;
        recordVideoHistory('clip-editing', 'timeline-editor.mp4', `${resolvedClips.length} clips`, '', 'failed', 0, errorMsg);
      });
  } catch (error) {
    console.error('Error in timeline-editor process route:', error);
    res.status(500).json({
      error: 'Failed to start processing',
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
      outputUrl: job.outputUrl,
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
