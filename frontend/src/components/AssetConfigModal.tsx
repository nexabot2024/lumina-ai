import { useState } from 'react';
import { X } from 'lucide-react';
import toast from 'react-hot-toast';

interface AssetConfig {
  stockVideos: number;
  iaVideos: number;
  iaImages: number;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (config: AssetConfig) => void;
  defaultConfig?: AssetConfig;
}

export default function AssetConfigModal({ isOpen, onClose, onConfirm, defaultConfig }: Props) {
  const [config, setConfig] = useState<AssetConfig>(
    defaultConfig || {
      stockVideos: 5,
      iaVideos: 3,
      iaImages: 8,
    }
  );

  const handleConfirm = () => {
    if (config.stockVideos < 0 || config.iaVideos < 0 || config.iaImages < 0) {
      toast.error('Los valores no pueden ser negativos');
      return;
    }

    const total = config.stockVideos + config.iaVideos + config.iaImages;
    if (total === 0) {
      toast.error('Debes seleccionar al menos un asset');
      return;
    }

    onConfirm(config);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="glass-modal p-8 max-w-md w-full">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-zinc-100">Configurar Assets</h2>
          <button
            onClick={onClose}
            className="text-gray-500 dark:text-zinc-400 hover:text-gray-900 dark:hover:text-zinc-100 transition"
          >
            <X size={24} />
          </button>
        </div>

        <div className="space-y-6">
          {/* Stock Videos */}
          <div>
            <label className="block text-sm font-medium text-gray-400 dark:text-zinc-600 mb-2">
              Videos Stock
            </label>
            <div className="flex items-center gap-4">
              <input
                type="number"
                min="0"
                value={config.stockVideos}
                onChange={(e) =>
                  setConfig({ ...config, stockVideos: Math.max(0, parseInt(e.target.value) || 0) })
                }
                className="flex-1 bg-gray-50 dark:bg-zinc-950 border border-gray-200 dark:border-zinc-800 text-gray-900 dark:text-zinc-100 rounded-lg px-4 py-2 text-lg focus:border-accent-500 dark:focus:border-accent-600 focus:outline-none"
              />
              <span className="text-gray-500 dark:text-zinc-400 text-sm">unidades</span>
            </div>
            <p className="text-xs text-gray-500 dark:text-zinc-400 mt-1">Vídeos sin IA de Pixabay, Pexels, etc.</p>
          </div>

          {/* IA Videos */}
          <div>
            <label className="block text-sm font-medium text-gray-400 dark:text-zinc-600 mb-2">
              Videos IA (SnapGen)
            </label>
            <div className="flex items-center gap-4">
              <input
                type="number"
                min="0"
                value={config.iaVideos}
                onChange={(e) =>
                  setConfig({ ...config, iaVideos: Math.max(0, parseInt(e.target.value) || 0) })
                }
                className="flex-1 bg-gray-50 dark:bg-zinc-950 border border-gray-200 dark:border-zinc-800 text-gray-900 dark:text-zinc-100 rounded-lg px-4 py-2 text-lg focus:border-accent-500 dark:focus:border-accent-600 focus:outline-none"
              />
              <span className="text-gray-500 dark:text-zinc-400 text-sm">unidades</span>
            </div>
            <p className="text-xs text-gray-500 dark:text-zinc-400 mt-1">Generados con IA (veo-3.1-fast)</p>
          </div>

          {/* IA Images */}
          <div>
            <label className="block text-sm font-medium text-gray-400 dark:text-zinc-600 mb-2">
              Imágenes IA (G-Labs)
            </label>
            <div className="flex items-center gap-4">
              <input
                type="number"
                min="0"
                value={config.iaImages}
                onChange={(e) =>
                  setConfig({ ...config, iaImages: Math.max(0, parseInt(e.target.value) || 0) })
                }
                className="flex-1 bg-gray-50 dark:bg-zinc-950 border border-gray-200 dark:border-zinc-800 text-gray-900 dark:text-zinc-100 rounded-lg px-4 py-2 text-lg focus:border-accent-500 dark:focus:border-accent-600 focus:outline-none"
              />
              <span className="text-gray-500 dark:text-zinc-400 text-sm">unidades</span>
            </div>
            <p className="text-xs text-gray-500 dark:text-zinc-400 mt-1">Generadas con NanoBanana</p>
          </div>

          {/* Summary */}
          <div className="bg-accent-50 dark:bg-accent-950/50 rounded-lg p-4">
            <p className="text-sm text-gray-500 dark:text-zinc-400">Total de assets:</p>
            <p className="text-2xl font-bold text-accent-600 dark:text-accent-400">
              {config.stockVideos + config.iaVideos + config.iaImages}
            </p>
            <div className="text-xs text-gray-500 dark:text-zinc-400 mt-2 space-y-1">
              <p>📹 Stock: {config.stockVideos}</p>
              <p>🎬 IA Videos: {config.iaVideos}</p>
              <p>🖼️ IA Imágenes: {config.iaImages}</p>
            </div>
          </div>
        </div>

        <div className="flex gap-4 mt-8">
          <button
            onClick={onClose}
            className="flex-1 btn-secondary"
          >
            Cancelar
          </button>
          <button
            onClick={handleConfirm}
            className="flex-1 btn-primary"
          >
            Confirmar
          </button>
        </div>
      </div>
    </div>
  );
}
