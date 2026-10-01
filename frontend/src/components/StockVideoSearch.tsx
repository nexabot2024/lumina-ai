import { useState } from 'react';
import { Video, Search, Loader, ExternalLink, Download, CheckSquare, Check, FolderOpen, FolderCheck, X } from 'lucide-react';
import toast from 'react-hot-toast';
import axios from 'axios';
import { API_URL } from '../services/apiUrl';
import CustomSelect from './CustomSelect';

// File System Access API (showDirectoryPicker) — solo Chrome/Edge. Firefox y Safari no
// lo soportan, así que se detecta y se cae de vuelta a la descarga normal del navegador.
const supportsFolderPicker = typeof window !== 'undefined' && 'showDirectoryPicker' in window;

function sanitizeFilename(name: string): string {
  return name.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').trim().slice(0, 150) || 'archivo';
}

interface StockVideo {
  id: string;
  source: 'pixabay' | 'pexels' | 'wikimedia';
  title: string;
  url: string;
  thumbnail?: string;
  duration?: number;
  width?: number;
  height?: number;
  downloadUrl: string;
  type?: 'image' | 'video' | 'audio';
  license?: string;
  author?: string;
}

interface DownloadedVideo {
  id: string;
  title: string;
  source: 'pixabay' | 'pexels';
  downloadUrl: string;
  duration: number;
  resolution: string;
}

export default function StockVideoSearch() {
  const [query, setQuery] = useState('');
  const [source, setSource] = useState<'both' | 'pixabay' | 'pexels' | 'wikimedia'>('both');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<StockVideo[]>([]);
  const [searchHistory, setSearchHistory] = useState<string[]>([]);
  const [searchType, setSearchType] = useState<'videos' | 'images'>('videos');
  const [selectedVideos, setSelectedVideos] = useState<Set<string>>(new Set());
  const [downloadingSelected, setDownloadingSelected] = useState(false);

  // Auto-download state
  const [autoTheme, setAutoTheme] = useState('');
  const [minDuration, setMinDuration] = useState(0);
  const [maxDuration, setMaxDuration] = useState(60);
  const [resolution, setResolution] = useState<'720p' | '1080p' | '4k' | 'any'>('any');
  const [quantity, setQuantity] = useState(3);
  const [autoSources, setAutoSources] = useState<('pixabay' | 'pexels')[]>(['pexels']);
  const [autoLoading, setAutoLoading] = useState(false);
  const [downloadedVideos, setDownloadedVideos] = useState<DownloadedVideo[]>([]);

  // Carpeta de destino elegida por el usuario (File System Access API): mientras esté
  // activa, las descargas se escriben ahí directamente en vez de ir a la carpeta de
  // descargas por defecto del navegador. Se pierde al recargar la página (el navegador
  // exige volver a concederla), así que no se persiste.
  const [downloadDirHandle, setDownloadDirHandle] = useState<any>(null);

  const handleChooseFolder = async () => {
    try {
      const handle = await (window as any).showDirectoryPicker({ mode: 'readwrite' });
      setDownloadDirHandle(handle);
      toast.success(`📁 Carpeta de destino: ${handle.name}`);
    } catch (err: any) {
      if (err?.name !== 'AbortError') {
        toast.error('No se pudo abrir el selector de carpeta');
        console.error(err);
      }
    }
  };

  /** Descarga `url` y la escribe en la carpeta elegida; devuelve false si no hay carpeta
   *  elegida o si algo falla (CORS, permisos revocados, etc.) para que el llamador caiga
   *  de vuelta al método normal del navegador. */
  const saveToChosenFolder = async (url: string, filename: string): Promise<boolean> => {
    if (!downloadDirHandle) return false;
    try {
      const permission = await downloadDirHandle.queryPermission({ mode: 'readwrite' });
      if (permission !== 'granted') {
        const requested = await downloadDirHandle.requestPermission({ mode: 'readwrite' });
        if (requested !== 'granted') return false;
      }
      const response = await fetch(url);
      if (!response.ok) return false;
      const blob = await response.blob();
      const fileHandle = await downloadDirHandle.getFileHandle(filename, { create: true });
      const writable = await fileHandle.createWritable();
      await writable.write(blob);
      await writable.close();
      return true;
    } catch (err) {
      console.warn('No se pudo guardar en la carpeta elegida, se usa la descarga normal:', err);
      return false;
    }
  };

  const handleSearch = async (searchQuery?: string) => {
    const queryToUse = searchQuery || query;
    if (!queryToUse.trim()) {
      toast.error('Escribe una búsqueda');
      return;
    }

    setLoading(true);
    try {
      let response;

      if (source === 'wikimedia') {
        // Búsqueda en Wikimedia Commons
        const type = searchType === 'videos' ? 'video' : 'image';
        response = await axios.get(`${API_URL}/api/wikimedia/${type === 'image' ? 'images' : 'videos'}`, {
          params: {
            query: queryToUse,
            limit: 50,
          },
        });

        const results = response.data.results.map((asset: any) => ({
          id: asset.id,
          source: 'wikimedia' as const,
          title: asset.title,
          url: asset.url,
          downloadUrl: asset.downloadUrl,
          type: asset.type,
          license: asset.license,
          author: asset.author,
          width: asset.dimensions?.width,
          height: asset.dimensions?.height,
          duration: asset.duration,
          thumbnail: asset.url,
        }));

        setResults(results);
        toast.success(`✨ ${results.length} archivos encontrados en Wikimedia Commons`);
      } else {
        // Búsqueda tradicional Pixabay/Pexels
        const endpoint = searchType === 'videos' ? `${API_URL}/api/videos/search-videos` : `${API_URL}/api/videos/search-images`;
        response = await axios.post(endpoint, {
          query: queryToUse,
          source,
          limit: 500,
        });

        const key = searchType === 'videos' ? 'videos' : 'images';
        setResults(response.data[key] || []);
        toast.success(`✨ ${response.data.count} ${searchType === 'videos' ? 'videos' : 'imágenes'} encontrados`);
      }

      setSearchHistory(prev => {
        const updated = [queryToUse, ...prev].slice(0, 5);
        return updated;
      });
    } catch (error) {
      toast.error(`Error al buscar`);
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadVideo = async (video: StockVideo) => {
    const ext = video.type === 'image' ? 'jpg' : 'mp4';
    const filename = `${sanitizeFilename(video.title || video.id)}.${ext}`;
    const saved = await saveToChosenFolder(video.downloadUrl, filename);
    if (saved) {
      toast.success(`✅ Guardado en ${downloadDirHandle.name}/${filename}`);
      return;
    }
    window.open(video.downloadUrl, '_blank');
    toast.success('Descarga iniciada...');
  };

  const handleAutoDownload = async () => {
    if (!autoTheme.trim()) {
      toast.error('Escribe un tema para descargar');
      return;
    }

    setAutoLoading(true);
    try {
      const response = await axios.post(`${API_URL}/api/videos/download-auto`, {
        theme: autoTheme,
        minDuration,
        maxDuration,
        resolution,
        quantity,
        sources: autoSources,
      });

      if (response.data.results && response.data.results.length > 0) {
        const videosDownloaded: DownloadedVideo[] = response.data.results.map((video: any) => ({
          id: video.id,
          title: video.title,
          source: video.source,
          downloadUrl: video.downloadUrl,
          duration: video.duration,
          resolution: video.resolution,
        }));

        toast.success(
          `✅ ${videosDownloaded.length} videos descargados con duraciones reales detectadas!`
        );

        setDownloadedVideos(videosDownloaded);
      } else {
        toast.error('No se descargaron videos. Verifica los criterios.');
      }

      setAutoTheme('');
    } catch (error: any) {
      toast.error(
        `Error al descargar: ${error.response?.data?.details || 'Error desconocido'}`
      );
      console.error(error);
    } finally {
      setAutoLoading(false);
    }
  };

  const toggleVideoSelection = (videoId: string) => {
    const newSelected = new Set(selectedVideos);
    if (newSelected.has(videoId)) {
      newSelected.delete(videoId);
    } else {
      newSelected.add(videoId);
    }
    setSelectedVideos(newSelected);
  };

  const toggleSelectAll = () => {
    if (selectedVideos.size === results.length) {
      setSelectedVideos(new Set());
    } else {
      setSelectedVideos(new Set(results.map(v => v.id)));
    }
  };

  const downloadSelected = async () => {
    if (selectedVideos.size === 0) {
      toast.error('Selecciona al menos un video');
      return;
    }

    setDownloadingSelected(true);
    const videosToDownload = results.filter(v => selectedVideos.has(v.id));

    try {
      for (const video of videosToDownload) {
        const ext = video.type === 'image' ? 'jpg' : 'mp4';
        const filename = `${sanitizeFilename(video.title || video.id)}.${ext}`;
        const saved = await saveToChosenFolder(video.downloadUrl, filename);
        if (!saved) {
          window.open(video.downloadUrl, '_blank');
          await new Promise(resolve => setTimeout(resolve, 300));
        }
      }
      toast.success(
        downloadDirHandle
          ? `✅ ${videosToDownload.length} videos guardados en ${downloadDirHandle.name}`
          : `✅ Descarga de ${videosToDownload.length} videos iniciada`
      );
      setSelectedVideos(new Set());
    } catch (error) {
      toast.error('Error al descargar videos');
      console.error(error);
    } finally {
      setDownloadingSelected(false);
    }
  };

  const suggestedSearches = [
    'naturaleza', 'ciudad', 'océano', 'tecnología', 'gente',
    'animales', 'viaje', 'comida', 'deportes', 'musica',
  ];

  return (
    <div className="space-y-6">
      {/* Carpeta de destino de las descargas */}
      <div className="card flex items-center gap-3 flex-wrap">
        {downloadDirHandle ? (
          <FolderCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
        ) : (
          <FolderOpen className="w-4 h-4 text-gray-400 dark:text-zinc-500 shrink-0" />
        )}
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-gray-700 dark:text-zinc-300">Carpeta de destino de las descargas</p>
          <p className="text-[11px] text-gray-400 dark:text-zinc-500 truncate">
            {downloadDirHandle
              ? `Se está guardando en: ${downloadDirHandle.name}`
              : supportsFolderPicker
                ? 'Sin elegir — se usará la carpeta de descargas del navegador'
                : 'Tu navegador no soporta elegir carpeta (usa Chrome o Edge) — se usará la descarga normal'}
          </p>
        </div>
        {supportsFolderPicker && (
          <div className="flex gap-2 shrink-0">
            <button onClick={handleChooseFolder} className="btn-secondary py-1.5 px-3 text-xs flex items-center gap-1.5">
              <FolderOpen className="w-3.5 h-3.5" />
              {downloadDirHandle ? 'Cambiar carpeta' : 'Escoger carpeta'}
            </button>
            {downloadDirHandle && (
              <button
                onClick={() => setDownloadDirHandle(null)}
                title="Quitar carpeta elegida"
                className="p-1.5 text-gray-400 dark:text-zinc-500 hover:text-gray-700 dark:hover:text-zinc-200"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        )}
      </div>

      {/* Search Section */}
      <div className="card-lg">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-3 card-icon">
            <Video className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="card-title">Buscar Videos de Stock</h2>
            <p className="card-subtitle">
              Pixabay y Pexels - Completamente gratis
            </p>
          </div>
        </div>

        <div className="space-y-4">
          <div className="flex gap-2">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-3 w-5 h-5 text-gray-400 dark:text-zinc-600" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
                placeholder="Busca videos... naturaleza, ciudad, personas..."
                className="w-full pl-10 pr-4 py-3 bg-gray-50 dark:bg-zinc-950 border border-gray-200 dark:border-zinc-800 text-gray-900 dark:text-zinc-100 placeholder-gray-400 dark:placeholder-zinc-600 rounded-lg focus:border-accent-500 dark:focus:border-accent-600 focus:outline-none"
              />
            </div>
            <button
              onClick={() => handleSearch()}
              disabled={loading}
              className="btn-primary py-3 px-6 flex items-center gap-2"
            >
              {loading && <Loader className="w-5 h-5 animate-spin" />}
              Buscar
            </button>
          </div>

          <div className="flex items-center justify-between gap-4">
            <div>
              <label className="block text-gray-500 dark:text-zinc-400 text-xs font-medium mb-2">Tipo</label>
              <CustomSelect
                value={searchType}
                onChange={setSearchType}
                options={[
                  { value: 'videos', label: '🎬 Videos' },
                  { value: 'images', label: '🖼️ Imágenes' },
                ]}
              />
            </div>

            <div>
              <label className="block text-gray-500 dark:text-zinc-400 text-xs font-medium mb-2">Fuente</label>
              <CustomSelect
                value={source}
                onChange={setSource}
                options={[
                  { value: 'both', label: 'Ambas' },
                  { value: 'pixabay', label: 'Pixabay' },
                  { value: 'pexels', label: 'Pexels' },
                  { value: 'wikimedia', label: '📚 Wikimedia Commons (Gratis)' },
                ]}
              />
            </div>

            <div>
              <p className="text-gray-400 dark:text-zinc-500 text-[10px] mb-2">Búsquedas rápidas:</p>
              <div className="flex flex-wrap gap-2">
                {suggestedSearches.slice(0, 4).map(term => (
                  <button
                    key={term}
                    onClick={() => {
                      setQuery(term);
                      handleSearch(term);
                    }}
                    className="filter-chip"
                  >
                    {term}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Auto Download Section */}
      <div className="card-lg">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-3 card-icon">
            <Video className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="card-title">⚡ Descargar Automáticamente</h2>
            <p className="card-subtitle">
              Descarga videos por tema con configuración personalizada
            </p>
          </div>
        </div>

        <div className="space-y-4">
          {/* Tema Input */}
          <div>
            <label className="block text-gray-500 dark:text-zinc-400 text-xs font-medium mb-2">
              🎯 Tema
            </label>
            <input
              type="text"
              value={autoTheme}
              onChange={(e) => setAutoTheme(e.target.value)}
              placeholder="ej: agua, café, fuego, naturaleza..."
              className="w-full px-4 py-3 bg-gray-50 dark:bg-zinc-950 border border-gray-200 dark:border-zinc-800 text-gray-900 dark:text-zinc-100 placeholder-gray-400 dark:placeholder-zinc-600 rounded-lg focus:border-accent-500 dark:focus:border-accent-600 focus:outline-none"
            />
          </div>

          {/* Grid de configuración */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Min Duration */}
            <div>
              <label className="block text-gray-500 dark:text-zinc-400 text-xs font-medium mb-2">
                ⏱️ Duración Mín (seg)
              </label>
              <input
                type="number"
                value={minDuration}
                onChange={(e) => setMinDuration(parseInt(e.target.value) || 0)}
                min="0"
                className="w-full px-4 py-2 bg-gray-50 dark:bg-zinc-950 border border-gray-200 dark:border-zinc-800 text-gray-900 dark:text-zinc-100 rounded-lg focus:border-accent-500 dark:focus:border-accent-600 focus:outline-none"
              />
            </div>

            {/* Max Duration */}
            <div>
              <label className="block text-gray-500 dark:text-zinc-400 text-xs font-medium mb-2">
                ⏱️ Duración Máx (seg)
              </label>
              <input
                type="number"
                value={maxDuration}
                onChange={(e) => setMaxDuration(parseInt(e.target.value) || 60)}
                min="0"
                className="w-full px-4 py-2 bg-gray-50 dark:bg-zinc-950 border border-gray-200 dark:border-zinc-800 text-gray-900 dark:text-zinc-100 rounded-lg focus:border-accent-500 dark:focus:border-accent-600 focus:outline-none"
              />
            </div>

            {/* Resolution */}
            <div>
              <label className="block text-gray-500 dark:text-zinc-400 text-xs font-medium mb-2">
                📺 Resolución
              </label>
              <CustomSelect
                value={resolution}
                onChange={setResolution}
                options={[
                  { value: 'any', label: '🔀 Indistinta (cualquier calidad)' },
                  { value: '720p', label: '720p' },
                  { value: '1080p', label: '1080p' },
                  { value: '4k', label: '4K' },
                ]}
              />
            </div>

            {/* Quantity */}
            <div>
              <label className="block text-gray-500 dark:text-zinc-400 text-xs font-medium mb-2">
                🎬 Cantidad
              </label>
              <input
                type="number"
                value={quantity}
                onChange={(e) => setQuantity(parseInt(e.target.value) || 1)}
                min="1"
                max="1000"
                className="w-full px-4 py-2 bg-gray-50 dark:bg-zinc-950 border border-gray-200 dark:border-zinc-800 text-gray-900 dark:text-zinc-100 rounded-lg focus:border-accent-500 dark:focus:border-accent-600 focus:outline-none"
              />
              <p className="text-gray-400 dark:text-zinc-600 text-[10px] mt-1">
                Con "Indistinta" hay más videos disponibles para pedir cantidades grandes (ej. 300).
              </p>
            </div>
          </div>

          {/* Fuentes */}
          <div>
            <label className="block text-gray-500 dark:text-zinc-400 text-xs font-medium mb-2">
              🔗 Fuentes
            </label>
            <div className="flex gap-2">
              {(['pixabay', 'pexels'] as const).map(src => {
                const active = autoSources.includes(src);
                return (
                  <button
                    key={src}
                    type="button"
                    onClick={() =>
                      setAutoSources(active ? autoSources.filter(s => s !== src) : [...autoSources, src])
                    }
                    className={`filter-chip capitalize ${active ? 'filter-chip-active' : ''}`}
                  >
                    {src}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Download Button */}
          <button
            onClick={handleAutoDownload}
            disabled={autoLoading}
            className="btn-primary w-full py-3 px-6 flex items-center justify-center gap-2"
          >
            {autoLoading && <Loader className="w-5 h-5 animate-spin" />}
            {autoLoading ? 'Descargando...' : '⚡ Iniciar Descarga Automática'}
          </button>

          {downloadedVideos.length > 0 && (
            <div className="space-y-2 pt-2">
              {downloadedVideos.map(video => (
                <div
                  key={video.id}
                  className="flex items-center gap-3 bg-gray-50 dark:bg-zinc-950 border border-gray-200 dark:border-zinc-800 rounded-xl p-3"
                >
                  <span className="flex-1 text-sm text-gray-900 dark:text-zinc-100 truncate">{video.title || 'Video'}</span>
                  <span className="text-xs text-gray-400 dark:text-zinc-500 shrink-0">
                    {video.resolution} · {video.duration}s
                  </span>
                  <button
                    onClick={async () => {
                      const fullUrl = `${API_URL}${video.downloadUrl}`;
                      const filename = `${sanitizeFilename(video.title || 'video')}.mp4`;
                      const saved = await saveToChosenFolder(fullUrl, filename);
                      if (saved) {
                        toast.success(`✅ Guardado en ${downloadDirHandle.name}/${filename}`);
                        return;
                      }
                      const a = document.createElement('a');
                      a.href = fullUrl;
                      a.download = filename;
                      a.click();
                    }}
                    className="flex items-center gap-1.5 text-xs font-semibold text-accent-600 dark:text-accent-400 hover:underline shrink-0"
                  >
                    <Download className="w-3.5 h-3.5" /> Descargar
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Search History */}
      {searchHistory.length > 0 && (
        <div className="card">
          <p className="text-gray-500 dark:text-zinc-400 text-xs font-medium mb-3">
            Búsquedas Recientes
          </p>
          <div className="flex flex-wrap gap-2">
            {searchHistory.map((term, idx) => (
              <button
                key={idx}
                onClick={() => {
                  setQuery(term);
                  handleSearch(term);
                }}
                className="filter-chip"
              >
                {term}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Results Grid */}
      {results.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-4">
            <h3 className="text-gray-900 dark:text-zinc-100 text-sm font-medium flex items-center gap-2">
              <Video className="w-4 h-4 text-accent-600 dark:text-accent-400" />
              Resultados ({results.length}) {selectedVideos.size > 0 && <span className="text-accent-600 dark:text-accent-400 text-xs">- {selectedVideos.size} seleccionados</span>}
            </h3>

            <div className="flex gap-2">
              <button
                onClick={toggleSelectAll}
                className="px-4 py-2 text-sm rounded-xl bg-accent-50 dark:bg-accent-950/50 border border-accent-300 dark:border-accent-700 text-accent-700 dark:text-accent-300 hover:border-accent-400 dark:hover:border-accent-600 transition-colors flex items-center gap-2"
              >
                <CheckSquare className="w-4 h-4" />
                {selectedVideos.size === results.length && selectedVideos.size > 0 ? 'Desmarcar Todo' : 'Seleccionar Todo'}
              </button>

              {selectedVideos.size > 0 && (
                <button
                  onClick={downloadSelected}
                  disabled={downloadingSelected}
                  className="px-4 py-2 text-sm rounded-xl bg-emerald-50 dark:bg-emerald-950 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400 hover:border-emerald-300 dark:hover:border-emerald-700 transition-colors flex items-center gap-2 disabled:opacity-50"
                >
                  <Download className="w-4 h-4" />
                  {downloadingSelected ? 'Descargando...' : `Descargar (${selectedVideos.size})`}
                </button>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
            {results.map(video => (
              <div
                key={video.id}
                className={`card overflow-hidden h-fit transition-all ${
                  selectedVideos.has(video.id)
                    ? 'ring-2 ring-accent-500 bg-accent-50/60 dark:bg-accent-950/40'
                    : 'hover:border-gray-300 dark:hover:border-zinc-600'
                }`}
              >
                {/* Video Thumbnail */}
                <div className="relative mb-2 -mx-4 -mt-4 overflow-hidden rounded-t-xl aspect-video">
                  <img
                    src={video.thumbnail}
                    alt={video.title}
                    className="w-full h-full object-cover hover:scale-110 transition-transform duration-300"
                  />
                  <div className="absolute inset-0 bg-black/30 hover:bg-black/10 transition-colors" />

                  {/* Checkbox de selección — chip circular sobre la miniatura */}
                  <button
                    type="button"
                    onClick={() => toggleVideoSelection(video.id)}
                    aria-pressed={selectedVideos.has(video.id)}
                    aria-label="Seleccionar video"
                    className={`absolute top-2 left-2 z-10 w-6 h-6 rounded-full flex items-center justify-center backdrop-blur-sm border transition-colors ${
                      selectedVideos.has(video.id)
                        ? 'bg-accent-600 border-accent-600 text-white'
                        : 'bg-white/70 dark:bg-zinc-900/60 border-white/70 dark:border-zinc-700/70 text-transparent hover:bg-white/90 dark:hover:bg-zinc-900/90'
                    }`}
                  >
                    <Check className="w-3.5 h-3.5" />
                  </button>

                  {/* Duration Badge */}
                  {video.duration > 0 && (
                    <div className="absolute bottom-2 right-2 px-2 py-1 bg-black/60 backdrop-blur-sm rounded-md text-xs font-medium text-white">
                      {Math.floor(video.duration / 60)}:{String(video.duration % 60).padStart(2, '0')}
                    </div>
                  )}
                </div>

                {/* Video Info */}
                <div className="flex-1 space-y-3 mb-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h4 className="text-gray-900 dark:text-zinc-100 font-medium text-sm line-clamp-2">
                        {video.title}
                      </h4>
                      <p className="text-gray-400 dark:text-zinc-600 text-xs mt-1">
                        {video.width}x{video.height}
                      </p>
                    </div>
                    <span className="shrink-0 text-xs px-2 py-1 rounded-full bg-accent-50 dark:bg-accent-950/50 border border-accent-300 dark:border-accent-700 text-accent-700 dark:text-accent-300">
                      {video.source}
                    </span>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex gap-2">
                  <button
                    onClick={() => window.open(video.url, '_blank')}
                    className="flex-1 btn-secondary py-2 text-sm flex items-center justify-center gap-2"
                  >
                    <ExternalLink className="w-4 h-4" />
                    Ver
                  </button>
                  <button
                    onClick={() => handleDownloadVideo(video)}
                    className="flex-1 btn-primary py-2 text-sm flex items-center justify-center gap-2"
                  >
                    <Video className="w-4 h-4" />
                    Descargar
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {!loading && results.length === 0 && query && (
        <div className="card-lg text-center py-12">
          <div className="empty-state-icon">
            <Video className="w-6 h-6" />
          </div>
          <p className="card-subtitle">
            No se encontraron videos. Intenta con otras palabras clave.
          </p>
        </div>
      )}

      {!loading && results.length === 0 && !query && (
        <div className="card-lg text-center py-12">
          <div className="empty-state-icon">
            <Video className="w-6 h-6" />
          </div>
          <p className="text-gray-400 dark:text-zinc-500 text-sm mb-6">
            Busca videos de stock para intercalar en tu proyecto
          </p>
          <div className="flex flex-wrap gap-2 justify-center">
            {suggestedSearches.map(term => (
              <button
                key={term}
                onClick={() => {
                  setQuery(term);
                  handleSearch(term);
                }}
                className="btn-primary px-4 py-2 text-sm"
              >
                {term}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
