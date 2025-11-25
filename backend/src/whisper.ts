import OpenAI from 'openai';
import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { Transcript, TranscriptSegment } from './types';
import { AppError } from './errors';
import { downloadYouTubeAudio } from './audio-ytdlp';
import { getCachedTranscript, cacheTranscript } from './cache';

const TEMP_DIR = path.join(process.cwd(), 'temp');

// Whisper API limit is 25MB, we use 24MB as safe threshold
const MAX_CHUNK_SIZE = 24 * 1024 * 1024;

// Chunk duration in seconds (10 minutes = 600 seconds)
// This ensures each chunk stays well under 25MB even with variable bitrate
const CHUNK_DURATION_SECONDS = 600;

// Ensure temp directory exists
if (!fs.existsSync(TEMP_DIR)) {
  fs.mkdirSync(TEMP_DIR, { recursive: true });
}

interface AudioChunk {
  path: string;
  startOffset: number;
  index: number;
}

/**
 * Get audio duration using ffprobe
 */
async function getAudioDuration(audioPath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const ffprobe = spawn('ffprobe', [
      '-v', 'error',
      '-show_entries', 'format=duration',
      '-of', 'default=noprint_wrappers=1:nokey=1',
      audioPath
    ]);

    let output = '';
    let errorOutput = '';

    ffprobe.stdout.on('data', (data) => {
      output += data.toString();
    });

    ffprobe.stderr.on('data', (data) => {
      errorOutput += data.toString();
    });

    ffprobe.on('close', (code) => {
      if (code === 0) {
        const duration = parseFloat(output.trim());
        if (!isNaN(duration)) {
          resolve(duration);
        } else {
          reject(new Error(`Could not parse duration: ${output}`));
        }
      } else {
        reject(new Error(`ffprobe failed: ${errorOutput}`));
      }
    });

    ffprobe.on('error', (err) => {
      reject(new Error(`ffprobe spawn error: ${err.message}`));
    });
  });
}

/**
 * Split audio file into chunks using ffmpeg
 * Each chunk will be approximately CHUNK_DURATION_SECONDS long
 */
async function splitAudioFile(
  inputPath: string,
  videoId: string
): Promise<AudioChunk[]> {
  const stats = fs.statSync(inputPath);
  const fileSizeMB = stats.size / 1024 / 1024;
  
  console.log(`[Whisper-Chunking] 📊 Audio file size: ${fileSizeMB.toFixed(1)}MB`);
  
  // If file is small enough, no need to split
  if (stats.size <= MAX_CHUNK_SIZE) {
    console.log(`[Whisper-Chunking] ✅ File is small enough, no splitting needed`);
    return [{ path: inputPath, startOffset: 0, index: 0 }];
  }

  console.log(`[Whisper-Chunking] 🔪 File exceeds ${MAX_CHUNK_SIZE / 1024 / 1024}MB, splitting into chunks...`);

  // Get audio duration
  const totalDuration = await getAudioDuration(inputPath);
  const numChunks = Math.ceil(totalDuration / CHUNK_DURATION_SECONDS);
  
  console.log(`[Whisper-Chunking] 📏 Total duration: ${Math.floor(totalDuration / 60)} minutes`);
  console.log(`[Whisper-Chunking] 🧩 Will create ${numChunks} chunks of ~${CHUNK_DURATION_SECONDS / 60} minutes each`);

  const chunks: AudioChunk[] = [];
  const timestamp = Date.now();

  for (let i = 0; i < numChunks; i++) {
    const startOffset = i * CHUNK_DURATION_SECONDS;
    const chunkPath = path.join(TEMP_DIR, `${videoId}_${timestamp}_chunk_${i.toString().padStart(3, '0')}.mp3`);
    
    console.log(`[Whisper-Chunking] 🔧 Creating chunk ${i + 1}/${numChunks} starting at ${Math.floor(startOffset / 60)}:${(startOffset % 60).toString().padStart(2, '0')}...`);

    await new Promise<void>((resolve, reject) => {
      const ffmpeg = spawn('ffmpeg', [
        '-i', inputPath,
        '-ss', startOffset.toString(),
        '-t', CHUNK_DURATION_SECONDS.toString(),
        '-acodec', 'libmp3lame',
        '-b:a', '32k',  // Low bitrate for speech (good quality for voice)
        '-ar', '16000', // 16kHz sample rate (sufficient for speech recognition)
        '-ac', '1',     // Mono audio
        '-y',           // Overwrite output file
        chunkPath
      ]);

      let errorOutput = '';

      ffmpeg.stderr.on('data', (data) => {
        errorOutput += data.toString();
      });

      ffmpeg.on('close', (code) => {
        if (code === 0) {
          // Verify chunk was created and has content
          if (fs.existsSync(chunkPath)) {
            const chunkStats = fs.statSync(chunkPath);
            if (chunkStats.size > 0) {
              console.log(`[Whisper-Chunking] ✅ Chunk ${i + 1} created: ${(chunkStats.size / 1024 / 1024).toFixed(2)}MB`);
              resolve();
            } else {
              // Empty chunk means we've reached the end
              fs.unlinkSync(chunkPath);
              resolve();
            }
          } else {
            reject(new Error(`Chunk file was not created: ${chunkPath}`));
          }
        } else {
          reject(new Error(`ffmpeg failed for chunk ${i}: ${errorOutput}`));
        }
      });

      ffmpeg.on('error', (err) => {
        reject(new Error(`ffmpeg spawn error: ${err.message}`));
      });
    });

    // Only add chunk if it exists (might not exist if we're past the end)
    if (fs.existsSync(chunkPath)) {
      chunks.push({
        path: chunkPath,
        startOffset,
        index: i
      });
    }
  }

  console.log(`[Whisper-Chunking] ✅ Successfully created ${chunks.length} chunks`);
  return chunks;
}

/**
 * Clean up chunk files
 */
function cleanupChunks(chunks: AudioChunk[], originalPath: string): void {
  for (const chunk of chunks) {
    // Don't delete the original file if it was used as a single chunk
    if (chunk.path !== originalPath && fs.existsSync(chunk.path)) {
      try {
        fs.unlinkSync(chunk.path);
        console.log(`[Whisper-Chunking] 🧹 Cleaned up chunk: ${path.basename(chunk.path)}`);
      } catch (err) {
        console.error(`[Whisper-Chunking] ⚠️ Failed to clean up chunk: ${chunk.path}`);
      }
    }
  }
}


/**
 * Transcribe audio using OpenAI Whisper API
 */
export async function transcribeWithWhisper(
  audioPath: string,
  apiKey: string,
  language: string = 'pt'
): Promise<Transcript> {
  const client = new OpenAI({ apiKey });

  try {
    // Get file info
    const stats = fs.statSync(audioPath);
    const fileSizeMB = Math.round(stats.size / 1024 / 1024 * 10) / 10;
    console.log(`[Whisper] 📁 Audio file size: ${fileSizeMB}MB`);
    
    // Estimate processing time (roughly 1 minute per 10MB)
    const estimatedTime = Math.ceil(fileSizeMB / 10);
    console.log(`[Whisper] ⏱️ Estimated processing time: ${estimatedTime} minute(s)`);
    
    // Read audio file
    console.log(`[Whisper] 📖 Reading audio file...`);
    const audioFile = fs.createReadStream(audioPath);
    
    // Call Whisper API with verbose_json response format to get timestamps
    console.log(`[Whisper] 🚀 Sending to OpenAI Whisper API...`);
    console.log(`[Whisper] ⌛ This may take ${estimatedTime} minute(s). Please wait...`);
    
    const startTime = Date.now();
    
    // Add timeout to prevent hanging (10 minutes for long videos)
    const timeoutMinutes = Math.max(10, estimatedTime * 2); // At least 10 min, or 2x estimated
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      controller.abort();
      console.error(`[Whisper] ❌ Timeout after ${timeoutMinutes} minutes`);
    }, timeoutMinutes * 60 * 1000);
    
    console.log(`[Whisper] ⏰ Timeout set to ${timeoutMinutes} minutes`);
    
    try {
      const transcription = await client.audio.transcriptions.create({
        file: audioFile as any,
        model: 'whisper-1',
        language: language === 'pt' ? 'pt' : language,
        response_format: 'verbose_json',
        timestamp_granularities: ['segment'],
      });
      
      clearTimeout(timeoutId);
      
      const elapsedTime = Math.round((Date.now() - startTime) / 1000);
      console.log(`[Whisper] ✅ Transcription completed in ${elapsedTime} seconds`);
    
      console.log(`[Whisper] 📊 Received transcription response. Keys:`, Object.keys(transcription));
    console.log(`[Whisper] Has segments:`, 'segments' in transcription);
    console.log(`[Whisper] Segments count:`, (transcription as any).segments?.length || 0);

    // Parse the segments from Whisper response
    const segments: TranscriptSegment[] = [];
    
    if ('segments' in transcription && Array.isArray(transcription.segments)) {
      console.log(`[Whisper] Processing ${transcription.segments.length} segments...`);
      for (const segment of transcription.segments) {
        segments.push({
          text: segment.text,
          offset: segment.start,
          duration: segment.end - segment.start,
        });
      }
    } else if ('text' in transcription) {
      // Fallback if no segments are provided
      console.log(`[Whisper] No segments, using full text fallback`);
      const fullText = transcription.text as string;
      console.log(`[Whisper] Full text length: ${fullText.length} chars`);
      segments.push({
        text: fullText,
        offset: 0,
        duration: 0,
      });
    } else {
      console.error(`[Whisper] WARNING: No segments and no text in transcription!`);
    }
    
    console.log(`[Whisper] Final segments count: ${segments.length}`);

    const result: Transcript = {
      videoId: path.basename(audioPath, path.extname(audioPath)),
      language: transcription.language || language,
      segments,
      isAutoGenerated: false, // Whisper transcriptions are not auto-generated
    };
    
    console.log(`[Whisper] Returning transcript with ${segments.length} segments`);
    return result;
    } catch (apiError: any) {
      clearTimeout(timeoutId);
      
      if (apiError.name === 'AbortError') {
        throw new AppError({
          code: 'WHISPER_TIMEOUT' as any,
          message: `Whisper API timed out after ${timeoutMinutes} minutes`,
          userMessage: 'Transcrição demorou muito tempo (timeout)',
          suggestions: [
            'Tente novamente',
            'O vídeo pode estar muito longo ou complexo',
            'Verifique sua conexão com a internet',
          ],
          httpStatus: 504,
        });
      }
      throw apiError;
    }
  } catch (error: any) {
    console.error(`[Whisper] ❌ Error during transcription:`, error.message);
    if (error.response?.status === 413) {
      throw new AppError({
        code: 'AUDIO_TOO_LARGE' as any,
        message: 'Audio file is too large for Whisper API',
        userMessage: 'Arquivo de áudio muito grande (limite: 25MB)',
        suggestions: [
          'Tente com um vídeo mais curto',
          'O limite do Whisper API é 25MB',
        ],
        httpStatus: 413,
      });
    }
    throw error;
  }
}

/**
 * Transcribe a single audio chunk with Whisper
 * Returns segments with offsets relative to the chunk start (0-based)
 */
async function transcribeSingleChunk(
  chunkPath: string,
  apiKey: string,
  language: string,
  chunkIndex: number,
  totalChunks: number
): Promise<TranscriptSegment[]> {
  const client = new OpenAI({ apiKey });
  
  const stats = fs.statSync(chunkPath);
  const fileSizeMB = Math.round(stats.size / 1024 / 1024 * 10) / 10;
  
  console.log(`[Whisper] 🎙️ Transcribing chunk ${chunkIndex + 1}/${totalChunks} (${fileSizeMB}MB)...`);
  
  const audioFile = fs.createReadStream(chunkPath);
  const startTime = Date.now();
  
  const transcription = await client.audio.transcriptions.create({
    file: audioFile as any,
    model: 'whisper-1',
    language: language === 'pt' ? 'pt' : language,
    response_format: 'verbose_json',
    timestamp_granularities: ['segment'],
  });
  
  const elapsedTime = Math.round((Date.now() - startTime) / 1000);
  console.log(`[Whisper] ✅ Chunk ${chunkIndex + 1} transcribed in ${elapsedTime}s`);
  
  const segments: TranscriptSegment[] = [];
  
  if ('segments' in transcription && Array.isArray(transcription.segments)) {
    for (const segment of transcription.segments) {
      segments.push({
        text: segment.text,
        offset: segment.start,
        duration: segment.end - segment.start,
      });
    }
  } else if ('text' in transcription && transcription.text) {
    segments.push({
      text: transcription.text as string,
      offset: 0,
      duration: 0,
    });
  }
  
  console.log(`[Whisper] 📊 Chunk ${chunkIndex + 1} has ${segments.length} segments`);
  return segments;
}

/**
 * Main function to get transcript using Whisper
 * This is called when YouTube subtitles are not available
 * Supports chunking for large audio files that exceed Whisper's 25MB limit
 */
export async function getTranscriptWithWhisper(
  videoId: string,
  apiKey: string,
  language: string = 'pt'
): Promise<Transcript> {
  // Check cache first
  const cached = getCachedTranscript(videoId, language);
  if (cached) {
    console.log(`[Whisper] Using cached transcript for ${videoId}`);
    return cached.transcript;
  }

  let audioPath: string | null = null;
  let chunks: AudioChunk[] = [];
  
  try {
    // Step 1: Download audio from YouTube
    console.log(`\n[Whisper] 📥 STEP 1/4: Downloading audio for video ${videoId}...`);
    audioPath = await downloadYouTubeAudio(videoId, 10800, true); // Max 3 hours, allow large files for chunking
    console.log(`[Whisper] ✅ Audio downloaded successfully to ${audioPath}`);
    
    // Step 2: Split audio into chunks if needed
    console.log(`\n[Whisper] 🔪 STEP 2/4: Checking if audio needs to be split...`);
    chunks = await splitAudioFile(audioPath, videoId);
    
    // Step 3: Transcribe each chunk
    console.log(`\n[Whisper] 🎙️ STEP 3/4: Transcribing ${chunks.length} chunk(s) with Whisper API...`);
    
    const allSegments: TranscriptSegment[] = [];
    let detectedLanguage = language;
    
    for (const chunk of chunks) {
      try {
        const chunkSegments = await transcribeSingleChunk(
          chunk.path,
          apiKey,
          language,
          chunk.index,
          chunks.length
        );
        
        // Adjust segment offsets by adding the chunk's start offset
        const adjustedSegments = chunkSegments.map(seg => ({
          ...seg,
          offset: seg.offset + chunk.startOffset,
        }));
        
        allSegments.push(...adjustedSegments);
        
        console.log(`[Whisper] ✅ Chunk ${chunk.index + 1} processed: ${adjustedSegments.length} segments (offset: ${chunk.startOffset}s)`);
      } catch (chunkError: any) {
        console.error(`[Whisper] ❌ Failed to transcribe chunk ${chunk.index + 1}:`, chunkError.message);
        
        // If it's a 413 error (file too large), try to provide helpful message
        if (chunkError.status === 413 || chunkError.response?.status === 413) {
          throw new AppError({
            code: 'AUDIO_TOO_LARGE' as any,
            message: `Chunk ${chunk.index + 1} is still too large for Whisper API`,
            userMessage: `Parte ${chunk.index + 1} do áudio ainda é muito grande (limite: 25MB)`,
            suggestions: [
              'Tente com um vídeo mais curto',
              'O sistema já divide o áudio em partes, mas esta parte ainda excede o limite',
            ],
            httpStatus: 413,
          });
        }
        throw chunkError;
      }
    }
    
    // Sort segments by offset to ensure correct order
    allSegments.sort((a, b) => a.offset - b.offset);
    
    // Step 4: Process and cache
    console.log(`\n[Whisper] 💾 STEP 4/4: Processing and caching transcript...`);
    
    const transcript: Transcript = {
      videoId,
      language: detectedLanguage,
      segments: allSegments,
      isAutoGenerated: false,
    };
    
    // Cache the transcript
    cacheTranscript(videoId, language, transcript, 'whisper');
    
    console.log(`[Whisper] ✅ All steps completed successfully!`);
    console.log(`[Whisper] 📊 Total segments: ${allSegments.length} from ${chunks.length} chunk(s)`);
    
    return transcript;
  } catch (error: any) {
    console.error(`[Whisper] ❌ Process failed:`, error.message);
    throw error;
  } finally {
    // Clean up chunk files
    if (chunks.length > 0 && audioPath) {
      cleanupChunks(chunks, audioPath);
    }
    
    // Clean up original audio file
    if (audioPath && fs.existsSync(audioPath)) {
      fs.unlinkSync(audioPath);
      console.log(`[Whisper] 🧹 Cleaned up original audio file`);
    }
  }
}

/**
 * Alternative: Transcribe from direct URL (if supported)
 * Some services allow direct URL transcription
 */
export async function transcribeFromUrl(
  videoUrl: string,
  apiKey: string,
  language: string = 'pt'
): Promise<Transcript> {
  const client = new OpenAI({ apiKey });

  try {
    // Note: OpenAI Whisper doesn't directly support URLs
    // This is a placeholder for when/if they add this feature
    // Or you can use a service that downloads and processes
    
    throw new AppError({
      code: 'URL_TRANSCRIPTION_NOT_SUPPORTED' as any,
      message: 'Direct URL transcription not supported',
      userMessage: 'Transcrição direta de URL não suportada',
      suggestions: [
        'Use o método de download de áudio',
        'Ou forneça um arquivo de áudio local',
      ],
      httpStatus: 501,
    });
  } catch (error) {
    throw error;
  }
}
