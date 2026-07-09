@echo off
REM Puts a "Noto" app icon on your Desktop. Run this once.
REM (This setup window is the only console you'll see — the app itself
REM  launches with no console.)
title Install Noto
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0install-shortcut.ps1"
echo.
pause
