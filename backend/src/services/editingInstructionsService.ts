import Anthropic from '@anthropic-ai/sdk';
import type { AnimationType, TransitionType } from './clipEditingService.js';

function getClaudeClient(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || apiKey.trim() === '') {
    throw new Error('ANTHROPIC_API_KEY environment variable is missing or empty');
  }
  return new Anthropic({ apiKey });
}

export interface EditingInstructionsResult {
  splitScenes: boolean;
  transitions: { enabled: boolean; type: TransitionType; duration: number };
  animations: { enabled: boolean; type: AnimationType };
  allowClipRepeat: boolean;
  textOverlays: { start: number; end: number; text: string }[];
  summary: string;
}

const INSTRUCTIONS_TOOL = {
  name: 'apply_editing_config',
  description: 'Estructura las instrucciones de edición de video del usuario en una configuración concreta para un pipeline de FFmpeg',
  input_schema: {
    type: 'object' as const,
    properties: {
      splitScenes: {
        type: 'boolean',
        description: 'true si se debe dividir el video en escenas/clips automáticamente (comportamiento por defecto)',
      },
      transitions: {
        type: 'object',
        properties: {
          enabled: { type: 'boolean' },
          type: {
            type: 'string',
            enum: ['fade', 'dissolve', 'wipeleft', 'wiperight', 'slideup', 'slidedown'],
          },
          duration: { type: 'number', description: 'duración de cada transición en segundos, típico 0.3-1' },
        },
        required: ['enabled', 'type', 'duration'],
      },
      animations: {
        type: 'object',
        properties: {
          enabled: { type: 'boolean' },
          type: { type: 'string', enum: ['zoomin', 'zoomout', 'pan', 'none'] },
        },
        required: ['enabled', 'type'],
      },
      allowClipRepeat: {
        type: 'boolean',
        description: 'true si se permite repetir clips cuando el video queda más corto que el audio',
      },
      textOverlays: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            start: { type: 'number' },
            end: { type: 'number' },
            text: { type: 'string' },
          },
          required: ['start', 'end', 'text'],
        },
      },
      summary: {
        type: 'string',
        description: 'Resumen breve en español (2-3 líneas) de lo que se entendió y configuró, para mostrar al usuario antes de procesar',
      },
    },
    required: ['splitScenes', 'transitions', 'animations', 'allowClipRepeat', 'textOverlays', 'summary'],
  },
};

export async function parseEditingInstructions(
  instructions: string,
  context: { knownDurationSeconds?: number } = {}
): Promise<EditingInstructionsResult> {
  const client = getClaudeClient();

  const durationHint = context.knownDurationSeconds
    ? `El audio/video dura aproximadamente ${Math.round(context.knownDurationSeconds)} segundos. Usa esto para calcular tiempos cuando el usuario use referencias relativas como "al principio", "a mitad del video" o "al final".`
    : 'Aún no se conoce la duración exacta. Si el usuario da tiempos relativos sin segundos exactos, usa una estimación razonable y menciónalo en el summary.';

  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 800,
    tools: [INSTRUCTIONS_TOOL],
    tool_choice: { type: 'tool', name: 'apply_editing_config' },
    messages: [
      {
        role: 'user',
        content: `Eres un asistente que traduce instrucciones de edición de video en lenguaje natural (español) a una configuración estructurada para un pipeline de FFmpeg.

Instrucciones del usuario:
"""
${instructions}
"""

${durationHint}

Reglas de interpretación:
- Si menciona dividir/separar escenas o clips -> splitScenes=true. Si no lo menciona, asume true (comportamiento normal).
- Si menciona transiciones (fade, disolvencia, wipe, deslizar, cortes suaves, etc.) -> transitions.enabled=true y elige el tipo más cercano; si no especifica tipo usa "fade"; si no especifica duración usa 0.5.
- Si menciona animaciones, zoom, movimiento de cámara, Ken Burns, paneo -> animations.enabled=true con el tipo correspondiente ("zoomin", "zoomout" o "pan").
- Si menciona que se repitan clips para rellenar duración -> allowClipRepeat=true. Si dice explícitamente que NO se repitan -> allowClipRepeat=false. Si no lo menciona, asume true.
- Si menciona texto en pantalla en momentos concretos -> agrega entradas a textOverlays con los segundos exactos si los da, o una estimación si no los da.
- Escribe un "summary" breve en español explicando qué se configuró, para que el usuario lo revise antes de procesar.`,
      },
    ],
  });

  const toolUse = response.content.find(
    (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use'
  );

  if (!toolUse) {
    throw new Error('Claude no devolvió una configuración estructurada');
  }

  return toolUse.input as EditingInstructionsResult;
}
