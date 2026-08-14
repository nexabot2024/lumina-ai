import { useState } from 'react';
import { Layers, Upload, X, FolderOpen, Play, Loader, RotateCcw, Music } from 'lucide-react';
import toast from 'react-hot-toast';
import axios from 'axios';
import { API_URL } from '../services/apiUrl';
import CompilationMonitor from './CompilationMonitor';
import { useLocalStorageState } from '../hooks/useLocalStorageState';

interface UploadedImage {
  id: string;
  name: string;
  path: string;
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

async function uploadInBatches(
  files: File[],
  onProgress: (done: number, total: number) => void
): Promise<{ uploaded: UploadedImage[]; failed: UploadFailure[] }> {
  const uploaded: UploadedImage[] = [];
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
        return { id: Math.random().toString(), name: file.name, path: response.data.file.path };
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
  const [images, setImages] = useState<UploadedImage[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState({ done: 0, total: 0 });
  const [outputFolder, setOutputFolder] = useState('');
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

  const handleReset = () => {
    setJobId('');
    setShowMonitor(false);
    setImages([]);
    setAudio(null);
    setSyncWithAudio(false);
  };

  const audioSyncActive = syncWithAudio && !!audio;
  const estimatedTotalSeconds = audioSyncActive
    ? audio!.duration
    : durationMode === 'total'
      ? totalHours * 3600
      : perImageSeconds * images.length;

  const handleImagesUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    const selected = Array.from(e.target.files);
    setIsUploading(true);
    setUploadProgress({ done: 0, total: selected.length });
    try {
      const { uploaded, failed } = await uploadInBatches(selected, (done, total) => setUploadProgress({ done, total }));
      if (uploaded.length > 0) {
        setImages(prev => [...prev, ...uploaded]);
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

  const handleClearImages = () => setImages([]);

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

  const handlePickFolder = async () => {
    try {
      const response = await axios.get(`${API_URL}/api/clip-editing/pick-folder`);
      if (response.data.success && response.data.path) {
        setOutputFolder(response.data.path);
        toast.success('Carpeta seleccionada');
      }
    } catch (error) {
      toast.error('Error al abrir el selector de carpetas');
    }
  };

  const handleStart = async () => {
    if (images.length === 0) {
      toast.error('Sube al menos una imagen');
      return;
    }
    if (!outputFolder) {
      toast.error('Selecciona una carpeta de salida');
      return;
    }

    const newJobId = `image-sequence-${Date.now()}`;
    setIsStarting(true);
    try {
      await axios.post(`${API_URL}/api/image-sequence/start`, {
        jobId: newJobId,
        imagePaths: images.map(i => i.path),
        outputFolder,
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
      toast.success(`Procesamiento iniciado: ${images.length} imágenes`);
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
          <div className="p-2.5 bg-accent-600 rounded-lg">
            <Layers className="w-6 h-6 text-white" />
          </div>
          <div>
            <h2 className="text-gray-900 dark:text-zinc-100 text-sm font-medium">Secuencia de Imágenes</h2>
            <p className="text-gray-400 dark:text-zinc-500 text-[10px]">
              Convierte cientos de imágenes en un video largo, con transiciones y animaciones variadas
            </p>
          </div>
        </div>

        <div className="mb-6 p-4 bg-accent-50 border border-accent-300 dark:bg-accent-900/20 dark:border-accent-500/30 rounded-lg text-sm text-accent-800 dark:text-accent-200">
          Cada imagen recibe una animación distinta (zoom in, zoom out o paneo) y cada corte usa una
          transición distinta (fade, disolvencia, wipe, deslizar), rotando entre todas para que el
          video no se vea repetitivo. El audio es opcional — si subes uno, puedes sincronizar la
          duración total del video con él.
        </div>

        {/* Images upload */}
        <div className="mb-6">
          <label className="block text-sm font-semibold mb-2 text-gray-900 dark:text-zinc-100">
            Imágenes {images.length > 0 && `(${images.length} subidas)`}
          </label>
          <div className="border border-dashed border-gray-300 dark:border-zinc-700 bg-gray-50 dark:bg-zinc-900/50 rounded-xl hover:border-gray-400 dark:hover:border-zinc-500 transition-colors cursor-pointer p-4 text-center mb-3">
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
              <Upload className="mx-auto mb-2 text-accent-500 dark:text-accent-400" size={24} />
              <span className="text-sm text-gray-600 dark:text-zinc-400">
                {isUploading
                  ? `Subiendo... ${uploadProgress.done}/${uploadProgress.total}`
                  : 'Subir imágenes (puedes seleccionar cientos a la vez)'}
              </span>
            </label>
          </div>

          {images.length > 0 && (
            <div className="flex items-center justify-between bg-white border border-gray-200 dark:bg-zinc-900 dark:border-zinc-800 rounded-lg p-3">
              <span className="text-sm text-gray-900 dark:text-zinc-100">{images.length} imágenes listas</span>
              {!jobId && (
                <button onClick={handleClearImages} className="text-gray-500 dark:text-zinc-400 hover:text-red-500 dark:hover:text-red-400 flex items-center gap-1 text-sm">
                  <X size={16} /> Quitar todas
                </button>
              )}
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
                <span className="text-sm font-semibold text-gray-900 dark:text-zinc-100">Duración por imagen</span>
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
          {images.length > 0 && (
            <p className="text-xs text-gray-500 dark:text-zinc-400 mt-2">
              Duración estimada del video: <span className="text-accent-600 dark:text-accent-400 font-semibold">{formatHM(estimatedTotalSeconds)}</span>
              {' '}({(estimatedTotalSeconds / images.length).toFixed(2)}s por imagen)
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
                Cada imagen dura un tiempo distinto (repartido al azar hasta sumar la duración total),
                y la transición/animación de cada imagen se elige al azar en vez de rotar en orden fijo.
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

        {/* Output folder */}
        <div className="mb-6">
          <label className="block text-sm font-semibold mb-2 text-gray-900 dark:text-zinc-100">Carpeta de salida</label>
          <div className="flex items-center gap-3">
            <input
              type="text"
              value={outputFolder}
              readOnly
              placeholder="Selecciona una carpeta..."
              className="flex-1 px-3 py-2 bg-gray-50 dark:bg-zinc-950 border border-gray-200 dark:border-zinc-800 rounded-lg text-gray-900 dark:text-zinc-100"
            />
            <button onClick={handlePickFolder} disabled={!!jobId} className="btn-secondary flex items-center gap-2 px-4 py-2">
              <FolderOpen size={18} /> Elegir carpeta
            </button>
          </div>
        </div>

        <div className="flex gap-3">
          <button
            onClick={handleStart}
            disabled={isStarting || !!jobId || images.length === 0}
            className="btn-primary flex-1 flex items-center justify-center gap-2"
          >
            {isStarting ? <Loader className="w-5 h-5 animate-spin" /> : <Play className="w-5 h-5" />}
            {isStarting ? 'Iniciando...' : `▶️ Crear Video (${images.length} imágenes)`}
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
