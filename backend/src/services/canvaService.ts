import axios from 'axios';
import { randomBytes, createHash } from 'crypto';
import { createWriteStream } from 'fs';
import { join } from 'path';
import { pipeline } from 'stream/promises';
import { getCanvaToken, saveCanvaToken, deleteCanvaToken } from './databaseService.js';

const CANVA_AUTHORIZE_URL = 'https://www.canva.com/api/oauth/authorize';
const CANVA_TOKEN_URL = 'https://api.canva.com/rest/v1/oauth/token';
const CANVA_API_BASE = 'https://api.canva.com/rest/v1';

// Scopes mínimos para listar diseños del usuario y exportarlos como imagen/archivo.
const CANVA_SCOPES = ['design:content:read', 'design:meta:read', 'asset:read'].join(' ');

function getClientCredentials() {
  const clientId = process.env.CANVA_CLIENT_ID;
  const clientSecret = process.env.CANVA_CLIENT_SECRET;
  const redirectUri = process.env.CANVA_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error(
      'Canva no está configurado: faltan CANVA_CLIENT_ID, CANVA_CLIENT_SECRET o CANVA_REDIRECT_URI en el .env'
    );
  }
  return { clientId, clientSecret, redirectUri };
}

// El intercambio de código por token (PKCE) es de un solo uso y dura pocos minutos,
// así que basta guardar el code_verifier en memoria por "state" mientras el usuario
// completa el login en Canva — no necesita persistir en disco.
const pendingAuth = new Map<string, { codeVerifier: string; createdAt: number }>();

function cleanupPendingAuth() {
  const cutoff = Date.now() - 10 * 60 * 1000;
  for (const [state, entry] of pendingAuth) {
    if (entry.createdAt < cutoff) pendingAuth.delete(state);
  }
}

function base64url(input: Buffer): string {
  return input.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function buildAuthorizationUrl(): string {
  const { clientId, redirectUri } = getClientCredentials();
  cleanupPendingAuth();

  const state = base64url(randomBytes(16));
  const codeVerifier = base64url(randomBytes(64));
  const codeChallenge = base64url(createHash('sha256').update(codeVerifier).digest());
  pendingAuth.set(state, { codeVerifier, createdAt: Date.now() });

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: CANVA_SCOPES,
    state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
  });

  return `${CANVA_AUTHORIZE_URL}?${params.toString()}`;
}

export async function handleAuthorizationCallback(code: string, state: string): Promise<void> {
  const pending = pendingAuth.get(state);
  if (!pending) {
    throw new Error('Estado de autorización inválido o expirado. Intenta conectar de nuevo.');
  }
  pendingAuth.delete(state);

  const { clientId, clientSecret, redirectUri } = getClientCredentials();
  const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

  const response = await axios.post(
    CANVA_TOKEN_URL,
    new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      code_verifier: pending.codeVerifier,
      redirect_uri: redirectUri,
    }),
    {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${basicAuth}`,
      },
    }
  );

  const { access_token, refresh_token, expires_in } = response.data;
  saveCanvaToken(access_token, refresh_token, Date.now() + expires_in * 1000);
}

async function refreshAccessToken(refreshToken: string) {
  const { clientId, clientSecret } = getClientCredentials();
  const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

  const response = await axios.post(
    CANVA_TOKEN_URL,
    new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    }),
    {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${basicAuth}`,
      },
    }
  );

  const { access_token, refresh_token, expires_in } = response.data;
  // Canva puede o no rotar el refresh_token — si no manda uno nuevo, se conserva el actual.
  saveCanvaToken(access_token, refresh_token || refreshToken, Date.now() + expires_in * 1000);
  return access_token as string;
}

export function isCanvaConnected(): boolean {
  return !!getCanvaToken();
}

export function disconnectCanva(): void {
  deleteCanvaToken();
}

// Refresca proactivamente si faltan menos de 2 minutos para que expire, en vez de
// esperar a que la API de Canva devuelva 401 y tener que reintentar la petición.
async function getValidAccessToken(): Promise<string> {
  const token = getCanvaToken();
  if (!token) {
    throw new Error('Canva no está conectado. Conecta tu cuenta primero.');
  }
  if (token.expiresAt - Date.now() > 2 * 60 * 1000) {
    return token.accessToken;
  }
  return refreshAccessToken(token.refreshToken);
}

export interface CanvaDesign {
  id: string;
  title: string;
  thumbnailUrl?: string;
  editUrl?: string;
  updatedAt?: number;
}

export async function listDesigns(continuation?: string): Promise<{ designs: CanvaDesign[]; continuation?: string }> {
  const accessToken = await getValidAccessToken();
  const response = await axios.get(`${CANVA_API_BASE}/designs`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    params: continuation ? { continuation } : undefined,
  });

  const designs: CanvaDesign[] = (response.data.items || []).map((item: any) => ({
    id: item.id,
    title: item.title || 'Sin título',
    thumbnailUrl: item.thumbnail?.url,
    editUrl: item.urls?.edit_url,
    updatedAt: item.updated_at,
  }));

  return { designs, continuation: response.data.continuation };
}

type ExportFormat = 'png' | 'jpg' | 'pdf' | 'mp4';

async function pollExportJob(accessToken: string, jobId: string): Promise<string[]> {
  const maxAttempts = 30;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const response = await axios.get(`${CANVA_API_BASE}/exports/${jobId}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const job = response.data.job;

    if (job.status === 'success') {
      return job.urls as string[];
    }
    if (job.status === 'failed') {
      throw new Error(job.error?.message || 'La exportación del diseño falló en Canva');
    }
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  throw new Error('Tiempo de espera agotado exportando el diseño desde Canva');
}

/** Exporta un diseño de Canva y descarga el resultado a la carpeta de uploads local. */
export async function importDesign(
  designId: string,
  designTitle: string,
  format: ExportFormat = 'png'
): Promise<{ filename: string; path: string; fullPath: string }> {
  const accessToken = await getValidAccessToken();

  const exportResponse = await axios.post(
    `${CANVA_API_BASE}/exports`,
    { design_id: designId, format: { type: format } },
    { headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' } }
  );

  const jobId = exportResponse.data.job.id;
  const urls = await pollExportJob(accessToken, jobId);
  const downloadUrl = urls[0];
  if (!downloadUrl) {
    throw new Error('Canva no devolvió ningún archivo exportado');
  }

  const uploadDirRel = process.env.UPLOAD_DIR || './uploads';
  const uploadDirAbs = join(process.cwd(), uploadDirRel);
  const safeTitle = designTitle.replace(/[^a-zA-Z0-9-_]+/g, '_').slice(0, 60) || 'canva-design';
  const filename = `${Date.now()}-canva-${safeTitle}.${format}`;
  const fullPath = join(uploadDirAbs, filename);

  const fileResponse = await axios.get(downloadUrl, { responseType: 'stream' });
  await pipeline(fileResponse.data, createWriteStream(fullPath));

  return { filename, path: `/uploads/${filename}`, fullPath };
}
