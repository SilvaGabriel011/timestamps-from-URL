# ============================================
# YouTube Timestamp Generator - GPU Mode
# Otimizado para RTX 3060 6GB
# ============================================

param(
    [Parameter(Position=0)]
    [string]$Url,
    
    [Alias("m")]
    [ValidateSet("tiny", "base", "small", "medium", "large-v3")]
    [string]$Model = "small",
    
    [Alias("l")]
    [string]$Language = "pt",
    
    [int]$MinDuration = 45,
    
    [switch]$SkipTimestamps
)

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  YouTube Timestamp Generator (GPU)" -ForegroundColor Cyan
Write-Host "  RTX 3060 6GB - CUDA Enabled" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Encontrar Python
$PythonPaths = @(
    "$env:LOCALAPPDATA\Programs\Python\Python312\python.exe",
    "$env:LOCALAPPDATA\Programs\Python\Python311\python.exe",
    "$env:LOCALAPPDATA\Programs\Python\Python310\python.exe",
    "python"
)

$Python = $null
foreach ($path in $PythonPaths) {
    if (Test-Path $path -ErrorAction SilentlyContinue) {
        $Python = $path
        break
    }
    if ($path -eq "python") {
        try {
            $null = & python --version 2>&1
            $Python = "python"
            break
        } catch {}
    }
}

if (-not $Python) {
    Write-Host "ERRO: Python nao encontrado!" -ForegroundColor Red
    exit 1
}

# Verificar CUDA
Write-Host "[GPU] Verificando CUDA..." -ForegroundColor Yellow
$cudaCheck = & $Python -c "import torch; print(torch.cuda.is_available())" 2>&1
if ($cudaCheck -eq "True") {
    $gpuName = & $Python -c "import torch; print(torch.cuda.get_device_name(0))" 2>&1
    Write-Host "[GPU] CUDA disponivel: $gpuName" -ForegroundColor Green
} else {
    Write-Host "[GPU] CUDA nao disponivel - usando CPU" -ForegroundColor Yellow
    Write-Host "[GPU] Para instalar CUDA, execute:" -ForegroundColor Yellow
    Write-Host "      pip install torch --index-url https://download.pytorch.org/whl/cu118" -ForegroundColor Gray
}

# Remover variavel que forca CPU
Remove-Item Env:OLLAMA_NO_CUDA -ErrorAction SilentlyContinue

# Mostrar configuracao
Write-Host ""
Write-Host "[Config] Modelo: $Model" -ForegroundColor Cyan
Write-Host "[Config] Idioma: $Language" -ForegroundColor Cyan
Write-Host "[Config] Min Duration: $MinDuration segundos" -ForegroundColor Cyan
Write-Host ""

if (-not $Url) {
    Write-Host "Uso: .\run-gpu.ps1 <URL_DO_VIDEO> [-m modelo] [-l idioma] [-MinDuration segundos]" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Exemplos:" -ForegroundColor Gray
    Write-Host "  .\run-gpu.ps1 'https://youtube.com/watch?v=VIDEO_ID'" -ForegroundColor Gray
    Write-Host "  .\run-gpu.ps1 'URL' -m medium -l pt" -ForegroundColor Gray
    Write-Host "  .\run-gpu.ps1 'URL' -m small -MinDuration 60" -ForegroundColor Gray
    Write-Host ""
    Write-Host "Modelos disponiveis (RTX 3060 6GB):" -ForegroundColor Gray
    Write-Host "  tiny   - ~30 seg  (baixa qualidade)" -ForegroundColor Gray
    Write-Host "  small  - ~2 min   (recomendado)" -ForegroundColor Gray
    Write-Host "  medium - ~5 min   (alta qualidade)" -ForegroundColor Gray
    exit 0
}

# Construir argumentos
$cmdArgs = @($Url, "-m", $Model, "-l", $Language, "--min-duration", $MinDuration)
if ($SkipTimestamps) {
    $cmdArgs += "--skip-timestamps"
}

# Executar
& $Python main.py @cmdArgs
