# Methik - Project Agent Instructions & Architecture Reference

## Overview & Mission
Methik is an ultra-lightweight, **100% portable**, modular Video & Audio Downloader desktop application.
It integrates with `yt-dlp` and `FFmpeg` to fetch metadata and stream downloads from **1,000+ websites** (YouTube, TikTok, Instagram Reels & Stories, Facebook, Twitter / X, Reddit, Twitch, SoundCloud, and more), wrapped in a high-performance **Rust (Tauri v2)** backend and a **Frosted Glass (Glassmorphism)** minimalist frontend.

## Multi-Agent Development Workflow

To ensure zero hallucination, maximum code quality, and strict adherence to architecture, development proceeds under a structured multi-agent protocol:

> **MANDATORY RULE 0 - ALWAYS PLAN FIRST**: Before writing, editing, or deleting ANY codebase files, a detailed architectural/implementation plan MUST be drafted and approved by the user. Unplanned modifications are strictly forbidden.

```mermaid
graph LR
    Orchestrator[1. Orchestrator / Architect: Plan Creation] --> UserApprove[2. User Approval]
    UserApprove --> CodingSpecialist[3. Coding Specialist: Implementation]
    CodingSpecialist --> CodeReviewer[4. Code Reviewer: Audit & Verification]
    CodeReviewer --> NextStep[5. Step Completion & Handoff to Next Step]
```

1. **`/orchestrator` / `/architect`**:
   - Decomposes tasks into atomic, checkable steps.
   - Formulates exact scope, affected files, and verification criteria.
   - Obtains explicit user approval before execution.
2. **`/coding-specialist`**:
   - Implements approved steps completely without placeholders or shortcuts.
   - Follows strict modularity, clean error handling, and memory/size efficiency.
3. **`/code-reviewer`**:
   - Audits code for security, performance, DRY principles, and adherence to portability and monochrome SVG rules.
   - Verifies tests and compilation (`cargo check`, `cargo test`) before sign-off.

---

## Key Architectural Principles

1. **100% Portability & Shared Library Architecture**:
   - The user does **NOT** need to manually install Python, `yt-dlp`, or `ffmpeg` to their system `$PATH`.
   - External binaries are shared across curlyzed apps in `%LOCALAPPDATA%/curlyzed/bin/` (and `%LOCALAPPDATA%/curlyzed/`) to prevent duplicate storage.
   - Methik maintains isolated logs and settings in `%LOCALAPPDATA%/curlyzed/Methik/` (`logs/`, `config/settings.json`, `updates/`).
   - The application includes an auto-provisioner module that silently/transparently downloads and verifies `yt-dlp.exe`, `ffmpeg.exe`, `ffprobe.exe`, and `deno.exe` directly into the shared library directory (`%LOCALAPPDATA%/curlyzed/bin/`).
   - **Priority Binary Resolution**:
     1. `%LOCALAPPDATA%/curlyzed/bin/` and `%LOCALAPPDATA%/curlyzed/` (Shared curlyzed libraries)
     2. `%LOCALAPPDATA%/curlyzed/Methik/bin/` & `%APPDATA%/Methik/bin/` (Isolated Methik AppData fallback)
     3. Executable relative `./bin/` (Portable USB drive mode)
     4. System `$PATH` fallback

2. **Browser Cookie Authentication & Multi-Platform Support**:
   - Seamless extraction and injection of browser cookies via `--cookies-from-browser <BROWSER>` (supports Chrome, Edge, Firefox, Brave, Opera, Vivaldi, Chromium, Safari).
   - Supports custom Netscape cookie file selection (`--cookies <PATH>`).
   - Enables downloading member-only, age-restricted, and private social media content without exposing login credentials.

3. **Strict Layered Non-Monolithic Architecture**:
   - **Presentation (Frontend)**: Vanilla HTML5, Vanilla CSS3 (Glassmorphism), Vanilla ES6+ JS. Zero heavy JS frameworks (React, Vue, Node.js runtime). Total frontend bundle under 50 KB.
   - **Tauri IPC Command Layer** (`src-tauri/src/commands/`): Thin handlers exposing commands and streaming async progress events.
     - `metadata`: `fetch_video_metadata`, `fetch_playlist_metadata`
     - `download`: `start_download`, `start_playlist_download`, `cancel_download`
     - `system`: `check_dependencies`, `provision_dependencies`, `open_logs_directory`, `open_path_in_explorer`, `check_for_updates`, `get_app_version`
     - `window`: `toggle_always_on_top`, `is_always_on_top`
   - **Core Domain** (`src-tauri/src/core/`): Pure data models (`VideoMetadata`, `PlaylistMetadata`, `DownloadProgress`, `FormatInfo`), traits, and strongly-typed errors (`thiserror`).
   - **Engine Layer** (`src-tauri/src/engine/`): Dependency locator, AppData auto-provisioner, argument builder, stdout stream parser, updater, and child process executor.
   - **Config Layer** (`src-tauri/src/config/`): AppData paths, directory resolution, and settings persistence.

4. **UI, Aesthetics & Iconography Standards**:
   - **Monochrome Minimal Vector SVGs Only (STRICT ZERO EMOJI POLICY)**: NEVER use system emojis (e.g. ⚡, ⚙️, 🎵, ✓, ✕) or colored clipart characters anywhere in text, labels, status messages, or UI elements. All indicators must use crisp, lightweight monochrome stroke SVGs (`stroke: currentColor; fill: none; stroke-width: 2`).
   - **Custom Frosted Glass Dropdowns (NO Native OS `<select>`)**: Native OS `<select>` popup menus are forbidden because WebView2/Windows renders opaque, unstyled grey/white boxes. All dropdown menus must be custom glassmorphic overlay components (`backdrop-filter: blur(28px)`, translucent borders, smooth transitions).
   - **Frosted Glass (Glassmorphism)**: `backdrop-filter: blur(28px)`, subtle translucent borders (`rgba(255, 255, 255, 0.12)`), ambient glows, and seamless Dark/Light theme switching.
   - **Desktop Controls**: Titlebar pin toggle (`Always on Top`), Settings modal (themes, browsers & engines), About modal (credits & logs), Reveal in Explorer and Open Folder buttons, and first-launch missing dependencies warning banner.

5. **Smallest Binary Footprint & PowerShell Toolchain**:
   - Uses OS-native webview (WebView2 on Windows).
   - Cargo release build size optimizations: `opt-level = "z"`, `lto = true`, `codegen-units = 1`, `panic = "abort"`, `strip = true`.
   - Tooling scripts in workspace root:
     - `run.ps1`: Dev environment check and Tauri runner.
     - `build-release.ps1`: Standalone release packager with UPX compression.
     - `bump-version.ps1`: Synchronized multi-manifest version bumper.

## Directory Structure
```text
methik/
├── .agents/                      # Local AI agent rules (ignored in git)
│   └── rules/
│       ├── architecture.md       # Architectural rules and guidelines
│       └── workflow.md           # Multi-agent workflow rules
├── .gitignore                    # Git ignore configurations
├── AGENTS.md                     # This reference file
├── Cargo.lock                    # Cargo dependency lockfile
├── Cargo.toml                    # Root workspace config
├── LICENSE                       # GNU General Public License v3
├── README.md                     # User documentation
├── build-release.ps1             # Optimized release build script
├── bump-version.ps1              # Version synchronization script
├── package.json                  # NPM scripts & Tauri CLI wrapper
├── package-lock.json             # NPM lockfile
├── run.ps1                       # Dev launcher script
├── src-tauri/                    # Rust backend
│   ├── Cargo.toml                # Backend crate dependencies
│   ├── tauri.conf.json           # Tauri v2 application configuration
│   ├── build.rs                  # Build script
│   ├── icons/                    # Application icons (.ico, .png, .icns)
│   └── src/
│       ├── main.rs               # Desktop executable entrypoint
│       ├── lib.rs                # Core Tauri setup & plugin registration
│       ├── commands/             # Tauri IPC command handlers
│       │   ├── mod.rs
│       │   ├── download.rs       # Video & Playlist download execution
│       │   ├── metadata.rs       # Single video & Playlist info fetching
│       │   ├── system.rs         # Dependencies, Explorer, updater, logs
│       │   └── window.rs         # Always-on-top & window state
│       ├── config/               # Settings & AppData paths
│       │   ├── mod.rs
│       │   └── paths.rs
│       ├── core/                 # Models, errors, traits
│       │   ├── mod.rs
│       │   ├── error.rs
│       │   └── models.rs
│       └── engine/               # yt-dlp, FFmpeg engine & provisioner
│           ├── mod.rs
│           ├── args_builder.rs   # CLI argument construction (formats, cookies)
│           ├── dependency.rs     # Binary locator & version validation
│           ├── parser.rs         # JSON & stream progress parser
│           ├── provisioner.rs    # Auto-provisioning & GitHub release fetcher
│           ├── updater.rs        # App version check & update notifier
│           └── ytdlp.rs          # Subprocess executor
└── ui/                           # Minimalist Frosted Glass Webview (Vanilla)
    ├── icon.png                  # App icon asset
    ├── index.html                # Main UI layout & modal overlays
    ├── css/
    │   └── style.css             # Glassmorphism design tokens & styles
    └── js/
        ├── api.js                # Tauri IPC invoke wrappers & event listeners
        └── app.js                # State management, UI events & animations
```
