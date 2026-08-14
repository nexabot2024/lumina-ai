import { useState } from 'react';
import { Video, Search, Loader, ExternalLink, Download, CheckSquare } from 'lucide-react';
import toast from 'react-hot-toast';
import axios from 'axios';

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
  const [resolution, setResolution] = useState<'720p' | '1080p' | '4k'>('1080p');
  const [quantity, setQuantity] = useState(3);
  const [downloadFolder, setDownloadFolder] = useState('C:\\Downloads\\VidSpa\\Stock');
  const [autoSources, setAutoSources] = useState<('pixabay' | 'pexels')[]>(['pexels']);
  const [autoLoading, setAutoLoading] = useState(false);

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
        response = await axios.get(`/api/wikimedia/${type === 'image' ? 'images' : 'videos'}`, {
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
        const endpoint = searchType === 'videos' ? '/api/videos/search-videos' : '/api/videos/search-images';
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

  const handleDownloadVideo = (video: StockVideo) => {
    window.open(video.downloadUrl, '_blank');
    toast.success('Descarga iniciada...');
  };

  const handleAutoDownload = async () => {
    if (!autoTheme.trim()) {
      toast.error('Escribe un tema para descargar');
      return;
    }

    if (!downloadFolder.trim()) {
      toast.error('Especifica una carpeta de descarga');
      return;
    }

    setAutoLoading(true);
    try {
      const response = await axios.post('/api/videos/download-auto', {
        theme: autoTheme,
        minDuration,
        maxDuration,
        resolution,
        quantity,
        outputFolder: downloadFolder,
        sources: autoSources,
      });

      if (response.data.results && response.data.results.length > 0) {
        const videosDownloaded = response.data.results.map((video: any) => ({
          id: video.id,
          title: video.title,
          source: video.source,
          path: video.filePath,
          duration: video.duration,
          resolution: video.resolution,
          downloadedAt: video.downloadedAt,
        }));

        toast.success(
          `✅ ${videosDownloaded.length} videos descargados con duraciones reales detectadas!`
        );

        // Display downloaded videos
        setResults(videosDownloaded as any);
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
        window.open(video.downloadUrl, '_blank');
        await new Promise(resolve => setTimeout(resolve, 300));
      }
      toast.success(`✅ Descarga de ${videosToDownload.length} videos iniciada`);
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
      {/* Search Section */}
      <div className="card-lg">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2.5 bg-accent-600 rounded-lg">
            <Video className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="text-gray-900 dark:text-zinc-100 text-sm font-medium">Buscar Videos de Stock</h2>
            <p className="text-gray-400 dark:text-zinc-500 text-[10px]">
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
              <select
                value={searchType}
                onChange={(e) =>
                  setSearchType(e.target.value as 'videos' | 'images')
                }
                className="px-4 py-2 bg-gray-50 dark:bg-zinc-950 border border-gray-200 dark:border-zinc-800 text-gray-700 dark:text-zinc-300 rounded-lg focus:border-accent-500 dark:focus:border-accent-600 focus:outline-none"
              >
                <option value="videos">🎬 Videos</option>
                <option value="images">🖼️ Imágenes</option>
              </select>
            </div>

            <div>
              <label className="block text-gray-500 dark:text-zinc-400 text-xs font-medium mb-2">Fuente</label>
              <select
                value={source}
                onChange={(e) =>
                  setSource(e.target.value as 'both' | 'pixabay' | 'pexels' | 'wikimedia')
                }
                className="px-4 py-2 bg-gray-50 dark:bg-zinc-950 border border-gray-200 dark:border-zinc-800 text-gray-700 dark:text-zinc-300 rounded-lg focus:border-accent-500 dark:focus:border-accent-600 focus:outline-none"
              >
                <option value="both">Ambas</option>
                <option value="pixabay">Pixabay</option>
                <option value="pexels">Pexels</option>
                <option value="wikimedia">📚 Wikimedia Commons (Gratis)</option>
              </select>
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
                    className="px-3 py-1 text-xs rounded-full border border-gray-200 dark:border-zinc-700 text-gray-500 dark:text-zinc-400 hover:border-gray-300 dark:hover:border-zinc-600 transition-colors"
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
          <div className="p-2.5 bg-accent-600 rounded-lg">
            <Video className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="text-gray-900 dark:text-zinc-100 text-sm font-medium">⚡ Descargar Automáticamente</h2>
            <p className="text-gray-400 dark:text-zinc-500 text-[10px]">
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
              <select
                value={resolution}
                onChange={(e) =>
                  setResolution(e.target.value as '720p' | '1080p' | '4k')
                }
                className="w-full px-4 py-2 bg-gray-50 dark:bg-zinc-950 border border-gray-200 dark:border-zinc-800 text-gray-700 dark:text-zinc-300 rounded-lg focus:border-accent-500 dark:focus:border-accent-600 focus:outline-none"
              >
                <option value="720p">720p</option>
                <option value="1080p">1080p</option>
                <option value="4k">4K</option>
              </select>
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
                max="10"
                className="w-full px-4 py-2 bg-gray-50 dark:bg-zinc-950 border border-gray-200 dark:border-zinc-800 text-gray-900 dark:text-zinc-100 rounded-lg focus:border-accent-500 dark:focus:border-accent-600 focus:outline-none"
              />
            </div>
          </div>

          {/* Carpeta de descarga */}
          <div>
            <label className="block text-gray-500 dark:text-zinc-400 text-xs font-medium mb-2">
              📁 Carpeta de Descarga
            </label>
            <input
              type="text"
              value={downloadFolder}
              onChange={(e) => setDownloadFolder(e.target.value)}
              placeholder="C:\Downloads\VidSpa\Stock"
              className="w-full px-4 py-2 bg-gray-50 dark:bg-zinc-950 border border-gray-200 dark:border-zinc-800 text-gray-900 dark:text-zinc-100 placeholder-gray-400 dark:placeholder-zinc-600 rounded-lg focus:border-accent-500 dark:focus:border-accent-600 focus:outline-none text-sm"
            />
            <p className="text-gray-400 dark:text-zinc-500 text-[10px] mt-1">Ruta donde se guardarán los videos descargados</p>
          </div>

          {/* Fuentes */}
          <div>
            <label className="block text-gray-500 dark:text-zinc-400 text-xs font-medium mb-2">
              🔗 Fuentes
            </label>
            <div className="flex gap-4">
              <label className="flex items-center gap-2 text-gray-700 dark:text-zinc-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={autoSources.includes('pixabay')}
                  onChange={(e) => {
                    if (e.target.checked) {
                      setAutoSources([...autoSources, 'pixabay']);
                    } else {
                      setAutoSources(autoSources.filter(s => s !== 'pixabay'));
                    }
                  }}
                  className="w-4 h-4 rounded border-gray-300 dark:border-zinc-700 text-accent-600 cursor-pointer"
                />
                Pixabay
              </label>
              <label className="flex items-center gap-2 text-gray-700 dark:text-zinc-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={autoSources.includes('pexels')}
                  onChange={(e) => {
                    if (e.target.checked) {
                      setAutoSources([...autoSources, 'pexels']);
                    } else {
                      setAutoSources(autoSources.filter(s => s !== 'pexels'));
                    }
                  }}
                  className="w-4 h-4 rounded border-gray-300 dark:border-zinc-700 text-accent-600 cursor-pointer"
                />
                Pexels
              </label>
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
                className="px-3 py-1 text-sm rounded-full border border-gray-200 dark:border-zinc-700 text-gray-500 dark:text-zinc-400 hover:border-gray-300 dark:hover:border-zinc-600 transition-colors"
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
                className="px-4 py-2 text-sm rounded-lg bg-accent-50 dark:bg-accent-950/50 border border-accent-300 dark:border-accent-700 text-accent-700 dark:text-accent-300 hover:border-accent-400 dark:hover:border-accent-600 transition-colors flex items-center gap-2"
              >
                <CheckSquare className="w-4 h-4" />
                {selectedVideos.size === results.length && selectedVideos.size > 0 ? 'Desmarcar Todo' : 'Seleccionar Todo'}
              </button>

              {selectedVideos.size > 0 && (
                <button
                  onClick={downloadSelected}
                  disabled={downloadingSelected}
                  className="px-4 py-2 text-sm rounded-lg bg-emerald-50 dark:bg-emerald-950 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400 hover:border-emerald-300 dark:hover:border-emerald-700 transition-colors flex items-center gap-2 disabled:opacity-50"
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
                    ? 'border-accent-300 dark:border-accent-700 bg-accent-50 dark:bg-accent-950/50'
                    : 'hover:border-gray-300 dark:hover:border-zinc-600'
                }`}
              >
                {/* Checkbox */}
                <div className="absolute top-2 left-2 z-10">
                  <input
                    type="checkbox"
                    checked={selectedVideos.has(video.id)}
                    onChange={() => toggleVideoSelection(video.id)}
                    className="w-5 h-5 rounded border-gray-300 dark:border-zinc-600 text-accent-600 cursor-pointer"
                  />
                </div>

                {/* Video Thumbnail */}
                <div className="relative mb-2 -mx-4 -mt-4 overflow-hidden rounded-t-xl aspect-video">
                  <img
                    src={video.thumbnail}
                    alt={video.title}
                    className="w-full h-full object-cover hover:scale-110 transition-transform duration-300"
                  />
                  <div className="absolute inset-0 bg-black/30 hover:bg-black/10 transition-colors" />

                  {/* Duration Badge */}
                  {video.duration > 0 && (
                    <div className="absolute bottom-2 right-2 px-2 py-1 bg-black/70 rounded text-xs font-medium text-white">
                      {Math.floor(video.duration / 60)}:{String(video.duration % 60).padStart(2, '0')}
                    </div>
                  )}
                </div>

                {/* Video Info */}
                <div className="flex-1 space-y-3 mb-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <h4 className="text-gray-900 dark:text-zinc-100 font-medium text-sm line-clamp-2">
                        {video.title}
                      </h4>
                      <p className="text-gray-400 dark:text-zinc-600 text-xs mt-1">
                        {video.width}x{video.height}
                      </p>
                    </div>
                    <span className="text-xs px-2 py-1 rounded-full bg-accent-50 dark:bg-accent-950/50 border border-accent-300 dark:border-accent-700 text-accent-700 dark:text-accent-300">
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
          <Video className="w-10 h-10 text-gray-300 dark:text-zinc-700 mx-auto mb-3" />
          <p className="text-gray-400 dark:text-zinc-500 text-sm">
            No se encontraron videos. Intenta con otras palabras clave.
          </p>
        </div>
      )}

      {!loading && results.length === 0 && !query && (
        <div className="card-lg text-center py-12">
          <Video className="w-10 h-10 text-gray-300 dark:text-zinc-700 mx-auto mb-3" />
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
