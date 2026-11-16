/**
 * Video Metadata Ingestion Service
 * Cloaked Metadata Fetcher:
 * - Uses scrambled tokens over POST payload
 * - Prevents plaintext video IDs from appearing in URL query parameters or network requests
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

// In-memory cache to prevent duplicate network calls
const metadataCache = new Map<string, VideoMetadata>();

export async function fetchVideoMetadata(inputUrlOrId: string, forceRefresh = false): Promise<VideoMetadata | null> {
  const videoId = extractYouTubeVideoId(inputUrlOrId);
  if (!videoId) return null;

  if (!forceRefresh && metadataCache.has(videoId)) {
    return metadataCache.get(videoId)!;
  }

  // Generate scrambled token so plaintext YouTube ID is never broadcast over HTTP query string
  const token = obfuscateVideoKey(videoId);

  // 1. Primary: Backend video-metadata API via POST with encrypted token
  try {
    const res = await fetch('/api/video-metadata', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({ token }),
    });

    if (res.ok) {
      const contentType = res.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        const data = await res.json();
        if (data && data.success && data.title) {
          const result: VideoMetadata = {
            videoId,
            token: data.token || token,
            title: data.title,
            durationMinutes: data.durationMinutes || 30,
            durationSeconds: data.durationSeconds,
            thumbnailUrl: data.thumbnailUrl || `/api/video-thumbnail?token=${encodeURIComponent(token)}`,
          };
          metadataCache.set(videoId, result);
          return result;
        }
      }
    }
  } catch (err) {
    console.warn('Backend video-metadata API request failed:', err);
  }

  // Graceful local fallback without exposing network requests to 3rd party endpoints
  const fallbackResult: VideoMetadata = {
    videoId,
    token,
    title: 'Lecture Video',
    durationMinutes: 30,
    durationSeconds: 1800,
    thumbnailUrl: `/api/video-thumbnail?token=${encodeURIComponent(token)}`,
  };
  metadataCache.set(videoId, fallbackResult);
  return fallbackResult;
}
