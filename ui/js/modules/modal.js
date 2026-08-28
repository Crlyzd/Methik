/**
 * Modal dialog manager and backdrop click event listeners.
 */

let onProvisionConfirmCancelCallback = null;

export function setProvisionConfirmResolver(fn) {
  onProvisionConfirmCancelCallback = fn;
}

export function openModal(id, onOpenSettings = null) {
  const el = document.getElementById(id);
  if (el) el.classList.add('active');
  if (id === 'settingsModal' && onOpenSettings) {
    onOpenSettings();
  }
}

export function closeModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.remove('active');
  if (id === 'provisionConfirmModal' && onProvisionConfirmCancelCallback) {
    onProvisionConfirmCancelCallback();
  }
}

export function setupModalListeners(onPromptCancelProvisioning) {
  document.querySelectorAll('.modal-overlay').forEach((overlay) => {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        if (overlay.id === 'provisionModal') {
          if (onPromptCancelProvisioning) onPromptCancelProvisioning();
        } else {
          closeModal(overlay.id);
        }
      }
    });
  });
}
