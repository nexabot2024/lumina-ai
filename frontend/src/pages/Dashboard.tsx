import { useEffect, useRef, useState } from 'react';
import { FileText, Video, Sparkles, Film, Scissors, ListVideo, Layers, History, ChevronDown, Globe2 } from 'lucide-react';
import ScriptUploader from '../components/ScriptUploader';
import PromptGenerator from '../components/PromptGenerator';
import StockVideoSearch from '../components/StockVideoSearch';
import VideoEditor from '../components/VideoEditor';
import ClipEditor from '../components/ClipEditor';
import VideoQueueEditor from '../components/VideoQueueEditor';
import ImageSequenceEditor from '../components/ImageSequenceEditor';
import HistoryPanel from '../components/HistoryPanel';
import BraveImageSearch from '../components/BraveImageSearch';
import { useLocalStorageState } from '../hooks/useLocalStorageState';

type Tab = 'script' | 'prompts' | 'stock' | 'braveSearch' | 'editor' | 'clips' | 'queue' | 'imageSequence' | 'history';

interface TabDef {
  id: Tab;
  label: string;
  icon: React.ReactNode;
  group: 'crear' | 'producir';
  status: string;
  /** Color de la insignia del icono en la barra lateral — variado a propósito (no el
   *  acento de marca) para que cada herramienta se distinga de un vistazo; el acento
   *  sigue siendo el que marca cuál pestaña está activa. */
  badge: string;
}

// Insignias estilo "Liquid Glass": degradado translúcido + backdrop-blur + brillo
// superior — solo para estos iconos, el resto de la app sigue con el diseño plano.
const BADGE_CLASSES: Record<string, string> = {
  blue: 'from-blue-400/80 to-blue-600/80',
  fuchsia: 'from-fuchsia-400/80 to-fuchsia-600/80',
  pink: 'from-pink-400/80 to-pink-600/80',
  amber: 'from-amber-400/80 to-amber-600/80',
  emerald: 'from-emerald-400/80 to-emerald-600/80',
  cyan: 'from-cyan-400/80 to-cyan-600/80',
  rose: 'from-rose-400/80 to-rose-600/80',
  indigo: 'from-indigo-400/80 to-indigo-600/80',
  teal: 'from-teal-400/80 to-teal-600/80',
  orange: 'from-orange-400/80 to-orange-600/80',
  slate: 'from-slate-300/80 to-slate-500/80',
};

export default function Dashboard() {
  const [activeTab, setActiveTab] = useLocalStorageState<Tab>('lumina-active-tool', 'script');
  const [navOpen, setNavOpen] = useState(false);
  const navRef = useRef<HTMLDivElement>(null);
  const [scriptContent, setScriptContent] = useState('');
  const [generatedPrompts, setGeneratedPrompts] = useState([]);
  const [stockPercentage, setStockPercentage] = useState(50);

  // Cierra el desplegable al hacer clic fuera de él.
  useEffect(() => {
    if (!navOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (navRef.current && !navRef.current.contains(e.target as Node)) {
        setNavOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [navOpen]);

  const tabs: TabDef[] = [
    { id: 'script', label: 'Guion', icon: <FileText className="w-4 h-4" />, group: 'crear', status: 'Editando el guion base', badge: 'blue' },
    { id: 'prompts', label: 'Prompts', icon: <Sparkles className="w-4 h-4" />, group: 'crear', status: 'Generando prompts cinematográficos', badge: 'fuchsia' },
    { id: 'stock', label: 'Videos Stock', icon: <Video className="w-4 h-4" />, group: 'crear', status: 'Buscando material de stock', badge: 'emerald' },
    { id: 'braveSearch', label: 'Brave Imágenes', icon: <Globe2 className="w-4 h-4" />, group: 'crear', status: 'Buscando y descargando imágenes web', badge: 'orange' },
    { id: 'editor', label: 'Editor', icon: <Film className="w-4 h-4" />, group: 'producir', status: 'Ensamblando el video final', badge: 'cyan' },
    { id: 'clips', label: 'Editor de Clips', icon: <Scissors className="w-4 h-4" />, group: 'producir', status: 'Reordenando clips y sincronizando audio', badge: 'rose' },
    { id: 'queue', label: 'Cola de Edición', icon: <ListVideo className="w-4 h-4" />, group: 'producir', status: 'Procesando videos en cola', badge: 'indigo' },
    { id: 'imageSequence', label: 'Secuencia de Imágenes', icon: <Layers className="w-4 h-4" />, group: 'producir', status: 'Armando secuencia de imágenes', badge: 'teal' },
    { id: 'history', label: 'Historial', icon: <History className="w-4 h-4" />, group: 'producir', status: 'Revisando videos generados', badge: 'slate' },
  ];

  const active = tabs.find(t => t.id === activeTab)!;
  const crearTabs = tabs.filter(t => t.group === 'crear');
  const producirTabs = tabs.filter(t => t.group === 'producir');

  const Badge = ({ tab, active: isActive }: { tab: TabDef; active: boolean }) => (
    <span
      className={`relative shrink-0 w-7 h-7 rounded-lg overflow-hidden flex items-center justify-center text-white border border-white/40 dark:border-white/10 backdrop-blur-sm bg-gradient-to-br transition-transform ${BADGE_CLASSES[tab.badge]} ${
        isActive ? 'scale-105 shadow-md' : 'shadow-sm opacity-90'
      }`}
    >
      {/* Brillo superior — el detalle "liquid glass" */}
      <span className="absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/50 to-transparent pointer-events-none" />
      <span className="relative">{tab.icon}</span>
    </span>
  );

  const DropdownGroup = ({ title, items }: { title: string; items: TabDef[] }) => (
    <div>
      <p className="text-gray-400 dark:text-zinc-600 text-[9px] font-medium uppercase tracking-widest px-2 mb-1.5">{title}</p>
      <div className="space-y-0.5">
        {items.map(tab => (
          <button
            key={tab.id}
            onClick={() => {
              setActiveTab(tab.id);
              setNavOpen(false);
            }}
            className={`w-full flex items-center gap-3 px-2 py-2 rounded-lg text-sm transition-colors text-left ${
              activeTab === tab.id
                ? 'bg-accent-50 dark:bg-accent-950/40 text-accent-700 dark:text-accent-300 font-medium'
                : 'text-gray-600 dark:text-zinc-300 hover:bg-gray-50 dark:hover:bg-zinc-900'
            }`}
          >
            <Badge tab={tab} active={activeTab === tab.id} />
            <span className="truncate">{tab.label}</span>
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Selector de herramienta — desplegable, debajo del logo */}
      <div ref={navRef} className="relative inline-block">
        <button
          onClick={() => setNavOpen(v => !v)}
          className="flex items-center gap-3 pl-3 pr-4 py-2.5 bg-white dark:bg-zinc-950 border border-gray-100 dark:border-zinc-800/60 rounded-full shadow-sm hover:shadow transition-shadow"
        >
          <Badge tab={active} active />
          <span className="text-sm font-medium text-gray-900 dark:text-zinc-100">{active.label}</span>
          <ChevronDown className={`w-4 h-4 text-gray-400 dark:text-zinc-500 transition-transform ${navOpen ? 'rotate-180' : ''}`} />
        </button>

        {navOpen && (
          <div className="absolute z-40 mt-2 w-72 bg-white/95 dark:bg-zinc-950/95 backdrop-blur-xl border border-gray-100 dark:border-zinc-800/60 rounded-2xl shadow-xl p-3 space-y-4 animate-materialize">
            <DropdownGroup title="Crear" items={crearTabs} />
            <DropdownGroup title="Producir" items={producirTabs} />
          </div>
        )}
      </div>

      {/* Canvas */}
      <div className="w-full space-y-4">
        {/* Herramienta activa */}
        <div key={activeTab} className="animate-section-enter">
          {activeTab === 'script' && (
            <ScriptUploader
              onScriptLoad={setScriptContent}
              scriptContent={scriptContent}
              stockPercentage={stockPercentage}
              onStockPercentageChange={setStockPercentage}
            />
          )}

          {activeTab === 'prompts' && (
            <PromptGenerator
              scriptContent={scriptContent}
              onGeneratePrompts={setGeneratedPrompts}
              generatedPrompts={generatedPrompts}
            />
          )}

          {activeTab === 'stock' && <StockVideoSearch />}

          {activeTab === 'braveSearch' && <BraveImageSearch />}

          {activeTab === 'editor' && <VideoEditor />}

          {activeTab === 'clips' && <ClipEditor />}

          {activeTab === 'queue' && <VideoQueueEditor />}

          {activeTab === 'imageSequence' && <ImageSequenceEditor />}

          {activeTab === 'history' && <HistoryPanel />}
        </div>

        {/* Barra de estado inferior — Núcleo IA */}
        <div className="bg-white dark:bg-zinc-950 border-t border-gray-100 dark:border-zinc-800 rounded-lg px-4 py-2 flex items-center gap-2">
          <div className="w-1.5 h-1.5 rounded-full bg-accent-500 animate-pulse shrink-0" />
          <span className="text-gray-400 dark:text-zinc-500 text-xs">IA activa —</span>
          <span className="text-gray-600 dark:text-zinc-400 text-[10px] truncate">{active.status}</span>
        </div>
      </div>
    </div>
  );
}
