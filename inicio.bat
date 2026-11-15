@echo off
setlocal
title ARES-NAV - Mars Surface EVA Pathfinder
rem Always work from the folder this file lives in, wherever it was launched from.
cd /d "%~dp0"

echo ============================================================
echo   ARES-NAV  -  Mars Surface EVA Pathfinder ^& Visor HUD
echo ============================================================
echo.

if not exist "index.html" (
    echo [ERROR] No encuentro index.html junto a inicio.bat.
    echo         Descomprime el proyecto completo y ejecuta inicio.bat desde esa carpeta.
    goto fail
)
for %%F in (assets\data\jezero_dem_sample.json assets\data\hazard_zones.json assets\data\crism_minerals.json assets\data\environment_reference.json src\main.js) do (
    if not exist "%%F" (
        echo [ERROR] Falta el archivo %%F. La copia del proyecto esta incompleta.
        goto fail
    )
)

rem The app has no build step and no npm packages, so there is nothing to
rem install. Node is only used as a file server when it happens to be there.
where node >nul 2>nul
if errorlevel 1 goto use_powershell
if not exist "scripts\serve.mjs" goto use_powershell

echo [1/2] Node.js detectado. Iniciando el servidor local...
echo [2/2] El navegador se abrira solo. Si no, entra a http://localhost:5173
echo.
echo       Deja esta ventana abierta mientras uses la aplicacion.
echo       Para detenerla: Ctrl + C o cierra la ventana.
echo ------------------------------------------------------------
node scripts\serve.mjs --port 5173 --open
if not errorlevel 1 goto done
echo.
echo [AVISO] El servidor de Node.js no pudo iniciar. Probando con PowerShell...
echo.

:use_powershell
if not exist "scripts\serve.ps1" (
    echo [ERROR] Falta scripts\serve.ps1 y no hay Node.js disponible.
    echo         Vuelve a descargar el proyecto o instala Node.js desde https://nodejs.org
    goto fail
)
echo [1/2] Iniciando el servidor local con PowerShell (no requiere instalar nada)...
echo [2/2] El navegador se abrira solo. Si no, entra a la direccion que aparece abajo.
echo.
echo       Deja esta ventana abierta mientras uses la aplicacion.
echo       Para detenerla: Ctrl + C o cierra la ventana.
echo ------------------------------------------------------------
powershell -NoProfile -ExecutionPolicy Bypass -File "scripts\serve.ps1" -Port 5173 -Open
if not errorlevel 1 goto done
echo.
echo [ERROR] No se pudo iniciar el servidor.
echo         - Si ya hay otra ventana de ARES-NAV abierta, cierrala e intenta de nuevo.
echo         - Si tu equipo bloquea PowerShell, instala Node.js desde https://nodejs.org

:fail
echo.
pause
exit /b 1

:done
endlocal
