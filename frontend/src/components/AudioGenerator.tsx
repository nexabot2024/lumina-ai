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
  { id: 'elevenlabs', name: 'ElevenLabs', emoji: '🎙️', color: 'from-blue-500 to-cyan-500' },
  { id: 'minimax', name: 'MiniMax', emoji: '🎵', color: 'from-green-500 to-emerald-500' },
  { id: 'fishaudio', name: 'FishAudio', emoji: '🐟', color: 'from-orange-500 to-amber-500' },
  { id: 'edge', name: 'Microsoft Edge', emoji: '🌐', color: 'from-blue-400 to-blue-600' },
  { id: 'kokoro', name: 'Kokoro', emoji: '🎭', color: 'from-purple-500 to-pink-500' },
  { id: 'vbee', name: 'VBee', emoji: '🐝', color: 'from-yellow-500 to-orange-500' },
  { id: 'clone', name: 'Voces Clonadas', emoji: '👤', color: 'from-indigo-500 to-purple-500' },
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
      toast.success(`✨ Audio generado - Task: ${audio.taskId.substring(0, 8)}...`);
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
      });
      setAudios(newAudios);

      toast.success(`✨ ${batchAudios.length} audios generados`);
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
    toast.success('Audio eliminado');
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
  const providerColor = currentProvider?.color || 'from-purple-600 to-pink-500';

  return (
    <div className="space-y-8">
      {/* Configuration Section */}
      <div className="card-lg">
        <div className="flex items-center gap-4 mb-6">
          <div className={`p-3 bg-gradient-to-br ${providerColor} rounded-2xl shadow-lg animate-float`}>
            <Volume2 className="w-6 h-6 text-white" />
          </div>
          <div>
            <h2 className="text-3xl font-black text-gray-800">Generador de Audio</h2>
            <p className="text-gray-600 text-sm font-medium">Crea voces profesionales con IA</p>
          </div>
        </div>

        {/* Provider Selection */}
        <div className="mb-6 p-5 bg-gradient-to-r from-purple-100 to-pink-100 rounded-2xl border-2 border-purple-200/60">
          <p className="text-sm font-bold text-gray-700 mb-4">📡 Selecciona el proveedor de voces:</p>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-2">
            {allProviders.map(p => (
              <button
                key={p.id}
                onClick={() => setProvider(p.id)}
                className={`p-2 rounded-lg font-bold transition-all border-2 text-center text-sm ${
                  provider === p.id
                    ? `bg-gradient-to-r ${p.color} text-white border-transparent shadow-lg -translate-y-1`
                    : 'bg-white text-gray-700 border-gray-300 hover:border-gray-400'
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
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5 mb-6">
          <div>
            <label className="block text-sm font-bold mb-3 text-gray-700">🎤 Voz Actual</label>
            <div className="p-3 bg-gradient-to-r from-blue-100 to-cyan-100 border-2 border-blue-300 rounded-xl">
              <p className="text-sm font-bold text-gray-800 truncate">
                {availableVoices.find(v => v.voice_id === voice)?.name || 'Default'}
              </p>
              <p className="text-xs text-gray-600 truncate">{voice}</p>
            </div>
          </div>

          <div>
            <label className="block text-sm font-bold mb-3 text-gray-700">
              ⚡ Velocidad: {speed.toFixed(1)}x
            </label>
            <input
              type="range"
              min="0.5"
              max="2"
              step="0.1"
              value={speed}
              onChange={(e) => setSpeed(parseFloat(e.target.value))}
              className="w-full h-3 bg-gradient-to-r from-green-300 to-emerald-300 rounded-full appearance-none cursor-pointer accent-green-600"
            />
          </div>

          <div>
            <label className="block text-sm font-bold mb-3 text-gray-700">🌐 Idioma</label>
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              className="w-full px-4 py-3 bg-white border-2 border-blue-200 rounded-xl text-gray-800 font-medium focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200 transition-all"
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
            className="btn-primary py-3 text-sm font-bold flex items-center justify-center gap-2 h-fit"
          >
            <Zap className="w-4 h-4" />
            Generar Todo
          </button>

          <div className="flex gap-2 items-end">
            <button
              onClick={() => setShowVoiceSelector(!showVoiceSelector)}
              className="flex-1 btn-secondary py-3 text-sm font-bold flex items-center justify-center gap-2"
            >
              🎙️ Seleccionar Voz ({availableVoices.length})
              {voicesLoading && <Loader className="w-4 h-4 animate-spin" />}
            </button>
            <button
              onClick={() => setShowCloneModal(true)}
              title="Clonar voz"
              className="btn-light py-3 px-4 font-bold"
            >
              <Plus className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Voice Selector Subsection */}
        {showVoiceSelector && (
          <div className="mb-6 p-6 bg-gradient-to-br from-indigo-100 to-purple-100 border-2 border-purple-300 rounded-2xl">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-xl font-black text-gray-800">🗣️ Selector de Voces</h3>
              {voicesLoading && (
                <div className="flex items-center gap-2">
                  <Loader className="w-5 h-5 animate-spin text-purple-600" />
                  <span className="text-sm font-bold text-purple-600">{voicesProgress}</span>
                </div>
              )}
            </div>

            {/* Filtros */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              <div>
                <label className="block text-sm font-bold mb-2 text-gray-700">👥 Género</label>
                <select
                  value={filterGender}
                  onChange={(e) => setFilterGender(e.target.value)}
                  className="w-full px-3 py-2 bg-white border-2 border-purple-200 rounded-lg text-gray-800 font-medium focus:border-purple-500 focus:outline-none text-sm"
                >
                  <option value="">Todos</option>
                  {VOICE_GENDERS.map(g => (
                    <option key={g} value={g}>{g}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-bold mb-2 text-gray-700">🎂 Edad</label>
                <select
                  value={filterAge}
                  onChange={(e) => setFilterAge(e.target.value)}
                  className="w-full px-3 py-2 bg-white border-2 border-purple-200 rounded-lg text-gray-800 font-medium focus:border-purple-500 focus:outline-none text-sm"
                >
                  <option value="">Todas</option>
                  {VOICE_AGES.map(a => (
                    <option key={a} value={a}>{a}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-bold mb-2 text-gray-700">📂 Categoría</label>
                <select
                  value={filterCategory}
                  onChange={(e) => setFilterCategory(e.target.value)}
                  className="w-full px-3 py-2 bg-white border-2 border-purple-200 rounded-lg text-gray-800 font-medium focus:border-purple-500 focus:outline-none text-sm"
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
                    className={`p-4 rounded-xl border-2 transition-all cursor-pointer ${
                      voice === v.voice_id
                        ? 'bg-gradient-to-r from-purple-500 to-pink-500 border-purple-600 text-white shadow-lg'
                        : 'bg-white border-gray-300 hover:border-purple-400'
                    }`}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex-1">
                        <p className="font-bold text-sm">{v.name}</p>
                        <p className="text-xs opacity-70">{v.voice_id}</p>
                      </div>
                      {voice === v.voice_id && <Check className="w-5 h-5" />}
                    </div>
                    <div className="text-xs opacity-80 space-y-1 mb-3">
                      {v.gender && <p>👥 {v.gender}</p>}
                      {v.age && <p>🎂 {v.age}</p>}
                      {v.category && <p>📂 {v.category}</p>}
                    </div>
                    <button
                      onClick={() => handleSelectVoice(v.voice_id)}
                      className={`w-full py-2 rounded-lg font-bold text-sm transition-all ${
                        voice === v.voice_id
                          ? 'bg-white text-purple-600 hover:bg-gray-100'
                          : 'bg-gradient-to-r from-purple-500 to-pink-500 text-white hover:from-purple-600 hover:to-pink-600'
                      }`}
                    >
                      {voice === v.voice_id ? '✓ Seleccionada' : 'Usar'}
                    </button>
                  </div>
                ))
              ) : (
                <div className="col-span-3 text-center py-8 text-gray-600">
                  <p className="font-semibold">No hay voces que coincidan con los filtros</p>
                </div>
              )}
            </div>
          </div>
        )}

        {filteredSections.length === 0 && (
          <div className="text-center py-8 text-gray-600 bg-gray-100 rounded-2xl">
            <p className="font-semibold">📝 Sube un guion primero para generar audio</p>
          </div>
        )}
      </div>

      {/* Voice Cloning Modal */}
      {showCloneModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="card-lg max-w-md w-full">
            <div className="flex items-center gap-3 mb-5">
              <Mic2 className="w-6 h-6 text-purple-600" />
              <h3 className="text-2xl font-bold text-gray-800">Clonar Voz</h3>
            </div>

            <div className="space-y-4 mb-6">
              <div>
                <label className="block text-sm font-bold mb-2 text-gray-700">Nombre de la voz</label>
                <input
                  type="text"
                  value={clonedVoiceName}
                  onChange={(e) => setClonedVoiceName(e.target.value)}
                  placeholder="Ej: Mi voz personalizada"
                  className="w-full px-4 py-2 bg-white border-2 border-purple-200 rounded-xl text-gray-800 focus:border-purple-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-sm font-bold mb-2 text-gray-700">Archivo de audio (MP3/WAV)</label>
                <input
                  type="file"
                  accept="audio/*"
                  onChange={(e) => setCloneFile(e.target.files?.[0] || null)}
                  className="w-full px-4 py-2 bg-white border-2 border-purple-200 rounded-xl text-gray-800"
                />
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={handleCloneVoice}
                disabled={cloning || !clonedVoiceName || !cloneFile}
                className="btn-primary flex-1 py-2 text-sm font-bold flex items-center justify-center gap-2"
              >
                {cloning && <Loader className="w-4 h-4 animate-spin" />}
                {cloning ? 'Clonando...' : 'Clonar Voz'}
              </button>
              <button
                onClick={() => setShowCloneModal(false)}
                className="btn-secondary flex-1 py-2 text-sm font-bold"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Audio Sections Grid */}
      {filteredSections.length > 0 && (
        <div className="space-y-6">
          <h3 className="text-2xl font-black text-gray-800 flex items-center gap-3">
            <div className={`p-2 bg-gradient-to-br ${providerColor} rounded-xl`}>
              <Volume2 className="w-6 h-6 text-white" />
            </div>
            Audios ({filteredSections.length} secciones)
          </h3>

          <div className="space-y-5">
            {filteredSections.map((section, index) => {
              const audio = audios.get(index);
              return (
                <div key={index} className="card-gradient border-2 border-green-200/50 hover-lift">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex-1">
                      <span className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-br from-green-500 to-emerald-500 text-white text-sm font-bold mb-3 shadow-lg">
                        {index + 1}
                      </span>
                      <p className="text-sm font-bold text-gray-700 line-clamp-2">
                        {section.substring(0, 100)}
                        {section.length > 100 ? '...' : ''}
                      </p>
                    </div>
                  </div>

                  <div className="bg-gradient-to-br from-gray-100 to-gray-50 p-4 rounded-xl mb-4 border border-gray-300">
                    <p className="text-sm text-gray-700 line-clamp-3">{section}</p>
                  </div>

                  {audio && (
                    <div className="mb-4 p-4 bg-gradient-to-r from-green-50 to-emerald-50 border-2 border-green-300 rounded-xl">
                      <div className="flex items-center justify-between mb-3">
                        <p className="text-sm font-bold text-green-700">
                          ✓ Audio Generado
                        </p>
                        <p className="text-xs font-bold text-green-600 bg-white px-3 py-1 rounded-full">
                          {audio.taskId.substring(0, 8)}...
                        </p>
                      </div>
                      <audio controls className="w-full rounded-lg" src={audio.taskId} />
                    </div>
                  )}

                  <div className="flex gap-2">
                    {audio ? (
                      <>
                        <button
                          className="flex-1 btn-light py-2 text-sm font-bold flex items-center justify-center gap-2"
                        >
                          <Play className="w-4 h-4" />
                          Reproducir
                        </button>
                        <button
                          className="btn-light py-2 px-4 text-sm font-bold flex items-center justify-center gap-1"
                        >
                          <Download className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDeleteAudio(index)}
                          className="btn-light py-2 px-4 text-sm font-bold flex items-center justify-center gap-1 hover:bg-red-200 hover:border-red-400"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => handleGenerateAudio(index)}
                        disabled={generatingId === index}
                        className="flex-1 btn-primary py-2 text-sm font-bold flex items-center justify-center gap-2"
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
