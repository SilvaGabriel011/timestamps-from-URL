/**
 * Custom error types with specific error codes
 */

export enum ErrorCode {
  // OpenAI API errors
  OPENAI_INVALID_KEY = 'OPENAI_INVALID_KEY',
  OPENAI_QUOTA_EXCEEDED = 'OPENAI_QUOTA_EXCEEDED',
  OPENAI_RATE_LIMIT = 'OPENAI_RATE_LIMIT',
  OPENAI_SERVER_ERROR = 'OPENAI_SERVER_ERROR',
  OPENAI_CONNECTION_ERROR = 'OPENAI_CONNECTION_ERROR',
  
  // YouTube errors
  YOUTUBE_NO_TRANSCRIPT = 'YOUTUBE_NO_TRANSCRIPT',
  YOUTUBE_VIDEO_UNAVAILABLE = 'YOUTUBE_VIDEO_UNAVAILABLE',
  YOUTUBE_PRIVATE_VIDEO = 'YOUTUBE_PRIVATE_VIDEO',
  YOUTUBE_AGE_RESTRICTED = 'YOUTUBE_AGE_RESTRICTED',
  
  // Validation errors
  INVALID_URL = 'INVALID_URL',
  INVALID_VIDEO_ID = 'INVALID_VIDEO_ID',
  MISSING_API_KEY = 'MISSING_API_KEY',
  
  // Processing errors
  TRANSCRIPT_TOO_SHORT = 'TRANSCRIPT_TOO_SHORT',
  AI_PROCESSING_ERROR = 'AI_PROCESSING_ERROR',
  TIMEOUT_ERROR = 'TIMEOUT_ERROR',
  
  // Generic errors
  UNKNOWN_ERROR = 'UNKNOWN_ERROR',
}

export interface ErrorDetails {
  code: ErrorCode;
  message: string;
  userMessage: string;
  suggestions: string[];
  httpStatus: number;
}

export class AppError extends Error {
  public readonly code: ErrorCode;
  public readonly userMessage: string;
  public readonly suggestions: string[];
  public readonly httpStatus: number;
  public readonly originalError?: Error;

  constructor(details: ErrorDetails, originalError?: Error) {
    super(details.message);
    this.name = 'AppError';
    this.code = details.code;
    this.userMessage = details.userMessage;
    this.suggestions = details.suggestions;
    this.httpStatus = details.httpStatus;
    this.originalError = originalError;

    // Maintains proper stack trace for where our error was thrown
    Error.captureStackTrace(this, this.constructor);
  }

  toJSON() {
    return {
      error: {
        code: this.code,
        message: this.userMessage,
        suggestions: this.suggestions,
      },
    };
  }
}

/**
 * Error factory functions for common error scenarios
 */

export function createOpenAIInvalidKeyError(): AppError {
  return new AppError({
    code: ErrorCode.OPENAI_INVALID_KEY,
    message: 'OpenAI API key is invalid',
    userMessage: 'Chave da API OpenAI inválida ou expirada',
    suggestions: [
      'Verifique se a chave da API está correta no arquivo .env',
      'Acesse https://platform.openai.com/api-keys para verificar sua chave',
      'Certifique-se de que copiou a chave completa sem espaços',
      'Verifique se a chave não expirou',
    ],
    httpStatus: 401,
  });
}

export function createOpenAIQuotaError(): AppError {
  return new AppError({
    code: ErrorCode.OPENAI_QUOTA_EXCEEDED,
    message: 'OpenAI API quota exceeded',
    userMessage: 'Cota da API OpenAI excedida',
    suggestions: [
      'Verifique seu saldo em https://platform.openai.com/account/billing',
      'Adicione créditos à sua conta OpenAI',
      'Aguarde até o próximo ciclo de faturamento',
    ],
    httpStatus: 429,
  });
}

export function createOpenAIRateLimitError(): AppError {
  return new AppError({
    code: ErrorCode.OPENAI_RATE_LIMIT,
    message: 'OpenAI API rate limit exceeded',
    userMessage: 'Limite de requisições da OpenAI excedido',
    suggestions: [
      'Aguarde alguns segundos antes de tentar novamente',
      'Considere fazer upgrade do seu plano OpenAI',
    ],
    httpStatus: 429,
  });
}

export function createYouTubeNoTranscriptError(videoId: string): AppError {
  return new AppError({
    code: ErrorCode.YOUTUBE_NO_TRANSCRIPT,
    message: `No transcript available for video ${videoId}`,
    userMessage: 'Vídeo não possui legendas disponíveis',
    suggestions: [
      'Verifique se o vídeo possui legendas ou closed captions ativadas',
      'O vídeo precisa ter legendas automáticas ou manuais',
      'Vídeos privados ou restritos não têm legendas acessíveis',
      'Tente um vídeo público diferente',
    ],
    httpStatus: 400,
  });
}

export function createYouTubeVideoUnavailableError(): AppError {
  return new AppError({
    code: ErrorCode.YOUTUBE_VIDEO_UNAVAILABLE,
    message: 'YouTube video is unavailable',
    userMessage: 'Vídeo do YouTube indisponível',
    suggestions: [
      'Verifique se o vídeo existe e está público',
      'O vídeo pode ter sido removido ou tornado privado',
      'Verifique se a URL está correta',
    ],
    httpStatus: 404,
  });
}

export function createInvalidVideoIdError(): AppError {
  return new AppError({
    code: ErrorCode.INVALID_VIDEO_ID,
    message: 'Invalid YouTube video ID',
    userMessage: 'URL do YouTube inválida',
    suggestions: [
      'Use URLs no formato: https://www.youtube.com/watch?v=VIDEO_ID',
      'Ou no formato curto: https://youtu.be/VIDEO_ID',
      'Certifique-se de copiar a URL completa do vídeo',
    ],
    httpStatus: 400,
  });
}

export function createMissingAPIKeyError(): AppError {
  return new AppError({
    code: ErrorCode.MISSING_API_KEY,
    message: 'OpenAI API key not configured',
    userMessage: 'Chave da API OpenAI não configurada no servidor',
    suggestions: [
      'Configure a variável OPENAI_API_KEY no arquivo .env do backend',
      'Obtenha uma chave em https://platform.openai.com/api-keys',
      'Reinicie o servidor após configurar a chave',
    ],
    httpStatus: 500,
  });
}

export function createTranscriptTooShortError(): AppError {
  return new AppError({
    code: ErrorCode.TRANSCRIPT_TOO_SHORT,
    message: 'Transcript is too short to generate timestamps',
    userMessage: 'Transcrição muito curta para gerar timestamps',
    suggestions: [
      'O vídeo precisa ter pelo menos 1 minuto de conteúdo',
      'Verifique se as legendas estão completas',
    ],
    httpStatus: 400,
  });
}

/**
 * Parse OpenAI API errors into AppError
 */
export function parseOpenAIError(error: any): AppError {
  const message = error?.message || '';
  const status = error?.status || error?.response?.status || 500;

  // Check for specific OpenAI error types
  if (status === 401 || message.includes('Incorrect API key') || message.includes('invalid_api_key')) {
    return createOpenAIInvalidKeyError();
  }

  if (status === 429) {
    if (message.includes('quota') || message.includes('insufficient_quota')) {
      return createOpenAIQuotaError();
    }
    return createOpenAIRateLimitError();
  }

  if (status >= 500) {
    return new AppError({
      code: ErrorCode.OPENAI_SERVER_ERROR,
      message: 'OpenAI server error',
      userMessage: 'Erro no servidor da OpenAI',
      suggestions: [
        'Tente novamente em alguns momentos',
        'Verifique o status da OpenAI em https://status.openai.com/',
      ],
      httpStatus: 503,
    }, error);
  }

  // Connection errors
  if (message.includes('ECONNREFUSED') || message.includes('ETIMEDOUT') || message.includes('network')) {
    return new AppError({
      code: ErrorCode.OPENAI_CONNECTION_ERROR,
      message: 'Failed to connect to OpenAI',
      userMessage: 'Falha ao conectar com a OpenAI',
      suggestions: [
        'Verifique sua conexão com a internet',
        'Tente novamente em alguns momentos',
      ],
      httpStatus: 503,
    }, error);
  }

  return new AppError({
    code: ErrorCode.AI_PROCESSING_ERROR,
    message: error?.message || 'Unknown AI processing error',
    userMessage: 'Erro ao processar vídeo com IA',
    suggestions: [
      'Tente novamente',
      'Se o erro persistir, tente com um vídeo diferente',
    ],
    httpStatus: 500,
  }, error);
}

/**
 * Parse YouTube transcript errors into AppError
 */
export function parseYouTubeError(error: any, videoId: string): AppError {
  const message = error?.message || '';

  if (message.includes('Could not retrieve') || message.includes('Transcript') || message.includes('subtitles')) {
    return createYouTubeNoTranscriptError(videoId);
  }

  if (message.includes('Video unavailable') || message.includes('not available')) {
    return createYouTubeVideoUnavailableError();
  }

  if (message.includes('private') || message.includes('Private')) {
    return new AppError({
      code: ErrorCode.YOUTUBE_PRIVATE_VIDEO,
      message: 'YouTube video is private',
      userMessage: 'Vídeo privado ou restrito',
      suggestions: [
        'O vídeo precisa ser público para gerar timestamps',
        'Entre em contato com o dono do vídeo para torná-lo público',
      ],
      httpStatus: 403,
    }, error);
  }

  return new AppError({
    code: ErrorCode.YOUTUBE_VIDEO_UNAVAILABLE,
    message: error?.message || 'YouTube error',
    userMessage: 'Erro ao acessar o vídeo do YouTube',
    suggestions: [
      'Verifique se o vídeo existe e está acessível',
      'Tente com outro vídeo',
    ],
    httpStatus: 400,
  }, error);
}
