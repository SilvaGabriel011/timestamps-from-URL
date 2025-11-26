# Timestamp Handling Specification

This document describes how timestamps are represented, processed, and validated in the YouTube Timestamp Generator.

## Time Representation

### Canonical Unit: Seconds

All time values in this application use **seconds** as the canonical internal unit. Times are stored as floating-point numbers to preserve precision during processing.

### Source Conversions

| Source | Original Unit | Conversion |
|--------|---------------|------------|
| YouTube Transcript API | Milliseconds | `offset / 1000` |
| Whisper API | Seconds | Direct use |
| User Input | Seconds | Direct use |

### Display Format

For display and YouTube chapter output, times are formatted as:
- **MM:SS** for times under 1 hour (e.g., `5:30`, `45:00`)
- **HH:MM:SS** for times 1 hour or longer (e.g., `1:05:30`, `2:00:00`)

Times are always **floored** to the nearest second before formatting to ensure consistency.

## Validation Rules

### Confidence Threshold

Timestamps must have a confidence score of at least **0.7** (70%) to be accepted. This threshold is configurable via `VALIDATION_CONFIG.DEFAULT_MIN_CONFIDENCE`.

### Time Bounds

Timestamps must be within the video duration, with a **10% tolerance** for rounding errors:
- Minimum: 0 seconds
- Maximum: `totalDuration * 1.1`

### Minimum Spacing

Consecutive timestamps must be at least **30 seconds** apart by default. This is configurable via the `min_segment_duration` request parameter.

### Title Validation

Timestamps must have a non-empty title after trimming whitespace.

## Intro Timestamp Injection

### Automatic Intro

If the first validated timestamp is more than **10 seconds** into the video, an intro timestamp is automatically added at `0:00`.

### Language-Aware Titles

Intro titles are localized based on the transcript language:

| Language | Intro Title |
|----------|-------------|
| Portuguese (pt) | Introdução |
| English (en) | Introduction |
| Spanish (es) | Introducción |
| French (fr) | Introduction |
| German (de) | Einführung |
| Italian (it) | Introduzione |
| Other | Intro |

### Fallback Behavior

If AI fails to generate any valid timestamps, a fallback intro is added with a more descriptive title (e.g., "Introdução ao conteúdo" in Portuguese).

## Configuration Constants

All validation constants are centralized in `backend/src/validation-config.ts`:

```typescript
VALIDATION_CONFIG = {
  DEFAULT_MIN_CONFIDENCE: 0.7,
  DEFAULT_MIN_SEGMENT_DURATION: 30,
  INTRO_TIMESTAMP_THRESHOLD: 10,
  MAX_VIDEO_DURATION: 10800, // 3 hours
  DURATION_TOLERANCE_FACTOR: 1.1,
  FALLBACK_SECONDS_PER_SEGMENT: 10,
}
```

## Time Utilities

Centralized time utilities are in `backend/src/time-utils.ts`:

- `msToSeconds(ms)` - Convert milliseconds to seconds
- `formatTimestamp(seconds)` - Format seconds as MM:SS or HH:MM:SS
- `calculateTotalDuration(segments)` - Calculate total duration from transcript segments
- `isValidTime(time)` - Check if a time value is valid (finite and non-negative)
- `clampTimestamp(time, maxDuration)` - Clamp time to valid bounds

## AI Response Validation

AI-generated timestamps undergo schema validation in `backend/src/ai-response-validator.ts`:

1. **JSON Parsing** - Verify response is valid JSON
2. **Structure Validation** - Ensure `timestamps` array exists
3. **Field Validation** - Each timestamp must have:
   - `time`: finite, non-negative number
   - `title`: non-empty string
   - `confidence`: number between 0 and 1
   - `evidence`: string (optional, defaults to empty)
4. **Normalization** - Clamp values to valid ranges, sort by time

## Frontend Consistency

The frontend (`frontend/src/components/TimestampList.tsx`) uses the same formatting logic as the backend. The `formatTime()` function must match `backend/src/time-utils.ts formatTimestamp()`.

## Logging and Observability

The validator logs detailed statistics for each request:
- Total candidates from AI
- Number validated
- Rejections by category (confidence, bounds, spacing, empty title)
- Whether an intro was added

Example log output:
```
[Validator] Validation complete:
[Validator]   - Total candidates: 15
[Validator]   - Validated: 12
[Validator]   - Rejected by confidence: 1
[Validator]   - Rejected by bounds: 0
[Validator]   - Rejected by spacing: 2
[Validator]   - Rejected by empty title: 0
```
