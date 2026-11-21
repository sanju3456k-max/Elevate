/**
 * Centralized Status Bar & PWA Theme-Color Synchronizer
 * 
 * Eliminates duplicate meta tags, conflicting media queries, and rapid
 * mutation drops that cause Android WebAPK status bars to flicker and fall back to black.
 */

let lastAppliedColor = '';

export function setAppThemeColor(color: string): void {
  if (typeof document === 'undefined') return;

  // Avoid redundant DOM updates if the color hasn't changed
  if (lastAppliedColor.toLowerCase() === color.toLowerCase()) return;

  try {
    let meta = document.getElementById('app-theme-color-meta') as HTMLMetaElement | null;
    if (!meta) {
      meta = document.querySelector('meta[name="theme-color"]');
    }

    if (meta) {
      meta.id = 'app-theme-color-meta';
      meta.removeAttribute('media');
      meta.setAttribute('content', color);
    } else {
      meta = document.createElement('meta');
      meta.id = 'app-theme-color-meta';
      meta.name = 'theme-color';
      meta.content = color;
      document.head.appendChild(meta);
    }

    // Clean up any stray/duplicate theme-color meta tags that confuse Chromium WebAPK
    const allThemeMetas = document.querySelectorAll('meta[name="theme-color"]');
    allThemeMetas.forEach((m) => {
      if (m !== meta) {
        m.remove();
      }
    });

    lastAppliedColor = color;
  } catch (err) {
    console.warn('Status bar theme color sync error:', err);
  }
}
