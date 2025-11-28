"""
Timestamp Analyzer - Generates timestamps using heuristics and pattern analysis
Optimized for long videos and Portuguese content
"""

import re
from dataclasses import dataclass
from typing import List, Tuple, Dict, Optional
from collections import defaultdict

from .transcriber import Transcript, TranscriptSegment, format_time


@dataclass
class TopicCluster:
    """A cluster of related segments forming a topic"""
    start: float
    end: float
    segments: List[TranscriptSegment]
    title: str = ""
    keywords: List[str] = None
    
    def __post_init__(self):
        if self.keywords is None:
            self.keywords = []


class TimestampAnalyzer:
    """Analyzes transcript to generate timestamps using heuristics"""
    
    # Portuguese transition markers
    PT_TRANSITIONS = [
        # Strong topic changes
        r'\b(agora|então|bom|bem|ok|okay|tá|certo)\b',
        r'\b(vamos falar|vamos ver|vamos começar|vou mostrar)\b',
        r'\b(primeiro|segundo|terceiro|próximo|outro ponto|outra coisa)\b',
        r'\b(passando para|mudando de assunto|falando sobre|voltando)\b',
        
        # Section markers
        r'\b(introdução|conclusão|resumo|exemplo|demonstração)\b',
        r'\b(passo \d+|etapa \d+|parte \d+|seção \d+)\b',
        r'\b(pergunta|resposta|dúvida|questão)\b',
        
        # Content markers
        r'\b(importante|principal|fundamental|essencial|crítico)\b',
        r'\b(problema|solução|desafio|oportunidade)\b',
        r'\b(vantagem|desvantagem|prós|contras|benefício)\b',
    ]
    
    # English transition markers
    EN_TRANSITIONS = [
        r'\b(now|so|well|okay|alright|right)\b',
        r'\b(let\'s talk|let\'s see|let\'s start|I\'ll show)\b',
        r'\b(first|second|third|next|another point)\b',
        r'\b(moving on|switching to|talking about|going back)\b',
        
        r'\b(introduction|conclusion|summary|example|demo)\b',
        r'\b(step \d+|stage \d+|part \d+|section \d+)\b',
        r'\b(question|answer|doubt|issue)\b',
    ]
    
    def __init__(self, language: str = 'pt'):
        """Initialize analyzer with language-specific patterns"""
        self.language = language.lower() if language else 'pt'
        self.transitions = self.PT_TRANSITIONS if 'pt' in self.language else self.EN_TRANSITIONS
        
    def analyze(
        self,
        transcript: Transcript,
        min_duration: int = 45,
        target_count: Optional[int] = None
    ) -> List[TopicCluster]:
        """
        Analyze transcript and generate topic clusters.
        
        Args:
            transcript: The transcript to analyze
            min_duration: Minimum seconds between timestamps
            target_count: Target number of timestamps (auto-calculated if None)
            
        Returns:
            List of topic clusters with timestamps
        """
        if not transcript.segments:
            return []
        
        # Calculate target timestamp count based on duration
        if target_count is None:
            # For long videos: ~1 timestamp per 2-3 minutes
            minutes = transcript.duration / 60
            if minutes < 10:
                target_count = max(3, int(minutes / 2))  # 1 per 2 min
            elif minutes < 30:
                target_count = max(5, int(minutes / 2.5))  # 1 per 2.5 min
            else:
                target_count = max(10, int(minutes / 3))  # 1 per 3 min
            
            # Cap at reasonable maximum
            target_count = min(target_count, 25)
        
        print(f"[Analyzer] Target timestamps: {target_count} for {format_time(transcript.duration)} video")
        
        # Step 1: Detect natural breaks and transitions
        break_points = self._find_break_points(transcript)
        print(f"[Analyzer] Found {len(break_points)} potential break points")
        
        # Step 2: Cluster segments into topics
        clusters = self._cluster_segments(transcript, break_points, min_duration)
        print(f"[Analyzer] Created {len(clusters)} initial clusters")
        
        # Step 3: Merge or split to reach target count
        clusters = self._optimize_cluster_count(clusters, target_count, min_duration)
        print(f"[Analyzer] Optimized to {len(clusters)} clusters")
        
        # Step 4: Generate titles for each cluster
        for cluster in clusters:
            cluster.title = self._generate_cluster_title(cluster)
        
        return clusters
    
    def _find_break_points(self, transcript: Transcript) -> List[int]:
        """Find natural break points in the transcript"""
        break_points = set([0])  # Always start with index 0
        
        for i, segment in enumerate(transcript.segments):
            if i == 0:
                continue
                
            # Check for long pauses (>2 seconds)
            prev_segment = transcript.segments[i-1]
            pause_duration = segment.start - prev_segment.end
            if pause_duration > 2.0:
                break_points.add(i)
                continue
            
            # Check for transition markers
            text_lower = segment.text.lower()
            for pattern in self.transitions:
                if re.search(pattern, text_lower):
                    break_points.add(i)
                    break
            
            # Check for significant time jumps (>30 seconds since last break)
            if i > 0 and i-1 not in break_points:
                time_since_last = segment.start - transcript.segments[max(break_points)].start
                if time_since_last > 120:  # Force break every 2 minutes minimum
                    break_points.add(i)
        
        return sorted(list(break_points))
    
    def _cluster_segments(
        self,
        transcript: Transcript,
        break_points: List[int],
        min_duration: int
    ) -> List[TopicCluster]:
        """Cluster segments into topics based on break points"""
        clusters = []
        
        for i, start_idx in enumerate(break_points):
            # Find end index for this cluster
            end_idx = break_points[i+1] if i+1 < len(break_points) else len(transcript.segments)
            
            if end_idx <= start_idx:
                continue
            
            # Get segments for this cluster
            cluster_segments = transcript.segments[start_idx:end_idx]
            
            # Skip very short clusters initially
            duration = cluster_segments[-1].end - cluster_segments[0].start
            if duration < min_duration / 2 and len(clusters) > 0:
                # Merge with previous cluster
                clusters[-1].segments.extend(cluster_segments)
                clusters[-1].end = cluster_segments[-1].end
            else:
                cluster = TopicCluster(
                    start=cluster_segments[0].start,
                    end=cluster_segments[-1].end,
                    segments=cluster_segments
                )
                clusters.append(cluster)
        
        return clusters
    
    def _optimize_cluster_count(
        self,
        clusters: List[TopicCluster],
        target_count: int,
        min_duration: int
    ) -> List[TopicCluster]:
        """Optimize cluster count to reach target"""
        
        # If we have too many clusters, merge the shortest ones
        while len(clusters) > target_count and len(clusters) > 1:
            # Find shortest cluster that can be merged
            min_duration_cluster = None
            min_duration_value = float('inf')
            
            for i in range(len(clusters)):
                duration = clusters[i].end - clusters[i].start
                if duration < min_duration_value:
                    # Check if we can merge with neighbor
                    if i > 0 or i < len(clusters) - 1:
                        min_duration_value = duration
                        min_duration_cluster = i
            
            if min_duration_cluster is None:
                break
            
            # Merge with neighbor
            i = min_duration_cluster
            if i > 0 and (i == len(clusters) - 1 or 
                         (clusters[i-1].end - clusters[i-1].start) < 
                         (clusters[i+1].end - clusters[i+1].start)):
                # Merge with previous
                clusters[i-1].segments.extend(clusters[i].segments)
                clusters[i-1].end = clusters[i].end
                del clusters[i]
            elif i < len(clusters) - 1:
                # Merge with next
                clusters[i].segments.extend(clusters[i+1].segments)
                clusters[i].end = clusters[i+1].end
                del clusters[i+1]
        
        # If we have too few clusters, split the longest ones
        while len(clusters) < target_count * 0.7:  # Allow some flexibility
            # Find longest cluster
            max_duration_cluster = None
            max_duration_value = 0
            
            for i, cluster in enumerate(clusters):
                duration = cluster.end - cluster.start
                if duration > max_duration_value and duration > min_duration * 2:
                    max_duration_value = duration
                    max_duration_cluster = i
            
            if max_duration_cluster is None:
                break
            
            # Split at midpoint
            cluster = clusters[max_duration_cluster]
            mid_idx = len(cluster.segments) // 2
            
            if mid_idx > 0:
                # Create two new clusters
                cluster1 = TopicCluster(
                    start=cluster.start,
                    end=cluster.segments[mid_idx-1].end,
                    segments=cluster.segments[:mid_idx]
                )
                cluster2 = TopicCluster(
                    start=cluster.segments[mid_idx].start,
                    end=cluster.end,
                    segments=cluster.segments[mid_idx:]
                )
                
                # Replace original with two new ones
                clusters[max_duration_cluster:max_duration_cluster+1] = [cluster1, cluster2]
        
        return clusters
    
    def _generate_cluster_title(self, cluster: TopicCluster) -> str:
        """Generate a title for a cluster based on its content"""
        
        # Combine all text in cluster
        full_text = " ".join([s.text for s in cluster.segments[:5]])  # First 5 segments
        full_text_lower = full_text.lower()
        
        # Portuguese titles
        if 'pt' in self.language:
            # Check for specific keywords
            if any(word in full_text_lower for word in ['introdução', 'início', 'começo', 'olá', 'bem-vind']):
                return "Introdução"
            elif any(word in full_text_lower for word in ['conclusão', 'final', 'resumo', 'fechamento']):
                return "Conclusão"
            elif any(word in full_text_lower for word in ['exemplo', 'demonstra', 'mostra', 'veja']):
                return "Demonstração Prática"
            elif any(word in full_text_lower for word in ['problema', 'questão', 'desafio', 'dificuld']):
                return "Identificando o Problema"
            elif any(word in full_text_lower for word in ['solução', 'resolver', 'resposta', 'como fazer']):
                return "Solução Proposta"
            elif any(word in full_text_lower for word in ['vantag', 'benefíc', 'positiv', 'melhor']):
                return "Vantagens e Benefícios"
            elif any(word in full_text_lower for word in ['desvantag', 'problema', 'cuidado', 'atenção']):
                return "Pontos de Atenção"
            elif re.search(r'passo \d+|etapa \d+', full_text_lower):
                match = re.search(r'(passo|etapa) (\d+)', full_text_lower)
                return f"{match.group(1).title()} {match.group(2)}"
            
            # Extract most meaningful words (nouns/verbs)
            important_words = self._extract_keywords(full_text, 'pt')
            if important_words:
                return " ".join(important_words[:3]).title()
            
            # Fallback based on position
            position = cluster.start / (cluster.segments[-1].end or 1)
            if position < 0.1:
                return "Abertura"
            elif position > 0.9:
                return "Encerramento"
            else:
                return f"Tópico {int(position * 10)}"
        
        # English titles
        else:
            if any(word in full_text_lower for word in ['introduction', 'intro', 'welcome', 'hello']):
                return "Introduction"
            elif any(word in full_text_lower for word in ['conclusion', 'summary', 'final', 'closing']):
                return "Conclusion"
            elif any(word in full_text_lower for word in ['example', 'demo', 'show', 'see']):
                return "Practical Demo"
            elif any(word in full_text_lower for word in ['problem', 'issue', 'challenge']):
                return "The Problem"
            elif any(word in full_text_lower for word in ['solution', 'solve', 'answer', 'how to']):
                return "The Solution"
            
            important_words = self._extract_keywords(full_text, 'en')
            if important_words:
                return " ".join(important_words[:3]).title()
            
            return f"Topic {int(cluster.start // 60)}"
    
    def _extract_keywords(self, text: str, language: str) -> List[str]:
        """Extract important keywords from text"""
        # Remove common words (stopwords)
        if 'pt' in language:
            stopwords = {'o', 'a', 'de', 'da', 'do', 'em', 'para', 'com', 'por', 'que', 'e', 'é', 
                        'um', 'uma', 'não', 'mas', 'se', 'eu', 'você', 'nós', 'ele', 'ela'}
        else:
            stopwords = {'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
                        'of', 'with', 'by', 'from', 'up', 'about', 'into', 'through', 'during'}
        
        # Extract words
        words = re.findall(r'\b\w{4,}\b', text.lower())
        
        # Filter and count
        word_freq = defaultdict(int)
        for word in words:
            if word not in stopwords and not word.isdigit():
                word_freq[word] += 1
        
        # Sort by frequency
        sorted_words = sorted(word_freq.items(), key=lambda x: x[1], reverse=True)
        
        # Return top words
        return [word for word, _ in sorted_words[:5]]


def generate_timestamps_heuristic(
    transcript: Transcript,
    min_duration: int = 45,
    target_count: Optional[int] = None
) -> List['Timestamp']:
    """
    Generate timestamps using heuristic analysis.
    
    This is a fallback when Ollama is not available or fails.
    Now uses SmartTimestampGenerator for better results.
    
    Args:
        transcript: The transcript to analyze
        min_duration: Minimum seconds between timestamps
        target_count: Target number of timestamps
        
    Returns:
        List of Timestamp objects
    """
    from .timestamp_generator import Timestamp
    
    # Try to get video title from somewhere (fallback to generic)
    video_title = "Vídeo"
    
    # Use the new smart generator
    try:
        from .smart_timestamp_generator import generate_smart_timestamps
        smart_timestamps = generate_smart_timestamps(transcript, video_title, min_duration)
        
        # Convert to Timestamp objects
        timestamps = []
        for ts_dict in smart_timestamps:
            timestamps.append(Timestamp(
                time=ts_dict["time"],
                title=ts_dict["title"],
                confidence=0.8  # Higher confidence with smart system
            ))
        
        print(f"[Analyzer] Generated {len(timestamps)} smart timestamps")
        return timestamps
        
    except Exception as e:
        print(f"[Analyzer] Smart generator failed: {e}, using legacy system")
        
        # Fallback to old system if smart generator fails
        analyzer = TimestampAnalyzer(transcript.language)
        clusters = analyzer.analyze(transcript, min_duration, target_count)
        
        timestamps = []
        for cluster in clusters:
            timestamps.append(Timestamp(
                time=cluster.start,
                title=cluster.title,
                confidence=0.7  # Lower confidence for heuristic
            ))
        
        return timestamps
