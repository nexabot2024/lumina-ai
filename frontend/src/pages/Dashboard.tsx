import { useState } from 'react';
import { FileText, Image, Volume2, Video, Sparkles, Film, Scissors, ListVideo, Layers, History } from 'lucide-react';
import ScriptUploader from '../components/ScriptUploader';
import PromptGenerator from '../components/PromptGenerator';
import ImageGenerator from '../components/ImageGenerator';
import AudioGenerator from '../components/AudioGenerator';
import StockVideoSearch from '../components/StockVideoSearch';
import VideoEditor from '../components/VideoEditor';
import ClipEditor from '../components/ClipEditor';
import VideoQueueEditor from '../components/VideoQueueEditor';
import ImageSequenceEditor from '../components/ImageSequenceEditor';
import HistoryPanel from '../components/HistoryPanel';

type Tab = 'script' | 'prompts' | 'images' | 'audio' | 'stock' | 'editor' | 'clips' | 'queue' | 'imageSequence' | 'history';

interface TabDef {
  id: Tab;
  label: string;
  icon: React.ReactNode;
  group: 'crear' | 'producir';
  status: string;
}

export default function Dashboard() {
  const [activeTab, setActiveTab] = useState<Tab>('script');
  const [scriptContent, setScriptContent] = useState('');
  const [generatedPrompts, setGeneratedPrompts] = useState([]);
  const [stockPercentage, setStockPercentage] = useState(50);

  const tabs: TabDef[] = [
    { id: 'script', label: 'Guion', icon: <FileText className="w-4 h-4" />, group: 'crear', status: 'Editando el guion base' },
    { id: 'prompts', label: 'Prompts', icon: <Sparkles className="w-4 h-4" />, group: 'crear', status: 'Generando prompts cinematográficos' },
    { id: 'images', label: 'Imágenes', icon: <Image className="w-4 h-4" />, group: 'crear', status: 'Generando imágenes con IA' },
    { id: 'audio', label: 'Audio', icon: <Volume2 className="w-4 h-4" />, group: 'crear', status: 'Generando narración por voz' },
    { id: 'stock', label: 'Videos Stock', icon: <Video className="w-4 h-4" />, group: 'crear', status: 'Buscando material de stock' },
    { id: 'editor', label: 'Editor', icon: <Film className="w-4 h-4" />, group: 'producir', status: 'Ensamblando el video final' },
    { id: 'clips', label: 'Editor de Clips', icon: <Scissors className="w-4 h-4" />, group: 'producir', status: 'Reordenando clips y sincronizando audio' },
    { id: 'queue', label: 'Cola de Edición', icon: <ListVideo className="w-4 h-4" />, group: 'producir', status: 'Procesando videos en cola' },
    { id: 'imageSequence', label: 'Secuencia de Imágenes', icon: <Layers className="w-4 h-4" />, group: 'producir', status: 'Armando secuencia de imágenes' },
    { id: 'history', label: 'Historial', icon: <History className="w-4 h-4" />, group: 'producir', status: 'Revisando videos generados' },
  ];

  const active = tabs.find(t => t.id === activeTab)!;
  const crearTabs = tabs.filter(t => t.group === 'crear');
  const producirTabs = tabs.filter(t => t.group === 'producir');

  const SidebarGroup = ({ title, items }: { title: string; items: TabDef[] }) => (
    <div>
      <p className="text-gray-400 dark:text-zinc-600 text-[9px] font-medium uppercase tracking-widest px-3 mb-2">{title}</p>
      <div className="space-y-0.5">
        {items.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`w-full flex items-center gap-3 px-3 py-2 text-sm transition-colors text-left border-l-2 ${
              activeTab === tab.id
                ? 'bg-accent-50 dark:bg-accent-950/40 border-accent-500 text-accent-700 dark:text-accent-300 font-medium'
                : 'border-transparent text-gray-500 dark:text-zinc-400 hover:bg-gray-100 dark:hover:bg-zinc-900 hover:text-gray-900 dark:hover:text-zinc-200'
            }`}
          >
            <span className={activeTab === tab.id ? 'text-accent-600 dark:text-accent-400' : 'text-gray-400 dark:text-zinc-500'}>
              {tab.icon}
            </span>
            <span className="truncate">{tab.label}</span>
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <div className="flex flex-col md:flex-row gap-6 items-start">
      {/* Sidebar */}
      <aside className="w-full md:w-64 shrink-0 md:sticky md:top-28 bg-white dark:bg-zinc-950 border border-gray-100 dark:border-zinc-800/60 rounded-xl p-4 space-y-6">
        <SidebarGroup title="Crear" items={crearTabs} />
        <SidebarGroup title="Producir" items={producirTabs} />
      </aside>

      {/* Canvas */}
      <div className="flex-1 min-w-0 w-full space-y-4">
        {/* Herramienta activa */}
        <div key={activeTab} className="animate-materialize">
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

          {activeTab === 'images' && <ImageGenerator prompts={generatedPrompts} />}

          {activeTab === 'audio' && <AudioGenerator scriptSections={scriptContent.split(/\n\s*\n+/)} />}

          {activeTab === 'stock' && <StockVideoSearch />}

          {activeTab === 'editor' && <VideoEditor />}

          {activeTab === 'clips' && <ClipEditor />}

          {activeTab === 'queue' && <VideoQueueEditor />}

          {activeTab === 'imageSequence' && <ImageSequenceEditor />}

          {activeTab === 'history' && <HistoryPanel />}
        </div>

        {/* Barra de estado inferior — Núcleo IA */}
        <div className="bg-white dark:bg-zinc-950 border-t border-gray-100 dark:border-zinc-800 rounded-lg px-4 py-2 flex items-center gap-2">
          <div className="w-1.5 h-1.5 rounded-full bg-accent-500 animate-pulse shrink-0" />
          <span className="text-gray-400 dark:text-zinc-500 text-[10px]">IA activa —</span>
          <span className="text-gray-600 dark:text-zinc-400 text-[10px] truncate">{active.status}</span>
        </div>
      </div>
    </div>
  );
}
