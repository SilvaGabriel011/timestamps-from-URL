import type { ApiResponse, GenerationOptions } from '../types';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

export async function generateTimestamps(
  url: string,
  options: GenerationOptions = {}
): Promise<ApiResponse> {
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
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || 'Erro ao gerar timestamps');
  }

  return response.json();
}
