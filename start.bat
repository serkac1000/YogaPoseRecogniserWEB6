
@echo off
echo Starting Yoga Pose Recognition App...
echo.

REM Check if Node.js is installed
node --version >nul 2>&1
if errorlevel 1 (
    echo Error: Node.js is not installed or not in PATH
    echo Please install Node.js from https://nodejs.org/
    pause
    exit /b 1
)

REM Check if port 5000 is in use and kill processes using it
echo Checking port 5000...
netstat -ano | findstr :5000 >nul 2>&1
if not errorlevel 1 (
    echo Port 5000 is in use. Killing processes...
    for /f "tokens=5" %%a in ('netstat -ano ^| findstr :5000') do (
        echo Killing PID %%a
        taskkill /PID %%a /F >nul 2>&1
    )
    echo Waiting for processes to terminate...
    timeout /t 2 /nobreak >nul
) else (
    echo Port 5000 is free.
)

REM Install dependencies if node_modules doesn't exist
if not exist "node_modules" (
    echo Installing dependencies...
    npm install
    if errorlevel 1 (
        echo Error: Failed to install dependencies
        pause
        exit /b 1
    )
)

REM Start the application with Python HTTP server on port 5000
echo Starting application on port 5000...
python -m http.server 5000 --bind 0.0.0.0
if errorlevel 1 (
    echo Trying with python3...
    python3 -m http.server 5000 --bind 0.0.0.0
    if errorlevel 1 (
        echo Error: Python is not installed or not in PATH
        echo Please install Python from https://python.org/
        pause
        exit /b 1
    )
)

pause
