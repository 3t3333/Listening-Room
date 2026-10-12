param (
    [string]$Distro = "Ubuntu"
)

# Use Continue so harmless Linux stderr streams don't trigger PowerShell NativeCommandError
$ErrorActionPreference = "Continue"

$winPath = (Get-Item -Path "$PSScriptRoot\..").FullName
$appImageDir = Join-Path $winPath "target\release\bundle\appimage"
$srcAppImageDir = Join-Path $winPath "src-tauri\target\release\bundle\appimage"

$found = Get-ChildItem -Path @($appImageDir, $srcAppImageDir) -Filter "*.AppImage" -ErrorAction SilentlyContinue | Select-Object -First 1

if (-not $found) {
    Write-Error "No .AppImage found. Please build one first using 'npm run tauri:build:linux'."
    exit 1
}

$appDriveLetter = $found.FullName.Substring(0, 1).ToLower()
$relAppPath = $found.FullName.Substring(2).Replace("\", "/")
$wslAppImagePath = "/mnt/$appDriveLetter$relAppPath"

Write-Host "====================================================================" -ForegroundColor Cyan
Write-Host " Launching Listening Room Linux AppImage in WSLg" -ForegroundColor Cyan
Write-Host " AppImage: $wslAppImagePath" -ForegroundColor White
Write-Host "====================================================================" -ForegroundColor Cyan

# Flags for WSLg:
# - APPIMAGE_EXTRACT_AND_RUN: runs without requiring root FUSE mount
# - NO_AT_BRIDGE: disables missing accessibility AT-SPI bus
# - LIBGL_ALWAYS_SOFTWARE: uses rock-solid llvmpipe software rendering to prevent Intel Arc / d3d12 GPU crash in Weston
# - WEBKIT_DISABLE_DMABUF_RENDERER: prevents virtual GPU / Mesa d3d12 crashes in WebKitGTK
# - WEBKIT_DISABLE_SANDBOX_THIS_IS_DANGEROUS: avoids bwrap sandbox failure in WSL2
# - GST_PLUGIN_SYSTEM_PATH_1_0 / GST_PLUGIN_PATH_1_0: exposes host multimedia elements (appsink) into AppImage
# - JACK_NO_START_SERVER: prevents harmless JACK daemon discovery attempts
$launchCmd = "chmod +x '$wslAppImagePath' && export APPIMAGE_EXTRACT_AND_RUN=1 NO_AT_BRIDGE=1 LIBGL_ALWAYS_SOFTWARE=1 WEBKIT_DISABLE_DMABUF_RENDERER=1 WEBKIT_DISABLE_SANDBOX_THIS_IS_DANGEROUS=1 JACK_NO_START_SERVER=1 GST_PLUGIN_SYSTEM_PATH_1_0=/usr/lib/x86_64-linux-gnu/gstreamer-1.0 GST_PLUGIN_PATH_1_0=/usr/lib/x86_64-linux-gnu/gstreamer-1.0 && '$wslAppImagePath'"

# Pre-flight check: ensure display server is responding before launching
Write-Host "Connecting to WSLg display server..." -ForegroundColor Gray
$displayReady = $false
for ($i = 0; $i -lt 10; $i++) {
    $null = wsl -d $Distro -e timeout 1 xset q 2>$null
    if ($LASTEXITCODE -eq 0) {
        $displayReady = $true
        break
    }
    Start-Sleep -Milliseconds 500
}

if (-not $displayReady) {
    Write-Host "[!] WSLg display server is warming up. Starting application with auto-recovery..." -ForegroundColor Yellow
}

Write-Host ""
Write-Host "[*] Listening Room is starting on your desktop..." -ForegroundColor Green
Write-Host "    (Close the app window or press Ctrl+C to stop)" -ForegroundColor Gray
Write-Host ""

$maxAttempts = 3
for ($attempt = 1; $attempt -le $maxAttempts; $attempt++) {
    $sw = [System.Diagnostics.Stopwatch]::StartNew()
    wsl -d $Distro -e bash -l -c $launchCmd
    $exitCode = $LASTEXITCODE
    $sw.Stop()

    # Clean exit or user closed the app window
    if ($exitCode -eq 0) {
        Write-Host "Listening Room closed cleanly." -ForegroundColor Green
        break
    }

    # User pressed Ctrl+C (SIGINT = 130, 2, or cancel)
    if ($exitCode -eq 130 -or $exitCode -eq 2) {
        Write-Host "Stopped by user." -ForegroundColor Gray
        break
    }

    # If the app ran for more than 5 seconds and closed, do not retry
    if ($sw.ElapsedMilliseconds -gt 5000) {
        break
    }

    # Fast crash on startup (e.g. compositor cycle)
    if ($attempt -lt $maxAttempts) {
        Write-Host ""
        Write-Host "[!] Display server cycled during startup (exit code $exitCode). Retrying in 2s (attempt $($attempt + 1)/$maxAttempts)..." -ForegroundColor Yellow
        Start-Sleep -Seconds 2
    }
}
