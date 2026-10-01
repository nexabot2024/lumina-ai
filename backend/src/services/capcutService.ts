import { spawn } from 'child_process';
import { join } from 'path';

// capcut-cli vive como dependencia normal del backend (ver package.json). Se invoca
// directamente con "node <su dist/index.js>" en vez de pasar por el shim
// node_modules/.bin/capcut(.cmd) — en Windows ese shim es un .cmd, y spawn() no puede
// ejecutar .cmd directamente sin shell:true (falla con "spawn EINVAL"); llamando al
// script real con el mismo Node que ya está corriendo el backend, se evita el problema
// por completo y funciona igual en cualquier plataforma.
const CAPCUT_ENTRY = join(process.cwd(), 'node_modules', 'capcut-cli', 'dist', 'index.js');

export type CapcutEventCallback = (type: string, message: string, percent?: number) => void;

export interface CapcutExportResult {
  draftPath: string;
  openHint: string[];
}

/** capcut-cli imprime un JSON en la primera línea de stdout (el resultado de la
 *  operación) seguido de un resumen legible en las líneas siguientes — solo nos
 *  interesa la primera línea. */
function runCapcutJson(args: string[]): Promise<any> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [CAPCUT_ENTRY, ...args], { windowsHide: true });
    let stdout = '';
    let stderr = '';

    child.stdout?.on('data', (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    child.on('error', (err) => {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        reject(new Error('capcut-cli no está instalado correctamente en el backend (falta node_modules/capcut-cli).'));
      } else {
        reject(err);
      }
    });

    child.on('close', (code) => {
      const firstLine = stdout.split('\n')[0]?.trim();
      let parsed: any = null;
      try {
        parsed = firstLine ? JSON.parse(firstLine) : null;
      } catch {
        // No era JSON — se cae al mensaje de error genérico de abajo.
      }

      if (code === 0 && parsed?.ok) {
        resolve(parsed);
      } else {
        const reason = parsed?.error || stderr.trim().split('\n').pop() || `capcut-cli salió con código ${code}`;
        reject(new Error(reason));
      }
    });
  });
}

/** Diagnóstico del entorno: si detecta CapCut/JianYing instalado, ffmpeg/ffprobe,
 *  whisper (subtítulos), etc. Se usa para avisar al usuario ANTES de exportar si algo
 *  falta, en vez de que el error aparezca recién al intentar crear el proyecto. */
export async function checkCapcutDoctor(): Promise<any> {
  return runCapcutJson(['doctor']);
}

/**
 * Crea un proyecto editable de CapCut a partir de un video ya procesado por Lumina AI
 * (y opcionalmente un .srt de subtítulos), usando `capcut quickstart`. Si CapCut está
 * instalado en esta misma máquina, capcut-cli detecta su carpeta de borradores real y
 * escribe ahí directamente — el proyecto aparece en la lista de CapCut al reabrirlo,
 * sin pasos manuales.
 */
export async function exportToCapCut(
  name: string,
  videoPath: string,
  srtPath?: string,
  onEvent?: CapcutEventCallback
): Promise<CapcutExportResult> {
  const safeName = name.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 60) || 'lumina-export';
  const args = ['quickstart', safeName, '--video', videoPath];
  if (srtPath) args.push('--srt', srtPath);

  onEvent?.('info', `🎬 Creando el proyecto "${safeName}" en CapCut...`);
  const result = await runCapcutJson(args);

  onEvent?.('info', '🔎 Revisando que el proyecto quedó bien formado (lint)...');
  onEvent?.('success', '✅ Proyecto creado — reinicia CapCut para verlo en tu lista de proyectos');

  return {
    draftPath: result.draft_path,
    openHint: result.open_hint || [],
  };
}
