import { useState, useEffect, useRef } from 'react';
import { Volume2, Loader, Play, Download, Trash2, Zap, ChevronDown, Mic2, Plus, Check } from 'lucide-react';
import toast from 'react-hot-toast';
import axios from 'axios';

interface GeneratedAudio {
  id: string;
  taskId: string;
  text: string;
  voice: string;
  duration: number;
  status: string;
  generatedAt: string;
}

interface Voice {
  voice_id: string;
  name: string;
  language: string;
  gender: string;
  age?: string;
  category?: string;
  preview_url?: string;
}

interface AudioGeneratorProps {
  scriptSections: string[];
}

type Provider = 'elevenlabs' | 'minimax' | 'fishaudio' | 'edge' | 'kokoro' | 'vbee' | 'clone';

const allProviders: Array<{ id: Provider; name: string; emoji: string; color: string }> = [
  { id: 'elevenlabs', name: 'ElevenLabs', emoji: '🎙️', color: 'bg-accent-600' },
  { id: 'minimax', name: 'MiniMax', emoji: '🎵', color: 'bg-emerald-600' },
  { id: 'fishaudio', name: 'FishAudio', emoji: '🐟', color: 'bg-accent-600' },
  { id: 'edge', name: 'Microsoft Edge', emoji: '🌐', color: 'bg-accent-600' },
  { id: 'kokoro', name: 'Kokoro', emoji: '🎭', color: 'bg-accent-600' },
  { id: 'vbee', name: 'VBee', emoji: '🐝', color: 'bg-accent-600' },
  { id: 'clone', name: 'Voces Clonadas', emoji: '👤', color: 'bg-accent-600' },
];

const voiceCache: Record<Provider, Voice[] | null> = {
  elevenlabs: null,
  minimax: null,
  fishaudio: null,
  edge: null,
  kokoro: null,
  vbee: null,
  clone: null,
};

const defaultVoicesByProvider: Record<Provider, string> = {
  elevenlabs: 'elevenlabs_EXAVITQu4vr4xnSDxMaL',
  minimax: 'minimax_male-qn-qingse',
  fishaudio: 'fishaudio_default',
  edge: 'edge_default',
  kokoro: 'kokoro_default',
  vbee: 'vbee_default',
  clone: 'clone_default',
};

const VOICE_GENDERS = ['Masculino', 'Femenino', 'Neutro'];
const VOICE_AGES = ['Joven', 'Edad Mediana', 'Anciano'];
const VOICE_CATEGORIES = [
  'Narrativa e Historia',
  'Conversacional',
  'Personajes y Animación',
  'Redes Sociales',
  'Entretenimiento y TV',
  'Publicidad',
  'Informativo y Educativo'
];

export default function AudioGenerator({ scriptSections }: AudioGeneratorProps) {
  const [provider, setProvider] = useState<Provider>('elevenlabs');
  const [voice, setVoice] = useState(defaultVoicesByProvider.elevenlabs);
  const [speed, setSpeed] = useState(1);
  const [language, setLanguage] = useState('es');
  const [generatingId, setGeneratingId] = useState<number | null>(null);
  const [audios, setAudios] = useState<Map<number, GeneratedAudio>>(new Map());
  const [audioReady, setAudioReady] = useState<Map<number, boolean>>(new Map());
  const [availableVoices, setAvailableVoices] = useState<Voice[]>([]);
  const [voicesLoading, setVoicesLoading] = useState(false);
  const [voicesProgress, setVoicesProgress] = useState('Cargando voces...');
  const [showCloneModal, setShowCloneModal] = useState(false);
  const [clonedVoiceName, setClonedVoiceName] = useState('');
  const [cloneFile, setCloneFile] = useState<File | null>(null);
  const [cloning, setCloning] = useState(false);
  const [showVoiceSelector, setShowVoiceSelector] = useState(false);
  const [filterGender, setFilterGender] = useState<string>('');
  const [filterAge, setFilterAge] = useState<string>('');
  const [filterCategory, setFilterCategory] = useState<string>('');
  const loadVoicesTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const filteredSections = scriptSections.filter(s => s.trim().length > 0);

  useEffect(() => {
    loadVoices();
  }, [provider]);

  const loadVoices = async () => {
    if (voiceCache[provider] && voiceCache[provider]!.length > 0) {
      setAvailableVoices(voiceCache[provider]!);
      if (!voice.startsWith(provider)) {
        setVoice(voiceCache[provider]![0].voice_id);
      }
      return;
    }

    const defaultVoices: Voice[] = [
      {
        voice_id: defaultVoicesByProvider[provider],
        name: `Default ${provider}`,
        language: 'Multi',
        gender: 'Neutral',
      },
    ];
    setAvailableVoices(defaultVoices);
    setVoice(defaultVoicesByProvider[provider]);

    if (loadVoicesTimeoutRef.current) {
      clearTimeout(loadVoicesTimeoutRef.current);
    }

    loadVoicesTimeoutRef.current = setTimeout(async () => {
      setVoicesLoading(true);
      setVoicesProgress('Conectando con la API...');
      try {
        const response = await axios.get(`/api/audio/voices/${provider}`, {
          timeout: 60000,
        });

        if (response.data.voices && response.data.voices.length > 0) {
          voiceCache[provider] = response.data.voices;
          setAvailableVoices(response.data.voices);
          setVoice(response.data.voices[0].voice_id);
          toast.success(`✅ ${response.data.count} voces cargadas de ${provider}`);
        }
      } catch (error: any) {
        console.warn(`Error cargando voces de ${provider}:`, error.message);
        toast.error(`⚠️ Error cargando voces de ${provider}`);
      } finally {
        setVoicesLoading(false);
        setVoicesProgress('');
      }
    }, 500);
  };

  const pollAudioReady = (index: number, taskId: string) => {
    setAudioReady(prev => new Map(prev).set(index, false));

    let attempts = 0;
    const maxAttempts = 40; // ~2 minutos

    const interval = setInterval(async () => {
      attempts++;
      try {
        const response = await axios.get(`/api/audio/task/${taskId}`);
        const status = response.data.status?.status;

        if (status === 'done') {
          clearInterval(interval);
          setAudioReady(prev => new Map(prev).set(index, true));
          toast.success(`🔊 Audio listo para reproducir`);
        } else if (status === 'failed' || status === 'error') {
          clearInterval(interval);
          toast.error('La generación de audio falló');
        } else if (attempts >= maxAttempts) {
          clearInterval(interval);
          toast.error('El audio está tardando demasiado en procesarse');
        }
      } catch (error) {
        if (attempts >= maxAttempts) {
          clearInterval(interval);
          console.error('Error comprobando estado del audio:', error);
        }
      }
    }, 3000);
  };

  const handleGenerateAudio = async (index: number) => {
    const section = filteredSections[index];
    if (!section) return;

    setGeneratingId(index);
    try {
      const response = await axios.post('/api/audio/generate', {
        text: section,
        voiceId: voice,
        speed,
      });

      const audio = response.data.audio;
      setAudios(prev => new Map(prev).set(index, audio));
      toast.success(`✨ Generando audio... esto puede tardar unos segundos`);
      pollAudioReady(index, audio.taskId);
    } catch (error) {
      toast.error('Error al generar audio');
      console.error(error);
    } finally {
      setGeneratingId(null);
    }
  };

  const handleGenerateBatchAudio = async () => {
    if (filteredSections.length === 0) {
      toast.error('No hay secciones de guion');
      return;
    }

    setGeneratingId(-1);
    try {
      const response = await axios.post('/api/audio/batch', {
        texts: filteredSections,
        voiceId: voice,
        speed,
      });

      const batchAudios = response.data.audios;
      const newAudios = new Map(audios);
      batchAudios.forEach((audio: GeneratedAudio, idx: number) => {
        newAudios.set(idx, audio);
        pollAudioReady(idx, audio.taskId);
      });
      setAudios(newAudios);

      toast.success(`✨ Generando ${batchAudios.length} audios... esto puede tardar unos segundos`);
    } catch (error) {
      toast.error('Error al generar lote de audios');
      console.error(error);
    } finally {
      setGeneratingId(null);
    }
  };

  const handleCloneVoice = async () => {
    if (!clonedVoiceName.trim() || !cloneFile) {
      toast.error('Por favor completa el nombre y selecciona un archivo');
      return;
    }

    setCloning(true);
    try {
      const reader = new FileReader();
      reader.onload = async (e) => {
        const base64 = (e.target?.result as string).split(',')[1];
        const response = await axios.post('/api/audio/clone', {
          voiceName: clonedVoiceName,
          audioFile: base64,
        });

        const clonedVoiceId = `clone_${response.data.voice.voice_id}`;
        setVoice(clonedVoiceId);
        setShowCloneModal(false);
        setClonedVoiceName('');
        setCloneFile(null);
        toast.success(`🎤 Voz clonada: ${clonedVoiceName}`);
      };
      reader.readAsDataURL(cloneFile);
    } catch (error) {
      toast.error('Error al clonar voz');
      console.error(error);
    } finally {
      setCloning(false);
    }
  };

  const handleDeleteAudio = (index: number) => {
    setAudios(prev => {
      const newMap = new Map(prev);
      newMap.delete(index);
      return newMap;
    });
    setAudioReady(prev => {
      const newMap = new Map(prev);
      newMap.delete(index);
      return newMap;
    });
    toast.success('Audio eliminado');
  };

  const handlePlayAudio = (taskId: string) => {
    const audioElement = new Audio(`/api/audio/file/${taskId}`);
    audioElement.play().catch(error => {
      toast.error('El audio todavía no está listo, intenta de nuevo en unos segundos');
      console.error(error);
    });
  };

  const handleDownloadAudio = async (taskId: string, index: number) => {
    try {
      const response = await axios.get(`/api/audio/file/${taskId}`, {
        responseType: 'blob',
      });

      const url = window.URL.createObjectURL(response.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = `audio_section_${index + 1}.mp3`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      toast.success('Descarga iniciada');
    } catch (error) {
      toast.error('Error al descargar audio');
      console.error(error);
    }
  };

  const handleSelectVoice = (voiceId: string) => {
    setVoice(voiceId);
    setShowVoiceSelector(false);
    toast.success('✅ Voz seleccionada');
  };

  const getFilteredVoices = () => {
    return availableVoices.filter(v => {
      if (filterGender && v.gender !== filterGender) return false;
      if (filterAge && v.age !== filterAge) return false;
      if (filterCategory && v.category !== filterCategory) return false;
      return true;
    });
  };

  const currentProvider = allProviders.find(p => p.id === provider);
  const providerColor = currentProvider?.color || 'bg-accent-600';

  return (
    <div className="space-y-6">
      {/* Configuration Section */}
      <div className="card-lg">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2.5 bg-accent-600 rounded-lg">
            <Volume2 className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="text-gray-900 dark:text-zinc-100 text-sm font-medium">Generador de Audio</h2>
            <p className="text-gray-400 dark:text-zinc-500 text-[10px]">Crea voces profesionales con IA</p>
          </div>
        </div>

        {/* Provider Selection */}
        <div className="mb-6 p-4 bg-gray-50 dark:bg-zinc-950 rounded-lg border border-gray-200 dark:border-zinc-800">
          <p className="text-gray-500 dark:text-zinc-400 text-xs font-medium mb-3">📡 Selecciona el proveedor de voces:</p>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-2">
            {allProviders.map(p => (
              <button
                key={p.id}
                onClick={() => setProvider(p.id)}
                className={`p-2 rounded-lg font-medium transition-all border text-center text-sm ${
                  provider === p.id
                    ? `${p.color} text-white border-transparent`
                    : 'bg-white text-gray-700 border-gray-200 hover:border-gray-300 dark:bg-zinc-900 dark:text-zinc-300 dark:border-zinc-800 dark:hover:border-zinc-600'
                }`}
                title={p.name}
              >
                <div>{p.emoji}</div>
                <div className="text-xs">{p.name.split(' ')[0]}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Voice Configuration Section */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <div>
            <label className="block text-gray-500 dark:text-zinc-400 text-xs font-medium mb-2">🎤 Voz Actual</label>
            <div className="p-3 bg-gray-50 dark:bg-zinc-950 border border-gray-200 dark:border-zinc-800 rounded-lg">
              <p className="text-sm font-medium text-gray-900 dark:text-zinc-100 truncate">
                {availableVoices.find(v => v.voice_id === voice)?.name || 'Default'}
              </p>
              <p className="text-xs text-gray-400 dark:text-zinc-600 truncate">{voice}</p>
            </div>
          </div>

          <div>
            <label className="block text-gray-500 dark:text-zinc-400 text-xs font-medium mb-2">
              ⚡ Velocidad: {speed.toFixed(1)}x
            </label>
            <input
              type="range"
              min="0.5"
              max="2"
              step="0.1"
              value={speed}
              onChange={(e) => setSpeed(parseFloat(e.target.value))}
              className="input-range"
            />
          </div>

          <div>
            <label className="block text-gray-500 dark:text-zinc-400 text-xs font-medium mb-2">🌐 Idioma</label>
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              className="w-full px-4 py-3 bg-gray-50 dark:bg-zinc-950 border border-gray-200 dark:border-zinc-800 text-gray-700 dark:text-zinc-300 rounded-lg focus:border-accent-500 dark:focus:border-accent-600 focus:outline-none"
            >
              <option value="es">🇪🇸 Español</option>
              <option value="en">🇬🇧 Inglés</option>
              <option value="fr">🇫🇷 Francés</option>
              <option value="de">🇩🇪 Alemán</option>
              <option value="pt">🇵🇹 Portugués</option>
              <option value="ja">🇯🇵 Japonés</option>
              <option value="zh">🇨🇳 Chino</option>
            </select>
          </div>

          <button
            onClick={handleGenerateBatchAudio}
            disabled={filteredSections.length === 0}
            className="btn-primary py-3 text-sm flex items-center justify-center gap-2 h-fit"
          >
            <Zap className="w-4 h-4" />
            Generar Todo
          </button>

          <div className="flex gap-2 items-end">
            <button
              onClick={() => setShowVoiceSelector(!showVoiceSelector)}
              className="flex-1 btn-secondary py-3 text-sm flex items-center justify-center gap-2"
            >
              🎙️ Seleccionar Voz ({availableVoices.length})
              {voicesLoading && <Loader className="w-4 h-4 animate-spin" />}
            </button>
            <button
              onClick={() => setShowCloneModal(true)}
              title="Clonar voz"
              className="btn-light py-3 px-4"
            >
              <Plus className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Voice Selector Subsection */}
        {showVoiceSelector && (
          <div className="mb-6 p-5 bg-gray-50 dark:bg-zinc-950 border border-gray-200 dark:border-zinc-800 rounded-xl">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-gray-900 dark:text-zinc-100 text-sm font-medium">🗣️ Selector de Voces</h3>
              {voicesLoading && (
                <div className="flex items-center gap-2">
                  <Loader className="w-4 h-4 animate-spin text-accent-600" />
                  <span className="text-xs font-medium text-accent-600 dark:text-accent-400">{voicesProgress}</span>
                </div>
              )}
            </div>

            {/* Filtros */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              <div>
                <label className="block text-gray-500 dark:text-zinc-400 text-xs font-medium mb-2">👥 Género</label>
                <select
                  value={filterGender}
                  onChange={(e) => setFilterGender(e.target.value)}
                  className="w-full px-3 py-2 bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-lg text-gray-700 dark:text-zinc-300 focus:border-accent-500 dark:focus:border-accent-600 focus:outline-none text-sm"
                >
                  <option value="">Todos</option>
                  {VOICE_GENDERS.map(g => (
                    <option key={g} value={g}>{g}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-gray-500 dark:text-zinc-400 text-xs font-medium mb-2">🎂 Edad</label>
                <select
                  value={filterAge}
                  onChange={(e) => setFilterAge(e.target.value)}
                  className="w-full px-3 py-2 bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-lg text-gray-700 dark:text-zinc-300 focus:border-accent-500 dark:focus:border-accent-600 focus:outline-none text-sm"
                >
                  <option value="">Todas</option>
                  {VOICE_AGES.map(a => (
                    <option key={a} value={a}>{a}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-gray-500 dark:text-zinc-400 text-xs font-medium mb-2">📂 Categoría</label>
                <select
                  value={filterCategory}
                  onChange={(e) => setFilterCategory(e.target.value)}
                  className="w-full px-3 py-2 bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-lg text-gray-700 dark:text-zinc-300 focus:border-accent-500 dark:focus:border-accent-600 focus:outline-none text-sm"
                >
                  <option value="">Todas</option>
                  {VOICE_CATEGORIES.map(c => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Grid de Voces */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 max-h-96 overflow-y-auto">
              {getFilteredVoices().length > 0 ? (
                getFilteredVoices().map(v => (
                  <div
                    key={v.voice_id}
                    className={`p-4 rounded-lg border transition-all cursor-pointer ${
                      voice === v.voice_id
                        ? 'bg-accent-50 dark:bg-accent-950/50 border-accent-300 dark:border-accent-700 text-accent-700 dark:text-accent-300'
                        : 'bg-white border-gray-200 hover:border-gray-300 dark:bg-zinc-900 dark:border-zinc-800 dark:hover:border-zinc-600'
                    }`}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex-1">
                        <p className={`font-medium text-sm ${voice === v.voice_id ? '' : 'text-gray-900 dark:text-zinc-100'}`}>{v.name}</p>
                        <p className={`text-xs ${voice === v.voice_id ? 'opacity-70' : 'text-gray-400 dark:text-zinc-600'}`}>{v.voice_id}</p>
                      </div>
                      {voice === v.voice_id && <Check className="w-5 h-5" />}
                    </div>
                    <div className={`text-xs space-y-1 mb-3 ${voice === v.voice_id ? 'opacity-80' : 'text-gray-500 dark:text-zinc-400'}`}>
                      {v.gender && <p>👥 {v.gender}</p>}
                      {v.age && <p>🎂 {v.age}</p>}
                      {v.category && <p>📂 {v.category}</p>}
                    </div>
                    <button
                      onClick={() => handleSelectVoice(v.voice_id)}
                      className={`w-full py-2 rounded-lg font-medium text-sm transition-all ${
                        voice === v.voice_id
                          ? 'bg-accent-600 text-white hover:bg-accent-700'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700'
                      }`}
                    >
                      {voice === v.voice_id ? '✓ Seleccionada' : 'Usar'}
                    </button>
                  </div>
                ))
              ) : (
                <div className="col-span-3 text-center py-8 text-gray-500 dark:text-zinc-400">
                  <p className="font-medium text-sm">No hay voces que coincidan con los filtros</p>
                </div>
              )}
            </div>
          </div>
        )}

        {filteredSections.length === 0 && (
          <div className="text-center py-8 text-gray-500 dark:text-zinc-400 bg-gray-50 dark:bg-zinc-950 rounded-lg">
            <p className="font-medium text-sm">📝 Sube un guion primero para generar audio</p>
          </div>
        )}
      </div>

      {/* Voice Cloning Modal */}
      {showCloneModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="card-lg max-w-md w-full">
            <div className="flex items-center gap-3 mb-5">
              <Mic2 className="w-5 h-5 text-accent-600" />
              <h3 className="text-gray-900 dark:text-zinc-100 text-sm font-medium">Clonar Voz</h3>
            </div>

            <div className="space-y-4 mb-6">
              <div>
                <label className="block text-gray-500 dark:text-zinc-400 text-xs font-medium mb-2">Nombre de la voz</label>
                <input
                  type="text"
                  value={clonedVoiceName}
                  onChange={(e) => setClonedVoiceName(e.target.value)}
                  placeholder="Ej: Mi voz personalizada"
                  className="w-full px-4 py-2 bg-gray-50 dark:bg-zinc-950 border border-gray-200 dark:border-zinc-800 text-gray-900 dark:text-zinc-100 placeholder-gray-400 dark:placeholder-zinc-600 rounded-lg focus:border-accent-500 dark:focus:border-accent-600 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-gray-500 dark:text-zinc-400 text-xs font-medium mb-2">Archivo de audio (MP3/WAV)</label>
                <input
                  type="file"
                  accept="audio/*"
                  onChange={(e) => setCloneFile(e.target.files?.[0] || null)}
                  className="w-full px-4 py-2 bg-gray-50 dark:bg-zinc-950 border border-gray-200 dark:border-zinc-800 text-gray-900 dark:text-zinc-100 rounded-lg"
                />
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={handleCloneVoice}
                disabled={cloning || !clonedVoiceName || !cloneFile}
                className="btn-primary flex-1 py-2 text-sm flex items-center justify-center gap-2"
              >
                {cloning && <Loader className="w-4 h-4 animate-spin" />}
                {cloning ? 'Clonando...' : 'Clonar Voz'}
              </button>
              <button
                onClick={() => setShowCloneModal(false)}
                className="btn-secondary flex-1 py-2 text-sm"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Audio Sections Grid */}
      {filteredSections.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-gray-900 dark:text-zinc-100 text-sm font-medium flex items-center gap-3">
            <div className="p-2 bg-accent-600 rounded-lg">
              <Volume2 className="w-5 h-5 text-white" />
            </div>
            Audios ({filteredSections.length} secciones)
          </h3>

          <div className="space-y-4">
            {filteredSections.map((section, index) => {
              const audio = audios.get(index);
              return (
                <div key={index} className="card">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex-1">
                      <span className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-accent-600 text-white text-sm font-medium mb-3">
                        {index + 1}
                      </span>
                      <p className="text-sm font-medium text-gray-700 dark:text-zinc-300 line-clamp-2">
                        {section.substring(0, 100)}
                        {section.length > 100 ? '...' : ''}
                      </p>
                    </div>
                  </div>

                  <div className="bg-gray-50 dark:bg-zinc-950 p-4 rounded-lg mb-4 border border-gray-200 dark:border-zinc-800">
                    <p className="text-sm text-gray-700 dark:text-zinc-300 line-clamp-3">{section}</p>
                  </div>

                  {audio && (
                    <div className={`mb-4 p-4 rounded-lg border ${
                      audioReady.get(index)
                        ? 'bg-emerald-50 dark:bg-emerald-950 border-emerald-200 dark:border-emerald-800'
                        : 'bg-amber-50 dark:bg-amber-950 border-amber-200 dark:border-amber-800'
                    }`}>
                      <div className="flex items-center justify-between mb-3">
                        <p className={`text-sm font-medium ${audioReady.get(index) ? 'text-emerald-700 dark:text-emerald-400' : 'text-amber-700 dark:text-amber-400'}`}>
                          {audioReady.get(index) ? (
                            '✓ Audio Generado'
                          ) : (
                            <span className="flex items-center gap-2">
                              <Loader className="w-4 h-4 animate-spin" />
                              Procesando audio...
                            </span>
                          )}
                        </p>
                        <p className={`text-xs font-medium bg-white dark:bg-zinc-900 px-3 py-1 rounded-full ${audioReady.get(index) ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}`}>
                          {audio.taskId.substring(0, 8)}...
                        </p>
                      </div>
                      {audioReady.get(index) && (
                        <audio controls className="w-full rounded-lg" src={`/api/audio/file/${audio.taskId}`} />
                      )}
                    </div>
                  )}

                  <div className="flex gap-2">
                    {audio ? (
                      <>
                        <button
                          onClick={() => handlePlayAudio(audio.taskId)}
                          disabled={!audioReady.get(index)}
                          className="flex-1 btn-light py-2 text-sm flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <Play className="w-4 h-4" />
                          Reproducir
                        </button>
                        <button
                          onClick={() => handleDownloadAudio(audio.taskId, index)}
                          disabled={!audioReady.get(index)}
                          className="btn-light py-2 px-4 text-sm flex items-center justify-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <Download className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDeleteAudio(index)}
                          className="btn-light py-2 px-4 text-sm flex items-center justify-center gap-1 hover:bg-red-50 hover:border-red-300 hover:text-red-600 dark:hover:bg-red-950/40 dark:hover:border-red-800 dark:hover:text-red-400"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => handleGenerateAudio(index)}
                        disabled={generatingId === index}
                        className="flex-1 btn-primary py-2 text-sm flex items-center justify-center gap-2"
                      >
                        {generatingId === index && (
                          <Loader className="w-4 h-4 animate-spin" />
                        )}
                        {generatingId === index
                          ? 'Generando...'
                          : 'Generar Audio'}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
