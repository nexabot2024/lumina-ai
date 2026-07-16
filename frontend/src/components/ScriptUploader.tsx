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
    <div className="space-y-8">
      {/* Upload Section */}
      <div className="card-lg">
        <div className="flex items-center gap-4 mb-8">
          <div className="p-3 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-2xl shadow-lg animate-float">
            <FileUp className="w-6 h-6 text-white" />
          </div>
          <div>
            <h2 className="text-3xl font-black text-gray-800">Mi Guion</h2>
            <p className="text-gray-600 text-sm font-medium">Sube o escribe tu guion aquí</p>
          </div>
        </div>

        {/* Upload Input */}
        <label className="flex flex-col items-center justify-center w-full p-12 border-3 border-dashed border-blue-300 rounded-3xl hover:border-blue-500 hover:bg-blue-50/50 transition-all cursor-pointer group bg-gradient-to-br from-blue-50/50 to-cyan-50/50">
          <div className="text-center">
            <div className="inline-block p-4 bg-gradient-to-br from-blue-200 to-cyan-200 rounded-2xl mb-4 group-hover:scale-110 transition-transform">
              <FileUp className="w-8 h-8 text-blue-600" />
            </div>
            <p className="text-lg font-bold text-gray-800 group-hover:text-blue-600 transition-colors">
              Arrastra tu guion aquí
            </p>
            <p className="text-sm text-gray-600 mt-2">o haz clic para seleccionar (TXT, PDF, DOC)</p>
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
      <div className="card-lg space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-2xl font-black text-gray-800">📝 Editor de Guion</h3>
            <p className="text-sm text-gray-600 font-medium">Edita directamente tu contenido</p>
          </div>
          <div className="flex gap-2 flex-wrap justify-end">
            <button
              onClick={() => setPresetsOpen(true)}
              className="flex items-center gap-2 btn-light py-2 px-4 text-sm font-bold"
            >
              <BookOpen className="w-4 h-4" />
              Presets
            </button>
            <button
              onClick={handleDownload}
              className="btn-light py-2 px-4 text-sm font-bold"
              disabled={!content}
            >
              ⬇️ Descargar
            </button>
            <button
              onClick={handleClear}
              className="flex items-center gap-2 btn-light py-2 px-4 text-sm font-bold hover:bg-red-200 hover:border-red-400"
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
          className="w-full h-96 p-5 bg-white border-2 border-blue-200 rounded-2xl text-gray-800 placeholder-gray-500 font-medium focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200 resize-none shadow-inner transition-all hover:border-blue-300"
        />

        <div className="grid grid-cols-2 gap-4 pt-4 border-t-2 border-blue-200">
          <div className="p-4 bg-gradient-to-br from-blue-50 to-cyan-50 rounded-2xl border-2 border-blue-200/60">
            <p className="text-sm font-bold text-gray-700">📝 Caracteres</p>
            <p className="text-2xl font-black text-blue-600">{content.length.toLocaleString()}</p>
          </div>
          <div className="p-4 bg-gradient-to-br from-purple-50 to-pink-50 rounded-2xl border-2 border-purple-200/60">
            <p className="text-sm font-bold text-gray-700">📄 Puntos/Secciones</p>
            <p className="text-2xl font-black text-purple-600">{(content.match(/\./g) || []).length}</p>
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
