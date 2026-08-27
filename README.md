# Methik

<p align="center">
  <strong>Ultra-lightweight, 100% portable YouTube video & audio downloader desktop application.</strong><br>
  Powered by <strong>Rust (Tauri v2)</strong> and a minimalist <strong>Frosted Glass / Light Mica</strong> web interface.
</p>

---

## Key Features

- **100% Portable & Zero Setup**: No Python, `yt-dlp`, or `ffmpeg` needed in system `$PATH`. Methik automatically downloads and manages portable binaries directly inside `%APPDATA%/Methik/bin/`.
- **Ultra-Small Binary Footprint**: Total release binary under 6 MB with native WebView2 integration and sub-50 KB vanilla frontend.
- **Dual Theme Support**: Switch seamlessly between **Dark Mode (Frosted Glass)** and **Light Mode (Mica / Acrylic)** with persistent settings.
- **High-Quality Stream Downloads**:
  - Video: **4K UHD**, **1080p FHD**, **720p HD**, **480p SD** (MP4)
  - Audio: **MP3 320k**, **FLAC Lossless**
  - Full YouTube Playlist parsing and batch downloads
- **Alitken-Inspired UX**: Custom frosted glass dropdowns, interactive always-on-top pin, built-in log viewer, and bug reporting.

---

## Quick Start (Clone & Run on Any Machine)

### Option 1: Pure Rust (Zero Node.js Required)
```powershell
# Clone the repository
git clone https://github.com/Crlyzd/Methik.git
cd Methik

# Run directly with Cargo
cargo run --manifest-path src-tauri/Cargo.toml
```

### Option 2: One-Click PowerShell Script
```powershell
powershell -ExecutionPolicy Bypass -File .\run.ps1
```
*Provides an interactive menu for Live Dev Mode, Release Compilation, Unit Tests, and AppData management.*

### Option 3: Using Tauri CLI / NPM
```powershell
npm install
npm run dev
```

---

## Building Standalone Release Executable

To compile the smallest optimized standalone executable (`methik.exe`):

```powershell
# Using cargo
cargo build --release --manifest-path src-tauri/Cargo.toml

# Output will be generated at:
# target/release/methik.exe
```

---

## Architecture & Directory Layout

```text
Methik/
├── .agents/                      # Agent architecture & workflow rules
├── AGENTS.md                     # Agent system instructions
├── Cargo.lock                    # Exact Rust dependency lock
├── Cargo.toml                    # Root workspace config
├── package.json                  # Tauri CLI dev dependencies
├── run.ps1                       # Interactive runner & build utility
├── src-tauri/                    # Rust backend
│   ├── Cargo.toml
│   ├── tauri.conf.json           # Window configuration (500x500 fixed)
│   └── src/
│       ├── main.rs               # App entrypoint
│       ├── lib.rs                # IPC command registry
│       ├── commands/             # Tauri IPC handlers (system, metadata, download, window)
│       ├── config/               # Settings & AppData path resolution
│       ├── core/                 # Video/Audio data models & error types
│       └── engine/               # yt-dlp & FFmpeg auto-provisioner and stream parsers
└── ui/                           # Vanilla Frosted Glass Webview (Zero JS Frameworks)
    ├── index.html                # App views & modals
    ├── css/
    │   └── style.css             # Frosted Glass & Mica Design System
    └── js/
        ├── app.js                # UI controller & theme manager
        └── api.js                # Tauri IPC client bridge
```

---

## Support & Links

- **Author Website**: [kaleksananbagus.com](https://kaleksananbagus.com/)
- **Buy Me a Coffee (Saweria)**: [saweria.co/curlyzed](https://saweria.co/curlyzed)
- **Buy Me a Coffee (PayPal)**: [paypal.me/BagusMassani](https://paypal.me/BagusMassani)
- **Report Bug / Request Feature**: [Google Forms](https://docs.google.com/forms/d/e/1FAIpQLSf9RoZ7ANybXnsOQMyCAFXxSB85rJxr2z767aPOk_gECioiMg/viewform)
