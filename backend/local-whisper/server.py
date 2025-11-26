#!/usr/bin/env python3
"""
Local Whisper Transcription Server

A lightweight HTTP server that provides speech-to-text transcription
using the faster-whisper library. This runs completely locally without
requiring any API keys or internet connection.

Usage:
    python server.py --model base --port 5000

Model options: tiny, base, small, medium, large-v3
"""

import argparse
import json
import os
import tempfile
import time
from pathlib import Path

from flask import Flask, jsonify, request
from flask_cors import CORS

# Import faster-whisper
try:
    from faster_whisper import WhisperModel
except ImportError:
    print("Error: faster-whisper not installed.")
    print("Install with: pip install faster-whisper")
    exit(1)

app = Flask(__name__)
CORS(app)

# Global model instance
model = None
model_name = None


def load_model(name: str, device: str = "auto", compute_type: str = "auto"):
    """Load the Whisper model."""
    global model, model_name
    
    print(f"Loading Whisper model: {name}")
    start_time = time.time()
    
    # Determine device and compute type
    if device == "auto":
        try:
            import torch
            device = "cuda" if torch.cuda.is_available() else "cpu"
        except ImportError:
            device = "cpu"
    
    if compute_type == "auto":
        compute_type = "float16" if device == "cuda" else "int8"
    
    print(f"Using device: {device}, compute_type: {compute_type}")
    
    model = WhisperModel(name, device=device, compute_type=compute_type)
    model_name = name
    
    elapsed = time.time() - start_time
    print(f"Model loaded in {elapsed:.2f} seconds")


@app.route("/health", methods=["GET"])
def health():
    """Health check endpoint."""
    return jsonify({
        "status": "ok",
        "model": model_name,
        "model_loaded": model is not None
    })


@app.route("/transcribe", methods=["POST"])
def transcribe():
    """
    Transcribe an audio file.
    
    Expects a multipart form with:
    - file: The audio file to transcribe
    - language (optional): Language code (e.g., 'en', 'pt', 'es')
    
    Returns JSON with transcript segments including timestamps.
    """
    if model is None:
        return jsonify({"error": "Model not loaded"}), 500
    
    # Check if file was uploaded
    if "file" not in request.files:
        return jsonify({"error": "No file provided"}), 400
    
    file = request.files["file"]
    if file.filename == "":
        return jsonify({"error": "No file selected"}), 400
    
    # Get optional parameters
    language = request.form.get("language", None)
    
    # Save uploaded file to temp location
    temp_dir = tempfile.mkdtemp()
    temp_path = os.path.join(temp_dir, "audio")
    
    try:
        file.save(temp_path)
        print(f"Received audio file: {file.filename}, size: {os.path.getsize(temp_path)} bytes")
        
        # Transcribe
        start_time = time.time()
        print(f"Starting transcription (language: {language or 'auto-detect'})...")
        
        segments, info = model.transcribe(
            temp_path,
            language=language,
            word_timestamps=True,
            vad_filter=True,  # Voice activity detection to skip silence
        )
        
        # Convert generator to list and format segments
        transcript_segments = []
        full_text = []
        
        for segment in segments:
            transcript_segments.append({
                "text": segment.text.strip(),
                "start": segment.start,
                "end": segment.end,
                "words": [
                    {
                        "word": word.word,
                        "start": word.start,
                        "end": word.end,
                        "probability": word.probability
                    }
                    for word in (segment.words or [])
                ]
            })
            full_text.append(segment.text.strip())
        
        elapsed = time.time() - start_time
        print(f"Transcription completed in {elapsed:.2f} seconds")
        print(f"Detected language: {info.language} (probability: {info.language_probability:.2f})")
        print(f"Total segments: {len(transcript_segments)}")
        
        return jsonify({
            "text": " ".join(full_text),
            "segments": transcript_segments,
            "language": info.language,
            "language_probability": info.language_probability,
            "duration": info.duration,
            "processing_time": elapsed
        })
        
    except Exception as e:
        print(f"Transcription error: {str(e)}")
        return jsonify({"error": str(e)}), 500
        
    finally:
        # Cleanup temp file
        try:
            os.remove(temp_path)
            os.rmdir(temp_dir)
        except:
            pass


@app.route("/models", methods=["GET"])
def list_models():
    """List available model sizes."""
    return jsonify({
        "available_models": [
            {"name": "tiny", "size": "39M", "ram": "~1GB", "description": "Fastest, basic quality"},
            {"name": "base", "size": "74M", "ram": "~1GB", "description": "Fast, good quality"},
            {"name": "small", "size": "244M", "ram": "~2GB", "description": "Medium speed, better quality"},
            {"name": "medium", "size": "769M", "ram": "~5GB", "description": "Slow, great quality"},
            {"name": "large-v3", "size": "1550M", "ram": "~10GB", "description": "Slowest, best quality"},
        ],
        "current_model": model_name
    })


def main():
    parser = argparse.ArgumentParser(description="Local Whisper Transcription Server")
    parser.add_argument(
        "--model",
        type=str,
        default="base",
        choices=["tiny", "base", "small", "medium", "large-v3"],
        help="Whisper model size (default: base)"
    )
    parser.add_argument(
        "--port",
        type=int,
        default=5000,
        help="Port to run the server on (default: 5000)"
    )
    parser.add_argument(
        "--host",
        type=str,
        default="0.0.0.0",
        help="Host to bind to (default: 0.0.0.0)"
    )
    parser.add_argument(
        "--device",
        type=str,
        default="auto",
        choices=["auto", "cpu", "cuda"],
        help="Device to use for inference (default: auto)"
    )
    parser.add_argument(
        "--compute-type",
        type=str,
        default="auto",
        choices=["auto", "int8", "float16", "float32"],
        help="Compute type for inference (default: auto)"
    )
    
    args = parser.parse_args()
    
    # Load the model
    load_model(args.model, args.device, args.compute_type)
    
    # Start the server
    print(f"\nStarting Whisper server on http://{args.host}:{args.port}")
    print("Endpoints:")
    print(f"  GET  /health     - Health check")
    print(f"  POST /transcribe - Transcribe audio file")
    print(f"  GET  /models     - List available models")
    print()
    
    app.run(host=args.host, port=args.port, debug=False)


if __name__ == "__main__":
    main()
