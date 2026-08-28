/**
 * Download execution orchestrator, stream progress listener, pause/resume, and tile progress updates.
 */
import { state } from './state.js';
import { getStatusLabel, updateSummary } from './queue.js';
import { showError } from './toast.js';

export async function onMainDownloadButtonClick(ensureDependenciesReady, openMediaFn) {
  if (state.isDownloading) {
    await pauseQueueDownload();
  } else if (state.isPaused) {
    await resumeQueueDownload(ensureDependenciesReady, openMediaFn);
  } else {
    await startQueueDownload(ensureDependenciesReady, openMediaFn);
  }
}

export async function pauseQueueDownload() {
  try {
    await Api.invoke('cancel_download');
  } catch (e) {
    console.warn('pause error:', e);
  } finally {
    state.isDownloading = false;
    state.isPaused = true;
    state.queue.forEach((q) => {
      if (q.status === 'downloading' || q.status === 'waiting') {
        q.status = 'paused';
        updateTileProgressDOM(q);
      }
    });
    updateSummary();
  }
}

export async function resumeQueueDownload(ensureDependenciesReady, openMediaFn) {
  state.isPaused = false;
  await startQueueDownload(ensureDependenciesReady, openMediaFn);
}

export async function cancelQueueDownload() {
  try {
    await Api.invoke('cancel_download');
  } catch (e) {
    console.warn('cancel_download error:', e);
  } finally {
    state.isDownloading = false;
    state.isPaused = false;
    state.queue.forEach((q) => {
      if (q.status === 'downloading' || q.status === 'waiting' || q.status === 'paused') {
        q.status = 'ready';
        updateTileProgressDOM(q);
      }
    });
    updateSummary();
  }
}

export async function startQueueDownload(ensureDependenciesReady, openMediaFn) {
  const selected = state.queue.filter((item) => item.checked && item.status !== 'finished');
  if (selected.length === 0) return;

  const ready = await ensureDependenciesReady();
  if (!ready) return;

  state.isDownloading = true;
  updateSummary();

  selected.forEach((item) => {
    item.status = 'waiting';
    item.progress = 0;
    item.speed = null;
    item.eta = null;
    item.errorDetails = null;
    updateTileProgressDOM(item, openMediaFn);
  });

  const items = selected.map((item) => {
    let quality = 'FHD1080';
    let audioOnly = false;
    let audioFormat = 'Mp3';

    if (item.selectedQuality === '4k') quality = 'UHD4K';
    else if (item.selectedQuality === '2k') quality = 'QHD2K';
    else if (item.selectedQuality === '1080p') quality = 'FHD1080';
    else if (item.selectedQuality === '720p') quality = 'HD720';
    else if (item.selectedQuality === '480p') quality = 'SD480';
    else if (item.selectedQuality === 'audio_mp3') {
      audioOnly = true;
      audioFormat = 'Mp3';
      quality = 'Best';
    } else if (item.selectedQuality === 'audio_flac') {
      audioOnly = true;
      audioFormat = 'Flac';
      quality = 'Best';
    }

    return {
      item_id: item.id,
      url: item.url,
      output_dir: state.downloadDir === 'Desktop' ? null : state.downloadDir,
      quality: quality,
      audio_only: audioOnly,
      audio_format: audioOnly ? audioFormat : null,
      audio_bitrate: '320k',
      embed_thumbnail: true,
      embed_metadata: true,
      playlist_indices: null,
    };
  });

  let onProgress = (progress) => {
    onDownloadProgress(progress, openMediaFn);
  };
  if (window.__TAURI__ && window.__TAURI__.core && typeof window.__TAURI__.core.Channel === 'function') {
    const chan = new window.__TAURI__.core.Channel();
    chan.onmessage = (progress) => {
      onDownloadProgress(progress, openMediaFn);
    };
    onProgress = chan;
  }

  try {
    await Api.invoke('download_queue', { items, onProgress });
  } catch (err) {
    console.error('Queue download failed:', err);
    showError({
      title: 'Download Failed',
      message: 'An error occurred while downloading items in the queue.',
      details: typeof err === 'string' ? err : (err && err.message ? err.message : JSON.stringify(err, null, 2)),
    });
  } finally {
    state.isDownloading = false;
    state.queue.forEach((q) => {
      if (q.status === 'waiting') {
        q.status = 'ready';
        updateTileProgressDOM(q, openMediaFn);
      }
    });
    updateSummary();
  }
}

export function onDownloadProgress(progress, openMediaFn) {
  if (!progress) return;

  if (progress.item_id) {
    const item = state.queue.find((q) => q.id === progress.item_id);
    if (item) {
      item.progress = typeof progress.percent === 'number' ? progress.percent : 0;
      if (progress.speed) item.speed = progress.speed;
      if (progress.eta) item.eta = progress.eta;
      if (progress.status) item.status = progress.status;
      if (progress.error_message) item.errorDetails = progress.error_message;

      updateTileProgressDOM(item, openMediaFn);
    }
  }

  if (progress.status === 'finished' && !progress.item_id) {
    state.isDownloading = false;
    state.queue.forEach((q) => {
      if (q.status === 'waiting' || q.status === 'downloading') {
        q.status = 'ready';
        updateTileProgressDOM(q, openMediaFn);
      }
    });
    updateSummary();
  }
}

export function updateTileProgressDOM(item, openMediaFn) {
  const tileEl = document.getElementById(`tile-${item.id}`);
  if (tileEl) {
    tileEl.classList.toggle('active-download', item.status === 'downloading');
    tileEl.classList.toggle('tile-error', item.status === 'error');
  }

  const fillEl = document.getElementById(`fill-${item.id}`);
  if (fillEl) {
    if (item.status === 'error') {
      fillEl.style.width = '100%';
      fillEl.style.background = 'var(--status-danger)';
    } else if (item.status === 'finished') {
      fillEl.style.width = '100%';
      fillEl.style.background = 'var(--status-valid)';
    } else if (item.status === 'paused') {
      fillEl.style.width = `${item.progress || 0}%`;
      fillEl.style.background = 'var(--status-warning)';
    } else {
      fillEl.style.width = `${item.progress}%`;
      fillEl.style.background = 'var(--accent-gradient)';
    }
  }

  const pctEl = document.getElementById(`pct-${item.id}`);
  if (pctEl) {
    if (item.status === 'error') {
      pctEl.textContent = 'Failed';
      pctEl.style.color = 'var(--status-danger)';
    } else if (item.status === 'finished') {
      pctEl.textContent = '100%';
      pctEl.style.color = 'var(--status-valid)';
    } else if (item.status === 'paused') {
      pctEl.textContent = item.progress > 0 ? `Paused (${item.progress.toFixed(1)}%)` : 'Paused';
      pctEl.style.color = 'var(--status-warning)';
    } else if (item.status === 'downloading') {
      pctEl.textContent = `${item.progress.toFixed(1)}%`;
      pctEl.style.color = 'var(--accent-cyan)';
    } else if (item.status === 'waiting') {
      pctEl.textContent = 'Waiting';
      pctEl.style.color = 'var(--text-dim)';
    } else {
      pctEl.textContent = 'Ready';
      pctEl.style.color = 'var(--text-dim)';
    }
  }

  const statusTextEl = document.getElementById(`status-text-${item.id}`);
  if (statusTextEl) {
    statusTextEl.innerHTML = getStatusLabel(item);
  }

  const statusGroup = document.getElementById(`status-${item.id}`);
  if (statusGroup) {
    const dot = statusGroup.querySelector('.status-dot');
    if (dot) {
      dot.className = `status-dot ${item.status}`;
    }
  }

  if (item.status === 'finished') {
    const controlsEl = document.getElementById(`controls-${item.id}`);
    if (controlsEl && !controlsEl.querySelector('.btn-tile-open')) {
      const btnOpen = document.createElement('button');
      btnOpen.className = 'btn-tile-open';
      btnOpen.type = 'button';
      btnOpen.title = 'Open downloaded video';
      btnOpen.onclick = () => openMediaFn && openMediaFn(item.id);
      btnOpen.innerHTML = '<svg class="svg-icon" viewBox="0 0 24 24"><polygon points="5 3 19 12 5 21 5 3"/></svg><span>Open</span>';
      controlsEl.insertBefore(btnOpen, controlsEl.firstChild);
    }

    const thumbEl = document.getElementById(`thumb-${item.id}`);
    if (thumbEl) {
      thumbEl.classList.add('playable');
      if (!thumbEl.querySelector('.tile-thumb-play')) {
        const playOverlay = document.createElement('div');
        playOverlay.className = 'tile-thumb-play';
        playOverlay.innerHTML = '<svg class="svg-icon" viewBox="0 0 24 24"><polygon points="5 3 19 12 5 21 5 3"/></svg>';
        thumbEl.appendChild(playOverlay);
      }
    }
  }
}

export function listenToProgressEvents(onProvisionProgress) {
  Api.listen('download-progress', (progress) => {
    onDownloadProgress(progress, (id) => App.openMedia(id));
  });

  if (onProvisionProgress) {
    Api.listen('provision-progress', onProvisionProgress);
  }
}
