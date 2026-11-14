@echo off
setlocal enabledelayedexpansion
title ARES-NAV - Mars Surface EVA Pathfinder

echo ============================================================
echo   ARES-NAV: Mars Surface EVA Pathfinder & Visor HUD
echo ============================================================
echo.

where node >nul 2>nul
if %errorlevel% equ 0 (
    echo [INFO] Node.js detectado. Iniciando servidor con npx serve...
    echo.
    echo El proyecto estara disponible en: http://localhost:5173
    echo Presiona Ctrl + C para detener el servidor.
    echo ------------------------------------------------------------
    npx serve -l 5173 .
    goto end
)

echo [INFO] Node.js no esta instalado. Intentando ejecutar con PowerShell...
echo.

if exist "scripts\serve.ps1" (
    powershell -ExecutionPolicy Bypass -File scripts\serve.ps1
) else (
    echo [ERROR] No se encontro scripts\serve.ps1 ni Node.js.
    echo Por favor, instala Node.js o asegurate de tener el script de PowerShell.
    pause
)

:end