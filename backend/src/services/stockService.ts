import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import ffmpeg from 'fluent-ffmpeg';

export interface StockVideo {
  id: string;
  source: 'pixabay' | 'pexels';
  title: string;
  url: string;
  thumbnail: string;
  duration: number;
  width: number;
  height: number;
  downloadUrl: string;
}

export interface StockImage {
  id: string;
  source: 'pixabay' | 'pexels';
  title: string;
  url: string;
  thumbnail: string;
  width: number;
  height: number;
  downloadUrl: string;
}

export async function searchPixabayVideos(query: string, perPage: number = 5): Promise<StockVideo[]> {
  try {
    console.log('Pixabay está siendo bloqueado por Cloudflare. Usa Pexels en su lugar.');
    return [];
  } catch (error) {
    console.error('Error searching Pixabay videos:', error);
    return [];
  }
}

function selectBest1080pVideoFile(videoFiles: any[]): { link: string; height: number } | null {
  // Buscar video exacto 1080p o lo más cercano sin exceder
  let best = null;
  let bestHeight = 0;

  for (const file of videoFiles) {
    const height = file.height || 0;

    // Si es 1080p exacto, devolver inmediatamente
    if (height === 1080) {
      return file;
    }

    // Si es menor que 1080p pero mayor que el anterior, guardarlo
    if (height < 1080 && height > bestHeight) {
      best = file;
      bestHeight = height;
    }
  }

  // Si no encontramos nada por debajo de 1080p, tomar el más pequeño disponible
  if (!best && videoFiles.length > 0) {
    const sorted = [...videoFiles].sort((a, b) => (a.height || 0) - (b.height || 0));
    best = sorted[0];
  }

  return best;
}

export async function searchPexelsVideos(query: string, perPage: number = 80): Promise<StockVideo[]> {
  try {
    const allVideos: StockVideo[] = [];
    let page = 1;
    const maxPerPage = 80; // Máximo de Pexels por página
    const totalRequested = perPage;
    const maxPages = Math.ceil(totalRequested / maxPerPage) + 1; // +1 para búsqueda adicional
    let consecutiveEmptyPages = 0;

    console.log(
      `🔍 Buscando ${totalRequested} videos en Pexels con query: "${query}"`
    );

    while (
      allVideos.length < totalRequested &&
      page <= maxPages &&
      consecutiveEmptyPages < 2
    ) {
      try {
        const response = await axios.get('https://api.pexels.com/videos/search', {
          headers: {
            'Authorization': process.env.PEXELS_API_KEY,
          },
          params: {
            query,
            per_page: maxPerPage,
            page,
          },
          timeout: 10000,
        });

        if (!response.data.videos || !Array.isArray(response.data.videos)) {
          consecutiveEmptyPages++;
          console.log(
            `⚠️ Página ${page}: Sin videos (páginas vacías consecutivas: ${consecutiveEmptyPages})`
          );
          page++;
          continue;
        }

        const pageVideos = response.data.videos
          .filter((video: any) => video.video_files && video.video_files.length > 0)
          .map((video: any) => {
            const videoFile = selectBest1080pVideoFile(video.video_files);

            if (!videoFile) return null;

            return {
              id: video.id.toString(),
              source: 'pexels',
              title: video.tags?.join(', ') || 'Video',
              url: video.url,
              thumbnail: video.image,
              duration: video.duration,
              width: video.width,
              height: videoFile.height || video.height,
              downloadUrl: videoFile.link,
            };
          })
          .filter((video: any) => video !== null);

        if (pageVideos.length === 0) {
          consecutiveEmptyPages++;
          console.log(
            `⚠️ Página ${page}: ${response.data.videos.length} videos pero ninguno válido`
          );
        } else {
          consecutiveEmptyPages = 0;
          allVideos.push(...pageVideos);
          console.log(
            `✅ Página ${page}: ${pageVideos.length} videos válidos (total: ${allVideos.length})`
          );
        }

        // Si ya tenemos suficientes, salir
        if (allVideos.length >= totalRequested) {
          console.log(`✅ Meta alcanzada: ${allVideos.length} videos`);
          break;
        }

        page++;

        // Delay entre páginas para no saturar API
        await new Promise((resolve) => setTimeout(resolve, 500));
      } catch (pageError) {
        console.error(
          `❌ Error en página ${page}: ${
            pageError instanceof Error ? pageError.message : pageError
          }`
        );
        page++;
      }
    }

    console.log(
      `📹 Pexels Videos: ${allVideos.length} videos encontrados (limitado a 1080p)`
    );
    return allVideos.slice(0, totalRequested);
  } catch (error) {
    console.error(
      'Error searching Pexels videos:',
      error instanceof Error ? error.message : error
    );
    return [];
  }
}

export async function searchStockVideos(
  keywords: string[],
  options: { limit?: number; sources?: ('pixabay' | 'pexels')[] } = {}
): Promise<StockVideo[]> {
  const { limit = 5, sources = ['pixabay', 'pexels'] } = options;
  const query = keywords.join(' ');
  const results: StockVideo[] = [];

  if (sources.includes('pixabay')) {
    const pixabayResults = await searchPixabayVideos(query, limit);
    results.push(...pixabayResults);
  }

  if (sources.includes('pexels')) {
    const pexelsResults = await searchPexelsVideos(query, limit);
    results.push(...pexelsResults);
  }

  return results.slice(0, limit);
}

export async function searchPixabayImages(query: string, perPage: number = 5): Promise<StockImage[]> {
  try {
    const response = await axios.get('https://pixabay.com/api/', {
      params: {
        key: process.env.PIXABAY_API_KEY,
        q: query,
        per_page: perPage,
        image_type: 'all',
        order: 'popular',
      },
    });

    return response.data.hits.map((image: any) => ({
      id: image.id.toString(),
      source: 'pixabay',
      title: image.tags,
      url: image.pageURL,
      thumbnail: image.previewURL,
      width: image.imageWidth,
      height: image.imageHeight,
      downloadUrl: image.largeImageURL,
    }));
  } catch (error) {
    console.error('Error searching Pixabay images:', error);
    return [];
  }
}

function selectBest1080pImageUrl(photo: any): string {
  // Pexels proporciona múltiples tamaños: tiny, small, medium, large, original
  const sizes = {
    large: photo.src.large2x || photo.src.large, // ~940px
    medium: photo.src.medium, // ~350px
    small: photo.src.small, // ~130px
    tiny: photo.src.tiny, // ~130px
  };

  // Prioridad: large (mejor para 1080p) > medium > small
  // Evitar original que puede ser muy grande (4K, 8K)
  if (sizes.large) return sizes.large;
  if (sizes.medium) return sizes.medium;
  if (sizes.small) return sizes.small;

  return photo.src.original; // Fallback
}

function shouldIncludeImage(photo: any): boolean {
  // Filtrar imágenes que sean demasiado pequeñas
  const minWidth = 800; // Mínimo para 1080p workflow
  const minHeight = 600;

  return (photo.width || 0) >= minWidth && (photo.height || 0) >= minHeight;
}

export async function searchPexelsImages(query: string, perPage: number = 5): Promise<StockImage[]> {
  try {
    const response = await axios.get('https://api.pexels.com/v1/search', {
      headers: {
        'Authorization': process.env.PEXELS_API_KEY,
      },
      params: {
        query,
        per_page: perPage,
        page: 1,
      },
    });

    const images = response.data.photos
      .filter((photo: any) => shouldIncludeImage(photo))
      .map((photo: any) => ({
        id: photo.id.toString(),
        source: 'pexels',
        title: photo.alt,
        url: photo.url,
        thumbnail: photo.src.medium,
        width: photo.width,
        height: photo.height,
        downloadUrl: selectBest1080pImageUrl(photo),
      }));

    console.log(`🖼️ Pexels Images: ${images.length} imágenes encontradas (limitado a 1080p)`);
    return images;
  } catch (error) {
    console.error('Error searching Pexels images:', error);
    return [];
  }
}

export interface DownloadOptions {
  theme: string;
  minDuration?: number;
  maxDuration?: number;
  resolution?: '720p' | '1080p' | '4k';
  quantity?: number;
  outputFolder: string;
  sources?: ('pixabay' | 'pexels')[];
}

export interface DownloadResult {
  id: string;
  title: string;
  source: 'pixabay' | 'pexels';
  filePath: string;
  duration: number;
  resolution: string;
  downloadedAt: string;
}

async function getVideoRealDuration(filePath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err, metadata) => {
      if (err) {
        console.warn(`⚠️ Error leyendo duración de ${path.basename(filePath)}: ${err.message}`);
        resolve(5); // Default fallback
        return;
      }

      const duration = metadata.format?.duration || 5;
      resolve(Math.round(duration * 10) / 10); // Round to 1 decimal place
    });
  });
}

async function downloadVideoFile(
  url: string,
  filePath: string,
  maxRetries: number = 3,
  delayMs: number = 500
): Promise<void> {
  let lastError: any;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await axios.get(url, {
        responseType: 'arraybuffer',
        timeout: 30000, // 30 segundos timeout
      });

      const dir = path.dirname(filePath);

      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      fs.writeFileSync(filePath, response.data);
      console.log(
        `✅ Descargado (intento ${attempt}/${maxRetries}): ${path.basename(filePath)}`
      );
      return;
    } catch (error) {
      lastError = error;
      console.warn(
        `⚠️ Intento ${attempt}/${maxRetries} fallido para ${url}: ${
          error instanceof Error ? error.message : error
        }`
      );

      // Esperar antes de reintentar (backoff exponencial)
      if (attempt < maxRetries) {
        const waitTime = delayMs * Math.pow(2, attempt - 1);
        console.log(`⏳ Esperando ${waitTime}ms antes de reintentar...`);
        await new Promise((resolve) => setTimeout(resolve, waitTime));
      }
    }
  }

  throw new Error(
    `Failed to download after ${maxRetries} attempts: ${lastError?.message || 'Unknown error'}`
  );
}

function getVideoQualityUrl(video: StockVideo, resolution: string = '1080p'): string {
  // For now, return the medium quality URL
  // In production, you'd select based on resolution preference
  return video.downloadUrl;
}

function filterVideosByDuration(
  videos: StockVideo[],
  minDuration?: number,
  maxDuration?: number
): StockVideo[] {
  return videos.filter(video => {
    if (minDuration && video.duration < minDuration) return false;
    if (maxDuration && video.duration > maxDuration) return false;
    return true;
  });
}

function filterVideosByResolution(
  videos: StockVideo[],
  targetResolution?: string
): StockVideo[] {
  if (!targetResolution) return videos;

  const [targetWidth] = targetResolution.split('p');
  const minHeight = parseInt(targetWidth);

  return videos.filter(video => {
    // Accept videos that meet or exceed the target resolution
    return video.height >= minHeight;
  });
}

export async function downloadStockVideosAuto(options: DownloadOptions): Promise<DownloadResult[]> {
  try {
    const {
      theme,
      minDuration,
      maxDuration,
      resolution = '1080p',
      quantity = 3,
      outputFolder,
      sources = ['pixabay', 'pexels'],
    } = options;

    console.log(
      `\n🎬 Iniciando descarga automática: ${quantity} videos del tema "${theme}"`
    );
    console.log(`📊 Filtros: ${resolution}, ${minDuration}s-${maxDuration}s`);

    // Buscar videos - Aumentar límite a 5x la cantidad solicitada para tener opciones
    const searchLimit = Math.min(quantity * 5, 300);
    console.log(`🔍 Buscando ${searchLimit} videos...`);

    const allVideos = await searchStockVideos([theme], {
      limit: searchLimit,
      sources,
    });

    console.log(`📹 ${allVideos.length} videos encontrados`);

    if (allVideos.length === 0) {
      console.warn(`⚠️ No se encontraron videos para "${theme}"`);
      return [];
    }

    // Filtrar por duración
    let filteredVideos = filterVideosByDuration(allVideos, minDuration, maxDuration);
    console.log(`⏱️ ${filteredVideos.length} videos después de filtro de duración`);

    // Filtrar por resolución
    filteredVideos = filterVideosByResolution(filteredVideos, resolution);
    console.log(`📐 ${filteredVideos.length} videos después de filtro de resolución`);

    // Tomar la cantidad solicitada
    const videosToDownload = filteredVideos.slice(0, quantity);

    if (videosToDownload.length === 0) {
      console.warn(`⚠️ No hay videos que cumplan los criterios`);
      return [];
    }

    console.log(`\n⬇️ Descargando ${videosToDownload.length} videos...`);

    const results: DownloadResult[] = [];
    let successCount = 0;
    let failCount = 0;

    // Descargar cada video con delays entre descargas
    for (let index = 0; index < videosToDownload.length; index++) {
      const video = videosToDownload[index];

      try {
        const fileName = `${theme}_${video.source}_${uuidv4()}.mp4`;
        const filePath = path.join(outputFolder, fileName);

        console.log(
          `\n[${index + 1}/${videosToDownload.length}] Descargando: ${video.title || 'Video'}`
        );

        // Descargar con reintentos
        await downloadVideoFile(video.downloadUrl, filePath, 3, 500);

        // Get real duration from the downloaded file
        const realDuration = await getVideoRealDuration(filePath);

        results.push({
          id: video.id,
          title: video.title,
          source: video.source,
          filePath,
          duration: realDuration,
          resolution: `${video.width}x${video.height}`,
          downloadedAt: new Date().toISOString(),
        });

        successCount++;
        console.log(`⏱️ Duración real detectada: ${realDuration}s`);

        // Delay entre descargas para no saturar la API (1-2 segundos)
        if (index < videosToDownload.length - 1) {
          const delayMs = 1000 + Math.random() * 1000;
          await new Promise((resolve) => setTimeout(resolve, delayMs));
        }
      } catch (error) {
        failCount++;
        console.error(
          `❌ Error descargando video ${video.id}: ${
            error instanceof Error ? error.message : error
          }`
        );
        // Continuar con el siguiente video
      }
    }

    console.log(`\n✅ Descarga completada:`);
    console.log(`   Exitosos: ${successCount}/${videosToDownload.length}`);
    console.log(`   Fallidos: ${failCount}/${videosToDownload.length}`);

    return results;
  } catch (error) {
    console.error('❌ Error en downloadStockVideosAuto:', error);
    throw error;
  }
}
