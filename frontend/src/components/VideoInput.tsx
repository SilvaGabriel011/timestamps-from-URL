import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Youtube, Wand2 } from 'lucide-react';
import type { GenerationOptions } from '../types';

interface VideoInputProps {
  onGenerate: (url: string, options: GenerationOptions) => void;
  disabled?: boolean;
}

export function VideoInput({ onGenerate, disabled }: VideoInputProps) {
  const [url, setUrl] = useState('');
  const [language, setLanguage] = useState('pt');
  const [minSegmentDuration, setMinSegmentDuration] = useState('30');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim()) return;

    onGenerate(url, {
      language,
      minSegmentDuration: parseInt(minSegmentDuration, 10),
    });
  };

  const isValidYouTubeUrl = (url: string) => {
    const patterns = [
      /(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\n?#]+)/,
      /youtube\.com\/embed\/([^&\n?#]+)/,
      /youtube\.com\/v\/([^&\n?#]+)/,
    ];
    return patterns.some((pattern) => pattern.test(url));
  };

  const isValid = url.trim() && isValidYouTubeUrl(url);

  return (
    <Card className="bg-slate-800/50 border-slate-700">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-white">
          <Youtube className="h-6 w-6 text-red-500" />
          Inserir URL do YouTube
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="url" className="text-slate-300">
              URL do Vídeo
            </Label>
            <Input
              id="url"
              type="url"
              placeholder="https://www.youtube.com/watch?v=..."
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              disabled={disabled}
              className="bg-slate-900/50 border-slate-600 text-white placeholder:text-slate-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="language" className="text-slate-300">
                Idioma Preferido
              </Label>
              <Select
                value={language}
                onValueChange={setLanguage}
                disabled={disabled}
              >
                <SelectTrigger className="bg-slate-900/50 border-slate-600 text-white">
                  <SelectValue placeholder="Selecione o idioma" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pt">Português</SelectItem>
                  <SelectItem value="en">English</SelectItem>
                  <SelectItem value="es">Español</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="duration" className="text-slate-300">
                Duração Mínima (segundos)
              </Label>
              <Select
                value={minSegmentDuration}
                onValueChange={setMinSegmentDuration}
                disabled={disabled}
              >
                <SelectTrigger className="bg-slate-900/50 border-slate-600 text-white">
                  <SelectValue placeholder="Duração mínima" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="15">15 segundos</SelectItem>
                  <SelectItem value="30">30 segundos</SelectItem>
                  <SelectItem value="60">60 segundos</SelectItem>
                  <SelectItem value="120">2 minutos</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <Button
            type="submit"
            disabled={disabled || !isValid}
            className="w-full bg-red-600 hover:bg-red-700 text-white"
          >
            <Wand2 className="mr-2 h-4 w-4" />
            Gerar Timestamps
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
