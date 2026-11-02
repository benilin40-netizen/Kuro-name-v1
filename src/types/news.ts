export interface NewsVideo {
  type: 'embed' | 'mp4' | 'hls';
  url: string;
  title?: string;
  thumbnail?: string;
  provider?: string;
  duration?: number;
}
