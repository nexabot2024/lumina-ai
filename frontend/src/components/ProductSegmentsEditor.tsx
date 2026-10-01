import { useState } from 'react';
import { Package, Upload, X, Plus, Play, Loader, Activity, RotateCcw, ImagePlus, FileText, Wand2 } from 'lucide-react';
import toast from 'react-hot-toast';
import axios from 'axios';
import CompilationMonitor from './CompilationMonitor';
import ToggleCard from './ToggleCard';
import { API_URL } from '../services/apiUrl';
import { useLocalStorageState } from '../hooks/useLocalStorageState';

interface SegmentImage {
  id: string;
  name: string;
  path: string;
}

interface ProductSegment {
  id: string;
  name: string;
  videoStart: string; // "mm:ss" o "h:mm:ss"
  videoEnd: string;
  assignedMinutes: string;
  images: SegmentImage[];
}

/** Acepta "ss", "mm:ss" o "h:mm:ss"; devuelve segundos, o null si no se pudo interpretar. */
function parseTimeToSeconds(value: string): number | null {
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

function formatMinSec(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}m ${s}s`;
}

/** Convierte segundos a "mm:ss" (o "h:mm:ss" si pasa de una hora), para rellenar los campos de tiempo. */
function formatSecondsToTimeInput(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const ss = String(s).padStart(2, '0');
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${ss}`;
  return `${m}:${ss}`;
}

const BULK_TIME_PATTERN = '\\d{1,2}(?::\\d{2}){1,2}';
const BULK_LEADING_RANGE_RE = new RegExp(
  `^(${BULK_TIME_PATTERN})\\s*[-–]\\s*(${BULK_TIME_PATTERN})\\s*[-–:.)]*\\s*(.+)$`
);
const BULK_TRAILING_RANGE_RE = new RegExp(
  `^(.+?)\\s*[-–:(]*\\s*(${BULK_TIME_PATTERN})\\s*[-–]\\s*(${BULK_TIME_PATTERN})\\)?$`
);

/**
 * Parsea un bloque de texto (una línea por producto) con inicio y fin explícitos — ej.
 * "0:00 - 2:15 Arby's" o "Arby's - 0:00 - 2:15". Los tiempos son del VIDEO (dónde
 * empieza y termina ese producto en el video de referencia), no del audio.
 */
function parseBulkProductLines(text: string): { name: string; startSeconds: number; endSeconds: number }[] {
  const results: { name: string; startSeconds: number; endSeconds: number }[] = [];

  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim();
    if (!line) continue;

    let match = line.match(BULK_LEADING_RANGE_RE);
    if (match) {
      const start = parseTimeToSeconds(match[1]);
      const end = parseTimeToSeconds(match[2]);
      const name = match[3].trim();
      if (start !== null && end !== null && end > start && name) {
        results.push({ name, startSeconds: start, endSeconds: end });
        continue;
      }
    }

    match = line.match(BULK_TRAILING_RANGE_RE);
    if (match) {
      const name = match[1].trim();
      const start = parseTimeToSeconds(match[2]);
      const end = parseTimeToSeconds(match[3]);
      if (start !== null && end !== null && end > start && name) {
        results.push({ name, startSeconds: start, endSeconds: end });
      }
    }
  }

  return results;
}

interface SrtEntry {
  start: number;
  end: number;
  text: string;
}

/** Parsea un .srt a bloques {start, end, text} (segundos). Tolera saltos de línea y "," o "." en los milisegundos. */
function parseSrt(content: string): SrtEntry[] {
  const timeRe = /(\d{2}):(\d{2}):(\d{2})[,.](\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2})[,.](\d{3})/;
  const blocks = content.replace(/\r/g, '').trim().split(/\n\s*\n/);
  const entries: SrtEntry[] = [];

  for (const block of blocks) {
    const lines = block.split('\n');
    const timeLineIdx = lines.findIndex(l => timeRe.test(l));
    if (timeLineIdx === -1) continue;
    const m = lines[timeLineIdx].match(timeRe);
    if (!m) continue;
    const start = Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) + Number(m[4]) / 1000;
    const end = Number(m[5]) * 3600 + Number(m[6]) * 60 + Number(m[7]) + Number(m[8]) / 1000;
    const text = lines.slice(timeLineIdx + 1).join(' ').trim();
    entries.push({ start, end, text });
  }

  return entries;
}

const COMBINING_DIACRITICS_RE = new RegExp('[\\u0300-\\u036f]', 'g');

/** Minúsculas, sin acentos ni apóstrofes/guiones/puntuación, espacios normalizados. */
function normalizeForMatch(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(COMBINING_DIACRITICS_RE, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Para subir imágenes de relleno de todos los productos de una vez: adivina a qué
 * producto pertenece cada archivo por su nombre (ej. "KFC 1.jpg" → producto "KFC").
 * Prioriza el nombre de producto más largo que calce al inicio del nombre de archivo
 * (para no confundir productos cuyo nombre es prefijo de otro); si ninguno calza al
 * inicio, prueba con que el nombre del producto aparezca en cualquier parte. Devuelve
 * -1 si no se pudo identificar.
 */
function matchImageFileToProduct(fileNameNoExt: string, productNames: string[]): number {
  const normalizedFile = normalizeForMatch(fileNameNoExt);
  if (!normalizedFile) return -1;

  let bestIdx = -1;
  let bestLen = -1;
  productNames.forEach((name, idx) => {
    const pn = normalizeForMatch(name);
    if (pn && normalizedFile.startsWith(pn) && pn.length > bestLen) {
      bestIdx = idx;
      bestLen = pn.length;
    }
  });
  if (bestIdx >= 0) return bestIdx;

  productNames.forEach((name, idx) => {
    const pn = normalizeForMatch(name);
    if (pn && normalizedFile.includes(pn) && pn.length > bestLen) {
      bestIdx = idx;
      bestLen = pn.length;
    }
  });
  return bestIdx;
}

/** Acepta "HH:MM:SS,mmm" o "HH:MM:SS.mmm" (formato de .srt). */
function parseSrtStyleTime(value: string): number | null {
  const m = value.trim().match(/^(\d{1,2}):(\d{2}):(\d{2})[,.](\d{1,3})$/);
  if (!m) return null;
  const h = Number(m[1]);
  const mi = Number(m[2]);
  const s = Number(m[3]);
  const ms = Number(m[4].padEnd(3, '0'));
  return h * 3600 + mi * 60 + s + ms / 1000;
}

const RANKING_PREFIX_RE = /^(mejor\s+opci[oó]n\s+)?n[ºo°]\s*\d+\s*[—–-]\s*/i;

/**
 * Parsea bloques del estilo:
 *   Nº 7 — Body Fortress Super Advanced Whey Protein
 *
 *   Inicio: 00:00:10,066
 *   Final: 00:03:09,200
 * (nombre en su propia línea, seguido de "Inicio:"/"Final:" en cualquier orden de
 * líneas en blanco). Quita el prefijo "Nº X —"/"Mejor opción Nº X —" del nombre.
 */
function parseNameStartEndBlocks(text: string): { name: string; startSeconds: number; endSeconds: number }[] {
  const results: { name: string; startSeconds: number; endSeconds: number }[] = [];
  let pendingName: string | null = null;
  let pendingStart: number | null = null;

  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim();
    if (!line) continue;

    const inicioMatch = line.match(/^inicio:?\s*(.+)$/i);
    if (inicioMatch) {
      pendingStart = parseSrtStyleTime(inicioMatch[1]);
      continue;
    }

    const finalMatch = line.match(/^final:?\s*(.+)$/i);
    if (finalMatch) {
      const end = parseSrtStyleTime(finalMatch[1]);
      if (pendingName && pendingStart !== null && end !== null && end > pendingStart) {
        results.push({ name: pendingName, startSeconds: pendingStart, endSeconds: end });
      }
      pendingName = null;
      pendingStart = null;
      continue;
    }

    // Cualquier otra línea no vacía, antes de encontrar su "Inicio:", es el nombre.
    if (pendingStart === null) {
      pendingName = line.replace(RANKING_PREFIX_RE, '').trim();
    }
  }

  return results;
}

/**
 * Para cada nombre de producto, busca su primera mención en los subtítulos (en orden,
 * sin retroceder) y calcula su duración asignada como el tramo hasta que empieza el
 * siguiente producto encontrado (o hasta el final de los subtítulos, para el último).
 * Devuelve null en la posición de los productos que no se pudieron ubicar en el .srt.
 *
 * El guion suele mencionar solo la marca ("Jack in the box") en vez del nombre completo
 * que escribiste ("Jack in the Box Cluck Sandwich") — si el nombre completo no aparece,
 * se prueba recortando palabras desde el final hasta encontrar coincidencia.
 */
function computeDurationsFromSrt(productNames: string[], srtEntries: SrtEntry[]): (number | null)[] {
  const normalizedEntries = srtEntries.map(e => normalizeForMatch(e.text));
  let searchFrom = 0;
  const starts: (number | null)[] = productNames.map(name => {
    const words = normalizeForMatch(name).split(' ').filter(Boolean);
    if (words.length === 0) return null;

    for (let len = words.length; len >= 1; len--) {
      const needle = words.slice(0, len).join(' ');
      for (let i = searchFrom; i < normalizedEntries.length; i++) {
        if (normalizedEntries[i].includes(needle)) {
          searchFrom = i + 1;
          return srtEntries[i].start;
        }
      }
    }
    return null;
  });

  const srtEnd = srtEntries.length > 0 ? srtEntries[srtEntries.length - 1].end : null;
  const foundStarts = starts.filter((s): s is number => s !== null);
  const lastFoundStart = foundStarts.length > 0 ? foundStarts[foundStarts.length - 1] : null;

  return starts.map((start, i) => {
    if (start === null) return null;
    const nextStart = starts.slice(i + 1).find((s): s is number => s !== null);
    if (nextStart !== undefined) return nextStart - start;
    // Es el último producto encontrado: se extiende hasta el final de los subtítulos.
    if (start === lastFoundStart && srtEnd !== null) return Math.max(0.1, srtEnd - start);
    return null;
  });
}

export default function ProductSegmentsEditor() {
  const [referenceVideo, setReferenceVideo] = useState<{ name: string; path: string; duration?: number } | null>(null);
  const [audioFile, setAudioFile] = useState<{ name: string; path: string; duration?: number } | null>(null);
  const [segments, setSegments] = useState<ProductSegment[]>([]);
  const [splitScenes, setSplitScenes] = useState(false);
  const [srtFile, setSrtFile] = useState<{ name: string; entries: SrtEntry[] } | null>(null);
  const [bulkText, setBulkText] = useState('');
  const [durationBlockText, setDurationBlockText] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showMonitor, setShowMonitor] = useLocalStorageState('lumina-job-productSegments-monitorOpen', false);
  const [currentJobId, setCurrentJobId] = useLocalStorageState('lumina-job-productSegments', '');

  const uploadFile = async (file: File): Promise<{ name: string; path: string; duration?: number }> => {
    const formData = new FormData();
    formData.append('file', file);
    const response = await axios.post(`${API_URL}/api/upload`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return { name: file.name, path: response.data.file.path, duration: response.data.file.duration };
  };

  const handleVideoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.[0]) return;
    setIsUploading(true);
    try {
      setReferenceVideo(await uploadFile(e.target.files[0]));
    } catch {
      toast.error('Error al subir el video de referencia');
    } finally {
      setIsUploading(false);
      e.target.value = '';
    }
  };

  const handleAudioUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.[0]) return;
    setIsUploading(true);
    try {
      setAudioFile(await uploadFile(e.target.files[0]));
    } catch {
      toast.error('Error al subir el audio');
    } finally {
      setIsUploading(false);
      e.target.value = '';
    }
  };

  const handleSrtUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const entries = parseSrt(String(reader.result || ''));
      if (entries.length === 0) {
        toast.error('No se pudo leer el .srt (¿está vacío o mal formado?)');
        return;
      }
      setSrtFile({ name: file.name, entries });
      toast.success(`${file.name} leído: ${entries.length} bloques de subtítulos`);
    };
    reader.onerror = () => toast.error('Error al leer el archivo .srt');
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleApplySrtDurations = () => {
    if (!srtFile) return;
    if (segments.length === 0 || segments.some(s => !s.name.trim())) {
      toast.error('Ponle nombre a todos los productos antes de calcular con el .srt');
      return;
    }

    const durations = computeDurationsFromSrt(segments.map(s => s.name), srtFile.entries);
    const unmatched = segments.filter((_, i) => durations[i] === null).map(s => s.name);

    setSegments(prev =>
      prev.map((s, i) => (durations[i] !== null ? { ...s, assignedMinutes: ((durations[i] as number) / 60).toFixed(2) } : s))
    );

    const matchedCount = segments.length - unmatched.length;
    if (matchedCount > 0) toast.success(`Duración calculada para ${matchedCount} producto(s) desde el .srt`);
    if (unmatched.length > 0) {
      toast.error(`No se encontraron en el .srt (revísalos a mano): ${unmatched.join(', ')}`, { duration: 6000 });
    }
  };

  /**
   * Para cuando ya tienes, de otra fuente, el nombre + inicio/fin de cada producto EN EL
   * AUDIO (ej. le pediste a otra IA que leyera tu .srt y te diera esto). Rellena la
   * "duración asignada" de los productos existentes que coincidan por nombre, y crea uno
   * nuevo (sin tramo de video, hay que ponerlo a mano) para los que no coincidan con ninguno.
   */
  const handleApplyDurationBlock = () => {
    const parsed = parseNameStartEndBlocks(durationBlockText);
    if (parsed.length === 0) {
      toast.error('No se pudo interpretar el bloque. Revisa que tenga "Inicio:" y "Final:" por producto.');
      return;
    }

    let updatedCount = 0;
    let createdCount = 0;
    const newSegments = [...segments];

    for (const item of parsed) {
      const needle = normalizeForMatch(item.name);
      const minutes = (item.endSeconds - item.startSeconds) / 60;
      const idx = newSegments.findIndex(s => normalizeForMatch(s.name) === needle);
      if (idx >= 0) {
        newSegments[idx] = { ...newSegments[idx], assignedMinutes: minutes.toFixed(2) };
        updatedCount++;
      } else {
        newSegments.push({
          id: Math.random().toString(),
          name: item.name,
          videoStart: '',
          videoEnd: '',
          assignedMinutes: minutes.toFixed(2),
          images: [],
        });
        createdCount++;
      }
    }

    setSegments(newSegments);
    setDurationBlockText('');
    toast.success(
      `Duración asignada rellenada: ${updatedCount} producto(s) actualizados` +
        (createdCount > 0 ? `, ${createdCount} nuevo(s) creados (falta ponerles el tramo de video)` : '')
    );
  };

  const handleApplyBulk = () => {
    const parsed = parseBulkProductLines(bulkText);
    if (parsed.length === 0) {
      toast.error('No se pudo interpretar ninguna línea. Formato esperado: "0:00 - 2:15 Arby\'s" (una por línea).');
      return;
    }

    const newSegments: ProductSegment[] = parsed.map(item => ({
      id: Math.random().toString(),
      name: item.name,
      videoStart: formatSecondsToTimeInput(item.startSeconds),
      videoEnd: formatSecondsToTimeInput(item.endSeconds),
      assignedMinutes: '',
      images: [],
    }));

    setSegments(newSegments);
    setBulkText('');
    toast.success(`${newSegments.length} producto(s) creados desde el bloque — reemplazaron la lista anterior`);
  };

  const handleAddSegment = () => {
    setSegments(prev => [
      ...prev,
      { id: Math.random().toString(), name: '', videoStart: '', videoEnd: '', assignedMinutes: '', images: [] },
    ]);
  };

  const handleRemoveSegment = (id: string) => {
    setSegments(prev => prev.filter(s => s.id !== id));
  };

  const handleSegmentField = (id: string, field: 'name' | 'videoStart' | 'videoEnd' | 'assignedMinutes', value: string) => {
    setSegments(prev => prev.map(s => (s.id === id ? { ...s, [field]: value } : s)));
  };

  const handleSegmentImagesUpload = async (id: string, e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    const files = Array.from(e.target.files);
    setIsUploading(true);
    try {
      for (const file of files) {
        const uploaded = await uploadFile(file);
        setSegments(prev =>
          prev.map(s =>
            s.id === id
              ? { ...s, images: [...s.images, { id: Math.random().toString(), name: uploaded.name, path: uploaded.path }] }
              : s
          )
        );
      }
    } catch {
      toast.error('Error al subir imagen(es) de relleno');
    } finally {
      setIsUploading(false);
      e.target.value = '';
    }
  };

  const handleRemoveSegmentImage = (segmentId: string, imageId: string) => {
    setSegments(prev =>
      prev.map(s => (s.id === segmentId ? { ...s, images: s.images.filter(img => img.id !== imageId) } : s))
    );
  };

  /**
   * Sube muchas imágenes de golpe y las reparte entre los productos adivinando por el
   * nombre del archivo (ej. "KFC 1.jpg", "KFC 2.jpg", "Wendys 1.jpg" → se van a los
   * productos "KFC" y "Wendys"). Los productos ya tienen que existir con su nombre puesto.
   */
  const handleBulkImagesUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    if (segments.length === 0 || segments.some(s => !s.name.trim())) {
      toast.error('Agrega los productos (con nombre) antes de subir imágenes en bloque');
      e.target.value = '';
      return;
    }

    const files = Array.from(e.target.files);
    const productNames = segments.map(s => s.name);
    const unmatched: string[] = [];
    let matchedCount = 0;

    setIsUploading(true);
    try {
      for (const file of files) {
        const nameNoExt = file.name.replace(/\.[^./]+$/, '');
        const idx = matchImageFileToProduct(nameNoExt, productNames);
        if (idx === -1) {
          unmatched.push(file.name);
          continue;
        }
        const uploaded = await uploadFile(file);
        const targetId = segments[idx].id;
        setSegments(prev =>
          prev.map(s =>
            s.id === targetId
              ? { ...s, images: [...s.images, { id: Math.random().toString(), name: uploaded.name, path: uploaded.path }] }
              : s
          )
        );
        matchedCount++;
      }
    } catch {
      toast.error('Error al subir alguna de las imágenes');
    } finally {
      setIsUploading(false);
      e.target.value = '';
    }

    if (matchedCount > 0) toast.success(`${matchedCount} imagen(es) asignadas a sus productos por nombre de archivo`);
    if (unmatched.length > 0) {
      toast.error(`No se pudo identificar el producto de: ${unmatched.join(', ')} (súbelas a mano en su fila)`, {
        duration: 7000,
      });
    }
  };

  const totalAssignedSeconds = segments.reduce((sum, s) => sum + (parseFloat(s.assignedMinutes) || 0) * 60, 0);

  const handleProcess = async () => {
    if (!referenceVideo) {
      toast.error('Sube el video de referencia');
      return;
    }
    if (!audioFile) {
      toast.error('Sube el audio de narración');
      return;
    }
    if (segments.length === 0) {
      toast.error('Agrega al menos un producto');
      return;
    }

    const parsedSegments = [];
    for (const s of segments) {
      if (!s.name.trim()) {
        toast.error('Todos los productos necesitan un nombre');
        return;
      }
      const start = parseTimeToSeconds(s.videoStart);
      const end = parseTimeToSeconds(s.videoEnd);
      if (start === null || end === null || end <= start) {
        toast.error(`"${s.name}": revisa el tramo de video (inicio/fin, formato mm:ss)`);
        return;
      }
      const assignedMinutes = parseFloat(s.assignedMinutes);
      if (isNaN(assignedMinutes) || assignedMinutes <= 0) {
        toast.error(`"${s.name}": falta la duración asignada`);
        return;
      }
      parsedSegments.push({
        name: s.name.trim(),
        videoStart: start,
        videoEnd: end,
        assignedDurationSeconds: assignedMinutes * 60,
        imagePaths: s.images.map(img => img.path),
      });
    }

    const jobId = `product-segments-${Date.now()}`;
    setCurrentJobId(jobId);
    setShowMonitor(true);
    setIsProcessing(true);

    try {
      await axios.post(`${API_URL}/api/clip-editing/process-segments`, {
        jobId,
        videoPath: referenceVideo.path,
        audioPath: audioFile.path,
        segments: parsedSegments,
        splitScenes,
      });
      toast.success('Procesamiento iniciado, revisa el monitor');
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Error al iniciar el procesamiento');
      setIsProcessing(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="card-lg">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-3 card-icon">
            <Package className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="card-title">Por producto</h2>
            <p className="card-subtitle">
              Recopilaciones de productos: cada producto usa su propio tramo del video, en orden, sin reordenar — y se completa con sus propias imágenes si le falta tiempo
            </p>
          </div>
        </div>

        {/* Reference video (single) */}
        <div className="mb-6">
          <label className="block text-sm font-semibold mb-2">Video de referencia (uno solo)</label>
          {referenceVideo ? (
            <div className="flex items-center gap-3 bg-gray-50 dark:bg-zinc-950 border border-gray-200 dark:border-zinc-800 rounded-xl p-3">
              <span className="flex-1 text-sm text-gray-900 dark:text-zinc-100 truncate">
                {referenceVideo.name}{referenceVideo.duration ? ` — ${formatMinSec(referenceVideo.duration)}` : ''}
              </span>
              <button onClick={() => setReferenceVideo(null)} className="text-gray-500 dark:text-zinc-400 hover:text-red-500">
                <X size={16} />
              </button>
            </div>
          ) : (
            <div className="border border-dashed border-gray-300 dark:border-zinc-700 bg-gray-50 dark:bg-zinc-900/50 rounded-xl p-4 text-center hover:border-gray-400 dark:hover:border-zinc-500 transition-colors">
              <input
                type="file"
                accept="video/*"
                onChange={handleVideoUpload}
                className="hidden"
                id="segments-video-input"
                disabled={isUploading}
              />
              <label htmlFor="segments-video-input" className="cursor-pointer">
                <Upload className="mx-auto mb-2 text-accent-500 dark:text-accent-400" size={24} />
                <span className="text-sm text-gray-600 dark:text-zinc-400">Subir el video que muestra todos los productos, en orden</span>
              </label>
            </div>
          )}
        </div>

        {/* Audio */}
        <div className="mb-6">
          <label className="block text-sm font-semibold mb-2">Audio de narración</label>
          {audioFile ? (
            <div className="flex items-center gap-3 bg-gray-50 dark:bg-zinc-950 border border-gray-200 dark:border-zinc-800 rounded-xl p-3">
              <span className="flex-1 text-sm text-gray-900 dark:text-zinc-100 truncate">
                {audioFile.name}{audioFile.duration ? ` — ${formatMinSec(audioFile.duration)}` : ''}
              </span>
              <button onClick={() => setAudioFile(null)} className="text-gray-500 dark:text-zinc-400 hover:text-red-500">
                <X size={16} />
              </button>
            </div>
          ) : (
            <div className="border border-dashed border-gray-300 dark:border-zinc-700 bg-gray-50 dark:bg-zinc-900/50 rounded-xl p-4 text-center hover:border-gray-400 dark:hover:border-zinc-500 transition-colors">
              <input
                type="file"
                accept="audio/*"
                onChange={handleAudioUpload}
                className="hidden"
                id="segments-audio-input"
                disabled={isUploading}
              />
              <label htmlFor="segments-audio-input" className="cursor-pointer">
                <Upload className="mx-auto mb-2 text-accent-500 dark:text-accent-400" size={24} />
                <span className="text-sm text-gray-600 dark:text-zinc-400">Subir audio de narración completo</span>
              </label>
            </div>
          )}
        </div>

        {/* Split scenes within each product's segment */}
        <div className="mb-6">
          <ToggleCard
            checked={splitScenes}
            onChange={setSplitScenes}
            title="Desagrupar y reordenar clips dentro de cada producto"
            description="Igual que en Cola de Edición: detecta escenas dentro del tramo de cada producto y las reordena por pares. El orden de los productos entre sí no cambia."
          />
        </div>

        {/* SRT: calcular duración asignada automáticamente */}
        <div className="mb-6 p-4 bg-gray-50 dark:bg-zinc-950 border border-gray-200 dark:border-zinc-800 rounded-2xl">
          <p className="text-xs text-gray-500 dark:text-zinc-400 mb-3">
            Opcional: sube el .srt de tu narración para calcular automáticamente la "duración asignada" de cada
            producto (busca dónde se menciona por primera vez el nombre de cada uno). No reemplaza el tramo de
            video — eso lo sigues poniendo tú.
          </p>
          <div className="flex items-center gap-3 flex-wrap">
            <label className="inline-flex items-center gap-2 btn-secondary py-2 px-4 text-sm cursor-pointer">
              <FileText size={16} />
              {srtFile ? srtFile.name : 'Subir archivo .srt'}
              <input type="file" accept=".srt" onChange={handleSrtUpload} className="hidden" />
            </label>
            {srtFile && (
              <>
                <button onClick={handleApplySrtDurations} className="btn-primary py-2 px-4 text-sm flex items-center gap-2">
                  <Wand2 size={16} /> Calcular duraciones con el .srt
                </button>
                <button onClick={() => setSrtFile(null)} className="text-gray-500 dark:text-zinc-400 hover:text-red-500">
                  <X size={16} />
                </button>
              </>
            )}
          </div>
        </div>

        {/* Duración asignada en bloque, a partir de nombre+inicio+fin ya calculados (del audio) */}
        <div className="mb-6 p-4 bg-gray-50 dark:bg-zinc-950 border border-gray-200 dark:border-zinc-800 rounded-2xl">
          <label className="block text-sm font-semibold mb-2">Duración asignada en bloque (opcional)</label>
          <p className="text-xs text-gray-500 dark:text-zinc-400 mb-3">
            Si ya tienes, de otra fuente, el nombre y el inicio/fin de cada producto <strong>en el audio</strong>,
            pégalo aquí en vez de subir el .srt. Rellena la duración asignada de los productos que coincidan por
            nombre (y crea los que falten, sin tramo de video — eso lo pones tú aparte):
          </p>
          <pre className="text-[11px] text-gray-600 dark:text-zinc-400 bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-lg p-2 mb-3 whitespace-pre-wrap">
{`Nº 7 — Body Fortress Super Advanced Whey Protein\n\nInicio: 00:00:10,066\nFinal: 00:03:09,200`}
          </pre>
          <textarea
            value={durationBlockText}
            onChange={(e) => setDurationBlockText(e.target.value)}
            placeholder={'Nº 7 — Body Fortress Super Advanced Whey Protein\n\nInicio: 00:00:10,066\nFinal: 00:03:09,200'}
            rows={5}
            className="w-full px-3 py-2 bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 text-gray-900 dark:text-zinc-100 placeholder-gray-400 dark:placeholder-zinc-600 text-sm font-mono-ui rounded-lg focus:border-accent-500 dark:focus:border-accent-600 focus:outline-none resize-none mb-3"
          />
          <button onClick={handleApplyDurationBlock} className="btn-primary py-2 px-4 text-sm flex items-center gap-2">
            <Wand2 size={16} /> Rellenar duración asignada desde este bloque
          </button>
        </div>

        {/* Bulk create from timestamps */}
        <div className="mb-6 p-4 bg-gray-50 dark:bg-zinc-950 border border-gray-200 dark:border-zinc-800 rounded-2xl">
          <label className="block text-sm font-semibold mb-2">Crear productos en bloque (opcional)</label>
          <p className="text-xs text-gray-500 dark:text-zinc-400 mb-3">
            En vez de agregar los productos uno por uno, pega aquí una línea por producto con el inicio y el fin
            donde aparece <strong>en tu video</strong> (no en el audio):
          </p>
          <pre className="text-[11px] text-gray-600 dark:text-zinc-400 bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-lg p-2 mb-3 whitespace-pre-wrap">
{`0:00 - 2:15 Arby's\n2:15 - 4:30 Jack in the Box Cluck Sandwich\n4:30 - 6:45 Sonic Crispy Chicken Sandwich`}
          </pre>
          <p className="text-xs text-gray-500 dark:text-zinc-400 mb-3">
            Esto reemplaza la lista de productos actual.
          </p>
          <textarea
            value={bulkText}
            onChange={(e) => setBulkText(e.target.value)}
            placeholder={"0:00 - 2:15 Arby's\n2:15 - 4:30 Jack in the Box Cluck Sandwich\n4:30 - 6:45 Sonic Crispy Chicken Sandwich"}
            rows={4}
            className="w-full px-3 py-2 bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 text-gray-900 dark:text-zinc-100 placeholder-gray-400 dark:placeholder-zinc-600 text-sm font-mono-ui rounded-lg focus:border-accent-500 dark:focus:border-accent-600 focus:outline-none resize-none mb-3"
          />
          <button onClick={handleApplyBulk} className="btn-primary py-2 px-4 text-sm flex items-center gap-2">
            <Wand2 size={16} /> Crear productos desde este bloque
          </button>
        </div>

        {/* Products */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <label className="block text-sm font-semibold">Productos</label>
            {audioFile?.duration && segments.length > 0 && (
              <span className="text-xs text-gray-500 dark:text-zinc-400">
                Asignado: {formatMinSec(totalAssignedSeconds)} de {formatMinSec(audioFile.duration)} de audio
              </span>
            )}
          </div>

          {segments.length > 0 && (
            <div className="mb-3 p-3 bg-gray-50 dark:bg-zinc-950 border border-gray-200 dark:border-zinc-800 rounded-xl">
              <label className="inline-flex items-center gap-2 btn-secondary py-2 px-4 text-sm cursor-pointer">
                <ImagePlus size={16} />
                Subir imágenes de relleno de todos los productos a la vez
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handleBulkImagesUpload}
                  className="hidden"
                  disabled={isUploading}
                />
              </label>
              <p className="text-xs text-gray-500 dark:text-zinc-400 mt-2">
                El nombre del archivo tiene que empezar con (o contener) el nombre del producto — ej. "KFC 1.jpg",
                "KFC 2.jpg", "Wendys 1.jpg" — para que el sistema sepa a cuál asignar cada una.
              </p>
            </div>
          )}

          <div className="space-y-3">
            {segments.map((seg, idx) => (
              <div key={seg.id} className="bg-gray-50 dark:bg-zinc-950 border border-gray-200 dark:border-zinc-800 rounded-2xl p-4">
                <div className="flex items-center gap-3 mb-3">
                  <span className="text-xs font-bold text-accent-600 dark:text-accent-400 w-6">{idx + 1}</span>
                  <input
                    type="text"
                    value={seg.name}
                    onChange={(e) => handleSegmentField(seg.id, 'name', e.target.value)}
                    placeholder="Nombre del producto (ej. KFC)"
                    className="flex-1 px-3 py-2 bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-lg text-sm text-gray-900 dark:text-zinc-100 focus:border-accent-500 dark:focus:border-accent-600 focus:outline-none"
                  />
                  <button onClick={() => handleRemoveSegment(seg.id)} className="text-gray-500 dark:text-zinc-400 hover:text-red-500">
                    <X size={16} />
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
                  <div>
                    <label className="block text-xs text-gray-500 dark:text-zinc-400 mb-1">Video: inicio (mm:ss)</label>
                    <input
                      type="text"
                      value={seg.videoStart}
                      onChange={(e) => handleSegmentField(seg.id, 'videoStart', e.target.value)}
                      placeholder="0:00"
                      className="w-full px-2 py-1.5 bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-lg text-sm text-gray-900 dark:text-zinc-100 focus:border-accent-500 dark:focus:border-accent-600 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 dark:text-zinc-400 mb-1">Video: fin (mm:ss)</label>
                    <input
                      type="text"
                      value={seg.videoEnd}
                      onChange={(e) => handleSegmentField(seg.id, 'videoEnd', e.target.value)}
                      placeholder="2:15"
                      className="w-full px-2 py-1.5 bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-lg text-sm text-gray-900 dark:text-zinc-100 focus:border-accent-500 dark:focus:border-accent-600 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 dark:text-zinc-400 mb-1">Duración asignada (min)</label>
                    <input
                      type="number"
                      min="0.1"
                      step="0.1"
                      value={seg.assignedMinutes}
                      onChange={(e) => handleSegmentField(seg.id, 'assignedMinutes', e.target.value)}
                      placeholder="3"
                      className="w-full px-2 py-1.5 bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-lg text-sm text-gray-900 dark:text-zinc-100 focus:border-accent-500 dark:focus:border-accent-600 focus:outline-none"
                    />
                  </div>
                </div>

                <div className="pl-9">
                  {seg.images.length > 0 && (
                    <div className="flex flex-wrap gap-2 mb-2">
                      {seg.images.map(img => (
                        <div key={img.id} className="flex items-center gap-1.5 bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-full pl-2.5 pr-1.5 py-1">
                          <span className="text-xs text-gray-700 dark:text-zinc-300 truncate max-w-[10rem]">{img.name}</span>
                          <button onClick={() => handleRemoveSegmentImage(seg.id, img.id)} className="text-gray-400 dark:text-zinc-500 hover:text-red-500">
                            <X size={12} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  <label className="inline-flex items-center gap-1.5 text-xs text-accent-600 dark:text-accent-400 hover:underline cursor-pointer">
                    <ImagePlus size={14} />
                    Imágenes de relleno de {seg.name || 'este producto'} (opcional)
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      onChange={(e) => handleSegmentImagesUpload(seg.id, e)}
                      className="hidden"
                      disabled={isUploading}
                    />
                  </label>
                </div>
              </div>
            ))}
          </div>

          <button
            onClick={handleAddSegment}
            className="mt-3 flex items-center gap-2 text-sm text-accent-600 hover:text-accent-700 dark:text-accent-400 dark:hover:text-accent-300"
          >
            <Plus size={16} /> Añadir producto
          </button>
        </div>

        {/* Process button */}
        <div className="flex gap-3">
          <button
            onClick={handleProcess}
            disabled={isProcessing || segments.length === 0}
            className="btn-primary flex-1 flex items-center justify-center gap-2"
          >
            {isProcessing ? <Loader className="w-5 h-5 animate-spin" /> : <Play className="w-5 h-5" />}
            {isProcessing ? 'Procesando...' : '📦 Procesar por producto'}
          </button>
          {(isProcessing || !!currentJobId) && (
            <button
              onClick={() => setShowMonitor(!showMonitor)}
              className="btn-secondary flex items-center justify-center gap-2 px-6"
            >
              <Activity className="w-5 h-5" />
              Monitor
            </button>
          )}
          {!isProcessing && !!currentJobId && (
            <button
              onClick={() => { setCurrentJobId(''); setShowMonitor(false); }}
              className="btn-secondary flex items-center justify-center gap-2 px-4"
              title="Cerrar el monitor de este trabajo"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      <CompilationMonitor
        projectId={currentJobId}
        isOpen={showMonitor}
        onClose={() => setShowMonitor(false)}
        statusEndpoint="/api/clip-editing/status"
        title="Monitor: Por producto"
      />
    </div>
  );
}
