import { useState } from 'react';
import { Volume2, Loader, Play, Download, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import axios from 'axios';

interface GeneratedAudio {
  id: string;
  url: string;
  text: string;
  voice: string;
  duration: number;
  localPath: string;
  generatedAt: string;
}

interface AudioGeneratorProps {
  scriptSections: string[];
}

export default function AudioGenerator({
  scriptSections,
}: AudioGeneratorProps) {
  const [voice, setVoice] = useState('default');
  const [speed, setSpeed] = useState(1);
  const [language, setLanguage] = useState('es');
  const [generatingId, setGeneratingId] = useState<number | null>(null);
  const [audios, setAudios] = useState<Map<number, GeneratedAudio>>(new Map());
  const [playingId, setPlayingId] = useState<number | null>(null);
  const [availableVoices, setAvailableVoices] = useState<string[]>([]);

  const filteredSections = scriptSections.filter(s => s.trim().length > 0);

  const handleGenerateAudio = async (index: number) => {
    const section = filteredSections[index];
    if (!section) return;

    setGeneratingId(index);
    try {
      const response = await axios.post('/api/audio/generate', {
        text: section,
        voice,
        speed,
        language,
      });

      const audio = response.data.audio;
      setAudios(prev => new Map(prev).set(index, audio));
      toast.success('Audio generado exitosamente');
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

    try {
      const response = await axios.post('/api/audio/batch', {
        texts: filteredSections,
        voice,
        speed,
        language,
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
    }
  };

  const handlePlayAudio = (index: number) => {
    const audio = audios.get(index);
    if (!audio) return;

    const audioElement = new Audio(audio.url);
    audioElement.play();
    setPlayingId(index);

    audioElement.onended = () => setPlayingId(null);
  };

  const handleDownloadAudio = (audio: GeneratedAudio) => {
    const link = document.createElement('a');
    link.href = audio.url;
    link.download = `audio-${audio.id}.mp3`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success('Descargando audio...');
  };

  const handleDeleteAudio = (index: number) => {
    setAudios(prev => {
      const newMap = new Map(prev);
      newMap.delete(index);
      return newMap;
    });
    toast.success('Audio eliminado');
  };

  return (
    <div className="space-y-6">
      {/* Configuration Section */}
      <div className="card-lg">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-3 bg-gradient-to-r from-orange-500 to-red-500 rounded-lg">
            <Volume2 className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-2xl font-bold">Generador de Audio</h2>
            <p className="text-gray-400 text-sm">Crea voces profesionales con AI33Pro</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div>
            <label className="block text-sm font-semibold mb-2">Voz</label>
            <select
              value={voice}
              onChange={(e) => setVoice(e.target.value)}
              className="w-full px-4 py-2 bg-gray-900/50 border border-white/10 rounded-lg text-white focus:border-orange-500/50 focus:outline-none"
            >
              <option value="default">Default</option>
              <option value="male">Masculina</option>
              <option value="female">Femenina</option>
              <option value="narrator">Narrador</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-semibold mb-2">
              Velocidad: {speed}x
            </label>
            <input
              type="range"
              min="0.5"
              max="2"
              step="0.1"
              value={speed}
              onChange={(e) => setSpeed(parseFloat(e.target.value))}
              className="w-full h-2 bg-gray-800 rounded-lg appearance-none cursor-pointer accent-orange-500"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold mb-2">Idioma</label>
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              className="w-full px-4 py-2 bg-gray-900/50 border border-white/10 rounded-lg text-white focus:border-orange-500/50 focus:outline-none"
            >
              <option value="es">Español</option>
              <option value="en">Inglés</option>
              <option value="fr">Francés</option>
              <option value="de">Alemán</option>
              <option value="pt">Portugués</option>
            </select>
          </div>

          <div className="flex items-end">
            <button
              onClick={handleGenerateBatchAudio}
              disabled={filteredSections.length === 0}
              className="btn-primary w-full py-2 text-sm flex items-center justify-center gap-2"
            >
              <Volume2 className="w-4 h-4" />
              Generar Todo
            </button>
          </div>
        </div>

        {filteredSections.length === 0 && (
          <div className="text-center py-8 text-gray-400">
            <p>📝 Sube un guion primero para generar audio</p>
          </div>
        )}
      </div>

      {/* Audio Sections Grid */}
      {filteredSections.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <Volume2 className="w-5 h-5 text-orange-400" />
            Audios ({filteredSections.length})
          </h3>

          <div className="space-y-4">
            {filteredSections.map((section, index) => {
              const audio = audios.get(index);
              return (
                <div key={index} className="card">
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-gradient-to-r from-orange-500 to-red-500 text-sm font-bold mb-2">
                        {index + 1}
                      </span>
                      <p className="text-sm font-semibold text-gray-200 line-clamp-1">
                        {section.substring(0, 100)}
                        {section.length > 100 ? '...' : ''}
                      </p>
                    </div>
                  </div>

                  <div className="bg-gray-900/30 p-4 rounded-lg mb-4">
                    <p className="text-sm text-gray-300 line-clamp-3">{section}</p>
                  </div>

                  {audio && (
                    <div className="mb-4 p-4 bg-orange-950/30 border border-orange-500/20 rounded-lg">
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-sm font-semibold text-orange-300">
                          ✓ Audio Generado
                        </p>
                        <p className="text-xs text-gray-400">
                          {audio.duration.toFixed(1)}s
                        </p>
                      </div>
                      <audio controls className="w-full" src={audio.url} />
                    </div>
                  )}

                  <div className="flex gap-2">
                    {audio ? (
                      <>
                        <button
                          onClick={() => handlePlayAudio(index)}
                          className="flex-1 btn-secondary py-2 text-sm flex items-center justify-center gap-2"
                        >
                          <Play className="w-4 h-4" />
                          Reproducir
                        </button>
                        <button
                          onClick={() => handleDownloadAudio(audio)}
                          className="btn-secondary py-2 px-4 text-sm flex items-center justify-center gap-1"
                        >
                          <Download className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDeleteAudio(index)}
                          className="btn-secondary py-2 px-4 text-sm flex items-center justify-center gap-1 hover:bg-red-900/20 hover:border-red-600"
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
