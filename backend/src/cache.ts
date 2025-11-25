import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { Transcript } from './types';

const CACHE_DIR = path.join(process.cwd(), 'cache');
const CACHE_EXPIRY_HOURS = 24 * 7; // 7 days

// Ensure cache directory exists
if (!fs.existsSync(CACHE_DIR)) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
}

interface CacheEntry {
  transcript: Transcript;
  timestamp: number;
  source: 'youtube' | 'whisper';
  language: string;
}

/**
 * Generate cache key for a video
 */
function getCacheKey(videoId: string, language: string): string {
  const hash = crypto
    .createHash('md5')
    .update(`${videoId}-${language}`)
    .digest('hex');
  return `transcript-${hash}.json`;
}

/**
 * Get cached transcript if exists and not expired
 */
export function getCachedTranscript(
  videoId: string,
  language: string
): { transcript: Transcript; source: string } | null {
  const cacheKey = getCacheKey(videoId, language);
  const cachePath = path.join(CACHE_DIR, cacheKey);

  try {
    if (!fs.existsSync(cachePath)) {
      return null;
    }

    const cacheData = fs.readFileSync(cachePath, 'utf-8');
    const entry: CacheEntry = JSON.parse(cacheData);

    // Check if cache is expired
    const now = Date.now();
    const expiryTime = CACHE_EXPIRY_HOURS * 60 * 60 * 1000;
    
    if (now - entry.timestamp > expiryTime) {
      console.log(`[Cache] Expired cache for video ${videoId}, removing...`);
      fs.unlinkSync(cachePath);
      return null;
    }

    console.log(`[Cache] Hit! Using cached transcript for video ${videoId} (${entry.source})`);
    return {
      transcript: entry.transcript,
      source: entry.source,
    };
  } catch (error) {
    console.error(`[Cache] Error reading cache for ${videoId}:`, error);
    return null;
  }
}

/**
 * Save transcript to cache
 */
export function cacheTranscript(
  videoId: string,
  language: string,
  transcript: Transcript,
  source: 'youtube' | 'whisper'
): void {
  const cacheKey = getCacheKey(videoId, language);
  const cachePath = path.join(CACHE_DIR, cacheKey);

  try {
    const entry: CacheEntry = {
      transcript,
      timestamp: Date.now(),
      source,
      language,
    };

    fs.writeFileSync(cachePath, JSON.stringify(entry, null, 2));
    console.log(`[Cache] Saved transcript for video ${videoId} (${source})`);
  } catch (error) {
    console.error(`[Cache] Error saving transcript for ${videoId}:`, error);
  }
}

/**
 * Delete cache for specific video
 */
export function deleteCacheForVideo(videoId: string, language: string): boolean {
  const cacheKey = getCacheKey(videoId, language);
  const cachePath = path.join(CACHE_DIR, cacheKey);

  try {
    if (fs.existsSync(cachePath)) {
      fs.unlinkSync(cachePath);
      console.log(`[Cache] Deleted cache for video ${videoId}`);
      return true;
    }
    return false;
  } catch (error) {
    console.error(`[Cache] Error deleting cache for ${videoId}:`, error);
    return false;
  }
}

/**
 * Clear old cache entries
 */
export function clearOldCache(): void {
  try {
    const files = fs.readdirSync(CACHE_DIR);
    const now = Date.now();
    const expiryTime = CACHE_EXPIRY_HOURS * 60 * 60 * 1000;
    let removedCount = 0;

    for (const file of files) {
      if (!file.startsWith('transcript-')) continue;
      
      const filePath = path.join(CACHE_DIR, file);
      const stats = fs.statSync(filePath);
      
      if (now - stats.mtimeMs > expiryTime) {
        fs.unlinkSync(filePath);
        removedCount++;
      }
    }

    if (removedCount > 0) {
      console.log(`[Cache] Cleared ${removedCount} old cache entries`);
    }
  } catch (error) {
    console.error('[Cache] Error clearing old cache:', error);
  }
}

/**
 * Get cache statistics
 */
export function getCacheStats(): {
  totalEntries: number;
  totalSize: number;
  oldestEntry: Date | null;
  newestEntry: Date | null;
} {
  try {
    const files = fs.readdirSync(CACHE_DIR);
    let totalSize = 0;
    let oldestTime: number | null = null;
    let newestTime: number | null = null;
    let entryCount = 0;

    for (const file of files) {
      if (!file.startsWith('transcript-')) continue;
      
      const filePath = path.join(CACHE_DIR, file);
      const stats = fs.statSync(filePath);
      
      totalSize += stats.size;
      entryCount++;
      
      if (!oldestTime || stats.mtimeMs < oldestTime) {
        oldestTime = stats.mtimeMs;
      }
      
      if (!newestTime || stats.mtimeMs > newestTime) {
        newestTime = stats.mtimeMs;
      }
    }

    return {
      totalEntries: entryCount,
      totalSize,
      oldestEntry: oldestTime ? new Date(oldestTime) : null,
      newestEntry: newestTime ? new Date(newestTime) : null,
    };
  } catch (error) {
    console.error('[Cache] Error getting cache stats:', error);
    return {
      totalEntries: 0,
      totalSize: 0,
      oldestEntry: null,
      newestEntry: null,
    };
  }
}

// Run cache cleanup periodically (every 6 hours)
setInterval(() => {
  clearOldCache();
}, 6 * 60 * 60 * 1000);
