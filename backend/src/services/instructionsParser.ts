/**
 * Parsea un archivo JSON de instrucciones de edición para Composición con Remotion — SIN IA:
 * datos estructurados validados con reglas fijas, mismo formato que consume internamente el
 * pipeline de Remotion de este proyecto (ver remotionService.ts / SequenceComposition.tsx),
 * así el archivo es directamente el tipo de dato que la composición espera.
 *
 * Ejemplo:
 * {
 *   "instrucciones": [
 *     { "tipo": "zoom", "item": 1, "valor": "in" },
 *     { "tipo": "texto", "item": 2, "texto": "Bienvenidos al canal", "desde": "0:00", "hasta": "0:02", "posicion": "centro" },
 *     { "tipo": "forma", "item": 2, "forma": "rectangulo", "desde": "0:01", "hasta": "0:03", "posicion": "abajo", "color": "#E63946" },
 *     { "tipo": "transicion", "itemDesde": 2, "itemHasta": 3, "valor": "wipeleft" }
 *   ]
 * }
 */

export type TextPosition = 'centro' | 'arriba' | 'abajo';
export type AnimationOverride = 'zoomin' | 'zoomout' | 'pan' | 'none';
export type TransitionOverride = 'fade' | 'dissolve' | 'wipeleft' | 'wiperight' | 'slideup' | 'slidedown';

export interface ZoomInstruction {
  kind: 'zoom';
  line: number;
  itemIndex: number;
  animation: AnimationOverride;
}
export interface TextInstruction {
  kind: 'texto';
  line: number;
  itemIndex: number;
  text: string;
  startSec: number;
  endSec: number;
  position: TextPosition;
  fontSize?: number;
}
export interface ShapeInstruction {
  kind: 'forma';
  line: number;
  itemIndex: number;
  shape: 'rectangulo';
  startSec: number;
  endSec: number;
  position: TextPosition;
  color?: string;
}
export interface TransitionInstruction {
  kind: 'transicion';
  line: number;
  fromItemIndex: number;
  toItemIndex: number;
  transition: TransitionOverride;
}

export type ParsedInstruction = ZoomInstruction | TextInstruction | ShapeInstruction | TransitionInstruction;

export interface ParseError {
  /** Posición (1-based) dentro del array "instrucciones" — no hay líneas reales en JSON,
   * pero se mantiene el mismo nombre de campo que antes para que el resto del pipeline
   * (mensajes de error, UI) no tenga que distinguir el formato de origen. */
  line: number;
  raw: string;
  message: string;
}

export interface ParseResult {
  instructions: ParsedInstruction[];
  errors: ParseError[];
}

// El usuario escribe "valor: in|out|pan|none" (formato corto, documentado) — se traduce al
// AnimationType interno (zoomin/zoomout/pan/none) que ya usa el resto de la app.
const ZOOM_VALUE_MAP: Record<string, AnimationOverride> = {
  in: 'zoomin',
  out: 'zoomout',
  pan: 'pan',
  none: 'none',
};
const TRANSITION_VALUES: TransitionOverride[] = ['fade', 'dissolve', 'wipeleft', 'wiperight', 'slideup', 'slidedown'];
const POSITION_VALUES: TextPosition[] = ['centro', 'arriba', 'abajo'];

/** Acepta un número (segundos) o un string "ss", "mm:ss" o "h:mm:ss". */
function parseTimeToSeconds(value: unknown): number | null {
  if (typeof value === 'number') return isFinite(value) ? value : null;
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parts = trimmed.split(':').map(p => p.trim());
  if (parts.some(p => p === '' || isNaN(Number(p)))) return null;
  const nums = parts.map(Number);
  if (nums.length === 1) return nums[0];
  if (nums.length === 2) return nums[0] * 60 + nums[1];
  if (nums.length === 3) return nums[0] * 3600 + nums[1] * 60 + nums[2];
  return null;
}

function parseItemIndex(value: unknown, field: string): number {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1) throw new Error(`"${field}" debe ser un número entero >= 1`);
  return n;
}

export function parseInstructionsJson(text: string): ParseResult {
  const instructions: ParsedInstruction[] = [];
  const errors: ParseError[] = [];

  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (err) {
    errors.push({ line: 0, raw: '', message: `JSON inválido: ${err instanceof Error ? err.message : 'error de parseo'}` });
    return { instructions, errors };
  }

  const list = data && typeof data === 'object' ? (data as Record<string, unknown>).instrucciones : undefined;
  if (!Array.isArray(list)) {
    errors.push({ line: 0, raw: '', message: 'El JSON debe tener un array "instrucciones" en la raíz' });
    return { instructions, errors };
  }

  list.forEach((entryRaw, i) => {
    const position = i + 1;
    const entry = entryRaw as Record<string, unknown>;
    const raw = JSON.stringify(entryRaw);
    try {
      if (!entry || typeof entry !== 'object') throw new Error('cada instrucción debe ser un objeto');
      const tipo = entry.tipo;

      if (tipo === 'zoom') {
        const itemIndex = parseItemIndex(entry.item, 'item');
        const valor = String(entry.valor ?? '').toLowerCase();
        const animation = ZOOM_VALUE_MAP[valor];
        if (!animation) throw new Error(`valor="${entry.valor}" inválido — usa una de: ${Object.keys(ZOOM_VALUE_MAP).join(', ')}`);
        instructions.push({ kind: 'zoom', line: position, itemIndex, animation });
        return;
      }

      if (tipo === 'texto') {
        const itemIndex = parseItemIndex(entry.item, 'item');
        if (typeof entry.texto !== 'string' || !entry.texto.trim()) throw new Error('falta "texto" (string no vacío)');
        const startSec = entry.desde !== undefined ? parseTimeToSeconds(entry.desde) : 0;
        const endSec = entry.hasta !== undefined ? parseTimeToSeconds(entry.hasta) : null;
        if (startSec === null) throw new Error(`"desde"=${JSON.stringify(entry.desde)} no es un tiempo válido (usa mm:ss o segundos)`);
        if (endSec === null) throw new Error('falta "hasta" (o no es un tiempo válido)');
        if (endSec <= startSec) throw new Error('"hasta" debe ser mayor que "desde"');
        const pos = (entry.posicion as TextPosition) ?? 'centro';
        if (!POSITION_VALUES.includes(pos)) throw new Error(`posicion="${entry.posicion}" inválida — usa una de: ${POSITION_VALUES.join(', ')}`);
        const fontSize = entry.tamano !== undefined ? Number(entry.tamano) : undefined;
        instructions.push({
          kind: 'texto',
          line: position,
          itemIndex,
          text: entry.texto,
          startSec,
          endSec,
          position: pos,
          fontSize: fontSize !== undefined && !isNaN(fontSize) ? fontSize : undefined,
        });
        return;
      }

      if (tipo === 'forma') {
        const itemIndex = parseItemIndex(entry.item, 'item');
        if (entry.forma !== 'rectangulo') throw new Error(`forma="${entry.forma}" inválida — por ahora solo se admite "rectangulo"`);
        const startSec = entry.desde !== undefined ? parseTimeToSeconds(entry.desde) : 0;
        const endSec = entry.hasta !== undefined ? parseTimeToSeconds(entry.hasta) : null;
        if (startSec === null) throw new Error(`"desde"=${JSON.stringify(entry.desde)} no es un tiempo válido (usa mm:ss o segundos)`);
        if (endSec === null) throw new Error('falta "hasta" (o no es un tiempo válido)');
        if (endSec <= startSec) throw new Error('"hasta" debe ser mayor que "desde"');
        const pos = (entry.posicion as TextPosition) ?? 'centro';
        if (!POSITION_VALUES.includes(pos)) throw new Error(`posicion="${entry.posicion}" inválida — usa una de: ${POSITION_VALUES.join(', ')}`);
        instructions.push({
          kind: 'forma',
          line: position,
          itemIndex,
          shape: 'rectangulo',
          startSec,
          endSec,
          position: pos,
          color: typeof entry.color === 'string' ? entry.color : undefined,
        });
        return;
      }

      if (tipo === 'transicion') {
        const fromItemIndex = parseItemIndex(entry.itemDesde, 'itemDesde');
        const toItemIndex = parseItemIndex(entry.itemHasta, 'itemHasta');
        const transition = entry.valor as TransitionOverride;
        if (!TRANSITION_VALUES.includes(transition)) {
          throw new Error(`valor="${entry.valor}" inválida — usa una de: ${TRANSITION_VALUES.join(', ')}`);
        }
        instructions.push({ kind: 'transicion', line: position, fromItemIndex, toItemIndex, transition });
        return;
      }

      throw new Error(`"tipo"="${tipo}" no reconocido — usa una de: zoom, texto, forma, transicion`);
    } catch (err) {
      errors.push({ line: position, raw, message: err instanceof Error ? err.message : 'error de validación' });
    }
  });

  return { instructions, errors };
}

export function parseInstructionsFile(buffer: Buffer): ParseResult {
  return parseInstructionsJson(buffer.toString('utf-8'));
}
