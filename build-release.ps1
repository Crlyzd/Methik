<#
.SYNOPSIS
    Methik - Simultaneous Multi-Architecture Release Builder (x64 & ARM64)
.DESCRIPTION
    Compiles Methik for both x86_64 and aarch64 (ARM64) targets simultaneously,
    packages upload-ready standalone executables and SHA256 checksums
    into the dedicated root 'dist/' folder ready for GitHub Releases.
#>

param (
    [switch]$Sequential = $false,
    [switch]$NoUpx = $false
)

$ErrorActionPreference = "Stop"
$WorkspaceRoot = $PSScriptRoot
$SrcTauriDir = Join-Path $WorkspaceRoot "src-tauri"
$DistDir = Join-Path $WorkspaceRoot "dist"
$CargoTomlPath = Join-Path $SrcTauriDir "Cargo.toml"

function Show-Header {
    Clear-Host
    Write-Host "==========================================================" -ForegroundColor Cyan
    Write-Host "     METHIK - MULTI-ARCH RELEASE BUILD PIPELINE (x64/ARM) " -ForegroundColor White
    Write-Host "  Compiling & Packaging Upload-Ready Standalone Binaries  " -ForegroundColor DarkGray
    Write-Host "==========================================================" -ForegroundColor Cyan
    Write-Host ""
}

Show-Header

# 1. Read Current Version
if (-not (Test-Path $CargoTomlPath)) {
    Write-Host "[!] Error: Cargo.toml not found at $CargoTomlPath" -ForegroundColor Red
    exit 1
}

$cargoContent = Get-Content $CargoTomlPath -Raw
if ($cargoContent -match 'version\s*=\s*"([^"]+)"') {
    $AppVersion = $matches[1]
} else {
    $AppVersion = "0.1.0"
}

Write-Host "[+] Target Version: " -NoNewline
Write-Host "v$AppVersion" -ForegroundColor Green
Write-Host "[+] Workspace:      $WorkspaceRoot" -ForegroundColor DarkGray
Write-Host "[+] Output Dir:     $DistDir" -ForegroundColor DarkGray
Write-Host ""

# Ensure output directory exists and clean up legacy zip files
if (-not (Test-Path $DistDir)) {
    New-Item -ItemType Directory -Path $DistDir -Force | Out-Null
} else {
    Get-ChildItem -Path $DistDir -Filter "*.zip" -ErrorAction SilentlyContinue | Remove-Item -Force
}

$Targets = @(
    @{
        Name = "x64"
        Triple = "x86_64-pc-windows-msvc"
        OutExeName = "Methik-v$AppVersion-windows-x64.exe"
        BuiltExe = Join-Path $WorkspaceRoot "target\x86_64-pc-windows-msvc\release\methik.exe"
    },
    @{
        Name = "ARM64"
        Triple = "aarch64-pc-windows-msvc"
        OutExeName = "Methik-v$AppVersion-windows-arm64.exe"
        BuiltExe = Join-Path $WorkspaceRoot "target\aarch64-pc-windows-msvc\release\methik.exe"
    }
)

# 2. Check Rustup Targets
Write-Host "[>] Checking installed Rust toolchain targets..." -ForegroundColor Yellow
$installedTargets = rustup target list --installed
foreach ($t in $Targets) {
    if ($installedTargets -notcontains $t.Triple) {
        Write-Host "[!] Installing missing toolchain target: $($t.Triple)..." -ForegroundColor Yellow
        rustup target add $($t.Triple)
    } else {
        Write-Host "  - Target $($t.Triple) ($($t.Name)) is ready." -ForegroundColor DarkGray
    }
}
Write-Host ""

# 3. Compile Targets
$stopwatch = [System.Diagnostics.Stopwatch]::StartNew()

if ($Sequential) {
    Write-Host "[>] Compiling release targets sequentially..." -ForegroundColor Cyan
    foreach ($t in $Targets) {
        Write-Host "    --> Building $($t.Name) ($($t.Triple))..." -ForegroundColor Yellow
        Push-Location $SrcTauriDir
        try {
            cargo build --release --target $($t.Triple)
        } finally {
            Pop-Location
        }
    }
} else {
    Write-Host "[>] Launching simultaneous parallel compilation for x64 and ARM64..." -ForegroundColor Cyan
    $jobs = @()
    foreach ($t in $Targets) {
        $triple = $t.Triple
        $name = $t.Name
        $sb = {
            param($srcDir, $targetTriple)
            Set-Location $srcDir
            cargo build --release --target $targetTriple 2>&1
            return $LASTEXITCODE
        }
        $job = Start-Job -ScriptBlock $sb -ArgumentList $SrcTauriDir, $triple -Name "Build-$name"
        $jobs += @{ Job = $job; Target = $t }
        Write-Host "    [+] Started Job: Build-$name ($triple)" -ForegroundColor DarkCyan
    }

    Write-Host ""
    Write-Host "[*] Waiting for parallel builds to finish..." -ForegroundColor Yellow

    while (($jobs | Where-Object { $_.Job.State -eq 'Running' }).Count -gt 0) {
        Start-Sleep -Milliseconds 800
        $running = ($jobs | Where-Object { $_.Job.State -eq 'Running' } | ForEach-Object { $_.Target.Name }) -join ", "
        Write-Host "    ... Still compiling: $running" -ForegroundColor DarkGray
    }

    # Verify job outcomes
    $hasError = $false
    foreach ($item in $jobs) {
        $job = $item.Job
        $t = $item.Target
        $output = Receive-Job -Job $job
        $exitCode = $job.ChildJobs[0].Output | Select-Object -Last 1
        
        if ($job.State -ne 'Completed') {
            Write-Host "[!] Build failed for $($t.Name)!" -ForegroundColor Red
            Write-Host ($output -join "`n") -ForegroundColor DarkRed
            $hasError = $true
        } else {
            Write-Host "  [OK] Build completed for $($t.Name) ($($t.Triple))" -ForegroundColor Green
        }
        Remove-Job -Job $job -Force
    }

    if ($hasError) {
        Write-Host "[!] Parallel compilation encountered errors. Exiting." -ForegroundColor Red
        exit 1
    }
}

$stopwatch.Stop()
$buildDuration = [math]::Round($stopwatch.Elapsed.TotalSeconds, 1)
Write-Host ""
Write-Host "[OK] Both architectures compiled successfully in $buildDuration s!" -ForegroundColor Green
Write-Host ""

# 4. Packaging and Distributables
Write-Host "[>] Copying executables into dedicated root 'dist/' folder..." -ForegroundColor Cyan
$Artifacts = @()

foreach ($t in $Targets) {
    if (-not (Test-Path $t.BuiltExe)) {
        Write-Host "[!] Error: Compiled executable not found at $($t.BuiltExe)" -ForegroundColor Red
        continue
    }

    $destExe = Join-Path $DistDir $t.OutExeName
    Copy-Item -Path $t.BuiltExe -Destination $destExe -Force

    $exeItem = Get-Item $destExe
    $exeSizeMB = [math]::Round($exeItem.Length / 1MB, 2)
    $exeSizeKB = [math]::Round($exeItem.Length / 1KB, 1)

    $Artifacts += [PSCustomObject]@{
        Name = $t.OutExeName
        Type = "Executable"
        Architecture = $t.Name
        Size = "$exeSizeMB MB ($exeSizeKB KB)"
        Path = $destExe
    }
}

# Also place a generic Methik.exe copy for convenient local running
$hostExe = Join-Path $DistDir "Methik-v$AppVersion-windows-x64.exe"
if (Test-Path $hostExe) {
    Copy-Item -Path $hostExe -Destination (Join-Path $DistDir "Methik.exe") -Force
}

# 5. Generate SHA256 Checksums
Write-Host "[>] Generating SHA256 checksums..." -ForegroundColor Cyan
$checksumFilePath = Join-Path $DistDir "SHA256SUMS.txt"
$checksumLines = @()

foreach ($art in $Artifacts) {
    $hash = (Get-FileHash -Path $art.Path -Algorithm SHA256).Hash.ToLower()
    $checksumLines += "$hash  $($art.Name)"
}

$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllLines($checksumFilePath, $checksumLines, $utf8NoBom)

# 6. Display Summary Table
Write-Host ""
Write-Host "==========================================================" -ForegroundColor Green
Write-Host "         RELEASE ASSETS READY FOR GITHUB UPLOAD           " -ForegroundColor White
Write-Host "==========================================================" -ForegroundColor Green
Write-Host ""

$Artifacts | Format-Table -Property Name, Architecture, Type, Size -AutoSize

Write-Host "Local Host Exe: " -NoNewline
Write-Host "$DistDir\Methik.exe" -ForegroundColor White
Write-Host "Checksum File:  " -NoNewline
Write-Host "$checksumFilePath" -ForegroundColor Cyan
Write-Host ""
Write-Host "----------------------------------------------------------" -ForegroundColor DarkGray
Write-Host "GitHub CLI Release Upload Command:" -ForegroundColor Yellow
Write-Host "gh release create v$AppVersion dist/* --title `"Methik v$AppVersion`" --notes `"Release v$AppVersion`"" -ForegroundColor White
Write-Host "----------------------------------------------------------" -ForegroundColor DarkGray
Write-Host ""
