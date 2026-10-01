import { useEffect, useState } from 'react';
import { Toaster } from 'react-hot-toast';
import { Zap, Sun, Moon, Settings, Download } from 'lucide-react';
import Dashboard from './pages/Dashboard';
import VideoDownloader from './components/VideoDownloader';
import SettingsModal from './components/SettingsModal';
import { useTheme } from './hooks/useTheme';
import { useSettings } from './hooks/useSettings';
import { useLocalStorageState } from './hooks/useLocalStorageState';

type View = 'dashboard' | 'downloader';

const AI_ICON_DEFS = `
  <filter id="b"><feGaussianBlur stdDeviation="6" /></filter>
  <g id="chip">
    <rect x="-16" y="-16" width="32" height="32" rx="5" fill="none" stroke="currentColor" stroke-width="2.5"/>
    <line x1="-16" y1="-8" x2="-23" y2="-8" stroke="currentColor" stroke-width="2.5"/>
    <line x1="-16" y1="0" x2="-23" y2="0" stroke="currentColor" stroke-width="2.5"/>
    <line x1="-16" y1="8" x2="-23" y2="8" stroke="currentColor" stroke-width="2.5"/>
    <line x1="16" y1="-8" x2="23" y2="-8" stroke="currentColor" stroke-width="2.5"/>
    <line x1="16" y1="0" x2="23" y2="0" stroke="currentColor" stroke-width="2.5"/>
    <line x1="16" y1="8" x2="23" y2="8" stroke="currentColor" stroke-width="2.5"/>
    <line x1="-8" y1="-16" x2="-8" y2="-23" stroke="currentColor" stroke-width="2.5"/>
    <line x1="8" y1="-16" x2="8" y2="-23" stroke="currentColor" stroke-width="2.5"/>
    <line x1="-8" y1="16" x2="-8" y2="23" stroke="currentColor" stroke-width="2.5"/>
    <line x1="8" y1="16" x2="8" y2="23" stroke="currentColor" stroke-width="2.5"/>
    <text x="0" y="5" font-family="Arial,sans-serif" font-size="14" font-weight="bold" fill="currentColor" text-anchor="middle">AI</text>
  </g>
  <g id="robot">
    <rect x="-14" y="-8" width="28" height="22" rx="6" fill="none" stroke="currentColor" stroke-width="2.5"/>
    <circle cx="-6" cy="3" r="3" fill="currentColor"/>
    <circle cx="6" cy="3" r="3" fill="currentColor"/>
    <line x1="0" y1="-8" x2="0" y2="-16" stroke="currentColor" stroke-width="2.5"/>
    <circle cx="0" cy="-18" r="2.5" fill="currentColor"/>
    <line x1="-14" y1="10" x2="-19" y2="14" stroke="currentColor" stroke-width="2.5"/>
    <line x1="14" y1="10" x2="19" y2="14" stroke="currentColor" stroke-width="2.5"/>
  </g>
  <g id="brain">
    <path d="M -16 -6 Q -18 -16 -8 -18 Q 0 -22 8 -18 Q 18 -16 16 -6 Q 20 2 14 10 Q 16 18 6 20 Q 0 22 -6 20 Q -16 18 -14 10 Q -20 2 -16 -6 Z" fill="none" stroke="currentColor" stroke-width="2.2"/>
    <path d="M 0 -18 Q 2 -8 0 0 Q -2 8 0 18" fill="none" stroke="currentColor" stroke-width="1.8"/>
    <path d="M -10 -10 Q -6 -8 -8 -2" fill="none" stroke="currentColor" stroke-width="1.5"/>
    <path d="M 10 -6 Q 6 -2 8 4" fill="none" stroke="currentColor" stroke-width="1.5"/>
  </g>
  <g id="network">
    <line x1="0" y1="0" x2="-14" y2="-10" stroke="currentColor" stroke-width="1.8"/>
    <line x1="0" y1="0" x2="14" y2="-8" stroke="currentColor" stroke-width="1.8"/>
    <line x1="0" y1="0" x2="-10" y2="14" stroke="currentColor" stroke-width="1.8"/>
    <line x1="0" y1="0" x2="12" y2="12" stroke="currentColor" stroke-width="1.8"/>
    <circle cx="0" cy="0" r="4" fill="currentColor"/>
    <circle cx="-14" cy="-10" r="3" fill="currentColor"/>
    <circle cx="14" cy="-8" r="3" fill="currentColor"/>
    <circle cx="-10" cy="14" r="3" fill="currentColor"/>
    <circle cx="12" cy="12" r="3" fill="currentColor"/>
  </g>
  <g id="bubble">
    <path d="M -16 -12 h32 a4 4 0 0 1 4 4 v12 a4 4 0 0 1 -4 4 h-20 l-8 8 v-8 h-4 a4 4 0 0 1 -4 -4 v-12 a4 4 0 0 1 4 -4 Z" fill="none" stroke="currentColor" stroke-width="2.2"/>
    <circle cx="-6" cy="-2" r="1.8" fill="currentColor"/>
    <circle cx="0" cy="-2" r="1.8" fill="currentColor"/>
    <circle cx="6" cy="-2" r="1.8" fill="currentColor"/>
  </g>
  <g id="gear">
    <circle cx="0" cy="0" r="10" fill="none" stroke="currentColor" stroke-width="2"/>
    <circle cx="0" cy="0" r="4" fill="none" stroke="currentColor" stroke-width="1.5"/>
    <line x1="0" y1="-10" x2="0" y2="-15" stroke="currentColor" stroke-width="2"/>
    <line x1="0" y1="10" x2="0" y2="15" stroke="currentColor" stroke-width="2"/>
    <line x1="-10" y1="0" x2="-15" y2="0" stroke="currentColor" stroke-width="2"/>
    <line x1="10" y1="0" x2="15" y2="0" stroke="currentColor" stroke-width="2"/>
  </g>
`;

// Instancias: [icono, x, y, escala, color]
function buildAiPattern(colors: string[]): string {
  const c = (i: number) => colors[i % colors.length];
  const instances = [
    ['chip', 60, 70, 1, c(0)], ['brain', 220, 40, 0.9, c(1)], ['network', 340, 100, 1, c(2)],
    ['robot', 130, 160, 1, c(1)], ['bubble', 300, 190, 0.9, c(0)], ['gear', 40, 230, 0.8, c(2)],
    ['brain', 400, 260, 1, c(0)], ['chip', 200, 300, 0.9, c(2)], ['network', 90, 340, 0.9, c(1)],
    ['bubble', 350, 380, 1, c(1)], ['robot', 260, 420, 0.9, c(0)], ['gear', 130, 450, 0.9, c(2)],
    ['brain', 20, 420, 0.8, c(1)], ['chip', 430, 440, 0.85, c(0)],
  ];
  const uses = instances
    .map(([id, x, y, s, color]) => `<use href="#${id}" transform="translate(${x},${y}) scale(${s})" style="color:${color}" />`)
    .join('');
  return `data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 480"><defs>${AI_ICON_DEFS}</defs><g filter="url(#b)">${uses}</g></svg>`
  )}`;
}

const AI_BG_LIGHT = buildAiPattern(['#93c5fd', '#a5b4fc', '#c4b5fd']);
const AI_BG_DARK = buildAiPattern(['#22d3ee', '#38bdf8', '#818cf8']);

export default function App() {
  const { theme, toggleTheme } = useTheme();
  const settings = useSettings();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [view, setView] = useLocalStorageState<View>('lumina-active-view', 'dashboard');
  const [scrollY, setScrollY] = useState(0);

  // Desvanece el texto "Lumina AI" del header a medida que se baja — el logo se queda,
  // solo el texto se retira. Es un cálculo tan ligero (una resta) que no hace falta
  // limitarlo con requestAnimationFrame — eso además falla si la pestaña no está
  // realmente visible/compuesta (rAF se pausa), dejando el efecto roto sin motivo.
  useEffect(() => {
    const handleScroll = () => setScrollY(window.scrollY);
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const TITLE_FADE_DISTANCE = 90;
  const titleOpacity = Math.max(0, 1 - scrollY / TITLE_FADE_DISTANCE);

  // Animación 3D de los botones: un único listener delegado (en vez de tocar cada botón
  // de cada componente) — cualquier .btn-primary/.btn-secondary/.btn-light de toda la
  // app se inclina siguiendo el cursor. mouseout (sí burbujea, a diferencia de
  // mouseleave) resetea la inclinación al salir del botón.
  useEffect(() => {
    const BTN_SELECTOR = '.btn-primary, .btn-secondary, .btn-light';
    const TILT_MAX_DEG = 10;

    const resetTilt = (el: HTMLElement) => {
      el.style.setProperty('--btn-tilt-x', '0deg');
      el.style.setProperty('--btn-tilt-y', '0deg');
    };

    const handleMove = (e: MouseEvent) => {
      const btn = (e.target as HTMLElement)?.closest?.(BTN_SELECTOR) as HTMLElement | null;
      if (!btn) return;
      const rect = btn.getBoundingClientRect();
      const px = (e.clientX - rect.left) / rect.width;
      const py = (e.clientY - rect.top) / rect.height;
      const rotateY = (px - 0.5) * TILT_MAX_DEG * 2;
      const rotateX = (0.5 - py) * TILT_MAX_DEG * 2;
      btn.style.setProperty('--btn-tilt-x', `${rotateX}deg`);
      btn.style.setProperty('--btn-tilt-y', `${rotateY}deg`);
    };

    const handleOut = (e: MouseEvent) => {
      const btn = (e.target as HTMLElement)?.closest?.(BTN_SELECTOR) as HTMLElement | null;
      if (!btn) return;
      const related = e.relatedTarget as Node | null;
      if (related && btn.contains(related)) return;
      resetTilt(btn);
    };

    document.addEventListener('mousemove', handleMove);
    document.addEventListener('mouseout', handleOut);
    return () => {
      document.removeEventListener('mousemove', handleMove);
      document.removeEventListener('mouseout', handleOut);
    };
  }, []);

  return (
    <div className="min-h-screen bg-gradient-light relative">
      {/* Fondo decorativo: iconos de IA (chip, robot, cerebro, red, chat) muy difuminados */}
      <div
        className="fixed -inset-10 -z-10 pointer-events-none opacity-70 blur-md dark:hidden"
        style={{ backgroundImage: `url("${AI_BG_LIGHT}")`, backgroundSize: '340px 340px', backgroundRepeat: 'repeat' }}
      />
      <div
        className="hidden dark:block fixed -inset-10 -z-10 pointer-events-none opacity-40 blur-md"
        style={{ backgroundImage: `url("${AI_BG_DARK}")`, backgroundSize: '340px 340px', backgroundRepeat: 'repeat' }}
      />

      {/* Header — el blur va en una capa aparte con máscara de degradado (se desvanece
          hacia abajo) en vez de cortar en seco contra el patrón de fondo; así se nota
          el cristal sin dejar una línea dura al hacer scroll. */}
      <header className="sticky top-0 z-50">
        <div
          className="absolute inset-0 -z-10 bg-white/70 dark:bg-zinc-950/70 backdrop-blur-xl backdrop-saturate-150"
          style={{
            maskImage: 'linear-gradient(to bottom, black 65%, transparent 100%)',
            WebkitMaskImage: 'linear-gradient(to bottom, black 65%, transparent 100%)',
          }}
        />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-5">
          <div className="flex items-center justify-between">
            <button
              onClick={() => setView('dashboard')}
              className="flex items-center gap-4 text-left"
              aria-label="Ir al inicio"
            >
              <div className="relative shrink-0 w-14 h-14 rounded-full overflow-hidden">
                <img
                  src={settings.logoUrl}
                  alt={settings.systemName}
                  className="w-full h-full object-cover"
                />
              </div>
              {!settings.hideSystemName && (
                <h1
                  className="text-4xl font-black text-gray-900 dark:text-zinc-100 tracking-tight transition-opacity duration-100"
                  style={{ opacity: titleOpacity }}
                >
                  {settings.systemName}
                </h1>
              )}
            </button>
            <div className="flex items-center gap-3">
              <div className="hidden sm:flex items-center gap-1.5 text-gray-400 dark:text-zinc-600 text-xs">
                <Zap className="w-3.5 h-3.5 text-yellow-400" fill="currentColor" />
                <span>Dani S.</span>
              </div>
              <button
                onClick={() => setView('downloader')}
                aria-label="Descargador de Videos"
                title="Descargador de Videos"
                className={`p-2.5 rounded-xl transition-all active:scale-95 hover:-translate-y-px ${
                  view === 'downloader'
                    ? 'bg-accent-200 dark:bg-accent-900 text-accent-800 dark:text-accent-200'
                    : 'bg-accent-100 dark:bg-accent-900/45 text-accent-700 dark:text-accent-300 hover:bg-accent-200 dark:hover:bg-accent-900/70'
                }`}
              >
                <Download className="w-5 h-5" />
              </button>
              <button
                onClick={() => setSettingsOpen(true)}
                aria-label="Ajustes"
                className="p-2.5 rounded-xl bg-accent-100 dark:bg-accent-900/45 text-accent-700 dark:text-accent-300 hover:bg-accent-200 dark:hover:bg-accent-900/70 active:scale-95 hover:-translate-y-px transition-all"
              >
                <Settings className="w-5 h-5" />
              </button>
              <button
                onClick={toggleTheme}
                aria-label="Cambiar tema"
                className="p-2.5 rounded-xl bg-accent-100 dark:bg-accent-900/45 text-accent-700 dark:text-accent-300 hover:bg-accent-200 dark:hover:bg-accent-900/70 active:scale-95 hover:-translate-y-px transition-all"
              >
                {theme === 'dark' ? (
                  <Sun className="w-5 h-5" />
                ) : (
                  <Moon className="w-5 h-5" />
                )}
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="max-w-[90rem] mx-auto px-4 sm:px-6 lg:px-8 py-10">
        {view === 'downloader' ? <VideoDownloader /> : <Dashboard />}
      </main>

      <SettingsModal
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        systemName={settings.systemName}
        setSystemName={settings.setSystemName}
        logoUrl={settings.logoUrl}
        setLogoUrl={settings.setLogoUrl}
        paletteKey={settings.paletteKey}
        setPaletteKey={settings.setPaletteKey}
        customHue={settings.customHue}
        setCustomHue={settings.setCustomHue}
        cardStyle={settings.cardStyle}
        setCardStyle={settings.setCardStyle}
        fontKey={settings.fontKey}
        setFontKey={settings.setFontKey}
        cardBgImage={settings.cardBgImage}
        setCardBgImage={settings.setCardBgImage}
        cardBgBlur={settings.cardBgBlur}
        setCardBgBlur={settings.setCardBgBlur}
        hideSystemName={settings.hideSystemName}
        setHideSystemName={settings.setHideSystemName}
        btn3dGlowHue={settings.btn3dGlowHue}
        setBtn3dGlowHue={settings.setBtn3dGlowHue}
        resetSettings={settings.resetSettings}
      />

      <Toaster
        position="top-right"
        toastOptions={{
          style: {
            background: theme === 'dark' ? '#18181b' : '#ffffff',
            color: theme === 'dark' ? '#f4f4f5' : '#111827',
            border: theme === 'dark' ? '1px solid #3f3f46' : '1px solid #e5e7eb',
            borderRadius: '12px',
            boxShadow: '0 10px 30px -10px rgba(0,0,0,0.15)',
          },
          success: {
            style: {
              background: theme === 'dark' ? '#022c22' : '#ecfdf5',
              border: theme === 'dark' ? '1px solid #065f46' : '1px solid #a7f3d0',
              color: theme === 'dark' ? '#f4f4f5' : '#111827',
            },
            iconTheme: { primary: '#10b981', secondary: 'white' },
          },
          error: {
            style: {
              background: theme === 'dark' ? '#450a0a' : '#fef2f2',
              border: theme === 'dark' ? '1px solid #991b1b' : '1px solid #fecaca',
              color: theme === 'dark' ? '#f4f4f5' : '#111827',
            },
            iconTheme: { primary: '#ef4444', secondary: 'white' },
          },
        }}
      />
    </div>
  );
}
