import { Router, Request, Response } from 'express';
import { join, basename } from 'path';
import { existsSync } from 'fs';
import { reorderVideoOnly } from '../services/clipEditingService.js';
import {
  initializeDatabase,
  createQueue,
  addQueueItem,
  updateQueueItemStatus,
  recordVideoHistory,
  getVideoHistory,
  getQueueHistory,
  getQueueItemsInOrder,
  getOrphanedQueues,
  completeQueue,
} from '../services/databaseService.js';
import { v4 as uuidv4 } from 'uuid';

initializeDatabase();

const router = Router();

const uploadDirRel = process.env.UPLOAD_DIR || './uploads';
const uploadDirAbs = join(process.cwd(), uploadDirRel);

function resolveUploadPath(path: string): string {
  return path.startsWith('/uploads/') ? join(uploadDirAbs, path.replace('/uploads/', '')) : path;
}

type ItemStatus = 'pending' | 'processing' | 'completed' | 'failed';

interface QueueItem {
  path: string;
  name: string;
  status: ItemStatus;
  outputPath?: string;
  error?: string;
  /** Narración opcional para sincronizar con este video específico. */
  audioPath?: string;
}

interface QueueState {
  isProcessing: boolean;
  items: QueueItem[];
  currentIndex: number;
  currentPercent: number;
  currentSeconds: number;
  totalSeconds: number;
  events: Array<{ type: string; message: string; percent?: number }>;
  outputFolder: string;
  maxClipDuration?: number;
  splitScenes: boolean;
  clients: Response[];
}

const queues = new Map<string, QueueState>();

function broadcast(queueId: string) {
  const q = queues.get(queueId);
  if (!q) return;
  const payload = {
    isProcessing: q.isProcessing,
    items: q.items,
    currentIndex: q.currentIndex,
    currentPercent: q.currentPercent,
    currentSeconds: q.currentSeconds,
    totalSeconds: q.totalSeconds,
    events: q.events,
  };
  q.clients.forEach(client => client.write(`data: ${JSON.stringify(payload)}\n\n`));
}

function addEvent(
  queueId: string,
  type: string,
  message: string,
  percent?: number,
  extra?: { currentSeconds?: number; totalSeconds?: number }
) {
  const q = queues.get(queueId);
  if (!q) return;
  q.events.push({ type, message, percent });
  if (percent !== undefined) q.currentPercent = percent;
  if (extra?.currentSeconds !== undefined) q.currentSeconds = extra.currentSeconds;
  if (extra?.totalSeconds !== undefined) q.totalSeconds = extra.totalSeconds;
  broadcast(queueId);
}

async function processQueue(queueId: string) {
  const q = queues.get(queueId);
  if (!q) return;

  q.isProcessing = true;
  broadcast(queueId);

  for (let i = 0; i < q.items.length; i++) {
    // Al retomar un trabajo interrumpido, los ítems que ya se habían completado antes
    // del crash quedan marcados así desde que se reconstruye el QueueState — se
    // saltan en vez de reprocesarlos.
    if (q.items[i].status === 'completed') continue;

    q.currentIndex = i;
    q.currentPercent = 0;
    q.items[i].status = 'processing';
    const itemId = `${queueId}-item-${i}`;
    addEvent(queueId, 'info', `▶️ Procesando ${q.items[i].name} (${i + 1}/${q.items.length})`);
    updateQueueItemStatus(itemId, 'processing');

    try {
      const outputPath = await reorderVideoOnly(
        q.items[i].path,
        q.outputFolder,
        { maxClipDuration: q.maxClipDuration, splitScenes: q.splitScenes, audioPath: q.items[i].audioPath },
        (type, message, percent, extra) => addEvent(queueId, type, message, percent, extra)
      );
      q.items[i].status = 'completed';
      q.items[i].outputPath = outputPath;
      updateQueueItemStatus(itemId, 'completed', outputPath);
      recordVideoHistory('queue', q.items[i].name, q.items[i].path, outputPath, 'completed', 0);
    } catch (error) {
      q.items[i].status = 'failed';
      q.items[i].error = error instanceof Error ? error.message : 'Error desconocido';
      addEvent(queueId, 'error', `❌ Falló ${q.items[i].name}: ${q.items[i].error}`);
      updateQueueItemStatus(itemId, 'failed', undefined, q.items[i].error);
      recordVideoHistory('queue', q.items[i].name, q.items[i].path, '', 'failed', 0, q.items[i].error);
    }

    broadcast(queueId);
  }

  q.isProcessing = false;
  completeQueue(queueId);
  const completedCount = q.items.filter(i => i.status === 'completed').length;
  const failedCount = q.items.filter(i => i.status === 'failed').length;
  addEvent(
    queueId,
    'success',
    `✅ Cola completa: ${completedCount} lograron procesarse, ${failedCount} fallaron`,
    100
  );
}

// Al arrancar el backend: reconstruye en memoria cualquier cola que quedó a medias
// por un crash/reinicio (nunca se marcó completa) y sigue procesando desde el primer
// ítem no completado — los que ya habían terminado no se vuelven a tocar.
function resumeOrphanedQueues() {
  const orphans = getOrphanedQueues();
  for (const orphan of orphans) {
    const dbItems = getQueueItemsInOrder(orphan.id);
    if (dbItems.length === 0) continue;

    const items: QueueItem[] = dbItems.map(item => ({
      path: item.videoPath,
      name: item.videoName,
      // Un ítem que quedó "processing" cuando murió el proceso no terminó de verdad
      // (el ffmpeg de ese video se cortó a medias) — se reintenta desde cero.
      status: item.status === 'completed' ? 'completed' : 'pending',
      outputPath: item.status === 'completed' ? item.outputPath : undefined,
    }));

    const completedCount = items.filter(i => i.status === 'completed').length;
    console.log(
      `♻️ Retomando Cola de Edición interrumpida: ${orphan.id} (${completedCount}/${items.length} videos ya estaban listos)`
    );

    const queue: QueueState = {
      isProcessing: false,
      items,
      currentIndex: -1,
      currentPercent: 0,
      currentSeconds: 0,
      totalSeconds: 0,
      events: [],
      outputFolder: orphan.outputFolder,
      maxClipDuration: orphan.maxClipDuration ?? undefined,
      splitScenes: !!orphan.splitScenes,
      clients: [],
    };
    queues.set(orphan.id, queue);

    processQueue(orphan.id).catch(error => {
      console.error(`Error retomando cola ${orphan.id}:`, error);
      const q = queues.get(orphan.id);
      if (q) q.isProcessing = false;
    });
  }
}

resumeOrphanedQueues();

interface QueueVideoInput {
  videoPath: string;
  /** Narración opcional para sincronizar con este video en particular. */
  audioPath?: string;
}

interface StartQueueBody {
  queueId: string;
  videos: QueueVideoInput[];
  outputFolder: string;
  maxClipDuration?: number;
  splitScenes?: boolean;
}

router.post('/start', async (req: Request<{}, {}, StartQueueBody>, res: Response) => {
  try {
    const { queueId, videos, outputFolder, maxClipDuration, splitScenes } = req.body;

    if (!videos || videos.length === 0) {
      return res.status(400).json({ error: 'videos es requerido y no puede estar vacío' });
    }
    if (!outputFolder) {
      return res.status(400).json({ error: 'outputFolder es requerido' });
    }

    const resolvedItems = videos.map(v => ({
      path: resolveUploadPath(v.videoPath),
      audioPath: v.audioPath ? resolveUploadPath(v.audioPath) : undefined,
    }));
    const missingFiles = resolvedItems
      .flatMap(item => [item.path, item.audioPath])
      .filter((p): p is string => !!p && !existsSync(p));
    if (missingFiles.length > 0) {
      return res.status(400).json({ error: `Archivo(s) no encontrado(s): ${missingFiles.join(', ')}` });
    }

    const queue: QueueState = {
      isProcessing: false,
      items: resolvedItems.map(item => ({
        path: item.path,
        name: basename(item.path),
        status: 'pending',
        audioPath: item.audioPath,
      })),
      currentIndex: -1,
      currentPercent: 0,
      currentSeconds: 0,
      totalSeconds: 0,
      events: [],
      outputFolder,
      maxClipDuration: maxClipDuration || undefined,
      splitScenes: splitScenes ?? true,
      clients: [],
    };
    queues.set(queueId, queue);

    createQueue(queueId, outputFolder, maxClipDuration, splitScenes ?? true);
    queue.items.forEach((item, idx) => {
      const itemId = `${queueId}-item-${idx}`;
      addQueueItem(queueId, item.path, item.name, itemId);
    });

    res.json({ message: 'Cola iniciada', queueId, totalItems: queue.items.length });

    processQueue(queueId).catch(error => {
      console.error('Error processing queue:', error);
      addEvent(queueId, 'error', `❌ Error inesperado en la cola: ${error instanceof Error ? error.message : 'desconocido'}`);
      const q = queues.get(queueId);
      if (q) q.isProcessing = false;
    });
  } catch (error) {
    console.error('Error starting queue:', error);
    res.status(500).json({
      error: 'Failed to start queue',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

router.get('/status/:queueId', (req: Request, res: Response) => {
  const queueId = req.params.queueId;
  const q = queues.get(queueId);

  if (!q) {
    res.status(404).end();
    return;
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');

  q.clients.push(res);

  res.write(
    `data: ${JSON.stringify({
      isProcessing: q.isProcessing,
      items: q.items,
      currentIndex: q.currentIndex,
      currentPercent: q.currentPercent,
      currentSeconds: q.currentSeconds,
      totalSeconds: q.totalSeconds,
      events: q.events,
    })}\n\n`
  );

  const interval = setInterval(() => res.write(': heartbeat\n\n'), 30000);

  req.on('close', () => {
    clearInterval(interval);
    const idx = q.clients.indexOf(res);
    if (idx > -1) q.clients.splice(idx, 1);
    res.end();
  });
});

router.get('/history', (req: Request, res: Response) => {
  try {
    const days = parseInt(req.query.days as string) || 2;
    const history = getVideoHistory(days);
    res.json({ history, daysBack: days });
  } catch (error) {
    console.error('Error fetching history:', error);
    res.status(500).json({
      error: 'Failed to fetch history',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

router.get('/history/:queueId', (req: Request, res: Response) => {
  try {
    const queueId = req.params.queueId;
    const history = getQueueHistory(queueId);
    res.json({ queueId, items: history });
  } catch (error) {
    console.error('Error fetching queue history:', error);
    res.status(500).json({
      error: 'Failed to fetch queue history',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

export default router;
