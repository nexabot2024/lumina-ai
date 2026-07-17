import { useState } from 'react';
import { Image, Loader, Download, Trash2, Play } from 'lucide-react';
import toast from 'react-hot-toast';
import axios from 'axios';

interface GeneratedImage {
  id: string;
  url: string;
  prompt: string;
  localPath: string;
  generatedAt: string;
  taskId?: string;
}

interface Prompt {
  id: string;
  section: number;
  text: string;
  imagePrompt: string;
  videoKeywords: string[];
}

interface ImageGeneratorProps {
  prompts: Prompt[];
}

export default function ImageGenerator({ prompts }: ImageGeneratorProps) {
  const [selectedPrompts, setSelectedPrompts] = useState<string[]>([]);
  const [generatingId, setGeneratingId] = useState<string | null>(null);
  const [images, setImages] = useState<Map<string, GeneratedImage>>(new Map());
  const [service, setService] = useState<'veo' | 'nanobanana' | 'dalle'>('veo');

  const handleSelectPrompt = (id: string) => {
    setSelectedPrompts(prev =>
      prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id]
    );
  };

  const handleSelectAll = () => {
    if (selectedPrompts.length === prompts.length) {
      setSelectedPrompts([]);
    } else {
      setSelectedPrompts(prompts.map(p => p.id));
    }
  };

  const handleGenerateImage = async (promptId: string) => {
    const prompt = prompts.find(p => p.id === promptId);
    if (!prompt) return;

    setGeneratingId(promptId);
    try {
      let endpoint = '/api/images/generate';
      const payload: any = {
        prompt: prompt.imagePrompt,
      };

      if (service === 'nanobanana') {
        endpoint = '/api/images/generate-nanobanana';
        payload.model = 'nano_banana_2';
        payload.aspectRatio = '16:9';
      } else if (service === 'veo') {
        endpoint = '/api/images/generate';
        payload.service = 'dalle';
      } else {
        payload.service = service;
      }

      const response = await axios.post(endpoint, payload);

      const image = response.data.image || response.data;
      setImages(prev => new Map(prev).set(promptId, image));

      if (service === 'nanobanana') {
        toast.success('📹 Generación de video iniciada. Verifica el estado en unos minutos...');
      } else {
        toast.success('🎨 Imagen generada exitosamente');
      }
    } catch (error) {
      toast.error('Error al generar imagen/video');
      console.error(error);
    } finally {
      setGeneratingId(null);
    }
  };

  const handleGenerateBatch = async () => {
    if (selectedPrompts.length === 0) {
      toast.error('Selecciona al menos un prompt');
      return;
    }

    const selectedPromptObjs = prompts.filter(p =>
      selectedPrompts.includes(p.id)
    );

    try {
      let endpoint = '/api/images/batch';
      const payload: any = {
        prompts: selectedPromptObjs.map(p => p.imagePrompt),
      };

      if (service === 'nanobanana') {
        endpoint = '/api/images/batch-nanobanana';
        payload.model = 'nano_banana_2';
      } else {
        payload.service = service;
      }

      const response = await axios.post(endpoint, payload);

      if (service === 'nanobanana') {
        toast.success(
          `🎬 Generando ${selectedPrompts.length} videos en segundo plano. Esto puede tardar 5-10 minutos...`
        );
      } else {
        toast.success(
          `🎨 Generando ${selectedPrompts.length} imágenes en segundo plano`
        );
      }
    } catch (error) {
      toast.error('Error al iniciar generación en lote');
      console.error(error);
    }
  };

  const handleDownloadImage = (image: GeneratedImage) => {
    const link = document.createElement('a');
    link.href = image.url;
    link.download = `image-${image.id}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success('Descargando imagen...');
  };

  const handleDeleteImage = (promptId: string) => {
    setImages(prev => {
      const newMap = new Map(prev);
      newMap.delete(promptId);
      return newMap;
    });
    toast.success('Imagen eliminada');
  };

  return (
    <div className="space-y-6">
      {/* Configuration Section */}
      <div className="card-lg">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-3 bg-gradient-to-r from-pink-500 to-purple-500 rounded-lg">
            <Image className="w-6 h-6 text-white" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-gray-800">Generador de Imágenes y Videos</h2>
            <p className="text-gray-600 text-sm">
              Crea contenido visual con IA de última generación
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div>
            <label className="block text-sm font-semibold mb-2 text-gray-700">
              🎬 Servicio de IA
            </label>
            <select
              value={service}
              onChange={(e) =>
                setService(e.target.value as 'veo' | 'nanobanana' | 'dalle')
              }
              className="w-full px-4 py-2 bg-white border-2 border-purple-200 rounded-lg text-gray-800 font-medium focus:border-purple-500 focus:outline-none"
            >
              <option value="veo">🎥 VEO (Video AI - Recomendado)</option>
              <option value="nanobanana">🍌 NanoBanana (Generación rápida)</option>
              <option value="dalle">🎨 DALL-E 3 (Imágenes clásicas)</option>
            </select>
          </div>

          {prompts.length > 0 && (
            <div className="md:col-span-2 flex items-end gap-2">
              <button
                onClick={handleSelectAll}
                className="btn-secondary flex-1 py-2 text-sm font-bold"
              >
                {selectedPrompts.length === prompts.length
                  ? 'Deseleccionar Todo'
                  : 'Seleccionar Todo'}
              </button>
              <button
                onClick={handleGenerateBatch}
                disabled={selectedPrompts.length === 0}
                className="btn-primary flex-1 py-2 text-sm font-bold flex items-center justify-center gap-2"
              >
                {service === 'nanobanana' ? '🎬' : '🎨'}
                Generar Lote ({selectedPrompts.length})
              </button>
            </div>
          )}
        </div>

        {prompts.length === 0 && (
          <div className="text-center py-8 text-gray-600 bg-gray-100 rounded-2xl">
            <p className="font-semibold">📝 Crea prompts primero en la pestaña de Prompts</p>
            <p className="text-sm text-gray-500 mt-1">Una vez tengas prompts, podrás generar {service === 'nanobanana' ? 'videos' : 'imágenes'}</p>
          </div>
        )}
      </div>

      {/* Prompts Grid */}
      {prompts.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold flex items-center gap-2 text-gray-800">
            {service === 'nanobanana' ? '🎬' : '🖼️'} Prompts Disponibles ({prompts.length})
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {prompts.map(prompt => {
              const media = images.get(prompt.id);
              return (
                <div key={prompt.id} className="card-gradient border-2 border-purple-200/50 flex flex-col hover-lift">
                  {/* Media Preview */}
                  {media ? (
                    <div className="mb-4 -mx-6 -mt-6 relative">
                      {service === 'nanobanana' && media.taskId ? (
                        <div className="w-full h-48 bg-gradient-to-br from-purple-900/50 to-pink-900/50 rounded-t-xl flex items-center justify-center">
                          <div className="text-center">
                            <Loader className="w-8 h-8 text-pink-400 animate-spin mx-auto mb-2" />
                            <p className="text-sm text-gray-400">Generando video...</p>
                            <p className="text-xs text-gray-500">{media.taskId.substring(0, 12)}...</p>
                          </div>
                        </div>
                      ) : (
                        <img
                          src={media.url}
                          alt={media.prompt}
                          className="w-full h-48 object-cover rounded-t-xl"
                        />
                      )}
                    </div>
                  ) : (
                    <div className="mb-4 h-48 bg-gradient-to-br from-purple-500/20 to-pink-500/20 rounded-lg flex items-center justify-center border-2 border-dashed border-purple-300">
                      {service === 'nanobanana' ? (
                        <Play className="w-12 h-12 text-purple-400" />
                      ) : (
                        <Image className="w-12 h-12 text-purple-400" />
                      )}
                    </div>
                  )}

                  {/* Content */}
                  <div className="flex-1 space-y-3">
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={selectedPrompts.includes(prompt.id)}
                        onChange={() => handleSelectPrompt(prompt.id)}
                        className="w-4 h-4 rounded border-gray-500 text-purple-600 cursor-pointer"
                      />
                      <span className="text-sm font-semibold text-gray-700">
                        Sección {prompt.section}
                      </span>
                    </div>

                    <p className="text-sm text-gray-600 line-clamp-2">
                      {prompt.imagePrompt}
                    </p>
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2 mt-4">
                    {media ? (
                      <>
                        <button
                          onClick={() => handleDownloadImage(media)}
                          className="flex-1 btn-secondary py-2 text-sm flex items-center justify-center gap-1"
                        >
                          <Download className="w-4 h-4" />
                          Descargar
                        </button>
                        <button
                          onClick={() => handleDeleteImage(prompt.id)}
                          className="flex-1 btn-secondary py-2 text-sm flex items-center justify-center gap-1 hover:bg-red-200 hover:border-red-400"
                        >
                          <Trash2 className="w-4 h-4" />
                          Eliminar
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => handleGenerateImage(prompt.id)}
                        disabled={generatingId === prompt.id}
                        className="flex-1 btn-primary py-2 text-sm flex items-center justify-center gap-2"
                      >
                        {generatingId === prompt.id && (
                          <Loader className="w-4 h-4 animate-spin" />
                        )}
                        {generatingId === prompt.id
                          ? service === 'nanobanana' ? 'Generando video...' : 'Generando...'
                          : service === 'nanobanana' ? 'Generar Video' : 'Generar'}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
