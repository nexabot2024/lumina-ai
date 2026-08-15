import { Router, Request, Response } from 'express';
import { join, basename } from 'path';
import { existsSync } from 'fs';
import { tmpdir } from 'os';
import { v4 as uuidv4 } from 'uuid';
import {
  assembleImageSequence,
  IMAGE_BATCH_SIZE,
  type TransitionType,
  type AnimationType,
  type ImageSequenceConfig,
} from '../services/clipEditingService.js';
import {
  recordVideoHistory,
  createImageSequenceJob,
  updateImageSequenceBatch,
  completeImageSequenceJob,
  getOrphanedImageSequenceJobs,
  getImageSequenceBatches,
} from '../services/databaseService.js';
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
  currentSeconds: number;
  totalSeconds: number;
  outputUrl?: string;
  clients: Response[];
}

const jobs = new Map<string, JobStatus>();

function getOrCreateJob(jobId: string): JobStatus {
  let job = jobs.get(jobId);
  if (!job) {
    job = { isProcessing: false, events: [], currentPercent: 0, currentSeconds: 0, totalSeconds: 0, clients: [] };
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
    currentSeconds: job.currentSeconds,
    totalSeconds: job.totalSeconds,
    outputUrl: job.outputUrl,
  };
  job.clients.forEach(client => client.write(`data: ${JSON.stringify(payload)}\n\n`));
}

function addEvent(
  jobId: string,
  type: string,
  message: string,
  percent?: number,
  extra?: { currentSeconds?: number; totalSeconds?: number }
) {
  const job = getOrCreateJob(jobId);
  job.events.push({ type, message, percent });
  if (percent !== undefined) job.currentPercent = percent;
  if (extra?.currentSeconds !== undefined) job.currentSeconds = extra.currentSeconds;
  if (extra?.totalSeconds !== undefined) job.totalSeconds = extra.totalSeconds;
  broadcast(jobId);
}

interface StartRequestBody {
  jobId: string;
  imagePaths: string[];
  outputFilename?: string;
  totalDurationSeconds?: number;
  perImageDuration?: number;
  resolution?: '720p' | '1080p' | '2k' | '4k';
  fps?: number;
  transitionTypes?: TransitionType[];
  animationTypes?: AnimationType[];
  transitionDuration?: number;
  randomMode?: boolean;
  /** Narración a incluir — la duración total ya debe calcularse para coincidir con ella. */
  audioPath?: string;
}

/**
 * Arranca (o retoma) el procesamiento de un trabajo. Se persiste a la BD ANTES de
 * empezar a renderizar, y cada lote se marca como completado ahí mismo — así, si el
 * proceso muere a mitad de camino, al reiniciar el servidor se puede reconstruir
 * exactamente qué faltaba y seguir desde ahí en vez de perder el trabajo hecho.
 */
function runImageSequenceJob(
  jobId: string,
  config: StartRequestBody,
  resolvedImagePaths: string[],
  resume?: { tempDir: string; completedBatches: Record<number, string> }
) {
  const job = getOrCreateJob(jobId);
  job.isProcessing = true;

  const tempDir =
    resume?.tempDir || join(tmpdir(), `._tmp_batches_${uuidv4().slice(0, 8)}`);
  const totalBatches = Math.ceil(resolvedImagePaths.length / IMAGE_BATCH_SIZE);

  if (!resume) {
    createImageSequenceJob(jobId, config, tempDir, totalBatches);
  }

  const fullConfig: ImageSequenceConfig = {
    imagePaths: resolvedImagePaths,
    outputFilename: config.outputFilename,
    totalDurationSeconds: config.totalDurationSeconds,
    perImageDuration: config.perImageDuration,
    resolution: config.resolution,
    fps: config.fps,
    transitionTypes: config.transitionTypes,
    animationTypes: config.animationTypes,
    transitionDuration: config.transitionDuration,
    randomMode: config.randomMode,
    resumeTempDir: tempDir,
    resumeCompletedBatches: resume?.completedBatches,
    audioPath: config.audioPath,
  };

  assembleImageSequence(
    fullConfig,
    (type, message, percent, extra) => addEvent(jobId, type, message, percent, extra),
    (batchIndex, outputPath) => updateImageSequenceBatch(jobId, batchIndex, outputPath)
  )
    .then(outputPath => {
      const j = jobs.get(jobId);
      if (j) {
        j.isProcessing = false;
        j.outputUrl = toOutputUrl(outputPath);
      }
      broadcast(jobId);
      completeImageSequenceJob(jobId);
      const duration = config.totalDurationSeconds || (config.perImageDuration || 0) * resolvedImagePaths.length;
      recordVideoHistory(
        'image-sequence',
        basename(outputPath),
        `${resolvedImagePaths.length} imágenes`,
        outputPath,
        'completed',
        Math.round(duration)
      );
    })
    .catch(error => {
      const errorMsg = error instanceof Error ? error.message : 'Error desconocido';
      addEvent(jobId, 'error', `❌ Procesamiento fallido: ${errorMsg}`);
      const j = jobs.get(jobId);
      if (j) j.isProcessing = false;
      // Fallo real de procesamiento (no un crash del servidor) — se marca completo
      // igual para que no se siga intentando "retomar" un trabajo que nunca va a
      // lograrse, y queda registrado como fallido en el historial.
      completeImageSequenceJob(jobId);
      recordVideoHistory(
        'image-sequence',
        config.outputFilename || 'secuencia-de-imagenes.mp4',
        `${resolvedImagePaths.length} imágenes`,
        '',
        'failed',
        0,
        errorMsg
      );
    });
}

// Al arrancar el backend: busca trabajos que quedaron a medias por un crash/reinicio
// (nunca se marcaron completos) y los retoma automáticamente, reutilizando los lotes
// que ya alcanzaron a renderizarse antes de que el proceso muriera.
function resumeOrphanedImageSequenceJobs() {
  const orphans = getOrphanedImageSequenceJobs();
  for (const orphan of orphans) {
    try {
      const config = JSON.parse(orphan.config) as StartRequestBody & { imagePaths: string[] };
      const batches = getImageSequenceBatches(orphan.jobId);
      const completedBatches: Record<number, string> = {};
      batches.forEach(b => {
        if (b.status === 'completed' && b.outputPath && existsSync(b.outputPath)) {
          completedBatches[b.batchIndex] = b.outputPath;
        }
      });
      console.log(
        `♻️ Retomando trabajo interrumpido de Secuencia de Imágenes: ${orphan.jobId} (${Object.keys(completedBatches).length}/${orphan.totalBatches} lotes recuperados)`
      );
      runImageSequenceJob(orphan.jobId, config, config.imagePaths, {
        tempDir: orphan.tempDir,
        completedBatches,
      });
    } catch (error) {
      console.error(`Error retomando trabajo ${orphan.jobId}:`, error);
      completeImageSequenceJob(orphan.jobId);
    }
  }
}

resumeOrphanedImageSequenceJobs();

router.post('/start', async (req: Request<{}, {}, StartRequestBody>, res: Response) => {
  try {
    const body = req.body;

    if (!body.imagePaths || body.imagePaths.length === 0) {
      return res.status(400).json({ error: 'imagePaths es requerido y no puede estar vacío' });
    }
    if (!body.totalDurationSeconds && !body.perImageDuration) {
      return res.status(400).json({ error: 'totalDurationSeconds o perImageDuration es requerido' });
    }

    const jobId = body.jobId;
    const resolvedImagePaths = body.imagePaths.map(resolveUploadPath);
    const resolvedAudioPath = body.audioPath ? resolveUploadPath(body.audioPath) : undefined;
    const missingFiles = [...resolvedImagePaths, ...(resolvedAudioPath ? [resolvedAudioPath] : [])].filter(
      p => !existsSync(p)
    );
    if (missingFiles.length > 0) {
      return res.status(400).json({ error: `Archivo(s) no encontrado(s): ${missingFiles.join(', ')}` });
    }

    res.json({ message: 'Procesamiento iniciado', jobId, totalImages: resolvedImagePaths.length });

    runImageSequenceJob(
      jobId,
      { ...body, imagePaths: resolvedImagePaths, audioPath: resolvedAudioPath } as any,
      resolvedImagePaths
    );
  } catch (error) {
    console.error('Error starting image sequence job:', error);
    res.status(500).json({
      error: 'Failed to start image sequence',
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
      currentSeconds: job.currentSeconds,
      totalSeconds: job.totalSeconds,
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
