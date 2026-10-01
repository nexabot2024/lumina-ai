import { Router, Request, Response } from 'express';
import axios from 'axios';
import { generateAudioAI84, getAI84JobStatus, getAI84SharedVoices, getAI84Credits } from '../services/ai84Service.js';

const router = Router();

router.post('/generate', async (req: Request, res: Response) => {
  try {
    const { text, voiceId, modelId, outputFormat, voiceSettings } = req.body;

    if (!text) {
      return res.status(400).json({ error: 'text is required' });
    }

    const job = await generateAudioAI84(text, { voiceId, modelId, outputFormat, voiceSettings });
    res.json({ success: true, job });
  } catch (error) {
    console.error('Error generating audio with AI84.pro:', error);
    res.status(500).json({
      error: 'Failed to generate audio',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

router.get('/status/:jobId', async (req: Request, res: Response) => {
  try {
    const job = await getAI84JobStatus(req.params.jobId);
    res.json({ success: true, job });
  } catch (error) {
    console.error('Error fetching AI84.pro job status:', error);
    res.status(500).json({
      error: 'Failed to fetch job status',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// Proxy de descarga: la URL de audio de AI84.pro es un enlace firmado de corta
// duración — se descarga server-side y se sirve como un archivo estable, igual que
// el patrón existente para AI33Pro (/api/audio/file/:taskId).
router.get('/download/:jobId', async (req: Request, res: Response) => {
  try {
    const job = await getAI84JobStatus(req.params.jobId);

    if (job.status !== 'done') {
      return res.status(400).json({ error: 'El audio todavía no está listo', status: job.status });
    }
    if (!job.audioUrl) {
      return res.status(400).json({ error: 'El job no tiene una URL de audio' });
    }

    const audioResponse = await axios.get(job.audioUrl, { responseType: 'arraybuffer' });
    res.set('Content-Type', 'audio/mpeg');
    res.set('Content-Disposition', `attachment; filename="ai84-audio-${req.params.jobId.slice(0, 8)}.mp3"`);
    res.send(audioResponse.data);
  } catch (error) {
    console.error('Error downloading AI84.pro audio:', error);
    res.status(500).json({
      error: 'Failed to download audio file',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

router.get('/voices', async (req: Request, res: Response) => {
  try {
    const { search, gender, language, page, pageSize } = req.query;
    const voices = await getAI84SharedVoices({
      search: search as string,
      gender: gender as string,
      language: language as string,
      page: page ? parseInt(page as string, 10) : undefined,
      pageSize: pageSize ? parseInt(pageSize as string, 10) : undefined,
    });
    res.json({ success: true, voices });
  } catch (error) {
    console.error('Error fetching AI84.pro voices:', error);
    res.status(500).json({
      error: 'Failed to fetch voices',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

router.get('/credits', async (req: Request, res: Response) => {
  try {
    const credits = await getAI84Credits();
    res.json({ success: true, credits });
  } catch (error) {
    console.error('Error fetching AI84.pro credits:', error);
    res.status(500).json({
      error: 'Failed to fetch credits',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

export default router;
