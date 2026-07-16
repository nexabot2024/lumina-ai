import { useState } from 'react';
import { Sparkles, Loader, Copy, Edit2 } from 'lucide-react';
import toast from 'react-hot-toast';
import axios from 'axios';

interface Prompt {
  id: string;
  section: number;
  text: string;
  imagePrompt: string;
  videoKeywords: string[];
}

interface PromptGeneratorProps {
  scriptContent: string;
  onGeneratePrompts: (prompts: Prompt[]) => void;
  generatedPrompts: Prompt[];
}

export default function PromptGenerator({
  scriptContent,
  onGeneratePrompts,
  generatedPrompts,
}: PromptGeneratorProps) {
  const [loading, setLoading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<Partial<Prompt>>({});
  const [style, setStyle] = useState('cinematic');
  const [tone, setTone] = useState('professional');

  const handleGeneratePrompts = async () => {
    if (!scriptContent.trim()) {
      toast.error('Por favor carga un guion primero');
      return;
    }

    setLoading(true);
    try {
      const response = await axios.post('/api/prompts/parse', {
        scriptText: scriptContent,
        style,
        tone,
      });

      onGeneratePrompts(response.data.prompts);
      toast.success(`✨ ${response.data.prompts.length} prompts generados`);
    } catch (error) {
      toast.error('Error al generar prompts');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleCopyPrompt = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success('Copiado al portapapeles');
  };

  const handleEditPrompt = (prompt: Prompt) => {
    setEditingId(prompt.id);
    setEditValues(prompt);
  };

  const handleSaveEdit = () => {
    if (!editingId) return;

    onGeneratePrompts(
      generatedPrompts.map(p =>
        p.id === editingId
          ? { ...p, ...editValues }
          : p
      )
    );

    setEditingId(null);
    setEditValues({});
    toast.success('Prompt actualizado');
  };

  return (
    <div className="space-y-6">
      {/* Configuration Section */}
      <div className="card-lg">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-3 bg-gradient-to-r from-purple-500 to-pink-500 rounded-lg">
            <Sparkles className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-2xl font-bold">Generador de Prompts</h2>
            <p className="text-gray-400 text-sm">Crea automáticamente prompts para cada sección</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <div>
            <label className="block text-sm font-semibold mb-2 text-gray-200">Estilo Visual</label>
            <select
              value={style}
              onChange={(e) => setStyle(e.target.value)}
              className="w-full px-4 py-2 bg-gray-900/50 border border-white/10 rounded-lg text-white focus:border-purple-500/50 focus:outline-none"
            >
              <option value="cinematic">Cinemático</option>
              <option value="photorealistic">Fotorrealista</option>
              <option value="animated">Animado</option>
              <option value="artistic">Artístico</option>
              <option value="minimalist">Minimalista</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-semibold mb-2 text-gray-200">Tono</label>
            <select
              value={tone}
              onChange={(e) => setTone(e.target.value)}
              className="w-full px-4 py-2 bg-gray-900/50 border border-white/10 rounded-lg text-white focus:border-purple-500/50 focus:outline-none"
            >
              <option value="professional">Profesional</option>
              <option value="casual">Casual</option>
              <option value="dramatic">Dramático</option>
              <option value="educational">Educativo</option>
              <option value="humorous">Humorístico</option>
            </select>
          </div>
        </div>

        <button
          onClick={handleGeneratePrompts}
          disabled={loading || !scriptContent.trim()}
          className="btn-primary w-full flex items-center justify-center gap-2"
        >
          {loading && <Loader className="w-5 h-5 animate-spin" />}
          {loading ? 'Generando...' : 'Generar Prompts'}
        </button>
      </div>

      {/* Generated Prompts */}
      {generatedPrompts.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-purple-400" />
              Prompts Generados ({generatedPrompts.length})
            </h3>
          </div>

          <div className="grid gap-4">
            {generatedPrompts.map((prompt) => (
              <div
                key={prompt.id}
                className="card p-5 hover:border-purple-500/50"
              >
                {editingId === prompt.id ? (
                  // Edit Mode
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-semibold mb-2">Texto Original</label>
                      <textarea
                        value={editValues.text || ''}
                        onChange={(e) =>
                          setEditValues({ ...editValues, text: e.target.value })
                        }
                        className="w-full p-2 bg-gray-900/50 border border-white/10 rounded text-sm text-white"
                        rows={3}
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-semibold mb-2">
                        Prompt de Imagen
                      </label>
                      <textarea
                        value={editValues.imagePrompt || ''}
                        onChange={(e) =>
                          setEditValues({ ...editValues, imagePrompt: e.target.value })
                        }
                        className="w-full p-2 bg-gray-900/50 border border-white/10 rounded text-sm text-white"
                        rows={3}
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-semibold mb-2">
                        Palabras Clave de Video
                      </label>
                      <input
                        type="text"
                        value={(editValues.videoKeywords || []).join(', ')}
                        onChange={(e) =>
                          setEditValues({
                            ...editValues,
                            videoKeywords: e.target.value.split(',').map(k => k.trim()),
                          })
                        }
                        placeholder="keyword1, keyword2, keyword3"
                        className="w-full p-2 bg-gray-900/50 border border-white/10 rounded text-sm text-white"
                      />
                    </div>

                    <div className="flex gap-2">
                      <button
                        onClick={handleSaveEdit}
                        className="btn-primary flex-1 py-2 text-sm"
                      >
                        Guardar
                      </button>
                      <button
                        onClick={() => setEditingId(null)}
                        className="btn-secondary flex-1 py-2 text-sm"
                      >
                        Cancelar
                      </button>
                    </div>
                  </div>
                ) : (
                  // View Mode
                  <>
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-gradient-vibrant text-sm font-bold">
                          {prompt.section}
                        </span>
                        <span className="text-sm text-gray-400">
                          Sección {prompt.section}
                        </span>
                      </div>
                      <button
                        onClick={() => handleEditPrompt(prompt)}
                        className="p-2 hover:bg-white/10 rounded transition-colors"
                      >
                        <Edit2 className="w-4 h-4 text-gray-400" />
                      </button>
                    </div>

                    <div className="space-y-3">
                      <div>
                        <p className="text-xs font-semibold text-gray-400 mb-1">
                          TEXTO ORIGINAL
                        </p>
                        <p className="text-sm text-gray-300">{prompt.text}</p>
                      </div>

                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <p className="text-xs font-semibold text-gray-400">
                            PROMPT DE IMAGEN
                          </p>
                          <button
                            onClick={() => handleCopyPrompt(prompt.imagePrompt)}
                            className="p-1 hover:bg-white/10 rounded transition-colors"
                          >
                            <Copy className="w-4 h-4 text-gray-400" />
                          </button>
                        </div>
                        <p className="text-sm text-purple-300 bg-purple-950/30 p-2 rounded border border-purple-500/20">
                          {prompt.imagePrompt}
                        </p>
                      </div>

                      {prompt.videoKeywords.length > 0 && (
                        <div>
                          <p className="text-xs font-semibold text-gray-400 mb-2">
                            PALABRAS CLAVE PARA VIDEO
                          </p>
                          <div className="flex flex-wrap gap-2">
                            {prompt.videoKeywords.map((keyword, idx) => (
                              <span
                                key={idx}
                                className="px-3 py-1 text-xs rounded-full bg-cyan-950/50 border border-cyan-500/30 text-cyan-300"
                              >
                                {keyword}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {generatedPrompts.length === 0 && !loading && (
        <div className="card-lg text-center py-12">
          <Sparkles className="w-12 h-12 text-gray-600 mx-auto mb-3" />
          <p className="text-gray-400">
            Genera prompts automáticamente desde tu guion
          </p>
        </div>
      )}
    </div>
  );
}
