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
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="glass-modal max-w-3xl w-full max-h-96 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-100 dark:border-zinc-800/60">
          <div className="flex items-center gap-3">
            <BookOpen className="w-6 h-6 text-accent-600 dark:text-accent-400" />
            <h2 className="text-xl font-bold text-gray-900 dark:text-zinc-100">Presets de Guión</h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-500 dark:text-zinc-400 hover:bg-gray-100 dark:hover:bg-zinc-800 rounded-lg transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-hidden flex">
          {/* Categories Sidebar */}
          <div className="w-40 border-r border-gray-100 dark:border-zinc-800/60 overflow-y-auto bg-gray-50 dark:bg-zinc-950 p-4">
            <button
              onClick={() => {
                setSelectedCategory(null);
                setSearchQuery('');
              }}
              className={`w-full text-left px-3 py-2 rounded-lg mb-2 font-semibold transition-colors ${
                selectedCategory === null
                  ? 'bg-accent-600 text-white'
                  : 'text-gray-500 dark:text-zinc-400 hover:bg-gray-100 dark:hover:bg-zinc-800'
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
                    ? 'bg-accent-600 text-white'
                    : 'text-gray-500 dark:text-zinc-400 hover:bg-gray-100 dark:hover:bg-zinc-800'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>

          {/* Presets List */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {/* Search */}
            <div className="sticky top-0 bg-white dark:bg-zinc-900 pb-2 mb-2">
              <input
                type="text"
                placeholder="Buscar presets..."
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setSelectedCategory(null);
                }}
                className="w-full px-3 py-2 bg-gray-50 dark:bg-zinc-950 border border-gray-200 dark:border-zinc-800 text-gray-900 dark:text-zinc-100 placeholder-gray-400 dark:placeholder-zinc-600 rounded-lg focus:border-accent-500 dark:focus:border-accent-600 focus:outline-none text-sm"
              />
            </div>

            {filteredPresets.length === 0 ? (
              <div className="text-center py-8">
                <div className="empty-state-icon">
                  <BookOpen className="w-6 h-6" />
                </div>
                <p className="text-gray-500 dark:text-zinc-400 text-sm">No se encontraron presets</p>
              </div>
            ) : (
              filteredPresets.map(preset => (
                <div
                  key={preset.id}
                  className="p-3 bg-gray-50 dark:bg-zinc-950 border border-gray-200 dark:border-zinc-800 rounded-lg hover:border-accent-300 dark:hover:border-accent-700 transition-colors cursor-pointer group"
                  onClick={() => setSelectedPreset(preset.id)}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <h3 className="font-semibold text-sm text-gray-900 dark:text-zinc-100 group-hover:text-accent-600 dark:group-hover:text-accent-400 transition-colors">
                        {preset.name}
                      </h3>
                      <p className="text-xs text-gray-500 dark:text-zinc-400 mt-1">{preset.description}</p>
                      <div className="flex items-center gap-2 mt-2">
                        <span className="text-xs px-2 py-1 rounded-full border border-gray-200 dark:border-zinc-700 text-gray-500 dark:text-zinc-400 hover:border-gray-300 dark:hover:border-zinc-600">
                          {preset.category}
                        </span>
                        <span className="text-xs px-2 py-1 rounded-full border border-gray-200 dark:border-zinc-700 text-gray-500 dark:text-zinc-400 hover:border-gray-300 dark:hover:border-zinc-600">
                          {preset.duration}
                        </span>
                      </div>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleSelectPreset(preset.id);
                      }}
                      className="p-2 text-gray-400 dark:text-zinc-600 hover:bg-accent-600 hover:text-white rounded-lg transition-colors mt-2"
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
                          className="text-xs px-2 py-1 rounded-full bg-accent-50 dark:bg-accent-950/50 border border-accent-300 dark:border-accent-700 text-accent-700 dark:text-accent-300"
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
