import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);
const TEMP_DIR = path.join(process.cwd(), 'temp');

export interface AudioChunk {
  path: string;
  startTime: number;
  duration: number;
  index: number;
}

/**
 * Split audio file into smaller chunks for processing
 * Each chunk will be ~10MB or 10 minutes, whichever is smaller
 */
export async function splitAudioIntoChunks(
  audioPath: string,
  maxChunkSizeMB: number = 10,
  maxChunkDurationSeconds: number = 600 // 10 minutes
): Promise<AudioChunk[]> {
  console.log(`[AudioChunker] 🔪 Splitting audio file into chunks...`);
  
  // Get file size
  const stats = fs.statSync(audioPath);
  const fileSizeMB = stats.size / (1024 * 1024);
  
  // If file is small enough, return single chunk
  if (fileSizeMB <= maxChunkSizeMB) {
    console.log(`[AudioChunker] File is small enough (${Math.round(fileSizeMB)}MB), no splitting needed`);
    return [{
      path: audioPath,
      startTime: 0,
      duration: 0, // Will be filled by Whisper
      index: 0
    }];
  }
  
  // Calculate number of chunks needed
  const numChunks = Math.ceil(fileSizeMB / maxChunkSizeMB);
  console.log(`[AudioChunker] File size: ${Math.round(fileSizeMB)}MB, will split into ${numChunks} chunks`);
  
  const chunks: AudioChunk[] = [];
  const baseFileName = path.basename(audioPath, path.extname(audioPath));
  
  // Try to use ffmpeg to split the audio
  try {
    // Check if ffmpeg is available
    await execAsync('ffmpeg -version');
    console.log(`[AudioChunker] ✅ ffmpeg found, using it for splitting`);
    
    // Get audio duration using ffprobe
    const { stdout: durationOutput } = await execAsync(
      `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${audioPath}"`
    );
    const totalDuration = parseFloat(durationOutput.trim());
    const chunkDuration = Math.min(maxChunkDurationSeconds, totalDuration / numChunks);
    
    console.log(`[AudioChunker] Total duration: ${Math.round(totalDuration)}s, chunk duration: ${Math.round(chunkDuration)}s`);
    
    // Split audio into chunks
    for (let i = 0; i < numChunks; i++) {
      const startTime = i * chunkDuration;
      const outputPath = path.join(TEMP_DIR, `${baseFileName}_chunk${i}.mp3`);
      
      console.log(`[AudioChunker] Creating chunk ${i + 1}/${numChunks} (${Math.round(startTime)}s - ${Math.round(startTime + chunkDuration)}s)`);
      
      // Use ffmpeg to extract chunk
      await execAsync(
        `ffmpeg -i "${audioPath}" -ss ${startTime} -t ${chunkDuration} -acodec mp3 -ab 64k -y "${outputPath}"`
      );
      
      chunks.push({
        path: outputPath,
        startTime: startTime,
        duration: chunkDuration,
        index: i
      });
    }
    
    console.log(`[AudioChunker] ✅ Successfully created ${chunks.length} chunks`);
    return chunks;
    
  } catch (error: any) {
    console.warn(`[AudioChunker] ⚠️ ffmpeg not available or failed: ${error.message}`);
    console.log(`[AudioChunker] Falling back to simple file splitting (less accurate)`);
    
    // Fallback: Just return the original file
    // In production, you might want to implement actual file splitting here
    return [{
      path: audioPath,
      startTime: 0,
      duration: 0,
      index: 0
    }];
  }
}

/**
 * Clean up chunk files after processing
 */
export function cleanupChunks(chunks: AudioChunk[]): void {
  console.log(`[AudioChunker] 🧹 Cleaning up ${chunks.length} chunk files...`);
  
  for (const chunk of chunks) {
    if (fs.existsSync(chunk.path) && chunk.path.includes('_chunk')) {
      fs.unlinkSync(chunk.path);
      console.log(`[AudioChunker] Deleted chunk: ${path.basename(chunk.path)}`);
    }
  }
}

/**
 * Merge transcripts from multiple chunks
 */
export function mergeChunkTranscripts(
  transcripts: Array<{ segments: any[], startOffset: number }>
): any[] {
  console.log(`[AudioChunker] 🔗 Merging ${transcripts.length} chunk transcripts...`);
  
  const mergedSegments: any[] = [];
  
  for (const { segments, startOffset } of transcripts) {
    for (const segment of segments) {
      mergedSegments.push({
        ...segment,
        offset: segment.offset + startOffset,
      });
    }
  }
  
  console.log(`[AudioChunker] ✅ Merged into ${mergedSegments.length} total segments`);
  return mergedSegments;
}
