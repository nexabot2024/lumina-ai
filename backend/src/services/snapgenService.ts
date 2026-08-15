import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { OUTPUT_DIR, toOutputUrl } from './outputStorage.js';

export interface GeneratedVideo {
  id: string;
  taskId: string;
  prompt: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  videoUrl?: string;
  localPath?: string;
  downloadUrl?: string;
  generatedAt: string;
  model: string;
}

export type SnapGenVideoModel = 'veo-3.1' | 'veo-3.1-fast' | 'veo-2' | 'veo-3.1-lite' | 'omni-flash';

function getApiKey(): string {
  const apiKey = process.env.SNAPGEN_API_KEY;
  if (!apiKey || apiKey.trim() === '') {
    throw new Error('SNAPGEN_API_KEY environment variable is missing or empty');
  }
  return apiKey;
}

function getBaseUrl(): string {
  return process.env.SNAPGEN_API_BASE_URL || 'https://api.snapgen.ai';
}

// Recuerda la copia local (en OUTPUT_DIR) de cada video una vez descargado, para no
// volver a bajarlo si se consulta el estado varias veces.
const pendingDownloads = new Map<string, { downloaded?: string }>();

export async function generateVideoSnapGen(
  prompt: string,
  options: {
    model?: SnapGenVideoModel;
    resolution?: '720p' | '1080p';
    duration?: 4 | 6 | 8 | 10;
    aspectRatio?: '16:9' | '9:16';
    referenceImages?: string[];
  } = {}
): Promise<GeneratedVideo> {
  try {
    const apiKey = getApiKey();
    const baseUrl = getBaseUrl();

    const {
      model = (process.env.SNAPGEN_MODEL as SnapGenVideoModel) || 'veo-3.1',
      resolution = (process.env.SNAPGEN_RESOLUTION as '720p' | '1080p') || '1080p',
      duration = (process.env.SNAPGEN_DURATION ? parseInt(process.env.SNAPGEN_DURATION) : 8) as 4 | 6 | 8 | 10,
      aspectRatio = (process.env.SNAPGEN_ASPECT_RATIO as '16:9' | '9:16') || '16:9',
      referenceImages = [],
    } = options;

    const formData = new FormData();
    formData.append('prompt', prompt);
    formData.append('model', model);
    formData.append('resolution', resolution);
    formData.append('duration', duration.toString());
    formData.append('aspect_ratio', aspectRatio);

    referenceImages.forEach(img => formData.append('ref_images', img));

    const response = await axios.post(`${baseUrl}/uapi/v1/video-gen/veo`, formData, {
      headers: { 'x-api-key': apiKey },
    });

    const data = response.data;

    if (!data.uuid) {
      throw new Error(`Failed to generate video: ${data.error_message || data.message || 'Unknown error'}`);
    }

    pendingDownloads.set(data.uuid, {});

    return {
      id: uuidv4(),
      taskId: data.uuid,
      prompt,
      status: 'pending',
      generatedAt: data.created_at || new Date().toISOString(),
      model,
    };
  } catch (error) {
    console.error('Error generating video with SnapGen:', error);
    throw error;
  }
}

async function downloadVideoFile(url: string, filePath: string): Promise<void> {
  const response = await axios.get(url, { responseType: 'arraybuffer' });
  const dir = path.dirname(filePath);

  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  fs.writeFileSync(filePath, response.data);
}

const SNAPGEN_STATUS_MAP: Record<number, GeneratedVideo['status']> = {
  1: 'processing',
  2: 'completed',
  3: 'failed',
};

export async function checkSnapGenVideoStatus(taskId: string): Promise<GeneratedVideo | null> {
  try {
    const apiKey = getApiKey();
    const baseUrl = getBaseUrl();

    const response = await axios.get(`${baseUrl}/uapi/v1/history/${taskId}`, {
      headers: { 'x-api-key': apiKey },
    });

    const history = response.data;

    if (!history || !history.uuid) {
      return null;
    }

    const status = SNAPGEN_STATUS_MAP[history.status] || 'processing';
    const generatedVideo = history.generated_video?.[0];
    const videoUrl = generatedVideo?.video_url;
    let localPath: string | undefined;

    if (status === 'completed' && videoUrl) {
      const pending = pendingDownloads.get(taskId) || {};
      if (pending.downloaded) {
        localPath = pending.downloaded;
      } else {
        const fileName = `snapgen_${taskId}.mp4`;
        const filePath = path.join(OUTPUT_DIR, fileName);
        await downloadVideoFile(videoUrl, filePath);
        pending.downloaded = filePath;
        pendingDownloads.set(taskId, pending);
        localPath = filePath;
      }
    }

    return {
      id: uuidv4(),
      taskId,
      prompt: history.input_text || '',
      status,
      videoUrl,
      localPath,
      downloadUrl: localPath ? toOutputUrl(localPath) : undefined,
      generatedAt: history.created_at || new Date().toISOString(),
      model: history.model_name || '',
    };
  } catch (error) {
    console.error('Error checking SnapGen video status:', error);
    throw error;
  }
}

export async function listSnapGenVideoHistory(limit: number = 20): Promise<any[]> {
  try {
    const apiKey = getApiKey();
    const baseUrl = getBaseUrl();

    const response = await axios.get(`${baseUrl}/uapi/v1/histories`, {
      headers: { 'x-api-key': apiKey },
      params: { filter_by: 'video', items_per_page: limit, page: 1 },
    });

    return response.data.result || [];
  } catch (error) {
    console.error('Error listing SnapGen video history:', error);
    throw error;
  }
}
