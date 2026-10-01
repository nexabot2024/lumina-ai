import { useState, useEffect } from 'react';
import { Activity, AlertCircle, CheckCircle, Loader, X, Download, Clock, HardDrive, AlertTriangle } from 'lucide-react';
import { API_URL } from '../services/apiUrl';

interface CompilationEvent {
  type: 'info' | 'progress' | 'error' | 'warning' | 'success';
  message: string;
  timestamp: number;
  percent?: number;
}

interface CompilationState {
  isCompiling: boolean;
  events: CompilationEvent[];
  currentPercent: number;
  estimatedSize?: number;
  totalDuration?: number;
  currentSeconds?: number;
  totalSeconds?: number;
  outputUrl?: string;
}

function formatMinutes(seconds: number): string {
  return (seconds / 60).toFixed(1);
}

interface Props {
  projectId?: string;
  isOpen: boolean;
  onClose: () => void;
  statusEndpoint?: string;
  title?: string;
  /** Se dispara una sola vez, en cuanto el trabajo termina con un resultado descargable. */
  onComplete?: (outputUrl: string) => void;
}

export default function CompilationMonitor({ projectId, isOpen, onClose, statusEndpoint = '/api/compilation/status', title = 'Monitor de Compilación', onComplete }: Props) {
  const [state, setCompilationState] = useState<CompilationState>({
    isCompiling: false,
    events: [],
    currentPercent: 0,
  });

  useEffect(() => {
    if (!projectId) return;
    let notifiedOutputUrl: string | undefined;

    const eventSource = new EventSource(
      `${API_URL}${statusEndpoint}/${projectId}`
    );

    eventSource.onmessage = (e) => {
      const data = JSON.parse(e.data);
      setCompilationState({
        isCompiling: data.isCompiling,
        currentPercent: data.currentPercent || 0,
        estimatedSize: data.estimatedSize,
        totalDuration: data.totalDuration,
        currentSeconds: data.currentSeconds,
        totalSeconds: data.totalSeconds,
        outputUrl: data.outputUrl,
        events: (data.events || []).slice(-50).map((ev: any) => ({ ...ev, timestamp: Date.now() })),
      });
      if (data.outputUrl && data.outputUrl !== notifiedOutputUrl) {
        notifiedOutputUrl = data.outputUrl;
        onComplete?.(data.outputUrl);
      }
    };

    eventSource.onerror = () => {
      eventSource.close();
    };

    return () => eventSource.close();
  }, [projectId]);

  if (!isOpen) return null;

  const errorCount = state.events.filter(e => e.type === 'error').length;
  const warningCount = state.events.filter(e => e.type === 'warning').length;

  const statTiles: { icon: React.ReactNode; label: string; value: string; tone: 'accent' | 'gray' | 'red' | 'amber' }[] = [];
  if (state.totalDuration) {
    statTiles.push({ icon: <Clock className="w-3.5 h-3.5" />, label: 'Duración', value: `${(state.totalDuration / 60).toFixed(1)}m`, tone: 'gray' });
  }
  if (state.estimatedSize) {
    statTiles.push({ icon: <HardDrive className="w-3.5 h-3.5" />, label: 'Tamaño est.', value: `${(state.estimatedSize / 1024 / 1024).toFixed(0)}MB`, tone: 'gray' });
  }
  if (errorCount > 0) {
    statTiles.push({ icon: <AlertCircle className="w-3.5 h-3.5" />, label: 'Errores', value: String(errorCount), tone: 'red' });
  }
  if (warningCount > 0) {
    statTiles.push({ icon: <AlertTriangle className="w-3.5 h-3.5" />, label: 'Advertencias', value: String(warningCount), tone: 'amber' });
  }

  const TILE_TONE: Record<string, string> = {
    accent: 'bg-accent-50 dark:bg-accent-950/40 text-accent-600 dark:text-accent-400',
    gray: 'bg-gray-100 dark:bg-zinc-800 text-gray-500 dark:text-zinc-400',
    red: 'bg-red-50 dark:bg-red-950/40 text-red-500 dark:text-red-400',
    amber: 'bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400',
  };

  return (
    <div
      key={projectId}
      className="fixed right-0 top-0 h-full w-96 max-w-[92vw] bg-white/95 dark:bg-zinc-950/95 backdrop-blur-xl shadow-2xl shadow-gray-900/15 dark:shadow-black/40 border-l border-gray-100 dark:border-zinc-800/60 rounded-l-3xl overflow-hidden flex flex-col z-[60] animate-panel-in"
    >
      {/* Header */}
      <div className="relative p-5 pb-4 shrink-0">
        <div className="absolute inset-x-0 top-0 h-28 bg-gradient-to-br from-accent-50/80 dark:from-accent-950/25 to-transparent pointer-events-none" />

        <div className="relative flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <span
              className={`relative w-10 h-10 rounded-xl overflow-hidden flex items-center justify-center text-white shadow-sm bg-gradient-to-br ${
                state.isCompiling ? 'from-accent-400 to-accent-600 shadow-accent-600/30' : 'from-emerald-400 to-emerald-600 shadow-emerald-600/30'
              }`}
            >
              <span className="absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/40 to-transparent pointer-events-none" />
              <Activity className={`relative w-4.5 h-4.5 ${state.isCompiling ? 'animate-spin' : ''}`} />
            </span>
            <div>
              <h3 className="font-semibold text-gray-900 dark:text-zinc-100 text-sm leading-tight">{title}</h3>
              <p className="text-[11px] text-gray-400 dark:text-zinc-500 mt-0.5">
                {state.isCompiling ? 'Procesando en tiempo real…' : state.events.length > 0 ? 'Finalizado' : 'En espera'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl bg-gray-100 dark:bg-zinc-900 text-gray-500 dark:text-zinc-400 hover:bg-gray-200 dark:hover:bg-zinc-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Progress Bar */}
        {state.isCompiling && (
          <div className="relative space-y-2">
            <div className="flex justify-between text-xs">
              <span className="text-gray-500 dark:text-zinc-400">Progreso total</span>
              <span className="text-accent-600 dark:text-accent-400 font-semibold">{Math.round(state.currentPercent)}%</span>
            </div>
            <div className="w-full bg-gray-100 dark:bg-zinc-800 rounded-full h-2.5 overflow-hidden">
              <div
                className="bg-gradient-to-r from-accent-400 to-accent-600 h-full transition-all duration-300 rounded-full shadow-[0_0_10px_rgb(var(--accent-500)/0.6)]"
                style={{ width: `${state.currentPercent}%` }}
              />
            </div>
            {state.totalSeconds !== undefined && state.totalSeconds > 0 && (
              <div className="flex justify-between text-xs text-gray-500 dark:text-zinc-400 pt-0.5">
                <span>Minutos editados</span>
                <span className="text-accent-600 dark:text-accent-400 font-semibold">
                  {formatMinutes(state.currentSeconds || 0)} / {formatMinutes(state.totalSeconds)} min
                </span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Stats */}
      {statTiles.length > 0 && (
        <div className="px-5 pb-4 grid grid-cols-2 gap-2 shrink-0">
          {statTiles.map((tile, idx) => (
            <div key={idx} className="flex items-center gap-2.5 px-3 py-2.5 bg-gray-50 dark:bg-zinc-900/70 border border-gray-100 dark:border-zinc-800/60 rounded-xl">
              <span className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${TILE_TONE[tile.tone]}`}>{tile.icon}</span>
              <div className="min-w-0">
                <div className="text-[10px] uppercase tracking-wide text-gray-400 dark:text-zinc-500 font-medium truncate">{tile.label}</div>
                <div className="text-gray-900 dark:text-zinc-100 font-semibold text-sm leading-tight">{tile.value}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Events Log */}
      <div className="flex-1 overflow-y-auto px-4 pb-3 space-y-2">
        {state.events.length === 0 ? (
          <div className="text-center py-10">
            <div className="empty-state-icon">
              <Activity className="w-6 h-6" />
            </div>
            <p className="text-gray-500 dark:text-zinc-400 text-sm">Esperando actualizaciones...</p>
          </div>
        ) : (
          state.events.map((event, idx) => (
            <div
              key={idx}
              className={`text-xs p-2.5 rounded-xl border-l-2 ${
                event.type === 'error'
                  ? 'bg-red-50 dark:bg-red-950/30 border-red-400 dark:border-red-500 text-red-700 dark:text-red-300'
                  : event.type === 'warning'
                  ? 'bg-amber-50 dark:bg-amber-950/30 border-amber-400 dark:border-amber-500 text-amber-700 dark:text-amber-300'
                  : event.type === 'success'
                  ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-400 dark:border-emerald-500 text-emerald-700 dark:text-emerald-300'
                  : event.type === 'progress'
                  ? 'bg-blue-50 dark:bg-blue-950/30 border-blue-400 dark:border-blue-500 text-blue-700 dark:text-blue-300'
                  : 'bg-gray-50 dark:bg-zinc-900 border-gray-300 dark:border-zinc-600 text-gray-700 dark:text-zinc-300'
              }`}
            >
              <div className="flex items-start gap-2">
                {event.type === 'error' && (
                  <AlertCircle className="w-3 h-3 mt-0.5 flex-shrink-0" />
                )}
                {event.type === 'success' && (
                  <CheckCircle className="w-3 h-3 mt-0.5 flex-shrink-0" />
                )}
                {event.type === 'progress' && (
                  <Loader className="w-3 h-3 mt-0.5 flex-shrink-0 animate-spin" />
                )}
                <span className="flex-1 font-mono-ui">{event.message}</span>
              </div>
              {event.percent && (
                <div className="text-xs opacity-75 mt-1">
                  {Math.round(event.percent)}%
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* Footer */}
      {!state.isCompiling && state.events.length > 0 && (
        <div className="shrink-0 bg-gray-50/80 dark:bg-zinc-900/60 border-t border-gray-100 dark:border-zinc-800/60 p-4 space-y-2.5">
          {state.events.some(e => e.type === 'error') ? (
            <div className="flex items-center gap-1.5 text-red-500 dark:text-red-400 text-xs font-semibold">
              <AlertCircle className="w-3.5 h-3.5" /> Compilación fallida
            </div>
          ) : state.outputUrl ? (
            <>
              <div className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 text-xs font-semibold">
                <CheckCircle className="w-3.5 h-3.5" /> Compilación completada
              </div>
              <a
                href={`${API_URL}${state.outputUrl}`}
                download
                className="btn-primary w-full flex items-center justify-center gap-2 py-2.5 text-sm"
              >
                <Download className="w-4 h-4" /> Descargar video
              </a>
            </>
          ) : state.events.some(e => e.type === 'success') ? (
            <div className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 text-xs font-semibold">
              <CheckCircle className="w-3.5 h-3.5" /> Compilación completada
            </div>
          ) : (
            <div className="text-gray-500 dark:text-zinc-400 text-xs">Estado desconocido</div>
          )}
          <button
            onClick={onClose}
            className="btn-secondary w-full flex items-center justify-center gap-2 py-2.5 text-sm"
          >
            <X className="w-4 h-4" /> Cerrar monitor
          </button>
        </div>
      )}
    </div>
  );
}
