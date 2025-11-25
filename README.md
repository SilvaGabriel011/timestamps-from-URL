# YouTube Timestamp Generator

Generate automatic timestamps for YouTube videos using AI. This application extracts video transcripts and uses OpenAI GPT-4o-mini to identify topic changes, producing timestamps that can be copied directly to YouTube video descriptions.

## Features

- Extract transcripts from YouTube videos (supports manual and auto-generated captions)
- AI-powered topic change detection with anti-hallucination validation
- Multi-language support (Portuguese, English, Spanish)
- Configurable minimum segment duration
- Copy-to-clipboard functionality for YouTube descriptions
- Confidence scores and evidence for each timestamp

## Tech Stack

### Backend
- Node.js 18+ with TypeScript
- Express.js
- youtube-transcript
- OpenAI API (GPT-4o-mini)

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
    "total_candidates": 10,
    "validated_count": 5
  }
}
```

### GET /api/health

Health check endpoint.

## Anti-Hallucination Strategies

This application implements multiple layers of validation to minimize AI hallucinations:

1. **Prompt Engineering**: Explicit instructions to use only transcript content
2. **Low Temperature**: AI calls use temperature 0.3 for more deterministic outputs
3. **Confidence Filtering**: Only timestamps with confidence >= 0.7 are included
4. **Spacing Validation**: Minimum duration between timestamps is enforced
5. **Evidence Requirement**: Each timestamp includes supporting text from the transcript

## License

MIT
