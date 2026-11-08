import { useState, useEffect, useRef, useCallback } from 'react';

export interface UseWakeLockOptions {
  enabled?: boolean;
  onRequest?: () => void;
  onRelease?: () => void;
  onError?: (err: Error) => void;
}

// 1-pixel silent looping WebM video fallback for environments where Screen Wake Lock API is unavailable
const SILENT_VIDEO_FALLBACK =
  'data:video/webm;base64,GkXfo0AgQoaBAUL3gQFC8oEEQvOBCEKCQAR3ZWJtQoeBAkKFgQIYUkoAkE33gAzBgA0Ag0BD84EMQoJABHdlYm1Ch4ECQoWBAhhSQgCwTfeADMGADQCEQUHzgQ1Ch4EGUlUuWElhR0MAAH+BAkKFgQIYUkoAkE33gAzBgA0Ag0BD84EMQoJABHdlYm1Ch4ECQoWBAhhSQgCwTfeADMGADQCEQUHzgQ1Ch4EGUlUuWElhR0MAAH+BAkKFgQIYUkoA';

/**
 * Screen Wake Lock hook to prevent device screens from dimming or sleeping
 * during timed exams, OMR practice sessions, and mock tests.
 * 
 * Features:
 * - Native W3C Screen Wake Lock API (`navigator.wakeLock`)
 * - Auto-reacquisition on `visibilitychange` (when switching back to the tab)
 * - Safe silent looping video fallback for older mobile browsers
 * - Zero CPU / battery drain when paused or unmounted
 */
export function useWakeLock(options: boolean | UseWakeLockOptions = true) {
  const isEnabled = typeof options === 'boolean' ? options : !!options.enabled;
  const onRequest = typeof options === 'object' ? options.onRequest : undefined;
  const onRelease = typeof options === 'object' ? options.onRelease : undefined;
  const onError = typeof options === 'object' ? options.onError : undefined;

  const [isLocked, setIsLocked] = useState(false);
  const [isSupported, setIsSupported] = useState(false);
  const sentinelRef = useRef<WakeLockSentinel | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const isEnabledRef = useRef(isEnabled);

  isEnabledRef.current = isEnabled;

  useEffect(() => {
    setIsSupported(typeof navigator !== 'undefined' && 'wakeLock' in navigator);
  }, []);

  const acquire = useCallback(async () => {
    // 1. Primary: Native W3C Screen Wake Lock API
    if (typeof navigator !== 'undefined' && 'wakeLock' in navigator) {
      try {
        if (sentinelRef.current && !sentinelRef.current.released) {
          setIsLocked(true);
          return true;
        }

        const sentinel = await navigator.wakeLock.request('screen');
        sentinelRef.current = sentinel;
        setIsLocked(true);
        onRequest?.();

        sentinel.addEventListener('release', () => {
          if (sentinelRef.current === sentinel) {
            sentinelRef.current = null;
          }
          setIsLocked(false);
          onRelease?.();
        });

        return true;
      } catch (err: any) {
        // NotAllowedError is expected if low-power battery mode is active or user disallowed
        console.warn('Native Screen WakeLock request failed, falling back:', err?.message || err);
        sentinelRef.current = null;
        onError?.(err);
      }
    }

    // 2. Secondary Fallback: Silent looping invisible video
    try {
      if (!videoRef.current && typeof document !== 'undefined') {
        const video = document.createElement('video');
        video.setAttribute('playsinline', '');
        video.setAttribute('webkit-playsinline', '');
        video.setAttribute('muted', '');
        video.setAttribute('loop', '');
        video.muted = true;
        video.loop = true;
        video.style.position = 'fixed';
        video.style.top = '-9999px';
        video.style.left = '-9999px';
        video.style.width = '1px';
        video.style.height = '1px';
        video.style.opacity = '0';
        video.style.pointerEvents = 'none';
        video.src = SILENT_VIDEO_FALLBACK;
        document.body.appendChild(video);
        videoRef.current = video;
      }

      if (videoRef.current) {
        await videoRef.current.play();
        setIsLocked(true);
        onRequest?.();
        return true;
      }
    } catch (fallbackErr: any) {
      console.warn('WakeLock video fallback failed:', fallbackErr?.message || fallbackErr);
      onError?.(fallbackErr);
    }

    setIsLocked(false);
    return false;
  }, [onRequest, onRelease, onError]);

  const release = useCallback(async () => {
    if (sentinelRef.current && !sentinelRef.current.released) {
      try {
        await sentinelRef.current.release();
      } catch (err) {
        console.warn('Screen WakeLock release error:', err);
      } finally {
        sentinelRef.current = null;
      }
    }

    if (videoRef.current) {
      try {
        videoRef.current.pause();
        if (videoRef.current.parentNode) {
          videoRef.current.parentNode.removeChild(videoRef.current);
        }
      } catch {}
      videoRef.current = null;
    }

    setIsLocked(false);
  }, []);

  useEffect(() => {
    if (isEnabled) {
      acquire();
    } else {
      release();
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && isEnabledRef.current) {
        acquire();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      release();
    };
  }, [isEnabled, acquire, release]);

  return { isLocked, isSupported, request: acquire, release };
}
