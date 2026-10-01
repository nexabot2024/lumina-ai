import { useEffect, useState } from 'react';
import { Clapperboard, Upload, X, Play, Loader, CheckCircle, AlertTriangle, FolderOpen, FileText, RotateCcw } from 'lucide-react';
import toast from 'react-hot-toast';
import axios from 'axios';
import { API_URL } from '../services/apiUrl';
import { useLocalStorageState } from '../hooks/useLocalStorageState';

interface DoctorCheck {
  name: string;
  status: 'ok' | 'warn' | 'error';
  detail: string;
  affects?: string[];
  fix?: string;
}

interface DoctorResult {
  ok: boolean;
  checks: DoctorCheck[];
}

interface CapcutEvent {
  type: string;
  message: string;
  percent?: number;
}

interface CapcutJobState {
  isProcessing: boolean;
  events: CapcutEvent[];
  currentPercent: number;
  draftPath?: string;
  openHint?: string[];
}

export default function CapCutExport() {
  const [doctor, setDoctor] = useState<DoctorResult | null>(null);
  const [doctorLoading, setDoctorLoading] = useState(true);

  const [video, setVideo] = useState<{ name: string; path: string } | null>(null);
  const [srt, setSrt] = useState<{ name: string; path: string } | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [projectName, setProjectName] = useState('');

  const [isStarting, setIsStarting] = useState(false);
  const [jobId, setJobId] = useLocalStorageState('lumina-job-capcut', '');
  const [jobState, setJobState] = useState<CapcutJobState | null>(null);

  useEffect(() => {
    axios
      .get(`${API_URL}/api/capcut/doctor`)
      .then(res => setDoctor(res.data))
      .catch(() => setDoctor(null))
      .finally(() => setDoctorLoading(false));
  }, []);

  useEffect(() => {
    if (!jobId) return;
    const eventSource = new EventSource(`${API_URL}/api/capcut/status/${jobId}`);
    let firstMessage = true;

    eventSource.onmessage = (e) => {
      const data = JSON.parse(e.data);
      if (firstMessage) {
        firstMessage = false;
        if (!data.isCompiling && (!data.events || data.events.length === 0)) {
          setJobId('');
          eventSource.close();
          return;
        }
      }
      setJobState({
        isProcessing: data.isCompiling,
        events: data.events || [],
        currentPercent: data.currentPercent || 0,
        draftPath: data.draftPath,
        openHint: data.openHint,
      });
    };
    eventSource.onerror = () => eventSource.close();
    return () => eventSource.close();
  }, [jobId]);

  const uploadFile = async (file: File): Promise<{ name: string; path: string }> => {
    const formData = new FormData();
    formData.append('file', file);
    const response = await axios.post(`${API_URL}/api/upload`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return { name: file.name, path: response.data.file.path };
  };

  const handleVideoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploading(true);
    try {
      const uploaded = await uploadFile(file);
      setVideo(uploaded);
      if (!projectName) {
        setProjectName(file.name.replace(/\.[^./]+$/, ''));
      }
      toast.success(`${file.name} subido`);
    } catch (err) {
      toast.error('Error al subir el video');
    } finally {
      setIsUploading(false);
      e.target.value = '';
    }
  };

  const handleSrtUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploading(true);
    try {
      const uploaded = await uploadFile(file);
      setSrt(uploaded);
      toast.success(`${file.name} subido`);
    } catch (err) {
      toast.error('Error al subir el .srt');
    } finally {
      setIsUploading(false);
      e.target.value = '';
    }
  };

  const handleExport = async () => {
    if (!video) {
      toast.error('Sube el video que quieres exportar');
      return;
    }

    const newJobId = `capcut-${Date.now()}`;
    setIsStarting(true);
    try {
      await axios.post(`${API_URL}/api/capcut/export`, {
        jobId: newJobId,
        name: projectName || video.name.replace(/\.[^./]+$/, ''),
        videoPath: video.path,
        srtPath: srt?.path,
      });
      setJobId(newJobId);
      toast.success('Exportación a CapCut iniciada');
    } catch (error: any) {
      toast.error(error?.response?.data?.error || 'Error al iniciar la exportación');
    } finally {
      setIsStarting(false);
    }
  };

  const handleReset = () => {
    setJobId('');
    setJobState(null);
    setVideo(null);
    setSrt(null);
    setProjectName('');
  };

  const draftCheck = doctor?.checks.find(c => c.name === 'draft-dir' && c.detail.includes('CapCut'));
  const capcutFound = draftCheck?.status === 'ok';

  return (
    <div className="space-y-6">
      <div className="card-lg">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-3 card-icon">
            <Clapperboard className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="card-title">Exportar a CapCut</h2>
            <p className="card-subtitle">
              Convierte un video ya procesado en un proyecto editable de CapCut — con las pistas intactas para retocarlo a mano
            </p>
          </div>
        </div>

        {/* Estado de la instalación */}
        {!doctorLoading && (
          <div
            className={`mb-6 p-4 rounded-2xl border flex items-start gap-3 text-sm ${
              capcutFound
                ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200'
                : 'bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-200'
            }`}
          >
            {capcutFound ? (
              <CheckCircle className="w-5 h-5 shrink-0 mt-0.5" />
            ) : (
              <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
            )}
            <div>
              <p className="font-medium">
                {capcutFound
                  ? 'CapCut detectado en esta máquina — el proyecto se creará directamente en tu lista de proyectos.'
                  : 'No se detectó CapCut instalado en esta máquina.'}
              </p>
              {!capcutFound && (
                <p className="text-xs mt-1 opacity-80">
                  Abre CapCut al menos una vez (o créalo en la misma máquina donde corre este backend) para que pueda encontrar tu carpeta de proyectos.
                </p>
              )}
            </div>
          </div>
        )}

        {/* Video */}
        <div className="mb-6">
          <label className="block text-sm font-semibold mb-2 text-gray-900 dark:text-zinc-100">Video a exportar</label>
          {video ? (
            <div className="flex items-center gap-3 bg-gray-50 dark:bg-zinc-950 border border-gray-200 dark:border-zinc-800 rounded-xl p-3">
              <span className="flex-1 text-sm text-gray-900 dark:text-zinc-100 truncate">{video.name}</span>
              <button onClick={() => setVideo(null)} className="text-gray-500 dark:text-zinc-400 hover:text-red-500">
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
                id="capcut-video-input"
                disabled={isUploading || !!jobId}
              />
              <label htmlFor="capcut-video-input" className="cursor-pointer">
                <Upload className="mx-auto mb-2 text-accent-500 dark:text-accent-400" size={24} />
                <span className="text-sm text-gray-600 dark:text-zinc-400">
                  {isUploading ? 'Subiendo...' : 'Subir el video ya procesado (desde Cola de Edición, Editor de Clips, etc.)'}
                </span>
              </label>
            </div>
          )}
        </div>

        {/* Subtítulos opcionales */}
        <div className="mb-6">
          <label className="block text-sm font-semibold mb-2 text-gray-900 dark:text-zinc-100">Subtítulos .srt (opcional)</label>
          {srt ? (
            <div className="flex items-center gap-3 bg-gray-50 dark:bg-zinc-950 border border-gray-200 dark:border-zinc-800 rounded-xl p-3">
              <FileText size={16} className="text-accent-500 dark:text-accent-400 shrink-0" />
              <span className="flex-1 text-sm text-gray-900 dark:text-zinc-100 truncate">{srt.name}</span>
              <button onClick={() => setSrt(null)} className="text-gray-500 dark:text-zinc-400 hover:text-red-500">
                <X size={16} />
              </button>
            </div>
          ) : (
            <label className="inline-flex items-center gap-2 btn-secondary py-2 px-4 text-sm cursor-pointer">
              <FileText size={16} />
              Adjuntar .srt
              <input
                type="file"
                accept=".srt"
                onChange={handleSrtUpload}
                className="hidden"
                disabled={isUploading || !!jobId}
              />
            </label>
          )}
        </div>

        {/* Nombre del proyecto */}
        <div className="mb-6">
          <label className="block text-sm font-semibold mb-2 text-gray-900 dark:text-zinc-100">Nombre del proyecto en CapCut</label>
          <input
            type="text"
            value={projectName}
            onChange={(e) => setProjectName(e.target.value)}
            placeholder="ej. mi-video-lumina"
            disabled={!!jobId}
            className="w-full px-4 py-2.5 bg-gray-50 dark:bg-zinc-950 border border-gray-200 dark:border-zinc-800 text-gray-900 dark:text-zinc-100 placeholder-gray-400 dark:placeholder-zinc-600 rounded-lg focus:border-accent-500 dark:focus:border-accent-600 focus:outline-none"
          />
        </div>

        <div className="flex gap-3">
          <button
            onClick={handleExport}
            disabled={isStarting || !!jobId || !video}
            className="btn-primary flex-1 flex items-center justify-center gap-2"
          >
            {isStarting ? <Loader className="w-5 h-5 animate-spin" /> : <Play className="w-5 h-5" />}
            {isStarting ? 'Iniciando...' : '🎬 Exportar a CapCut'}
          </button>
          {!!jobId && !jobState?.isProcessing && (
            <button
              onClick={handleReset}
              className="btn-secondary flex items-center justify-center gap-2 px-4"
              title="Empezar una nueva exportación"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Estado del trabajo */}
      {jobState && (
        <div className="card-lg animate-materialize">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-3 card-icon">
              <Clapperboard className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="card-title">Exportando a CapCut</h3>
              <p className="card-subtitle">
                {jobState.isProcessing ? 'Procesando en tiempo real…' : 'Finalizado'}
              </p>
            </div>
          </div>

          <div className="space-y-2 mb-4">
            {jobState.events.map((event, idx) => (
              <div
                key={idx}
                className={`text-xs p-2.5 rounded-xl border-l-2 ${
                  event.type === 'error'
                    ? 'bg-red-50 dark:bg-red-950 border-red-500 dark:border-red-800 text-red-700 dark:text-red-400'
                    : event.type === 'success'
                    ? 'bg-emerald-50 dark:bg-emerald-950 border-emerald-500 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400'
                    : 'bg-gray-50 dark:bg-zinc-900 border-gray-300 dark:border-zinc-700 text-gray-600 dark:text-zinc-400'
                }`}
              >
                {event.message}
              </div>
            ))}
          </div>

          {!jobState.isProcessing && jobState.draftPath && (
            <div className="p-4 bg-accent-50 dark:bg-accent-950/30 border border-accent-200 dark:border-accent-800 rounded-2xl space-y-2">
              <div className="flex items-center gap-2 text-accent-800 dark:text-accent-200 text-sm font-semibold">
                <FolderOpen className="w-4 h-4" /> Proyecto creado
              </div>
              <p className="text-xs font-mono-ui text-accent-700 dark:text-accent-300 break-all">{jobState.draftPath}</p>
              {jobState.openHint?.map((hint, idx) => (
                <p key={idx} className="text-xs text-accent-700 dark:text-accent-300">{hint}</p>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
