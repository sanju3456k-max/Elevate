import { Capacitor } from '@capacitor/core';

export const isNativeAndroid = (): boolean => {
  try {
    return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
  } catch {
    return false;
  }
};

export const isNotificationSupported = (): boolean => {
  if (isNativeAndroid()) return true;
  return typeof window !== 'undefined' && 'Notification' in window;
};

export const ELEVATE_INAPP_NOTIF_EVENT = 'elevate-inapp-notification';

export interface InAppNotificationPayload {
  title: string;
  body: string;
  id?: number | string;
  icon?: string;
  category?: 'lecture' | 'test' | 'ai' | 'notes' | 'system';
  targetBatchId?: string;
  targetChapterId?: string | null;
  targetLectureId?: string;
  targetTestId?: string;
  actionLabel?: string;
  batchTitle?: string;
  timestamp?: string;
  onClick?: () => void;
}

/**
 * Plays a subtle, pleasant harmonic notification bell chime using Web Audio API.
 * 100% offline, requires zero external sound files.
 */
export function playNotificationChime(): void {
  try {
    if (typeof window === 'undefined') return;
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }

    const now = ctx.currentTime;
    // Harmonic note 1 (E6 / 1318 Hz)
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(880, now); // A5
    osc1.frequency.exponentialRampToValueAtTime(1318.51, now + 0.08); // E6
    gain1.gain.setValueAtTime(0.0001, now);
    gain1.gain.exponentialRampToValueAtTime(0.15, now + 0.03);
    gain1.gain.exponentialRampToValueAtTime(0.0001, now + 0.45);
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(now);
    osc1.stop(now + 0.45);

    // Harmonic overtone note 2 (B6 / 1975 Hz)
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(1318.51, now + 0.08);
    osc2.frequency.exponentialRampToValueAtTime(1975.53, now + 0.16);
    gain2.gain.setValueAtTime(0.0001, now + 0.08);
    gain2.gain.exponentialRampToValueAtTime(0.08, now + 0.12);
    gain2.gain.exponentialRampToValueAtTime(0.0001, now + 0.65);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(now + 0.08);
    osc2.stop(now + 0.65);
  } catch {
    // Audio context may be restricted by autoplay policy before user interaction
  }
}

export async function getDeviceNotificationPermission(): Promise<'granted' | 'denied' | 'default'> {
  if (isNativeAndroid()) {
    try {
      const pip = (Capacitor as any).Plugins?.PipBridge || (window as any).Capacitor?.Plugins?.PipBridge;
      if (pip && typeof pip.requestNotificationPermission === 'function') {
        const res = await pip.requestNotificationPermission();
        if (res && res.granted) return 'granted';
      }
      return localStorage.getItem('elevate_native_notif_granted') === 'true' ? 'granted' : 'default';
    } catch {
      return 'default';
    }
  }

  if (typeof window !== 'undefined' && 'Notification' in window) {
    return Notification.permission;
  }
  return 'denied';
}

export async function requestDeviceNotificationPermission(): Promise<boolean> {
  // 1. Android Native via Capacitor PipBridge
  if (isNativeAndroid()) {
    try {
      const pip = (Capacitor as any).Plugins?.PipBridge || (window as any).Capacitor?.Plugins?.PipBridge;
      if (pip && typeof pip.requestNotificationPermission === 'function') {
        const res = await pip.requestNotificationPermission();
        const granted = !!res?.granted;
        if (granted) {
          localStorage.setItem('elevate_native_notif_granted', 'true');
        }
        return granted;
      }
    } catch (err) {
      console.warn('Native notification permission error:', err);
    }
    localStorage.setItem('elevate_native_notif_granted', 'true');
    return true;
  }

  // 2. Web Browser standard Notification API
  if (typeof window !== 'undefined' && 'Notification' in window) {
    try {
      if (Notification.permission === 'granted') {
        return true;
      }
      if (Notification.permission !== 'denied') {
        const permission = await Notification.requestPermission();
        return permission === 'granted';
      }
    } catch (err) {
      console.warn('Web notification permission error:', err);
    }
  }

  return false;
}

export async function sendDeviceNotification(params: InAppNotificationPayload): Promise<boolean> {
  const { title, body, id, icon = '/icon-192.png' } = params;

  // 1. Always trigger in-app interactive notification banner on Web & PWA
  if (typeof window !== 'undefined') {
    try {
      window.dispatchEvent(
        new CustomEvent(ELEVATE_INAPP_NOTIF_EVENT, {
          detail: {
            ...params,
            id: id || `notif-auto-${Date.now()}`,
            timestamp: params.timestamp || new Date().toISOString(),
          },
        })
      );
      playNotificationChime();
    } catch (err) {
      console.warn('Error dispatching in-app notification event:', err);
    }
  }

  // 2. Android Native via Capacitor PipBridge (for native Android app)
  if (isNativeAndroid()) {
    try {
      const pip = (Capacitor as any).Plugins?.PipBridge || (window as any).Capacitor?.Plugins?.PipBridge;
      if (pip && typeof pip.showNativeNotification === 'function') {
        const res = await pip.showNativeNotification({
          title,
          body,
          id: typeof id === 'number' ? id : Math.floor(Date.now() % 100000),
        });
        return !!res?.success;
      }
    } catch (err) {
      console.warn('Error sending native notification:', err);
    }
    return true;
  }

  // 3. Web Browser & PWA Notification (Desktop / OS level popup)
  if (typeof window !== 'undefined') {
    try {
      // 3A. Service Worker Notification (Primary standard for PWAs and Chrome)
      if ('serviceWorker' in navigator && Notification.permission === 'granted') {
        try {
          const reg = await navigator.serviceWorker.ready;
          if (reg && typeof reg.showNotification === 'function') {
            await reg.showNotification(title, {
              body,
              icon,
              badge: icon,
              tag: `elevate-${id || Date.now()}`,
              data: {
                id,
                targetBatchId: params.targetBatchId,
                targetChapterId: params.targetChapterId,
                targetLectureId: params.targetLectureId,
                targetTestId: params.targetTestId,
                url: '/',
              },
              vibrate: [200, 100, 200],
            } as any);
            return true;
          }
        } catch (swErr) {
          console.warn('[SW Notification fallback]', swErr);
        }
      }

      // 3B. Standard Window Notification fallback
      if ('Notification' in window && Notification.permission === 'granted') {
        const notif = new Notification(title, {
          body,
          icon,
          badge: icon,
          tag: `elevate-${id || Date.now()}`,
        });
        if (params.onClick) {
          notif.onclick = () => {
            window.focus();
            params.onClick?.();
          };
        }
        return true;
      }
    } catch (err) {
      console.warn('Error sending web notification:', err);
    }
  }

  return true;
}

