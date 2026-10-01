import { useState, useRef } from 'react';
import { Clapperboard, Upload, X, ArrowUp, ArrowDown, Loader, Scissors, ListVideo, Crosshair } from 'lucide-react';
import toast from 'react-hot-toast';
import axios from 'axios';
import CompilationMonitor from './CompilationMonitor';
import { API_URL } from '../services/apiUrl';
import { useLocalStorageState } from '../hooks/useLocalStorageState';

interface TimelineClip {
  id: string;
  name: string;
  path: string;
  duration: number;
  start: string; // "mm:ss"
  end: string; // "mm:ss"
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

function formatSecondsToTimeInput(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const ss = String(s).padStart(2, '0');
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${ss}`;
  return `${m}:${ss}`;
}

interface Props {
  onSendToDestination: (destination: 'clips' | 'queue', file: { name: string; path: string }) => void;
}

export default function TimelineEditor({ onSendToDestination }: Props) {
  const [clips, setClips] = useState<TimelineClip[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [pendingDestination, setPendingDestination] = useState<'clips' | 'queue' | null>(null);
  const [showMonitor, setShowMonitor] = useLocalStorageState('lumina-job-timelineEditor-monitorOpen', false);
  const [currentJobId, setCurrentJobId] = useLocalStorageState('lumina-job-timelineEditor', '');
  const videoRefs = useRef<Record<string, HTMLVideoElement | null>>({});

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    const files = Array.from(e.target.files);
    setIsUploading(true);
    try {
      for (const file of files) {
        const formData = new FormData();
        formData.append('file', file);
        const response = await axios.post(`${API_URL}/api/upload`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
        const duration = response.data.file.duration || 0;
        setClips(prev => [
          ...prev,
          {
            id: Math.random().toString(),
            name: file.name,
            path: response.data.file.path,
            duration,
            start: '0:00',
            end: formatSecondsToTimeInput(duration),
          },
        ]);
      }
      toast.success(`${files.length} clip(s) añadido(s)`);
    } catch {
      toast.error('Error al subir clip(s)');
    } finally {
      setIsUploading(false);
      e.target.value = '';
    }
  };

  const handleRemove = (id: string) => {
    setClips(prev => prev.filter(c => c.id !== id));
  };

  const handleMove = (id: string, direction: -1 | 1) => {
    setClips(prev => {
      const idx = prev.findIndex(c => c.id === id);
      const swapIdx = idx + direction;
      if (idx === -1 || swapIdx < 0 || swapIdx >= prev.length) return prev;
      const copy = [...prev];
      [copy[idx], copy[swapIdx]] = [copy[swapIdx], copy[idx]];
      return copy;
    });
  };

  const handleField = (id: string, field: 'start' | 'end', value: string) => {
    setClips(prev => prev.map(c => (c.id === id ? { ...c, [field]: value } : c)));
  };

  const handleMarkCurrentTime = (id: string, field: 'start' | 'end') => {
    const videoEl = videoRefs.current[id];
    if (!videoEl) return;
    handleField(id, field, formatSecondsToTimeInput(videoEl.currentTime));
  };

  const totalTrimmedSeconds = clips.reduce((sum, c) => {
    const start = parseTimeToSeconds(c.start);
    const end = parseTimeToSeconds(c.end);
    return sum + (start !== null && end !== null && end > start ? end - start : 0);
  }, 0);

  const handleSend = async (destination: 'clips' | 'queue') => {
    if (clips.length === 0) {
      toast.error('Sube al menos un clip');
      return;
    }

    const parsedClips = [];
    for (const c of clips) {
      const start = parseTimeToSeconds(c.start);
      const end = parseTimeToSeconds(c.end);
      if (start === null || end === null || end <= start) {
        toast.error(`"${c.name}": revisa el tramo (inicio/fin, formato mm:ss)`);
        return;
      }
      parsedClips.push({ path: c.path, start, end });
    }

    const jobId = `timeline-${Date.now()}`;
    setPendingDestination(destination);
    setCurrentJobId(jobId);
    setShowMonitor(true);
    setIsProcessing(true);

    try {
      await axios.post(`${API_URL}/api/timeline-editor/process`, { jobId, clips: parsedClips });
      toast.success('Procesando, revisa el monitor');
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Error al iniciar el procesamiento');
      setIsProcessing(false);
      setPendingDestination(null);
    }
  };

  const handleMonitorComplete = (outputUrl: string) => {
    setIsProcessing(false);
    if (!pendingDestination) return;
    const fileName = outputUrl.split('/').pop() || 'rough-cut.mp4';
    onSendToDestination(pendingDestination, { name: fileName, path: outputUrl });
    toast.success(pendingDestination === 'clips' ? '✅ Enviado a Editor de Clips' : '✅ Enviado a Cola de Edición');
    setShowMonitor(false);
    setPendingDestination(null);
  };

  return (
    <div className="space-y-6">
      <div className="card-lg">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-3 card-icon">
            <Clapperboard className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="card-title">Editor de Línea de Tiempo</h2>
            <p className="card-subtitle">
              Sube clips, ordénalos, recorta cada uno y mándalo directo a Editor de Clips o Cola de Edición
            </p>
          </div>
        </div>

        {/* Upload */}
        <div className="mb-6">
          <div className="border border-dashed border-gray-300 dark:border-zinc-700 bg-gray-50 dark:bg-zinc-900/50 rounded-xl p-4 text-center hover:border-gray-400 dark:hover:border-zinc-500 transition-colors">
            <input
              type="file"
              accept="video/*"
              multiple
              onChange={handleUpload}
              className="hidden"
              id="timeline-clips-input"
              disabled={isUploading || isProcessing}
            />
            <label htmlFor="timeline-clips-input" className="cursor-pointer">
              <Upload className="mx-auto mb-2 text-accent-500 dark:text-accent-400" size={24} />
              <span className="text-sm text-gray-600 dark:text-zinc-400">
                {isUploading ? 'Subiendo...' : 'Subir clips (puedes seleccionar varios a la vez)'}
              </span>
            </label>
          </div>
        </div>

        {/* Clip list */}
        {clips.length > 0 && (
          <div className="space-y-3 mb-6">
            {clips.map((clip, idx) => (
              <div key={clip.id} className="bg-gray-50 dark:bg-zinc-950 border border-gray-200 dark:border-zinc-800 rounded-lg p-4">
                <div className="flex items-center gap-3 mb-3">
                  <span className="text-xs font-bold text-accent-600 dark:text-accent-400 w-6">{idx + 1}</span>
                  <span className="flex-1 text-sm text-gray-900 dark:text-zinc-100 truncate">{clip.name}</span>
                  <button
                    onClick={() => handleMove(clip.id, -1)}
                    disabled={idx === 0}
                    className="text-gray-500 dark:text-zinc-400 hover:text-accent-600 disabled:opacity-30 disabled:cursor-not-allowed"
                    title="Mover arriba"
                  >
                    <ArrowUp size={16} />
                  </button>
                  <button
                    onClick={() => handleMove(clip.id, 1)}
                    disabled={idx === clips.length - 1}
                    className="text-gray-500 dark:text-zinc-400 hover:text-accent-600 disabled:opacity-30 disabled:cursor-not-allowed"
                    title="Mover abajo"
                  >
                    <ArrowDown size={16} />
                  </button>
                  <button onClick={() => handleRemove(clip.id)} className="text-gray-500 dark:text-zinc-400 hover:text-red-500">
                    <X size={16} />
                  </button>
                </div>

                <video
                  ref={(el) => { videoRefs.current[clip.id] = el; }}
                  src={`${API_URL}${clip.path}`}
                  controls
                  className="w-full rounded-lg mb-3 max-h-64 bg-black"
                />

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-gray-500 dark:text-zinc-400 mb-1">Inicio (mm:ss)</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={clip.start}
                        onChange={(e) => handleField(clip.id, 'start', e.target.value)}
                        className="flex-1 px-2 py-1.5 bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-lg text-sm text-gray-900 dark:text-zinc-100 focus:border-accent-500 dark:focus:border-accent-600 focus:outline-none"
                      />
                      <button
                        onClick={() => handleMarkCurrentTime(clip.id, 'start')}
                        title="Usar el tiempo actual del video"
                        className="btn-secondary px-2 py-1.5"
                      >
                        <Crosshair size={14} />
                      </button>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 dark:text-zinc-400 mb-1">Fin (mm:ss)</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={clip.end}
                        onChange={(e) => handleField(clip.id, 'end', e.target.value)}
                        className="flex-1 px-2 py-1.5 bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-lg text-sm text-gray-900 dark:text-zinc-100 focus:border-accent-500 dark:focus:border-accent-600 focus:outline-none"
                      />
                      <button
                        onClick={() => handleMarkCurrentTime(clip.id, 'end')}
                        title="Usar el tiempo actual del video"
                        className="btn-secondary px-2 py-1.5"
                      >
                        <Crosshair size={14} />
                      </button>
                    </div>
                  </div>
                </div>
                <p className="text-xs text-gray-400 dark:text-zinc-500 mt-2">
                  Duración original: {formatSecondsToTimeInput(clip.duration)} — reproduce el video, pausa donde quieras y usa{' '}
                  <Crosshair size={11} className="inline" /> para marcar el punto.
                </p>
              </div>
            ))}

            <p className="text-xs text-gray-500 dark:text-zinc-400 text-right">
              Duración total del resultado: {formatSecondsToTimeInput(totalTrimmedSeconds)}
            </p>
          </div>
        )}

        {/* Send buttons */}
        <div className="flex gap-3">
          <button
            onClick={() => handleSend('clips')}
            disabled={isProcessing || clips.length === 0}
            className="btn-primary flex-1 py-3 text-sm flex items-center justify-center gap-2"
          >
            {isProcessing && pendingDestination === 'clips' ? <Loader className="w-4 h-4 animate-spin" /> : <Scissors className="w-4 h-4" />}
            Enviar a Editor de Clips
          </button>
          <button
            onClick={() => handleSend('queue')}
            disabled={isProcessing || clips.length === 0}
            className="btn-primary flex-1 py-3 text-sm flex items-center justify-center gap-2"
          >
            {isProcessing && pendingDestination === 'queue' ? <Loader className="w-4 h-4 animate-spin" /> : <ListVideo className="w-4 h-4" />}
            Enviar a Cola de Edición
          </button>
        </div>
      </div>

      <CompilationMonitor
        projectId={currentJobId}
        isOpen={showMonitor}
        onClose={() => setShowMonitor(false)}
        statusEndpoint="/api/timeline-editor/status"
        title="Uniendo y recortando clips"
        onComplete={handleMonitorComplete}
      />
    </div>
  );
}
