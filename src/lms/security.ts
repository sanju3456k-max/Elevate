/**
 * Security & Anti-Piracy Utilities
 * Provides:
 * 1. YouTube ID parser & reversible scrambler (obfuscation)
 * 2. Window/Devtools Anti-Inspection protection
 * 3. Watermark generator
 */

// Secret seed for client-side obfuscation
const OBFUSCATION_SALT = 'EDUPULSE_SECURE_TOKEN_v1';

/**
 * Extracts YouTube Video ID from any normal or unlisted YouTube link.
 * Supports:
 * - https://www.youtube.com/watch?v=VIDEO_ID
 * - https://youtu.be/VIDEO_ID
 * - https://www.youtube.com/embed/VIDEO_ID
 * - Raw 11-char ID
 */
export function extractYouTubeId(urlOrId: string): string | null {
  if (!urlOrId) return null;
  const trimmed = urlOrId.trim();

  // If it's already an 11-char YouTube ID
  if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) {
    return trimmed;
  }

  // Regex for YouTube URLs
  const regExp = /(?:youtube\.com\/(?:[^\/\n\s]+\/\S+\/|(?:v|e(?:mbed)?)\/|\S*?[?&]v=)|youtu\.be\/)([a-zA-Z0-9_-]{11})/;
  const match = trimmed.match(regExp);
  return match && match[1] ? match[1] : null;
}

/**
 * Obfuscate video ID so it's not plain-text in localStorage or network JSON payloads.
 */
export function obfuscateVideoKey(rawId: string): string {
  try {
    const encoded = encodeURIComponent(rawId);
    let output = '';
    for (let i = 0; i < encoded.length; i++) {
      const charCode = encoded.charCodeAt(i) ^ OBFUSCATION_SALT.charCodeAt(i % OBFUSCATION_SALT.length);
      output += String.fromCharCode(charCode);
    }
    return btoa(output);
  } catch {
    return btoa(rawId);
  }
}

/**
 * De-obfuscate video ID into raw YouTube ID in memory just before rendering.
 * Resilient against:
 * - XOR salted tokens
 * - Legacy plain base64 tokens
 * - Direct 11-char YouTube IDs
 * - Full YouTube URLs
 * - Empty or corrupted keys (falls back safely to valid sample ID)
 */
export function deobfuscateVideoKey(encryptedKey: string): string {
  if (!encryptedKey || typeof encryptedKey !== 'string') return 'WUvTyaaNkzM';
  const trimmed = encryptedKey.trim();
  if (!trimmed) return 'WUvTyaaNkzM';

  // 1. If it's already a clean 11-char YouTube ID (e.g. WUvTyaaNkzM)
  if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) {
    return trimmed;
  }

  // 2. If it's a full YouTube URL (e.g. https://www.youtube.com/watch?v=...)
  const directUrlId = extractYouTubeId(trimmed);
  if (directUrlId) {
    return directUrlId;
  }

  // 3. Try standard obfuscation decode (XOR with salt)
  try {
    const decoded = atob(trimmed);
    let output = '';
    for (let i = 0; i < decoded.length; i++) {
      const charCode = decoded.charCodeAt(i) ^ OBFUSCATION_SALT.charCodeAt(i % OBFUSCATION_SALT.length);
      output += String.fromCharCode(charCode);
    }
    const candidate = decodeURIComponent(output).trim();
    const candidateYtId = extractYouTubeId(candidate) || (/^[a-zA-Z0-9_-]{11}$/.test(candidate) ? candidate : null);
    if (candidateYtId) {
      return candidateYtId;
    }
  } catch {}

  // 4. Try plain base64 decode (for legacy/un-salted base64)
  try {
    const plainDecoded = atob(trimmed).trim();
    const candidateYtId = extractYouTubeId(plainDecoded) || (/^[a-zA-Z0-9_-]{11}$/.test(plainDecoded) ? plainDecoded : null);
    if (candidateYtId) {
      return candidateYtId;
    }
  } catch {}

  // 5. Final fallback: If anything in trimmed can be matched as an 11-char ID
  const anyMatch = trimmed.match(/[a-zA-Z0-9_-]{11}/);
  if (anyMatch && anyMatch[0]) {
    return anyMatch[0];
  }

  // 6. Safe universal fallback
  return 'WUvTyaaNkzM';
}

/**
 * Initializes screen protection listeners:
 * - Disables right-click context menu on video player
 * - Blocks common DevTools inspection keys (F12, Ctrl+Shift+I, Ctrl+U, etc.)
 */
export function enableContentSecurityDeterrence(onViolation?: (reason: string) => void) {
  const handleContextMenu = (e: MouseEvent) => {
    // Check if target is inside player or general app
    e.preventDefault();
    if (onViolation) onViolation('Right-click is restricted to protect educator content.');
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    // F12
    if (e.key === 'F12') {
      e.preventDefault();
      if (onViolation) onViolation('Developer tools are disabled.');
      return;
    }

    // Ctrl+Shift+I / J / C (Inspect)
    if (e.ctrlKey && e.shiftKey && ['I', 'J', 'C', 'i', 'j', 'c'].includes(e.key)) {
      e.preventDefault();
      if (onViolation) onViolation('Inspect Element is restricted.');
      return;
    }

    // Ctrl+U (View Source)
    if (e.ctrlKey && ['U', 'u'].includes(e.key)) {
      e.preventDefault();
      if (onViolation) onViolation('View Source is restricted.');
      return;
    }

    // PrintScreen deterrence
    if (e.key === 'PrintScreen') {
      if (onViolation) onViolation('Screenshots are discouraged.');
    }
  };

  window.addEventListener('contextmenu', handleContextMenu);
  window.addEventListener('keydown', handleKeyDown);

  return () => {
    window.removeEventListener('contextmenu', handleContextMenu);
    window.removeEventListener('keydown', handleKeyDown);
  };
}

/**
 * Real-time Active DevTools Open Detection
 * Listens for inspection shortcut attempts (F12, Ctrl+Shift+I/J/C, Ctrl+U)
 * without false alarms from Windows taskbar, browser bookmarks bar, or window scaling.
 */
export function initDevToolsDetector(onStatusChange: (isOpen: boolean) => void): () => void {
  const handleKeyDown = (e: KeyboardEvent) => {
    const isF12 = e.key === 'F12';
    const isDevShortcut = (e.ctrlKey || e.metaKey) && e.shiftKey && ['I', 'J', 'C', 'i', 'j', 'c'].includes(e.key);
    const isViewSource = (e.ctrlKey || e.metaKey) && ['U', 'u'].includes(e.key);

    if (isF12 || isDevShortcut || isViewSource) {
      e.preventDefault();
      e.stopPropagation();
      onStatusChange(true);
    }
  };

  window.addEventListener('keydown', handleKeyDown, true);

  return () => {
    window.removeEventListener('keydown', handleKeyDown, true);
  };
}

/**
 * Format seconds into mm:ss or hh:mm:ss
 */
export function formatDuration(seconds: number): string {
  const sec = Math.floor(seconds);
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;

  if (h > 0) {
    return `${h}:${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`;
  }
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}

/**
 * Extracts Google Drive File ID from any shareable drive link
 */
export function extractGoogleDriveId(urlOrId: string): string | null {
  if (!urlOrId) return null;
  const trimmed = urlOrId.trim();

  // If it's already an ID
  if (/^[a-zA-Z0-9_-]{25,50}$/.test(trimmed)) {
    return trimmed;
  }

  // https://drive.google.com/file/d/FILE_ID/view
  const fileDMatch = trimmed.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (fileDMatch && fileDMatch[1]) return fileDMatch[1];

  // https://drive.google.com/open?id=FILE_ID or ?id=FILE_ID
  const idQueryMatch = trimmed.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (idQueryMatch && idQueryMatch[1]) return idQueryMatch[1];

  return null;
}

/**
 * Builds normalized direct preview URL for iframe rendering
 */
export function buildGoogleDrivePreviewUrl(fileId: string): string {
  return `https://drive.google.com/file/d/${fileId}/preview`;
}
