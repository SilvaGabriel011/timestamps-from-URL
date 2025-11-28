#!/usr/bin/env python
"""
Testa apenas o DeepSeek para gerar timestamps usando transcrição existente
"""

import json
import sys
import requests
from pathlib import Path
from typing import List, Dict

# Add src to path
sys.path.insert(0, str(Path(__file__).parent / "src"))

from src.transcriber import Transcript, TranscriptSegment, format_time
from src.timestamp_generator import Timestamp, get_system_prompt, parse_timestamps_from_response


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


def get_transcript_for_llm(transcript: Transcript, max_segments: int = 150) -> str:
    """Prepara transcrição RESUMIDA para LLM - otimizado para GPUs com pouca VRAM"""
    segments_to_use = transcript.segments
    
    # Reduz para caber na memória da GPU
    if len(segments_to_use) > max_segments:
        step = len(segments_to_use) // max_segments
        segments_to_use = segments_to_use[::step]
    
    lines = []
    for segment in segments_to_use:
        time_str = format_time(segment.start)
        # Trunca textos muito longos
        text = segment.text[:80] if len(segment.text) > 80 else segment.text
        lines.append(f"[{time_str}] {text}")
    
    return "\n".join(lines)


def test_deepseek_timestamps(
    transcript: Transcript,
    video_title: str,
    model: str = "llama3.2",  # Mais rápido para testes
    min_duration: int = 60
) -> List[Dict]:
    """Testa DeepSeek para gerar timestamps"""
    
    ollama_url = "http://localhost:11434"
    
    # Verifica se Ollama está rodando
    print("Verificando Ollama...")
    try:
        response = requests.get(f"{ollama_url}/api/tags", timeout=5)
        if response.status_code != 200:
            print("❌ Ollama não está rodando!")
            print("Execute: ollama serve")
            return []
    except Exception as e:
        print(f"❌ Erro conectando com Ollama: {e}")
        print("Execute: ollama serve")
        return []
    
    # Verifica modelos disponíveis
    models = response.json().get("models", [])
    model_names = [m["name"] for m in models]
    
    if not any(model in m for m in model_names):
        print(f"❌ Modelo {model} não encontrado!")
        print(f"Modelos disponíveis: {model_names}")
        print(f"Execute: ollama pull {model}")
        return []
    
    print(f"✓ Ollama rodando com {model}")
    
    # Prepara transcrição
    transcript_text = get_transcript_for_llm(transcript)
    
    # Limita tamanho se necessário
    max_chars = 80000
    if len(transcript_text) > max_chars:
        print(f"Truncando transcrição: {len(transcript_text)} → {max_chars} chars")
        half = max_chars // 2
        transcript_text = transcript_text[:half] + "\n\n[... conteúdo omitido ...]\n\n" + transcript_text[-half:]
    
    # Prepara prompts
    system_prompt = get_system_prompt(transcript.language, min_duration, transcript.duration)
    
    user_prompt = f"""Título do Vídeo: {video_title}
Duração do Vídeo: {format_time(transcript.duration)}
Idioma: Português Brasileiro

Transcrição:
{transcript_text}

Gere timestamps para este vídeo. Lembre-se de retornar APENAS JSON válido.
Os títulos devem estar em português brasileiro."""
    
    print(f"\nEnviando para DeepSeek...")
    print(f"- Vídeo: {video_title}")
    print(f"- Duração: {format_time(transcript.duration)}")
    print(f"- Segmentos: {len(transcript.segments)}")
    print(f"- Caracteres enviados: {len(transcript_text)}")
    
    # Envia para Ollama com STREAMING - SEM TIMEOUT
    try:
        print("\n⏳ Gerando timestamps (DeepSeek pode levar 5-15 minutos)...")
        print("📝 Resposta: ", end="", flush=True)
        
        response = requests.post(
            f"{ollama_url}/api/generate",
            json={
                "model": model,
                "prompt": user_prompt,
                "system": system_prompt,
                "stream": True,  # STREAMING ATIVADO
                "options": {
                    "temperature": 0.2,
                    "num_predict": 2000,  # Reduzido
                    "num_ctx": 8192  # Contexto menor = mais rápido
                }
            },
            timeout=None,  # SEM TIMEOUT - espera o tempo que precisar
            stream=True
        )
        
        if response.status_code != 200:
            print(f"\n❌ Erro na resposta: {response.text}")
            return []
        
        # Coleta resposta com streaming
        llm_response = ""
        for line in response.iter_lines():
            if line:
                try:
                    chunk = json.loads(line)
                    token = chunk.get("response", "")
                    llm_response += token
                    print(token, end="", flush=True)  # Mostra em tempo real
                except:
                    pass
        
        print("\n")  # Nova linha após streaming
        
        print(f"\n✓ Resposta recebida!")
        
        # Debug: mostra preview da resposta
        if len(llm_response) > 500:
            print(f"Preview: {llm_response[:500]}...")
        else:
            print(f"Resposta completa: {llm_response}")
        
        # Parse timestamps
        timestamps = parse_timestamps_from_response(llm_response, transcript.duration, min_duration)
        
        # Converte para dict
        result = []
        for ts in timestamps:
            result.append({
                "time": int(ts.time),
                "title": ts.title
            })
        
        return result
        
    except Exception as e:
        print(f"❌ Erro ao processar: {e}")
        return []


def main():
    # Carrega última transcrição
    output_dir = Path("output")
    transcript_files = list(output_dir.glob("*_transcript.json"))
    
    if not transcript_files:
        print("❌ Nenhuma transcrição encontrada em output/")
        return
    
    # Usa a mais recente
    transcript_file = sorted(transcript_files, key=lambda x: x.stat().st_mtime)[-1]
    print(f"📄 Carregando: {transcript_file}")
    
    # Carrega dados
    with open(transcript_file, 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    transcript = load_transcript(transcript_file)
    video_title = data.get('video_title', 'Vídeo')
    
    print(f"\n📹 Vídeo: {video_title}")
    print(f"⏱️ Duração: {data['duration_formatted']}")
    print(f"📝 Segmentos: {data['segment_count']}")
    print(f"🌍 Idioma: {data['language']}")
    
    print("\n" + "="*60)
    print("🤖 TESTANDO DEEPSEEK-V2:16B (sem timeout)")
    print("="*60)
    
    timestamps = test_deepseek_timestamps(transcript, video_title, model="deepseek-v2:16b")
    
    if not timestamps:
        print("\n❌ Não foi possível gerar timestamps")
        return
    
    print(f"\n✅ Gerados {len(timestamps)} timestamps:")
    print("-"*40)
    
    for ts in timestamps:
        minutes = ts['time'] // 60
        seconds = ts['time'] % 60
        print(f"{minutes:2d}:{seconds:02d} - {ts['title']}")
    
    print("-"*40)
    
    # Salva resultado
    output_file = transcript_file.parent / f"{transcript_file.stem.replace('_transcript', '')}_deepseek_test.txt"
    with open(output_file, 'w', encoding='utf-8') as f:
        f.write(f"Timestamps gerados por DeepSeek para: {video_title}\n\n")
        f.write("TIMESTAMPS (DeepSeek-v2:16b):\n")
        f.write("-"*40 + "\n")
        
        for ts in timestamps:
            minutes = ts['time'] // 60
            seconds = ts['time'] % 60
            f.write(f"{minutes}:{seconds:02d} - {ts['title']}\n")
        
        f.write("-"*40 + "\n")
    
    print(f"\n💾 Salvo em: {output_file}")


if __name__ == "__main__":
    main()
