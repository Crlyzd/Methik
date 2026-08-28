/**
 * Toast notifications, smart error dialogs, and log copying.
 */
import { openModal, closeModal } from './modal.js';

export function showToast(message, type = 'info', duration = 3000) {
  let container = document.getElementById('toastContainer');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toastContainer';
    container.className = 'toast-container';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;

  const iconMap = {
    success: '<svg class="svg-icon svg-stroke" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>',
    warning: '<svg class="svg-icon svg-stroke" viewBox="0 0 24 24"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
    error: '<svg class="svg-icon svg-stroke" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>',
    info: '<svg class="svg-icon svg-stroke" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>',
  };

  toast.innerHTML = `${iconMap[type] || iconMap.info}<span>${message}</span>`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

export function showError({ title, message, details }, onOpenSettings = null) {
  const modalTitle = document.getElementById('errorModalTitle');
  const modalSubtitle = document.getElementById('errorModalSubtitle');
  const modalLog = document.getElementById('errorModalLogText');
  const mitigationCard = document.getElementById('errorMitigationCard');
  const mitigationTitle = document.getElementById('mitigationTitle');
  const mitigationText = document.getElementById('mitigationText');
  const btnMitigationLabel = document.getElementById('btnMitigationLabel');

  if (modalTitle) modalTitle.textContent = title || 'Operation Failed';
  if (modalSubtitle) modalSubtitle.textContent = message || 'An error occurred while processing your request';

  const detailsStr = details
    ? (typeof details === 'string' ? details : JSON.stringify(details, null, 2))
    : 'No detailed diagnostic log available.';
  if (modalLog) modalLog.textContent = detailsStr;

  // Smart context-aware diagnostic resolution
  let mitigation = null;
  if (/could not copy chrome cookie database|database is locked/i.test(detailsStr)) {
    mitigation = {
      title: 'Chrome Cookie Database Locked',
      text: 'Google Chrome is locking its cookie database while running. Close Chrome, switch to Firefox in Preferences, or select "None" for public videos.',
      button: 'Open Preferences',
      action: () => onOpenSettings && onOpenSettings(),
    };
  } else if (/the page needs to be reloaded/i.test(detailsStr)) {
    mitigation = {
      title: 'Invalid or Stale Session Cookies',
      text: 'YouTube rejected the active session cookies. If downloading a public video, switch Cookie Source to "None" in Preferences, or export a fresh cookies.txt file.',
      button: 'Open Cookie Preferences',
      action: () => onOpenSettings && onOpenSettings(),
    };
  } else if (/HTTP Error 403: Forbidden|403: Forbidden/i.test(detailsStr)) {
    mitigation = {
      title: 'Stream Access Forbidden (403)',
      text: 'YouTube signature challenge or CDN rejected the stream. Ensure Deno is up to date in Preferences, or try setting Cookie Source to "None".',
      button: 'Open Engine Preferences',
      action: () => onOpenSettings && onOpenSettings(),
    };
  } else if (/sign in to confirm you'?re not a bot|--cookies|cookie/i.test(detailsStr)) {
    mitigation = {
      title: 'Bot Verification Required',
      text: 'Platform requires session verification to bypass bot detection. Select your browser or cookies.txt in Preferences.',
      button: 'Configure Browser Cookies',
      action: () => onOpenSettings && onOpenSettings(),
    };
  }

  if (mitigationCard) {
    if (mitigation) {
      mitigationCard.style.display = 'flex';
      if (mitigationTitle) mitigationTitle.textContent = mitigation.title;
      if (mitigationText) mitigationText.textContent = mitigation.text;
      if (btnMitigationLabel) btnMitigationLabel.textContent = mitigation.button;
      const btn = document.getElementById('btnMitigationAction');
      if (btn) {
        btn.onclick = mitigation.action;
      }
    } else {
      mitigationCard.style.display = 'none';
    }
  }

  openModal('errorModal');
}

export function copyErrorLog() {
  const logEl = document.getElementById('errorModalLogText');
  const btn = document.getElementById('btnCopyErrorLog');
  const btnText = document.getElementById('btnCopyLogText');
  if (!logEl) return;

  const textToCopy = logEl.textContent || '';
  navigator.clipboard.writeText(textToCopy).then(() => {
    if (btn && btnText) {
      btn.classList.add('copied');
      btnText.textContent = 'Copied!';
      setTimeout(() => {
        btn.classList.remove('copied');
        btnText.textContent = 'Copy Log';
      }, 2000);
    }
  }).catch((err) => {
    console.error('Failed to copy error log:', err);
  });
}
