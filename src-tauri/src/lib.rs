pub mod commands;
pub mod config;
pub mod core;
pub mod engine;

use commands::download::{download_playlist, download_queue, download_video};
use commands::metadata::{get_playlist_info, get_video_info};
use commands::system::{
    check_system_dependencies, get_system_paths, get_user_settings, open_appdata_folder,
    open_logs_folder, open_url, provision_dependencies, save_user_settings_command,
    select_download_folder, uninstall_binaries,
};
use commands::window::{
    close_window, minimize_window, toggle_always_on_top, toggle_maximize_window,
};

/// Main entry point to initialize application directories and launch the Tauri app.
pub fn run() {
    // Initialize %APPDATA%/Methik directories (bin, logs, config) on boot
    if let Err(err) = config::paths::ensure_app_directories() {
        eprintln!("[Methik] Warning: Failed to initialize AppData directories: {}", err);
    }

    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            check_system_dependencies,
            provision_dependencies,
            open_appdata_folder,
            open_logs_folder,
            open_url,
            uninstall_binaries,
            get_system_paths,
            get_user_settings,
            save_user_settings_command,
            select_download_folder,
            get_video_info,
            get_playlist_info,
            download_video,
            download_playlist,
            download_queue,
            toggle_always_on_top,
            minimize_window,
            toggle_maximize_window,
            close_window
        ])
        .setup(|_app| {
            println!(
                "[Methik] Application initialized. Isolated AppData path: {:?}",
                config::paths::get_appdata_dir()
            );
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("Error while running Methik application");
}
