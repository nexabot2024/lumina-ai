import { useState, useEffect, useRef } from 'react';
import { ListVideo, Upload, X, Play, Loader, CheckCircle, AlertCircle, Clock, RotateCcw, Music, Download, Eye, Image as ImageIcon } from 'lucide-react';
import toast from 'react-hot-toast';
import axios from 'axios';
import { API_URL } from '../services/apiUrl';
import { useLocalStorageState } from '../hooks/useLocalStorageState';
import ToggleCard from './ToggleCard';
import VideoPreviewModal from './VideoPreviewModal';

interface QueueFile {
  id: string;
  name: string;
  path: string;
  audioName?: string;
  audioPath?: string;
}

interface InsertImageFile {
  id: string;
  name: string;
  path: string;
}

interface QueueItem {
  path: string;
  name: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  outputPath?: string;
  outputUrl?: string;
  error?: string;
}

interface QueueEvent {
  type: string;
  message: string;
  percent?: number;
}

interface QueueStateData {
  isProcessing: boolean;
  items: QueueItem[];
  currentIndex: number;
  currentPercent: number;
  currentSeconds: number;
  totalSeconds: number;
  events: QueueEvent[];
}

function formatMinutes(seconds: number): string {
  return (seconds / 60).toFixed(1);
}

interface VideoQueueEditorProps {
  /** Video ya recibido de otra herramienta (ej. el rough cut del Editor de Línea de Tiempo). */
  incomingVideo?: { name: string; path: string } | null;
  onIncomingConsumed?: () => void;
}

export default function VideoQueueEditor({ incomingVideo, onIncomingConsumed }: VideoQueueEditorProps = {}) {
  const [files, setFiles] = useState<QueueFile[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [queueId, setQueueId] = useLocalStorageState('lumina-job-videoQueue', '');
  const [queueState, setQueueState] = useState<QueueStateData | null>(null);
  const [monitorClosed, setMonitorClosed] = useState(false);
  const [splitScenes, setSplitScenes] = useState(true);
  const [fullShuffle, setFullShuffle] = useState(false);
  const [wantMaxClipDuration, setWantMaxClipDuration] = useState(false);
  const [maxClipDuration, setMaxClipDuration] = useState(6);
  const [insertImages, setInsertImages] = useState(false);
  const [animateInsertedImages, setAnimateInsertedImages] = useState(false);
  const [insertImageFiles, setInsertImageFiles] = useState<InsertImageFile[]>([]);
  const [syncImagesToNarration, setSyncImagesToNarration] = useState(false);
  const [narrationScript, setNarrationScript] = useState('');
  const [isUploadingInsertImages, setIsUploadingInsertImages] = useState(false);
  const [previewItem, setPreviewItem] = useState<QueueItem | null>(null);

  const consumedIncomingPath = useRef<string | null>(null);
  useEffect(() => {
    if (!incomingVideo || consumedIncomingPath.current === incomingVideo.path) return;
    consumedIncomingPath.current = incomingVideo.path;
    setFiles(prev => [...prev, { id: Math.random().toString(), name: incomingVideo.name, path: incomingVideo.path }]);
    toast.success(`"${incomingVideo.name}" añadido desde el Editor de Línea de Tiempo`);
    onIncomingConsumed?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [incomingVideo]);

  useEffect(() => {
    if (!queueId) return;

    const eventSource = new EventSource(`${API_URL}/api/video-queue/status/${queueId}`);
    let firstMessage = true;

    eventSource.onmessage = (e) => {
      const data = JSON.parse(e.data);
      // El backend guarda las colas solo en memoria: si se reinicia (ej. tras un
      // cuelgue), pierde el registro de cualquier cola en curso, pero el navegador
      // sigue recordando su ID (para poder reconectar tras un refresco normal). El
      // primer mensaje de una cola así, "fantasma", llega vacío (sin items) — se
      // detecta y se limpia sola, en vez de dejar los botones bloqueados para
      // siempre esperando un progreso que nunca va a llegar.
      if (firstMessage) {
        firstMessage = false;
        if (!data.isProcessing && (!data.items || data.items.length === 0) && (!data.events || data.events.length === 0)) {
          setQueueId('');
          setQueueState(null);
          eventSource.close();
          return;
        }
      }
      setQueueState(data);
    };

    eventSource.onerror = () => {
      eventSource.close();
    };

    return () => eventSource.close();
  }, [queueId]);

  const handleFilesUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    const selected = Array.from(e.target.files);
    setIsUploading(true);
    try {
      for (const file of selected) {
        const formData = new FormData();
        formData.append('file', file);
        const response = await axios.post(`${API_URL}/api/upload`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
        setFiles(prev => [
          ...prev,
          { id: Math.random().toString(), name: file.name, path: response.data.file.path },
        ]);
      }
      toast.success(`${selected.length} video(s) añadido(s) a la cola`);
    } catch (error) {
      toast.error('Error al subir video');
      console.error(error);
    } finally {
      setIsUploading(false);
      e.target.value = '';
    }
  };

  const handleRemoveFile = (id: string) => {
    setFiles(prev => prev.filter(f => f.id !== id));
  };

  const handleAttachAudio = async (id: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const formData = new FormData();
      formData.append('file', file);
      const response = await axios.post(`${API_URL}/api/upload`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setFiles(prev =>
        prev.map(f => (f.id === id ? { ...f, audioName: file.name, audioPath: response.data.file.path } : f))
      );
      toast.success('Audio adjuntado');
    } catch (error: any) {
      toast.error(error?.response?.data?.error || 'Error al subir el audio');
    } finally {
      e.target.value = '';
    }
  };

  const handleRemoveAudio = (id: string) => {
    setFiles(prev => prev.map(f => (f.id === id ? { ...f, audioName: undefined, audioPath: undefined } : f)));
  };

  const handleInsertImagesUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    const selected = Array.from(e.target.files);
    setIsUploadingInsertImages(true);
    try {
      for (const file of selected) {
        const formData = new FormData();
        formData.append('file', file);
        const response = await axios.post(`${API_URL}/api/upload`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
        if (response.data.file.type !== 'image') {
          toast.error(`${file.name} no es una imagen válida`);
          continue;
        }
        setInsertImageFiles(prev => [
          ...prev,
          { id: Math.random().toString(), name: response.data.file.name || file.name, path: response.data.file.path },
        ]);
      }
      toast.success(`${selected.length} imagen(es) añadida(s)`);
    } catch (error: any) {
      toast.error(error?.response?.data?.error || 'Error al subir imagen');
    } finally {
      setIsUploadingInsertImages(false);
      e.target.value = '';
    }
  };

  const handleRemoveInsertImage = (id: string) => {
    setInsertImageFiles(prev => prev.filter(f => f.id !== id));
  };

  const handleStartQueue = async () => {
    if (files.length === 0) {
      toast.error('Añade al menos un video');
      return;
    }

    const newQueueId = `queue-${Date.now()}`;
    setIsStarting(true);
    try {
      await axios.post(`${API_URL}/api/video-queue/start`, {
        queueId: newQueueId,
        videos: files.map(f => ({ videoPath: f.path, audioPath: f.audioPath })),
        splitScenes,
        fullShuffle,
        maxClipDuration: wantMaxClipDuration ? maxClipDuration : undefined,
        insertImagePaths: insertImages ? insertImageFiles.map(f => f.path) : [],
        animateInsertedImages: insertImages && animateInsertedImages,
        narrationScript: insertImages && syncImagesToNarration ? narrationScript : undefined,
      });
      setQueueId(newQueueId);
      setMonitorClosed(false);
      toast.success(`Cola iniciada: ${files.length} video(s)`);
    } catch (error: any) {
      toast.error(error?.response?.data?.error || 'Error al iniciar la cola');
    } finally {
      setIsStarting(false);
    }
  };

  const handleReset = () => {
    setQueueId('');
    setQueueState(null);
    setFiles([]);
    setInsertImageFiles([]);
    setNarrationScript('');
  };

  const statusIcon = (status: QueueItem['status']) => {
    switch (status) {
      case 'processing':
        return <Loader className="w-4 h-4 text-blue-600 dark:text-blue-400 animate-spin" />;
      case 'completed':
        return <CheckCircle className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />;
      case 'failed':
        return <AlertCircle className="w-4 h-4 text-red-600 dark:text-red-400" />;
      default:
        return <Clock className="w-4 h-4 text-gray-400 dark:text-zinc-600" />;
    }
  };

  return (
    <div className="space-y-6">
      <div className="card-lg">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-3 card-icon">
            <ListVideo className="w-6 h-6 text-white" />
          </div>
          <div>
            <h2 className="card-title">Cola de Edición</h2>
            <p className="card-subtitle">
              Sube varios videos y procésalos uno tras otro automáticamente
            </p>
          </div>
        </div>

        <div className="mb-6 p-4 bg-accent-50 border border-accent-300 dark:bg-accent-900/20 dark:border-accent-500/30 rounded-2xl text-sm text-accent-800 dark:text-accent-200">
          Cada video se <strong>desagrupa</strong>: se divide en los fragmentos donde detecta cambios
          de escena y se reordena intercambiando cada par de clips vecinos (o mezclando por todo el
          video si activas esa opción abajo) — nunca se quita ni se repite ningún fragmento. Se
          conserva el audio original de cada video, salvo que le adjuntes una narración propia — en
          ese caso la reemplaza; si el video queda más corto que esa narración, se estira levemente
          el ritmo (cámara lenta) para acercarse, y si aun así no alcanza, el video simplemente
          termina antes que el audio (nunca repite clips para rellenar).
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <ToggleCard
            checked={splitScenes}
            onChange={setSplitScenes}
            disabled={!!queueId}
            title="Dividir por escenas automáticamente"
          />

          <ToggleCard
            checked={wantMaxClipDuration}
            onChange={setWantMaxClipDuration}
            disabled={!!queueId}
            title="Limitar duración máxima por clip"
          />

          <ToggleCard
            checked={fullShuffle}
            onChange={setFullShuffle}
            disabled={!!queueId || !splitScenes}
            title="Mezclar fragmentos por todo el video"
            description="En vez de solo intercambiar clips vecinos, los mezcla por toda la duración — se ve más distinto del original. Ideal para nichos genéricos donde no importa la sincronización exacta con la narración."
          />

          <ToggleCard
            checked={insertImages}
            onChange={setInsertImages}
            disabled={!!queueId}
            title="Insertar imágenes durante el video"
            description="Añade imágenes automáticamente en distintos momentos del video para crear un montaje más dinámico. Se integran con blur, fundidos y movimiento suave automático."
          >
            {insertImages && (
              <div className="mt-4" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
                <p className="mb-3 text-xs text-accent-700 dark:text-accent-300">
                  ✨ Cada imagen recibe automáticamente una transición y un movimiento suave diferente.
                </p>
                <div className="border border-dashed border-gray-300 dark:border-zinc-700 bg-white/70 dark:bg-zinc-950/60 rounded-xl hover:border-gray-400 dark:hover:border-zinc-500 transition-colors cursor-pointer p-4 text-center mb-3">
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={handleInsertImagesUpload}
                    className="hidden"
                    id="queue-insert-images-input"
                    disabled={isUploadingInsertImages || !!queueId}
                  />
                  <label htmlFor="queue-insert-images-input" className="cursor-pointer">
                    <ImageIcon className="mx-auto mb-2 text-accent-500 dark:text-accent-400" size={22} />
                    <span className="text-xs text-gray-600 dark:text-zinc-400">
                      {isUploadingInsertImages ? 'Subiendo...' : 'Subir imágenes'}
                    </span>
                  </label>
                </div>

                {insertImageFiles.length > 0 && (
                  <div className="space-y-2">
                    {insertImageFiles.map((file, idx) => (
                      <div key={file.id} className="flex items-center gap-3 bg-white border border-gray-200 dark:bg-zinc-900 dark:border-zinc-800 rounded-xl p-2.5">
                        <span className="text-xs font-bold text-accent-600 dark:text-accent-400 w-7">#{idx + 1}</span>
                        <span className="flex-1 text-xs text-gray-900 dark:text-zinc-100 truncate">{file.name}</span>
                        {!queueId && (
                          <button onClick={() => handleRemoveInsertImage(file.id)} className="text-gray-500 dark:text-zinc-400 hover:text-red-500 dark:hover:text-red-400">
                            <X size={14} />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                <label className="mt-4 flex items-start gap-2 text-xs text-gray-600 dark:text-zinc-400">
                  <input
                    type="checkbox"
                    checked={syncImagesToNarration}
                    onChange={(e) => setSyncImagesToNarration(e.target.checked)}
                    disabled={!!queueId}
                    className="mt-0.5 accent-blue-600"
                  />
                  <span>
                    <strong className="text-gray-800 dark:text-zinc-200">Sincronizar por actores mencionados</strong><br />
                    Ordena las imágenes según los nombres que aparezcan en el guion o narración.
                  </span>
                </label>

                {syncImagesToNarration && (
                  <textarea
                    value={narrationScript}
                    onChange={(e) => setNarrationScript(e.target.value)}
                    disabled={!!queueId}
                    placeholder="Pega aquí el guion o texto de la narración. Para reconocer actores, procura que sus nombres aparezcan también en los nombres de las imágenes."
                    className="mt-3 w-full min-h-28 p-3 bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-xl text-xs text-gray-900 dark:text-zinc-100 placeholder-gray-400 dark:placeholder-zinc-600 focus:outline-none focus:border-accent-500 resize-y"
                  />
                )}
              </div>
            )}
          </ToggleCard>

          <ToggleCard
            checked={animateInsertedImages}
            onChange={setAnimateInsertedImages}
            disabled={!!queueId || !insertImages}
            title="Animar imágenes insertadas"
            description="Aplica automáticamente fundidos y movimientos suaves diferentes a cada imagen durante el video."
          />
        </div>

        {wantMaxClipDuration && (
          <div className="mb-6 flex items-center gap-2 bg-white border border-gray-200 dark:bg-zinc-900 dark:border-zinc-800 rounded-2xl p-4">
            <span className="text-xs text-gray-500 dark:text-zinc-400">Duración máxima por clip (segundos):</span>
            <input
              type="number"
              min="0.5"
              step="0.5"
              value={maxClipDuration}
              onChange={(e) => setMaxClipDuration(parseFloat(e.target.value) || 6)}
              disabled={!!queueId}
              className="w-20 px-2 py-1 bg-gray-50 dark:bg-zinc-950 border border-gray-200 dark:border-zinc-800 rounded-lg text-sm text-gray-900 dark:text-zinc-100"
            />
          </div>
        )}

        {/* Multi video upload */}
        <div className="mb-6">
          <label className="block text-sm font-semibold mb-2 text-gray-900 dark:text-zinc-100">Videos a procesar</label>
          <div className="border border-dashed border-gray-300 dark:border-zinc-700 bg-gray-50 dark:bg-zinc-900/50 rounded-xl hover:border-gray-400 dark:hover:border-zinc-500 transition-colors cursor-pointer p-4 text-center mb-3">
            <input
              type="file"
              accept="video/mp4"
              multiple
              onChange={handleFilesUpload}
              className="hidden"
              id="queue-video-input"
              disabled={isUploading || !!queueId}
            />
            <label htmlFor="queue-video-input" className="cursor-pointer">
              <Upload className="mx-auto mb-2 text-accent-500 dark:text-accent-400" size={24} />
              <span className="text-sm text-gray-600 dark:text-zinc-400">
                {isUploading ? 'Subiendo...' : 'Subir video(s) mp4 (puedes seleccionar varios a la vez)'}
              </span>
            </label>
          </div>

          {files.length > 0 && (
            <div className="space-y-2">
              {files.map((file, idx) => (
                <div
                  key={file.id}
                  className="bg-white border border-gray-200 dark:bg-zinc-900 dark:border-zinc-800 rounded-xl p-3 space-y-2"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-bold text-accent-600 dark:text-accent-400 w-8">#{idx + 1}</span>
                    <span className="flex-1 text-sm text-gray-900 dark:text-zinc-100 truncate">{file.name}</span>
                    {!queueId && (
                      <button onClick={() => handleRemoveFile(file.id)} className="text-gray-500 dark:text-zinc-400 hover:text-red-500 dark:hover:text-red-400">
                        <X size={16} />
                      </button>
                    )}
                  </div>
                  <div className="flex items-center gap-2 pl-11">
                    {file.audioPath ? (
                      <>
                        <Music size={14} className="text-accent-500 dark:text-accent-400 shrink-0" />
                        <span className="flex-1 text-xs text-gray-600 dark:text-zinc-400 truncate">
                          {file.audioName} — se sincroniza con este video
                        </span>
                        {!queueId && (
                          <button onClick={() => handleRemoveAudio(file.id)} className="text-gray-400 dark:text-zinc-500 hover:text-red-500 dark:hover:text-red-400">
                            <X size={14} />
                          </button>
                        )}
                      </>
                    ) : (
                      !queueId && (
                        <label htmlFor={`queue-audio-input-${file.id}`} className="flex items-center gap-1.5 text-xs text-accent-600 dark:text-accent-400 hover:underline cursor-pointer">
                          <Music size={14} />
                          Adjuntar narración para sincronizar (opcional)
                          <input
                            type="file"
                            accept="audio/*"
                            onChange={(e) => handleAttachAudio(file.id, e)}
                            className="hidden"
                            id={`queue-audio-input-${file.id}`}
                          />
                        </label>
                      )
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex gap-3">
          <button
            onClick={handleStartQueue}
            disabled={isStarting || !!queueId || files.length === 0}
            className="btn-primary flex-1 flex items-center justify-center gap-2"
          >
            {isStarting ? <Loader className="w-5 h-5 animate-spin" /> : <Play className="w-5 h-5" />}
            {isStarting ? 'Iniciando...' : `▶️ Procesar Cola (${files.length})`}
          </button>
          {!!queueId && (
            <button
              onClick={handleReset}
              className="btn-secondary flex items-center justify-center gap-2 px-4"
              title="Empezar una nueva cola"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Queue status panel */}
      {queueState && !monitorClosed && (
        <div className="card-lg animate-materialize">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="p-3 card-icon">
                <ListVideo className="w-5 h-5 text-white" />
              </div>
              <div>
                <h3 className="card-title">Estado de la cola</h3>
                <p className="card-subtitle">
                  {queueState.isProcessing ? 'Procesando en tiempo real…' : 'Finalizado'}
                </p>
              </div>
            </div>
            <button
              onClick={() => setMonitorClosed(true)}
              className="p-2 rounded-xl bg-gray-100 dark:bg-zinc-900 text-gray-500 dark:text-zinc-400 hover:bg-gray-200 dark:hover:bg-zinc-800 transition-colors"
              title="Cerrar monitor"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="space-y-2 mb-6">
            {queueState.items.map((item, idx) => (
              <div
                key={idx}
                className={`flex items-center gap-3 rounded-xl p-3 border ${
                  item.status === 'processing'
                    ? 'bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-800'
                    : item.status === 'completed'
                    ? 'bg-emerald-50 dark:bg-emerald-950 border-emerald-200 dark:border-emerald-800'
                    : item.status === 'failed'
                    ? 'bg-red-50 dark:bg-red-950 border-red-200 dark:border-red-800'
                    : 'bg-white border-gray-200 dark:bg-zinc-900 dark:border-zinc-800'
                }`}
              >
                {statusIcon(item.status)}
                <span className="flex-1 text-sm text-gray-900 dark:text-zinc-100 truncate">{item.name}</span>
                {item.status === 'processing' && queueState.totalSeconds > 0 && (
                  <span className="text-xs text-accent-600 dark:text-accent-400 font-semibold">
                    {formatMinutes(queueState.currentSeconds)} / {formatMinutes(queueState.totalSeconds)} min ·{' '}
                    {Math.round(queueState.currentPercent)}%
                  </span>
                )}
                {item.status === 'failed' && (
                  <span className="text-xs text-red-700 dark:text-red-400">{item.error}</span>
                )}
                {item.status === 'completed' && item.outputUrl && (
                  <div className="flex items-center gap-3 shrink-0">
                    <button
                      onClick={() => setPreviewItem(item)}
                      className="flex items-center gap-1.5 text-xs font-semibold text-accent-600 dark:text-accent-400 hover:underline"
                    >
                      <Eye size={14} /> Vista previa
                    </button>
                    <a
                      href={`${API_URL}${item.outputUrl}`}
                      download
                      className="flex items-center gap-1.5 text-xs font-semibold text-accent-600 dark:text-accent-400 hover:underline"
                    >
                      <Download size={14} /> Descargar
                    </a>
                  </div>
                )}
              </div>
            ))}
          </div>

          {queueState.isProcessing && queueState.totalSeconds > 0 && (
            <div className="mb-6">
              <div className="w-full bg-gray-100 dark:bg-zinc-800 rounded-full h-2.5 overflow-hidden">
                <div
                  className="bg-gradient-to-r from-accent-400 to-accent-600 h-full transition-all duration-300 rounded-full shadow-[0_0_10px_rgb(var(--accent-500)/0.6)]"
                  style={{ width: `${queueState.currentPercent}%` }}
                />
              </div>
            </div>
          )}

          <div className="max-h-64 overflow-y-auto space-y-2">
            {queueState.events.slice(-30).map((event, idx) => (
              <div
                key={idx}
                className={`text-xs p-2.5 rounded-xl border-l-2 ${
                  event.type === 'error'
                    ? 'bg-red-50 dark:bg-red-950 border-red-500 dark:border-red-800 text-red-700 dark:text-red-400'
                    : event.type === 'warning'
                    ? 'bg-amber-50 dark:bg-amber-950 border-amber-500 dark:border-amber-800 text-amber-700 dark:text-amber-400'
                    : event.type === 'success'
                    ? 'bg-emerald-50 dark:bg-emerald-950 border-emerald-500 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400'
                    : 'bg-gray-50 dark:bg-zinc-900 border-gray-300 dark:border-zinc-700 text-gray-600 dark:text-zinc-400'
                }`}
              >
                {event.message}
              </div>
            ))}
          </div>

          {!queueState.isProcessing && queueState.events.length > 0 && (
            <div className="mt-4 pt-4 border-t border-gray-200 dark:border-zinc-800 space-y-3">
              <div className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">
                ✅ Cola finalizada
              </div>
              <button
                onClick={() => setMonitorClosed(true)}
                className="btn-secondary w-full flex items-center justify-center gap-2 py-2 text-sm"
              >
                <X className="w-4 h-4" /> Cerrar monitor
              </button>
            </div>
          )}
        </div>
      )}

      <VideoPreviewModal
        isOpen={!!previewItem}
        onClose={() => setPreviewItem(null)}
        title={previewItem?.name || ''}
        videoUrl={previewItem?.outputUrl ? `${API_URL}${previewItem.outputUrl}` : ''}
      />
    </div>
  );
}
