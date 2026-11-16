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

  // 1. If it's already an exact 11-char YouTube ID
  if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) {
    return trimmed;
  }

  // 2. If it's an 11-char ID followed by query params (e.g. WUvTyaaNkzM?list=PL... or WUvTyaaNkzM&list=...)
  const directIdWithParams = trimmed.match(/^([a-zA-Z0-9_-]{11})(?:[?&#].*)?$/);
  if (directIdWithParams && directIdWithParams[1]) {
    return directIdWithParams[1];
  }

  // 3. Regex for all YouTube URL variants (watch, embed, live, shorts, youtu.be), strictly stripping list/index params
  const regExp = /(?:youtube\.com\/(?:[^\/\n\s]+\/\S+\/|(?:v|e(?:mbed)?|live|shorts)\/|\S*?[?&]v=)|youtu\.be\/)([a-zA-Z0-9_-]{11})/;
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
 * Resolves the genuine high-res thumbnail for a lecture.
 * If lecture has a custom YouTube thumbnail, returns it.
 * If lecture has an Unsplash generic banner or missing thumbnail,
 * derives the real YouTube thumbnail from its encrypted video key.
 */
export function getLectureThumbnailUrl(lecture: { encryptedVideoId?: string; thumbnailUrl?: string } | null | undefined): string {
  if (!lecture) return '/assets/default-course-banner.png';

  // 1. If lecture has an encrypted video ID, ALWAYS route through cloaked server thumbnail proxy
  if (lecture.encryptedVideoId) {
    return `/api/video-thumbnail?token=${encodeURIComponent(lecture.encryptedVideoId)}`;
  }

  // 2. If legacy thumbnailUrl contains img.youtube.com, cloak it immediately
  if (lecture.thumbnailUrl && lecture.thumbnailUrl.includes('img.youtube.com')) {
    const m = lecture.thumbnailUrl.match(/\/vi\/([a-zA-Z0-9_-]{11})\//);
    if (m && m[1]) {
      return `/api/video-thumbnail?token=${encodeURIComponent(obfuscateVideoKey(m[1]))}`;
    }
  }

  // 3. Custom internal or uploaded thumbnail
  if (lecture.thumbnailUrl && !lecture.thumbnailUrl.includes('unsplash.com') && lecture.thumbnailUrl.trim() !== '') {
    return lecture.thumbnailUrl;
  }

  return lecture.thumbnailUrl || '/assets/default-course-banner.png';
}

/**
 * Injects security warning banner into browser console to deter scraping/dumping.
 */
export function initConsoleSecurityNotice() {
  if (typeof window === 'undefined') return;
  try {
    const title = '🔒 ELEVATE LABS — SECURE LEARNING ENVIRONMENT';
    const msg = 'Protected educational content & proprietary assessment assets. Unauthorized scraping, dumping, or reverse engineering of application assets is strictly prohibited under IT Act 2000 & Copyright Act 1957.';
    console.log(`%c${title}`, 'color: #3b82f6; font-size: 14px; font-weight: bold; background: #0f172a; padding: 4px 8px; border-radius: 4px;');
    console.log(`%c${msg}`, 'color: #ef4444; font-size: 11px; font-weight: 500;');
  } catch {}
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

    // PrintScreen deterrence & clipboard sanitization
    if (e.key === 'PrintScreen') {
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText('').catch(() => {});
        }
      } catch {}
      if (onViolation) onViolation('Screen capture is restricted on protected assessments.');
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
 * Focus-Loss & Screen Recording / Snipping Tool / Mobile Anti-Screenshot Protector
 * Detects:
 * 1. Mobile 3-finger swipe screenshot gestures (touchstart, touchmove with >= 3 touches) -> instant blackout
 * 2. Mobile hardware button combinations (Volume Down + Power / AudioVolumeDown / PrintScreen)
 * 3. Window blur / notification shade pull-down / app switcher on mobile
 * 4. Desktop Snipping Tool (Win+Shift+S, PrintScreen, Alt-Tab)
 * and immediately covers the screen in 100% pitch-black veil so any capture results in a black image.
 */
export function initFocusLossProtector(onObscuredChange: (isObscured: boolean) => void): () => void {
  let touchTimeout: any = null;
  let focusDebounceTimeout: any = null;

  const triggerBlackout = (persistMs: number = 2000) => {
    onObscuredChange(true);
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText('').catch(() => {});
      }
    } catch {}

    if (touchTimeout) clearTimeout(touchTimeout);
    if (persistMs > 0) {
      touchTimeout = setTimeout(() => {
        if (typeof document !== 'undefined' && !document.hidden && document.hasFocus()) {
          onObscuredChange(false);
        }
      }, persistMs);
    }
  };

  const handleBlur = () => {
    triggerBlackout(0);
  };

  const handleFocus = () => {
    // When focus returns, wait 400ms before removing blackout so mobile screenshot rendering pipeline only captures pure black
    if (focusDebounceTimeout) clearTimeout(focusDebounceTimeout);
    focusDebounceTimeout = setTimeout(() => {
      if (typeof document !== 'undefined' && !document.hidden && document.hasFocus()) {
        onObscuredChange(false);
      }
    }, 400);
  };

  const handleVisibility = () => {
    if (document.visibilityState === 'hidden') {
      triggerBlackout(0);
    } else if (document.hasFocus()) {
      handleFocus();
    }
  };

  const handlePageHide = () => {
    triggerBlackout(0);
  };

  // 1. Mobile Multi-finger Touch Detection (Android 3-Finger Swipe Screenshot)
  const handleTouchStart = (e: TouchEvent) => {
    if (e.touches && e.touches.length >= 3) {
      try {
        if (e.cancelable) e.preventDefault();
      } catch {}
      e.stopPropagation();
      triggerBlackout(2500);
    }
  };

  const handleTouchMove = (e: TouchEvent) => {
    if (e.touches && e.touches.length >= 3) {
      try {
        if (e.cancelable) e.preventDefault();
      } catch {}
      e.stopPropagation();
      triggerBlackout(2500);
    }
  };

  // 2. Mobile Hardware Volume Buttons & Screenshot Keys
  const handleKeyDown = (e: KeyboardEvent) => {
    const key = e.key || '';
    const code = e.code || '';
    const keyCode = e.keyCode;

    // Mobile Android Volume Down / Up / Snapshot / PrintScreen
    const isVolDown = key === 'AudioVolumeDown' || code === 'VolumeDown' || keyCode === 25;
    const isVolUp = key === 'AudioVolumeUp' || code === 'VolumeUp' || keyCode === 24;
    const isPrintScreen = key === 'PrintScreen' || key === 'Snapshot' || code === 'PrintScreen' || keyCode === 44;

    if (isVolDown || isVolUp || isPrintScreen) {
      triggerBlackout(2000);
    }
  };

  window.addEventListener('blur', handleBlur);
  window.addEventListener('focus', handleFocus);
  document.addEventListener('visibilitychange', handleVisibility);
  window.addEventListener('pagehide', handlePageHide);
  window.addEventListener('touchstart', handleTouchStart, { passive: false, capture: true });
  window.addEventListener('touchmove', handleTouchMove, { passive: false, capture: true });
  window.addEventListener('keydown', handleKeyDown, true);

  return () => {
    if (touchTimeout) clearTimeout(touchTimeout);
    if (focusDebounceTimeout) clearTimeout(focusDebounceTimeout);
    window.removeEventListener('blur', handleBlur);
    window.removeEventListener('focus', handleFocus);
    document.removeEventListener('visibilitychange', handleVisibility);
    window.removeEventListener('pagehide', handlePageHide);
    window.removeEventListener('touchstart', handleTouchStart, true);
    window.removeEventListener('touchmove', handleTouchMove, true);
    window.removeEventListener('keydown', handleKeyDown, true);
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
