#!/usr/bin/env python3
"""
YouTube Timestamp Generator - Local CLI Application

A simple, local-only CLI tool that generates video transcripts and timestamps
from YouTube URLs using local AI models (Whisper + Ollama).

Usage:
    python main.py <youtube_url> [options]

Example:
    python main.py "https://www.youtube.com/watch?v=VIDEO_ID" -o ./output -m base
"""

import argparse
import os
import sys
import tempfile
from pathlib import Path

from src.downloader import download_audio, extract_video_id
from src.transcriber import transcribe
from src.timestamp_generator import generate_timestamps, check_ollama_available
from src.exporter import export_all


def print_banner():
    """Print application banner."""
    print("""
╔═══════════════════════════════════════════════════════════╗
║         YouTube Timestamp Generator (Local)               ║
║                                                           ║
║  Generates transcripts and timestamps from YouTube        ║
║  videos using local AI models - 100% free, no APIs!       ║
╚═══════════════════════════════════════════════════════════╝
    """)


def check_dependencies():
    """Check if all required dependencies are available."""
    errors = []
    
    # Check yt-dlp
    try:
        import subprocess
        result = subprocess.run(['yt-dlp', '--version'], capture_output=True, timeout=5)
        if result.returncode != 0:
            errors.append("yt-dlp is not working properly")
    except FileNotFoundError:
        errors.append("yt-dlp is not installed. Install with: pip install yt-dlp")
    except Exception as e:
        errors.append(f"yt-dlp check failed: {e}")
    
    # Check faster-whisper
    try:
        import faster_whisper
    except ImportError:
        errors.append("faster-whisper is not installed. Install with: pip install faster-whisper")
    
    # Check requests
    try:
        import requests
    except ImportError:
        errors.append("requests is not installed. Install with: pip install requests")
    
    # Check Ollama
    if not check_ollama_available():
        errors.append(
            "Ollama is not running. Start it with:\n"
            "    ollama serve\n"
            "    ollama pull llama3.2"
        )
    
    return errors


def main():
    """Main entry point."""
    parser = argparse.ArgumentParser(
        description="Generate transcripts and timestamps from YouTube videos using local AI",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python main.py "https://www.youtube.com/watch?v=VIDEO_ID"
  python main.py "https://youtu.be/VIDEO_ID" -o ./my_output -m small
  python main.py "VIDEO_ID" --language pt --min-duration 60

Output files:
  <video_id>_transcript.txt   - Full transcript with timestamps
  <video_id>_timestamps.txt   - YouTube-ready timestamp list
  <video_id>_timestamps.json  - Structured timestamp data
        """
    )
    
    parser.add_argument(
        'url',
        help='YouTube video URL or video ID'
    )
    
    parser.add_argument(
        '-o', '--output',
        default='./output',
        help='Output directory (default: ./output)'
    )
    
    parser.add_argument(
        '-m', '--model',
        default='base',
        choices=['tiny', 'base', 'small', 'medium', 'large-v3'],
        help='Whisper model size (default: base)'
    )
    
    parser.add_argument(
        '-l', '--language',
        default=None,
        help='Preferred language code (e.g., en, pt, es). Default: auto-detect'
    )
    
    parser.add_argument(
        '--min-duration',
        type=int,
        default=30,
        help='Minimum seconds between timestamps (default: 30)'
    )
    
    parser.add_argument(
        '--ollama-model',
        default='llama3.2',
        help='Ollama model for timestamp generation (default: llama3.2)'
    )
    
    parser.add_argument(
        '--ollama-url',
        default='http://localhost:11434',
        help='Ollama server URL (default: http://localhost:11434)'
    )
    
    parser.add_argument(
        '--keep-audio',
        action='store_true',
        help='Keep downloaded audio file after processing'
    )
    
    parser.add_argument(
        '--skip-timestamps',
        action='store_true',
        help='Only generate transcript, skip timestamp generation'
    )
    
    parser.add_argument(
        '-q', '--quiet',
        action='store_true',
        help='Suppress progress messages'
    )
    
    args = parser.parse_args()
    
    if not args.quiet:
        print_banner()
    
    # Validate URL
    video_id = extract_video_id(args.url)
    if not video_id:
        print(f"Error: Invalid YouTube URL or video ID: {args.url}")
        print("Supported formats:")
        print("  - https://www.youtube.com/watch?v=VIDEO_ID")
        print("  - https://youtu.be/VIDEO_ID")
        print("  - VIDEO_ID (11 characters)")
        sys.exit(1)
    
    # Check dependencies
    if not args.quiet:
        print("Checking dependencies...")
    
    errors = check_dependencies()
    if errors:
        print("\nDependency errors found:")
        for error in errors:
            print(f"  - {error}")
        sys.exit(1)
    
    if not args.quiet:
        print("All dependencies OK!\n")
    
    # Create output directory
    output_dir = Path(args.output)
    output_dir.mkdir(parents=True, exist_ok=True)
    
    # Temporary directory for audio
    temp_dir = tempfile.mkdtemp(prefix="yt_timestamp_")
    
    try:
        # Step 1: Download audio
        if not args.quiet:
            print("=" * 60)
            print("STEP 1/3: Downloading audio from YouTube")
            print("=" * 60)
        
        audio_info = download_audio(args.url, temp_dir)
        video_title = audio_info.video_info.title
        
        if not args.quiet:
            print(f"Video: {video_title}")
            print(f"Duration: {audio_info.video_info.duration // 60}m {audio_info.video_info.duration % 60}s")
            print()
        
        # Step 2: Transcribe audio
        if not args.quiet:
            print("=" * 60)
            print("STEP 2/3: Transcribing audio with Whisper")
            print("=" * 60)
        
        transcript = transcribe(
            audio_info.audio_path,
            model_size=args.model,
            language=args.language
        )
        
        if not args.quiet:
            print(f"Language: {transcript.language}")
            print(f"Segments: {len(transcript.segments)}")
            print()
        
        # Step 3: Generate timestamps (optional)
        timestamps = []
        if not args.skip_timestamps:
            if not args.quiet:
                print("=" * 60)
                print("STEP 3/3: Generating timestamps with Ollama")
                print("=" * 60)
            
            timestamps = generate_timestamps(
                transcript,
                video_title,
                min_duration=args.min_duration,
                ollama_url=args.ollama_url,
                model=args.ollama_model
            )
            
            if not args.quiet:
                print(f"Generated {len(timestamps)} timestamps")
                print()
        else:
            if not args.quiet:
                print("Skipping timestamp generation (--skip-timestamps)")
                print()
        
        # Step 4: Export results
        if not args.quiet:
            print("=" * 60)
            print("Exporting results")
            print("=" * 60)
        
        paths = export_all(
            transcript,
            timestamps,
            str(output_dir),
            video_id,
            video_title
        )
        
        # Print summary
        if not args.quiet:
            print()
            print("=" * 60)
            print("COMPLETE!")
            print("=" * 60)
            print()
            print("Output files:")
            for name, path in paths.items():
                print(f"  - {path}")
            print()
            
            if timestamps:
                print("Generated timestamps:")
                print("-" * 40)
                for ts in timestamps:
                    from src.transcriber import format_time
                    print(f"  {format_time(ts.time)} - {ts.title}")
                print("-" * 40)
        
        # Optionally keep audio
        if args.keep_audio:
            import shutil
            audio_dest = output_dir / f"{video_id}_audio.mp3"
            shutil.copy(audio_info.audio_path, audio_dest)
            if not args.quiet:
                print(f"\nAudio saved to: {audio_dest}")
        
        return 0
        
    except KeyboardInterrupt:
        print("\n\nInterrupted by user")
        return 130
        
    except Exception as e:
        print(f"\nError: {e}")
        return 1
        
    finally:
        # Cleanup temp directory
        if not args.keep_audio:
            import shutil
            try:
                shutil.rmtree(temp_dir)
            except Exception:
                pass


if __name__ == "__main__":
    sys.exit(main())
