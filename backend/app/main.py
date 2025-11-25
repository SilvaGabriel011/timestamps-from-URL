from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
from youtube_transcript_api import YouTubeTranscriptApi
from youtube_transcript_api._errors import TranscriptsDisabled, NoTranscriptFound
from openai import OpenAI
from dotenv import load_dotenv
import re
import json
import os

# Load environment variables
load_dotenv()

app = FastAPI(title="YouTube Timestamp Generator API")

# Disable CORS. Do not remove this for full-stack development.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allows all origins
    allow_credentials=True,
    allow_methods=["*"],  # Allows all methods
    allow_headers=["*"],  # Allows all headers
)

# Initialize OpenAI client
client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

# System prompt for AI
SYSTEM_PROMPT = """Você é um assistente especializado em análise de conteúdo de vídeo.
Sua tarefa é identificar mudanças de tópico em transcrições de vídeos do YouTube.

REGRAS CRÍTICAS:
1. Use APENAS informações presentes na transcrição fornecida
2. NÃO invente ou assuma conteúdo que não está explícito
3. Identifique mudanças de tópico baseando-se em:
   - Mudanças claras de assunto
   - Frases de transição ("agora vamos falar sobre", "próximo tópico", etc.)
   - Mudanças no contexto da conversa
4. Cada timestamp deve ter um título descritivo de 3-8 palavras
5. O título deve refletir EXATAMENTE o que é discutido naquele momento
6. Retorne APENAS timestamps que você pode justificar com o texto da transcrição

FORMATO DE SAÍDA (JSON):
{
  "timestamps": [
    {
      "time": 0,
      "title": "Introdução ao tópico",
      "confidence": 0.95,
      "evidence": "texto exato da transcrição que justifica este timestamp"
    }
  ]
}"""


# Pydantic models
class VideoRequest(BaseModel):
    url: str
    language: Optional[str] = "pt"
    min_segment_duration: Optional[int] = 30


class TimestampItem(BaseModel):
    time: int
    title: str
    confidence: float
    evidence: str


class GenerationMetadata(BaseModel):
    video_id: str
    language: str
    is_auto_generated: bool
    total_candidates: int
    validated_count: int


class TimestampResponse(BaseModel):
    timestamps: List[TimestampItem]
    metadata: GenerationMetadata


# Helper functions
def extract_video_id(url: str) -> Optional[str]:
    """Extract video ID from YouTube URL"""
    patterns = [
        r"(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\n?#]+)",
        r"youtube\.com\/embed\/([^&\n?#]+)",
        r"youtube\.com\/v\/([^&\n?#]+)",
    ]

    for pattern in patterns:
        match = re.search(pattern, url)
        if match:
            return match.group(1)

    return None


def get_transcript(video_id: str, languages: List[str] = ["pt", "en"]) -> Dict[str, Any]:
    """Get transcript from YouTube video"""
    try:
        transcript_list = YouTubeTranscriptApi.list_transcripts(video_id)

        # Try to get manually created transcript first
        try:
            transcript = transcript_list.find_manually_created_transcript(languages)
            is_auto_generated = False
        except Exception:
            transcript = transcript_list.find_generated_transcript(languages)
            is_auto_generated = True

        transcript_data = transcript.fetch()

        return {
            "video_id": video_id,
            "language": transcript.language_code,
            "is_auto_generated": is_auto_generated,
            "segments": transcript_data,
        }

    except TranscriptsDisabled:
        raise HTTPException(status_code=400, detail="Transcrições desabilitadas para este vídeo")
    except NoTranscriptFound:
        raise HTTPException(
            status_code=400, detail=f"Nenhuma transcrição encontrada nos idiomas: {languages}"
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao obter transcrição: {str(e)}")


def format_timestamp(seconds: float) -> str:
    """Convert seconds to HH:MM:SS or MM:SS format"""
    hours = int(seconds // 3600)
    minutes = int((seconds % 3600) // 60)
    secs = int(seconds % 60)

    if hours > 0:
        return f"{hours}:{minutes:02d}:{secs:02d}"
    return f"{minutes}:{secs:02d}"


def format_transcript_for_ai(segments: List[Dict]) -> str:
    """Format transcript for AI processing"""
    formatted = []

    for segment in segments:
        time_str = format_timestamp(segment["start"])
        text = segment["text"].strip()
        formatted.append(f"[{time_str}] {text}")

    return "\n".join(formatted)


def generate_timestamps_with_ai(
    transcript: Dict[str, Any], min_segment_duration: int = 30
) -> Dict[str, Any]:
    """Generate timestamps using AI"""
    # Format transcript
    transcript_text = format_transcript_for_ai(transcript["segments"])

    # Calculate total duration
    if transcript["segments"]:
        last_segment = transcript["segments"][-1]
        total_duration = last_segment["start"] + last_segment.get("duration", 0)
    else:
        total_duration = 0

    # Create user prompt
    user_prompt = f"""Analise a seguinte transcrição e identifique mudanças de tópico:

TRANSCRIÇÃO:
{transcript_text}

CONTEXTO DO VÍDEO:
- Duração total: {int(total_duration)} segundos
- Idioma: {transcript['language']}
- Número de segmentos: {len(transcript['segments'])}
- Duração mínima entre timestamps: {min_segment_duration} segundos

Gere timestamps para as principais mudanças de tópico."""

    # Call OpenAI
    response = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": user_prompt},
        ],
        response_format={"type": "json_object"},
        temperature=0.3,
    )

    # Parse response
    result = json.loads(response.choices[0].message.content)

    return result


def validate_timestamps(
    timestamps: List[Dict],
    transcript: Dict[str, Any],
    min_confidence: float = 0.7,
    min_duration: int = 30,
) -> List[Dict]:
    """Validate timestamps generated by AI"""
    validated = []
    last_time = -min_duration

    # Create full transcript text for validation
    full_text = " ".join([seg["text"] for seg in transcript["segments"]])

    # Calculate total duration
    if transcript["segments"]:
        last_segment = transcript["segments"][-1]
        total_duration = last_segment["start"] + last_segment.get("duration", 0)
    else:
        total_duration = 0

    for ts in timestamps:
        # Validation 1: Minimum confidence
        if ts.get("confidence", 0) < min_confidence:
            continue

        # Validation 2: Timestamp is within video duration
        if ts["time"] < 0 or ts["time"] > total_duration:
            continue

        # Validation 3: Minimum spacing
        if ts["time"] - last_time < min_duration:
            continue

        # Validation 4: Title is not empty
        if not ts.get("title", "").strip():
            continue

        validated.append(ts)
        last_time = ts["time"]

    # Add initial timestamp if not present
    if not validated or validated[0]["time"] > 10:
        validated.insert(
            0,
            {
                "time": 0,
                "title": "Introdução",
                "confidence": 1.0,
                "evidence": transcript["segments"][0]["text"] if transcript["segments"] else "",
            },
        )

    return validated


# API Endpoints
@app.get("/healthz")
async def healthz():
    return {"status": "ok"}


@app.get("/api/health")
async def health_check():
    """Health check endpoint"""
    return {"status": "ok"}


@app.post("/api/generate", response_model=TimestampResponse)
async def generate_timestamps(request: VideoRequest):
    """Generate timestamps for a YouTube video"""
    # 1. Extract video ID
    video_id = extract_video_id(request.url)
    if not video_id:
        raise HTTPException(status_code=400, detail="URL do YouTube inválida")

    # 2. Get transcript
    languages = [request.language, "en"] if request.language != "en" else ["en", "pt"]
    transcript = get_transcript(video_id, languages)

    # 3. Generate timestamps with AI
    ai_result = generate_timestamps_with_ai(transcript, request.min_segment_duration)

    # 4. Validate timestamps
    validated = validate_timestamps(
        ai_result.get("timestamps", []),
        transcript,
        min_confidence=0.7,
        min_duration=request.min_segment_duration,
    )

    # 5. Return result
    return TimestampResponse(
        timestamps=[
            TimestampItem(
                time=int(ts["time"]),
                title=ts["title"],
                confidence=ts["confidence"],
                evidence=ts.get("evidence", ""),
            )
            for ts in validated
        ],
        metadata=GenerationMetadata(
            video_id=video_id,
            language=transcript["language"],
            is_auto_generated=transcript["is_auto_generated"],
            total_candidates=len(ai_result.get("timestamps", [])),
            validated_count=len(validated),
        ),
    )
