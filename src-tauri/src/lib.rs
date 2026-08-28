pub mod commands;
pub mod config;
pub mod core;
pub mod engine;

use commands::download::{cancel_download, download_playlist, download_queue, download_video};
use commands::metadata::{get_playlist_info, get_video_info};
use commands::system::{
    cancel_provisioning, cancel_update, check_for_updates, check_system_dependencies,
    download_and_apply_update, get_app_info, get_system_paths, get_user_settings, is_dev_mode,
    log_client_event, open_appdata_folder, open_bin_folder, open_download_folder, open_logs_folder, open_media_file,
    open_url, provision_dependencies, read_clipboard, save_user_settings_command,
    select_cookie_file, select_download_folder, uninstall_binaries,
};
use commands::window::{
    close_window, drag_window, minimize_window, set_view_window_mode, toggle_always_on_top,
    toggle_maximize_window,
};

/// Main entry point to initialize application directories and launch the Tauri app.
pub fn run() {
    // Initialize %LOCALAPPDATA%/curlyzed/Methik directories (logs, config) and shared bin on boot
    if let Err(err) = config::paths::ensure_app_directories() {
        eprintln!("[Methik] Warning: Failed to initialize AppData directories: {}", err);
    }

    config::paths::append_app_log(
        "INFO",
        "AppBoot",
        &format!(
            "Methik v{} ({}) starting up. Mode: {}. AppData: {:?}",
            env!("CARGO_PKG_VERSION"),
            engine::updater::CURRENT_ARCH,
            if cfg!(debug_assertions) { "Development" } else { "Release" },
            config::paths::get_appdata_dir()
        ),
    );

    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            check_system_dependencies,
            provision_dependencies,
            cancel_provisioning,
            open_appdata_folder,
            open_bin_folder,
            open_logs_folder,
            open_download_folder,
            open_media_file,
            open_url,
            uninstall_binaries,
            get_system_paths,
            get_user_settings,
            save_user_settings_command,
            select_download_folder,
            select_cookie_file,
            read_clipboard,
            is_dev_mode,
            log_client_event,
            get_app_info,
            check_for_updates,
            download_and_apply_update,
            cancel_update,
            get_video_info,
            get_playlist_info,
            download_video,
            download_playlist,
            download_queue,
            cancel_download,
            drag_window,
            toggle_always_on_top,
            minimize_window,
            toggle_maximize_window,
            close_window,
            set_view_window_mode
        ])
        .setup(|_app| {
            config::paths::append_app_log("INFO", "AppBoot", "Tauri runtime window setup completed.");
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("Error while running Methik application");
}
