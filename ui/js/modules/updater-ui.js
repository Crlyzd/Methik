/**
 * App update checker on startup, release notes dialog, and in-app updater pipeline.
 */
import { state } from './state.js';
import { openModal } from './modal.js';
import { renderMarkdown } from './markdown.js';

export async function checkAppVersion(silent = false) {
  const textEl = document.getElementById('aboutVersionStatusText');
  const btn = document.getElementById('btnCheckAppVersion');
  const btnText = document.getElementById('btnCheckAppVersionText');
  const aboutBox = document.getElementById('aboutVersionBox');
  const btnAbout = document.getElementById('btnAbout');

  if (!silent) {
    if (textEl) textEl.textContent = 'Checking updates...';
    if (btn) btn.classList.add('spinning');
  }

  try {
    const result = await Api.checkForUpdates();
    state.updateInfo = result;

    const archUpper = (result.arch || state.appInfo?.arch || 'x64').toUpperCase();

    if (result.has_update) {
      // Light up the Titlebar Info/About button with glowing update badge
      if (btnAbout) {
        btnAbout.classList.add('has-update');
      }

      // Light up the About modal version box
      if (aboutBox) {
        aboutBox.classList.add('update-available');
      }

      if (textEl) {
        textEl.textContent = `Update available: v${result.latest_version} (${archUpper})`;
      }

      if (btn && btnText) {
        btnText.textContent = 'View';
        btn.onclick = () => openModal('updateModal');
      }

      // Populate Update Modal Content
      const modalTitle = document.getElementById('updateModalTitle');
      const modalSubtitle = document.getElementById('updateModalSubtitle');
      const verInfo = document.getElementById('updateVersionInfo');
      const sizeInfo = document.getElementById('updateFileSize');
      const notesText = document.getElementById('updateNotesText');
      const btnPerform = document.getElementById('btnPerformUpdate');
      const btnPerformText = document.getElementById('btnPerformUpdateText');

      if (modalTitle) modalTitle.textContent = 'Update Available';
      if (modalSubtitle) modalSubtitle.textContent = `New release v${result.latest_version} ready for Windows (${archUpper})`;
      if (verInfo) verInfo.textContent = `v${result.latest_version} (${archUpper})`;
      if (sizeInfo) {
        if (result.asset_size > 0) {
          const sizeMB = (result.asset_size / (1024 * 1024)).toFixed(1);
          sizeInfo.textContent = `${sizeMB} MB`;
        } else {
          sizeInfo.textContent = 'Ready';
        }
      }
      if (notesText) {
        notesText.innerHTML = renderMarkdown(result.release_notes || 'No changelog notes provided for this release.');
      }

      if (btnPerform && btnPerformText) {
        if (result.matching_asset_found && result.download_url) {
          btnPerformText.textContent = 'Update & Restart';
          btnPerform.onclick = () => startAppUpdate();
        } else {
          btnPerformText.textContent = 'View on GitHub';
          btnPerform.onclick = () => {
            if (result.release_url) Api.invoke('open_url', { url: result.release_url });
          };
        }
      }

      // Only popup dialog automatically if user explicitly triggered check, not on silent launch
      if (!silent) {
        openModal('updateModal');
      }
    } else {
      if (btnAbout) btnAbout.classList.remove('has-update');
      if (aboutBox) aboutBox.classList.remove('update-available');

      if (textEl) {
        textEl.textContent = `METHIK v${result.current_version} (${archUpper}) (Latest Version)`;
      }
      if (btn && btnText) {
        btnText.textContent = 'Check';
        btn.onclick = () => checkAppVersion(false);
      }
    }
  } catch (e) {
    console.warn('Update check failed:', e);
    if (!silent && textEl) {
      textEl.textContent = 'Unable to check updates (Offline / Rate limited)';
    }
  } finally {
    if (btn) btn.classList.remove('spinning');
  }
}

export async function startAppUpdate() {
  if (!state.updateInfo || !state.updateInfo.download_url) {
    if (state.updateInfo?.release_url) {
      Api.invoke('open_url', { url: state.updateInfo.release_url });
    }
    return;
  }

  const progressSection = document.getElementById('updateProgressSection');
  const actions = document.getElementById('updateModalActions');
  const label = document.getElementById('updateProgressLabel');
  const pct = document.getElementById('updatePct');
  const fill = document.getElementById('updateFill');
  const bytes = document.getElementById('updateBytes');

  if (progressSection) progressSection.style.display = 'block';
  if (actions) actions.style.display = 'none';
  if (label) label.textContent = 'Downloading Update...';
  if (pct) pct.textContent = '0.0%';
  if (fill) {
    fill.style.width = '0%';
    fill.style.background = 'var(--accent-gradient)';
  }
  if (bytes) bytes.textContent = 'Connecting...';

  state.isUpdating = true;

  let onProgress = (progress) => {
    onUpdateProgress(progress);
  };

  if (Api.isTauri() && window.__TAURI__.core && typeof window.__TAURI__.core.Channel === 'function') {
    const chan = new window.__TAURI__.core.Channel();
    chan.onmessage = (progress) => {
      onUpdateProgress(progress);
    };
    onProgress = chan;
  }

  try {
    await Api.downloadAndApplyUpdate(state.updateInfo.download_url, onProgress);
  } catch (e) {
    console.error('Update failed:', e);
    state.isUpdating = false;
    if (label) label.textContent = 'Update Failed';
    if (fill) fill.style.background = 'var(--status-danger)';
    if (bytes) bytes.textContent = String(e);
    if (actions) actions.style.display = 'flex';
  }
}

export function onUpdateProgress(progress) {
  const label = document.getElementById('updateProgressLabel');
  const pct = document.getElementById('updatePct');
  const fill = document.getElementById('updateFill');
  const bytes = document.getElementById('updateBytes');

  if (pct) pct.textContent = `${(progress.percentage || 0).toFixed(1)}%`;
  if (fill) fill.style.width = `${progress.percentage || 0}%`;
  if (bytes) bytes.textContent = progress.message || '';

  if (progress.status === 'applying') {
    if (label) label.textContent = 'Applying Update...';
    if (fill) fill.style.background = 'var(--status-valid)';
  }
}
