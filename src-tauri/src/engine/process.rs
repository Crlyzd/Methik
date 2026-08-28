use crate::config::paths::{get_bin_dir, get_legacy_appdata_bin_dir, get_shared_curlyzed_dir};
use std::env;
use std::ffi::{OsStr, OsString};
use std::path::PathBuf;
use std::process::Command as StdCommand;
use tokio::process::Command as TokioCommand;

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

/// Windows creation flag to prevent spawning a visible CMD/console window
#[cfg(target_os = "windows")]
pub const CREATE_NO_WINDOW: u32 = 0x0800_0000;

/// Builds an augmented PATH environment variable containing shared and AppData bin directories
pub fn get_augmented_path_env() -> OsString {
    let paths_to_prepend: Vec<PathBuf> = vec![
        get_bin_dir(),
        get_shared_curlyzed_dir(),
        get_legacy_appdata_bin_dir(),
        PathBuf::from("bin"),
    ];

    let current_path = env::var_os("PATH").unwrap_or_default();
    let split_paths = env::split_paths(&current_path);

    let mut all_paths = Vec::new();
    for p in paths_to_prepend {
        if p.exists() || p.is_relative() {
            all_paths.push(p);
        }
    }
    all_paths.extend(split_paths);

    env::join_paths(all_paths).unwrap_or(current_path)
}

/// Constructs a synchronous `std::process::Command` with console window suppression on Windows
/// and pre-injected shared bin directory in PATH so yt-dlp can locate deno and ffmpeg.
pub fn new_command<S: AsRef<OsStr>>(program: S) -> StdCommand {
    let mut cmd = StdCommand::new(program);
    cmd.env("PATH", get_augmented_path_env());
    #[cfg(target_os = "windows")]
    {
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    cmd
}

/// Constructs an asynchronous `tokio::process::Command` with console window suppression on Windows
/// and pre-injected shared bin directory in PATH so yt-dlp can locate deno and ffmpeg.
pub fn new_async_command<S: AsRef<OsStr>>(program: S) -> TokioCommand {
    let std_cmd = new_command(program);
    TokioCommand::from(std_cmd)
}

