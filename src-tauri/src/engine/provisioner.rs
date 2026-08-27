use crate::config::paths::{
    get_bin_dir, get_deno_bin_path, get_ffmpeg_bin_path, get_ffprobe_bin_path, get_ytdlp_bin_path,
};
use crate::core::error::AppError;
use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use std::fs::{self, File};
use std::io::Write;
use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

static PROVISION_CANCEL_FLAG: AtomicBool = AtomicBool::new(false);

pub fn set_provision_cancelled(val: bool) {
    PROVISION_CANCEL_FLAG.store(val, Ordering::SeqCst);
}

pub fn is_provision_cancelled() -> bool {
    PROVISION_CANCEL_FLAG.load(Ordering::SeqCst)
}

pub const YTDLP_WINDOWS_URL: &str =
    "https://github.com/yt-dlp/yt-dlp-nightly-builds/releases/latest/download/yt-dlp.exe";
pub const YTDLP_UNIX_URL: &str =
    "https://github.com/yt-dlp/yt-dlp-nightly-builds/releases/latest/download/yt-dlp";

// Minimal portable FFmpeg builds for Windows
pub const FFMPEG_WINDOWS_ZIP_URL: &str =
    "https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-win64-gpl.zip";

// Portable Deno JS challenge solver binary for Windows
pub const DENO_WINDOWS_ZIP_URL: &str =
    "https://github.com/denoland/deno/releases/latest/download/deno-x86_64-pc-windows-msvc.zip";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProvisionProgress {
    pub binary: String,
    pub percent: f64,
    pub downloaded_bytes: u64,
    pub total_bytes: u64,
    pub speed: Option<String>,
    pub status: String,
}

/// Downloads yt-dlp binary directly into %APPDATA%/Methik/bin/
pub async fn provision_ytdlp<F>(progress_callback: Arc<F>) -> Result<(), AppError>
where
    F: Fn(ProvisionProgress) + Send + Sync + 'static,
{
    let url = if cfg!(target_os = "windows") {
        YTDLP_WINDOWS_URL
    } else {
        YTDLP_UNIX_URL
    };

    let target_path = get_ytdlp_bin_path();
    let temp_path = target_path.with_extension("tmp");

    download_file_with_progress(url, &temp_path, "yt-dlp", progress_callback.clone()).await?;

    // Atomic move temp file to target
    if target_path.exists() {
        let _ = fs::remove_file(&target_path);
    }
    fs::rename(&temp_path, &target_path)?;

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let mut perms = fs::metadata(&target_path)?.permissions();
        perms.set_mode(0o755);
        fs::set_permissions(&target_path, perms)?;
    }

    Ok(())
}

/// Downloads and unpacks FFmpeg and FFprobe into %APPDATA%/Methik/bin/
pub async fn provision_ffmpeg<F>(progress_callback: Arc<F>) -> Result<(), AppError>
where
    F: Fn(ProvisionProgress) + Send + Sync + 'static,
{
    let url = FFMPEG_WINDOWS_ZIP_URL;
    let bin_dir = get_bin_dir();
    let zip_temp_path = bin_dir.join("ffmpeg_temp.zip");

    download_file_with_progress(url, &zip_temp_path, "FFmpeg", progress_callback.clone()).await?;

    progress_callback(ProvisionProgress {
        binary: "FFmpeg".to_string(),
        percent: 99.0,
        downloaded_bytes: 0,
        total_bytes: 0,
        speed: None,
        status: "Extracting binaries...".to_string(),
    });

    // Extract ffmpeg.exe and ffprobe.exe from zip
    extract_ffmpeg_from_zip(&zip_temp_path, &bin_dir)?;

    // Cleanup temp zip archive
    let _ = fs::remove_file(&zip_temp_path);

    progress_callback(ProvisionProgress {
        binary: "FFmpeg".to_string(),
        percent: 100.0,
        downloaded_bytes: 0,
        total_bytes: 0,
        speed: None,
        status: "Completed".to_string(),
    });

    Ok(())
}

/// Downloads and unpacks Deno JS solver into %APPDATA%/Methik/bin/
pub async fn provision_deno<F>(progress_callback: Arc<F>) -> Result<(), AppError>
where
    F: Fn(ProvisionProgress) + Send + Sync + 'static,
{
    let url = DENO_WINDOWS_ZIP_URL;
    let bin_dir = get_bin_dir();
    let zip_temp_path = bin_dir.join("deno_temp.zip");

    download_file_with_progress(url, &zip_temp_path, "Deno", progress_callback.clone()).await?;

    progress_callback(ProvisionProgress {
        binary: "Deno".to_string(),
        percent: 99.0,
        downloaded_bytes: 0,
        total_bytes: 0,
        speed: None,
        status: "Extracting binaries...".to_string(),
    });

    // Extract deno.exe from zip
    extract_deno_from_zip(&zip_temp_path, &bin_dir)?;

    // Cleanup temp zip archive
    let _ = fs::remove_file(&zip_temp_path);

    progress_callback(ProvisionProgress {
        binary: "Deno".to_string(),
        percent: 100.0,
        downloaded_bytes: 0,
        total_bytes: 0,
        speed: None,
        status: "Completed".to_string(),
    });

    Ok(())
}

/// Downloads a remote URL to a local destination while streaming progress updates
async fn download_file_with_progress<F>(
    url: &str,
    target_path: &Path,
    binary_label: &str,
    progress_callback: Arc<F>,
) -> Result<(), AppError>
where
    F: Fn(ProvisionProgress) + Send + Sync + 'static,
{
    let client = reqwest::Client::builder()
        .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
        .redirect(reqwest::redirect::Policy::limited(10))
        .build()?;

    let response = client.get(url).send().await?;
    let total_bytes = response.content_length().unwrap_or(0);

    let mut file = File::create(target_path)?;
    let mut downloaded_bytes: u64 = 0;
    let mut stream = response.bytes_stream();

    let mut last_emit = std::time::Instant::now();
    let mut last_bytes = 0u64;
    let mut current_speed = String::from("0.0 MB/s");

    while let Some(chunk_res) = stream.next().await {
        if is_provision_cancelled() {
            drop(file);
            let _ = fs::remove_file(target_path);
            return Err(AppError::Canceled);
        }

        let chunk = chunk_res?;
        file.write_all(&chunk)?;
        downloaded_bytes += chunk.len() as u64;

        let now = std::time::Instant::now();
        let elapsed_since_last = now.duration_since(last_emit).as_secs_f64();

        if elapsed_since_last >= 0.08 || downloaded_bytes == total_bytes {
            let bytes_delta = downloaded_bytes.saturating_sub(last_bytes);
            if elapsed_since_last > 0.0 {
                let speed_mb = (bytes_delta as f64 / (1024.0 * 1024.0)) / elapsed_since_last;
                current_speed = format!("{:.1} MB/s", speed_mb);
            }
            last_emit = now;
            last_bytes = downloaded_bytes;

            let percent = if total_bytes > 0 {
                (downloaded_bytes as f64 / total_bytes as f64) * 100.0
            } else {
                0.0
            };

            progress_callback(ProvisionProgress {
                binary: binary_label.to_string(),
                percent: (percent * 10.0).round() / 10.0,
                downloaded_bytes,
                total_bytes,
                speed: Some(current_speed.clone()),
                status: "Downloading...".to_string(),
            });
        }
    }

    if is_provision_cancelled() {
        drop(file);
        let _ = fs::remove_file(target_path);
        return Err(AppError::Canceled);
    }

    file.flush()?;
    Ok(())
}

/// Unzips ffmpeg.exe and ffprobe.exe from the downloaded archive into target directory
fn extract_ffmpeg_from_zip(zip_path: &Path, target_dir: &Path) -> Result<(), AppError> {
    let zip_file = File::open(zip_path)?;
    let mut archive = zip::ZipArchive::new(zip_file)?;

    for i in 0..archive.len() {
        let mut file = archive.by_index(i)?;
        let enclosed_name = match file.enclosed_name() {
            Some(path) => path.to_owned(),
            None => continue,
        };

        let file_name = enclosed_name
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("");

        if file_name.eq_ignore_ascii_case("ffmpeg.exe")
            || file_name.eq_ignore_ascii_case("ffmpeg")
        {
            let dest_path = target_dir.join(file_name);
            let mut out = File::create(dest_path)?;
            std::io::copy(&mut file, &mut out)?;
        } else if file_name.eq_ignore_ascii_case("ffprobe.exe")
            || file_name.eq_ignore_ascii_case("ffprobe")
        {
            let dest_path = target_dir.join(file_name);
            let mut out = File::create(dest_path)?;
            std::io::copy(&mut file, &mut out)?;
        }
    }

    Ok(())
}

/// Unzips deno.exe from the downloaded archive into target directory
fn extract_deno_from_zip(zip_path: &Path, target_dir: &Path) -> Result<(), AppError> {
    let zip_file = File::open(zip_path)?;
    let mut archive = zip::ZipArchive::new(zip_file)?;

    for i in 0..archive.len() {
        let mut file = archive.by_index(i)?;
        let enclosed_name = match file.enclosed_name() {
            Some(path) => path.to_owned(),
            None => continue,
        };

        let file_name = enclosed_name
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("");

        if file_name.eq_ignore_ascii_case("deno.exe")
            || file_name.eq_ignore_ascii_case("deno")
        {
            let dest_path = target_dir.join(file_name);
            let mut out = File::create(dest_path)?;
            std::io::copy(&mut file, &mut out)?;
        }
    }

    Ok(())
}

/// Uninstalls all isolated binaries from AppData directory
pub fn uninstall_appdata_binaries() -> Result<(), AppError> {
    let ytdlp = get_ytdlp_bin_path();
    let ffmpeg = get_ffmpeg_bin_path();
    let ffprobe = get_ffprobe_bin_path();
    let deno = get_deno_bin_path();

    if ytdlp.exists() {
        let _ = fs::remove_file(ytdlp);
    }
    if ffmpeg.exists() {
        let _ = fs::remove_file(ffmpeg);
    }
    if ffprobe.exists() {
        let _ = fs::remove_file(ffprobe);
    }
    if deno.exists() {
        let _ = fs::remove_file(deno);
    }

    Ok(())
}
