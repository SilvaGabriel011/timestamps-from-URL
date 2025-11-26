/**
 * Centralized configuration for timestamp validation.
 * All validation constants and thresholds are defined here for consistency.
 */

/**
 * Validation configuration constants.
 * These values control how timestamps are validated and filtered.
 */
export const VALIDATION_CONFIG = {
  /**
   * Minimum confidence score (0.0 to 1.0) for a timestamp to be accepted.
   * Timestamps with confidence below this threshold are rejected.
   */
  DEFAULT_MIN_CONFIDENCE: 0.7,

  /**
   * Default minimum duration in seconds between consecutive timestamps.
   * This prevents timestamps from being too close together.
   */
  DEFAULT_MIN_SEGMENT_DURATION: 30,

  /**
   * Threshold in seconds for adding an intro timestamp.
   * If the first validated timestamp is after this time, an intro is added at 0:00.
   */
  INTRO_TIMESTAMP_THRESHOLD: 10,

  /**
   * Maximum video duration in seconds (3 hours).
   * Videos longer than this are capped for validation purposes.
   */
  MAX_VIDEO_DURATION: 10800,

  /**
   * Tolerance factor for timestamp bounds validation.
   * Timestamps up to (duration * this factor) are accepted to handle rounding errors.
   */
  DURATION_TOLERANCE_FACTOR: 1.1,

  /**
   * Fallback duration estimate per segment when actual duration is unavailable.
   * Used when transcript segments don't have proper duration information.
   */
  FALLBACK_SECONDS_PER_SEGMENT: 10,
} as const;

/**
 * Default intro titles by language.
 * Used when an intro timestamp needs to be added at 0:00.
 */
export const DEFAULT_INTRO_TITLES: Record<string, string> = {
  pt: 'Introdução',
  en: 'Introduction',
  es: 'Introducción',
  fr: 'Introduction',
  de: 'Einführung',
  it: 'Introduzione',
  default: 'Intro',
};

/**
 * Default fallback intro title when no timestamps are generated.
 * Used as a last resort when AI fails to generate any valid timestamps.
 */
export const DEFAULT_FALLBACK_TITLES: Record<string, string> = {
  pt: 'Introdução ao conteúdo',
  en: 'Introduction to content',
  es: 'Introducción al contenido',
  fr: 'Introduction au contenu',
  de: 'Einführung zum Inhalt',
  it: 'Introduzione al contenuto',
  default: 'Content introduction',
};

/**
 * Get the appropriate intro title for a given language.
 * Falls back to 'default' if the language is not supported.
 * 
 * @param language - Language code (e.g., 'pt', 'en', 'es')
 * @returns Localized intro title
 */
export function getIntroTitle(language: string): string {
  return DEFAULT_INTRO_TITLES[language] || DEFAULT_INTRO_TITLES.default;
}

/**
 * Get the appropriate fallback title for a given language.
 * Used when AI fails to generate any valid timestamps.
 * 
 * @param language - Language code (e.g., 'pt', 'en', 'es')
 * @returns Localized fallback title
 */
export function getFallbackTitle(language: string): string {
  return DEFAULT_FALLBACK_TITLES[language] || DEFAULT_FALLBACK_TITLES.default;
}

/**
 * Validation rejection reasons for logging and debugging.
 */
export enum RejectionReason {
  LOW_CONFIDENCE = 'LOW_CONFIDENCE',
  OUT_OF_BOUNDS = 'OUT_OF_BOUNDS',
  TOO_CLOSE = 'TOO_CLOSE',
  EMPTY_TITLE = 'EMPTY_TITLE',
  INVALID_TIME = 'INVALID_TIME',
}

/**
 * Statistics for validation results.
 * Used for logging and debugging timestamp generation.
 */
export interface ValidationStats {
  totalCandidates: number;
  validatedCount: number;
  rejectedByConfidence: number;
  rejectedByBounds: number;
  rejectedBySpacing: number;
  rejectedByEmptyTitle: number;
  rejectedByInvalidTime: number;
  introAdded: boolean;
}

/**
 * Create an empty validation stats object.
 * @returns Initial validation stats with all counts at zero
 */
export function createValidationStats(): ValidationStats {
  return {
    totalCandidates: 0,
    validatedCount: 0,
    rejectedByConfidence: 0,
    rejectedByBounds: 0,
    rejectedBySpacing: 0,
    rejectedByEmptyTitle: 0,
    rejectedByInvalidTime: 0,
    introAdded: false,
  };
}
