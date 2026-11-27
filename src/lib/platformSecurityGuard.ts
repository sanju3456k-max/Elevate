import { Capacitor } from '@capacitor/core';

// Secret bypass key for authorized web users, testers, and educators
export const WEB_BYPASS_KEY_PARAM = 'web_access';
export const WEB_BYPASS_SECRET_VALUE = 'elevate_admin_pass';
export const STORAGE_WEB_AUTHORIZED_KEY = 'elevate_web_access_authorized_v1';

export interface PlatformGuardStatus {
  isBlocked: boolean;
  isNativeAndroid: boolean;
  isLocalDevelopment: boolean;
  hasWebBypass: boolean;
  isIosDevice: boolean;
  isIosStandalone: boolean;
  iosNeedsInstall: boolean;
  reason?: string;
}

export function detectIosDevice(): boolean {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  const isTraditionalIos = /iPad|iPhone|iPod/i.test(ua);
  const isIpadOs = navigator.platform === 'MacIntel' && (navigator.maxTouchPoints || 0) > 1;
  return isTraditionalIos || isIpadOs;
}

export function detectIosStandalonePwa(): boolean {
  if (typeof window === 'undefined' || !detectIosDevice()) return false;
  const nav = window.navigator as any;
  if (nav?.standalone === true) return true;
  try {
    if (window.matchMedia?.('(display-mode: standalone)').matches && (navigator.maxTouchPoints || 0) > 0) {
      return true;
    }
  } catch {}
  return false;
}

/**
 * Checks whether the current runtime environment is authorized to access Elevate.
 * Rules:
 * 1. Native Android builds (Capacitor) are ALWAYS authorized.
 * 2. Localhost / Local Development is ALWAYS whitelisted (unless previewing a guard flag).
 * 3. Master accounts (when authenticated) are ALWAYS whitelisted.
 * 4. iOS Devices: Safari tab shows "Add to Home Screen" install screen; installed iOS PWA (standalone) proceeds to student/admin gate.
 * 5. Android Browsers & Desktop Browsers (non-admin) remain blocked.
 */
export function checkPlatformAccess(isMasterAccount: boolean = false): PlatformGuardStatus {
  // Check Capacitor native Android
  let isNativeAndroid = false;
  try {
    isNativeAndroid = Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
  } catch {
    isNativeAndroid = false;
  }

  // Local development whitelist (never block local debugging or tests)
  const hostname = typeof window !== 'undefined' ? window.location.hostname : '';
  const isLocalDevelopment = (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname.endsWith('.local') ||
    hostname === ''
  );

  let previewMode: 'lock' | 'ios_safari' | 'ios_pwa' | null = null;
  if (typeof window !== 'undefined') {
    try {
      const params = new URLSearchParams(window.location.search);
      if (params.get('test_lock') === '1') previewMode = 'lock';
      else if ((isLocalDevelopment || isMasterAccount) && params.get('test_ios_safari') === '1') previewMode = 'ios_safari';
      else if ((isLocalDevelopment || isMasterAccount) && params.get('test_ios_pwa') === '1') previewMode = 'ios_pwa';
    } catch {}
  }

  const isIosDevice = previewMode === 'ios_safari' || previewMode === 'ios_pwa' || detectIosDevice();
  const isIosStandalone = previewMode === 'ios_pwa' || (previewMode !== 'ios_safari' && detectIosStandalonePwa());

  // Production Web Rule: ONLY an authenticated Master Account may unlock desktop/Android web.
  // Clear any stale localStorage bypass flag if the active session is not the Master Account.
  if (!isMasterAccount && typeof window !== 'undefined' && !isNativeAndroid && !isLocalDevelopment) {
    try {
      localStorage.removeItem(STORAGE_WEB_AUTHORIZED_KEY);
    } catch {}
  }

  const hasWebBypass = isMasterAccount;

  // Master account unlocks unless explicitly previewing an iOS state
  if (hasWebBypass && previewMode !== 'ios_safari' && previewMode !== 'ios_pwa') {
    if (typeof window !== 'undefined') {
      try {
        const url = new URL(window.location.href);
        if (url.searchParams.has('test_lock')) {
          url.searchParams.delete('test_lock');
          window.history.replaceState({}, '', url.toString());
        }
      } catch {}
    }
    return {
      isBlocked: false,
      isNativeAndroid,
      isLocalDevelopment,
      hasWebBypass: true,
      isIosDevice,
      isIosStandalone,
      iosNeedsInstall: false,
    };
  }

  if (previewMode === 'lock') {
    return {
      isBlocked: true,
      isNativeAndroid: false,
      isLocalDevelopment,
      hasWebBypass: false,
      isIosDevice: false,
      isIosStandalone: false,
      iosNeedsInstall: false,
      reason: 'Previewing Elevate Android-only native guard screen.',
    };
  }

  if (previewMode === 'ios_safari') {
    return {
      isBlocked: true,
      isNativeAndroid: false,
      isLocalDevelopment,
      hasWebBypass: false,
      isIosDevice: true,
      isIosStandalone: false,
      iosNeedsInstall: true,
      reason: 'Previewing iOS Safari Add-to-Home-Screen install screen.',
    };
  }

  if (previewMode === 'ios_pwa') {
    return {
      isBlocked: false,
      isNativeAndroid: false,
      isLocalDevelopment,
      hasWebBypass: false,
      isIosDevice: true,
      isIosStandalone: true,
      iosNeedsInstall: false,
    };
  }

  // Production web guard enforcement:
  // Active by default on public web domains (e.g. labselevate.vercel.app)
  // Local development (localhost) and Native Android builds remain automatically whitelisted.
  const isExplicitlyDisabled = import.meta.env.VITE_ENFORCE_ANDROID_ONLY === 'false';
  if (isExplicitlyDisabled) {
    return {
      isBlocked: false,
      isNativeAndroid,
      isLocalDevelopment,
      hasWebBypass,
      isIosDevice,
      isIosStandalone,
      iosNeedsInstall: false,
    };
  }

  // If running inside native Android app -> Authorized
  if (isNativeAndroid) {
    return {
      isBlocked: false,
      isNativeAndroid: true,
      isLocalDevelopment,
      hasWebBypass,
      isIosDevice: false,
      isIosStandalone: false,
      iosNeedsInstall: false,
    };
  }

  // If running in local development (localhost) -> Authorized
  if (isLocalDevelopment) {
    return {
      isBlocked: false,
      isNativeAndroid: false,
      isLocalDevelopment: true,
      hasWebBypass,
      isIosDevice,
      isIosStandalone,
      iosNeedsInstall: false,
    };
  }

  // iOS device on public web:
  // - In normal Safari tab: block full app and show "Add to Home Screen" install screen
  // - When launched from installed iOS Home Screen PWA (standalone): allow into InstitutePortalGate for student/admin auth
  if (isIosDevice) {
    if (!isIosStandalone) {
      return {
        isBlocked: true,
        isNativeAndroid: false,
        isLocalDevelopment: false,
        hasWebBypass: false,
        isIosDevice: true,
        isIosStandalone: false,
        iosNeedsInstall: true,
        reason: 'Install this app on your iPhone/iPad via Safari Add to Home Screen to continue.',
      };
    }
    return {
      isBlocked: false,
      isNativeAndroid: false,
      isLocalDevelopment: false,
      hasWebBypass: false,
      isIosDevice: true,
      isIosStandalone: true,
      iosNeedsInstall: false,
    };
  }

  // Otherwise, on Android browsers / desktop browsers without master authorization:
  return {
    isBlocked: true,
    isNativeAndroid: false,
    isLocalDevelopment: false,
    hasWebBypass: false,
    isIosDevice: false,
    isIosStandalone: false,
    iosNeedsInstall: false,
    reason: 'Elevate Labs Portal: Verification required for web access.',
  };
}

/**
 * Helper to unlock web access with the secret passkey
 */
export function unlockWebAccess(passkey: string): boolean {
  if (passkey.trim() === WEB_BYPASS_SECRET_VALUE || passkey.trim() === 'elevate_web') {
    try {
      localStorage.setItem(STORAGE_WEB_AUTHORIZED_KEY, 'true');
      return true;
    } catch {}
  }
  return false;
}

/**
 * Toggle runtime enforcement for live testing in browser
 */
export function setRuntimeGuardEnforcement(enabled: boolean): void {
  try {
    if (enabled) {
      localStorage.setItem('elevate_test_enforce_android_guard', 'true');
    } else {
      localStorage.removeItem('elevate_test_enforce_android_guard');
    }
  } catch {}
}
