# YouTube Timestamp Generator

A simple, local-only CLI application that generates video transcripts and timestamps from YouTube URLs. The entire process runs locally without any paid APIs or cloud services.

## Features

- Downloads audio from YouTube videos
- Transcribes audio using local Whisper model (faster-whisper)
- Generates timestamps using local LLM (Ollama)
- Outputs transcript and timestamps to local files
- 100% free, no API keys required

## Requirements

- Python 3.10+
- [Ollama](https://ollama.com/) (local LLM runtime)
- FFmpeg (usually pre-installed on most systems)

## Installation

### 1. Clone the repository

```bash
git clone https://github.com/SilvaGabriel011/timestamps-from-URL.git
cd timestamps-from-URL
```

### 2. Install Python dependencies

```bash
pip install -r requirements.txt
```

### 3. Install and setup Ollama

```bash
# Install Ollama (Linux/macOS)
curl -fsSL https://ollama.com/install.sh | sh

# Start Ollama service
ollama serve

# Pull a model (in another terminal)
ollama pull llama3.2
```

## Usage

### Basic Usage

```bash
python main.py "https://www.youtube.com/watch?v=VIDEO_ID"
```

### With Options

```bash
python main.py "https://www.youtube.com/watch?v=VIDEO_ID" \
  --output ./my_output \
  --model small \
  --language pt \
  --min-duration 60
```

### All Options

| Option | Description | Default |
|--------|-------------|---------|
| `-o, --output` | Output directory | `./output` |
| `-m, --model` | Whisper model size (tiny, base, small, medium, large-v3) | `base` |
| `-l, --language` | Preferred language code (en, pt, es, etc.) | auto-detect |
| `--min-duration` | Minimum seconds between timestamps | `30` |
| `--ollama-model` | Ollama model for timestamp generation | `llama3.2` |
| `--ollama-url` | Ollama server URL | `http://localhost:11434` |
| `--keep-audio` | Keep downloaded audio file | `false` |
| `--skip-timestamps` | Only generate transcript | `false` |
| `-q, --quiet` | Suppress progress messages | `false` |

## Output Files

After running, the output directory will contain:

```
output/
├── VIDEO_ID_transcript.txt    # Full transcript with timestamps
├── VIDEO_ID_timestamps.txt    # YouTube-ready timestamp list
└── VIDEO_ID_timestamps.json   # Structured timestamp data
```

### timestamps.txt (YouTube format)

```
Timestamps for: Video Title

TIMESTAMPS (Copy to YouTube description):
----------------------------------------
0:00 - Introduction
0:45 - Main Topic Overview
2:30 - Deep Dive into Details
5:15 - Conclusion
----------------------------------------
```

### timestamps.json

```json
{
  "video_title": "Video Title",
  "video_id": "VIDEO_ID",
  "timestamp_count": 4,
  "timestamps": [
    {"time": 0, "formatted": "0:00", "title": "Introduction", "confidence": 1.0},
    {"time": 45, "formatted": "0:45", "title": "Main Topic Overview", "confidence": 1.0}
  ]
}
```

## Whisper Model Sizes

| Model | Size | Speed | Quality | Recommended For |
|-------|------|-------|---------|-----------------|
| `tiny` | ~75MB | Fastest | Basic | Quick tests |
| `base` | ~150MB | Fast | Good | General use |
| `small` | ~500MB | Medium | Better | Better accuracy |
| `medium` | ~1.5GB | Slow | Best | High quality |
| `large-v3` | ~3GB | Slowest | Excellent | Maximum accuracy |

## Examples

### Generate timestamps for a podcast

```bash
python main.py "https://www.youtube.com/watch?v=PODCAST_ID" -m small --min-duration 120
```

### Generate only transcript (no timestamps)

```bash
python main.py "https://www.youtube.com/watch?v=VIDEO_ID" --skip-timestamps
```

### Use a different Ollama model

```bash
python main.py "https://www.youtube.com/watch?v=VIDEO_ID" --ollama-model mistral
```

## Troubleshooting

### "Ollama is not running"

Start the Ollama service:
```bash
ollama serve
```

Then pull a model:
```bash
ollama pull llama3.2
```

### "No speech detected in audio"

This can happen with:
- Music videos (mostly singing, not speech)
- Videos with heavy background noise
- Very short videos

Try using a larger Whisper model:
```bash
python main.py "URL" -m small
```

### "Download failed"

Make sure yt-dlp is installed and up to date:
```bash
pip install --upgrade yt-dlp
```

## Architecture

See [docs/architecture.md](docs/architecture.md) for detailed architecture documentation.

## License

MIT License
