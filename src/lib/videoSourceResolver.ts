export type VideoEngineType =
  | 'direct_video'
  | 'hls'
  | 'youtube'
  | 'vimeo'
  | 'dailymotion'
  | 'gdrive'
  | 'loom'
  | 'iframe_generic'
  | 'invalid';

export interface ResolvedVideoSource {
  engine: VideoEngineType;
  label: string;
  originalUrl: string;
  playUrl: string;
  supportsDirectControls: boolean;
}

function normalizeHttpUrl(raw: string): URL | null {
  const trimmed = String(raw || '').trim();
  if (!trimmed) return null;
  const candidate = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const u = new URL(candidate);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    return u;
  } catch {
    return null;
  }
}

function extractYouTubeVideoId(url: URL): string | null {
  const host = url.hostname.replace(/^www\./, '').toLowerCase();
  if (host === 'youtu.be') {
    const seg = url.pathname.split('/').filter(Boolean)[0];
    return seg || null;
  }
  if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'music.youtube.com' || host === 'youtube-nocookie.com') {
    const v = url.searchParams.get('v');
    if (v) return v;
    const parts = url.pathname.split('/').filter(Boolean);
    if (parts.length >= 2 && ['embed', 'shorts', 'live', 'v'].includes(parts[0])) {
      return parts[1];
    }
  }
  return null;
}

/**
 * Classifies any pasted video/site URL into the appropriate playback engine
 * without touching the existing CloakedVideoPlayer pipeline.
 */
export function resolveVideoSource(rawUrl: string): ResolvedVideoSource {
  const url = normalizeHttpUrl(rawUrl);
  if (!url) {
    return {
      engine: 'invalid',
      label: 'Invalid URL',
      originalUrl: rawUrl,
      playUrl: '',
      supportsDirectControls: false,
    };
  }

  const href = url.toString();
  const pathLower = url.pathname.toLowerCase();
  const host = url.hostname.replace(/^www\./, '').toLowerCase();

  // 1. HLS Adaptive Streams (.m3u8)
  if (pathLower.endsWith('.m3u8') || href.toLowerCase().includes('.m3u8?')) {
    return {
      engine: 'hls',
      label: 'HLS Stream (.m3u8)',
      originalUrl: href,
      playUrl: href,
      supportsDirectControls: true,
    };
  }

  // 2. Direct Video Files (.mp4, .webm, .mov, .m4v, .ogg)
  if (/\.(mp4|webm|ogg|mov|m4v)(\?|$)/i.test(pathLower) || /\.(mp4|webm|ogg|mov|m4v)(&|$)/i.test(url.search)) {
    return {
      engine: 'direct_video',
      label: 'Direct HTML5 Video',
      originalUrl: href,
      playUrl: href,
      supportsDirectControls: true,
    };
  }

  // 3. YouTube
  const ytId = extractYouTubeVideoId(url);
  if (ytId) {
    return {
      engine: 'youtube',
      label: 'YouTube Embed',
      originalUrl: href,
      playUrl: `https://www.youtube-nocookie.com/embed/${encodeURIComponent(ytId)}?rel=0&modestbranding=1`,
      supportsDirectControls: false,
    };
  }

  // 4. Vimeo
  if (host === 'vimeo.com' || host === 'player.vimeo.com') {
    const match = url.pathname.match(/\/(?:video\/)?(\d+)/);
    if (match?.[1]) {
      return {
        engine: 'vimeo',
        label: 'Vimeo Player',
        originalUrl: href,
        playUrl: `https://player.vimeo.com/video/${match[1]}`,
        supportsDirectControls: false,
      };
    }
  }

  // 5. Dailymotion
  if (host === 'dailymotion.com' || host === 'dai.ly' || host === 'geo.dailymotion.com') {
    const dmMatch = url.pathname.match(/\/video\/([a-zA-Z0-9]+)/) || (host === 'dai.ly' ? url.pathname.match(/^\/([a-zA-Z0-9]+)/) : null);
    if (dmMatch?.[1]) {
      return {
        engine: 'dailymotion',
        label: 'Dailymotion Player',
        originalUrl: href,
        playUrl: `https://geo.dailymotion.com/player.html?video=${encodeURIComponent(dmMatch[1])}`,
        supportsDirectControls: false,
      };
    }
  }

  // 6. Google Drive
  if (host === 'drive.google.com') {
    const fileMatch = url.pathname.match(/\/file\/d\/([^/]+)/);
    const idParam = url.searchParams.get('id');
    const driveId = fileMatch?.[1] || idParam;
    if (driveId) {
      return {
        engine: 'gdrive',
        label: 'Google Drive Preview',
        originalUrl: href,
        playUrl: `https://drive.google.com/file/d/${encodeURIComponent(driveId)}/preview`,
        supportsDirectControls: false,
      };
    }
  }

  // 7. Loom
  if (host === 'loom.com') {
    const loomMatch = url.pathname.match(/\/(?:share|embed)\/([a-zA-Z0-9]+)/);
    if (loomMatch?.[1]) {
      return {
        engine: 'loom',
        label: 'Loom Player',
        originalUrl: href,
        playUrl: `https://www.loom.com/embed/${encodeURIComponent(loomMatch[1])}`,
        supportsDirectControls: false,
      };
    }
  }

  // 8. Generic Embeddable Website / Player URL
  return {
    engine: 'iframe_generic',
    label: 'Web Frame Embed',
    originalUrl: href,
    playUrl: href,
    supportsDirectControls: false,
  };
}
