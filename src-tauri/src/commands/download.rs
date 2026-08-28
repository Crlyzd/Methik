use crate::config::paths::append_app_log;
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

    append_app_log("INFO", "Download", &format!("Starting download for URL: {}", options.url));

    if options.cookie_source.is_none() {
        let settings = crate::config::paths::load_user_settings();
        options.cookie_source = settings.cookie_source;
    }

    let handle_for_progress = app_handle.clone();
    let callback = Arc::new(move |progress: DownloadProgress| {
        let _ = handle_for_progress.emit("download-progress", progress);
    });

    match execute_download(&options, callback).await {
        Ok(()) => {
            append_app_log("INFO", "Download", &format!("Successfully completed download for: {}", options.url));
            Ok(())
        }
        Err(e) => {
            let err_msg = format!("{}", e);
            append_app_log("ERROR", "Download", &format!("Download failed for {}: {}", options.url, err_msg));
            let _ = app_handle.emit("download-progress", DownloadProgress {
                percent: 0.0,
                speed: None,
                eta: None,
                downloaded_bytes: 0,
                total_bytes: None,
                status: "error".to_string(),
                item_id: options.item_id.clone(),
                batch_info: None,
                error_message: Some(err_msg.clone()),
            });
            Err(err_msg)
        }
    }
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

    append_app_log("INFO", "Download", &format!("Starting playlist download for: {} ({} selected items)", options.url, total_items));

    // 2. Iterate sequentially through selected items
    for (i, entry) in entries_to_download.iter().enumerate() {
        let current_index = i + 1;
        let item_title = entry.title.clone();
        let handle_for_progress = app_handle.clone();

        let mut item_options = options.clone();
        item_options.url = entry.url.clone();
        item_options.playlist_indices = None; // Single entry download

        append_app_log("INFO", "Download", &format!("Downloading playlist item {}/{}: '{}'", current_index, total_items, item_title));

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

        if let Err(e) = execute_download(&item_options, callback).await {
            append_app_log("ERROR", "Download", &format!("Failed playlist item {}/{}: {}", current_index, total_items, e));
            return Err(format!("Failed downloading item {}: {}", current_index, e));
        }
    }

    append_app_log("INFO", "Download", &format!("Successfully completed playlist download: {}", options.url));

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
            error_message: None,
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
    crate::engine::ytdlp::set_download_cancelled(false);
    append_app_log("INFO", "Download", &format!("Starting queue download for {} items", total_items));

    for (i, item_opt) in items.iter().enumerate() {
        if crate::engine::ytdlp::is_download_cancelled() {
            append_app_log("INFO", "Download", "Queue download was cancelled by user. Halting batch loop.");
            break;
        }

        let current_index = i + 1;
        let handle_for_progress = app_handle.clone();
        let channel_for_progress = on_progress.clone();
        let current_item_id = item_opt.item_id.clone();

        append_app_log("INFO", "Download", &format!("Processing queue item {}/{}: URL: {}", current_index, total_items, item_opt.url));

        // Emit initial start event for this specific item
        let start_prog = DownloadProgress {
            percent: 0.0,
            speed: None,
            eta: None,
            downloaded_bytes: 0,
            total_bytes: None,
            status: "downloading".to_string(),
            item_id: current_item_id.clone(),
            batch_info: Some(BatchProgressInfo {
                current_index,
                total_items,
                overall_percent: ((i as f64) / (total_items as f64) * 100.0 * 10.0).round() / 10.0,
                current_title: format!("Item {}/{}", current_index, total_items),
            }),
            error_message: None,
        };
        let _ = channel_for_progress.send(start_prog.clone());
        let _ = handle_for_progress.emit("download-progress", start_prog);

        let current_item_id_cb = current_item_id.clone();
        let channel_for_callback = channel_for_progress.clone();
        let handle_for_callback = handle_for_progress.clone();

        let callback = Arc::new(move |mut progress: DownloadProgress| {
            let item_pct = progress.percent;
            let overall = ((i as f64) + (item_pct / 100.0)) / (total_items as f64) * 100.0;

            progress.item_id = current_item_id_cb.clone();
            progress.batch_info = Some(BatchProgressInfo {
                current_index,
                total_items,
                overall_percent: (overall * 10.0).round() / 10.0,
                current_title: format!("Item {}/{}", current_index, total_items),
            });

            // Direct IPC channel delivery
            let _ = channel_for_callback.send(progress.clone());

            // Also emit globally
            let _ = handle_for_callback.emit("download-progress", progress);
        });

        if let Err(e) = execute_download(item_opt, callback).await {
            if crate::engine::ytdlp::is_download_cancelled() {
                append_app_log("INFO", "Download", &format!("Queue item {}/{} stopped due to cancellation.", current_index, total_items));
                break;
            }

            let err_msg = format!("{}", e);
            append_app_log("ERROR", "Download", &format!("Queue item {}/{} failed: {}", current_index, total_items, err_msg));

            let err_prog = DownloadProgress {
                percent: 0.0,
                speed: None,
                eta: None,
                downloaded_bytes: 0,
                total_bytes: None,
                status: "error".to_string(),
                item_id: current_item_id.clone(),
                batch_info: Some(BatchProgressInfo {
                    current_index,
                    total_items,
                    overall_percent: (((i + 1) as f64) / (total_items as f64) * 100.0 * 10.0).round() / 10.0,
                    current_title: format!("Item {}/{} Failed", current_index, total_items),
                }),
                error_message: Some(err_msg),
            };
            let _ = channel_for_progress.send(err_prog.clone());
            let _ = handle_for_progress.emit("download-progress", err_prog);
            // Non-blocking: continue processing subsequent items in the queue
        }
    }

    append_app_log("INFO", "Download", &format!("Finished queue execution of {} items (cancelled: {})", total_items, crate::engine::ytdlp::is_download_cancelled()));

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
        error_message: None,
    };

    let _ = on_progress.send(finish_prog.clone());
    let _ = app_handle.emit("download-progress", finish_prog);

    Ok(())
}

/// IPC command to abort active download processes and stop queue progression
#[tauri::command]
pub async fn cancel_download(app_handle: AppHandle) -> Result<(), String> {
    append_app_log("INFO", "Download", "User requested cancel_download");
    crate::engine::ytdlp::cancel_active_download();

    let _ = app_handle.emit(
        "download-progress",
        DownloadProgress {
            percent: 0.0,
            speed: None,
            eta: None,
            downloaded_bytes: 0,
            total_bytes: None,
            status: "finished".to_string(),
            item_id: None,
            batch_info: None,
            error_message: Some("Download cancelled by user".to_string()),
        },
    );

    Ok(())
}
