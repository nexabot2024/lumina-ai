import { useState } from 'react';
import { Scissors, Upload, X, Plus, FolderOpen, Play, Loader, Activity, Trash2, Wand2, Image as ImageIcon, Film, RotateCcw } from 'lucide-react';
import toast from 'react-hot-toast';
import axios from 'axios';
import CompilationMonitor from './CompilationMonitor';
import { API_URL } from '../services/apiUrl';
import { useLocalStorageState } from '../hooks/useLocalStorageState';

const MAX_IMAGE_DURATION = 60;

interface ReferenceItem {
  id: string;
  name: string;
  path: string;
  type: 'video' | 'image';
  assignedMinutes?: number; // video: cuántos minutos del final ocupa (no aplica al último, que rellena el resto)
  imageDurationSeconds?: number; // imagen: duración fija en segundos (siempre requerida, máx. 60)
}

interface TextOverlayEntry {
  id: string;
  start: number;
  end: number;
  text: string;
}

type TransitionType = 'fade' | 'dissolve' | 'wipeleft' | 'wiperight' | 'slideup' | 'slidedown';
type AnimationType = 'zoomin' | 'zoomout' | 'pan' | 'none';

export default function ClipEditor() {
  const [referenceItems, setReferenceItems] = useState<ReferenceItem[]>([]);
  const [audioFile, setAudioFile] = useState<{ name: string; path: string; duration?: number } | null>(null);
  const [musicFile, setMusicFile] = useState<{ name: string; path: string } | null>(null);

  const [wantSubtitles, setWantSubtitles] = useState(false);
  const [wantMusic, setWantMusic] = useState(false);
  const [wantTextOverlays, setWantTextOverlays] = useState(false);
  const [textOverlays, setTextOverlays] = useState<TextOverlayEntry[]>([]);

  const [splitScenes, setSplitScenes] = useState(true);
  const [allowClipRepeat, setAllowClipRepeat] = useState(true);
  const [wantMaxClipDuration, setWantMaxClipDuration] = useState(false);
  const [maxClipDuration, setMaxClipDuration] = useState(6);
  const [wantTransitions, setWantTransitions] = useState(false);
  const [transitionType, setTransitionType] = useState<TransitionType>('fade');
  const [transitionDuration, setTransitionDuration] = useState(0.5);
  const [wantAnimations, setWantAnimations] = useState(false);
  const [animationType, setAnimationType] = useState<AnimationType>('zoomin');

  const [instructionsText, setInstructionsText] = useState('');
  const [isParsingInstructions, setIsParsingInstructions] = useState(false);
  const [instructionsSummary, setInstructionsSummary] = useState('');

  const [outputFolder, setOutputFolder] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showMonitor, setShowMonitor] = useLocalStorageState('lumina-job-clipEditor-monitorOpen', false);
  const [currentJobId, setCurrentJobId] = useLocalStorageState('lumina-job-clipEditor', '');

  const uploadFile = async (file: File): Promise<{ name: string; path: string; duration?: number; type?: string }> => {
    const formData = new FormData();
    formData.append('file', file);
    const response = await axios.post(`${API_URL}/api/upload`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return {
      name: file.name,
      path: response.data.file.path,
      duration: response.data.file.duration,
      type: response.data.file.type,
    };
  };

  const handleReferenceUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    const files = Array.from(e.target.files);
    setIsUploading(true);
    try {
      for (const file of files) {
        const uploaded = await uploadFile(file);
        const isImage = uploaded.type === 'image' || file.type.startsWith('image/');
        setReferenceItems(prev => [
          ...prev,
          {
            id: Math.random().toString(),
            name: uploaded.name,
            path: uploaded.path,
            type: isImage ? 'image' : 'video',
            imageDurationSeconds: isImage ? 5 : undefined,
          },
        ]);
        toast.success(`${file.name} subido`);
      }
    } catch (err) {
      toast.error('Error al subir material de referencia');
    } finally {
      setIsUploading(false);
      e.target.value = '';
    }
  };

  const handleAudioUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.[0]) return;
    setIsUploading(true);
    try {
      const uploaded = await uploadFile(e.target.files[0]);
      setAudioFile(uploaded);
      toast.success(`Audio ${uploaded.name} subido`);
    } catch (err) {
      toast.error('Error al subir audio');
    } finally {
      setIsUploading(false);
      e.target.value = '';
    }
  };

  const handleMusicUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.[0]) return;
    setIsUploading(true);
    try {
      const uploaded = await uploadFile(e.target.files[0]);
      setMusicFile(uploaded);
      toast.success(`Música ${uploaded.name} subida`);
    } catch (err) {
      toast.error('Error al subir música');
    } finally {
      setIsUploading(false);
      e.target.value = '';
    }
  };

  const handleRemoveVideo = (id: string) => {
    setReferenceItems(prev => prev.filter(v => v.id !== id));
  };

  const handleAssignedDurationChange = (id: string, value: string) => {
    const minutes = parseFloat(value);
    setReferenceItems(prev =>
      prev.map(v => (v.id === id ? { ...v, assignedMinutes: isNaN(minutes) ? undefined : minutes } : v))
    );
  };

  const handleImageDurationChange = (id: string, value: string) => {
    const seconds = parseFloat(value);
    const clamped = isNaN(seconds) ? undefined : Math.min(MAX_IMAGE_DURATION, Math.max(1, seconds));
    setReferenceItems(prev =>
      prev.map(v => (v.id === id ? { ...v, imageDurationSeconds: clamped } : v))
    );
  };

  const handleAddTextOverlay = () => {
    setTextOverlays(prev => [
      ...prev,
      { id: Math.random().toString(), start: 0, end: 5, text: '' },
    ]);
  };

  const handleUpdateTextOverlay = (id: string, field: 'start' | 'end' | 'text', value: string) => {
    setTextOverlays(prev =>
      prev.map(t =>
        t.id === id
          ? { ...t, [field]: field === 'text' ? value : parseFloat(value) || 0 }
          : t
      )
    );
  };

  const handleRemoveTextOverlay = (id: string) => {
    setTextOverlays(prev => prev.filter(t => t.id !== id));
  };

  const handleParseInstructions = async () => {
    if (!instructionsText.trim()) {
      toast.error('Escribe alguna indicación de edición primero');
      return;
    }

    setIsParsingInstructions(true);
    try {
      const response = await axios.post(`${API_URL}/api/clip-editing/parse-instructions`, {
        instructions: instructionsText,
        knownDurationSeconds: audioFile?.duration,
      });

      const config = response.data.config;

      setSplitScenes(config.splitScenes);
      setAllowClipRepeat(config.allowClipRepeat);

      setWantTransitions(config.transitions.enabled);
      setTransitionType(config.transitions.type);
      setTransitionDuration(config.transitions.duration);

      setWantAnimations(config.animations.enabled);
      setAnimationType(config.animations.type);

      if (config.textOverlays.length > 0) {
        setWantTextOverlays(true);
        setTextOverlays(
          config.textOverlays.map((t: any) => ({
            id: Math.random().toString(),
            start: t.start,
            end: t.end,
            text: t.text,
          }))
        );
      }

      setInstructionsSummary(config.summary);
      toast.success('Instrucciones aplicadas a la configuración');
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Error al interpretar las instrucciones');
    } finally {
      setIsParsingInstructions(false);
    }
  };

  const handlePickFolder = async () => {
    try {
      const response = await axios.get(`${API_URL}/api/clip-editing/pick-folder`);
      if (response.data.success && response.data.path) {
        setOutputFolder(response.data.path);
        toast.success('Carpeta seleccionada');
      }
    } catch (err) {
      toast.error('Error al abrir el selector de carpetas');
    }
  };

  const handleProcess = async () => {
    if (referenceItems.length === 0) {
      toast.error('Sube al menos un video o imagen de referencia');
      return;
    }
    if (!audioFile) {
      toast.error('Sube el audio de narración');
      return;
    }
    if (!outputFolder) {
      toast.error('Selecciona una carpeta de salida');
      return;
    }
    if (wantMusic && !musicFile) {
      toast.error('Sube un archivo de música de fondo o desactiva esa opción');
      return;
    }

    const jobId = `clip-job-${Date.now()}`;
    setCurrentJobId(jobId);
    setShowMonitor(true);
    setIsProcessing(true);

    try {
      let cumulativeSeconds = 0;
      const splicePoints = referenceItems.slice(0, -1).map(v => {
        const durationSeconds = v.type === 'image' ? (v.imageDurationSeconds ?? 5) : (v.assignedMinutes ?? 0) * 60;
        cumulativeSeconds += durationSeconds;
        return cumulativeSeconds;
      });

      await axios.post(`${API_URL}/api/clip-editing/process`, {
        jobId,
        videoPaths: referenceItems.map(v => v.path),
        sourceTypes: referenceItems.map(v => v.type),
        imageDurations: referenceItems.map(v =>
          v.type === 'image' ? Math.min(MAX_IMAGE_DURATION, Math.max(1, v.imageDurationSeconds ?? 5)) : undefined
        ),
        splicePoints,
        audioPath: audioFile.path,
        subtitles: wantSubtitles,
        backgroundMusic: wantMusic ? { enabled: true, path: musicFile?.path, volume: 0.15 } : { enabled: false },
        textOverlays: wantTextOverlays
          ? textOverlays.filter(t => t.text.trim().length > 0).map(t => ({ start: t.start, end: t.end, text: t.text }))
          : [],
        outputFolder,
        splitScenes,
        allowClipRepeat,
        transitions: { enabled: wantTransitions, type: transitionType, duration: transitionDuration },
        animations: { enabled: wantAnimations, type: animationType },
        maxClipDuration: wantMaxClipDuration ? maxClipDuration : undefined,
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
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-accent-600 rounded-lg">
              <Scissors className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-gray-900 dark:text-zinc-100 text-sm font-medium">Editor de Clips</h2>
              <p className="text-gray-400 dark:text-zinc-500 text-[10px]">
                Divide videos por escenas, reordénalos automáticamente y sincroniza con audio
              </p>
            </div>
          </div>
        </div>

        {/* Reference material upload (videos and/or images) */}
        <div className="mb-6">
          <label className="block text-sm font-semibold mb-2">
            Material de referencia (video o imagen) {referenceItems.length > 1 && '(indica cuánto ocupa cada uno; el último video rellena el resto del audio)'}
          </label>
          <div className="border border-dashed border-gray-300 dark:border-zinc-700 bg-gray-50 dark:bg-zinc-900/50 rounded-xl p-4 text-center hover:border-gray-400 dark:hover:border-zinc-500 transition-colors mb-3">
            <input
              type="file"
              accept="video/*,image/*"
              multiple
              onChange={handleReferenceUpload}
              className="hidden"
              id="ref-video-input"
              disabled={isUploading}
            />
            <label htmlFor="ref-video-input" className="cursor-pointer">
              <Upload className="mx-auto mb-2 text-accent-500 dark:text-accent-400" size={24} />
              <span className="text-sm text-gray-600 dark:text-zinc-400">
                {isUploading ? 'Subiendo...' : 'Subir video(s) o imagen(es) de referencia (puedes seleccionar varios)'}
              </span>
            </label>
          </div>

          {referenceItems.length > 0 && (
            <div className="space-y-2">
              {referenceItems.map((item, idx) => (
                <div
                  key={item.id}
                  className="flex items-center gap-3 bg-gray-50 dark:bg-zinc-950 border border-gray-200 dark:border-zinc-800 rounded-lg p-3"
                >
                  {item.type === 'image' ? (
                    <ImageIcon size={16} className="text-accent-500 dark:text-accent-400 shrink-0" />
                  ) : (
                    <Film size={16} className="text-accent-500 dark:text-accent-400 shrink-0" />
                  )}
                  <span className="text-xs font-bold text-accent-600 dark:text-accent-400 w-16">
                    {item.type === 'image' ? `Imagen` : `Video`} {idx + 1}
                  </span>
                  <span className="flex-1 text-sm text-gray-900 dark:text-zinc-100 truncate">{item.name}</span>
                  {item.type === 'image' ? (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-500 dark:text-zinc-400" title="Las imágenes siempre llevan zoom y movimiento animado">
                        Duración (s, máx. {MAX_IMAGE_DURATION}):
                      </span>
                      <input
                        type="number"
                        min="1"
                        max={MAX_IMAGE_DURATION}
                        step="1"
                        value={item.imageDurationSeconds ?? ''}
                        onChange={(e) => handleImageDurationChange(item.id, e.target.value)}
                        placeholder="ej. 5"
                        className="w-16 px-2 py-1 bg-gray-50 dark:bg-zinc-950 border border-gray-200 dark:border-zinc-800 rounded-lg text-sm text-gray-900 dark:text-zinc-100 focus:border-accent-500 dark:focus:border-accent-600 focus:outline-none"
                      />
                    </div>
                  ) : idx < referenceItems.length - 1 ? (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-500 dark:text-zinc-400">Duración asignada (min):</span>
                      <input
                        type="number"
                        min="0"
                        step="0.5"
                        value={item.assignedMinutes ?? ''}
                        onChange={(e) => handleAssignedDurationChange(item.id, e.target.value)}
                        placeholder="ej. 15"
                        className="w-20 px-2 py-1 bg-gray-50 dark:bg-zinc-950 border border-gray-200 dark:border-zinc-800 rounded-lg text-sm text-gray-900 dark:text-zinc-100 focus:border-accent-500 dark:focus:border-accent-600 focus:outline-none"
                      />
                    </div>
                  ) : (
                    referenceItems.length > 1 && (
                      <span className="text-xs text-gray-500 italic dark:text-zinc-400">rellena el resto</span>
                    )
                  )}
                  <button onClick={() => handleRemoveVideo(item.id)} className="text-gray-500 dark:text-zinc-400 hover:text-red-500">
                    <X size={16} />
                  </button>
                </div>
              ))}
              {referenceItems.length > 1 && (
                <p className="text-xs text-gray-500 dark:text-zinc-400">
                  Total asignado: {(referenceItems.slice(0, -1).reduce((s, v) => s + (v.type === 'image' ? (v.imageDurationSeconds ?? 5) : (v.assignedMinutes ?? 0) * 60), 0) / 60).toFixed(1)} min
                  {audioFile?.duration ? ` de ${(audioFile.duration / 60).toFixed(1)} min de audio` : ''}
                </p>
              )}
            </div>
          )}
        </div>

        {/* Audio upload */}
        <div className="mb-6">
          <label className="block text-sm font-semibold mb-2">Audio de narración</label>
          {audioFile ? (
            <div className="flex items-center gap-3 bg-gray-50 dark:bg-zinc-950 border border-gray-200 dark:border-zinc-800 rounded-lg p-3">
              <span className="flex-1 text-sm text-gray-900 dark:text-zinc-100 truncate">{audioFile.name}</span>
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
                id="audio-input"
                disabled={isUploading}
              />
              <label htmlFor="audio-input" className="cursor-pointer">
                <Upload className="mx-auto mb-2 text-accent-500 dark:text-accent-400" size={24} />
                <span className="text-sm text-gray-600 dark:text-zinc-400">Subir audio de narración</span>
              </label>
            </div>
          )}
        </div>

        {/* Natural-language editing instructions */}
        <div className="mb-6 p-4 bg-accent-50 dark:bg-accent-950/20 rounded-lg border border-accent-200 dark:border-accent-900/40">
          <div className="flex items-center gap-2 mb-3">
            <Wand2 className="w-5 h-5 text-accent-600 dark:text-accent-400" />
            <label className="text-sm font-bold text-accent-700 dark:text-accent-200">Indicaciones de edición (lenguaje natural)</label>
          </div>
          <textarea
            value={instructionsText}
            onChange={(e) => setInstructionsText(e.target.value)}
            placeholder={`Ej: "Divide las escenas, añade transiciones tipo fade en todo el video, agrega un zoom suave a los clips, repite clips si hace falta para llenar el audio, y pon el texto 'Suscríbete' en el segundo 45"`}
            rows={3}
            className="w-full px-3 py-2 bg-gray-50 dark:bg-zinc-950 border border-gray-200 dark:border-zinc-800 text-gray-900 dark:text-zinc-100 placeholder-gray-400 dark:placeholder-zinc-600 text-sm font-mono-ui rounded-lg focus:border-accent-500 dark:focus:border-accent-600 focus:outline-none resize-none"
          />
          <button
            onClick={handleParseInstructions}
            disabled={isParsingInstructions}
            className="mt-3 btn-secondary flex items-center gap-2 px-4 py-2 text-sm"
          >
            {isParsingInstructions ? <Loader className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
            {isParsingInstructions ? 'Interpretando...' : 'Aplicar con IA'}
          </button>
          {instructionsSummary && (
            <div className="mt-3 p-3 bg-accent-50 dark:bg-zinc-900/50 border border-accent-200 dark:border-accent-900/40 rounded-lg text-xs font-mono-ui text-accent-800 dark:text-accent-200">
              {instructionsSummary}
            </div>
          )}
        </div>

        {/* Options */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
          <label className="flex items-center gap-3 bg-gray-50 dark:bg-zinc-950 border border-gray-200 dark:border-zinc-800 rounded-lg p-4 cursor-pointer">
            <input
              type="checkbox"
              checked={splitScenes}
              onChange={(e) => setSplitScenes(e.target.checked)}
              className="w-5 h-5 accent-accent-600"
            />
            <span className="text-sm font-semibold">Dividir por escenas</span>
          </label>

          <label className="flex items-center gap-3 bg-gray-50 dark:bg-zinc-950 border border-gray-200 dark:border-zinc-800 rounded-lg p-4 cursor-pointer">
            <input
              type="checkbox"
              checked={allowClipRepeat}
              onChange={(e) => setAllowClipRepeat(e.target.checked)}
              className="w-5 h-5 accent-accent-600"
            />
            <span className="text-sm font-semibold">Repetir clips si hace falta</span>
          </label>

          <label className="flex items-center gap-3 bg-gray-50 dark:bg-zinc-950 border border-gray-200 dark:border-zinc-800 rounded-lg p-4 cursor-pointer">
            <input
              type="checkbox"
              checked={wantMaxClipDuration}
              onChange={(e) => setWantMaxClipDuration(e.target.checked)}
              className="w-5 h-5 accent-accent-600"
            />
            <span className="text-sm font-semibold">Límite de duración por clip</span>
          </label>

          <label className="flex items-center gap-3 bg-gray-50 dark:bg-zinc-950 border border-gray-200 dark:border-zinc-800 rounded-lg p-4 cursor-pointer">
            <input
              type="checkbox"
              checked={wantSubtitles}
              onChange={(e) => setWantSubtitles(e.target.checked)}
              className="w-5 h-5 accent-accent-600"
            />
            <span className="text-sm font-semibold">Subtítulos automáticos</span>
          </label>

          <label className="flex items-center gap-3 bg-gray-50 dark:bg-zinc-950 border border-gray-200 dark:border-zinc-800 rounded-lg p-4 cursor-pointer">
            <input
              type="checkbox"
              checked={wantMusic}
              onChange={(e) => setWantMusic(e.target.checked)}
              className="w-5 h-5 accent-accent-600"
            />
            <span className="text-sm font-semibold">Música de fondo</span>
          </label>

          <label className="flex items-center gap-3 bg-gray-50 dark:bg-zinc-950 border border-gray-200 dark:border-zinc-800 rounded-lg p-4 cursor-pointer">
            <input
              type="checkbox"
              checked={wantTextOverlays}
              onChange={(e) => setWantTextOverlays(e.target.checked)}
              className="w-5 h-5 accent-accent-600"
            />
            <span className="text-sm font-semibold">Textos en pantalla</span>
          </label>

          <label className="flex items-center gap-3 bg-gray-50 dark:bg-zinc-950 border border-gray-200 dark:border-zinc-800 rounded-lg p-4 cursor-pointer">
            <input
              type="checkbox"
              checked={wantTransitions}
              onChange={(e) => setWantTransitions(e.target.checked)}
              className="w-5 h-5 accent-accent-600"
            />
            <span className="text-sm font-semibold">Transiciones automáticas</span>
          </label>

          <label className="flex items-center gap-3 bg-gray-50 dark:bg-zinc-950 border border-gray-200 dark:border-zinc-800 rounded-lg p-4 cursor-pointer">
            <input
              type="checkbox"
              checked={wantAnimations}
              onChange={(e) => setWantAnimations(e.target.checked)}
              className="w-5 h-5 accent-accent-600"
            />
            <span className="text-sm font-semibold">Animaciones (zoom/paneo)</span>
          </label>
        </div>

        {wantMaxClipDuration && (
          <div className="mb-6 flex items-center gap-2 bg-gray-50 dark:bg-zinc-950 border border-gray-200 dark:border-zinc-800 rounded-lg p-4">
            <span className="text-xs text-gray-500 dark:text-zinc-400">Duración máxima por clip (segundos):</span>
            <input
              type="number"
              min="0.5"
              step="0.5"
              value={maxClipDuration}
              onChange={(e) => setMaxClipDuration(parseFloat(e.target.value) || 6)}
              className="w-20 px-2 py-1 bg-gray-50 dark:bg-zinc-950 border border-gray-200 dark:border-zinc-800 rounded-lg text-sm text-gray-900 dark:text-zinc-100 focus:border-accent-500 dark:focus:border-accent-600 focus:outline-none"
            />
          </div>
        )}

        {wantTransitions && (
          <div className="mb-6 flex items-center gap-4 bg-gray-50 dark:bg-zinc-950 border border-gray-200 dark:border-zinc-800 rounded-lg p-4">
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500 dark:text-zinc-400">Tipo:</span>
              <select
                value={transitionType}
                onChange={(e) => setTransitionType(e.target.value as TransitionType)}
                className="px-2 py-1 bg-gray-50 dark:bg-zinc-950 border border-gray-200 dark:border-zinc-800 rounded-lg text-sm text-gray-700 dark:text-zinc-300 focus:border-accent-500 dark:focus:border-accent-600 focus:outline-none"
              >
                <option value="fade">Fade</option>
                <option value="dissolve">Disolvencia</option>
                <option value="wipeleft">Wipe izquierda</option>
                <option value="wiperight">Wipe derecha</option>
                <option value="slideup">Deslizar arriba</option>
                <option value="slidedown">Deslizar abajo</option>
              </select>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500 dark:text-zinc-400">Duración (s):</span>
              <input
                type="number"
                min="0.1"
                step="0.1"
                value={transitionDuration}
                onChange={(e) => setTransitionDuration(parseFloat(e.target.value) || 0.5)}
                className="w-20 px-2 py-1 bg-gray-50 dark:bg-zinc-950 border border-gray-200 dark:border-zinc-800 rounded-lg text-sm text-gray-900 dark:text-zinc-100 focus:border-accent-500 dark:focus:border-accent-600 focus:outline-none"
              />
            </div>
          </div>
        )}

        {wantAnimations && (
          <div className="mb-6 flex items-center gap-2 bg-gray-50 dark:bg-zinc-950 border border-gray-200 dark:border-zinc-800 rounded-lg p-4">
            <span className="text-xs text-gray-500 dark:text-zinc-400">Tipo de animación:</span>
            <select
              value={animationType}
              onChange={(e) => setAnimationType(e.target.value as AnimationType)}
              className="px-2 py-1 bg-gray-50 dark:bg-zinc-950 border border-gray-200 dark:border-zinc-800 rounded-lg text-sm text-gray-700 dark:text-zinc-300 focus:border-accent-500 dark:focus:border-accent-600 focus:outline-none"
            >
              <option value="zoomin">Zoom in</option>
              <option value="zoomout">Zoom out</option>
              <option value="pan">Paneo (Ken Burns)</option>
            </select>
          </div>
        )}

        {wantMusic && (
          <div className="mb-6">
            {musicFile ? (
              <div className="flex items-center gap-3 bg-gray-50 dark:bg-zinc-950 border border-gray-200 dark:border-zinc-800 rounded-lg p-3">
                <span className="flex-1 text-sm text-gray-900 dark:text-zinc-100 truncate">{musicFile.name}</span>
                <button onClick={() => setMusicFile(null)} className="text-gray-500 dark:text-zinc-400 hover:text-red-500">
                  <X size={16} />
                </button>
              </div>
            ) : (
              <div className="border border-dashed border-gray-300 dark:border-zinc-700 bg-gray-50 dark:bg-zinc-900/50 rounded-xl p-4 text-center hover:border-gray-400 dark:hover:border-zinc-500 transition-colors">
                <input
                  type="file"
                  accept="audio/*"
                  onChange={handleMusicUpload}
                  className="hidden"
                  id="music-input"
                  disabled={isUploading}
                />
                <label htmlFor="music-input" className="cursor-pointer">
                  <Upload className="mx-auto mb-2 text-accent-500 dark:text-accent-400" size={24} />
                  <span className="text-sm text-gray-600 dark:text-zinc-400">Subir música de fondo</span>
                </label>
              </div>
            )}
          </div>
        )}

        {wantTextOverlays && (
          <div className="mb-6 space-y-3">
            {textOverlays.map(overlay => (
              <div key={overlay.id} className="flex items-center gap-2 bg-gray-50 dark:bg-zinc-950 border border-gray-200 dark:border-zinc-800 rounded-lg p-3">
                <input
                  type="number"
                  value={overlay.start}
                  onChange={(e) => handleUpdateTextOverlay(overlay.id, 'start', e.target.value)}
                  placeholder="Inicio (s)"
                  className="w-24 px-2 py-1 bg-gray-50 dark:bg-zinc-950 border border-gray-200 dark:border-zinc-800 rounded-lg text-sm text-gray-900 dark:text-zinc-100 focus:border-accent-500 dark:focus:border-accent-600 focus:outline-none"
                />
                <span className="text-gray-500 text-xs dark:text-zinc-400">a</span>
                <input
                  type="number"
                  value={overlay.end}
                  onChange={(e) => handleUpdateTextOverlay(overlay.id, 'end', e.target.value)}
                  placeholder="Fin (s)"
                  className="w-24 px-2 py-1 bg-gray-50 dark:bg-zinc-950 border border-gray-200 dark:border-zinc-800 rounded-lg text-sm text-gray-900 dark:text-zinc-100 focus:border-accent-500 dark:focus:border-accent-600 focus:outline-none"
                />
                <input
                  type="text"
                  value={overlay.text}
                  onChange={(e) => handleUpdateTextOverlay(overlay.id, 'text', e.target.value)}
                  placeholder="Texto a mostrar"
                  className="flex-1 px-2 py-1 bg-gray-50 dark:bg-zinc-950 border border-gray-200 dark:border-zinc-800 rounded-lg text-sm text-gray-900 dark:text-zinc-100 focus:border-accent-500 dark:focus:border-accent-600 focus:outline-none"
                />
                <button onClick={() => handleRemoveTextOverlay(overlay.id)} className="text-gray-500 dark:text-zinc-400 hover:text-red-500">
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
            <button
              onClick={handleAddTextOverlay}
              className="flex items-center gap-2 text-sm text-accent-600 hover:text-accent-700 dark:text-accent-400 dark:hover:text-accent-300"
            >
              <Plus size={16} /> Añadir segmento de texto
            </button>
          </div>
        )}

        {/* Output folder */}
        <div className="mb-6">
          <label className="block text-sm font-semibold mb-2">Carpeta de salida</label>
          <div className="flex items-center gap-3">
            <input
              type="text"
              value={outputFolder}
              readOnly
              placeholder="Selecciona una carpeta..."
              className="flex-1 px-3 py-2 bg-gray-50 dark:bg-zinc-950 border border-gray-200 dark:border-zinc-800 text-gray-900 dark:text-zinc-100 placeholder-gray-400 dark:placeholder-zinc-600 rounded-lg focus:border-accent-500 dark:focus:border-accent-600 focus:outline-none"
            />
            <button
              onClick={handlePickFolder}
              className="btn-secondary flex items-center gap-2 px-4 py-2"
            >
              <FolderOpen size={18} /> Elegir carpeta
            </button>
          </div>
        </div>

        {/* Process button */}
        <div className="flex gap-3">
          <button
            onClick={handleProcess}
            disabled={isProcessing || referenceItems.length === 0}
            className="btn-primary flex-1 flex items-center justify-center gap-2"
          >
            {isProcessing ? <Loader className="w-5 h-5 animate-spin" /> : <Play className="w-5 h-5" />}
            {isProcessing ? 'Procesando...' : '✂️ Procesar Clips'}
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
        title="Monitor de Procesamiento de Clips"
      />
    </div>
  );
}
