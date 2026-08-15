import { existsSync, mkdirSync } from 'fs';
import { join } from 'path';

const uploadDirRel = process.env.UPLOAD_DIR || './uploads';
const uploadDirAbs = join(process.cwd(), uploadDirRel);

// Carpeta fija en el servidor donde se guardan todos los videos/imágenes generados.
// Antes el usuario elegía una carpeta de su disco local (solo funcionaba cuando el
// backend corría en su propio PC); ahora el backend puede vivir en un VPS remoto,
// así que el resultado siempre se escribe aquí y se sirve por HTTP para que el
// navegador lo descargue, sin importar en qué máquina corra el servidor.
export const OUTPUT_DIR = join(uploadDirAbs, 'outputs');

if (!existsSync(OUTPUT_DIR)) {
  mkdirSync(OUTPUT_DIR, { recursive: true });
}

/** Convierte una ruta absoluta dentro de OUTPUT_DIR en una URL servida por el backend. */
export function toOutputUrl(absolutePath: string): string {
  const filename = absolutePath.split(/[\\/]/).pop() || '';
  return `/outputs/${encodeURIComponent(filename)}`;
}
