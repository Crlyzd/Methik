use std::fs;
use std::path::PathBuf;

/// Returns the primary application data directory: `%APPDATA%/Methik` (Windows) or `~/.local/share/Methik` (Unix).
pub fn get_appdata_dir() -> PathBuf {
    if let Some(base) = dirs::data_dir() {
        base.join("Methik")
    } else {
        // Fallback to home directory if OS appdata cannot be resolved
        dirs::home_dir()
            .unwrap_or_else(|| PathBuf::from("."))
            .join(".methik")
    }
}

/// Returns the isolated binary directory: `%APPDATA%/Methik/bin`
pub fn get_bin_dir() -> PathBuf {
    get_appdata_dir().join("bin")
}

/// Returns the application logs directory: `%APPDATA%/Methik/logs`
pub fn get_logs_dir() -> PathBuf {
    get_appdata_dir().join("logs")
}

/// Returns the application configuration directory: `%APPDATA%/Methik/config`
pub fn get_config_dir() -> PathBuf {
    get_appdata_dir().join("config")
}

/// Returns the platform-specific binary name for yt-dlp
pub fn get_ytdlp_bin_name() -> &'static str {
    if cfg!(target_os = "windows") {
        "yt-dlp.exe"
    } else {
        "yt-dlp"
    }
}

/// Returns the platform-specific binary name for ffmpeg
pub fn get_ffmpeg_bin_name() -> &'static str {
    if cfg!(target_os = "windows") {
        "ffmpeg.exe"
    } else {
        "ffmpeg"
    }
}

/// Returns the platform-specific binary name for ffprobe
pub fn get_ffprobe_bin_name() -> &'static str {
    if cfg!(target_os = "windows") {
        "ffprobe.exe"
    } else {
        "ffprobe"
    }
}

/// Returns the platform-specific binary name for deno
pub fn get_deno_bin_name() -> &'static str {
    if cfg!(target_os = "windows") {
        "deno.exe"
    } else {
        "deno"
    }
}

/// Returns the full path to the isolated yt-dlp binary in AppData
pub fn get_ytdlp_bin_path() -> PathBuf {
    get_bin_dir().join(get_ytdlp_bin_name())
}

/// Returns the full path to the isolated ffmpeg binary in AppData
pub fn get_ffmpeg_bin_path() -> PathBuf {
    get_bin_dir().join(get_ffmpeg_bin_name())
}

/// Returns the full path to the isolated ffprobe binary in AppData
pub fn get_ffprobe_bin_path() -> PathBuf {
    get_bin_dir().join(get_ffprobe_bin_name())
}

/// Returns the full path to the isolated deno binary in AppData
pub fn get_deno_bin_path() -> PathBuf {
    get_bin_dir().join(get_deno_bin_name())
}

/// Returns the path to the settings JSON file
pub fn get_settings_file_path() -> PathBuf {
    get_config_dir().join("settings.json")
}

/// Returns the system Desktop directory or fallback home/Desktop
pub fn get_default_download_dir() -> PathBuf {
    dirs::desktop_dir()
        .or_else(|| dirs::home_dir().map(|h| h.join("Desktop")))
        .unwrap_or_else(|| PathBuf::from("."))
}

/// Reads the user settings from %APPDATA%/Methik/config/settings.json or returns defaults
pub fn load_user_settings() -> crate::core::models::UserSettings {
    let settings_path = get_settings_file_path();
    if settings_path.exists() {
        if let Ok(content) = fs::read_to_string(&settings_path) {
            if let Ok(mut settings) = serde_json::from_str::<crate::core::models::UserSettings>(&content) {
                if settings.download_dir.trim().is_empty() {
                    settings.download_dir = get_default_download_dir().to_string_lossy().to_string();
                }
                return settings;
            }
        }
    }
    
    let mut default_settings = crate::core::models::UserSettings::default();
    default_settings.download_dir = get_default_download_dir().to_string_lossy().to_string();
    default_settings
}

/// Saves user settings to %APPDATA%/Methik/config/settings.json
pub fn save_user_settings(settings: &crate::core::models::UserSettings) -> Result<(), std::io::Error> {
    ensure_app_directories()?;
    let settings_path = get_settings_file_path();
    let json = serde_json::to_string_pretty(settings)
        .map_err(|e| std::io::Error::new(std::io::ErrorKind::InvalidData, e))?;
    fs::write(settings_path, json)?;
    Ok(())
}

/// Ensures all required application directories (bin, logs, config) exist on the filesystem.
pub fn ensure_app_directories() -> Result<(), std::io::Error> {
    let app_dir = get_appdata_dir();
    let bin_dir = get_bin_dir();
    let logs_dir = get_logs_dir();
    let config_dir = get_config_dir();

    if !app_dir.exists() {
        fs::create_dir_all(&app_dir)?;
    }
    if !bin_dir.exists() {
        fs::create_dir_all(&bin_dir)?;
    }
    if !logs_dir.exists() {
        fs::create_dir_all(&logs_dir)?;
    }
    if !config_dir.exists() {
        fs::create_dir_all(&config_dir)?;
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_path_resolution() {
        let app_dir = get_appdata_dir();
        assert!(app_dir.to_string_lossy().contains("Methik") || app_dir.to_string_lossy().contains(".methik"));

        let bin_dir = get_bin_dir();
        assert_eq!(bin_dir, app_dir.join("bin"));

        let ytdlp_path = get_ytdlp_bin_path();
        assert!(ytdlp_path.to_string_lossy().ends_with(get_ytdlp_bin_name()));
    }

    #[test]
    fn test_directory_creation() {
        let res = ensure_app_directories();
        assert!(res.is_ok());
        assert!(get_bin_dir().exists());
        assert!(get_logs_dir().exists());
        assert!(get_config_dir().exists());
    }
}
