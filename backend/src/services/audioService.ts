import axios from 'axios';
import { writeFileSync } from 'fs';
import { join } from 'path';
import { v4 as uuidv4 } from 'uuid';

export interface GeneratedAudio {
  id: string;
  url: string;
  text: string;
  voice: string;
  duration: number;
  localPath: string;
  generatedAt: string;
}

const AI33PRO_API_KEY = process.env.AI33PRO_API_KEY;
const AI33PRO_BASE_URL = 'https://api.ai33pro.com'; // Adjust based on actual API

export async function generateAudioAI33Pro(
  text: string,
  options: {
    voice?: string;
    speed?: number;
    language?: string;
  } = {}
): Promise<GeneratedAudio> {
  try {
    const {
      voice = 'default',
      speed = 1,
      language = 'es',
    } = options;

    const response = await axios.post(
      `${AI33PRO_BASE_URL}/tts/generate`,
      {
        text,
        voice,
        speed,
        language,
      },
      {
        headers: {
          'Authorization': `Bearer ${AI33PRO_API_KEY}`,
          'Content-Type': 'application/json',
        },
        responseType: 'arraybuffer',
      }
    );

    const audioId = uuidv4();
    const fileName = `${audioId}.mp3`;
    const uploadDir = process.env.UPLOAD_DIR || './uploads';
    const localPath = join(uploadDir, 'audio', fileName);

    writeFileSync(localPath, response.data);

    return {
      id: audioId,
      url: `/uploads/audio/${fileName}`,
      text,
      voice,
      duration: estimateDuration(text, speed),
      localPath,
      generatedAt: new Date().toISOString(),
    };
  } catch (error) {
    console.error('Error generating audio with AI33Pro:', error);
    throw error;
  }
}

export async function generateBatchAudio(
  texts: string[],
  options: { voice?: string; speed?: number } = {}
): Promise<GeneratedAudio[]> {
  const audios: GeneratedAudio[] = [];

  for (const text of texts) {
    try {
      const audio = await generateAudioAI33Pro(text, options);
      audios.push(audio);

      // Rate limiting
      await new Promise(resolve => setTimeout(resolve, 500));
    } catch (error) {
      console.error(`Failed to generate audio for text: ${text}`, error);
    }
  }

  return audios;
}

function estimateDuration(text: string, speed: number = 1): number {
  const wordsPerMinute = 150 / speed;
  const words = text.split(/\s+/).length;
  return (words / wordsPerMinute) * 60;
}

export async function listAvailableVoices(): Promise<string[]> {
  try {
    const response = await axios.get(
      `${AI33PRO_BASE_URL}/tts/voices`,
      {
        headers: {
          'Authorization': `Bearer ${AI33PRO_API_KEY}`,
        },
      }
    );

    return response.data.voices || [];
  } catch (error) {
    console.error('Error fetching voices:', error);
    return ['default'];
  }
}
