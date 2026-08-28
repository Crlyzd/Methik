/**
 * Settings persistence, Theme switcher, Cookie source management, and Output Directory.
 */
import { state } from './state.js';
import { closeAllDropdowns } from './dropdown.js';
import { openModal, closeModal } from './modal.js';

export function setTheme(mode, persist = true) {
  state.theme = mode === 'light' ? 'light' : 'dark';
  if (state.theme === 'light') {
    document.documentElement.setAttribute('data-theme', 'light');
  } else {
    document.documentElement.removeAttribute('data-theme');
  }

  const cardDark = document.getElementById('themeCardDark');
  const cardLight = document.getElementById('themeCardLight');
  if (cardDark && cardLight) {
    cardDark.classList.toggle('active', state.theme === 'dark');
    cardLight.classList.toggle('active', state.theme === 'light');
  }

  try {
    localStorage.setItem('methik_theme', state.theme);
  } catch (_) {}

  if (persist) {
    saveCurrentSettings();
  }
}

export async function loadUserSettings() {
  try {
    const cachedTheme = localStorage.getItem('methik_theme');
    if (cachedTheme) {
      setTheme(cachedTheme, false);
    }
  } catch (_) {}

  try {
    const settings = await Api.invoke('get_user_settings');
    if (settings) {
      if (settings.download_dir) {
        state.downloadDir = settings.download_dir;
      }
      if (typeof settings.dark_mode === 'boolean') {
        setTheme(settings.dark_mode ? 'dark' : 'light', false);
      }
      if (settings.cookie_source) {
        let cookieVal = 'None';
        let customPath = '';
        if (typeof settings.cookie_source === 'object' && settings.cookie_source && settings.cookie_source.CustomFile) {
          cookieVal = 'CustomFile';
          customPath = settings.cookie_source.CustomFile;
        } else if (typeof settings.cookie_source === 'string') {
          cookieVal = settings.cookie_source;
        }

        state.cookieSource = cookieVal;
        state.customCookiePath = customPath;

        const labelEl = document.getElementById('selectedCookieLabel');
        if (labelEl) {
          if (cookieVal === 'CustomFile') {
            labelEl.textContent = 'Custom cookies.txt...';
          } else {
            labelEl.textContent = cookieVal === 'None' ? 'None (Default)' : cookieVal;
          }
        }

        const rowEl = document.getElementById('customCookieFileRow');
        if (rowEl) {
          rowEl.style.display = cookieVal === 'CustomFile' ? 'flex' : 'none';
        }
        updateCookieFileDisplay();

        const menuEl = document.getElementById('cookieMenu');
        if (menuEl) {
          menuEl.querySelectorAll('.glass-dropdown-item').forEach((item) => {
            const text = item.textContent.trim();
            if (cookieVal === 'CustomFile') {
              item.classList.toggle('active', text.includes('Custom'));
            } else {
              item.classList.toggle('active', text.includes(cookieVal));
            }
          });
        }
      }
    }
  } catch (e) {
    console.warn('Failed to load user settings, defaulting to Desktop:', e);
    state.downloadDir = 'Desktop';
  }
  updateDownloadDirDisplay();
}

export async function saveCurrentSettings() {
  try {
    let cookieSourceVal = null;
    if (state.cookieSource === 'CustomFile') {
      if (state.customCookiePath) {
        cookieSourceVal = { CustomFile: state.customCookiePath };
      }
    } else if (state.cookieSource && state.cookieSource !== 'None') {
      cookieSourceVal = state.cookieSource;
    }

    await Api.invoke('save_user_settings_command', {
      settings: {
        download_dir: state.downloadDir,
        default_quality: 'FHD1080',
        audio_format: 'Mp3',
        dark_mode: state.theme === 'dark',
        cookie_source: cookieSourceVal,
      },
    });
  } catch (e) {
    console.warn('Failed to persist user settings:', e);
  }
}

export function updateDownloadDirDisplay() {
  const display = document.getElementById('savePathDisplay');
  const heroDisplay = document.getElementById('heroSavePath');

  const pathText = state.downloadDir || 'Desktop';

  if (display) {
    display.textContent = pathText;
    display.title = pathText;
  }
  if (heroDisplay) {
    heroDisplay.textContent = pathText;
    heroDisplay.title = pathText;
  }
}

export async function browseDownloadFolder() {
  try {
    const chosen = await Api.invoke('select_download_folder');
    if (chosen && typeof chosen === 'string') {
      state.downloadDir = chosen;
      updateDownloadDirDisplay();
      await saveCurrentSettings();
    }
  } catch (e) {
    console.error('Failed to select download folder:', e);
  }
}

export async function openDownloadFolder() {
  try {
    await Api.invoke('open_download_folder', { path: state.downloadDir || null });
  } catch (e) {
    console.error('Failed to open download folder:', e);
  }
}

export function toggleCookieDropdown(event) {
  if (event) event.stopPropagation();
  const dropdown = document.getElementById('cookieDropdown');
  if (!dropdown) return;
  const isOpen = dropdown.classList.contains('open');
  closeAllDropdowns();
  if (!isOpen) {
    dropdown.classList.add('open');
  }
}

export function selectCookieSource(value, label) {
  state.cookieSource = value;
  const labelEl = document.getElementById('selectedCookieLabel');
  if (labelEl) labelEl.textContent = label || value;

  const menuEl = document.getElementById('cookieMenu');
  if (menuEl) {
    menuEl.querySelectorAll('.glass-dropdown-item').forEach((item) => {
      const text = item.textContent.trim();
      item.classList.toggle('active', text.includes(label) || text.includes(value));
    });
  }

  const rowEl = document.getElementById('customCookieFileRow');
  if (rowEl) {
    rowEl.style.display = value === 'CustomFile' ? 'flex' : 'none';
  }

  closeAllDropdowns();

  if (value === 'CustomFile' && !state.customCookiePath) {
    browseCookieFile();
  } else {
    saveCurrentSettings();
  }
}

export async function browseCookieFile() {
  try {
    const chosen = await Api.invoke('select_cookie_file');
    if (chosen && typeof chosen === 'string') {
      state.customCookiePath = chosen;
      updateCookieFileDisplay();
      await saveCurrentSettings();
    }
  } catch (e) {
    console.error('Failed to select cookie file:', e);
  }
}

export function updateCookieFileDisplay() {
  const pathEl = document.getElementById('customCookiePathText');
  if (pathEl) {
    const path = state.customCookiePath || '';
    pathEl.textContent = path ? path : 'No cookies.txt selected';
    pathEl.title = path ? path : 'No file selected';
  }
}

export function openCookieSettings() {
  closeModal('errorModal');
  openModal('settingsModal');
  setTimeout(() => {
    const el = document.getElementById('cookieDropdown');
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, 200);
}
