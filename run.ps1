# YouTube Timestamp Generator - Script Interativo
# Uso: .\run.ps1

# Configuracoes otimizadas para PORTUGUES BRASILEIRO (GPU + DeepSeek)
$WhisperModel = "medium"
$OllamaModel = "deepseek-v2:16b"
$Language = "pt"  # Portugues Brasileiro - FIXO

# Encontrar Python
$pythonPath = "$env:LOCALAPPDATA\Programs\Python\Python312\python.exe"
if (-not (Test-Path $pythonPath)) {
    $pythonPath = "python"
}

# IMPORTANTE: Adicionar DLLs CUDA ao PATH
$cudaDllPath = "$env:LOCALAPPDATA\Programs\Python\Python312\Lib\site-packages\nvidia\cublas\bin"
$cudnnDllPath = "$env:LOCALAPPDATA\Programs\Python\Python312\Lib\site-packages\nvidia\cudnn\bin"
if (Test-Path $cudaDllPath) {
    $env:PATH = "$cudaDllPath;$cudnnDllPath;$env:PATH"
}

# Banner
Clear-Host
Write-Host ""
Write-Host "  =========================================" -ForegroundColor Cyan
Write-Host "       YouTube Timestamp Generator" -ForegroundColor Cyan
Write-Host "  GPU: RTX 3050 | Whisper: $WhisperModel | DeepSeek" -ForegroundColor Cyan
Write-Host "  =========================================" -ForegroundColor Cyan
Write-Host ""

# Pedir URL se nao foi passada como argumento
if ($args.Count -eq 0) {
    Add-Type -AssemblyName Microsoft.VisualBasic
    $url = [Microsoft.VisualBasic.Interaction]::InputBox("Cole a URL do video do YouTube:", "YouTube Timestamp Generator", "")
} else {
    $url = $args[0]
}

# Validar URL
if ([string]::IsNullOrWhiteSpace($url)) {
    Write-Host "  [ERRO] URL nao pode ser vazia!" -ForegroundColor Red
    exit 1
}

# Verificar se Ollama esta rodando
try {
    $null = Invoke-WebRequest -Uri "http://localhost:11434/api/tags" -TimeoutSec 3 -ErrorAction SilentlyContinue
} catch {
    Write-Host "  [!] Ollama nao esta rodando. Iniciando..." -ForegroundColor Yellow
    Start-Process "ollama" -ArgumentList "serve" -WindowStyle Hidden
    Start-Sleep -Seconds 3
}

Write-Host "  -----------------------------------------" -ForegroundColor DarkGray
Write-Host "  Processando: $url" -ForegroundColor White
Write-Host "  -----------------------------------------" -ForegroundColor DarkGray
Write-Host ""

# Executar com GPU
& $pythonPath main.py $url -m $WhisperModel --ollama-model $OllamaModel -l $Language

Write-Host ""
Write-Host "  -----------------------------------------" -ForegroundColor DarkGray
Write-Host "  Concluido! Arquivos salvos em: ./output" -ForegroundColor Green
Write-Host "  -----------------------------------------" -ForegroundColor DarkGray
Write-Host ""
