use serde::{Deserialize, Serialize};
use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Duration;

#[cfg(target_arch = "x86_64")]
pub const CURRENT_ARCH: &str = "x64";

#[cfg(target_arch = "aarch64")]
pub const CURRENT_ARCH: &str = "arm64";

#[cfg(not(any(target_arch = "x86_64", target_arch = "aarch64")))]
pub const CURRENT_ARCH: &str = "x64";

pub const CURRENT_VERSION: &str = env!("CARGO_PKG_VERSION");
pub const GITHUB_REPO: &str = "Crlyzd/Methik";

static UPDATE_CANCELLED: AtomicBool = AtomicBool::new(false);

pub fn set_update_cancelled(val: bool) {
    UPDATE_CANCELLED.store(val, Ordering::SeqCst);
}

pub fn is_update_cancelled() -> bool {
    UPDATE_CANCELLED.load(Ordering::SeqCst)
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppInfo {
    pub name: String,
    pub version: String,
    pub arch: String,
    pub os: String,
    pub is_dev: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateCheckResult {
    pub has_update: bool,
    pub current_version: String,
    pub latest_version: String,
    pub release_name: String,
    pub release_notes: String,
    pub release_url: String,
    pub download_url: Option<String>,
    pub asset_name: Option<String>,
    pub asset_size: u64,
    pub arch: String,
    pub matching_asset_found: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateProgress {
    pub status: String,
    pub downloaded_bytes: u64,
    pub total_bytes: u64,
    pub percentage: f64,
    pub message: String,
}

#[derive(Debug, Deserialize)]
struct GithubAsset {
    name: String,
    size: u64,
    browser_download_url: String,
}

#[derive(Debug, Deserialize)]
struct GithubRelease {
    tag_name: String,
    name: Option<String>,
    body: Option<String>,
    html_url: String,
    assets: Vec<GithubAsset>,
}

/// Returns application metadata including running architecture
pub fn get_application_info() -> AppInfo {
    AppInfo {
        name: "Methik".to_string(),
        version: CURRENT_VERSION.to_string(),
        arch: CURRENT_ARCH.to_string(),
        os: std::env::consts::OS.to_string(),
        is_dev: cfg!(debug_assertions),
    }
}

/// Compares two semver version strings (e.g. "0.2.0" vs "0.1.0", "v0.2.0" vs "0.1.0")
pub fn is_version_newer(latest: &str, current: &str) -> bool {
    let parse = |v: &str| -> (u64, u64, u64, String) {
        let clean = v.trim().trim_start_matches('v').trim_start_matches('V');
        let mut parts = clean.splitn(2, '-');
        let nums = parts.next().unwrap_or("0.0.0");
        let pre = parts.next().unwrap_or("").to_string();

        let mut num_parts = nums.split('.');
        let major = num_parts.next().and_then(|s| s.parse::<u64>().ok()).unwrap_or(0);
        let minor = num_parts.next().and_then(|s| s.parse::<u64>().ok()).unwrap_or(0);
        let patch = num_parts.next().and_then(|s| s.parse::<u64>().ok()).unwrap_or(0);

        (major, minor, patch, pre)
    };

    let (l_maj, l_min, l_pat, l_pre) = parse(latest);
    let (c_maj, c_min, c_pat, c_pre) = parse(current);

    if (l_maj, l_min, l_pat) > (c_maj, c_min, c_pat) {
        return true;
    }

    if (l_maj, l_min, l_pat) == (c_maj, c_min, c_pat) {
        // If current has pre-release tag and latest is release, latest is newer
        if !c_pre.is_empty() && l_pre.is_empty() {
            return true;
        }
    }

    false
}

/// Checks GitHub Releases API for latest release matching current system architecture
pub async fn check_latest_release() -> Result<UpdateCheckResult, String> {
    let client = reqwest::Client::builder()
        .user_agent("Methik-App-Updater")
        .timeout(Duration::from_secs(10))
        .build()
        .map_err(|e| format!("HTTP client initialization failed: {}", e))?;

    let url = format!("https://api.github.com/repos/{}/releases/latest", GITHUB_REPO);
    let response = client
        .get(&url)
        .header("Accept", "application/vnd.github.v3+json")
        .send()
        .await
        .map_err(|e| format!("Failed to reach GitHub release API: {}", e))?;

    if !response.status().is_success() {
        return Err(format!("GitHub API responded with HTTP status {}", response.status()));
    }

    let release: GithubRelease = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse GitHub release metadata: {}", e))?;

    let latest_tag = release.tag_name.trim().to_string();
    let latest_clean_version = latest_tag.trim_start_matches('v').trim_start_matches('V').to_string();
    let has_update = is_version_newer(&latest_clean_version, CURRENT_VERSION);

    // Locate binary asset for running architecture (x64 vs arm64)
    let arch_target = CURRENT_ARCH.to_lowercase();
    let mut matching_asset: Option<&GithubAsset> = None;

    for asset in &release.assets {
        let name_lower = asset.name.to_lowercase();
        // Look for matching architecture and executable format
        if arch_target == "arm64" {
            if (name_lower.contains("arm64") || name_lower.contains("aarch64")) && name_lower.ends_with(".exe") {
                matching_asset = Some(asset);
                break;
            }
        } else {
            // x64 target
            if (name_lower.contains("x64") || name_lower.contains("x86_64")) 
                && !name_lower.contains("arm") 
                && name_lower.ends_with(".exe") 
            {
                matching_asset = Some(asset);
                break;
            }
        }
    }

    // Fallback: If no exact architecture-tagged exe found but single .exe exists and matches arch pattern
    if matching_asset.is_none() {
        for asset in &release.assets {
            let name_lower = asset.name.to_lowercase();
            if arch_target == "arm64" && (name_lower.contains("arm") || name_lower.contains("aarch")) {
                matching_asset = Some(asset);
                break;
            } else if arch_target == "x64" && !name_lower.contains("arm") && name_lower.ends_with(".exe") {
                matching_asset = Some(asset);
                break;
            }
        }
    }

    let download_url = matching_asset.map(|a| a.browser_download_url.clone());
    let asset_name = matching_asset.map(|a| a.name.clone());
    let asset_size = matching_asset.map(|a| a.size).unwrap_or(0);
    let matching_asset_found = matching_asset.is_some();

    Ok(UpdateCheckResult {
        has_update,
        current_version: CURRENT_VERSION.to_string(),
        latest_version: latest_clean_version,
        release_name: release.name.unwrap_or_else(|| format!("Methik {}", latest_tag)),
        release_notes: release.body.unwrap_or_default(),
        release_url: release.html_url,
        download_url,
        asset_name,
        asset_size,
        arch: CURRENT_ARCH.to_string(),
        matching_asset_found,
    })
}

/// Downloads updated executable and applies atomic replacement
pub async fn perform_update(
    download_url: String,
    on_progress: Arc<dyn Fn(UpdateProgress) + Send + Sync + 'static>,
) -> Result<(), String> {
    set_update_cancelled(false);

    let client = reqwest::Client::builder()
        .user_agent("Methik-App-Updater")
        .build()
        .map_err(|e| format!("HTTP client initialization failed: {}", e))?;

    let response = client
        .get(&download_url)
        .send()
        .await
        .map_err(|e| format!("Download connection error: {}", e))?;

    if !response.status().is_success() {
        return Err(format!("Download failed with HTTP {}", response.status()));
    }

    let total_bytes = response.content_length().unwrap_or(0);
    let updates_dir = crate::config::paths::get_appdata_dir().join("updates");
    if !updates_dir.exists() {
        std::fs::create_dir_all(&updates_dir)
            .map_err(|e| format!("Failed to create updates directory: {}", e))?;
    }

    let temp_new_exe = updates_dir.join(format!("methik_new_{}.exe", std::process::id()));

    // Stream download to temporary executable file
    {
        use futures_util::StreamExt;
        use std::io::Write;

        let mut file = std::fs::File::create(&temp_new_exe)
            .map_err(|e| format!("Failed to create temp update file: {}", e))?;

        let mut stream = response.bytes_stream();
        let mut downloaded: u64 = 0;

        while let Some(chunk_result) = stream.next().await {
            if is_update_cancelled() {
                let _ = std::fs::remove_file(&temp_new_exe);
                return Err("Update download cancelled by user.".to_string());
            }

            let chunk = chunk_result.map_err(|e| format!("Download stream error: {}", e))?;
            file.write_all(&chunk)
                .map_err(|e| format!("Disk write error: {}", e))?;
            downloaded += chunk.len() as u64;

            let percentage = if total_bytes > 0 {
                (downloaded as f64 / total_bytes as f64) * 100.0
            } else {
                0.0
            };

            on_progress(UpdateProgress {
                status: "downloading".to_string(),
                downloaded_bytes: downloaded,
                total_bytes,
                percentage,
                message: format!(
                    "Downloading update: {:.1} MB / {:.1} MB",
                    downloaded as f64 / (1024.0 * 1024.0),
                    total_bytes as f64 / (1024.0 * 1024.0)
                ),
            });
        }

        file.flush().map_err(|e| format!("Disk flush error: {}", e))?;
    }

    on_progress(UpdateProgress {
        status: "applying".to_string(),
        downloaded_bytes: total_bytes,
        total_bytes,
        percentage: 100.0,
        message: "Applying update and restarting...".to_string(),
    });

    // Execute atomic binary replacement and relaunch
    apply_binary_replacement(&temp_new_exe)?;

    Ok(())
}

fn apply_binary_replacement(new_exe_path: &Path) -> Result<(), String> {
    let current_exe = std::env::current_exe()
        .map_err(|e| format!("Failed to resolve running executable path: {}", e))?;

    #[cfg(target_os = "windows")]
    {
        let old_backup = current_exe.with_extension("exe.old");

        // Remove old backup if it exists from previous updates
        if old_backup.exists() {
            let _ = std::fs::remove_file(&old_backup);
        }

        // On Windows, rename active running exe to .old
        std::fs::rename(&current_exe, &old_backup)
            .map_err(|e| format!("Failed to rotate running executable to backup: {}", e))?;

        // Move new exe to original location
        if let Err(err) = std::fs::copy(new_exe_path, &current_exe) {
            // Rollback on failure
            let _ = std::fs::rename(&old_backup, &current_exe);
            return Err(format!("Failed to copy new executable into place: {}", err));
        }

        // Cleanup temporary download file
        let _ = std::fs::remove_file(new_exe_path);

        // Spawn new binary
        std::process::Command::new(&current_exe)
            .spawn()
            .map_err(|e| format!("Failed to spawn updated Methik instance: {}", e))?;

        // Gracefully terminate current process
        std::process::exit(0);
    }

    #[cfg(not(target_os = "windows"))]
    {
        std::fs::copy(new_exe_path, &current_exe)
            .map_err(|e| format!("Failed to overwrite binary: {}", e))?;
        let _ = std::fs::remove_file(new_exe_path);
        std::process::Command::new(&current_exe)
            .spawn()
            .map_err(|e| format!("Failed to spawn updated instance: {}", e))?;
        std::process::exit(0);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_version_comparison() {
        assert!(is_version_newer("0.2.0", "0.1.0"));
        assert!(is_version_newer("1.0.0", "0.9.9"));
        assert!(is_version_newer("v0.1.1", "0.1.0"));
        assert!(is_version_newer("V1.2.3", "1.2.2"));
        assert!(!is_version_newer("0.1.0", "0.1.0"));
        assert!(!is_version_newer("0.1.0", "0.2.0"));
        assert!(!is_version_newer("v0.1.0", "0.1.0"));
    }

    #[test]
    fn test_app_info() {
        let info = get_application_info();
        assert_eq!(info.name, "Methik");
        assert!(!info.version.is_empty());
        assert!(info.arch == "x64" || info.arch == "arm64");
    }
}
