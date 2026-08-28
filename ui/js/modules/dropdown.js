/**
 * Custom Frosted Glass Dropdown Engine & Batch Quality Selectors.
 */
import { state } from './state.js';
import { getQualityLabel, getEstimatedSize } from './formats.js';

export function toggleDropdown(id, event) {
  if (event) event.stopPropagation();
  const dropdown = document.getElementById(`dropdown-${id}`);
  const isOpen = dropdown && dropdown.classList.contains('open');

  closeAllDropdowns();

  if (!isOpen && dropdown) {
    dropdown.classList.add('open');
  }
}

export function closeAllDropdowns() {
  document.querySelectorAll('.glass-dropdown.open, .format-dropdown.open').forEach((el) => {
    el.classList.remove('open');
  });
}

export function toggleGlobalDropdown(event) {
  if (event) event.stopPropagation();
  const dropdown = document.getElementById('globalFormatDropdown');
  const isOpen = dropdown && dropdown.classList.contains('open');

  closeAllDropdowns();

  if (!isOpen && dropdown) {
    renderGlobalDropdown();
    dropdown.classList.add('open');
  }
}

export function renderGlobalDropdown() {
  const menuEl = document.getElementById('globalFormatMenu');
  if (!menuEl) return;

  const videoQualities = ['4k', '2k', '1080p', '720p', '480p'];
  const audioQualities = ['audio_mp3', 'audio_flac'];
  const current = state.globalQuality || '1080p';

  let html = '<div class="dropdown-header-label" style="padding: 4px 8px; font-size: 9.5px; color: var(--text-dim); text-transform: uppercase; letter-spacing: 0.5px; font-weight: 600;">Apply to all items</div>';

  videoQualities.forEach((q) => {
    const active = current === q ? 'active' : '';
    const checkIcon = active ? '<svg class="svg-icon svg-stroke item-check" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>' : '';
    html += `
      <div class="glass-dropdown-item ${active}" onclick="App.applyQualityToAll('${q}', event)">
        <div class="dropdown-item-content">
          <span class="dropdown-item-label">${getQualityLabel(q)}</span>
        </div>
        ${checkIcon}
      </div>
    `;
  });

  html += '<div class="glass-dropdown-divider"></div>';

  audioQualities.forEach((q) => {
    const active = current === q ? 'active' : '';
    const checkIcon = active ? '<svg class="svg-icon svg-stroke item-check" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>' : '';
    html += `
      <div class="glass-dropdown-item ${active}" onclick="App.applyQualityToAll('${q}', event)">
        <div class="dropdown-item-content">
          <span class="dropdown-item-label">${getQualityLabel(q)}</span>
        </div>
        ${checkIcon}
      </div>
    `;
  });

  menuEl.innerHTML = html;
}

export function renderDropdownItems(item) {
  const qualities = item.availableQualities || ['4k', '2k', '1080p', '720p', '480p', 'audio_mp3', 'audio_flac'];
  const videoQualities = qualities.filter((q) => !q.startsWith('audio_'));
  const audioQualities = qualities.filter((q) => q.startsWith('audio_'));

  let html = '';
  videoQualities.forEach((q) => {
    const active = item.selectedQuality === q ? 'active' : '';
    const sizeStr = getEstimatedSize(item, q) || '';
    const checkIcon = active ? '<svg class="svg-icon svg-stroke item-check" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>' : '';
    html += `
      <div class="glass-dropdown-item ${active}" onclick="App.selectQuality('${item.id}', '${q}', event)">
        <div class="dropdown-item-content">
          <span class="dropdown-item-label">${getQualityLabel(q)}</span>
          <span class="dropdown-item-size">${sizeStr}</span>
        </div>
        ${checkIcon}
      </div>
    `;
  });

  if (videoQualities.length > 0 && audioQualities.length > 0) {
    html += '<div class="glass-dropdown-divider"></div>';
  }

  audioQualities.forEach((q) => {
    const active = item.selectedQuality === q ? 'active' : '';
    const sizeStr = getEstimatedSize(item, q) || '';
    const checkIcon = active ? '<svg class="svg-icon svg-stroke item-check" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>' : '';
    html += `
      <div class="glass-dropdown-item ${active}" onclick="App.selectQuality('${item.id}', '${q}', event)">
        <div class="dropdown-item-content">
          <span class="dropdown-item-label">${getQualityLabel(q)}</span>
          <span class="dropdown-item-size">${sizeStr}</span>
        </div>
        ${checkIcon}
      </div>
    `;
  });

  return html;
}

export function applyQualityToAll(qualityKey, event, onRenderQueue) {
  if (event) event.stopPropagation();
  if (!qualityKey) return;
  state.globalQuality = qualityKey;

  state.queue.forEach((item) => {
    item.selectedQuality = qualityKey;
  });

  const globalLabel = document.getElementById('globalFormatLabel');
  if (globalLabel) {
    globalLabel.textContent = getQualityLabel(qualityKey);
  }

  if (onRenderQueue) onRenderQueue();
  closeAllDropdowns();
}

export function selectQuality(id, value, event) {
  if (event) event.stopPropagation();
  const item = state.queue.find((q) => q.id === id);
  if (item) {
    item.selectedQuality = value;

    const triggerLabel = document.querySelector(`#dropdown-${id} .glass-dropdown-trigger span`);
    if (triggerLabel) triggerLabel.textContent = getQualityLabel(value);

    const sizeEl = document.getElementById(`size-${id}`);
    if (sizeEl) sizeEl.textContent = getEstimatedSize(item, value) || '';

    const menuEl = document.querySelector(`#dropdown-${id} .glass-dropdown-menu`);
    if (menuEl) menuEl.innerHTML = renderDropdownItems(item);
  }
  closeAllDropdowns();
}
