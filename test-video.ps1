# Script de teste para diagnosticar problemas com timestamps

param(
    [Parameter(Mandatory=$true)]
    [string]$VideoUrl,
    
    [Parameter(Mandatory=$false)]
    [switch]$ForceWhisper,
    
    [Parameter(Mandatory=$false)]
    [switch]$ClearCache
)

$apiUrl = "http://localhost:8000"

# Extrair video ID da URL
if ($VideoUrl -match "(?:youtube\.com/watch\?v=|youtu\.be/)([^&\n?#]+)") {
    $videoId = $matches[1]
    Write-Host "Video ID: $videoId" -ForegroundColor Cyan
} else {
    Write-Host "URL inválida!" -ForegroundColor Red
    exit 1
}

# Limpar cache se solicitado
if ($ClearCache) {
    Write-Host "`n[1/3] Limpando cache do vídeo..." -ForegroundColor Yellow
    try {
        $response = Invoke-RestMethod -Uri "$apiUrl/api/cache/$videoId?language=pt" -Method Delete
        Write-Host "Cache deletado: $($response.deleted)" -ForegroundColor Green
    } catch {
        Write-Host "Erro ao deletar cache: $_" -ForegroundColor Red
    }
}

# Preparar payload
$body = @{
    url = $VideoUrl
    language = "pt"
    min_segment_duration = 30
}

if ($ForceWhisper) {
    $body.force_whisper = $true
    Write-Host "`n[2/3] Forçando uso do Whisper (speech-to-text)..." -ForegroundColor Yellow
} else {
    Write-Host "`n[2/3] Tentando com legendas primeiro..." -ForegroundColor Yellow
}

# Fazer requisição
Write-Host "[3/3] Processando vídeo... (isso pode demorar)" -ForegroundColor Yellow
Write-Host "Verifique os logs do servidor backend para detalhes!" -ForegroundColor Cyan

try {
    $result = Invoke-RestMethod -Uri "$apiUrl/api/generate" -Method Post -Body ($body | ConvertTo-Json) -ContentType "application/json"
    
    Write-Host "`n=== RESULTADO ===" -ForegroundColor Green
    Write-Host "Video ID: $($result.metadata.video_id)"
    Write-Host "Idioma: $($result.metadata.language)"
    Write-Host "Legendas auto-geradas: $($result.metadata.is_auto_generated)"
    Write-Host "Usou speech-to-text: $($result.metadata.used_speech_to_text)"
    Write-Host "Do cache: $($result.metadata.from_cache)"
    Write-Host "Timestamps validados: $($result.metadata.validated_count) de $($result.metadata.total_candidates)"
    
    Write-Host "`n=== TIMESTAMPS ===" -ForegroundColor Green
    foreach ($ts in $result.timestamps) {
        $minutes = [math]::Floor($ts.time / 60)
        $seconds = $ts.time % 60
        Write-Host "$($minutes):$($seconds.ToString('00')) - $($ts.title) (confiança: $($ts.confidence))"
    }
    
} catch {
    Write-Host "`n=== ERRO ===" -ForegroundColor Red
    $errorResponse = $_.ErrorDetails.Message | ConvertFrom-Json
    Write-Host "Código: $($errorResponse.error.code)"
    Write-Host "Mensagem: $($errorResponse.error.message)"
    Write-Host "Sugestões:"
    foreach ($suggestion in $errorResponse.error.suggestions) {
        Write-Host "  - $suggestion"
    }
}

Write-Host "`n=== DICA ===" -ForegroundColor Cyan
Write-Host "Se recebeu apenas 'Introdução', tente:"
Write-Host "  .\test-video.ps1 -VideoUrl '$VideoUrl' -ClearCache -ForceWhisper"
