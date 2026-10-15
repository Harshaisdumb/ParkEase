@echo off
setlocal enabledelayedexpansion
title Launching ParkEase India...
echo ========================================================
echo   Starting ParkEase India (Smart Parking Finder)
echo ========================================================

rem Check and sync .env into env.js for browser compatibility
set "GROQ_KEY="
set "GROQ_MOD=llama-3.3-70b-versatile"
set "GMAP_KEY="
set "MAP_ENG=osm"

if exist "%~dp0.env" (
    for /f "usebackq tokens=1,* delims==" %%A in ("%~dp0.env") do (
        set "KEY_NAME=%%A"
        set "KEY_VAL=%%B"
        if "!KEY_NAME!"=="GROQ_API_KEY" (
            set "GROQ_KEY=!KEY_VAL!"
        )
        if "!KEY_NAME!"=="GROQ_MODEL" (
            set "GROQ_MOD=!KEY_VAL!"
        )
        if "!KEY_NAME!"=="GOOGLE_MAPS_API_KEY" (
            set "GMAP_KEY=!KEY_VAL!"
        )
        if "!KEY_NAME!"=="MAP_ENGINE" (
            set "MAP_ENG=!KEY_VAL!"
        )
    )
)

rem Normalize placeholder values
if "!GROQ_KEY!"=="your_groq_api_key_here" set "GROQ_KEY="
if "!GMAP_KEY!"=="your_google_maps_api_key_here" set "GMAP_KEY="

echo [INFO] Syncing environment configuration into env.js...
(
    echo // Auto-synced from .env by run.bat
    echo window.ENV = {
    echo     GROQ_API_KEY: "!GROQ_KEY!",
    echo     GROQ_MODEL: "!GROQ_MOD!",
    echo     GOOGLE_MAPS_API_KEY: "!GMAP_KEY!",
    echo     MAP_ENGINE: "!MAP_ENG!",
    echo     ENABLE_TRAFFIC: true
    echo };
) > "%~dp0env.js"

echo Opening index.html in your default web browser...
start "" "%~dp0index.html"
exit
