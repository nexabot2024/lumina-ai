import { useState } from 'react';
import { FileText, Image, Volume2, Video, Sparkles, Film } from 'lucide-react';
import ScriptUploader from '../components/ScriptUploader';
import PromptGenerator from '../components/PromptGenerator';
import ImageGenerator from '../components/ImageGenerator';
import AudioGenerator from '../components/AudioGenerator';
import StockVideoSearch from '../components/StockVideoSearch';
import VideoEditor from '../components/VideoEditor';

type Tab = 'script' | 'prompts' | 'images' | 'audio' | 'stock' | 'editor';

export default function Dashboard() {
  const [activeTab, setActiveTab] = useState<Tab>('script');
  const [scriptContent, setScriptContent] = useState('');
  const [generatedPrompts, setGeneratedPrompts] = useState([]);

  const tabs: Array<{ id: Tab; label: string; icon: React.ReactNode }> = [
    { id: 'script', label: 'Guion', icon: <FileText className="w-5 h-5" /> },
    { id: 'prompts', label: 'Prompts', icon: <Sparkles className="w-5 h-5" /> },
    { id: 'images', label: 'Imágenes', icon: <Image className="w-5 h-5" /> },
    { id: 'audio', label: 'Audio', icon: <Volume2 className="w-5 h-5" /> },
    { id: 'stock', label: 'Videos Stock', icon: <Video className="w-5 h-5" /> },
    { id: 'editor', label: 'Editor', icon: <Film className="w-5 h-5" /> },
  ];

  return (
    <div className="space-y-8">
      {/* Tab Navigation */}
      <div className="flex flex-wrap gap-2 p-1 bg-white/5 rounded-2xl border border-white/10 backdrop-blur-xl">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-semibold transition-all ${
              activeTab === tab.id
                ? 'bg-gradient-to-r from-purple-600 to-pink-500 text-white'
                : 'text-gray-300 hover:text-white hover:bg-white/5'
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content Sections */}
      <div className="space-y-6">
        {/* Script Upload Tab */}
        {activeTab === 'script' && (
          <div className="animate-in fade-in duration-300">
            <ScriptUploader
              onScriptLoad={setScriptContent}
              scriptContent={scriptContent}
            />
          </div>
        )}

        {/* Prompts Generator Tab */}
        {activeTab === 'prompts' && (
          <div className="animate-in fade-in duration-300">
            <PromptGenerator
              scriptContent={scriptContent}
              onGeneratePrompts={setGeneratedPrompts}
              generatedPrompts={generatedPrompts}
            />
          </div>
        )}

        {/* Images Generator Tab */}
        {activeTab === 'images' && (
          <div className="animate-in fade-in duration-300">
            <ImageGenerator
              prompts={generatedPrompts}
            />
          </div>
        )}

        {/* Audio Generator Tab */}
        {activeTab === 'audio' && (
          <div className="animate-in fade-in duration-300">
            <AudioGenerator
              scriptSections={scriptContent.split(/\n\s*\n+/)}
            />
          </div>
        )}

        {/* Stock Videos Tab */}
        {activeTab === 'stock' && (
          <div className="animate-in fade-in duration-300">
            <StockVideoSearch />
          </div>
        )}

        {activeTab === 'editor' && (
          <div className="animate-in fade-in duration-300">
            <VideoEditor />
          </div>
        )}
      </div>
    </div>
  );
}
