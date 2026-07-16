export interface GeneratedPrompt {
  id: string;
  section: number;
  text: string;
  prompt: string;
  imagePrompt: string;
  videoKeywords: string[];
}

export interface GeneratedImage {
  id: string;
  url: string;
  prompt: string;
  localPath: string;
  generatedAt: string;
}

export interface GeneratedAudio {
  id: string;
  url: string;
  text: string;
  voice: string;
  duration: number;
  localPath: string;
  generatedAt: string;
}

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
