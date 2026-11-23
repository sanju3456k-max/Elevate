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
  reason?: string;
}

/**
 * Checks whether the current runtime environment is authorized to access Elevate.
 * Rules:
 * 1. Native Android builds (Capacitor) are ALWAYS authorized.
 * 2. Localhost / Local Development is ALWAYS whitelisted.
 * 3. Authorized web access via secret parameter or validated stored session is whitelisted.
 * 4. Master accounts (when authenticated) are ALWAYS whitelisted.
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

  // Check URL parameter for secret bypass key
  let hasUrlBypass = false;
  if (typeof window !== 'undefined') {
    try {
      const params = new URLSearchParams(window.location.search);
      const accessVal = params.get(WEB_BYPASS_KEY_PARAM) || params.get('access_key');
      if (accessVal === WEB_BYPASS_SECRET_VALUE || accessVal === 'elevate_web') {
        hasUrlBypass = true;
        // Persist authorization in localStorage for seamless subsequent navigation
        try {
          localStorage.setItem(STORAGE_WEB_AUTHORIZED_KEY, 'true');
        } catch {}
      }
    } catch {}
  }

  // Check stored web authorization
  let hasStoredBypass = false;
  if (typeof window !== 'undefined') {
    try {
      hasStoredBypass = localStorage.getItem(STORAGE_WEB_AUTHORIZED_KEY) === 'true';
    } catch {}
  }

  const hasWebBypass = hasUrlBypass || hasStoredBypass || isMasterAccount;

  // Master account or verified web bypass ALWAYS unlocks, even if previewing test_lock
  if (hasWebBypass) {
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
    };
  }

  // Preview test trigger: allowing developers/educators to preview the lock screen via ?test_lock=1
  if (typeof window !== 'undefined') {
    try {
      const params = new URLSearchParams(window.location.search);
      if (params.get('test_lock') === '1') {
        return {
          isBlocked: true,
          isNativeAndroid: false,
          isLocalDevelopment,
          hasWebBypass: false,
          reason: 'Previewing Elevate Android-only native guard screen.'
        };
      }
    } catch {}
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
    };
  }

  // If running inside native Android app -> Authorized
  if (isNativeAndroid) {
    return {
      isBlocked: false,
      isNativeAndroid: true,
      isLocalDevelopment,
      hasWebBypass,
    };
  }

  // If running in local development (localhost) -> Authorized
  if (isLocalDevelopment) {
    return {
      isBlocked: false,
      isNativeAndroid: false,
      isLocalDevelopment: true,
      hasWebBypass,
    };
  }

  // Otherwise, on public web browsers without master authorization:
  // Intercept and display the Welcome to Elevate Labs portal
  return {
    isBlocked: true,
    isNativeAndroid: false,
    isLocalDevelopment: false,
    hasWebBypass: false,
    reason: 'Elevate Labs Portal: Verification required for web access.'
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
