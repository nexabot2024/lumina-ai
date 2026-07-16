import { useState } from 'react';
import { Video, Search, Loader, ExternalLink } from 'lucide-react';
import toast from 'react-hot-toast';
import axios from 'axios';

interface StockVideo {
  id: string;
  source: 'pixabay' | 'pexels';
  title: string;
  url: string;
  thumbnail: string;
  duration: number;
  width: number;
  height: number;
  downloadUrl: string;
}

export default function StockVideoSearch() {
  const [query, setQuery] = useState('');
  const [source, setSource] = useState<'both' | 'pixabay' | 'pexels'>('both');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<StockVideo[]>([]);
  const [searchHistory, setSearchHistory] = useState<string[]>([]);

  const handleSearch = async (searchQuery?: string) => {
    const queryToUse = searchQuery || query;
    if (!queryToUse.trim()) {
      toast.error('Escribe una búsqueda');
      return;
    }

    setLoading(true);
    try {
      const response = await axios.post('/api/videos/search-videos', {
        query: queryToUse,
        source,
        limit: 12,
      });

      setResults(response.data.videos);
      setSearchHistory(prev => {
        const updated = [queryToUse, ...prev].slice(0, 5);
        return updated;
      });

      toast.success(`✨ ${response.data.count} videos encontrados`);
    } catch (error) {
      toast.error('Error al buscar videos');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadVideo = (video: StockVideo) => {
    window.open(video.downloadUrl, '_blank');
    toast.success('Descarga iniciada...');
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
          <div className="p-3 bg-gradient-to-r from-cyan-500 to-blue-500 rounded-lg">
            <Video className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-2xl font-bold">Buscar Videos de Stock</h2>
            <p className="text-gray-400 text-sm">
              Pixabay y Pexels - Completamente gratis
            </p>
          </div>
        </div>

        <div className="space-y-4">
          <div className="flex gap-2">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-3 w-5 h-5 text-gray-500" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
                placeholder="Busca videos... naturaleza, ciudad, personas..."
                className="w-full pl-10 pr-4 py-3 bg-gray-900/50 border border-white/10 rounded-lg text-white placeholder-gray-500 focus:border-cyan-500/50 focus:outline-none"
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

          <div className="flex items-center justify-between">
            <div>
              <label className="block text-sm font-semibold mb-2">Fuente</label>
              <select
                value={source}
                onChange={(e) =>
                  setSource(e.target.value as 'both' | 'pixabay' | 'pexels')
                }
                className="px-4 py-2 bg-gray-900/50 border border-white/10 rounded-lg text-white focus:border-cyan-500/50 focus:outline-none"
              >
                <option value="both">Ambas</option>
                <option value="pixabay">Pixabay</option>
                <option value="pexels">Pexels</option>
              </select>
            </div>

            <div>
              <p className="text-xs text-gray-400 mb-2">Búsquedas rápidas:</p>
              <div className="flex flex-wrap gap-2">
                {suggestedSearches.slice(0, 4).map(term => (
                  <button
                    key={term}
                    onClick={() => {
                      setQuery(term);
                      handleSearch(term);
                    }}
                    className="px-3 py-1 text-xs rounded-full bg-cyan-950/50 border border-cyan-500/30 text-cyan-300 hover:border-cyan-500/60 transition-colors"
                  >
                    {term}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Search History */}
      {searchHistory.length > 0 && (
        <div className="card">
          <p className="text-sm font-semibold text-gray-300 mb-3">
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
                className="px-3 py-1 text-sm rounded-full bg-white/10 hover:bg-white/20 text-gray-300 border border-white/10 transition-colors"
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
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <Video className="w-5 h-5 text-cyan-400" />
            Resultados ({results.length})
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {results.map(video => (
              <div key={video.id} className="card overflow-hidden hover:border-cyan-500/50">
                {/* Video Thumbnail */}
                <div className="relative mb-4 -mx-6 -mt-6 overflow-hidden rounded-t-xl">
                  <img
                    src={video.thumbnail}
                    alt={video.title}
                    className="w-full h-40 object-cover hover:scale-110 transition-transform duration-300"
                  />
                  <div className="absolute inset-0 bg-black/30 hover:bg-black/10 transition-colors" />

                  {/* Duration Badge */}
                  {video.duration > 0 && (
                    <div className="absolute bottom-2 right-2 px-2 py-1 bg-black/70 rounded text-xs font-semibold">
                      {Math.floor(video.duration / 60)}:{String(video.duration % 60).padStart(2, '0')}
                    </div>
                  )}
                </div>

                {/* Video Info */}
                <div className="flex-1 space-y-3 mb-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <h4 className="font-semibold text-sm line-clamp-2">
                        {video.title}
                      </h4>
                      <p className="text-xs text-gray-400 mt-1">
                        {video.width}x{video.height}
                      </p>
                    </div>
                    <span className="text-xs px-2 py-1 rounded-full bg-cyan-950/50 text-cyan-300 border border-cyan-500/30">
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
          <Video className="w-12 h-12 text-gray-600 mx-auto mb-3" />
          <p className="text-gray-400">
            No se encontraron videos. Intenta con otras palabras clave.
          </p>
        </div>
      )}

      {!loading && results.length === 0 && !query && (
        <div className="card-lg text-center py-12">
          <Video className="w-12 h-12 text-gray-600 mx-auto mb-3" />
          <p className="text-gray-400 mb-6">
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
                className="px-4 py-2 rounded-lg bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-600 hover:to-blue-600 text-white font-semibold transition-all"
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
