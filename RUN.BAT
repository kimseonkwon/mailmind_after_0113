@echo off
title PST Email Search

echo ============================================
echo   PST Email Search - Starting
echo ============================================
echo.

if not exist node_modules (
    echo ERROR: node_modules folder not found!
    echo Please run INSTALL.BAT first.
    pause
    exit /b 1
)

set NODE_ENV=development
set STORAGE_MODE=local
set DATA_DIR=%~dp0data

if not exist "%DATA_DIR%" mkdir "%DATA_DIR%"

echo Storage Mode: Local SQLite
echo Data Directory: %DATA_DIR%
echo.
echo Open http://localhost:5000 in your browser
echo Press Ctrl+C to stop the server
echo.

npx tsx server/index.ts

echo.
pause
