/**
 * Tauri IPC Client Bridge for Methik
 * Provides structured bindings for Rust backend commands and event streams
 */
const Api = {
  isTauri: () => typeof window.__TAURI__ !== 'undefined' && typeof window.__TAURI__.core !== 'undefined',

  async invoke(cmd, args = {}) {
    if (this.isTauri()) {
      return await window.__TAURI__.core.invoke(cmd, args);
    } else {
      console.warn(`[Api Mock] invoke(${cmd})`, args);
      return this._mockResponse(cmd, args);
    }
  },

  async listen(event, handler) {
    if (typeof window.__TAURI__ !== 'undefined') {
      if (window.__TAURI__.event && typeof window.__TAURI__.event.listen === 'function') {
        return await window.__TAURI__.event.listen(event, (evt) => handler(evt.payload));
      } else if (window.__TAURI__.core && typeof window.__TAURI__.core.listen === 'function') {
        return await window.__TAURI__.core.listen(event, (evt) => handler(evt.payload));
      } else if (typeof window.__TAURI__.listen === 'function') {
        return await window.__TAURI__.listen(event, (evt) => handler(evt.payload));
      }
    }
    console.warn(`[Api Mock] listen(${event}) registered`);
    return () => {};
  },

  /**
   * Reads clipboard text natively via Tauri IPC to prevent browser permission prompts
   */
  async readClipboard() {
    if (this.isTauri()) {
      try {
        const text = await this.invoke('read_clipboard');
        return typeof text === 'string' ? text : '';
      } catch (err) {
        console.warn('[Api] Native read_clipboard failed, falling back:', err);
      }
    }
    if (navigator.clipboard && typeof navigator.clipboard.readText === 'function') {
      try {
        return await navigator.clipboard.readText();
      } catch (_) {
        return '';
      }
    }
    return '';
  },

  /**
   * Checks whether the app is running in development/debug mode
   */
  async isDevMode() {
    if (this.isTauri()) {
      try {
        return await this.invoke('is_dev_mode');
      } catch (_) {
        return false;
      }
    }
    return true; // Web preview is considered dev mode
  },

  /**
   * Writes a log entry into %APPDATA%/Methik/logs/app.log
   */
  async log(level, module, message) {
    if (this.isTauri()) {
      try {
        await this.invoke('log_client_event', { level: String(level), module: String(module), message: String(message) });
      } catch (_) {}
    } else {
      console.log(`[AppLog:${level}][${module}] ${message}`);
    }
  },

  /**
   * Retrieves application metadata including version, running architecture and dev mode status
   */
  async getAppInfo() {
    if (this.isTauri()) {
      try {
        return await this.invoke('get_app_info');
      } catch (err) {
        console.warn('[Api] get_app_info failed:', err);
      }
    }
    return { name: 'Methik', version: '0.1.0', arch: 'x64', os: 'windows', is_dev: true };
  },

  /**
   * Checks GitHub Releases API for the latest version matching current architecture
   */
  async checkForUpdates() {
    if (this.isTauri()) {
      return await this.invoke('check_for_updates');
    }
    return this._mockResponse('check_for_updates');
  },

  /**
   * Downloads and applies matching update
   */
  async downloadAndApplyUpdate(downloadUrl, onProgress) {
    if (this.isTauri()) {
      return await this.invoke('download_and_apply_update', { downloadUrl, onProgress });
    }
    console.warn('[Api Mock] downloadAndApplyUpdate triggered for:', downloadUrl);
    return true;
  },

  /**
   * Cancels update download
   */
  async cancelUpdate() {
    if (this.isTauri()) {
      return await this.invoke('cancel_update');
    }
    return true;
  },

  // Mock responses for testing frontend directly in browser preview
  _mockResponse(cmd, args) {
    switch (cmd) {
      case 'is_dev_mode':
        return true;
      case 'get_app_info':
        return { name: 'Methik', version: '0.1.0', arch: 'x64', os: 'windows', is_dev: true };
      case 'check_for_updates':
        return {
          has_update: false,
          current_version: '0.1.0',
          latest_version: '0.1.0',
          release_name: 'Methik v0.1.0',
          release_notes: 'Initial release with multi-architecture support.',
          release_url: 'https://github.com/Crlyzd/Methik/releases',
          download_url: null,
          asset_name: null,
          asset_size: 0,
          arch: 'x64',
          matching_asset_found: true
        };
      case 'download_and_apply_update':
      case 'cancel_update':
        return true;
      case 'log_client_event':
        return null;
      case 'check_system_dependencies':
        return {
          ytdlp: { name: 'yt-dlp', is_installed: true, version: '2026.02.14', path: '%APPDATA%/Methik/bin/yt-dlp.exe', is_valid: true, min_version_required: '2024.01.01', source: 'AppData' },
          ffmpeg: { name: 'FFmpeg', is_installed: true, version: '7.1', path: '%APPDATA%/Methik/bin/ffmpeg.exe', is_valid: true, min_version_required: '5.0', source: 'AppData' },
          deno: { name: 'Deno', is_installed: true, version: '2.2.3', path: '%APPDATA%/Methik/bin/deno.exe', is_valid: true, min_version_required: '1.30.0', source: 'AppData' },
          all_valid: true
        };
      case 'get_system_paths':
        return {
          appdata_dir: '%APPDATA%/Methik',
          bin_dir: '%APPDATA%/Methik/bin',
          logs_dir: '%APPDATA%/Methik/logs',
          config_dir: '%APPDATA%/Methik/config'
        };
      case 'get_user_settings':
        return {
          download_dir: 'C:/Users/Default/Desktop',
          default_quality: 'FHD1080',
          audio_format: 'Mp3',
          dark_mode: true,
          cookie_source: 'None'
        };
      case 'save_user_settings_command':
        return true;
      case 'select_download_folder':
        return 'C:/Users/Default/Desktop/MethikDownloads';
      case 'get_video_info':
        return {
          id: 'mock_' + Math.random().toString(36).substring(7),
          title: 'Sample Video - ' + (args.url || 'Demo Stream'),
          channel: 'Methik Creator Studio',
          formatted_duration: '04:20',
          thumbnail_url: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=300&auto=format&fit=crop&q=60',
          view_count: 1450000,
          webpage_url: args.url,
          formats: [
            { format_id: '1080p', ext: 'mp4', resolution: '1080p FHD (MP4)', is_audio_only: false, is_video_only: false },
            { format_id: '720p', ext: 'mp4', resolution: '720p HD (MP4)', is_audio_only: false, is_video_only: false },
            { format_id: '480p', ext: 'mp4', resolution: '480p SD (MP4)', is_audio_only: false, is_video_only: false },
            { format_id: 'audio_mp3', ext: 'mp3', resolution: 'Audio (MP3 320k)', is_audio_only: true, is_video_only: false },
            { format_id: 'audio_flac', ext: 'flac', resolution: 'Audio (FLAC Lossless)', is_audio_only: true, is_video_only: false }
          ]
        };
      case 'get_playlist_info':
        return {
          id: 'playlist_mock',
          title: 'Selected Favorites Playlist',
          channel: 'Soundtrack Hub',
          item_count: 3,
          webpage_url: args.url,
          entries: [
            { id: 'item_1', index: 1, title: 'Track 01 - Cyberpunk Atmosphere', formatted_duration: '03:45', thumbnail_url: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=300&auto=format&fit=crop&q=60', url: 'https://youtube.com/watch?v=item1' },
            { id: 'item_2', index: 2, title: 'Track 02 - Neon Reflections', formatted_duration: '05:12', thumbnail_url: 'https://images.unsplash.com/photo-1506744038136-46273834b3fb?w=300&auto=format&fit=crop&q=60', url: 'https://youtube.com/watch?v=item2' },
            { id: 'item_3', index: 3, title: 'Track 03 - Midnight Rain Drift', formatted_duration: '04:02', thumbnail_url: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=300&auto=format&fit=crop&q=60', url: 'https://youtube.com/watch?v=item3' }
          ]
        };
      case 'toggle_always_on_top':
        return args.pinned;
      case 'open_appdata_folder':
      case 'open_logs_folder':
        console.log(`[Api Mock] Folder opened: ${cmd}`);
        return null;
      case 'open_url':
        console.log(`[Api Mock] URL opened: ${args.url}`);
        window.open(args.url, '_blank');
        return null;
      case 'minimize_window':
      case 'close_window':
      case 'set_view_window_mode':
      case 'cancel_provisioning':
        return null;
      case 'toggle_maximize_window':
        return false;
      default:
        return {};
    }
  }
};
