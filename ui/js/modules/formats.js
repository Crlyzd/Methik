/**
 * Format parsing, quality labels, duration parsing, and filesize estimation utilities.
 */

export function getQualityLabel(val) {
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
}

export function extractAvailableQualities(formats) {
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
}

export function parseDurationToSeconds(str) {
  if (!str || typeof str !== 'string' || str === '--:--') return 180;
  const parts = str.split(':').map((p) => parseInt(p, 10));
  if (parts.some(isNaN)) return 180;
  if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  } else if (parts.length === 2) {
    return parts[0] * 60 + parts[1];
  }
  return 180;
}

export function formatBytes(bytes) {
  if (!bytes || isNaN(bytes) || bytes <= 0) return null;
  const mb = bytes / (1024 * 1024);
  if (mb >= 1000) {
    const gb = mb / 1024;
    return `~${gb.toFixed(gb >= 10 ? 1 : 2)} GB`;
  }
  if (mb < 1) {
    const kb = bytes / 1024;
    return `~${Math.round(kb)} KB`;
  }
  return `~${mb >= 100 ? Math.round(mb) : mb.toFixed(1)} MB`;
}

export function getEstimatedSize(item, qualityKey) {
  if (!item) return '';
  const qKey = qualityKey || item.selectedQuality || '1080p';
  const durSec = item.durationSeconds || parseDurationToSeconds(item.duration) || 180;

  // 1. Check explicit formats table if available (Single Videos)
  if (item.formats && Array.isArray(item.formats) && item.formats.length > 0) {
    if (qKey === 'audio_mp3') {
      const audioFmts = item.formats.filter((f) => f.is_audio_only && f.filesize);
      if (audioFmts.length > 0) {
        const bestAudio = audioFmts.sort((a, b) => (b.filesize || 0) - (a.filesize || 0))[0];
        if (bestAudio && bestAudio.filesize) return formatBytes(bestAudio.filesize);
      }
      return formatBytes((320 * 1000 / 8) * durSec);
    }

    if (qKey === 'audio_flac') {
      return formatBytes((960 * 1000 / 8) * durSec);
    }

    let targetHeight = 1080;
    if (qKey === '4k') targetHeight = 2160;
    else if (qKey === '2k') targetHeight = 1440;
    else if (qKey === '1080p') targetHeight = 1080;
    else if (qKey === '720p') targetHeight = 720;
    else if (qKey === '480p') targetHeight = 480;

    const videoStreams = item.formats
      .filter((f) => {
        if (!f.resolution) return false;
        const m = f.resolution.match(/(\d+)x(\d+)/);
        return m && parseInt(m[2], 10) <= targetHeight;
      })
      .sort((a, b) => {
        const ma = a.resolution.match(/(\d+)x(\d+)/);
        const mb = b.resolution.match(/(\d+)x(\d+)/);
        const ha = ma ? parseInt(ma[2], 10) : 0;
        const hb = mb ? parseInt(mb[2], 10) : 0;
        return hb - ha;
      });

    const matchedVideo = videoStreams[0];
    const audioStreams = item.formats
      .filter((f) => f.is_audio_only && f.filesize)
      .sort((a, b) => (b.filesize || 0) - (a.filesize || 0));
    const bestAudioSize = audioStreams.length > 0 ? (audioStreams[0].filesize || 0) : ((160 * 1000 / 8) * durSec);

    if (matchedVideo && matchedVideo.filesize) {
      return formatBytes(matchedVideo.filesize + (matchedVideo.is_video_only ? bestAudioSize : 0));
    }
  }

  // 2. Standard calibrated bitrate modeling based on duration (Playlist & Streams without filesize tags)
  const bitrateMap = {
    '4k': 20000 * 1000 / 8,      // ~2.5 MB/s
    '2k': 10000 * 1000 / 8,      // ~1.25 MB/s
    '1080p': 4200 * 1000 / 8,    // ~525 KB/s
    '720p': 2200 * 1000 / 8,     // ~275 KB/s
    '480p': 1100 * 1000 / 8,     // ~137.5 KB/s
    'audio_mp3': 320 * 1000 / 8, // ~40 KB/s
    'audio_flac': 960 * 1000 / 8 // ~120 KB/s
  };

  const bytesPerSec = bitrateMap[qKey] || (3500 * 1000 / 8);
  return formatBytes(bytesPerSec * durSec);
}

export function formatViews(count) {
  if (!count) return '';
  if (count >= 1_000_000_000) return (count / 1_000_000_000).toFixed(1) + 'B views';
  if (count >= 1_000_000) return (count / 1_000_000).toFixed(1) + 'M views';
  if (count >= 1_000) return (count / 1_000).toFixed(1) + 'K views';
  return count + ' views';
}
