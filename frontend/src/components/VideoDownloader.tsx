import { useState } from 'react';
import { Download, Link as LinkIcon, Play, Loader, Activity, RotateCcw } from 'lucide-react';
import toast from 'react-hot-toast';
import axios from 'axios';
import CompilationMonitor from './CompilationMonitor';
import CustomSelect from './CustomSelect';
import ToggleCard from './ToggleCard';
import { API_URL } from '../services/apiUrl';
import { useLocalStorageState } from '../hooks/useLocalStorageState';

type Mode = 'video' | 'audio';
type VideoQuality = '480p' | '720p' | '1080p' | '2160p';
type AudioFormat = 'mp3' | 'm4a' | 'wav' | 'flac' | 'opus' | 'vorbis';

export default function VideoDownloader() {
  const [url, setUrl] = useState('');
  const [mode, setMode] = useState<Mode>('video');
  const [quality, setQuality] = useState<VideoQuality>('1080p');
  const [audioFormat, setAudioFormat] = useState<AudioFormat>('mp3');
  const [isStarting, setIsStarting] = useState(false);
  const [showMonitor, setShowMonitor] = useLocalStorageState('lumina-job-downloader-monitorOpen', false);
  const [currentJobId, setCurrentJobId] = useLocalStorageState('lumina-job-downloader', '');

  const isProcessing = isStarting || !!currentJobId;

  const handleDownload = async () => {
    if (!url.trim()) {
      toast.error('Pega el enlace del video');
      return;
    }

    const jobId = `download-${Date.now()}`;
    setIsStarting(true);
    setShowMonitor(true);

    try {
      await axios.post(`${API_URL}/api/downloader/start`, {
        jobId,
        url: url.trim(),
        mode,
        quality: mode === 'video' ? quality : undefined,
        audioFormat: mode === 'audio' ? audioFormat : undefined,
      });
      setCurrentJobId(jobId);
      toast.success('Descarga iniciada, revisa el monitor');
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Error al iniciar la descarga');
    } finally {
      setIsStarting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="card-lg">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-3 card-icon">
            <Download className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="card-title">Descargador de Videos</h2>
            <p className="card-subtitle">
              Pega el enlace de un video (YouTube, TikTok, Instagram y otros sitios) y descárgalo como video o solo audio
            </p>
          </div>
        </div>

        {/* URL */}
        <div className="mb-6">
          <label className="block text-sm font-semibold mb-2">Enlace del video</label>
          <div className="relative">
            <LinkIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-zinc-600" />
            <input
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://www.youtube.com/watch?v=... o https://www.tiktok.com/@user/video/..."
              disabled={isProcessing}
              className="w-full pl-10 pr-3 py-2.5 bg-gray-50 dark:bg-zinc-950 border border-gray-200 dark:border-zinc-800 text-gray-900 dark:text-zinc-100 placeholder-gray-400 dark:placeholder-zinc-600 rounded-lg focus:border-accent-500 dark:focus:border-accent-600 focus:outline-none"
            />
          </div>
        </div>

        {/* Mode */}
        <div className="mb-6 grid grid-cols-2 gap-4">
          <ToggleCard variant="radio" checked={mode === 'video'} onChange={() => setMode('video')} disabled={isProcessing} title="Video" />
          <ToggleCard variant="radio" checked={mode === 'audio'} onChange={() => setMode('audio')} disabled={isProcessing} title="Solo audio" />
        </div>

        {/* Quality / format */}
        {mode === 'video' ? (
          <div className="mb-6">
            <label className="block text-sm font-semibold mb-2">Calidad de video</label>
            <CustomSelect
              value={quality}
              onChange={setQuality}
              className="max-w-xs"
              options={[
                { value: '480p', label: '480p' },
                { value: '720p', label: '720p' },
                { value: '1080p', label: '1080p' },
                { value: '2160p', label: '2160p (4K)' },
              ]}
            />
            <p className="text-xs text-gray-400 dark:text-zinc-500 mt-1">
              Se descarga la mejor calidad disponible hasta este límite.
            </p>
          </div>
        ) : (
          <div className="mb-6">
            <label className="block text-sm font-semibold mb-2">Formato de audio</label>
            <CustomSelect
              value={audioFormat}
              onChange={setAudioFormat}
              className="max-w-xs"
              options={[
                { value: 'mp3', label: 'MP3' },
                { value: 'm4a', label: 'M4A' },
                { value: 'wav', label: 'WAV' },
                { value: 'flac', label: 'FLAC' },
                { value: 'opus', label: 'Opus' },
                { value: 'vorbis', label: 'Vorbis (OGG)' },
              ]}
            />
          </div>
        )}

        {/* Download button */}
        <div className="flex gap-3">
          <button
            onClick={handleDownload}
            disabled={isProcessing}
            className="btn-primary flex-1 flex items-center justify-center gap-2"
          >
            {isStarting ? <Loader className="w-5 h-5 animate-spin" /> : <Play className="w-5 h-5" />}
            {isStarting ? 'Iniciando...' : '⬇️ Descargar'}
          </button>
          {(isProcessing) && (
            <button
              onClick={() => setShowMonitor(!showMonitor)}
              className="btn-secondary flex items-center justify-center gap-2 px-6"
            >
              <Activity className="w-5 h-5" />
              Monitor
            </button>
          )}
          {!isStarting && !!currentJobId && (
            <button
              onClick={() => { setCurrentJobId(''); setShowMonitor(false); setUrl(''); }}
              className="btn-secondary flex items-center justify-center gap-2 px-4"
              title="Empezar una nueva descarga"
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
        statusEndpoint="/api/downloader/status"
        title="Monitor de Descarga"
      />
    </div>
  );
}
