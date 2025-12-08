import { Card, CardContent } from '@/components/ui/card';
import { Loader2 } from 'lucide-react';

export function LoadingState() {
  return (
    <div className="animated-border-gradient mt-6">
      <Card className="bg-slate-800/95 border-0">
        <CardContent className="flex flex-col items-center justify-center py-12">
        <Loader2 className="h-12 w-12 text-blue-400 animate-spin mb-4" />
        <h3 className="text-lg font-semibold text-white mb-2">
          Processando vídeo...
        </h3>
        <p className="text-slate-400 text-center max-w-md">
          Estamos extraindo a transcrição e analisando o conteúdo para identificar
          mudanças de tópico. Isso pode levar alguns segundos.
        </p>
        <div className="mt-6 space-y-2 text-sm text-slate-500">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            <span>Extraindo transcrição do YouTube</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
            <span>Analisando conteúdo com IA</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-purple-500 animate-pulse" />
            <span>Validando timestamps</span>
          </div>
        </div>
      </CardContent>
      </Card>
    </div>
  );
}
