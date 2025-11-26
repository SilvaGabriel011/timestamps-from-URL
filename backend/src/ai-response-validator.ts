/**
 * AI Response Validator
 * Validates and normalizes AI-generated timestamp responses before processing.
 * Uses manual type guards instead of external schema validation libraries.
 */

import type { TimestampCandidate } from './types';
import { isValidTime } from './time-utils';

/**
 * Raw timestamp data from AI response (before validation).
 */
interface RawTimestamp {
  time?: unknown;
  title?: unknown;
  confidence?: unknown;
  evidence?: unknown;
}

/**
 * Raw AI response structure.
 */
interface RawAIResponse {
  timestamps?: unknown;
}

/**
 * Validation result with detailed error information.
 */
export interface AIValidationResult {
  success: boolean;
  timestamps: TimestampCandidate[];
  errors: string[];
  warnings: string[];
}

/**
 * Check if a value is a valid number within expected bounds.
 */
function isValidNumber(value: unknown, min?: number, max?: number): value is number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return false;
  }
  if (min !== undefined && value < min) return false;
  if (max !== undefined && value > max) return false;
  return true;
}

/**
 * Check if a value is a non-empty string.
 */
function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

/**
 * Validate and normalize a single timestamp candidate.
 * Returns null if the timestamp is invalid.
 */
function validateTimestampCandidate(
  raw: RawTimestamp,
  index: number,
  warnings: string[]
): TimestampCandidate | null {
  // Validate time
  if (!isValidNumber(raw.time, 0)) {
    warnings.push(`Timestamp ${index}: Invalid or missing time value: ${raw.time}`);
    return null;
  }

  // Validate title
  if (!isNonEmptyString(raw.title)) {
    warnings.push(`Timestamp ${index}: Invalid or empty title`);
    return null;
  }

  // Validate confidence (default to 0.8 if missing or invalid)
  let confidence = 0.8;
  if (isValidNumber(raw.confidence, 0, 1)) {
    confidence = raw.confidence;
  } else if (raw.confidence !== undefined) {
    warnings.push(`Timestamp ${index}: Invalid confidence value ${raw.confidence}, using default 0.8`);
  }

  // Validate evidence (default to empty string if missing)
  let evidence = '';
  if (typeof raw.evidence === 'string') {
    evidence = raw.evidence;
  } else if (raw.evidence !== undefined) {
    warnings.push(`Timestamp ${index}: Invalid evidence value, using empty string`);
  }

  return {
    time: raw.time,
    title: raw.title.trim(),
    confidence,
    evidence,
  };
}

/**
 * Parse and validate AI response JSON content.
 * Returns validated timestamps with detailed error/warning information.
 * 
 * @param content - Raw JSON string from AI response
 * @returns Validation result with timestamps and any errors/warnings
 */
export function validateAIResponse(content: string): AIValidationResult {
  const result: AIValidationResult = {
    success: false,
    timestamps: [],
    errors: [],
    warnings: [],
  };

  // Parse JSON
  let parsed: RawAIResponse;
  try {
    parsed = JSON.parse(content);
  } catch (error) {
    result.errors.push(`Failed to parse AI response as JSON: ${error}`);
    return result;
  }

  // Validate timestamps array exists
  if (!parsed.timestamps) {
    result.errors.push('AI response missing "timestamps" field');
    return result;
  }

  if (!Array.isArray(parsed.timestamps)) {
    result.errors.push('AI response "timestamps" field is not an array');
    return result;
  }

  // Validate each timestamp
  for (let i = 0; i < parsed.timestamps.length; i++) {
    const raw = parsed.timestamps[i] as RawTimestamp;
    
    if (typeof raw !== 'object' || raw === null) {
      result.warnings.push(`Timestamp ${i}: Invalid timestamp object, skipping`);
      continue;
    }

    const validated = validateTimestampCandidate(raw, i, result.warnings);
    if (validated) {
      result.timestamps.push(validated);
    }
  }

  // Check if we have any valid timestamps
  if (result.timestamps.length === 0 && parsed.timestamps.length > 0) {
    result.errors.push(`All ${parsed.timestamps.length} timestamps were invalid`);
    return result;
  }

  result.success = true;
  return result;
}

/**
 * Normalize timestamps after validation.
 * Ensures all time values are valid and within reasonable bounds.
 * 
 * @param timestamps - Array of validated timestamps
 * @param maxDuration - Maximum video duration for bounds checking
 * @returns Normalized timestamps
 */
export function normalizeTimestamps(
  timestamps: TimestampCandidate[],
  maxDuration: number
): TimestampCandidate[] {
  return timestamps
    .filter(ts => isValidTime(ts.time))
    .map(ts => ({
      ...ts,
      // Clamp time to valid range
      time: Math.max(0, Math.min(ts.time, maxDuration)),
      // Ensure title is trimmed
      title: ts.title.trim(),
      // Clamp confidence to valid range
      confidence: Math.max(0, Math.min(1, ts.confidence)),
    }))
    .sort((a, b) => a.time - b.time);
}

/**
 * Log validation results for debugging.
 */
export function logValidationResult(result: AIValidationResult): void {
  if (result.errors.length > 0) {
    console.error('[AI Validator] Errors:', result.errors);
  }
  if (result.warnings.length > 0) {
    console.warn('[AI Validator] Warnings:', result.warnings);
  }
  console.log(`[AI Validator] Validated ${result.timestamps.length} timestamps (success: ${result.success})`);
}
