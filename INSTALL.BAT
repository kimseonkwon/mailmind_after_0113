@echo off
setlocal enabledelayedexpansion
chcp 65001 > nul
echo ============================================
echo   PST Email Search Application - 설치
echo ============================================
echo.

echo [1/4] Node.js 버전 확인 중...
where node > nul 2>&1
if !errorlevel! neq 0 (
    echo [오류] Node.js가 설치되어 있지 않습니다.
    echo https://nodejs.org 에서 Node.js를 설치해주세요.
    pause
    exit /b 1
)
for /f "tokens=*" %%i in ('node --version') do set NODE_VERSION=%%i
echo Node.js %NODE_VERSION% 확인 완료

echo.
echo [2/4] npm 버전 확인 중...
where npm > nul 2>&1
if !errorlevel! neq 0 (
    echo [오류] npm이 설치되어 있지 않습니다.
    pause
    exit /b 1
)
for /f "tokens=*" %%i in ('npm --version') do set NPM_VERSION=%%i
echo npm v%NPM_VERSION% 확인 완료

echo.
echo [3/4] 패키지 설치 중... (시간이 걸릴 수 있습니다)
call npm install
if !errorlevel! neq 0 (
    echo [오류] 패키지 설치에 실패했습니다.
    echo 네트워크 연결을 확인하거나 npm cache clean --force 후 다시 시도해주세요.
    pause
    exit /b 1
)
echo 패키지 설치 완료

echo.
echo [4/4] 데이터베이스 설정 확인 중...
if defined DATABASE_URL (
    echo DATABASE_URL이 설정되어 있습니다. PostgreSQL 모드로 설정합니다.
    call npm run db:push
    if !errorlevel! neq 0 (
        echo [경고] 데이터베이스 마이그레이션에 실패했습니다.
        echo DATABASE_URL 설정을 확인해주세요.
    ) else (
        echo 데이터베이스 설정 완료
    )
) else (
    echo DATABASE_URL이 설정되지 않았습니다.
    echo 로컬 SQLite 모드를 사용하려면 RUN.BAT 실행 전에 환경변수를 설정하세요:
    echo   set STORAGE_MODE=local
    echo   set DATA_DIR=C:\path\to\data
)

echo.
echo ============================================
echo   설치가 완료되었습니다!
echo   RUN.BAT 파일을 실행하여 앱을 시작하세요.
echo ============================================
pause
endlocal
