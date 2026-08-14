import { Router, Request, Response } from 'express';
import { join, basename } from 'path';
import { exec } from 'child_process';
import { existsSync } from 'fs';
import {
  assembleVideo,
  detectScenes,
  type ProcessConfig,
  type TextOverlay,
  type BackgroundMusicConfig,
  type TransitionConfig,
  type AnimationConfig,
} from '../services/clipEditingService.js';
import { parseEditingInstructions } from '../services/editingInstructionsService.js';
import { recordVideoHistory } from '../services/databaseService.js';

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
  outputFolder: string;
  outputFilename?: string;
  resolution?: '720p' | '1080p' | '2k' | '4k';
  fps?: number;
  splitScenes?: boolean;
  allowClipRepeat?: boolean;
  transitions?: TransitionConfig;
  animations?: AnimationConfig;
  maxClipDuration?: number;
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
    if (!body.outputFolder) {
      return res.status(400).json({ error: 'outputFolder es requerido' });
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

    const missingFiles = [...resolvedVideoPaths, resolvedAudioPath, resolvedBackgroundMusic?.path]
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
      outputFolder: body.outputFolder,
      outputFilename: body.outputFilename,
      resolution: body.resolution,
      fps: body.fps,
      splitScenes: body.splitScenes,
      allowClipRepeat: body.allowClipRepeat,
      transitions: body.transitions,
      animations: body.animations,
      maxClipDuration: body.maxClipDuration,
    };

    assembleVideo(config, (type, message, percent, extra) => addJobEvent(jobId, type, message, percent, extra))
      .then(outputPath => {
        const j = jobStatus.get(jobId);
        if (j) j.isProcessing = false;
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

router.get('/pick-folder', async (req: Request, res: Response) => {
  const script = `
Add-Type -AssemblyName System.Windows.Forms
$dialog = New-Object System.Windows.Forms.FolderBrowserDialog
$dialog.Description = 'Selecciona la carpeta de salida para el video final'
$result = $dialog.ShowDialog()
if ($result -eq [System.Windows.Forms.DialogResult]::OK) {
  Write-Output $dialog.SelectedPath
}
`.trim();

  const command = `powershell -NoProfile -STA -Command "${script.replace(/"/g, '\\"').replace(/\n/g, '; ')}"`;

  exec(command, { windowsHide: false }, (error, stdout) => {
    if (error) {
      return res.status(500).json({ error: 'No se pudo abrir el selector de carpetas', details: error.message });
    }

    const selectedPath = stdout.trim();
    if (!selectedPath) {
      return res.json({ success: false, cancelled: true });
    }

    res.json({ success: true, path: selectedPath });
  });
});

export default router;
