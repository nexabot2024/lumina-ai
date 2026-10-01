import { Router, Request, Response } from 'express';
import { basename } from 'path';
import {
  downloadVideo,
  downloadAudio,
  type VideoQuality,
  type AudioFormat,
} from '../services/downloaderService.js';
import { recordVideoHistory } from '../services/databaseService.js';
import { toOutputUrl } from '../services/outputStorage.js';

const router = Router();

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
  url: string;
  mode: 'video' | 'audio';
  quality?: VideoQuality;
  audioFormat?: AudioFormat;
}

router.post('/start', async (req: Request<{}, {}, StartRequestBody>, res: Response) => {
  try {
    const body = req.body;

    if (!body.url || !body.url.trim()) {
      return res.status(400).json({ error: 'url es requerido' });
    }
    if (body.mode !== 'video' && body.mode !== 'audio') {
      return res.status(400).json({ error: 'mode debe ser "video" o "audio"' });
    }

    const jobId = body.jobId;
    const job = getOrCreateJob(jobId);
    job.isProcessing = true;

    res.json({ message: 'Descarga iniciada', jobId });

    const task =
      body.mode === 'video'
        ? downloadVideo(body.url, body.quality, (type, message, percent) => addEvent(jobId, type, message, percent))
        : downloadAudio(body.url, body.audioFormat, (type, message, percent) => addEvent(jobId, type, message, percent));

    task
      .then(outputPath => {
        const j = jobs.get(jobId);
        if (j) {
          j.isProcessing = false;
          j.outputUrl = toOutputUrl(outputPath);
        }
        broadcast(jobId);
        recordVideoHistory('downloader', basename(outputPath), body.url, outputPath, 'completed', 0);
      })
      .catch(error => {
        const errorMsg = error instanceof Error ? error.message : 'Error desconocido';
        addEvent(jobId, 'error', `❌ Descarga fallida: ${errorMsg}`);
        const j = jobs.get(jobId);
        if (j) j.isProcessing = false;
        recordVideoHistory('downloader', body.url, body.url, '', 'failed', 0, errorMsg);
      });
  } catch (error) {
    console.error('Error in downloader start route:', error);
    res.status(500).json({
      error: 'Failed to start download',
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
