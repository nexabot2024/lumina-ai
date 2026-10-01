import { useEffect, useState } from 'react';
import { History, CheckCircle, AlertCircle, Copy, RefreshCw, Download } from 'lucide-react';
import toast from 'react-hot-toast';
import axios from 'axios';
import { API_URL } from '../services/apiUrl';
import CustomSelect from './CustomSelect';

interface HistoryEntry {
  id: string;
  source: 'queue' | 'image-sequence' | 'compilation' | 'clip-editing' | 'downloader' | 'remotion-composer';
  videoName: string;
  inputPath: string;
  outputPath: string;
  downloadUrl?: string;
  status: 'completed' | 'failed';
  duration: number;
  createdAt: number;
  completedAt: number;
  error?: string;
}

const SOURCE_LABELS: Record<HistoryEntry['source'], string> = {
  queue: 'Cola de Edición',
  'image-sequence': 'Secuencia de Imágenes',
  compilation: 'Editor',
  'clip-editing': 'Editor de Clips',
  downloader: 'Descargador de Videos',
  'remotion-composer': 'Composición con Remotion',
};

function formatDate(ts: number): string {
  return new Date(ts).toLocaleString('es', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatDuration(seconds: number): string {
  if (!seconds) return '';
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

export default function HistoryPanel() {
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [days, setDays] = useState(2);
  const [isLoading, setIsLoading] = useState(true);

  const load = async () => {
    setIsLoading(true);
    try {
      const response = await axios.get(`${API_URL}/api/history`, { params: { days } });
      setEntries(response.data.history || []);
    } catch (error) {
      toast.error('Error al cargar el historial');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days]);

  const handleCopyPath = (path: string) => {
    navigator.clipboard.writeText(path);
    toast.success('Ruta copiada');
  };

  return (
    <div className="space-y-6">
      <div className="card-lg">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="p-3 card-icon">
              <History className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="card-title">Historial</h2>
              <p className="card-subtitle">
                Videos generados por todas las herramientas (Cola, Secuencia de Imágenes, Editor, Editor de Clips)
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <CustomSelect
              value={String(days)}
              onChange={(v) => setDays(parseInt(v, 10))}
              options={[
                { value: '1', label: 'Último día' },
                { value: '2', label: 'Últimos 2 días' },
                { value: '7', label: 'Última semana' },
                { value: '30', label: 'Último mes' },
              ]}
            />
            <button
              onClick={load}
              className="p-2 text-gray-500 dark:text-zinc-400 hover:bg-gray-100 dark:hover:bg-zinc-800 rounded-lg transition-colors"
              title="Actualizar"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {isLoading ? (
          <div className="space-y-2">
            {[0, 1, 2, 3].map(i => (
              <div key={i} className="flex items-center gap-3 p-3">
                <div className="skeleton w-4 h-4 rounded-full shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="skeleton h-3.5 w-1/3 rounded" />
                  <div className="skeleton h-2.5 w-1/2 rounded" />
                </div>
              </div>
            ))}
          </div>
        ) : entries.length === 0 ? (
          <div className="text-center py-10">
            <div className="empty-state-icon">
              <History className="w-6 h-6" />
            </div>
            <p className="text-gray-500 dark:text-zinc-400 text-sm font-medium">Todavía no hay nada por aquí</p>
            <p className="text-gray-400 dark:text-zinc-600 text-xs mt-1">
              Los videos que generes con cualquier herramienta van a aparecer en este período
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {entries.map((entry) => (
              <div
                key={entry.id}
                className="flex items-start gap-3 bg-gray-50 dark:bg-zinc-950 rounded-xl p-3 hover:bg-gray-100 dark:hover:bg-zinc-900 transition-colors"
              >
                {entry.status === 'completed' ? (
                  <CheckCircle className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm text-gray-900 dark:text-zinc-100 font-medium truncate">{entry.videoName}</span>
                    <span className="text-[10px] text-accent-600 dark:text-accent-400 bg-accent-50 dark:bg-accent-950/40 px-1.5 py-0.5 rounded">
                      {SOURCE_LABELS[entry.source] || entry.source}
                    </span>
                  </div>
                  <p className="text-xs text-gray-400 dark:text-zinc-600 mt-0.5">
                    {formatDate(entry.createdAt)}
                    {entry.duration > 0 && ` · ${formatDuration(entry.duration)}`}
                    {entry.inputPath && ` · ${entry.inputPath}`}
                  </p>
                  {entry.status === 'completed' && entry.outputPath ? (
                    <div className="flex items-center gap-3 mt-1.5">
                      {entry.downloadUrl && (
                        <a
                          href={`${API_URL}${entry.downloadUrl}`}
                          download
                          className="flex items-center gap-1.5 text-xs font-semibold text-accent-600 dark:text-accent-400 hover:underline shrink-0"
                        >
                          <Download className="w-3.5 h-3.5" /> Descargar
                        </a>
                      )}
                      <span className="text-xs text-gray-500 dark:text-zinc-400 truncate">{entry.outputPath}</span>
                      <button
                        onClick={() => handleCopyPath(entry.outputPath)}
                        className="text-gray-400 dark:text-zinc-500 hover:text-gray-700 dark:hover:text-zinc-200 shrink-0"
                        title="Copiar ruta"
                      >
                        <Copy className="w-3 h-3" />
                      </button>
                    </div>
                  ) : (
                    entry.error && (
                      <p className="text-xs text-red-600 dark:text-red-400 mt-1.5">{entry.error}</p>
                    )
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
