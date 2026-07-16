import ffmpeg from 'fluent-ffmpeg';
import { v4 as uuidv4 } from 'uuid';
import { existsSync, writeFileSync } from 'fs';
import { join } from 'path';

export interface VideoAsset {
  type: 'image' | 'video' | 'audio';
  path: string;
  duration?: number;
  startTime?: number;
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

export async function compileVideo(
  project: VideoProject,
  options: CompilationOptions = {}
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
  const uploadDir = process.env.UPLOAD_DIR || './uploads';
  const outputPath = join(uploadDir, 'videos', `${outputId}.mp4`);

  try {
    // Create concat demuxer file
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

      // Add input files
      command = command.input(demuxerPath).inputOption('-f', 'concat').inputOption('-safe', '0');

      // Add audio track
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
          `-y`, // Overwrite output
        ])
        .output(outputPath)
        .on('start', cmdline => {
          console.log(`FFmpeg: ${cmdline}`);
        })
        .on('progress', progress => {
          console.log(`Progress: ${progress.percent}% done`);
        })
        .on('end', () => {
          console.log(`✅ Video compilado: ${outputPath}`);
          resolve(outputPath);
        })
        .on('error', (err: Error) => {
          console.error(`❌ Error compilando video: ${err.message}`);
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
          resolve({ id: projectId, path: outputPath });
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
