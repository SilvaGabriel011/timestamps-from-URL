# Troubleshooting - Speech-to-Text Issues

## Problema: Vídeo retorna apenas "Introdução"

Se um vídeo de 40 minutos está retornando apenas "Introdução" como timestamp, isso pode acontecer por vários motivos:

### Possíveis Causas

1. **Vídeo tem legendas ruins**: O vídeo pode ter legendas automáticas de baixa qualidade que não permitem gerar timestamps válidos
2. **Cache com dados ruins**: O cache pode ter uma transcrição anterior ruim
3. **Whisper não está sendo usado**: O sistema está usando legendas ruins em vez de Whisper

### Como Diagnosticar

#### 1. Verificar os logs do servidor

Procure por estas mensagens nos logs:

```
[YouTube] Trying to fetch pt subtitles for VIDEO_ID...
[YouTube] Found X subtitle segments
[Validator] Total candidates: X, Validated: Y
[Validator] Adding default 'Introdução' timestamp
```

Se você ver:
- `Found X subtitle segments` com X > 0: O vídeo TEM legendas
- `Validated: 0`: A IA não conseguiu gerar timestamps válidos
- `Adding default 'Introdução'`: O validador adicionou timestamp padrão

#### 2. Limpar o cache do vídeo

Se o cache tiver dados ruins, delete-o:

```bash
# Extrair o video ID da URL (exemplo: dQw4w9WgXcQ)
# Deletar cache via API
curl -X DELETE "http://localhost:8000/api/cache/VIDEO_ID?language=pt"
```

#### 3. Forçar uso do Whisper

Para forçar o uso do Whisper (ignorando legendas), adicione `force_whisper: true` na requisição:

```json
{
  "url": "https://www.youtube.com/watch?v=VIDEO_ID",
  "language": "pt",
  "min_segment_duration": 30,
  "force_whisper": true
}
```

### Solução Passo a Passo

1. **Identificar o vídeo problemático**
   - Copie a URL do vídeo
   - Extraia o video ID

2. **Limpar o cache**
   ```bash
   curl -X DELETE "http://localhost:8000/api/cache/VIDEO_ID?language=pt"
   ```

3. **Tentar novamente com force_whisper**
   - Use a opção `force_whisper: true` na requisição
   - Isso vai ignorar legendas e usar Whisper diretamente

4. **Verificar logs do servidor**
   - Procure por `[Whisper] Downloading audio for video...`
   - Procure por `[Whisper] Transcribing audio with Whisper API...`
   - Verifique se há erros

### Limitações Conhecidas

- **Vídeos muito longos**: Whisper tem limite de 1 hora
- **Arquivos grandes**: Limite de 25MB de áudio
- **Vídeos privados/restritos**: Não podem ser processados

### Debugging Avançado

#### Verificar estatísticas do cache

```bash
curl http://localhost:8000/api/cache/stats
```

#### Limpar todo o cache

```bash
curl -X POST http://localhost:8000/api/cache/clear
```

#### Logs detalhados

Os logs agora mostram:
- Quando está tentando buscar legendas
- Quantos segmentos foram encontrados
- Quando está usando Whisper
- Quantos timestamps foram validados

### Exemplo de Fluxo Normal

#### Com legendas boas:
```
[YouTube] Trying to fetch pt subtitles for VIDEO_ID...
[YouTube] Found 450 subtitle segments
[Validator] Total candidates: 12, Validated: 10
```

#### Com legendas ruins:
```
[YouTube] Trying to fetch pt subtitles for VIDEO_ID...
[YouTube] Found 15 subtitle segments
[Validator] Total candidates: 2, Validated: 0
[Validator] Adding default 'Introdução' timestamp. Total segments: 15
```

#### Sem legendas (usando Whisper):
```
[YouTube] Trying to fetch pt subtitles for VIDEO_ID...
[YouTube] Trying English subtitles for VIDEO_ID...
[YouTube] Trying auto-detect subtitles for VIDEO_ID...
[YouTube] No subtitles found for VIDEO_ID, using Whisper speech-to-text...
[Whisper] Downloading audio for video VIDEO_ID...
[Whisper] Downloaded 15.3MB audio file
[Whisper] Transcribing audio with Whisper API...
[YouTube] Successfully transcribed with Whisper
[Validator] Total candidates: 15, Validated: 12
```

### Como Contribuir com Debugging

Se encontrar um problema persistente:

1. Cole a URL do vídeo
2. Cole os logs do servidor
3. Informe se usou `force_whisper`
4. Descreva o comportamento esperado vs obtido
