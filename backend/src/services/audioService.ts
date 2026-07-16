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

const AI33PRO_BASE_URL = process.env.AI33PRO_BASE_URL || 'https://api.ai33.pro';

function getAI33ProApiKey(): string {
  const apiKey = process.env.AI33PRO_API_KEY;
  if (!apiKey || apiKey.trim() === '') {
    throw new Error('AI33PRO_API_KEY environment variable is missing or empty');
  }
  return apiKey;
}

export async function generateAudioAI33Pro(
  text: string,
  options: {
    voiceId?: string;
    speed?: number;
  } = {}
): Promise<GeneratedAudio> {
  try {
    const {
      voiceId = 'elevenlabs_EXAVITQu4vr4xnSDxMaL',
      speed = 1,
    } = options;

    const formData = new FormData();
    formData.append('text', text);
    formData.append('voice_id', voiceId);
    formData.append('speed', speed.toString());
    formData.append('with_transcript', 'false');

    const response = await axios.post(
      `${AI33PRO_BASE_URL}/v3/text-to-speech`,
      formData,
      {
        headers: {
          'xi-api-key': getAI33ProApiKey(),
        },
      }
    );

    if (!response.data.success || !response.data.task_id) {
      throw new Error(`Failed to generate audio: ${response.data.error?.message || 'Unknown error'}`);
    }

    return {
      id: uuidv4(),
      url: '',
      text,
      voice: voiceId,
      duration: estimateDuration(text, speed),
      localPath: '',
      generatedAt: new Date().toISOString(),
    };
  } catch (error) {
    console.error('Error generating audio with AI33Pro v3:', error);
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
          'Authorization': `Bearer ${getAI33ProApiKey()}`,
        },
      }
    );

    return response.data.voices || [];
  } catch (error) {
    console.error('Error fetching voices:', error);
    return ['default'];
  }
}
