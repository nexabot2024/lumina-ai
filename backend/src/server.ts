import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Cargar .env desde el directorio raíz del proyecto
const envPath = process.env.ENV_PATH || join(process.cwd(), '.env');
dotenv.config({ path: envPath });

// Log para debug
console.log(`[INIT] Loading .env from: ${envPath}`);

import express from 'express';
import cors from 'cors';
import promptRoutes from './routes/prompts.js';
import imageRoutes from './routes/images.js';
import audioRoutes from './routes/audio.js';
import videoRoutes from './routes/videos.js';
import compilationRoutes from './routes/compilation.js';
import wikimediaRoutes from './routes/wikimedia.js';
import uploadRoutes from './routes/upload.js';
import clipEditingRoutes from './routes/clipEditing.js';
import videoQueueRoutes from './routes/videoQueue.js';
import imageSequenceRoutes from './routes/imageSequence.js';
import historyRoutes from './routes/history.js';
import ingredientsRoutes from './routes/ingredients.js';

const app = express();
const PORT = process.env.PORT || 5000;

// Acepta localhost y cualquier IP de red local (LAN), para poder abrir la web
// desde otros dispositivos (ej. un Mac) en la misma red.
const LAN_ORIGIN_PATTERN = /^http:\/\/(localhost|127\.0\.0\.1|192\.168\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}):\d+$/;

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || LAN_ORIGIN_PATTERN.test(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Origen no permitido por CORS'));
    }
  },
  credentials: true,
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

app.use('/uploads', express.static(join(process.cwd(), process.env.UPLOAD_DIR || 'uploads')));

app.use('/api/prompts', promptRoutes);
app.use('/api/images', imageRoutes);
app.use('/api/audio', audioRoutes);
app.use('/api/videos', videoRoutes);
app.use('/api/compilation', compilationRoutes);
app.use('/api/wikimedia', wikimediaRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/clip-editing', clipEditingRoutes);
app.use('/api/video-queue', videoQueueRoutes);
app.use('/api/image-sequence', imageSequenceRoutes);
app.use('/api/history', historyRoutes);
app.use('/api/ingredients', ingredientsRoutes);

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Manejador de errores global: sin esto, cualquier error pasado a next() (ej. el
// fileFilter de multer rechazando un tipo de archivo) cae en el handler por defecto
// de Express, que responde con una página HTML de stack trace en vez de JSON —
// rompiendo el parseo en el frontend (axios espera JSON).
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('❌ Error no manejado en request:', err);
  if (res.headersSent) return next(err);
  res.status(400).json({ error: err.message || 'Error inesperado' });
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});

process.on('uncaughtException', (err) => {
  console.error('❌ Uncaught exception (server keeps running):', err);
});

process.on('unhandledRejection', (reason) => {
  console.error('❌ Unhandled rejection (server keeps running):', reason);
});
