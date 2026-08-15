import { useState, useEffect } from 'react';
import { Image, Loader, Download, Trash2, Play, Video, Upload, X, Sparkles, Layers, Plus, Check } from 'lucide-react';
import toast from 'react-hot-toast';
import axios from 'axios';
import { API_URL } from '../services/apiUrl';

interface ReferenceImage {
  id: string;
  name: string;
  path: string;
  previewUrl: string;
}

interface Ingredient {
  id: string;
  name: string;
  imagePaths: string[];
  createdAt: number;
}

interface GeneratedImage {
  id: string;
  url: string;
  prompt: string;
  localPath: string;
  generatedAt: string;
  taskId?: string;
  status?: 'pending' | 'completed' | 'failed';
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
  const [isImageMode, setIsImageMode] = useState(true);
  const [downloadFolder, setDownloadFolder] = useState('C:\\Downloads\\VidSpa\\Images');
  const [referenceImages, setReferenceImages] = useState<ReferenceImage[]>([]);
  const [isUploadingReference, setIsUploadingReference] = useState(false);

  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [selectedIngredientIds, setSelectedIngredientIds] = useState<string[]>([]);
  const [isCreatingIngredient, setIsCreatingIngredient] = useState(false);
  const [newIngredientName, setNewIngredientName] = useState('');
  const [newIngredientFiles, setNewIngredientFiles] = useState<{ name: string; path: string; previewUrl: string }[]>([]);
  const [isUploadingIngredientFiles, setIsUploadingIngredientFiles] = useState(false);
  const [isSavingIngredient, setIsSavingIngredient] = useState(false);

  const loadIngredients = async () => {
    try {
      const response = await axios.get(`${API_URL}/api/ingredients`);
      setIngredients(response.data.ingredients || []);
    } catch (error) {
      console.error('Error cargando ingredientes:', error);
    }
  };

  useEffect(() => {
    loadIngredients();
  }, []);

  const handleToggleIngredient = (id: string) => {
    setSelectedIngredientIds(prev =>
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const handleDeleteIngredient = async (id: string) => {
    try {
      await axios.delete(`${API_URL}/api/ingredients/${id}`);
      setIngredients(prev => prev.filter(i => i.id !== id));
      setSelectedIngredientIds(prev => prev.filter(i => i !== id));
      toast.success('Ingrediente eliminado');
    } catch (error) {
      toast.error('Error al eliminar el ingrediente');
    }
  };

  const handleNewIngredientFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    const files = Array.from(e.target.files);
    setIsUploadingIngredientFiles(true);
    try {
      for (const file of files) {
        const formData = new FormData();
        formData.append('file', file);
        const response = await axios.post(`${API_URL}/api/upload`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
        const path = response.data.file.path;
        setNewIngredientFiles(prev => [...prev, { name: file.name, path, previewUrl: `${API_URL}${path}` }]);
      }
    } catch (error) {
      toast.error('Error al subir imagen');
    } finally {
      setIsUploadingIngredientFiles(false);
      e.target.value = '';
    }
  };

  const handleSaveIngredient = async () => {
    if (!newIngredientName.trim()) {
      toast.error('Ponle un nombre al ingrediente');
      return;
    }
    if (newIngredientFiles.length === 0) {
      toast.error('Sube al menos una imagen');
      return;
    }
    setIsSavingIngredient(true);
    try {
      const response = await axios.post(`${API_URL}/api/ingredients`, {
        name: newIngredientName.trim(),
        imagePaths: newIngredientFiles.map(f => f.path),
      });
      setIngredients(prev => [response.data.ingredient, ...prev]);
      setNewIngredientName('');
      setNewIngredientFiles([]);
      setIsCreatingIngredient(false);
      toast.success(`Ingrediente "${response.data.ingredient.name}" guardado`);
    } catch (error: any) {
      toast.error(error?.response?.data?.error || 'Error al guardar el ingrediente');
    } finally {
      setIsSavingIngredient(false);
    }
  };

  const handleReferenceImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    const files = Array.from(e.target.files);
    setIsUploadingReference(true);
    try {
      for (const file of files) {
        const formData = new FormData();
        formData.append('file', file);
        const response = await axios.post(`${API_URL}/api/upload`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
        const path = response.data.file.path;
        setReferenceImages(prev => [
          ...prev,
          { id: Math.random().toString(), name: file.name, path, previewUrl: `${API_URL}${path}` },
        ]);
      }
      toast.success(`${files.length} imagen(es) de referencia añadida(s)`);
    } catch (error) {
      toast.error('Error al subir imagen de referencia');
      console.error(error);
    } finally {
      setIsUploadingReference(false);
      e.target.value = '';
    }
  };

  const handleRemoveReferenceImage = (id: string) => {
    setReferenceImages(prev => prev.filter(r => r.id !== id));
  };

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

  const pollVideoStatus = (promptId: string, taskId: string) => {
    let attempts = 0;
    const maxAttempts = 60; // ~5 minutos con intervalo de 5s

    const interval = setInterval(async () => {
      attempts++;
      try {
        const response = await axios.get(`${API_URL}/api/videos/veo/status/${taskId}`);
        const video = response.data.video;

        if (video.status === 'completed') {
          clearInterval(interval);
          setImages(prev => {
            const newMap = new Map(prev);
            const existing = newMap.get(promptId);
            newMap.set(promptId, {
              ...existing,
              url: video.videoUrl,
              status: 'completed',
            } as GeneratedImage);
            return newMap;
          });
          toast.success('🎬 Video listo');
        } else if (video.status === 'failed') {
          clearInterval(interval);
          toast.error('La generación de video falló');
          setImages(prev => {
            const newMap = new Map(prev);
            newMap.delete(promptId);
            return newMap;
          });
        } else if (attempts >= maxAttempts) {
          clearInterval(interval);
          toast.error('El video está tardando demasiado en procesarse');
        }
      } catch (error) {
        if (attempts >= maxAttempts) {
          clearInterval(interval);
          console.error('Error comprobando estado del video:', error);
        }
      }
    }, 5000);
  };

  // Combina las imágenes de referencia sueltas de esta sesión con las de los
  // ingredientes guardados que estén seleccionados, sin duplicados.
  const getAllReferenceImagePaths = (): string[] => {
    const ingredientPaths = ingredients
      .filter(i => selectedIngredientIds.includes(i.id))
      .flatMap(i => i.imagePaths);
    return Array.from(new Set([...referenceImages.map(r => r.path), ...ingredientPaths]));
  };

  const handleGenerateImage = async (promptId: string) => {
    const prompt = prompts.find(p => p.id === promptId);
    if (!prompt) return;

    setGeneratingId(promptId);
    try {
      if (isImageMode) {
        // IMAGEN - NanoBanana
        const response = await axios.post(`${API_URL}/api/images/generate-nanobanana`, {
          prompt: prompt.imagePrompt,
          model: 'nano_banana_2',
          aspectRatio: '16:9',
          outputFolder: downloadFolder,
          referenceImages: getAllReferenceImagePaths(),
        });

        const image = response.data.image || response.data;
        setImages(prev => new Map(prev).set(promptId, image));
        toast.success('🎨 Imagen generada exitosamente');
      } else {
        // VIDEO - SnapGen
        const response = await axios.post(`${API_URL}/api/videos/generate-veo`, {
          prompt: prompt.imagePrompt,
          outputFolder: downloadFolder,
        });

        const video = response.data.video || response.data;
        setImages(prev => new Map(prev).set(promptId, { ...video, status: 'pending' }));
        toast.success('📹 Generando video... esto puede tardar unos minutos');
        pollVideoStatus(promptId, video.taskId);
      }
    } catch (error: any) {
      const status = error.response?.status;
      const errorData = error.response?.data;

      if (status === 503 && errorData?.requiresSetup) {
        toast.error(
          '⚠️ G-Labs no está corriendo. Inicia G-LabsAutomation.exe desde: ' +
          'C:\\Users\\danir\\Downloads\\G-Labs-Automation-v6.0.5-win'
        );
      } else {
        toast.error(`Error al generar ${isImageMode ? 'imagen' : 'video'}`);
      }
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
      const payload: any = {
        prompts: selectedPromptObjs.map(p => p.imagePrompt),
        outputFolder: downloadFolder,
      };

      if (isImageMode) {
        // IMAGEN - NanoBanana
        payload.model = 'nano_banana_2';
        payload.referenceImages = getAllReferenceImagePaths();
        await axios.post(`${API_URL}/api/images/batch-nanobanana`, payload);
        toast.success(`🎨 Generando ${selectedPrompts.length} imágenes en segundo plano`);
      } else {
        // VIDEO - SnapGen: se lanzan todos en paralelo y cada uno se rastrea por su cuenta
        const response = await axios.post(`${API_URL}/api/videos/batch-veo`, payload);
        const batchVideos = response.data.videos as any[];

        setImages(prev => {
          const newMap = new Map(prev);
          batchVideos.forEach((video, idx) => {
            if (!video) return;
            newMap.set(selectedPromptObjs[idx].id, { ...video, status: 'pending' });
          });
          return newMap;
        });

        batchVideos.forEach((video, idx) => {
          if (!video) return;
          pollVideoStatus(selectedPromptObjs[idx].id, video.taskId);
        });

        const startedCount = batchVideos.filter(Boolean).length;
        const failedCount = batchVideos.length - startedCount;

        toast.success(`🎬 Generando ${startedCount} videos en paralelo`);
        if (failedCount > 0) {
          toast.error(`${failedCount} video(s) no se pudieron iniciar`);
        }
      }
    } catch (error: any) {
      const status = error.response?.status;
      const errorData = error.response?.data;

      if (status === 503 && errorData?.requiresSetup) {
        toast.error(
          '⚠️ G-Labs no está corriendo. Inicia G-LabsAutomation.exe desde: ' +
          'C:\\Users\\danir\\Downloads\\G-Labs-Automation-v6.0.5-win'
        );
      } else {
        toast.error('Error al iniciar generación en lote');
      }
      console.error(error);
    }
  };

  const handleDownloadImage = (image: GeneratedImage) => {
    if (!isImageMode) {
      // Los videos de SnapGen se sirven desde un CDN externo (cross-origin);
      // el atributo download no funciona ahí, así que se abre en pestaña nueva
      window.open(image.url, '_blank');
      toast.success('Descargando video...');
      return;
    }

    const link = document.createElement('a');
    link.href = image.url;
    link.download = `media-${image.id}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success('Descargando...');
  };

  const handleDeleteImage = (promptId: string) => {
    setImages(prev => {
      const newMap = new Map(prev);
      newMap.delete(promptId);
      return newMap;
    });
    toast.success('Eliminado');
  };

  return (
    <div className="space-y-6">
      {/* Configuration Section */}
      <div className="card-lg">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2.5 bg-accent-600 rounded-lg">
            {isImageMode ? (
              <Image className="w-5 h-5 text-white" />
            ) : (
              <Video className="w-5 h-5 text-white" />
            )}
          </div>
          <div>
            <h2 className="text-gray-900 dark:text-zinc-100 text-sm font-medium">
              {isImageMode ? 'Generador de Imágenes' : 'Generador de Videos'}
            </h2>
            <p className="text-gray-400 dark:text-zinc-500 text-[10px]">
              {isImageMode ? 'Crea imágenes con NanoBanana' : 'Crea videos con SnapGen (Veo)'}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
          {/* Mode Toggle */}
          <div>
            <label className="block text-xs font-medium mb-2 text-gray-400 dark:text-zinc-600">
              🎬 Tipo de Generación
            </label>
            <select
              value={isImageMode ? 'image' : 'video'}
              onChange={(e) => setIsImageMode(e.target.value === 'image')}
              className="w-full px-3 py-2 bg-gray-50 dark:bg-zinc-950 border border-gray-200 dark:border-zinc-800 text-gray-700 dark:text-zinc-300 rounded-lg focus:border-accent-500 dark:focus:border-accent-600 focus:outline-none text-sm"
            >
              <option value="image">🎨 Imágenes (NanoBanana)</option>
              <option value="video">🎥 Videos (SnapGen)</option>
            </select>
          </div>

          {/* Download Folder */}
          <div>
            <label className="block text-xs font-medium mb-2 text-gray-400 dark:text-zinc-600">
              📁 Carpeta de Descarga
            </label>
            <input
              type="text"
              value={downloadFolder}
              onChange={(e) => setDownloadFolder(e.target.value)}
              placeholder="C:\Downloads\VidSpa\Images"
              className="w-full px-3 py-2 bg-gray-50 dark:bg-zinc-950 border border-gray-200 dark:border-zinc-800 text-gray-900 dark:text-zinc-100 placeholder-gray-400 dark:placeholder-zinc-600 rounded-lg focus:border-accent-500 dark:focus:border-accent-600 focus:outline-none text-sm"
            />
            <p className="text-xs text-gray-400 dark:text-zinc-500 mt-1">{isImageMode ? 'G-Labs' : 'SnapGen'} descargará aquí {isImageMode ? 'las imágenes' : 'los videos'}</p>
          </div>

          {/* Batch Actions - Full Width */}
        </div>

        {isImageMode && (
          <div className="mb-6 p-4 bg-accent-50 dark:bg-accent-950/50 rounded-lg border border-accent-200 dark:border-accent-800">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Layers className="w-5 h-5 text-accent-500 dark:text-accent-400" />
                <label className="text-sm font-medium text-gray-900 dark:text-zinc-100">
                  Ingredientes (personajes/estilos reutilizables)
                </label>
              </div>
              {!isCreatingIngredient && (
                <button
                  onClick={() => setIsCreatingIngredient(true)}
                  className="flex items-center gap-1.5 btn-secondary py-1.5 px-3 text-xs"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Nuevo ingrediente
                </button>
              )}
            </div>
            <p className="text-xs text-gray-400 dark:text-zinc-500 mb-3">
              Guarda un personaje o estilo una sola vez (nombre + imágenes) y selecciónalo aquí en cualquier generación futura, sin volver a subir archivos — igual que "Ingredients" en Google Flow.
            </p>

            {isCreatingIngredient && (
              <div className="mb-4 p-3 bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-lg space-y-3">
                <input
                  type="text"
                  value={newIngredientName}
                  onChange={(e) => setNewIngredientName(e.target.value)}
                  placeholder="Nombre (ej. 'Ana la protagonista', 'Estilo acuarela')"
                  className="w-full px-3 py-2 bg-gray-50 dark:bg-zinc-950 border border-gray-200 dark:border-zinc-800 text-gray-900 dark:text-zinc-100 placeholder-gray-400 dark:placeholder-zinc-600 rounded-lg focus:border-accent-500 dark:focus:border-accent-600 focus:outline-none text-sm"
                />

                <div className="border border-dashed border-gray-300 dark:border-zinc-700 bg-gray-50 dark:bg-zinc-900/50 rounded-lg p-3 text-center hover:border-gray-400 dark:hover:border-zinc-500 transition-colors">
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={handleNewIngredientFileUpload}
                    className="hidden"
                    id="new-ingredient-file-input"
                    disabled={isUploadingIngredientFiles}
                  />
                  <label htmlFor="new-ingredient-file-input" className="cursor-pointer">
                    <Upload className="mx-auto mb-1 text-gray-400 dark:text-zinc-500" size={18} />
                    <span className="text-xs text-gray-400 dark:text-zinc-500">
                      {isUploadingIngredientFiles ? 'Subiendo...' : 'Adjuntar imagen(es) del personaje/estilo'}
                    </span>
                  </label>
                </div>

                {newIngredientFiles.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {newIngredientFiles.map((f, idx) => (
                      <img
                        key={idx}
                        src={f.previewUrl}
                        alt={f.name}
                        className="w-14 h-14 object-cover rounded-lg border border-gray-200 dark:border-zinc-800"
                      />
                    ))}
                  </div>
                )}

                <div className="flex gap-2">
                  <button
                    onClick={handleSaveIngredient}
                    disabled={isSavingIngredient}
                    className="btn-primary flex-1 py-1.5 text-xs flex items-center justify-center gap-1.5"
                  >
                    {isSavingIngredient && <Loader className="w-3.5 h-3.5 animate-spin" />}
                    Guardar ingrediente
                  </button>
                  <button
                    onClick={() => {
                      setIsCreatingIngredient(false);
                      setNewIngredientName('');
                      setNewIngredientFiles([]);
                    }}
                    className="btn-secondary py-1.5 px-4 text-xs"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            )}

            {ingredients.length > 0 ? (
              <div className="flex flex-wrap gap-2 mb-2">
                {ingredients.map(ing => {
                  const isSelected = selectedIngredientIds.includes(ing.id);
                  return (
                    <div
                      key={ing.id}
                      className={`relative flex items-center gap-2 pl-1.5 pr-2.5 py-1.5 rounded-full border cursor-pointer transition-colors ${
                        isSelected
                          ? 'bg-accent-100 dark:bg-accent-900/60 border-accent-400 dark:border-accent-600'
                          : 'bg-white dark:bg-zinc-900 border-gray-200 dark:border-zinc-700 hover:border-gray-300 dark:hover:border-zinc-600'
                      }`}
                      onClick={() => handleToggleIngredient(ing.id)}
                    >
                      <img
                        src={`${API_URL}${ing.imagePaths[0]}`}
                        alt={ing.name}
                        className="w-7 h-7 object-cover rounded-full"
                      />
                      <span className="text-xs text-gray-900 dark:text-zinc-100 font-medium">{ing.name}</span>
                      <span className="text-[10px] text-gray-400 dark:text-zinc-500">({ing.imagePaths.length})</span>
                      {isSelected && <Check className="w-3.5 h-3.5 text-accent-600 dark:text-accent-400" />}
                      <button
                        onClick={(e) => { e.stopPropagation(); handleDeleteIngredient(ing.id); }}
                        className="text-gray-300 dark:text-zinc-600 hover:text-red-500 dark:hover:text-red-400"
                      >
                        <X size={12} />
                      </button>
                    </div>
                  );
                })}
              </div>
            ) : (
              !isCreatingIngredient && (
                <p className="text-xs text-gray-400 dark:text-zinc-600 mb-2">Aún no tienes ingredientes guardados.</p>
              )
            )}
          </div>
        )}

        {isImageMode && (
          <div className="mb-6 p-4 bg-gray-50 dark:bg-zinc-950 rounded-lg border border-gray-200 dark:border-zinc-800">
            <div className="flex items-center gap-2 mb-3">
              <Sparkles className="w-5 h-5 text-gray-400 dark:text-zinc-500" />
              <label className="text-sm font-medium text-gray-900 dark:text-zinc-100">
                Referencia puntual (solo esta sesión)
              </label>
            </div>
            <p className="text-xs text-gray-400 dark:text-zinc-500 mb-3">
              Para una referencia de un solo uso que no quieres guardar como ingrediente.
            </p>

            <div className="border border-dashed border-gray-300 dark:border-zinc-700 bg-gray-50 dark:bg-zinc-900/50 rounded-xl p-4 text-center mb-3 hover:border-gray-400 dark:hover:border-zinc-500 transition-colors">
              <input
                type="file"
                accept="image/*"
                multiple
                onChange={handleReferenceImageUpload}
                className="hidden"
                id="reference-image-input"
                disabled={isUploadingReference}
              />
              <label htmlFor="reference-image-input" className="cursor-pointer">
                <Upload className="mx-auto mb-2 text-gray-400 dark:text-zinc-500" size={24} />
                <span className="text-xs text-gray-400 dark:text-zinc-500">
                  {isUploadingReference ? 'Subiendo...' : 'Adjuntar imagen(es) de referencia'}
                </span>
              </label>
            </div>

            {referenceImages.length > 0 && (
              <div className="flex flex-wrap gap-3">
                {referenceImages.map(img => (
                  <div key={img.id} className="relative">
                    <img
                      src={img.previewUrl}
                      alt={img.name}
                      className="w-20 h-20 object-cover rounded-lg border border-accent-300 dark:border-accent-700"
                    />
                    <button
                      onClick={() => handleRemoveReferenceImage(img.id)}
                      className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 hover:bg-red-600"
                    >
                      <X size={12} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {prompts.length > 0 && (
          <div className="flex gap-2 mb-6">
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
              {isImageMode ? '🎨' : '🎬'}
              Generar Lote ({selectedPrompts.length})
            </button>
          </div>
        )}

        {prompts.length === 0 && (
          <div className="text-center py-8 bg-gray-50 dark:bg-zinc-950 rounded-lg">
            <p className="font-medium text-sm text-gray-500 dark:text-zinc-400">📝 Crea prompts primero en la pestaña de Prompts</p>
            <p className="text-xs text-gray-400 dark:text-zinc-500 mt-1">
              Una vez tengas prompts, podrás generar {isImageMode ? 'imágenes' : 'videos'}
            </p>
          </div>
        )}
      </div>

      {/* Prompts Grid */}
      {prompts.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-gray-900 dark:text-zinc-100 text-sm font-medium flex items-center gap-2">
            {isImageMode ? '🖼️' : '🎬'} Prompts Disponibles ({prompts.length})
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {prompts.map(prompt => {
              const media = images.get(prompt.id);
              return (
                <div
                  key={prompt.id}
                  className="card-gradient border border-accent-200/50 flex flex-col hover-lift dark:border-accent-800/50"
                >
                  {/* Media Preview */}
                  {media ? (
                    <div className="mb-4 -mx-6 -mt-6 relative">
                      {!isImageMode && media.status !== 'completed' ? (
                        <div className="w-full h-48 bg-accent-50 dark:bg-accent-950/50 rounded-t-xl flex items-center justify-center">
                          <div className="text-center">
                            <Loader className="w-8 h-8 text-accent-500 dark:text-accent-400 animate-spin mx-auto mb-2" />
                            <p className="text-sm text-gray-500 dark:text-zinc-400">Generando video...</p>
                            <p className="text-xs text-gray-400 dark:text-zinc-600">{media.taskId?.substring(0, 12)}...</p>
                          </div>
                        </div>
                      ) : !isImageMode ? (
                        <video
                          src={media.url}
                          controls
                          className="w-full h-48 object-cover rounded-t-xl"
                        />
                      ) : (
                        <img
                          src={media.url}
                          alt={media.prompt}
                          className="w-full h-48 object-cover rounded-t-xl"
                        />
                      )}
                    </div>
                  ) : (
                    <div className="mb-4 h-48 bg-accent-50 dark:bg-accent-950/30 rounded-lg flex items-center justify-center border border-dashed border-accent-300 dark:border-accent-700">
                      {isImageMode ? (
                        <Image className="w-12 h-12 text-accent-400 dark:text-accent-500" />
                      ) : (
                        <Play className="w-12 h-12 text-accent-400 dark:text-accent-500" />
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
                        className="w-4 h-4 rounded border-gray-300 text-accent-600 cursor-pointer dark:border-zinc-600"
                      />
                      <span className="text-sm font-medium text-gray-700 dark:text-zinc-300">
                        Sección {prompt.section}
                      </span>
                    </div>

                    <p className="text-sm text-gray-500 line-clamp-2 dark:text-zinc-400">
                      {prompt.imagePrompt}
                    </p>
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2 mt-4">
                    {media ? (
                      <>
                        <button
                          onClick={() => handleDownloadImage(media)}
                          disabled={!isImageMode && media.status !== 'completed'}
                          className="flex-1 btn-secondary py-2 text-sm flex items-center justify-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <Download className="w-4 h-4" />
                          Descargar
                        </button>
                        <button
                          onClick={() => handleDeleteImage(prompt.id)}
                          className="flex-1 btn-secondary py-2 text-sm flex items-center justify-center gap-1 hover:bg-red-200 hover:border-red-400 dark:hover:bg-red-900/50 dark:hover:border-red-700"
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
                        {isImageMode ? '🎨 Generar Imagen' : '🎬 Generar Video'}
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
