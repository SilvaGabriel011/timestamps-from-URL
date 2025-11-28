"""
Transcriber Module - Converts audio to text using local Whisper model

Optimized for Brazilian Portuguese (pt-BR) and long videos (30-60 min)
"""

import os
import sys
from dataclasses import dataclass
from typing import List, Optional

# Adicionar DLLs CUDA ao PATH antes de importar qualquer coisa
def setup_cuda_path():
    """Configura PATH para encontrar DLLs CUDA do nvidia-cublas-cu12"""
    site_packages = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    # Tentar encontrar no site-packages padrao
    possible_paths = [
        os.path.join(os.environ.get('LOCALAPPDATA', ''), 'Programs', 'Python', 'Python312', 'Lib', 'site-packages'),
        os.path.join(sys.prefix, 'Lib', 'site-packages'),
    ]
    
    for sp in possible_paths:
        cublas_path = os.path.join(sp, 'nvidia', 'cublas', 'bin')
        cudnn_path = os.path.join(sp, 'nvidia', 'cudnn', 'bin')
        if os.path.exists(cublas_path):
            os.environ['PATH'] = cublas_path + os.pathsep + cudnn_path + os.pathsep + os.environ.get('PATH', '')
            return True
    return False

setup_cuda_path()


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


# Prompt otimizado para PORTUGUES BRASILEIRO - melhora precisao do Whisper
PT_BR_INITIAL_PROMPT = """Transcrição de vídeo em português brasileiro.
Use pontuação correta com vírgulas, pontos, interrogações e acentos.
Vocabulário comum: então, né, tipo, assim, aí, daí, tá, pra, pro, beleza, cara, mano, galera, pessoal, bora, vamos lá, show, top, legal, massa, tranquilo.
Termos de tecnologia: JavaScript, Python, React, Node, API, backend, frontend, deploy, commit, push, pull request, código, programação, desenvolvedor, dev, junior, sênior, framework, biblioteca, banco de dados, servidor.
Termos de YouTube: inscreva-se, like, compartilha, comenta, link na descrição, patrocinador, parceiro, apoio, canal, vídeo, conteúdo, playlist."""

# Palavras-chave PT-BR para melhor reconhecimento
PT_BR_HOTWORDS = [
    # Expressoes coloquiais
    "então", "né", "tipo", "assim", "aí", "daí", "tá", "pra", "pro",
    "beleza", "cara", "mano", "galera", "pessoal", "bora", "vamos",
    "show", "top", "legal", "massa", "tranquilo", "blz", "vlw", "firmeza",
    # YouTube/Redes
    "YouTube", "Instagram", "TikTok", "WhatsApp", "Google", "LinkedIn",
    "inscreva-se", "like", "compartilha", "comenta", "link", "descrição",
    "patrocinador", "parceiro", "apoio", "canal", "vídeo", "conteúdo",
    # Tecnologia (comum em videos BR)
    "JavaScript", "Python", "React", "Node", "API", "backend", "frontend",
    "deploy", "commit", "push", "pull", "código", "programação", "dev",
    "junior", "sênior", "framework", "biblioteca", "servidor", "database",
    # Transicoes
    "primeiro", "segundo", "terceiro", "próximo", "agora", "então",
    "vamos ver", "vamos lá", "bora", "partiu", "seguinte", "basicamente"
]


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
    
    Optimized for Brazilian Portuguese and long videos (30-60 min).
    
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
    
    # Check if Portuguese
    is_portuguese = language and language.lower() in ('pt', 'pt-br', 'portuguese')
    
    print(f"[Transcriber] Loading Whisper model: {model_size}")
    if is_portuguese:
        print(f"[Transcriber] Portuguese mode enabled - using optimized settings")
    
    # Determine device and compute type
    if device == "auto":
        try:
            import torch
            if torch.cuda.is_available():
                device = "cuda"
                gpu_name = torch.cuda.get_device_name(0)
                gpu_mem = torch.cuda.get_device_properties(0).total_memory / 1024**3
                print(f"[Transcriber] GPU detectada: {gpu_name} ({gpu_mem:.1f}GB)")
            else:
                device = "cpu"
                print(f"[Transcriber] GPU nao disponivel - usando CPU (mais lento)")
        except ImportError:
            device = "cpu"
            print(f"[Transcriber] PyTorch nao instalado - usando CPU")
    
    # Otimizar compute_type para GPU
    if device == "cuda":
        compute_type = "float16"  # Mais rapido na GPU
    else:
        compute_type = "int8"  # Mais eficiente na CPU
    
    print(f"[Transcriber] Device: {device}, Compute: {compute_type}")
    
    try:
        model = WhisperModel(model_size, device=device, compute_type=compute_type)
    except Exception as e:
        raise ValueError(f"Failed to load Whisper model: {e}")
    
    print(f"[Transcriber] Transcribing audio...")
    print(f"[Transcriber] This may take several minutes for long videos...")
    
    # Build transcription options - optimized for long PT-BR videos
    transcribe_options = {
        "language": language,
        "word_timestamps": True,
        "vad_filter": True,
        "vad_parameters": dict(
            min_silence_duration_ms=300,  # Shorter silence detection for PT-BR speech patterns
            speech_pad_ms=250,
            threshold=0.4  # More sensitive to speech
        )
    }
    
    # Otimizacoes especificas para PORTUGUES BRASILEIRO
    if is_portuguese:
        transcribe_options.update({
            "beam_size": 5,  # Maior precisao para PT-BR
            "best_of": 3,  # Mais candidatos = melhor qualidade
            "patience": 1.2,  # Mais paciencia para frases longas
            "initial_prompt": PT_BR_INITIAL_PROMPT,
            "condition_on_previous_text": True,  # Melhora coerencia
            "compression_ratio_threshold": 2.4,  # Detecta repeticoes
            "log_prob_threshold": -1.0,  # Mais confiante
            "no_speech_threshold": 0.6,  # Evita silencio como fala
            "temperature": 0.0,  # Deterministico
        })
        print(f"[Transcriber] Modo PT-BR ativado: beam=5, best_of=3, prompt otimizado")
    else:
        transcribe_options["beam_size"] = 3
    
    try:
        segments_generator, info = model.transcribe(audio_path, **transcribe_options)
        
        # Convert generator to list with progress
        segments = []
        full_text_parts = []
        last_end = 0.0
        segment_count = 0
        
        print(f"[Transcriber] Processing segments...")
        for segment in segments_generator:
            segment_count += 1
            if segment_count % 10 == 0:  # Progress every 10 segments
                print(f"[Transcriber] Processed {segment_count} segments ({format_time(segment.end)})")
            
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
