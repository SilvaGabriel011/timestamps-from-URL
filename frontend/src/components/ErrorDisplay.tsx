import { Card, CardContent } from '@/components/ui/card';
import { AlertCircle, RefreshCw, Lightbulb } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { ApiError } from '../types';

interface ErrorDisplayProps {
  error: ApiError;
  onRetry?: () => void;
}

export function ErrorDisplay({ error, onRetry }: ErrorDisplayProps) {
  return (
    <Card className="bg-red-900/20 border-red-800 mt-6">
      <CardContent className="flex flex-col items-center justify-center py-8">
        <AlertCircle className="h-12 w-12 text-red-400 mb-4" />
        <h3 className="text-lg font-semibold text-white mb-2">
          Erro ao processar vídeo
        </h3>
        <p className="text-red-300 text-center max-w-md mb-2 font-medium">
          {error.message}
        </p>
        
        {/* Error code badge */}
        <div className="inline-block px-3 py-1 bg-red-900/40 border border-red-700 rounded-full text-xs text-red-300 mb-4 font-mono">
          {error.code}
        </div>

        {/* Suggestions */}
        {error.suggestions && error.suggestions.length > 0 && (
          <div className="text-sm text-slate-300 text-left max-w-md mb-6 bg-slate-800/50 rounded-lg p-4 border border-slate-700">
            <div className="flex items-center gap-2 mb-2">
              <Lightbulb className="h-4 w-4 text-yellow-400" />
              <p className="font-semibold">Possíveis causas:</p>
            </div>
            <ul className="list-disc list-inside space-y-1 ml-1">
              {error.suggestions.map((suggestion, index) => (
                <li key={index} className="text-slate-400">{suggestion}</li>
              ))}
            </ul>
          </div>
        )}

        {onRetry && (
          <Button
            onClick={onRetry}
            variant="outline"
            className="border-red-600 text-red-300 hover:bg-red-900/50"
          >
            <RefreshCw className="mr-2 h-4 w-4" />
            Tentar novamente
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
