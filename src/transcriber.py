"""
Transcriber Module - Converts audio to text using local Whisper model
"""

import os
from dataclasses import dataclass
from typing import List, Optional


@dataclass
class TranscriptSegment:
    """A single segment of the transcript with timing"""
    start: float  # seconds
    end: float    # seconds
    text: str


@dataclass
class Transcript:
    """Complete transcript with segments and metadata"""
    language: str
    segments: List[TranscriptSegment]
    full_text: str
    duration: float  # total duration in seconds


def format_time(seconds: float) -> str:
    """Format seconds as MM:SS or HH:MM:SS"""
    hours = int(seconds // 3600)
    minutes = int((seconds % 3600) // 60)
    secs = int(seconds % 60)
    
    if hours > 0:
        return f"{hours}:{minutes:02d}:{secs:02d}"
    return f"{minutes}:{secs:02d}"


def transcribe(
    audio_path: str,
    model_size: str = "base",
    language: Optional[str] = None,
    device: str = "auto"
) -> Transcript:
    """
    Transcribe audio file using faster-whisper.
    
    Args:
        audio_path: Path to audio file
        model_size: Whisper model size (tiny, base, small, medium, large-v3)
        language: Language code (e.g., 'en', 'pt') or None for auto-detect
        device: Device to use ('cpu', 'cuda', or 'auto')
        
    Returns:
        Transcript with segments and full text
        
    Raises:
        ValueError: If transcription fails
    """
    try:
        from faster_whisper import WhisperModel
    except ImportError:
        raise ValueError("faster-whisper not installed. Run: pip install faster-whisper")
    
    if not os.path.exists(audio_path):
        raise ValueError(f"Audio file not found: {audio_path}")
    
    print(f"[Transcriber] Loading Whisper model: {model_size}")
    
    # Determine device and compute type
    if device == "auto":
        try:
            import torch
            device = "cuda" if torch.cuda.is_available() else "cpu"
        except ImportError:
            device = "cpu"
    
    compute_type = "float16" if device == "cuda" else "int8"
    
    print(f"[Transcriber] Using device: {device}, compute_type: {compute_type}")
    
    try:
        model = WhisperModel(model_size, device=device, compute_type=compute_type)
    except Exception as e:
        raise ValueError(f"Failed to load Whisper model: {e}")
    
    print(f"[Transcriber] Transcribing audio...")
    
    try:
        segments_generator, info = model.transcribe(
            audio_path,
            language=language,
            beam_size=5,
            word_timestamps=True,
            vad_filter=True,  # Filter out silence
            vad_parameters=dict(
                min_silence_duration_ms=500,
                speech_pad_ms=200
            )
        )
        
        # Convert generator to list
        segments = []
        full_text_parts = []
        last_end = 0.0
        
        for segment in segments_generator:
            segments.append(TranscriptSegment(
                start=segment.start,
                end=segment.end,
                text=segment.text.strip()
            ))
            full_text_parts.append(segment.text.strip())
            last_end = max(last_end, segment.end)
        
        detected_language = info.language if info else (language or "unknown")
        
        print(f"[Transcriber] Detected language: {detected_language}")
        print(f"[Transcriber] Total segments: {len(segments)}")
        
        if len(segments) == 0:
            print("[Transcriber] WARNING: No speech detected in audio")
        
        return Transcript(
            language=detected_language,
            segments=segments,
            full_text=" ".join(full_text_parts),
            duration=last_end
        )
        
    except Exception as e:
        raise ValueError(f"Transcription failed: {e}")


def get_transcript_for_llm(transcript: Transcript) -> str:
    """
    Format transcript for LLM analysis with timestamps.
    
    Args:
        transcript: Transcript object
        
    Returns:
        Formatted string with timestamps and text
    """
    lines = []
    for segment in transcript.segments:
        time_str = format_time(segment.start)
        lines.append(f"[{time_str}] {segment.text}")
    
    return "\n".join(lines)


if __name__ == "__main__":
    # Test the transcriber
    import sys
    if len(sys.argv) > 1:
        audio_path = sys.argv[1]
        model = sys.argv[2] if len(sys.argv) > 2 else "base"
        try:
            transcript = transcribe(audio_path, model_size=model)
            print(f"\nTranscript ({transcript.language}):")
            print("-" * 50)
            print(get_transcript_for_llm(transcript))
        except Exception as e:
            print(f"Error: {e}")
    else:
        print("Usage: python transcriber.py <audio_file> [model_size]")
