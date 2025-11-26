/**
 * Local LLM Integration (Ollama)
 * 
 * This module provides integration with Ollama for local LLM inference
 * to generate timestamps from video transcripts without requiring any paid APIs.
 */

import axios from 'axios';
import type { Transcript, TimestampCandidate, TranscriptSegment } from './types';
import { formatTranscriptForAI } from './youtube';
import { AppError } from './errors';
import { calculateTotalDuration, SECONDS_PER_MINUTE } from './time-utils';
import { VALIDATION_CONFIG } from './validation-config';
import { validateAIResponse, normalizeTimestamps, logValidationResult } from './ai-response-validator';

// Default Ollama server URL
const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'llama3.2';

// Maximum transcript length in characters
const MAX_TRANSCRIPT_CHARS = 100000;

/**
 * Check if Ollama is running and the model is available
 */
export async function checkOllamaHealth(): Promise<boolean> {
  try {
    const response = await axios.get(`${OLLAMA_URL}/api/tags`, {
      timeout: 5000
    });
    return response.status === 200;
  } catch {
    return false;
  }
}

/**
 * Get list of available models from Ollama
 */
export async function getAvailableModels(): Promise<string[]> {
  try {
    const response = await axios.get(`${OLLAMA_URL}/api/tags`, {
      timeout: 5000
    });
    return (response.data?.models || []).map((m: any) => m.name);
  } catch {
    return [];
  }
}

/**
 * Check if a specific model is available
 */
export async function isModelAvailable(modelName: string): Promise<boolean> {
  const models = await getAvailableModels();
  return models.some(m => m.startsWith(modelName));
}

/**
 * Sample transcript segments to fit within token limits
 */
function sampleTranscript(segments: TranscriptSegment[]): TranscriptSegment[] {
  const formatted = formatTranscriptForAI(segments);
  
  if (formatted.length <= MAX_TRANSCRIPT_CHARS) {
    return segments;
  }

  const ratio = MAX_TRANSCRIPT_CHARS / formatted.length;
  const sampleSize = Math.floor(segments.length * ratio);
  const step = segments.length / sampleSize;
  const sampled: TranscriptSegment[] = [];
  
  for (let i = 0; i < sampleSize; i++) {
    const index = Math.floor(i * step);
    sampled.push(segments[index]);
  }
  
  return sampled;
}

/**
 * System prompt for timestamp generation
 */
const SYSTEM_PROMPT = `You are an expert at analyzing video content and identifying topic changes.
Your task is to identify CONTEXT CHANGES and CONTENT TRANSITIONS in videos.

FUNDAMENTAL RULES:
1. UNDERSTAND the main topic from the title and initial content
2. IDENTIFY when the presenter changes topics:
   - Phrases like "now let's talk about", "next point", "another aspect"
   - Changes in tone or presentation rhythm
   - Start of new examples or demonstrations
   - Transitions between theory and practice
3. COVER the ENTIRE video proportionally:
   - For 40 minutes: 12-20 timestamps
   - For 20 minutes: 8-12 timestamps
   - For 10 minutes: 5-8 timestamps

SPACING RULES:
1. Minimum 30 seconds between nearby timestamps
2. Ideally 2-4 minutes between main timestamps
3. Distribute timestamps throughout the ENTIRE video
4. DO NOT concentrate timestamps only at the beginning
5. Ensure the last third of the video has timestamps

OUTPUT FORMAT (JSON only, no markdown):
{
  "timestamps": [
    {
      "time": 0,
      "title": "Introduction to the topic",
      "confidence": 0.95,
      "evidence": "exact transcript text that justifies this timestamp"
    }
  ]
}

IMPORTANT: Return ONLY valid JSON, no markdown code blocks or other text.`;

/**
 * Generate timestamps using local Ollama LLM
 */
export async function generateTimestampsWithLocalLLM(
  transcript: Transcript,
  minSegmentDuration: number = 30,
  videoTitle?: string
): Promise<{ timestamps: TimestampCandidate[]; modelUsed: string }> {
  // Guard against empty transcripts
  if (!transcript.segments || transcript.segments.length === 0) {
    console.warn('[LocalLLM] Received empty transcript, skipping LLM generation');
    return { timestamps: [], modelUsed: OLLAMA_MODEL };
  }

  // Check if Ollama is running
  const isHealthy = await checkOllamaHealth();
  if (!isHealthy) {
    throw new AppError({
      code: 'OLLAMA_UNAVAILABLE' as any,
      message: 'Ollama is not running',
      userMessage: 'Ollama não está rodando',
      suggestions: [
        'Instale o Ollama: curl -fsSL https://ollama.com/install.sh | sh',
        'Inicie o Ollama: ollama serve',
        'Baixe um modelo: ollama pull llama3.2'
      ],
      httpStatus: 503
    });
  }

  // Check if model is available
  const modelAvailable = await isModelAvailable(OLLAMA_MODEL);
  if (!modelAvailable) {
    throw new AppError({
      code: 'MODEL_NOT_AVAILABLE' as any,
      message: `Model ${OLLAMA_MODEL} is not available`,
      userMessage: `Modelo ${OLLAMA_MODEL} não está disponível`,
      suggestions: [
        `Baixe o modelo: ollama pull ${OLLAMA_MODEL}`,
        'Ou configure outro modelo na variável OLLAMA_MODEL'
      ],
      httpStatus: 503
    });
  }

  // Sample transcript if too long
  const sampledSegments = sampleTranscript(transcript.segments);
  const isSampled = sampledSegments.length < transcript.segments.length;

  console.log(`[LocalLLM] Processing transcript with ${transcript.segments.length} segments`);
  console.log(`[LocalLLM] Video title: "${videoTitle || 'Not provided'}"`);
  console.log(`[LocalLLM] After sampling: ${sampledSegments.length} segments`);
  console.log(`[LocalLLM] Using model: ${OLLAMA_MODEL}`);

  // Format transcript for LLM
  const transcriptText = formatTranscriptForAI(sampledSegments);
  console.log(`[LocalLLM] Transcript text length: ${transcriptText.length} characters`);

  // Calculate total duration
  const totalDuration = calculateTotalDuration(transcript.segments);

  // Create user prompt
  const samplingNote = isSampled 
    ? `\nNOTE: This is a representative sample of ${sampledSegments.length} of ${transcript.segments.length} segments due to video length.`
    : '';

  // Calculate recommended number of timestamps
  const durationMinutes = Math.floor(totalDuration / SECONDS_PER_MINUTE);
  let recommendedTimestamps = 0;
  if (durationMinutes >= 40) {
    recommendedTimestamps = Math.min(20, Math.max(12, Math.floor(durationMinutes / 2.5)));
  } else if (durationMinutes >= 20) {
    recommendedTimestamps = Math.min(12, Math.max(8, Math.floor(durationMinutes / 2.5)));
  } else if (durationMinutes >= 10) {
    recommendedTimestamps = Math.min(8, Math.max(5, Math.floor(durationMinutes / 2)));
  } else {
    recommendedTimestamps = Math.max(3, Math.floor(durationMinutes / 2));
  }

  const userPrompt = `Analyze the video and generate organized timestamps:

VIDEO TITLE: "${videoTitle || 'Untitled Video'}"

TRANSCRIPT:
${transcriptText}

CONTEXT:
- Total duration: ${Math.floor(totalDuration)} seconds (${durationMinutes} minutes)
- Language: ${transcript.language}
- Minimum spacing: ${minSegmentDuration} seconds
- GENERATE EXACTLY: ${recommendedTimestamps} timestamps${samplingNote}

MANDATORY INSTRUCTIONS:
1. DISTRIBUTE timestamps evenly from start (0:00) to end (${Math.floor(totalDuration/60)}:00)
2. Use timestamps in SECONDS, not minutes
3. The FIRST timestamp must be at time: 0
4. The LAST timestamp should be between ${Math.floor(totalDuration * 0.85)} and ${totalDuration} seconds
5. AVERAGE spacing between timestamps: ${Math.floor(totalDuration / recommendedTimestamps)} seconds
6. Identify REAL context changes in the transcript
7. Don't cluster timestamps at the beginning - distribute throughout the ENTIRE video

Return ONLY valid JSON, no markdown.`;

  try {
    console.log(`[LocalLLM] Sending to ${OLLAMA_MODEL} for timestamp generation...`);
    const startTime = Date.now();

    const response = await axios.post(
      `${OLLAMA_URL}/api/generate`,
      {
        model: OLLAMA_MODEL,
        prompt: `${SYSTEM_PROMPT}\n\nUser: ${userPrompt}`,
        stream: false,
        options: {
          temperature: 0.3,
          num_predict: 4096
        }
      },
      {
        timeout: 300000 // 5 minutes timeout
      }
    );

    const elapsed = Math.round((Date.now() - startTime) / 1000);
    console.log(`[LocalLLM] Received response in ${elapsed} seconds`);

    // Parse response
    const content = response.data?.response;
    if (!content) {
      throw new Error('Empty response from LLM');
    }

    // Try to extract JSON from the response
    let jsonContent = content;
    
    // Remove markdown code blocks if present
    const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      jsonContent = jsonMatch[1].trim();
    }
    
    // Try to find JSON object in the response
    const jsonObjectMatch = jsonContent.match(/\{[\s\S]*\}/);
    if (jsonObjectMatch) {
      jsonContent = jsonObjectMatch[0];
    }

    // Validate AI response structure and normalize timestamps
    const validationResult = validateAIResponse(jsonContent);
    logValidationResult(validationResult);

    if (!validationResult.success) {
      console.error('[LocalLLM] AI response validation failed');
      console.error('[LocalLLM] Raw response:', content.substring(0, 500));
      return { timestamps: [], modelUsed: OLLAMA_MODEL };
    }

    // Normalize timestamps
    const normalizedTimestamps = normalizeTimestamps(
      validationResult.timestamps,
      totalDuration * VALIDATION_CONFIG.DURATION_TOLERANCE_FACTOR
    );

    console.log(`[LocalLLM] Generated ${normalizedTimestamps.length} timestamp candidates`);
    if (normalizedTimestamps.length > 0) {
      console.log(`[LocalLLM] First timestamp:`, normalizedTimestamps[0]);
    }

    return { timestamps: normalizedTimestamps, modelUsed: OLLAMA_MODEL };

  } catch (error: any) {
    console.error(`[LocalLLM] Error:`, error.message);

    if (error.code === 'ECONNREFUSED') {
      throw new AppError({
        code: 'OLLAMA_UNAVAILABLE' as any,
        message: 'Cannot connect to Ollama',
        userMessage: 'Não foi possível conectar ao Ollama',
        suggestions: [
          'Inicie o Ollama: ollama serve',
          'Verifique se a porta 11434 está disponível'
        ],
        httpStatus: 503
      });
    }

    throw error;
  }
}

/**
 * Get Ollama server status
 */
export async function getOllamaStatus(): Promise<{
  running: boolean;
  models: string[];
  currentModel: string;
}> {
  const running = await checkOllamaHealth();
  const models = running ? await getAvailableModels() : [];
  
  return {
    running,
    models,
    currentModel: OLLAMA_MODEL
  };
}
