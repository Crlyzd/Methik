use crate::config::paths::get_ytdlp_bin_name;
use crate::core::error::AppError;
use crate::core::models::{DownloadOptions, DownloadProgress, PlaylistMetadata, VideoMetadata};
use crate::engine::args_builder::{
    build_download_args, build_playlist_metadata_args, build_video_metadata_args,
};
use crate::engine::dependency::locate_binary;
use crate::engine::parser::{parse_playlist_json, parse_progress_line, parse_video_json};
use std::process::Stdio;
use std::sync::Arc;
use tokio::process::Command;

/// Locates the yt-dlp executable path or returns an AppError
pub fn get_ytdlp_executable() -> Result<std::path::PathBuf, AppError> {
    let bin_name = get_ytdlp_bin_name();
    if let Some((path, _)) = locate_binary(bin_name) {
        Ok(path)
    } else {
        Err(AppError::BinaryNotFound(
            "yt-dlp executable not found in AppData or PATH. Please provision dependencies first."
                .to_string(),
        ))
    }
}

/// Queries metadata for a single video without downloading
pub async fn fetch_video_metadata(url: &str) -> Result<VideoMetadata, AppError> {
    let ytdlp_path = get_ytdlp_executable()?;
    let settings = crate::config::paths::load_user_settings();
    let args = build_video_metadata_args(url, settings.cookie_source.as_ref());

    let output = Command::new(&ytdlp_path)
        .args(&args)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .await
        .map_err(|e| AppError::Process(format!("Failed to execute yt-dlp: {}", e)))?;

    if !output.status.success() {
        let err_msg = String::from_utf8_lossy(&output.stderr);
        return Err(AppError::Process(format!(
            "yt-dlp error fetching metadata: {}",
            err_msg.trim()
        )));
    }

    let stdout_str = String::from_utf8_lossy(&output.stdout);
    parse_video_json(&stdout_str)
}

/// Queries metadata for a playlist using flat extraction
pub async fn fetch_playlist_metadata(url: &str) -> Result<PlaylistMetadata, AppError> {
    let ytdlp_path = get_ytdlp_executable()?;
    let settings = crate::config::paths::load_user_settings();
    let args = build_playlist_metadata_args(url, settings.cookie_source.as_ref());

    let output = Command::new(&ytdlp_path)
        .args(&args)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .await
        .map_err(|e| AppError::Process(format!("Failed to execute yt-dlp: {}", e)))?;

    if !output.status.success() {
        let err_msg = String::from_utf8_lossy(&output.stderr);
        return Err(AppError::Process(format!(
            "yt-dlp error fetching playlist: {}",
            err_msg.trim()
        )));
    }

    let stdout_str = String::from_utf8_lossy(&output.stdout);
    parse_playlist_json(&stdout_str)
}

/// Executes a video or audio download, streaming parsed progress events through the callback
pub async fn execute_download<F>(
    options: &DownloadOptions,
    progress_callback: Arc<F>,
) -> Result<(), AppError>
where
    F: Fn(DownloadProgress) + Send + Sync + 'static,
{
    let ytdlp_path = get_ytdlp_executable()?;
    let args = build_download_args(options);

    let mut child = Command::new(&ytdlp_path)
        .args(&args)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| AppError::Process(format!("Failed to spawn download process: {}", e)))?;

    let mut stdout = child
        .stdout
        .take()
        .ok_or_else(|| AppError::Process("Failed to capture stdout stream".to_string()))?;

    let mut stderr = child
        .stderr
        .take()
        .ok_or_else(|| AppError::Process("Failed to capture stderr stream".to_string()))?;

    let mut stdout_buf = Vec::new();
    let mut stderr_buf = Vec::new();
    let mut stderr_logs = Vec::new();

    let mut temp_stdout = [0u8; 1024];
    let mut temp_stderr = [0u8; 1024];

    let mut stdout_done = false;
    let mut stderr_done = false;

    while !stdout_done || !stderr_done {
        tokio::select! {
            res = tokio::io::AsyncReadExt::read(&mut stdout, &mut temp_stdout), if !stdout_done => {
                match res {
                    Ok(0) => { stdout_done = true; }
                    Ok(n) => {
                        stdout_buf.extend_from_slice(&temp_stdout[..n]);
                        while let Some(pos) = stdout_buf.iter().position(|&b| b == b'\r' || b == b'\n') {
                            let line_bytes: Vec<u8> = stdout_buf.drain(..=pos).collect();
                            let line_str = String::from_utf8_lossy(&line_bytes);
                            let trimmed = line_str.trim();
                            if !trimmed.is_empty() {
                                if let Some(mut progress) = parse_progress_line(trimmed) {
                                    progress.item_id = options.item_id.clone();
                                    progress_callback(progress);
                                }
                            }
                        }
                    }
                    Err(_) => { stdout_done = true; }
                }
            }
            res = tokio::io::AsyncReadExt::read(&mut stderr, &mut temp_stderr), if !stderr_done => {
                match res {
                    Ok(0) => { stderr_done = true; }
                    Ok(n) => {
                        stderr_buf.extend_from_slice(&temp_stderr[..n]);
                        while let Some(pos) = stderr_buf.iter().position(|&b| b == b'\r' || b == b'\n') {
                            let line_bytes: Vec<u8> = stderr_buf.drain(..=pos).collect();
                            let line_str = String::from_utf8_lossy(&line_bytes);
                            let trimmed = line_str.trim();
                            if !trimmed.is_empty() {
                                if let Some(mut progress) = parse_progress_line(trimmed) {
                                    progress.item_id = options.item_id.clone();
                                    progress_callback(progress);
                                }
                                stderr_logs.push(trimmed.to_string());
                            }
                        }
                    }
                    Err(_) => { stderr_done = true; }
                }
            }
        }
    }

    let status = child
        .wait()
        .await
        .map_err(|e| AppError::Process(format!("Process wait error: {}", e)))?;

    if !status.success() {
        let err_summary = stderr_logs.join("\n");
        return Err(AppError::Process(format!(
            "Download failed with exit code {:?}. Details: {}",
            status.code(),
            err_summary.trim()
        )));
    }

    // Emit 100% finished progress event
    progress_callback(DownloadProgress {
        percent: 100.0,
        speed: None,
        eta: None,
        downloaded_bytes: 0,
        total_bytes: None,
        status: "finished".to_string(),
        item_id: options.item_id.clone(),
        batch_info: None,
    });

    Ok(())
}
