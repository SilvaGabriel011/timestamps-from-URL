import { useState } from 'react';
import { VideoInput } from './components/VideoInput';
import { TimestampList } from './components/TimestampList';
import { LoadingState } from './components/LoadingState';
import { ErrorDisplay } from './components/ErrorDisplay';
import { generateTimestamps } from './services/api';
import type { Timestamp, GenerationMetadata, GenerationOptions } from './types';

function App() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [timestamps, setTimestamps] = useState<Timestamp[]>([]);
  const [metadata, setMetadata] = useState<GenerationMetadata | null>(null);
  const [lastUrl, setLastUrl] = useState('');
  const [lastOptions, setLastOptions] = useState<GenerationOptions>({});

  const handleGenerate = async (url: string, options: GenerationOptions) => {
    setLoading(true);
    setError(null);
    setTimestamps([]);
    setMetadata(null);
    setLastUrl(url);
    setLastOptions(options);

    try {
      const result = await generateTimestamps(url, options);
      setTimestamps(result.timestamps);
      setMetadata(result.metadata);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro desconhecido');
    } finally {
      setLoading(false);
    }
  };

  const handleRetry = () => {
    if (lastUrl) {
      handleGenerate(lastUrl, lastOptions);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800">
      <div className="container mx-auto px-4 py-8">
        <header className="text-center mb-12">
          <h1 className="text-4xl font-bold text-white mb-2">
            YouTube Timestamp Generator
          </h1>
          <p className="text-slate-300">
            Gere timestamps automáticos para seus vídeos do YouTube usando IA
          </p>
        </header>

        <div className="max-w-4xl mx-auto">
          <VideoInput onGenerate={handleGenerate} disabled={loading} />

          {loading && <LoadingState />}
          {error && <ErrorDisplay error={error} onRetry={handleRetry} />}
          {timestamps.length > 0 && (
            <TimestampList timestamps={timestamps} metadata={metadata} />
          )}
        </div>

        <footer className="text-center mt-12 text-slate-500 text-sm">
          <p>
            Desenvolvido com React, FastAPI e OpenAI GPT-4o-mini
          </p>
          <p className="mt-1">
            Os timestamps são gerados com base na transcrição real do vídeo
          </p>
        </footer>
      </div>
    </div>
  );
}

export default App;
