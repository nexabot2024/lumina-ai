import { Router, Request, Response } from 'express';
import { join, basename } from 'path';
import { existsSync } from 'fs';
import {
  assembleVideo,
  assembleProductSegments,
  detectScenes,
  type ProcessConfig,
  type TextOverlay,
  type BackgroundMusicConfig,
  type TransitionConfig,
  type AnimationConfig,
  type ProductSegmentInput,
} from '../services/clipEditingService.js';
import { parseEditingInstructions } from '../services/editingInstructionsService.js';
import { recordVideoHistory } from '../services/databaseService.js';
import { OUTPUT_DIR, toOutputUrl } from '../services/outputStorage.js';

const router = Router();

const uploadDirRel = process.env.UPLOAD_DIR || './uploads';
const uploadDirAbs = join(process.cwd(), uploadDirRel);

// Además de rutas subidas por el usuario (/uploads/...), acepta resultados de otras
// herramientas del sistema (/outputs/...) — ej. el rough cut del Editor de Línea de
// Tiempo pasado directo a esta herramienta.
function resolveUploadPath(path: string): string {
  if (path.startsWith('/uploads/')) return join(uploadDirAbs, path.replace('/uploads/', ''));
  if (path.startsWith('/outputs/')) return join(OUTPUT_DIR, decodeURIComponent(path.replace('/outputs/', '')));
  return path;
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

const jobStatus = new Map<string, JobStatus>();

function getOrCreateJob(jobId: string): JobStatus {
  let job = jobStatus.get(jobId);
  if (!job) {
    job = { isProcessing: false, events: [], currentPercent: 0, currentSeconds: 0, totalSeconds: 0, clients: [] };
    jobStatus.set(jobId, job);
  }
  return job;
}

function broadcast(jobId: string) {
  const job = jobStatus.get(jobId);
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

function addJobEvent(
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

interface ProcessRequestBody {
  jobId: string;
  videoPaths: string[];
  splicePoints?: number[];
  sourceTypes?: Array<'video' | 'image'>;
  imageDurations?: number[];
  audioPath: string;
  subtitles: boolean;
  backgroundMusic?: BackgroundMusicConfig;
  textOverlays?: TextOverlay[];
  outputFilename?: string;
  resolution?: '720p' | '1080p' | '2k' | '4k';
  fps?: number;
  splitScenes?: boolean;
  allowClipRepeat?: boolean;
  fullShuffle?: boolean;
  transitions?: TransitionConfig;
  animations?: AnimationConfig;
  maxClipDuration?: number;
  complementaryPaths?: string[];
  complementarySourceTypes?: Array<'video' | 'image'>;
  complementaryImageDurations?: number[];
}

router.post('/process', async (req: Request<{}, {}, ProcessRequestBody>, res: Response) => {
  try {
    const body = req.body;

    if (!body.videoPaths || body.videoPaths.length === 0) {
      return res.status(400).json({ error: 'videoPaths es requerido y no puede estar vacío' });
    }
    if (!body.audioPath) {
      return res.status(400).json({ error: 'audioPath es requerido' });
    }

    const jobId = body.jobId;
    const job = getOrCreateJob(jobId);
    job.isProcessing = true;

    res.json({ message: 'Procesamiento iniciado', jobId });

    const resolvedVideoPaths = body.videoPaths.map(resolveUploadPath);
    const resolvedAudioPath = resolveUploadPath(body.audioPath);
    const resolvedBackgroundMusic = body.backgroundMusic?.path
      ? { ...body.backgroundMusic, path: resolveUploadPath(body.backgroundMusic.path) }
      : body.backgroundMusic;
    const resolvedComplementaryPaths = (body.complementaryPaths || []).map(resolveUploadPath);

    const missingFiles = [...resolvedVideoPaths, resolvedAudioPath, resolvedBackgroundMusic?.path, ...resolvedComplementaryPaths]
      .filter((p): p is string => !!p)
      .filter(p => !existsSync(p));

    if (missingFiles.length > 0) {
      addJobEvent(jobId, 'error', `❌ Archivo(s) no encontrado(s): ${missingFiles.join(', ')}`);
      job.isProcessing = false;
      return;
    }

    const config: ProcessConfig = {
      videoPaths: resolvedVideoPaths,
      splicePoints: body.splicePoints || [],
      sourceTypes: body.sourceTypes,
      imageDurations: body.imageDurations,
      audioPath: resolvedAudioPath,
      subtitles: body.subtitles,
      backgroundMusic: resolvedBackgroundMusic,
      textOverlays: body.textOverlays || [],
      outputFilename: body.outputFilename,
      resolution: body.resolution,
      fps: body.fps,
      splitScenes: body.splitScenes,
      allowClipRepeat: body.allowClipRepeat,
      fullShuffle: body.fullShuffle,
      transitions: body.transitions,
      animations: body.animations,
      maxClipDuration: body.maxClipDuration,
      complementaryPaths: resolvedComplementaryPaths,
      complementarySourceTypes: body.complementarySourceTypes,
      complementaryImageDurations: body.complementaryImageDurations,
    };

    assembleVideo(config, (type, message, percent, extra) => addJobEvent(jobId, type, message, percent, extra))
      .then(outputPath => {
        const j = jobStatus.get(jobId);
        if (j) {
          j.isProcessing = false;
          j.outputUrl = toOutputUrl(outputPath);
        }
        broadcast(jobId);
        recordVideoHistory(
          'clip-editing',
          basename(outputPath),
          `${resolvedVideoPaths.length} clips`,
          outputPath,
          'completed',
          0
        );
      })
      .catch(error => {
        const errorMsg = error instanceof Error ? error.message : 'Error desconocido';
        addJobEvent(jobId, 'error', `❌ Procesamiento fallido: ${errorMsg}`);
        const j = jobStatus.get(jobId);
        if (j) j.isProcessing = false;
        recordVideoHistory(
          'clip-editing',
          body.outputFilename || 'editor-de-clips.mp4',
          `${resolvedVideoPaths.length} clips`,
          '',
          'failed',
          0,
          errorMsg
        );
      });
  } catch (error) {
    console.error('Error in clip-editing process route:', error);
    res.status(500).json({
      error: 'Failed to start processing',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

interface ProcessSegmentsRequestBody {
  jobId: string;
  videoPath: string;
  audioPath: string;
  segments: ProductSegmentInput[];
  outputFilename?: string;
  resolution?: '720p' | '1080p' | '2k' | '4k';
  fps?: number;
  animations?: AnimationConfig;
  splitScenes?: boolean;
}

router.post('/process-segments', async (req: Request<{}, {}, ProcessSegmentsRequestBody>, res: Response) => {
  try {
    const body = req.body;

    if (!body.videoPath) {
      return res.status(400).json({ error: 'videoPath es requerido' });
    }
    if (!body.audioPath) {
      return res.status(400).json({ error: 'audioPath es requerido' });
    }
    if (!body.segments || body.segments.length === 0) {
      return res.status(400).json({ error: 'segments es requerido y no puede estar vacío' });
    }

    const jobId = body.jobId;
    const job = getOrCreateJob(jobId);
    job.isProcessing = true;

    res.json({ message: 'Procesamiento iniciado', jobId });

    const resolvedVideoPath = resolveUploadPath(body.videoPath);
    const resolvedAudioPath = resolveUploadPath(body.audioPath);
    const resolvedSegments = body.segments.map(seg => ({
      ...seg,
      imagePaths: (seg.imagePaths || []).map(resolveUploadPath),
    }));

    const missingFiles = [resolvedVideoPath, resolvedAudioPath, ...resolvedSegments.flatMap(s => s.imagePaths || [])]
      .filter(p => !existsSync(p));

    if (missingFiles.length > 0) {
      addJobEvent(jobId, 'error', `❌ Archivo(s) no encontrado(s): ${missingFiles.join(', ')}`);
      job.isProcessing = false;
      return;
    }

    assembleProductSegments(
      {
        videoPath: resolvedVideoPath,
        audioPath: resolvedAudioPath,
        segments: resolvedSegments,
        outputFilename: body.outputFilename,
        resolution: body.resolution,
        fps: body.fps,
        animations: body.animations,
        splitScenes: body.splitScenes,
      },
      (type, message, percent, extra) => addJobEvent(jobId, type, message, percent, extra)
    )
      .then(outputPath => {
        const j = jobStatus.get(jobId);
        if (j) {
          j.isProcessing = false;
          j.outputUrl = toOutputUrl(outputPath);
        }
        broadcast(jobId);
        recordVideoHistory(
          'clip-editing',
          basename(outputPath),
          `${resolvedSegments.length} productos`,
          outputPath,
          'completed',
          0
        );
      })
      .catch(error => {
        const errorMsg = error instanceof Error ? error.message : 'Error desconocido';
        addJobEvent(jobId, 'error', `❌ Procesamiento fallido: ${errorMsg}`);
        const j = jobStatus.get(jobId);
        if (j) j.isProcessing = false;
        recordVideoHistory(
          'clip-editing',
          body.outputFilename || 'por-producto.mp4',
          `${resolvedSegments.length} productos`,
          '',
          'failed',
          0,
          errorMsg
        );
      });
  } catch (error) {
    console.error('Error in clip-editing process-segments route:', error);
    res.status(500).json({
      error: 'Failed to start processing',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

router.get('/status/:jobId', (req: Request, res: Response) => {
  const jobId = req.params.jobId;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');

  const job = getOrCreateJob(jobId);
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

router.post('/detect-scenes', async (req: Request<{}, {}, { videoPath: string }>, res: Response) => {
  try {
    const { videoPath } = req.body;
    if (!videoPath) {
      return res.status(400).json({ error: 'videoPath es requerido' });
    }

    const boundaries = await detectScenes(videoPath);
    res.json({ success: true, boundaries, count: boundaries.length });
  } catch (error) {
    console.error('Error detecting scenes:', error);
    res.status(500).json({
      error: 'Failed to detect scenes',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

router.post('/parse-instructions', async (req: Request<{}, {}, { instructions: string; knownDurationSeconds?: number }>, res: Response) => {
  try {
    const { instructions, knownDurationSeconds } = req.body;
    if (!instructions || !instructions.trim()) {
      return res.status(400).json({ error: 'instructions es requerido' });
    }

    const config = await parseEditingInstructions(instructions, { knownDurationSeconds });
    res.json({ success: true, config });
  } catch (error) {
    console.error('Error parsing editing instructions:', error);
    res.status(500).json({
      error: 'Failed to parse instructions',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

export default router;
