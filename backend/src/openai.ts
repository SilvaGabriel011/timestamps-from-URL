import OpenAI from 'openai';
import type { Transcript, TimestampCandidate, TranscriptSegment } from './types';
import { formatTranscriptForAI } from './youtube';
import { parseOpenAIError } from './errors';
import { calculateTotalDuration, SECONDS_PER_MINUTE } from './time-utils';
import { VALIDATION_CONFIG } from './validation-config';
import { validateAIResponse, normalizeTimestamps, logValidationResult } from './ai-response-validator';

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

const SYSTEM_PROMPT = `Você é um especialista em análise de conteúdo educacional e técnico.
Sua tarefa é identificar as MUDANÇAS DE CONTEXTO e TRANSIÇÕES DE CONTEÚDO em vídeos.

REGRAS FUNDAMENTAIS:
1. ENTENDA o tema principal pelo título e conteúdo inicial
2. IDENTIFIQUE quando o apresentador muda de tópico:
   - Frases como "agora vamos falar sobre", "próximo ponto", "outro aspecto"
   - Mudanças no tom ou ritmo da apresentação
   - Início de novos exemplos ou demonstrações
   - Transições entre teoria e prática
3. CUBRA o vídeo TODO de forma proporcional:
   - Para 40 minutos: 12-20 timestamps
   - Para 20 minutos: 8-12 timestamps
   - Para 10 minutos: 5-8 timestamps

REGRAS DE ESPAÇAMENTO:
1. Mínimo 30 segundos entre timestamps próximos
2. Idealmente 2-4 minutos entre timestamps principais
3. Distribua os timestamps ao longo de TODO o vídeo
4. NÃO concentre timestamps apenas no início
5. Garanta que o último terço do vídeo tenha timestamps

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
  apiKey: string,
  videoTitle?: string
): Promise<{ timestamps: TimestampCandidate[] }> {
  // Guard against empty transcripts - don't send to AI if there's no content
  if (!transcript.segments || transcript.segments.length === 0) {
    console.warn('[OpenAI] Received empty transcript, skipping AI generation');
    return { timestamps: [] };
  }

  const client = new OpenAI({ apiKey });

  // Sample transcript if too long (for videos >45 minutes)
  const sampledSegments = sampleTranscript(transcript.segments);
  const isSampled = sampledSegments.length < transcript.segments.length;

  console.log(`[OpenAI] Processing transcript with ${transcript.segments.length} segments`);
  console.log(`[OpenAI] Video title: "${videoTitle || 'Not provided'}"`);
  console.log(`[OpenAI] After sampling: ${sampledSegments.length} segments`);
  
  // Format transcript for AI
  const transcriptText = formatTranscriptForAI(sampledSegments);
  console.log(`[OpenAI] Transcript text length: ${transcriptText.length} characters`);
  console.log(`[OpenAI] First 500 chars:`, transcriptText.substring(0, 500));

  // Calculate total duration using centralized utility
  const totalDuration = calculateTotalDuration(transcript.segments);

  // Create user prompt
  const samplingNote = isSampled 
    ? `\nNOTA: Esta é uma amostragem representativa de ${sampledSegments.length} de ${transcript.segments.length} segmentos devido ao tamanho do vídeo.`
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
  
  const userPrompt = `Analise o vídeo e gere timestamps organizados:

TÍTULO DO VÍDEO: "${videoTitle || 'Vídeo sem título'}"

TRANSCRIÇÃO:
${transcriptText}

CONTEXTO:
- Duração total: ${Math.floor(totalDuration)} segundos (${durationMinutes} minutos)
- Idioma: ${transcript.language}
- Espaçamento mínimo: ${minSegmentDuration} segundos
- GERE EXATAMENTE: ${recommendedTimestamps} timestamps${samplingNote}

INSTRUÇÕES OBRIGATÓRIAS:
1. DISTRIBUA os timestamps uniformemente do início (0:00) até o final (${Math.floor(totalDuration/60)}:00)
2. Use timestamps em SEGUNDOS, não em minutos
3. O PRIMEIRO timestamp deve ser em time: 0
4. O ÚLTIMO timestamp deve estar entre ${Math.floor(totalDuration * 0.85)} e ${totalDuration} segundos
5. ESPAÇAMENTO médio entre timestamps: ${Math.floor(totalDuration / recommendedTimestamps)} segundos
6. Identifique mudanças de contexto REAIS na transcrição
7. Não agrupe timestamps no início - distribua por TODO o vídeo`;

  // Call OpenAI
  try {
    console.log(`[OpenAI] Sending to GPT-4o-mini for timestamp generation...`);
    const response = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.3,
    });
    console.log(`[OpenAI] Received response from GPT-4o-mini`);

    // Parse and validate response using AI response validator
    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('Resposta vazia da IA');
    }

    // Validate AI response structure and normalize timestamps
    const validationResult = validateAIResponse(content);
    logValidationResult(validationResult);

    if (!validationResult.success) {
      console.error('[OpenAI] AI response validation failed');
      return { timestamps: [] };
    }

    // Normalize timestamps (clamp to valid range, sort by time)
    const normalizedTimestamps = normalizeTimestamps(
      validationResult.timestamps,
      totalDuration * VALIDATION_CONFIG.DURATION_TOLERANCE_FACTOR
    );

    console.log(`[OpenAI] Generated ${normalizedTimestamps.length} timestamp candidates`);
    if (normalizedTimestamps.length > 0) {
      console.log(`[OpenAI] First timestamp:`, normalizedTimestamps[0]);
    }
    return { timestamps: normalizedTimestamps };
  } catch (error: any) {
    // Parse and throw specific OpenAI errors
    throw parseOpenAIError(error);
  }
}
