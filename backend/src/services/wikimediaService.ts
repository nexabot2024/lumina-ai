import axios from 'axios';

export interface WikimediaAsset {
  id: string;
  title: string;
  url: string;
  type: 'image' | 'video' | 'audio';
  license: string;
  author: string;
  description: string;
  downloadUrl: string;
  fileSize?: number;
  duration?: number;
  dimensions?: {
    width: number;
    height: number;
  };
}

export interface WikimediaSearchOptions {
  query: string;
  type?: 'image' | 'video' | 'audio' | 'all';
  limit?: number;
  offset?: number;
  sortBy?: 'relevance' | 'recency';
}

const WIKIMEDIA_BASE_URL = 'https://commons.wikimedia.org/w/api.php';
const WIKIMEDIA_MEDIA_URL = 'https://commons.wikimedia.org/wiki/Special:FilePath';

// User-Agent válido para Wikimedia
const VALID_USER_AGENT = 'VidSpa/1.0 (AI Video Generator; +http://localhost:5173) axios/1.18.1';

function getFileExtension(filename: string): 'image' | 'video' | 'audio' | 'unknown' {
  const ext = filename.split('.').pop()?.toLowerCase() || '';

  const imageExt = ['jpg', 'jpeg', 'png', 'gif', 'svg', 'webp', 'bmp'];
  const videoExt = ['mp4', 'webm', 'ogv', 'avi', 'mov', 'mkv'];
  const audioExt = ['mp3', 'wav', 'flac', 'ogg', 'm4a', 'wma'];

  if (imageExt.includes(ext)) return 'image';
  if (videoExt.includes(ext)) return 'video';
  if (audioExt.includes(ext)) return 'audio';
  return 'unknown';
}

export async function searchWikimediaCommons(
  options: WikimediaSearchOptions
): Promise<WikimediaAsset[]> {
  try {
    const {
      query,
      type = 'all',
      limit = 20,
      offset = 0,
      sortBy = 'relevance',
    } = options;

    console.log(`🔍 Searching Wikimedia Commons for: "${query}" (type: ${type})`);

    // Construir búsqueda con filtros de tipo
    let filetypeFilter = '';
    if (type !== 'all') {
      if (type === 'image') {
        filetypeFilter = ' filetype:bitmap|filetype:drawing';
      } else if (type === 'video') {
        filetypeFilter = ' filetype:video';
      } else if (type === 'audio') {
        filetypeFilter = ' filetype:audio';
      }
    }

    const searchQuery = `${query}${filetypeFilter}`;

    // Usar CirrusSearch con User-Agent válido
    const searchResponse = await axios.get(WIKIMEDIA_BASE_URL, {
      params: {
        action: 'query',
        format: 'json',
        list: 'search',
        srsearch: searchQuery,
        srlimit: Math.min(limit * 2, 50), // Buscar más para filtrar
        sroffset: offset,
        srinfo: 'totalcount',
      },
      headers: {
        'User-Agent': VALID_USER_AGENT,
      },
      timeout: 10000,
    });

    console.log(`📊 Wikimedia search returned: ${searchResponse.data.query?.search?.length || 0} results`);

    const results: WikimediaAsset[] = [];

    if (searchResponse.data.query?.search && searchResponse.data.query.search.length > 0) {
      for (const result of searchResponse.data.query.search) {
        if (results.length >= limit) break;

        const title = result.title;

        try {
          // Obtener detalles del archivo
          const detailResponse = await axios.get(WIKIMEDIA_BASE_URL, {
            params: {
              action: 'query',
              format: 'json',
              titles: title,
              prop: 'imageinfo',
              iiprop: 'url|dimensions|media|mime|user|timestamp',
            },
            headers: {
              'User-Agent': VALID_USER_AGENT,
            },
            timeout: 5000,
          });

          const pages = detailResponse.data.query?.pages || {};
          const page = Object.values(pages)[0] as any;

          if (page?.imageinfo) {
            const imageInfo = page.imageinfo[0];
            const fileType = getFileExtension(imageInfo.url);

            if (fileType !== 'unknown' && (type === 'all' || type === fileType)) {
              const asset: WikimediaAsset = {
                id: `wikimedia_${title.replace(/\s+/g, '_')}`,
                title,
                url: imageInfo.url,
                type: fileType,
                license: 'Creative Commons / Public Domain',
                author: imageInfo.user || 'Unknown',
                description: result.snippet || title,
                downloadUrl: imageInfo.url,
                fileSize: imageInfo.size,
                dimensions:
                  imageInfo.width && imageInfo.height
                    ? {
                        width: imageInfo.width,
                        height: imageInfo.height,
                      }
                    : undefined,
              };

              results.push(asset);
              console.log(`✅ Added: ${title} (${fileType})`);
            }
          }
        } catch (detailError) {
          console.warn(`⚠️ Failed to get details for "${title}":`, detailError instanceof Error ? detailError.message : 'Unknown error');
          continue;
        }
      }
    } else {
      console.warn(`⚠️ No results found for query: "${searchQuery}"`);
    }

    console.log(`✨ Returning ${results.length} assets`);
    return results;
  } catch (error) {
    console.error('Error searching Wikimedia Commons:', error);
    throw new Error(
      `Failed to search Wikimedia Commons: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

export async function getWikimediaAssetDetails(
  title: string
): Promise<WikimediaAsset | null> {
  try {
    const response = await axios.get(WIKIMEDIA_BASE_URL, {
      params: {
        action: 'query',
        format: 'json',
        titles: title,
        prop: 'imageinfo|imagelabels',
        iiprop: 'url|dimensions|media|mime|user|timestamp|commonmetadata',
      },
      headers: {
        'User-Agent': VALID_USER_AGENT,
      },
    });

    const page = Object.values(response.data.query.pages)[0] as any;

    if (!page.imageinfo) {
      return null;
    }

    const imageInfo = page.imageinfo[0];
    const fileType = getFileExtension(imageInfo.url);

    if (fileType === 'unknown') {
      return null;
    }

    return {
      id: `wikimedia_${title.replace(/\s+/g, '_')}`,
      title,
      url: imageInfo.url,
      type: fileType,
      license: imageInfo.commonmetadata?.[0]?.value || 'Creative Commons',
      author: imageInfo.user || 'Unknown',
      description: imageInfo.commonmetadata?.[1]?.value || 'No description',
      downloadUrl: imageInfo.url,
      fileSize: imageInfo.size,
      dimensions:
        imageInfo.width && imageInfo.height
          ? {
              width: imageInfo.width,
              height: imageInfo.height,
            }
          : undefined,
      duration: imageInfo.duration,
    };
  } catch (error) {
    console.error('Error getting Wikimedia asset details:', error);
    return null;
  }
}

export async function searchWikimediaImages(
  query: string,
  limit: number = 20
): Promise<WikimediaAsset[]> {
  return searchWikimediaCommons({
    query,
    type: 'image',
    limit,
    sortBy: 'relevance',
  });
}

export async function searchWikimediaVideos(
  query: string,
  limit: number = 20
): Promise<WikimediaAsset[]> {
  return searchWikimediaCommons({
    query,
    type: 'video',
    limit,
    sortBy: 'relevance',
  });
}

export async function searchWikimediaAudio(
  query: string,
  limit: number = 20
): Promise<WikimediaAsset[]> {
  return searchWikimediaCommons({
    query,
    type: 'audio',
    limit,
    sortBy: 'relevance',
  });
}
