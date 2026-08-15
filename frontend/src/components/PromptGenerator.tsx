import { useState, useMemo } from 'react';
import { Sparkles, Loader, Copy, Edit2, AlertCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import axios from 'axios';
import { API_URL } from '../services/apiUrl';

interface Prompt {
  id: string;
  section: number;
  text: string;
  imagePrompt: string;
  videoKeywords: string[];
  failed?: boolean;
}

interface PromptGeneratorProps {
  scriptContent: string;
  onGeneratePrompts: (prompts: Prompt[]) => void;
  generatedPrompts: Prompt[];
}

const CONCURRENCY = 5;

export default function PromptGenerator({
  scriptContent,
  onGeneratePrompts,
  generatedPrompts,
}: PromptGeneratorProps) {
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<Partial<Prompt>>({});
  const [style, setStyle] = useState('cinematic');
  const [tone, setTone] = useState('professional');
  const [manualMode, setManualMode] = useState(false);
  const [manualPrompts, setManualPrompts] = useState('');
  const [regeneratingId, setRegeneratingId] = useState<string | null>(null);

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

  const requestPromptForSection = async (section: string): Promise<{ imagePrompt: string; videoKeywords: string[]; failed: boolean }> => {
    try {
      const response = await axios.post(`${API_URL}/api/prompts/parse`, {
        scriptText: section,
        style,
        tone,
      });

      // Si la API devuelve un array de prompts, tomar el primero
      const promptData = Array.isArray(response.data.prompts)
        ? response.data.prompts[0]
        : response.data.prompts;

      const imagePrompt = promptData?.imagePrompt || section;

      return {
        imagePrompt,
        videoKeywords: promptData?.videoKeywords || extractKeywords(section),
        // El backend cae de vuelta al texto original cuando la IA falla tras reintentar
        failed: imagePrompt === section,
      };
    } catch (error) {
      console.error('Error generando prompt de sección:', error);
      return { imagePrompt: section, videoKeywords: extractKeywords(section), failed: true };
    }
  };

  const handleGeneratePrompts = async () => {
    if (!scriptContent.trim()) {
      toast.error('Por favor carga un guion primero');
      return;
    }

    setLoading(true);
    setProgress({ done: 0, total: scriptSections.length });

    // Resultados indexados por posición para preservar el orden de las secciones
    const results: (Prompt | null)[] = new Array(scriptSections.length).fill(null);
    let doneCount = 0;
    let failedCount = 0;

    const processSection = async (i: number) => {
      const section = scriptSections[i];
      const { imagePrompt, videoKeywords, failed } = await requestPromptForSection(section);

      results[i] = {
        id: crypto.randomUUID(),
        section: i + 1,
        text: section,
        imagePrompt,
        videoKeywords,
        failed,
      };

      if (failed) failedCount++;
      doneCount++;
      setProgress({ done: doneCount, total: scriptSections.length });

      // Guardado incremental: si algo falla más adelante, no se pierde lo ya generado
      onGeneratePrompts(results.filter((p): p is Prompt => p !== null));
    };

    // Procesa en lotes con concurrencia limitada para no agotar el rate limit de la API
    for (let i = 0; i < scriptSections.length; i += CONCURRENCY) {
      const batch = scriptSections
        .slice(i, i + CONCURRENCY)
        .map((_, offset) => processSection(i + offset));
      await Promise.all(batch);
    }

    setLoading(false);

    if (failedCount > 0) {
      toast.error(
        `⚠️ ${failedCount} de ${scriptSections.length} secciones no generaron prompt IA (se usó el texto original). Puedes reintentarlas individualmente.`
      );
    } else {
      toast.success(`✨ ${scriptSections.length} secciones de prompts generadas`);
    }
  };

  const handleRegenerateSection = async (prompt: Prompt) => {
    setRegeneratingId(prompt.id);
    try {
      const { imagePrompt, videoKeywords, failed } = await requestPromptForSection(prompt.text);

      onGeneratePrompts(
        generatedPrompts.map(p =>
          p.id === prompt.id ? { ...p, imagePrompt, videoKeywords, failed } : p
        )
      );

      if (failed) {
        toast.error('Sigue sin poder generarse el prompt IA para esta sección');
      } else {
        toast.success('✨ Prompt regenerado');
      }
    } finally {
      setRegeneratingId(null);
    }
  };

  const extractKeywords = (text: string): string[] => {
    const words = text.split(/\s+/).filter(w => w.length > 4);
    return words.slice(0, 5).map(w => w.toLowerCase().replace(/[.,!?]/g, ''));
  };

  const handleParseManualPrompts = () => {
    if (!manualPrompts.trim()) {
      toast.error('Por favor pega los prompts');
      return;
    }

    // Parsear líneas: cada línea es un prompt
    const lines = manualPrompts
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0);

    if (lines.length === 0) {
      toast.error('No se encontraron prompts');
      return;
    }

    const newPrompts: Prompt[] = lines.map((line, i) => ({
      id: crypto.randomUUID(),
      section: i + 1,
      text: `Sección ${i + 1}`,
      imagePrompt: line,
      videoKeywords: extractKeywords(line),
    }));

    onGeneratePrompts(newPrompts);
    setManualMode(false);
    setManualPrompts('');
    toast.success(`✨ ${newPrompts.length} prompts cargados manualmente`);
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
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2.5 bg-accent-600 rounded-lg">
            <Sparkles className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="text-gray-900 dark:text-zinc-100 text-sm font-medium">Generador de Prompts</h2>
            <p className="text-gray-400 dark:text-zinc-500 text-[10px]">Crea automáticamente prompts para cada sección del guión</p>
          </div>
        </div>

        {numSections > 0 && (
          <div className="mb-6 p-4 bg-accent-50 dark:bg-accent-950/50 rounded-lg border border-accent-200 dark:border-accent-800 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-accent-600 mt-0.5 flex-shrink-0 dark:text-accent-400" />
            <div>
              <p className="font-medium text-sm text-accent-900 dark:text-accent-200">Se crearán {numSections} secciones</p>
              <p className="text-xs text-accent-700 dark:text-accent-300">Tu guión contiene {numSections} punto{numSections !== 1 ? 's' : ''}, por lo que se generarán {numSections} secciones de prompts</p>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-6">
          <div>
            <label className="block text-xs font-medium mb-2 text-gray-400 dark:text-zinc-600">🎨 Estilo Visual</label>
            <select
              value={style}
              onChange={(e) => setStyle(e.target.value)}
              className="w-full px-3 py-2.5 bg-gray-50 dark:bg-zinc-950 border border-gray-200 dark:border-zinc-800 text-gray-700 dark:text-zinc-300 rounded-lg focus:border-accent-500 dark:focus:border-accent-600 focus:outline-none text-sm"
            >
              <option value="cinematic">Cinemático</option>
              <option value="photorealistic">Fotorrealista</option>
              <option value="animated">Animado</option>
              <option value="artistic">Artístico</option>
              <option value="minimalist">Minimalista</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium mb-2 text-gray-400 dark:text-zinc-600">🎭 Tono</label>
            <select
              value={tone}
              onChange={(e) => setTone(e.target.value)}
              className="w-full px-3 py-2.5 bg-gray-50 dark:bg-zinc-950 border border-gray-200 dark:border-zinc-800 text-gray-700 dark:text-zinc-300 rounded-lg focus:border-accent-500 dark:focus:border-accent-600 focus:outline-none text-sm"
            >
              <option value="professional">Profesional</option>
              <option value="casual">Casual</option>
              <option value="dramatic">Dramático</option>
              <option value="educational">Educativo</option>
              <option value="humorous">Humorístico</option>
            </select>
          </div>
        </div>

        <div className="flex gap-3">
          <button
            onClick={handleGeneratePrompts}
            disabled={loading || !scriptContent.trim()}
            className="btn-primary flex-1 flex items-center justify-center gap-2 text-lg"
          >
            {loading && <Loader className="w-6 h-6 animate-spin" />}
            {loading
              ? `Generando... (${progress.done}/${progress.total})`
              : `🤖 Generar ${numSections} Prompts`}
          </button>
          <button
            onClick={() => setManualMode(!manualMode)}
            className="btn-secondary px-6 flex items-center justify-center gap-2 text-lg"
          >
            ✏️ Manual
          </button>
        </div>
      </div>

      {/* Manual Mode */}
      {manualMode && (
        <div className="card-lg">
          <h3 className="text-gray-900 dark:text-zinc-100 text-sm font-medium mb-1">✏️ Ingresa Prompts Manualmente</h3>
          <p className="text-gray-400 dark:text-zinc-500 text-[10px] mb-4">Pega un prompt por línea. Cada línea será una sección:</p>

          <textarea
            value={manualPrompts}
            onChange={(e) => setManualPrompts(e.target.value)}
            placeholder="Ultra-detailed cinematic shot of...
Aerial drone view of...
Macro close-up of..."
            className="w-full h-64 p-4 bg-gray-50 dark:bg-zinc-950 border border-gray-200 dark:border-zinc-800 text-gray-900 dark:text-zinc-100 placeholder-gray-400 dark:placeholder-zinc-600 rounded-lg focus:border-accent-500 dark:focus:border-accent-600 focus:outline-none mb-4 resize-none font-mono-ui text-sm"
          />

          <div className="flex gap-3">
            <button
              onClick={handleParseManualPrompts}
              className="btn-primary flex-1 py-3 text-lg font-bold flex items-center justify-center gap-2"
            >
              ✅ Cargar Prompts
            </button>
            <button
              onClick={() => {
                setManualMode(false);
                setManualPrompts('');
              }}
              className="btn-secondary flex-1 py-3 text-lg font-bold"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Generated Prompts */}
      {generatedPrompts.length > 0 && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="text-gray-900 dark:text-zinc-100 text-sm font-medium flex items-center gap-3">
              <div className="p-2.5 bg-accent-600 rounded-lg">
                <Sparkles className="w-5 h-5 text-white" />
              </div>
              Prompts Generados ({generatedPrompts.length} secciones)
            </h3>
          </div>

          <div className="grid gap-5">
            {generatedPrompts.map((prompt) => (
              <div
                key={prompt.id}
                className="card-gradient hover-lift border border-accent-200/50 dark:border-accent-800/50"
              >
                {editingId === prompt.id ? (
                  // Edit Mode
                  <div className="space-y-4">
                    <div>
                      <label className="block text-xs font-medium mb-2 text-gray-400 dark:text-zinc-600">Texto Original</label>
                      <textarea
                        value={editValues.text || ''}
                        onChange={(e) =>
                          setEditValues({ ...editValues, text: e.target.value })
                        }
                        className="w-full p-2 bg-gray-50 dark:bg-zinc-950 border border-gray-200 dark:border-zinc-800 rounded-lg text-sm text-gray-900 dark:text-zinc-100 focus:border-accent-500 dark:focus:border-accent-600 focus:outline-none"
                        rows={3}
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium mb-2 text-gray-400 dark:text-zinc-600">
                        Prompt de Imagen
                      </label>
                      <textarea
                        value={editValues.imagePrompt || ''}
                        onChange={(e) =>
                          setEditValues({ ...editValues, imagePrompt: e.target.value })
                        }
                        className="w-full p-2 bg-gray-50 dark:bg-zinc-950 border border-gray-200 dark:border-zinc-800 rounded-lg text-sm text-gray-900 dark:text-zinc-100 focus:border-accent-500 dark:focus:border-accent-600 focus:outline-none font-mono-ui"
                        rows={3}
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium mb-2 text-gray-400 dark:text-zinc-600">
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
                        className="w-full p-2 bg-gray-50 dark:bg-zinc-950 border border-gray-200 dark:border-zinc-800 rounded-lg text-sm text-gray-900 dark:text-zinc-100 placeholder-gray-400 dark:placeholder-zinc-600 focus:border-accent-500 dark:focus:border-accent-600 focus:outline-none"
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
                        <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-accent-600 text-white text-sm font-bold">
                          {prompt.section}
                        </span>
                        <span className="text-sm text-gray-400 dark:text-zinc-500">
                          Sección {prompt.section}
                        </span>
                        {prompt.failed && (
                          <span className="flex items-center gap-1 text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 px-2 py-1 rounded-full dark:text-amber-400 dark:bg-amber-950 dark:border-amber-800">
                            <AlertCircle className="w-3 h-3" />
                            Sin prompt IA
                          </span>
                        )}
                      </div>
                      <button
                        onClick={() => handleEditPrompt(prompt)}
                        className="p-2 hover:bg-gray-100 dark:hover:bg-zinc-800 rounded-lg transition-colors"
                      >
                        <Edit2 className="w-4 h-4 text-gray-400 dark:text-zinc-500" />
                      </button>
                    </div>

                    <div className="space-y-3">
                      <div>
                        <p className="text-xs font-semibold text-gray-400 dark:text-zinc-600 mb-1">
                          TEXTO ORIGINAL
                        </p>
                        <p className="text-sm text-gray-500 dark:text-zinc-400">{prompt.text}</p>
                      </div>

                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <p className="text-xs font-semibold text-gray-400 dark:text-zinc-600">
                            PROMPT DE IMAGEN
                          </p>
                          <button
                            onClick={() => handleCopyPrompt(prompt.imagePrompt)}
                            className="p-1 hover:bg-gray-100 dark:hover:bg-zinc-800 rounded-lg transition-colors"
                          >
                            <Copy className="w-4 h-4 text-gray-400 dark:text-zinc-500" />
                          </button>
                        </div>
                        <p className="text-sm text-gray-900 dark:text-zinc-100 bg-accent-50 dark:bg-accent-950/50 p-3 rounded-lg border border-accent-200 dark:border-accent-800 leading-relaxed">
                          {prompt.imagePrompt}
                        </p>
                      </div>

                      {prompt.failed && (
                        <button
                          onClick={() => handleRegenerateSection(prompt)}
                          disabled={regeneratingId === prompt.id}
                          className="btn-secondary w-full py-2 text-sm font-bold flex items-center justify-center gap-2"
                        >
                          {regeneratingId === prompt.id && (
                            <Loader className="w-4 h-4 animate-spin" />
                          )}
                          {regeneratingId === prompt.id ? 'Reintentando...' : '🔄 Reintentar Prompt IA'}
                        </button>
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
          <Sparkles className="w-12 h-12 text-gray-300 dark:text-zinc-700 mx-auto mb-3" />
          <p className="text-gray-400 dark:text-zinc-500 text-sm">
            Genera prompts automáticamente desde tu guion
          </p>
        </div>
      )}
    </div>
  );
}
