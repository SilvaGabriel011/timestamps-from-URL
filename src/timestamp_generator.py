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


# English system prompt
SYSTEM_PROMPT_EN = """You are a video content analyzer. Your task is to identify key topic changes and important moments in a video transcript to create chapter timestamps.

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

# Prompt otimizado para DeepSeek + PORTUGUES BRASILEIRO
SYSTEM_PROMPT_PT = """Você é um especialista brasileiro em criar timestamps para vídeos do YouTube BR.

TAREFA: Criar CAPÍTULOS para o vídeo baseado na transcrição.

REGRAS:
1. Títulos em PORTUGUÊS BRASILEIRO natural (como youtubers BR escrevem)
2. Use palavras que APARECEM na transcrição - não invente
3. Títulos de 3-6 palavras, diretos e específicos
4. Mínimo {min_duration} segundos entre timestamps
5. Para vídeos longos (40+ min): 12-18 timestamps

EXEMPLOS DE BONS TÍTULOS (estilo YouTube BR):
- "O que é ser dev junior"
- "Erro que todo iniciante comete"  
- "Como estudar programação"
- "Minha rotina de trabalho"
- "Respondendo comentários"
- "Patrocínio do vídeo"
- "Recado final"

EXEMPLOS RUINS (não use):
- "Tópico 1", "Parte 2", "Seção 3"
- "Introdução ao assunto"
- "Continuação do tema anterior"
- "Considerações importantes"

DETECTAR MUDANÇAS DE ASSUNTO:
- "bora falar sobre", "agora vamos", "outro ponto"
- "primeiro", "segundo", "próximo"
- "falando em", "sobre isso", "voltando"
- Patrocínio: "parceiro", "patrocinador", "apoio"
- Final: "pra fechar", "resumindo", "é isso galera"

FORMATO JSON (APENAS ISSO, SEM TEXTO EXTRA):
{{
  "timestamps": [
    {{"time": 0, "title": "Abertura do vídeo"}},
    {{"time": 95, "title": "O que faz um dev junior"}},
    {{"time": 240, "title": "Habilidades essenciais"}},
    {{"time": 480, "title": "Erros comuns"}},
    {{"time": 720, "title": "Dicas práticas"}},
    {{"time": 900, "title": "Encerramento"}}
  ]
}}

IMPORTANTE: time em SEGUNDOS (número inteiro). Extraia do conteúdo REAL!
"""

def get_system_prompt(language: str, min_duration: int, video_duration: float) -> str:
    """Get the appropriate system prompt based on language."""
    # Calculate expected number of timestamps (roughly 1 per 2-3 minutes)
    expected_timestamps = max(5, int(video_duration / 150))  # ~2.5 min per timestamp
    
    if language and language.lower() in ('pt', 'pt-br', 'portuguese'):
        return SYSTEM_PROMPT_PT.format(
            min_duration=min_duration,
            expected_timestamps=expected_timestamps
        )
    return SYSTEM_PROMPT_EN.format(min_duration=min_duration)


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
    model: str = "llama3.2",
    use_heuristics_fallback: bool = True
) -> List[Timestamp]:
    """
    Generate timestamps from transcript using Ollama LLM or heuristics.
    
    Optimized for Portuguese content and long videos (30-60 min).
    
    Args:
        transcript: Transcript object with segments
        video_title: Title of the video
        min_duration: Minimum seconds between timestamps
        ollama_url: Ollama server URL
        model: Ollama model to use
        use_heuristics_fallback: Use heuristic analysis if Ollama fails
        
    Returns:
        List of Timestamp objects
    """
    # Check if Ollama is available
    ollama_available = check_ollama_available(ollama_url)
    
    if not ollama_available and use_heuristics_fallback:
        print("[TimestampGen] Ollama not available, using heuristic analysis...")
        from .smart_timestamp_generator import generate_smart_timestamps
        smart_timestamps = generate_smart_timestamps(transcript, video_title, min_duration)
        
        # Convert dict to Timestamp objects
        timestamps = []
        for ts_dict in smart_timestamps:
            timestamps.append(Timestamp(
                time=ts_dict["time"],
                title=ts_dict["title"],
                confidence=0.8
            ))
        return timestamps
    
    if not ollama_available:
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
        default_title = "Conteúdo do Vídeo" if transcript.language in ('pt', 'pt-br') else "Video Content"
        return [Timestamp(time=0, title=default_title, confidence=0.5)]
    
    # Prepare transcript for LLM
    transcript_text = get_transcript_for_llm(transcript)
    
    # Limit transcript length to avoid token limits - increased for long videos
    max_chars = 80000  # Increased from 50000 for 40-min videos
    if len(transcript_text) > max_chars:
        print(f"[TimestampGen] Truncating transcript from {len(transcript_text)} to {max_chars} chars")
        # Smart truncation: keep beginning and end
        half = max_chars // 2
        transcript_text = transcript_text[:half] + "\n\n[... conteúdo omitido ...]\n\n" + transcript_text[-half:]
    
    # Check if Portuguese
    is_portuguese = transcript.language and transcript.language.lower() in ('pt', 'pt-br', 'portuguese')
    
    # Build prompt based on language
    system_prompt = get_system_prompt(transcript.language, min_duration, transcript.duration)
    
    if is_portuguese:
        user_prompt = f"""Título do Vídeo: {video_title}
Duração do Vídeo: {format_time(transcript.duration)}
Idioma: Português Brasileiro

Transcrição:
{transcript_text}

Gere timestamps para este vídeo. Lembre-se de retornar APENAS JSON válido.
Os títulos devem estar em português brasileiro."""
    else:
        user_prompt = f"""Video Title: {video_title}
Video Duration: {format_time(transcript.duration)}

Transcript:
{transcript_text}

Generate timestamps for this video. Remember to return ONLY valid JSON."""

    print(f"[TimestampGen] Sending to Ollama ({model})...")
    print(f"[TimestampGen] Video duration: {format_time(transcript.duration)}, Language: {transcript.language}")
    
    # Increase timeout for long videos (40 min video = ~4 min processing)
    timeout = max(180, int(transcript.duration / 10))  # At least 3 min, or 1/10 of video duration
    
    try:
        response = requests.post(
            f"{ollama_url}/api/generate",
            json={
                "model": model,
                "prompt": user_prompt,
                "system": system_prompt,
                "stream": False,
                "options": {
                    "temperature": 0.2,  # Mais determinístico para JSON
                    "num_predict": 4000,
                    "num_ctx": 32768  # DeepSeek suporta contexto maior
                }
            },
            timeout=timeout
        )
        
        if response.status_code != 200:
            raise ValueError(f"Ollama request failed: {response.text}")
        
        result = response.json()
        llm_response = result.get("response", "")
        
        print(f"[TimestampGen] Received response, parsing...")
        
        # Debug: print first 500 chars of response
        if len(llm_response) > 500:
            print(f"[TimestampGen] Response preview: {llm_response[:500]}...")
        else:
            print(f"[TimestampGen] Full response: {llm_response}")
        
        # Parse JSON from response
        timestamps = parse_timestamps_from_response(llm_response, transcript.duration, min_duration)
        
        print(f"[TimestampGen] Generated {len(timestamps)} timestamps from LLM")
        
        # If we got too few timestamps, supplement with heuristics
        expected_count = max(5, int(transcript.duration / 150))  # ~1 per 2.5 minutes
        if len(timestamps) < expected_count * 0.5 and use_heuristics_fallback:
            print(f"[TimestampGen] Too few timestamps ({len(timestamps)} < {int(expected_count * 0.5)}), adding smart analysis...")
            from .smart_timestamp_generator import generate_smart_timestamps
            smart_ts = generate_smart_timestamps(transcript, video_title, min_duration)
            
            # Convert to Timestamp objects
            heuristic_timestamps = []
            for ts_dict in smart_ts:
                heuristic_timestamps.append(Timestamp(
                    time=ts_dict["time"],
                    title=ts_dict["title"],
                    confidence=0.7
                ))
            
            # Merge timestamps (prefer LLM but add missing heuristic ones)
            existing_times = {ts.time for ts in timestamps}
            for h_ts in heuristic_timestamps:
                # Add if no timestamp within 30 seconds
                if not any(abs(h_ts.time - t) < 30 for t in existing_times):
                    timestamps.append(h_ts)
            
            # Re-sort by time
            timestamps.sort(key=lambda x: x.time)
            print(f"[TimestampGen] Final count: {len(timestamps)} timestamps (LLM + heuristics)")
        
        return timestamps
        
    except requests.exceptions.Timeout:
        if use_heuristics_fallback:
            print("[TimestampGen] Ollama timeout, falling back to heuristics...")
            from .timestamp_analyzer import generate_timestamps_heuristic
            return generate_timestamps_heuristic(transcript, min_duration)
        raise ValueError("Ollama request timed out. The model may be too slow or the transcript too long.")
    except Exception as e:
        if use_heuristics_fallback:
            print(f"[TimestampGen] Ollama failed ({e}), falling back to heuristics...")
            from .timestamp_analyzer import generate_timestamps_heuristic
            return generate_timestamps_heuristic(transcript, min_duration)
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
            # Check if ts is a dict
            if not isinstance(ts, dict):
                print(f"[TimestampGen] Warning: Invalid timestamp format: {type(ts)} - {ts}")
                continue
                
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
