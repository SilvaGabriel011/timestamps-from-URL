const ytdl = require('@ybd-project/ytdl-core');
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
 * Download audio from YouTube video
 * Returns path to downloaded audio file
 */
export async function downloadYouTubeAudio(
  videoId: string,
  maxDuration: number = 3600 // Max 1 hour by default
): Promise<string> {
  const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
  const outputPath = path.join(TEMP_DIR, `${videoId}_${Date.now()}.mp3`);

  try {
    // Get video info first to check duration
    const info = await ytdl.getInfo(videoUrl);
    const duration = parseInt(info.videoDetails.lengthSeconds);

    if (duration > maxDuration) {
      throw new AppError({
        code: 'VIDEO_TOO_LONG' as any,
        message: `Video is too long: ${duration}s (max: ${maxDuration}s)`,
        userMessage: `Vídeo muito longo: ${Math.floor(duration / 60)} minutos (máximo: ${Math.floor(maxDuration / 60)} minutos)`,
        suggestions: [
          'Use um vídeo mais curto para transcrição com Whisper',
          'Vídeos longos consomem muito tempo e recursos',
        ],
        httpStatus: 400,
      });
    }

    console.log(`[Audio] Downloading audio from video ${videoId} (${duration}s)...`);

    return new Promise((resolve, reject) => {
      const stream = ytdl(videoUrl, {
        quality: 'lowestaudio',
        filter: 'audioonly',
      });

      const writeStream = fs.createWriteStream(outputPath);
      let downloadedBytes = 0;

      stream.on('data', (chunk: any) => {
        downloadedBytes += chunk.length;
        
        // Check size limit
        if (downloadedBytes > MAX_AUDIO_SIZE) {
          stream.destroy();
          writeStream.destroy();
          fs.unlinkSync(outputPath);
          reject(new AppError({
            code: 'AUDIO_TOO_LARGE' as any,
            message: 'Audio file exceeds 25MB limit',
            userMessage: 'Arquivo de áudio excede o limite de 25MB do Whisper',
            suggestions: [
              'Use um vídeo mais curto',
              'O limite da API Whisper é 25MB',
            ],
            httpStatus: 413,
          }));
        }
      });

      stream.on('error', (error: any) => {
        writeStream.destroy();
        if (fs.existsSync(outputPath)) {
          fs.unlinkSync(outputPath);
        }
        reject(new AppError({
          code: 'AUDIO_DOWNLOAD_FAILED' as any,
          message: `Failed to download audio: ${error.message}`,
          userMessage: 'Falha ao baixar áudio do vídeo',
          suggestions: [
            'Verifique se o vídeo está disponível',
            'Verifique sua conexão com a internet',
            'Tente novamente em alguns instantes',
          ],
          httpStatus: 500,
        }));
      });

      stream.pipe(writeStream);

      writeStream.on('finish', () => {
        const stats = fs.statSync(outputPath);
        console.log(`[Audio] Downloaded ${Math.round(stats.size / 1024 / 1024 * 10) / 10}MB audio file`);
        resolve(outputPath);
      });

      writeStream.on('error', (error) => {
        if (fs.existsSync(outputPath)) {
          fs.unlinkSync(outputPath);
        }
        reject(error);
      });
    });
  } catch (error: any) {
    if (fs.existsSync(outputPath)) {
      fs.unlinkSync(outputPath);
    }

    // Handle specific ytdl errors
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

    if (error.message?.includes('age-restricted')) {
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

    throw error;
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
