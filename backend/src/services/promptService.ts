import Groq from 'groq-sdk';

function getGroqClient(): Groq {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey || apiKey.trim() === '') {
    throw new Error('GROQ_API_KEY environment variable is missing or empty');
  }
  return new Groq({ apiKey });
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
    .split(/\n\s*\n+/) // Divide por párrafos
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
      const response = await getGroqClient().chat.completions.create({
        model: 'openai/gpt-oss-120b',
        messages: [
          {
            role: 'system',
            content: `You are an expert at creating visual prompts for AI image generation.
            Generate concise, vivid prompts for DALL-E/Midjourney that match the narrative.
            Style: ${style}, Tone: ${tone}
            Always respond in valid JSON format.`,
          },
          {
            role: 'user',
            content: `Generate image prompt and video keywords for this script section:
            "${section}"

            Respond with JSON: {
              "imagePrompt": "detailed image description",
              "videoKeywords": ["keyword1", "keyword2", "keyword3"]
            }`,
          },
        ],
        temperature: 0.7,
        max_tokens: 300,
      });

      const content = response.choices[0].message.content || '{}';
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
    const response = await getGroqClient().chat.completions.create({
      model: 'llama-3-70b-versatile',
      messages: [
        {
          role: 'system',
          content: `You are an expert at enhancing prompts for AI image generation.
          Make them more detailed, specific, and visually compelling.`,
        },
        {
          role: 'user',
          content: `Enhance this image prompt with more visual details:
          "${prompt}"
          ${context ? `Context: ${context}` : ''}

          Return only the enhanced prompt, no JSON.`,
        },
      ],
      temperature: 0.7,
      max_tokens: 200,
    });

    return response.choices[0].message.content || prompt;
  } catch (error) {
    console.error('Error enhancing prompt:', error);
    return prompt;
  }
}
