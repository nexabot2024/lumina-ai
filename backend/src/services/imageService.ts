import OpenAI from 'openai';
import axios from 'axios';
import { writeFileSync } from 'fs';
import { join } from 'path';
import { v4 as uuidv4 } from 'uuid';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export interface GeneratedImage {
  id: string;
  url: string;
  prompt: string;
  localPath: string;
  generatedAt: string;
}

export async function generateImageDALLE(prompt: string): Promise<GeneratedImage> {
  try {
    const response = await openai.images.generate({
      model: 'dall-e-3',
      prompt,
      n: 1,
      size: '1024x1024',
      quality: 'hd',
    });

    const imageUrl = response.data[0].url;
    if (!imageUrl) throw new Error('No image URL returned');

    const imageData = await downloadImage(imageUrl);
    const imageId = uuidv4();
    const fileName = `${imageId}.png`;
    const uploadDir = process.env.UPLOAD_DIR || './uploads';
    const localPath = join(uploadDir, 'images', fileName);

    writeFileSync(localPath, imageData);

    return {
      id: imageId,
      url: `/uploads/images/${fileName}`,
      prompt,
      localPath,
      generatedAt: new Date().toISOString(),
    };
  } catch (error) {
    console.error('Error generating image with DALL-E:', error);
    throw error;
  }
}

export async function generateImageStableDiffusion(prompt: string): Promise<GeneratedImage> {
  try {
    // This is a placeholder - implement with Stable Diffusion API
    // For now, using DALL-E as fallback
    return generateImageDALLE(prompt);
  } catch (error) {
    console.error('Error generating image with Stable Diffusion:', error);
    throw error;
  }
}

async function downloadImage(url: string): Promise<Buffer> {
  const response = await axios.get(url, {
    responseType: 'arraybuffer',
  });
  return Buffer.from(response.data);
}

export async function generateBatchImages(
  prompts: string[],
  options: { service?: 'dalle' | 'stable-diffusion' } = {}
): Promise<GeneratedImage[]> {
  const { service = 'dalle' } = options;
  const images: GeneratedImage[] = [];

  for (const prompt of prompts) {
    try {
      const image = service === 'dalle'
        ? await generateImageDALLE(prompt)
        : await generateImageStableDiffusion(prompt);

      images.push(image);

      // Rate limiting
      await new Promise(resolve => setTimeout(resolve, 1000));
    } catch (error) {
      console.error(`Failed to generate image for prompt: ${prompt}`, error);
    }
  }

  return images;
}
