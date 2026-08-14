import { useState } from 'react';
import { GripVertical, Trash2, Copy, ChevronDown, Play, Loader, Music } from 'lucide-react';
import toast from 'react-hot-toast';
import axios from 'axios';
import { API_URL } from '../services/apiUrl';

interface Asset {
  id: string;
  name: string;
  type: 'video' | 'image' | 'audio';
  path: string;
  duration: number;
  source: 'upload' | 'generated';
  transition?: string;
  transitionDuration?: number;
}

interface Props {
  assets: Asset[];
  onAssetsChange: (assets: Asset[]) => void;
  onCompile: (result: string) => void;
}

interface DurationVariationConfig {
  minDuration: number;
  maxDuration: number;
  pattern: 'random' | 'alternating' | 'increasing' | 'decreasing' | 'none';
  onlyImages: boolean;
}

interface TransitionConfig {
  type: 'fade' | 'slide' | 'zoom' | 'dissolve' | 'wipeLeft' | 'wipeRight' | 'pushUp' | 'pushDown' | 'none';
  duration: number;
  applyToAll: boolean;
}

interface AudioSyncConfig {
  enabled: boolean;
  adjustSpeed: boolean;
  addPadding: boolean;
}

export default function FFmpegEditor({ assets, onAssetsChange, onCompile }: Props) {
  const [isCompiling, setIsCompiling] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showVariationPanel, setShowVariationPanel] = useState(false);
  const [showTransitionPanel, setShowTransitionPanel] = useState(false);
  const [showAudioSyncPanel, setShowAudioSyncPanel] = useState(false);
  const [variationConfig, setVariationConfig] = useState<DurationVariationConfig>({
    minDuration: 10,
    maxDuration: 60,
    pattern: 'random',
    onlyImages: true,
  });
  const [transitionConfig, setTransitionConfig] = useState<TransitionConfig>({
    type: 'fade',
    duration: 0.5,
    applyToAll: true,
  });
  const [audioSyncConfig, setAudioSyncConfig] = useState<AudioSyncConfig>({
    enabled: true,
    adjustSpeed: false,
    addPadding: true,
  });

  const handleRemoveAsset = (id: string) => {
    onAssetsChange(assets.filter(a => a.id !== id));
    toast.success('Asset eliminado');
  };

  const handleDurationChange = (id: string, newDuration: number) => {
    onAssetsChange(
      assets.map(a =>
        a.id === id ? { ...a, duration: Math.max(0.5, newDuration) } : a
      )
    );
  };

  const handleReorder = (fromIndex: number, direction: 'up' | 'down') => {
    const toIndex = direction === 'up' ? fromIndex - 1 : fromIndex + 1;

    if (toIndex < 0 || toIndex >= assets.length) return;

    const newAssets = [...assets];
    [newAssets[fromIndex], newAssets[toIndex]] = [newAssets[toIndex], newAssets[fromIndex]];
    onAssetsChange(newAssets);
  };

  const handleDuplicateAsset = (asset: Asset) => {
    const newAsset = { ...asset, id: Math.random().toString() };
    onAssetsChange([...assets, newAsset]);
    toast.success('Asset duplicado');
  };

  const applyTransitions = () => {
    const updatedAssets = assets.map((asset, index) => {
      // No agregar transición al último asset
      if (index === assets.length - 1) {
        return asset;
      }

      if (transitionConfig.applyToAll) {
        return {
          ...asset,
          transition: transitionConfig.type,
          transitionDuration: transitionConfig.duration,
        };
      }

      return asset;
    });

    onAssetsChange(updatedAssets);
    toast.success(`✨ Transiciones aplicadas: ${transitionConfig.type}`);
    setShowTransitionPanel(false);
  };

  const syncWithAudio = () => {
    const audioAsset = assets.find(a => a.type === 'audio');

    if (!audioAsset) {
      toast.error('No hay audio en el timeline');
      return;
    }

    const totalAudioDuration = audioAsset.duration;
    const videoAssets = assets.filter(a => a.type === 'video');
    const imageAssets = assets.filter(a => a.type === 'image');

    if (imageAssets.length === 0 && videoAssets.length === 0) {
      toast.error('No hay imágenes o videos para sincronizar');
      return;
    }

    // Calcular duración total de videos (sin cambiar)
    const totalVideoDuration = videoAssets.reduce(
      (sum, v) => sum + (v.duration || 0),
      0
    );

    // Tiempo restante para imágenes
    const timeForImages = totalAudioDuration - totalVideoDuration;

    if (timeForImages <= 0) {
      toast.error(
        `Los videos (${totalVideoDuration.toFixed(1)}s) exceden la duración del audio (${totalAudioDuration.toFixed(1)}s)`
      );
      return;
    }

    if (imageAssets.length === 0) {
      toast.warning('No hay imágenes para distribuir, solo videos');
      onAssetsChange(assets);
      return;
    }

    // Duración promedio por imagen
    const durationPerImage = timeForImages / imageAssets.length;

    // Aplicar variación automática a las imágenes
    const updatedAssets = assets.map((asset, index) => {
      if (asset.type === 'audio' || asset.type === 'video') {
        return asset; // Audio y videos no cambian
      }

      if (asset.type === 'image') {
        // Aplicar variación aleatoria (±30% alrededor del promedio)
        const minDuration = durationPerImage * 0.7;
        const maxDuration = durationPerImage * 1.3;
        const randomDuration =
          minDuration + Math.random() * (maxDuration - minDuration);

        return {
          ...asset,
          duration: Math.round(randomDuration * 10) / 10,
        };
      }

      return asset;
    });

    onAssetsChange(updatedAssets);
    toast.success(
      `🎵 Sincronizado: Audio ${totalAudioDuration.toFixed(1)}s + Videos ${totalVideoDuration.toFixed(1)}s + Imágenes variadas`
    );
    setShowAudioSyncPanel(false);
  };

  const applyDurationVariation = () => {
    const updatedAssets = assets.map((asset, index) => {
      // Si está configurado para solo imágenes, saltar videos y audio
      if (variationConfig.onlyImages && asset.type !== 'image') {
        return asset;
      }

      let newDuration: number;

      switch (variationConfig.pattern) {
        case 'random':
          // Duración aleatoria entre min y max
          newDuration =
            Math.random() * (variationConfig.maxDuration - variationConfig.minDuration) +
            variationConfig.minDuration;
          break;

        case 'alternating':
          // Alternar entre min y max
          newDuration = index % 2 === 0 ? variationConfig.minDuration : variationConfig.maxDuration;
          break;

        case 'increasing':
          // Aumentar gradualmente
          const increaseStep =
            (variationConfig.maxDuration - variationConfig.minDuration) / Math.max(1, assets.length - 1);
          newDuration = variationConfig.minDuration + increaseStep * index;
          break;

        case 'decreasing':
          // Disminuir gradualmente
          const decreaseStep =
            (variationConfig.maxDuration - variationConfig.minDuration) / Math.max(1, assets.length - 1);
          newDuration = variationConfig.maxDuration - decreaseStep * index;
          break;

        case 'none':
        default:
          return asset;
      }

      return { ...asset, duration: Math.round(newDuration * 10) / 10 };
    });

    const imagesModified = updatedAssets.filter(a => a.type === 'image').length;
    onAssetsChange(updatedAssets);
    toast.success(
      `🖼️ ${imagesModified} imágenes variadas (${variationConfig.minDuration}s-${variationConfig.maxDuration}s, patrón: ${variationConfig.pattern})`
    );
    setShowVariationPanel(false);
  };

  const totalDuration = assets.reduce((sum, a) => sum + (a.duration || 0), 0);

  const handleCompile = async () => {
    if (assets.length === 0) {
      toast.error('Debes añadir al menos un asset');
      return;
    }

    setIsCompiling(true);

    try {
      const audioTracks = assets
        .filter(a => a.type === 'audio')
        .map(a => a.path);

      const response = await axios.post(
        `${API_URL}/api/compilation/compile`,
        {
          project: {
            id: Math.random().toString(),
            title: 'VidSpa Video',
            assets: assets.map(a => ({
              id: a.id,
              type: a.type,
              path: a.path,
              duration: a.duration,
              source: a.source,
              transition: a.transition,
              transitionDuration: a.transitionDuration,
            })),
            audioTracks,
            fps: 30,
            width: 1920,
            height: 1080,
            outputPath: './outputs/video.mp4',
          },
          options: {
            resolution: '1080p',
            fps: 30,
            bitrate: '5000k',
          },
        }
      );

      toast.success('Compilación iniciada');
      onCompile(response.data.outputPath || response.data.projectId);
    } catch (error) {
      toast.error('Error al compilar');
      console.error(error);
    } finally {
      setIsCompiling(false);
    }
  };

  const getIcon = (type: string) => {
    switch (type) {
      case 'video':
        return '🎬';
      case 'image':
        return '🖼️';
      case 'audio':
        return '🎵';
      default:
        return '📄';
    }
  };

  return (
    <div className="space-y-6">
      {/* Timeline Preview */}
      <div className="bg-gray-50 dark:bg-zinc-950 border border-gray-200 dark:border-zinc-800 rounded-lg p-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-gray-900 dark:text-zinc-100 font-medium">Timeline</h3>
          <div className="text-sm text-gray-500 dark:text-zinc-400">
            {assets.length} assets • <span className="text-accent-600 dark:text-accent-400 font-medium">{totalDuration.toFixed(1)}s</span>
          </div>
        </div>

        {/* Timeline Bar */}
        {assets.length > 0 && (
          <div className="bg-gray-100 dark:bg-zinc-900 rounded-lg p-3 mb-4">
            <div className="flex h-12 gap-1 rounded-lg overflow-hidden">
              {assets.map((asset) => {
                const percentage = (asset.duration / totalDuration) * 100;
                return (
                  <div
                    key={asset.id}
                    className="bg-accent-600 opacity-80 hover:opacity-100 transition flex items-center justify-center text-xs text-white font-bold rounded-sm group relative"
                    style={{ width: `${percentage}%`, minWidth: '20px' }}
                    title={`${asset.name} - ${asset.duration.toFixed(1)}s`}
                  >
                    {percentage > 10 && <span className="text-xs">{getIcon(asset.type)}</span>}
                  </div>
                );
              })}
            </div>
            <div className="text-xs text-gray-400 dark:text-zinc-600 mt-2">Duración total: {totalDuration.toFixed(2)}s</div>
          </div>
        )}

        {assets.length === 0 && (
          <div className="text-center py-8 text-gray-400 dark:text-zinc-600">
            No hay assets en el editor. Sube archivos o genera assets.
          </div>
        )}
      </div>

      {/* Assets List */}
      {assets.length > 0 && (
        <div className="space-y-3">
          {assets.map((asset, index) => (
            <div
              key={asset.id}
              className="bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-lg p-4 hover:border-accent-400 dark:hover:border-accent-600 transition"
            >
              <div className="flex items-center gap-4">
                {/* Drag Handle */}
                <GripVertical size={18} className="text-gray-400 dark:text-zinc-600 cursor-grab active:cursor-grabbing" />

                {/* Asset Icon */}
                <span className="text-2xl">{getIcon(asset.type)}</span>

                {/* Asset Info */}
                <div className="flex-1 min-w-0">
                  <p className="text-gray-900 dark:text-zinc-100 font-medium truncate">{asset.name}</p>
                  <p className="text-xs text-gray-500 dark:text-zinc-400">
                    {asset.type} • {asset.source === 'generated' ? '🤖 Generado' : '📤 Subido'}
                  </p>
                </div>

                {/* Duration Input */}
                <div className="flex items-center gap-2">
                  <label className="text-xs text-gray-500 dark:text-zinc-400">Duración (s):</label>
                  <input
                    type="number"
                    min="0.5"
                    step="0.5"
                    value={asset.duration}
                    onChange={(e) => handleDurationChange(asset.id, parseFloat(e.target.value) || 0.5)}
                    className="w-16 bg-gray-50 dark:bg-zinc-950 border border-gray-200 dark:border-zinc-800 rounded-lg px-2 py-1 text-gray-900 dark:text-zinc-100 text-sm text-center"
                  />
                </div>

                {/* Reorder Buttons */}
                <div className="flex gap-1">
                  <button
                    onClick={() => handleReorder(index, 'up')}
                    disabled={index === 0}
                    className="p-1 text-gray-500 dark:text-zinc-400 hover:bg-gray-100 dark:hover:bg-zinc-800 rounded-lg disabled:opacity-30 disabled:cursor-not-allowed transition"
                    title="Mover arriba"
                  >
                    ↑
                  </button>
                  <button
                    onClick={() => handleReorder(index, 'down')}
                    disabled={index === assets.length - 1}
                    className="p-1 text-gray-500 dark:text-zinc-400 hover:bg-gray-100 dark:hover:bg-zinc-800 rounded-lg disabled:opacity-30 disabled:cursor-not-allowed transition"
                    title="Mover abajo"
                  >
                    ↓
                  </button>
                </div>

                {/* Actions */}
                <button
                  onClick={() => handleDuplicateAsset(asset)}
                  className="p-2 text-gray-500 dark:text-zinc-400 hover:text-accent-500 dark:hover:text-accent-400 hover:bg-gray-100 dark:hover:bg-zinc-800 rounded-lg transition"
                  title="Duplicar"
                >
                  <Copy size={18} />
                </button>

                <button
                  onClick={() => handleRemoveAsset(asset.id)}
                  className="p-2 text-gray-500 dark:text-zinc-400 hover:text-red-500 dark:hover:text-red-400 hover:bg-gray-100 dark:hover:bg-zinc-800 rounded-lg transition"
                  title="Eliminar"
                >
                  <Trash2 size={18} />
                </button>
              </div>

              {/* Expandable Details */}
              <button
                onClick={() => setExpandedId(expandedId === asset.id ? null : asset.id)}
                className="mt-2 flex items-center gap-2 text-xs text-gray-500 dark:text-zinc-400 hover:text-gray-700 dark:hover:text-zinc-300 transition"
              >
                <ChevronDown
                  size={14}
                  className={`transition ${expandedId === asset.id ? 'rotate-180' : ''}`}
                />
                Detalles
              </button>

              {expandedId === asset.id && (
                <div className="mt-3 pt-3 border-t border-gray-100 dark:border-zinc-800 text-xs text-gray-500 dark:text-zinc-400 space-y-1">
                  <p>📁 Ruta: <span className="text-gray-400 dark:text-zinc-600">{asset.path}</span></p>
                  <p>⏱️ Duración: {asset.duration.toFixed(2)}s</p>
                  <p>📊 Tipo: {asset.type}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Duration Variation Panel */}
      {assets.length > 0 && (
        <div className="bg-gray-50 dark:bg-zinc-950 border border-gray-200 dark:border-zinc-800 rounded-lg p-4">
          <button
            onClick={() => setShowVariationPanel(!showVariationPanel)}
            className="w-full flex items-center justify-between text-gray-900 dark:text-zinc-100 font-medium mb-3 hover:text-accent-600 dark:hover:text-accent-400 transition"
          >
            <span>🎲 Variación de Duraciones</span>
            <ChevronDown
              size={16}
              className={`transition ${showVariationPanel ? 'rotate-180' : ''}`}
            />
          </button>

          {showVariationPanel && (
            <div className="space-y-4 pt-3 border-t border-gray-200 dark:border-zinc-800">
              <p className="text-xs text-gray-500 dark:text-zinc-400">
                🖼️ Varía la duración de TODAS las imágenes: cada una durará entre {variationConfig.minDuration}s y {variationConfig.maxDuration}s
              </p>

              {/* Min Duration */}
              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-zinc-400 mb-2">
                  Duración Mínima: {variationConfig.minDuration}s
                </label>
                <input
                  type="range"
                  min="10"
                  max={variationConfig.maxDuration - 1}
                  step="1"
                  value={variationConfig.minDuration}
                  onChange={(e) =>
                    setVariationConfig({
                      ...variationConfig,
                      minDuration: parseFloat(e.target.value),
                    })
                  }
                  className="input-range"
                />
              </div>

              {/* Max Duration */}
              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-zinc-400 mb-2">
                  Duración Máxima: {variationConfig.maxDuration}s
                </label>
                <input
                  type="range"
                  min={variationConfig.minDuration + 1}
                  max="60"
                  step="1"
                  value={variationConfig.maxDuration}
                  onChange={(e) =>
                    setVariationConfig({
                      ...variationConfig,
                      maxDuration: parseFloat(e.target.value),
                    })
                  }
                  className="input-range"
                />
              </div>

              {/* Pattern Selection */}
              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-zinc-400 mb-2">Patrón de Variación</label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { value: 'random', label: '🎲 Aleatorio', desc: 'Duraciones al azar' },
                    { value: 'alternating', label: '⚡ Alternado', desc: 'Min-Max-Min-Max' },
                    { value: 'increasing', label: '📈 Creciente', desc: 'Aumenta gradualmente' },
                    { value: 'decreasing', label: '📉 Decreciente', desc: 'Disminuye gradualmente' },
                  ].map((pattern) => (
                    <button
                      key={pattern.value}
                      onClick={() =>
                        setVariationConfig({
                          ...variationConfig,
                          pattern: pattern.value as any,
                        })
                      }
                      className={`p-2 rounded-lg text-xs font-medium transition ${
                        variationConfig.pattern === pattern.value
                          ? 'bg-accent-600 text-white'
                          : 'bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 text-gray-500 dark:text-zinc-400 hover:bg-gray-100 dark:hover:bg-zinc-800'
                      }`}
                    >
                      <div>{pattern.label}</div>
                      <div className="text-[10px] opacity-75">{pattern.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Only Images Toggle */}
              <label className="flex items-center gap-2 text-xs text-gray-500 dark:text-zinc-400 cursor-pointer">
                <input
                  type="checkbox"
                  checked={variationConfig.onlyImages}
                  onChange={(e) =>
                    setVariationConfig({
                      ...variationConfig,
                      onlyImages: e.target.checked,
                    })
                  }
                  className="w-4 h-4 rounded accent-accent-500"
                />
                <span>Solo aplicar a imágenes</span>
              </label>

              {/* Apply Button */}
              <button
                onClick={applyDurationVariation}
                className="btn-primary w-full text-base"
              >
                🎬 Variar Duración de Imágenes ({variationConfig.minDuration}s - {variationConfig.maxDuration}s)
              </button>
            </div>
          )}
        </div>
      )}

      {/* Transition Effects Panel */}
      {assets.length > 1 && (
        <div className="bg-gray-50 dark:bg-zinc-950 border border-gray-200 dark:border-zinc-800 rounded-lg p-4">
          <button
            onClick={() => setShowTransitionPanel(!showTransitionPanel)}
            className="w-full flex items-center justify-between text-gray-900 dark:text-zinc-100 font-medium mb-3 hover:text-accent-600 dark:hover:text-accent-400 transition"
          >
            <span>✨ Efectos de Transición</span>
            <ChevronDown
              size={16}
              className={`transition ${showTransitionPanel ? 'rotate-180' : ''}`}
            />
          </button>

          {showTransitionPanel && (
            <div className="space-y-4 pt-3 border-t border-gray-200 dark:border-zinc-800">
              <p className="text-xs text-gray-500 dark:text-zinc-400">
                🎬 Agrega transiciones suaves entre imágenes y videos
              </p>

              {/* Transition Type */}
              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-zinc-400 mb-2">
                  Tipo de Transición
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { value: 'fade', label: '🌫️ Fade', desc: 'Desvanecimiento' },
                    { value: 'slide', label: '→ Slide', desc: 'Deslizamiento' },
                    { value: 'zoom', label: '🔍 Zoom', desc: 'Zoom in/out' },
                    { value: 'dissolve', label: '💫 Dissolve', desc: 'Disolución' },
                    { value: 'wipeLeft', label: '↪ Wipe L', desc: 'Barrido izq' },
                    { value: 'wipeRight', label: '↩ Wipe R', desc: 'Barrido der' },
                    { value: 'pushUp', label: '⬆ Push U', desc: 'Empuje arriba' },
                    { value: 'pushDown', label: '⬇ Push D', desc: 'Empuje abajo' },
                  ].map((trans) => (
                    <button
                      key={trans.value}
                      onClick={() =>
                        setTransitionConfig({
                          ...transitionConfig,
                          type: trans.value as any,
                        })
                      }
                      className={`p-2 rounded-lg text-xs font-medium transition ${
                        transitionConfig.type === trans.value
                          ? 'bg-accent-600 text-white'
                          : 'bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 text-gray-500 dark:text-zinc-400 hover:bg-gray-100 dark:hover:bg-zinc-800'
                      }`}
                    >
                      <div>{trans.label}</div>
                      <div className="text-[10px] opacity-75">{trans.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Transition Duration */}
              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-zinc-400 mb-2">
                  Duración: {transitionConfig.duration.toFixed(1)}s
                </label>
                <input
                  type="range"
                  min="0.1"
                  max="2"
                  step="0.1"
                  value={transitionConfig.duration}
                  onChange={(e) =>
                    setTransitionConfig({
                      ...transitionConfig,
                      duration: parseFloat(e.target.value),
                    })
                  }
                  className="input-range"
                />
              </div>

              {/* Apply to All */}
              <label className="flex items-center gap-2 text-xs text-gray-500 dark:text-zinc-400 cursor-pointer">
                <input
                  type="checkbox"
                  checked={transitionConfig.applyToAll}
                  onChange={(e) =>
                    setTransitionConfig({
                      ...transitionConfig,
                      applyToAll: e.target.checked,
                    })
                  }
                  className="w-4 h-4 rounded accent-accent-500"
                />
                <span>Aplicar a todos los assets</span>
              </label>

              {/* Apply Button */}
              <button
                onClick={applyTransitions}
                className="btn-primary w-full py-2 text-sm"
              >
                ✨ Aplicar Transiciones
              </button>
            </div>
          )}
        </div>
      )}

      {/* Audio Sync Panel */}
      {assets.some(a => a.type === 'audio') && (
        <div className="bg-gray-50 dark:bg-zinc-950 border border-gray-200 dark:border-zinc-800 rounded-lg p-4">
          <button
            onClick={() => setShowAudioSyncPanel(!showAudioSyncPanel)}
            className="w-full flex items-center justify-between text-gray-900 dark:text-zinc-100 font-medium mb-3 hover:text-accent-600 dark:hover:text-accent-400 transition"
          >
            <span>🎵 Sincronizar con Audio</span>
            <ChevronDown
              size={16}
              className={`transition ${showAudioSyncPanel ? 'rotate-180' : ''}`}
            />
          </button>

          {showAudioSyncPanel && (
            <div className="space-y-4 pt-3 border-t border-gray-200 dark:border-zinc-800">
              <p className="text-xs text-gray-500 dark:text-zinc-400">
                🎬 Ajusta automáticamente las duraciones de imágenes/videos para que coincidan con el audio
              </p>

              {/* Audio Info */}
              {assets.find(a => a.type === 'audio') && (
                <div className="bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 p-3 rounded-lg text-xs text-gray-500 dark:text-zinc-400 space-y-1">
                  <p>
                    🎵 Audio detectado:{' '}
                    <span className="font-medium text-gray-900 dark:text-zinc-100">
                      {assets.find(a => a.type === 'audio')?.duration.toFixed(1)}s
                    </span>
                  </p>
                  <p>
                    🖼️ Imágenes/Videos:{' '}
                    <span className="font-medium text-gray-900 dark:text-zinc-100">
                      {assets.filter(a => a.type !== 'audio').length} assets
                    </span>
                  </p>
                </div>
              )}

              {/* Adjust Speed Option */}
              <label className="flex items-center gap-2 text-xs text-gray-500 dark:text-zinc-400 cursor-pointer">
                <input
                  type="checkbox"
                  checked={audioSyncConfig.adjustSpeed}
                  onChange={(e) =>
                    setAudioSyncConfig({
                      ...audioSyncConfig,
                      adjustSpeed: e.target.checked,
                    })
                  }
                  className="w-4 h-4 rounded accent-accent-500"
                />
                <span>Ajustar velocidad (si la duración es muy diferente)</span>
              </label>

              {/* Add Padding for Transitions */}
              <label className="flex items-center gap-2 text-xs text-gray-500 dark:text-zinc-400 cursor-pointer">
                <input
                  type="checkbox"
                  checked={audioSyncConfig.addPadding}
                  onChange={(e) =>
                    setAudioSyncConfig({
                      ...audioSyncConfig,
                      addPadding: e.target.checked,
                    })
                  }
                  className="w-4 h-4 rounded accent-accent-500"
                />
                <span>Calcular espacio para transiciones</span>
              </label>

              {/* Sync Button */}
              <button
                onClick={syncWithAudio}
                className="btn-primary w-full py-2 text-sm flex items-center justify-center gap-2"
              >
                <Music size={16} />
                🎵 Sincronizar Ahora
              </button>

              <p className="text-xs text-gray-400 dark:text-zinc-600 italic">
                ℹ️ Las duraciones se ajustarán para que todo el contenido visual encaje perfectamente con el audio
              </p>
            </div>
          )}
        </div>
      )}

      {/* Compile Button */}
      <button
        onClick={handleCompile}
        disabled={assets.length === 0 || isCompiling}
        className="btn-primary w-full flex items-center justify-center gap-2"
      >
        {isCompiling ? (
          <>
            <Loader className="animate-spin" size={20} />
            Compilando...
          </>
        ) : (
          <>
            <Play size={20} />
            Compilar Video Final
          </>
        )}
      </button>

      {/* Info Box */}
      <div className="bg-blue-50 dark:bg-blue-950/30 border-l-2 border-blue-400 dark:border-blue-500 rounded-lg p-3 text-xs text-blue-700 dark:text-blue-300">
        💡 Puedes reordenar, duplicar o eliminar assets. Ajusta la duración de cada uno para que se adapte a tu timeline.
      </div>
    </div>
  );
}
