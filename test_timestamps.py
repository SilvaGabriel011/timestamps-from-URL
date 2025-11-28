#!/usr/bin/env python
"""
Script de teste para gerar timestamps a partir de transcrição existente
"""

import json
import sys
from pathlib import Path

# Add src to path
sys.path.insert(0, str(Path(__file__).parent / "src"))

from src.smart_timestamp_generator import generate_smart_timestamps
from src.transcriber import Transcript, TranscriptSegment


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


def main():
    # Carrega última transcrição
    output_dir = Path("output")
    transcript_files = list(output_dir.glob("*_transcript.json"))
    
    if not transcript_files:
        print("Nenhuma transcrição encontrada em output/")
        return
    
    # Usa a mais recente
    transcript_file = sorted(transcript_files, key=lambda x: x.stat().st_mtime)[-1]
    print(f"Carregando: {transcript_file}")
    
    # Carrega dados
    with open(transcript_file, 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    transcript = load_transcript(transcript_file)
    video_title = data.get('video_title', 'Vídeo')
    
    print(f"\nVídeo: {video_title}")
    print(f"Duração: {data['duration_formatted']}")
    print(f"Segmentos: {data['segment_count']}")
    print(f"Idioma: {data['language']}")
    
    # Gera novos timestamps
    print("\n" + "="*60)
    print("Gerando timestamps inteligentes...")
    print("="*60)
    
    timestamps = generate_smart_timestamps(transcript, video_title, min_duration=60)
    
    print(f"\nGerados {len(timestamps)} timestamps:")
    print("-"*40)
    
    for ts in timestamps:
        minutes = ts['time'] // 60
        seconds = ts['time'] % 60
        print(f"{minutes:2d}:{seconds:02d} - {ts['title']}")
    
    print("-"*40)
    
    # Salva resultado
    output_file = transcript_file.parent / f"{transcript_file.stem.replace('_transcript', '')}_timestamps_test.txt"
    with open(output_file, 'w', encoding='utf-8') as f:
        f.write(f"Timestamps para: {video_title}\n\n")
        f.write("TIMESTAMPS MELHORADOS:\n")
        f.write("-"*40 + "\n")
        
        for ts in timestamps:
            minutes = ts['time'] // 60
            seconds = ts['time'] % 60
            f.write(f"{minutes}:{seconds:02d} - {ts['title']}\n")
        
        f.write("-"*40 + "\n")
    
    print(f"\nSalvo em: {output_file}")


if __name__ == "__main__":
    main()
