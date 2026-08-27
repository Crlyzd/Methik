use crate::config::paths::{get_appdata_dir, get_bin_dir, get_config_dir, get_logs_dir};
use crate::engine::dependency::{check_all_dependencies, SystemDependenciesReport};
use crate::engine::provisioner::{
    provision_ffmpeg, provision_ytdlp, uninstall_appdata_binaries, ProvisionProgress,
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

/// Automatically downloads and unpacks yt-dlp and FFmpeg into AppData, emitting progress events
#[tauri::command]
pub async fn provision_dependencies(
    on_progress: Channel<ProvisionProgress>,
    app_handle: AppHandle,
) -> Result<SystemDependenciesReport, String> {
    let handle_for_progress = app_handle.clone();
    let channel_for_progress = on_progress.clone();
    let callback = Arc::new(move |progress: ProvisionProgress| {
        let _ = channel_for_progress.send(progress.clone());
        let _ = handle_for_progress.emit("provision-progress", progress);
    });

    // Provision yt-dlp
    provision_ytdlp(callback.clone())
        .await
        .map_err(|e| format!("Failed to provision yt-dlp: {}", e))?;

    // Provision FFmpeg
    provision_ffmpeg(callback.clone())
        .await
        .map_err(|e| format!("Failed to provision FFmpeg: {}", e))?;

    // Return refreshed dependencies report
    Ok(check_all_dependencies())
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
