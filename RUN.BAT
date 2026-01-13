@echo off
setlocal enabledelayedexpansion
chcp 65001 > nul
echo ============================================
echo   PST Email Search Application - 실행
echo ============================================
echo.

if not exist "node_modules" (
    echo [오류] node_modules 폴더가 없습니다.
    echo 먼저 INSTALL.BAT을 실행해주세요.
    pause
    exit /b 1
)

echo 현재 설정:
if defined DATABASE_URL (
    echo   - 저장소: PostgreSQL
) else (
    if defined STORAGE_MODE (
        echo   - 저장소: !STORAGE_MODE!
        if defined DATA_DIR (
            echo   - 데이터 경로: !DATA_DIR!
        )
    ) else (
        echo   - 저장소: PostgreSQL (기본값, DATABASE_URL 필요)
    )
)

if defined OLLAMA_BASE_URL (
    echo   - Ollama URL: !OLLAMA_BASE_URL!
) else (
    echo   - Ollama URL: http://localhost:11434 (기본값)
)

echo.
echo 앱을 시작합니다...
echo 브라우저에서 http://localhost:5000 으로 접속하세요.
echo 종료하려면 Ctrl+C를 누르세요.
echo.

call npm run dev
if !errorlevel! neq 0 (
    echo.
    echo [오류] 앱 실행 중 오류가 발생했습니다.
    pause
)
endlocal
