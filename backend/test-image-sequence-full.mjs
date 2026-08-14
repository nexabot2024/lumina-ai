import dotenv from 'dotenv';
dotenv.config({ path: './.env' });
import { readdirSync } from 'fs';
import { join } from 'path';

const { assembleImageSequence } = await import('./dist/services/clipEditingService.js');

const imageDir = 'C:\\Users\\danir\\Downloads\\G-Labs-Automation-v7.0.7\\webhook_output\\image';
const allImages = readdirSync(imageDir).filter(f => /\.(jpg|jpeg|png)$/i.test(f));
const images = allImages.map(f => join(imageDir, f));

console.log(`Probando con las ${images.length} imágenes reales, objetivo: 1 hora`);

const start = Date.now();
try {
  const out = await assembleImageSequence(
    {
      imagePaths: images,
      outputFolder: 'C:\\Users\\danir\\Videos\\prueba-1hora',
      totalDurationSeconds: 3600,
      resolution: '1080p',
    },
    (type, msg, percent) => console.log(new Date().toISOString(), type, msg, percent !== undefined ? `${Math.round(percent)}%` : '')
  );
  console.log('DONE:', out, `(${((Date.now() - start) / 60000).toFixed(1)} min)`);
} catch (e) {
  console.error('FAILED:', e.message, `(${((Date.now() - start) / 60000).toFixed(1)} min)`);
  console.error(e.stack);
}
