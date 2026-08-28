/**
 * Download queue management, card item DOM rendering, and tile interaction controllers.
 */
import { state } from './state.js';
import { getQualityLabel, getEstimatedSize } from './formats.js';
import { renderDropdownItems } from './dropdown.js';
import { showError } from './toast.js';

export function addQueueItem(item) {
  if (!state.queue.some((q) => q.id === item.id)) {
    state.queue.push(item);
  }
}

export function renderQueue() {
  const heroView = document.getElementById('heroView');
  const queueView = document.getElementById('queueView');
  const appFooter = document.getElementById('appFooter');
  const listEl = document.getElementById('queueList');

  const hasItems = state.queue.length > 0;

  Api.invoke('set_view_window_mode', { mode: hasItems ? 'queue' : 'hero' });

  if (heroView) heroView.style.display = hasItems ? 'none' : 'flex';
  if (queueView) queueView.style.display = hasItems ? 'flex' : 'none';
  if (appFooter) appFooter.style.display = hasItems ? 'flex' : 'none';

  if (!hasItems) {
    updateSummary();
    return;
  }

  if (listEl) {
    listEl.innerHTML = state.queue
      .map(
        (item) => `
      <article class="stream-tile ${item.status === 'downloading' ? 'active-download' : ''} ${item.status === 'error' ? 'tile-error' : ''}" id="tile-${item.id}">
        <div class="tile-main-row">
          <!-- Left Checkbox -->
          <label class="custom-checkbox">
            <input type="checkbox" ${item.checked ? 'checked' : ''} onchange="App.toggleTileCheck('${item.id}', this.checked)">
            <span class="checkbox-box">
              <svg class="svg-icon svg-stroke" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
            </span>
          </label>

          <!-- Video Thumbnail -->
          <div class="tile-thumb ${item.status === 'finished' ? 'playable' : ''}" id="thumb-${item.id}" onclick="App.onThumbnailClick('${item.id}')">
            <img src="${item.thumbnail}" alt="Thumbnail" onerror="this.src='https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=300&auto=format&fit=crop&q=60'">
            <span class="tile-duration-badge">${item.duration}</span>
            ${item.status === 'finished' ? '<div class="tile-thumb-play"><svg class="svg-icon" viewBox="0 0 24 24"><polygon points="5 3 19 12 5 21 5 3"/></svg></div>' : ''}
          </div>

          <!-- Video Meta -->
          <div class="tile-details">
            <h4 class="tile-title" title="${item.title}">${item.title}</h4>
            <div class="tile-meta">
              <span class="tile-channel">
                <svg class="svg-icon svg-stroke" style="width:11px; height:11px;" viewBox="0 0 24 24"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                <span>${item.channel}</span>
              </span>
              ${item.views ? `<span>•</span><span>${item.views}</span>` : ''}
              ${getEstimatedSize(item, item.selectedQuality) ? `<span>•</span><span class="tile-size" id="size-${item.id}">${getEstimatedSize(item, item.selectedQuality)}</span>` : ''}
            </div>
          </div>

          <!-- Right Controls -->
          <div class="tile-controls" id="controls-${item.id}">
            ${item.status === 'finished' ? `
              <button class="btn-tile-open" onclick="App.openMedia('${item.id}')" type="button" title="Open downloaded video">
                <svg class="svg-icon" viewBox="0 0 24 24"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                <span>Open</span>
              </button>
            ` : ''}
            <div class="glass-dropdown" id="dropdown-${item.id}">
              <button class="glass-dropdown-trigger" onclick="App.toggleDropdown('${item.id}', event)" type="button">
                <span>${getQualityLabel(item.selectedQuality)}</span>
                <svg class="svg-icon svg-stroke arrow-icon" viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9"/></svg>
              </button>
              <div class="glass-dropdown-menu">
                ${renderDropdownItems(item)}
              </div>
            </div>

            <button class="btn-tile-remove" onclick="App.removeTile('${item.id}')" title="Remove from queue">
              <svg class="svg-icon svg-stroke" style="width:13px; height:13px;" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
        </div>

        <!-- Individual Micro Progress Bar -->
        <div class="tile-progress-section">
          <div class="tile-progress-header">
            <div class="tile-progress-status" id="status-${item.id}">
              <span class="status-dot ${item.status}"></span>
              <span id="status-text-${item.id}">${getStatusLabel(item)}</span>
            </div>
            <div style="font-family: 'JetBrains Mono', monospace; font-size: 10.5px;" id="pct-${item.id}">
              ${item.status === 'error' ? 'Failed' : (item.status === 'finished' ? '100%' : (item.status === 'downloading' ? item.progress.toFixed(1) + '%' : (item.status === 'waiting' ? 'Waiting' : 'Ready')))}
            </div>
          </div>
          <div class="tile-progress-track">
            <div class="tile-progress-fill" id="fill-${item.id}" style="width: ${item.status === 'error' || item.status === 'finished' ? 100 : item.progress}%; ${item.status === 'error' ? 'background: var(--status-danger);' : (item.status === 'finished' ? 'background: var(--status-valid);' : '')}"></div>
          </div>
        </div>
      </article>
    `
      )
      .join('');
  }

  updateSummary();
}

export function getStatusLabel(item) {
  if (item.status === 'downloading') {
    let speedPart = item.speed
      ? `<svg class="svg-icon svg-stroke status-icon speed-icon" viewBox="0 0 24 24"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg><span>${item.speed}</span>`
      : '<span>Downloading...</span>';
    let etaPart = item.eta ? `<span>ETA: ${item.eta}</span>` : '';
    let parts = [speedPart, etaPart].filter(Boolean);
    return parts.join(' <span style="color: var(--glass-border); margin: 0 4px;">•</span> ');
  } else if (item.status === 'merging') {
    return '<svg class="svg-icon svg-stroke status-icon merging-icon" viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg><span>Merging streams...</span>';
  } else if (item.status === 'extracting_audio') {
    return '<svg class="svg-icon svg-stroke status-icon" style="color:var(--accent-violet);" viewBox="0 0 24 24"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg><span>Extracting audio...</span>';
  } else if (item.status === 'finished') {
    return '<svg class="svg-icon svg-stroke status-icon" style="color:var(--status-valid);" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg><span>Completed</span>';
  } else if (item.status === 'error') {
    return `<button class="btn-tile-status-error" onclick="App.showTileError('${item.id}', event)" type="button" title="Click to view error diagnostic log">
      <svg class="svg-icon svg-stroke" style="width:11px; height:11px;" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
      <span>Failed (View Log)</span>
    </button>`;
  } else if (item.status === 'paused') {
    return '<svg class="svg-icon svg-stroke status-icon" style="color:var(--status-warning);" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="10" y1="15" x2="10" y2="9"/><line x1="14" y1="15" x2="14" y2="9"/></svg><span>Paused</span>';
  } else if (item.status === 'waiting') {
    return '<span style="color: var(--text-dim);">Queued (Waiting)</span>';
  }
  return '<span>Queued (Ready)</span>';
}

export function toggleTileCheck(id, checked) {
  const item = state.queue.find((q) => q.id === id);
  if (item) {
    item.checked = checked;
  }
  updateSummary();
}

export function onTileQualityChange(id, value) {
  const item = state.queue.find((q) => q.id === id);
  if (item) {
    item.selectedQuality = value;
  }
}

export function removeTile(id) {
  state.queue = state.queue.filter((q) => q.id !== id);
  renderQueue();
}

export function selectAll(checked) {
  state.queue.forEach((item) => {
    item.checked = checked;
  });
  renderQueue();
}

export function toggleSelectAll() {
  const allChecked = state.queue.length > 0 && state.queue.every((item) => item.checked);
  selectAll(!allChecked);
}

export function clearQueue() {
  if (state.isDownloading) {
    showError({
      title: 'Queue Action Restricted',
      message: 'Cannot clear queue while a download is actively in progress.',
      details: 'Active downloads must finish or complete before resetting the batch queue.',
    });
    return;
  }
  state.queue = [];
  renderQueue();
}

export function updateSummary() {
  const total = state.queue.length;
  const checked = state.queue.filter((q) => q.checked).length;
  const activeChecked = state.queue.filter((q) => q.checked && q.status !== 'finished').length;

  const badge = document.getElementById('queueBadge');
  if (badge) badge.textContent = `${total} Item${total === 1 ? '' : 's'}`;

  const btnToggleSelect = document.getElementById('btnToggleSelectAll');
  if (btnToggleSelect) {
    const allChecked = total > 0 && checked === total;
    btnToggleSelect.innerHTML = `<span>${allChecked ? 'Deselect All' : 'Select All'}</span>`;
  }

  const summary = document.getElementById('queueSummary');
  if (summary) summary.textContent = `${checked} of ${total} selected`;

  const btnDownload = document.getElementById('btnDownloadQueue');
  const btnText = document.getElementById('btnDownloadQueueText');
  const btnIcon = document.getElementById('btnDownloadQueueIcon');
  const btnCancel = document.getElementById('btnCancelQueue');

  if (btnDownload && btnText) {
    if (state.isDownloading) {
      btnDownload.disabled = false;
      btnDownload.className = 'btn-download-primary btn-pause-active';
      btnDownload.title = 'Pause active downloads (preserves progress)';
      btnText.textContent = 'Pause Download';
      if (btnIcon) {
        btnIcon.innerHTML = '<svg class="svg-icon svg-stroke" style="width:13px; height:13px;" viewBox="0 0 24 24"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>';
      }
      if (btnCancel) btnCancel.style.display = 'inline-flex';
    } else if (state.isPaused) {
      btnDownload.disabled = activeChecked === 0;
      btnDownload.className = 'btn-download-primary btn-resume-active';
      btnDownload.title = 'Resume paused download queue';
      btnText.textContent = 'Resume Download';
      if (btnIcon) {
        btnIcon.innerHTML = '<svg class="svg-icon" viewBox="0 0 24 24"><polygon points="5 3 19 12 5 21 5 3"/></svg>';
      }
      if (btnCancel) btnCancel.style.display = 'inline-flex';
    } else {
      btnDownload.disabled = activeChecked === 0;
      btnDownload.className = 'btn-download-primary';
      btnDownload.title = activeChecked > 0 ? `Download ${activeChecked} selected stream${activeChecked === 1 ? '' : 's'}` : 'No uncompleted items selected';
      btnText.textContent = `Download (${activeChecked})`;
      if (btnIcon) {
        btnIcon.innerHTML = '<svg class="svg-icon" viewBox="0 0 24 24"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg>';
      }
      if (btnCancel) btnCancel.style.display = 'none';
    }
  }
}

export function showTileError(itemId, event) {
  if (event) event.stopPropagation();
  const item = state.queue.find((q) => q.id === itemId);
  if (!item) return;

  const details = item.errorDetails || 'Download failed for this stream. Inspect logs for details.';
  showError({
    title: 'Download Failed',
    message: `Failed downloading "${item.title}".`,
    details: details,
  });
}

export function onThumbnailClick(id, openMediaFn) {
  const item = state.queue.find((q) => q.id === id);
  if (item && item.status === 'finished' && openMediaFn) {
    openMediaFn(id);
  }
}
