use crate::core::error::AppError;
use crate::core::models::{
    DownloadProgress, FormatInfo, PlaylistItemSummary, PlaylistMetadata, VideoMetadata,
};
use crate::engine::args_builder::PROGRESS_PREFIX;
use regex::Regex;
use serde_json::Value;

/// Formats seconds into HH:MM:SS or MM:SS
pub fn format_duration(seconds_opt: Option<u64>) -> String {
    if let Some(sec) = seconds_opt {
        let hours = sec / 3600;
        let mins = (sec % 3600) / 60;
        let secs = sec % 60;
        if hours > 0 {
            format!("{:02}:{:02}:{:02}", hours, mins, secs)
        } else {
            format!("{:02}:{:02}", mins, secs)
        }
    } else {
        "--:--".to_string()
    }
}

/// Parses single video JSON metadata from `yt-dlp --dump-json`
pub fn parse_video_json(json_str: &str) -> Result<VideoMetadata, AppError> {
    let v: Value = serde_json::from_str(json_str)
        .map_err(|e| AppError::Parse(format!("Failed to parse video JSON: {}", e)))?;

    let id = v["id"].as_str().unwrap_or("").to_string();
    let title = v["title"].as_str().unwrap_or("Untitled Video").to_string();
    let channel = v["channel"]
        .as_str()
        .or_else(|| v["uploader"].as_str())
        .map(|s| s.to_string());
    let channel_id = v["channel_id"].as_str().map(|s| s.to_string());
    let duration_seconds = v["duration"].as_u64();
    let formatted_duration = format_duration(duration_seconds);
    let thumbnail_url = v["thumbnail"].as_str().map(|s| s.to_string());
    let view_count = v["view_count"].as_u64();
    let upload_date = v["upload_date"].as_str().map(|s| s.to_string());
    let description = v["description"].as_str().map(|s| s.to_string());
    let webpage_url = v["webpage_url"]
        .as_str()
        .unwrap_or(&format!("https://www.youtube.com/watch?v={}", id))
        .to_string();

    let mut formats = Vec::new();
    if let Some(formats_array) = v["formats"].as_array() {
        for fmt in formats_array {
            let format_id = fmt["format_id"].as_str().unwrap_or("").to_string();
            let ext = fmt["ext"].as_str().unwrap_or("mp4").to_string();
            let resolution = fmt["resolution"]
                .as_str()
                .map(|s| s.to_string())
                .or_else(|| {
                    let w = fmt["width"].as_u64();
                    let h = fmt["height"].as_u64();
                    if let (Some(w), Some(h)) = (w, h) {
                        Some(format!("{}x{}", w, h))
                    } else {
                        None
                    }
                });

            let note = fmt["format_note"].as_str().map(|s| s.to_string());
            let filesize = fmt["filesize"].as_u64().or_else(|| fmt["filesize_approx"].as_u64());
            let vcodec = fmt["vcodec"].as_str().map(|s| s.to_string());
            let acodec = fmt["acodec"].as_str().map(|s| s.to_string());
            let fps = fmt["fps"].as_f64();

            let is_audio_only = vcodec.as_deref() == Some("none") && acodec.as_deref() != Some("none");
            let is_video_only = acodec.as_deref() == Some("none") && vcodec.as_deref() != Some("none");

            formats.push(FormatInfo {
                format_id,
                ext,
                resolution,
                note,
                filesize,
                vcodec,
                acodec,
                fps,
                is_audio_only,
                is_video_only,
            });
        }
    }

    Ok(VideoMetadata {
        id,
        title,
        channel,
        channel_id,
        duration_seconds,
        formatted_duration,
        thumbnail_url,
        view_count,
        upload_date,
        description,
        webpage_url,
        formats,
    })
}

/// Parses flat playlist JSON from `yt-dlp --flat-playlist --dump-single-json`
pub fn parse_playlist_json(json_str: &str) -> Result<PlaylistMetadata, AppError> {
    let v: Value = serde_json::from_str(json_str)
        .map_err(|e| AppError::Parse(format!("Failed to parse playlist JSON: {}", e)))?;

    let id = v["id"].as_str().unwrap_or("").to_string();
    let title = v["title"]
        .as_str()
        .unwrap_or("Untitled Playlist")
        .to_string();
    let channel = v["channel"]
        .as_str()
        .or_else(|| v["uploader"].as_str())
        .map(|s| s.to_string());
    let webpage_url = v["webpage_url"]
        .as_str()
        .unwrap_or(&format!("https://www.youtube.com/playlist?list={}", id))
        .to_string();

    let mut entries = Vec::new();
    if let Some(entries_array) = v["entries"].as_array() {
        for (idx, item) in entries_array.iter().enumerate() {
            let item_id = item["id"].as_str().unwrap_or("").to_string();
            let item_title = item["title"]
                .as_str()
                .unwrap_or("Untitled Entry")
                .to_string();
            let duration_seconds = item["duration"].as_u64();
            let formatted_duration = format_duration(duration_seconds);
            let thumbnail_url = item["thumbnails"]
                .as_array()
                .and_then(|arr| arr.last())
                .and_then(|t| t["url"].as_str())
                .map(|s| s.to_string());
            let url = item["url"]
                .as_str()
                .map(|s| s.to_string())
                .unwrap_or_else(|| format!("https://www.youtube.com/watch?v={}", item_id));

            entries.push(PlaylistItemSummary {
                id: item_id,
                title: item_title,
                duration_seconds,
                formatted_duration,
                thumbnail_url,
                url,
                index: idx + 1,
            });
        }
    }

    let item_count = entries.len();

    Ok(PlaylistMetadata {
        id,
        title,
        channel,
        item_count,
        entries,
        webpage_url,
    })
}

/// Parses a line of stdout from yt-dlp to extract download progress metrics
fn strip_ansi(s: &str) -> String {
    let mut out = String::new();
    let mut in_escape = false;
    for c in s.chars() {
        if c == '\x1b' {
            in_escape = true;
        } else if in_escape {
            if c.is_alphabetic() {
                in_escape = false;
            }
        } else {
            out.push(c);
        }
    }
    out
}

pub fn parse_progress_line(line: &str) -> Option<DownloadProgress> {
    let clean = strip_ansi(line);
    let trimmed = clean.trim();

    // 1. Structured custom progress template:
    // download:[METHIK_PROG]  45.2%| 12.45MiB/s|00:04|38000000|84000000
    if let Some(idx) = trimmed.find(PROGRESS_PREFIX) {
        let payload = &trimmed[idx + PROGRESS_PREFIX.len()..];
        let parts: Vec<&str> = payload.split('|').collect();
        if parts.len() >= 3 {
            let pct_digits: String = parts[0].chars().filter(|c| c.is_digit(10) || *c == '.').collect();
            let percent = pct_digits.parse::<f64>().unwrap_or(0.0);
            let speed = match parts[1].trim() {
                "NA" | "N/A" | "" => None,
                s => Some(s.to_string()),
            };
            let eta = match parts[2].trim() {
                "NA" | "N/A" | "" => None,
                s => Some(s.to_string()),
            };

            let downloaded_bytes = if parts.len() >= 4 {
                parts[3].trim().parse::<u64>().unwrap_or(0)
            } else {
                0
            };
            let total_bytes = if parts.len() >= 5 {
                parts[4].trim().parse::<u64>().ok()
            } else {
                None
            };

            return Some(DownloadProgress {
                percent,
                speed,
                eta,
                downloaded_bytes,
                total_bytes,
                status: "downloading".to_string(),
                item_id: None,
                batch_info: None,
                error_message: None,
            });
        }
    }

    // 2. Standard yt-dlp [download] progress line fallback:
    // [download]  45.2% of ~  84.00MiB at  12.45MiB/s ETA 00:04
    if trimmed.contains("[download]") && trimmed.contains('%') {
        let re_pct = Regex::new(r"([\d\.]+)%").ok()?;
        if let Some(cap) = re_pct.captures(trimmed) {
            let pct = cap[1].parse::<f64>().unwrap_or(0.0);
            let speed_re = Regex::new(r"at\s+([^\s]+)").ok();
            let speed = speed_re.and_then(|r| r.captures(trimmed)).map(|c| c[1].to_string());
            let eta_re = Regex::new(r"ETA\s+([^\s]+)").ok();
            let eta = eta_re.and_then(|r| r.captures(trimmed)).map(|c| c[1].to_string());

            return Some(DownloadProgress {
                percent: pct,
                speed,
                eta,
                downloaded_bytes: 0,
                total_bytes: None,
                status: "downloading".to_string(),
                item_id: None,
                batch_info: None,
                error_message: None,
            });
        }
    }

    // 3. Post-processing / Merging status
    if trimmed.contains("[Merger]") || trimmed.contains("Merging formats") {
        return Some(DownloadProgress {
            percent: 99.0,
            speed: None,
            eta: None,
            downloaded_bytes: 0,
            total_bytes: None,
            status: "merging".to_string(),
            item_id: None,
            batch_info: None,
            error_message: None,
        });
    }

    if trimmed.contains("[ExtractAudio]") {
        return Some(DownloadProgress {
            percent: 99.0,
            speed: None,
            eta: None,
            downloaded_bytes: 0,
            total_bytes: None,
            status: "extracting_audio".to_string(),
            item_id: None,
            batch_info: None,
            error_message: None,
        });
    }

    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_format_duration() {
        assert_eq!(format_duration(Some(212)), "03:32");
        assert_eq!(format_duration(Some(3665)), "01:01:05");
        assert_eq!(format_duration(None), "--:--");
    }

    #[test]
    fn test_parse_custom_progress_line() {
        let line = "download:[METHIK_PROG] 68.4%|14.20MiB/s|00:06|57400000|84000000";
        let prog = parse_progress_line(line).expect("Should parse progress");
        assert_eq!(prog.percent, 68.4);
        assert_eq!(prog.speed, Some("14.20MiB/s".to_string()));
        assert_eq!(prog.eta, Some("00:06".to_string()));
        assert_eq!(prog.downloaded_bytes, 57400000);
        assert_eq!(prog.total_bytes, Some(84000000));
        assert_eq!(prog.status, "downloading");
    }

    #[test]
    fn test_parse_video_json() {
        let json_data = r#"{
            "id": "dQw4w9WgXcQ",
            "title": "Rick Astley - Never Gonna Give You Up",
            "uploader": "Rick Astley",
            "duration": 212,
            "thumbnail": "https://example.com/thumb.jpg",
            "view_count": 1500000000,
            "formats": [
                {
                    "format_id": "137",
                    "ext": "mp4",
                    "resolution": "1920x1080",
                    "vcodec": "avc1.640028",
                    "acodec": "none",
                    "filesize": 84000000
                },
                {
                    "format_id": "140",
                    "ext": "m4a",
                    "vcodec": "none",
                    "acodec": "mp4a.40.2",
                    "filesize": 4200000
                }
            ]
        }"#;

        let meta = parse_video_json(json_data).expect("Should parse video json");
        assert_eq!(meta.id, "dQw4w9WgXcQ");
        assert_eq!(meta.formatted_duration, "03:32");
        assert_eq!(meta.formats.len(), 2);
        assert!(meta.formats[0].is_video_only);
        assert!(meta.formats[1].is_audio_only);
    }
}
