import ffmpeg from 'fluent-ffmpeg';
import { v4 as uuidv4 } from 'uuid';
import { existsSync, writeFileSync } from 'fs';
import { promises as fs } from 'fs';
import { join } from 'path';

// Configure FFmpeg path if it exists locally
const ffmpegPath = process.env.FFMPEG_PATH || 'C:\\ffmpeg\\bin\\ffmpeg.exe';
const ffprobePath = process.env.FFPROBE_PATH || 'C:\\ffmpeg\\bin\\ffprobe.exe';

if (existsSync(ffmpegPath)) {
  ffmpeg.setFfmpegPath(ffmpegPath);
}
if (existsSync(ffprobePath)) {
  ffmpeg.setFfprobePath(ffprobePath);
}

export interface VideoAsset {
  type: 'image' | 'video' | 'audio';
  path: string;
  duration?: number;
  startTime?: number;
  transition?: string;
  transitionDuration?: number;
}

export interface VideoProject {
  id: string;
  title: string;
  assets: VideoAsset[];
  audioTracks: string[];
  fps: number;
  width: number;
  height: number;
  outputPath: string;
}

export interface CompilationOptions {
  fps?: number;
  resolution?: '720p' | '1080p' | '2k' | '4k';
  bitrate?: string;
  audioVolume?: number;
  effects?: 'none' | 'basic' | 'advanced';
}

const RESOLUTION_MAP = {
  '720p': { width: 1280, height: 720 },
  '1080p': { width: 1920, height: 1080 },
  '2k': { width: 2560, height: 1440 },
  '4k': { width: 3840, height: 2160 },
};

interface PreValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  metadata: {
    totalDuration: number;
    estimatedSize: number;
    assetCount: number;
  };
}

async function getFileMetadata(filePath: string): Promise<any> {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err, data) => {
      if (err) reject(err);
      else resolve(data);
    });
  });
}

export async function preValidateProject(
  project: VideoProject,
  options: CompilationOptions = {}
): Promise<PreValidationResult> {
  const errors: string[] = [];
  const warnings: string[] = [];
  let totalDuration = 0;
  let estimatedSize = 0;

  const uploadDirRel = process.env.UPLOAD_DIR || './uploads';
  const uploadDir = join(process.cwd(), uploadDirRel);

  // 1. Validar que FFmpeg/ffprobe existen
  if (!existsSync(ffmpegPath)) {
    errors.push(`FFmpeg no encontrado en: ${ffmpegPath}`);
  }
  if (!existsSync(ffprobePath)) {
    errors.push(`ffprobe no encontrado en: ${ffprobePath}`);
  }

  // 2. Validar assets
  for (let i = 0; i < project.assets.length; i++) {
    const asset = project.assets[i];
    const absolutePath = asset.path.startsWith('/uploads/')
      ? join(uploadDir, asset.path.replace('/uploads/', ''))
      : asset.path;

    if (!existsSync(absolutePath)) {
      errors.push(`Asset ${i}: Archivo no encontrado: ${absolutePath}`);
      continue;
    }

    try {
      const metadata = await getFileMetadata(absolutePath);
      const duration = metadata.format.duration || asset.duration || 5;
      totalDuration += duration;

      // Validar streams
      if (asset.type !== 'audio') {
        if (!metadata.streams.some((s: any) => s.codec_type === 'video')) {
          errors.push(`Asset ${i}: No contiene stream de video`);
        }
      }

      if (metadata.streams.length === 0) {
        errors.push(`Asset ${i}: Archivo sin streams válidos`);
      }
    } catch (err) {
      errors.push(`Asset ${i}: Error al probar: ${err instanceof Error ? err.message : 'Unknown'}`);
    }
  }

  // 3. Validar audio tracks
  for (let i = 0; i < project.audioTracks.length; i++) {
    const track = project.audioTracks[i];
    const absolutePath = track.startsWith('/uploads/')
      ? join(uploadDir, track.replace('/uploads/', ''))
      : track;

    if (!existsSync(absolutePath)) {
      errors.push(`Audio track ${i}: Archivo no encontrado: ${absolutePath}`);
      continue;
    }

    try {
      const metadata = await getFileMetadata(absolutePath);
      if (!metadata.streams.some((s: any) => s.codec_type === 'audio')) {
        warnings.push(`Audio track ${i}: No contiene stream de audio`);
      }
    } catch (err) {
      errors.push(`Audio track ${i}: Error al probar: ${err instanceof Error ? err.message : 'Unknown'}`);
    }
  }

  // 4. Validar espacio en disco (estimado: 200MB por minuto aprox)
  const bitrate = parseInt(options.bitrate?.replace('k', '') || '5000');
  estimatedSize = (totalDuration * bitrate * 1000) / 8; // bytes
  const estimatedMB = estimatedSize / (1024 * 1024);

  const stats = await fs.stat(uploadDir).catch(() => null);
  if (stats) {
    const freeMB = 100000; // Asumir que hay espacio (este es un estimate)
    if (estimatedMB > freeMB) {
      warnings.push(`Espacio estimado: ${estimatedMB.toFixed(0)}MB. Verifica espacio disponible.`);
    }
  }

  // 5. Validar directorios de output
  const videosDir = join(uploadDir, 'videos');
  if (!existsSync(videosDir)) {
    try {
      await fs.mkdir(videosDir, { recursive: true });
    } catch (err) {
      errors.push(`No se puede crear directorio de videos: ${err instanceof Error ? err.message : 'Unknown'}`);
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
    metadata: {
      totalDuration,
      estimatedSize,
      assetCount: project.assets.length + project.audioTracks.length,
    },
  };
}

export async function compileVideo(
  project: VideoProject,
  options: CompilationOptions = {},
  onEvent?: (type: string, message: string, percent?: number) => void
): Promise<string> {
  const {
    fps = 30,
    resolution = '1080p',
    bitrate = '5000k',
    audioVolume = 1,
    effects = 'basic',
  } = options;

  const { width, height } = RESOLUTION_MAP[resolution];
  const outputId = uuidv4();
  const uploadDirRel = process.env.UPLOAD_DIR || './uploads';
  const uploadDir = join(process.cwd(), uploadDirRel);
  const outputPath = join(uploadDir, 'videos', `${outputId}.mp4`);

  try {
    // Ensure directories exist
    const videosDir = join(uploadDir, 'videos');
    if (!existsSync(videosDir)) {
      await fs.mkdir(videosDir, { recursive: true });
    }

    // Create concat demuxer file with absolute path
    const demuxerPath = join(uploadDir, `demux-${outputId}.txt`);
    const demuxerContent = project.assets
      .filter(a => a.type !== 'audio')
      .map(asset => {
        const duration = asset.duration || 5;
        return `file '${asset.path}'\nduration ${duration}`;
      })
      .join('\n');

    writeFileSync(demuxerPath, demuxerContent);

    // Build FFmpeg command
    return new Promise((resolve, reject) => {
      let command = ffmpeg();

      // Add input files (video/images only, no embedded audio)
      command = command.input(demuxerPath).inputOption('-f', 'concat').inputOption('-safe', '0').inputOption('-an').inputOption('-vsync', 'vfr');

      // Add audio track (paths are already absolute from compilation.ts)
      if (project.audioTracks.length > 0) {
        command = command.input(project.audioTracks[0]);
      }

      // Output options
      command
        .outputOptions([
          `-c:v libx264`,
          `-preset medium`,
          `-b:v ${bitrate}`,
          `-c:a aac`,
          `-b:a 192k`,
          `-pix_fmt yuv420p`,
          `-r ${fps}`,
          `-s ${width}x${height}`,
          `-movflags +faststart`,
          `-g 30`, // Keyframe every 30 frames for smooth seeking
          `-keyint_min 30`,
          `-max_muxing_queue_size 9999`, // Prevent buffer overflow
          `-y`, // Overwrite output
        ])
        .output(outputPath)
        .on('start', cmdline => {
          console.log(`FFmpeg: ${cmdline}`);
          onEvent?.('info', '🎬 Iniciando FFmpeg...');
        })
        .on('progress', progress => {
          const percent = progress.percent || 0;
          console.log(`Progress: ${percent}% done`);
          onEvent?.('progress', `Codificando... ${Math.round(percent)}%`, percent);
        })
        .on('end', () => {
          console.log(`✅ Compilación de FFmpeg completa: ${outputPath}`);
          onEvent?.('info', '📝 Finalizando escritura...');
          setTimeout(() => {
            console.log(`✅ Video compilado completamente: ${outputPath}`);
            onEvent?.('success', `✅ Video compilado: ${outputPath}`, 100);
            resolve(outputPath);
          }, 2000);
        })
        .on('error', (err: Error) => {
          console.error(`❌ Error compilando video: ${err.message}`);
          onEvent?.('error', `❌ Error FFmpeg: ${err.message}`);
          reject(err);
        })
        .run();
    });
  } catch (error) {
    console.error('Error in compileVideo:', error);
    throw error;
  }
}

export async function createVideoFromImages(
  imagePaths: string[],
  audioPath: string | null,
  options: CompilationOptions = {}
): Promise<{ id: string; path: string }> {
  const projectId = uuidv4();
  const { resolution = '1080p', fps = 30 } = options;
  const { width, height } = RESOLUTION_MAP[resolution];

  const uploadDir = process.env.UPLOAD_DIR || './uploads';
  const outputPath = join(uploadDir, 'videos', `${projectId}.mp4`);

  try {
    return new Promise((resolve, reject) => {
      let command = ffmpeg();

      // Add images as input (each image displayed for 5 seconds)
      imagePaths.forEach(imgPath => {
        command = command.input(imgPath).inputOption('-loop', '1').inputOption('-t', '5');
      });

      // Add audio if provided
      if (audioPath) {
        command = command.input(audioPath);
      }

      // Filter complex for concatenation
      const filterParts = imagePaths.map((_, i) => `[${i}:v]scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:black[v${i}]`);
      const concat = imagePaths.map((_, i) => `[v${i}]`).join('') + `concat=n=${imagePaths.length}:v=1:a=0[v]`;
      const filterComplex = [...filterParts, concat].join(';');

      command
        .complexFilter(filterComplex)
        .outputOptions([
          `-c:v libx264`,
          `-preset medium`,
          `-b:v 5000k`,
          `-c:a aac`,
          `-b:a 192k`,
          `-pix_fmt yuv420p`,
          `-r ${fps}`,
          `-y`,
        ])
        .output(outputPath)
        .on('end', () => {
          resolve({ id: projectId, path: `/uploads/videos/${projectId}.mp4` });
        })
        .on('error', reject)
        .run();
    });
  } catch (error) {
    console.error('Error creating video from images:', error);
    throw error;
  }
}

export async function addWatermark(
  videoPath: string,
  watermarkPath: string,
  options: { position?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'; opacity?: number } = {}
): Promise<string> {
  const { position = 'bottom-right', opacity = 0.8 } = options;

  const uploadDir = process.env.UPLOAD_DIR || './uploads';
  const outputId = uuidv4();
  const outputPath = join(uploadDir, 'videos', `${outputId}.mp4`);

  const positionMap = {
    'top-left': 'x=10:y=10',
    'top-right': 'x=main_w-overlay_w-10:y=10',
    'bottom-left': 'x=10:y=main_h-overlay_h-10',
    'bottom-right': 'x=main_w-overlay_w-10:y=main_h-overlay_h-10',
  };

  return new Promise((resolve, reject) => {
    ffmpeg(videoPath)
      .input(watermarkPath)
      .complexFilter(
        `[0:v][1:v]overlay=${positionMap[position]}:alpha=${opacity}[v];[0:a]afilt[a]`,
        ['v', 'a']
      )
      .outputOptions(['-y', '-c:a aac'])
      .output(outputPath)
      .on('end', () => resolve(outputPath))
      .on('error', reject)
      .run();
  });
}

export async function extractAudioFromVideo(videoPath: string): Promise<string> {
  const uploadDir = process.env.UPLOAD_DIR || './uploads';
  const outputId = uuidv4();
  const outputPath = join(uploadDir, 'audio', `${outputId}.mp3`);

  return new Promise((resolve, reject) => {
    ffmpeg(videoPath)
      .output(outputPath)
      .outputOptions(['-q:a 0', '-map a', '-y'])
      .on('end', () => resolve(outputPath))
      .on('error', reject)
      .run();
  });
}

export async function getVideoMetadata(videoPath: string): Promise<any> {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(videoPath, (err, metadata) => {
      if (err) reject(err);
      else resolve(metadata);
    });
  });
}

export function validateVideoAssets(assets: VideoAsset[]): string[] {
  const errors: string[] = [];

  assets.forEach((asset, i) => {
    if (!existsSync(asset.path)) {
      errors.push(`Asset ${i}: File not found at ${asset.path}`);
    }

    if (asset.type === 'audio' && !asset.duration) {
      errors.push(`Asset ${i}: Audio duration must be specified`);
    }

    if (asset.type === 'image' && (!asset.duration || asset.duration <= 0)) {
      errors.push(`Asset ${i}: Image duration must be > 0`);
    }
  });

  return errors;
}
