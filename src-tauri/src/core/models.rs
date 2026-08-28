use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FormatInfo {
    pub format_id: String,
    pub ext: String,
    pub resolution: Option<String>,
    pub note: Option<String>,
    pub filesize: Option<u64>,
    pub vcodec: Option<String>,
    pub acodec: Option<String>,
    pub fps: Option<f64>,
    pub is_audio_only: bool,
    pub is_video_only: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VideoMetadata {
    pub id: String,
    pub title: String,
    pub channel: Option<String>,
    pub channel_id: Option<String>,
    pub duration_seconds: Option<u64>,
    pub formatted_duration: String,
    pub thumbnail_url: Option<String>,
    pub view_count: Option<u64>,
    pub upload_date: Option<String>,
    pub description: Option<String>,
    pub webpage_url: String,
    pub formats: Vec<FormatInfo>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlaylistItemSummary {
    pub id: String,
    pub title: String,
    pub duration_seconds: Option<u64>,
    pub formatted_duration: String,
    pub thumbnail_url: Option<String>,
    pub url: String,
    pub index: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlaylistMetadata {
    pub id: String,
    pub title: String,
    pub channel: Option<String>,
    pub item_count: usize,
    pub entries: Vec<PlaylistItemSummary>,
    pub webpage_url: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BatchProgressInfo {
    pub current_index: usize,
    pub total_items: usize,
    pub overall_percent: f64,
    pub current_title: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DownloadProgress {
    pub percent: f64,
    pub speed: Option<String>,
    pub eta: Option<String>,
    pub downloaded_bytes: u64,
    pub total_bytes: Option<u64>,
    pub status: String, // "downloading", "merging", "extracting_audio", "finished", "error"
    pub item_id: Option<String>,
    pub batch_info: Option<BatchProgressInfo>,
    #[serde(default)]
    pub error_message: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum VideoQuality {
    Best,
    UHD4K,   // 2160p
    QHD2K,   // 1440p
    FHD1080, // 1080p
    HD720,   // 720p
    SD480,   // 480p
    CustomFormat(String),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum AudioFormat {
    Mp3,
    M4a,
    Flac,
    Wav,
    Opus,
    Aac,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub enum CookieSource {
    None,
    Chrome,
    Firefox,
    Edge,
    Brave,
    Opera,
    Vivaldi,
    CustomFile(String),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DownloadOptions {
    pub item_id: Option<String>,
    pub url: String,
    pub output_dir: Option<String>,
    pub quality: VideoQuality,
    pub audio_only: bool,
    pub audio_format: Option<AudioFormat>,
    pub audio_bitrate: Option<String>, // e.g. "320k"
    pub embed_thumbnail: bool,
    pub embed_metadata: bool,
    pub playlist_indices: Option<Vec<usize>>, // For selective batch downloading
    pub cookie_source: Option<CookieSource>,
}

impl Default for DownloadOptions {
    fn default() -> Self {
        Self {
            item_id: None,
            url: String::new(),
            output_dir: None,
            quality: VideoQuality::FHD1080,
            audio_only: false,
            audio_format: Some(AudioFormat::Mp3),
            audio_bitrate: Some("320k".to_string()),
            embed_thumbnail: true,
            embed_metadata: true,
            playlist_indices: None,
            cookie_source: None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UserSettings {
    pub download_dir: String,
    pub default_quality: VideoQuality,
    pub audio_format: AudioFormat,
    pub dark_mode: bool,
    pub cookie_source: Option<CookieSource>,
}

impl Default for UserSettings {
    fn default() -> Self {
        Self {
            download_dir: String::new(),
            default_quality: VideoQuality::FHD1080,
            audio_format: AudioFormat::Mp3,
            dark_mode: true,
            cookie_source: None,
        }
    }
}

