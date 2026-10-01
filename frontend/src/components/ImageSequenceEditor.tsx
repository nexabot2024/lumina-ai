import { useState } from 'react';
import { Layers, X, Play, Loader, RotateCcw, Music, Image as ImageIcon, Film, AlertTriangle } from 'lucide-react';
import toast from 'react-hot-toast';
import axios from 'axios';
import { API_URL } from '../services/apiUrl';
import CompilationMonitor from './CompilationMonitor';
import CustomSelect from './CustomSelect';
import ToggleCard from './ToggleCard';
import { useLocalStorageState } from '../hooks/useLocalStorageState';

type ItemType = 'image' | 'video';

interface SequenceItem {
  id: string;
  name: string;
  path: string;
  type: ItemType;
}

interface UploadedAudio {
  name: string;
  path: string;
  duration: number;
}

type DurationMode = 'total' | 'perImage';

const UPLOAD_CONCURRENCY = 8;

interface UploadFailure {
  name: string;
  reason: string;
}

function words(value: string): string[] {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .split(/[^a-z0-9]+/).filter(word => word.length >= 3);
}

/** El contador entre paréntesis es solo un índice del archivo, no parte de su tema. */
function itemReferenceName(fileName: string): string {
  return fileName.split('(')[0].replace(/\.[a-z0-9]+$/i, '').trim();
}

function orderItemsByScript(items: SequenceItem[], script: string): SequenceItem[] {
  const chunks = script.split(/[.!?\n]+/).map(words).filter(chunk => chunk.length > 0);
  if (chunks.length === 0 || items.length < 2) return items;
  const remaining = [...items];
  return Array.from({ length: items.length }, (_, index) => {
    const chunk = chunks[Math.min(chunks.length - 1, Math.floor(index * chunks.length / items.length))];
    let bestIndex = 0;
    let bestScore = -1;
    remaining.forEach((item, itemIndex) => {
      const nameWords = new Set(words(itemReferenceName(item.name)));
      const score = chunk.reduce((sum, word) => sum + (nameWords.has(word) ? 1 : 0), 0);
      if (score > bestScore) { bestScore = score; bestIndex = itemIndex; }
    });
    return remaining.splice(bestIndex, 1)[0];
  });
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

export default function ImageSequenceEditor() {
  const [items, setItems] = useState<SequenceItem[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isUploadingVideos, setIsUploadingVideos] = useState(false);
  const [videoUploadProgress, setVideoUploadProgress] = useState({ done: 0, total: 0 });
  const [uploadProgress, setUploadProgress] = useState({ done: 0, total: 0 });
  const [durationMode, setDurationMode] = useState<DurationMode>('total');
  const [totalHours, setTotalHours] = useState(1);
  const [perImageSeconds, setPerImageSeconds] = useState(5);
  const [resolution, setResolution] = useState<'720p' | '1080p' | '2k' | '4k'>('1080p');
  const [randomMode, setRandomMode] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [jobId, setJobId] = useLocalStorageState('lumina-job-imageSequence', '');
  const [showMonitor, setShowMonitor] = useLocalStorageState('lumina-job-imageSequence-monitorOpen', false);
  const [audio, setAudio] = useState<UploadedAudio | null>(null);
  const [isUploadingAudio, setIsUploadingAudio] = useState(false);
  const [syncWithAudio, setSyncWithAudio] = useState(false);
  const [script, setScript] = useState('');
  const [syncWithScript, setSyncWithScript] = useState(false);
  const [failedUploads, setFailedUploads] = useState<UploadFailure[]>([]);

  const handleReset = () => {
    setJobId('');
    setShowMonitor(false);
    setItems([]);
    setAudio(null);
    setSyncWithAudio(false);
    setScript('');
    setSyncWithScript(false);
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
        setFailedUploads(prev => [...prev, ...failed]);
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
        setFailedUploads(prev => [...prev, ...failed]);
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
  const handleDismissFailure = (index: number) => setFailedUploads(prev => prev.filter((_, i) => i !== index));
  const handleClearFailures = () => setFailedUploads([]);

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

  const handleStart = async () => {
    if (items.length === 0) {
      toast.error('Sube al menos una imagen o video');
      return;
    }

    const newJobId = `image-sequence-${Date.now()}`;
    setIsStarting(true);
    try {
      await axios.post(`${API_URL}/api/image-sequence/start`, {
        jobId: newJobId,
        items: (syncWithScript ? orderItemsByScript(items, script) : items).map(i => ({ path: i.path, type: i.type })),
        resolution,
        randomMode,
        ...(audioSyncActive
          ? { totalDurationSeconds: audio!.duration, audioPath: audio!.path }
          : durationMode === 'total'
            ? { totalDurationSeconds: totalHours * 3600 }
            : { perImageDuration: perImageSeconds }),
      });
      setJobId(newJobId);
      setShowMonitor(true);
      toast.success(`Procesamiento iniciado: ${items.length} elementos`);
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
            <Layers className="w-6 h-6 text-white" />
          </div>
          <div>
            <h2 className="card-title">Secuencia de Imágenes</h2>
            <p className="card-subtitle">
              Convierte imágenes en un video largo, con transiciones y animaciones variadas
            </p>
          </div>
        </div>

        <div className="mb-6 p-4 bg-accent-50 border border-accent-300 dark:bg-accent-900/20 dark:border-accent-500/30 rounded-2xl text-sm text-accent-800 dark:text-accent-200">
          Cada imagen recibe una animación distinta (zoom in, zoom out o paneo); los videos se usan
          sin sonido, con su propio movimiento, y en bucle si son más cortos que el tiempo que les toca.
          Cada corte usa una transición distinta (fade, disolvencia, wipe, deslizar), rotando entre
          todas para que el video no se vea repetitivo. El orden en que aparecen abajo (imágenes y
          videos mezclados) es el orden final del video — no se reordena nada al ensamblar. El audio
          es opcional — si subes uno, puedes sincronizar la duración total del video con él.
        </div>

        <div className="mb-6">
          <ToggleCard
            checked={syncWithScript}
            onChange={setSyncWithScript}
            disabled={!!jobId}
            title="Sincronizar imágenes con guion y narración"
            description="Ordena automáticamente una biblioteca de personas, productos, lugares o cualquier tema según las menciones del guion."
          />
          {syncWithScript && (
            <div className="mt-3">
              <textarea
                value={script}
                onChange={(e) => setScript(e.target.value)}
                disabled={!!jobId}
                placeholder="Pega el guion. Nombra los archivos con el personaje, producto o tema correspondiente, por ejemplo: carlos-iii-01.jpg o iphone-15-02.jpg."
                className="w-full min-h-28 p-3 bg-gray-50 dark:bg-zinc-900/50 border border-gray-200 dark:border-zinc-800 rounded-xl text-sm text-gray-900 dark:text-zinc-100 placeholder-gray-400 dark:placeholder-zinc-600 focus:outline-none focus:border-accent-500 resize-y"
              />
            </div>
          )}
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
                id="image-sequence-input"
                disabled={isUploading || !!jobId}
              />
              <label htmlFor="image-sequence-input" className="cursor-pointer">
                <ImageIcon className="mx-auto mb-2 text-accent-500 dark:text-accent-400" size={24} />
                <span className="text-sm text-gray-600 dark:text-zinc-400">
                  {isUploading
                    ? `Subiendo... ${uploadProgress.done}/${uploadProgress.total}`
                    : 'Subir imágenes (puedes seleccionar cientos a la vez)'}
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
                id="image-sequence-video-input"
                disabled={isUploadingVideos || !!jobId}
              />
              <label htmlFor="image-sequence-video-input" className="cursor-pointer">
                <Film className="mx-auto mb-2 text-accent-500 dark:text-accent-400" size={24} />
                <span className="text-sm text-gray-600 dark:text-zinc-400">
                  {isUploadingVideos
                    ? `Subiendo... ${videoUploadProgress.done}/${videoUploadProgress.total}`
                    : 'Subir videos (sin sonido)'}
                </span>
              </label>
            </div>
          </div>

          {failedUploads.length > 0 && (
            <div className="mb-3 p-4 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-2xl">
              <div className="flex items-center justify-between gap-3 mb-2">
                <div className="flex items-center gap-2 text-amber-800 dark:text-amber-200 text-sm font-semibold">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  {failedUploads.length} archivo(s) no se pudieron subir
                </div>
                <button
                  onClick={handleClearFailures}
                  className="text-xs text-amber-700 dark:text-amber-300 hover:underline shrink-0"
                >
                  Descartar todos
                </button>
              </div>
              <p className="text-xs text-amber-700 dark:text-amber-300 mb-3">
                Ubica estos archivos en tu carpeta local (por el nombre) y bórralos o vuelve a intentarlo — no llegaron a añadirse a la secuencia.
              </p>
              <div className="max-h-40 overflow-y-auto space-y-1.5">
                {failedUploads.map((failure, idx) => (
                  <div
                    key={idx}
                    className="flex items-start gap-2 bg-white dark:bg-zinc-900 border border-amber-200 dark:border-amber-900/60 rounded-xl px-3 py-2"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold text-gray-900 dark:text-zinc-100 break-all">{failure.name}</p>
                      <p className="text-[11px] text-gray-500 dark:text-zinc-400 mt-0.5">{failure.reason}</p>
                    </div>
                    <button
                      onClick={() => handleDismissFailure(idx)}
                      className="text-gray-400 dark:text-zinc-500 hover:text-red-500 dark:hover:text-red-400 shrink-0"
                    >
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

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
                    className="flex items-center gap-2 bg-white border border-gray-200 dark:bg-zinc-900 dark:border-zinc-800 rounded-xl px-3 py-2"
                  >
                    <span className="text-xs font-bold text-accent-600 dark:text-accent-400 w-6 shrink-0">{idx + 1}</span>
                    {item.type === 'video' ? (
                      <Film size={14} className="text-accent-500 dark:text-accent-400 shrink-0" />
                    ) : (
                      <ImageIcon size={14} className="text-gray-400 dark:text-zinc-500 shrink-0" />
                    )}
                    <span className="flex-1 text-sm text-gray-900 dark:text-zinc-100 truncate">{item.name}</span>
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
                id="image-sequence-audio-input"
                disabled={isUploadingAudio || !!jobId}
              />
              <label htmlFor="image-sequence-audio-input" className="cursor-pointer">
                <Music className="mx-auto mb-2 text-accent-500 dark:text-accent-400" size={24} />
                <span className="text-sm text-gray-600 dark:text-zinc-400">
                  {isUploadingAudio ? 'Subiendo...' : 'Subir audio para sincronizar la duración del video'}
                </span>
              </label>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between bg-white border border-gray-200 dark:bg-zinc-900 dark:border-zinc-800 rounded-xl p-3">
                <span className="text-sm text-gray-900 dark:text-zinc-100 truncate">
                  🎵 {audio.name} — {formatHM(audio.duration)}
                </span>
                {!jobId && (
                  <button onClick={handleRemoveAudio} className="text-gray-500 dark:text-zinc-400 hover:text-red-500 dark:hover:text-red-400 flex items-center gap-1 text-sm shrink-0 ml-2">
                    <X size={16} />
                  </button>
                )}
              </div>
              <ToggleCard
                checked={syncWithAudio}
                onChange={setSyncWithAudio}
                disabled={!!jobId}
                title="Sincronizar duración del video con este audio"
              />
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
            <ToggleCard
              variant="radio"
              checked={durationMode === 'total'}
              onChange={() => setDurationMode('total')}
              disabled={!!jobId || audioSyncActive}
              title="Duración total del video"
            >
              {durationMode === 'total' && (
                <div className="mt-2 flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                  <input
                    type="number"
                    min="0.1"
                    step="0.1"
                    value={totalHours}
                    onChange={(e) => setTotalHours(parseFloat(e.target.value) || 1)}
                    disabled={!!jobId}
                    className="w-20 px-2 py-1 bg-gray-50 dark:bg-zinc-950 border border-gray-200 dark:border-zinc-800 rounded-lg text-sm text-gray-900 dark:text-zinc-100"
                  />
                  <span className="text-xs text-gray-500 dark:text-zinc-400">horas</span>
                </div>
              )}
            </ToggleCard>

            <ToggleCard
              variant="radio"
              checked={durationMode === 'perImage'}
              onChange={() => setDurationMode('perImage')}
              disabled={!!jobId || audioSyncActive}
              title="Duración por imagen"
            >
              {durationMode === 'perImage' && (
                <div className="mt-2 flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
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
            </ToggleCard>
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
          <ToggleCard
            checked={randomMode}
            onChange={setRandomMode}
            disabled={!!jobId}
            title="Modo aleatorio"
            description="Cada elemento dura un tiempo distinto (repartido al azar hasta sumar la duración total), y la transición/animación se elige al azar en vez de rotar en orden fijo. El orden de los elementos en sí nunca cambia."
          />
        </div>

        {/* Resolution */}
        <div className="mb-6">
          <label className="block text-sm font-semibold mb-2 text-gray-900 dark:text-zinc-100">Resolución</label>
          <CustomSelect
            value={resolution}
            onChange={setResolution}
            disabled={!!jobId}
            className="max-w-xs"
            options={[
              { value: '720p', label: '720p' },
              { value: '1080p', label: '1080p (Recomendado)' },
              { value: '2k', label: '2K' },
              { value: '4k', label: '4K' },
            ]}
          />
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
              title="Empezar una nueva secuencia"
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
        statusEndpoint="/api/image-sequence/status"
        title="Monitor de Secuencia de Imágenes"
      />
    </div>
  );
}
