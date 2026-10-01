import { useEffect, useState } from 'react';
import { Palette, ExternalLink, Download, Loader, Unlink } from 'lucide-react';
import toast from 'react-hot-toast';
import axios from 'axios';
import { API_URL } from '../services/apiUrl';

interface CanvaDesign {
  id: string;
  title: string;
  thumbnailUrl?: string;
  editUrl?: string;
}

type ExportFormat = 'png' | 'jpg' | 'pdf' | 'mp4';

export default function CanvaImporter() {
  const [connected, setConnected] = useState<boolean | null>(null);
  const [designs, setDesigns] = useState<CanvaDesign[]>([]);
  const [loadingDesigns, setLoadingDesigns] = useState(false);
  const [importingId, setImportingId] = useState<string | null>(null);
  const [formatById, setFormatById] = useState<Record<string, ExportFormat>>({});

  const loadStatus = async () => {
    try {
      const { data } = await axios.get(`${API_URL}/api/canva/status`);
      setConnected(data.connected);
    } catch {
      setConnected(false);
    }
  };

  const loadDesigns = async () => {
    setLoadingDesigns(true);
    try {
      const { data } = await axios.get(`${API_URL}/api/canva/designs`);
      setDesigns(data.designs || []);
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Error al listar tus diseños de Canva');
    } finally {
      setLoadingDesigns(false);
    }
  };

  useEffect(() => {
    loadStatus();
  }, []);

  useEffect(() => {
    if (connected) loadDesigns();
  }, [connected]);

  const handleConnect = () => {
    window.location.href = `${API_URL}/api/canva/auth`;
  };

  const handleDisconnect = async () => {
    try {
      await axios.post(`${API_URL}/api/canva/disconnect`);
      setConnected(false);
      setDesigns([]);
      toast.success('Cuenta de Canva desconectada');
    } catch {
      toast.error('No se pudo desconectar Canva');
    }
  };

  const handleImport = async (design: CanvaDesign) => {
    setImportingId(design.id);
    try {
      const format = formatById[design.id] || 'png';
      const { data } = await axios.post(`${API_URL}/api/canva/designs/${design.id}/import`, {
        title: design.title,
        format,
      });
      toast.success(`"${design.title}" importado a tu biblioteca (${data.file.path})`);
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Error al importar el diseño');
    } finally {
      setImportingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="card-lg">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-3 card-icon">
            <Palette className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="card-title">Diseños de Canva</h2>
            <p className="card-subtitle">
              Conecta tu cuenta de Canva e importa tus diseños como archivos a la biblioteca de Lumina
            </p>
          </div>
        </div>

        {connected === null && (
          <div className="flex items-center gap-2 card-subtitle">
            <Loader className="w-4 h-4 animate-spin" /> Comprobando conexión con Canva...
          </div>
        )}

        {connected === false && (
          <button
            onClick={handleConnect}
            className="flex items-center gap-2 px-4 py-2.5 bg-accent-600 hover:bg-accent-700 text-white rounded-lg text-sm font-medium transition-colors active:scale-95"
          >
            <ExternalLink className="w-4 h-4" />
            Conectar con Canva
          </button>
        )}

        {connected === true && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs text-green-600 dark:text-green-400 font-medium">✓ Cuenta de Canva conectada</span>
              <button
                onClick={handleDisconnect}
                className="flex items-center gap-1.5 text-xs text-gray-400 dark:text-zinc-500 hover:text-gray-600 dark:hover:text-zinc-300"
              >
                <Unlink className="w-3.5 h-3.5" /> Desconectar
              </button>
            </div>

            {loadingDesigns ? (
              <div className="flex items-center gap-2 card-subtitle">
                <Loader className="w-4 h-4 animate-spin" /> Cargando tus diseños...
              </div>
            ) : designs.length === 0 ? (
              <p className="text-sm text-gray-400 dark:text-zinc-500">No se encontraron diseños en tu cuenta de Canva.</p>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                {designs.map(design => (
                  <div
                    key={design.id}
                    className="border border-gray-200 dark:border-zinc-800 rounded-lg overflow-hidden bg-gray-50 dark:bg-zinc-950"
                  >
                    <div className="aspect-video bg-gray-100 dark:bg-zinc-900 flex items-center justify-center">
                      {design.thumbnailUrl ? (
                        <img src={design.thumbnailUrl} alt={design.title} className="w-full h-full object-cover" />
                      ) : (
                        <Palette className="w-8 h-8 text-gray-300 dark:text-zinc-700" />
                      )}
                    </div>
                    <div className="p-3 space-y-2">
                      <p className="text-xs font-medium text-gray-900 dark:text-zinc-100 truncate" title={design.title}>
                        {design.title}
                      </p>
                      <div className="flex items-center gap-2">
                        <select
                          value={formatById[design.id] || 'png'}
                          onChange={e =>
                            setFormatById(prev => ({ ...prev, [design.id]: e.target.value as ExportFormat }))
                          }
                          className="flex-1 text-xs bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded px-1.5 py-1"
                        >
                          <option value="png">PNG</option>
                          <option value="jpg">JPG</option>
                          <option value="mp4">MP4</option>
                          <option value="pdf">PDF</option>
                        </select>
                        <button
                          onClick={() => handleImport(design)}
                          disabled={importingId === design.id}
                          className="flex items-center gap-1 px-2 py-1 bg-accent-600 hover:bg-accent-700 disabled:opacity-50 text-white rounded text-xs font-medium transition-colors active:scale-95"
                        >
                          {importingId === design.id ? (
                            <Loader className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Download className="w-3.5 h-3.5" />
                          )}
                          Importar
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
