export interface PodcastSegment {
  speaker: 'Alex' | 'Jordan';
  text: string;
}

export interface PodcastResponse {
  script?: string;
  audioUrl?: string;
  status: 'processing' | 'completed' | 'failed';
  message?: string;
  cached?: boolean;
  error?: string;
} 