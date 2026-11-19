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

  // 1. Configure Immersive Edge-to-Edge Status Bar
  try {
    StatusBar.setOverlaysWebView({ overlay: true }).catch(() => {});
    StatusBar.setStyle({ style: Style.Dark }).catch(() => {});
    StatusBar.setBackgroundColor({ color: '#00000000' }).catch(() => {});
  } catch (err) {
    console.warn('[NativeHardware] StatusBar setup notice:', err);
  }

  // 2. Hardware Back Button Listener
  let backListenerRemove: (() => void) | null = null;
  CapApp.addListener('backButton', ({ canGoBack }) => {
    if (callbacks?.onHardwareBack) {
      const handled = callbacks.onHardwareBack();
      if (handled) return;
    }

    if (canGoBack) {
      window.history.back();
    } else {
      // Exit app if at top-level root
      CapApp.exitApp();
    }
  }).then((handle) => {
    backListenerRemove = () => handle.remove();
  }).catch(() => {});

  return () => {
    if (backListenerRemove) backListenerRemove();
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
  if (!isNativeAndroid()) return;
  try {
    await ScreenOrientation.lock({ orientation: 'landscape' });
  } catch {}
}

/**
 * Unlocks screen orientation back to standard portrait mode.
 */
export async function unlockOrientationPortrait(): Promise<void> {
  if (!isNativeAndroid()) return;
  try {
    await ScreenOrientation.lock({ orientation: 'portrait' });
  } catch {}
}

/**
 * Triggers native Android Picture-in-Picture (PiP) mode.
 */
export async function enterNativePip(): Promise<boolean> {
  if (!isNativeAndroid()) return false;
  try {
    const res = await (Capacitor as any).Plugins?.PipBridge?.enterPip();
    return res?.success ?? true;
  } catch (err) {
    console.warn('[NativeHardware] enterPip failed:', err);
    return false;
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
  if (!isNativeAndroid()) return;
  try {
    (Capacitor as any).Plugins?.PipBridge?.setPlaybackState({ isPlaying });
  } catch {}
}
