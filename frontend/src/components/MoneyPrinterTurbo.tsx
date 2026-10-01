import { useState } from 'react';
import { Zap, ExternalLink, RefreshCw, Terminal } from 'lucide-react';

// MoneyPrinterTurbo es una herramienta externa (Python/Streamlit), no parte del stack
// Node/React de Lumina — corre como su propio servicio local en el puerto 8501 y esta
// pestaña solo lo embebe. Hay que arrancarlo aparte una vez por sesión de trabajo:
// C:\Users\danir\Documents\Sistema\MoneyPrinterTurbo\webui.bat
const MPT_URL = 'http://127.0.0.1:8501';

export default function MoneyPrinterTurbo() {
  const [reloadKey, setReloadKey] = useState(0);

  return (
    <div className="space-y-4">
      <div className="card-lg">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="p-3 card-icon">
              <Zap className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="card-title">MoneyPrinterTurbo</h2>
              <p className="card-subtitle">
                Herramienta externa — genera video completo (tema → guion → voz → subtítulos → música) en un solo paso
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setReloadKey(k => k + 1)}
              className="btn-secondary py-1.5 px-3 text-xs flex items-center gap-1.5"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Recargar
            </button>
            <a
              href={MPT_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-secondary py-1.5 px-3 text-xs flex items-center gap-1.5"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              Abrir en pestaña nueva
            </a>
          </div>
        </div>

        <div className="mt-4 flex items-start gap-2 bg-gray-50 dark:bg-zinc-950 border border-gray-200 dark:border-zinc-800 rounded-lg p-3">
          <Terminal className="w-4 h-4 text-gray-400 dark:text-zinc-500 shrink-0 mt-0.5" />
          <p className="text-[11px] text-gray-500 dark:text-zinc-400">
            Si abajo no carga nada, es porque MoneyPrinterTurbo no está corriendo en esta sesión — ábrelo ejecutando{' '}
            <code className="font-mono-ui text-accent-600 dark:text-accent-400">webui.bat</code> dentro de{' '}
            <code className="font-mono-ui text-accent-600 dark:text-accent-400">
              C:\Users\danir\Documents\Sistema\MoneyPrinterTurbo
            </code>
            , espera a que diga "WebUI address", y dale a Recargar.
          </p>
        </div>
      </div>

      <div className="card-lg p-0 overflow-hidden">
        <iframe
          key={reloadKey}
          src={MPT_URL}
          title="MoneyPrinterTurbo"
          className="w-full border-0"
          style={{ height: '85vh' }}
        />
      </div>
    </div>
  );
}
