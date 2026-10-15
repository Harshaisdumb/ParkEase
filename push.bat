@echo off
echo ========================================================
echo Pushing ParkEase changes to GitHub: harshaisdumb/ParkEase
echo ========================================================
cd /d "%~dp0"
git push -u origin main
echo.
if %ERRORLEVEL% EQU 0 (
    echo ========================================================
    echo SUCCESS! All code pushed to GitHub successfully!
    echo Live repository: https://github.com/harshaisdumb/ParkEase
    echo Live GitHub Pages: https://harshaisdumb.github.io/ParkEase/
    echo ========================================================
) else (
    echo.
    echo Git push failed. Please ensure you are signed in to GitHub.
)
pause
