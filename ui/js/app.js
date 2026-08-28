/**
 * Methik v0.1 - Application Controller & Bootstrap Orchestrator
 * Modular ES6 Native Entrypoint (Zero Bundlers Required)
 */
import { state } from './modules/state.js';
import * as Formats from './modules/formats.js';
import * as Toast from './modules/toast.js';
import * as Modal from './modules/modal.js';
import * as Dropdown from './modules/dropdown.js';
import * as Settings from './modules/settings.js';
import * as Metadata from './modules/metadata.js';
import * as Queue from './modules/queue.js';
import * as Downloader from './modules/downloader.js';
import * as ProvisionerUI from './modules/provisioner-ui.js';
import * as UpdaterUI from './modules/updater-ui.js';
import * as WindowCtrl from './modules/window.js';

export const App = {
  state,

  async init() {
    if (this.state.initialized) return;
    this.state.initialized = true;

    this.setupEventListeners();
    await WindowCtrl.loadAppInfo();
    await Settings.loadUserSettings();
    await ProvisionerUI.checkDependencies();
    Downloader.listenToProgressEvents((prog) => ProvisionerUI.onProvisionProgress(prog));
    Queue.renderQueue();
  },

  setupEventListeners() {
    // Suppress default context menu only in release mode
    Api.isDevMode().then((isDev) => {
      if (!isDev) {
        window.addEventListener('contextmenu', (e) => e.preventDefault());
      }
    });

    // Global Error & Promise Rejection Handlers
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

    // Enter key listeners
    const heroInput = document.getElementById('heroUrlInput');
    if (heroInput) {
      heroInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') this.analyzeFromHero();
      });
    }

    const queueInput = document.getElementById('queueUrlInput');
    if (queueInput) {
      queueInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') this.analyzeFromQueue();
      });
    }

    // Dropdown outside click listener
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.glass-dropdown')) {
        Dropdown.closeAllDropdowns();
      }
    });

    // Modal backdrop click listener
    Modal.setupModalListeners(() => ProvisionerUI.promptCancelProvisioning());
  },

  // --- Window Controls ---
  togglePin: () => WindowCtrl.togglePin(),
  minimizeWindow: () => WindowCtrl.minimizeWindow(),
  toggleMaximize: () => WindowCtrl.toggleMaximize(),
  closeWindow: () => WindowCtrl.closeWindow(),
  openAppData: () => WindowCtrl.openAppData(),
  openBinFolder: () => WindowCtrl.openBinFolder(),
  openLogs: () => WindowCtrl.openLogs(),
  openUrl: (url) => WindowCtrl.openUrl(url),
  openMedia: (id) => WindowCtrl.openMedia(id),

  // --- Settings & Themes ---
  setTheme: (mode, persist) => Settings.setTheme(mode, persist),
  browseDownloadFolder: () => Settings.browseDownloadFolder(),
  openDownloadFolder: () => Settings.openDownloadFolder(),
  toggleCookieDropdown: (e) => Settings.toggleCookieDropdown(e),
  selectCookieSource: (v, l) => Settings.selectCookieSource(v, l),
  browseCookieFile: () => Settings.browseCookieFile(),
  openCookieSettings: () => Settings.openCookieSettings(),

  // --- Metadata & Analysis ---
  pasteHeroLink: () => Metadata.pasteHeroLink(),
  pasteQueueLink: () => Metadata.pasteQueueLink(),
  analyzeFromHero: () => Metadata.analyzeFromHero(
    () => ProvisionerUI.ensureDependenciesReady(),
    (item) => Queue.addQueueItem(item),
    () => Queue.renderQueue()
  ),
  analyzeFromQueue: () => Metadata.analyzeFromQueue(
    () => ProvisionerUI.ensureDependenciesReady(),
    (item) => Queue.addQueueItem(item),
    () => Queue.renderQueue()
  ),

  // --- Queue Actions ---
  renderQueue: () => Queue.renderQueue(),
  toggleTileCheck: (id, chk) => Queue.toggleTileCheck(id, chk),
  onTileQualityChange: (id, val) => Queue.onTileQualityChange(id, val),
  removeTile: (id) => Queue.removeTile(id),
  selectAll: (chk) => Queue.selectAll(chk),
  toggleSelectAll: () => Queue.toggleSelectAll(),
  clearQueue: () => Queue.clearQueue(),
  showTileError: (id, e) => Queue.showTileError(id, e),
  onThumbnailClick: (id) => Queue.onThumbnailClick(id, (itemId) => WindowCtrl.openMedia(itemId)),

  // --- Dropdown Engine ---
  toggleDropdown: (id, e) => Dropdown.toggleDropdown(id, e),
  closeAllDropdowns: () => Dropdown.closeAllDropdowns(),
  toggleGlobalDropdown: (e) => Dropdown.toggleGlobalDropdown(e),
  applyQualityToAll: (q, e) => Dropdown.applyQualityToAll(q, e, () => Queue.renderQueue()),
  selectQuality: (id, val, e) => Dropdown.selectQuality(id, val, e),

  // --- Download Pipeline ---
  onMainDownloadButtonClick: () => Downloader.onMainDownloadButtonClick(
    () => ProvisionerUI.ensureDependenciesReady(),
    (id) => WindowCtrl.openMedia(id)
  ),
  pauseQueueDownload: () => Downloader.pauseQueueDownload(),
  resumeQueueDownload: () => Downloader.resumeQueueDownload(
    () => ProvisionerUI.ensureDependenciesReady(),
    (id) => WindowCtrl.openMedia(id)
  ),
  cancelQueueDownload: () => Downloader.cancelQueueDownload(),

  // --- Provisioner & Binaries ---
  checkDependencies: (force) => ProvisionerUI.checkDependencies(force),
  startProvisioning: () => ProvisionerUI.startProvisioning(),
  resolveProvisionConfirmation: (chk) => ProvisionerUI.resolveProvisionConfirmation(chk),
  promptCancelProvisioning: () => ProvisionerUI.promptCancelProvisioning(),
  executeCancelProvisioning: () => ProvisionerUI.executeCancelProvisioning(),

  // --- Updater & Modals ---
  checkAppVersion: (silent) => UpdaterUI.checkAppVersion(silent),
  startAppUpdate: () => UpdaterUI.startAppUpdate(),
  openModal: (id) => Modal.openModal(id, () => Settings.setTheme(state.theme, false)),
  closeModal: (id) => Modal.closeModal(id),
  showError: (opts) => Toast.showError(opts, () => Settings.openCookieSettings()),
  copyErrorLog: () => Toast.copyErrorLog(),
  showToast: (msg, type, dur) => Toast.showToast(msg, type, dur),
  formatBytes: (b) => Formats.formatBytes(b),
  getQualityLabel: (v) => Formats.getQualityLabel(v),
};

// Bind to window for HTML inline event compatibility
window.App = App;

// Bootstrap on DOM ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => App.init());
} else {
  App.init();
}
