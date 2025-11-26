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
  used_speech_to_text?: boolean;
  whisper_reason?: 'no_subtitles' | 'low_coverage' | 'force_whisper';
  from_cache?: boolean;
  total_candidates: number;
  validated_count: number;
  transcript_coverage?: number;
  video_duration?: number;
}

export interface TranscriptSegment {
  text: string;
  offset: number;
  duration: number;
}

export interface TranscriptData {
  video_id: string;
  video_title?: string;
  language: string;
  segments: TranscriptSegment[];
  is_auto_generated: boolean;
}

export interface TranscriptResponse {
  transcript: TranscriptData;
  metadata: {
    video_id: string;
    video_title?: string;
    language: string;
    is_auto_generated: boolean;
    used_speech_to_text?: boolean;
    whisper_reason?: 'no_subtitles' | 'low_coverage' | 'force_whisper';
    from_cache?: boolean;
    total_segments: number;
    transcript_coverage?: number;
    video_duration?: number;
  };
}

export interface GenerationOptions {
  language?: string;
  minSegmentDuration?: number;
}

export interface ApiResponse {
  timestamps: Timestamp[];
  metadata: GenerationMetadata;
}

export interface ApiError {
  message: string;
  code: string;
  suggestions: string[];
}
