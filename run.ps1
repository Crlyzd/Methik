<#
.SYNOPSIS
    Methik - Build & Live-Test Utility Script
.DESCRIPTION
    Provides automated options to live-test, run tests, and compile the smallest possible release binary.
#>

param (
    [Parameter(Position=0)]
    [string]$Action = ""
)

$WorkspaceRoot = $PSScriptRoot
$SrcTauriDir = Join-Path $WorkspaceRoot "src-tauri"
$ReleaseExe = Join-Path $WorkspaceRoot "target\release\methik.exe"
$DebugExe = Join-Path $WorkspaceRoot "target\debug\methik.exe"

function Show-Header {
    Clear-Host
    Write-Host "==========================================================" -ForegroundColor Cyan
    Write-Host "             METHIK - BUILD & TEST UTILITY               " -ForegroundColor White
    Write-Host "  Ultra-Lightweight Frosted Glass YouTube Downloader      " -ForegroundColor DarkGray
    Write-Host "==========================================================" -ForegroundColor Cyan
    Write-Host ""
}

function Run-LiveTest {
    Show-Header
    Write-Host "[>] Launching Methik in Live Real-Time Development Mode..." -ForegroundColor Green
    Write-Host "    Webview and backend will auto-reload when you save changes." -ForegroundColor DarkGray
    Write-Host ""

    # Stop any existing running instance first
    Get-Process "methik" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
    Start-Sleep -Milliseconds 400

    npx --yes @tauri-apps/cli dev
}

function Build-SmallestRelease {
    Show-Header
    Write-Host "[>] Compiling Smallest Possible Release Binary..." -ForegroundColor Green
    Write-Host "    Applying: opt-level = 'z', LTO, Codegen Units = 1, Stripped Symbols" -ForegroundColor DarkGray
    Write-Host ""

    Push-Location $SrcTauriDir
    try {
        # Build with release profile
        cargo build --release -j 2

        if (Test-Path $ReleaseExe) {
            $SizeBytes = (Get-Item $ReleaseExe).Length
            $SizeMB = [math]::Round($SizeBytes / 1MB, 2)
            $SizeKB = [math]::Round($SizeBytes / 1KB, 1)

            Write-Host ""
            Write-Host "==========================================================" -ForegroundColor Green
            Write-Host "  [OK] Build Successful!" -ForegroundColor Green
            Write-Host "  Executable: $ReleaseExe" -ForegroundColor White
            Write-Host "  Final Size: $SizeMB MB ($SizeKB KB / $SizeBytes bytes)" -ForegroundColor Cyan
            Write-Host "==========================================================" -ForegroundColor Green

            # Optional UPX compression if installed
            $upx = Get-Command upx -ErrorAction SilentlyContinue
            if ($upx) {
                Write-Host ""
                $compress = Read-Host "UPX packer detected. Compress executable further? (y/N)"
                if ($compress -eq 'y' -or $compress -eq 'Y') {
                    Write-Host "[>] Running UPX ultra-compression..." -ForegroundColor Yellow
                    upx --ultra-brute $ReleaseExe
                    $UpxBytes = (Get-Item $ReleaseExe).Length
                    $UpxMB = [math]::Round($UpxBytes / 1MB, 2)
                    Write-Host "  [OK] UPX Size: $UpxMB MB ($UpxBytes bytes)" -ForegroundColor Green
                }
            }

            Write-Host ""
            $runNow = Read-Host "Do you want to run the compiled release app now? (Y/n)"
            if ($runNow -ne 'n' -and $runNow -ne 'N') {
                Start-Process $ReleaseExe
            }
        } else {
            Write-Host "[!] Error: Compiled binary not found at $ReleaseExe" -ForegroundColor Red
        }
    } finally {
        Pop-Location
    }
}

function Run-Tests {
    Show-Header
    Write-Host "[>] Running All Unit Tests..." -ForegroundColor Green
    Push-Location $SrcTauriDir
    try {
        cargo test -- --nocapture
    } finally {
        Pop-Location
    }
}

function Open-AppDataFolder {
    $appDataPath = [System.IO.Path]::Combine($env:APPDATA, "Methik")
    if (-not (Test-Path $appDataPath)) {
        New-Item -ItemType Directory -Path $appDataPath -Force | Out-Null
    }
    Write-Host "[>] Opening AppData directory: $appDataPath" -ForegroundColor Cyan
    Start-Process "explorer.exe" $appDataPath
}

function Clean-Cache {
    Show-Header
    Write-Host "[>] Cleaning Cargo build cache..." -ForegroundColor Yellow
    Push-Location $SrcTauriDir
    try {
        cargo clean
        Write-Host "  [OK] Cache cleaned." -ForegroundColor Green
    } finally {
        Pop-Location
    }
}

# Main Dispatcher
if ($Action -eq "run" -or $Action -eq "test-live") {
    Run-LiveTest
    exit
} elseif ($Action -eq "build" -or $Action -eq "release") {
    Build-SmallestRelease
    exit
} elseif ($Action -eq "test" -or $Action -eq "unit-tests") {
    Run-Tests
    exit
} elseif ($Action -eq "appdata") {
    Open-AppDataFolder
    exit
} elseif ($Action -eq "clean") {
    Clean-Cache
    exit
}

# Interactive Menu
while ($true) {
    Show-Header
    Write-Host "  1. Live Test App (Run Dev Mode)" -ForegroundColor White
    Write-Host "  2. Build Smallest Release Binary" -ForegroundColor White
    Write-Host "  3. Run Unit Test Suite" -ForegroundColor White
    Write-Host "  4. Open Isolated %APPDATA%/Methik Folder" -ForegroundColor White
    Write-Host "  5. Clean Target Build Cache" -ForegroundColor White
    Write-Host "  0. Exit" -ForegroundColor DarkGray
    Write-Host ""

    $choice = Read-Host "Select an option (1-5, 0 to exit)"

    switch ($choice) {
        "1" { Run-LiveTest; Pause }
        "2" { Build-SmallestRelease; Pause }
        "3" { Run-Tests; Pause }
        "4" { Open-AppDataFolder; Start-Sleep -Seconds 1 }
        "5" { Clean-Cache; Pause }
        "0" { exit }
        default { Write-Host "Invalid choice. Press Enter to continue..." -ForegroundColor Yellow; Pause }
    }
}
