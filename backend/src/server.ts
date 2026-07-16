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

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

app.use('/uploads', express.static(join(__dirname, '../uploads')));

app.use('/api/prompts', promptRoutes);
app.use('/api/images', imageRoutes);
app.use('/api/audio', audioRoutes);
app.use('/api/videos', videoRoutes);
app.use('/api/compilation', compilationRoutes);

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
