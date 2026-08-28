/**
 * Desktop Window frame controls (Pin/Always on Top, Minimize, Close, Explorer actions).
 */
import { state } from './state.js';

export async function loadAppInfo() {
  try {
    const info = await Api.getAppInfo();
    state.appInfo = info;
    const archUpper = (info.arch || 'x64').toUpperCase();
    const versionStr = `v${info.version || '0.1.0'}`;

    const titlebarVer = document.getElementById('brandVersion');
    if (titlebarVer) {
      titlebarVer.textContent = `${versionStr} (${archUpper})`;
    }

    const aboutSub = document.getElementById('aboutSubtitle');
    if (aboutSub) {
      aboutSub.textContent = `${versionStr} (${archUpper}) • Universal Video & Audio Stream Suite`;
    }

    const aboutVerStatus = document.getElementById('aboutVersionStatusText');
    if (aboutVerStatus) {
      aboutVerStatus.textContent = `METHIK ${versionStr} (${archUpper})`;
    }
  } catch (e) {
    console.warn('Failed to load app info:', e);
  }
}

export function startDragging(e) {
  // Only trigger on primary left mouse button
  if (e.button !== 0) return;
  // Ignore clicks on interactive controls
  if (e.target.closest('button, input, select, textarea, a, .btn-icon, .btn-win-ctrl, .glass-dropdown, .format-dropdown')) {
    return;
  }
  Api.invoke('drag_window').catch((err) => {
    console.warn('Native drag_window failed:', err);
  });
}

export async function togglePin() {
  const btn = document.getElementById('btnPin');
  const newPinned = !state.isPinned;
  try {
    await Api.invoke('toggle_always_on_top', { pinned: newPinned });
    state.isPinned = newPinned;
    if (btn) {
      btn.classList.toggle('active-pin', newPinned);
      btn.title = newPinned ? 'Always on Top: Enabled' : 'Always on Top: Disabled';
    }
  } catch (e) {
    console.error('Failed to toggle pin:', e);
  }
}

export async function minimizeWindow() {
  try {
    await Api.invoke('minimize_window');
  } catch (e) {
    console.error('Failed to minimize window:', e);
  }
}

export async function toggleMaximize() {
  try {
    await Api.invoke('toggle_maximize_window');
  } catch (e) {
    console.error('Failed to toggle maximize:', e);
  }
}

export async function closeWindow() {
  try {
    await Api.invoke('close_window');
  } catch (e) {
    console.error('Failed to close window:', e);
  }
}

export async function openAppData() {
  try {
    await Api.invoke('open_appdata_folder');
  } catch (e) {
    console.error('Failed to open AppData folder:', e);
  }
}

export async function openBinFolder() {
  try {
    await Api.invoke('open_bin_folder');
  } catch (e) {
    console.error('Failed to open bin folder:', e);
  }
}

export async function openLogs() {
  try {
    await Api.invoke('open_logs_folder');
  } catch (e) {
    console.error('Failed to open logs folder:', e);
  }
}

export async function openUrl(url) {
  if (!url) return;
  try {
    await Api.invoke('open_url', { url });
  } catch (e) {
    console.warn('Native open_url failed, falling back to browser window.open:', e);
    window.open(url, '_blank');
  }
}

export async function openMedia(itemId) {
  try {
    const item = state.queue.find((q) => q.id === itemId);
    const videoId = (item && item.videoId) ? item.videoId : (itemId ? itemId.replace(/^(vid_|pl_)/, '') : '');
    const title = item ? item.title : '';
    await Api.invoke('open_media_file', {
      itemId: itemId || '',
      videoId: videoId || '',
      title: title || '',
      outputDir: state.downloadDir || null,
    });
  } catch (e) {
    console.error('Failed to open media file:', e);
  }
}
