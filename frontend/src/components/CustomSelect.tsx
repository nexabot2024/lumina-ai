import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Check } from 'lucide-react';

interface SelectOption<T extends string> {
  value: T;
  label: React.ReactNode;
}

interface CustomSelectProps<T extends string> {
  value: T;
  onChange: (value: T) => void;
  options: SelectOption<T>[];
  className?: string;
  disabled?: boolean;
}

/** Desplegable propio (mismo patrón del selector de herramientas del Dashboard) —
 *  reemplaza el <select> nativo, cuya lista de opciones el navegador dibuja fuera
 *  del control de CSS y no puede vestirse con el diseño del sistema.
 *
 *  El panel se renderiza en un portal a document.body (en vez de justo debajo del
 *  botón, dentro del propio flujo) porque muchas tarjetas usan overflow:hidden para
 *  recortar su decoración de fondo (estilo "vibrant") — si el panel viviera dentro,
 *  quedaría cortado por ese mismo overflow. Con el portal, su posición se calcula a
 *  partir de las coordenadas reales del botón y se re-sincroniza al hacer scroll o
 *  redimensionar mientras esté abierto. */
export default function CustomSelect<T extends string>({ value, onChange, options, className = '', disabled }: CustomSelectProps<T>) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState({ top: 0, left: 0, width: 0 });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const updateCoords = () => {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    setCoords({ top: rect.bottom + window.scrollY + 6, left: rect.left + window.scrollX, width: rect.width });
  };

  useEffect(() => {
    if (!open) return;
    updateCoords();

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (triggerRef.current?.contains(target) || panelRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('scroll', updateCoords, true);
    window.addEventListener('resize', updateCoords);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('scroll', updateCoords, true);
      window.removeEventListener('resize', updateCoords);
    };
  }, [open]);

  const current = options.find(o => o.value === value);

  return (
    <div className={`relative ${className}`}>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={() => setOpen(v => !v)}
        className="w-full px-4 py-2 bg-gray-50 dark:bg-zinc-950 border border-gray-200 dark:border-zinc-800 rounded-lg text-gray-700 dark:text-zinc-300 flex items-center justify-between gap-2 hover:border-gray-300 dark:hover:border-zinc-700 transition-colors focus:outline-none focus:border-accent-500 dark:focus:border-accent-600 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <span className="truncate text-left">{current?.label}</span>
        <ChevronDown className={`w-4 h-4 text-gray-400 dark:text-zinc-500 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open &&
        createPortal(
          <div
            ref={panelRef}
            style={{ position: 'absolute', top: coords.top, left: coords.left, minWidth: coords.width }}
            className="z-[100] w-max max-w-xs bg-white/95 dark:bg-zinc-950/95 backdrop-blur-xl border border-gray-100 dark:border-zinc-800/60 rounded-2xl shadow-xl p-1.5 animate-materialize"
          >
            {options.map(opt => (
              <button
                key={opt.value}
                type="button"
                onClick={() => {
                  onChange(opt.value);
                  setOpen(false);
                }}
                className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded-xl text-sm text-left transition-colors ${
                  opt.value === value
                    ? 'bg-accent-50 dark:bg-accent-950/40 text-accent-700 dark:text-accent-300 font-medium'
                    : 'text-gray-600 dark:text-zinc-300 hover:bg-gray-50 dark:hover:bg-zinc-900'
                }`}
              >
                <span className="truncate">{opt.label}</span>
                {opt.value === value && <Check className="w-3.5 h-3.5 shrink-0" />}
              </button>
            ))}
          </div>,
          document.body
        )}
    </div>
  );
}
