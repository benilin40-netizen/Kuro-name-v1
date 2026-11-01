export interface NewsVideo {
  type: 'embed' | 'mp4' | 'hls';
  url: string;
  thumbnail?: string;
  provider?: string;
  title?: string;
  duration?: number;
}
