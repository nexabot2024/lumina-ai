import Anthropic from '@anthropic-ai/sdk';

function getClaudeClient(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || apiKey.trim() === '') {
    throw new Error('ANTHROPIC_API_KEY environment variable is missing or empty');
  }
  return new Anthropic({ apiKey });
}

export interface PromptGeneratorOptions {
  scriptText: string;
  style?: string;
  tone?: string;
}

export interface GeneratedPrompt {
  id: string;
  section: number;
  text: string;
  prompt: string;
  imagePrompt: string;
  videoKeywords: string[];
}

export async function parseScriptIntoSections(scriptText: string): Promise<string[]> {
  const sections = scriptText
    .split(/\n\s*\n+/)
    .filter(section => section.trim().length > 0);

  return sections;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function isRetryableError(error: unknown): boolean {
  const status = (error as any)?.status;
  return status === 429 || status === 529 || status === 503;
}

function cleanJsonResponse(content: string): string {
  if (content.includes('```json')) {
    return content.replace(/```json\n?/g, '').replace(/\n?```/g, '').trim();
  }
  if (content.includes('```')) {
    return content.replace(/```[a-z]*\n?/g, '').replace(/\n?```/g, '').trim();
  }
  return content;
}

async function callClaudeForImagePrompt(
  section: string,
  style: string,
  tone: string,
  simplified: boolean
): Promise<{ imagePrompt: string; videoKeywords: string[] }> {
  const content = simplified
    ? `Create a cinematic prompt for this text:
"${section}"

RESPOND ONLY WITH JSON, NO MARKDOWN:
{"imagePrompt":"detailed cinematographic description with camera movement, lens, lighting, ending with: slightly uneven lighting, natural lens imperfections, real-world wear and texture","videoKeywords":["word1","word2","word3"]}`
    : `You are an expert cinematic cinematographer writing ultra-detailed prompts for professional AI video/image generation (VEO, DALL-E, Midjourney).

CRITICAL RULES:
1. Be EXTREMELY specific and cinematographic
2. Include camera movements (tracking, aerial, macro, dolly, zoom, etc)
3. Specify lens types (85mm, 35mm, macro, anamorphic, etc)
4. Describe exact lighting conditions (golden hour, harsh midday, soft morning, candlelight, etc)
5. ALWAYS end with: "slightly uneven lighting, natural lens imperfections, real-world wear and texture"
6. Make it feel like a professional film shot, not a still image
7. Use cinematic language (shallow depth of field, bokeh, color grade, etc)

Style: ${style}
Tone: ${tone}
Script section: "${section}"

Generate ONLY valid JSON with NO markdown, NO extra text, NO commentary:
{
  "imagePrompt": "Ultra-detailed, cinematographic prompt describing the scene with camera movement, lens choice, lighting, and ending with the photorealism phrase",
  "videoKeywords": ["keyword1", "keyword2", "keyword3", "keyword4"]
}`;

  const response = await getClaudeClient().messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: simplified ? 400 : 500,
    messages: [{ role: 'user', content }],
  });

  const rawText = response.content[0].type === 'text' ? response.content[0].text : '{}';
  const parsed = JSON.parse(cleanJsonResponse(rawText));

  if (!parsed.imagePrompt || parsed.imagePrompt.trim().length < 20) {
    throw new Error('imagePrompt es demasiado corto o vacío');
  }

  return { imagePrompt: parsed.imagePrompt, videoKeywords: parsed.videoKeywords || [] };
}

export async function generateImagePrompts(
  sections: string[],
  options: { style?: string; tone?: string } = {}
): Promise<GeneratedPrompt[]> {
  const prompts: GeneratedPrompt[] = [];
  const { style = 'cinematic', tone = 'professional' } = options;
  const maxAttempts = 3;

  for (let i = 0; i < sections.length; i++) {
    const section = sections[i];
    let result: { imagePrompt: string; videoKeywords: string[] } | null = null;
    let lastError: unknown = null;

    for (let attempt = 0; attempt < maxAttempts && !result; attempt++) {
      try {
        result = await callClaudeForImagePrompt(section, style, tone, attempt > 0);
      } catch (error) {
        lastError = error;
        console.error(`Intento ${attempt + 1}/${maxAttempts} fallido para sección ${i + 1}:`, error);
        if (isRetryableError(error) && attempt < maxAttempts - 1) {
          await sleep(1000 * Math.pow(2, attempt)); // 1s, 2s
        }
      }
    }

    if (result) {
      prompts.push({
        id: `prompt-${i + 1}`,
        section: i + 1,
        text: section,
        prompt: section,
        imagePrompt: result.imagePrompt,
        videoKeywords: result.videoKeywords,
      });
    } else {
      console.error(`No se pudo generar prompt IA para sección ${i + 1} tras ${maxAttempts} intentos:`, lastError);
      prompts.push({
        id: `prompt-${i + 1}`,
        section: i + 1,
        text: section,
        prompt: section,
        imagePrompt: section,
        videoKeywords: [],
      });
    }
  }

  return prompts;
}

export async function enhancePrompt(
  prompt: string,
  context: string = ''
): Promise<string> {
  try {
    const response = await getClaudeClient().messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 200,
      messages: [
        {
          role: 'user',
          content: `You are an expert at enhancing prompts for AI image generation.
          Make them more detailed, specific, and visually compelling.

          Image prompt: "${prompt}"
          ${context ? `Context: ${context}` : ''}

          Return ONLY the enhanced prompt, no JSON or extra text.`,
        },
      ],
    });

    return response.content[0].type === 'text' ? response.content[0].text : prompt;
  } catch (error) {
    console.error('Error enhancing prompt:', error);
    return prompt;
  }
}
