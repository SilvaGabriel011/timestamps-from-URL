"""
Downloader Module - Downloads audio from YouTube videos using yt-dlp
"""

import os
import re
import subprocess
import tempfile
from dataclasses import dataclass
from typing import Optional


@dataclass
class VideoInfo:
    """Information about a YouTube video"""
    video_id: str
    title: str
    duration: int  # seconds


@dataclass
class AudioInfo:
    """Information about downloaded audio"""
    video_info: VideoInfo
    audio_path: str


def extract_video_id(url: str) -> Optional[str]:
    """
    Extract video ID from various YouTube URL formats.
    
    Supports:
    - https://www.youtube.com/watch?v=VIDEO_ID
    - https://youtu.be/VIDEO_ID
    - https://www.youtube.com/embed/VIDEO_ID
    - https://www.youtube.com/shorts/VIDEO_ID
    """
    patterns = [
        r'(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})',
        r'^([a-zA-Z0-9_-]{11})$'  # Just the video ID
    ]
    
    for pattern in patterns:
        match = re.search(pattern, url)
        if match:
            return match.group(1)
    
    return None


def get_video_info(url: str) -> VideoInfo:
    """
    Get video information using yt-dlp.
    
    Args:
        url: YouTube video URL
        
    Returns:
        VideoInfo with video_id, title, and duration
        
    Raises:
        ValueError: If URL is invalid or video not found
    """
    video_id = extract_video_id(url)
    if not video_id:
        raise ValueError(f"Invalid YouTube URL: {url}")
    
    try:
        result = subprocess.run(
            [
                'yt-dlp',
                '--print', '%(title)s',
                '--print', '%(duration)s',
                '--no-download',
                '--no-warnings',
                url
            ],
            capture_output=True,
            text=True,
            timeout=30
        )
        
        if result.returncode != 0:
            raise ValueError(f"Failed to get video info: {result.stderr}")
        
        lines = result.stdout.strip().split('\n')
        if len(lines) < 2:
            raise ValueError("Could not parse video info")
        
        title = lines[0]
        duration = int(float(lines[1])) if lines[1] else 0
        
        return VideoInfo(
            video_id=video_id,
            title=title,
            duration=duration
        )
        
    except subprocess.TimeoutExpired:
        raise ValueError("Timeout while fetching video info")
    except Exception as e:
        raise ValueError(f"Error getting video info: {e}")


def download_audio(url: str, output_dir: Optional[str] = None) -> AudioInfo:
    """
    Download audio from a YouTube video.
    
    Args:
        url: YouTube video URL
        output_dir: Directory to save audio file (default: temp directory)
        
    Returns:
        AudioInfo with video info and path to audio file
        
    Raises:
        ValueError: If download fails
    """
    video_info = get_video_info(url)
    
    if output_dir is None:
        output_dir = tempfile.gettempdir()
    
    os.makedirs(output_dir, exist_ok=True)
    
    # Clean filename
    safe_title = re.sub(r'[^\w\s-]', '', video_info.title)[:50]
    output_path = os.path.join(output_dir, f"{video_info.video_id}_{safe_title}.mp3")
    
    print(f"[Downloader] Downloading audio for: {video_info.title}")
    print(f"[Downloader] Duration: {video_info.duration // 60}m {video_info.duration % 60}s")
    
    try:
        result = subprocess.run(
            [
                'yt-dlp',
                '-x',  # Extract audio
                '--audio-format', 'mp3',
                '--audio-quality', '0',  # Best quality
                '-o', output_path,
                '--no-warnings',
                '--no-playlist',
                url
            ],
            capture_output=True,
            text=True,
            timeout=300  # 5 minutes max
        )
        
        if result.returncode != 0:
            raise ValueError(f"Download failed: {result.stderr}")
        
        # yt-dlp might add extension, check for the file
        if not os.path.exists(output_path):
            # Try with .mp3 extension added
            if os.path.exists(output_path + '.mp3'):
                output_path = output_path + '.mp3'
            else:
                raise ValueError("Audio file not found after download")
        
        file_size = os.path.getsize(output_path) / (1024 * 1024)  # MB
        print(f"[Downloader] Downloaded {file_size:.1f}MB audio file")
        
        return AudioInfo(
            video_info=video_info,
            audio_path=output_path
        )
        
    except subprocess.TimeoutExpired:
        raise ValueError("Download timeout - video may be too long")
    except Exception as e:
        raise ValueError(f"Download error: {e}")


if __name__ == "__main__":
    # Test the downloader
    import sys
    if len(sys.argv) > 1:
        url = sys.argv[1]
        try:
            info = download_audio(url)
            print(f"Downloaded: {info.audio_path}")
        except Exception as e:
            print(f"Error: {e}")
    else:
        print("Usage: python downloader.py <youtube_url>")
