use crate::config::paths::{
    get_bin_dir, get_deno_bin_name, get_ffmpeg_bin_name, get_ytdlp_bin_name,
};
use regex::Regex;
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

pub const MIN_YTDLP_VERSION: &str = "2024.01.01";
pub const MIN_FFMPEG_VERSION: &str = "5.0";
pub const MIN_DENO_VERSION: &str = "1.30.0";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DependencyStatus {
    pub name: String,
    pub is_installed: bool,
    pub version: Option<String>,
    pub path: Option<String>,
    pub is_valid: bool,
    pub min_version_required: String,
    pub source: Option<String>, // "Shared (curlyzed)" or None
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SystemDependenciesReport {
    pub ytdlp: DependencyStatus,
    pub ffmpeg: DependencyStatus,
    pub deno: DependencyStatus,
    pub all_valid: bool,
}

/// Locates a binary exclusively from the shared curlyzed bin directory (%LOCALAPPDATA%/curlyzed/bin/)
pub fn locate_binary(bin_name: &str) -> Option<(PathBuf, &'static str)> {
    let shared_bin = get_bin_dir().join(bin_name);
    if shared_bin.is_file() {
        Some((shared_bin, "Shared (curlyzed)"))
    } else {
        None
    }
}

/// Extracts yt-dlp version from `yt-dlp --version` output
pub fn parse_ytdlp_version(output: &str) -> Option<String> {
    let re = Regex::new(r"(\d{4}\.\d{2}\.\d{2}(\.\d+)?)").ok()?;
    re.captures(output).map(|cap| cap[1].to_string())
}

/// Extracts FFmpeg version from `ffmpeg -version` output
pub fn parse_ffmpeg_version(output: &str) -> Option<String> {
    // 1. Matches semantic releases like "ffmpeg version 7.1", "ffmpeg version n7.0.2"
    let re_semver = Regex::new(r"ffmpeg\s+version\s+([Nn]?\d+\.\d+(\.\d+)?)").ok()?;
    if let Some(cap) = re_semver.captures(output) {
        let ver = cap[1].trim_start_matches(|c| c == 'N' || c == 'n');
        return Some(ver.to_string());
    }

    // 2. Matches Gyan.dev nightly builds like "ffmpeg version N-126277-ga8c7afa7d7-20260826"
    let re_gyan = Regex::new(r"ffmpeg\s+version\s+N-\d+-[a-zA-Z0-9]+-(\d{4})(\d{2})(\d{2})").ok()?;
    if let Some(cap) = re_gyan.captures(output) {
        let year = &cap[1];
        let month = &cap[2];
        let day = &cap[3];
        return Some(format!("{}.{}.{} (Git)", year, month, day));
    }

    // 3. Matches date-based git builds like "ffmpeg version 2026-08-26-git-..."
    let re_date = Regex::new(r"ffmpeg\s+version\s+(\d{4})[-.](\d{2})[-.](\d{2})").ok()?;
    if let Some(cap) = re_date.captures(output) {
        return Some(format!("{}.{}.{} (Git)", &cap[1], &cap[2], &cap[3]));
    }

    // 4. Matches generic commit like "ffmpeg version N-126277"
    let re_n = Regex::new(r"ffmpeg\s+version\s+(N-\d+)").ok()?;
    if let Some(cap) = re_n.captures(output) {
        return Some(format!("{} (Git)", &cap[1]));
    }

    // Fallback if generic ffmpeg version banner exists
    if output.contains("ffmpeg version") {
        return Some("Git (Latest)".to_string());
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
    if found.contains("Git") || found == "Custom / Latest" {
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
    let output = crate::engine::process::new_command(bin_path).arg(arg).output().ok()?;
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

/// Extracts Deno version from `deno --version` output
pub fn parse_deno_version(output: &str) -> Option<String> {
    let re = Regex::new(r"deno\s+(\d+(\.\d+)+)").ok()?;
    if let Some(cap) = re.captures(output) {
        return Some(cap[1].to_string());
    }
    None
}

/// Inspects Deno binary presence and version
pub fn check_deno_status() -> DependencyStatus {
    let bin_name = get_deno_bin_name();
    if let Some((path, source)) = locate_binary(bin_name) {
        let raw_ver = probe_binary_version(&path, "--version");
        let parsed_ver = raw_ver.as_deref().and_then(parse_deno_version).or(raw_ver);
        let is_valid = parsed_ver.is_some();

        DependencyStatus {
            name: "Deno".to_string(),
            is_installed: true,
            version: parsed_ver,
            path: Some(path.to_string_lossy().to_string()),
            is_valid,
            min_version_required: MIN_DENO_VERSION.to_string(),
            source: Some(source.to_string()),
        }
    } else {
        DependencyStatus {
            name: "Deno".to_string(),
            is_installed: false,
            version: None,
            path: None,
            is_valid: false,
            min_version_required: MIN_DENO_VERSION.to_string(),
            source: None,
        }
    }
}

/// Inspects yt-dlp, FFmpeg, and Deno in parallel threads, generating a full diagnostic report
pub fn check_all_dependencies() -> SystemDependenciesReport {
    let (ytdlp, ffmpeg, deno) = std::thread::scope(|s| {
        let t_ytdlp = s.spawn(check_ytdlp_status);
        let t_ffmpeg = s.spawn(check_ffmpeg_status);
        let t_deno = s.spawn(check_deno_status);

        (
            t_ytdlp.join().unwrap_or_else(|_| check_ytdlp_status()),
            t_ffmpeg.join().unwrap_or_else(|_| check_ffmpeg_status()),
            t_deno.join().unwrap_or_else(|_| check_deno_status()),
        )
    });

    let all_valid = ytdlp.is_valid && ffmpeg.is_valid && deno.is_valid;

    SystemDependenciesReport {
        ytdlp,
        ffmpeg,
        deno,
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

        let gyan_sample = "ffmpeg version N-126277-ga8c7afa7d7-20260826 Copyright (c) 2000-2026 the FFmpeg developers";
        assert_eq!(parse_ffmpeg_version(gyan_sample), Some("2026.08.26 (Git)".to_string()));
        assert!(is_ffmpeg_version_valid("2026.08.26 (Git)"));
    }

    #[test]
    fn test_deno_version_parsing() {
        let sample = "deno 2.2.3 (release, x86_64-pc-windows-msvc)\nv8 13.4.114.9\ntypescript 5.7.2";
        assert_eq!(parse_deno_version(sample), Some("2.2.3".to_string()));
    }
}
