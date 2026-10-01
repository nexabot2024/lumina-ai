import { useEffect } from 'react';
import { Film, X, Download } from 'lucide-react';

interface VideoPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  /** URL reproducible del video (ya con el dominio del backend si hace falta). */
  videoUrl: string;
  /** URL de descarga, si es distinta de `videoUrl`. */
  downloadUrl?: string;
}

/** Reproductor de video embebido, con el mismo lenguaje visual del resto del sistema —
 *  para ver/descargar un resultado ya procesado sin tener que abrir una pestaña nueva. */
export default function VideoPreviewModal({ isOpen, onClose, title, videoUrl, downloadUrl }: VideoPreviewModalProps) {
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[80] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="glass-modal max-w-3xl w-full overflow-hidden animate-materialize"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 p-4 border-b border-gray-100 dark:border-zinc-800/60">
          <div className="flex items-center gap-3 min-w-0">
            <span className="p-2.5 card-icon shrink-0">
              <Film className="w-4 h-4 text-white" />
            </span>
            <h3 className="font-semibold text-gray-900 dark:text-zinc-100 text-sm truncate">{title}</h3>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl bg-gray-100 dark:bg-zinc-900 text-gray-500 dark:text-zinc-400 hover:bg-gray-200 dark:hover:bg-zinc-800 transition-colors shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="bg-black flex items-center justify-center">
          {/* key fuerza a recrear el <video> al cambiar de item, para no arrastrar el frame anterior */}
          <video key={videoUrl} src={videoUrl} controls autoPlay className="w-full max-h-[70vh]" />
        </div>

        <div className="p-4 flex justify-end">
          <a
            href={downloadUrl || videoUrl}
            download
            className="btn-primary flex items-center gap-2 py-2.5 px-5 text-sm"
          >
            <Download className="w-4 h-4" /> Descargar video
          </a>
        </div>
      </div>
    </div>
  );
}
