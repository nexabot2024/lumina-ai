import { useState } from 'react';
import { Image, Loader, Download, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import axios from 'axios';

interface GeneratedImage {
  id: string;
  url: string;
  prompt: string;
  localPath: string;
  generatedAt: string;
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
  const [service, setService] = useState<'dalle' | 'stable-diffusion'>('dalle');

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
      const response = await axios.post('/api/images/generate', {
        prompt: prompt.imagePrompt,
        service,
      });

      const image = response.data.image;
      setImages(prev => new Map(prev).set(promptId, image));
      toast.success('Imagen generada exitosamente');
    } catch (error) {
      toast.error('Error al generar imagen');
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
      const response = await axios.post('/api/images/batch', {
        prompts: selectedPromptObjs.map(p => p.imagePrompt),
        service,
      });

      toast.loading('Generando lote... esto puede tardar', {
        duration: Infinity,
      });

      toast.success(
        `🎨 Generando ${selectedPrompts.length} imágenes en segundo plano`
      );
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
            <Image className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-2xl font-bold">Generador de Imágenes</h2>
            <p className="text-gray-400 text-sm">
              Crea imágenes hermosas con IA
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div>
            <label className="block text-sm font-semibold mb-2">
              Servicio de IA
            </label>
            <select
              value={service}
              onChange={(e) =>
                setService(e.target.value as 'dalle' | 'stable-diffusion')
              }
              className="w-full px-4 py-2 bg-gray-900/50 border border-white/10 rounded-lg text-white focus:border-purple-500/50 focus:outline-none"
            >
              <option value="dalle">DALL-E 3 (Recomendado)</option>
              <option value="stable-diffusion">Stable Diffusion</option>
            </select>
          </div>

          {prompts.length > 0 && (
            <div className="md:col-span-2 flex items-end gap-2">
              <button
                onClick={handleSelectAll}
                className="btn-secondary flex-1 py-2 text-sm"
              >
                {selectedPrompts.length === prompts.length
                  ? 'Deseleccionar Todo'
                  : 'Seleccionar Todo'}
              </button>
              <button
                onClick={handleGenerateBatch}
                disabled={selectedPrompts.length === 0}
                className="btn-primary flex-1 py-2 text-sm flex items-center justify-center gap-2"
              >
                <Image className="w-4 h-4" />
                Generar Lote
              </button>
            </div>
          )}
        </div>

        {prompts.length === 0 && (
          <div className="text-center py-8 text-gray-400">
            <p>📝 Crea prompts primero en la pestaña de Prompts</p>
          </div>
        )}
      </div>

      {/* Prompts Grid */}
      {prompts.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <Image className="w-5 h-5 text-pink-400" />
            Prompts Disponibles ({prompts.length})
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {prompts.map(prompt => {
              const image = images.get(prompt.id);
              return (
                <div key={prompt.id} className="card flex flex-col">
                  {/* Image Preview */}
                  {image ? (
                    <div className="mb-4 -mx-6 -mt-6 mb-4">
                      <img
                        src={image.url}
                        alt={image.prompt}
                        className="w-full h-48 object-cover rounded-t-xl"
                      />
                    </div>
                  ) : (
                    <div className="mb-4 h-48 bg-gradient-to-br from-purple-900/50 to-pink-900/50 rounded-lg flex items-center justify-center">
                      <Image className="w-12 h-12 text-gray-600" />
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
                      <span className="text-sm font-semibold text-gray-300">
                        Sección {prompt.section}
                      </span>
                    </div>

                    <p className="text-sm text-gray-400 line-clamp-2">
                      {prompt.imagePrompt}
                    </p>
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2 mt-4">
                    {image ? (
                      <>
                        <button
                          onClick={() => handleDownloadImage(image)}
                          className="flex-1 btn-secondary py-2 text-sm flex items-center justify-center gap-1"
                        >
                          <Download className="w-4 h-4" />
                          Descargar
                        </button>
                        <button
                          onClick={() => handleDeleteImage(prompt.id)}
                          className="flex-1 btn-secondary py-2 text-sm flex items-center justify-center gap-1 hover:bg-red-900/20 hover:border-red-600"
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
                          ? 'Generando...'
                          : 'Generar'}
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
