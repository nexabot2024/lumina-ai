import { Router, Request, Response } from 'express';
import {
  generateAudioAI33Pro,
  generateBatchAudio,
  generateDialogue,
  getVoiceLibrary,
  getAllVoicesByProvider,
  cloneVoice,
  deleteClonedVoice,
  createPronunciationDictionary,
  getPronunciationDictionaries,
  getPronunciationDictionary,
  updatePronunciationDictionary,
  deletePronunciationDictionary,
  previewPronunciationDictionary,
  getTaskStatus,
  type DialogueSpeaker,
  type PronunciationRule,
  type VoiceLibraryFilter,
} from '../services/audioService.js';

const router = Router();

// ========== TEXT TO SPEECH ==========
router.post('/generate', async (req: Request, res: Response) => {
  try {
    const { text, voiceId, speed, withTranscript, fileName, receiveUrl, pronunciationDictionaryId } = req.body;

    if (!text) {
      return res.status(400).json({ error: 'text is required' });
    }

    const audio = await generateAudioAI33Pro(text, {
      voiceId,
      speed,
      withTranscript,
      fileName,
      receiveUrl,
      pronunciationDictionaryId,
    });

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

router.post('/batch', async (req: Request, res: Response) => {
  try {
    const { texts, voiceId, speed } = req.body;

    if (!Array.isArray(texts) || texts.length === 0) {
      return res.status(400).json({ error: 'texts must be a non-empty array' });
    }

    const audios = await generateBatchAudio(texts, { voiceId, speed });

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

// ========== TEXT TO DIALOGUE ==========
router.post('/dialogue', async (req: Request, res: Response) => {
  try {
    const { text, speakers, delay, withTranscript, fileName, receiveUrl, pronunciationDictionaryId } = req.body;

    if (!text) {
      return res.status(400).json({ error: 'text is required' });
    }

    if (!Array.isArray(speakers) || speakers.length < 2) {
      return res.status(400).json({ error: 'speakers must be an array with at least 2 speakers' });
    }

    const dialogue = await generateDialogue({
      text,
      speakers: speakers as DialogueSpeaker[],
      delay: delay || 0,
      with_transcript: withTranscript || false,
      file_name: fileName,
      receive_url: receiveUrl,
      pronunciation_dictionary_id: pronunciationDictionaryId,
    });

    res.json({
      success: true,
      dialogue,
    });
  } catch (error) {
    console.error('Error generating dialogue:', error);
    res.status(500).json({
      error: 'Failed to generate dialogue',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// ========== VOICE LIBRARY ==========
router.get('/voices', async (req: Request, res: Response) => {
  try {
    const { provider, search, page, pageSize, language, gender, ...filters } = req.query;

    if (!provider) {
      return res.status(400).json({ error: 'provider query parameter is required' });
    }

    const result = await getVoiceLibrary({
      provider: provider as any,
      search: search as string,
      page: page ? parseInt(page as string) : 1,
      pageSize: pageSize ? parseInt(pageSize as string) : 30,
      language: language as string,
      gender: gender as string,
      filters: Object.fromEntries(
        Object.entries(filters)
          .filter(([key]) => !['provider', 'search', 'page', 'pageSize', 'language', 'gender'].includes(key))
          .map(([key, value]) => [key, value as string])
      ),
    });

    res.json({
      success: true,
      voices: result.voices,
      pagination: result.pagination,
    });
  } catch (error) {
    console.error('Error fetching voices:', error);
    res.status(500).json({
      error: 'Failed to fetch voices',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

router.get('/voices/:provider', async (req: Request, res: Response) => {
  try {
    const { provider } = req.params;
    const validProviders = ['elevenlabs', 'minimax', 'clone', 'edge', 'kokoro', 'vbee', 'fishaudio'];

    if (!validProviders.includes(provider)) {
      return res.status(400).json({
        error: 'Invalid provider',
        validProviders,
      });
    }

    // Usar timeout de 8 segundos para evitar cuelgues
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Voice loading timeout')), 8000)
    );

    try {
      // Solo cargar primeras 30-50 voces, no todas (ElevenLabs tiene 14K+)
      const result = await Promise.race([
        getVoiceLibrary({
          provider: provider as any,
          pageSize: 50,
          page: 1,
        }),
        timeoutPromise,
      ]) as Awaited<ReturnType<typeof getVoiceLibrary>>;

      res.json({
        success: true,
        provider,
        count: result.voices.length,
        voices: result.voices,
      });
    } catch (timeoutError) {
      // Si hay timeout, devolver voces por defecto
      console.warn(`Timeout loading voices for ${provider}, returning defaults`);
      res.json({
        success: true,
        provider,
        count: 1,
        voices: [
          {
            voice_id: `${provider}_default`,
            name: `Default ${provider}`,
            language: 'Multi',
            gender: 'Neutral',
          },
        ],
      });
    }
  } catch (error) {
    console.error(`Error fetching voices for ${req.params.provider}:`, error);
    // Devolver voces por defecto en caso de error
    res.status(200).json({
      success: true,
      provider: req.params.provider,
      count: 1,
      voices: [
        {
          voice_id: `${req.params.provider}_default`,
          name: `Default ${req.params.provider}`,
          language: 'Multi',
          gender: 'Neutral',
        },
      ],
    });
  }
});

// ========== CLONE VOICE ==========
router.post('/clone', async (req: Request, res: Response) => {
  try {
    const { voiceName, audioFile } = req.body;

    if (!voiceName) {
      return res.status(400).json({ error: 'voiceName is required' });
    }

    if (!audioFile) {
      return res.status(400).json({ error: 'audioFile (base64) is required' });
    }

    const audioBuffer = Buffer.from(audioFile, 'base64');
    const clonedVoice = await cloneVoice(voiceName, audioBuffer);

    res.json({
      success: true,
      voice: clonedVoice,
    });
  } catch (error) {
    console.error('Error cloning voice:', error);
    res.status(500).json({
      error: 'Failed to clone voice',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

router.delete('/clone/:voiceCloneId', async (req: Request, res: Response) => {
  try {
    const { voiceCloneId } = req.params;

    if (!voiceCloneId) {
      return res.status(400).json({ error: 'voiceCloneId is required' });
    }

    const success = await deleteClonedVoice(voiceCloneId);

    res.json({
      success,
      message: 'Cloned voice deleted successfully',
    });
  } catch (error) {
    console.error('Error deleting cloned voice:', error);
    res.status(500).json({
      error: 'Failed to delete cloned voice',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// ========== PRONUNCIATION DICTIONARY ==========
router.post('/dictionaries', async (req: Request, res: Response) => {
  try {
    const { name, rules } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'name is required' });
    }

    if (!Array.isArray(rules) || rules.length === 0) {
      return res.status(400).json({ error: 'rules must be a non-empty array' });
    }

    const dictionary = await createPronunciationDictionary(name, rules as PronunciationRule[]);

    res.json({
      success: true,
      dictionary,
    });
  } catch (error) {
    console.error('Error creating dictionary:', error);
    res.status(500).json({
      error: 'Failed to create dictionary',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

router.get('/dictionaries', async (req: Request, res: Response) => {
  try {
    const dictionaries = await getPronunciationDictionaries();

    res.json({
      success: true,
      count: dictionaries.length,
      dictionaries,
    });
  } catch (error) {
    console.error('Error fetching dictionaries:', error);
    res.status(500).json({
      error: 'Failed to fetch dictionaries',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

router.get('/dictionaries/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({ error: 'id is required' });
    }

    const dictionary = await getPronunciationDictionary(parseInt(id));

    res.json({
      success: true,
      dictionary,
    });
  } catch (error) {
    console.error('Error fetching dictionary:', error);
    res.status(500).json({
      error: 'Failed to fetch dictionary',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

router.put('/dictionaries/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { name, rules } = req.body;

    if (!id) {
      return res.status(400).json({ error: 'id is required' });
    }

    const dictionary = await updatePronunciationDictionary(parseInt(id), {
      name,
      rules: rules as PronunciationRule[],
    });

    res.json({
      success: true,
      dictionary,
    });
  } catch (error) {
    console.error('Error updating dictionary:', error);
    res.status(500).json({
      error: 'Failed to update dictionary',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

router.delete('/dictionaries/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({ error: 'id is required' });
    }

    const success = await deletePronunciationDictionary(parseInt(id));

    res.json({
      success,
      message: 'Dictionary deleted successfully',
    });
  } catch (error) {
    console.error('Error deleting dictionary:', error);
    res.status(500).json({
      error: 'Failed to delete dictionary',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

router.post('/dictionaries/preview', async (req: Request, res: Response) => {
  try {
    const { text, rules } = req.body;

    if (!text) {
      return res.status(400).json({ error: 'text is required' });
    }

    if (!Array.isArray(rules)) {
      return res.status(400).json({ error: 'rules must be an array' });
    }

    const preview = await previewPronunciationDictionary(text, rules as PronunciationRule[]);

    res.json({
      success: true,
      preview,
    });
  } catch (error) {
    console.error('Error previewing dictionary:', error);
    res.status(500).json({
      error: 'Failed to preview dictionary',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// ========== TASK STATUS ==========
router.get('/task/:taskId', async (req: Request, res: Response) => {
  try {
    const { taskId } = req.params;

    if (!taskId) {
      return res.status(400).json({ error: 'taskId is required' });
    }

    const status = await getTaskStatus(taskId);

    res.json({
      success: true,
      status,
    });
  } catch (error) {
    console.error('Error fetching task status:', error);
    res.status(500).json({
      error: 'Failed to fetch task status',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// ========== WEBHOOK (recibir resultados) ==========
router.post('/webhook', async (req: Request, res: Response) => {
  try {
    const { task_id, status, data, error } = req.body;

    console.log(`[WEBHOOK] Task ${task_id} - Status: ${status}`);

    if (error) {
      console.error(`[WEBHOOK ERROR] Task ${task_id}:`, error);
    } else {
      console.log(`[WEBHOOK SUCCESS] Task ${task_id} - Audio URL:`, data?.audio_url);
    }

    res.json({
      success: true,
      received: true,
    });
  } catch (error) {
    console.error('Error processing webhook:', error);
    res.status(500).json({
      error: 'Failed to process webhook',
    });
  }
});

export default router;
