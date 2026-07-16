import axios from 'axios';
import { writeFileSync } from 'fs';
import { join } from 'path';
import { v4 as uuidv4 } from 'uuid';

export interface GeneratedVideo {
  id: string;
  taskId: string;
  prompt: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  videoUrl?: string;
  localPath?: string;
  generatedAt: string;
  mode: 'text_to_video' | 'start_image' | 'components';
}

function getVeoApiKey(): string {
  const apiKey = process.env.GENERATION_API_KEY;
  if (!apiKey || apiKey.trim() === '') {
    throw new Error('GENERATION_API_KEY environment variable is missing or empty');
  }
  return apiKey;
}

function getVeoApiUrl(): string {
  const baseUrl = process.env.GENERATION_API_BASE_URL;
  if (!baseUrl || baseUrl.trim() === '') {
    throw new Error('GENERATION_API_BASE_URL environment variable is missing or empty');
  }
  return baseUrl;
}

export async function generateVideoVeoLite(
  prompt: string,
  options: {
    videoLength?: 4 | 6 | 8;
    aspectRatio?: '16:9' | '9:16';
    resolution?: '720p' | '1080p';
    mode?: 'text_to_video' | 'start_image' | 'components';
    referenceImages?: string[];
  } = {}
): Promise<GeneratedVideo> {
  try {
    const {
      videoLength = 6,
      aspectRatio = '16:9',
      resolution = '1080p',
      mode = 'text_to_video',
      referenceImages = [],
    } = options;

    const apiUrl = getVeoApiUrl();
    const apiKey = getVeoApiKey();

    const payload: any = {
      prompt,
      model: 'veo_lite',
      aspect_ratio: aspectRatio,
      video_length: videoLength,
      resolution: [resolution],
      mode,
    };

    if (referenceImages.length > 0) {
      payload.reference_images = referenceImages;
    }

    const response = await axios.post(
      `${apiUrl}/api/video/generate`,
      payload,
      {
        headers: {
          'X-API-Key': apiKey,
          'Content-Type': 'application/json',
        },
      }
    );

    if (!response.data.success || !response.data.task_id) {
      throw new Error(`Failed to generate video: ${response.data.error?.message || 'Unknown error'}`);
    }

    const videoId = uuidv4();

    return {
      id: videoId,
      taskId: response.data.task_id,
      prompt,
      status: 'pending',
      generatedAt: new Date().toISOString(),
      mode: mode as any,
    };
  } catch (error) {
    console.error('Error generating video with Veo Lite:', error);
    throw error;
  }
}

export async function checkVideoStatus(taskId: string): Promise<GeneratedVideo | null> {
  try {
    const apiUrl = getVeoApiUrl();
    const apiKey = getVeoApiKey();

    const response = await axios.get(
      `${apiUrl}/api/tasks/${taskId}`,
      {
        headers: {
          'X-API-Key': apiKey,
        },
      }
    );

    if (!response.data) {
      return null;
    }

    const task = response.data;

    return {
      id: uuidv4(),
      taskId,
      prompt: task.prompt || '',
      status: task.status || 'processing',
      videoUrl: task.video_url,
      generatedAt: new Date().toISOString(),
      mode: 'text_to_video',
    };
  } catch (error) {
    console.error('Error checking video status:', error);
    throw error;
  }
}

export async function listActiveTasks(): Promise<any[]> {
  try {
    const apiUrl = getVeoApiUrl();
    const apiKey = getVeoApiKey();

    const response = await axios.get(
      `${apiUrl}/api/tasks`,
      {
        headers: {
          'X-API-Key': apiKey,
        },
      }
    );

    return response.data || [];
  } catch (error) {
    console.error('Error listing active tasks:', error);
    throw error;
  }
}
