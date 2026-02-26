@echo off
setlocal enabledelayedexpansion

:: Navigate to the script's directory
cd /d "%~dp0"

echo --- Starting Git Push Process ---

:: 1. Ask for Branch Name
set /p branch="Enter branch name (e.g., main, dev): "
if "%branch%"=="" (
    echo Error: Branch name cannot be empty.
    pause
    exit /b
)

:: 2. Show status
echo Showing status for branch: !branch!
git status

:: 3. Add all changes
git add .

:: 4. Ask for Commit Message
set /p msg="Enter commit message: "
if "%msg%"=="" set msg="Auto-commit at %date% %time%"

:: 5. Commit
git commit -m "%msg%"

:: 6. Push to the specified branch
echo Pushing to origin !branch!...
git push origin !branch!

echo --- Process Finished ---
pause