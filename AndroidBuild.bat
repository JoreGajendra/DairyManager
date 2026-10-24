@echo off
setlocal

cd /d "%~dp0android"

call gradlew.bat assembleRelease
if errorlevel 1 (
    echo BUILD FAILED
    exit /b 1
)

set "APK=%~dp0android\app\build\outputs\apk\release\app-release.apk"

if not exist "%APK%" (
    echo APK not found at %APK%
    exit /b 1
)

for /f "usebackq delims=" %%N in (`powershell -NoProfile -Command "(Get-Content '%~dp0app.json' -Raw | ConvertFrom-Json).expo.name"`) do set "APPNAME=%%N"
for /f "usebackq delims=" %%V in (`powershell -NoProfile -Command "(Get-Content '%~dp0app.json' -Raw | ConvertFrom-Json).expo.version"`) do set "APPVER=%%V"

set "OUT=%~dp0%APPNAME%-v%APPVER%.apk"
copy /Y "%APK%" "%OUT%" >nul

echo BUILD OK: %OUT%
endlocal
