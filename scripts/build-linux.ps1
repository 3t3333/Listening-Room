param (
    [string]$Bundle = "appimage",
    [string]$Distro = "Ubuntu"
)

$ErrorActionPreference = "Stop"

Write-Host "====================================================================" -ForegroundColor Cyan
Write-Host " Listening Room - Linux AppImage Build Pipeline (WSL Bridge)" -ForegroundColor Cyan
Write-Host " Target Distro: $Distro | Target Bundle: $Bundle" -ForegroundColor Cyan
Write-Host "====================================================================" -ForegroundColor Cyan

# Check if WSL is available
try {
    $wslCheck = wsl -l -q 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Error "WSL is not available or not properly configured on this system."
    }
} catch {
    Write-Error "Failed to execute WSL. Please ensure Windows Subsystem for Linux is enabled."
}

# Resolve project path in WSL
$winPath = (Get-Item -Path "$PSScriptRoot\..").FullName
$driveLetter = $winPath.Substring(0, 1).ToLower()
$relPath = $winPath.Substring(2).Replace("\", "/")
$wslPath = "/mnt/$driveLetter$relPath"

Write-Host "Project directory in WSL: $wslPath" -ForegroundColor Gray

# Check if build dependencies are installed in WSL
$checkCmd = "which cargo >/dev/null 2>&1 && pkg-config --exists webkit2gtk-4.1 >/dev/null 2>&1 && echo 'OK' || echo 'MISSING'"
$depStatus = (wsl -d $Distro -e bash -l -c "$checkCmd").Trim()

if ($depStatus -ne "OK") {
    Write-Host ""
    Write-Host "[!] Required Linux build dependencies (Cargo / WebKitGTK 4.1) appear missing in $Distro." -ForegroundColor Yellow
    Write-Host "    Please run the one-time setup script inside WSL:" -ForegroundColor Yellow
    Write-Host "    wsl -d $Distro -e bash -l -c 'cd $wslPath && chmod +x scripts/*.sh && ./scripts/setup-linux.sh'" -ForegroundColor White
    Write-Host ""
    $confirm = Read-Host "Would you like to run the setup script now? (y/N)"
    if ($confirm -match '^[yY]') {
        Write-Host "Running setup script in WSL (you may be prompted for your sudo password)..." -ForegroundColor Cyan
        wsl -d $Distro -e bash -l -c "cd $wslPath && chmod +x scripts/*.sh && ./scripts/setup-linux.sh"
        if ($LASTEXITCODE -ne 0) {
            Write-Error "Linux setup script failed. Please inspect the output above."
        }
    } else {
        Write-Error "Cannot proceed without required Linux build dependencies."
    }
}

# Execute build script in WSL
Write-Host "Launching Linux build inside $Distro..." -ForegroundColor Green
wsl -d $Distro -e bash -l -c "cd $wslPath && chmod +x scripts/*.sh && ./scripts/build-linux.sh --bundle $Bundle"

if ($LASTEXITCODE -ne 0) {
    Write-Error "Linux build failed with exit code $LASTEXITCODE."
}

# Locate generated AppImage in Windows
$appImageDir = Join-Path $winPath "target\release\bundle\appimage"
$srcAppImageDir = Join-Path $winPath "src-tauri\target\release\bundle\appimage"

$found = Get-ChildItem -Path @($appImageDir, $srcAppImageDir) -Filter "*.AppImage" -ErrorAction SilentlyContinue | Select-Object -First 1

if ($found) {
    Write-Host ""
    Write-Host "====================================================================" -ForegroundColor Green
    Write-Host " SUCCESS! Linux AppImage generated:" -ForegroundColor Green
    Write-Host " $($found.FullName)" -ForegroundColor White
    Write-Host " Size: $([math]::Round($found.Length / 1MB, 2)) MB" -ForegroundColor Gray
    Write-Host "====================================================================" -ForegroundColor Green
    Write-Host "To test this AppImage directly on your Windows desktop via WSLg, run:" -ForegroundColor Cyan
    Write-Host "npm run tauri:dev:linux  OR  .\scripts\run-wslg.ps1" -ForegroundColor White
} else {
    Write-Host "Build finished. Check $wslPath/target/release/bundle for outputs." -ForegroundColor Yellow
}
