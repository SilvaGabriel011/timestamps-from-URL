# Local YouTube Timestamp Generator - Architecture

## Overview

This document describes the architecture of a fully local, free application that generates video transcripts and timestamps from YouTube URLs. The system runs entirely on the user's machine without relying on any paid APIs or cloud services.

## System Requirements

- **Python 3.9+** - For running the local Whisper model
- **Node.js 18+** - For the backend API server
- **Ollama** - For running local LLM models
- **FFmpeg** - For audio extraction and processing
- **8GB+ RAM** - Recommended for running local AI models
- **GPU (optional)** - CUDA-compatible GPU for faster transcription

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              User Interface                                  │
│                         (React + TypeScript + Vite)                         │
│                                                                             │
│  ┌─────────────┐  ┌─────────────────┐  ┌─────────────────────────────────┐ │
│  │ Video Input │  │ Loading States  │  │ Timestamp Display + Copy        │ │
│  └─────────────┘  └─────────────────┘  └─────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    │ HTTP API
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           Backend API Server                                 │
│                      (Node.js + Express + TypeScript)                       │
│                                                                             │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────────────┐ │
│  │ /api/generate   │  │ /api/transcript │  │ /api/health                 │ │
│  └─────────────────┘  └─────────────────┘  └─────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                    ┌───────────────┼───────────────┐
                    │               │               │
                    ▼               ▼               ▼
┌───────────────────────┐ ┌─────────────────┐ ┌─────────────────────────────┐
│   YouTube Service     │ │ Local Whisper   │ │ Local LLM (Ollama)          │
│                       │ │ (Python Server) │ │                             │
│ - Extract video ID    │ │                 │ │ - Timestamp generation      │
│ - Get subtitles       │ │ - Audio → Text  │ │ - Topic detection           │
│ - Download audio      │ │ - Word timing   │ │ - Title generation          │
└───────────────────────┘ └─────────────────┘ └─────────────────────────────┘
         │                        │                        │
         ▼                        ▼                        ▼
┌───────────────────────┐ ┌─────────────────┐ ┌─────────────────────────────┐
│   yt-dlp / ytdl-core  │ │ faster-whisper  │ │ Ollama Runtime              │
│                       │ │ (Whisper model) │ │ (llama3.2, mistral, etc.)   │
└───────────────────────┘ └─────────────────┘ └─────────────────────────────┘
```

## Components

### 1. Frontend (React + TypeScript)

The frontend provides a user-friendly interface for:
- Entering YouTube video URLs
- Configuring generation options (language, minimum segment duration)
- Displaying generated timestamps with confidence scores
- Copying timestamps to clipboard for YouTube descriptions

**Key Files:**
- `frontend/src/App.tsx` - Main application component
- `frontend/src/components/VideoInput.tsx` - URL input form
- `frontend/src/components/TimestampList.tsx` - Results display
- `frontend/src/services/api.ts` - Backend API client

### 2. Backend API Server (Node.js + Express)

The backend orchestrates the entire pipeline:
1. Receives YouTube URL from frontend
2. Extracts video ID and fetches metadata
3. Attempts to get existing subtitles from YouTube
4. Falls back to local Whisper transcription if no subtitles
5. Sends transcript to local LLM for timestamp generation
6. Validates and returns timestamps

**Key Files:**
- `backend/src/index.ts` - Express server and API routes
- `backend/src/youtube.ts` - YouTube video handling
- `backend/src/local-whisper.ts` - Local Whisper integration
- `backend/src/local-llm.ts` - Ollama LLM integration
- `backend/src/validator.ts` - Timestamp validation

### 3. Local Whisper Service (Python + faster-whisper)

A lightweight Python HTTP server that provides speech-to-text transcription using the faster-whisper library, which is a highly optimized implementation of OpenAI's Whisper model.

**Features:**
- Runs completely locally without internet
- Supports multiple model sizes (tiny, base, small, medium, large)
- Provides word-level timestamps
- GPU acceleration with CUDA (optional)
- CPU fallback for systems without GPU

**Key Files:**
- `backend/local-whisper/server.py` - HTTP server for transcription
- `backend/local-whisper/requirements.txt` - Python dependencies

### 4. Local LLM Service (Ollama)

Ollama provides a simple way to run large language models locally. The application uses Ollama to analyze transcripts and generate meaningful timestamps.

**Supported Models:**
- `llama3.2` (recommended) - Good balance of speed and quality
- `mistral` - Fast and efficient
- `llama3.1` - Higher quality, slower
- `phi3` - Lightweight option

## Data Flow

### Transcript Generation Flow

```
1. User enters YouTube URL
                │
                ▼
2. Backend extracts video ID
                │
                ▼
3. Try to fetch YouTube subtitles
                │
        ┌───────┴───────┐
        │               │
   Subtitles       No Subtitles
   Available       Available
        │               │
        ▼               ▼
4a. Parse and      4b. Download audio
    format             with yt-dlp
    subtitles              │
        │                  ▼
        │          5b. Send to local
        │              Whisper server
        │                  │
        │                  ▼
        │          6b. Receive transcript
        │              with timestamps
        │               │
        └───────┬───────┘
                │
                ▼
7. Send transcript to Ollama LLM
                │
                ▼
8. LLM identifies topic changes
   and generates timestamps
                │
                ▼
9. Validate timestamps
   (confidence, spacing, bounds)
                │
                ▼
10. Return to frontend
```

### Timestamp Generation Prompt

The LLM receives a carefully crafted prompt that:
1. Provides the full transcript with timing information
2. Instructs the model to identify topic changes
3. Requires evidence from the transcript for each timestamp
4. Enforces minimum spacing between timestamps
5. Requests confidence scores for each suggestion

## API Endpoints

### POST /api/generate

Generate timestamps for a YouTube video.

**Request:**
```json
{
  "url": "https://www.youtube.com/watch?v=VIDEO_ID",
  "language": "en",
  "min_segment_duration": 30
}
```

**Response:**
```json
{
  "timestamps": [
    {
      "time": 0,
      "title": "Introduction",
      "confidence": 0.95,
      "evidence": "Welcome to this video about..."
    },
    {
      "time": 180,
      "title": "Main Topic Discussion",
      "confidence": 0.88,
      "evidence": "Now let's dive into the main topic..."
    }
  ],
  "metadata": {
    "video_id": "VIDEO_ID",
    "language": "en",
    "is_auto_generated": false,
    "used_speech_to_text": true,
    "from_cache": false,
    "total_candidates": 10,
    "validated_count": 5,
    "model_used": "llama3.2"
  }
}
```

### POST /api/transcript

Get only the transcript without timestamp generation.

### GET /api/health

Health check endpoint that also verifies local services are running.

## Local Services Setup

### Whisper Server (Python)

```bash
cd backend/local-whisper
pip install -r requirements.txt
python server.py --model base --port 5000
```

**Model Options:**
| Model  | Size   | RAM Required | Speed    | Quality  |
|--------|--------|--------------|----------|----------|
| tiny   | 39M    | ~1GB         | Fastest  | Basic    |
| base   | 74M    | ~1GB         | Fast     | Good     |
| small  | 244M   | ~2GB         | Medium   | Better   |
| medium | 769M   | ~5GB         | Slow     | Great    |
| large  | 1550M  | ~10GB        | Slowest  | Best     |

### Ollama Setup

```bash
# Install Ollama
curl -fsSL https://ollama.com/install.sh | sh

# Pull a model
ollama pull llama3.2

# Start Ollama server (usually auto-starts)
ollama serve
```

## Configuration

### Environment Variables

**Backend (.env):**
```env
PORT=8000
WHISPER_SERVER_URL=http://localhost:5000
OLLAMA_URL=http://localhost:11434
OLLAMA_MODEL=llama3.2
```

**Frontend (.env):**
```env
VITE_API_URL=http://localhost:8000
```

## Anti-Hallucination Strategies

The system implements multiple layers to prevent AI hallucinations:

1. **Prompt Engineering** - Explicit instructions to use only transcript content
2. **Low Temperature** - LLM calls use temperature 0.3 for deterministic outputs
3. **Confidence Filtering** - Only timestamps with confidence >= 0.7 are included
4. **Spacing Validation** - Minimum duration between timestamps is enforced
5. **Evidence Requirement** - Each timestamp must include supporting transcript text
6. **Bounds Checking** - Timestamps must be within video duration

## Performance Considerations

### Transcription Performance

- **GPU (CUDA)**: ~10x faster than CPU
- **CPU**: Adequate for videos under 30 minutes
- **Model Size**: Smaller models are faster but less accurate

### LLM Performance

- **Model Size**: Larger models produce better timestamps but are slower
- **Context Length**: Long videos may need transcript sampling
- **Batch Processing**: Multiple timestamp candidates generated in one call

## Error Handling

The system handles various error scenarios:

1. **Invalid YouTube URL** - Returns user-friendly error message
2. **No Subtitles Available** - Falls back to Whisper transcription
3. **Whisper Server Unavailable** - Returns error with setup instructions
4. **Ollama Not Running** - Returns error with installation guide
5. **Video Too Long** - Warns user and samples transcript
6. **Network Errors** - Retries with exponential backoff

## Security Considerations

- All processing happens locally - no data sent to external services
- No API keys required
- Audio files are deleted after transcription
- Cache can be cleared by user

## Future Improvements

1. **Streaming Transcription** - Real-time progress updates
2. **Multiple Language Support** - Auto-detect video language
3. **Custom Model Support** - Allow users to specify Whisper/LLM models
4. **Batch Processing** - Process multiple videos at once
5. **Export Formats** - SRT, VTT, JSON export options
