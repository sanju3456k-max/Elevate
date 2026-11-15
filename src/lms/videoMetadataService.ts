/**
 * Video Metadata Ingestion Service
 * Automatically fetches title, duration, and thumbnail from YouTube URLs or IDs
 * with multi-tier fallback (Fast Backend API -> YouTube oEmbed -> NoEmbed Proxy)
 * and in-memory caching.
 */

export interface VideoMetadata {
  videoId: string;
  title: string;
  durationMinutes: number;
  durationSeconds?: number;
  thumbnailUrl: string;
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

// In-memory cache to prevent duplicate network calls for the same URL/ID
const metadataCache = new Map<string, VideoMetadata>();

export async function fetchVideoMetadata(inputUrlOrId: string, forceRefresh = false): Promise<VideoMetadata | null> {
  const videoId = extractYouTubeVideoId(inputUrlOrId);
  if (!videoId) return null;

  if (!forceRefresh && metadataCache.has(videoId)) {
    return metadataCache.get(videoId)!;
  }

  // 1. Primary: Backend video-metadata API (fetches full YouTube watch page & lengthSeconds)
  try {
    const res = await fetch(`/api/video-metadata?url=${encodeURIComponent(videoId)}`, {
      headers: { Accept: 'application/json' },
    });
    if (res.ok) {
      const contentType = res.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        const data = await res.json();
        if (data && data.success && data.title) {
          const result: VideoMetadata = {
            videoId,
            title: data.title,
            durationMinutes: data.durationMinutes || 30,
            durationSeconds: data.durationSeconds,
            thumbnailUrl: data.thumbnailUrl || `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
          };
          metadataCache.set(videoId, result);
          return result;
        }
      }
    }
  } catch (err) {
    console.warn('Backend video-metadata API unreachable, falling back to official oEmbed:', err);
  }

  // 2. Direct client fallback via official YouTube oEmbed API
  try {
    const ytOembedRes = await fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`);
    if (ytOembedRes.ok) {
      const data = await ytOembedRes.json();
      if (data && data.title) {
        const result: VideoMetadata = {
          videoId,
          title: data.title,
          durationMinutes: 30,
          thumbnailUrl: data.thumbnail_url || `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
        };
        metadataCache.set(videoId, result);
        return result;
      }
    }
  } catch (err) {
    console.warn('Direct YouTube oEmbed fallback failed:', err);
  }

  // 3. Secondary client fallback via noembed CORS proxy
  try {
    const oembedRes = await fetch(`https://noembed.com/embed?url=https://www.youtube.com/watch?v=${videoId}`);
    if (oembedRes.ok) {
      const data = await oembedRes.json();
      if (data && data.title) {
        const result: VideoMetadata = {
          videoId,
          title: data.title,
          durationMinutes: 30,
          thumbnailUrl: data.thumbnail_url || `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
        };
        metadataCache.set(videoId, result);
        return result;
      }
    }
  } catch (err) {
    console.warn('Direct noembed fallback failed:', err);
  }

  return null;
}
