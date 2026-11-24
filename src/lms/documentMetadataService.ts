/**
 * Document Metadata & Auto-Title Service
 * ---------------------------------------
 * Automatically resolves human-readable file titles from Google Drive links
 * (both public and private/restricted via OAuth token), Google Docs/Sheets/Slides,
 * YouTube URLs, and direct PDF/document URLs.
 */
import { extractGoogleDriveId, extractYouTubeId } from './security';
import { getCachedGoogleAccessToken, ensureValidGoogleDriveToken } from '../lib/firebase';

export interface DocumentMetadataResult {
  title: string;
  kind: 'drive' | 'youtube' | 'url';
  driveFileId?: string;
}

const metadataCache = new Map<string, DocumentMetadataResult>();

/**
 * Fallback local title extraction from URL pathname when offline or API unavailable.
 */
function extractFallbackTitleFromUrl(rawUrl: string): string {
  try {
    const parsed = new URL(rawUrl);
    const segments = parsed.pathname.split('/').filter(Boolean);
    const last = decodeURIComponent(segments[segments.length - 1] || '');
    if (last && !['view', 'edit', 'preview', 'uc', 'open', 'watch'].includes(last.toLowerCase())) {
      return last.replace(/[_]+/g, ' ').trim();
    }
  } catch {
    // Ignore invalid URL parse
  }
  return '';
}

/**
 * Fetches document metadata (auto-title) for any pasted note/file link.
 */
export async function fetchDocumentMetadata(rawUrl: string): Promise<DocumentMetadataResult | null> {
  const trimmed = (rawUrl || '').trim();
  if (!trimmed || !/^https?:\/\//i.test(trimmed)) return null;

  if (metadataCache.has(trimmed)) {
    return metadataCache.get(trimmed) || null;
  }

  const driveId = extractGoogleDriveId(trimmed);
  const ytId = extractYouTubeId(trimmed);

  let token: string | null = null;
  if (driveId) {
    token = getCachedGoogleAccessToken();
    if (!token) {
      token = await ensureValidGoogleDriveToken().catch(() => null);
    }
  }

  // 1. Direct Google Drive v3 API lookup in browser if OAuth token is available
  if (driveId && token) {
    try {
      const driveRes = await fetch(
        `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(driveId)}?fields=name,mimeType&supportsAllDrives=true`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (driveRes.ok) {
        const driveData = (await driveRes.json()) as { name?: string };
        if (driveData?.name && driveData.name.trim()) {
          const result: DocumentMetadataResult = {
            title: driveData.name.trim(),
            kind: 'drive',
            driveFileId: driveId,
          };
          metadataCache.set(trimmed, result);
          return result;
        }
      }
    } catch {
      // Continue to backend metadata endpoint
    }
  }

  // 2. Try backend metadata resolver (/api/drive/metadata)
  try {
    const tokenParam = token ? `&token=${encodeURIComponent(token)}` : '';
    const res = await fetch(`/api/drive/metadata?url=${encodeURIComponent(trimmed)}${tokenParam}`);
    const contentType = res.headers.get('content-type') || '';
    if (res.ok && contentType.includes('application/json')) {
      const data = (await res.json()) as { title?: string; kind?: 'drive' | 'youtube' | 'url'; driveFileId?: string };
      if (data?.title && data.title.trim()) {
        const result: DocumentMetadataResult = {
          title: data.title.trim(),
          kind: data.kind || (driveId ? 'drive' : ytId ? 'youtube' : 'url'),
          driveFileId: data.driveFileId || driveId || undefined,
        };
        metadataCache.set(trimmed, result);
        return result;
      }
    }
  } catch {
    // Fallback below if offline or static host
  }

  // 3. Direct YouTube oEmbed fallback if running on static host without /api
  if (ytId) {
    try {
      const ytRes = await fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(trimmed)}&format=json`);
      if (ytRes.ok) {
        const ytData = (await ytRes.json()) as { title?: string };
        if (ytData?.title) {
          const result: DocumentMetadataResult = { title: ytData.title.trim(), kind: 'youtube' };
          metadataCache.set(trimmed, result);
          return result;
        }
      }
    } catch {
      // Ignore
    }
  }

  // 4. Pathname fallback
  const fallbackTitle = extractFallbackTitleFromUrl(trimmed);
  if (fallbackTitle) {
    const result: DocumentMetadataResult = {
      title: fallbackTitle,
      kind: driveId ? 'drive' : ytId ? 'youtube' : 'url',
      driveFileId: driveId || undefined,
    };
    metadataCache.set(trimmed, result);
    return result;
  }

  return null;
}
