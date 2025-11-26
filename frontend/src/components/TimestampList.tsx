import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Copy, Check, Clock, Info, Mic, Zap } from 'lucide-react';
import type { Timestamp, GenerationMetadata } from '../types';

interface TimestampListProps {
  timestamps: Timestamp[];
  metadata: GenerationMetadata | null;
}

/**
 * Time formatting constants.
 * These match the backend time-utils.ts for consistency.
 */
const SECONDS_PER_MINUTE = 60;
const SECONDS_PER_HOUR = 3600;

/**
 * Format a timestamp from seconds to human-readable format.
 * Uses MM:SS for times under an hour, HH:MM:SS for longer times.
 * Always floors to the nearest second for display consistency.
 * 
 * NOTE: This logic must match backend/src/time-utils.ts formatTimestamp()
 * 
 * @param seconds - Time in seconds (can be floating-point)
 * @returns Formatted timestamp string (e.g., "1:05" or "1:01:05")
 */
function formatTime(seconds: number): string {
  const totalSeconds = Math.floor(seconds);
  const hours = Math.floor(totalSeconds / SECONDS_PER_HOUR);
  const minutes = Math.floor((totalSeconds % SECONDS_PER_HOUR) / SECONDS_PER_MINUTE);
  const secs = totalSeconds % SECONDS_PER_MINUTE;

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${minutes}:${secs.toString().padStart(2, '0')}`;
}

function getConfidenceColor(confidence: number): string {
  if (confidence >= 0.9) return 'bg-green-500';
  if (confidence >= 0.7) return 'bg-yellow-500';
  return 'bg-red-500';
}

export function TimestampList({ timestamps, metadata }: TimestampListProps) {
  const [copied, setCopied] = useState(false);

  const formatForYouTube = (): string => {
    return timestamps
      .map((t) => `${formatTime(t.time)} - ${t.title}`)
      .join('\n');
  };

  const handleCopy = async () => {
    const text = formatForYouTube();
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Card className="bg-slate-800/50 border-slate-700 mt-6">
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="flex items-center gap-2 text-white">
            <Clock className="h-5 w-5 text-blue-400" />
            Timestamps Gerados
          </CardTitle>
          {metadata && (
            <div className="flex gap-2 mt-2">
              <Badge variant="outline" className="text-slate-300 border-slate-600">
                {metadata.language.toUpperCase()}
              </Badge>
              {metadata.used_speech_to_text ? (
                <Badge
                  variant="outline"
                  className="text-purple-400 border-purple-600"
                >
                  <Mic className="mr-1 h-3 w-3" />
                  Speech-to-Text (Whisper)
                </Badge>
              ) : (
                <Badge
                  variant="outline"
                  className={
                    metadata.is_auto_generated
                      ? 'text-yellow-400 border-yellow-600'
                      : 'text-green-400 border-green-600'
                  }
                >
                  {metadata.is_auto_generated ? 'Legendas Automáticas' : 'Legendas Manuais'}
                </Badge>
              )}
              {metadata.from_cache && (
                <Badge
                  variant="outline"
                  className="text-yellow-400 border-yellow-600"
                >
                  <Zap className="mr-1 h-3 w-3" />
                  Cache Hit (Rápido)
                </Badge>
              )}
              <Badge variant="outline" className="text-slate-300 border-slate-600">
                {metadata.validated_count} de {metadata.total_candidates} validados
              </Badge>
            </div>
          )}
        </div>
        <Button
          onClick={handleCopy}
          variant="outline"
          className="border-slate-600 text-slate-300 hover:bg-slate-700"
        >
          {copied ? (
            <>
              <Check className="mr-2 h-4 w-4 text-green-400" />
              Copiado!
            </>
          ) : (
            <>
              <Copy className="mr-2 h-4 w-4" />
              Copiar para YouTube
            </>
          )}
        </Button>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {timestamps.map((timestamp, index) => (
            <TooltipProvider key={index}>
              <div className="flex items-center gap-3 p-3 rounded-lg bg-slate-900/50 hover:bg-slate-900/70 transition-colors">
                <span className="font-mono text-blue-400 min-w-16">
                  {formatTime(timestamp.time)}
                </span>
                <span className="text-white flex-1">{timestamp.title}</span>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="flex items-center gap-2">
                      <div
                        className={`w-2 h-2 rounded-full ${getConfidenceColor(timestamp.confidence)}`}
                      />
                      <span className="text-xs text-slate-400">
                        {Math.round(timestamp.confidence * 100)}%
                      </span>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs">
                    <p className="font-semibold mb-1">Evidência:</p>
                    <p className="text-sm text-slate-300">
                      {timestamp.evidence || 'Sem evidência disponível'}
                    </p>
                  </TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info className="h-4 w-4 text-slate-500 cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs">
                    <p className="text-sm">
                      Confiança: {Math.round(timestamp.confidence * 100)}%
                    </p>
                  </TooltipContent>
                </Tooltip>
              </div>
            </TooltipProvider>
          ))}
        </div>

        <div className="mt-6 p-4 rounded-lg bg-slate-900/70 border border-slate-700">
          <h4 className="text-sm font-semibold text-slate-300 mb-2">
            Formato para Descrição do YouTube:
          </h4>
          <pre className="text-sm text-slate-400 whitespace-pre-wrap font-mono">
            {formatForYouTube()}
          </pre>
        </div>
      </CardContent>
    </Card>
  );
}
