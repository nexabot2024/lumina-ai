import { useState } from 'react';
import { Wand2, X, Play, Loader, RotateCcw, Music, Image as ImageIcon, Film, FileText } from 'lucide-react';
import toast from 'react-hot-toast';
import axios from 'axios';
import { API_URL } from '../services/apiUrl';
import CompilationMonitor from './CompilationMonitor';
import { useLocalStorageState } from '../hooks/useLocalStorageState';

type ItemType = 'image' | 'video';
type Engine = 'ffmpeg' | 'remotion';

interface SequenceItem {
  id: string;
  name: string;
  path: string;
  type: ItemType;
  /** Solo para videos: detecta escenas y las reordena/mezcla antes de usarlo — igual que
   * "desagrupar" en Cola de Edición, pero acotado a este item dentro de la composición. */
  splitScenes?: boolean;
}

interface UploadedAudio {
  name: string;
  path: string;
  duration: number;
}

interface ParsedInstructionsSummary {
  fileName: string;
  instructionsPath: string;
  counts: Record<string, number>;
  errors: { line: number; message: string }[];
}

const INSTRUCTION_KIND_LABELS: Record<string, string> = {
  zoom: 'zoom',
  texto: 'texto',
  forma: 'forma',
  transicion: 'transición',
};

type DurationMode = 'total' | 'perImage';

const UPLOAD_CONCURRENCY = 8;

interface UploadFailure {
  name: string;
  reason: string;
}

async function uploadInBatches(
  files: File[],
  type: ItemType,
  onProgress: (done: number, total: number) => void
): Promise<{ uploaded: SequenceItem[]; failed: UploadFailure[] }> {
  const uploaded: SequenceItem[] = [];
  const failed: UploadFailure[] = [];
  let done = 0;
  for (let i = 0; i < files.length; i += UPLOAD_CONCURRENCY) {
    const chunk = files.slice(i, i + UPLOAD_CONCURRENCY);
    const settled = await Promise.allSettled(
      chunk.map(async file => {
        const formData = new FormData();
        formData.append('file', file);
        const response = await axios.post(`${API_URL}/api/upload`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
        return { id: Math.random().toString(), name: file.name, path: response.data.file.path, type };
      })
    );
    settled.forEach((result, idx) => {
      if (result.status === 'fulfilled') {
        uploaded.push(result.value);
      } else {
        const reason =
          result.reason?.response?.data?.error || result.reason?.message || 'Error desconocido';
        failed.push({ name: chunk[idx].name, reason });
      }
    });
    done += chunk.length;
    onProgress(done, files.length);
  }
  return { uploaded, failed };
}

export default function RemotionComposer() {
  const [engine, setEngine] = useState<Engine>('remotion');
  const [items, setItems] = useState<SequenceItem[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isUploadingVideos, setIsUploadingVideos] = useState(false);
  const [videoUploadProgress, setVideoUploadProgress] = useState({ done: 0, total: 0 });
  const [uploadProgress, setUploadProgress] = useState({ done: 0, total: 0 });
  const [durationMode, setDurationMode] = useState<DurationMode>('total');
  const [totalHours, setTotalHours] = useState(0.05);
  const [perImageSeconds, setPerImageSeconds] = useState(5);
  const [resolution, setResolution] = useState<'720p' | '1080p' | '2k' | '4k'>('1080p');
  const [randomMode, setRandomMode] = useState(false);
  const [fullShuffle, setFullShuffle] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [jobId, setJobId] = useLocalStorageState('lumina-job-remotionComposer', '');
  const [showMonitor, setShowMonitor] = useLocalStorageState('lumina-job-remotionComposer-monitorOpen', false);
  const [audio, setAudio] = useState<UploadedAudio | null>(null);
  const [isUploadingAudio, setIsUploadingAudio] = useState(false);
  const [syncWithAudio, setSyncWithAudio] = useState(false);
  const [instructions, setInstructions] = useState<ParsedInstructionsSummary | null>(null);
  const [isUploadingInstructions, setIsUploadingInstructions] = useState(false);

  const handleReset = () => {
    setJobId('');
    setShowMonitor(false);
    setItems([]);
    setAudio(null);
    setSyncWithAudio(false);
    setInstructions(null);
  };

  const audioSyncActive = syncWithAudio && !!audio;
  const estimatedTotalSeconds = audioSyncActive
    ? audio!.duration
    : durationMode === 'total'
      ? totalHours * 3600
      : perImageSeconds * items.length;

  const handleImagesUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    const selected = Array.from(e.target.files);
    setIsUploading(true);
    setUploadProgress({ done: 0, total: selected.length });
    try {
      const { uploaded, failed } = await uploadInBatches(selected, 'image', (done, total) => setUploadProgress({ done, total }));
      if (uploaded.length > 0) {
        setItems(prev => [...prev, ...uploaded]);
        toast.success(`${uploaded.length} imagen(es) añadida(s)`);
      }
      if (failed.length > 0) {
        console.error('Imágenes que fallaron:', failed);
        const uniqueReasons = Array.from(new Set(failed.map(f => f.reason)));
        toast.error(
          `${failed.length} imagen(es) no se pudieron subir: ${uniqueReasons.join(', ')}`,
          { duration: 6000 }
        );
      }
    } catch (error) {
      toast.error('Error al subir imágenes');
      console.error(error);
    } finally {
      setIsUploading(false);
      e.target.value = '';
    }
  };

  const handleVideosUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    const selected = Array.from(e.target.files);
    setIsUploadingVideos(true);
    setVideoUploadProgress({ done: 0, total: selected.length });
    try {
      const { uploaded, failed } = await uploadInBatches(selected, 'video', (done, total) => setVideoUploadProgress({ done, total }));
      if (uploaded.length > 0) {
        setItems(prev => [...prev, ...uploaded]);
        toast.success(`${uploaded.length} video(s) añadido(s) (sin sonido)`);
      }
      if (failed.length > 0) {
        console.error('Videos que fallaron:', failed);
        const uniqueReasons = Array.from(new Set(failed.map(f => f.reason)));
        toast.error(
          `${failed.length} video(s) no se pudieron subir: ${uniqueReasons.join(', ')}`,
          { duration: 6000 }
        );
      }
    } catch (error) {
      toast.error('Error al subir videos');
      console.error(error);
    } finally {
      setIsUploadingVideos(false);
      e.target.value = '';
    }
  };

  const handleClearItems = () => setItems([]);
  const handleRemoveItem = (id: string) => setItems(prev => prev.filter(i => i.id !== id));
  const handleToggleSplitScenes = (id: string) =>
    setItems(prev => prev.map(i => (i.id === id ? { ...i, splitScenes: !i.splitScenes } : i)));

  const handleAudioUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploadingAudio(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const response = await axios.post(`${API_URL}/api/upload`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      const { path, duration } = response.data.file;
      if (!duration) {
        toast.error('No se pudo detectar la duración del audio');
        return;
      }
      setAudio({ name: file.name, path, duration });
      setSyncWithAudio(true);
      toast.success('Audio cargado — duración detectada: ' + formatHM(duration));
    } catch (error: any) {
      toast.error(error?.response?.data?.error || 'Error al subir el audio');
    } finally {
      setIsUploadingAudio(false);
      e.target.value = '';
    }
  };

  const handleRemoveAudio = () => {
    setAudio(null);
    setSyncWithAudio(false);
  };

  const handleInstructionsUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploadingInstructions(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const response = await axios.post(`${API_URL}/api/remotion-composer/parse-instructions`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      const { instructions: parsed, errors, instructionsPath } = response.data;
      const counts: Record<string, number> = {};
      for (const instr of parsed) counts[instr.kind] = (counts[instr.kind] || 0) + 1;
      setInstructions({ fileName: file.name, instructionsPath, counts, errors });
      if (errors.length > 0) {
        toast.error(`${errors.length} instrucción(es) del archivo no se pudieron interpretar — revisa el resumen`, { duration: 6000 });
      } else {
        toast.success(`${parsed.length} instrucción(es) de edición cargadas`);
      }
    } catch (error: any) {
      toast.error(error?.response?.data?.error || 'Error al leer el archivo de instrucciones');
    } finally {
      setIsUploadingInstructions(false);
      e.target.value = '';
    }
  };

  const handleRemoveInstructions = () => setInstructions(null);

  const handleStart = async () => {
    if (items.length === 0) {
      toast.error('Sube al menos una imagen o video');
      return;
    }

    const newJobId = `remotion-composer-${Date.now()}`;
    setIsStarting(true);
    try {
      await axios.post(`${API_URL}/api/remotion-composer/start`, {
        jobId: newJobId,
        engine,
        items: items.map(i => ({ path: i.path, type: i.type, splitScenes: i.type === 'video' ? !!i.splitScenes : undefined })),
        resolution,
        randomMode,
        fullShuffle,
        ...(instructions ? { instructionsPath: instructions.instructionsPath } : {}),
        ...(audioSyncActive
          ? { totalDurationSeconds: audio!.duration, audioPath: audio!.path }
          : durationMode === 'total'
            ? { totalDurationSeconds: totalHours * 3600 }
            : { perImageDuration: perImageSeconds }),
      });
      setJobId(newJobId);
      setShowMonitor(true);
      toast.success(`Procesamiento iniciado (${engine === 'remotion' ? 'Remotion' : 'FFmpeg'}): ${items.length} elementos`);
    } catch (error: any) {
      toast.error(error?.response?.data?.error || 'Error al iniciar el procesamiento');
    } finally {
      setIsStarting(false);
    }
  };

  const formatHM = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.round((seconds % 3600) / 60);
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  };

  return (
    <div className="space-y-6">
      <div className="card-lg">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-3 card-icon">
            <Wand2 className="w-6 h-6 text-white" />
          </div>
          <div>
            <h2 className="card-title">Composición con Remotion</h2>
            <p className="card-subtitle">
              Compón imágenes y videos con animaciones y transiciones — elige el motor de renderizado
            </p>
          </div>
        </div>

        {/* Engine toggle */}
        <div className="mb-6">
          <label className="block text-sm font-semibold mb-2 text-gray-900 dark:text-zinc-100">Motor de renderizado</label>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <label className={`flex items-center gap-3 bg-white border rounded-lg p-4 cursor-pointer dark:bg-zinc-900 ${engine === 'remotion' ? 'border-accent-500 ring-1 ring-accent-500' : 'border-gray-200 dark:border-zinc-800'}`}>
              <input
                type="radio"
                checked={engine === 'remotion'}
                onChange={() => setEngine('remotion')}
                disabled={!!jobId}
                className="w-5 h-5 accent-accent-500"
              />
              <div>
                <span className="text-sm font-semibold text-gray-900 dark:text-zinc-100">Remotion</span>
                <p className="text-xs text-gray-500 dark:text-zinc-400 mt-1">
                  Renderiza con React (Chromium headless) — más preciso y flexible, más lento por elemento.
                </p>
              </div>
            </label>
            <label className={`flex items-center gap-3 bg-white border rounded-lg p-4 cursor-pointer dark:bg-zinc-900 ${engine === 'ffmpeg' ? 'border-accent-500 ring-1 ring-accent-500' : 'border-gray-200 dark:border-zinc-800'}`}>
              <input
                type="radio"
                checked={engine === 'ffmpeg'}
                onChange={() => setEngine('ffmpeg')}
                disabled={!!jobId}
                className="w-5 h-5 accent-accent-500"
              />
              <div>
                <span className="text-sm font-semibold text-gray-900 dark:text-zinc-100">FFmpeg</span>
                <p className="text-xs text-gray-500 dark:text-zinc-400 mt-1">
                  El motor que usa el resto de la app — más rápido para animaciones/transiciones simples.
                </p>
              </div>
            </label>
          </div>
        </div>

        <div className="mb-6 p-4 bg-accent-50 border border-accent-300 dark:bg-accent-900/20 dark:border-accent-500/30 rounded-lg text-sm text-accent-800 dark:text-accent-200">
          Cada imagen recibe una animación distinta (zoom in, zoom out o paneo); los videos se usan
          sin sonido, con su propio movimiento. Cada corte usa una transición distinta, rotando entre
          todas. El orden en que aparecen abajo es el orden final del video. El audio es opcional — si
          subes uno, puedes sincronizar la duración total con él. La configuración es la misma sin
          importar el motor elegido — solo cambia cómo se renderiza.
        </div>

        {/* Images + videos upload */}
        <div className="mb-6">
          <label className="block text-sm font-semibold mb-2 text-gray-900 dark:text-zinc-100">
            Imágenes y videos {items.length > 0 && `(${items.length} en la secuencia)`}
          </label>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
            <div className="border border-dashed border-gray-300 dark:border-zinc-700 bg-gray-50 dark:bg-zinc-900/50 rounded-xl hover:border-gray-400 dark:hover:border-zinc-500 transition-colors cursor-pointer p-4 text-center">
              <input
                type="file"
                accept="image/*"
                multiple
                onChange={handleImagesUpload}
                className="hidden"
                id="remotion-composer-image-input"
                disabled={isUploading || !!jobId}
              />
              <label htmlFor="remotion-composer-image-input" className="cursor-pointer">
                <ImageIcon className="mx-auto mb-2 text-accent-500 dark:text-accent-400" size={24} />
                <span className="text-sm text-gray-600 dark:text-zinc-400">
                  {isUploading
                    ? `Subiendo... ${uploadProgress.done}/${uploadProgress.total}`
                    : 'Subir imágenes (puedes seleccionar varias a la vez)'}
                </span>
              </label>
            </div>

            <div className="border border-dashed border-gray-300 dark:border-zinc-700 bg-gray-50 dark:bg-zinc-900/50 rounded-xl hover:border-gray-400 dark:hover:border-zinc-500 transition-colors cursor-pointer p-4 text-center">
              <input
                type="file"
                accept="video/*"
                multiple
                onChange={handleVideosUpload}
                className="hidden"
                id="remotion-composer-video-input"
                disabled={isUploadingVideos || !!jobId}
              />
              <label htmlFor="remotion-composer-video-input" className="cursor-pointer">
                <Film className="mx-auto mb-2 text-accent-500 dark:text-accent-400" size={24} />
                <span className="text-sm text-gray-600 dark:text-zinc-400">
                  {isUploadingVideos
                    ? `Subiendo... ${videoUploadProgress.done}/${videoUploadProgress.total}`
                    : 'Subir videos (sin sonido)'}
                </span>
              </label>
            </div>
          </div>

          {items.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-900 dark:text-zinc-100">{items.length} elemento(s) en orden</span>
                {!jobId && (
                  <button onClick={handleClearItems} className="text-gray-500 dark:text-zinc-400 hover:text-red-500 dark:hover:text-red-400 flex items-center gap-1 text-sm">
                    <X size={16} /> Quitar todos
                  </button>
                )}
              </div>
              <div className="max-h-56 overflow-y-auto space-y-1.5 pr-1">
                {items.map((item, idx) => (
                  <div
                    key={item.id}
                    className="flex items-center gap-2 bg-white border border-gray-200 dark:bg-zinc-900 dark:border-zinc-800 rounded-lg px-3 py-2"
                  >
                    <span className="text-xs font-bold text-accent-600 dark:text-accent-400 w-6 shrink-0">{idx + 1}</span>
                    {item.type === 'video' ? (
                      <Film size={14} className="text-accent-500 dark:text-accent-400 shrink-0" />
                    ) : (
                      <ImageIcon size={14} className="text-gray-400 dark:text-zinc-500 shrink-0" />
                    )}
                    <span className="flex-1 text-sm text-gray-900 dark:text-zinc-100 truncate">{item.name}</span>
                    {item.type === 'video' && (
                      <label
                        className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-zinc-400 shrink-0 cursor-pointer"
                        title="Detecta escenas dentro de este video y las reordena/mezcla antes de usarlo — igual que 'desagrupar' en Cola de Edición"
                      >
                        <input
                          type="checkbox"
                          checked={!!item.splitScenes}
                          onChange={() => handleToggleSplitScenes(item.id)}
                          disabled={!!jobId}
                          className="w-3.5 h-3.5 accent-accent-500"
                        />
                        Desagrupar
                      </label>
                    )}
                    {!jobId && (
                      <button onClick={() => handleRemoveItem(item.id)} className="text-gray-400 dark:text-zinc-500 hover:text-red-500 dark:hover:text-red-400 shrink-0">
                        <X size={14} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Audio (opcional) */}
        <div className="mb-6">
          <label className="block text-sm font-semibold mb-2 text-gray-900 dark:text-zinc-100">
            Audio de narración (opcional)
          </label>
          {!audio ? (
            <div className="border border-dashed border-gray-300 dark:border-zinc-700 bg-gray-50 dark:bg-zinc-900/50 rounded-xl hover:border-gray-400 dark:hover:border-zinc-500 transition-colors cursor-pointer p-4 text-center">
              <input
                type="file"
                accept="audio/*"
                onChange={handleAudioUpload}
                className="hidden"
                id="remotion-composer-audio-input"
                disabled={isUploadingAudio || !!jobId}
              />
              <label htmlFor="remotion-composer-audio-input" className="cursor-pointer">
                <Music className="mx-auto mb-2 text-accent-500 dark:text-accent-400" size={24} />
                <span className="text-sm text-gray-600 dark:text-zinc-400">
                  {isUploadingAudio ? 'Subiendo...' : 'Subir audio para sincronizar la duración del video'}
                </span>
              </label>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between bg-white border border-gray-200 dark:bg-zinc-900 dark:border-zinc-800 rounded-lg p-3">
                <span className="text-sm text-gray-900 dark:text-zinc-100 truncate">
                  🎵 {audio.name} — {formatHM(audio.duration)}
                </span>
                {!jobId && (
                  <button onClick={handleRemoveAudio} className="text-gray-500 dark:text-zinc-400 hover:text-red-500 dark:hover:text-red-400 flex items-center gap-1 text-sm shrink-0 ml-2">
                    <X size={16} />
                  </button>
                )}
              </div>
              <label className="flex items-center gap-3 bg-white border border-gray-200 dark:bg-zinc-900 dark:border-zinc-800 rounded-lg p-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={syncWithAudio}
                  onChange={(e) => setSyncWithAudio(e.target.checked)}
                  disabled={!!jobId}
                  className="w-5 h-5 accent-accent-500"
                />
                <span className="text-sm font-semibold text-gray-900 dark:text-zinc-100">
                  Sincronizar duración del video con este audio
                </span>
              </label>
            </div>
          )}
        </div>

        {/* Instrucciones de edición (opcional) */}
        <div className="mb-6">
          <label className="block text-sm font-semibold mb-2 text-gray-900 dark:text-zinc-100">
            Instrucciones de edición (opcional)
          </label>
          <p className="text-xs text-gray-500 dark:text-zinc-400 mb-2">
            Sube un archivo .json con instrucciones por número de item de la lista de arriba (zoom,
            texto, transiciones, formas) — mismo formato de datos que usa Remotion internamente, sin
            usar créditos de IA. Ejemplo:{' '}
            <code className="bg-gray-100 dark:bg-zinc-800 px-1 rounded whitespace-pre-wrap">
              {'{ "instrucciones": [ { "tipo": "zoom", "item": 1, "valor": "in" }, { "tipo": "texto", "item": 2, "texto": "Hola", "desde": "0:00", "hasta": "0:02" }, { "tipo": "transicion", "itemDesde": 2, "itemHasta": 3, "valor": "wipeleft" } ] }'}
            </code>
          </p>
          {!instructions ? (
            <div className="border border-dashed border-gray-300 dark:border-zinc-700 bg-gray-50 dark:bg-zinc-900/50 rounded-xl hover:border-gray-400 dark:hover:border-zinc-500 transition-colors cursor-pointer p-4 text-center">
              <input
                type="file"
                accept=".json,application/json"
                onChange={handleInstructionsUpload}
                className="hidden"
                id="remotion-composer-instructions-input"
                disabled={isUploadingInstructions || !!jobId}
              />
              <label htmlFor="remotion-composer-instructions-input" className="cursor-pointer">
                <FileText className="mx-auto mb-2 text-accent-500 dark:text-accent-400" size={24} />
                <span className="text-sm text-gray-600 dark:text-zinc-400">
                  {isUploadingInstructions ? 'Leyendo...' : 'Subir archivo de instrucciones (.json)'}
                </span>
              </label>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center justify-between bg-white border border-gray-200 dark:bg-zinc-900 dark:border-zinc-800 rounded-lg p-3">
                <span className="text-sm text-gray-900 dark:text-zinc-100 truncate">
                  📝 {instructions.fileName} —{' '}
                  {Object.entries(instructions.counts).length > 0
                    ? Object.entries(instructions.counts)
                        .map(([kind, count]) => `${count} ${INSTRUCTION_KIND_LABELS[kind] || kind}`)
                        .join(', ')
                    : 'sin instrucciones válidas'}
                </span>
                {!jobId && (
                  <button onClick={handleRemoveInstructions} className="text-gray-500 dark:text-zinc-400 hover:text-red-500 dark:hover:text-red-400 flex items-center gap-1 text-sm shrink-0 ml-2">
                    <X size={16} />
                  </button>
                )}
              </div>
              {instructions.errors.length > 0 && (
                <div className="bg-red-50 border border-red-200 dark:bg-red-900/20 dark:border-red-500/30 rounded-lg p-3 space-y-1">
                  {instructions.errors.map((err, i) => (
                    <p key={i} className="text-xs text-red-700 dark:text-red-300">
                      {err.line > 0 ? `Instrucción #${err.line}: ` : ''}{err.message}
                    </p>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Duration mode */}
        <div className="mb-6">
          <label className="block text-sm font-semibold mb-2 text-gray-900 dark:text-zinc-100">Duración</label>
          {audioSyncActive && (
            <p className="text-xs text-accent-600 dark:text-accent-400 mb-2">
              🎵 Usando la duración del audio ({formatHM(audio!.duration)}) — desactiva la sincronización para elegirla manualmente
            </p>
          )}
          <div className={`grid grid-cols-1 md:grid-cols-2 gap-4 ${audioSyncActive ? 'opacity-50 pointer-events-none' : ''}`}>
            <label className="flex items-center gap-3 bg-white border border-gray-200 dark:bg-zinc-900 dark:border-zinc-800 rounded-lg p-4 cursor-pointer">
              <input
                type="radio"
                checked={durationMode === 'total'}
                onChange={() => setDurationMode('total')}
                disabled={!!jobId || audioSyncActive}
                className="w-5 h-5 accent-accent-500"
              />
              <div className="flex-1">
                <span className="text-sm font-semibold text-gray-900 dark:text-zinc-100">Duración total del video</span>
                {durationMode === 'total' && (
                  <div className="mt-2 flex items-center gap-2">
                    <input
                      type="number"
                      min="0.01"
                      step="0.01"
                      value={totalHours}
                      onChange={(e) => setTotalHours(parseFloat(e.target.value) || 0.05)}
                      disabled={!!jobId}
                      className="w-20 px-2 py-1 bg-gray-50 dark:bg-zinc-950 border border-gray-200 dark:border-zinc-800 rounded-lg text-sm text-gray-900 dark:text-zinc-100"
                    />
                    <span className="text-xs text-gray-500 dark:text-zinc-400">horas</span>
                  </div>
                )}
              </div>
            </label>

            <label className="flex items-center gap-3 bg-white border border-gray-200 dark:bg-zinc-900 dark:border-zinc-800 rounded-lg p-4 cursor-pointer">
              <input
                type="radio"
                checked={durationMode === 'perImage'}
                onChange={() => setDurationMode('perImage')}
                disabled={!!jobId || audioSyncActive}
                className="w-5 h-5 accent-accent-500"
              />
              <div className="flex-1">
                <span className="text-sm font-semibold text-gray-900 dark:text-zinc-100">Duración por elemento</span>
                {durationMode === 'perImage' && (
                  <div className="mt-2 flex items-center gap-2">
                    <input
                      type="number"
                      min="0.5"
                      step="0.5"
                      value={perImageSeconds}
                      onChange={(e) => setPerImageSeconds(parseFloat(e.target.value) || 5)}
                      disabled={!!jobId}
                      className="w-20 px-2 py-1 bg-gray-50 dark:bg-zinc-950 border border-gray-200 dark:border-zinc-800 rounded-lg text-sm text-gray-900 dark:text-zinc-100"
                    />
                    <span className="text-xs text-gray-500 dark:text-zinc-400">segundos c/u</span>
                  </div>
                )}
              </div>
            </label>
          </div>
          {items.length > 0 && (
            <p className="text-xs text-gray-500 dark:text-zinc-400 mt-2">
              Duración estimada del video: <span className="text-accent-600 dark:text-accent-400 font-semibold">{formatHM(estimatedTotalSeconds)}</span>
              {' '}({(estimatedTotalSeconds / items.length).toFixed(2)}s por elemento)
            </p>
          )}
        </div>

        {/* Random mode */}
        <div className="mb-6">
          <label className="flex items-center gap-3 bg-white border border-gray-200 dark:bg-zinc-900 dark:border-zinc-800 rounded-lg p-4 cursor-pointer">
            <input
              type="checkbox"
              checked={randomMode}
              onChange={(e) => setRandomMode(e.target.checked)}
              disabled={!!jobId}
              className="w-5 h-5 accent-accent-500"
            />
            <div>
              <span className="text-sm font-semibold text-gray-900 dark:text-zinc-100">Modo aleatorio</span>
              <p className="text-xs text-gray-500 dark:text-zinc-400 mt-1">
                Cada elemento dura un tiempo distinto (repartido al azar hasta sumar la duración total),
                y la transición/animación se elige al azar en vez de rotar en orden fijo. El orden de
                los elementos en sí nunca cambia.
              </p>
            </div>
          </label>
        </div>

        {/* Full shuffle (aplica a los videos marcados "Desagrupar" en la lista de arriba) */}
        <div className="mb-6">
          <label className="flex items-center gap-3 bg-white border border-gray-200 dark:bg-zinc-900 dark:border-zinc-800 rounded-lg p-4 cursor-pointer">
            <input
              type="checkbox"
              checked={fullShuffle}
              onChange={(e) => setFullShuffle(e.target.checked)}
              disabled={!!jobId}
              className="w-5 h-5 accent-accent-500"
            />
            <div>
              <span className="text-sm font-semibold text-gray-900 dark:text-zinc-100">Mezclar por todo el video</span>
              <p className="text-xs text-gray-500 dark:text-zinc-400 mt-1">
                Para los videos marcados "Desagrupar" arriba: en vez de solo intercambiar clips
                vecinos, mezcla sus fragmentos por toda la duración de ese video — se ve más
                distinto del original. Mismo criterio que en Cola de Edición y Editor de Clips.
              </p>
            </div>
          </label>
        </div>

        {/* Resolution */}
        <div className="mb-6">
          <label className="block text-sm font-semibold mb-2 text-gray-900 dark:text-zinc-100">Resolución</label>
          <select
            value={resolution}
            onChange={(e) => setResolution(e.target.value as any)}
            disabled={!!jobId}
            className="px-3 py-2 bg-gray-50 dark:bg-zinc-950 border border-gray-200 dark:border-zinc-800 rounded-lg text-gray-900 dark:text-zinc-100"
          >
            <option value="720p">720p</option>
            <option value="1080p">1080p (Recomendado)</option>
            <option value="2k">2K</option>
            <option value="4k">4K</option>
          </select>
        </div>

        <div className="flex gap-3">
          <button
            onClick={handleStart}
            disabled={isStarting || !!jobId || items.length === 0}
            className="btn-primary flex-1 flex items-center justify-center gap-2"
          >
            {isStarting ? <Loader className="w-5 h-5 animate-spin" /> : <Play className="w-5 h-5" />}
            {isStarting ? 'Iniciando...' : `▶️ Crear Video (${items.length} elementos)`}
          </button>
          {(isStarting || !!jobId) && (
            <button
              onClick={() => setShowMonitor(!showMonitor)}
              className="btn-secondary flex items-center justify-center gap-2 px-6"
            >
              Monitor
            </button>
          )}
          {!!jobId && (
            <button
              onClick={handleReset}
              className="btn-secondary flex items-center justify-center gap-2 px-4"
              title="Empezar una nueva composición"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      <CompilationMonitor
        projectId={jobId}
        isOpen={showMonitor}
        onClose={() => setShowMonitor(false)}
        statusEndpoint="/api/remotion-composer/status"
        title="Monitor de Composición con Remotion"
      />
    </div>
  );
}
