import OpenAI from 'openai';
import type { Transcript, TimestampCandidate, TranscriptSegment } from './types';
import { formatTranscriptForAI } from './youtube';
import { parseOpenAIError } from './errors';

// Maximum transcript length in characters (~100k tokens for GPT-4o-mini)
// 1 token ≈ 4 characters, so 100k tokens ≈ 400k characters
const MAX_TRANSCRIPT_CHARS = 350000;

/**
 * Sample transcript segments to fit within token limits
 * Takes evenly distributed samples across the video duration
 */
function sampleTranscript(segments: TranscriptSegment[]): TranscriptSegment[] {
  const formatted = formatTranscriptForAI(segments);
  
  // If transcript is within limits, return all segments
  if (formatted.length <= MAX_TRANSCRIPT_CHARS) {
    return segments;
  }

  // Calculate sampling ratio
  const ratio = MAX_TRANSCRIPT_CHARS / formatted.length;
  const sampleSize = Math.floor(segments.length * ratio);
  
  // Take evenly distributed samples
  const step = segments.length / sampleSize;
  const sampled: TranscriptSegment[] = [];
  
  for (let i = 0; i < sampleSize; i++) {
    const index = Math.floor(i * step);
    sampled.push(segments[index]);
  }
  
  return sampled;
}

const SYSTEM_PROMPT = `Você é um assistente especializado em análise de conteúdo de vídeo.
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
}`;

export async function generateTimestampsWithAI(
  transcript: Transcript,
  minSegmentDuration: number = 30,
  apiKey: string
): Promise<{ timestamps: TimestampCandidate[] }> {
  const client = new OpenAI({ apiKey });

  // Sample transcript if too long (for videos >45 minutes)
  const sampledSegments = sampleTranscript(transcript.segments);
  const isSampled = sampledSegments.length < transcript.segments.length;

  // Format transcript for AI
  const transcriptText = formatTranscriptForAI(sampledSegments);

  // Calculate total duration
  const lastSegment = transcript.segments[transcript.segments.length - 1];
  const totalDuration = lastSegment
    ? lastSegment.offset + lastSegment.duration
    : 0;

  // Create user prompt
  const samplingNote = isSampled 
    ? `\nNOTA: Esta é uma amostragem representativa de ${sampledSegments.length} de ${transcript.segments.length} segmentos devido ao tamanho do vídeo.`
    : '';

  const userPrompt = `Analise a seguinte transcrição e identifique mudanças de tópico:

TRANSCRIÇÃO:
${transcriptText}

CONTEXTO DO VÍDEO:
- Duração total: ${Math.floor(totalDuration)} segundos (${Math.floor(totalDuration / 60)} minutos)
- Idioma: ${transcript.language}
- Número de segmentos: ${transcript.segments.length}
- Duração mínima entre timestamps: ${minSegmentDuration} segundos${samplingNote}

Gere timestamps para as principais mudanças de tópico.`;

  // Call OpenAI
  try {
    const response = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.3,
    });

    // Parse response
    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('Resposta vazia da IA');
    }

    const result = JSON.parse(content) as { timestamps: TimestampCandidate[] };
    return result;
  } catch (error: any) {
    // Parse and throw specific OpenAI errors
    throw parseOpenAIError(error);
  }
}
