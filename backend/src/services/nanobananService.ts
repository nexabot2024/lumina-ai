import axios from 'axios';
import { writeFileSync } from 'fs';
import { join } from 'path';
import { v4 as uuidv4 } from 'uuid';

export interface GeneratedImage {
  id: string;
  taskId: string;
  prompt: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  imageUrl?: string;
  localPath?: string;
  generatedAt: string;
  model: string;
}

function getGenerationApiKey(): string {
  const apiKey = process.env.GENERATION_API_KEY;
  if (!apiKey || apiKey.trim() === '') {
    throw new Error('GENERATION_API_KEY environment variable is missing or empty');
  }
  return apiKey;
}

function getGenerationApiUrl(): string {
  const baseUrl = process.env.GENERATION_API_BASE_URL;
  if (!baseUrl || baseUrl.trim() === '') {
    throw new Error('GENERATION_API_BASE_URL environment variable is missing or empty');
  }
  return baseUrl;
}

export async function generateImageNanoBanana(
  prompt: string,
  options: {
    model?: 'nano_banana_2' | 'nano_banana_pro';
    aspectRatio?: '1:1' | '16:9' | '9:16';
    referenceImages?: string[];
    upscale?: string[];
    outputFolder?: string;
  } = {}
): Promise<GeneratedImage> {
  try {
    const {
      model = 'nano_banana_pro',
      aspectRatio = '16:9',
      referenceImages = [],
      upscale = [],
      outputFolder,
    } = options;

    const apiUrl = getGenerationApiUrl();
    const apiKey = getGenerationApiKey();

    const payload: any = {
      prompt,
      model,
      aspect_ratio: aspectRatio,
    };

    if (referenceImages.length > 0) {
      payload.reference_images = referenceImages;
    }

    if (upscale.length > 0) {
      payload.upscale = upscale;
    }

    if (outputFolder) {
      payload.output_folder = outputFolder;
    }

    const response = await axios.post(
      `${apiUrl}/api/image/generate`,
      payload,
      {
        headers: {
          'X-API-Key': apiKey,
          'Content-Type': 'application/json',
        },
      }
    );

    if (!response.data.task_id) {
      throw new Error(`Failed to generate image: ${response.data.error?.message || 'Unknown error'}`);
    }

    const imageId = uuidv4();

    return {
      id: imageId,
      taskId: response.data.task_id,
      prompt,
      status: 'pending',
      generatedAt: new Date().toISOString(),
      model,
    };
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error('Error generating image with NanoBanana:', errMsg);

    if (errMsg.includes('ECONNREFUSED') || errMsg.includes('connect ECONNREFUSED')) {
      throw new Error(
        'G-Labs API server is not running. Please start G-LabsAutomation.exe from ' +
        'C:\\Users\\danir\\Downloads\\G-Labs-Automation-v6.0.5-win\\G-LabsAutomation.exe ' +
        'and ensure it is listening on http://localhost:8765'
      );
    }
    throw error;
  }
}

export async function checkImageStatus(taskId: string): Promise<GeneratedImage | null> {
  try {
    const apiUrl = getGenerationApiUrl();
    const apiKey = getGenerationApiKey();

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
      imageUrl: task.image_url,
      generatedAt: new Date().toISOString(),
      model: task.model || 'nano_banana_pro',
    };
  } catch (error) {
    console.error('Error checking image status:', error);
    throw error;
  }
}

export async function generateBatchImages(
  prompts: string[],
  options: { model?: 'nano_banana_2' | 'nano_banana_pro'; outputFolder?: string; referenceImages?: string[] } = {}
): Promise<GeneratedImage[]> {
  const { model = 'nano_banana_pro', outputFolder, referenceImages } = options;
  const images: GeneratedImage[] = [];

  for (const prompt of prompts) {
    try {
      const image = await generateImageNanoBanana(prompt, { model, outputFolder, referenceImages });
      images.push(image);

      // Rate limiting
      await new Promise(resolve => setTimeout(resolve, 1000));
    } catch (error) {
      console.error(`Failed to generate image for prompt: ${prompt}`, error);
    }
  }

  return images;
}
