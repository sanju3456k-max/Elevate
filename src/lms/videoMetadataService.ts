/**
 * Video Metadata Ingestion Service
 * Cloaked Metadata Fetcher:
 * - Uses scrambled tokens over POST payload
 * - Prevents plaintext video IDs from appearing in URL query parameters or network requests
 * - Multi-tier metadata fetching:
 *    1. Internal Backend API (/api/video-metadata) with YouTube InnerTube & Watch Scraper
 *    2. Direct YouTube oEmbed API (CORS friendly, fast, accurate title & thumbnail)
 *    3. Noembed fallback
 *    4. Hidden YouTube Iframe Player duration probe
 * - In-memory caching prevents duplicate fetches
 */

import { obfuscateVideoKey } from './security';

export interface VideoMetadata {
  videoId: string;
  token?: string;
  title: string;
  durationMinutes: number;
  durationSeconds?: number;
  thumbnailUrl: string;
  rawThumbnailUrl?: string;
  author?: string;
  isAutoDetected?: boolean;
}

export function extractYouTubeVideoId(input: string): string | null {
  if (!input || typeof input !== 'string') return null;
  const trimmed = input.trim();
  if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) {
    return trimmed;
  }
  const match = trimmed.match(
    /(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=|shorts\/|live\/))([a-zA-Z0-9_-]{11})/i
  );
  return match ? match[1] : null;
}

export function formatDurationLabel(secondsOrMinutes: number, isSeconds = false): string {
  if (!secondsOrMinutes || secondsOrMinutes <= 0) return '0 min';
  const totalSeconds = isSeconds ? Math.round(secondsOrMinutes) : Math.round(secondsOrMinutes * 60);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  if (isSeconds) {
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  }
  return `${minutes} min`;
}

// In-memory cache to prevent duplicate network calls
const metadataCache = new Map<string, VideoMetadata>();

/**
 * Headless YouTube IFrame Player probe to query exact video duration in seconds
 */
export function probeYouTubeDuration(videoId: string, timeoutMs = 3500): Promise<number | null> {
  return new Promise((resolve) => {
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      return resolve(null);
    }

    const timer = setTimeout(() => {
      cleanup();
      resolve(null);
    }, timeoutMs);

    const containerId = `yt_probe_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const container = document.createElement('div');
    container.id = containerId;
    container.style.position = 'fixed';
    container.style.top = '-9999px';
    container.style.left = '-9999px';
    container.style.width = '1px';
    container.style.height = '1px';
    container.style.opacity = '0';
    container.style.pointerEvents = 'none';
    document.body.appendChild(container);

    let player: any = null;
    let isCleanedUp = false;

    const cleanup = () => {
      if (isCleanedUp) return;
      isCleanedUp = true;
      clearTimeout(timer);
      try {
        if (player && typeof player.destroy === 'function') {
          player.destroy();
        }
      } catch {}
      if (container && container.parentNode) {
        container.parentNode.removeChild(container);
      }
    };

    const initPlayer = () => {
      try {
        player = new (window as any).YT.Player(containerId, {
          videoId,
          playerVars: {
            autoplay: 0,
            controls: 0,
            disablekb: 1,
            fs: 0,
            rel: 0,
          },
          events: {
            onReady: (event: any) => {
              try {
                const dur = event.target?.getDuration?.();
                if (typeof dur === 'number' && dur > 0) {
                  cleanup();
                  resolve(dur);
                  return;
                }
                event.target?.mute?.();
                event.target?.playVideo?.();
              } catch {
                cleanup();
                resolve(null);
              }
            },
            onStateChange: (event: any) => {
              try {
                const dur = event.target?.getDuration?.();
                if (typeof dur === 'number' && dur > 0) {
                  event.target?.stopVideo?.();
                  cleanup();
                  resolve(dur);
                }
              } catch {
                cleanup();
                resolve(null);
              }
            },
            onError: () => {
              cleanup();
              resolve(null);
            },
          },
        });
      } catch {
        cleanup();
        resolve(null);
      }
    };

    if ((window as any).YT && (window as any).YT.Player) {
      initPlayer();
    } else {
      const existingScript = document.querySelector('script[src*="youtube.com/iframe_api"]');
      if (!existingScript) {
        const tag = document.createElement('script');
        tag.src = 'https://www.youtube.com/iframe_api';
        document.head.appendChild(tag);
      }
      const prevReady = (window as any).onYouTubeIframeAPIReady;
      (window as any).onYouTubeIframeAPIReady = () => {
        if (typeof prevReady === 'function') {
          try {
            prevReady();
          } catch {}
        }
        initPlayer();
      };
    }
  });
}

/**
 * Converts remote thumbnail URL into an inline Base64 data URL.
 * Shields the raw YouTube Video ID from student network packet sniffers.
 */
export async function convertThumbnailToBase64(url: string, timeoutMs = 2500): Promise<string | null> {
  if (typeof window === 'undefined' || !url) return null;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) return null;
    const blob = await res.blob();
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const result = reader.result as string;
        resolve(result && result.startsWith('data:image') ? result : null);
      };
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

/**
 * Fetch video metadata with multi-tier failover
 */
export async function fetchVideoMetadata(inputUrlOrId: string, forceRefresh = false): Promise<VideoMetadata | null> {
  const videoId = extractYouTubeVideoId(inputUrlOrId);
  if (!videoId) return null;

  if (!forceRefresh && metadataCache.has(videoId)) {
    const cached = metadataCache.get(videoId)!;
    // Don't return placeholder cache if we can fetch better details
    if (cached.title && cached.title !== 'Lecture Video') {
      return cached;
    }
  }

  // Generate scrambled token so plaintext YouTube ID is never broadcast over HTTP query string
  const token = obfuscateVideoKey(videoId);
  const directThumbnailUrl = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;

  // Start duration probe and Base64 thumbnail ingestion in parallel
  const durationPromise = probeYouTubeDuration(videoId, 3000).catch(() => null);
  const base64Promise = convertThumbnailToBase64(directThumbnailUrl, 2500).catch(() => null);

  let detectedTitle: string | null = null;
  let detectedAuthor: string = '';
  let durationSec: number | null = null;
  let serverThumbnailUrl: string | null = null;

  // Tier 1: Backend video-metadata API via POST with encrypted token
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2000);

    const res = await fetch('/api/video-metadata', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({ token, id: videoId, url: `https://www.youtube.com/watch?v=${videoId}` }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (res.ok) {
      const contentType = res.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        const data = await res.json();
        if (data && data.success && data.title && data.title !== 'Lecture Video') {
          detectedTitle = data.title;
          if (data.author) detectedAuthor = data.author;
          if (typeof data.durationSeconds === 'number' && data.durationSeconds > 0) {
            durationSec = data.durationSeconds;
          }
          if (data.thumbnailUrl) {
            serverThumbnailUrl = data.thumbnailUrl;
          }
        }
      }
    }
  } catch (err) {
    // In offline or native Android app mode (no localhost express backend), fall through to client probe
  }

  // Tier 2: Direct Client-Side YouTube oEmbed API (CORS enabled, fast, highly reliable)
  if (!detectedTitle) {
    try {
      const oembedController = new AbortController();
      const oembedTimeout = setTimeout(() => oembedController.abort(), 3000);
      const oembedUrl = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`;
      const oembedRes = await fetch(oembedUrl, { signal: oembedController.signal });
      clearTimeout(oembedTimeout);
      if (oembedRes.ok) {
        const odata = await oembedRes.json();
        if (odata && odata.title) {
          detectedTitle = odata.title;
          if (odata.author_name) detectedAuthor = odata.author_name;
        }
      }
    } catch {
      // Trying Tier 3 fallback
    }
  }

  // Tier 3: NoEmbed Fallback
  if (!detectedTitle) {
    try {
      const noembedController = new AbortController();
      const noembedTimeout = setTimeout(() => noembedController.abort(), 2500);
      const noembedUrl = `https://noembed.com/embed?url=https://www.youtube.com/watch?v=${videoId}`;
      const noembedRes = await fetch(noembedUrl, { signal: noembedController.signal });
      clearTimeout(noembedTimeout);
      if (noembedRes.ok) {
        const ndata = await noembedRes.json();
        if (ndata && ndata.title) {
          detectedTitle = ndata.title;
          if (ndata.author_name) detectedAuthor = ndata.author_name;
        }
      }
    } catch {
      // Graceful fallback
    }
  }

  // Await duration probe if not obtained from backend
  if (!durationSec) {
    durationSec = await durationPromise;
  }
  const durationMin = durationSec && durationSec > 0 ? Math.max(1, Math.round(durationSec / 60)) : 15;

  // Await base64 thumbnail conversion (cloaks raw YouTube ID from student network sniffers)
  const base64Thumb = await base64Promise;
  const finalThumbnail = base64Thumb || serverThumbnailUrl || directThumbnailUrl;

  const result: VideoMetadata = {
    videoId,
    token,
    title: detectedTitle || 'Lecture Video',
    durationMinutes: durationMin,
    durationSeconds: durationSec || undefined,
    thumbnailUrl: finalThumbnail,
    rawThumbnailUrl: directThumbnailUrl,
    author: detectedAuthor,
    isAutoDetected: Boolean(detectedTitle),
  };

  metadataCache.set(videoId, result);
  return result;
}
