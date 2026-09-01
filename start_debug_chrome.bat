@echo off
echo =======================================================
echo Launching Google Chrome in Debugging Mode...
echo =======================================================
echo.
echo Closing any conflicting Chrome processes...
taskkill /IM chrome.exe /F 2>nul
timeout /t 1 /nobreak >nul

set CHROME_PATH="C:\Program Files\Google\Chrome\Application\chrome.exe"
if not exist %CHROME_PATH% set CHROME_PATH="C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"

echo Launching Chrome with absolute path and debugging arguments...
start "" %CHROME_PATH% --remote-debugging-port=9222 --user-data-dir="C:\chrome-debug"
echo.
echo Chrome has started successfully!
echo.
echo IMPORTANT INSTRUCTIONS:
echo 1. In the Chrome window that just opened, log in to Naukri.com.
echo 2. You only need to log in ONCE. Chrome will save your login session.
echo 3. Keep this window open, go to http://localhost:5173/jobs and click Quick Apply!
echo.
pause
