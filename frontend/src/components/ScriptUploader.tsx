import { useState } from 'react';
import { FileUp, Trash2, BookOpen } from 'lucide-react';
import toast from 'react-hot-toast';
import PresetsModal from './PresetsModal';

interface ScriptUploaderProps {
  onScriptLoad: (content: string) => void;
  scriptContent: string;
}

export default function ScriptUploader({
  onScriptLoad,
  scriptContent,
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

  return (
    <div className="space-y-6">
      {/* Upload Section */}
      <div className="card-lg">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-3 bg-gradient-vibrant rounded-lg">
            <FileUp className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-2xl font-bold">Mi Guion</h2>
            <p className="text-gray-400 text-sm">Sube o escribe tu guion aquí</p>
          </div>
        </div>

        {/* Upload Input */}
        <label className="flex flex-col items-center justify-center w-full p-8 border-2 border-dashed border-purple-500/30 rounded-xl hover:border-purple-500/60 transition-colors cursor-pointer group">
          <div className="text-center">
            <FileUp className="w-12 h-12 mx-auto text-purple-400 group-hover:text-purple-300 mb-2" />
            <p className="text-lg font-semibold text-gray-200 group-hover:text-white">
              Arrastra tu guion aquí
            </p>
            <p className="text-sm text-gray-400">o haz clic para seleccionar</p>
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
          <h3 className="text-lg font-semibold">Editor de Guion</h3>
          <div className="flex gap-2">
            <button
              onClick={() => setPresetsOpen(true)}
              className="flex items-center gap-2 btn-secondary py-2 px-4 text-sm"
            >
              <BookOpen className="w-4 h-4" />
              Presets
            </button>
            <button
              onClick={handleDownload}
              className="btn-secondary py-2 px-4 text-sm"
              disabled={!content}
            >
              Descargar
            </button>
            <button
              onClick={handleClear}
              className="flex items-center gap-2 btn-secondary py-2 px-4 text-sm hover:bg-red-900/20 hover:border-red-600"
              disabled={!content}
            >
              <Trash2 className="w-4 h-4" />
              Limpiar
            </button>
          </div>
        </div>

        <textarea
          value={content}
          onChange={handleTextChange}
          placeholder="Pega o escribe tu guion aquí. Usa párrafos separados por líneas en blanco..."
          className="w-full h-96 p-4 bg-gray-900/50 border border-white/10 rounded-lg text-white placeholder-gray-500 focus:border-purple-500/50 focus:outline-none resize-none"
        />

        <div className="text-sm text-gray-400">
          <p>📝 Caracteres: {content.length}</p>
          <p>📄 Párrafos: {content.split(/\n\s*\n+/).filter(p => p.trim()).length}</p>
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
