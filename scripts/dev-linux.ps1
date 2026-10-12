param (
    [string]$Distro = "Ubuntu"
)

# Use Continue so harmless Linux stderr streams don't trigger PowerShell NativeCommandError
$ErrorActionPreference = "Continue"

$winPath = (Get-Item -Path "$PSScriptRoot\..").FullName
$driveLetter = $winPath.Substring(0, 1).ToLower()
$relPath = $winPath.Substring(2).Replace("\", "/")
$wslPath = "/mnt/$driveLetter$relPath"

Write-Host "====================================================================" -ForegroundColor Cyan
Write-Host " Starting Listening Room in Linux Dev Mode via WSLg" -ForegroundColor Cyan
Write-Host " Environment: $Distro | Path: $wslPath" -ForegroundColor White
Write-Host "====================================================================" -ForegroundColor Cyan

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

# Flags for WSLg:
# - NO_AT_BRIDGE: disables missing accessibility AT-SPI bus
# - LIBGL_ALWAYS_SOFTWARE: uses rock-solid llvmpipe software rendering to prevent Intel Arc / d3d12 GPU crash in Weston
# - WEBKIT_DISABLE_DMABUF_RENDERER: prevents virtual GPU / Mesa d3d12 crashes in WebKitGTK
# - WEBKIT_DISABLE_SANDBOX_THIS_IS_DANGEROUS: avoids bwrap sandbox failure in WSL2
# - JACK_NO_START_SERVER: prevents harmless JACK daemon discovery attempts
# - GST_PLUGIN_SYSTEM_PATH_1_0 / GST_PLUGIN_PATH_1_0: exposes host multimedia elements (appsink)
$devCmd = "cd '$wslPath' && export NO_AT_BRIDGE=1 LIBGL_ALWAYS_SOFTWARE=1 WEBKIT_DISABLE_DMABUF_RENDERER=1 WEBKIT_DISABLE_SANDBOX_THIS_IS_DANGEROUS=1 JACK_NO_START_SERVER=1 GST_PLUGIN_SYSTEM_PATH_1_0=/usr/lib/x86_64-linux-gnu/gstreamer-1.0 GST_PLUGIN_PATH_1_0=/usr/lib/x86_64-linux-gnu/gstreamer-1.0 && npm run tauri dev"

Write-Host ""
Write-Host "[*] Listening Room Dev Mode starting on your desktop..." -ForegroundColor Green
Write-Host "    (Close the app window or press Ctrl+C to stop)" -ForegroundColor Gray
Write-Host ""

$maxAttempts = 3
for ($attempt = 1; $attempt -le $maxAttempts; $attempt++) {
    $sw = [System.Diagnostics.Stopwatch]::StartNew()
    wsl -d $Distro -e bash -l -c $devCmd
    $exitCode = $LASTEXITCODE
    $sw.Stop()

    if ($exitCode -eq 0) {
        Write-Host "Dev server closed cleanly." -ForegroundColor Green
        break
    }

    if ($exitCode -eq 130 -or $exitCode -eq 2) {
        Write-Host "Stopped by user." -ForegroundColor Gray
        break
    }

    if ($sw.ElapsedMilliseconds -gt 5000) {
        break
    }

    if ($attempt -lt $maxAttempts) {
        Write-Host ""
        Write-Host "[!] Display server cycled during startup (exit code $exitCode). Retrying in 2s (attempt $($attempt + 1)/$maxAttempts)..." -ForegroundColor Yellow
        Start-Sleep -Seconds 2
    }
}
