import { useState } from 'react';
import { FileUp, Trash2, BookOpen, Clapperboard } from 'lucide-react';
import toast from 'react-hot-toast';
import PresetsModal from './PresetsModal';

interface ScriptUploaderProps {
  onScriptLoad: (content: string) => void;
  scriptContent: string;
  stockPercentage: number;
  onStockPercentageChange: (value: number) => void;
}

export default function ScriptUploader({
  onScriptLoad,
  scriptContent,
  stockPercentage,
  onStockPercentageChange,
}: ScriptUploaderProps) {
  const [content, setContent] = useState(scriptContent);
  const [presetsOpen, setPresetsOpen] = useState(false);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        setContent(text);
        onScriptLoad(text);
        toast.success('Guion cargado exitosamente');
      } catch (error) {
        toast.error('Error al cargar el archivo');
      }
    };
    reader.readAsText(file);
  };

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const text = e.target.value;
    setContent(text);
    onScriptLoad(text);
  };

  const handleClear = () => {
    setContent('');
    onScriptLoad('');
    toast.success('Guion limpiado');
  };

  const handleDownload = () => {
    const element = document.createElement('a');
    element.setAttribute(
      'href',
      `data:text/plain;charset=utf-8,${encodeURIComponent(content)}`
    );
    element.setAttribute('download', 'script.txt');
    element.style.display = 'none';
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
    toast.success('Guion descargado');
  };

  const iaPercentage = 100 - stockPercentage;

  return (
    <div className="space-y-6">
      {/* Montaje Configuration */}
      <div className="card-lg">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-3 card-icon">
            <Clapperboard className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="card-title">🎬 Montaje del Video</h2>
            <p className="card-subtitle">
              Elige qué proporción de contenido usar al armar el video
            </p>
          </div>
        </div>

        <input
          type="range"
          min={0}
          max={100}
          step={5}
          value={stockPercentage}
          onChange={(e) => onStockPercentageChange(parseInt(e.target.value))}
          className="input-range mb-5"
        />

        {/* Barra dividida stock/IA */}
        <div className="flex rounded-lg overflow-hidden h-8 border border-gray-200 dark:border-zinc-800">
          <div style={{ width: `${stockPercentage}%` }} className="bg-gray-100 dark:bg-zinc-800 flex items-center justify-center transition-[width] duration-300">
            {stockPercentage >= 14 && (
              <span className="text-gray-500 dark:text-zinc-400 text-[10px] font-medium whitespace-nowrap">{stockPercentage}% stock</span>
            )}
          </div>
          <div style={{ width: `${iaPercentage}%` }} className="bg-accent-50 dark:bg-accent-950/50 flex items-center justify-center transition-[width] duration-300">
            {iaPercentage >= 14 && (
              <span className="text-accent-600 dark:text-accent-400 text-[10px] font-medium whitespace-nowrap">{iaPercentage}% IA</span>
            )}
          </div>
        </div>
      </div>

      {/* Upload Section */}
      <div className="card-lg">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-3 card-icon">
            <FileUp className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="card-title">Mi Guion</h2>
            <p className="card-subtitle">Sube o escribe tu guion aquí</p>
          </div>
        </div>

        {/* Upload Input */}
        <label className="flex flex-col items-center justify-center w-full p-10 border border-dashed border-gray-300 dark:border-zinc-700 bg-gray-50 dark:bg-zinc-900/50 rounded-xl hover:border-gray-400 dark:hover:border-zinc-500 transition-colors cursor-pointer group">
          <div className="text-center">
            <FileUp className="w-6 h-6 mx-auto mb-3 text-gray-400 dark:text-zinc-500" />
            <p className="text-gray-500 dark:text-zinc-400 text-xs font-medium">
              Arrastra tu guion aquí
            </p>
            <p className="text-gray-300 dark:text-zinc-600 text-[10px] mt-1">o haz clic para seleccionar (TXT, PDF, DOC)</p>
          </div>
          <input
            type="file"
            accept=".txt,.pdf,.doc,.docx"
            onChange={handleFileUpload}
            className="hidden"
          />
        </label>
      </div>

      {/* Text Editor */}
      <div className="card-lg space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="card-title">📝 Editor de Guion</h3>
            <p className="card-subtitle">Edita directamente tu contenido</p>
          </div>
          <div className="flex gap-2 flex-wrap justify-end">
            <button
              onClick={() => setPresetsOpen(true)}
              className="flex items-center gap-1.5 btn-secondary py-1.5 px-3 text-xs"
            >
              <BookOpen className="w-3.5 h-3.5" />
              Presets
            </button>
            <button
              onClick={handleDownload}
              className="btn-secondary py-1.5 px-3 text-xs"
              disabled={!content}
            >
              ⬇️ Descargar
            </button>
            <button
              onClick={handleClear}
              className="flex items-center gap-1.5 btn-secondary py-1.5 px-3 text-xs hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40 dark:hover:text-red-400"
              disabled={!content}
            >
              <Trash2 className="w-3.5 h-3.5" />
              Limpiar
            </button>
          </div>
        </div>

        <textarea
          value={content}
          onChange={handleTextChange}
          placeholder="Pega o escribe tu guion aquí. Usa párrafos separados por líneas en blanco..."
          className="w-full h-96 p-4 bg-gray-50 dark:bg-zinc-950 border border-gray-200 dark:border-zinc-800 text-gray-900 dark:text-zinc-100 placeholder-gray-400 dark:placeholder-zinc-600 rounded-lg focus:border-accent-500 dark:focus:border-accent-600 focus:outline-none resize-none font-mono-ui text-sm"
        />

        <div className="grid grid-cols-2 gap-3 pt-3 border-t border-gray-100 dark:border-zinc-800">
          <div className="bg-gray-50 dark:bg-zinc-950 rounded-xl p-3">
            <p className="text-gray-400 dark:text-zinc-600 text-[10px]">📝 Caracteres</p>
            <p className="text-gray-900 dark:text-zinc-100 text-xl font-medium mt-1">{content.length.toLocaleString()}</p>
          </div>
          <div className="bg-gray-50 dark:bg-zinc-950 rounded-xl p-3">
            <p className="text-gray-400 dark:text-zinc-600 text-[10px]">📄 Puntos/Secciones</p>
            <p className="text-gray-900 dark:text-zinc-100 text-xl font-medium mt-1">{(content.match(/\./g) || []).length}</p>
          </div>
        </div>
      </div>

      <PresetsModal
        isOpen={presetsOpen}
        onClose={() => setPresetsOpen(false)}
        onSelectPreset={(presetContent) => {
          setContent(presetContent);
          onScriptLoad(presetContent);
        }}
      />
    </div>
  );
}
