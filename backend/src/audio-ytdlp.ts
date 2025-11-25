import youtubedl from 'youtube-dl-exec';
import fs from 'fs';
import path from 'path';
import { AppError } from './errors';

const TEMP_DIR = path.join(process.cwd(), 'temp');
const MAX_AUDIO_SIZE = 25 * 1024 * 1024; // 25MB limit for Whisper API

// Ensure temp directory exists
if (!fs.existsSync(TEMP_DIR)) {
  fs.mkdirSync(TEMP_DIR, { recursive: true });
}

/**
 * Calculate optimal bitrate based on video duration to fit within 25MB
 * 25MB = 26,214,400 bytes = 209,715,200 bits
 */
function getBitrateForDuration(durationInSeconds: number): number {
  // Add 10% safety margin
  const maxBits = 209_715_200 * 0.9; // 90% of 25MB in bits
  const bitrate = Math.floor(maxBits / durationInSeconds / 1000); // Convert to kbps
  
  // Minimum 16kbps (below this, quality is unusable)
  // Maximum 64kbps (good enough quality for speech)
  const clampedBitrate = Math.max(16, Math.min(64, bitrate));
  
  console.log(`[Audio-ytdlp] Duration: ${Math.floor(durationInSeconds/60)}min, Using bitrate: ${clampedBitrate}kbps`);
  return clampedBitrate;
}

/**
 * Get video info using yt-dlp
 */
async function getVideoInfo(videoId: string): Promise<any> {
  const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
  
  try {
    console.log(`[Audio-ytdlp] Getting info for video ${videoId}...`);
    
    const output = await youtubedl(videoUrl, {
      dumpJson: true,
      noCheckCertificates: true,
      noWarnings: true,
      preferFreeFormats: true,
      addHeader: ['referer:youtube.com', 'user-agent:Mozilla/5.0']
    });
    
    return output;
  } catch (error: any) {
    console.error(`[Audio-ytdlp] Error getting video info:`, error.message);
    throw error;
  }
}

/**
 * Download audio from YouTube video using yt-dlp
 * Returns path to downloaded audio file
 */
export async function downloadYouTubeAudio(
  videoId: string,
  maxDuration: number = 10800 // Max 3 hours by default
): Promise<string> {
  const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
  const outputPath = path.join(TEMP_DIR, `${videoId}_${Date.now()}.mp3`);

  try {
    // Get video info first to check duration
    console.log(`[Audio-ytdlp] Getting video info for ${videoId}...`);
    const info = await getVideoInfo(videoId);
    
    const duration = info.duration || 0;
    const title = info.title || 'Unknown';
    
    console.log(`[Audio-ytdlp] Video: "${title}" (${duration}s)`);

    if (duration > maxDuration) {
      throw new AppError({
        code: 'VIDEO_TOO_LONG' as any,
        message: `Video is too long: ${duration}s (max: ${maxDuration}s)`,
        userMessage: `Vídeo muito longo: ${Math.floor(duration / 60)} minutos (máximo: ${Math.floor(maxDuration / 60)} minutos)`,
        suggestions: [
          'Use um vídeo mais curto para transcrição com Whisper',
          'O limite máximo é de 3 horas',
          'Vídeos muito longos podem demorar bastante para processar',
        ],
        httpStatus: 400,
      });
    }

    console.log(`[Audio-ytdlp] Downloading audio from video ${videoId} (${Math.floor(duration/60)} minutes)...`);
    console.log(`[Audio-ytdlp] Output path: ${outputPath}`);
    
    // Download audio using yt-dlp
    try {
      await youtubedl(videoUrl, {
        extractAudio: true,
        audioFormat: 'mp3',
        audioQuality: 9, // Lower quality (0=best, 9=worst) to reduce file size
        output: outputPath.replace('.mp3', '.%(ext)s'), // Let yt-dlp decide extension
        noCheckCertificates: true,
        noWarnings: true,
        preferFreeFormats: true,
        addHeader: ['referer:youtube.com', 'user-agent:Mozilla/5.0'],
        noPlaylist: true,
        verbose: true, // Enable verbose logging
        postprocessorArgs: `ffmpeg:-b:a ${getBitrateForDuration(duration)}k`, // Dynamic bitrate based on duration
      });
    } catch (execError: any) {
      console.error(`[Audio-ytdlp] yt-dlp execution error:`, execError);
      throw execError;
    }

    // Check if file was created (may have different extension)
    const possibleFiles = [
      outputPath,
      outputPath.replace('.mp3', '.m4a'),
      outputPath.replace('.mp3', '.opus'),
      outputPath.replace('.mp3', '.webm'),
    ];
    
    let actualPath: string | null = null;
    for (const file of possibleFiles) {
      if (fs.existsSync(file)) {
        actualPath = file;
        break;
      }
    }
    
    if (!actualPath) {
      // List files in temp dir for debugging
      const tempFiles = fs.readdirSync(TEMP_DIR);
      console.error(`[Audio-ytdlp] Files in temp dir:`, tempFiles);
      throw new Error(`Audio file was not created. Expected: ${path.basename(outputPath)}`);
    }
    
    // Rename to mp3 if different
    if (actualPath !== outputPath) {
      console.log(`[Audio-ytdlp] Renaming ${actualPath} to ${outputPath}`);
      fs.renameSync(actualPath, outputPath);
    }

    const stats = fs.statSync(outputPath);
    console.log(`[Audio-ytdlp] Downloaded ${Math.round(stats.size / 1024 / 1024 * 10) / 10}MB audio file`);

    if (stats.size > MAX_AUDIO_SIZE) {
      fs.unlinkSync(outputPath);
      throw new AppError({
        code: 'AUDIO_TOO_LARGE' as any,
        message: 'Audio file exceeds 25MB limit',
        userMessage: 'Arquivo de áudio muito grande (limite: 25MB)',
        suggestions: [
          'Use um vídeo mais curto',
          'O limite da API Whisper é 25MB',
        ],
        httpStatus: 413,
      });
    }

    return outputPath;
  } catch (error: any) {
    // Clean up if file exists
    if (fs.existsSync(outputPath)) {
      fs.unlinkSync(outputPath);
    }

    // Handle specific errors
    if (error instanceof AppError) {
      throw error;
    }

    if (error.message?.includes('Video unavailable')) {
      throw new AppError({
        code: 'VIDEO_UNAVAILABLE' as any,
        message: 'Video is unavailable',
        userMessage: 'Vídeo não disponível',
        suggestions: [
          'Verifique se o vídeo existe e está público',
          'O vídeo pode ter sido removido ou tornado privado',
        ],
        httpStatus: 404,
      });
    }

    if (error.message?.includes('age')) {
      throw new AppError({
        code: 'VIDEO_AGE_RESTRICTED' as any,
        message: 'Video is age-restricted',
        userMessage: 'Vídeo tem restrição de idade',
        suggestions: [
          'Vídeos com restrição de idade não podem ser processados',
          'Use um vídeo sem restrições',
        ],
        httpStatus: 403,
      });
    }

    if (error.message?.includes('private')) {
      throw new AppError({
        code: 'VIDEO_PRIVATE' as any,
        message: 'Video is private',
        userMessage: 'Vídeo é privado',
        suggestions: [
          'Vídeos privados não podem ser processados',
          'Use um vídeo público',
        ],
        httpStatus: 403,
      });
    }

    // Generic error
    console.error(`[Audio-ytdlp] Download failed:`, error);
    throw new AppError({
      code: 'AUDIO_DOWNLOAD_FAILED' as any,
      message: `Failed to download audio: ${error.message}`,
      userMessage: 'Falha ao baixar áudio do vídeo',
      suggestions: [
        'Verifique se o vídeo está disponível',
        'Verifique sua conexão com a internet',
        'Tente novamente em alguns instantes',
      ],
      httpStatus: 500,
    });
  }
}

/**
 * Clean up old temporary files
 */
export function cleanupTempFiles(olderThanMinutes: number = 60): void {
  if (!fs.existsSync(TEMP_DIR)) return;

  const now = Date.now();
  const maxAge = olderThanMinutes * 60 * 1000;

  const files = fs.readdirSync(TEMP_DIR);
  for (const file of files) {
    const filePath = path.join(TEMP_DIR, file);
    const stats = fs.statSync(filePath);
    
    if (now - stats.mtimeMs > maxAge) {
      fs.unlinkSync(filePath);
      console.log(`[Cleanup] Removed old temp file: ${file}`);
    }
  }
}

// Run cleanup periodically
setInterval(() => {
  cleanupTempFiles();
}, 30 * 60 * 1000); // Every 30 minutes
