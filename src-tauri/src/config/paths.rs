use std::fs;
use std::path::PathBuf;

/// Returns the shared application data root: `%LOCALAPPDATA%/curlyzed` (Windows) or `~/.local/share/curlyzed` (Unix).
pub fn get_shared_curlyzed_dir() -> PathBuf {
    if let Some(base) = dirs::data_local_dir() {
        base.join("curlyzed")
    } else {
        dirs::home_dir()
            .unwrap_or_else(|| PathBuf::from("."))
            .join(".curlyzed")
    }
}

/// Returns the primary application data directory: `%LOCALAPPDATA%/curlyzed/Methik` (Windows) or `~/.local/share/curlyzed/Methik` (Unix).
pub fn get_appdata_dir() -> PathBuf {
    get_shared_curlyzed_dir().join("Methik")
}

/// Returns the legacy Roaming directory: `%APPDATA%/Methik` (for backward compatibility migration)
pub fn get_legacy_roaming_dir() -> Option<PathBuf> {
    dirs::data_dir().map(|d| d.join("Methik"))
}

/// Returns the shared binary directory: `%LOCALAPPDATA%/curlyzed/bin`
pub fn get_bin_dir() -> PathBuf {
    get_shared_curlyzed_dir().join("bin")
}

/// Returns the legacy isolated Methik binary directory: `%APPDATA%/Methik/bin` (for backward compatibility fallback)
pub fn get_legacy_appdata_bin_dir() -> PathBuf {
    if let Some(roaming) = get_legacy_roaming_dir() {
        let r_bin = roaming.join("bin");
        if r_bin.exists() {
            return r_bin;
        }
    }
    get_appdata_dir().join("bin")
}

/// Returns the application logs directory: `%LOCALAPPDATA%/curlyzed/Methik/logs`
pub fn get_logs_dir() -> PathBuf {
    get_appdata_dir().join("logs")
}

/// Returns the application configuration directory: `%LOCALAPPDATA%/curlyzed/Methik/config`
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

/// Reads the user settings from %LOCALAPPDATA%/curlyzed/Methik/config/settings.json or returns defaults
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
    } else if let Some(legacy_dir) = get_legacy_roaming_dir() {
        let legacy_settings = legacy_dir.join("config").join("settings.json");
        if legacy_settings.exists() {
            if let Ok(content) = fs::read_to_string(&legacy_settings) {
                if let Ok(mut settings) = serde_json::from_str::<crate::core::models::UserSettings>(&content) {
                    if settings.download_dir.trim().is_empty() {
                        settings.download_dir = get_default_download_dir().to_string_lossy().to_string();
                    }
                    // Auto-migrate to new local path
                    let _ = save_user_settings(&settings);
                    return settings;
                }
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

const MAX_LOG_SIZE_BYTES: u64 = 2 * 1024 * 1024; // 2 MB strict limit

fn get_utc_timestamp() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let now = SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default();
    let total_secs = now.as_secs();
    let sec = total_secs % 60;
    let min = (total_secs / 60) % 60;
    let hour = (total_secs / 3600) % 24;
    let mut days = total_secs / 86400;

    // Euclidean affine civil calendar conversion from epoch days
    days += 719468;
    let era = days / 146097;
    let doe = days - era * 146097;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let year = if m <= 2 { y + 1 } else { y };

    format!("{:04}-{:02}-{:02} {:02}:{:02}:{:02} UTC", year, m, d, hour, min, sec)
}

/// Appends a structured, timestamped log line to `%APPDATA%/Methik/logs/app.log`.
/// Automatically rotates `app.log` to `app.log.old` when it exceeds 2 MB to prevent log explosion.
pub fn append_app_log(level: &str, module: &str, message: &str) {
    let _ = ensure_app_directories();
    let log_path = get_logs_dir().join("app.log");
    let old_log_path = get_logs_dir().join("app.log.old");

    if let Ok(meta) = fs::metadata(&log_path) {
        if meta.len() >= MAX_LOG_SIZE_BYTES {
            let _ = fs::remove_file(&old_log_path);
            let _ = fs::rename(&log_path, &old_log_path);
        }
    }

    let timestamp = get_utc_timestamp();
    let line = format!("[{}] [{}] [{}] {}\n", timestamp, level.to_uppercase(), module, message);

    use std::io::Write;
    if let Ok(mut file) = fs::OpenOptions::new().create(true).append(true).open(&log_path) {
        let _ = file.write_all(line.as_bytes());
    }

    #[cfg(debug_assertions)]
    {
        print!("{}", line);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_path_resolution() {
        let app_dir = get_appdata_dir();
        assert!(app_dir.to_string_lossy().contains("Methik"));
        assert!(app_dir.to_string_lossy().contains("curlyzed"));

        let shared_dir = get_shared_curlyzed_dir();
        assert!(shared_dir.to_string_lossy().contains("curlyzed"));

        let bin_dir = get_bin_dir();
        assert_eq!(bin_dir, shared_dir.join("bin"));

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
