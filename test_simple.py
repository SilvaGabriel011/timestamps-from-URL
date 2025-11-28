#!/usr/bin/env python3
"""
Simple test script to debug transcription
"""

import os
import sys

# Test imports
try:
    from src.transcriber import transcribe
    print("✓ Transcriber imported")
except Exception as e:
    print(f"✗ Failed to import transcriber: {e}")
    sys.exit(1)

try:
    from src.downloader import download_audio
    print("✓ Downloader imported")
except Exception as e:
    print(f"✗ Failed to import downloader: {e}")
    sys.exit(1)

# Test with a short video
test_url = "https://www.youtube.com/watch?v=jNQXAC9IVRw"  # "Me at the zoo" - 19 seconds
print(f"\nTesting with short video: {test_url}")

try:
    # Download
    print("\n1. Downloading audio...")
    audio_info = download_audio(test_url, "./test_output")
    print(f"   ✓ Downloaded: {audio_info.audio_path}")
    print(f"   Duration: {audio_info.video_info.duration}s")
    
    # Transcribe with tiny model for speed
    print("\n2. Transcribing with tiny model...")
    transcript = transcribe(
        audio_info.audio_path,
        model_size="tiny",
        language="en"
    )
    print(f"   ✓ Language detected: {transcript.language}")
    print(f"   ✓ Segments: {len(transcript.segments)}")
    
    # Print segments
    print("\n3. Transcript segments:")
    for i, seg in enumerate(transcript.segments[:5]):  # First 5 only
        print(f"   [{seg.start:.1f}s - {seg.end:.1f}s]: {seg.text[:50]}...")
    
    print("\n✓ Test completed successfully!")
    
except Exception as e:
    print(f"\n✗ Test failed: {e}")
    import traceback
    traceback.print_exc()
