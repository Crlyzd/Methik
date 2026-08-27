use crate::core::models::{PlaylistMetadata, VideoMetadata};
use crate::engine::ytdlp::{fetch_playlist_metadata, fetch_video_metadata};

/// IPC command to query video metadata (title, duration, channel, formats, thumbnail)
#[tauri::command]
pub async fn get_video_info(url: String) -> Result<VideoMetadata, String> {
    if url.trim().is_empty() {
        return Err("URL cannot be empty".to_string());
    }

    fetch_video_metadata(&url)
        .await
        .map_err(|e| format!("{}", e))
}

/// IPC command to query playlist metadata (entries list, count, channel)
#[tauri::command]
pub async fn get_playlist_info(url: String) -> Result<PlaylistMetadata, String> {
    if url.trim().is_empty() {
        return Err("Playlist URL cannot be empty".to_string());
    }

    fetch_playlist_metadata(&url)
        .await
        .map_err(|e| format!("{}", e))
}
