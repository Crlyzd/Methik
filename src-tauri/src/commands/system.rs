use crate::config::paths::{get_appdata_dir, get_bin_dir, get_config_dir, get_logs_dir};
use crate::engine::dependency::{check_all_dependencies, SystemDependenciesReport};
use crate::engine::provisioner::{
    provision_deno, provision_ffmpeg, provision_ytdlp, set_provision_cancelled,
    uninstall_appdata_binaries, ProvisionProgress,
};
use serde::{Deserialize, Serialize};
use std::process::Command;
use std::sync::Arc;
use tauri::{AppHandle, Emitter};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SystemPathsInfo {
    pub appdata_dir: String,
    pub bin_dir: String,
    pub logs_dir: String,
    pub config_dir: String,
}

/// Queries current status of yt-dlp and FFmpeg dependencies
#[tauri::command]
pub fn check_system_dependencies() -> Result<SystemDependenciesReport, String> {
    Ok(check_all_dependencies())
}

use tauri::ipc::Channel;

/// Automatically downloads and unpacks only missing/invalid dependencies (yt-dlp, FFmpeg, Deno) into AppData, emitting progress events
#[tauri::command]
pub async fn provision_dependencies(
    on_progress: Channel<ProvisionProgress>,
    app_handle: AppHandle,
) -> Result<SystemDependenciesReport, String> {
    // Reset cancellation flag
    set_provision_cancelled(false);

    let handle_for_progress = app_handle.clone();
    let channel_for_progress = on_progress.clone();
    let callback = Arc::new(move |progress: ProvisionProgress| {
        let _ = channel_for_progress.send(progress.clone());
        let _ = handle_for_progress.emit("provision-progress", progress);
    });

    let current = check_all_dependencies();

    // Provision yt-dlp only if missing or invalid
    if !current.ytdlp.is_valid {
        provision_ytdlp(callback.clone())
            .await
            .map_err(|e| format!("Failed to provision yt-dlp: {}", e))?;
    }

    // Provision FFmpeg only if missing or invalid
    if !current.ffmpeg.is_valid {
        provision_ffmpeg(callback.clone())
            .await
            .map_err(|e| format!("Failed to provision FFmpeg: {}", e))?;
    }

    // Provision Deno (JS Challenge Solver) only if missing or invalid
    if !current.deno.is_valid {
        provision_deno(callback.clone())
            .await
            .map_err(|e| format!("Failed to provision Deno: {}", e))?;
    }

    // Return refreshed dependencies report
    Ok(check_all_dependencies())
}

/// Cancels any active dependency provisioning download
#[tauri::command]
pub fn cancel_provisioning() -> Result<(), String> {
    set_provision_cancelled(true);
    Ok(())
}

/// Opens the %APPDATA%/Methik directory in OS file manager
#[tauri::command]
pub fn open_appdata_folder() -> Result<(), String> {
    let path = get_appdata_dir();
    open_folder_in_os(&path.to_string_lossy())
}

/// Opens the %APPDATA%/Methik/logs directory in OS file manager
#[tauri::command]
pub fn open_logs_folder() -> Result<(), String> {
    let path = get_logs_dir();
    open_folder_in_os(&path.to_string_lossy())
}

/// Opens the specified download folder (or user settings default / Desktop) in the OS file manager
#[tauri::command]
pub fn open_download_folder(path: Option<String>) -> Result<(), String> {
    let target_str = match path {
        Some(p) if !p.trim().is_empty() => p,
        _ => crate::config::paths::load_user_settings().download_dir,
    };

    let target_path = std::path::PathBuf::from(target_str);
    if !target_path.exists() {
        let _ = std::fs::create_dir_all(&target_path);
    }

    open_folder_in_os(&target_path.to_string_lossy())
}

/// Deletes binaries from %APPDATA%/Methik/bin
#[tauri::command]
pub fn uninstall_binaries() -> Result<SystemDependenciesReport, String> {
    uninstall_appdata_binaries().map_err(|e| format!("Failed to uninstall binaries: {}", e))?;
    Ok(check_all_dependencies())
}

/// Returns application storage paths
#[tauri::command]
pub fn get_system_paths() -> Result<SystemPathsInfo, String> {
    Ok(SystemPathsInfo {
        appdata_dir: get_appdata_dir().to_string_lossy().to_string(),
        bin_dir: get_bin_dir().to_string_lossy().to_string(),
        logs_dir: get_logs_dir().to_string_lossy().to_string(),
        config_dir: get_config_dir().to_string_lossy().to_string(),
    })
}

/// Retrieves saved user settings from AppData or returns defaults (defaulting download folder to Desktop)
#[tauri::command]
pub fn get_user_settings() -> Result<crate::core::models::UserSettings, String> {
    Ok(crate::config::paths::load_user_settings())
}

/// Saves user preferences to %APPDATA%/Methik/config/settings.json
#[tauri::command]
pub fn save_user_settings_command(settings: crate::core::models::UserSettings) -> Result<(), String> {
    crate::config::paths::save_user_settings(&settings)
        .map_err(|e| format!("Failed to save settings: {}", e))
}

/// Spawns a native OS folder picker dialog to select custom download destination
#[tauri::command]
pub async fn select_download_folder() -> Result<Option<String>, String> {
    tokio::task::spawn_blocking(|| {
        #[cfg(target_os = "windows")]
        {
            let script = r#"
Add-Type -AssemblyName System.Windows.Forms
$dialog = New-Object System.Windows.Forms.FolderBrowserDialog
$dialog.Description = "Select Download Directory"
$dialog.ShowNewFolderButton = $true
if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {
    Write-Output $dialog.SelectedPath
}
"#;
            let output = Command::new("powershell")
                .args(["-NoProfile", "-NonInteractive", "-Command", script])
                .output()
                .map_err(|e| format!("Failed to open folder picker: {}", e))?;

            if output.status.success() {
                let chosen = String::from_utf8_lossy(&output.stdout).trim().to_string();
                if !chosen.is_empty() {
                    return Ok(Some(chosen));
                }
            }
            Ok(None)
        }
        #[cfg(not(target_os = "windows"))]
        {
            Ok(None)
        }
    })
    .await
    .map_err(|e| format!("Task execution error: {}", e))?
}

/// Opens an external URL in the user's default browser safely
#[tauri::command]
pub fn open_url(url: String) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        Command::new("rundll32")
            .args(["url.dll,FileProtocolHandler", &url])
            .spawn()
            .map_err(|e| format!("Failed to open URL in browser: {}", e))?;
    }
    #[cfg(target_os = "macos")]
    {
        Command::new("open")
            .arg(&url)
            .spawn()
            .map_err(|e| format!("Failed to open URL in browser: {}", e))?;
    }
    #[cfg(target_os = "linux")]
    {
        Command::new("xdg-open")
            .arg(&url)
            .spawn()
            .map_err(|e| format!("Failed to open URL in browser: {}", e))?;
    }
    Ok(())
}

fn open_folder_in_os(path_str: &str) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        Command::new("explorer")
            .arg(path_str)
            .spawn()
            .map_err(|e| format!("Failed to open explorer: {}", e))?;
    }
    #[cfg(target_os = "macos")]
    {
        Command::new("open")
            .arg(path_str)
            .spawn()
            .map_err(|e| format!("Failed to open Finder: {}", e))?;
    }
    #[cfg(target_os = "linux")]
    {
        Command::new("xdg-open")
            .arg(path_str)
            .spawn()
            .map_err(|e| format!("Failed to open file manager: {}", e))?;
    }
    Ok(())
}

#[cfg(target_os = "windows")]
mod win_clipboard {
    use std::ffi::c_void;
    use std::ptr;

    #[link(name = "user32")]
    extern "system" {
        fn OpenClipboard(hWndNewOwner: *mut c_void) -> i32;
        fn CloseClipboard() -> i32;
        fn GetClipboardData(uFormat: u32) -> *mut c_void;
    }

    #[link(name = "kernel32")]
    extern "system" {
        fn GlobalLock(hMem: *mut c_void) -> *mut c_void;
        fn GlobalUnlock(hMem: *mut c_void) -> i32;
    }

    const CF_UNICODETEXT: u32 = 13;

    pub fn get_text() -> Result<String, String> {
        unsafe {
            if OpenClipboard(ptr::null_mut()) == 0 {
                return Ok(String::new());
            }

            let handle = GetClipboardData(CF_UNICODETEXT);
            if handle.is_null() {
                CloseClipboard();
                return Ok(String::new());
            }

            let ptr = GlobalLock(handle) as *const u16;
            if ptr.is_null() {
                CloseClipboard();
                return Ok(String::new());
            }

            let mut len = 0;
            while *ptr.add(len) != 0 {
                len += 1;
            }

            let slice = std::slice::from_raw_parts(ptr, len);
            let text = String::from_utf16_lossy(slice);

            GlobalUnlock(handle);
            CloseClipboard();

            Ok(text)
        }
    }
}

/// Reads plain text from the native system clipboard without triggering webview permission dialogs
#[tauri::command]
pub fn read_clipboard() -> Result<String, String> {
    #[cfg(target_os = "windows")]
    {
        win_clipboard::get_text()
    }
    #[cfg(not(target_os = "windows"))]
    {
        Ok(String::new())
    }
}

/// Returns whether the application is running in development / debug mode
#[tauri::command]
pub fn is_dev_mode() -> bool {
    cfg!(debug_assertions)
}

/// Records a log event into %APPDATA%/Methik/logs/app.log
#[tauri::command]
pub fn log_client_event(level: String, module: String, message: String) -> Result<(), String> {
    crate::config::paths::append_app_log(&level, &module, &message);
    Ok(())
}

/// Returns application metadata including version and running architecture (x64 / arm64)
#[tauri::command]
pub fn get_app_info() -> crate::engine::updater::AppInfo {
    crate::engine::updater::get_application_info()
}

/// Checks GitHub releases API for latest release matching current system architecture
#[tauri::command]
pub async fn check_for_updates() -> Result<crate::engine::updater::UpdateCheckResult, String> {
    crate::engine::updater::check_latest_release().await
}

/// Downloads and applies update for the running architecture
#[tauri::command]
pub async fn download_and_apply_update(
    download_url: String,
    on_progress: Channel<crate::engine::updater::UpdateProgress>,
    app_handle: AppHandle,
) -> Result<(), String> {
    let handle_for_progress = app_handle.clone();
    let channel_for_progress = on_progress.clone();
    let callback = Arc::new(move |progress: crate::engine::updater::UpdateProgress| {
        let _ = channel_for_progress.send(progress.clone());
        let _ = handle_for_progress.emit("update-progress", progress);
    });

    crate::engine::updater::perform_update(download_url, callback).await
}

/// Cancels an in-progress update download
#[tauri::command]
pub fn cancel_update() -> Result<(), String> {
    crate::engine::updater::set_update_cancelled(true);
    Ok(())
}
