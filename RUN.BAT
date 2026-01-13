@echo off
chcp 65001 > nul
echo ============================================
echo   PST Email Search Application - 실행
echo ============================================
echo.

echo 앱을 시작합니다...
echo 브라우저에서 http://localhost:5000 으로 접속하세요.
echo 종료하려면 Ctrl+C를 누르세요.
echo.

call npm run dev
