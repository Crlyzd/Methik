use crate::config::paths::get_ytdlp_bin_name;
use crate::core::error::AppError;
use crate::core::models::{DownloadOptions, DownloadProgress, PlaylistMetadata, VideoMetadata};
use crate::engine::args_builder::{
    build_download_args, build_playlist_metadata_args, build_video_metadata_args,
};
use crate::engine::dependency::locate_binary;
use crate::engine::parser::{parse_playlist_json, parse_progress_line, parse_video_json};
use crate::engine::process::{new_async_command, new_command};
use std::process::Stdio;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};

static DOWNLOAD_CANCEL_FLAG: AtomicBool = AtomicBool::new(false);
static ACTIVE_DOWNLOAD_PID: Mutex<Option<u32>> = Mutex::new(None);

pub fn set_download_cancelled(val: bool) {
    DOWNLOAD_CANCEL_FLAG.store(val, Ordering::SeqCst);
}

pub fn is_download_cancelled() -> bool {
    DOWNLOAD_CANCEL_FLAG.load(Ordering::SeqCst)
}

pub fn set_active_download_pid(pid: Option<u32>) {
    if let Ok(mut lock) = ACTIVE_DOWNLOAD_PID.lock() {
        *lock = pid;
    }
}

pub fn get_active_download_pid() -> Option<u32> {
    if let Ok(lock) = ACTIVE_DOWNLOAD_PID.lock() {
        *lock
    } else {
        None
    }
}

/// Cancels active download process immediately and prevents subsequent queue items
pub fn cancel_active_download() {
    set_download_cancelled(true);
    if let Some(pid) = get_active_download_pid() {
        #[cfg(target_os = "windows")]
        {
            let _ = new_command("taskkill")
                .args(&["/F", "/T", "/PID", &pid.to_string()])
                .output();
        }
        #[cfg(not(target_os = "windows"))]
        {
            let _ = new_command("kill")
                .args(&["-9", &pid.to_string()])
                .output();
        }
        set_active_download_pid(None);
    }
}

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

    let output = new_async_command(&ytdlp_path)
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

    let output = new_async_command(&ytdlp_path)
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
    if is_download_cancelled() {
        return Err(AppError::Process("Download cancelled by user".to_string()));
    }

    let ytdlp_path = get_ytdlp_executable()?;
    let args = build_download_args(options);

    let mut child = new_async_command(&ytdlp_path)
        .args(&args)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| AppError::Process(format!("Failed to spawn download process: {}", e)))?;

    if let Some(pid) = child.id() {
        set_active_download_pid(Some(pid));
    }

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
        if is_download_cancelled() {
            set_active_download_pid(None);
            return Err(AppError::Process("Download cancelled by user".to_string()));
        }

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

    set_active_download_pid(None);

    if is_download_cancelled() {
        return Err(AppError::Process("Download cancelled by user".to_string()));
    }

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
        error_message: None,
    });

    Ok(())
}
