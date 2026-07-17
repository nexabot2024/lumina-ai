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
        max_tokens: 500,
        messages: [
          {
            role: 'user',
            content: `You are an expert cinematic cinematographer writing ultra-detailed prompts for professional AI video/image generation (VEO, DALL-E, Midjourney).

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
}`,
          },
        ],
      });

      const content = response.content[0].type === 'text' ? response.content[0].text : '{}';

      // Limpiar markdown si Claude lo envuelve en ```json...```
      let cleanContent = content;
      if (content.includes('```json')) {
        cleanContent = content.replace(/```json\n?/g, '').replace(/\n?```/g, '').trim();
      } else if (content.includes('```')) {
        cleanContent = content.replace(/```\n?/g, '').replace(/\n?```/g, '').trim();
      }

      const parsed = JSON.parse(cleanContent);

      if (!parsed.imagePrompt || parsed.imagePrompt.trim().length < 20) {
        throw new Error('imagePrompt es demasiado corto o vacío');
      }

      prompts.push({
        id: `prompt-${i + 1}`,
        section: i + 1,
        text: section,
        prompt: section,
        imagePrompt: parsed.imagePrompt,
        videoKeywords: parsed.videoKeywords || [],
      });
    } catch (error) {
      console.error(`Error generating prompt for section ${i + 1}:`, error);
      // Si falla, reintenta con un prompt más simple
      try {
        const retryResponse = await getClaudeClient().messages.create({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 400,
          messages: [
            {
              role: 'user',
              content: `Create a cinematic prompt for this text:
"${section}"

RESPOND ONLY WITH JSON, NO MARKDOWN:
{"imagePrompt":"detailed cinematographic description with camera movement, lens, lighting, ending with: slightly uneven lighting, natural lens imperfections, real-world wear and texture","videoKeywords":["word1","word2","word3"]}`,
            },
          ],
        });

        const retryContent = retryResponse.content[0].type === 'text' ? retryResponse.content[0].text : '{}';
        let retryClean = retryContent;
        if (retryContent.includes('```')) {
          retryClean = retryContent.replace(/```[a-z]*\n?/g, '').replace(/\n?```/g, '').trim();
        }
        const retryParsed = JSON.parse(retryClean);

        prompts.push({
          id: `prompt-${i + 1}`,
          section: i + 1,
          text: section,
          prompt: section,
          imagePrompt: retryParsed.imagePrompt || section,
          videoKeywords: retryParsed.videoKeywords || [],
        });
      } catch (retryError) {
        console.error(`Retry failed for section ${i + 1}:`, retryError);
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
