import { useState } from 'react';
import { FileText, Image, Volume2, Video, Sparkles, Film, Zap } from 'lucide-react';
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

  const tabs: Array<{ id: Tab; label: string; icon: React.ReactNode; color: string }> = [
    { id: 'script', label: 'Guion', icon: <FileText className="w-5 h-5" />, color: 'from-blue-500 to-cyan-500' },
    { id: 'prompts', label: 'Prompts', icon: <Sparkles className="w-5 h-5" />, color: 'from-purple-500 to-pink-500' },
    { id: 'images', label: 'Imágenes', icon: <Image className="w-5 h-5" />, color: 'from-amber-500 to-orange-500' },
    { id: 'audio', label: 'Audio', icon: <Volume2 className="w-5 h-5" />, color: 'from-green-500 to-emerald-500' },
    { id: 'stock', label: 'Videos Stock', icon: <Video className="w-5 h-5" />, color: 'from-red-500 to-pink-500' },
    { id: 'editor', label: 'Editor', icon: <Film className="w-5 h-5" />, color: 'from-indigo-500 to-purple-500' },
  ];

  return (
    <div className="space-y-8">
      {/* Tab Navigation */}
      <div className="flex flex-wrap gap-3 p-2 bg-white/60 rounded-3xl border-2 border-purple-200/30 backdrop-blur-lg shadow-xl">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-5 py-3 rounded-2xl font-bold transition-all duration-300 ${
              activeTab === tab.id
                ? `bg-gradient-to-r ${tab.color} text-white shadow-lg -translate-y-1`
                : 'bg-gradient-to-r from-gray-100 to-gray-50 text-gray-700 hover:from-gray-200 hover:to-gray-100 hover:shadow-md hover:-translate-y-0.5'
            }`}
          >
            {tab.icon}
            <span>{tab.label}</span>
            {activeTab === tab.id && <Zap className="w-4 h-4 ml-1" />}
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
