@echo off
REM YouTube Timestamp Generator - Script de execução para Windows
REM Uso: run.bat "URL_DO_VIDEO" [opções]

set OLLAMA_NO_CUDA=1
set PYTHON_PATH=%LOCALAPPDATA%\Programs\Python\Python312\python.exe

if not exist "%PYTHON_PATH%" (
    echo Python não encontrado em %PYTHON_PATH%
    echo Tentando usar python do PATH...
    set PYTHON_PATH=python
)

echo.
echo ========================================
echo  YouTube Timestamp Generator
echo  Otimizado para PT-BR
echo ========================================
echo.

"%PYTHON_PATH%" main.py %*
