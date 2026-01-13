@echo off
chcp 65001 > nul
echo ============================================
echo   PST Email Search Application - 설치
echo ============================================
echo.

echo [1/3] Node.js 버전 확인 중...
node --version > nul 2>&1
if %errorlevel% neq 0 (
    echo [오류] Node.js가 설치되어 있지 않습니다.
    echo https://nodejs.org 에서 Node.js를 설치해주세요.
    pause
    exit /b 1
)
echo Node.js 확인 완료

echo.
echo [2/3] 패키지 설치 중... (시간이 걸릴 수 있습니다)
call npm install
if %errorlevel% neq 0 (
    echo [오류] 패키지 설치에 실패했습니다.
    pause
    exit /b 1
)
echo 패키지 설치 완료

echo.
echo [3/3] 데이터베이스 설정 중...
call npm run db:push
if %errorlevel% neq 0 (
    echo [경고] 데이터베이스 설정을 건너뜁니다. (로컬 저장소 모드 사용 가능)
)

echo.
echo ============================================
echo   설치가 완료되었습니다!
echo   RUN.BAT 파일을 실행하여 앱을 시작하세요.
echo ============================================
pause
