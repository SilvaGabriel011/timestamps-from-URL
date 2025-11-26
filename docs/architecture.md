# YouTube Timestamp Generator - Architecture

## Overview

A simple, local-only CLI application that generates video transcripts and timestamps from YouTube URLs. The entire process runs locally without any paid APIs or cloud services.

## System Requirements

- Python 3.10+
- Ollama (local LLM runtime)
- FFmpeg (for audio processing)
- ~4GB RAM minimum (for Whisper base model)

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                         CLI Interface                            │
│                          (main.py)                               │
└─────────────────────────────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│                        Downloader Module                         │
│                       (downloader.py)                            │
│                                                                  │
│  - Downloads audio from YouTube URL using yt-dlp                │
│  - Extracts video metadata (title, duration)                    │
│  - Saves audio to temporary file                                │
└─────────────────────────────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│                       Transcriber Module                         │
│                       (transcriber.py)                           │
│                                                                  │
│  - Uses faster-whisper library directly (no HTTP server)        │
│  - Transcribes audio to text with timestamps                    │
│  - Supports multiple model sizes (tiny, base, small, medium)    │
│  - Returns structured transcript with word-level timing         │
└─────────────────────────────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│                   Timestamp Generator Module                     │
│                   (timestamp_generator.py)                       │
│                                                                  │
│  - Sends transcript to local Ollama LLM                         │
│  - Prompts LLM to identify topic changes and key moments        │
│  - Parses LLM response into structured timestamps               │
│  - Validates timestamps against transcript                      │
└─────────────────────────────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│                        Exporter Module                           │
│                        (exporter.py)                             │
│                                                                  │
│  - Writes transcript to transcript.txt                          │
│  - Writes timestamps to timestamps.txt (YouTube format)         │
│  - Writes timestamps to timestamps.json (structured data)       │
│  - Creates output directory if needed                           │
└─────────────────────────────────────────────────────────────────┘
```

## Data Flow

1. **Input**: User provides YouTube URL via command line
2. **Download**: yt-dlp extracts audio from video
3. **Transcribe**: faster-whisper converts audio to text with timing
4. **Generate**: Ollama LLM analyzes transcript and identifies key moments
5. **Export**: Results saved to local files

## Module Details

### 1. Downloader (`src/downloader.py`)

**Purpose**: Download audio from YouTube videos

**Dependencies**: yt-dlp

**Functions**:
- `download_audio(url: str, output_dir: str) -> AudioInfo`
- `get_video_info(url: str) -> VideoInfo`

**Data Structures**:
```python
@dataclass
class VideoInfo:
    video_id: str
    title: str
    duration: int  # seconds
    
@dataclass
class AudioInfo:
    video_info: VideoInfo
    audio_path: str
```

### 2. Transcriber (`src/transcriber.py`)

**Purpose**: Convert audio to text using local Whisper model

**Dependencies**: faster-whisper

**Functions**:
- `transcribe(audio_path: str, model_size: str, language: str) -> Transcript`

**Data Structures**:
```python
@dataclass
class TranscriptSegment:
    start: float  # seconds
    end: float    # seconds
    text: str

@dataclass
class Transcript:
    language: str
    segments: List[TranscriptSegment]
    full_text: str
```

**Model Options**:
| Model | Size | Speed | Quality |
|-------|------|-------|---------|
| tiny | ~75MB | Fastest | Basic |
| base | ~150MB | Fast | Good |
| small | ~500MB | Medium | Better |
| medium | ~1.5GB | Slow | Best |

### 3. Timestamp Generator (`src/timestamp_generator.py`)

**Purpose**: Analyze transcript and generate timestamps using local LLM

**Dependencies**: requests (for Ollama API)

**Functions**:
- `generate_timestamps(transcript: Transcript, video_title: str, min_duration: int) -> List[Timestamp]`

**Data Structures**:
```python
@dataclass
class Timestamp:
    time: float      # seconds
    title: str       # short description (3-8 words)
    confidence: float
```

**Ollama Integration**:
- Endpoint: `http://localhost:11434/api/generate`
- Default model: `llama3.2`
- Temperature: 0.3 (for consistent output)

### 4. Exporter (`src/exporter.py`)

**Purpose**: Save results to local files

**Functions**:
- `export_transcript(transcript: Transcript, output_path: str)`
- `export_timestamps_txt(timestamps: List[Timestamp], output_path: str)`
- `export_timestamps_json(timestamps: List[Timestamp], output_path: str)`

**Output Formats**:

**transcript.txt**:
```
[Full transcript text with timestamps]

[00:00] Hello and welcome to this video...
[00:15] Today we're going to talk about...
```

**timestamps.txt** (YouTube format):
```
0:00 - Introduction
0:45 - Main Topic Overview
2:30 - Deep Dive into Details
5:15 - Conclusion
```

**timestamps.json**:
```json
{
  "video_title": "Example Video",
  "timestamps": [
    {"time": 0, "formatted": "0:00", "title": "Introduction"},
    {"time": 45, "formatted": "0:45", "title": "Main Topic Overview"}
  ]
}
```

### 5. Main CLI (`main.py`)

**Purpose**: Command-line interface and orchestration

**Usage**:
```bash
python main.py <youtube_url> [options]

Options:
  --output, -o      Output directory (default: ./output)
  --model, -m       Whisper model size (default: base)
  --language, -l    Preferred language (default: auto)
  --min-duration    Minimum seconds between timestamps (default: 30)
  --ollama-model    Ollama model to use (default: llama3.2)
```

**Example**:
```bash
python main.py "https://www.youtube.com/watch?v=VIDEO_ID" -o ./my_output -m small
```

## Configuration

### Environment Variables (optional)

```bash
OLLAMA_URL=http://localhost:11434    # Ollama server URL
OLLAMA_MODEL=llama3.2                # Default LLM model
WHISPER_MODEL=base                   # Default Whisper model
```

### Default Settings

- Whisper model: `base` (good balance of speed and quality)
- Ollama model: `llama3.2` (good for text analysis)
- Minimum timestamp duration: 30 seconds
- Output directory: `./output`

## Error Handling

The application handles common errors gracefully:

1. **Invalid YouTube URL**: Clear error message with URL format examples
2. **Ollama not running**: Instructions to start Ollama service
3. **Model not available**: Instructions to pull the required model
4. **Network errors**: Retry logic with exponential backoff
5. **Audio extraction failures**: Fallback to different formats

## Dependencies

```
faster-whisper>=1.0.0
yt-dlp>=2024.0.0
requests>=2.31.0
```

## Installation

```bash
# Clone repository
git clone https://github.com/SilvaGabriel011/timestamps-from-URL.git
cd timestamps-from-URL

# Install Python dependencies
pip install -r requirements.txt

# Install Ollama (if not already installed)
curl -fsSL https://ollama.com/install.sh | sh

# Pull LLM model
ollama pull llama3.2
```

## Usage Examples

### Basic Usage
```bash
python main.py "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
```

### With Custom Options
```bash
python main.py "https://www.youtube.com/watch?v=VIDEO_ID" \
  --output ./my_videos \
  --model small \
  --language pt \
  --min-duration 60
```

### Output Files
After running, the output directory will contain:
```
output/
├── VIDEO_ID_transcript.txt
├── VIDEO_ID_timestamps.txt
└── VIDEO_ID_timestamps.json
```

## Limitations

1. **Whisper Model Size**: Smaller models (tiny, base) may struggle with:
   - Music-heavy content
   - Multiple speakers
   - Heavy accents
   - Background noise

2. **LLM Quality**: Timestamp quality depends on:
   - Ollama model capabilities
   - Transcript quality
   - Video content structure

3. **Processing Time**: Depends on:
   - Video length
   - Whisper model size
   - Hardware (CPU vs GPU)

## Future Improvements

- GPU acceleration for faster transcription
- Support for other video platforms
- Batch processing multiple videos
- Custom prompt templates for different content types
