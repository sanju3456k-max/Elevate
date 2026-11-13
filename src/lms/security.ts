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
 */
export function deobfuscateVideoKey(encryptedKey: string): string {
  try {
    const decoded = atob(encryptedKey);
    let output = '';
    for (let i = 0; i < decoded.length; i++) {
      const charCode = decoded.charCodeAt(i) ^ OBFUSCATION_SALT.charCodeAt(i % OBFUSCATION_SALT.length);
      output += String.fromCharCode(charCode);
    }
    return decodeURIComponent(output);
  } catch {
    try {
      return atob(encryptedKey);
    } catch {
      return encryptedKey;
    }
  }
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
