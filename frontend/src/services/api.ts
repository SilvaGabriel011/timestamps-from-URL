import type { ApiResponse, GenerationOptions, TranscriptResponse } from '../types';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

// Timeout for long videos (10 minutes)
const TIMEOUT_MS = 10 * 60 * 1000;

export async function generateTimestamps(
  url: string,
  options: GenerationOptions = {}
): Promise<ApiResponse> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(`${API_BASE_URL}/api/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url,
        language: options.language || 'pt',
        min_segment_duration: options.minSegmentDuration || 30,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorData = await response.json();
      
      // Return structured error from backend
      if (errorData.error) {
        throw {
          message: errorData.error.message,
          code: errorData.error.code,
          suggestions: errorData.error.suggestions,
        };
      }
      
      // Fallback for old error format
      throw new Error(errorData.detail || 'Erro ao gerar timestamps');
    }

    return response.json();
  } catch (error) {
    clearTimeout(timeoutId);
    
    if (error instanceof Error && error.name === 'AbortError') {
      throw {
        message: 'Timeout: O processamento do vídeo demorou muito (>10 minutos)',
        code: 'TIMEOUT_ERROR',
        suggestions: [
          'Tente com um vídeo mais curto',
          'Verifique sua conexão com a internet',
        ],
      };
    }
    throw error;
  }
}

export async function fetchTranscript(
  url: string,
  options: GenerationOptions = {}
): Promise<TranscriptResponse> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(`${API_BASE_URL}/api/transcript`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url,
        language: options.language || 'pt',
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorData = await response.json();
      
      if (errorData.error) {
        throw {
          message: errorData.error.message,
          code: errorData.error.code,
          suggestions: errorData.error.suggestions,
        };
      }
      
      throw new Error(errorData.detail || 'Erro ao buscar transcrição');
    }

    return response.json();
  } catch (error) {
    clearTimeout(timeoutId);
    
    if (error instanceof Error && error.name === 'AbortError') {
      throw {
        message: 'Timeout: O processamento do vídeo demorou muito (>10 minutos)',
        code: 'TIMEOUT_ERROR',
        suggestions: [
          'Tente com um vídeo mais curto',
          'Verifique sua conexão com a internet',
        ],
      };
    }
    throw error;
  }
}
