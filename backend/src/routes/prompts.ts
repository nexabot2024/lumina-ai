import { Router, Request, Response } from 'express';
import {
  parseScriptIntoSections,
  generateImagePrompts,
  enhancePrompt,
  type GeneratedPrompt,
} from '../services/promptService.js';

const router = Router();

interface ParseScriptRequest {
  scriptText: string;
  style?: string;
  tone?: string;
}

interface EnhancePromptRequest {
  prompt: string;
  context?: string;
}

router.post('/parse', async (req: Request<{}, {}, ParseScriptRequest>, res: Response) => {
  try {
    const { scriptText, style, tone } = req.body;

    if (!scriptText) {
      return res.status(400).json({ error: 'scriptText is required' });
    }

    const sections = await parseScriptIntoSections(scriptText);
    const prompts = await generateImagePrompts(sections, { style, tone });

    res.json({
      sectionsCount: sections.length,
      sections,
      prompts,
    });
  } catch (error) {
    console.error('Error parsing script:', error);
    res.status(500).json({ error: 'Failed to parse script' });
  }
});

router.post('/enhance', async (req: Request<{}, {}, EnhancePromptRequest>, res: Response) => {
  try {
    const { prompt, context } = req.body;

    if (!prompt) {
      return res.status(400).json({ error: 'prompt is required' });
    }

    const enhancedPrompt = await enhancePrompt(prompt, context);

    res.json({
      original: prompt,
      enhanced: enhancedPrompt,
    });
  } catch (error) {
    console.error('Error enhancing prompt:', error);
    res.status(500).json({ error: 'Failed to enhance prompt' });
  }
});

router.post('/batch-enhance', async (req: Request<{}, {}, { prompts: string[] }>, res: Response) => {
  try {
    const { prompts } = req.body;

    if (!Array.isArray(prompts)) {
      return res.status(400).json({ error: 'prompts must be an array' });
    }

    const enhanced = await Promise.all(
      prompts.map(prompt => enhancePrompt(prompt))
    );

    res.json({
      original: prompts,
      enhanced,
    });
  } catch (error) {
    console.error('Error enhancing prompts:', error);
    res.status(500).json({ error: 'Failed to enhance prompts' });
  }
});

export default router;
