export interface Timestamp {
  time: number;
  title: string;
  confidence: number;
  evidence: string;
}

export interface GenerationMetadata {
  video_id: string;
  language: string;
  is_auto_generated: boolean;
  total_candidates: number;
  validated_count: number;
}

export interface GenerationOptions {
  language?: string;
  minSegmentDuration?: number;
}

export interface ApiResponse {
  timestamps: Timestamp[];
  metadata: GenerationMetadata;
}
