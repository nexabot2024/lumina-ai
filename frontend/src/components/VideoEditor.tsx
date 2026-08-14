import { useState } from 'react';
import { Film, Play, Download, Trash2, Loader, Settings, Sparkles, Sliders, Zap, Activity } from 'lucide-react';
import toast from 'react-hot-toast';
import axios from 'axios';
import AssetConfigModal from './AssetConfigModal';
import FileUploader from './FileUploader';
import FFmpegEditor from './FFmpegEditor';
import CompilationMonitor from './CompilationMonitor';
import { useLocalStorageState } from '../hooks/useLocalStorageState';

interface TimelineAsset {
  id: string;
  type: 'image' | 'video' | 'audio';
  path: string;
  duration: number;
  title: string;
  source?: 'stock' | 'ia';
}

interface CompilationSettings {
  resolution: '720p' | '1080p' | '2k' | '4k';
  fps: number;
  bitrate: string;
  effects: 'none' | 'basic' | 'advanced';
}

interface AutomationSettings {
  stockPercentage: number;
  transitionType: 'fade' | 'slide' | 'dissolve' | 'wipeLeft' | 'wipeRight' | 'random';
  transitionDuration: number;
  animationType: 'zoom' | 'pan' | 'rotate' | 'bounce' | 'slideIn' | 'random';
  animationDuration: number;
  videoDuration: number;
  useAutomation: boolean;
}

interface StructureSettings {
  useStructure: boolean;
  theme: string;
  totalDuration: number;
  aiVideoDurationMins: number;
  iaImagePercentage: number;
  stockVideoPercentage: number;
}

interface UploadedFile {
  id: string;
  name: string;
  type: 'video' | 'image' | 'audio';
  size: number;
  duration?: number;
  path: string;
  source: 'upload' | 'generated';
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
  const [automationSettings, setAutomationSettings] = useState<AutomationSettings>({
    stockPercentage: 80,
    transitionType: 'random',
    transitionDuration: 500,
    animationType: 'random',
    animationDuration: 1000,
    videoDuration: 60,
    useAutomation: false,
  });
  const [showSettings, setShowSettings] = useState(false);
  const [showAutomation, setShowAutomation] = useState(false);
  const [structureSettings, setStructureSettings] = useState<StructureSettings>({
    useStructure: true,
    theme: 'cinematic',
    totalDuration: 300, // 5 minutos
    aiVideoDurationMins: 5,
    iaImagePercentage: 40,
    stockVideoPercentage: 60,
  });
  const [videoPlan, setVideoPlan] = useState<any>(null);
  const [showAssetConfig, setShowAssetConfig] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [showFFmpegEditor, setShowFFmpegEditor] = useState(false);
  const [showCompilationMonitor, setShowCompilationMonitor] = useLocalStorageState('lumina-job-videoEditor-monitorOpen', false);
  const [currentProjectId, setCurrentProjectId] = useLocalStorageState('lumina-job-videoEditor', '');

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

  const handleGenerateStructurePlan = async () => {
    if (!structureSettings.theme.trim()) {
      toast.error('Escribe una temática para el video');
      return;
    }

    try {
      const response = await axios.post('/api/compilation/structure-plan', {
        ...structureSettings,
      });

      setVideoPlan(response.data.plan);
      toast.success(`📋 Plan generado: ${response.data.plan.totalAssets} assets necesarios`);
    } catch (error) {
      toast.error('Error al generar plan de estructura');
      console.error(error);
    }
  };

  const handleCompileVideo = async () => {
    if (assets.length === 0) {
      toast.error('Agrega al menos un asset a la línea de tiempo');
      return;
    }

    const projectId = `project-${Date.now()}`;
    setCurrentProjectId(projectId);
    setShowCompilationMonitor(true);
    setIsCompiling(true);

    try {
      if (automationSettings.useAutomation) {
        // Compilación automática con porcentajes y efectos
        const stockAssets = assets.filter(a => a.source === 'stock').map(a => a.path);
        const iaAssets = assets.filter(a => a.source === 'ia').map(a => a.path);
        const audioPath = assets.find(a => a.type === 'audio')?.path || null;

        if (stockAssets.length === 0 && iaAssets.length === 0) {
          toast.error('Agrega assets de stock o IA para usar la automatización');
          setIsCompiling(false);
          return;
        }

        const response = await axios.post('/api/compilation/automated', {
          projectId,
          stockAssets,
          iaAssets,
          audioPath,
          config: {
            ...automationSettings,
            fps: settings.fps,
          },
        });

        toast.success(`✨ Video automático creado con ${response.data.summary.transitionCount} transiciones`);
        setCompiledVideo(`/api/compilation/render?timelineId=${response.data.timeline.id}`);
      } else {
        // Compilación manual tradicional
        const imagePaths = assets
          .filter(a => a.type === 'image')
          .map(a => a.path);
        const audioPath = assets.find(a => a.type === 'audio')?.path || null;

        const response = await axios.post('/api/compilation/from-images', {
          projectId,
          imagePaths,
          audioPath,
          options: settings,
        });

        setCompiledVideo(response.data.video.path);
        toast.success('✨ Video compilado exitosamente');
      }
    } catch (error: any) {
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

  const handleAssetConfig = (config: { stockVideos: number; iaVideos: number; iaImages: number }) => {
    toast.success(
      `Configuración guardada: ${config.stockVideos} stock + ${config.iaVideos} IA videos + ${config.iaImages} IA imágenes`
    );
    setShowFFmpegEditor(true);
  };

  const handleFilesAdded = (files: UploadedFile[]) => {
    setUploadedFiles([...uploadedFiles, ...files]);
    // Convert uploaded files to assets for FFmpeg editor
    const newAssets: TimelineAsset[] = files.map(f => {
      // Use real detected duration
      let duration = f.duration || 0;

      // For images, use a default if not detected
      if (f.type === 'image' && (!duration || duration <= 0)) {
        duration = 5; // Default 5s for images (user can vary with button)
      }

      // Videos and audios: use real duration (no limit, can be 0 if not detected)
      // Don't assign defaults - let them keep their real duration

      return {
        id: f.id,
        type: f.type,
        path: f.path,
        duration,
        title: f.name,
        source: f.source as 'stock' | 'ia',
      };
    });
    setAssets([...assets, ...newAssets]);
  };

  const handleCompileFromEditor = (result: string) => {
    setCompiledVideo(result);
  };

  return (
    <div className="space-y-6">
      {/* Settings Panel */}
      <div className="card-lg">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-accent-600 rounded-lg">
              <Film className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-gray-900 dark:text-zinc-100 text-sm font-medium">Editor de Video</h2>
              <p className="text-gray-400 dark:text-zinc-500 text-[10px]">Ordena y compila tu video final</p>
            </div>
          </div>
          <button
            onClick={() => setShowSettings(!showSettings)}
            className="p-3 hover:bg-gray-100 dark:hover:bg-zinc-800 rounded-lg transition-colors text-gray-500 dark:text-zinc-400"
          >
            <Settings className="w-5 h-5" />
          </button>
        </div>

        {showSettings && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6 p-4 bg-gray-50 dark:bg-zinc-950 rounded-lg border border-gray-200 dark:border-zinc-800">
            <div>
              <label className="block text-gray-500 dark:text-zinc-400 text-xs font-medium mb-2">Resolución</label>
              <select
                value={settings.resolution}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    resolution: e.target.value as any,
                  })
                }
                className="w-full px-3 py-2 bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 text-gray-700 dark:text-zinc-300 rounded-lg focus:border-accent-500 dark:focus:border-accent-600 focus:outline-none"
              >
                <option value="720p">720p</option>
                <option value="1080p">1080p (Recomendado)</option>
                <option value="2k">2K</option>
                <option value="4k">4K</option>
              </select>
            </div>

            <div>
              <label className="block text-gray-500 dark:text-zinc-400 text-xs font-medium mb-2">FPS</label>
              <input
                type="number"
                min="24"
                max="60"
                value={settings.fps}
                onChange={(e) =>
                  setSettings({ ...settings, fps: parseInt(e.target.value) })
                }
                className="w-full px-3 py-2 bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 text-gray-900 dark:text-zinc-100 rounded-lg focus:border-accent-500 dark:focus:border-accent-600 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-gray-500 dark:text-zinc-400 text-xs font-medium mb-2">Bitrate</label>
              <select
                value={settings.bitrate}
                onChange={(e) => setSettings({ ...settings, bitrate: e.target.value })}
                className="w-full px-3 py-2 bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 text-gray-700 dark:text-zinc-300 rounded-lg focus:border-accent-500 dark:focus:border-accent-600 focus:outline-none"
              >
                <option value="3000k">3000k (Bajo)</option>
                <option value="5000k">5000k (Medio)</option>
                <option value="8000k">8000k (Alto)</option>
                <option value="12000k">12000k (Premium)</option>
              </select>
            </div>

            <div>
              <label className="block text-gray-500 dark:text-zinc-400 text-xs font-medium mb-2">Efectos</label>
              <select
                value={settings.effects}
                onChange={(e) => setSettings({ ...settings, effects: e.target.value as any })}
                className="w-full px-3 py-2 bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 text-gray-700 dark:text-zinc-300 rounded-lg focus:border-accent-500 dark:focus:border-accent-600 focus:outline-none"
              >
                <option value="none">Sin efectos</option>
                <option value="basic">Básicos</option>
                <option value="advanced">Avanzados</option>
              </select>
            </div>
          </div>
        )}

        {/* Automation Settings */}
        <div className="mb-4 p-4 bg-gray-50 dark:bg-zinc-950 rounded-lg border border-gray-200 dark:border-zinc-800">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-accent-600 dark:text-accent-400" />
              <label className="text-gray-900 dark:text-zinc-100 text-sm font-medium">⚡ Automatización Inteligente</label>
            </div>
            <div
              role="switch"
              aria-checked={automationSettings.useAutomation}
              onClick={() =>
                setAutomationSettings({
                  ...automationSettings,
                  useAutomation: !automationSettings.useAutomation,
                })
              }
              className={`w-8 h-4 rounded-full transition-colors relative cursor-pointer ${automationSettings.useAutomation ? 'bg-accent-600' : 'bg-gray-200 dark:bg-zinc-700'}`}
            >
              <div className={`w-3 h-3 rounded-full bg-white absolute top-0.5 transition-all ${automationSettings.useAutomation ? 'right-0.5' : 'left-0.5'}`} />
            </div>
          </div>

          {automationSettings.useAutomation && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-gray-500 dark:text-zinc-400 text-xs font-medium mb-2">📊 Stock vs IA</label>
                <input
                  type="range"
                  min="0"
                  max="100"
                  step="5"
                  value={automationSettings.stockPercentage}
                  onChange={(e) =>
                    setAutomationSettings({
                      ...automationSettings,
                      stockPercentage: parseInt(e.target.value),
                    })
                  }
                  className="input-range mb-2"
                />
                <div className="w-full h-5 rounded-full overflow-hidden flex bg-gray-100 dark:bg-zinc-800 border border-gray-200 dark:border-zinc-800">
                  <div
                    className="h-full bg-gray-300 dark:bg-zinc-600 transition-[width] duration-300"
                    style={{ width: `${automationSettings.stockPercentage}%` }}
                  />
                  <div
                    className="h-full bg-accent-500 transition-[width] duration-300"
                    style={{ width: `${100 - automationSettings.stockPercentage}%` }}
                  />
                </div>
                <p className="text-gray-500 dark:text-zinc-400 text-xs mt-1">📦 {automationSettings.stockPercentage}% stock · 🤖 {100 - automationSettings.stockPercentage}% IA</p>
              </div>

              <div>
                <label className="block text-gray-500 dark:text-zinc-400 text-xs font-medium mb-2">🎬 Tipo de Transición</label>
                <select
                  value={automationSettings.transitionType}
                  onChange={(e) =>
                    setAutomationSettings({
                      ...automationSettings,
                      transitionType: e.target.value as any,
                    })
                  }
                  className="w-full px-3 py-2 bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-lg text-sm text-gray-700 dark:text-zinc-300 focus:border-accent-500 dark:focus:border-accent-600 focus:outline-none"
                >
                  <option value="fade">Fade (Desvanecimiento)</option>
                  <option value="slide">Slide (Deslizamiento)</option>
                  <option value="dissolve">Dissolve (Disolución)</option>
                  <option value="wipeLeft">Wipe Left (Barrido Izq)</option>
                  <option value="wipeRight">Wipe Right (Barrido Der)</option>
                  <option value="random">🎲 Aleatorio</option>
                </select>
              </div>

              <div>
                <label className="block text-gray-500 dark:text-zinc-400 text-xs font-medium mb-2">⌚ Duración Transición: {automationSettings.transitionDuration}ms</label>
                <input
                  type="range"
                  min="300"
                  max="1000"
                  step="100"
                  value={automationSettings.transitionDuration}
                  onChange={(e) =>
                    setAutomationSettings({
                      ...automationSettings,
                      transitionDuration: parseInt(e.target.value),
                    })
                  }
                  className="input-range"
                />
              </div>

              <div>
                <label className="block text-gray-500 dark:text-zinc-400 text-xs font-medium mb-2">✨ Tipo de Animación</label>
                <select
                  value={automationSettings.animationType}
                  onChange={(e) =>
                    setAutomationSettings({
                      ...automationSettings,
                      animationType: e.target.value as any,
                    })
                  }
                  className="w-full px-3 py-2 bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-lg text-sm text-gray-700 dark:text-zinc-300 focus:border-accent-500 dark:focus:border-accent-600 focus:outline-none"
                >
                  <option value="zoom">Zoom (Acercamiento)</option>
                  <option value="pan">Pan (Panorámica)</option>
                  <option value="rotate">Rotate (Rotación)</option>
                  <option value="bounce">Bounce (Rebote)</option>
                  <option value="slideIn">Slide In (Entrada)</option>
                  <option value="random">🎲 Aleatorio</option>
                </select>
              </div>

              <div className="md:col-span-2">
                <label className="block text-gray-500 dark:text-zinc-400 text-xs font-medium mb-2">⏱️ Duración Animación: {automationSettings.animationDuration}ms</label>
                <input
                  type="range"
                  min="500"
                  max="2000"
                  step="100"
                  value={automationSettings.animationDuration}
                  onChange={(e) =>
                    setAutomationSettings({
                      ...automationSettings,
                      animationDuration: parseInt(e.target.value),
                    })
                  }
                  className="input-range"
                />
              </div>
            </div>
          )}
        </div>

        {/* Video Structure Settings */}
        <div className="mb-4 p-4 bg-gray-50 dark:bg-zinc-950 rounded-lg border border-gray-200 dark:border-zinc-800">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Film className="w-4 h-4 text-accent-600 dark:text-accent-400" />
              <label className="text-gray-900 dark:text-zinc-100 text-sm font-medium">📹 Estructura de Video</label>
            </div>
            <div
              role="switch"
              aria-checked={structureSettings.useStructure}
              onClick={() =>
                setStructureSettings({
                  ...structureSettings,
                  useStructure: !structureSettings.useStructure,
                })
              }
              className={`w-8 h-4 rounded-full transition-colors relative cursor-pointer ${structureSettings.useStructure ? 'bg-accent-600' : 'bg-gray-200 dark:bg-zinc-700'}`}
            >
              <div className={`w-3 h-3 rounded-full bg-white absolute top-0.5 transition-all ${structureSettings.useStructure ? 'right-0.5' : 'left-0.5'}`} />
            </div>
          </div>

          {structureSettings.useStructure && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-gray-500 dark:text-zinc-400 text-xs font-medium mb-2">🎯 Temática del Video</label>
                <input
                  type="text"
                  value={structureSettings.theme}
                  onChange={(e) =>
                    setStructureSettings({
                      ...structureSettings,
                      theme: e.target.value,
                    })
                  }
                  placeholder="ej: naturaleza, ciudad, viaje..."
                  className="w-full px-3 py-2 bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-lg text-sm text-gray-900 dark:text-zinc-100 placeholder-gray-400 dark:placeholder-zinc-600 focus:border-accent-500 dark:focus:border-accent-600 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-gray-500 dark:text-zinc-400 text-xs font-medium mb-2">⏱️ Duración Total: {Math.round(structureSettings.totalDuration / 60)}min</label>
                <input
                  type="range"
                  min="60"
                  max="3600"
                  step="60"
                  value={structureSettings.totalDuration}
                  onChange={(e) =>
                    setStructureSettings({
                      ...structureSettings,
                      totalDuration: parseInt(e.target.value),
                    })
                  }
                  className="input-range"
                />
              </div>

              <div>
                <label className="block text-gray-500 dark:text-zinc-400 text-xs font-medium mb-2">🎬 Video IA (primeros minutos): {structureSettings.aiVideoDurationMins}min</label>
                <input
                  type="range"
                  min="1"
                  max="15"
                  step="1"
                  value={structureSettings.aiVideoDurationMins}
                  onChange={(e) =>
                    setStructureSettings({
                      ...structureSettings,
                      aiVideoDurationMins: parseInt(e.target.value),
                    })
                  }
                  className="input-range"
                />
              </div>

              <div>
                <label className="block text-gray-500 dark:text-zinc-400 text-xs font-medium mb-2">📊 Mezcla</label>
                <input
                  type="range"
                  min="0"
                  max="100"
                  step="5"
                  value={structureSettings.iaImagePercentage}
                  onChange={(e) => {
                    const ia = parseInt(e.target.value);
                    setStructureSettings({
                      ...structureSettings,
                      iaImagePercentage: ia,
                      stockVideoPercentage: 100 - ia,
                    });
                  }}
                  className="input-range mb-2"
                />
                <div className="w-full h-5 rounded-full overflow-hidden flex bg-gray-100 dark:bg-zinc-800 border border-gray-200 dark:border-zinc-800">
                  <div
                    className="h-full bg-accent-500 transition-[width] duration-300"
                    style={{ width: `${structureSettings.iaImagePercentage}%` }}
                  />
                  <div
                    className="h-full bg-gray-300 dark:bg-zinc-600 transition-[width] duration-300"
                    style={{ width: `${structureSettings.stockVideoPercentage}%` }}
                  />
                </div>
                <p className="text-gray-500 dark:text-zinc-400 text-xs mt-1">🤖 {structureSettings.iaImagePercentage}% imágenes IA · 📦 {structureSettings.stockVideoPercentage}% stock</p>
              </div>
            </div>
          )}

          {videoPlan && (
            <div className="mb-4 p-3 bg-accent-50 dark:bg-accent-950/50 rounded-lg border border-accent-200 dark:border-accent-800">
              <p className="text-accent-700 dark:text-accent-300 text-sm font-medium mb-2">📋 Plan Generado:</p>
              <ul className="text-gray-500 dark:text-zinc-400 text-xs space-y-1">
                <li>🎬 Videos IA: {videoPlan.structure.assets[0].count} (primeros {Math.round(videoPlan.aiVideoDuration / 60)}min)</li>
                <li>🖼️ Imágenes IA: {videoPlan.structure.assets[1].count}</li>
                <li>📹 Videos Stock: {videoPlan.structure.assets[2].count}</li>
                <li>💰 Costo estimado: ${(videoPlan.estimatedCost.iaVideos + videoPlan.estimatedCost.iaImages).toFixed(2)}</li>
              </ul>
            </div>
          )}

          {structureSettings.useStructure && (
            <button
              onClick={handleGenerateStructurePlan}
              className="w-full btn-secondary py-2 text-sm flex items-center justify-center gap-2"
            >
              <Sparkles className="w-4 h-4" />
              Generar Plan de Estructura
            </button>
          )}
        </div>

        <div className="flex gap-3">
          <button
            onClick={handleCompileVideo}
            disabled={isCompiling || assets.length === 0}
            className="btn-primary flex-1 flex items-center justify-center gap-2"
          >
            {isCompiling && <Loader className="w-5 h-5 animate-spin" />}
            {isCompiling ? 'Compilando...' : '🎬 Compilar Video'}
          </button>
          {(isCompiling || showCompilationMonitor || !!currentProjectId) && (
            <button
              onClick={() => setShowCompilationMonitor(!showCompilationMonitor)}
              className="btn-secondary flex items-center justify-center gap-2 px-6"
            >
              <Activity className="w-5 h-5" />
              Monitor
            </button>
          )}
          {compiledVideo && (
            <button
              onClick={handleDownloadVideo}
              className="btn-secondary flex items-center justify-center gap-2 px-6"
            >
              <Download className="w-5 h-5" />
              Descargar
            </button>
          )}
        </div>
      </div>

      {/* Timeline */}
      <div className="card-lg">
        <h3 className="text-gray-900 dark:text-zinc-100 text-sm font-medium mb-4">📹 Línea de Tiempo</h3>

        {assets.length === 0 ? (
          <div className="text-center py-12 text-gray-400 dark:text-zinc-500">
            <Film className="w-10 h-10 mx-auto mb-3 opacity-50" />
            <p className="text-sm">Agrega imágenes, videos y audio desde las otras pestañas</p>
          </div>
        ) : (
          <>
            <div className="space-y-3 mb-6 max-h-96 overflow-y-auto">
              {assets.map((asset, idx) => (
                <div
                  key={asset.id}
                  className="flex items-center gap-4 p-4 bg-gray-50 dark:bg-zinc-950 rounded-lg border border-gray-200 dark:border-zinc-800 hover:border-accent-300 dark:hover:border-accent-700"
                  draggable
                  onDragOver={(e) => e.preventDefault()}
                >
                  {/* Index */}
                  <div className="w-8 h-8 rounded-full bg-accent-600 flex items-center justify-center font-medium text-sm text-white">
                    {idx + 1}
                  </div>

                  {/* Info */}
                  <div className="flex-1">
                    <p className="font-medium text-sm text-gray-900 dark:text-zinc-100">{asset.title}</p>
                    <p className="text-gray-400 dark:text-zinc-600 text-xs">
                      {asset.type.toUpperCase()} • {asset.duration.toFixed(1)}s
                    </p>
                  </div>

                  {/* Duration Editor */}
                  {asset.type !== 'audio' && (
                    <div className="flex items-center gap-2">
                      <label className="text-gray-400 dark:text-zinc-600 text-xs">Duración:</label>
                      <input
                        type="number"
                        min="1"
                        max="30"
                        step="0.5"
                        value={asset.duration}
                        onChange={(e) =>
                          handleDurationChange(asset.id, parseFloat(e.target.value))
                        }
                        className="w-16 px-2 py-1 bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded text-sm text-gray-900 dark:text-zinc-100"
                      />
                      <span className="text-gray-400 dark:text-zinc-600 text-xs">s</span>
                    </div>
                  )}

                  {/* Remove */}
                  <button
                    onClick={() => handleRemoveAsset(asset.id)}
                    className="p-2 hover:bg-red-50 dark:hover:bg-red-950/40 rounded-lg transition-colors"
                  >
                    <Trash2 className="w-4 h-4 text-gray-400 dark:text-zinc-600" />
                  </button>
                </div>
              ))}
            </div>

            {/* Timeline Info */}
            <div className="flex items-center justify-between p-4 bg-emerald-50 dark:bg-emerald-950 border border-emerald-200 dark:border-emerald-800 rounded-lg">
              <div>
                <p className="text-emerald-700 dark:text-emerald-400 text-sm font-medium">
                  Duración total: {totalDuration.toFixed(1)}s
                </p>
                <p className="text-gray-400 dark:text-zinc-500 text-xs">
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
          <h3 className="text-gray-900 dark:text-zinc-100 text-sm font-medium mb-4">✨ Video Compilado</h3>

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

      {/* New Advanced FFmpeg Editor Section */}
      <div className="card-lg">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-accent-600 rounded-lg">
              <Zap className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-gray-900 dark:text-zinc-100 text-sm font-medium">⚡ Editor Avanzado FFmpeg</h2>
              <p className="text-gray-400 dark:text-zinc-500 text-[10px]">Configuración automática y compilación visual</p>
            </div>
          </div>
        </div>

        {!showFFmpegEditor ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <button
              onClick={() => setShowAssetConfig(true)}
              className="p-6 bg-gray-50 dark:bg-zinc-950 border border-gray-200 dark:border-zinc-800 rounded-lg hover:border-accent-300 dark:hover:border-accent-700 transition group text-left"
            >
              <div className="text-3xl mb-3 group-hover:scale-110 transition">⚙️</div>
              <h3 className="font-medium text-sm text-gray-900 dark:text-zinc-100 mb-2">Configurar Assets</h3>
              <p className="text-gray-400 dark:text-zinc-500 text-xs">Define cuántos videos stock, videos IA e imágenes necesitas</p>
            </button>

            <button
              onClick={() => setShowFFmpegEditor(true)}
              className="p-6 bg-gray-50 dark:bg-zinc-950 border border-gray-200 dark:border-zinc-800 rounded-lg hover:border-accent-300 dark:hover:border-accent-700 transition group text-left"
            >
              <div className="text-3xl mb-3 group-hover:scale-110 transition">📤</div>
              <h3 className="font-medium text-sm text-gray-900 dark:text-zinc-100 mb-2">Subir Archivos</h3>
              <p className="text-gray-400 dark:text-zinc-500 text-xs">Sube videos, imágenes y audio para editar y compilar</p>
            </button>
          </div>
        ) : (
          <>
            {/* File Uploader */}
            <div className="mb-6">
              <h3 className="text-gray-900 dark:text-zinc-100 text-sm font-medium mb-4">📤 Gestor de Archivos</h3>
              <FileUploader onFilesAdded={handleFilesAdded} uploadedFiles={uploadedFiles} />
            </div>

            {/* FFmpeg Editor */}
            <div>
              <h3 className="text-gray-900 dark:text-zinc-100 text-sm font-medium mb-4">🎬 Editor FFmpeg</h3>
              <FFmpegEditor
                assets={assets.map(a => ({
                  id: a.id,
                  name: a.title,
                  type: a.type,
                  path: a.path,
                  duration: a.duration,
                  source: a.source === 'ia' ? 'generated' : 'upload',
                }))}
                onAssetsChange={(updatedAssets) => {
                  setAssets(
                    updatedAssets.map(a => ({
                      id: a.id,
                      type: a.type,
                      path: a.path,
                      duration: a.duration,
                      title: a.name,
                      source: a.source === 'generated' ? 'ia' : 'stock',
                    }))
                  );
                }}
                onCompile={handleCompileFromEditor}
              />
            </div>

            {/* Back Button */}
            <button
              onClick={() => setShowFFmpegEditor(false)}
              className="btn-secondary mt-6 w-full py-2"
            >
              ← Volver
            </button>
          </>
        )}
      </div>

      {/* Modals & Panels */}
      <AssetConfigModal
        isOpen={showAssetConfig}
        onClose={() => setShowAssetConfig(false)}
        onConfirm={handleAssetConfig}
      />

      <CompilationMonitor
        projectId={currentProjectId}
        isOpen={showCompilationMonitor}
        onClose={() => setShowCompilationMonitor(false)}
      />
    </div>
  );
}
