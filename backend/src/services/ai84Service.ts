import axios, { AxiosInstance } from 'axios';

// AI84.pro — proveedor de TTS alternativo a AI33Pro (mismo tipo de servicio, distinta
// cuenta/API). La generación es asíncrona: se crea el job, se devuelve un job_id, y se
// consulta el estado con GET hasta que quede en "done" o "failed" — ver docs del
// servicio para la tabla completa de estados por tipo de endpoint.

export interface Ai84Job {
  jobId: string;
  status: 'queued' | 'processing' | 'done' | 'failed';
  audioUrl?: string;
  transcriptUrl?: string;
  errorMessage?: string;
  creditCost?: number;
}

let client: AxiosInstance;

function getApiKey(): string {
  return process.env.AI84PRO_API_KEY || '';
}

function getBaseUrl(): string {
  return process.env.AI84PRO_BASE_URL || 'https://api.ai84.pro';
}

function initializeClient(): AxiosInstance {
  if (!client) {
    client = axios.create({
      baseURL: getBaseUrl(),
      headers: { 'xi-api-key': getApiKey() },
    });
  }
  return client;
}

function validateApiKey(): void {
  if (!getApiKey().trim()) {
    throw new Error('AI84PRO_API_KEY environment variable is missing or empty');
  }
}

// Los errores de esta API vienen como {success:false, error, message} — se extrae el
// mensaje legible en vez de dejar pasar el genérico de axios ("Request failed...").
function extractErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data as { message?: string; error?: string } | undefined;
    return data?.message || data?.error || error.message;
  }
  return error instanceof Error ? error.message : 'Error desconocido';
}

export async function generateAudioAI84(
  text: string,
  options: {
    voiceId?: string;
    modelId?: string;
    outputFormat?: string;
    voiceSettings?: Record<string, number | boolean>;
  } = {}
): Promise<Ai84Job> {
  try {
    validateApiKey();
    const c = initializeClient();

    const response = await c.post('/v2/text-to-speech/async', {
      text,
      voice_id: options.voiceId,
      model_id: options.modelId,
      output_format: options.outputFormat || 'mp3_44100_128',
      voice_settings: options.voiceSettings,
    });

    if (!response.data.success || !response.data.job_id) {
      throw new Error('AI84.pro no devolvió un job_id válido');
    }

    return {
      jobId: response.data.job_id,
      status: response.data.status || 'queued',
      creditCost: response.data.credit_cost,
    };
  } catch (error) {
    console.error('Error generating audio with AI84.pro:', extractErrorMessage(error));
    throw new Error(extractErrorMessage(error));
  }
}

export async function getAI84JobStatus(jobId: string): Promise<Ai84Job> {
  try {
    validateApiKey();
    const c = initializeClient();

    const response = await c.get(`/v2/text-to-speech/async/${jobId}`);
    const job = response.data.job;

    if (!job) {
      throw new Error('AI84.pro no devolvió información del job');
    }

    return {
      jobId,
      status: job.status,
      audioUrl: job.audioUrl,
      transcriptUrl: job.transcriptUrl,
      errorMessage: job.errorMessage,
      creditCost: job.credit_cost,
    };
  } catch (error) {
    console.error('Error fetching AI84.pro job status:', extractErrorMessage(error));
    throw new Error(extractErrorMessage(error));
  }
}

export interface Ai84SharedVoice {
  voice_id: string;
  name: string;
  category?: string;
  gender?: string;
  language?: string;
  description?: string;
}

export async function getAI84SharedVoices(params: {
  search?: string;
  gender?: string;
  language?: string;
  pageSize?: number;
  page?: number;
} = {}): Promise<Ai84SharedVoice[]> {
  try {
    validateApiKey();
    const c = initializeClient();

    const response = await c.get('/v1/shared-voices', {
      params: {
        search: params.search,
        gender: params.gender,
        language: params.language,
        page_size: params.pageSize ?? 30,
        page: params.page ?? 0,
      },
    });

    return response.data.voices || [];
  } catch (error) {
    console.error('Error fetching AI84.pro shared voices:', extractErrorMessage(error));
    throw new Error(extractErrorMessage(error));
  }
}

export async function getAI84Credits(): Promise<number> {
  try {
    validateApiKey();
    const c = initializeClient();
    const response = await c.get('/v1/credits');
    return response.data.credits ?? 0;
  } catch (error) {
    console.error('Error fetching AI84.pro credits:', extractErrorMessage(error));
    throw new Error(extractErrorMessage(error));
  }
}
