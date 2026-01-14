@echo off
title PST Email Search - Installation

echo ============================================
echo   PST Email Search - Installation
echo ============================================
echo.

echo [Step 1] Checking Node.js...
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo.
    echo ERROR: Node.js is not installed!
    echo.
    echo Please download and install Node.js from:
    echo https://nodejs.org
    echo.
    echo After installation, restart your computer
    echo and run this installer again.
    echo.
    pause
    exit /b 1
)
node --version
echo Node.js OK

echo.
echo [Step 2] Checking npm...
where npm >nul 2>nul
if %errorlevel% neq 0 (
    echo.
    echo ERROR: npm is not installed!
    echo.
    pause
    exit /b 1
)
npm --version
echo npm OK

echo.
echo [Step 3] Installing packages...
echo This may take a few minutes...
call npm install
if %errorlevel% neq 0 (
    echo.
    echo ERROR: Package installation failed!
    echo Check your internet connection.
    echo.
    pause
    exit /b 1
)
echo Packages installed successfully!

echo.
echo [Step 4] Creating data folder...
set DATA_DIR=%~dp0data
if not exist "%DATA_DIR%" mkdir "%DATA_DIR%"
echo Data folder created: %DATA_DIR%

echo.
echo ============================================
echo   Installation Complete!
echo ============================================
echo.
echo Next steps:
echo   1. Run RUN.BAT to start the application
echo   2. Open http://localhost:5000 in browser
echo.
echo For AI features (optional):
echo   1. Install Ollama from https://ollama.com
echo   2. Run: ollama pull llama3.2
echo   3. Run: ollama pull nomic-embed-text
echo.
pause
