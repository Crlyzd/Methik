/**
 * Dependency locator, Missing binaries dialog, and Auto-provisioning UI controllers.
 */
import { state } from './state.js';
import { openModal, closeModal, setProvisionConfirmResolver } from './modal.js';

let _provisionConfirmResolver = null;

export function onProvisionProgress(progress) {
  const provSubtitle = document.getElementById('provSubtitle');
  const provPct = document.getElementById('provPct');
  const provFill = document.getElementById('provFill');
  const provBytes = document.getElementById('provBytes');

  if (provSubtitle && progress.binary) {
    provSubtitle.textContent = progress.status && progress.status.includes('Extracting')
      ? `Extracting ${progress.binary} binaries into AppData...`
      : `Downloading ${progress.binary} portable binary...`;
  }

  if (provPct) {
    provPct.textContent = `${(progress.percent || 0).toFixed(1)}%`;
  }

  if (provFill) {
    provFill.style.width = `${progress.percent || 0}%`;
  }

  if (provBytes) {
    if (progress.total_bytes > 0) {
      const dlMb = (progress.downloaded_bytes / (1024 * 1024)).toFixed(1);
      const totalMb = (progress.total_bytes / (1024 * 1024)).toFixed(1);
      const speedText = progress.speed ? ` (${progress.speed})` : '';
      provBytes.textContent = `${dlMb} MB / ${totalMb} MB${speedText}`;
    } else if (progress.status) {
      provBytes.textContent = progress.status;
    }
  }
}

export async function checkDependencies(forceRefresh = false) {
  try {
    const ytdlpLabel = document.getElementById('ytdlpVersionLabel');
    const ffmpegLabel = document.getElementById('ffmpegVersionLabel');
    const denoLabel = document.getElementById('denoVersionLabel');
    const ytdlpBadge = document.getElementById('ytdlpBadge');
    const ffmpegBadge = document.getElementById('ffmpegBadge');
    const denoBadge = document.getElementById('denoBadge');
    const banner = document.getElementById('depWarningBanner');

    if (forceRefresh) {
      if (ytdlpLabel) ytdlpLabel.textContent = 'Checking...';
      if (ffmpegLabel) ffmpegLabel.textContent = 'Checking...';
      if (denoLabel) denoLabel.textContent = 'Checking...';
    }

    const report = await Api.invoke('check_system_dependencies');
    state.dependencies = report;

    if (report && report.ytdlp) {
      if (ytdlpLabel) ytdlpLabel.textContent = report.ytdlp.is_installed ? report.ytdlp.version : 'Missing';
      if (ytdlpBadge) {
        ytdlpBadge.className = report.ytdlp.is_valid ? 'badge-valid' : 'badge-missing';
        ytdlpBadge.textContent = report.ytdlp.is_valid ? 'Valid' : 'Missing';
      }
    }

    if (report && report.ffmpeg) {
      if (ffmpegLabel) ffmpegLabel.textContent = report.ffmpeg.is_installed ? report.ffmpeg.version : 'Missing';
      if (ffmpegBadge) {
        ffmpegBadge.className = report.ffmpeg.is_valid ? 'badge-valid' : 'badge-missing';
        ffmpegBadge.textContent = report.ffmpeg.is_valid ? 'Valid' : 'Missing';
      }
    }

    if (report && report.deno) {
      if (denoLabel) denoLabel.textContent = report.deno.is_installed ? report.deno.version : 'Missing';
      if (denoBadge) {
        denoBadge.className = report.deno.is_valid ? 'badge-valid' : 'badge-missing';
        denoBadge.textContent = report.deno.is_valid ? 'Valid' : 'Missing';
      }
    }

    const btnEngine = document.getElementById('btnEngineProvision');
    const btnEngineText = document.getElementById('btnEngineProvisionText');
    const btnEngineIcon = document.getElementById('btnEngineProvisionIcon');

    if (report && report.all_valid) {
      if (btnEngine) {
        btnEngine.disabled = true;
        btnEngine.title = 'Binaries are already installed and up to date in AppData';
      }
      if (btnEngineText) {
        btnEngineText.textContent = 'Binaries Up to Date';
      }
      if (btnEngineIcon) {
        btnEngineIcon.innerHTML = `<svg class="svg-icon svg-stroke" style="width:14px; height:14px; color:var(--status-valid);" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>`;
      }
    } else {
      if (btnEngine) {
        btnEngine.disabled = false;
        btnEngine.title = 'Download and configure dependencies in AppData';
      }
      if (btnEngineText) {
        btnEngineText.textContent = 'Install / Update Binaries to AppData';
      }
      if (btnEngineIcon) {
        btnEngineIcon.innerHTML = `<svg class="svg-icon svg-stroke" style="width:14px; height:14px; color:var(--text-main);" viewBox="0 0 24 24"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>`;
      }
    }

    if (banner) {
      banner.style.display = report && report.all_valid ? 'none' : 'flex';
    }
  } catch (e) {
    console.error('Failed checking dependencies:', e);
  }
}

export function requestProvisionConfirmation(report) {
  return new Promise((resolve) => {
    _provisionConfirmResolver = resolve;
    setProvisionConfirmResolver(() => {
      if (_provisionConfirmResolver) {
        _provisionConfirmResolver(false);
        _provisionConfirmResolver = null;
      }
    });

    const listEl = document.getElementById('provisionConfirmEngineList');
    const btnTextEl = document.getElementById('provisionConfirmBtnText');
    const locationTextEl = document.getElementById('provisionConfirmLocationText');

    let missingItems = [];
    let totalEstMB = 0;

    if (!report || !report.ytdlp || !report.ytdlp.is_valid) {
      missingItems.push({
        name: 'yt-dlp',
        desc: 'Metadata analyzer and multi-stream downloader',
        color: 'var(--accent-cyan)',
        icon: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>',
        sizeMB: 15,
      });
      totalEstMB += 15;
    }

    if (!report || !report.ffmpeg || !report.ffmpeg.is_valid) {
      missingItems.push({
        name: 'FFmpeg',
        desc: 'High-resolution 4K video merging and audio converter',
        color: 'var(--accent-violet)',
        icon: '<polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/>',
        sizeMB: 120,
      });
      totalEstMB += 120;
    }

    if (!report || !report.deno || !report.deno.is_valid) {
      missingItems.push({
        name: 'Deno',
        desc: 'JavaScript engine for stream extractors & bot-challenge solver',
        color: 'var(--status-valid)',
        icon: '<polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>',
        sizeMB: 35,
      });
      totalEstMB += 35;
    }

    if (listEl) {
      listEl.innerHTML = missingItems
        .map(
          (item) => `
        <div class="confirm-engine-item">
          <svg class="svg-icon svg-stroke" style="width:14px; height:14px; color: ${item.color};" viewBox="0 0 24 24">${item.icon}</svg>
          <div class="confirm-engine-details">
            <strong>${item.name}</strong>
            <span>${item.desc}</span>
          </div>
        </div>`
        )
        .join('');
    }

    if (btnTextEl) {
      const count = missingItems.length;
      const nameText = count === 1 ? missingItems[0].name : `${count} Missing Components`;
      btnTextEl.textContent = `Download & Install ${nameText} (~${totalEstMB} MB)`;
    }

    if (locationTextEl) {
      locationTextEl.innerHTML = `Installed into shared <code>%LOCALAPPDATA%/curlyzed/bin</code> (~${totalEstMB} MB). No system path modifications.`;
    }

    openModal('provisionConfirmModal');
  });
}

export function resolveProvisionConfirmation(confirmed) {
  if (_provisionConfirmResolver) {
    const r = _provisionConfirmResolver;
    _provisionConfirmResolver = null;
    r(confirmed);
  }
  const el = document.getElementById('provisionConfirmModal');
  if (el) el.classList.remove('active');
}

export async function ensureDependenciesReady() {
  try {
    const report = await Api.invoke('check_system_dependencies');
    state.dependencies = report;
    if (report && report.all_valid) {
      return true;
    }

    const confirmed = await requestProvisionConfirmation(report);
    if (!confirmed) {
      return false;
    }

    return await startProvisioning();
  } catch (e) {
    console.error('Dependency check failed:', e);
    return false;
  }
}

export async function startProvisioning() {
  const provTitle = document.getElementById('provTitle');
  const provSubtitle = document.getElementById('provSubtitle');
  const provPct = document.getElementById('provPct');
  const provFill = document.getElementById('provFill');
  const provBytes = document.getElementById('provBytes');
  const provSpinner = document.getElementById('provSpinner');

  if (provTitle) provTitle.textContent = 'Downloading Dependencies...';
  if (provSubtitle) provSubtitle.textContent = 'Initializing downloads into AppData...';
  if (provPct) provPct.textContent = '0.0%';
  if (provFill) {
    provFill.style.width = '0%';
    provFill.style.background = 'var(--accent-gradient)';
  }
  if (provBytes) provBytes.textContent = 'Preparing download...';
  if (provSpinner) provSpinner.style.display = 'block';

  openModal('provisionModal');

  let onProgress = (progress) => {
    onProvisionProgress(progress);
  };
  if (Api.isTauri() && window.__TAURI__.core && typeof window.__TAURI__.core.Channel === 'function') {
    const chan = new window.__TAURI__.core.Channel();
    chan.onmessage = (progress) => {
      onProvisionProgress(progress);
    };
    onProgress = chan;
  }

  try {
    const report = await Api.invoke('provision_dependencies', { onProgress });
    state.dependencies = report;
    await checkDependencies();

    if (provTitle) provTitle.textContent = 'Dependencies Ready!';
    if (provSubtitle) provSubtitle.textContent = 'yt-dlp and FFmpeg configured successfully in AppData.';
    if (provPct) provPct.textContent = '100%';
    if (provFill) {
      provFill.style.width = '100%';
      provFill.style.background = 'var(--status-valid)';
    }
    if (provBytes) provBytes.textContent = 'Completed';
    if (provSpinner) provSpinner.style.display = 'none';

    setTimeout(() => {
      closeModal('provisionModal');
    }, 1200);
    return true;
  } catch (e) {
    const errStr = String(e);
    if (errStr.includes('cancelled') || errStr.includes('canceled') || errStr.includes('Canceled')) {
      console.log('[Methik] Provisioning cancelled by user.');
      closeModal('provisionModal');
      return false;
    }
    if (provTitle) provTitle.textContent = 'Download Failed';
    if (provSubtitle) provSubtitle.textContent = errStr;
    if (provSpinner) provSpinner.style.display = 'none';
    if (provFill) provFill.style.background = 'var(--status-danger)';
    return false;
  }
}

export function promptCancelProvisioning() {
  openModal('cancelProvisionConfirmModal');
}

export async function executeCancelProvisioning() {
  try {
    await Api.invoke('cancel_provisioning');
  } catch (e) {
    console.warn('cancel_provisioning error:', e);
  }
  closeModal('cancelProvisionConfirmModal');
  closeModal('provisionModal');
  await checkDependencies();
}
