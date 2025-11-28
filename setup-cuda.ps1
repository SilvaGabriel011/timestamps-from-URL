# ============================================
# Setup CUDA para RTX 3060
# ============================================

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Setup CUDA para GPU (RTX 3060)" -ForegroundColor Cyan
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

Write-Host "[1/3] Python encontrado: $Python" -ForegroundColor Green

# Verificar CUDA atual
Write-Host ""
Write-Host "[2/3] Verificando CUDA atual..." -ForegroundColor Yellow
$cudaCheck = & $Python -c "import torch; print(torch.cuda.is_available())" 2>&1

if ($cudaCheck -eq "True") {
    $gpuName = & $Python -c "import torch; print(torch.cuda.get_device_name(0))" 2>&1
    $torchVersion = & $Python -c "import torch; print(torch.__version__)" 2>&1
    Write-Host "[OK] CUDA ja esta funcionando!" -ForegroundColor Green
    Write-Host "     GPU: $gpuName" -ForegroundColor Cyan
    Write-Host "     PyTorch: $torchVersion" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Voce ja pode usar: .\run-gpu.ps1 'URL'" -ForegroundColor Green
    exit 0
}

Write-Host "[!] CUDA nao disponivel - instalando PyTorch com CUDA..." -ForegroundColor Yellow
Write-Host ""

# Instalar PyTorch com CUDA 11.8
Write-Host "[3/3] Instalando PyTorch com CUDA 11.8..." -ForegroundColor Yellow
Write-Host "      Isso pode demorar alguns minutos..." -ForegroundColor Gray
Write-Host ""

& $Python -m pip install --upgrade pip
& $Python -m pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu118

Write-Host ""
Write-Host "Verificando instalacao..." -ForegroundColor Yellow

$cudaCheck = & $Python -c "import torch; print(torch.cuda.is_available())" 2>&1
if ($cudaCheck -eq "True") {
    $gpuName = & $Python -c "import torch; print(torch.cuda.get_device_name(0))" 2>&1
    Write-Host ""
    Write-Host "========================================" -ForegroundColor Green
    Write-Host "  CUDA instalado com sucesso!" -ForegroundColor Green
    Write-Host "  GPU: $gpuName" -ForegroundColor Cyan
    Write-Host "========================================" -ForegroundColor Green
    Write-Host ""
    Write-Host "Agora use: .\run-gpu.ps1 'URL_DO_VIDEO'" -ForegroundColor Yellow
} else {
    Write-Host ""
    Write-Host "========================================" -ForegroundColor Red
    Write-Host "  ERRO: CUDA nao foi ativado" -ForegroundColor Red
    Write-Host "========================================" -ForegroundColor Red
    Write-Host ""
    Write-Host "Possiveis causas:" -ForegroundColor Yellow
    Write-Host "  1. Driver NVIDIA desatualizado" -ForegroundColor Gray
    Write-Host "  2. CUDA Toolkit nao instalado" -ForegroundColor Gray
    Write-Host ""
    Write-Host "Solucoes:" -ForegroundColor Yellow
    Write-Host "  1. Atualize o driver: https://www.nvidia.com/drivers" -ForegroundColor Gray
    Write-Host "  2. Instale CUDA Toolkit 11.8: https://developer.nvidia.com/cuda-11-8-0-download-archive" -ForegroundColor Gray
}
