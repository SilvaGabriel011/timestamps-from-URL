import { Card, CardContent } from '@/components/ui/card';
import { AlertCircle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ErrorDisplayProps {
  error: string;
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
        <p className="text-red-300 text-center max-w-md mb-4">{error}</p>
        <div className="text-sm text-slate-400 text-center max-w-md mb-4">
          <p>Possíveis causas:</p>
          <ul className="list-disc list-inside mt-2 space-y-1">
            <li>O vídeo não possui legendas disponíveis</li>
            <li>A URL do YouTube é inválida</li>
            <li>O vídeo é privado ou restrito</li>
            <li>Problemas de conexão com o servidor</li>
          </ul>
        </div>
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
