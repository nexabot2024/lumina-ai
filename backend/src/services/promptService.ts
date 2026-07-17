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

export async function generateImagePrompts(
  sections: string[],
  options: { style?: string; tone?: string } = {}
): Promise<GeneratedPrompt[]> {
  const prompts: GeneratedPrompt[] = [];
  const { style = 'cinematic', tone = 'professional' } = options;

  for (let i = 0; i < sections.length; i++) {
    const section = sections[i];

    try {
      const response = await getClaudeClient().messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 300,
        messages: [
          {
            role: 'user',
            content: `You are an expert at creating visual prompts for AI image generation.
            Generate a concise, vivid prompt for VEO/DALL-E/Midjourney that matches this narrative.

            Style: ${style}
            Tone: ${tone}
            Script section: "${section}"

            Respond ONLY with valid JSON (no markdown, no extra text):
            {
              "imagePrompt": "detailed vivid image description for AI generation",
              "videoKeywords": ["keyword1", "keyword2", "keyword3"]
            }`,
          },
        ],
      });

      const content = response.content[0].type === 'text' ? response.content[0].text : '{}';
      const parsed = JSON.parse(content);

      prompts.push({
        id: `prompt-${i + 1}`,
        section: i + 1,
        text: section,
        prompt: section,
        imagePrompt: parsed.imagePrompt || section,
        videoKeywords: parsed.videoKeywords || [],
      });
    } catch (error) {
      console.error(`Error generating prompt for section ${i + 1}:`, error);
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
