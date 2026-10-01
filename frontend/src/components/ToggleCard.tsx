import { Check } from 'lucide-react';

interface ToggleCardProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  title: string;
  description?: string;
  disabled?: boolean;
  /** 'checkbox' (por defecto): chip cuadrado con check, selección independiente.
   *  'radio': indicador circular, para usar en grupos mutuamente excluyentes
   *  (varias ToggleCard compartiendo el mismo estado, una activa a la vez). */
  variant?: 'checkbox' | 'radio';
  /** Contenido extra (ej. un input) mostrado bajo el título — normalmente solo
   *  cuando `checked` es true. Por eso la raíz es un <div role="button"> en vez
   *  de un <button>: un <button> no puede contener controles de formulario. */
  children?: React.ReactNode;
}

/** Tarjeta-interruptor: reemplaza el <input type="checkbox"/"radio"> + <label> plano
 *  por una tarjeta completa clicable, con indicador de selección y tinte de acento
 *  cuando está activa — mismo lenguaje visual que el resto del sistema. */
export default function ToggleCard({ checked, onChange, title, description, disabled, variant = 'checkbox', children }: ToggleCardProps) {
  return (
    <div
      role="button"
      tabIndex={disabled ? -1 : 0}
      onClick={() => !disabled && onChange(!checked)}
      onKeyDown={(e) => {
        if (disabled) return;
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onChange(!checked);
        }
      }}
      aria-pressed={checked}
      aria-disabled={disabled}
      className={`w-full flex items-start gap-3 text-left rounded-2xl p-4 border transition-colors outline-none ${
        checked
          ? 'bg-accent-50 dark:bg-accent-950/40 border-accent-300 dark:border-accent-700'
          : 'bg-white dark:bg-zinc-900 border-gray-200 dark:border-zinc-800 hover:border-gray-300 dark:hover:border-zinc-700'
      } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
    >
      {variant === 'radio' ? (
        <span
          className={`shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center mt-0.5 transition-colors ${
            checked ? 'border-accent-600' : 'border-gray-300 dark:border-zinc-600'
          }`}
        >
          {checked && <span className="w-2.5 h-2.5 rounded-full bg-accent-600" />}
        </span>
      ) : (
        <span
          className={`shrink-0 w-5 h-5 rounded-md border-2 flex items-center justify-center mt-0.5 transition-colors ${
            checked ? 'bg-accent-600 border-accent-600' : 'border-gray-300 dark:border-zinc-600'
          }`}
        >
          {checked && <Check className="w-3.5 h-3.5 text-white" />}
        </span>
      )}
      <div className="min-w-0 flex-1">
        <span className={`text-sm font-semibold ${checked ? 'text-accent-900 dark:text-accent-100' : 'text-gray-900 dark:text-zinc-100'}`}>
          {title}
        </span>
        {description && <p className="text-xs text-gray-500 dark:text-zinc-400 mt-1">{description}</p>}
        {children}
      </div>
    </div>
  );
}
