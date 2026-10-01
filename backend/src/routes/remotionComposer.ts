import { Router, Request, Response } from 'express';
import multer from 'multer';
import { join, basename } from 'path';
import { existsSync, promises as fs } from 'fs';
import {
  assembleImageSequence,
  prepareDesagrupadoVideoItem,
  generateImageDurations,
  type TransitionType,
  type AnimationType,
  type SequenceItem,
  type TextOverlayItem,
  type ShapeOverlayItem,
} from '../services/clipEditingService.js';
import { renderWithRemotion, type RemotionSequenceItemInput } from '../services/remotionService.js';
import { recordVideoHistory } from '../services/databaseService.js';
import { toOutputUrl } from '../services/outputStorage.js';
import { parseInstructionsFile, type ParsedInstruction } from '../services/instructionsParser.js';

const router = Router();

const uploadDirRel = process.env.UPLOAD_DIR || './uploads';
const uploadDirAbs = join(process.cwd(), uploadDirRel);

function resolveUploadPath(path: string): string {
  return path.startsWith('/uploads/') ? join(uploadDirAbs, path.replace('/uploads/', '')) : path;
}

// Instrucciones de edición (.json) — se guardan en el mismo uploadDir que el resto de
// archivos (ver upload.ts) para que /start pueda releerlas server-side por su ruta. Los
// navegadores no son consistentes con el mimetype de .json (a veces "application/json", a
// veces "text/plain" u "octet-stream") — se valida por extensión, la fuente de verdad real.
const instructionsUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDirAbs),
    filename: (req, file, cb) => cb(null, `instrucciones-${Date.now()}-${Buffer.from(file.originalname, 'latin1').toString('utf8')}`),
  }),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ok = file.originalname.toLowerCase().endsWith('.json');
    if (ok) cb(null, true);
    else cb(new Error('Las instrucciones de edición deben ser un archivo .json'));
  },
});

router.post('/parse-instructions', instructionsUpload.single('file'), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    const buffer = await fs.readFile(req.file.path);
    const result = parseInstructionsFile(buffer);
    res.json({ ...result, instructionsPath: `/uploads/${basename(req.file.path)}` });
  } catch (error) {
    res.status(500).json({
      error: 'No se pudo parsear el archivo de instrucciones',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/** 1-based (como en el archivo de instrucciones, "item 1") → índice 0-based en `items`. */
function itemArrayIndex(oneBasedIndex: number, itemCount: number): number | null {
  const idx = oneBasedIndex - 1;
  return idx >= 0 && idx < itemCount ? idx : null;
}

/** Aplica las instrucciones parseadas a la lista de items y produce el mapa de
 * transitionOverrides — mismo "pre-procesado antes de cualquiera de los dos motores" que ya
 * usa prepareDesagrupadoVideoItem para "desagrupar". Índices fuera de rango o transiciones no
 * consecutivas se reportan como aviso (no abortan el resto del job). */
function applyInstructions(
  items: { path: string; type: 'image' | 'video'; animationOverride?: AnimationType; textOverlays: TextOverlayItem[]; shapeOverlays: ShapeOverlayItem[] }[],
  instructions: ParsedInstruction[],
  onEvent?: (type: string, message: string, percent?: number) => void
): Record<number, TransitionType> {
  const transitionOverrides: Record<number, TransitionType> = {};
  for (const instr of instructions) {
    if (instr.kind === 'transicion') {
      if (instr.toItemIndex !== instr.fromItemIndex + 1) {
        onEvent?.('warning', `⚠️ Instrucción de transición (#${instr.line}): "item ${instr.fromItemIndex}->${instr.toItemIndex}" no son items consecutivos, se ignora`);
        continue;
      }
      const fromIdx = itemArrayIndex(instr.fromItemIndex, items.length);
      if (fromIdx === null || fromIdx >= items.length - 1) {
        onEvent?.('warning', `⚠️ Instrucción de transición (#${instr.line}): item ${instr.fromItemIndex} fuera de rango, se ignora`);
        continue;
      }
      transitionOverrides[fromIdx] = instr.transition;
      continue;
    }

    const idx = itemArrayIndex(instr.itemIndex, items.length);
    if (idx === null) {
      onEvent?.('warning', `⚠️ Instrucción (#${instr.line}): item ${instr.itemIndex} fuera de rango, se ignora`);
      continue;
    }

    if (instr.kind === 'zoom') {
      items[idx].animationOverride = instr.animation;
    } else if (instr.kind === 'texto') {
      items[idx].textOverlays.push({
        text: instr.text,
        startSec: instr.startSec,
        endSec: instr.endSec,
        position: instr.position,
        fontSize: instr.fontSize,
      });
    } else if (instr.kind === 'forma') {
      items[idx].shapeOverlays.push({
        shape: 'rectangulo',
        startSec: instr.startSec,
        endSec: instr.endSec,
        position: instr.position,
        color: instr.color,
      });
    }
  }
  return transitionOverrides;
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
  engine: 'ffmpeg' | 'remotion';
  items: { path: string; type: 'image' | 'video'; splitScenes?: boolean }[];
  outputFilename?: string;
  totalDurationSeconds?: number;
  perImageDuration?: number;
  resolution?: '720p' | '1080p' | '2k' | '4k';
  fps?: number;
  transitionTypes?: TransitionType[];
  animationTypes?: AnimationType[];
  transitionDuration?: number;
  randomMode?: boolean;
  audioPath?: string;
  /** Al desagrupar un item de video (ver items[].splitScenes), mezcla sus fragmentos por
   * todo ese video en vez de solo intercambiar vecinos — mismo criterio que Cola de
   * Edición/Editor de Clips. */
  fullShuffle?: boolean;
  /** Ruta (/uploads/...) del archivo de instrucciones ya subido vía /parse-instructions —
   * si viene, se re-parsea server-side (barato, es solo texto) y se aplica a los items
   * antes de llamar a cualquiera de los dos motores. */
  instructionsPath?: string;
}

router.post('/start', async (req: Request<{}, {}, StartRequestBody>, res: Response) => {
  try {
    const body = req.body;

    if (!body.items || body.items.length === 0) {
      return res.status(400).json({ error: 'items es requerido y no puede estar vacío' });
    }
    if (!body.totalDurationSeconds && !body.perImageDuration) {
      return res.status(400).json({ error: 'totalDurationSeconds o perImageDuration es requerido' });
    }
    if (body.engine !== 'ffmpeg' && body.engine !== 'remotion') {
      return res.status(400).json({ error: 'engine debe ser "ffmpeg" o "remotion"' });
    }

    const jobId = body.jobId;
    const resolvedItemPaths = body.items.map(i => resolveUploadPath(i.path));
    const resolvedAudioPath = body.audioPath ? resolveUploadPath(body.audioPath) : undefined;
    const missingFiles = [...resolvedItemPaths, ...(resolvedAudioPath ? [resolvedAudioPath] : [])].filter(
      p => !existsSync(p)
    );
    if (missingFiles.length > 0) {
      return res.status(400).json({ error: `Archivo(s) no encontrado(s): ${missingFiles.join(', ')}` });
    }

    const job = getOrCreateJob(jobId);
    job.isProcessing = true;

    res.json({ message: 'Procesamiento iniciado', jobId });

    const onEvent = (type: string, message: string, percent?: number) => addEvent(jobId, type, message, percent);
    const fullShuffle = body.fullShuffle ?? false;

    // Duración por item calculada UNA sola vez aquí (misma fórmula que usa cada motor
    // internamente) — se necesita de antemano para "desagrupar" un item de video a la
    // duración exacta que le toca, y se le pasa explícita a cualquiera de los dos motores
    // para que no la recalculen (en modo aleatorio, recalcularla daría otro resultado).
    const transitionDuration = body.transitionDuration ?? 0.6;
    const rawTargetTotal =
      body.perImageDuration !== undefined
        ? body.perImageDuration * body.items.length
        : body.totalDurationSeconds ?? body.items.length * 5;
    const estimatedShrinkage = Math.max(0, body.items.length - 1) * transitionDuration;
    const itemDurationsSeconds = generateImageDurations(
      body.items.length,
      rawTargetTotal + estimatedShrinkage,
      body.randomMode ?? false
    );

    (async () => {
      // Rutas temporales de items "desagrupados" (ver prepareDesagrupadoVideoItem) — se
      // borran al terminar, éxito o fallo, sean o no el resultado final del job.
      const desagrupadoPaths: string[] = [];
      try {
        const preparedResolvedPaths = [...resolvedItemPaths];
        const preparedRawPaths = body.items.map(i => i.path);

        for (let i = 0; i < body.items.length; i++) {
          const item = body.items[i];
          if (item.type !== 'video' || !item.splitScenes) continue;
          const desagrupadoPath = await prepareDesagrupadoVideoItem(
            resolvedItemPaths[i],
            itemDurationsSeconds[i],
            fullShuffle,
            onEvent
          );
          desagrupadoPaths.push(desagrupadoPath);
          preparedResolvedPaths[i] = desagrupadoPath;
          preparedRawPaths[i] = toOutputUrl(desagrupadoPath);
        }

        // Instrucciones de edición desde archivo (sin IA, ver instructionsParser.ts) — se
        // re-parsea server-side (barato, es solo texto) y se aplica a los items ANTES de
        // llamar a cualquiera de los dos motores, mismo criterio que "desagrupar" arriba.
        const preparedItems = body.items.map((item, i) => ({
          path: preparedRawPaths[i],
          resolvedPath: preparedResolvedPaths[i],
          type: item.type,
          animationOverride: undefined as AnimationType | undefined,
          textOverlays: [] as TextOverlayItem[],
          shapeOverlays: [] as ShapeOverlayItem[],
        }));
        let transitionOverrides: Record<number, TransitionType> = {};
        if (body.instructionsPath) {
          const instructionsAbsPath = resolveUploadPath(body.instructionsPath);
          if (existsSync(instructionsAbsPath)) {
            const buffer = await fs.readFile(instructionsAbsPath);
            const { instructions, errors } = parseInstructionsFile(buffer);
            for (const err of errors) {
              onEvent('warning', `⚠️ Instrucciones (#${err.line}): ${err.message}`);
            }
            transitionOverrides = applyInstructions(preparedItems, instructions, onEvent);
            onEvent('info', `📝 ${instructions.length} instrucción(es) de edición aplicadas`);
          } else {
            onEvent('warning', `⚠️ No se encontró el archivo de instrucciones: ${body.instructionsPath}`);
          }
        }

        // Los dos motores reciben la MISMA configuración (items/duración/transiciones/
        // animaciones) — solo cambia cómo se renderiza. Remotion sirve los archivos vía
        // HTTP desde este mismo backend (ver remotionService.ts), así que usa las rutas
        // /uploads/.../outputs/... tal cual; FFmpeg trabaja directo sobre el disco.
        const outputPath =
          body.engine === 'remotion'
            ? await renderWithRemotion(
                {
                  items: preparedItems.map((item): RemotionSequenceItemInput => ({
                    path: item.path,
                    type: item.type,
                    animationOverride: item.animationOverride,
                    textOverlays: item.textOverlays.length ? item.textOverlays : undefined,
                    shapeOverlays: item.shapeOverlays.length ? item.shapeOverlays : undefined,
                  })),
                  outputFilename: body.outputFilename,
                  totalDurationSeconds: body.totalDurationSeconds,
                  perImageDuration: body.perImageDuration,
                  resolution: body.resolution,
                  fps: body.fps,
                  transitionTypes: body.transitionTypes as any,
                  animationTypes: body.animationTypes as any,
                  transitionDuration: body.transitionDuration,
                  randomMode: body.randomMode,
                  audioPath: body.audioPath,
                  explicitDurationsSeconds: itemDurationsSeconds,
                  transitionOverrides: transitionOverrides as any,
                },
                onEvent
              )
            : await assembleImageSequence(
                {
                  items: preparedItems.map((item): SequenceItem => ({
                    path: item.resolvedPath,
                    type: item.type,
                    animationOverride: item.animationOverride,
                    textOverlays: item.textOverlays.length ? item.textOverlays : undefined,
                    shapeOverlays: item.shapeOverlays.length ? item.shapeOverlays : undefined,
                  })),
                  outputFilename: body.outputFilename,
                  totalDurationSeconds: body.totalDurationSeconds,
                  perImageDuration: body.perImageDuration,
                  resolution: body.resolution,
                  fps: body.fps,
                  transitionTypes: body.transitionTypes,
                  animationTypes: body.animationTypes,
                  transitionDuration: body.transitionDuration,
                  randomMode: body.randomMode,
                  audioPath: resolvedAudioPath,
                  explicitDurationsSeconds: itemDurationsSeconds,
                  transitionOverrides,
                },
                onEvent
              );

        const j = jobs.get(jobId);
        if (j) {
          j.isProcessing = false;
          j.outputUrl = toOutputUrl(outputPath);
        }
        broadcast(jobId);
        recordVideoHistory(
          'remotion-composer',
          basename(outputPath),
          `${body.items.length} elementos (${body.engine})`,
          outputPath,
          'completed',
          0
        );
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Error desconocido';
        addEvent(jobId, 'error', `❌ Procesamiento fallido: ${errorMsg}`);
        const j = jobs.get(jobId);
        if (j) j.isProcessing = false;
        recordVideoHistory(
          'remotion-composer',
          body.outputFilename || 'composicion.mp4',
          `${body.items.length} elementos (${body.engine})`,
          '',
          'failed',
          0,
          errorMsg
        );
      } finally {
        for (const p of desagrupadoPaths) await fs.unlink(p).catch(() => {});
      }
    })();
  } catch (error) {
    console.error('Error starting remotion-composer job:', error);
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
