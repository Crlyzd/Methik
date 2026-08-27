<#
.SYNOPSIS
    Methik - 1-Click Version Bumper
.DESCRIPTION
    Easily bumps the project semantic version across Tauri config, Cargo.toml,
    package.json, and lockfiles with an interactive menu or command-line parameter.
#>

param (
    [Parameter(Position=0)]
    [string]$TargetBump = "",
    [switch]$NoTag = $false,
    [switch]$Tag = $false
)

$ErrorActionPreference = "Stop"
$WorkspaceRoot = $PSScriptRoot
$SrcTauriDir = Join-Path $WorkspaceRoot "src-tauri"
$CargoTomlPath = Join-Path $SrcTauriDir "Cargo.toml"
$TauriConfPath = Join-Path $SrcTauriDir "tauri.conf.json"
$PackageJsonPath = Join-Path $WorkspaceRoot "package.json"

function Show-Header {
    Clear-Host
    Write-Host "==========================================================" -ForegroundColor Cyan
    Write-Host "               METHIK - VERSION BUMP TOOL                 " -ForegroundColor White
    Write-Host "  Synchronizes Version Across Backend, Frontend & Configs " -ForegroundColor DarkGray
    Write-Host "==========================================================" -ForegroundColor Cyan
    Write-Host ""
}

Show-Header

# 1. Read Current Version from Cargo.toml
if (-not (Test-Path $CargoTomlPath)) {
    Write-Host "[!] Error: Cargo.toml not found at $CargoTomlPath" -ForegroundColor Red
    exit 1
}

$cargoContent = Get-Content $CargoTomlPath -Raw
if ($cargoContent -match '\[package\][\s\S]*?version\s*=\s*"([^"]+)"') {
    $CurrentVersion = $matches[1]
} else {
    Write-Host "[!] Error: Could not determine current version in Cargo.toml" -ForegroundColor Red
    exit 1
}

Write-Host "Current Application Version: " -NoNewline
Write-Host "v$CurrentVersion" -ForegroundColor Green
Write-Host ""

# 2. Parse Semver
$versionParts = $CurrentVersion.Split('.')
$major = 0
$minor = 0
$patch = 0

if ($versionParts.Length -ge 1) { [int]::TryParse($versionParts[0], [ref]$major) | Out-Null }
if ($versionParts.Length -ge 2) { [int]::TryParse($versionParts[1], [ref]$minor) | Out-Null }
if ($versionParts.Length -ge 3) { [int]::TryParse($versionParts[2], [ref]$patch) | Out-Null }

$nextPatch = "$major.$minor.$($patch + 1)"
$nextMinor = "$major.$($minor + 1).0"
$nextMajor = "$($major + 1).0.0"

# 3. Determine New Version
$NewVersion = ""

if ($TargetBump -eq "patch") {
    $NewVersion = $nextPatch
} elseif ($TargetBump -eq "minor") {
    $NewVersion = $nextMinor
} elseif ($TargetBump -eq "major") {
    $NewVersion = $nextMajor
} elseif ($TargetBump -match '^\d+\.\d+(\.\d+)?(-[\w\.]+)?$') {
    $NewVersion = $TargetBump
} else {
    Write-Host "Select Version Bump Type:" -ForegroundColor White
    Write-Host "  1. Patch: $CurrentVersion -> " -NoNewline
    Write-Host "$nextPatch" -ForegroundColor Yellow -NoNewline
    Write-Host " (Bug fixes, small tweaks)" -ForegroundColor DarkGray

    Write-Host "  2. Minor: $CurrentVersion -> " -NoNewline
    Write-Host "$nextMinor" -ForegroundColor Cyan -NoNewline
    Write-Host " (New features, engine updates)" -ForegroundColor DarkGray

    Write-Host "  3. Major: $CurrentVersion -> " -NoNewline
    Write-Host "$nextMajor" -ForegroundColor Magenta -NoNewline
    Write-Host " (Breaking changes / UI overhaul)" -ForegroundColor DarkGray

    Write-Host "  4. Custom Version Input" -ForegroundColor White
    Write-Host "  0. Cancel" -ForegroundColor DarkGray
    Write-Host ""

    $choice = Read-Host "Select an option (1-4, 0 to cancel)"

    switch ($choice) {
        "1" { $NewVersion = $nextPatch }
        "2" { $NewVersion = $nextMinor }
        "3" { $NewVersion = $nextMajor }
        "4" {
            $custom = Read-Host "Enter new version string (e.g. 0.2.0)"
            if ([string]::IsNullOrWhiteSpace($custom)) {
                Write-Host "Aborted: No version entered." -ForegroundColor Yellow
                exit 0
            }
            $NewVersion = $custom.Trim().TrimStart('v').TrimStart('V')
        }
        default {
            Write-Host "Operation cancelled." -ForegroundColor DarkGray
            exit 0
        }
    }
}

Write-Host ""
Write-Host "[>] Bumping version to: " -NoNewline
Write-Host "v$NewVersion" -ForegroundColor Green
Write-Host ""

function Set-Utf8NoBomContent {
    param(
        [Parameter(Mandatory=$true)][string]$Path,
        [Parameter(Mandatory=$true)][string]$Content
    )
    $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText($Path, $Content, $utf8NoBom)
}

# 4. Update src-tauri/Cargo.toml
Write-Host "  [+] Updating src-tauri/Cargo.toml..." -ForegroundColor Cyan
$newCargo = [regex]::Replace($cargoContent, '(\[package\][\s\S]*?version\s*=\s*)"[^"]+"', "`$1`"$NewVersion`"")
Set-Utf8NoBomContent -Path $CargoTomlPath -Content $newCargo

# 5. Update src-tauri/tauri.conf.json
if (Test-Path $TauriConfPath) {
    Write-Host "  [+] Updating src-tauri/tauri.conf.json..." -ForegroundColor Cyan
    $tauriContent = Get-Content $TauriConfPath -Raw
    $newTauri = [regex]::Replace($tauriContent, '"version":\s*"[^"]+"', "`"version`": `"$NewVersion`"")
    Set-Utf8NoBomContent -Path $TauriConfPath -Content $newTauri
}

# 6. Update package.json
if (Test-Path $PackageJsonPath) {
    Write-Host "  [+] Updating package.json..." -ForegroundColor Cyan
    $pkgContent = Get-Content $PackageJsonPath -Raw
    $newPkg = [regex]::Replace($pkgContent, '"version":\s*"[^"]+"', "`"version`": `"$NewVersion`"")
    Set-Utf8NoBomContent -Path $PackageJsonPath -Content $newPkg
}

# 7. Update Cargo.lock
Write-Host "  [+] Refreshing Cargo.lock..." -ForegroundColor Cyan
Push-Location $SrcTauriDir
try {
    cargo check --quiet
} finally {
    Pop-Location
}

Write-Host ""
Write-Host "==========================================================" -ForegroundColor Green
Write-Host "  [OK] Version successfully bumped to v$NewVersion!" -ForegroundColor Green
Write-Host "==========================================================" -ForegroundColor Green
Write-Host ""

# 8. Optional Git Tagging
$gitExe = Get-Command git -ErrorAction SilentlyContinue
if ($gitExe) {
    $shouldCommit = $false
    if ($Tag) {
        $shouldCommit = $true
    } elseif ($NoTag) {
        $shouldCommit = $false
    } else {
        $commitNow = Read-Host "Create Git commit & tag 'v$NewVersion'? (y/N)"
        if ($commitNow -eq 'y' -or $commitNow -eq 'Y') {
            $shouldCommit = $true
        }
    }

    if ($shouldCommit) {
        git add "$CargoTomlPath" "$TauriConfPath" "$PackageJsonPath" (Join-Path $WorkspaceRoot "Cargo.lock")
        git commit -m "chore: bump version to v$NewVersion"
        git tag -a "v$NewVersion" -m "Release v$NewVersion"
        Write-Host "  [OK] Git commit and tag 'v$NewVersion' created!" -ForegroundColor Green
        Write-Host "  Push with: git push origin main --tags" -ForegroundColor Cyan
    }
}
Write-Host ""
