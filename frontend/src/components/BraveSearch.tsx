import { FormEvent, useState } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import { ExternalLink, Globe2, Loader2, Search } from 'lucide-react';
import { API_URL } from '../services/apiUrl';

interface BraveResult {
  title: string;
  url: string;
  description: string;
  age?: string;
  extraSnippets: string[];
}

export default function BraveSearch() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<BraveResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  const handleSearch = async (event: FormEvent) => {
    event.preventDefault();
    const trimmedQuery = query.trim();
    if (!trimmedQuery) {
      toast.error('Escribe qué quieres investigar');
      return;
    }

    setLoading(true);
    try {
      const response = await axios.get(`${API_URL}/api/brave-search/search`, {
        params: { query: trimmedQuery, count: 10, country: 'ES', searchLang: 'es' },
      });
      setResults(response.data.results || []);
      setHasSearched(true);
      toast.success(`${response.data.count || 0} fuentes encontradas`);
    } catch (error: any) {
      const message = error.response?.data?.details || error.response?.data?.error || 'No se pudo buscar ahora';
      toast.error(message);
      console.error('Error en Brave Search:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="card-lg">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-3 card-icon"><Globe2 className="w-5 h-5 text-white" /></div>
          <div>
            <h2 className="card-title">Brave Search</h2>
            <p className="card-subtitle">Investiga fuentes actuales para inspirar y documentar tu contenido.</p>
          </div>
        </div>

        <form onSubmit={handleSearch} className="flex flex-col sm:flex-row gap-3">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Ej.: tendencias de inteligencia artificial para 2026"
            className="flex-1 min-w-0 px-4 py-3 rounded-xl bg-gray-50 dark:bg-zinc-950 border border-gray-200 dark:border-zinc-800 text-gray-900 dark:text-zinc-100 placeholder:text-gray-400 dark:placeholder:text-zinc-600 focus:outline-none focus:border-accent-500"
            disabled={loading}
          />
          <button type="submit" disabled={loading} className="btn-primary px-5 py-3 flex items-center justify-center gap-2">
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Search className="w-5 h-5" />}
            {loading ? 'Buscando...' : 'Buscar'}
          </button>
        </form>
      </div>

      {hasSearched && results.length === 0 && !loading && (
        <div className="card-lg text-center py-12">
          <p className="card-subtitle">No se encontraron resultados. Prueba con otros términos.</p>
        </div>
      )}

      {results.length > 0 && (
        <div className="space-y-3">
          <p className="text-sm font-medium text-gray-700 dark:text-zinc-300">Fuentes encontradas</p>
          {results.map((result) => (
            <a key={result.url} href={result.url} target="_blank" rel="noreferrer" className="card block hover-lift group">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <h3 className="text-sm font-semibold text-accent-700 dark:text-accent-300 group-hover:underline">{result.title}</h3>
                  <p className="mt-1 text-xs text-emerald-700 dark:text-emerald-400 truncate">{result.url}</p>
                  {result.age && <p className="mt-1 text-[11px] text-gray-400 dark:text-zinc-500">{result.age}</p>}
                  <p className="mt-3 text-sm text-gray-600 dark:text-zinc-400 leading-relaxed">{result.description}</p>
                  {result.extraSnippets.slice(0, 2).map((snippet) => (
                    <p key={snippet} className="mt-2 text-xs text-gray-500 dark:text-zinc-500">{snippet}</p>
                  ))}
                </div>
                <ExternalLink className="w-4 h-4 mt-1 shrink-0 text-gray-400 group-hover:text-accent-600" />
              </div>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
