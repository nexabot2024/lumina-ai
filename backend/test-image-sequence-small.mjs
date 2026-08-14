import dotenv from 'dotenv';
dotenv.config({ path: './.env' });
import { readdirSync } from 'fs';
import { join } from 'path';

const { assembleImageSequence } = await import('./dist/services/clipEditingService.js');

const imageDir = 'C:\\Users\\danir\\Downloads\\G-Labs-Automation-v7.0.7\\webhook_output\\image';
const allImages = readdirSync(imageDir).filter(f => /\.(jpg|jpeg|png)$/i.test(f));
const sample = allImages.slice(0, 20).map(f => join(imageDir, f));

console.log(`Probando con ${sample.length} imágenes de muestra...`);

const start = Date.now();
try {
  const out = await assembleImageSequence(
    {
      imagePaths: sample,
      outputFolder: 'uploads/test/output',
      totalDurationSeconds: 60,
      resolution: '720p',
      randomMode: true,
    },
    (type, msg) => console.log(type, msg)
  );
  console.log('DONE:', out, `(${((Date.now() - start) / 1000).toFixed(1)}s)`);
} catch (e) {
  console.error('FAILED:', e.message, `(${((Date.now() - start) / 1000).toFixed(1)}s)`);
  console.error(e.stack);
}
