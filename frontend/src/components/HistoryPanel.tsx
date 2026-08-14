import { useEffect, useState } from 'react';
import { History, CheckCircle, AlertCircle, Copy, RefreshCw } from 'lucide-react';
import toast from 'react-hot-toast';
import axios from 'axios';
import { API_URL } from '../services/apiUrl';

interface HistoryEntry {
  id: string;
  source: 'queue' | 'image-sequence' | 'compilation' | 'clip-editing';
  videoName: string;
  inputPath: string;
  outputPath: string;
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
            <div className="p-2.5 bg-accent-600 rounded-lg">
              <History className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-gray-900 dark:text-zinc-100 text-sm font-medium">Historial</h2>
              <p className="text-gray-400 dark:text-zinc-500 text-[10px]">
                Videos generados por todas las herramientas (Cola, Secuencia de Imágenes, Editor, Editor de Clips)
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={days}
              onChange={(e) => setDays(parseInt(e.target.value, 10))}
              className="bg-gray-50 dark:bg-zinc-950 border border-gray-200 dark:border-zinc-800 text-gray-700 dark:text-zinc-300 rounded-lg px-3 py-1.5 text-xs focus:border-accent-500 dark:focus:border-accent-600 focus:outline-none"
            >
              <option value={1}>Último día</option>
              <option value={2}>Últimos 2 días</option>
              <option value={7}>Última semana</option>
              <option value={30}>Último mes</option>
            </select>
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
          <p className="text-gray-400 dark:text-zinc-600 text-sm text-center py-8">Cargando...</p>
        ) : entries.length === 0 ? (
          <p className="text-gray-400 dark:text-zinc-600 text-sm text-center py-8">
            No hay videos generados en este período
          </p>
        ) : (
          <div className="space-y-2">
            {entries.map((entry) => (
              <div
                key={entry.id}
                className="flex items-start gap-3 bg-gray-50 dark:bg-zinc-950 border border-gray-200 dark:border-zinc-800 rounded-lg p-3"
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
                    <div className="flex items-center gap-1.5 mt-1.5">
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
