import axios, { AxiosInstance } from 'axios';
import { v4 as uuidv4 } from 'uuid';

export interface GeneratedAudio {
  id: string;
  taskId: string;
  text: string;
  voice: string;
  speed: number;
  generatedAt: string;
  status: 'pending' | 'completed' | 'failed';
}

export interface Voice {
  voice_id: string;
  name: string;
  language: string;
  gender: string;
  tags: string[];
  preview_url?: string;
}

export interface ClonedVoice {
  voice_id: string;
  voice_name: string;
  created_at: string;
}

export interface PronunciationRule {
  from: string;
  to: string;
  matchType: 'word' | 'contains';
  caseSensitive: boolean;
}

export interface PronunciationDictionary {
  id: number;
  name: string;
  rules: PronunciationRule[];
}

export interface DialogueSpeaker {
  voice_id: string;
  speed?: number;
}

export interface DialogueGenerationRequest {
  text: string;
  speakers: DialogueSpeaker[];
  delay?: number;
  with_transcript?: boolean;
  file_name?: string;
  receive_url?: string;
  pronunciation_dictionary_id?: number;
}

let client: AxiosInstance;

function getApiKey(): string {
  const key = process.env.AI33PRO_API_KEY || '';
  return key;
}

function getBaseUrl(): string {
  return process.env.AI33PRO_BASE_URL || 'https://api.ai33.pro';
}

function getWebhookUrl(): string {
  return process.env.AI33PRO_WEBHOOK_URL || '';
}

function initializeClient() {
  if (!client) {
    client = axios.create({
      baseURL: getBaseUrl(),
      headers: {
        'xi-api-key': getApiKey(),
      },
    });
  }
  return client;
}

function validateApiKey(): void {
  const apiKey = getApiKey();
  if (!apiKey || apiKey.trim() === '') {
    throw new Error('AI33PRO_API_KEY environment variable is missing or empty');
  }
}

// ========== TEXT TO SPEECH ==========
export async function generateAudioAI33Pro(
  text: string,
  options: {
    voiceId?: string;
    speed?: number;
    withTranscript?: boolean;
    fileName?: string;
    receiveUrl?: string;
    pronunciationDictionaryId?: number;
  } = {}
): Promise<GeneratedAudio> {
  try {
    validateApiKey();
    const client = initializeClient();

    const {
      voiceId = 'elevenlabs_EXAVITQu4vr4xnSDxMaL',
      speed = 1,
      withTranscript = false,
      fileName,
      receiveUrl = getWebhookUrl(),
      pronunciationDictionaryId,
    } = options;

    const formData = new FormData();
    formData.append('text', text);
    formData.append('voice_id', voiceId);
    formData.append('speed', speed.toString());
    formData.append('with_transcript', withTranscript.toString());

    if (fileName) formData.append('file_name', fileName);
    if (receiveUrl) formData.append('receive_url', receiveUrl);
    if (pronunciationDictionaryId) {
      formData.append('pronunciation_dictionary_id', pronunciationDictionaryId.toString());
    }

    const response = await client.post('/v3/text-to-speech', formData);

    if (!response.data.success || !response.data.task_id) {
      throw new Error(`Failed to generate audio: ${response.data.error?.message || 'Unknown error'}`);
    }

    return {
      id: uuidv4(),
      taskId: response.data.task_id,
      text,
      voice: voiceId,
      speed,
      generatedAt: new Date().toISOString(),
      status: 'pending',
    };
  } catch (error) {
    console.error('Error generating audio with AI33Pro v3:', error);
    throw error;
  }
}

// ========== TEXT TO DIALOGUE ==========
export async function generateDialogue(
  request: DialogueGenerationRequest
): Promise<GeneratedAudio> {
  try {
    validateApiKey();
    const client = initializeClient();

    const formData = new FormData();
    formData.append('text', request.text);
    formData.append('speakers', JSON.stringify(request.speakers));

    if (request.delay !== undefined) formData.append('delay', request.delay.toString());
    if (request.with_transcript !== undefined) {
      formData.append('with_transcript', request.with_transcript.toString());
    }
    if (request.file_name) formData.append('file_name', request.file_name);
    if (request.receive_url) formData.append('receive_url', request.receive_url);
    if (request.pronunciation_dictionary_id) {
      formData.append('pronunciation_dictionary_id', request.pronunciation_dictionary_id.toString());
    }

    const response = await client.post('/v3/text-to-speech/dialogue', formData);

    if (!response.data.success || !response.data.task_id) {
      throw new Error(`Failed to generate dialogue: ${response.data.error?.message || 'Unknown error'}`);
    }

    return {
      id: uuidv4(),
      taskId: response.data.task_id,
      text: request.text,
      voice: `dialogue_${request.speakers.map((s) => s.voice_id).join('_')}`,
      speed: 1,
      generatedAt: new Date().toISOString(),
      status: 'pending',
    };
  } catch (error) {
    console.error('Error generating dialogue:', error);
    throw error;
  }
}

// ========== VOICE LIBRARY ==========
export interface VoiceLibraryFilter {
  provider: 'elevenlabs' | 'minimax' | 'clone' | 'edge' | 'kokoro' | 'vbee' | 'fishaudio';
  search?: string;
  page?: number;
  pageSize?: number;
  filters?: Record<string, string>;
  language?: string;
  gender?: string;
}

export async function getVoiceLibrary(options: VoiceLibraryFilter): Promise<{ voices: Voice[]; pagination: any }> {
  try {
    validateApiKey();
    const client = initializeClient();

    const params: Record<string, any> = {
      provider: options.provider,
      page: options.page || 1,
      page_size: Math.min(options.pageSize || 30, 100),
    };

    if (options.search) params.search = options.search;
    if (options.language) params.language = options.language;
    if (options.gender) params.gender = options.gender;

    if (options.filters) {
      Object.entries(options.filters).forEach(([key, value]) => {
        params[key] = value;
      });
    }

    const response = await client.get('/v3/voices', { params });

    if (!response.data.success) {
      throw new Error(`Failed to fetch voices: ${response.data.error?.message || 'Unknown error'}`);
    }

    return {
      voices: response.data.data || [],
      pagination: response.data.pagination,
    };
  } catch (error) {
    console.error('Error fetching voice library:', error);
    throw error;
  }
}

// Get all voices from a provider
export async function getAllVoicesByProvider(
  provider: 'elevenlabs' | 'minimax' | 'clone' | 'edge' | 'kokoro' | 'vbee' | 'fishaudio'
): Promise<Voice[]> {
  try {
    const allVoices: Voice[] = [];
    let page = 1;
    let hasMore = true;

    while (hasMore) {
      const result = await getVoiceLibrary({ provider, page, pageSize: 100 });
      allVoices.push(...result.voices);
      hasMore = result.pagination?.has_more || false;
      page++;
    }

    return allVoices;
  } catch (error) {
    console.error(`Error fetching all voices for ${provider}:`, error);
    throw error;
  }
}

// ========== CLONE VOICE ==========
export async function cloneVoice(voiceName: string, audioBuffer: Buffer): Promise<ClonedVoice> {
  try {
    validateApiKey();
    const client = initializeClient();

    const formData = new FormData();
    formData.append('voice_name', voiceName);
    formData.append('audio_file', new Blob([audioBuffer], { type: 'audio/mpeg' }), 'sample.mp3');

    const response = await client.post('/v3/text-to-speech/voice-clone', formData);

    if (!response.data.success) {
      throw new Error(`Failed to clone voice: ${response.data.error?.message || 'Unknown error'}`);
    }

    return {
      voice_id: response.data.data.voice_id,
      voice_name: voiceName,
      created_at: new Date().toISOString(),
    };
  } catch (error) {
    console.error('Error cloning voice:', error);
    throw error;
  }
}

// ========== DELETE CLONE VOICE ==========
export async function deleteClonedVoice(voiceCloneId: string): Promise<boolean> {
  try {
    validateApiKey();
    const client = initializeClient();

    const response = await client.delete(`/v3/text-to-speech/voice-clone/${voiceCloneId}`);

    if (!response.data.success) {
      throw new Error(`Failed to delete cloned voice: ${response.data.error?.message || 'Unknown error'}`);
    }

    return true;
  } catch (error) {
    console.error('Error deleting cloned voice:', error);
    throw error;
  }
}

// ========== PRONUNCIATION DICTIONARY ==========
export async function createPronunciationDictionary(
  name: string,
  rules: PronunciationRule[]
): Promise<PronunciationDictionary> {
  try {
    validateApiKey();
    const client = initializeClient();

    const response = await client.post('/v3/dictionaries', {
      name,
      rules: rules.map((r) => ({
        from: r.from,
        to: r.to,
        matchType: r.matchType || 'word',
        caseSensitive: r.caseSensitive ?? false,
      })),
    });

    if (!response.data.success) {
      throw new Error(`Failed to create dictionary: ${response.data.error?.message || 'Unknown error'}`);
    }

    return response.data.dictionary;
  } catch (error) {
    console.error('Error creating pronunciation dictionary:', error);
    throw error;
  }
}

export async function getPronunciationDictionaries(): Promise<PronunciationDictionary[]> {
  try {
    validateApiKey();
    const client = initializeClient();

    const response = await client.get('/v3/dictionaries');

    if (!response.data.success) {
      throw new Error(`Failed to fetch dictionaries: ${response.data.error?.message || 'Unknown error'}`);
    }

    return response.data.dictionaries || [];
  } catch (error) {
    console.error('Error fetching dictionaries:', error);
    throw error;
  }
}

export async function getPronunciationDictionary(id: number): Promise<PronunciationDictionary> {
  try {
    validateApiKey();
    const client = initializeClient();

    const response = await client.get(`/v3/dictionaries/${id}`);

    if (!response.data.success) {
      throw new Error(`Failed to fetch dictionary: ${response.data.error?.message || 'Unknown error'}`);
    }

    return response.data.dictionary;
  } catch (error) {
    console.error('Error fetching dictionary:', error);
    throw error;
  }
}

export async function updatePronunciationDictionary(
  id: number,
  updates: { name?: string; rules?: PronunciationRule[] }
): Promise<PronunciationDictionary> {
  try {
    validateApiKey();
    const client = initializeClient();

    const payload: any = {};
    if (updates.name) payload.name = updates.name;
    if (updates.rules) {
      payload.rules = updates.rules.map((r) => ({
        from: r.from,
        to: r.to,
        matchType: r.matchType || 'word',
        caseSensitive: r.caseSensitive ?? false,
      }));
    }

    const response = await client.put(`/v3/dictionaries/${id}`, payload);

    if (!response.data.success) {
      throw new Error(`Failed to update dictionary: ${response.data.error?.message || 'Unknown error'}`);
    }

    return response.data.dictionary;
  } catch (error) {
    console.error('Error updating dictionary:', error);
    throw error;
  }
}

export async function deletePronunciationDictionary(id: number): Promise<boolean> {
  try {
    validateApiKey();
    const client = initializeClient();

    const response = await client.delete(`/v3/dictionaries/${id}`);

    if (!response.data.success) {
      throw new Error(`Failed to delete dictionary: ${response.data.error?.message || 'Unknown error'}`);
    }

    return true;
  } catch (error) {
    console.error('Error deleting dictionary:', error);
    throw error;
  }
}

export async function previewPronunciationDictionary(text: string, rules: PronunciationRule[]): Promise<any> {
  try {
    validateApiKey();
    const client = initializeClient();

    const response = await client.post('/v3/dictionaries/preview', {
      text,
      rules: rules.map((r) => ({
        from: r.from,
        to: r.to,
        matchType: r.matchType || 'word',
        caseSensitive: r.caseSensitive ?? false,
      })),
    });

    if (!response.data.success) {
      throw new Error(`Failed to preview dictionary: ${response.data.error?.message || 'Unknown error'}`);
    }

    return response.data;
  } catch (error) {
    console.error('Error previewing dictionary:', error);
    throw error;
  }
}

// ========== BATCH OPERATIONS ==========
export async function generateBatchAudio(
  texts: string[],
  options: { voiceId?: string; speed?: number } = {}
): Promise<GeneratedAudio[]> {
  const audios: GeneratedAudio[] = [];

  for (const text of texts) {
    try {
      const audio = await generateAudioAI33Pro(text, options);
      audios.push(audio);
      await new Promise((resolve) => setTimeout(resolve, 500)); // Rate limiting
    } catch (error) {
      console.error(`Failed to generate audio for text: ${text}`, error);
    }
  }

  return audios;
}

// ========== TASK STATUS ==========
export async function getTaskStatus(taskId: string): Promise<any> {
  try {
    validateApiKey();
    const client = initializeClient();

    const response = await client.get(`/common/task?task_id=${taskId}`);

    if (!response.data.success) {
      throw new Error(`Failed to get task status: ${response.data.error?.message || 'Unknown error'}`);
    }

    return response.data.data;
  } catch (error) {
    console.error('Error fetching task status:', error);
    throw error;
  }
}
