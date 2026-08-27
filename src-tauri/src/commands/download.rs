use crate::core::models::{
    BatchProgressInfo, DownloadOptions, DownloadProgress,
};
use crate::engine::ytdlp::{execute_download, fetch_playlist_metadata};
use std::sync::Arc;
use tauri::{AppHandle, Emitter};

/// IPC command to execute a single video/audio download, emitting real-time progress events
#[tauri::command]
pub async fn download_video(
    mut options: DownloadOptions,
    app_handle: AppHandle,
) -> Result<(), String> {
    if options.url.trim().is_empty() {
        return Err("URL cannot be empty".to_string());
    }

    if options.cookie_source.is_none() {
        let settings = crate::config::paths::load_user_settings();
        options.cookie_source = settings.cookie_source;
    }

    let handle_for_progress = app_handle.clone();
    let callback = Arc::new(move |progress: DownloadProgress| {
        let _ = handle_for_progress.emit("download-progress", progress);
    });

    execute_download(&options, callback)
        .await
        .map_err(|e| format!("{}", e))
}

/// IPC command to execute batch playlist downloads with dual item & overall progress tracking
#[tauri::command]
pub async fn download_playlist(
    mut options: DownloadOptions,
    app_handle: AppHandle,
) -> Result<(), String> {
    if options.url.trim().is_empty() {
        return Err("Playlist URL cannot be empty".to_string());
    }

    if options.cookie_source.is_none() {
        let settings = crate::config::paths::load_user_settings();
        options.cookie_source = settings.cookie_source;
    }

    // 1. Fetch flat playlist metadata
    let playlist = fetch_playlist_metadata(&options.url)
        .await
        .map_err(|e| format!("Failed to fetch playlist: {}", e))?;

    let entries_to_download: Vec<_> = if let Some(indices) = &options.playlist_indices {
        playlist
            .entries
            .into_iter()
            .filter(|e| indices.contains(&e.index))
            .collect()
    } else {
        playlist.entries
    };

    let total_items = entries_to_download.len();
    if total_items == 0 {
        return Err("No playlist items selected for download".to_string());
    }

    // 2. Iterate sequentially through selected items
    for (i, entry) in entries_to_download.iter().enumerate() {
        let current_index = i + 1;
        let item_title = entry.title.clone();
        let handle_for_progress = app_handle.clone();

        let mut item_options = options.clone();
        item_options.url = entry.url.clone();
        item_options.playlist_indices = None; // Single entry download

        let title_for_callback = item_title.clone();
        let callback = Arc::new(move |mut progress: DownloadProgress| {
            let item_pct = progress.percent;
            let overall = ((i as f64) + (item_pct / 100.0)) / (total_items as f64) * 100.0;

            progress.batch_info = Some(BatchProgressInfo {
                current_index,
                total_items,
                overall_percent: (overall * 10.0).round() / 10.0,
                current_title: title_for_callback.clone(),
            });

            let _ = handle_for_progress.emit("download-progress", progress);
        });

        execute_download(&item_options, callback)
            .await
            .map_err(|e| format!("Failed downloading item {}: {}", current_index, e))?;
    }

    // Final batch completed event
    let _ = app_handle.emit(
        "download-progress",
        DownloadProgress {
            percent: 100.0,
            speed: None,
            eta: None,
            downloaded_bytes: 0,
            total_bytes: None,
            status: "finished".to_string(),
            item_id: None,
            batch_info: Some(BatchProgressInfo {
                current_index: total_items,
                total_items,
                overall_percent: 100.0,
                current_title: "All Items Finished".to_string(),
            }),
        },
    );

    Ok(())
}

use tauri::ipc::Channel;

/// IPC command to execute a list of queue items sequentially, emitting per-item and overall progress
#[tauri::command]
pub async fn download_queue(
    mut items: Vec<DownloadOptions>,
    on_progress: Channel<DownloadProgress>,
    app_handle: AppHandle,
) -> Result<(), String> {
    if items.is_empty() {
        return Err("Queue is empty".to_string());
    }

    let default_cookie = crate::config::paths::load_user_settings().cookie_source;
    for opt in items.iter_mut() {
        if opt.cookie_source.is_none() {
            opt.cookie_source = default_cookie.clone();
        }
    }

    let total_items = items.len();

    for (i, item_opt) in items.iter().enumerate() {
        let current_index = i + 1;
        let handle_for_progress = app_handle.clone();
        let channel_for_progress = on_progress.clone();
        let current_item_id = item_opt.item_id.clone();

        let callback = Arc::new(move |mut progress: DownloadProgress| {
            let item_pct = progress.percent;
            let overall = ((i as f64) + (item_pct / 100.0)) / (total_items as f64) * 100.0;

            progress.item_id = current_item_id.clone();
            progress.batch_info = Some(BatchProgressInfo {
                current_index,
                total_items,
                overall_percent: (overall * 10.0).round() / 10.0,
                current_title: format!("Item {}/{}", current_index, total_items),
            });

            // Direct IPC channel delivery
            let _ = channel_for_progress.send(progress.clone());

            // Also emit globally
            let _ = handle_for_progress.emit("download-progress", progress);
        });

        execute_download(item_opt, callback)
            .await
            .map_err(|e| format!("Failed downloading item {}: {}", current_index, e))?;
    }

    // Final completion event
    let finish_prog = DownloadProgress {
        percent: 100.0,
        speed: None,
        eta: None,
        downloaded_bytes: 0,
        total_bytes: None,
        status: "finished".to_string(),
        item_id: None,
        batch_info: Some(BatchProgressInfo {
            current_index: total_items,
            total_items,
            overall_percent: 100.0,
            current_title: "Queue Finished".to_string(),
        }),
    };

    let _ = on_progress.send(finish_prog.clone());
    let _ = app_handle.emit("download-progress", finish_prog);

    Ok(())
}
