import axios from 'axios';
import { randomUUID } from 'crypto';
import sharp from 'sharp';

const BRAVE_WEB_SEARCH_URL = 'https://api.search.brave.com/res/v1/web/search';
const BRAVE_IMAGE_SEARCH_URL = 'https://api.search.brave.com/res/v1/images/search';
interface BraveImageDownloadSource {
  originalUrl: string;
  thumbnailUrl: string;
}

// La URL original puede estar protegida contra descargas automatizadas. Conservamos
// también el proxy de miniaturas de Brave como alternativa fiable para no devolver
// archivos vacíos al usuario.
const imageDownloadUrls = new Map<string, BraveImageDownloadSource>();

export interface BraveImageResult {
  id: string;
  title: string;
  pageUrl: string;
  source: string;
  thumbnailUrl: string;
  imageUrl: string;
  width?: number;
  height?: number;
}

/** Normaliza URLs para detectar la misma imagen indexada con parámetros de tracking
 * distintos (utm, campañas, redimensionados, etc.). */
function normalizeImageUrl(value: string | undefined): string {
  if (!value) return '';
  try {
    const url = new URL(value);
    const removableParams = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'fbclid', 'gclid'];
    removableParams.forEach(param => url.searchParams.delete(param));
    url.hash = '';
    return `${url.protocol.toLowerCase()}//${url.hostname.toLowerCase()}${url.pathname.replace(/\/$/, '')}${url.search}`;
  } catch {
    return value.trim().toLowerCase();
  }
}

/** Huella visual compacta de 64 bits. Permite detectar la misma foto aunque llegue
 * desde otra CDN, tenga otro nombre o cambie ligeramente de tamaño/formato. */
async function getImagePerceptualHash(thumbnailUrl: string): Promise<Buffer | null> {
  try {
    const response = await axios.get(thumbnailUrl, {
      responseType: 'arraybuffer',
      timeout: 10_000,
      headers: { Accept: 'image/*', 'User-Agent': 'Mozilla/5.0' },
    });
    const pixels = await sharp(Buffer.from(response.data))
      .resize(9, 8, { fit: 'fill' })
      .greyscale()
      .raw()
      .toBuffer();
    if (pixels.length < 72) return null;

    const hash = Buffer.alloc(8);
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 8; x++) {
        if (pixels[y * 9 + x] > pixels[y * 9 + x + 1]) {
          const bit = y * 8 + x;
          hash[Math.floor(bit / 8)] |= 1 << (7 - (bit % 8));
        }
      }
    }
    return hash;
  } catch {
    // Si una miniatura falla, el resultado se conserva: la deduplicación por URL
    // ya se aplicó y no se debe ocultar una imagen que no se pudo inspeccionar.
    return null;
  }
}

function hammingDistance(first: Buffer, second: Buffer): number {
  let distance = 0;
  for (let index = 0; index < first.length; index++) {
    let value = first[index] ^ second[index];
    while (value) {
      distance += value & 1;
      value >>>= 1;
    }
  }
  return distance;
}

export interface BraveSearchResult {
  title: string;
  url: string;
  description: string;
  age?: string;
  extraSnippets: string[];
}

export interface BraveSearchOptions {
  query: string;
  count?: number;
  country?: string;
  searchLang?: string;
  minWidth?: number;
  minHeight?: number;
}

export async function searchBraveWeb({
  query,
  count = 10,
  country = 'ES',
  searchLang = 'es',
}: BraveSearchOptions): Promise<BraveSearchResult[]> {
  const apiKey = process.env.BRAVE_API_KEY;
  if (!apiKey) {
    throw new Error('BRAVE_API_KEY no está configurada en el backend');
  }

  const response = await axios.get(BRAVE_WEB_SEARCH_URL, {
    params: {
      q: query,
      count: Math.min(Math.max(count, 1), 20),
      country,
      search_lang: searchLang,
      ui_lang: `${searchLang}-${country}`,
      safesearch: 'moderate',
      extra_snippets: true,
    },
    headers: {
      Accept: 'application/json',
      'X-Subscription-Token': apiKey,
    },
    timeout: 15_000,
  });

  return (response.data?.web?.results || []).map((result: any): BraveSearchResult => ({
    title: result.title || result.url,
    url: result.url,
    description: result.description || '',
    age: result.age,
    extraSnippets: Array.isArray(result.extra_snippets) ? result.extra_snippets : [],
  }));
}

export async function searchBraveImages({
  query,
  count = 30,
  country = 'ES',
  searchLang = 'es',
  minWidth = 0,
  minHeight = 0,
}: BraveSearchOptions): Promise<BraveImageResult[]> {
  const apiKey = process.env.BRAVE_API_KEY;
  if (!apiKey) throw new Error('BRAVE_API_KEY no está configurada en el backend');

  const response = await axios.get(BRAVE_IMAGE_SEARCH_URL, {
    params: {
      q: query,
      count: Math.min(Math.max(count, 1), 200),
      country,
      search_lang: searchLang,
      safesearch: 'off',
    },
    headers: { Accept: 'application/json', 'X-Subscription-Token': apiKey },
    timeout: 15_000,
  });

  const seenImages = new Set<string>();
  const urlDeduplicated: BraveImageResult[] = (response.data?.results || [])
    .map((result: any): BraveImageResult | null => {
      const imageUrl = result.properties?.url;
      const thumbnailUrl = result.thumbnail?.src || imageUrl;
      if (!imageUrl || !thumbnailUrl) return null;

      // Una imagen puede aparecer más de una vez en Brave desde páginas o CDNs
      // distintos. La URL original es la identidad prioritaria; la miniatura actúa
      // como segunda protección cuando el origen no la expone de forma consistente.
      const originalKey = normalizeImageUrl(imageUrl);
      const thumbnailKey = normalizeImageUrl(thumbnailUrl);
      if (seenImages.has(originalKey) || seenImages.has(thumbnailKey)) return null;
      seenImages.add(originalKey);
      seenImages.add(thumbnailKey);

      const id = randomUUID();
      imageDownloadUrls.set(id, { originalUrl: imageUrl, thumbnailUrl });
      const width = Number(result.properties?.width) || 0;
      const height = Number(result.properties?.height) || 0;
      // Se acepta tanto horizontal (1280×720) como vertical (720×1280). Brave no
      // publica siempre las dimensiones originales, así que solo se descarta cuando
      // ambas están disponibles y confirman que no alcanza la calidad mínima.
      const requiredLongSide = Math.max(minWidth, minHeight);
      const requiredShortSide = Math.min(minWidth, minHeight);
      if (width > 0 && height > 0 && (Math.max(width, height) < requiredLongSide || Math.min(width, height) < requiredShortSide)) return null;
      return {
        id,
        title: result.title || 'Imagen de Brave Search',
        pageUrl: result.url || imageUrl,
        source: result.source || result.meta_url?.hostname || 'Fuente desconocida',
        thumbnailUrl,
        imageUrl,
        width,
        height,
      };
    })
    .filter((result: BraveImageResult | null): result is BraveImageResult => result !== null);

  // Las URLs no bastan para fuentes sindicadas: se revisan las miniaturas por lotes
  // de 10 para no saturar conexiones ni retrasar demasiado las búsquedas grandes.
  // Brave suele devolver la MISMA foto varias veces a distinta resolución (distinto
  // CDN o recorte) — cuando el hash visual detecta que dos resultados son la misma
  // imagen, nos quedamos con el de mayor resolución (ancho × alto) en vez de con el
  // primero que llegó, así el usuario siempre recibe la mejor calidad disponible.
  interface AcceptedEntry {
    image: BraveImageResult;
    hash: Buffer | null;
  }
  const accepted: AcceptedEntry[] = [];
  const BATCH_SIZE = 10;
  const MAX_VISUAL_HASH_DISTANCE = 4;

  for (let start = 0; start < urlDeduplicated.length; start += BATCH_SIZE) {
    const batch = urlDeduplicated.slice(start, start + BATCH_SIZE);
    const hashes = await Promise.all(batch.map((image: BraveImageResult) => getImagePerceptualHash(image.thumbnailUrl)));
    batch.forEach((image: BraveImageResult, index: number) => {
      const hash = hashes[index];
      const matchIndex = hash
        ? accepted.findIndex(entry => entry.hash && hammingDistance(entry.hash, hash) <= MAX_VISUAL_HASH_DISTANCE)
        : -1;

      if (matchIndex !== -1) {
        const existing = accepted[matchIndex];
        const existingArea = (existing.image.width || 0) * (existing.image.height || 0);
        const newArea = (image.width || 0) * (image.height || 0);
        if (newArea > existingArea) {
          accepted[matchIndex] = { image, hash };
        }
        return;
      }

      accepted.push({ image, hash });
    });
  }

  return accepted.map(entry => entry.image);
}

export function getBraveImageDownloadSource(id: string): BraveImageDownloadSource | undefined {
  return imageDownloadUrls.get(id);
}
