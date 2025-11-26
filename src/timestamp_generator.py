"""
Timestamp Generator Module - Analyzes transcript and generates timestamps using local LLM
"""

import json
import re
from dataclasses import dataclass
from typing import List, Optional

import requests

from .transcriber import Transcript, format_time, get_transcript_for_llm


@dataclass
class Timestamp:
    """A single timestamp with time and title"""
    time: float      # seconds
    title: str       # short description (3-8 words)
    confidence: float = 1.0


SYSTEM_PROMPT = """You are a video content analyzer. Your task is to identify key topic changes and important moments in a video transcript to create chapter timestamps.

RULES:
1. Only use information that appears in the transcript - never invent content
2. Create timestamps for significant topic changes or key moments
3. Each timestamp title should be 3-8 words, descriptive and concise
4. Timestamps must be at least {min_duration} seconds apart
5. Always include an introduction timestamp at 0:00
6. Return ONLY valid JSON, no other text

OUTPUT FORMAT:
{{
  "timestamps": [
    {{"time": 0, "title": "Introduction"}},
    {{"time": 45, "title": "Topic Name Here"}},
    {{"time": 120, "title": "Another Topic"}}
  ]
}}

The time values must be in seconds (integers).
"""


def check_ollama_available(ollama_url: str = "http://localhost:11434") -> bool:
    """Check if Ollama is running and accessible."""
    try:
        response = requests.get(f"{ollama_url}/api/tags", timeout=5)
        return response.status_code == 200
    except Exception:
        return False


def get_available_models(ollama_url: str = "http://localhost:11434") -> List[str]:
    """Get list of available Ollama models."""
    try:
        response = requests.get(f"{ollama_url}/api/tags", timeout=5)
        if response.status_code == 200:
            data = response.json()
            return [model["name"] for model in data.get("models", [])]
    except Exception:
        pass
    return []


def generate_timestamps(
    transcript: Transcript,
    video_title: str,
    min_duration: int = 30,
    ollama_url: str = "http://localhost:11434",
    model: str = "llama3.2"
) -> List[Timestamp]:
    """
    Generate timestamps from transcript using local Ollama LLM.
    
    Args:
        transcript: Transcript object with segments
        video_title: Title of the video
        min_duration: Minimum seconds between timestamps
        ollama_url: Ollama server URL
        model: Ollama model to use
        
    Returns:
        List of Timestamp objects
        
    Raises:
        ValueError: If generation fails
    """
    if not check_ollama_available(ollama_url):
        raise ValueError(
            "Ollama is not running. Please start it with: ollama serve\n"
            "Then pull a model with: ollama pull llama3.2"
        )
    
    available_models = get_available_models(ollama_url)
    if not available_models:
        raise ValueError(
            f"No Ollama models available. Pull a model with: ollama pull {model}"
        )
    
    # Check if requested model is available
    model_available = any(model in m for m in available_models)
    if not model_available:
        print(f"[TimestampGen] Model '{model}' not found, using: {available_models[0]}")
        model = available_models[0]
    
    # Handle empty transcript
    if not transcript.segments:
        print("[TimestampGen] Empty transcript, returning default timestamp")
        return [Timestamp(time=0, title="Video Content", confidence=0.5)]
    
    # Prepare transcript for LLM
    transcript_text = get_transcript_for_llm(transcript)
    
    # Limit transcript length to avoid token limits
    max_chars = 50000
    if len(transcript_text) > max_chars:
        print(f"[TimestampGen] Truncating transcript from {len(transcript_text)} to {max_chars} chars")
        transcript_text = transcript_text[:max_chars] + "\n[... transcript truncated ...]"
    
    # Build prompt
    system_prompt = SYSTEM_PROMPT.format(min_duration=min_duration)
    user_prompt = f"""Video Title: {video_title}
Video Duration: {format_time(transcript.duration)}

Transcript:
{transcript_text}

Generate timestamps for this video. Remember to return ONLY valid JSON."""

    print(f"[TimestampGen] Sending to Ollama ({model})...")
    
    try:
        response = requests.post(
            f"{ollama_url}/api/generate",
            json={
                "model": model,
                "prompt": user_prompt,
                "system": system_prompt,
                "stream": False,
                "options": {
                    "temperature": 0.3,
                    "num_predict": 2000
                }
            },
            timeout=120
        )
        
        if response.status_code != 200:
            raise ValueError(f"Ollama request failed: {response.text}")
        
        result = response.json()
        llm_response = result.get("response", "")
        
        print(f"[TimestampGen] Received response, parsing...")
        
        # Parse JSON from response
        timestamps = parse_timestamps_from_response(llm_response, transcript.duration, min_duration)
        
        print(f"[TimestampGen] Generated {len(timestamps)} timestamps")
        
        return timestamps
        
    except requests.exceptions.Timeout:
        raise ValueError("Ollama request timed out. The model may be too slow or the transcript too long.")
    except Exception as e:
        raise ValueError(f"Timestamp generation failed: {e}")


def parse_timestamps_from_response(
    response: str,
    video_duration: float,
    min_duration: int
) -> List[Timestamp]:
    """
    Parse timestamps from LLM response.
    
    Args:
        response: Raw LLM response text
        video_duration: Total video duration in seconds
        min_duration: Minimum seconds between timestamps
        
    Returns:
        List of validated Timestamp objects
    """
    # Try to extract JSON from response
    json_match = re.search(r'\{[\s\S]*\}', response)
    if not json_match:
        print("[TimestampGen] No JSON found in response, using fallback")
        return [Timestamp(time=0, title="Video Content", confidence=0.5)]
    
    try:
        data = json.loads(json_match.group())
    except json.JSONDecodeError:
        print("[TimestampGen] Invalid JSON in response, using fallback")
        return [Timestamp(time=0, title="Video Content", confidence=0.5)]
    
    raw_timestamps = data.get("timestamps", [])
    if not raw_timestamps:
        print("[TimestampGen] No timestamps in response, using fallback")
        return [Timestamp(time=0, title="Video Content", confidence=0.5)]
    
    # Validate and filter timestamps
    timestamps = []
    last_time = -min_duration  # Allow first timestamp at 0
    
    for ts in raw_timestamps:
        try:
            time = float(ts.get("time", 0))
            title = str(ts.get("title", "")).strip()
            
            # Validate
            if not title:
                continue
            if time < 0:
                time = 0
            if time > video_duration:
                continue
            if time - last_time < min_duration and time != 0:
                continue
            
            timestamps.append(Timestamp(
                time=time,
                title=title[:100],  # Limit title length
                confidence=1.0
            ))
            last_time = time
            
        except (ValueError, TypeError):
            continue
    
    # Ensure we have at least an intro timestamp
    if not timestamps or timestamps[0].time > 5:
        timestamps.insert(0, Timestamp(time=0, title="Introduction", confidence=1.0))
    
    # Sort by time
    timestamps.sort(key=lambda x: x.time)
    
    return timestamps


if __name__ == "__main__":
    # Test the timestamp generator
    print("Checking Ollama status...")
    if check_ollama_available():
        models = get_available_models()
        print(f"Ollama is running. Available models: {models}")
    else:
        print("Ollama is not running. Start it with: ollama serve")
