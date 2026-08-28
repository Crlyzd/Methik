/**
 * URL Metadata extraction pipeline for single video & playlists.
 */
import { state } from './state.js';
import { extractAvailableQualities, parseDurationToSeconds, formatViews } from './formats.js';
import { showError } from './toast.js';

export async function pasteHeroLink() {
  try {
    const text = await Api.readClipboard();
    if (text) {
      const input = document.getElementById('heroUrlInput');
      if (input) input.value = text.trim();
    }
  } catch (_) {}
}

export async function pasteQueueLink() {
  try {
    const text = await Api.readClipboard();
    if (text) {
      const input = document.getElementById('queueUrlInput');
      if (input) input.value = text.trim();
    }
  } catch (_) {}
}

export async function analyzeFromHero(ensureDependenciesReady, addQueueItem, renderQueue) {
  const input = document.getElementById('heroUrlInput');
  const btn = document.getElementById('btnHeroAnalyze');
  const btnText = document.getElementById('btnHeroAnalyzeText');
  const url = input ? input.value.trim() : '';
  if (!url) return;

  await executeStreamAnalysis(url, input, btn, btnText, 'Analyze Stream', ensureDependenciesReady, addQueueItem, renderQueue);
}

export async function analyzeFromQueue(ensureDependenciesReady, addQueueItem, renderQueue) {
  const input = document.getElementById('queueUrlInput');
  const btn = document.getElementById('btnQueueAnalyze');
  const btnText = document.getElementById('btnQueueAnalyzeText');
  const url = input ? input.value.trim() : '';
  if (!url) return;

  await executeStreamAnalysis(url, input, btn, btnText, 'Add Stream', ensureDependenciesReady, addQueueItem, renderQueue);
}

async function executeStreamAnalysis(url, inputEl, btnEl, btnTextEl, defaultBtnText, ensureDependenciesReady, addQueueItem, renderQueue) {
  const ready = await ensureDependenciesReady();
  if (!ready) return;

  if (btnEl) btnEl.disabled = true;
  if (btnTextEl) btnTextEl.textContent = 'Inspecting...';

  try {
    const isPlaylist = url.includes('list=') || url.includes('/playlist');

    if (isPlaylist) {
      const playlist = await Api.invoke('get_playlist_info', { url });
      if (playlist && playlist.entries && playlist.entries.length > 0) {
        playlist.entries.forEach((entry) => {
          addQueueItem({
            id: 'pl_' + (entry.id || Math.random().toString(36).substring(7)),
            videoId: entry.id || '',
            url: entry.url || url,
            title: entry.title || 'Playlist Track',
            thumbnail: entry.thumbnail_url || 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=300&auto=format&fit=crop&q=60',
            duration: entry.formatted_duration || '--:--',
            durationSeconds: entry.duration_seconds || parseDurationToSeconds(entry.formatted_duration),
            channel: playlist.title || 'Playlist Item',
            views: '',
            selectedQuality: state.globalQuality || '1080p',
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
        const availableQualities = extractAvailableQualities(meta.formats);
        const currentGlobal = state.globalQuality || '1080p';
        const defaultQuality = availableQualities.includes(currentGlobal)
          ? currentGlobal
          : (availableQualities.includes('1080p') ? '1080p' : (availableQualities.find((q) => !q.startsWith('audio_')) || '1080p'));
        addQueueItem({
          id: 'vid_' + (meta.id || Math.random().toString(36).substring(7)),
          videoId: meta.id || '',
          url: meta.webpage_url || url,
          title: meta.title || 'Media Stream',
          thumbnail: meta.thumbnail_url || 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=300&auto=format&fit=crop&q=60',
          duration: meta.formatted_duration || '--:--',
          durationSeconds: meta.duration_seconds || parseDurationToSeconds(meta.formatted_duration),
          channel: meta.channel || meta.uploader || 'Online Media',
          views: meta.view_count ? formatViews(meta.view_count) : '',
          formats: meta.formats || [],
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
    showError({
      title: 'Stream Analysis Failed',
      message: 'Unable to query metadata for the provided URL.',
      details: typeof err === 'string' ? err : (err && err.message ? err.message : JSON.stringify(err, null, 2)),
    });
  } finally {
    if (btnEl) btnEl.disabled = false;
    if (btnTextEl) btnTextEl.textContent = defaultBtnText;
    renderQueue();
  }
}
