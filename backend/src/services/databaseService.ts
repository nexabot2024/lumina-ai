import Database from 'better-sqlite3';
import { join } from 'path';
import { existsSync, mkdirSync } from 'fs';

const dbDir = join(process.cwd(), '.db');
const dbPath = join(dbDir, 'lumina.db');

if (!existsSync(dbDir)) {
  mkdirSync(dbDir, { recursive: true });
}

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');

export interface QueueItemRecord {
  id: string;
  queueId: string;
  videoPath: string;
  videoName: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  outputPath?: string;
  error?: string;
  createdAt: number;
  startedAt?: number;
  completedAt?: number;
}

export type VideoHistorySource = 'queue' | 'image-sequence' | 'compilation' | 'clip-editing';

export interface VideoHistoryRecord {
  id: string;
  source: VideoHistorySource;
  videoName: string;
  inputPath: string;
  outputPath: string;
  status: 'completed' | 'failed';
  duration: number;
  createdAt: number;
  completedAt: number;
  error?: string;
}

export function initializeDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS queue_items (
      id TEXT PRIMARY KEY,
      queueId TEXT NOT NULL,
      videoPath TEXT NOT NULL,
      videoName TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      outputPath TEXT,
      error TEXT,
      createdAt INTEGER NOT NULL,
      startedAt INTEGER,
      completedAt INTEGER,
      FOREIGN KEY (queueId) REFERENCES queues(id)
    );

    CREATE TABLE IF NOT EXISTS queues (
      id TEXT PRIMARY KEY,
      outputFolder TEXT NOT NULL,
      maxClipDuration INTEGER,
      splitScenes INTEGER NOT NULL DEFAULT 0,
      createdAt INTEGER NOT NULL,
      completedAt INTEGER
    );

    CREATE TABLE IF NOT EXISTS video_history (
      id TEXT PRIMARY KEY,
      source TEXT NOT NULL DEFAULT 'queue',
      videoName TEXT NOT NULL,
      inputPath TEXT NOT NULL,
      outputPath TEXT NOT NULL,
      status TEXT NOT NULL,
      duration INTEGER NOT NULL,
      createdAt INTEGER NOT NULL,
      completedAt INTEGER NOT NULL,
      error TEXT
    );

    CREATE TABLE IF NOT EXISTS image_sequence_jobs (
      jobId TEXT PRIMARY KEY,
      config TEXT NOT NULL,
      tempDir TEXT NOT NULL,
      totalBatches INTEGER NOT NULL,
      createdAt INTEGER NOT NULL,
      completedAt INTEGER
    );

    CREATE TABLE IF NOT EXISTS image_sequence_batches (
      id TEXT PRIMARY KEY,
      jobId TEXT NOT NULL,
      batchIndex INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      outputPath TEXT,
      FOREIGN KEY (jobId) REFERENCES image_sequence_jobs(jobId)
    );

    CREATE TABLE IF NOT EXISTS ingredients (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      imagePaths TEXT NOT NULL,
      createdAt INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_queue_items_queueId ON queue_items(queueId);
    CREATE INDEX IF NOT EXISTS idx_video_history_createdAt ON video_history(createdAt);
    CREATE INDEX IF NOT EXISTS idx_image_sequence_batches_jobId ON image_sequence_batches(jobId);
  `);

  // Migración: bases de datos creadas antes de que existiera "source" no tienen la
  // columna — se agrega aparte porque SQLite no soporta "ADD COLUMN IF NOT EXISTS".
  try {
    db.exec(`ALTER TABLE video_history ADD COLUMN source TEXT NOT NULL DEFAULT 'queue'`);
  } catch {
    // La columna ya existe — nada que hacer.
  }
}

export function createQueue(
  queueId: string,
  outputFolder: string,
  maxClipDuration?: number,
  splitScenes: boolean = false
) {
  const stmt = db.prepare(`
    INSERT INTO queues (id, outputFolder, maxClipDuration, splitScenes, createdAt)
    VALUES (?, ?, ?, ?, ?)
  `);
  stmt.run(queueId, outputFolder, maxClipDuration || null, splitScenes ? 1 : 0, Date.now());
}

export function addQueueItem(
  queueId: string,
  videoPath: string,
  videoName: string,
  itemId: string
) {
  const stmt = db.prepare(`
    INSERT INTO queue_items (id, queueId, videoPath, videoName, status, createdAt)
    VALUES (?, ?, ?, ?, 'pending', ?)
  `);
  stmt.run(itemId, queueId, videoPath, videoName, Date.now());
}

export function updateQueueItemStatus(
  itemId: string,
  status: 'pending' | 'processing' | 'completed' | 'failed',
  outputPath?: string,
  error?: string
) {
  const now = Date.now();
  const stmt = db.prepare(`
    UPDATE queue_items
    SET status = ?, outputPath = ?, error = ?, startedAt = CASE WHEN startedAt IS NULL AND ? = 'processing' THEN ? ELSE startedAt END, completedAt = CASE WHEN ? IN ('completed', 'failed') THEN ? ELSE completedAt END
    WHERE id = ?
  `);
  stmt.run(status, outputPath || null, error || null, status, now, status, now, itemId);
}

export function recordVideoHistory(
  source: VideoHistorySource,
  videoName: string,
  inputPath: string,
  outputPath: string,
  status: 'completed' | 'failed',
  duration: number,
  error?: string
) {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const now = Date.now();
  const stmt = db.prepare(`
    INSERT INTO video_history (id, source, videoName, inputPath, outputPath, status, duration, createdAt, completedAt, error)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  stmt.run(id, source, videoName, inputPath, outputPath, status, duration, now, now, error || null);
}

export function getVideoHistory(daysBack: number = 2): VideoHistoryRecord[] {
  const cutoffTime = Date.now() - daysBack * 24 * 60 * 60 * 1000;
  const stmt = db.prepare(`
    SELECT * FROM video_history
    WHERE createdAt >= ?
    ORDER BY createdAt DESC
  `);
  return stmt.all(cutoffTime) as VideoHistoryRecord[];
}

export function getQueueHistory(queueId: string): QueueItemRecord[] {
  const stmt = db.prepare(`
    SELECT * FROM queue_items
    WHERE queueId = ?
    ORDER BY createdAt DESC
  `);
  return stmt.all(queueId) as QueueItemRecord[];
}

export function getQueueState(queueId: string) {
  const stmt = db.prepare(`
    SELECT * FROM queues WHERE id = ?
  `);
  return stmt.get(queueId);
}

export function completeQueue(queueId: string) {
  const stmt = db.prepare(`
    UPDATE queues SET completedAt = ? WHERE id = ?
  `);
  stmt.run(Date.now(), queueId);
}

// Cola de Edición sin completar cuando arrancó el servidor: quedó a medias porque el
// proceso murió (crash/reinicio), no porque haya terminado. Se usa al iniciar el
// backend para retomar donde se quedó en vez de perder el trabajo hecho.
export function getOrphanedQueues(): Array<{
  id: string;
  outputFolder: string;
  maxClipDuration: number | null;
  splitScenes: number;
}> {
  const stmt = db.prepare(`
    SELECT id, outputFolder, maxClipDuration, splitScenes FROM queues WHERE completedAt IS NULL
  `);
  return stmt.all() as any;
}

export function getQueueItemsInOrder(queueId: string): QueueItemRecord[] {
  const stmt = db.prepare(`
    SELECT * FROM queue_items WHERE queueId = ? ORDER BY createdAt ASC
  `);
  return stmt.all(queueId) as QueueItemRecord[];
}

// === Secuencia de Imágenes: seguimiento de lotes para poder retomar tras un reinicio ===
// Cada trabajo se divide en lotes (ver IMAGE_BATCH_SIZE en clipEditingService); cada
// lote renderizado queda como un .mp4 temporal en tempDir. Si el proceso muere a mitad
// de camino, esos archivos sobreviven en disco — al reiniciar, se reutilizan los lotes
// ya hechos y solo se vuelven a renderizar los que faltaban.
export interface ImageSequenceJobRecord {
  jobId: string;
  config: string;
  tempDir: string;
  totalBatches: number;
  createdAt: number;
  completedAt: number | null;
}

export interface ImageSequenceBatchRecord {
  jobId: string;
  batchIndex: number;
  status: 'pending' | 'completed';
  outputPath: string | null;
}

export function createImageSequenceJob(jobId: string, config: unknown, tempDir: string, totalBatches: number) {
  const stmt = db.prepare(`
    INSERT INTO image_sequence_jobs (jobId, config, tempDir, totalBatches, createdAt)
    VALUES (?, ?, ?, ?, ?)
  `);
  stmt.run(jobId, JSON.stringify(config), tempDir, totalBatches, Date.now());
}

export function updateImageSequenceBatch(jobId: string, batchIndex: number, outputPath: string) {
  const stmt = db.prepare(`
    INSERT INTO image_sequence_batches (id, jobId, batchIndex, status, outputPath)
    VALUES (?, ?, ?, 'completed', ?)
    ON CONFLICT(id) DO UPDATE SET status = 'completed', outputPath = excluded.outputPath
  `);
  stmt.run(`${jobId}-batch-${batchIndex}`, jobId, batchIndex, outputPath);
}

export function completeImageSequenceJob(jobId: string) {
  const stmt = db.prepare(`UPDATE image_sequence_jobs SET completedAt = ? WHERE jobId = ?`);
  stmt.run(Date.now(), jobId);
}

export function getOrphanedImageSequenceJobs(): ImageSequenceJobRecord[] {
  const stmt = db.prepare(`SELECT * FROM image_sequence_jobs WHERE completedAt IS NULL`);
  return stmt.all() as ImageSequenceJobRecord[];
}

export function getImageSequenceBatches(jobId: string): ImageSequenceBatchRecord[] {
  const stmt = db.prepare(`
    SELECT jobId, batchIndex, status, outputPath FROM image_sequence_batches
    WHERE jobId = ? ORDER BY batchIndex ASC
  `);
  return stmt.all(jobId) as ImageSequenceBatchRecord[];
}

// === Ingredientes (estilo Google Flow): un personaje/estilo reutilizable, guardado
// una vez con nombre + una o más imágenes de referencia, para elegirlo en cualquier
// generación posterior sin volver a subir los archivos cada vez ===
export interface IngredientRecord {
  id: string;
  name: string;
  imagePaths: string; // JSON string, se parsea en la capa de ruta
  createdAt: number;
}

export function createIngredient(id: string, name: string, imagePaths: string[]) {
  const stmt = db.prepare(`
    INSERT INTO ingredients (id, name, imagePaths, createdAt) VALUES (?, ?, ?, ?)
  `);
  stmt.run(id, name, JSON.stringify(imagePaths), Date.now());
}

export function getIngredients(): IngredientRecord[] {
  const stmt = db.prepare(`SELECT * FROM ingredients ORDER BY createdAt DESC`);
  return stmt.all() as IngredientRecord[];
}

export function deleteIngredient(id: string) {
  const stmt = db.prepare(`DELETE FROM ingredients WHERE id = ?`);
  stmt.run(id);
}

export { db };
