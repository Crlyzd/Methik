use crate::config::paths::{get_bin_dir, get_ffmpeg_bin_name, get_ytdlp_bin_name};
use regex::Regex;
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::process::Command;

pub const MIN_YTDLP_VERSION: &str = "2024.01.01";
pub const MIN_FFMPEG_VERSION: &str = "5.0";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DependencyStatus {
    pub name: String,
    pub is_installed: bool,
    pub version: Option<String>,
    pub path: Option<String>,
    pub is_valid: bool,
    pub min_version_required: String,
    pub source: Option<String>, // "AppData", "Local Bin", "System PATH", or None
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SystemDependenciesReport {
    pub ytdlp: DependencyStatus,
    pub ffmpeg: DependencyStatus,
    pub all_valid: bool,
}

/// Locates a binary checking in priority order:
/// 1. %APPDATA%/Methik/bin/
/// 2. Relative ./bin/
/// 3. System $PATH
pub fn locate_binary(bin_name: &str) -> Option<(PathBuf, &'static str)> {
    // Priority 1: AppData isolated directory
    let appdata_bin = get_bin_dir().join(bin_name);
    if appdata_bin.is_file() {
        return Some((appdata_bin, "AppData"));
    }

    // Priority 2: Relative ./bin/
    let local_bin = PathBuf::from("bin").join(bin_name);
    if local_bin.is_file() {
        return Some((local_bin, "Local Bin"));
    }

    // Priority 3: System PATH
    if let Ok(system_path) = which::which(bin_name) {
        return Some((system_path, "System PATH"));
    }

    None
}

/// Extracts yt-dlp version from `yt-dlp --version` output
pub fn parse_ytdlp_version(output: &str) -> Option<String> {
    let re = Regex::new(r"(\d{4}\.\d{2}\.\d{2}(\.\d+)?)").ok()?;
    re.captures(output).map(|cap| cap[1].to_string())
}

/// Extracts FFmpeg version from `ffmpeg -version` output
pub fn parse_ffmpeg_version(output: &str) -> Option<String> {
    // Matches formats like "ffmpeg version 7.1", "ffmpeg version n7.0.2", "ffmpeg version 5.1.2-..."
    let re = Regex::new(r"ffmpeg\s+version\s+([Nn]?\d+(\.\d+)*)").ok()?;
    if let Some(cap) = re.captures(output) {
        let ver = cap[1].trim_start_matches(|c| c == 'N' || c == 'n');
        return Some(ver.to_string());
    }
    // Fallback if git build format
    if output.contains("ffmpeg version") {
        return Some("Custom / Latest".to_string());
    }
    None
}

/// Validates whether yt-dlp version meets the minimum requirement (e.g. 2024.01.01)
pub fn is_ytdlp_version_valid(found: &str) -> bool {
    let sanitize = |v: &str| -> u64 {
        let parts: Vec<&str> = v.split('.').collect();
        if parts.len() >= 3 {
            let y: u64 = parts[0].parse().unwrap_or(0);
            let m: u64 = parts[1].parse().unwrap_or(0);
            let d: u64 = parts[2].parse().unwrap_or(0);
            y * 10000 + m * 100 + d
        } else {
            0
        }
    };
    sanitize(found) >= sanitize(MIN_YTDLP_VERSION)
}

/// Validates whether FFmpeg version meets the minimum requirement (e.g. 5.0)
pub fn is_ffmpeg_version_valid(found: &str) -> bool {
    if found == "Custom / Latest" {
        return true;
    }
    let parts: Vec<&str> = found.split('.').collect();
    if let Some(major_str) = parts.first() {
        if let Ok(major) = major_str.parse::<u32>() {
            return major >= 5;
        }
    }
    true
}

/// Queries binary by path to fetch its version
fn probe_binary_version(bin_path: &Path, arg: &str) -> Option<String> {
    let output = Command::new(bin_path).arg(arg).output().ok()?;
    if output.status.success() {
        Some(String::from_utf8_lossy(&output.stdout).trim().to_string())
    } else {
        None
    }
}

/// Inspects yt-dlp binary presence and version
pub fn check_ytdlp_status() -> DependencyStatus {
    let bin_name = get_ytdlp_bin_name();
    if let Some((path, source)) = locate_binary(bin_name) {
        let raw_ver = probe_binary_version(&path, "--version");
        let parsed_ver = raw_ver.as_deref().and_then(parse_ytdlp_version).or(raw_ver);
        let is_valid = parsed_ver
            .as_ref()
            .map(|v| is_ytdlp_version_valid(v))
            .unwrap_or(false);

        DependencyStatus {
            name: "yt-dlp".to_string(),
            is_installed: true,
            version: parsed_ver,
            path: Some(path.to_string_lossy().to_string()),
            is_valid,
            min_version_required: MIN_YTDLP_VERSION.to_string(),
            source: Some(source.to_string()),
        }
    } else {
        DependencyStatus {
            name: "yt-dlp".to_string(),
            is_installed: false,
            version: None,
            path: None,
            is_valid: false,
            min_version_required: MIN_YTDLP_VERSION.to_string(),
            source: None,
        }
    }
}

/// Inspects FFmpeg binary presence and version
pub fn check_ffmpeg_status() -> DependencyStatus {
    let bin_name = get_ffmpeg_bin_name();
    if let Some((path, source)) = locate_binary(bin_name) {
        let raw_ver = probe_binary_version(&path, "-version");
        let parsed_ver = raw_ver.as_deref().and_then(parse_ffmpeg_version).or(raw_ver);
        let is_valid = parsed_ver
            .as_ref()
            .map(|v| is_ffmpeg_version_valid(v))
            .unwrap_or(false);

        DependencyStatus {
            name: "FFmpeg".to_string(),
            is_installed: true,
            version: parsed_ver,
            path: Some(path.to_string_lossy().to_string()),
            is_valid,
            min_version_required: MIN_FFMPEG_VERSION.to_string(),
            source: Some(source.to_string()),
        }
    } else {
        DependencyStatus {
            name: "FFmpeg".to_string(),
            is_installed: false,
            version: None,
            path: None,
            is_valid: false,
            min_version_required: MIN_FFMPEG_VERSION.to_string(),
            source: None,
        }
    }
}

/// Inspects both yt-dlp and FFmpeg and generates a full diagnostic report
pub fn check_all_dependencies() -> SystemDependenciesReport {
    let ytdlp = check_ytdlp_status();
    let ffmpeg = check_ffmpeg_status();
    let all_valid = ytdlp.is_valid && ffmpeg.is_valid;

    SystemDependenciesReport {
        ytdlp,
        ffmpeg,
        all_valid,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_ytdlp_version_parsing() {
        let sample = "2026.02.14\n";
        assert_eq!(parse_ytdlp_version(sample), Some("2026.02.14".to_string()));
        assert!(is_ytdlp_version_valid("2026.02.14"));
        assert!(!is_ytdlp_version_valid("2023.05.01"));
    }

    #[test]
    fn test_ffmpeg_version_parsing() {
        let sample = "ffmpeg version 7.1-full_build Copyright (c) 2000-2024";
        assert_eq!(parse_ffmpeg_version(sample), Some("7.1".to_string()));
        assert!(is_ffmpeg_version_valid("7.1"));
        assert!(!is_ffmpeg_version_valid("4.4.2"));
    }
}
