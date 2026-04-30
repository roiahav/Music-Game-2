@echo off
chcp 65001 >nul
title חידון מוזיקה - שרת
set PATH=C:\Program Files\nodejs;%PATH%
cd /d "%~dp0server"
node index.js
pause
