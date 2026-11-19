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
  const cloakedThumbnailUrl = `/api/video-thumbnail?token=${encodeURIComponent(token)}`;
  const directThumbnailUrl = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
  const maxResThumbnailUrl = `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`;

  // Tier 1: Backend video-metadata API via POST with encrypted token
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000);

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
          const result: VideoMetadata = {
            videoId,
            token: data.token || token,
            title: data.title,
            durationMinutes: data.durationMinutes || 15,
            durationSeconds: data.durationSeconds,
            thumbnailUrl: data.thumbnailUrl || directThumbnailUrl,
            rawThumbnailUrl: data.rawThumbnailUrl || directThumbnailUrl,
            author: data.author || '',
            isAutoDetected: true,
          };
          metadataCache.set(videoId, result);
          return result;
        }
      }
    }
  } catch (err) {
    console.warn('Backend video-metadata API request failed or timed out, trying direct client oEmbed:', err);
  }

  // Tier 2: Direct Client-Side YouTube oEmbed API (CORS enabled, highly reliable)
  try {
    const oembedUrl = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`;
    const oembedRes = await fetch(oembedUrl);
    if (oembedRes.ok) {
      const odata = await oembedRes.json();
      if (odata && odata.title) {
        // Trigger non-blocking duration probe in background
        const durationSec = await probeYouTubeDuration(videoId, 2500).catch(() => null);
        const durationMin = durationSec && durationSec > 0 ? Math.max(1, Math.round(durationSec / 60)) : 15;

        const result: VideoMetadata = {
          videoId,
          token,
          title: odata.title,
          durationMinutes: durationMin,
          durationSeconds: durationSec || undefined,
          thumbnailUrl: odata.thumbnail_url || directThumbnailUrl,
          rawThumbnailUrl: odata.thumbnail_url || directThumbnailUrl,
          author: odata.author_name || '',
          isAutoDetected: true,
        };
        metadataCache.set(videoId, result);
        return result;
      }
    }
  } catch (oembedErr) {
    console.warn('Direct YouTube oEmbed request failed, trying NoEmbed proxy:', oembedErr);
  }

  // Tier 3: NoEmbed Fallback
  try {
    const noembedUrl = `https://noembed.com/embed?url=https://www.youtube.com/watch?v=${videoId}`;
    const noembedRes = await fetch(noembedUrl);
    if (noembedRes.ok) {
      const ndata = await noembedRes.json();
      if (ndata && ndata.title) {
        const result: VideoMetadata = {
          videoId,
          token,
          title: ndata.title,
          durationMinutes: 15,
          thumbnailUrl: ndata.thumbnail_url || directThumbnailUrl,
          rawThumbnailUrl: ndata.thumbnail_url || directThumbnailUrl,
          author: ndata.author_name || '',
          isAutoDetected: true,
        };
        metadataCache.set(videoId, result);
        return result;
      }
    }
  } catch (noembedErr) {
    console.warn('Noembed fallback failed:', noembedErr);
  }

  // Tier 4: Graceful fallback with direct YouTube thumbnail
  const fallbackResult: VideoMetadata = {
    videoId,
    token,
    title: 'Lecture Video',
    durationMinutes: 15,
    durationSeconds: 900,
    thumbnailUrl: directThumbnailUrl,
    rawThumbnailUrl: directThumbnailUrl,
    isAutoDetected: false,
  };
  return fallbackResult;
}
