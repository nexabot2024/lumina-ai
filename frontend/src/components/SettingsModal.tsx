import { useRef, useState } from 'react';
import { Settings, X, Upload, RotateCcw, Check, Palette, ChevronDown } from 'lucide-react';
import toast from 'react-hot-toast';
import { PALETTES, CUSTOM_PALETTE_KEY, SHADE_STEPS, hslToRgbString } from '../hooks/useSettings';
import ColorWheel from './ColorWheel';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  systemName: string;
  setSystemName: (name: string) => void;
  logoUrl: string;
  setLogoUrl: (url: string) => void;
  paletteKey: string;
  setPaletteKey: (key: string) => void;
  customHue: number;
  setCustomHue: (hue: number) => void;
  resetSettings: () => void;
}

export default function SettingsModal({
  isOpen,
  onClose,
  systemName,
  setSystemName,
  logoUrl,
  setLogoUrl,
  paletteKey,
  setPaletteKey,
  customHue,
  setCustomHue,
  resetSettings,
}: SettingsModalProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [wheelOpen, setWheelOpen] = useState(paletteKey === CUSTOM_PALETTE_KEY);

  if (!isOpen) return null;

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.error('El logo debe ser una imagen');
      return;
    }
    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string;
      setLogoUrl(dataUrl);
      toast.success('Logo actualizado');
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="glass-modal max-w-lg w-full max-h-[85vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-100 dark:border-zinc-800/60">
          <div className="flex items-center gap-3">
            <Settings className="w-5 h-5 text-accent-600 dark:text-accent-400" />
            <h2 className="text-gray-900 dark:text-zinc-100 text-sm font-medium">Ajustes</h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-500 dark:text-zinc-400 hover:bg-gray-100 dark:hover:bg-zinc-800 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          <p className="text-gray-400 dark:text-zinc-600 text-[9px] font-medium uppercase tracking-widest">
            Personalización
          </p>

          {/* Nombre del sistema */}
          <div className="space-y-1.5">
            <label className="text-gray-500 dark:text-zinc-400 text-xs font-medium">Nombre del sistema</label>
            <input
              type="text"
              value={systemName}
              onChange={(e) => setSystemName(e.target.value)}
              placeholder="Lumina AI"
              className="w-full bg-gray-50 dark:bg-zinc-950 border border-gray-200 dark:border-zinc-800 text-gray-900 dark:text-zinc-100 placeholder-gray-400 dark:placeholder-zinc-600 rounded-lg px-3 py-2 text-sm focus:border-accent-500 dark:focus:border-accent-600 focus:outline-none"
            />
          </div>

          {/* Logo */}
          <div className="space-y-1.5">
            <label className="text-gray-500 dark:text-zinc-400 text-xs font-medium">Logo</label>
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full overflow-hidden shrink-0 border border-gray-200 dark:border-zinc-800">
                <img src={logoUrl} alt="Logo actual" className="w-full h-full object-cover" />
              </div>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-1.5 btn-secondary py-1.5 px-3 text-xs"
              >
                <Upload className="w-3.5 h-3.5" />
                Cambiar logo
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleLogoUpload}
                className="hidden"
              />
            </div>
          </div>

          {/* Paleta de colores */}
          <div className="space-y-1.5">
            <label className="text-gray-500 dark:text-zinc-400 text-xs font-medium">Paleta de colores</label>
            <div className="grid grid-cols-3 gap-2">
              {PALETTES.map((p) => (
                <button
                  key={p.key}
                  onClick={() => setPaletteKey(p.key)}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs transition-colors ${
                    paletteKey === p.key
                      ? 'border-accent-500 bg-accent-50 dark:bg-accent-950/40 text-accent-700 dark:text-accent-300 font-medium'
                      : 'border-gray-200 dark:border-zinc-700 text-gray-500 dark:text-zinc-400 hover:border-gray-300 dark:hover:border-zinc-600'
                  }`}
                >
                  <span
                    className="w-4 h-4 rounded-full shrink-0"
                    style={{ backgroundColor: `rgb(${p.swatch})` }}
                  />
                  {p.label}
                  {paletteKey === p.key && <Check className="w-3 h-3 ml-auto" />}
                </button>
              ))}
            </div>

            {/* Desplegable: rueda de color completa */}
            <button
              onClick={() => setWheelOpen((v) => !v)}
              className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg border text-xs transition-colors ${
                paletteKey === CUSTOM_PALETTE_KEY
                  ? 'border-accent-500 bg-accent-50 dark:bg-accent-950/40 text-accent-700 dark:text-accent-300 font-medium'
                  : 'border-gray-200 dark:border-zinc-700 text-gray-500 dark:text-zinc-400 hover:border-gray-300 dark:hover:border-zinc-600'
              }`}
            >
              <Palette className="w-3.5 h-3.5" />
              Color personalizado (rueda de color)
              <ChevronDown className={`w-3.5 h-3.5 ml-auto transition-transform ${wheelOpen ? 'rotate-180' : ''}`} />
            </button>

            {wheelOpen && (
              <div className="flex flex-col items-center gap-4 bg-gray-50 dark:bg-zinc-950 border border-gray-200 dark:border-zinc-800 rounded-lg p-4">
                <ColorWheel hue={customHue} onPick={setCustomHue} size={180} />
                <p className="text-gray-400 dark:text-zinc-600 text-[10px] text-center">
                  Toca cualquier punto de la rueda para elegir el matiz — cada anillo es un paso de la escala (50 = borde, 950 = centro)
                </p>
                <div className="grid grid-cols-11 gap-0.5 w-full">
                  {SHADE_STEPS.map((s) => (
                    <div key={s.step} className="flex flex-col items-center gap-1">
                      <div
                        className="w-full aspect-square rounded"
                        style={{ backgroundColor: `rgb(${hslToRgbString(customHue, s.s, s.l)})` }}
                      />
                      <span className="text-gray-400 dark:text-zinc-600 text-[8px]">{s.step}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-4 border-t border-gray-100 dark:border-zinc-800/60">
          <button
            onClick={() => {
              resetSettings();
              toast.success('Ajustes restaurados');
            }}
            className="flex items-center gap-1.5 text-gray-400 dark:text-zinc-600 hover:text-gray-600 dark:hover:text-zinc-400 text-xs transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Restaurar valores por defecto
          </button>
          <button onClick={onClose} className="btn-primary py-2 px-4 text-sm">
            Listo
          </button>
        </div>
      </div>
    </div>
  );
}
