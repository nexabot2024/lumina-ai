import { useState, useEffect } from 'react';
import { Activity, AlertCircle, CheckCircle, Loader, X } from 'lucide-react';
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
}

export default function CompilationMonitor({ projectId, isOpen, onClose, statusEndpoint = '/api/compilation/status', title = 'Monitor de Compilación' }: Props) {
  const [state, setCompilationState] = useState<CompilationState>({
    isCompiling: false,
    events: [],
    currentPercent: 0,
  });

  useEffect(() => {
    if (!projectId) return;

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
        events: (data.events || []).slice(-50).map((ev: any) => ({ ...ev, timestamp: Date.now() })),
      });
    };

    eventSource.onerror = () => {
      eventSource.close();
    };

    return () => eventSource.close();
  }, [projectId]);

  if (!isOpen) return null;

  const errorCount = state.events.filter(e => e.type === 'error').length;
  const warningCount = state.events.filter(e => e.type === 'warning').length;

  return (
    <div className="fixed right-0 top-0 h-full w-96 bg-white dark:bg-zinc-900 border-l border-gray-200 dark:border-zinc-800 shadow-xl overflow-hidden flex flex-col z-40">
      {/* Header */}
      <div className="p-4 border-b border-gray-100 dark:border-zinc-800 bg-white dark:bg-zinc-900">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Activity className={`w-5 h-5 ${state.isCompiling ? 'animate-spin text-accent-500 dark:text-accent-400' : 'text-emerald-500 dark:text-emerald-400'}`} />
            <h3 className="font-medium text-gray-900 dark:text-zinc-100">{title}</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-gray-500 dark:text-zinc-400 hover:bg-gray-100 dark:hover:bg-zinc-800 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Progress Bar */}
        {state.isCompiling && (
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-gray-500 dark:text-zinc-400">Progreso total</span>
              <span className="text-accent-600 dark:text-accent-400 font-semibold">{Math.round(state.currentPercent)}%</span>
            </div>
            <div className="w-full bg-gray-200 dark:bg-zinc-700 rounded-full h-2 overflow-hidden">
              <div
                className="bg-accent-600 h-full transition-all duration-300"
                style={{ width: `${state.currentPercent}%` }}
              />
            </div>
            {state.totalSeconds !== undefined && state.totalSeconds > 0 && (
              <div className="flex justify-between text-xs text-gray-500 dark:text-zinc-400 pt-1">
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
      {(state.totalDuration || state.estimatedSize) && (
        <div className="px-4 py-3 bg-gray-50 dark:bg-zinc-950 border-b border-gray-200 dark:border-zinc-800 grid grid-cols-2 gap-2 text-xs">
          {state.totalDuration && (
            <div>
              <div className="text-gray-500 dark:text-zinc-400">Duración</div>
              <div className="text-gray-900 dark:text-zinc-100 font-semibold">
                {(state.totalDuration / 60).toFixed(1)}m
              </div>
            </div>
          )}
          {state.estimatedSize && (
            <div>
              <div className="text-gray-500 dark:text-zinc-400">Tamaño Est.</div>
              <div className="text-gray-900 dark:text-zinc-100 font-semibold">
                {(state.estimatedSize / 1024 / 1024).toFixed(0)}MB
              </div>
            </div>
          )}
          {errorCount > 0 && (
            <div>
              <div className="text-red-500 dark:text-red-400">Errores</div>
              <div className="text-red-600 dark:text-red-500 font-semibold">{errorCount}</div>
            </div>
          )}
          {warningCount > 0 && (
            <div>
              <div className="text-amber-600 dark:text-amber-400">Advertencias</div>
              <div className="text-amber-600 dark:text-amber-500 font-semibold">{warningCount}</div>
            </div>
          )}
        </div>
      )}

      {/* Events Log */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {state.events.length === 0 ? (
          <div className="text-center text-gray-500 dark:text-zinc-400 text-sm py-8">
            <p>Esperando actualizaciones...</p>
          </div>
        ) : (
          state.events.map((event, idx) => (
            <div
              key={idx}
              className={`text-xs p-2 rounded-lg border-l-2 ${
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
        <div className="bg-white dark:bg-zinc-950 border-t border-gray-100 dark:border-zinc-800 p-3">
          {state.events.some(e => e.type === 'error') ? (
            <div className="text-red-500 dark:text-red-400 text-xs font-semibold">❌ Compilación fallida</div>
          ) : state.events.some(e => e.type === 'success') ? (
            <div className="text-emerald-600 dark:text-emerald-400 text-xs font-semibold">✅ Compilación completada</div>
          ) : (
            <div className="text-gray-500 dark:text-zinc-400 text-xs">Estado desconocido</div>
          )}
        </div>
      )}
    </div>
  );
}
