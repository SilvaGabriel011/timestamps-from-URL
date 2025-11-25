# YouTube Timestamp Generator

Generate automatic timestamps for YouTube videos using AI. This application extracts video transcripts and uses OpenAI GPT-4o-mini to identify topic changes, producing timestamps that can be copied directly to YouTube video descriptions.

## Features

- Extract transcripts from YouTube videos (supports manual and auto-generated captions)
- **NEW:** Automatic Speech-to-Text when no subtitles are available (using OpenAI Whisper)
- **NEW:** Smart caching system to reduce API calls and improve performance
- AI-powered topic change detection with anti-hallucination validation
- Multi-language support (Portuguese, English, Spanish)
- Configurable minimum segment duration
- Copy-to-clipboard functionality for YouTube descriptions
- Confidence scores and evidence for each timestamp
- Visual indicators for transcription source (subtitles vs speech-to-text)
- Cache hit indicator showing when results are served from cache

## Tech Stack

### Backend

- Node.js 18+ with TypeScript
- Express.js
- youtube-transcript
- @distube/ytdl-core (for audio download)
- OpenAI API (GPT-4o-mini + Whisper)

### Frontend

- React 18 + TypeScript
- Vite
- Tailwind CSS
- shadcn/ui components

## Getting Started

### Prerequisites

- Node.js 18+
- OpenAI API key

### Backend Setup

1. Navigate to the backend directory:

   ```bash
   cd backend
   ```

2. Install dependencies:

   ```bash
   npm install
   ```

3. Create a `.env` file with your OpenAI API key:

   ```bash
   cp .env.example .env
   # Edit .env and add your OPENAI_API_KEY
   ```

4. Start the development server:

   ```bash
   npm run dev
   ```

The API will be available at `http://localhost:8000`.

### Frontend Setup

1. Navigate to the frontend directory:

   ```bash
   cd frontend
   ```

2. Install dependencies:

   ```bash
   npm install
   ```

3. Create a `.env` file:

   ```bash
   cp .env.example .env
   ```

4. Start the development server:

   ```bash
   npm run dev
   ```

The app will be available at `http://localhost:5173`.

## API Endpoints

### POST /api/generate

Generate timestamps for a YouTube video.

**Request Body:**

```json
{
  "url": "https://www.youtube.com/watch?v=VIDEO_ID",
  "language": "pt",
  "min_segment_duration": 30
}
```

**Response:**

```json
{
  "timestamps": [
    {
      "time": 0,
      "title": "Introdução",
      "confidence": 0.95,
      "evidence": "transcript text..."
    }
  ],
  "metadata": {
    "video_id": "VIDEO_ID",
    "language": "pt",
    "is_auto_generated": false,
    "used_speech_to_text": false,
    "from_cache": false,
    "total_candidates": 10,
    "validated_count": 5
  }
}
```

### GET /api/health

Health check endpoint.

### GET /api/cache/stats

Get cache statistics.

**Response:**

```json
{
  "totalEntries": 5,
  "totalSize": 245632,
  "oldestEntry": "2024-01-20T10:30:00.000Z",
  "newestEntry": "2024-01-21T15:45:00.000Z"
}
```

### POST /api/cache/clear

Clear old cache entries.

## Speech-to-Text Support

When a video doesn't have available subtitles, the application automatically:

1. Downloads the audio from YouTube (max 1 hour, 25MB limit)
2. Transcribes using OpenAI Whisper API
3. Generates timestamps from the transcription
4. Shows a purple "Speech-to-Text (Whisper)" badge in the UI

**Limitations:**

- Maximum video duration: 1 hour (configurable)
- Maximum audio file size: 25MB (Whisper API limit)
- Temporary audio files are cleaned up automatically

## Cache System

The application implements a smart caching system to:

- **Reduce API costs**: Transcripts are cached for 7 days
- **Improve performance**: Cached results load instantly
- **Automatic cleanup**: Old cache entries are removed automatically
- **Visual feedback**: Yellow "Cache Hit" badge when using cached data

Cache is stored locally in the `cache/` directory and persists between server restarts.

## Anti-Hallucination Strategies

This application implements multiple layers of validation to minimize AI hallucinations:

1. **Prompt Engineering**: Explicit instructions to use only transcript content
2. **Low Temperature**: AI calls use temperature 0.3 for more deterministic outputs
3. **Confidence Filtering**: Only timestamps with confidence >= 0.7 are included
4. **Spacing Validation**: Minimum duration between timestamps is enforced
5. **Evidence Requirement**: Each timestamp includes supporting text from the transcript

## License

MIT
