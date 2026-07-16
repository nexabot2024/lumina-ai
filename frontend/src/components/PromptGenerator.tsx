import { useState, useMemo } from 'react';
import { Sparkles, Loader, Copy, Edit2, AlertCircle } from 'lucide-react';
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

  // Contar puntos en el guión para determinar número de secciones
  const numSections = useMemo(() => {
    if (!scriptContent.trim()) return 0;
    const dotCount = (scriptContent.match(/\./g) || []).length;
    return Math.max(1, dotCount);
  }, [scriptContent]);

  // Dividir guión en secciones basado en puntos
  const scriptSections = useMemo(() => {
    if (!scriptContent.trim() || numSections === 0) return [];

    // Dividir por puntos seguidos de espacio
    const sentences = scriptContent.split(/\.\s+/).filter(s => s.trim());

    if (sentences.length <= numSections) {
      return sentences;
    }

    // Agrupar sentencias en N secciones
    const sectionsArray: string[] = [];
    const sentencesPerSection = Math.ceil(sentences.length / numSections);

    for (let i = 0; i < numSections; i++) {
      const start = i * sentencesPerSection;
      const end = Math.min(start + sentencesPerSection, sentences.length);
      const section = sentences.slice(start, end).join('. ');
      if (section.trim()) {
        sectionsArray.push(section + '.');
      }
    }

    return sectionsArray;
  }, [scriptContent, numSections]);

  const handleGeneratePrompts = async () => {
    if (!scriptContent.trim()) {
      toast.error('Por favor carga un guion primero');
      return;
    }

    setLoading(true);
    try {
      // Generar prompts para cada sección
      const newPrompts: Prompt[] = [];

      for (let i = 0; i < scriptSections.length; i++) {
        const section = scriptSections[i];
        const response = await axios.post('/api/prompts/enhance', {
          prompt: section,
          context: `Esta es la sección ${i + 1} de ${scriptSections.length}. Estilo: ${style}, Tono: ${tone}`,
        });

        newPrompts.push({
          id: crypto.randomUUID(),
          section: i + 1,
          text: section,
          imagePrompt: response.data.enhanced || section,
          videoKeywords: extractKeywords(response.data.enhanced || section),
        });

        // Pequeña pausa para no saturar el servidor
        await new Promise(resolve => setTimeout(resolve, 200));
      }

      onGeneratePrompts(newPrompts);
      toast.success(`✨ ${newPrompts.length} secciones de prompts generadas`);
    } catch (error) {
      toast.error('Error al generar prompts');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const extractKeywords = (text: string): string[] => {
    const words = text.split(/\s+/).filter(w => w.length > 4);
    return words.slice(0, 5).map(w => w.toLowerCase().replace(/[.,!?]/g, ''));
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
    <div className="space-y-8">
      {/* Configuration Section */}
      <div className="card-lg">
        <div className="flex items-center gap-4 mb-6">
          <div className="p-3 bg-gradient-to-br from-purple-400 to-pink-400 rounded-2xl shadow-lg animate-float">
            <Sparkles className="w-6 h-6 text-white" />
          </div>
          <div>
            <h2 className="text-3xl font-black text-gray-800">Generador de Prompts</h2>
            <p className="text-gray-600 text-sm font-medium">Crea automáticamente prompts para cada sección del guión</p>
          </div>
        </div>

        {numSections > 0 && (
          <div className="mb-6 p-4 bg-gradient-to-r from-blue-100 to-purple-100 rounded-2xl border-2 border-blue-300/50 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
            <div>
              <p className="font-semibold text-blue-900">Se crearán {numSections} secciones</p>
              <p className="text-sm text-blue-800">Tu guión contiene {numSections} punto{numSections !== 1 ? 's' : ''}, por lo que se generarán {numSections} secciones de prompts</p>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-6">
          <div>
            <label className="block text-sm font-bold mb-3 text-gray-700">🎨 Estilo Visual</label>
            <select
              value={style}
              onChange={(e) => setStyle(e.target.value)}
              className="w-full px-4 py-3 bg-white border-2 border-purple-200 rounded-xl text-gray-800 font-medium focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-200 transition-all"
            >
              <option value="cinematic">Cinemático</option>
              <option value="photorealistic">Fotorrealista</option>
              <option value="animated">Animado</option>
              <option value="artistic">Artístico</option>
              <option value="minimalist">Minimalista</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-bold mb-3 text-gray-700">🎭 Tono</label>
            <select
              value={tone}
              onChange={(e) => setTone(e.target.value)}
              className="w-full px-4 py-3 bg-white border-2 border-pink-200 rounded-xl text-gray-800 font-medium focus:border-pink-500 focus:outline-none focus:ring-2 focus:ring-pink-200 transition-all"
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
          className="btn-primary w-full flex items-center justify-center gap-2 text-lg"
        >
          {loading && <Loader className="w-6 h-6 animate-spin" />}
          {loading ? 'Generando prompts para todas las secciones...' : `Generar ${numSections} Prompts`}
        </button>
      </div>

      {/* Generated Prompts */}
      {generatedPrompts.length > 0 && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="text-2xl font-black text-gray-800 flex items-center gap-3">
              <div className="p-2 bg-gradient-to-br from-purple-400 to-pink-400 rounded-xl">
                <Sparkles className="w-6 h-6 text-white" />
              </div>
              Prompts Generados ({generatedPrompts.length} secciones)
            </h3>
          </div>

          <div className="grid gap-5">
            {generatedPrompts.map((prompt) => (
              <div
                key={prompt.id}
                className="card-gradient p-6 hover:shadow-2xl hover-lift border-2 border-purple-200/50"
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
