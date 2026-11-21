/**
 * ============================================================================
 * ELEVATE NATIVE HARDWARE BRIDGE (Capacitor Android Core)
 * ============================================================================
 * 
 * Provides seamless 1-to-1 hardware integration for Android:
 * 1. Physical Hardware Back Button: Intercepts Android back key and controls modals/views.
 * 2. Haptic Vibration Engine: Physical tactile feedback on question selection and test submit.
 * 3. Status Bar & Immersive Notch: Edge-to-edge transparent system bars matching app theme.
 * 4. Screen Orientation Manager: Auto-landscape on full-screen player, locked portrait elsewhere.
 */

import { Capacitor } from '@capacitor/core';
import { App as CapApp } from '@capacitor/app';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';
import { StatusBar, Style } from '@capacitor/status-bar';
import { ScreenOrientation } from '@capacitor/screen-orientation';
import { triggerBack } from '../hooks/useBackNavigation';

let isNativeVideoPlayingState = false;

export const isNativeAndroid = (): boolean => {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
};

/**
 * Initializes native Android hardware controls when running inside the APK.
 */
export function initNativeHardwareIntegration(callbacks?: {
  onHardwareBack?: () => boolean; // return true if handled, false to exit/bubble
}): () => void {
  if (!isNativeAndroid()) return () => {};
  try {
    document.body.classList.add('is-native-android');
    document.documentElement.classList.add('is-native-android');
  } catch {}

  // 1. Configure Immersive Edge-to-Edge Status Bar
  try {
    StatusBar.setOverlaysWebView({ overlay: true }).catch(() => {});
    StatusBar.setStyle({ style: Style.Dark }).catch(() => {});
    StatusBar.setBackgroundColor({ color: '#00000000' }).catch(() => {});

    // Fetch and dynamically apply exact native status bar height to CSS variable
    try {
      const pip = (Capacitor as any).Plugins?.PipBridge;
      if (pip && typeof pip.getStatusBarHeight === 'function') {
        const p = pip.getStatusBarHeight();
        if (p && typeof p.then === 'function') {
          p.then((res: any) => {
            if (res?.heightDp && res.heightDp > 0) {
              document.documentElement.style.setProperty('--android-status-bar-height', `${res.heightDp}px`);
            }
          }).catch(() => {});
        }
      }
    } catch {}
  } catch (err) {
    console.warn('[NativeHardware] StatusBar setup notice:', err);
  }

  // 2. Hardware Back Button Listener (YouTube Android experience)
  const handleHardwareBack = async () => {
    console.log('[NativeHardware] handleHardwareBack triggered! isPlaying:', isNativeVideoPlayingState);
    if (callbacks?.onHardwareBack) {
      const handled = callbacks.onHardwareBack();
      console.log('[NativeHardware] callbacks.onHardwareBack returned:', handled);
      if (handled) return;
    }

    // A. Check if our in-app React back stack (fullscreen exit, video player minimize, open modals) handles it
    const backHandled = triggerBack();
    console.log('[NativeHardware] triggerBack returned:', backHandled);
    if (backHandled) return;

    // B. YouTube Style: If at root of app and video is playing, enter Android OS PiP on device home screen!
    if (isNativeVideoPlayingState) {
      console.log('[NativeHardware] entering native PiP from handleHardwareBack');
      const entered = await enterNativePip().catch(() => false);
      if (entered) return;
    }

    // C. Otherwise exit app cleanly
    console.log('[NativeHardware] exiting native app from handleHardwareBack');
    exitNativeApp();
  };

  let backListenerRemove: (() => void) | null = null;
  let pipBackListenerRemove: (() => void) | null = null;

  try {
    const pipPlugin = (Capacitor as any).Plugins?.PipBridge;
    if (pipPlugin && typeof pipPlugin.addListener === 'function') {
      const res = pipPlugin.addListener('onNativeBack', handleHardwareBack);
      if (res && typeof res.then === 'function') {
        res.then((handle: any) => {
          pipBackListenerRemove = () => handle?.remove?.();
        }).catch(() => {});
      } else if (res && typeof res.remove === 'function') {
        pipBackListenerRemove = () => res.remove();
      }
    }
  } catch (e) {
    console.warn('PipBridge addListener notice:', e);
  }

  window.addEventListener('nativeHardwareBack', handleHardwareBack);

  try {
    const res = CapApp.addListener('backButton', handleHardwareBack);
    if (res && typeof (res as any).then === 'function') {
      (res as any).then((handle: any) => {
        backListenerRemove = () => handle?.remove?.();
      }).catch(() => {});
    } else if (res && typeof (res as any).remove === 'function') {
      backListenerRemove = () => (res as any).remove();
    }
  } catch (e) {
    console.warn('CapApp addListener notice:', e);
  }

  return () => {
    window.removeEventListener('nativeHardwareBack', handleHardwareBack);
    if (backListenerRemove) backListenerRemove();
    if (pipBackListenerRemove) pipBackListenerRemove();
  };
}

/**
 * Triggers light physical tactile feedback (e.g. tapping an option in OMR or test).
 */
export function triggerLightHaptic(): void {
  if (!isNativeAndroid()) return;
  try {
    Haptics.impact({ style: ImpactStyle.Light }).catch(() => {});
  } catch {}
}

/**
 * Triggers medium physical tactile feedback (e.g. submitting a test, starting lecture).
 */
export function triggerMediumHaptic(): void {
  if (!isNativeAndroid()) return;
  try {
    Haptics.impact({ style: ImpactStyle.Medium }).catch(() => {});
  } catch {}
}

/**
 * Triggers success celebration vibration (e.g. 100% test score, enrollment success).
 */
export function triggerSuccessHaptic(): void {
  if (!isNativeAndroid()) return;
  try {
    Haptics.notification({ type: NotificationType.Success }).catch(() => {});
  } catch {}
}

/**
 * Locks screen orientation to landscape (for full-screen video player or exam paper).
 */
export async function lockOrientationLandscape(): Promise<void> {
  if (isNativeAndroid()) {
    try {
      await ScreenOrientation.lock({ orientation: 'landscape' });
    } catch {}
  } else if (typeof screen !== 'undefined' && screen.orientation && typeof (screen.orientation as any).lock === 'function') {
    try {
      await (screen.orientation as any).lock('landscape').catch(() => {});
    } catch {}
  }
}

/**
 * Unlocks screen orientation back to system default (auto-rotation based on sensor).
 * Releases any forced orientation lock so the device rotates freely between portrait & landscape.
 */
export async function unlockOrientationPortrait(): Promise<void> {
  if (isNativeAndroid()) {
    try {
      await ScreenOrientation.unlock();
    } catch {}
  } else if (typeof screen !== 'undefined') {
    try {
      if (screen.orientation && typeof (screen.orientation as any).unlock === 'function') {
        (screen.orientation as any).unlock();
      } else if ((screen as any).unlockOrientation) {
        (screen as any).unlockOrientation();
      }
    } catch {}
  }
}

export const unlockScreenOrientation = unlockOrientationPortrait;

/**
 * Triggers native Android Picture-in-Picture (PiP) mode.
 */
export async function enterNativePip(): Promise<boolean> {
  if (!isNativeAndroid()) return false;
  try {
    let bounds: { x: number; y: number; width: number; height: number } | undefined;
    const vidEl = document.querySelector('#global-persistent-player-host') || document.querySelector('iframe');
    if (vidEl) {
      const rect = vidEl.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        bounds = {
          x: Math.round(rect.left),
          y: Math.round(rect.top),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
        };
      }
    }
    const res = await (Capacitor as any).Plugins?.PipBridge?.enterPip({ bounds });
    return res?.success ?? true;
  } catch (err) {
    console.warn('[NativeHardware] enterPip failed:', err);
    return false;
  }
}

/**
 * Exits the native Android application cleanly.
 */
export function exitNativeApp(): void {
  if (!isNativeAndroid()) return;
  try {
    (Capacitor as any).Plugins?.PipBridge?.exitApp().catch(() => {
      CapApp.exitApp();
    });
  } catch {
    CapApp.exitApp();
  }
}

/**
 * Checks if native PiP is supported on the current device.
 */
export async function isNativePipSupported(): Promise<boolean> {
  if (!isNativeAndroid()) return false;
  try {
    const res = await (Capacitor as any).Plugins?.PipBridge?.isPipSupported();
    return Boolean(res?.supported);
  } catch {
    return false;
  }
}

/**
 * Updates video playback status to enable auto-PiP when student hits Home button.
 */
export function setNativePlaybackPlaying(isPlaying: boolean): void {
  isNativeVideoPlayingState = isPlaying;
  if (!isNativeAndroid()) return;
  try {
    (Capacitor as any).Plugins?.PipBridge?.setPlaybackState({ isPlaying });
  } catch {}
}

export function getIsNativePlaybackPlaying(): boolean {
  return isNativeVideoPlayingState;
}

/**
 * Synchronizes the native Android status bar with current theme.
 * Keeps status bar transparent (overlay: true) so page color seamlessly fills it,
 * while styling icons (dark/light) to always be crisp and legible.
 */
export function syncNativeStatusBarTheme(isDark: boolean): void {
  if (!isNativeAndroid()) return;
  try {
    StatusBar.setOverlaysWebView({ overlay: true }).catch(() => {});
    StatusBar.setStyle({ style: isDark ? Style.Dark : Style.Light }).catch(() => {});
    StatusBar.setBackgroundColor({ color: '#00000000' }).catch(() => {});

    // Synchronize native SharedPreferences so that on next launch the native splash screen matches the app theme
    const pip = (Capacitor as any).Plugins?.PipBridge;
    if (pip && typeof pip.setNativeTheme === 'function') {
      pip.setNativeTheme({ theme: isDark ? 'dark' : 'light' }).catch(() => {});
    }
  } catch {}
}

/**
 * Hides status bar for immersive fullscreen video playback.
 */
export function hideNativeStatusBar(): void {
  if (!isNativeAndroid()) return;
  try {
    StatusBar.hide().catch(() => {});
  } catch {}
}

/**
 * Restores status bar when exiting video fullscreen.
 */
export function showNativeStatusBar(isDark: boolean = true): void {
  if (!isNativeAndroid()) return;
  try {
    StatusBar.show().catch(() => {});
    StatusBar.setOverlaysWebView({ overlay: true }).catch(() => {});
    StatusBar.setStyle({ style: isDark ? Style.Dark : Style.Light }).catch(() => {});
    StatusBar.setBackgroundColor({ color: '#00000000' }).catch(() => {});
  } catch {}
}
