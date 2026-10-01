import { useState } from 'react';
import { Volume2, Loader, Download, RotateCcw, Zap } from 'lucide-react';
import toast from 'react-hot-toast';
import axios from 'axios';
import { API_URL } from '../services/apiUrl';

type Provider = 'ai33' | 'ai84';

const PROVIDER_CONFIG: Record<
  Provider,
  { label: string; voicePlaceholder: string; generateUrl: string; statusUrl: (id: string) => string; downloadUrl: (id: string) => string }
> = {
  ai33: {
    label: 'AI33Pro',
    voicePlaceholder: 'ej. elevenlabs_EXAVITQu4vr4xnSDxMaL',
    generateUrl: '/api/audio/generate',
    statusUrl: (id) => `/api/audio/task/${id}`,
    downloadUrl: (id) => `/api/audio/file/${id}`,
  },
  ai84: {
    label: 'AI84.pro',
    voicePlaceholder: 'ej. JBFqnCBsd6RMkjVDRZzb',
    generateUrl: '/api/ai84/generate',
    statusUrl: (id) => `/api/ai84/status/${id}`,
    downloadUrl: (id) => `/api/ai84/download/${id}`,
  },
};

export default function AudioGenerator() {
  const [provider, setProvider] = useState<Provider>('ai33');
  const [script, setScript] = useState('');
  const [voiceId, setVoiceId] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [taskId, setTaskId] = useState<string | null>(null);
  const [isReady, setIsReady] = useState(false);

  const cfg = PROVIDER_CONFIG[provider];

  const pollReady = (id: string, activeProvider: Provider) => {
    let attempts = 0;
    const maxAttempts = 60; // ~3 minutos

    const interval = setInterval(async () => {
      attempts++;
      try {
        const response = await axios.get(`${API_URL}${PROVIDER_CONFIG[activeProvider].statusUrl(id)}`);
        // AI33Pro anida el estado en "status.status"; AI84.pro lo trae en "job.status".
        const status = activeProvider === 'ai33' ? response.data.status?.status : response.data.job?.status;

        if (status === 'done') {
          clearInterval(interval);
          setIsReady(true);
          setIsGenerating(false);
          toast.success('🔊 Audio listo');
        } else if (status === 'failed' || status === 'error') {
          clearInterval(interval);
          setIsGenerating(false);
          const errorMessage = activeProvider === 'ai84' ? response.data.job?.errorMessage : undefined;
          toast.error(errorMessage || 'La generación de audio falló');
        } else if (attempts >= maxAttempts) {
          clearInterval(interval);
          setIsGenerating(false);
          toast.error('El audio está tardando demasiado en procesarse');
        }
      } catch (error) {
        if (attempts >= maxAttempts) {
          clearInterval(interval);
          setIsGenerating(false);
          console.error('Error comprobando estado del audio:', error);
        }
      }
    }, 3000);
  };

  const handleGenerate = async () => {
    if (!script.trim()) {
      toast.error('Pega o escribe el guion a narrar');
      return;
    }
    if (!voiceId.trim()) {
      toast.error('Pon el voice ID');
      return;
    }

    setIsGenerating(true);
    setIsReady(false);
    setTaskId(null);
    try {
      const response = await axios.post(`${API_URL}${cfg.generateUrl}`, {
        text: script,
        voiceId: voiceId.trim(),
      });
      // AI33Pro devuelve { audio: { taskId } }, AI84.pro devuelve { job: { jobId } }.
      const id = provider === 'ai33' ? response.data.audio?.taskId : response.data.job?.jobId;
      setTaskId(id);
      toast.success(`✨ Generando audio con ${cfg.label}...`);
      pollReady(id, provider);
    } catch (err: any) {
      toast.error(err?.response?.data?.details || err?.response?.data?.error || 'Error al generar audio');
      setIsGenerating(false);
    }
  };

  const handleDownload = async () => {
    if (!taskId) return;
    try {
      const response = await axios.get(`${API_URL}${cfg.downloadUrl(taskId)}`, {
        responseType: 'blob',
      });
      const url = window.URL.createObjectURL(response.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'audio.mp3';
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      toast.success('Descarga iniciada');
    } catch (error) {
      toast.error('Error al descargar audio');
      console.error(error);
    }
  };

  const handleReset = () => {
    setScript('');
    setVoiceId('');
    setTaskId(null);
    setIsReady(false);
    setIsGenerating(false);
  };

  return (
    <div className="space-y-6">
      <div className="card-lg">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-3 card-icon">
            <Volume2 className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="card-title">Generador de Audio</h2>
            <p className="card-subtitle">Pega tu guion, pon el voice ID y genera la narración</p>
          </div>
        </div>

        <div className="mb-6">
          <label className="block text-gray-500 dark:text-zinc-400 text-xs font-medium mb-2">Proveedor</label>
          <div className="flex gap-2">
            {(Object.keys(PROVIDER_CONFIG) as Provider[]).map((p) => (
              <button
                key={p}
                onClick={() => setProvider(p)}
                disabled={isGenerating}
                className={`px-4 py-2 rounded-lg border text-sm font-medium transition-colors ${
                  provider === p
                    ? 'bg-accent-50 dark:bg-accent-950/40 border-accent-400 dark:border-accent-600 text-accent-700 dark:text-accent-300'
                    : 'bg-white dark:bg-zinc-900 border-gray-200 dark:border-zinc-700 text-gray-500 dark:text-zinc-400 hover:border-gray-300 dark:hover:border-zinc-600'
                }`}
              >
                {PROVIDER_CONFIG[p].label}
              </button>
            ))}
          </div>
        </div>

        <div className="mb-6">
          <label className="block text-gray-500 dark:text-zinc-400 text-xs font-medium mb-2">Guion</label>
          <textarea
            value={script}
            onChange={(e) => setScript(e.target.value)}
            placeholder="Pega o escribe aquí el texto a narrar..."
            rows={8}
            disabled={isGenerating}
            className="w-full px-4 py-3 bg-gray-50 dark:bg-zinc-950 border border-gray-200 dark:border-zinc-800 text-gray-900 dark:text-zinc-100 placeholder-gray-400 dark:placeholder-zinc-600 rounded-lg focus:border-accent-500 dark:focus:border-accent-600 focus:outline-none resize-none"
          />
          <p className="text-xs text-gray-400 dark:text-zinc-500 mt-1 text-right">
            {script.length.toLocaleString('es')} caracteres
          </p>
        </div>

        <div className="mb-6">
          <label className="block text-gray-500 dark:text-zinc-400 text-xs font-medium mb-2">Voice ID</label>
          <input
            type="text"
            value={voiceId}
            onChange={(e) => setVoiceId(e.target.value)}
            placeholder={cfg.voicePlaceholder}
            disabled={isGenerating}
            className="w-full px-4 py-2.5 bg-gray-50 dark:bg-zinc-950 border border-gray-200 dark:border-zinc-800 text-gray-900 dark:text-zinc-100 placeholder-gray-400 dark:placeholder-zinc-600 rounded-lg focus:border-accent-500 dark:focus:border-accent-600 focus:outline-none"
          />
        </div>

        <div className="flex gap-3">
          <button
            onClick={handleGenerate}
            disabled={isGenerating}
            className="btn-primary flex-1 py-3 text-sm flex items-center justify-center gap-2"
          >
            {isGenerating ? <Loader className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
            {isGenerating ? 'Generando...' : 'Generar Audio'}
          </button>
          {!!taskId && (
            <button
              onClick={handleReset}
              className="btn-secondary py-3 px-4 flex items-center justify-center"
              title="Empezar un audio nuevo"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
          )}
        </div>

        {taskId && (
          <div
            className={`mt-6 p-4 rounded-2xl border ${
              isReady
                ? 'bg-emerald-50 dark:bg-emerald-950 border-emerald-200 dark:border-emerald-800'
                : 'bg-amber-50 dark:bg-amber-950 border-amber-200 dark:border-amber-800'
            }`}
          >
            {isReady ? (
              <>
                <audio controls className="w-full rounded-lg mb-3" src={`${API_URL}${cfg.downloadUrl(taskId)}`} />
                <button
                  onClick={handleDownload}
                  className="w-full btn-primary py-2.5 text-sm flex items-center justify-center gap-2"
                >
                  <Download className="w-4 h-4" /> Descargar audio
                </button>
              </>
            ) : (
              <p className="text-sm font-medium text-amber-700 dark:text-amber-400 flex items-center gap-2">
                <Loader className="w-4 h-4 animate-spin" />
                Procesando audio...
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
