#!/usr/bin/env python
"""
Testa DeepSeek com processamento em CHUNKS para cobrir video inteiro
Divide a transcrição em partes e processa cada uma separadamente
"""

import json
import sys
import requests
from pathlib import Path
from typing import List, Dict

sys.path.insert(0, str(Path(__file__).parent / "src"))

from src.transcriber import Transcript, TranscriptSegment, format_time
from src.timestamp_generator import get_system_prompt, parse_timestamps_from_response


def load_transcript(json_path: str) -> Transcript:
    """Carrega transcrição de arquivo JSON"""
    with open(json_path, 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    segments = []
    for seg_data in data['segments']:
        segments.append(TranscriptSegment(
            start=seg_data['start'],
            end=seg_data['end'],
            text=seg_data['text']
        ))
    
    return Transcript(
        language=data['language'],
        segments=segments,
        full_text=" ".join([s.text for s in segments]),
        duration=data['duration']
    )


def get_segments_in_range(transcript: Transcript, start_time: float, end_time: float) -> List[TranscriptSegment]:
    """Retorna segmentos dentro de um intervalo de tempo"""
    return [s for s in transcript.segments if s.start >= start_time and s.start < end_time]


def segments_to_text(segments: List[TranscriptSegment], max_segments: int = 80) -> str:
    """Converte segmentos para texto formatado"""
    # Se muitos segmentos, amostra
    if len(segments) > max_segments:
        step = len(segments) // max_segments
        segments = segments[::step]
    
    lines = []
    for segment in segments:
        time_str = format_time(segment.start)
        text = segment.text[:100] if len(segment.text) > 100 else segment.text
        lines.append(f"[{time_str}] {text}")
    
    return "\n".join(lines)


def process_chunk(
    transcript_text: str,
    video_title: str,
    chunk_start: float,
    chunk_end: float,
    chunk_num: int,
    total_chunks: int,
    model: str = "deepseek-v2:16b"
) -> List[Dict]:
    """Processa um chunk da transcrição"""
    
    ollama_url = "http://localhost:11434"
    
    # Prompt específico para chunk
    system_prompt = f"""Você é um especialista em criar timestamps para vídeos do YouTube em português brasileiro.

TAREFA: Analisar este TRECHO do vídeo (parte {chunk_num}/{total_chunks}) e criar timestamps.

REGRAS:
1. Use APENAS informações que aparecem na transcrição
2. Títulos de 3-6 palavras, específicos e em português BR
3. Gere 3-6 timestamps para este trecho
4. Os tempos já estão corretos - use os valores [MM:SS] da transcrição

RESPONDA APENAS COM JSON:
{{
  "timestamps": [
    {{"time": SEGUNDOS, "title": "Título aqui"}}
  ]
}}"""

    user_prompt = f"""Vídeo: {video_title}
Trecho: {format_time(chunk_start)} até {format_time(chunk_end)}

Transcrição deste trecho:
{transcript_text}

Gere timestamps para este trecho. Use os tempos exatos da transcrição."""

    print(f"\n📤 Enviando chunk {chunk_num}/{total_chunks} ({format_time(chunk_start)} - {format_time(chunk_end)})...")
    print(f"   Caracteres: {len(transcript_text)}")
    
    try:
        response = requests.post(
            f"{ollama_url}/api/generate",
            json={
                "model": model,
                "prompt": user_prompt,
                "system": system_prompt,
                "stream": True,
                "options": {
                    "temperature": 0.2,
                    "num_predict": 1000,
                    "num_ctx": 4096
                }
            },
            timeout=None,
            stream=True
        )
        
        if response.status_code != 200:
            print(f"   ❌ Erro: {response.text}")
            return []
        
        # Coleta resposta
        llm_response = ""
        print("   📝 ", end="", flush=True)
        for line in response.iter_lines():
            if line:
                try:
                    chunk = json.loads(line)
                    token = chunk.get("response", "")
                    llm_response += token
                    # Mostra apenas pontos para indicar progresso
                    if token.strip():
                        print(".", end="", flush=True)
                except:
                    pass
        
        print(" ✓")
        
        # Parse JSON
        try:
            # Encontra JSON na resposta
            json_match = llm_response
            if "```" in json_match:
                json_match = json_match.split("```")[1]
                if json_match.startswith("json"):
                    json_match = json_match[4:]
            
            # Limpa e parse
            json_match = json_match.strip()
            if json_match.startswith("{"):
                data = json.loads(json_match)
                timestamps = data.get("timestamps", [])
                print(f"   ✅ {len(timestamps)} timestamps gerados")
                return timestamps
        except Exception as e:
            print(f"   ⚠️ Erro parse JSON: {e}")
            
        return []
        
    except Exception as e:
        print(f"   ❌ Erro: {e}")
        return []


def main():
    # Carrega transcrição
    output_dir = Path("output")
    transcript_files = list(output_dir.glob("*_transcript.json"))
    
    if not transcript_files:
        print("❌ Nenhuma transcrição encontrada")
        return
    
    transcript_file = sorted(transcript_files, key=lambda x: x.stat().st_mtime)[-1]
    print(f"📄 Carregando: {transcript_file}")
    
    with open(transcript_file, 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    transcript = load_transcript(transcript_file)
    video_title = data.get('video_title', 'Vídeo')
    duration = data['duration']
    
    print(f"\n📹 Vídeo: {video_title}")
    print(f"⏱️ Duração: {data['duration_formatted']}")
    print(f"📝 Segmentos: {data['segment_count']}")
    
    # Divide em chunks de ~10 minutos
    chunk_duration = 600  # 10 minutos
    num_chunks = int(duration / chunk_duration) + 1
    
    print(f"\n🔄 Processando em {num_chunks} chunks de ~10 minutos cada")
    print("="*60)
    
    all_timestamps = []
    
    for i in range(num_chunks):
        chunk_start = i * chunk_duration
        chunk_end = min((i + 1) * chunk_duration, duration)
        
        # Pega segmentos deste chunk
        segments = get_segments_in_range(transcript, chunk_start, chunk_end)
        
        if not segments:
            continue
        
        # Converte para texto
        chunk_text = segments_to_text(segments)
        
        # Processa chunk
        timestamps = process_chunk(
            chunk_text,
            video_title,
            chunk_start,
            chunk_end,
            i + 1,
            num_chunks
        )
        
        all_timestamps.extend(timestamps)
    
    # Remove duplicatas e ordena
    seen_times = set()
    unique_timestamps = []
    for ts in sorted(all_timestamps, key=lambda x: x.get('time', 0)):
        time = ts.get('time', 0)
        # Agrupa timestamps muito próximos (< 30s)
        is_duplicate = any(abs(time - t) < 30 for t in seen_times)
        if not is_duplicate:
            seen_times.add(time)
            unique_timestamps.append(ts)
    
    print("\n" + "="*60)
    print(f"✅ TOTAL: {len(unique_timestamps)} timestamps gerados")
    print("="*60)
    
    for ts in unique_timestamps:
        time = ts.get('time', 0)
        title = ts.get('title', 'Sem título')
        minutes = int(time) // 60
        seconds = int(time) % 60
        print(f"{minutes:2d}:{seconds:02d} - {title}")
    
    # Salva resultado
    output_file = transcript_file.parent / f"{transcript_file.stem.replace('_transcript', '')}_timestamps_chunks.txt"
    with open(output_file, 'w', encoding='utf-8') as f:
        f.write(f"Timestamps para: {video_title}\n")
        f.write(f"Gerado com DeepSeek em {num_chunks} chunks\n\n")
        f.write("TIMESTAMPS:\n")
        f.write("-"*40 + "\n")
        
        for ts in unique_timestamps:
            time = ts.get('time', 0)
            title = ts.get('title', 'Sem título')
            minutes = int(time) // 60
            seconds = int(time) % 60
            f.write(f"{minutes}:{seconds:02d} - {title}\n")
        
        f.write("-"*40 + "\n")
    
    print(f"\n💾 Salvo em: {output_file}")


if __name__ == "__main__":
    main()
