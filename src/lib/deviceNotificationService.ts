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
 * Notification chime no-op (Custom audio chime disabled in web app in favor of native system notifications)
 */
export function playNotificationChime(): void {
  // No-op: Native system notifications handle alert sounds
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

  // 1. Android Native via Capacitor PipBridge (for native Android app)
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

