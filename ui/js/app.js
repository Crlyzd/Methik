/**
 * Methik v0.1 - Application Controller
 * Handles Clean Hero Front Page, Dynamic Queue View, Per-Tile Controls, and Real-Time Progress Bars
 */
const App = {
  state: {
    queue: [],
    isPinned: false,
    isDownloading: false,
    downloadDir: 'Desktop',
    cookieSource: 'None',
    dependencies: null,
    theme: 'dark',
    initialized: false,
    appInfo: null,
    updateInfo: null,
    isUpdating: false,
  },

  async init() {
    if (this.state.initialized) return;
    this.state.initialized = true;

    this.setupEventListeners();
    await this.loadAppInfo();
    await this.loadUserSettings();
    await this.checkDependencies();
    this.listenToProgressEvents();
    this.renderQueue();
  },

  async loadAppInfo() {
    try {
      const info = await Api.getAppInfo();
      this.state.appInfo = info;
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
  },

  setupEventListeners() {
    // Suppress default WebView2 browser context menu ONLY in production/release mode
    // (Preserves right-click 'Inspect' in dev/debug mode)
    Api.isDevMode().then((isDev) => {
      if (!isDev) {
        window.addEventListener('contextmenu', (e) => {
          e.preventDefault();
        });
      }
    });

    // Global Error & Promise Rejection Handlers (Log to console & persistent app.log)
    window.addEventListener('error', (event) => {
      const msg = event.error ? (event.error.stack || event.error.message) : event.message;
      console.error('[Methik Error Handler]', msg);
      Api.log('ERROR', 'Frontend', msg || 'Unknown window error');
    });

    window.addEventListener('unhandledrejection', (event) => {
      const msg = event.reason ? (event.reason.stack || event.reason.message || String(event.reason)) : 'Unknown rejection';
      console.error('[Methik Unhandled Rejection]', msg);
      Api.log('ERROR', 'Frontend', `Unhandled promise rejection: ${msg}`);
    });

    // Hero URL input Enter key
    const heroInput = document.getElementById('heroUrlInput');
    if (heroInput) {
      heroInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') this.analyzeFromHero();
      });
    }

    // Queue URL input Enter key
    const queueInput = document.getElementById('queueUrlInput');
    if (queueInput) {
      queueInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') this.analyzeFromQueue();
      });
    }

    // Close dropdowns on outside click
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.glass-dropdown')) {
        this.closeAllDropdowns();
      }
    });

    // Click outside modal box on modal overlay backdrop to close
    document.querySelectorAll('.modal-overlay').forEach((overlay) => {
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
          if (overlay.id === 'provisionModal') {
            App.promptCancelProvisioning();
          } else {
            App.closeModal(overlay.id);
          }
        }
      });
    });
  },

  toggleCookieDropdown(event) {
    if (event) event.stopPropagation();
    const dropdown = document.getElementById('cookieDropdown');
    if (!dropdown) return;
    const isOpen = dropdown.classList.contains('open');
    this.closeAllDropdowns();
    if (!isOpen) {
      dropdown.classList.add('open');
    }
  },

  selectCookieSource(value, label) {
    this.state.cookieSource = value;
    const labelEl = document.getElementById('selectedCookieLabel');
    if (labelEl) labelEl.textContent = label || value;

    // Update active state in menu
    const menuEl = document.getElementById('cookieMenu');
    if (menuEl) {
      menuEl.querySelectorAll('.glass-dropdown-item').forEach((item) => {
        const text = item.textContent.trim();
        item.classList.toggle('active', text.includes(label) || text.includes(value));
      });
    }

    this.closeAllDropdowns();
    this.saveCurrentSettings();
  },

  openCookieSettings() {
    this.closeModal('errorModal');
    this.openModal('settingsModal');
    setTimeout(() => {
      const el = document.getElementById('cookieDropdown');
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 200);
  },

  async saveCurrentSettings() {
    try {
      await Api.invoke('save_user_settings_command', {
        settings: {
          download_dir: this.state.downloadDir,
          default_quality: 'FHD1080',
          audio_format: 'Mp3',
          dark_mode: this.state.theme === 'dark',
          cookie_source: this.state.cookieSource === 'None' ? null : this.state.cookieSource,
        },
      });
    } catch (e) {
      console.warn('Failed to persist user settings:', e);
    }
  },

  getQualityLabel(val) {
    switch (val) {
      case '4k': return '4K UHD (MP4)';
      case '2k': return '2K QHD (MP4)';
      case '1080p': return '1080p FHD (MP4)';
      case '720p': return '720p HD (MP4)';
      case '480p': return '480p SD (MP4)';
      case 'audio_mp3': return 'Audio (MP3 320k)';
      case 'audio_flac': return 'Audio (FLAC Lossless)';
      default: return '1080p FHD (MP4)';
    }
  },

  extractAvailableQualities(formats) {
    let qualities = [];
    if (formats && Array.isArray(formats) && formats.length > 0) {
      const heights = new Set();
      formats.forEach((f) => {
        if (f.resolution) {
          const match = f.resolution.match(/(\d+)x(\d+)/);
          if (match) {
            heights.add(parseInt(match[2], 10));
          }
        }
      });

      if (Array.from(heights).some((h) => h >= 2160)) qualities.push('4k');
      if (Array.from(heights).some((h) => h >= 1440 && h < 2160)) qualities.push('2k');
      if (Array.from(heights).some((h) => h >= 1080 && h < 1440)) qualities.push('1080p');
      if (Array.from(heights).some((h) => h >= 720 && h < 1080)) qualities.push('720p');
      if (Array.from(heights).some((h) => h >= 480 && h < 720)) qualities.push('480p');
    }

    if (qualities.length === 0) {
      qualities = ['1080p', '720p', '480p'];
    }

    qualities.push('audio_mp3', 'audio_flac');
    return qualities;
  },

  renderDropdownItems(item) {
    const qualities = item.availableQualities || ['4k', '2k', '1080p', '720p', '480p', 'audio_mp3', 'audio_flac'];
    const videoQualities = qualities.filter((q) => !q.startsWith('audio_'));
    const audioQualities = qualities.filter((q) => q.startsWith('audio_'));

    let html = '';
    videoQualities.forEach((q) => {
      const active = item.selectedQuality === q ? 'active' : '';
      const checkIcon = active ? '<svg class="svg-icon svg-stroke item-check" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>' : '';
      html += `
        <div class="glass-dropdown-item ${active}" onclick="App.selectQuality('${item.id}', '${q}', event)">
          <span>${this.getQualityLabel(q)}</span>
          ${checkIcon}
        </div>
      `;
    });

    if (videoQualities.length > 0 && audioQualities.length > 0) {
      html += '<div class="glass-dropdown-divider"></div>';
    }

    audioQualities.forEach((q) => {
      const active = item.selectedQuality === q ? 'active' : '';
      const checkIcon = active ? '<svg class="svg-icon svg-stroke item-check" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>' : '';
      html += `
        <div class="glass-dropdown-item ${active}" onclick="App.selectQuality('${item.id}', '${q}', event)">
          <span>${this.getQualityLabel(q)}</span>
          ${checkIcon}
        </div>
      `;
    });

    return html;
  },

  toggleDropdown(id, event) {
    if (event) event.stopPropagation();
    const dropdown = document.getElementById(`dropdown-${id}`);
    const isOpen = dropdown && dropdown.classList.contains('open');

    this.closeAllDropdowns();

    if (!isOpen && dropdown) {
      dropdown.classList.add('open');
    }
  },

  closeAllDropdowns() {
    document.querySelectorAll('.glass-dropdown.open, .format-dropdown.open').forEach((el) => {
      el.classList.remove('open');
    });
  },

  selectQuality(id, value, event) {
    if (event) event.stopPropagation();
    const item = this.state.queue.find((q) => q.id === id);
    if (item) {
      item.selectedQuality = value;
    }
    this.closeAllDropdowns();
    this.renderQueue();
  },

  setTheme(mode, persist = true) {
    this.state.theme = mode === 'light' ? 'light' : 'dark';
    if (this.state.theme === 'light') {
      document.documentElement.setAttribute('data-theme', 'light');
    } else {
      document.documentElement.removeAttribute('data-theme');
    }

    const cardDark = document.getElementById('themeCardDark');
    const cardLight = document.getElementById('themeCardLight');
    if (cardDark && cardLight) {
      cardDark.classList.toggle('active', this.state.theme === 'dark');
      cardLight.classList.toggle('active', this.state.theme === 'light');
    }

    try {
      localStorage.setItem('methik_theme', this.state.theme);
    } catch (_) {}

    if (persist) {
      this.saveCurrentSettings();
    }
  },

  async loadUserSettings() {
    // Load local storage cached theme first for instant render
    try {
      const cachedTheme = localStorage.getItem('methik_theme');
      if (cachedTheme) {
        this.setTheme(cachedTheme, false);
      }
    } catch (_) {}

    try {
      const settings = await Api.invoke('get_user_settings');
      if (settings) {
        if (settings.download_dir) {
          this.state.downloadDir = settings.download_dir;
        }
        if (typeof settings.dark_mode === 'boolean') {
          this.setTheme(settings.dark_mode ? 'dark' : 'light', false);
        }
        if (settings.cookie_source) {
          const cookieVal = typeof settings.cookie_source === 'string' ? settings.cookie_source : 'None';
          this.state.cookieSource = cookieVal;
          const labelEl = document.getElementById('selectedCookieLabel');
          if (labelEl) {
            labelEl.textContent = cookieVal === 'None' ? 'None (Default)' : cookieVal;
          }
          const menuEl = document.getElementById('cookieMenu');
          if (menuEl) {
            menuEl.querySelectorAll('.glass-dropdown-item').forEach((item) => {
              const text = item.textContent.trim();
              item.classList.toggle('active', text.includes(cookieVal));
            });
          }
        }
      }
    } catch (e) {
      console.warn('Failed to load user settings, defaulting to Desktop:', e);
      this.state.downloadDir = 'Desktop';
    }
    this.updateDownloadDirDisplay();
  },

  updateDownloadDirDisplay() {
    const display = document.getElementById('savePathDisplay');
    const heroDisplay = document.getElementById('heroSavePath');

    const pathText = this.state.downloadDir || 'Desktop';

    if (display) {
      display.textContent = pathText;
      display.title = pathText;
    }
    if (heroDisplay) {
      heroDisplay.textContent = pathText;
      heroDisplay.title = pathText;
    }
  },

  async browseDownloadFolder() {
    try {
      const chosen = await Api.invoke('select_download_folder');
      if (chosen && typeof chosen === 'string') {
        this.state.downloadDir = chosen;
        this.updateDownloadDirDisplay();

        // Persist preference to AppData config
        await Api.invoke('save_user_settings_command', {
          settings: {
            download_dir: this.state.downloadDir,
            default_quality: 'FHD1080',
            audio_format: 'Mp3',
            dark_mode: this.state.theme === 'dark',
          },
        });
      }
    } catch (e) {
      console.error('Failed to select download folder:', e);
    }
  },

  async pasteHeroLink() {
    try {
      const text = await Api.readClipboard();
      if (text) {
        const input = document.getElementById('heroUrlInput');
        if (input) input.value = text.trim();
      }
    } catch (_) {}
  },

  async pasteQueueLink() {
    try {
      const text = await Api.readClipboard();
      if (text) {
        const input = document.getElementById('queueUrlInput');
        if (input) input.value = text.trim();
      }
    } catch (_) {}
  },

  async analyzeFromHero() {
    const input = document.getElementById('heroUrlInput');
    const btn = document.getElementById('btnHeroAnalyze');
    const btnText = document.getElementById('btnHeroAnalyzeText');
    const url = input ? input.value.trim() : '';
    if (!url) return;

    await this.executeStreamAnalysis(url, input, btn, btnText, 'Analyze Stream');
  },

  async analyzeFromQueue() {
    const input = document.getElementById('queueUrlInput');
    const btn = document.getElementById('btnQueueAnalyze');
    const btnText = document.getElementById('btnQueueAnalyzeText');
    const url = input ? input.value.trim() : '';
    if (!url) return;

    await this.executeStreamAnalysis(url, input, btn, btnText, 'Add Stream');
  },

  async executeStreamAnalysis(url, inputEl, btnEl, btnTextEl, defaultBtnText) {
    const ready = await this.ensureDependenciesReady();
    if (!ready) return;

    if (btnEl) btnEl.disabled = true;
    if (btnTextEl) btnTextEl.textContent = 'Inspecting...';

    try {
      const isPlaylist = url.includes('list=') || url.includes('/playlist');

      if (isPlaylist) {
        const playlist = await Api.invoke('get_playlist_info', { url });
        if (playlist && playlist.entries && playlist.entries.length > 0) {
          playlist.entries.forEach((entry) => {
            this.addQueueItem({
              id: 'pl_' + (entry.id || Math.random().toString(36).substring(7)),
              url: entry.url || url,
              title: entry.title || 'Playlist Track',
              thumbnail: entry.thumbnail_url || 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=300&auto=format&fit=crop&q=60',
              duration: entry.formatted_duration || '--:--',
              channel: playlist.title || 'Playlist Item',
              views: 'Playlist entry',
              selectedQuality: '1080p',
              checked: true,
              status: 'ready',
              progress: 0,
              speed: null,
              eta: null,
            });
          });
        }
      } else {
        const meta = await Api.invoke('get_video_info', { url });
        if (meta) {
          const availableQualities = this.extractAvailableQualities(meta.formats);
          const defaultQuality = availableQualities.includes('1080p') ? '1080p' : (availableQualities.find(q => !q.startsWith('audio_')) || '1080p');
          this.addQueueItem({
            id: 'vid_' + (meta.id || Math.random().toString(36).substring(7)),
            url: meta.webpage_url || url,
            title: meta.title || 'YouTube Video',
            thumbnail: meta.thumbnail_url || 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=300&auto=format&fit=crop&q=60',
            duration: meta.formatted_duration || '--:--',
            channel: meta.channel || 'YouTube',
            views: meta.view_count ? this.formatViews(meta.view_count) : '',
            availableQualities: availableQualities,
            selectedQuality: defaultQuality,
            checked: true,
            status: 'ready',
            progress: 0,
            speed: null,
            eta: null,
          });
        }
      }

      if (inputEl) inputEl.value = '';
    } catch (err) {
      console.error('Failed to analyze stream:', err);
      this.showError({
        title: 'Stream Analysis Failed',
        message: 'Unable to query metadata for the provided URL.',
        details: typeof err === 'string' ? err : (err && err.message ? err.message : JSON.stringify(err, null, 2)),
      });
    } finally {
      if (btnEl) btnEl.disabled = false;
      if (btnTextEl) btnTextEl.textContent = defaultBtnText;
      this.renderQueue();
    }
  },

  addQueueItem(item) {
    if (!this.state.queue.some((q) => q.id === item.id)) {
      this.state.queue.push(item);
    }
  },

  renderQueue() {
    const heroView = document.getElementById('heroView');
    const queueView = document.getElementById('queueView');
    const appFooter = document.getElementById('appFooter');
    const listEl = document.getElementById('queueList');

    const hasItems = this.state.queue.length > 0;

    // Window sizing mode: Fixed 500x500 for Hero, Resizable (min 500x500) for Queue
    Api.invoke('set_view_window_mode', { mode: hasItems ? 'queue' : 'hero' });

    // View state transitions: Clean Hero Front Page vs Active Queue View
    if (heroView) heroView.style.display = hasItems ? 'none' : 'flex';
    if (queueView) queueView.style.display = hasItems ? 'flex' : 'none';
    if (appFooter) appFooter.style.display = hasItems ? 'flex' : 'none';

    if (!hasItems) {
      this.updateSummary();
      return;
    }

    if (listEl) {
      listEl.innerHTML = this.state.queue
        .map(
          (item) => `
        <article class="stream-tile ${item.status === 'downloading' ? 'active-download' : ''}" id="tile-${item.id}">
          <div class="tile-main-row">
            <!-- Left Checkbox -->
            <label class="custom-checkbox">
              <input type="checkbox" ${item.checked ? 'checked' : ''} onchange="App.toggleTileCheck('${item.id}', this.checked)">
              <span class="checkbox-box">
                <svg class="svg-icon svg-stroke" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
              </span>
            </label>

            <!-- Video Thumbnail -->
            <div class="tile-thumb">
              <img src="${item.thumbnail}" alt="Thumbnail" onerror="this.src='https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=300&auto=format&fit=crop&q=60'">
              <span class="tile-duration-badge">${item.duration}</span>
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
              </div>
            </div>

            <!-- Right Controls: Custom Frosted Glass Dropdown & Remove -->
            <div class="tile-controls">
              <div class="glass-dropdown" id="dropdown-${item.id}">
                <button class="glass-dropdown-trigger" onclick="App.toggleDropdown('${item.id}', event)" type="button">
                  <span>${this.getQualityLabel(item.selectedQuality)}</span>
                  <svg class="svg-icon svg-stroke arrow-icon" viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9"/></svg>
                </button>
                <div class="glass-dropdown-menu">
                  ${this.renderDropdownItems(item)}
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
                <span id="status-text-${item.id}">${this.getStatusLabel(item)}</span>
              </div>
              <div style="font-family: 'JetBrains Mono', monospace; font-size: 10.5px;" id="pct-${item.id}">
                ${item.status === 'finished' ? '100%' : (item.progress > 0 ? item.progress.toFixed(1) + '%' : 'Ready')}
              </div>
            </div>
            <div class="tile-progress-track">
              <div class="tile-progress-fill" id="fill-${item.id}" style="width: ${item.progress}%; ${item.status === 'finished' ? 'background: var(--status-valid);' : ''}"></div>
            </div>
          </div>
        </article>
      `
        )
        .join('');
    }

    this.updateSummary();
  },

  getStatusLabel(item) {
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
      return '<svg class="svg-icon svg-stroke status-icon" style="color:var(--status-danger);" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg><span>Failed</span>';
    }
    return '<span>Queued (Ready)</span>';
  },

  toggleTileCheck(id, checked) {
    const item = this.state.queue.find((q) => q.id === id);
    if (item) {
      item.checked = checked;
    }
    this.updateSummary();
  },

  onTileQualityChange(id, value) {
    const item = this.state.queue.find((q) => q.id === id);
    if (item) {
      item.selectedQuality = value;
    }
  },

  removeTile(id) {
    this.state.queue = this.state.queue.filter((q) => q.id !== id);
    this.renderQueue();
  },

  selectAll(checked) {
    this.state.queue.forEach((item) => {
      item.checked = checked;
    });
    this.renderQueue();
  },

  clearQueue() {
    if (this.state.isDownloading) {
      this.showError({
        title: 'Queue Action Restricted',
        message: 'Cannot clear queue while a download is actively in progress.',
        details: 'Active downloads must finish or complete before resetting the batch queue.',
      });
      return;
    }
    this.state.queue = [];
    this.renderQueue();
  },

  updateSummary() {
    const total = this.state.queue.length;
    const checked = this.state.queue.filter((q) => q.checked).length;

    const badge = document.getElementById('queueBadge');
    if (badge) badge.textContent = `${total} Item${total === 1 ? '' : 's'}`;

    const summary = document.getElementById('queueSummary');
    if (summary) summary.textContent = `${checked} of ${total} selected`;

    const btnDownload = document.getElementById('btnDownloadQueue');
    const btnText = document.getElementById('btnDownloadQueueText');

    if (btnDownload && btnText) {
      btnDownload.disabled = checked === 0 || this.state.isDownloading;
      btnText.textContent = this.state.isDownloading ? 'Downloading...' : `Download Selected (${checked})`;
    }
  },

  async startQueueDownload() {
    const selected = this.state.queue.filter((item) => item.checked && item.status !== 'finished');
    if (selected.length === 0) return;

    const ready = await this.ensureDependenciesReady();
    if (!ready) return;

    this.state.isDownloading = true;
    this.updateSummary();

    // Map selected items to DownloadOptions
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

      // Initial visual tile state update
      item.status = 'downloading';
      item.progress = 0;
      this.updateTileProgressDOM(item);

      return {
        item_id: item.id,
        url: item.url,
        output_dir: this.state.downloadDir === 'Desktop' ? null : this.state.downloadDir,
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
      this.onDownloadProgress(progress);
    };
    if (window.__TAURI__ && window.__TAURI__.core && typeof window.__TAURI__.core.Channel === 'function') {
      const chan = new window.__TAURI__.core.Channel();
      chan.onmessage = (progress) => {
        this.onDownloadProgress(progress);
      };
      onProgress = chan;
    }

    try {
      await Api.invoke('download_queue', { items, onProgress });
    } catch (err) {
      console.error('Queue download failed:', err);
      this.showError({
        title: 'Download Failed',
        message: 'An error occurred while downloading items in the queue.',
        details: typeof err === 'string' ? err : (err && err.message ? err.message : JSON.stringify(err, null, 2)),
      });
    } finally {
      this.state.isDownloading = false;
      this.updateSummary();
    }
  },

  onDownloadProgress(progress) {
    if (!progress) return;

    if (progress.item_id) {
      const item = this.state.queue.find((q) => q.id === progress.item_id);
      if (item) {
        item.progress = typeof progress.percent === 'number' ? progress.percent : 0;
        if (progress.speed) item.speed = progress.speed;
        if (progress.eta) item.eta = progress.eta;
        if (progress.status) item.status = progress.status;

        this.updateTileProgressDOM(item);
      }
    }

    if (progress.status === 'finished' && (!progress.item_id || progress.percent >= 100)) {
      this.state.isDownloading = false;
      this.updateSummary();
    }
  },

  updateTileProgressDOM(item) {
    const fillEl = document.getElementById(`fill-${item.id}`);
    if (fillEl) {
      fillEl.style.width = `${item.progress}%`;
      if (item.status === 'finished') {
        fillEl.style.background = 'var(--status-valid)';
      }
    }

    const pctEl = document.getElementById(`pct-${item.id}`);
    if (pctEl) {
      pctEl.textContent = item.status === 'finished' ? '100%' : `${item.progress.toFixed(1)}%`;
      if (item.status === 'finished') {
        pctEl.style.color = 'var(--status-valid)';
      } else if (item.status === 'downloading') {
        pctEl.style.color = 'var(--accent-cyan)';
      }
    }

    const statusTextEl = document.getElementById(`status-text-${item.id}`);
    if (statusTextEl) {
      statusTextEl.innerHTML = this.getStatusLabel(item);
    }

    const statusGroup = document.getElementById(`status-${item.id}`);
    if (statusGroup) {
      const dot = statusGroup.querySelector('.status-dot');
      if (dot) {
        dot.className = `status-dot ${item.status}`;
      }
    }
  },

  listenToProgressEvents() {
    Api.listen('download-progress', (progress) => {
      this.onDownloadProgress(progress);
    });

    Api.listen('provision-progress', (progress) => {
      this.onProvisionProgress(progress);
    });
  },

  onProvisionProgress(progress) {
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
  },

  async checkDependencies(forceRefresh = false) {
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
      this.state.dependencies = report;

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
          btnEngineIcon.innerHTML = `<svg class="svg-icon svg-stroke" style="width:14px; height:14px;" viewBox="0 0 24 24"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>`;
        }
      }

      if (banner) {
        banner.style.display = report && report.all_valid ? 'none' : 'flex';
      }
    } catch (e) {
      console.error('Failed checking dependencies:', e);
    }
  },

  _provisionConfirmResolver: null,

  requestProvisionConfirmation(report) {
    return new Promise((resolve) => {
      this._provisionConfirmResolver = resolve;

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
          desc: 'JavaScript engine for YouTube bot-challenge solver',
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
        locationTextEl.innerHTML = `Installed isolated into <code>%APPDATA%/Methik/bin</code> (~${totalEstMB} MB). No system path modifications.`;
      }

      this.openModal('provisionConfirmModal');
    });
  },

  resolveProvisionConfirmation(confirmed) {
    if (this._provisionConfirmResolver) {
      const r = this._provisionConfirmResolver;
      this._provisionConfirmResolver = null;
      r(confirmed);
    }
    const el = document.getElementById('provisionConfirmModal');
    if (el) el.classList.remove('active');
  },

  async ensureDependenciesReady() {
    try {
      const report = await Api.invoke('check_system_dependencies');
      this.state.dependencies = report;
      if (report && report.all_valid) {
        return true;
      }

      // Prompt the user with only the missing components
      const confirmed = await this.requestProvisionConfirmation(report);
      if (!confirmed) {
        return false;
      }

      // Automatically launch the Frosted Glass Provisioning Modal
      return await this.startProvisioning();
    } catch (e) {
      console.error('Dependency check failed:', e);
      return false;
    }
  },

  async startProvisioning() {
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

    this.openModal('provisionModal');

    // Create direct IPC Channel for real-time progress events
    let onProgress = (progress) => {
      this.onProvisionProgress(progress);
    };
    if (Api.isTauri() && window.__TAURI__.core && typeof window.__TAURI__.core.Channel === 'function') {
      const chan = new window.__TAURI__.core.Channel();
      chan.onmessage = (progress) => {
        this.onProvisionProgress(progress);
      };
      onProgress = chan;
    }

    try {
      const report = await Api.invoke('provision_dependencies', { onProgress });
      this.state.dependencies = report;
      await this.checkDependencies();

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
        this.closeModal('provisionModal');
      }, 1200);
      return true;
    } catch (e) {
      const errStr = String(e);
      if (errStr.includes('cancelled') || errStr.includes('canceled') || errStr.includes('Canceled')) {
        console.log('[Methik] Provisioning cancelled by user.');
        this.closeModal('provisionModal');
        return false;
      }
      if (provTitle) provTitle.textContent = 'Download Failed';
      if (provSubtitle) provSubtitle.textContent = errStr;
      if (provSpinner) provSpinner.style.display = 'none';
      if (provFill) provFill.style.background = 'var(--status-danger)';
      return false;
    }
  },

  promptCancelProvisioning() {
    this.openModal('cancelProvisionConfirmModal');
  },

  async executeCancelProvisioning() {
    try {
      await Api.invoke('cancel_provisioning');
    } catch (e) {
      console.warn('cancel_provisioning error:', e);
    }
    this.closeModal('cancelProvisionConfirmModal');
    this.closeModal('provisionModal');
    await this.checkDependencies();
  },

  async togglePin() {
    const btn = document.getElementById('btnPin');
    const newPinned = !this.state.isPinned;
    try {
      await Api.invoke('toggle_always_on_top', { pinned: newPinned });
      this.state.isPinned = newPinned;
      if (btn) {
        btn.classList.toggle('active-pin', newPinned);
        btn.title = newPinned ? 'Always on Top: Enabled' : 'Always on Top: Disabled';
      }
    } catch (e) {
      console.error('Failed to toggle pin:', e);
    }
  },

  async minimizeWindow() {
    try {
      await Api.invoke('minimize_window');
    } catch (e) {
      console.error('Failed to minimize window:', e);
    }
  },

  async toggleMaximize() {
    try {
      await Api.invoke('toggle_maximize_window');
    } catch (e) {
      console.error('Failed to toggle maximize:', e);
    }
  },

  async closeWindow() {
    try {
      await Api.invoke('close_window');
    } catch (e) {
      console.error('Failed to close window:', e);
    }
  },

  async openAppData() {
    try {
      await Api.invoke('open_appdata_folder');
    } catch (e) {
      console.error('Failed to open AppData folder:', e);
    }
  },

  async openLogs() {
    try {
      await Api.invoke('open_logs_folder');
    } catch (e) {
      console.error('Failed to open logs folder:', e);
    }
  },

  async openUrl(url) {
    if (!url) return;
    try {
      await Api.invoke('open_url', { url });
    } catch (e) {
      console.warn('Native open_url failed, falling back to browser window.open:', e);
      window.open(url, '_blank');
    }
  },

  async checkAppVersion(silent = false) {
    const textEl = document.getElementById('aboutVersionStatusText');
    const btn = document.getElementById('btnCheckAppVersion');

    if (textEl) textEl.textContent = 'Checking updates...';
    if (btn) btn.classList.add('spinning');

    try {
      const result = await Api.checkForUpdates();
      this.state.updateInfo = result;

      const archUpper = (result.arch || this.state.appInfo?.arch || 'x64').toUpperCase();

      if (result.has_update) {
        if (textEl) {
          textEl.textContent = `Update available: v${result.latest_version} (${archUpper})`;
        }

        // Populate update modal
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
          notesText.textContent = result.release_notes || 'No changelog notes provided for this release.';
        }

        if (btnPerform && btnPerformText) {
          if (result.matching_asset_found && result.download_url) {
            btnPerformText.textContent = 'Update & Restart';
            btnPerform.onclick = () => App.startAppUpdate();
          } else {
            btnPerformText.textContent = 'View on GitHub';
            btnPerform.onclick = () => App.openUrl(result.release_url);
          }
        }

        this.openModal('updateModal');
      } else {
        if (textEl) {
          textEl.textContent = `METHIK v${result.current_version} (${archUpper}) (Latest Version)`;
        }
      }
    } catch (e) {
      console.warn('Update check failed:', e);
      if (textEl) {
        textEl.textContent = 'Unable to check updates (Offline / Rate limited)';
      }
    } finally {
      if (btn) btn.classList.remove('spinning');
    }
  },

  async startAppUpdate() {
    if (!this.state.updateInfo || !this.state.updateInfo.download_url) {
      if (this.state.updateInfo?.release_url) {
        this.openUrl(this.state.updateInfo.release_url);
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

    this.state.isUpdating = true;

    let onProgress = (progress) => {
      this.onUpdateProgress(progress);
    };

    if (Api.isTauri() && window.__TAURI__.core && typeof window.__TAURI__.core.Channel === 'function') {
      const chan = new window.__TAURI__.core.Channel();
      chan.onmessage = (progress) => {
        this.onUpdateProgress(progress);
      };
      onProgress = chan;
    }

    try {
      await Api.downloadAndApplyUpdate(this.state.updateInfo.download_url, onProgress);
    } catch (e) {
      console.error('Update failed:', e);
      this.state.isUpdating = false;
      if (label) label.textContent = 'Update Failed';
      if (fill) fill.style.background = 'var(--status-danger)';
      if (bytes) bytes.textContent = String(e);
      if (actions) actions.style.display = 'flex';
    }
  },

  onUpdateProgress(progress) {
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
  },

  openModal(id) {
    const el = document.getElementById(id);
    if (el) el.classList.add('active');
    if (id === 'settingsModal') {
      this.checkDependencies(true);
      // Sync active theme card state
      const cardDark = document.getElementById('themeCardDark');
      const cardLight = document.getElementById('themeCardLight');
      if (cardDark && cardLight) {
        cardDark.classList.toggle('active', this.state.theme === 'dark');
        cardLight.classList.toggle('active', this.state.theme === 'light');
      }
    }
  },

  closeModal(id) {
    const el = document.getElementById(id);
    if (el) el.classList.remove('active');
    if (id === 'provisionConfirmModal' && this._provisionConfirmResolver) {
      const r = this._provisionConfirmResolver;
      this._provisionConfirmResolver = null;
      r(false);
    }
  },

  showError({ title, message, details }) {
    const modalTitle = document.getElementById('errorModalTitle');
    const modalSubtitle = document.getElementById('errorModalSubtitle');
    const modalLog = document.getElementById('errorModalLogText');
    const mitigationCard = document.getElementById('errorMitigationCard');

    if (modalTitle) modalTitle.textContent = title || 'Operation Failed';
    if (modalSubtitle) modalSubtitle.textContent = message || 'An error occurred while processing your request';

    const detailsStr = details
      ? (typeof details === 'string' ? details : JSON.stringify(details, null, 2))
      : 'No detailed diagnostic log available.';
    if (modalLog) modalLog.textContent = detailsStr;

    // Smart bot check / cookies challenge detection
    const isBotChallenge = /sign in to confirm you'?re not a bot|--cookies|cookie/i.test(detailsStr);
    if (mitigationCard) {
      mitigationCard.style.display = isBotChallenge ? 'flex' : 'none';
    }

    this.openModal('errorModal');
  },

  copyErrorLog() {
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
  },

  formatViews(count) {
    if (!count) return '';
    if (count >= 1_000_000_000) return (count / 1_000_000_000).toFixed(1) + 'B views';
    if (count >= 1_000_000) return (count / 1_000_000).toFixed(1) + 'M views';
    if (count >= 1_000) return (count / 1_000).toFixed(1) + 'K views';
    return count + ' views';
  },
};

// Auto-initialize on DOM ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => App.init());
} else {
  App.init();
}
