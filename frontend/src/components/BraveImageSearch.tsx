import { FormEvent, useState } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import { Download, FolderCheck, FolderOpen, Globe2, Loader2, Search, X } from 'lucide-react';
import { API_URL } from '../services/apiUrl';

interface BraveImage {
  id: string;
  title: string;
  pageUrl: string;
  source: string;
  thumbnailUrl: string;
  imageUrl: string;
  width?: number;
  height?: number;
  searchTerm?: string;
}

const supportsFolderPicker = typeof window !== 'undefined' && 'showDirectoryPicker' in window;

function sanitizeFilename(value: string): string {
  return value.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').trim().slice(0, 100) || 'imagen-brave';
}

export default function BraveImageSearch() {
  const [query, setQuery] = useState('');
  const [images, setImages] = useState<BraveImage[]>([]);
  const [loading, setLoading] = useState(false);
  const [count, setCount] = useState(100);
  const [minWidth, setMinWidth] = useState(1280);
  const [minHeight, setMinHeight] = useState(720);
  const [downloadDirHandle, setDownloadDirHandle] = useState<any>(null);
  const [downloadProgress, setDownloadProgress] = useState<{ done: number; total: number } | null>(null);

  const chooseFolder = async () => {
    try {
      const handle = await (window as any).showDirectoryPicker({ mode: 'readwrite' });
      setDownloadDirHandle(handle);
      toast.success(`Carpeta seleccionada: ${handle.name}`);
    } catch (error: any) {
      if (error?.name !== 'AbortError') toast.error('No se pudo seleccionar la carpeta');
    }
  };

  const downloadAllImages = async () => {
    if (!downloadDirHandle) return toast.error('Elige primero una carpeta de destino');
    if (!images.length) return;
    setDownloadProgress({ done: 0, total: images.length });
    let completed = 0;
    let failed = 0;
    for (let index = 0; index < images.length; index += 3) {
      const batch = images.slice(index, index + 3);
      await Promise.all(batch.map(async (image) => {
        try {
          const permission = await downloadDirHandle.queryPermission({ mode: 'readwrite' });
          const granted = permission === 'granted' || await downloadDirHandle.requestPermission({ mode: 'readwrite' }) === 'granted';
          if (!granted) throw new Error('Permiso de carpeta denegado');
          const response = await fetch(`${API_URL}/api/brave-search/images/download/${image.id}`);
          if (!response.ok) throw new Error('No se pudo descargar');
          const extension = response.headers.get('content-type')?.includes('png') ? 'png' : response.headers.get('content-type')?.includes('webp') ? 'webp' : 'jpg';
          const fileName = `${sanitizeFilename(image.searchTerm || 'brave')}-${sanitizeFilename(image.title)}-${image.id.slice(0, 8)}.${extension}`;
          const fileHandle = await downloadDirHandle.getFileHandle(fileName, { create: true });
          const writable = await fileHandle.createWritable();
          await writable.write(await response.blob());
          await writable.close();
          completed++;
        } catch (error) {
          failed++;
          console.error('No se pudo guardar una imagen:', error);
        } finally {
          setDownloadProgress({ done: completed + failed, total: images.length });
        }
      }));
    }
    setDownloadProgress(null);
    if (failed) toast.error(`${completed} imágenes guardadas; ${failed} no se pudieron descargar`);
    else toast.success(`${completed} imágenes guardadas en ${downloadDirHandle.name}`);
  };

  const removeImage = (id: string) => {
    setImages((prev) => prev.filter((image) => image.id !== id));
  };

  const handleSearch = async (event: FormEvent) => {
    event.preventDefault();
    const terms = [...new Set(query.split('\n').map((term) => term.trim()).filter(Boolean))];
    if (!terms.length) return toast.error('Escribe al menos un tema');
    if (terms.length > 10) return toast.error('Puedes buscar hasta 10 temas a la vez');
    setLoading(true);
    try {
      const allImages: BraveImage[] = [];
      for (let index = 0; index < terms.length; index += 3) {
        const batch = terms.slice(index, index + 3);
        const responses = await Promise.all(batch.map((term) => axios.get(`${API_URL}/api/brave-search/images`, {
          params: { query: term, count, country: 'ES', searchLang: 'es', minWidth, minHeight },
        })));
        responses.forEach((response, batchIndex) => {
          allImages.push(...(response.data.results || []).map((image: BraveImage) => ({ ...image, searchTerm: batch[batchIndex] })));
        });
      }
      // Varios temas suelen devolver la misma foto (ej. "Prince Philip" y "Queen
      // Elizabeth" comparten fotos juntos) — se deduplica por la URL real de la imagen
      // (lo que se descarga), no por id, para no bajar dos veces el mismo archivo.
      const seenUrls = new Set<string>();
      const dedupedImages = allImages.filter((image) => {
        const key = image.imageUrl || image.id;
        if (seenUrls.has(key)) return false;
        seenUrls.add(key);
        return true;
      });
      const duplicateCount = allImages.length - dedupedImages.length;
      setImages(dedupedImages);
      toast.success(
        `${dedupedImages.length} imágenes encontradas para ${terms.length} tema${terms.length === 1 ? '' : 's'}` +
          (duplicateCount > 0 ? ` (${duplicateCount} repetida${duplicateCount === 1 ? '' : 's'} descartada${duplicateCount === 1 ? '' : 's'})` : '')
      );
    } catch (error: any) {
      toast.error(error.response?.data?.details || error.response?.data?.error || 'No se pudieron buscar imágenes');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="card-lg">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-3 card-icon"><Globe2 className="w-5 h-5 text-white" /></div>
          <div><h2 className="card-title">Brave Imágenes</h2><p className="card-subtitle">Busca imágenes en la web y descárgalas directamente.</p></div>
        </div>
        <form onSubmit={handleSearch} className="flex flex-col sm:flex-row gap-3">
          <textarea value={query} onChange={(event) => setQuery(event.target.value)} disabled={loading} rows={3} placeholder={'Un tema por línea:\ncoche futurista\nciudad cyberpunk nocturna'} className="flex-1 min-w-0 px-4 py-3 rounded-xl bg-gray-50 dark:bg-zinc-950 border border-gray-200 dark:border-zinc-800 text-gray-900 dark:text-zinc-100 placeholder:text-gray-400 dark:placeholder:text-zinc-600 focus:outline-none focus:border-accent-500 resize-y" />
          <input
            type="number"
            min="1"
            max="200"
            value={count}
            onChange={(event) => setCount(Math.min(200, Math.max(1, Number(event.target.value) || 1)))}
            disabled={loading}
            aria-label="Número de imágenes"
            title="Número de imágenes (de 1 a 200)"
            className="w-28 px-3 py-3 rounded-xl bg-gray-50 dark:bg-zinc-950 border border-gray-200 dark:border-zinc-800 text-sm text-gray-700 dark:text-zinc-300 focus:outline-none focus:border-accent-500"
          />
          <input type="number" min="0" value={minWidth} onChange={(e) => setMinWidth(Math.max(0, Number(e.target.value) || 0))} disabled={loading} aria-label="Ancho mínimo" title="Ancho mínimo en píxeles" className="w-24 px-3 py-3 rounded-xl bg-gray-50 dark:bg-zinc-950 border border-gray-200 dark:border-zinc-800 text-sm text-gray-700 dark:text-zinc-300 focus:outline-none focus:border-accent-500" />
          <input type="number" min="0" value={minHeight} onChange={(e) => setMinHeight(Math.max(0, Number(e.target.value) || 0))} disabled={loading} aria-label="Alto mínimo" title="Alto mínimo en píxeles" className="w-24 px-3 py-3 rounded-xl bg-gray-50 dark:bg-zinc-950 border border-gray-200 dark:border-zinc-800 text-sm text-gray-700 dark:text-zinc-300 focus:outline-none focus:border-accent-500" />
          <button type="submit" disabled={loading} className="btn-primary px-5 py-3 flex items-center justify-center gap-2">{loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Search className="w-5 h-5" />}{loading ? 'Buscando...' : 'Buscar imágenes'}</button>
        </form>
      </div>
      <div className="card flex items-center gap-3 flex-wrap">
        {downloadDirHandle ? <FolderCheck className="w-5 h-5 text-emerald-600 dark:text-emerald-400" /> : <FolderOpen className="w-5 h-5 text-gray-400 dark:text-zinc-500" />}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-700 dark:text-zinc-300">Carpeta de descarga automática</p>
          <p className="text-xs text-gray-400 dark:text-zinc-500 truncate">{downloadDirHandle ? `Las imágenes se guardarán en: ${downloadDirHandle.name}` : supportsFolderPicker ? 'Elige una carpeta para descargar todas las imágenes ahí' : 'Usa Chrome o Edge para elegir una carpeta'}</p>
        </div>
        {supportsFolderPicker && <button onClick={chooseFolder} disabled={!!downloadProgress} className="btn-secondary py-2 px-3 text-sm">{downloadDirHandle ? 'Cambiar carpeta' : 'Elegir carpeta'}</button>}
        {downloadDirHandle && images.length > 0 && <button onClick={downloadAllImages} disabled={!!downloadProgress} className="btn-primary py-2 px-3 text-sm flex items-center gap-2"><Download className="w-4 h-4" />{downloadProgress ? `Descargando ${downloadProgress.done}/${downloadProgress.total}` : `Descargar ${images.length} imágenes`}</button>}
      </div>
      {images.length > 0 && <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
        {images.map((image) => <div key={image.id} className="card p-2 group overflow-hidden">
          <div className="relative aspect-square overflow-hidden rounded-lg bg-gray-100 dark:bg-zinc-900">
            <a href={image.pageUrl} target="_blank" rel="noreferrer" title={image.title} className="block w-full h-full"><img src={image.thumbnailUrl} alt={image.title} loading="lazy" className="w-full h-full object-cover transition-transform duration-200 group-hover:scale-105" /></a>
            <button
              type="button"
              onClick={() => removeImage(image.id)}
              title="Quitar esta imagen"
              aria-label="Quitar esta imagen"
              className="absolute top-1.5 right-1.5 z-10 w-6 h-6 rounded-full flex items-center justify-center bg-black/60 backdrop-blur-sm text-white hover:bg-red-500 transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          <p className="mt-2 truncate text-xs font-medium text-gray-700 dark:text-zinc-300" title={image.title}>{image.title}</p>
          <p className="mt-1 truncate text-[10px] text-gray-400 dark:text-zinc-500">{image.source}{image.width && image.height ? ` · ${image.width}×${image.height}` : ''}</p>
          {image.searchTerm && <p className="mt-1 truncate text-[10px] text-accent-600 dark:text-accent-400" title={image.searchTerm}>Tema: {image.searchTerm}</p>}
          <a href={`${API_URL}/api/brave-search/images/download/${image.id}`} className="btn-secondary mt-2 w-full py-1.5 text-xs flex items-center justify-center gap-1.5"><Download className="w-3.5 h-3.5" />Descargar</a>
        </div>)}
      </div>}
      {!loading && images.length === 0 && <div className="card-lg text-center py-12"><p className="card-subtitle">Busca un concepto para traer imágenes desde Brave.</p></div>}
    </div>
  );
}
