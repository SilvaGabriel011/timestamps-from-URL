"""
Smart Timestamp Generator - Geração inteligente de timestamps para PT-BR
Analisa conteúdo real do vídeo para criar timestamps significativos
"""

import re
from dataclasses import dataclass
from typing import List, Dict, Tuple, Optional
from collections import Counter
import json

try:
    from .transcriber import Transcript, TranscriptSegment, format_time
except ImportError:
    from transcriber import Transcript, TranscriptSegment, format_time


@dataclass
class ContentWindow:
    """Janela de conteúdo do vídeo"""
    start: float
    end: float
    segments: List[TranscriptSegment]
    full_text: str
    summary: str = ""
    main_topics: List[str] = None
    
    def __post_init__(self):
        if self.main_topics is None:
            self.main_topics = []
        if not self.full_text:
            self.full_text = " ".join([s.text for s in self.segments])


class SmartTimestampGenerator:
    """Gerador inteligente de timestamps para vídeos em PT-BR"""
    
    # Palavras que indicam início de tópico
    TOPIC_STARTERS = [
        "primeiro", "segundo", "terceiro", "próximo",
        "agora", "então", "vamos falar", "vamos ver",
        "outro ponto", "outra coisa", "passando para",
        "sobre", "quanto a", "em relação a", "falando sobre",
        "começando", "iniciando", "partindo"
    ]
    
    # Palavras comuns que devem ser removidas dos títulos
    STOPWORDS = {
        'o', 'a', 'os', 'as', 'um', 'uma', 'de', 'da', 'do', 'em', 'para',
        'com', 'por', 'que', 'é', 'não', 'mas', 'se', 'eu', 'você', 'nós',
        'ele', 'ela', 'isso', 'isso', 'aqui', 'ali', 'lá', 'onde', 'quando',
        'como', 'porque', 'então', 'né', 'tá', 'tipo', 'assim', 'aí', 'daí',
        'gente', 'galera', 'pessoal', 'cara', 'mano', 'beleza', 'show'
    }
    
    # Tópicos comuns em vídeos de dev/tech
    COMMON_TOPICS = {
        'introdução': ['olá', 'bem-vindo', 'hoje', 'vamos', 'falar', 'vídeo'],
        'configuração': ['instalar', 'configurar', 'setup', 'ambiente', 'preparar'],
        'conceitos': ['o que é', 'como funciona', 'entender', 'básico', 'fundamental'],
        'prática': ['exemplo', 'demonstração', 'vamos fazer', 'código', 'implementar'],
        'erros': ['erro', 'problema', 'bug', 'falha', 'não funciona', 'corrigir'],
        'dicas': ['dica', 'truque', 'macete', 'melhor forma', 'recomendo'],
        'recursos': ['ferramenta', 'biblioteca', 'framework', 'package', 'módulo'],
        'carreira': ['junior', 'sênior', 'mercado', 'trabalho', 'emprego', 'salário'],
        'conclusão': ['resumo', 'concluir', 'final', 'encerrar', 'tchau', 'até']
    }
    
    def __init__(self):
        """Inicializa o gerador"""
        pass
    
    def generate(
        self,
        transcript: Transcript,
        video_title: str,
        min_duration: int = 60,
        window_size: int = 120  # 2 minutos por janela
    ) -> List[Dict]:
        """
        Gera timestamps inteligentes analisando o conteúdo
        
        Args:
            transcript: Transcrição completa
            video_title: Título do vídeo
            min_duration: Segundos mínimos entre timestamps
            window_size: Tamanho da janela de análise em segundos
        
        Returns:
            Lista de timestamps com time e title
        """
        if not transcript.segments:
            return [{"time": 0, "title": "Início do Vídeo"}]
        
        print(f"[SmartGen] Analisando {len(transcript.segments)} segmentos...")
        print(f"[SmartGen] Vídeo: {video_title} ({format_time(transcript.duration)})")
        
        # Criar janelas de conteúdo
        windows = self._create_content_windows(transcript, window_size)
        print(f"[SmartGen] Criadas {len(windows)} janelas de análise")
        
        # Detectar mudanças significativas
        topic_changes = self._detect_topic_changes(windows)
        print(f"[SmartGen] Detectadas {len(topic_changes)} mudanças de tópico")
        
        # Gerar timestamps finais
        timestamps = self._generate_final_timestamps(
            windows, topic_changes, video_title, min_duration
        )
        
        return timestamps
    
    def _create_content_windows(
        self,
        transcript: Transcript,
        window_size: int
    ) -> List[ContentWindow]:
        """Divide a transcrição em janelas de tempo para análise"""
        windows = []
        current_segments = []
        window_start = 0
        
        for segment in transcript.segments:
            current_segments.append(segment)
            
            # Verifica se chegou ao tamanho da janela
            if segment.end - window_start >= window_size:
                window = ContentWindow(
                    start=window_start,
                    end=segment.end,
                    segments=current_segments.copy(),
                    full_text=" ".join([s.text for s in current_segments])
                )
                window.summary = self._summarize_window(window)
                window.main_topics = self._extract_main_topics(window)
                windows.append(window)
                
                # Próxima janela
                window_start = segment.end
                current_segments = []
        
        # Adiciona última janela se houver segmentos restantes
        if current_segments:
            window = ContentWindow(
                start=window_start,
                end=current_segments[-1].end,
                segments=current_segments,
                full_text=" ".join([s.text for s in current_segments])
            )
            window.summary = self._summarize_window(window)
            window.main_topics = self._extract_main_topics(window)
            windows.append(window)
        
        return windows
    
    def _summarize_window(self, window: ContentWindow) -> str:
        """Cria um resumo do conteúdo da janela"""
        text = window.full_text.lower()
        
        # Identificar tópico principal baseado em palavras-chave
        for topic, keywords in self.COMMON_TOPICS.items():
            if any(kw in text for kw in keywords):
                return topic
        
        # Se não encontrar tópico específico, usa palavras mais frequentes
        words = re.findall(r'\b[a-záêõç]{4,}\b', text)
        words = [w for w in words if w not in self.STOPWORDS]
        
        if words:
            word_freq = Counter(words)
            top_words = word_freq.most_common(3)
            return " ".join([w[0] for w in top_words])
        
        return "conteúdo"
    
    def _extract_main_topics(self, window: ContentWindow) -> List[str]:
        """Extrai os principais tópicos mencionados na janela"""
        text = window.full_text.lower()
        topics = []
        
        # Buscar conceitos técnicos
        tech_terms = re.findall(
            r'\b(?:javascript|python|react|node|api|backend|frontend|'
            r'database|servidor|código|programação|desenvolvimento|'
            r'função|variável|classe|método|array|objeto|loop|'
            r'git|github|deploy|docker|aws|vscode)\b',
            text, re.IGNORECASE
        )
        
        if tech_terms:
            topics.extend(list(set(tech_terms[:3])))
        
        # Buscar ações mencionadas
        actions = re.findall(
            r'\b(?:criar|fazer|implementar|desenvolver|construir|'
            r'configurar|instalar|testar|debugar|resolver|'
            r'aprender|estudar|entender|explicar)\b',
            text
        )
        
        if actions:
            topics.append(actions[0])
        
        return topics
    
    def _detect_topic_changes(self, windows: List[ContentWindow]) -> List[int]:
        """Detecta mudanças significativas de tópico entre janelas"""
        changes = [0]  # Sempre começa com timestamp 0
        
        for i in range(1, len(windows)):
            prev_window = windows[i-1]
            curr_window = windows[i]
            
            # Verifica mudança de resumo/tópico
            if prev_window.summary != curr_window.summary:
                changes.append(i)
                continue
            
            # Verifica se há marcadores de transição
            first_text = " ".join([s.text for s in curr_window.segments[:3]]).lower()
            if any(starter in first_text for starter in self.TOPIC_STARTERS):
                changes.append(i)
                continue
            
            # Verifica mudança significativa nos tópicos principais
            prev_topics = set(prev_window.main_topics)
            curr_topics = set(curr_window.main_topics)
            
            if prev_topics and curr_topics:
                similarity = len(prev_topics & curr_topics) / len(prev_topics | curr_topics)
                if similarity < 0.3:  # Menos de 30% de similaridade
                    changes.append(i)
        
        return changes
    
    def _generate_final_timestamps(
        self,
        windows: List[ContentWindow],
        topic_changes: List[int],
        video_title: str,
        min_duration: int
    ) -> List[Dict]:
        """Gera os timestamps finais com títulos apropriados"""
        timestamps = []
        
        # Para cada mudança de tópico, criar um timestamp
        for i, window_idx in enumerate(topic_changes):
            window = windows[window_idx]
            
            # Pular se muito próximo do anterior
            if timestamps and window.start - timestamps[-1]["time"] < min_duration:
                continue
            
            # Gerar título baseado no conteúdo
            title = self._create_title_for_window(window, video_title, i == 0)
            
            timestamps.append({
                "time": int(window.start),
                "title": title
            })
        
        # Garantir quantidade razoável de timestamps
        target_count = max(8, int(windows[-1].end / 180))  # ~1 a cada 3 min
        
        if len(timestamps) < target_count:
            # Adicionar timestamps extras em intervalos regulares
            interval = windows[-1].end / target_count
            for i in range(len(timestamps), target_count):
                time = int(i * interval)
                # Encontrar janela correspondente
                for window in windows:
                    if window.start <= time <= window.end:
                        title = self._create_title_for_window(window, video_title, False)
                        if not any(ts["time"] == time for ts in timestamps):
                            timestamps.append({"time": time, "title": title})
                        break
        
        # Ordenar por tempo e limitar quantidade
        timestamps.sort(key=lambda x: x["time"])
        timestamps = timestamps[:20]  # Máximo 20 timestamps
        
        # Garantir título único para cada timestamp
        seen_titles = set()
        for ts in timestamps:
            if ts["title"] in seen_titles:
                # Adicionar número se título repetido
                counter = 2
                original = ts["title"]
                while ts["title"] in seen_titles:
                    ts["title"] = f"{original} - Parte {counter}"
                    counter += 1
            seen_titles.add(ts["title"])
        
        return timestamps
    
    def _create_title_for_window(
        self,
        window: ContentWindow,
        video_title: str,
        is_first: bool
    ) -> str:
        """Cria um título apropriado para a janela de conteúdo"""
        
        # Primeiro timestamp
        if is_first:
            if "junior" in video_title.lower() or "jr" in video_title.lower():
                return "O que um dev junior precisa saber"
            return "Introdução"
        
        # Baseado no resumo
        topic_titles = {
            'introdução': 'Apresentação do conteúdo',
            'configuração': 'Configurando o ambiente',
            'conceitos': 'Conceitos fundamentais',
            'prática': 'Exemplo prático',
            'erros': 'Erros comuns',
            'dicas': 'Dicas importantes',
            'recursos': 'Ferramentas e recursos',
            'carreira': 'Sobre a carreira',
            'conclusão': 'Considerações finais'
        }
        
        if window.summary in topic_titles:
            return topic_titles[window.summary]
        
        # Baseado nos tópicos principais
        if window.main_topics:
            # Se tem termos técnicos específicos
            tech_terms = ['javascript', 'python', 'react', 'node', 'api', 
                         'backend', 'frontend', 'git', 'docker']
            for term in window.main_topics:
                if term in tech_terms:
                    return f"Trabalhando com {term.title()}"
            
            # Usar primeiro tópico principal
            first_topic = window.main_topics[0]
            if len(first_topic) > 3:
                return first_topic.title()
        
        # Buscar frases importantes no início da janela
        first_sentences = " ".join([s.text for s in window.segments[:3]])
        
        # Procurar padrões específicos
        patterns = [
            (r'o que é\s+(\w+)', lambda m: f"O que é {m.group(1)}"),
            (r'como\s+(\w+)', lambda m: f"Como {m.group(1)}"),
            (r'vamos\s+(\w+)', lambda m: f"Vamos {m.group(1)}"),
            (r'(\w+)\s+é importante', lambda m: f"{m.group(1).title()} é importante"),
            (r'problema\s+(?:do|da|com)\s+(\w+)', lambda m: f"Problema com {m.group(1)}"),
        ]
        
        for pattern, formatter in patterns:
            match = re.search(pattern, first_sentences.lower())
            if match:
                return formatter(match)
        
        # Fallback genérico baseado na posição
        position = window.start / window.end
        if position < 0.2:
            return "Contexto inicial"
        elif position < 0.4:
            return "Desenvolvendo a ideia"
        elif position < 0.6:
            return "Ponto principal"
        elif position < 0.8:
            return "Aprofundando o tema"
        else:
            return "Conclusões"


def generate_smart_timestamps(
    transcript: Transcript,
    video_title: str,
    min_duration: int = 60
) -> List[Dict]:
    """
    Função principal para gerar timestamps inteligentes
    
    Args:
        transcript: Transcrição do vídeo
        video_title: Título do vídeo
        min_duration: Segundos mínimos entre timestamps
    
    Returns:
        Lista de timestamps com time e title
    """
    generator = SmartTimestampGenerator()
    return generator.generate(transcript, video_title, min_duration)
