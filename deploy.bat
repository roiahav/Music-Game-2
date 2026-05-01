@echo off
chcp 65001 >nul
title Deploy to QNAP

:: ─── הגדרות ───────────────────────────────────────────
set QNAP_USER=admin
set QNAP_IP=192.168.1.200
set QNAP_SRC=/share/CACHEDEV1_DATA/homes/rotem/admin/music-game-src/music game 2

:: ──────────────────────────────────────────────────────
set PROJECT=%~dp0

echo.
echo ============================
echo  1. בנה קליינט (client build)
echo ============================
cd /d "%PROJECT%client"
call npm run build
if errorlevel 1 (
    echo שגיאה בבנייה! עוצר.
    pause & exit /b 1
)

echo.
echo ============================
echo  2. העתק קבצים ל-QNAP
echo ============================

:: server
scp -r "%PROJECT%server" %QNAP_USER%@%QNAP_IP%:"%QNAP_SRC%/"
:: client/dist
scp -r "%PROJECT%client\dist" %QNAP_USER%@%QNAP_IP%:"%QNAP_SRC%/client/"
:: Dockerfile + docker-compose
scp "%PROJECT%Dockerfile" "%PROJECT%docker-compose.yml" %QNAP_USER%@%QNAP_IP%:"%QNAP_SRC%/"

echo.
echo ============================
echo  3. Build + Restart ב-QNAP
echo ============================
ssh %QNAP_USER%@%QNAP_IP% "cd \"/share/CACHEDEV1_DATA/homes/rotem/admin/music-game-src/music game 2\" && docker build -t music-game:latest . && docker-compose up -d && echo DONE"

echo.
echo ============================
echo  4. בדוק לוגים
echo ============================
ssh %QNAP_USER%@%QNAP_IP% "sleep 3 && docker logs music-game --tail 20"

echo.
echo ✅ פריסה הסתיימה!
pause
