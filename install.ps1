# ani-tui Windows installer
# Installs ani-tui, verifies mpv playback support, and configures ANI_TUI_PLAYER.

[CmdletBinding()]
param(
    [string]$InstallDir = "$env:LOCALAPPDATA\ani-tui",
    [switch]$SkipDependencies,
    [switch]$SkipChafa
)

$ErrorActionPreference = "Stop"

$AniTuiRepo = "silent9669/ani-tui"
$MpvRepo = "shinchiro/mpv-winbuild-cmake"
$TempRoot = Join-Path $env:TEMP "ani-tui-install"

function Write-Status {
    param(
        [string]$Message,
        [string]$Color = "White"
    )
    Write-Host $Message -ForegroundColor $Color
}

function Test-Command {
    param([string]$Name)
    return $null -ne (Get-Command $Name -ErrorAction SilentlyContinue)
}

function Invoke-Download {
    param(
        [string]$Uri,
        [string]$OutFile
    )

    New-Item -ItemType Directory -Force -Path (Split-Path -Parent $OutFile) | Out-Null
    Invoke-WebRequest -Uri $Uri -OutFile $OutFile -UseBasicParsing -ErrorAction Stop
}

function Get-GitHubLatestRelease {
    param([string]$Repository)

    Invoke-RestMethod `
        -Uri "https://api.github.com/repos/$Repository/releases/latest" `
        -Headers @{ "User-Agent" = "ani-tui-installer" } `
        -ErrorAction Stop
}

function Get-ReleaseAsset {
    param(
        [object]$Release,
        [string]$NamePattern
    )

    $asset = $Release.assets |
        Where-Object { $_.name -like $NamePattern } |
        Select-Object -First 1

    if (-not $asset) {
        throw "Could not find release asset matching $NamePattern"
    }

    return $asset
}

function Add-UserPathEntry {
    param([string]$PathEntry)

    if (-not $PathEntry -or -not (Test-Path $PathEntry)) {
        return
    }

    $currentPath = [Environment]::GetEnvironmentVariable("PATH", "User")
    $entries = @()
    if ($currentPath) {
        $entries = $currentPath -split ';' | Where-Object { $_ }
    }

    $normalized = $PathEntry.TrimEnd('\', '/')
    $alreadyPresent = $entries | Where-Object { $_.TrimEnd('\', '/') -ieq $normalized }
    if (-not $alreadyPresent) {
        $newPath = (($entries + $PathEntry) -join ';')
        [Environment]::SetEnvironmentVariable("PATH", $newPath, "User")
        Write-Status "[OK] Added to User PATH: $PathEntry" "Green"
    } else {
        Write-Status "[OK] PATH already contains: $PathEntry" "Green"
    }

    if (($env:PATH -split ';' | Where-Object { $_.TrimEnd('\', '/') -ieq $normalized }).Count -eq 0) {
        $env:PATH = "$env:PATH;$PathEntry"
    }
}

function Test-ExecutableVersion {
    param([string]$Path)

    if (-not $Path) {
        return $false
    }

    try {
        $output = & $Path --version 2>&1
        if ($LASTEXITCODE -ne 0) {
            return $false
        }
        if ($output) {
            Write-Status "      $($output | Select-Object -First 1)" "DarkGray"
        }
        return $true
    } catch {
        return $false
    }
}

function Resolve-MpvPath {
    $candidates = New-Object System.Collections.Generic.List[string]

    if ($env:ANI_TUI_PLAYER) {
        $candidates.Add($env:ANI_TUI_PLAYER)
    }

    $mpvCommand = Get-Command mpv -ErrorAction SilentlyContinue
    if ($mpvCommand) {
        $candidates.Add($mpvCommand.Source)
    }

    $candidates.Add((Join-Path $InstallDir "mpv.exe"))
    $candidates.Add((Join-Path $InstallDir "tools\mpv\mpv.exe"))

    foreach ($candidate in ($candidates | Select-Object -Unique)) {
        if ((Test-Path $candidate) -and (Test-ExecutableVersion $candidate)) {
            return $candidate
        }
    }

    return $null
}

function Install-VisualCppRedistributable {
    if ((Test-Path "$env:SystemRoot\System32\vcruntime140.dll") -and
        (Test-Path "$env:SystemRoot\System32\msvcp140.dll")) {
        Write-Status "[OK] Visual C++ Redistributable detected" "Green"
        return
    }

    if (-not (Test-Command "winget")) {
        Write-Status "[WARN] winget not found; skipping Visual C++ Redistributable auto-install" "Yellow"
        return
    }

    Write-Status "[..] Installing Visual C++ Redistributable with winget" "Cyan"
    & winget install --id Microsoft.VCRedist.2015+.x64 --exact --silent --accept-source-agreements --accept-package-agreements
    if ($LASTEXITCODE -eq 0) {
        Write-Status "[OK] Visual C++ Redistributable installed" "Green"
    } else {
        Write-Status "[WARN] Visual C++ Redistributable install returned exit code $LASTEXITCODE" "Yellow"
    }
}

function Install-MpvWithWinget {
    if (-not (Test-Command "winget")) {
        Write-Status "[WARN] winget not found; using portable mpv fallback" "Yellow"
        return $null
    }

    Write-Status "[..] Installing mpv with winget package shinchiro.mpv" "Cyan"
    & winget install --id shinchiro.mpv --exact --silent --accept-source-agreements --accept-package-agreements
    if ($LASTEXITCODE -ne 0) {
        Write-Status "[WARN] winget mpv install returned exit code $LASTEXITCODE" "Yellow"
        return $null
    }

    $mpvCommand = Get-Command mpv -ErrorAction SilentlyContinue
    if ($mpvCommand -and (Test-ExecutableVersion $mpvCommand.Source)) {
        return $mpvCommand.Source
    }

    Write-Status "[WARN] winget completed, but mpv.exe was not visible in this session" "Yellow"
    return $null
}

function Get-MpvPortableAsset {
    $release = Get-GitHubLatestRelease $MpvRepo
    $pattern = if ([Environment]::Is64BitOperatingSystem) {
        "mpv-x86_64-*.7z"
    } else {
        "mpv-i686-*.7z"
    }

    $asset = $release.assets |
        Where-Object {
            $_.name -like $pattern -and
            $_.name -notlike "*dev*" -and
            $_.name -notlike "*v3*"
        } |
        Select-Object -First 1

    if (-not $asset) {
        throw "Could not find a portable mpv release asset matching $pattern"
    }

    return $asset
}

function Expand-MpvArchive {
    param(
        [string]$ArchivePath,
        [string]$Destination
    )

    New-Item -ItemType Directory -Force -Path $Destination | Out-Null

    if (Test-Command "tar") {
        & tar -xf $ArchivePath -C $Destination
        if ($LASTEXITCODE -eq 0) {
            return
        }
        Write-Status "[WARN] tar could not extract mpv archive; trying 7z if available" "Yellow"
    }

    $sevenZip = Get-Command 7z -ErrorAction SilentlyContinue
    if ($sevenZip) {
        & $sevenZip.Source x $ArchivePath "-o$Destination" -y | Out-Null
        if ($LASTEXITCODE -eq 0) {
            return
        }
    }

    throw "Could not extract mpv .7z archive. Install winget or 7-Zip, then rerun this installer."
}

function Install-MpvPortable {
    Write-Status "[..] Installing portable mpv fallback" "Cyan"

    $asset = Get-MpvPortableAsset
    $archivePath = Join-Path $TempRoot $asset.name
    $extractDir = Join-Path $TempRoot "mpv-extract"
    $targetDir = Join-Path $InstallDir "tools\mpv"

    Remove-Item $extractDir -Recurse -Force -ErrorAction SilentlyContinue
    Remove-Item $targetDir -Recurse -Force -ErrorAction SilentlyContinue

    Invoke-Download $asset.browser_download_url $archivePath
    Expand-MpvArchive $archivePath $extractDir

    $mpvExe = Get-ChildItem -Path $extractDir -Filter "mpv.exe" -Recurse |
        Select-Object -First 1

    if (-not $mpvExe) {
        throw "Downloaded mpv archive did not contain mpv.exe"
    }

    New-Item -ItemType Directory -Force -Path $targetDir | Out-Null
    Copy-Item -Path (Join-Path $mpvExe.DirectoryName '*') -Destination $targetDir -Recurse -Force

    $mpvPath = Join-Path $targetDir "mpv.exe"
    if (-not (Test-ExecutableVersion $mpvPath)) {
        throw "Portable mpv was extracted but did not run: $mpvPath"
    }

    Add-UserPathEntry $targetDir
    return $mpvPath
}

function Install-Chafa {
    if ($SkipChafa) {
        return
    }

    if (Test-Command "chafa") {
        Write-Status "[OK] chafa detected" "Green"
        return
    }

    if (-not (Test-Command "winget")) {
        Write-Status "[WARN] chafa not installed; image previews will use text fallback" "Yellow"
        return
    }

    Write-Status "[..] Installing optional chafa image renderer" "Cyan"
    & winget install --id hpjansson.chafa --exact --silent --accept-source-agreements --accept-package-agreements
    if ($LASTEXITCODE -eq 0) {
        Write-Status "[OK] chafa installed" "Green"
    } else {
        Write-Status "[WARN] chafa install returned exit code $LASTEXITCODE; continuing" "Yellow"
    }
}

function Install-AniTui {
    Write-Status "[..] Downloading latest ani-tui release" "Cyan"

    $release = Get-GitHubLatestRelease $AniTuiRepo
    $asset = Get-ReleaseAsset $release "ani-tui-windows-x86_64.zip"
    $zipPath = Join-Path $TempRoot $asset.name

    New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null
    Invoke-Download $asset.browser_download_url $zipPath
    Expand-Archive -Path $zipPath -DestinationPath $InstallDir -Force

    $binaryPath = Join-Path $InstallDir "ani-tui.exe"
    if (-not (Test-Path $binaryPath)) {
        throw "ani-tui.exe was not found after extracting $($asset.name)"
    }

    if (-not (Test-ExecutableVersion $binaryPath)) {
        throw "ani-tui.exe exists but did not run successfully"
    }

    Add-UserPathEntry $InstallDir
    return $binaryPath
}

function Write-CmdWrapper {
    $wrapperPath = Join-Path $InstallDir "ani-tui.cmd"
    $wrapper = @'
@echo off
if "%ANI_TUI_PLAYER%"=="" if exist "%~dp0tools\mpv\mpv.exe" set "ANI_TUI_PLAYER=%~dp0tools\mpv\mpv.exe"
"%~dp0ani-tui.exe" %*
'@

    Set-Content -Path $wrapperPath -Value $wrapper -Encoding ASCII -Force
    Write-Status "[OK] Created ani-tui.cmd wrapper" "Green"
}

Write-Status "========================================" "Cyan"
Write-Status "ani-tui Windows installer" "Cyan"
Write-Status "========================================" "Cyan"
Write-Status "Install directory: $InstallDir" "White"

New-Item -ItemType Directory -Force -Path $TempRoot | Out-Null

if (-not $SkipDependencies) {
    Install-VisualCppRedistributable
}

$binaryPath = Install-AniTui

$mpvPath = Resolve-MpvPath
if (-not $mpvPath -and -not $SkipDependencies) {
    $mpvPath = Install-MpvWithWinget
}
if (-not $mpvPath -and -not $SkipDependencies) {
    $mpvPath = Install-MpvPortable
}
if (-not $mpvPath) {
    throw "mpv was not found. Install mpv or rerun without -SkipDependencies."
}

[Environment]::SetEnvironmentVariable("ANI_TUI_PLAYER", $mpvPath, "User")
$env:ANI_TUI_PLAYER = $mpvPath
Write-Status "[OK] ANI_TUI_PLAYER set to: $mpvPath" "Green"

if (-not $SkipDependencies) {
    Install-Chafa
}

Write-CmdWrapper

Remove-Item $TempRoot -Recurse -Force -ErrorAction SilentlyContinue

Write-Status ""
Write-Status "========================================" "Green"
Write-Status "Installation complete" "Green"
Write-Status "========================================" "Green"
Write-Status "ani-tui: $binaryPath" "White"
Write-Status "mpv:     $mpvPath" "White"
Write-Status ""
Write-Status "Open a new terminal and run: ani-tui" "Cyan"
Write-Status "If playback fails, inspect: $env:TEMP\ani-tui-mpv.log" "Cyan"
