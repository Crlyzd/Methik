# Architecture & Development Rules for Methik

## 1. Portability & Shared Library Architecture
- **100% Zero-Config Portability**: The user is never forced to install Python, `yt-dlp`, or `ffmpeg` manually.
- **Directory Layout**:
  - Shared Binaries (`yt-dlp`, `ffmpeg`, `ffprobe`, `deno`): `%LOCALAPPDATA%/curlyzed/bin/` (and `%LOCALAPPDATA%/curlyzed/`)
  - Isolated Settings: `%APPDATA%/Methik/config/settings.json`
  - Isolated Logs: `%APPDATA%/Methik/logs/`
  - Legacy AppData Fallback: `%APPDATA%/Methik/bin/`
- **Resolution Order**:
  1. `%LOCALAPPDATA%/curlyzed/bin/` and `%LOCALAPPDATA%/curlyzed/` (Shared curlyzed libraries)
  2. `%APPDATA%/Methik/bin/` (Isolated Methik fallback)
  3. Executable relative `./bin/` (Portable USB mode)
  4. System `$PATH`
- **Auto-Provisioner & Updater**: `engine::provisioner` fetches required standalone binaries directly into `%LOCALAPPDATA%/curlyzed/bin/` on first launch or when triggered via the **Download Binaries** modal.
- **Version Verification**: Minimum version check enforced for engines (`yt-dlp ≥ 2024.01`, `FFmpeg ≥ 5.0`, `Deno ≥ 1.30.0`).

## 2. Integrated Features from Alitken Architecture
- **Titlebar Pin Toggle (`Always on Top`)**: `toggle_always_on_top` Tauri command switching window pinned state with active glow in UI.
- **First Launch Warning Banner**: Persistent header warning if binaries are missing/invalid with quick trigger to download modal.
- **Preferences & Engines Modal**:
  - Theme mode switch (Dark Mode Frosted Glass / Light Mode Mica/Acrylic)
  - Engine version status cards with `Valid (≥ min_ver)` badges
  - Check / Update Binaries action
  - Uninstall Binaries action (clears `%APPDATA%/Methik/bin`)
- **About & Credits Modal**:
  - App version and update check
  - Author credits: "Made with ❤️ by Kaleksanan Bagus" with Saweria & PayPal donation pills
  - "Report Bug / Request Feature" & "Open Logs" actions
  - Engine stack badge (`Tauri v2 · Rust Tokio · Powered by yt-dlp & FFmpeg`)

## 3. UI, Aesthetics & Iconography Standards
- **Monochrome Minimal Vector SVGs Only (STRICT ZERO EMOJI POLICY)**:
  - **NEVER use system emojis (e.g. ⚡, ⚙️, 🎵, ✓, ✕) or colored clipart icons anywhere in the UI or labels**.
  - All icons must be crisp, lightweight monochrome/duotone line SVGs (Feather / Lucide style stroke icons with `stroke: currentColor; fill: none; stroke-width: 2`).
- **Custom Frosted Glass Dropdowns (NO Native OS `<select>`)**:
  - Native OS `<select>` elements render solid, unstyled OS popup boxes in webviews.
  - All format/resolution selectors and menus must be custom HTML/CSS glassmorphic dropdowns with `backdrop-filter: blur(28px)`, translucent borders, and smooth hover/selection transitions.
- **Theme**: Frosted Glass / Glassmorphism Dark Mode.
- **Stack**: Vanilla HTML5, CSS3, ES6 JavaScript. Zero React/Vue/Node bundle bloat.
- **Visuals**:
  - `backdrop-filter: blur(28px)`
  - Semi-transparent cards (`rgba(255, 255, 255, 0.04)`)
  - Subdued gradients, neon accents (Cyan `#00f2fe`, Violet `#4facfe`, Purple `#8a2be2`)
  - Smooth 0.2s–0.3s cubic-bezier micro-animations.

## 4. Modularity & Decoupling
- **No Monoliths**: Never bundle UI handling, subprocess execution, argument parsing, and data modeling into a single file or module.
- **Traits for Backend Operations**: All downloader and metadata actions must implement or interact through abstract traits (`Downloader`, `ProgressObserver`) to enable unit testing and potential backend replacement.
- **Pure Parsers**: Parsing `yt-dlp` output (both `--dump-json`, `--flat-playlist`, and progress lines) must reside in pure functions in `engine::parser` with comprehensive unit tests.

## 5. Playlist & Batch Queue Architecture
- **Flat-Playlist Extraction**: When a playlist URL is detected, use `--flat-playlist --dump-single-json` to rapidly fetch item summaries without querying individual video pages.
- **Batch Models**:
  - `PlaylistMetadata`: `title`, `uploader`, `item_count`, `entries: Vec<PlaylistItemSummary>`.
  - `BatchDownloadProgress`: Tracks `current_index`, `total_items`, `overall_percent`, along with individual `item_progress`.

## 6. Binary Footprint Constraints
- Do not add heavy or unnecessary Cargo dependencies.
- Always verify that release builds maintain `opt-level = "z"` and `lto = true`.
