use crate::config::paths::append_app_log;
use crate::core::models::{PlaylistMetadata, VideoMetadata};
use crate::engine::ytdlp::{fetch_playlist_metadata, fetch_video_metadata};

/// IPC command to query video metadata (title, duration, channel, formats, thumbnail)
#[tauri::command]
pub async fn get_video_info(url: String) -> Result<VideoMetadata, String> {
    if url.trim().is_empty() {
        return Err("URL cannot be empty".to_string());
    }

    append_app_log("INFO", "Metadata", &format!("Fetching video metadata for: {}", url));
    match fetch_video_metadata(&url).await {
        Ok(info) => {
            append_app_log("INFO", "Metadata", &format!("Successfully parsed video: '{}' (ID: {})", info.title, info.id));
            Ok(info)
        }
        Err(e) => {
            append_app_log("ERROR", "Metadata", &format!("Failed to fetch video metadata: {}", e));
            Err(format!("{}", e))
        }
    }
}

/// IPC command to query playlist metadata (entries list, count, channel)
#[tauri::command]
pub async fn get_playlist_info(url: String) -> Result<PlaylistMetadata, String> {
    if url.trim().is_empty() {
        return Err("Playlist URL cannot be empty".to_string());
    }

    append_app_log("INFO", "Metadata", &format!("Fetching playlist metadata for: {}", url));
    match fetch_playlist_metadata(&url).await {
        Ok(info) => {
            append_app_log("INFO", "Metadata", &format!("Successfully parsed playlist: '{}' ({} items)", info.title, info.item_count));
            Ok(info)
        }
        Err(e) => {
            append_app_log("ERROR", "Metadata", &format!("Failed to fetch playlist metadata: {}", e));
            Err(format!("{}", e))
        }
    }
}

