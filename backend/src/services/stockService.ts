import axios from 'axios';

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
    const response = await axios.get('https://pixabay.com/api/videos/', {
      params: {
        key: process.env.PIXABAY_API_KEY,
        q: query,
        per_page: perPage,
        order: 'popular',
      },
    });

    return response.data.hits.map((video: any) => ({
      id: video.id.toString(),
      source: 'pixabay',
      title: video.tags,
      url: video.pageURL,
      thumbnail: video.thumbnail,
      duration: video.duration || 0,
      width: video.videos.medium.width,
      height: video.videos.medium.height,
      downloadUrl: video.videos.medium.url,
    }));
  } catch (error) {
    console.error('Error searching Pixabay videos:', error);
    return [];
  }
}

export async function searchPexelsVideos(query: string, perPage: number = 5): Promise<StockVideo[]> {
  try {
    const response = await axios.get('https://api.pexels.com/videos/search', {
      headers: {
        'Authorization': process.env.PEXELS_API_KEY,
      },
      params: {
        query,
        per_page: perPage,
        page: 1,
      },
    });

    return response.data.videos.map((video: any) => ({
      id: video.id.toString(),
      source: 'pexels',
      title: video.tags?.join(', ') || 'Video',
      url: video.url,
      thumbnail: video.image,
      duration: video.duration,
      width: video.width,
      height: video.height,
      downloadUrl: video.video_files[0].link,
    }));
  } catch (error) {
    console.error('Error searching Pexels videos:', error);
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

    return response.data.photos.map((photo: any) => ({
      id: photo.id.toString(),
      source: 'pexels',
      title: photo.alt,
      url: photo.url,
      thumbnail: photo.src.medium,
      width: photo.width,
      height: photo.height,
      downloadUrl: photo.src.original,
    }));
  } catch (error) {
    console.error('Error searching Pexels images:', error);
    return [];
  }
}
