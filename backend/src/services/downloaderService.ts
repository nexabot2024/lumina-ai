import { spawn } from 'child_process';
import { dirname, join } from 'path';
import { v4 as uuidv4 } from 'uuid';
import { OUTPUT_DIR } from './outputStorage.js';

const YTDLP_PATH = process.env.YTDLP_PATH || 'yt-dlp';
const FFMPEG_DIR = process.env.FFMPEG_PATH ? dirname(process.env.FFMPEG_PATH) : undefined;

export type VideoQuality = '480p' | '720p' | '1080p' | '2160p';
export type AudioFormat = 'mp3' | 'm4a' | 'wav' | 'flac' | 'opus' | 'vorbis';

const QUALITY_HEIGHT: Record<VideoQuality, number> = {
  '480p': 480,
  '720p': 720,
  '1080p': 1080,
  '2160p': 2160,
};

export type DownloaderEventCallback = (type: string, message: string, percent?: number) => void;

/** Corre yt-dlp y reporta el progreso ("[download]  45.2% of ...") a través de onEvent. */
function runYtDlp(args: string[], onEvent?: DownloaderEventCallback): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(YTDLP_PATH, args, { windowsHide: true });
    let stderrOutput = '';

    child.stdout?.on('data', (chunk: Buffer) => {
      const text = chunk.toString();
      const match = text.match(/\[download\]\s+([\d.]+)%/);
      if (match) {
        onEvent?.('progress', `⬇️ Descargando... ${match[1]}%`, parseFloat(match[1]));
      } else if (text.includes('[Merger]') || text.includes('[ExtractAudio]')) {
        onEvent?.('info', '🎧 Procesando archivo final...');
      }
    });

    child.stderr?.on('data', (chunk: Buffer) => {
      stderrOutput += chunk.toString();
    });

    child.on('error', (err) => {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        reject(new Error('yt-dlp no está instalado o no se encuentra en el PATH del sistema.'));
      } else {
        reject(err);
      }
    });

    child.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(stderrOutput.trim().split('\n').pop() || `yt-dlp salió con código ${code}`));
      }
    });
  });
}

export async function downloadVideo(
  url: string,
  quality: VideoQuality = '1080p',
  onEvent?: DownloaderEventCallback
): Promise<string> {
  const height = QUALITY_HEIGHT[quality];
  const outputId = `download-${uuidv4()}`;
  const outputPath = join(OUTPUT_DIR, `${outputId}.mp4`);

  // Se prefiere explícitamente H.264 (avc1): YouTube casi siempre ofrece AV1 como
  // "mejor" calidad, y esta app no tiene forma de decodificar AV1 por hardware en este
  // equipo (probado: falla tanto QSV como NVDEC/CUVID) — descargar AV1 obliga a una
  // pre-conversión por software que puede tardar más de 10 minutos en un video largo.
  // Si no hay avc1 disponible en esa resolución, cae de vuelta a "lo mejor que haya".
  //
  // El filtro "height<=N" asume video horizontal: en video vertical (TikTok/Instagram
  // Reels) el lado largo es el "height" real (p.ej. 1280 en un 720p vertical), así que
  // ese filtro nunca matchea y sin un fallback final la descarga fallaba con
  // "Requested format is not available". Se agrega un "/best" final sin restricción de
  // altura como red de seguridad para esos formatos ya muxeados.
  const args = [
    url,
    '-f',
    `bestvideo[vcodec^=avc1][height<=${height}]+bestaudio[acodec^=mp4a]/bestvideo[vcodec^=avc1][height<=${height}]+bestaudio/bestvideo[height<=${height}]+bestaudio/best[height<=${height}]/best`,
    '--merge-output-format', 'mp4',
    '--no-playlist',
    '-o', outputPath,
  ];
  if (FFMPEG_DIR) args.push('--ffmpeg-location', FFMPEG_DIR);

  onEvent?.('info', `⬇️ Descargando video (máx. ${quality})...`);
  await runYtDlp(args, onEvent);
  onEvent?.('success', '✅ Descarga completada');
  return outputPath;
}

export async function downloadAudio(
  url: string,
  format: AudioFormat = 'mp3',
  onEvent?: DownloaderEventCallback
): Promise<string> {
  const outputId = `download-${uuidv4()}`;
  const outputPath = join(OUTPUT_DIR, `${outputId}.${format}`);

  const args = [
    url,
    '-x',
    '--audio-format', format,
    '--no-playlist',
    '-o', outputPath,
  ];
  if (FFMPEG_DIR) args.push('--ffmpeg-location', FFMPEG_DIR);

  onEvent?.('info', `⬇️ Descargando audio (${format})...`);
  await runYtDlp(args, onEvent);
  onEvent?.('success', '✅ Descarga completada');
  return outputPath;
}
