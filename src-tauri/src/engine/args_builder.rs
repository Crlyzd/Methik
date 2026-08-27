use crate::config::paths::get_bin_dir;
use crate::core::models::{AudioFormat, CookieSource, DownloadOptions, VideoQuality};
use std::path::PathBuf;

pub const PROGRESS_PREFIX: &str = "[METHIK_PROG]";

/// Appends cookies arguments based on configured CookieSource
pub fn append_cookie_args(args: &mut Vec<String>, cookie_source: Option<&CookieSource>) {
    if let Some(source) = cookie_source {
        match source {
            CookieSource::Chrome => {
                args.push("--cookies-from-browser".to_string());
                args.push("chrome".to_string());
            }
            CookieSource::Firefox => {
                args.push("--cookies-from-browser".to_string());
                args.push("firefox".to_string());
            }
            CookieSource::Edge => {
                args.push("--cookies-from-browser".to_string());
                args.push("edge".to_string());
            }
            CookieSource::Brave => {
                args.push("--cookies-from-browser".to_string());
                args.push("brave".to_string());
            }
            CookieSource::Opera => {
                args.push("--cookies-from-browser".to_string());
                args.push("opera".to_string());
            }
            CookieSource::Vivaldi => {
                args.push("--cookies-from-browser".to_string());
                args.push("vivaldi".to_string());
            }
            CookieSource::CustomFile(path) if !path.trim().is_empty() => {
                args.push("--cookies".to_string());
                args.push(path.clone());
            }
            _ => {}
        }
    }
}

/// Builds CLI arguments for fetching single video metadata as JSON
pub fn build_video_metadata_args(url: &str, cookie_source: Option<&CookieSource>) -> Vec<String> {
    let mut args = vec![
        "--dump-json".to_string(),
        "--no-warnings".to_string(),
        "--no-playlist".to_string(),
        "--skip-download".to_string(),
        "--ignore-no-formats-error".to_string(),
    ];
    append_cookie_args(&mut args, cookie_source);
    args.push(url.to_string());
    args
}

/// Builds CLI arguments for flat playlist extraction
pub fn build_playlist_metadata_args(url: &str, cookie_source: Option<&CookieSource>) -> Vec<String> {
    let mut args = vec![
        "--flat-playlist".to_string(),
        "--dump-single-json".to_string(),
        "--no-warnings".to_string(),
        "--skip-download".to_string(),
        "--ignore-no-formats-error".to_string(),
    ];
    append_cookie_args(&mut args, cookie_source);
    args.push(url.to_string());
    args
}

/// Builds CLI arguments for video or audio download execution
pub fn build_download_args(options: &DownloadOptions) -> Vec<String> {
    let mut args = Vec::new();

    // 1. Point yt-dlp to isolated AppData FFmpeg binary directory
    let bin_dir = get_bin_dir();
    args.push("--ffmpeg-location".to_string());
    args.push(bin_dir.to_string_lossy().to_string());

    // 2. Output template
    let base_dir = match &options.output_dir {
        Some(dir) if !dir.trim().is_empty() && dir.trim() != "Desktop" => PathBuf::from(dir),
        _ => crate::config::paths::get_default_download_dir(),
    };

    let output_template = base_dir
        .join("%(title)s [%(id)s].%(ext)s")
        .to_string_lossy()
        .to_string();

    args.push("-o".to_string());
    args.push(output_template);

    // 3. Audio extraction vs Video format selection
    if options.audio_only {
        args.push("-x".to_string());
        let fmt = match options.audio_format.as_ref().unwrap_or(&AudioFormat::Mp3) {
            AudioFormat::Mp3 => "mp3",
            AudioFormat::M4a => "m4a",
            AudioFormat::Flac => "flac",
            AudioFormat::Wav => "wav",
            AudioFormat::Opus => "opus",
            AudioFormat::Aac => "aac",
        };
        args.push("--audio-format".to_string());
        args.push(fmt.to_string());

        let quality = options
            .audio_bitrate
            .as_deref()
            .unwrap_or("320k");
        args.push("--audio-quality".to_string());
        args.push(quality.to_string());
    } else {
        // Video format selection
        let format_selector = match &options.quality {
            VideoQuality::Best => "bv*+ba/b".to_string(),
            VideoQuality::UHD4K => "bv*[height<=2160]+ba/b[height<=2160]/best".to_string(),
            VideoQuality::QHD2K => "bv*[height<=1440]+ba/b[height<=1440]/best".to_string(),
            VideoQuality::FHD1080 => "bv*[height<=1080]+ba/b[height<=1080]/best".to_string(),
            VideoQuality::HD720 => "bv*[height<=720]+ba/b[height<=720]/best".to_string(),
            VideoQuality::SD480 => "bv*[height<=480]+ba/b[height<=480]/best".to_string(),
            VideoQuality::CustomFormat(fmt) => fmt.clone(),
        };
        args.push("-f".to_string());
        args.push(format_selector);

        args.push("--merge-output-format".to_string());
        args.push("mp4".to_string());
    }

    // 4. Metadata & Thumbnails
    if options.embed_metadata {
        args.push("--embed-metadata".to_string());
    }
    if options.embed_thumbnail {
        args.push("--embed-thumbnail".to_string());
    }

    // 5. Playlist item filter if specified
    if let Some(indices) = &options.playlist_indices {
        if !indices.is_empty() {
            let items_str = indices
                .iter()
                .map(|i| i.to_string())
                .collect::<Vec<String>>()
                .join(",");
            args.push("--playlist-items".to_string());
            args.push(items_str);
        }
    }

    // 6. Cookies Authentication
    append_cookie_args(&mut args, options.cookie_source.as_ref());

    // 7. Real-time progress output flags
    args.push("--no-colors".to_string());
    args.push("--progress".to_string());
    args.push("--newline".to_string());
    args.push("--progress-template".to_string());
    args.push(format!(
        "download:{TAG}%(progress._percent_str)s|%(progress._speed_str)s|%(progress._eta_str)s|%(progress.downloaded_bytes)s|%(progress.total_bytes_estimate)s",
        TAG = PROGRESS_PREFIX
    ));

    // 8. General flags
    args.push("--no-warnings".to_string());
    args.push(options.url.clone());

    args
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_video_metadata_args() {
        let args = build_video_metadata_args("https://youtube.com/watch?v=123", None);
        assert!(args.contains(&"--dump-json".to_string()));
        assert!(args.contains(&"--no-playlist".to_string()));
        assert_eq!(args.last().unwrap(), "https://youtube.com/watch?v=123");
    }

    #[test]
    fn test_video_metadata_args_with_cookies() {
        let args = build_video_metadata_args("https://youtube.com/watch?v=123", Some(&CookieSource::Chrome));
        assert!(args.contains(&"--cookies-from-browser".to_string()));
        assert!(args.contains(&"chrome".to_string()));
    }

    #[test]
    fn test_audio_download_args() {
        let opts = DownloadOptions {
            url: "https://youtube.com/watch?v=123".to_string(),
            audio_only: true,
            audio_format: Some(AudioFormat::Flac),
            cookie_source: Some(CookieSource::Edge),
            ..Default::default()
        };
        let args = build_download_args(&opts);
        assert!(args.contains(&"-x".to_string()));
        assert!(args.contains(&"flac".to_string()));
        assert!(args.contains(&"--ffmpeg-location".to_string()));
        assert!(args.contains(&"--cookies-from-browser".to_string()));
        assert!(args.contains(&"edge".to_string()));
    }
}

