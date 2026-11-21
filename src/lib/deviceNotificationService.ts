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

export async function sendDeviceNotification(params: {
  title: string;
  body: string;
  id?: number;
  icon?: string;
  onClick?: () => void;
}): Promise<boolean> {
  const { title, body, id, icon = '/icons/icon-192x192.png' } = params;

  // 1. Android Native via Capacitor PipBridge
  if (isNativeAndroid()) {
    try {
      const pip = (Capacitor as any).Plugins?.PipBridge || (window as any).Capacitor?.Plugins?.PipBridge;
      if (pip && typeof pip.showNativeNotification === 'function') {
        const res = await pip.showNativeNotification({
          title,
          body,
          id: id || Math.floor(Date.now() % 100000),
        });
        return !!res?.success;
      }
    } catch (err) {
      console.warn('Error sending native notification:', err);
    }
  }

  // 2. Web Browser Notification
  if (typeof window !== 'undefined' && 'Notification' in window) {
    try {
      if (Notification.permission === 'granted') {
        const notif = new Notification(title, {
          body,
          icon,
          badge: icon,
          tag: `elevate-${Date.now()}`,
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

  return false;
}
