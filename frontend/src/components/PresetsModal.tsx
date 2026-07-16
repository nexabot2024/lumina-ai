import { useState } from 'react';
import { BookOpen, X, Copy, ChevronRight } from 'lucide-react';
import toast from 'react-hot-toast';
import {
  SCRIPT_PRESETS,
  getCategories,
  getPresetsByCategory,
  searchPresets,
} from '../services/scriptPresets';

interface PresetsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectPreset: (content: string) => void;
}

export default function PresetsModal({
  isOpen,
  onClose,
  onSelectPreset,
}: PresetsModalProps) {
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPreset, setSelectedPreset] = useState<string | null>(null);

  if (!isOpen) return null;

  const categories = getCategories();
  const filteredPresets = searchQuery
    ? searchPresets(searchQuery)
    : selectedCategory
      ? getPresetsByCategory(selectedCategory)
      : SCRIPT_PRESETS;

  const handleSelectPreset = (presetId: string) => {
    const preset = SCRIPT_PRESETS.find(p => p.id === presetId);
    if (preset) {
      onSelectPreset(preset.content);
      toast.success(`✨ Preset "${preset.name}" cargado`);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-gray-950 border border-white/10 rounded-2xl max-w-3xl w-full max-h-96 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-white/10">
          <div className="flex items-center gap-3">
            <BookOpen className="w-6 h-6 text-purple-400" />
            <h2 className="text-xl font-bold">Presets de Guión</h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-white/10 rounded-lg transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-hidden flex">
          {/* Categories Sidebar */}
          <div className="w-40 border-r border-white/10 overflow-y-auto bg-gray-900/50 p-4">
            <button
              onClick={() => {
                setSelectedCategory(null);
                setSearchQuery('');
              }}
              className={`w-full text-left px-3 py-2 rounded-lg mb-2 font-semibold transition-colors ${
                selectedCategory === null
                  ? 'bg-purple-600 text-white'
                  : 'text-gray-300 hover:bg-white/10'
              }`}
            >
              Todos
            </button>

            {categories.map(cat => (
              <button
                key={cat}
                onClick={() => {
                  setSelectedCategory(cat);
                  setSearchQuery('');
                }}
                className={`w-full text-left px-3 py-2 rounded-lg mb-1 text-sm transition-colors ${
                  selectedCategory === cat
                    ? 'bg-purple-600 text-white'
                    : 'text-gray-400 hover:bg-white/10'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>

          {/* Presets List */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {/* Search */}
            <div className="sticky top-0 bg-gray-950 pb-2 mb-2">
              <input
                type="text"
                placeholder="Buscar presets..."
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setSelectedCategory(null);
                }}
                className="w-full px-3 py-2 bg-gray-900 border border-white/10 rounded-lg text-white placeholder-gray-500 focus:border-purple-500/50 focus:outline-none text-sm"
              />
            </div>

            {filteredPresets.length === 0 ? (
              <div className="text-center py-8 text-gray-400">
                <p>No se encontraron presets</p>
              </div>
            ) : (
              filteredPresets.map(preset => (
                <div
                  key={preset.id}
                  className="p-3 bg-gray-900/50 border border-white/10 rounded-lg hover:border-purple-500/50 transition-all cursor-pointer group"
                  onClick={() => setSelectedPreset(preset.id)}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <h3 className="font-semibold text-sm text-white group-hover:text-purple-300 transition-colors">
                        {preset.name}
                      </h3>
                      <p className="text-xs text-gray-400 mt-1">{preset.description}</p>
                      <div className="flex items-center gap-2 mt-2">
                        <span className="text-xs px-2 py-1 rounded-full bg-white/5 text-gray-400">
                          {preset.category}
                        </span>
                        <span className="text-xs px-2 py-1 rounded-full bg-white/5 text-gray-400">
                          {preset.duration}
                        </span>
                      </div>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleSelectPreset(preset.id);
                      }}
                      className="p-2 hover:bg-purple-600 rounded-lg transition-colors mt-2"
                    >
                      <ChevronRight className="w-5 h-5" />
                    </button>
                  </div>

                  {/* Tags */}
                  {preset.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {preset.tags.map(tag => (
                        <span
                          key={tag}
                          className="text-xs px-2 py-1 rounded-full bg-purple-950/50 text-purple-300"
                        >
                          #{tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
