import { useState } from 'react';
import { Film, Play, Download, Trash2, Loader, Settings } from 'lucide-react';
import toast from 'react-hot-toast';
import axios from 'axios';

interface TimelineAsset {
  id: string;
  type: 'image' | 'video' | 'audio';
  path: string;
  duration: number;
  title: string;
}

interface CompilationSettings {
  resolution: '720p' | '1080p' | '2k' | '4k';
  fps: number;
  bitrate: string;
  effects: 'none' | 'basic' | 'advanced';
}

export default function VideoEditor() {
  const [assets, setAssets] = useState<TimelineAsset[]>([]);
  const [isCompiling, setIsCompiling] = useState(false);
  const [compiledVideo, setCompiledVideo] = useState<string | null>(null);
  const [settings, setSettings] = useState<CompilationSettings>({
    resolution: '1080p',
    fps: 30,
    bitrate: '5000k',
    effects: 'basic',
  });
  const [showSettings, setShowSettings] = useState(false);

  const totalDuration = assets.reduce((sum, asset) => sum + (asset.duration || 0), 0);

  const handleAddAsset = (asset: TimelineAsset) => {
    setAssets([...assets, { ...asset, id: Math.random().toString() }]);
    toast.success(`${asset.type} añadido a la línea de tiempo`);
  };

  const handleRemoveAsset = (id: string) => {
    setAssets(assets.filter(a => a.id !== id));
    toast.success('Asset eliminado');
  };

  const handleReorderAssets = (fromIndex: number, toIndex: number) => {
    const newAssets = [...assets];
    const [removed] = newAssets.splice(fromIndex, 1);
    newAssets.splice(toIndex, 0, removed);
    setAssets(newAssets);
  };

  const handleDurationChange = (id: string, newDuration: number) => {
    setAssets(
      assets.map(a =>
        a.id === id ? { ...a, duration: Math.max(1, newDuration) } : a
      )
    );
  };

  const handleCompileVideo = async () => {
    if (assets.length === 0) {
      toast.error('Agrega al menos un asset a la línea de tiempo');
      return;
    }

    setIsCompiling(true);
    try {
      const imagePaths = assets
        .filter(a => a.type === 'image')
        .map(a => a.path);
      const audioPath = assets.find(a => a.type === 'audio')?.path || null;

      const response = await axios.post('/api/compilation/from-images', {
        imagePaths,
        audioPath,
        options: settings,
      });

      setCompiledVideo(response.data.video.path);
      toast.success('✨ Video compilado exitosamente');
    } catch (error) {
      toast.error('Error al compilar video');
      console.error(error);
    } finally {
      setIsCompiling(false);
    }
  };

  const handleDownloadVideo = () => {
    if (!compiledVideo) return;

    const link = document.createElement('a');
    link.href = compiledVideo;
    link.download = 'video-compilado.mp4';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success('Descargando video...');
  };

  return (
    <div className="space-y-6">
      {/* Settings Panel */}
      <div className="card-lg">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-gradient-to-r from-green-500 to-emerald-500 rounded-lg">
              <Film className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-2xl font-bold">Editor de Video</h2>
              <p className="text-gray-400 text-sm">Ordena y compila tu video final</p>
            </div>
          </div>
          <button
            onClick={() => setShowSettings(!showSettings)}
            className="p-3 hover:bg-white/10 rounded-lg transition-colors"
          >
            <Settings className="w-6 h-6" />
          </button>
        </div>

        {showSettings && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6 p-4 bg-gray-900/50 rounded-lg border border-white/10">
            <div>
              <label className="block text-sm font-semibold mb-2">Resolución</label>
              <select
                value={settings.resolution}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    resolution: e.target.value as any,
                  })
                }
                className="w-full px-3 py-2 bg-gray-900 border border-white/10 rounded-lg text-white focus:border-green-500/50 focus:outline-none"
              >
                <option value="720p">720p</option>
                <option value="1080p">1080p (Recomendado)</option>
                <option value="2k">2K</option>
                <option value="4k">4K</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-semibold mb-2">FPS</label>
              <input
                type="number"
                min="24"
                max="60"
                value={settings.fps}
                onChange={(e) =>
                  setSettings({ ...settings, fps: parseInt(e.target.value) })
                }
                className="w-full px-3 py-2 bg-gray-900 border border-white/10 rounded-lg text-white focus:border-green-500/50 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold mb-2">Bitrate</label>
              <select
                value={settings.bitrate}
                onChange={(e) => setSettings({ ...settings, bitrate: e.target.value })}
                className="w-full px-3 py-2 bg-gray-900 border border-white/10 rounded-lg text-white focus:border-green-500/50 focus:outline-none"
              >
                <option value="3000k">3000k (Bajo)</option>
                <option value="5000k">5000k (Medio)</option>
                <option value="8000k">8000k (Alto)</option>
                <option value="12000k">12000k (Premium)</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-semibold mb-2">Efectos</label>
              <select
                value={settings.effects}
                onChange={(e) => setSettings({ ...settings, effects: e.target.value as any })}
                className="w-full px-3 py-2 bg-gray-900 border border-white/10 rounded-lg text-white focus:border-green-500/50 focus:outline-none"
              >
                <option value="none">Sin efectos</option>
                <option value="basic">Básicos</option>
                <option value="advanced">Avanzados</option>
              </select>
            </div>
          </div>
        )}

        <button
          onClick={handleCompileVideo}
          disabled={isCompiling || assets.length === 0}
          className="btn-primary w-full flex items-center justify-center gap-2 mb-4"
        >
          {isCompiling && <Loader className="w-5 h-5 animate-spin" />}
          {isCompiling ? 'Compilando...' : '🎬 Compilar Video'}
        </button>
      </div>

      {/* Timeline */}
      <div className="card-lg">
        <h3 className="text-lg font-semibold mb-4">📹 Línea de Tiempo</h3>

        {assets.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            <Film className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p>Agrega imágenes, videos y audio desde las otras pestañas</p>
          </div>
        ) : (
          <>
            <div className="space-y-3 mb-6 max-h-96 overflow-y-auto">
              {assets.map((asset, idx) => (
                <div
                  key={asset.id}
                  className="flex items-center gap-4 p-4 bg-gray-900/50 rounded-lg border border-white/10 hover:border-green-500/30"
                  draggable
                  onDragOver={(e) => e.preventDefault()}
                >
                  {/* Index */}
                  <div className="w-8 h-8 rounded-full bg-gradient-to-r from-green-500 to-emerald-500 flex items-center justify-center font-bold text-sm">
                    {idx + 1}
                  </div>

                  {/* Info */}
                  <div className="flex-1">
                    <p className="font-semibold text-sm">{asset.title}</p>
                    <p className="text-xs text-gray-400">
                      {asset.type.toUpperCase()} • {asset.duration.toFixed(1)}s
                    </p>
                  </div>

                  {/* Duration Editor */}
                  {asset.type !== 'audio' && (
                    <div className="flex items-center gap-2">
                      <label className="text-xs text-gray-400">Duración:</label>
                      <input
                        type="number"
                        min="1"
                        max="30"
                        step="0.5"
                        value={asset.duration}
                        onChange={(e) =>
                          handleDurationChange(asset.id, parseFloat(e.target.value))
                        }
                        className="w-16 px-2 py-1 bg-gray-800 border border-white/10 rounded text-sm text-white"
                      />
                      <span className="text-xs text-gray-400">s</span>
                    </div>
                  )}

                  {/* Remove */}
                  <button
                    onClick={() => handleRemoveAsset(asset.id)}
                    className="p-2 hover:bg-red-900/20 hover:border-red-600 rounded transition-colors"
                  >
                    <Trash2 className="w-4 h-4 text-gray-400" />
                  </button>
                </div>
              ))}
            </div>

            {/* Timeline Info */}
            <div className="flex items-center justify-between p-4 bg-green-950/30 border border-green-500/20 rounded-lg">
              <div>
                <p className="text-sm font-semibold text-green-300">
                  Duración total: {totalDuration.toFixed(1)}s
                </p>
                <p className="text-xs text-gray-400">
                  {assets.length} assets • {assets.filter(a => a.type === 'image').length} imágenes •{' '}
                  {assets.filter(a => a.type === 'video').length} videos •{' '}
                  {assets.filter(a => a.type === 'audio').length} audios
                </p>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Compiled Video Preview */}
      {compiledVideo && (
        <div className="card-lg">
          <h3 className="text-lg font-semibold mb-4">✨ Video Compilado</h3>

          <div className="bg-black rounded-lg overflow-hidden mb-4">
            <video
              src={compiledVideo}
              controls
              className="w-full max-h-96"
              poster="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='300'%3E%3Crect fill='%23111'/%3E%3Ctext x='50%' y='50%' text-anchor='middle' fill='%23999'%3EPreview%3C/text%3E%3C/svg%3E"
            />
          </div>

          <div className="flex gap-3">
            <button
              onClick={() => window.open(compiledVideo, '_blank')}
              className="flex-1 btn-secondary py-3 flex items-center justify-center gap-2"
            >
              <Play className="w-5 h-5" />
              Reproducir
            </button>
            <button
              onClick={handleDownloadVideo}
              className="flex-1 btn-primary py-3 flex items-center justify-center gap-2"
            >
              <Download className="w-5 h-5" />
              Descargar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
