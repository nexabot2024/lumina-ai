import { useEffect, useRef, useState } from 'react';
import { Settings, X, Upload, RotateCcw, Check, Palette, ChevronDown, ChevronLeft, ChevronRight, LayoutGrid, Type, Image as ImageIcon, Trash2, Sparkles, EyeOff } from 'lucide-react';
import toast from 'react-hot-toast';
import { PALETTES, CUSTOM_PALETTE_KEY, SHADE_STEPS, hslToRgbString, CARD_STYLES, FONTS } from '../hooks/useSettings';
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
  cardStyle: string;
  setCardStyle: (key: string) => void;
  fontKey: string;
  setFontKey: (key: string) => void;
  cardBgImage: string | null;
  setCardBgImage: (dataUrl: string | null) => void;
  cardBgBlur: number;
  setCardBgBlur: (px: number) => void;
  hideSystemName: boolean;
  setHideSystemName: (hide: boolean) => void;
  btn3dGlowHue: number;
  setBtn3dGlowHue: (hue: number) => void;
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
  cardStyle,
  setCardStyle,
  fontKey,
  setFontKey,
  cardBgImage,
  setCardBgImage,
  cardBgBlur,
  setCardBgBlur,
  hideSystemName,
  setHideSystemName,
  btn3dGlowHue,
  setBtn3dGlowHue,
  resetSettings,
}: SettingsModalProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const bgFileInputRef = useRef<HTMLInputElement>(null);
  const [wheelOpen, setWheelOpen] = useState(paletteKey === CUSTOM_PALETTE_KEY);
  const [glowWheelOpen, setGlowWheelOpen] = useState(false);
  const [section, setSection] = useState<'chooser' | 'color' | 'design'>('chooser');

  // Vuelve siempre al selector al reabrir Ajustes, en vez de recordar la última
  // sección visitada — así pregunta cada vez qué categoría se quiere tocar.
  useEffect(() => {
    if (isOpen) setSection('chooser');
  }, [isOpen]);

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

  const handleCardBgUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.error('El fondo debe ser una imagen');
      return;
    }
    if (file.size > 4 * 1024 * 1024) {
      toast.error('La imagen es muy pesada (máx. 4MB)');
      return;
    }
    const reader = new FileReader();
    reader.onload = (event) => {
      setCardBgImage(event.target?.result as string);
      toast.success('Fondo de tarjeta actualizado');
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="fixed inset-0 z-[70] bg-black/50 flex items-center justify-center p-4">
      <div className="glass-modal max-w-lg w-full max-h-[85vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-100 dark:border-zinc-800/60">
          <div className="flex items-center gap-3">
            {section === 'chooser' ? (
              <Settings className="w-5 h-5 text-accent-600 dark:text-accent-400" />
            ) : (
              <button
                onClick={() => setSection('chooser')}
                className="p-1 -ml-1 text-gray-500 dark:text-zinc-400 hover:bg-gray-100 dark:hover:bg-zinc-800 rounded-lg transition-colors"
                aria-label="Volver"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
            )}
            <h2 className="card-title">
              {section === 'chooser' ? 'Ajustes' : section === 'color' ? 'Color' : 'Personalización del sistema'}
            </h2>
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
        {section === 'chooser' && (
          <div className="space-y-3">
            <p className="text-gray-400 dark:text-zinc-600 text-xs">¿Qué quieres personalizar?</p>
            <button
              onClick={() => setSection('color')}
              className="w-full flex items-center gap-4 p-4 rounded-xl border border-gray-200 dark:border-zinc-700 hover:border-accent-400 dark:hover:border-accent-600 hover:bg-accent-50 dark:hover:bg-accent-950/30 transition-colors text-left"
            >
              <span className="w-11 h-11 rounded-xl shrink-0 flex items-center justify-center card-icon">
                <Palette className="w-5 h-5 text-white" />
              </span>
              <span className="flex-1 min-w-0">
                <span className="block text-sm font-semibold text-gray-900 dark:text-zinc-100">Color</span>
                <span className="block text-xs text-gray-400 dark:text-zinc-500">Nombre del sistema, logo, paleta de colores</span>
              </span>
              <ChevronRight className="w-4 h-4 text-gray-300 dark:text-zinc-600 shrink-0" />
            </button>
            <button
              onClick={() => setSection('design')}
              className="w-full flex items-center gap-4 p-4 rounded-xl border border-gray-200 dark:border-zinc-700 hover:border-accent-400 dark:hover:border-accent-600 hover:bg-accent-50 dark:hover:bg-accent-950/30 transition-colors text-left"
            >
              <span className="w-11 h-11 rounded-xl shrink-0 flex items-center justify-center card-icon">
                <Sparkles className="w-5 h-5 text-white" />
              </span>
              <span className="flex-1 min-w-0">
                <span className="block text-sm font-semibold text-gray-900 dark:text-zinc-100">Personalización del sistema</span>
                <span className="block text-xs text-gray-400 dark:text-zinc-500">Estilo de tarjetas, fondo, fuente — todo el diseño no relacionado al color</span>
              </span>
              <ChevronRight className="w-4 h-4 text-gray-300 dark:text-zinc-600 shrink-0" />
            </button>
          </div>
        )}

        {section === 'color' && (
        <>
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
        </>
        )}

        {section === 'design' && (
        <>
          {/* Nombre del sistema en el encabezado */}
          <div className="flex items-center justify-between gap-3 p-3 rounded-xl border border-gray-200 dark:border-zinc-700">
            <div className="flex items-center gap-2.5 min-w-0">
              <EyeOff className="w-4 h-4 text-gray-400 dark:text-zinc-500 shrink-0" />
              <div className="min-w-0">
                <p className="text-xs font-medium text-gray-900 dark:text-zinc-100">Ocultar nombre del sistema</p>
                <p className="text-[10px] text-gray-400 dark:text-zinc-500 truncate">
                  Quita "{systemName}" del encabezado, dejando solo el logo
                </p>
              </div>
            </div>
            <button
              onClick={() => setHideSystemName(!hideSystemName)}
              role="switch"
              aria-checked={hideSystemName}
              aria-label="Ocultar nombre del sistema"
              className={`relative shrink-0 w-10 h-6 rounded-full transition-colors ${
                hideSystemName ? 'bg-accent-600' : 'bg-gray-200 dark:bg-zinc-700'
              }`}
            >
              <span
                className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${
                  hideSystemName ? 'translate-x-4' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          {/* Color del efecto 3D de los botones */}
          <div className="space-y-1.5">
            <label className="text-gray-500 dark:text-zinc-400 text-xs font-medium">
              Color del efecto 3D en botones
            </label>
            <p className="text-gray-400 dark:text-zinc-600 text-[10px]">
              Todos los botones se inclinan siguiendo el cursor y sueltan un brillo de este color al pasar el ratón.
            </p>
            <button
              onClick={() => setGlowWheelOpen((v) => !v)}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 dark:border-zinc-700 text-xs text-gray-500 dark:text-zinc-400 hover:border-gray-300 dark:hover:border-zinc-600 transition-colors"
            >
              <span
                className="w-4 h-4 rounded-full shrink-0"
                style={{ backgroundColor: `rgb(${hslToRgbString(btn3dGlowHue, 85, 55)})` }}
              />
              Elegir color del brillo
              <ChevronDown className={`w-3.5 h-3.5 ml-auto transition-transform ${glowWheelOpen ? 'rotate-180' : ''}`} />
            </button>
            {glowWheelOpen && (
              <div className="flex flex-col items-center gap-3 bg-gray-50 dark:bg-zinc-950 border border-gray-200 dark:border-zinc-800 rounded-lg p-4">
                <ColorWheel hue={btn3dGlowHue} onPick={setBtn3dGlowHue} size={160} />
                <button className="btn-primary py-2 px-4 text-xs">Vista previa</button>
              </div>
            )}
          </div>

          {/* Estilo de tarjetas */}
          <div className="space-y-1.5">
            <label className="text-gray-500 dark:text-zinc-400 text-xs font-medium flex items-center gap-1.5">
              <LayoutGrid className="w-3.5 h-3.5" />
              Estilo de tarjetas
            </label>
            <div className="space-y-2">
              {CARD_STYLES.map((s) => (
                <button
                  key={s.key}
                  onClick={() => setCardStyle(s.key)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border text-left transition-colors ${
                    cardStyle === s.key
                      ? 'border-accent-500 bg-accent-50 dark:bg-accent-950/40'
                      : 'border-gray-200 dark:border-zinc-700 hover:border-gray-300 dark:hover:border-zinc-600'
                  }`}
                >
                  {/* Mini vista previa del estilo */}
                  <span
                    className={`relative w-8 h-8 rounded-md shrink-0 overflow-hidden ${
                      s.key === 'vibrant'
                        ? 'bg-accent-100 dark:bg-accent-900/60'
                        : s.key === 'tinted'
                        ? 'bg-accent-100 dark:bg-accent-900/60'
                        : s.key === 'bordered'
                        ? 'bg-white dark:bg-zinc-900 border border-gray-300 dark:border-zinc-600'
                        : 'bg-transparent border border-dashed border-gray-300 dark:border-zinc-700'
                    }`}
                  >
                    {s.key === 'vibrant' && (
                      <span className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-gradient-to-br from-accent-400 to-accent-600 opacity-70" />
                    )}
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-xs font-medium text-gray-900 dark:text-zinc-100">{s.label}</span>
                    <span className="block text-[10px] text-gray-400 dark:text-zinc-500 truncate">{s.description}</span>
                  </span>
                  {cardStyle === s.key && <Check className="w-4 h-4 text-accent-600 dark:text-accent-400 shrink-0" />}
                </button>
              ))}
            </div>
          </div>

          {/* Fondo de tarjeta (imagen) */}
          <div className="space-y-1.5">
            <label className="text-gray-500 dark:text-zinc-400 text-xs font-medium flex items-center gap-1.5">
              <ImageIcon className="w-3.5 h-3.5" />
              Fondo de tarjeta (imagen)
            </label>
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-lg overflow-hidden shrink-0 border border-gray-200 dark:border-zinc-800 bg-gray-50 dark:bg-zinc-950 flex items-center justify-center">
                {cardBgImage ? (
                  <img src={cardBgImage} alt="Fondo de tarjeta" className="w-full h-full object-cover" />
                ) : (
                  <ImageIcon className="w-4 h-4 text-gray-300 dark:text-zinc-700" />
                )}
              </div>
              <button
                onClick={() => bgFileInputRef.current?.click()}
                className="flex items-center gap-1.5 btn-secondary py-1.5 px-3 text-xs"
              >
                <Upload className="w-3.5 h-3.5" />
                {cardBgImage ? 'Cambiar imagen' : 'Subir imagen'}
              </button>
              {cardBgImage && (
                <button
                  onClick={() => {
                    setCardBgImage(null);
                    toast.success('Fondo de tarjeta quitado');
                  }}
                  className="p-2 text-gray-400 dark:text-zinc-500 hover:text-red-500 dark:hover:text-red-400 transition-colors"
                  title="Quitar imagen"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
              <input
                ref={bgFileInputRef}
                type="file"
                accept="image/*"
                onChange={handleCardBgUpload}
                className="hidden"
              />
            </div>
            <p className="text-gray-400 dark:text-zinc-600 text-[10px]">
              Se cubre con un velo para que el texto siga siendo legible en claro y oscuro. No aplica al estilo "Plana".
            </p>

            {cardBgImage && (
              <div className="pt-1">
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-gray-500 dark:text-zinc-400 text-xs font-medium">Desenfoque de la imagen</label>
                  <span className="text-gray-400 dark:text-zinc-500 text-[10px]">{cardBgBlur}px</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={20}
                  step={1}
                  value={cardBgBlur}
                  onChange={(e) => setCardBgBlur(parseInt(e.target.value, 10))}
                  className="input-range"
                />
              </div>
            )}
          </div>

          {/* Fuente del sistema */}
          <div className="space-y-1.5">
            <label className="text-gray-500 dark:text-zinc-400 text-xs font-medium flex items-center gap-1.5">
              <Type className="w-3.5 h-3.5" />
              Fuente del sistema
            </label>
            <div className="grid grid-cols-2 gap-2">
              {FONTS.map((f) => (
                <button
                  key={f.key}
                  onClick={() => setFontKey(f.key)}
                  className={`flex items-center justify-between gap-2 px-3 py-2.5 rounded-lg border text-left transition-colors ${
                    fontKey === f.key
                      ? 'border-accent-500 bg-accent-50 dark:bg-accent-950/40'
                      : 'border-gray-200 dark:border-zinc-700 hover:border-gray-300 dark:hover:border-zinc-600'
                  }`}
                >
                  <span style={{ fontFamily: f.stack }} className="text-sm text-gray-900 dark:text-zinc-100 truncate">
                    {f.label}
                  </span>
                  {fontKey === f.key && <Check className="w-3.5 h-3.5 text-accent-600 dark:text-accent-400 shrink-0" />}
                </button>
              ))}
            </div>
          </div>
        </>
        )}
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
