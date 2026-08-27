use tauri::{AppHandle, Manager};

/// Toggles the window's Always On Top state
#[tauri::command]
pub fn toggle_always_on_top(app_handle: AppHandle, pinned: bool) -> Result<bool, String> {
    if let Some(window) = app_handle.get_webview_window("main") {
        window
            .set_always_on_top(pinned)
            .map_err(|e| format!("Failed to set always on top: {}", e))?;
        Ok(pinned)
    } else {
        Err("Main window not found".to_string())
    }
}

/// Minimizes the main application window
#[tauri::command]
pub fn minimize_window(app_handle: AppHandle) -> Result<(), String> {
    if let Some(window) = app_handle.get_webview_window("main") {
        window
            .minimize()
            .map_err(|e| format!("Failed to minimize window: {}", e))?;
        Ok(())
    } else {
        Err("Main window not found".to_string())
    }
}

/// Toggles between maximized and restored window states
#[tauri::command]
pub fn toggle_maximize_window(app_handle: AppHandle) -> Result<bool, String> {
    if let Some(window) = app_handle.get_webview_window("main") {
        let is_maximized = window
            .is_maximized()
            .map_err(|e| format!("Failed to check maximized state: {}", e))?;

        if is_maximized {
            window
                .unmaximize()
                .map_err(|e| format!("Failed to unmaximize window: {}", e))?;
            Ok(false)
        } else {
            window
                .maximize()
                .map_err(|e| format!("Failed to maximize window: {}", e))?;
            Ok(true)
        }
    } else {
        Err("Main window not found".to_string())
    }
}

/// Closes the application window gracefully
#[tauri::command]
pub fn close_window(app_handle: AppHandle) -> Result<(), String> {
    if let Some(window) = app_handle.get_webview_window("main") {
        window
            .close()
            .map_err(|e| format!("Failed to close window: {}", e))?;
        Ok(())
    } else {
        Err("Main window not found".to_string())
    }
}
