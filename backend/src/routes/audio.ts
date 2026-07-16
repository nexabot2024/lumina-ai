import { Router, Request, Response } from 'express';
import {
  generateAudioAI33Pro,
  generateBatchAudio,
  listAvailableVoices,
} from '../services/audioService.js';

const router = Router();

interface GenerateAudioRequest {
  text: string;
  voiceId?: string;
  speed?: number;
}

interface GenerateBatchAudioRequest {
  texts: string[];
  voiceId?: string;
  speed?: number;
}

// Available voice IDs for AI33.pro v3:
// elevenlabs_* - ElevenLabs voices
// minimax_* - MiniMax voices
// clone_* - Custom cloned voices
// edge_* - Microsoft Edge voices
// kokoro_* - Kokoro voices
// vbee_* - VBee voices
// fishaudio_* - Fish Audio voices

router.post('/generate', async (req: Request<{}, {}, GenerateAudioRequest>, res: Response) => {
  try {
    const { text, voiceId, speed } = req.body;

    if (!text) {
      return res.status(400).json({ error: 'text is required' });
    }

    const audio = await generateAudioAI33Pro(text, { voiceId, speed });

    res.json({
      success: true,
      audio,
    });
  } catch (error) {
    console.error('Error generating audio:', error);
    res.status(500).json({
      error: 'Failed to generate audio',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

router.post('/batch', async (req: Request<{}, {}, GenerateBatchAudioRequest>, res: Response) => {
  try {
    const { texts, voiceId, speed } = req.body;

    if (!Array.isArray(texts) || texts.length === 0) {
      return res.status(400).json({ error: 'texts must be a non-empty array' });
    }

    const audios = await generateBatchAudio(texts, { voice: voiceId, speed });

    res.json({
      success: true,
      count: audios.length,
      audios,
    });
  } catch (error) {
    console.error('Error generating batch audio:', error);
    res.status(500).json({
      error: 'Failed to generate audio batch',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

router.get('/voices', async (req: Request, res: Response) => {
  try {
    const voices = await listAvailableVoices();
    res.json({ voices });
  } catch (error) {
    console.error('Error fetching voices:', error);
    res.status(500).json({
      error: 'Failed to fetch voices',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

export default router;
