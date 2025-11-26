/**
 * Centralized time utilities for timestamp handling.
 * All time values in this application use seconds as the canonical unit.
 * 
 * Conversion rules:
 * - YouTube API returns milliseconds -> convert to seconds
 * - Whisper API returns seconds -> use directly
 * - Internal storage: floating-point seconds
 * - Display/output: integer seconds (floored)
 */

export const SECONDS_PER_MINUTE = 60;
export const SECONDS_PER_HOUR = 3600;
export const MS_PER_SECOND = 1000;

/**
 * Convert milliseconds to seconds.
 * Used when processing YouTube transcript API responses.
 * @param ms - Time in milliseconds
 * @returns Time in seconds
 */
export function msToSeconds(ms: number): number {
  return ms / MS_PER_SECOND;
}

/**
 * Convert seconds to milliseconds.
 * @param seconds - Time in seconds
 * @returns Time in milliseconds
 */
export function secondsToMs(seconds: number): number {
  return seconds * MS_PER_SECOND;
}

/**
 * Format a timestamp from seconds to human-readable format.
 * Uses MM:SS for times under an hour, HH:MM:SS for longer times.
 * Always floors to the nearest second for display consistency.
 * 
 * @param seconds - Time in seconds (can be floating-point)
 * @returns Formatted timestamp string (e.g., "1:05" or "1:01:05")
 */
export function formatTimestamp(seconds: number): string {
  const totalSeconds = Math.floor(seconds);
  const hours = Math.floor(totalSeconds / SECONDS_PER_HOUR);
  const minutes = Math.floor((totalSeconds % SECONDS_PER_HOUR) / SECONDS_PER_MINUTE);
  const secs = totalSeconds % SECONDS_PER_MINUTE;

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${minutes}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Clamp a timestamp to be within valid bounds.
 * Ensures the timestamp is not negative and not beyond the video duration.
 * 
 * @param time - Time in seconds
 * @param maxDuration - Maximum allowed time (video duration)
 * @returns Clamped time value
 */
export function clampTimestamp(time: number, maxDuration: number): number {
  return Math.max(0, Math.min(time, maxDuration));
}

/**
 * Check if a time value is valid (finite and non-negative).
 * @param time - Time value to validate
 * @returns true if the time is valid
 */
export function isValidTime(time: number): boolean {
  return Number.isFinite(time) && time >= 0;
}

/**
 * Calculate the total duration from transcript segments.
 * @param segments - Array of segments with offset and duration
 * @returns Total duration in seconds
 */
export function calculateTotalDuration(segments: Array<{ offset: number; duration: number }>): number {
  if (segments.length === 0) return 0;
  
  const lastSegment = segments[segments.length - 1];
  return lastSegment.offset + lastSegment.duration;
}

/**
 * Format duration in minutes for display.
 * @param seconds - Duration in seconds
 * @returns Formatted string (e.g., "5 minutes" or "1 hour 30 minutes")
 */
export function formatDurationMinutes(seconds: number): string {
  const totalMinutes = Math.floor(seconds / SECONDS_PER_MINUTE);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours > 0) {
    return minutes > 0 ? `${hours} hour${hours > 1 ? 's' : ''} ${minutes} minute${minutes > 1 ? 's' : ''}` : `${hours} hour${hours > 1 ? 's' : ''}`;
  }
  return `${totalMinutes} minute${totalMinutes !== 1 ? 's' : ''}`;
}
