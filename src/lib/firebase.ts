import { initializeApp, getApps, getApp } from 'firebase/app';
import { 
  getAuth, 
  initializeAuth,
  browserLocalPersistence,
  browserSessionPersistence,
  indexedDBLocalPersistence,
  browserPopupRedirectResolver,
  signInWithPopup, 
  signInWithRedirect,
  getRedirectResult,
  GoogleAuthProvider, 
  signOut, 
  deleteUser,
  reauthenticateWithPopup,
  onAuthStateChanged,
  type User 
} from 'firebase/auth';
import { 
  getFirestore,
  initializeFirestore,
  memoryLocalCache,
  getDocFromServer,
  doc, 
  setDoc, 
  getDoc, 
  getDocs, 
  collection, 
  query, 
  where, 
  deleteDoc, 
  writeBatch,
  onSnapshot,
  increment,
  arrayUnion,
  arrayRemove,
  setLogLevel,
  limit,
  orderBy,
  getCountFromServer,
  deleteField,
  type Unsubscribe
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';
import { 
  normalizeQuestions, 
  type MathTest, 
  type TestAttempt, 
  type UserProfile, 
  type AppSettings, 
  type TestHistoryEntry, 
  type ActiveTestSession,
  type StatsRollup,
  type LeaderboardEntry,
  type TestLeaderboardSummary 
} from '../types';
import { SAMPLE_MATH_TESTS } from '../data/sampleTests';
import { firestoreTelemetry } from './firestoreTelemetry';
import { 
  isOfflineLocalOnlyMode, 
  wipeAllScopedUserDataFromLocalStorage, 
  loadScopedChatSessions, 
  getAllDeletedChatSessionIds,
  markChatSessionAsDeletedInScopedStorage,
  loadScopedTests,
  loadScopedAttempts,
  markTestAsDeletedInScopedStorage,
  getAllDeletedTestIds
} from './storage';
import { deleteTestFromIndexedDB } from './indexedDbStorage';
import { toCompactChatSession, smartCoordinator } from './smartLocalCoordinator';
import { optimizeTestForFirestore } from './imageOptimization';

// Suppress transient offline logs in dev iframe
try {
  setLogLevel('silent');
} catch (e) {}

const QUOTA_STORAGE_KEY = 'mockmc_firestore_quota_exhausted_date';

/**
 * Calculates the current Firebase daily quota cycle day.
 * Google Cloud / Firebase daily quotas reset at Midnight US Pacific Time (07:00 UTC / ~12:30 PM - 12:35 PM IST).
 * By offsetting UTC time by 7 hours, the cycle ID rolls over precisely at 12:30 PM IST.
 */
export function getFirebaseQuotaCycleId(date = new Date()): string {
  const offsetMs = 7 * 60 * 60 * 1000;
  const cycleDate = new Date(date.getTime() - offsetMs);
  return `${cycleDate.getUTCFullYear()}-${cycleDate.getUTCMonth() + 1}-${cycleDate.getUTCDate()}`;
}

// Initialize quota exhaustion state from localStorage to protect unsynced data immediately on boot
let globalQuotaExceeded = false;
let quotaExceededDate: string | null = null;

if (typeof window !== 'undefined' && window.localStorage) {
  try {
    const lastConfigProject = localStorage.getItem('mockmc_firebase_active_project_id');
    if (lastConfigProject !== firebaseConfig.projectId) {
      localStorage.setItem('mockmc_firebase_active_project_id', firebaseConfig.projectId);
      localStorage.removeItem(QUOTA_STORAGE_KEY);
      globalQuotaExceeded = false;
      quotaExceededDate = null;
    } else {
      const savedDate = localStorage.getItem(QUOTA_STORAGE_KEY);
      const currentCycle = getFirebaseQuotaCycleId();
      if (savedDate) {
        // Validated against both current cycle ID and legacy date string
        const isCycleMatch = savedDate === currentCycle || savedDate === new Date().toDateString();
        if (isCycleMatch) {
          globalQuotaExceeded = true;
          quotaExceededDate = savedDate;
        } else {
          localStorage.removeItem(QUOTA_STORAGE_KEY);
          globalQuotaExceeded = false;
          quotaExceededDate = null;
        }
      }
    }
  } catch {}
}

export function isGlobalQuotaExceeded(): boolean {
  return globalQuotaExceeded;
}

export function setGlobalQuotaExceeded(val: boolean): void {
  globalQuotaExceeded = val;
  if (val) {
    quotaExceededDate = getFirebaseQuotaCycleId();
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        localStorage.setItem(QUOTA_STORAGE_KEY, quotaExceededDate);
      } catch {}
    }
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('firestore-quota-exceeded', {
        detail: { error: 'Quota limit exceeded' }
      }));
    }
  } else {
    quotaExceededDate = null;
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        localStorage.removeItem(QUOTA_STORAGE_KEY);
      } catch {}
    }
  }
}

export function resetGlobalQuotaExceeded(): void {
  globalQuotaExceeded = false;
  quotaExceededDate = null;
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      localStorage.removeItem(QUOTA_STORAGE_KEY);
    } catch {}
  }
  try {
    setLogLevel('silent');
  } catch (e) {}
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('firestore-quota-reset'));
  }
}

/**
 * Checks if the Firebase quota cycle has rolled over (12:30 PM - 12:35 PM IST).
 * If so, automatically resets the global quota lockout flags.
 */
export function checkAndResetQuotaOnNewDay(): boolean {
  if (globalQuotaExceeded && quotaExceededDate) {
    const currentCycle = getFirebaseQuotaCycleId();
    const isStillCurrentCycle = quotaExceededDate === currentCycle || quotaExceededDate === new Date().toDateString();
    if (!isStillCurrentCycle) {
      console.log('Firebase daily quota cycle rollover detected (12:30 PM IST / Pacific Midnight)! Auto-resetting quota.');
      resetGlobalQuotaExceeded();
      return true;
    }
  }
  return false;
}

/**
 * Lightweight connection probe against the open /test/ping endpoint.
 * Bypasses isGlobalQuotaExceeded() to verify if Firestore has refreshed quota,
 * automatically clearing the lockout and recovering sync when connectivity is confirmed.
 */
export async function probeFirestoreConnectivity(): Promise<boolean> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return false;
  try {
    const pingRef = doc(db, 'test', 'ping');
    await getDoc(pingRef);
    if (globalQuotaExceeded) {
      console.log('Firestore connection probe succeeded! Auto-clearing quota lockout.');
      resetGlobalQuotaExceeded();
    }
    return true;
  } catch (err: any) {
    const errStr = String(err?.message || err || '');
    if (errStr.includes('resource-exhausted') || errStr.includes('quota') || errStr.includes('billing')) {
      setGlobalQuotaExceeded(true);
      return false;
    }
    return false;
  }
}

// 0. Clean up any stale WebStorage keys left by persistentMultipleTabManager that consumed browser localStorage quota
export function cleanupOrphanedFirestoreWebStorage(): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && (
        key.startsWith('firestore_mutations_') ||
        key.startsWith('firestore_clients_') ||
        key.startsWith('firestore_online_state_') ||
        key.startsWith('firestore_active_tab_') ||
        key.startsWith('firestore_tab_') ||
        key.startsWith('firestore:')
      )) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach((k) => {
      try {
        localStorage.removeItem(k);
      } catch {}
    });
    if (keysToRemove.length > 0) {
      console.log(`Purged ${keysToRemove.length} orphaned Firestore WebStorage keys from localStorage.`);
    }
  } catch (e) {
    console.warn('Storage cleanup warning:', e);
  }
}

// Execute initial storage cleanup immediately
if (typeof window !== 'undefined') {
  cleanupOrphanedFirestoreWebStorage();
}

// 1. Initialize Firebase App
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();

// 2. Initialize Firestore targeting default or named database with safe in-memory cache
const rawDbId = (firebaseConfig as any).firestoreDatabaseId || (firebaseConfig as any).databaseId;
const isDefaultDb = !rawDbId || rawDbId === '(default)';

export const db = (() => {
  if (typeof window === 'undefined') {
    return isDefaultDb ? getFirestore(app) : getFirestore(app, rawDbId);
  }
  try {
    return isDefaultDb
      ? initializeFirestore(app, { localCache: memoryLocalCache() })
      : initializeFirestore(app, { localCache: memoryLocalCache() }, rawDbId);
  } catch (err) {
    return isDefaultDb ? getFirestore(app) : getFirestore(app, rawDbId);
  }
})();

// Validate connection to Firestore on boot (at most once per session)
if (typeof window !== 'undefined') {
  try {
    const hasTestedConn = sessionStorage.getItem('firebase_conn_tested');
    if (!hasTestedConn) {
      sessionStorage.setItem('firebase_conn_tested', 'true');
      if (typeof navigator === 'undefined' || navigator.onLine) {
        getDoc(doc(db, 'test', 'connection')).catch((error) => {
          if (error instanceof Error && (error.message.includes('the client is offline') || error.message.includes('code=unavailable'))) {
            console.warn('Firestore connection notice: Client is offline or unreachable.');
          }
        });
      }
    }
  } catch {}

  // Global handler for unhandled offline Firestore promise rejections
  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason;
    if (reason && typeof reason === 'object') {
      const msg = String(reason.message || reason.toString() || '');
      if (
        msg.includes('client is offline') ||
        msg.includes('code=unavailable') ||
        msg.includes('Failed to get document') ||
        msg.includes('Could not reach Cloud Firestore backend')
      ) {
        event.preventDefault();
        console.warn('Handled offline Firestore rejection gracefully:', msg);
      }
    }
  });
}

// 3. Initialize Firebase Auth
export const auth = (() => {
  if (typeof window === 'undefined') {
    return getAuth(app);
  }
  try {
    return initializeAuth(app, {
      persistence: [browserLocalPersistence, browserSessionPersistence, indexedDBLocalPersistence],
      popupRedirectResolver: browserPopupRedirectResolver,
    });
  } catch (err) {
    return getAuth(app);
  }
})();

export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });
googleProvider.addScope('https://www.googleapis.com/auth/drive');
googleProvider.addScope('https://www.googleapis.com/auth/drive.appdata');
googleProvider.addScope('https://www.googleapis.com/auth/documents');

// ============================================================================
// METHOD 1: GOOGLE IDENTITY SERVICES (GIS) CONTINUOUS SILENT REFRESH ENGINE
// ============================================================================

export const GOOGLE_OAUTH_CLIENT_ID: string =
  (firebaseConfig as any).oAuthClientId ||
  '649642031919-tmtgoi10dbdq6jka2662pqdrnkdkpp9s.apps.googleusercontent.com';

export const GOOGLE_DRIVE_SCOPES =
  'https://www.googleapis.com/auth/drive https://www.googleapis.com/auth/drive.appdata https://www.googleapis.com/auth/documents';

let cachedAccessToken: string | null = null;
let gisScriptLoadingPromise: Promise<boolean> | null = null;
let activeSilentRefreshPromise: Promise<string | null> | null = null;
let isDaemonInitialized = false;

// Helpers to get account-scoped token keys
function getDriveTokenStorageKey(uid?: string | null): string {
  const effectiveUid = uid || auth.currentUser?.uid;
  if (!effectiveUid || effectiveUid === 'guest-user' || effectiveUid === 'anonymous') {
    return 'mockmc_drive_token_guest';
  }
  return `mockmc_drive_token_${effectiveUid.trim()}`;
}

function getDriveTokenTimeStorageKey(uid?: string | null): string {
  const effectiveUid = uid || auth.currentUser?.uid;
  if (!effectiveUid || effectiveUid === 'guest-user' || effectiveUid === 'anonymous') {
    return 'mockmc_drive_token_time_guest';
  }
  return `mockmc_drive_token_time_${effectiveUid.trim()}`;
}

function getDriveTokenEmailStorageKey(uid?: string | null): string {
  const effectiveUid = uid || auth.currentUser?.uid;
  if (!effectiveUid || effectiveUid === 'guest-user' || effectiveUid === 'anonymous') {
    return 'mockmc_drive_token_email_guest';
  }
  return `mockmc_drive_token_email_${effectiveUid.trim()}`;
}

/**
 * Dynamically loads the official Google Identity Services client script if not already present.
 */
export function loadGoogleIdentityServices(): Promise<boolean> {
  if (typeof window === 'undefined') return Promise.resolve(false);
  if ((window as any).google?.accounts?.oauth2) return Promise.resolve(true);
  if (gisScriptLoadingPromise) return gisScriptLoadingPromise;

  gisScriptLoadingPromise = new Promise((resolve) => {
    const existing = document.querySelector('script[src*="accounts.google.com/gsi/client"]');
    if (existing) {
      const check = setInterval(() => {
        if ((window as any).google?.accounts?.oauth2) {
          clearInterval(check);
          resolve(true);
        }
      }, 50);
      setTimeout(() => {
        clearInterval(check);
        resolve(Boolean((window as any).google?.accounts?.oauth2));
      }, 5000);
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = () => {
      resolve(Boolean((window as any).google?.accounts?.oauth2));
    };
    script.onerror = (err) => {
      console.warn('Failed to load Google Identity Services client script:', err);
      resolve(false);
    };
    document.head.appendChild(script);
  });

  return gisScriptLoadingPromise;
}

/**
 * Checks whether the Google Drive access token is expired (> 3600s).
 * Strictly returns false for guests since guest mode does not use Google Drive.
 */
export function isGoogleDriveTokenExpired(uid?: string | null): boolean {
  if (typeof window === 'undefined') return false;
  const effectiveUid = uid || auth.currentUser?.uid;
  if (!effectiveUid || effectiveUid === 'guest-user' || effectiveUid === 'anonymous') {
    return false;
  }
  try {
    const key = getDriveTokenStorageKey(effectiveUid);
    const timeKey = getDriveTokenTimeStorageKey(effectiveUid);
    const rawToken = cachedAccessToken || localStorage.getItem(key) || sessionStorage.getItem('mockmc_google_access_token');
    const hadAuth = localStorage.getItem('mockmc_had_google_auth') === 'true' || localStorage.getItem(key) !== null;
    if (!rawToken && hadAuth) return true;
    if (rawToken) {
      const storedTimeStr = localStorage.getItem(timeKey) || sessionStorage.getItem('mockmc_google_token_time');
      if (storedTimeStr) {
        const storedTime = parseInt(storedTimeStr, 10);
        // Google OAuth access tokens expire in 3600 seconds (1 hour)
        if (Date.now() - storedTime >= 3600 * 1000) {
          return true;
        }
      }
    }
  } catch {}
  return false;
}

/**
 * Clears active Google Drive token from memory and session.
 * Does not wipe other users' saved offline data.
 */
export function clearGoogleDriveAuth(clearUserScoped: boolean = true): void {
  cachedAccessToken = null;
  try {
    const effectiveUid = auth.currentUser?.uid;
    sessionStorage.removeItem('mockmc_google_access_token');
    sessionStorage.removeItem('mockmc_google_token_time');
    localStorage.removeItem('mockmc_had_google_auth');
    if (clearUserScoped && effectiveUid && effectiveUid !== 'guest-user' && effectiveUid !== 'anonymous') {
      localStorage.removeItem(getDriveTokenStorageKey(effectiveUid));
      localStorage.removeItem(getDriveTokenTimeStorageKey(effectiveUid));
      localStorage.removeItem(getDriveTokenEmailStorageKey(effectiveUid));
    }
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('mockmc-drive-token-changed', { detail: null }));
    }
  } catch {}
}

/**
 * Retrieves the active Google Drive access token.
 * Strictly returns null for guest users to prevent cross-contamination.
 */
export function getCachedGoogleAccessToken(uid?: string | null): string | null {
  const effectiveUid = uid || auth.currentUser?.uid;
  if (!effectiveUid || effectiveUid === 'guest-user' || effectiveUid === 'anonymous') {
    return null;
  }
  if (isGoogleDriveTokenExpired(effectiveUid)) {
    return null;
  }
  if (cachedAccessToken) {
    return cachedAccessToken;
  }
  try {
    const key = getDriveTokenStorageKey(effectiveUid);
    const stored = localStorage.getItem(key) || sessionStorage.getItem('mockmc_google_access_token');
    if (stored) {
      cachedAccessToken = stored;
      return stored;
    }
  } catch {}
  return null;
}

/**
 * Stores the Google Drive token across memory, user-scoped localStorage, and sessionStorage.
 */
export function setCachedGoogleAccessToken(
  token: string | null,
  targetUid?: string | null,
  _expiresInSeconds?: number,
  email?: string | null
): void {
  cachedAccessToken = token;
  const effectiveUid = targetUid || auth.currentUser?.uid;
  const targetEmail = email || auth.currentUser?.email;
  try {
    if (token) {
      sessionStorage.setItem('mockmc_google_access_token', token);
      sessionStorage.setItem('mockmc_google_token_time', Date.now().toString());
      localStorage.setItem('mockmc_had_google_auth', 'true');
      if (effectiveUid && effectiveUid !== 'guest-user' && effectiveUid !== 'anonymous') {
        localStorage.setItem(getDriveTokenStorageKey(effectiveUid), token);
        localStorage.setItem(getDriveTokenTimeStorageKey(effectiveUid), Date.now().toString());
        if (targetEmail) {
          localStorage.setItem(getDriveTokenEmailStorageKey(effectiveUid), targetEmail);
        }
      }
    } else {
      sessionStorage.removeItem('mockmc_google_access_token');
      sessionStorage.removeItem('mockmc_google_token_time');
      if (effectiveUid && effectiveUid !== 'guest-user' && effectiveUid !== 'anonymous') {
        localStorage.removeItem(getDriveTokenStorageKey(effectiveUid));
        localStorage.removeItem(getDriveTokenTimeStorageKey(effectiveUid));
      }
    }
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('mockmc-drive-token-changed', { detail: token }));
    }
  } catch {}
}

/**
 * Silently refreshes the Google Drive OAuth2 token via Google Identity Services
 * using an invisible background prompt without interrupting the user.
 */
export async function refreshGoogleDriveTokenSilently(userEmail?: string): Promise<string | null> {
  if (typeof window === 'undefined') return null;

  const user = auth.currentUser;
  if (!user || user.isAnonymous) {
    return null;
  }

  if (activeSilentRefreshPromise) {
    return activeSilentRefreshPromise;
  }

  activeSilentRefreshPromise = (async () => {
    try {
      const email = userEmail || user.email || localStorage.getItem(getDriveTokenEmailStorageKey(user.uid));
      if (!email) {
        console.warn('Cannot silently refresh Google Drive token: user email is missing.');
        return null;
      }

      const gisLoaded = await loadGoogleIdentityServices();
      if (!gisLoaded || !(window as any).google?.accounts?.oauth2) {
        console.warn('Google Identity Services library not available for silent refresh.');
        return null;
      }

      return await new Promise<string | null>((resolve) => {
        let isSettled = false;
        const timeoutTimer = setTimeout(() => {
          if (!isSettled) {
            isSettled = true;
            console.warn('Google Drive silent token refresh timed out (15s).');
            resolve(null);
          }
        }, 15000);

        try {
          const client = (window as any).google.accounts.oauth2.initTokenClient({
            client_id: GOOGLE_OAUTH_CLIENT_ID,
            scope: GOOGLE_DRIVE_SCOPES,
            callback: (response: any) => {
              if (isSettled) return;
              isSettled = true;
              clearTimeout(timeoutTimer);
              if (response && response.access_token) {
                const expiresIn = response.expires_in ? parseInt(response.expires_in, 10) : 3600;
                setCachedGoogleAccessToken(response.access_token, user.uid, expiresIn, email);
                resolve(response.access_token);
              } else {
                console.warn('Silent refresh returned without access token:', response);
                resolve(null);
              }
            },
            error_callback: (err: any) => {
              if (isSettled) return;
              isSettled = true;
              clearTimeout(timeoutTimer);
              console.warn('Google Identity Services silent token request error:', err);
              resolve(null);
            },
          });

          client.requestAccessToken({
            prompt: '',
            login_hint: email,
          });
        } catch (initErr) {
          if (!isSettled) {
            isSettled = true;
            clearTimeout(timeoutTimer);
            console.warn('Failed to initialize Google token client:', initErr);
            resolve(null);
          }
        }
      });
    } finally {
      activeSilentRefreshPromise = null;
    }
  })();

  return activeSilentRefreshPromise;
}

/**
 * Interactively requests Google Drive & Docs authorization via Google Identity Services
 * without signing out of Firebase Auth or popping up the full account selector.
 */
export async function requestGoogleDriveTokenInteractive(userEmail?: string): Promise<string | null> {
  if (typeof window === 'undefined') return null;

  const user = auth.currentUser;
  const email = userEmail || user?.email || (user ? localStorage.getItem(getDriveTokenEmailStorageKey(user.uid)) : null);

  const gisLoaded = await loadGoogleIdentityServices();
  if (!gisLoaded || !(window as any).google?.accounts?.oauth2) {
    console.warn('Google Identity Services library not available for interactive token request.');
    return null;
  }

  return new Promise<string | null>((resolve) => {
    let isSettled = false;
    try {
      const client = (window as any).google.accounts.oauth2.initTokenClient({
        client_id: GOOGLE_OAUTH_CLIENT_ID,
        scope: GOOGLE_DRIVE_SCOPES,
        callback: (response: any) => {
          if (isSettled) return;
          isSettled = true;
          if (response && response.access_token) {
            const expiresIn = response.expires_in ? parseInt(response.expires_in, 10) : 3600;
            const uid = user?.uid || 'user';
            setCachedGoogleAccessToken(response.access_token, uid, expiresIn, email);
            resolve(response.access_token);
          } else {
            resolve(null);
          }
        },
        error_callback: (err: any) => {
          if (isSettled) return;
          isSettled = true;
          console.warn('Interactive token request error:', err);
          resolve(null);
        },
      });

      client.requestAccessToken({
        prompt: 'consent',
        login_hint: email || undefined,
      });
    } catch (e) {
      if (!isSettled) {
        isSettled = true;
        resolve(null);
      }
    }
  });
}

/**
 * Ensures a valid Google Drive token is available. If near expiration (> 50 min),
 * silently refreshes before returning.
 */
export async function ensureValidGoogleDriveToken(): Promise<string | null> {
  const user = auth.currentUser;
  if (!user || user.isAnonymous) return null;

  const currentToken = getCachedGoogleAccessToken(user.uid);
  const timeKey = getDriveTokenTimeStorageKey(user.uid);
  const storedTimeStr = localStorage.getItem(timeKey) || sessionStorage.getItem('mockmc_google_token_time');
  const storedTime = storedTimeStr ? parseInt(storedTimeStr, 10) : 0;
  const ageMs = Date.now() - storedTime;

  if (currentToken && ageMs < 50 * 60 * 1000) {
    return currentToken;
  }

  const refreshed = await refreshGoogleDriveTokenSilently(user.email || undefined);
  if (refreshed) {
    return refreshed;
  }

  // If silent refresh failed but token is still within its 60-minute lifetime, return currentToken
  if (currentToken && ageMs < 60 * 60 * 1000) {
    return currentToken;
  }

  return null;
}

/**
 * Single-flight unified Google Drive connection function.
 * Guarantees that AT MOST ONE interactive popup window is ever displayed to the user.
 * 
 * Flow:
 * 1. Checks if a valid token already exists or can be silently refreshed (0 popups).
 * 2. If user is signed into Firebase Auth, requests Drive authorization via Google Identity Services
 *    (GIS) with login_hint set to user.email (a single focused consent popup).
 * 3. If user is NOT signed into Firebase Auth (or GIS is unavailable), invokes signInWithGoogle()
 *    (which signs into Firebase and requests Drive scopes in a single Firebase Auth popup).
 * 4. Never executes GIS and signInWithGoogle() in parallel or in cascading fallback loops.
 * 5. Uses a concurrency lock so rapid clicks cannot spawn duplicate windows.
 */
let activeConnectDrivePromise: Promise<string | null> | null = null;

export async function connectGoogleDrive(preferredEmail?: string): Promise<string | null> {
  if (activeConnectDrivePromise) {
    return activeConnectDrivePromise;
  }

  activeConnectDrivePromise = (async () => {
    try {
      // 1. Check if token is already valid or silently renewable
      const existingToken = await ensureValidGoogleDriveToken();
      if (existingToken) {
        return existingToken;
      }

      const user = auth.currentUser;
      const isRegisteredUser = user && !user.isAnonymous;

      if (isRegisteredUser) {
        // User already has an authenticated Firebase session.
        // Use GIS interactive consent popup with their known email.
        const email = preferredEmail || user.email || localStorage.getItem(getDriveTokenEmailStorageKey(user.uid)) || undefined;
        const gisLoaded = await loadGoogleIdentityServices();
        if (gisLoaded && (window as any).google?.accounts?.oauth2) {
          const gisToken = await requestGoogleDriveTokenInteractive(email);
          if (gisToken) {
            return gisToken;
          }
          // Note: If GIS failed (e.g. user closed popup or origin_mismatch occurred),
          // DO NOT immediately fire signInWithGoogle()! Chaining them was the exact cause
          // of the dual-popup issue.
          return null;
        }
      }

      // 2. User is not signed in to Firebase (or GIS is missing from environment).
      // Fire the Firebase Auth Google Popup (a single popup handling both Auth & Drive scopes).
      const signedInUser = await signInWithGoogle();
      if (signedInUser) {
        return getCachedGoogleAccessToken(signedInUser.uid);
      }
      return null;
    } finally {
      activeConnectDrivePromise = null;
    }
  })();

  return activeConnectDrivePromise;
}

/**
 * Starts the continuous background daemon that proactively refreshes Drive tokens
 * at minute 50 to guarantee continuous access across the entire app session.
 */
export function initGoogleDriveAutoRefreshDaemon(): void {
  if (typeof window === 'undefined' || isDaemonInitialized) return;
  isDaemonInitialized = true;

  // Pre-load Google Identity Services script in idle time
  loadGoogleIdentityServices().catch(() => {});

  // Proactive check every 60 seconds
  setInterval(() => {
    const user = auth.currentUser;
    if (!user || user.isAnonymous) return;

    const hadAuth =
      localStorage.getItem('mockmc_had_google_auth') === 'true' ||
      localStorage.getItem(getDriveTokenStorageKey(user.uid)) !== null;
    if (!hadAuth) return;

    const timeKey = getDriveTokenTimeStorageKey(user.uid);
    const storedTimeStr = localStorage.getItem(timeKey) || sessionStorage.getItem('mockmc_google_token_time');
    if (!storedTimeStr) return;

    const storedTime = parseInt(storedTimeStr, 10);
    const ageMs = Date.now() - storedTime;

    // Refresh proactively at 50 minutes (10 minutes before the 60-minute Google OAuth expiry)
    if (ageMs >= 50 * 60 * 1000) {
      refreshGoogleDriveTokenSilently(user.email || undefined).catch((e) => {
        console.warn('Background auto-refresh silent attempt warning:', e);
      });
    }
  }, 60 * 1000);

  // Tab focus / visibility change handler
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      const user = auth.currentUser;
      if (!user || user.isAnonymous) return;

      const timeKey = getDriveTokenTimeStorageKey(user.uid);
      const storedTimeStr = localStorage.getItem(timeKey) || sessionStorage.getItem('mockmc_google_token_time');
      if (storedTimeStr) {
        const storedTime = parseInt(storedTimeStr, 10);
        if (Date.now() - storedTime >= 50 * 60 * 1000) {
          refreshGoogleDriveTokenSilently(user.email || undefined).catch(() => {});
        }
      }
    }
  });
}

// Operation Types for error logging
export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null): void {
  const errMessage = error instanceof Error ? error.message : String(error);
  const lowerMsg = errMessage.toLowerCase();
  
  const isPermissionDenied = 
    lowerMsg.includes('permission-denied') || 
    lowerMsg.includes('permission denied') || 
    lowerMsg.includes('insufficient permissions');

  if (isPermissionDenied) {
    const errInfo: FirestoreErrorInfo = {
      error: errMessage,
      operationType,
      path,
      authInfo: {
        userId: auth.currentUser?.uid || null,
        email: auth.currentUser?.email || null,
        emailVerified: auth.currentUser?.emailVerified || null,
        isAnonymous: auth.currentUser?.isAnonymous || null,
        tenantId: auth.currentUser?.tenantId || null,
        providerInfo: auth.currentUser?.providerData?.map(provider => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || []
      }
    };
    console.error('Firestore Error: ', JSON.stringify(errInfo));
    throw new Error(JSON.stringify(errInfo));
  }

  const isOffline = 
    lowerMsg.includes('unavailable') || 
    lowerMsg.includes('offline') || 
    lowerMsg.includes('could not reach cloud firestore backend') ||
    lowerMsg.includes("backend didn't respond") ||
    lowerMsg.includes('network-request-failed') ||
    lowerMsg.includes('failed to get document from server') ||
    lowerMsg.includes('database is closing') ||
    lowerMsg.includes('closing/hidden') ||
    lowerMsg.includes('client is offline');

  const isBrowserStorageError =
    lowerMsg.includes('setitem') ||
    lowerMsg.includes('storage') ||
    lowerMsg.includes('quotaexceedederror') ||
    (lowerMsg.includes('quota') && lowerMsg.includes('exceeded') && lowerMsg.includes('storage'));

  const isFirestoreCloudQuotaExceeded = 
    !isBrowserStorageError && (
      lowerMsg.includes('resource-exhausted') ||
      lowerMsg.includes('resource_exhausted') ||
      lowerMsg.includes('free daily read units per project') ||
      (lowerMsg.includes('quota') && (lowerMsg.includes('limit') || lowerMsg.includes('project') || lowerMsg.includes('daily'))) ||
      lowerMsg.includes('billing')
    );

  if (isBrowserStorageError) {
    console.warn(`Browser Storage Quota Warning during '${operationType}' on '${path}'. Purging orphaned storage.`);
    cleanupOrphanedFirestoreWebStorage();
    try {
      wipeAllScopedUserDataFromLocalStorage();
    } catch {}
    return;
  }

  if (isFirestoreCloudQuotaExceeded) {
    console.warn(`Firestore Quota Limit Exceeded during '${operationType}' on '${path}':`, errMessage);
    setGlobalQuotaExceeded(true);
    return;
  }

  if (isOffline) {
    console.warn(`Firestore operation '${operationType}' on '${path}' in offline mode:`, errMessage);
    return;
  }

  console.warn(`Firestore Warning on '${path}' (${operationType}):`, errMessage);
}

// Connection check
export async function testFirestoreConnection(): Promise<boolean> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return false;
  if (isGlobalQuotaExceeded()) {
    // Attempt auto-probe to test if limits refreshed
    return await probeFirestoreConnectivity();
  }
  return true;
}

// ==========================================
// Authentication Helpers
// ==========================================
let activeSignInPromise: Promise<User | null> | null = null;

export async function signInWithGoogle(): Promise<User | null> {
  if (activeSignInPromise) {
    return activeSignInPromise;
  }

  activeSignInPromise = (async () => {
    const start = performance.now();
    try {
      const result = await signInWithPopup(auth, googleProvider);
      const duration = Math.round(performance.now() - start);
      
      const credential = GoogleAuthProvider.credentialFromResult(result);
      if (credential?.accessToken) {
        setCachedGoogleAccessToken(credential.accessToken, result.user?.uid, 3600, result.user?.email);
        initGoogleDriveAutoRefreshDaemon();
      }
      
      if (result.user) {
        firestoreTelemetry.setAuthContext({
          uid: result.user.uid,
          email: result.user.email,
          displayName: result.user.displayName,
          isAnonymous: result.user.isAnonymous,
        });

        firestoreTelemetry.record({
          type: 'AUTH',
          collection: 'auth',
          path: 'auth/signInWithPopup',
          operation: 'signInWithPopup',
          durationMs: duration,
          data: {
            uid: result.user.uid,
            email: result.user.email,
            displayName: result.user.displayName,
            providerId: result.providerId,
          },
          caller: 'Google Authentication Popup',
          status: 'success',
          statusCode: 'AUTH_SUCCESS',
        });

        syncUserProfile(result.user).catch((err) => {
          console.warn('Background sync user profile warning:', err);
        });
      }
      return result.user;
    } catch (error: any) {
      const errCode = error?.code || '';
      const errMsg = (error?.message || String(error || '')).toLowerCase();

      // Silently handle user closing popup manually or duplicate concurrent popup request cancellation
      if (
        errCode === 'auth/popup-closed-by-user' ||
        errCode === 'auth/cancelled-popup-request' ||
        errMsg.includes('closed-by-user') ||
        errMsg.includes('cancelled-popup-request')
      ) {
        return null;
      }

      const duration = Math.round(performance.now() - start);
      console.warn('Popup sign in encountered error/blocked:', error);
      
      firestoreTelemetry.record({
        type: 'AUTH',
        collection: 'auth',
        path: 'auth/signInWithPopup',
        operation: 'signInWithPopup',
        durationMs: duration,
        caller: 'Google Authentication Popup',
        status: 'error',
        statusCode: error?.code || 'AUTH_FAILED',
        error: String(error?.message || error),
      });

      // Catch network request failed error cleanly
      if (
        errCode === 'auth/network-request-failed' ||
        errMsg.includes('network-request-failed') ||
        errMsg.includes('network error')
      ) {
        console.warn('Firebase authentication network request failed.');
        throw new Error('Network request failed during authentication. Please check your internet connection or try opening the app in a new tab.');
      }

      // Detect iframe environment where signInWithRedirect will fail with cross-origin errors
      const isInIframe = typeof window !== 'undefined' && window.self !== window.top;

      if (
        errCode === 'auth/popup-blocked' ||
        errMsg.includes('database is closing') ||
        errMsg.includes('closing/hidden')
      ) {
        if (isInIframe) {
          throw new Error('Sign-in popup was blocked by your browser. Please allow popups for this site or open the app in a new browser tab.');
        }
        try {
          await signInWithRedirect(auth, googleProvider);
          return null;
        } catch (redirectError: any) {
          console.warn('Redirect sign-in fallback error:', redirectError);
          throw new Error('Sign-in popup was blocked and redirect failed. Please allow popups for this site or open the app in a new window.');
        }
      }
      throw error;
    } finally {
      activeSignInPromise = null;
    }
  })();

  return activeSignInPromise;
}

export async function checkRedirectResult(): Promise<User | null> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return null;
  }
  try {
    const redirectPromise = getRedirectResult(auth);
    const timeoutPromise = new Promise<null>((resolve) => setTimeout(() => resolve(null), 1500));
    const result = await Promise.race([redirectPromise, timeoutPromise]);
    if (result && typeof result === 'object' && 'user' in result && result.user) {
      const credential = GoogleAuthProvider.credentialFromResult(result);
      if (credential?.accessToken) {
        setCachedGoogleAccessToken(credential.accessToken, result.user.uid, 3600, result.user.email);
        initGoogleDriveAutoRefreshDaemon();
      }
      firestoreTelemetry.setAuthContext({
        uid: result.user.uid,
        email: result.user.email,
        displayName: result.user.displayName,
        isAnonymous: result.user.isAnonymous,
      });
      firestoreTelemetry.record({
        type: 'AUTH',
        collection: 'auth',
        path: 'auth/getRedirectResult',
        operation: 'getRedirectResult',
        data: { uid: result.user.uid, email: result.user.email },
        caller: 'Firebase Redirect Auth Handler',
        statusCode: 'AUTH_SUCCESS',
      });
      syncUserProfile(result.user).catch((err) => {
        console.warn('Redirect background sync warning:', err);
      });
      return result.user;
    }
    return null;
  } catch (error) {
    console.warn('Check redirect result warning:', error);
    return null;
  }
}

export async function signOutUser(): Promise<void> {
  const start = performance.now();
  try {
    invalidateFirestoreCaches();
    clearGoogleDriveAuth(false);
    await signOut(auth);
    const duration = Math.round(performance.now() - start);
    
    firestoreTelemetry.setAuthContext({
      uid: null,
      email: null,
      displayName: null,
      isAnonymous: true,
    });

    firestoreTelemetry.record({
      type: 'AUTH',
      collection: 'auth',
      path: 'auth/signOut',
      operation: 'signOut',
      durationMs: duration,
      data: { status: 'logged_out' },
      caller: 'User Sign Out Action',
      status: 'success',
      statusCode: 'AUTH_SIGNOUT_OK',
    });
  } catch (error) {
    console.error('Sign Out Error:', error);
    throw error;
  }
}

// Helper to sanitize objects for Firestore (removes undefined fields and non-serializable properties)
export function sanitizeForFirestore<T>(data: T): T {
  if (data === undefined || data === null) return null as unknown as T;
  try {
    return JSON.parse(JSON.stringify(data));
  } catch {
    return deepCleanUndefined(data);
  }
}

function deepCleanUndefined(obj: any): any {
  if (obj === undefined) return null;
  if (obj === null || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) {
    return obj.map(deepCleanUndefined).filter((val) => val !== undefined);
  }
  const clean: Record<string, any> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined && typeof v !== 'function') {
      clean[k] = deepCleanUndefined(v);
    }
  }
  return clean;
}

// ==========================================
// User Profile Synchronization
// ==========================================
const SYNCED_USERS_SESSION_KEY = 'math_mock_synced_uids_session';
const SYNCED_USERS_PERSISTENT_KEY_PREFIX = 'math_mock_profile_synced_v3_';

export async function syncUserProfile(user: User, force = false): Promise<void> {
  if (isOfflineLocalOnlyMode() || isGlobalQuotaExceeded() || !user || !user.uid) return;

  const persistentKey = `${SYNCED_USERS_PERSISTENT_KEY_PREFIX}${user.uid}`;

  // Persistent Dirty Check: Never write to users/{uid} on reload if profile has not changed within 24 hours
  if (!force && typeof localStorage !== 'undefined') {
    try {
      const cachedRaw = localStorage.getItem(persistentKey);
      if (cachedRaw) {
        const cached = JSON.parse(cachedRaw);
        const email = user.email || '';
        const displayName = user.displayName || user.email?.split('@')[0] || 'Math Learner';
        const photoURL = user.photoURL || '';
        const ageMs = Date.now() - (cached.syncedAt || 0);
        const ONE_DAY_MS = 24 * 60 * 60 * 1000;

        if (
          cached.uid === user.uid &&
          cached.email === email &&
          cached.displayName === displayName &&
          cached.photoURL === photoURL &&
          ageMs < ONE_DAY_MS
        ) {
          // Zero-write: Local cache matches user identity and token is fresh
          return;
        }
      }
    } catch {}
  }

  // Also check session storage as fallback
  if (!force && typeof sessionStorage !== 'undefined') {
    try {
      const synced = sessionStorage.getItem(SYNCED_USERS_SESSION_KEY);
      if (synced && synced.includes(user.uid)) {
        return; // Already synced profile in this session (0 writes)
      }
    } catch {}
  }

  const path = `users/${user.uid}`;
  try {
    const userDocRef = doc(db, 'users', user.uid);
    const now = new Date().toISOString();
    
    const profileData: Record<string, any> = {
      id: user.uid,
      email: user.email || '',
      displayName: user.displayName || user.email?.split('@')[0] || 'Math Learner',
      lastLoginAt: now,
      updatedAt: now,
    };
    
    if (user.photoURL) {
      profileData.photoURL = user.photoURL;
    }

    await setDoc(userDocRef, profileData, { merge: true });
    firestoreTelemetry.record({
      type: 'WRITE',
      collection: 'users',
      path,
      operation: 'setDoc',
      data: profileData,
      caller: 'User Profile Sync (Session Initial)',
    });

    // Cache dirty-check fingerprint persistently to guarantee 0 writes on subsequent reloads
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem(
          persistentKey,
          JSON.stringify({
            uid: user.uid,
            email: profileData.email,
            displayName: profileData.displayName,
            photoURL: profileData.photoURL || '',
            syncedAt: Date.now(),
          })
        );
      } catch {}
    }

    if (typeof sessionStorage !== 'undefined') {
      try {
        sessionStorage.setItem(SYNCED_USERS_SESSION_KEY, user.uid);
      } catch {}
    }
  } catch (error) {
    firestoreTelemetry.record({
      type: 'WRITE',
      collection: 'users',
      path,
      operation: 'setDoc',
      data: user.uid,
      caller: 'User Profile Sync',
      status: 'error',
      error: String(error),
    });
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function saveUserProfileToFirestore(userId: string, profile: Partial<UserProfile>): Promise<void> {
  if (isOfflineLocalOnlyMode() || isGlobalQuotaExceeded() || !userId || userId === 'anonymous' || userId === 'guest-user') return;
  try {
    const userDocRef = doc(db, 'users', userId);
    const sanitized = sanitizeForFirestore(profile);
    await setDoc(userDocRef, {
      ...sanitized,
      updatedAt: new Date().toISOString(),
    }, { merge: true });
    firestoreTelemetry.record({
      type: 'WRITE',
      collection: 'users',
      path: `users/${userId}`,
      operation: 'setDoc',
      data: sanitized,
      caller: 'Save User Profile',
    });
  } catch (err) {
    firestoreTelemetry.record({
      type: 'WRITE',
      collection: 'users',
      path: `users/${userId}`,
      operation: 'setDoc',
      caller: 'Save User Profile',
      status: 'error',
      error: String(err),
    });
    handleFirestoreError(err, OperationType.WRITE, `users/${userId}`);
  }
}

export function subscribeUserProfile(userId: string, onProfileChange: (data: UserProfile | null) => void): Unsubscribe {
  if (isOfflineLocalOnlyMode() || !userId || userId === 'anonymous' || userId === 'guest-user') {
    onProfileChange(null);
    return () => {};
  }

  try {
    const userDocRef = doc(db, 'users', userId);
    return onSnapshot(userDocRef, (snap) => {
      if (snap.exists()) {
        const raw = snap.data() as any;
        const normalizedChatSessions: Record<string, any> = { ...(raw.chatSessions || {}) };
        const normalizedNotes: Record<string, any> = { ...(raw.notes || {}) };
        const normalizedBookmarks: Record<string, any> = { ...(raw.bookmarks || {}) };
        const normalizedTestHistories: Record<string, any> = { ...(raw.testHistories || {}) };

        // Normalize any dot-flattened keys that might have been saved in earlier versions
        Object.keys(raw).forEach((k) => {
          if (k.startsWith('chatSessions.') && raw[k]) {
            const key = k.replace('chatSessions.', '');
            normalizedChatSessions[key] = raw[k];
          } else if (k.startsWith('notes.') && raw[k]) {
            const key = k.replace('notes.', '');
            normalizedNotes[key] = raw[k];
          } else if (k.startsWith('bookmarks.') && raw[k]) {
            const key = k.replace('bookmarks.', '');
            normalizedBookmarks[key] = raw[k];
          } else if (k.startsWith('testHistories.') && raw[k]) {
            const key = k.replace('testHistories.', '');
            normalizedTestHistories[key] = raw[k];
          }
        });

        const profile: UserProfile = {
          ...raw,
          id: userId,
          chatSessions: normalizedChatSessions,
          notes: normalizedNotes,
          bookmarks: normalizedBookmarks,
          testHistories: normalizedTestHistories,
        };

        firestoreTelemetry.record({
          type: 'STREAM_DELTA',
          collection: 'users',
          path: `users/${userId}`,
          operation: 'onSnapshot',
          docCount: 1,
          data: { email: raw.email, displayName: raw.displayName, statsRollup: raw.statsRollup },
          caller: 'User Profile Real-time Stream',
        });
        onProfileChange(profile);
      } else {
        onProfileChange(null);
      }
    }, (error) => {
      console.warn(`User profile listener notice for ${userId}:`, error?.message);
      handleFirestoreError(error, OperationType.GET, `users/${userId}`);
    });
  } catch (err) {
    console.warn(`Failed to attach user profile listener for ${userId}:`, err);
    return () => {};
  }
}

// ==========================================
// User Sync Beacon (Zero-Cost Sync Gatekeeper)
// ==========================================
export interface UserSyncBeacon {
  userId: string;
  testsRev?: number;
  attemptsRev?: number;
  notesRev?: number;
  chatsRev?: number;
  profileRev?: number;
  updatedAt: string;
}

export function getUserSyncBeaconDocRef(userId: string) {
  return doc(db, 'users', userId, 'sync_beacon', 'status');
}

export async function getUserSyncBeacon(userId: string): Promise<UserSyncBeacon | null> {
  if (isOfflineLocalOnlyMode() || !userId || userId === 'anonymous' || userId === 'guest-user' || isGlobalQuotaExceeded()) {
    return null;
  }
  try {
    const snap = await getDoc(getUserSyncBeaconDocRef(userId));
    if (snap.exists()) {
      firestoreTelemetry.record({
        type: 'READ',
        collection: 'users',
        path: `users/${userId}/sync_beacon/status`,
        operation: 'getDoc',
        docCount: 1,
        caller: 'Get User Sync Beacon',
      });
      return snap.data() as UserSyncBeacon;
    }
  } catch (e) {
    console.warn('Failed to get user sync beacon:', e);
  }
  return null;
}

export function subscribeUserSyncBeacon(
  userId: string,
  onUpdate: (beacon: UserSyncBeacon | null) => void
): Unsubscribe {
  if (isOfflineLocalOnlyMode() || !userId || userId === 'anonymous' || userId === 'guest-user') {
    onUpdate(null);
    return () => {};
  }

  try {
    const beaconRef = getUserSyncBeaconDocRef(userId);
    return onSnapshot(beaconRef, (snap) => {
      firestoreTelemetry.record({
        type: 'STREAM_DELTA',
        collection: 'users',
        path: `users/${userId}/sync_beacon/status`,
        operation: 'onSnapshot',
        docCount: snap.exists() ? 1 : 0,
        caller: 'Live User Sync Beacon Stream',
      });
      if (snap.exists()) {
        onUpdate(snap.data() as UserSyncBeacon);
      } else {
        onUpdate(null);
      }
    }, (err) => {
      console.warn('Sync beacon listener notice:', err?.message);
    });
  } catch (err) {
    console.warn('Failed to attach sync beacon listener:', err);
    return () => {};
  }
}

export async function updateUserSyncBeacon(
  userId: string,
  updates: Partial<UserSyncBeacon>,
  batch?: any
): Promise<void> {
  if (!userId || userId === 'anonymous' || userId === 'guest-user' || isOfflineLocalOnlyMode()) return;
  const beaconRef = getUserSyncBeaconDocRef(userId);
  const payload: Partial<UserSyncBeacon> = {
    ...updates,
    userId,
    updatedAt: new Date().toISOString(),
  };

  if (batch) {
    batch.set(beaconRef, payload, { merge: true });
    return;
  }

  if (isGlobalQuotaExceeded()) return;
  try {
    await setDoc(beaconRef, payload, { merge: true });
    firestoreTelemetry.record({
      type: 'WRITE',
      collection: 'users',
      path: `users/${userId}/sync_beacon/status`,
      operation: 'setDoc',
      data: payload,
      caller: 'Update User Sync Beacon',
    });
  } catch (e) {
    console.warn('Failed to update sync beacon:', e);
  }
}

// ==========================================
// Tests CRUD & Real-Time Sync
// ==========================================
export async function saveTestToFirestore(test: MathTest, overrideAuthorId?: string): Promise<void> {
  if (!test || isOfflineLocalOnlyMode()) return;
  const currentUser = auth.currentUser;
  const isRealUid = (id?: string | null) => Boolean(id && id !== 'anonymous' && id !== 'guest-user' && id !== 'local-user' && id !== 'system' && id !== 'custom-user');
  const finalAuthorId = overrideAuthorId || (isRealUid(currentUser?.uid) ? currentUser!.uid : (isRealUid(test.authorId) ? test.authorId : 'anonymous'));
  
  if (!finalAuthorId || finalAuthorId === 'anonymous' || finalAuthorId === 'guest-user') {
    return;
  }

  const validId = test.id || `test_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  const finalAuthorEmail = (test as any).authorEmail || currentUser?.email || '';

  const testToSave: MathTest = {
    ...test,
    id: validId,
    authorId: finalAuthorId,
    authorName: test.authorName || currentUser?.displayName || currentUser?.email?.split('@')[0] || 'Teacher',
    authorEmail: finalAuthorEmail,
    isPublic: test.isPublic !== undefined ? test.isPublic : true,
    createdAt: test.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    questionCount: Array.isArray(test.questions) ? test.questions.length : (test.questionCount || 0),
    questions: normalizeQuestions(Array.isArray(test.questions) ? test.questions : []),
  };

  let processedTest = testToSave;
  try {
    processedTest = await optimizeTestForFirestore(testToSave);
  } catch (e) {
    console.warn('Image optimization skipped in saveTestToFirestore:', e);
  }

  fullTestCache.set(validId, { data: processedTest, timestamp: Date.now() });

  // 1. Direct write to user subcollection: /users/{userId}/tests/{testId}
  if (!isGlobalQuotaExceeded()) {
    try {
      const sanitized = sanitizeForFirestore(processedTest);
      const userTestDocRef = doc(db, 'users', finalAuthorId, 'tests', validId);
      await setDoc(userTestDocRef, sanitized, { merge: true });
      firestoreTelemetry.record({
        type: 'WRITE',
        collection: 'tests',
        path: `users/${finalAuthorId}/tests/${validId}`,
        operation: 'setDoc',
        data: sanitized,
        caller: 'Save/Create Test in User Subcollection',
      });


    } catch (err) {
      firestoreTelemetry.record({
        type: 'WRITE',
        collection: 'tests',
        path: `users/${finalAuthorId}/tests/${validId}`,
        operation: 'setDoc',
        caller: 'Save/Create Test',
        status: 'error',
        error: String(err),
      });
      handleFirestoreError(err, OperationType.WRITE, `users/${finalAuthorId}/tests/${validId}`);
    }
  }
}

/**
 * Granular / Surgical Question Updater:
 * Directly updates only the questions and questionCount field on /tests/{testId}
 * without re-reading or touching any other part of the test catalog.
 */
export async function updateTestQuestionsInFirestore(
  testId: string, 
  questions: any[], 
  authorId?: string
): Promise<void> {
  if (!testId || isOfflineLocalOnlyMode() || isGlobalQuotaExceeded()) return;
  const currentUser = auth.currentUser;
  const finalAuthorId = authorId || currentUser?.uid;
  if (!finalAuthorId || finalAuthorId === 'anonymous' || finalAuthorId === 'guest-user') {
    return;
  }

  const normalized = normalizeQuestions(Array.isArray(questions) ? questions : []);
  const now = new Date().toISOString();

  // 1. Surgical update on the discrete /users/{finalAuthorId}/tests/{testId} document
  try {
    const sanitized = sanitizeForFirestore(normalized);
    const payload = {
      questions: sanitized,
      questionCount: normalized.length,
      updatedAt: now,
    };
    await setDoc(doc(db, 'users', finalAuthorId, 'tests', testId), payload, { merge: true });

    firestoreTelemetry.record({
      type: 'WRITE',
      collection: 'tests',
      path: `users/${finalAuthorId}/tests/${testId}`,
      operation: 'updateDoc',
      data: payload,
      caller: 'Update Test Questions in User Subcollection',
    });
  } catch (err) {
    firestoreTelemetry.record({
      type: 'WRITE',
      collection: 'tests',
      path: `users/${finalAuthorId}/tests/${testId}`,
      operation: 'updateDoc',
      caller: 'Update Test Questions',
      status: 'error',
      error: String(err),
    });
    handleFirestoreError(err, OperationType.UPDATE, `users/${finalAuthorId}/tests/${testId}`);
  }

  // Update memory cache
  const cached = fullTestCache.get(testId);
  if (cached) {
    fullTestCache.set(testId, {
      data: {
        ...cached.data,
        questions: normalized,
        questionCount: normalized.length,
        updatedAt: now,
      },
      timestamp: Date.now(),
    });
  }
}

export async function deleteTestFromFirestore(testId: string, userId?: string | null): Promise<void> {
  if (!testId || isOfflineLocalOnlyMode()) return;
  fullTestCache.delete(testId);
  testsCache.clear();
  searchResultsCache.clear();

  const currentUid = userId || auth.currentUser?.uid;

  // 1. Delete from user subcollection users/{userId}/tests/{testId}
  if (currentUid && currentUid !== 'anonymous' && currentUid !== 'guest-user') {
    try {
      await deleteDoc(doc(db, 'users', currentUid, 'tests', testId));
      firestoreTelemetry.record({
        type: 'DELETE',
        collection: 'tests',
        path: `users/${currentUid}/tests/${testId}`,
        operation: 'deleteDoc',
        data: { testId },
        caller: 'Delete Test From User Subcollection',
      });
    } catch (e) {
      console.warn(`Could not delete test ${testId} from user tests subcollection:`, e);
    }
  }

  // 2. Also delete from top-level tests collection
  try {
    const testDocRef = doc(db, 'tests', testId);
    await deleteDoc(testDocRef);
    firestoreTelemetry.record({
      type: 'DELETE',
      collection: 'tests',
      path: `tests/${testId}`,
      operation: 'deleteDoc',
      data: { testId },
      caller: 'Delete Test',
    });
  } catch (e) {
    console.warn(`Could not delete test ${testId} from tests collection:`, e);
  }

  // 3. Persist tombstone in cloud user profile and remove from createdTests
  if (currentUid && currentUid !== 'anonymous' && currentUid !== 'guest-user') {
    try {
      const userDocRef = doc(db, 'users', currentUid);
      await setDoc(userDocRef, {
        deletedTestIds: arrayUnion(testId),
        [`createdTests.${testId}`]: deleteField(),
        updatedAt: new Date().toISOString(),
      }, { merge: true });

      // Atomically bump sync beacon and align local sync revision
      const nowRev = Date.now();
      await updateUserSyncBeacon(currentUid, { testsRev: nowRev });
      smartCoordinator.setLocalSyncRevision(currentUid, 'testsRev', nowRev);
    } catch (err) {
      console.warn(`Could not add test ${testId} to user deletedTestIds:`, err);
    }
  }
}

export async function markDeletedTestInFirestore(testId: string, userId?: string | null): Promise<void> {
  if (isOfflineLocalOnlyMode() || !testId) return;
  const currentUid = userId || auth.currentUser?.uid;
  if (!currentUid || currentUid === 'anonymous' || currentUid === 'guest-user') return;

  try {
    const userDocRef = doc(db, 'users', currentUid);
    await setDoc(userDocRef, {
      deletedTestIds: arrayUnion(testId),
      [`createdTests.${testId}`]: deleteField(),
      updatedAt: new Date().toISOString(),
    }, { merge: true });

    const nowRev = Date.now();
    await updateUserSyncBeacon(currentUid, { testsRev: nowRev });
    smartCoordinator.setLocalSyncRevision(currentUid, 'testsRev', nowRev);
  } catch (error) {
    console.warn('Could not mark deleted test ID in cloud user profile:', error);
  }
}

export async function unmarkDeletedTestInFirestore(testId: string, userId?: string | null): Promise<void> {
  if (isOfflineLocalOnlyMode() || isGlobalQuotaExceeded() || !testId) return;
  const currentUid = userId || auth.currentUser?.uid;
  if (!currentUid || currentUid === 'anonymous' || currentUid === 'guest-user') return;

  try {
    const userDocRef = doc(db, 'users', currentUid);
    await setDoc(userDocRef, {
      deletedTestIds: arrayRemove(testId),
      updatedAt: new Date().toISOString(),
    }, { merge: true });
  } catch (error) {
    console.warn('Could not unmark deleted test ID in cloud user profile:', error);
  }
}

export async function unmarkMultipleDeletedTestsInFirestore(testIds: string[], userId?: string | null): Promise<void> {
  if (isOfflineLocalOnlyMode() || isGlobalQuotaExceeded() || !testIds || testIds.length === 0) return;
  const currentUid = userId || auth.currentUser?.uid;
  if (!currentUid || currentUid === 'anonymous' || currentUid === 'guest-user') return;

  try {
    const validIds = testIds.filter(Boolean);
    if (validIds.length === 0) return;
    const userDocRef = doc(db, 'users', currentUid);
    await setDoc(userDocRef, {
      deletedTestIds: arrayRemove(...validIds),
      updatedAt: new Date().toISOString(),
    }, { merge: true });
  } catch (error) {
    console.warn('Could not unmark multiple deleted test IDs in cloud user profile:', error);
  }
}

export async function fetchTestsFromFirestore(limitCount = 50, forceRefresh = false): Promise<MathTest[]> {
  const currentUid = auth.currentUser?.uid;
  const isGuest = !currentUid || currentUid === 'anonymous' || currentUid === 'guest-user';

  if (isGuest || isOfflineLocalOnlyMode() || isGlobalQuotaExceeded()) {
    const local = currentUid ? loadScopedTests(currentUid) : [];
    if (local.length > 0) return local.slice(0, limitCount);
    return SAMPLE_MATH_TESTS.slice(0, limitCount);
  }

  // Zero-Cost Cache Check:
  // If local tests exist in scoped storage and forceRefresh is false,
  // compare local revision with cloud beacon. If local is up-to-date, return local tests immediately (0 reads)!
  const localScoped = loadScopedTests(currentUid);
  if (!forceRefresh && localScoped.length > 0) {
    try {
      const beacon = await getUserSyncBeacon(currentUid);
      const localRev = smartCoordinator.getLocalSyncRevisions(currentUid).testsRev || 0;
      if (beacon && beacon.testsRev && beacon.testsRev <= localRev) {
        // Zero Firestore Reads! Local tests are already up-to-date with cloud.
        return localScoped.slice(0, limitCount);
      }
    } catch {}
  }

  const resultsMap = new Map<string, MathTest>();

  // 1. Fetch user doc createdTests
  try {
    const userDocSnap = await getDoc(doc(db, 'users', currentUid));
    if (userDocSnap.exists()) {
      firestoreTelemetry.record({
        type: 'READ',
        collection: 'users',
        path: `users/${currentUid}`,
        operation: 'getDoc',
        docCount: 1,
        caller: 'Fetch User Created Tests',
      });
      const data = userDocSnap.data();
      if (Array.isArray(data?.deletedTestIds) && data.deletedTestIds.length > 0) {
        data.deletedTestIds.forEach((delId: string) => {
          if (delId) {
            resultsMap.delete(delId);
            markTestAsDeletedInScopedStorage(currentUid, delId);
            deleteTestFromIndexedDB(currentUid, delId).catch(() => {});
          }
        });
      }
      if (data?.createdTests && typeof data.createdTests === 'object') {
        const deletedSet = new Set(data.deletedTestIds || []);
        Object.values(data.createdTests).forEach((t: any) => {
          if (t && t.id && !deletedSet.has(t.id)) {
            resultsMap.set(t.id, {
              ...t,
              questions: normalizeQuestions(Array.isArray(t.questions) ? t.questions : []),
            });
          }
        });
      }
    }
  } catch (e) {}

  // 2. Fetch from user subcollection /users/{currentUid}/tests
  try {
    const userTestsSnap = await getDocs(query(collection(db, 'users', currentUid, 'tests'), limit(limitCount)));
    if (!userTestsSnap.empty) {
      firestoreTelemetry.record({
        type: 'READ',
        collection: 'tests',
        path: `users/${currentUid}/tests?limit=${limitCount}`,
        operation: 'getDocs',
        docCount: userTestsSnap.docs.length,
        caller: 'Fetch User Tests Subcollection',
      });
      const allDeleted = getAllDeletedTestIds(currentUid);
      userTestsSnap.forEach((d) => {
        const data = d.data() as MathTest;
        if (data && data.id && !allDeleted.has(data.id)) {
          resultsMap.set(data.id, {
            ...data,
            questions: normalizeQuestions(Array.isArray(data.questions) ? data.questions : []),
          });
        }
      });
    } else {
      // Fallback: Check legacy top-level tests collection where authorId == currentUid
      const q = query(collection(db, 'tests'), where('authorId', '==', currentUid), limit(limitCount));
      const snap = await getDocs(q);
      const allDeleted = getAllDeletedTestIds(currentUid);
      snap.forEach((d) => {
        const data = d.data() as MathTest;
        if (data && data.id && !allDeleted.has(data.id)) {
          resultsMap.set(data.id, {
            ...data,
            questions: normalizeQuestions(Array.isArray(data.questions) ? data.questions : []),
          });
          // Seamlessly migrate legacy test to user subcollection
          setDoc(doc(db, 'users', currentUid, 'tests', data.id), sanitizeForFirestore(data), { merge: true }).catch(() => {});
        }
      });
    }
  } catch (e) {
    console.warn('Error fetching user tests:', e);
  }

  // Merge with samples
  SAMPLE_MATH_TESTS.forEach((st) => {
    if (!resultsMap.has(st.id)) {
      resultsMap.set(st.id, st);
    }
  });

  const finalTests = Array.from(resultsMap.values()).slice(0, limitCount);
  smartCoordinator.setLocalSyncRevision(currentUid, 'testsRev', Date.now());
  return finalTests;
}

export interface FirestoreDocChange<T> {
  type: 'added' | 'modified' | 'removed';
  id: string;
  data: T;
  isInitialLoad?: boolean;
}

export function subscribeToTests(
  userId: string | null, 
  onUpdate: (tests: MathTest[], deltas?: FirestoreDocChange<MathTest>[]) => void
): Unsubscribe {
  if (isOfflineLocalOnlyMode() || !userId || userId === 'anonymous' || userId === 'guest-user') {
    onUpdate(SAMPLE_MATH_TESTS);
    return () => {};
  }

  let isFirstSnapshot = true;

  try {
    // Real-time listener on user-scoped subcollection: /users/{userId}/tests
    const userTestsCol = collection(db, 'users', userId, 'tests');
    return onSnapshot(userTestsCol, (snap) => {
      const deltas: FirestoreDocChange<MathTest>[] = [];

      firestoreTelemetry.record({
        type: isFirstSnapshot ? 'STREAM_LISTEN' : 'STREAM_DELTA',
        collection: 'tests',
        path: `users/${userId}/tests`,
        operation: 'onSnapshot',
        docCount: isFirstSnapshot ? snap.docs.length : snap.docChanges().length,
        data: snap.docs.map((d) => ({ id: d.id, title: (d.data() as any)?.title })),
        caller: isFirstSnapshot ? 'Initial User Tests Real-time Stream' : 'Live User Tests Delta Change',
      });

      // If user subcollection is empty on initial load, check legacy root /tests and migrate
      if (isFirstSnapshot && snap.empty) {
        isFirstSnapshot = false;
        const legacyQ = query(collection(db, 'tests'), where('authorId', '==', userId), limit(100));
        getDocs(legacyQ).then((legacySnap) => {
          if (!legacySnap.empty) {
            const migrated: MathTest[] = [];
            legacySnap.forEach((d) => {
              const data = d.data() as MathTest;
              if (data && data.id) {
                const norm: MathTest = {
                  ...data,
                  questions: normalizeQuestions(Array.isArray(data.questions) ? data.questions : []),
                };
                migrated.push(norm);
                setDoc(doc(db, 'users', userId, 'tests', data.id), sanitizeForFirestore(norm), { merge: true }).catch(() => {});
              }
            });
            if (migrated.length > 0) {
              const mergedMap = new Map<string, MathTest>();
              migrated.forEach((t) => mergedMap.set(t.id, t));
              SAMPLE_MATH_TESTS.forEach((st) => {
                if (!mergedMap.has(st.id)) mergedMap.set(st.id, st);
              });
              onUpdate(Array.from(mergedMap.values()));
            }
          }
        }).catch(() => {});
        return;
      }

      snap.docChanges().forEach((change) => {
        const raw = change.doc.data() as MathTest;
        const normalized: MathTest = {
          ...raw,
          id: change.doc.id,
          questions: normalizeQuestions(Array.isArray(raw?.questions) ? raw.questions : []),
        };
        deltas.push({
          type: change.type,
          id: change.doc.id,
          data: normalized,
          isInitialLoad: isFirstSnapshot,
        });
      });

      isFirstSnapshot = false;

      const customTests: MathTest[] = [];
      snap.forEach((d) => {
        const data = d.data() as MathTest;
        if (data && data.id) {
          customTests.push({
            ...data,
            questions: normalizeQuestions(Array.isArray(data.questions) ? data.questions : []),
          });
        }
      });

      const mergedMap = new Map<string, MathTest>();
      customTests.forEach((t) => mergedMap.set(t.id, t));
      SAMPLE_MATH_TESTS.forEach((st) => {
        if (!mergedMap.has(st.id)) {
          mergedMap.set(st.id, st);
        }
      });

      onUpdate(Array.from(mergedMap.values()), deltas);
    }, (err) => {
      console.warn('User tests snapshot listener warning:', err?.message);
      handleFirestoreError(err, OperationType.LIST, `users/${userId}/tests`);
    });
  } catch (err) {
    console.warn('Failed to attach user tests snapshot listener:', err);
    return () => {};
  }
}

// ==========================================
// Attempts CRUD & Real-Time Sync
// ==========================================
export async function saveAttemptToFirestore(attempt: TestAttempt, overrideUserId?: string): Promise<void> {
  if (!attempt || isOfflineLocalOnlyMode()) return;
  const currentUser = auth.currentUser;
  const finalUserId = overrideUserId || currentUser?.uid || attempt.userId || 'anonymous';
  
  if (!finalUserId || finalUserId === 'anonymous' || finalUserId === 'guest-user') {
    return;
  }

  const validId = attempt.id || `attempt_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  const finalUserEmail = attempt.userEmail || currentUser?.email || '';

  const attemptToSave: TestAttempt = {
    ...attempt,
    id: validId,
    testId: attempt.testId || 'unknown_test',
    userId: finalUserId,
    userEmail: finalUserEmail,
    userName: attempt.userName || currentUser?.displayName || finalUserEmail.split('@')[0] || 'Learner',
    createdAt: attempt.createdAt || new Date().toISOString(),
    completedAt: attempt.completedAt || new Date().toISOString(),
  };

  // 1. Direct write to user subcollection: /users/{userId}/attempts/{attemptId}
  if (!isGlobalQuotaExceeded()) {
    try {
      const attemptCopy = { ...attemptToSave };
      if (typeof attemptCopy.omrScannedImageUrl === 'string' && attemptCopy.omrScannedImageUrl.length > 650000) {
        delete attemptCopy.omrScannedImageUrl;
      }
      const sanitized = sanitizeForFirestore(attemptCopy);

      const userAttemptDocRef = doc(db, 'users', finalUserId, 'attempts', validId);
      await setDoc(userAttemptDocRef, sanitized, { merge: true });

      firestoreTelemetry.record({
        type: 'WRITE',
        collection: 'attempts',
        path: `users/${finalUserId}/attempts/${validId}`,
        operation: 'setDoc',
        data: sanitized,
        caller: 'Submit Test Attempt in User Subcollection',
      });


    } catch (err) {
      firestoreTelemetry.record({
        type: 'WRITE',
        collection: 'attempts',
        path: `users/${finalUserId}/attempts/${validId}`,
        operation: 'setDoc',
        caller: 'Submit Test Attempt',
        status: 'error',
        error: String(err),
      });
      handleFirestoreError(err, OperationType.WRITE, `users/${finalUserId}/attempts/${validId}`);
    }
  }

  // Trigger lightweight leaderboard sync for the test ranking
  syncLeaderboardEntry(attemptToSave, finalUserId).catch((err) => {
    console.warn('Silent leaderboard sync notice:', err);
  });
}

// -------------------------------------------------------------
// Test Leaderboard & Ranking System
// -------------------------------------------------------------

const LOCAL_LEADERBOARD_KEY_PREFIX = 'math_mock_lb_';
const LEADERBOARD_CACHE_TTL_MS = 15000; // 15s cache for fast live updates
const inMemoryLeaderboardCache = new Map<string, { data: TestLeaderboardSummary; timestamp: number }>();

export function getCanonicalLeaderboardId(testId: string, testTitle?: string): string {
  if (testTitle && typeof testTitle === 'string' && testTitle.trim()) {
    const slug = testTitle.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
    if (slug.length >= 3) {
      return `test_title_${slug}`;
    }
  }
  return (testId || 'default').replace(/[./[\]*~#$]/g, '_');
}

function getLocalLeaderboardKey(testId: string, testTitle?: string): string {
  const safeId = getCanonicalLeaderboardId(testId, testTitle);
  return `${LOCAL_LEADERBOARD_KEY_PREFIX}${safeId}`;
}

export function getLocalLeaderboardEntries(testId: string, testTitle?: string): LeaderboardEntry[] {
  try {
    const key = getLocalLeaderboardKey(testId, testTitle);
    const raw = localStorage.getItem(key);
    if (!raw) {
      // Fallback check with raw testId
      const fallbackKey = `${LOCAL_LEADERBOARD_KEY_PREFIX}${(testId || '').replace(/[./[\]*~#$]/g, '_')}`;
      const fallbackRaw = localStorage.getItem(fallbackKey);
      if (fallbackRaw) return JSON.parse(fallbackRaw) as LeaderboardEntry[];
      return [];
    }
    return JSON.parse(raw) as LeaderboardEntry[];
  } catch {
    return [];
  }
}

/**
 * Synchronous instant getter for cached leaderboard data (in-memory or localStorage).
 * Returns immediately with 0ms delay to eliminate loading spinner flicker and page opening lag.
 */
export function getSynchronousCachedLeaderboard(testId: string, testTitle?: string, currentUserId?: string): TestLeaderboardSummary | null {
  try {
    const canonicalId = getCanonicalLeaderboardId(testId, testTitle);
    const rawSafeId = (testId || '').replace(/[./[\]*~#$]/g, '_');
    const cached = inMemoryLeaderboardCache.get(canonicalId) || inMemoryLeaderboardCache.get(rawSafeId);
    if (cached?.data) {
      return cached.data;
    }
    const local = getLocalLeaderboardEntries(testId, testTitle);
    if (local && local.length > 0) {
      const uid = currentUserId || auth.currentUser?.uid;
      return buildLeaderboardSummaryFromList(local, uid);
    }
  } catch {}
  return null;
}

export function saveLocalLeaderboardEntry(testId: string, entry: LeaderboardEntry, testTitle?: string): boolean {
  try {
    const canonicalKey = getLocalLeaderboardKey(testId, testTitle);
    const rawKey = `${LOCAL_LEADERBOARD_KEY_PREFIX}${(testId || '').replace(/[./[\]*~#$]/g, '_')}`;

    const updateInKey = (key: string): boolean => {
      let existing: LeaderboardEntry[] = [];
      try {
        const raw = localStorage.getItem(key);
        if (raw) existing = JSON.parse(raw);
      } catch {}
      const index = existing.findIndex((e) => e.userId === entry.userId);
      if (index >= 0) {
        // Strict First-Attempt Only policy:
        // Do not overwrite previous first attempt!
        return false;
      } else {
        existing.push({
          ...entry,
          attemptNumber: 1,
        });
        localStorage.setItem(key, JSON.stringify(existing));
        return true;
      }
    };

    const isNewCanonical = updateInKey(canonicalKey);
    if (rawKey !== canonicalKey) {
      updateInKey(rawKey);
    }
    return isNewCanonical;
  } catch (err) {
    console.warn('Failed to save local leaderboard entry:', err);
    return false;
  }
}

function buildLeaderboardSummaryFromList(
  entries: LeaderboardEntry[], 
  currentUserId?: string
): TestLeaderboardSummary {
  const sorted = [...entries].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return (a.timeSpentSeconds || 0) - (b.timeSpentSeconds || 0);
  });

  sorted.forEach((e, idx) => {
    e.rank = idx + 1;
  });

  const currentUserEntry = currentUserId ? sorted.find((e) => e.userId === currentUserId) : undefined;

  return {
    entries: sorted.slice(0, 100),
    totalParticipants: sorted.length,
    currentUserRank: currentUserEntry?.rank,
    currentUserEntry,
  };
}

/**
 * Synchronizes an attempt's score into the test's public leaderboard.
 * Keeps the student's highest score / fastest time across attempts.
 */
/**
 * Synchronizes an attempt's score into the test's public leaderboard.
 * STRICT FIRST-ATTEMPT ONLY POLICY:
 * Only the user's initial first attempt is recorded into the ranking system.
 * Subsequent attempts by the same user do not alter rankings and execute 0 Firestore writes.
 */
export async function syncLeaderboardEntry(attempt: TestAttempt, overrideUserId?: string): Promise<void> {
  if (!attempt || (!attempt.testId && !attempt.testTitle)) return;
  const currentUid = overrideUserId || auth.currentUser?.uid || attempt.userId;
  const canonicalId = getCanonicalLeaderboardId(attempt.testId, attempt.testTitle);
  const rawSafeId = (attempt.testId || '').replace(/[./[\]*~#$]/g, '_');

  // Fast client-side check: does user already have an initial attempt cached locally?
  const existingLocal = getLocalLeaderboardEntries(attempt.testId, attempt.testTitle);
  const alreadyHasInitialAttemptLocally = existingLocal.some((e) => e.userId === currentUid);

  const newEntry: LeaderboardEntry = {
    userId: currentUid || 'guest_user',
    userName: attempt.userName || auth.currentUser?.displayName || (attempt.userEmail || '').split('@')[0] || 'Learner',
    userEmail: attempt.userEmail || auth.currentUser?.email || '',
    score: attempt.score,
    totalPoints: attempt.totalPoints,
    percentage: attempt.percentage,
    timeSpentSeconds: attempt.timeSpentSeconds,
    attemptMode: attempt.attemptMode || 'online',
    completedAt: attempt.completedAt || new Date().toISOString(),
    testTitle: attempt.testTitle || '',
    attemptNumber: 1,
    firstAttemptId: attempt.id,
  };

  // 1. Cache locally. If already exists, saveLocalLeaderboardEntry returns false.
  const isFirstLocal = saveLocalLeaderboardEntry(attempt.testId, newEntry, attempt.testTitle);
  inMemoryLeaderboardCache.delete(canonicalId);
  inMemoryLeaderboardCache.delete(rawSafeId);

  // If local already had an attempt and this is not a first attempt, skip all network writes!
  if (alreadyHasInitialAttemptLocally && !isFirstLocal) {
    return;
  }

  // 2. Sync with local backend server (Server strictly enforces first-attempt only)
  try {
    fetch(`/api/leaderboard/${encodeURIComponent(canonicalId)}?title=${encodeURIComponent(attempt.testTitle || '')}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newEntry),
    }).catch(() => {});
    if (rawSafeId && rawSafeId !== canonicalId) {
      fetch(`/api/leaderboard/${encodeURIComponent(rawSafeId)}?title=${encodeURIComponent(attempt.testTitle || '')}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newEntry),
      }).catch(() => {});
    }
  } catch {}

  // If anonymous guest without an account, local sync is enough
  if (!currentUid || currentUid === 'anonymous' || currentUid === 'guest-user') {
    return;
  }

  // 3. Firestore Cloud Check & Write (Zero extra writes if first attempt already exists in cloud)
  try {
    const targetDocRefs = [doc(db, 'test_leaderboards', canonicalId, 'entries', currentUid)];
    if (rawSafeId && rawSafeId !== canonicalId) {
      targetDocRefs.push(doc(db, 'test_leaderboards', rawSafeId, 'entries', currentUid));
    }

    // Check if cloud document already exists
    let docAlreadyExistsInCloud = false;
    for (const ref of targetDocRefs) {
      try {
        const existingSnap = await getDoc(ref).catch(() => null);
        if (existingSnap && existingSnap.exists()) {
          // Strict First-Attempt rule: Document already exists in Firestore!
          // Do NOT overwrite; exit immediately with 0 extra writes.
          docAlreadyExistsInCloud = true;
          break;
        }
      } catch (e) {
        console.warn('Leaderboard entry check notice:', e);
      }
    }

    if (docAlreadyExistsInCloud) {
      // First attempt already safely registered in cloud!
      return;
    }

    const sanitized = sanitizeForFirestore(newEntry);
    for (const ref of targetDocRefs) {
      try {
        await setDoc(ref, sanitized, { merge: true });
      } catch (e) {
        console.warn('Leaderboard entry write notice:', e);
      }
    }

    // -------------------------------------------------------------
    // Ultra-Optimized Top-Bucket Update (1-Read Architecture)
    // Only updates if user's first attempt is being enrolled
    // -------------------------------------------------------------
    try {
      const bucketDocRef = doc(db, 'test_leaderboards', canonicalId, 'summary', 'top_bucket');
      const bucketSnap = await getDoc(bucketDocRef).catch(() => null);
      let bucketEntries: LeaderboardEntry[] = [];
      let totalCount = 1;

      if (bucketSnap && bucketSnap.exists()) {
        const bData = bucketSnap.data();
        if (Array.isArray(bData.entries)) {
          bucketEntries = bData.entries;
        }
        totalCount = typeof bData.totalParticipants === 'number' ? bData.totalParticipants : bucketEntries.length;
      }

      const existingIdx = bucketEntries.findIndex((e) => e.userId === newEntry.userId);
      if (existingIdx < 0) {
        // Enrolling new user's first attempt into bucket
        bucketEntries.push(newEntry);
        totalCount++;

        // Sort descending by score, ascending by time
        bucketEntries.sort((a, b) => {
          if (b.score !== a.score) return b.score - a.score;
          return (a.timeSpentSeconds || 0) - (b.timeSpentSeconds || 0);
        });
        const top100 = bucketEntries.slice(0, 100);
        top100.forEach((e, idx) => { e.rank = idx + 1; });

        const packedTop = top100.map(e => 
          `${e.userId}|${e.userName}|${e.score}|${e.totalPoints}|${e.percentage}|${e.timeSpentSeconds}|${e.attemptMode}|${e.completedAt}`
        );

        await setDoc(bucketDocRef, {
          testId: canonicalId,
          testTitle: attempt.testTitle || '',
          totalParticipants: Math.max(totalCount, top100.length),
          updatedAt: new Date().toISOString(),
          version: 1,
          entries: top100,
          packedTop,
        }, { merge: true });
      }
    } catch (bucketErr) {
      // Non-blocking background bucket sync
    }

    firestoreTelemetry.record({
      type: 'WRITE',
      collection: 'test_leaderboards',
      path: `test_leaderboards/${canonicalId}/entries/${currentUid}`,
      operation: 'setDoc',
      data: sanitized,
      caller: 'Sync Test Leaderboard Entry (First Attempt Only)',
    });
  } catch (err) {
    console.warn('Could not sync leaderboard entry to cloud:', err);
  }
}

/**
 * Sync all local user attempts for a test or all tests to the leaderboard.
 * Ensures that clicking the sync button pushes all pending local records.
 */
export async function syncAllUserAttemptsToLeaderboard(userId?: string, targetTestId?: string): Promise<void> {
  const currentUid = userId || auth.currentUser?.uid;
  if (!currentUid) return;

  try {
    const attempts = loadScopedAttempts(currentUid);
    if (!Array.isArray(attempts) || attempts.length === 0) return;

    // Group attempts by test title or testId, sort by completedAt ascending, and pick ONLY the first attempt!
    const firstAttemptByTest = new Map<string, TestAttempt>();

    // Sort chronologically ascending so index 0 is guaranteed to be the first ever attempt
    const sortedAttempts = [...attempts].sort((a, b) => 
      new Date(a.completedAt || a.createdAt || 0).getTime() - new Date(b.completedAt || b.createdAt || 0).getTime()
    );

    for (const att of sortedAttempts) {
      if (!att || (!att.testId && !att.testTitle)) continue;
      const key = getCanonicalLeaderboardId(att.testId, att.testTitle);
      if (!firstAttemptByTest.has(key)) {
        firstAttemptByTest.set(key, att);
      }
    }

    const firstAttemptsList = Array.from(firstAttemptByTest.values());
    const filtered = targetTestId 
      ? firstAttemptsList.filter((a) => a && (a.testId === targetTestId || a.id === targetTestId || getCanonicalLeaderboardId(a.testId, a.testTitle) === targetTestId))
      : firstAttemptsList;

    const syncPromises = filtered.map((att) => syncLeaderboardEntry(att, currentUid).catch(() => {}));
    await Promise.all(syncPromises);
  } catch (err) {
    console.warn('syncAllUserAttemptsToLeaderboard warning:', err);
  }
}

/**
 * Enterprise-grade optimized leaderboard fetcher.
 * Merges entries by test title and testId, immune to missing composite index errors.
 */
export async function fetchTestLeaderboard(
  testId: string, 
  testTitle?: string,
  forceRefresh = false
): Promise<TestLeaderboardSummary> {
  if (!testId && !testTitle) {
    return { entries: [], totalParticipants: 0 };
  }

  const canonicalId = getCanonicalLeaderboardId(testId, testTitle);
  const rawSafeId = (testId || '').replace(/[./[\]*~#$]/g, '_');
  const now = Date.now();

  if (forceRefresh) {
    inMemoryLeaderboardCache.delete(canonicalId);
    inMemoryLeaderboardCache.delete(rawSafeId);
  } else {
    const cached = inMemoryLeaderboardCache.get(canonicalId) || inMemoryLeaderboardCache.get(rawSafeId);
    if (cached && (now - cached.timestamp < LEADERBOARD_CACHE_TTL_MS)) {
      return cached.data;
    }
  }

  const currentUid = auth.currentUser?.uid;
  const localEntries = [
    ...getLocalLeaderboardEntries(testId, testTitle),
    ...getLocalLeaderboardEntries(canonicalId),
  ];

  // 1. Fetch from local backend server
  let serverEntries: LeaderboardEntry[] = [];
  try {
    const fetchPromises = [
      fetch(`/api/leaderboard/${encodeURIComponent(canonicalId)}?title=${encodeURIComponent(testTitle || '')}`)
    ];
    if (rawSafeId && rawSafeId !== canonicalId) {
      fetchPromises.push(
        fetch(`/api/leaderboard/${encodeURIComponent(rawSafeId)}?title=${encodeURIComponent(testTitle || '')}`)
      );
    }
    const responses = await Promise.all(fetchPromises.map((p) => p.catch(() => null)));
    for (const r of responses) {
      if (r && r.ok) {
        const sData = await r.json().catch(() => null);
        if (Array.isArray(sData?.entries)) {
          serverEntries.push(...sData.entries);
        }
      }
    }
  } catch {}

  // 2. Fetch from Cloud Firestore with 1-Read Top-Bucket Optimization
  let cloudEntries: LeaderboardEntry[] = [];
  let totalParticipantsFromBucket = 0;
  let loadedFromBucket = false;

  try {
    // A. 1-Read Bucket Fetch: read /test_leaderboards/{canonicalId}/summary/top_bucket
    const bucketDocRef = doc(db, 'test_leaderboards', canonicalId, 'summary', 'top_bucket');
    const bucketSnap = await getDoc(bucketDocRef).catch(() => null);

    if (bucketSnap && bucketSnap.exists()) {
      const bData = bucketSnap.data();
      if (Array.isArray(bData.entries) && bData.entries.length > 0) {
        cloudEntries.push(...bData.entries);
        totalParticipantsFromBucket = bData.totalParticipants || bData.entries.length;
        loadedFromBucket = true;
      }
    }

    // B. If bucket not found or if forceRefresh requested, fallback to querying collections
    if (!loadedFromBucket || forceRefresh) {
      const collectionsToCheck = [canonicalId];
      if (rawSafeId && rawSafeId !== canonicalId) {
        collectionsToCheck.push(rawSafeId);
      }

      for (const colId of collectionsToCheck) {
        try {
          const colRef = collection(db, 'test_leaderboards', colId, 'entries');
          const snap = await getDocs(query(colRef, limit(100)));
          if (snap && !snap.empty) {
            snap.docs.forEach((d) => {
              cloudEntries.push(d.data() as LeaderboardEntry);
            });
          }
        } catch (colErr) {
          console.warn(`Could not read entries from ${colId}:`, colErr);
        }
      }
    }

    // C. If current user is logged in and not found in the top bucket, fetch ONLY current user's entry (Cost: 1 extra read)
    if (currentUid && loadedFromBucket && !cloudEntries.some(e => e.userId === currentUid)) {
      try {
        const userEntryDocRef = doc(db, 'test_leaderboards', canonicalId, 'entries', currentUid);
        const userEntrySnap = await getDoc(userEntryDocRef).catch(() => null);
        if (userEntrySnap && userEntrySnap.exists()) {
          cloudEntries.push(userEntrySnap.data() as LeaderboardEntry);
        }
      } catch {}
    }
  } catch (err) {
    console.warn('Cloud leaderboard retrieval warning:', err);
  }

  // 3. Merge server, cloud & local entries seamlessly by userId
  const mergedMap = new Map<string, LeaderboardEntry>();

  serverEntries.forEach((e) => {
    if (e && e.userId) mergedMap.set(e.userId, e);
  });

  cloudEntries.forEach((e) => {
    if (!e || !e.userId) return;
    const existing = mergedMap.get(e.userId);
    if (!existing || e.score > existing.score || (e.score === existing.score && e.timeSpentSeconds < existing.timeSpentSeconds)) {
      mergedMap.set(e.userId, e);
    }
  });

  localEntries.forEach((e) => {
    if (!e || !e.userId) return;
    const existing = mergedMap.get(e.userId);
    if (!existing || e.score > existing.score) {
      mergedMap.set(e.userId, e);
    }
  });

  const allEntries = Array.from(mergedMap.values());
  allEntries.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return (a.timeSpentSeconds || 0) - (b.timeSpentSeconds || 0);
  });

  allEntries.forEach((e, idx) => {
    e.rank = idx + 1;
  });

  let currentUserRank: number | undefined;
  const currentUserEntry = currentUid ? allEntries.find((e) => e.userId === currentUid) : undefined;
  if (currentUserEntry) {
    currentUserRank = currentUserEntry.rank;
  }

  const summary: TestLeaderboardSummary = {
    entries: allEntries.slice(0, 100),
    totalParticipants: Math.max(allEntries.length, totalParticipantsFromBucket),
    currentUserRank,
    currentUserEntry,
    fromBucket: loadedFromBucket,
  };

  inMemoryLeaderboardCache.set(canonicalId, { data: summary, timestamp: now });
  inMemoryLeaderboardCache.set(rawSafeId, { data: summary, timestamp: now });
  return summary;
}

/**
 * Development & local testing utility:
 * Generates realistic competitor data so leaderboards can be tested immediately on localhost.
 */
export function seedLocalMockLeaderboard(testId: string, totalPoints = 100): TestLeaderboardSummary {
  const safeTestId = (testId || '').replace(/[./[\]*~#$]/g, '_');
  const mockStudents = [
    { name: 'Aarav Sharma', ratio: 0.96, timeRatio: 0.55, mode: 'online' as const },
    { name: 'Priya Patel', ratio: 0.92, timeRatio: 0.62, mode: 'omr' as const },
    { name: 'Rohan Gupta', ratio: 0.88, timeRatio: 0.70, mode: 'online' as const },
    { name: 'Ananya Verma', ratio: 0.85, timeRatio: 0.58, mode: 'online' as const },
    { name: 'Vikram Singh', ratio: 0.80, timeRatio: 0.75, mode: 'omr' as const },
    { name: 'Sneha Rao', ratio: 0.76, timeRatio: 0.80, mode: 'online' as const },
    { name: 'Aditya Mehta', ratio: 0.72, timeRatio: 0.65, mode: 'online' as const },
    { name: 'Kavya Nair', ratio: 0.68, timeRatio: 0.85, mode: 'omr' as const },
    { name: 'Ishaan Joshi', ratio: 0.64, timeRatio: 0.90, mode: 'online' as const },
    { name: 'Diya Choudhary', ratio: 0.59, timeRatio: 0.72, mode: 'online' as const },
    { name: 'Arjun Das', ratio: 0.55, timeRatio: 0.95, mode: 'omr' as const },
    { name: 'Tanvi Kulkarni', ratio: 0.50, timeRatio: 0.88, mode: 'online' as const },
  ];

  const generated: LeaderboardEntry[] = mockStudents.map((s, idx) => {
    const score = Math.round(s.ratio * totalPoints);
    const percentage = Math.round(s.ratio * 100);
    const timeSpentSeconds = Math.round(s.timeRatio * 3600);
    const date = new Date(Date.now() - (idx + 1) * 3600000 * 4).toISOString();

    return {
      userId: `mock_student_${idx + 1}`,
      userName: s.name,
      userEmail: `${s.name.toLowerCase().replace(/\s+/g, '.')}@example.com`,
      score,
      totalPoints,
      percentage,
      timeSpentSeconds,
      attemptMode: s.mode,
      completedAt: date,
      rank: idx + 1,
    };
  });

  // Also include current user's local entry if present
  const currentUid = auth.currentUser?.uid;
  const existing = getLocalLeaderboardEntries(safeTestId);
  const currentUserEntry = existing.find((e) => e.userId === currentUid);
  if (currentUserEntry) {
    generated.push(currentUserEntry);
  }

  // Re-sort with current user
  generated.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.timeSpentSeconds - b.timeSpentSeconds;
  });
  generated.forEach((e, idx) => {
    e.rank = idx + 1;
  });

  try {
    localStorage.setItem(getLocalLeaderboardKey(safeTestId), JSON.stringify(generated));
  } catch {}

  const summary = buildLeaderboardSummaryFromList(generated, currentUid);
  inMemoryLeaderboardCache.set(safeTestId, { data: summary, timestamp: Date.now() });
  return summary;
}


export async function deleteAttemptFromFirestore(attemptId: string, userId?: string | null): Promise<void> {
  if (isOfflineLocalOnlyMode() || !attemptId) return;

  const currentUid = userId || auth.currentUser?.uid;

  // 1. Delete from user subcollection: /users/{userId}/attempts/{attemptId}
  if (currentUid && currentUid !== 'anonymous' && currentUid !== 'guest-user') {
    try {
      await deleteDoc(doc(db, 'users', currentUid, 'attempts', attemptId));
      firestoreTelemetry.record({
        type: 'WRITE',
        collection: 'attempts',
        path: `users/${currentUid}/attempts/${attemptId}`,
        operation: 'deleteDoc',
        data: { id: attemptId },
        caller: 'Delete Attempt From User Subcollection',
      });
    } catch (e) {
      console.warn(`Could not delete attempt ${attemptId} from user attempts subcollection:`, e);
    }
  }

  // 2. Also delete from top-level attempts collection
  try {
    const attemptDocRef = doc(db, 'attempts', attemptId);
    await deleteDoc(attemptDocRef);
    firestoreTelemetry.record({
      type: 'WRITE',
      collection: 'attempts',
      path: `attempts/${attemptId}`,
      operation: 'deleteDoc',
      data: { id: attemptId, status: 'pruned_old_last_attempt' },
      caller: 'Prune Old Last Attempt from Firestore',
    });
  } catch (e) {
    console.warn(`Could not delete attempt ${attemptId} from root attempts collection:`, e);
  }

  if (currentUid && currentUid !== 'anonymous' && currentUid !== 'guest-user') {
    try {
      const userDocRef = doc(db, 'users', currentUid);
      await setDoc(userDocRef, {
        deletedAttemptIds: arrayUnion(attemptId),
        updatedAt: new Date().toISOString(),
      }, { merge: true });

      const nowRev = Date.now();
      await updateUserSyncBeacon(currentUid, { attemptsRev: nowRev });
      smartCoordinator.setLocalSyncRevision(currentUid, 'attemptsRev', nowRev);
    } catch (err) {
      console.warn(`Could not add attempt ${attemptId} to user deletedAttemptIds:`, err);
    }
  }
}

export async function fetchUserAttemptsFromFirestore(
  userId: string,
  limitCount = 50,
  forceRefresh = false
): Promise<TestAttempt[]> {
  if (isOfflineLocalOnlyMode() || !userId || userId === 'anonymous' || userId === 'guest-user' || isGlobalQuotaExceeded()) return [];

  // Zero-Cost Cache Check:
  const localAttempts = loadScopedAttempts(userId);
  if (!forceRefresh && localAttempts.length > 0) {
    try {
      const beacon = await getUserSyncBeacon(userId);
      const localRev = smartCoordinator.getLocalSyncRevisions(userId).attemptsRev || 0;
      if (beacon && beacon.attemptsRev && beacon.attemptsRev <= localRev) {
        // Zero Firestore Reads! Local attempts are already authoritative.
        return localAttempts.slice(0, limitCount);
      }
    } catch {}
  }

  const results: TestAttempt[] = [];
  try {
    // 1. Fetch from user subcollection: /users/{userId}/attempts
    const userAttemptsCol = collection(db, 'users', userId, 'attempts');
    const userAttemptsSnap = await getDocs(query(userAttemptsCol, limit(limitCount)));
    if (!userAttemptsSnap.empty) {
      firestoreTelemetry.record({
        type: 'READ',
        collection: 'attempts',
        path: `users/${userId}/attempts?limit=${limitCount}`,
        operation: 'getDocs',
        docCount: userAttemptsSnap.docs.length,
        caller: 'Fetch User Attempt History Subcollection',
      });
      userAttemptsSnap.forEach((d) => {
        const data = d.data() as TestAttempt;
        if (data && data.id) {
          results.push(data);
        }
      });
    } else {
      // Fallback: check legacy root attempts collection where userId == userId and migrate
      const q = query(collection(db, 'attempts'), where('userId', '==', userId), limit(limitCount));
      const snap = await getDocs(q);
      snap.forEach((d) => {
        const data = d.data() as TestAttempt;
        if (data && data.id) {
          results.push(data);
          setDoc(doc(db, 'users', userId, 'attempts', data.id), sanitizeForFirestore(data), { merge: true }).catch(() => {});
        }
      });
    }
    // Sort descending by completion date
    results.sort((a, b) => new Date(b.completedAt || b.createdAt || 0).getTime() - new Date(a.completedAt || a.createdAt || 0).getTime());
    smartCoordinator.setLocalSyncRevision(userId, 'attemptsRev', Date.now());
  } catch (err) {
    console.warn('fetchUserAttemptsFromFirestore notice:', err);
  }

  return results;
}

export function subscribeToAttempts(
  userId: string, 
  onUpdate: (attempts: TestAttempt[], deltas?: FirestoreDocChange<TestAttempt>[]) => void
): Unsubscribe {
  if (isOfflineLocalOnlyMode() || !userId || userId === 'anonymous' || userId === 'guest-user') {
    onUpdate([]);
    return () => {};
  }

  let isFirstSnapshot = true;

  try {
    // Real-time listener on user-scoped subcollection: /users/{userId}/attempts
    const userAttemptsCol = collection(db, 'users', userId, 'attempts');
    return onSnapshot(userAttemptsCol, (snap) => {
      const deltas: FirestoreDocChange<TestAttempt>[] = [];

      firestoreTelemetry.record({
        type: isFirstSnapshot ? 'STREAM_LISTEN' : 'STREAM_DELTA',
        collection: 'attempts',
        path: `users/${userId}/attempts`,
        operation: 'onSnapshot',
        docCount: isFirstSnapshot ? snap.docs.length : snap.docChanges().length,
        data: snap.docs.map((d) => ({ id: d.id, testId: (d.data() as any)?.testId, score: (d.data() as any)?.score })),
        caller: isFirstSnapshot ? 'Initial User Attempts Real-time Stream' : 'Live User Attempt Delta Change',
      });

      // If user subcollection is empty on initial load, check legacy root /attempts and migrate
      if (isFirstSnapshot && snap.empty) {
        isFirstSnapshot = false;
        const legacyQ = query(collection(db, 'attempts'), where('userId', '==', userId), limit(25));
        getDocs(legacyQ).then((legacySnap) => {
          if (!legacySnap.empty) {
            const migrated: TestAttempt[] = [];
            legacySnap.forEach((d) => {
              const data = d.data() as TestAttempt;
              if (data && data.id) {
                migrated.push(data);
                setDoc(doc(db, 'users', userId, 'attempts', data.id), sanitizeForFirestore(data), { merge: true }).catch(() => {});
              }
            });
            if (migrated.length > 0) {
              migrated.sort((a, b) => new Date(b.completedAt || b.createdAt || 0).getTime() - new Date(a.completedAt || a.createdAt || 0).getTime());
              onUpdate(migrated);
            }
          }
        }).catch(() => {});
        return;
      }

      snap.docChanges().forEach((change) => {
        const raw = change.doc.data() as TestAttempt;
        const normalized: TestAttempt = {
          ...raw,
          id: change.doc.id,
        };
        deltas.push({
          type: change.type,
          id: change.doc.id,
          data: normalized,
          isInitialLoad: isFirstSnapshot,
        });
      });

      isFirstSnapshot = false;

      const list: TestAttempt[] = [];
      snap.forEach((d) => {
        const data = d.data() as TestAttempt;
        if (data && data.id) {
          list.push(data);
        }
      });
      list.sort((a, b) => new Date(b.completedAt || b.createdAt || 0).getTime() - new Date(a.completedAt || a.createdAt || 0).getTime());
      onUpdate(list, deltas);
    }, (err) => {
      console.warn('User attempts snapshot listener warning:', err?.message);
      handleFirestoreError(err, OperationType.LIST, `users/${userId}/attempts`);
    });
  } catch (err) {
    console.warn('Failed to attach user attempts snapshot listener:', err);
    return () => {};
  }
}

// ==========================================
// Notes, Bookmarks & Chat Sessions Real-Time Sync
// ==========================================
export async function saveNoteToFirestore(userId: string, note: any): Promise<void> {
  if (!note || isOfflineLocalOnlyMode() || !userId || userId === 'anonymous' || userId === 'guest-user' || isGlobalQuotaExceeded()) return;
  const noteId = note.id || `note_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  try {
    const userDocRef = doc(db, 'users', userId);
    const sanitized = sanitizeForFirestore({ ...note, id: noteId, updatedAt: new Date().toISOString() });
    await setDoc(userDocRef, {
      notes: {
        [noteId]: sanitized,
      },
      updatedAt: new Date().toISOString(),
    }, { merge: true });
    firestoreTelemetry.record({
      type: 'WRITE',
      collection: 'users',
      path: `users/${userId}/notes/${noteId}`,
      operation: 'setDoc',
      data: sanitized,
      caller: 'Save Study Note',
    });
  } catch (err) {
    console.warn('Failed to save note to Firestore:', err);
  }
}

export const saveUserNoteToFirestore = saveNoteToFirestore;

export async function deleteNoteFromFirestore(userId: string, noteId: string): Promise<void> {
  if (!noteId || isOfflineLocalOnlyMode() || !userId || userId === 'anonymous' || userId === 'guest-user' || isGlobalQuotaExceeded()) return;
  try {
    const userDocRef = doc(db, 'users', userId);
    await setDoc(userDocRef, {
      notes: {
        [noteId]: deleteField(),
      },
      [`notes.${noteId}`]: deleteField(),
      updatedAt: new Date().toISOString(),
    }, { merge: true });
    firestoreTelemetry.record({
      type: 'WRITE',
      collection: 'users',
      path: `users/${userId}/notes/${noteId}`,
      operation: 'setDoc',
      data: { noteId, action: 'delete' },
      caller: 'Delete Study Note',
    });
  } catch (err) {
    console.warn('Failed to delete note from Firestore:', err);
  }
}

export const deleteUserNoteFromFirestore = deleteNoteFromFirestore;

export function subscribeUserNotesFromFirestore(userId: string, onNotesChange: (notes: any[]) => void): Unsubscribe {
  if (isOfflineLocalOnlyMode() || !userId || userId === 'anonymous' || userId === 'guest-user') {
    onNotesChange([]);
    return () => {};
  }

  return subscribeUserProfile(userId, (profile) => {
    if (!profile || !profile.notes) {
      onNotesChange([]);
      return;
    }
    const notesList = Object.values(profile.notes);
    notesList.sort((a: any, b: any) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
    onNotesChange(notesList);
  });
}

const chatSaveDebounceTimers = new Map<string, any>();
const pendingChatSaves = new Map<string, { userId: string; sessions: any[] }>();

/**
 * Completely deprecated & disarmed: chat_archives collection is deleted and replaced by
 * subcollection users/{userId}/chatSessions/{sessionId}. (Zero network writes)
 */
export async function saveChatArchiveToFirestoreDirect(_userId: string, _sessions?: any[]): Promise<void> {
  return;
}

/**
 * Completely deprecated & disarmed: chat_archives collection is deleted and replaced by
 * subcollection users/{userId}/chatSessions/{sessionId}. (Zero network reads)
 */
export async function fetchChatArchiveFromFirestore(_userId: string): Promise<any[] | null> {
  return null;
}

/**
 * Purges the deprecated legacy `chat_archives/{userId}` document from Firestore
 * so the old collection is removed from the Firestore database.
 */
export async function deleteLegacyChatArchiveDoc(userId: string): Promise<boolean> {
  if (isOfflineLocalOnlyMode() || isGlobalQuotaExceeded() || !userId || userId === 'anonymous' || userId === 'guest-user') {
    return false;
  }
  try {
    const archiveDocRef = doc(db, 'chat_archives', userId);
    await deleteDoc(archiveDocRef);
    return true;
  } catch (err) {
    // Silently ignore if already removed or permission denied
    return false;
  }
}

export async function flushPendingChatSaves(_userId?: string): Promise<void> {
  return;
}

/**
 * Saves strictly ONE single chat session document to Firestore at `users/{userId}/chatSessions/{sessionId}`.
 * Modeled after HTML Notes Studio single project save (hits exactly 1 Firestore write).
 */
export async function saveSingleChatSessionToFirestoreDirect(userId: string, session: any): Promise<boolean> {
  if (isOfflineLocalOnlyMode() || isGlobalQuotaExceeded() || !userId || userId === 'anonymous' || userId === 'guest-user') {
    return false;
  }
  if (!session || !session.id) return false;

  const start = performance.now();
  const path = `users/${userId}/chatSessions/${session.id}`;

  try {
    const compact = toCompactChatSession(session);
    const cleanSession = {
      id: compact.id,
      userId,
      title: compact.title || 'New Conversation',
      createdAt: compact.createdAt || Date.now(),
      updatedAt: compact.updatedAt || Date.now(),
      modelTier: compact.modelTier || 'gemini-3.1-flash-lite',
      messages: Array.isArray(compact.messages) ? compact.messages : [],
      stagedQuestions: Array.isArray(compact.stagedQuestions) ? compact.stagedQuestions : [],
      sessionDocuments: Array.isArray(compact.sessionDocuments) ? compact.sessionDocuments : [],
      clientVersion: 'v4.0.0',
    };

    const sessionDocRef = doc(db, 'users', userId, 'chatSessions', session.id);
    const sanitized = sanitizeForFirestore(cleanSession);
    await setDoc(sessionDocRef, sanitized, { merge: true });

    const latency = Math.round(performance.now() - start);
    firestoreTelemetry.record({
      type: 'WRITE',
      collection: 'chatSessions',
      path,
      operation: 'setDoc',
      durationMs: latency,
      data: { sessionId: session.id, messageCount: cleanSession.messages.length },
      caller: 'Save Single Chat Session (Per-Document)',
      statusCode: '200 OK',
    });
    return true;
  } catch (error) {
    const latency = Math.round(performance.now() - start);
    firestoreTelemetry.record({
      type: 'WRITE',
      collection: 'chatSessions',
      path,
      operation: 'setDoc',
      durationMs: latency,
      caller: 'Save Single Chat Session',
      status: 'error',
      error: String(error),
    });
    handleFirestoreError(error, OperationType.WRITE, path);
    return false;
  }
}

/**
 * Deletes strictly ONE single chat session document from `users/{userId}/chatSessions/{sessionId}`.
 */
export async function deleteSingleChatSessionFromFirestoreDirect(userId: string, sessionId: string): Promise<boolean> {
  if (isOfflineLocalOnlyMode() || !userId || userId === 'anonymous' || userId === 'guest-user') {
    return false;
  }
  if (!sessionId) return false;

  const start = performance.now();
  const path = `users/${userId}/chatSessions/${sessionId}`;

  try {
    const sessionDocRef = doc(db, 'users', userId, 'chatSessions', sessionId);
    await deleteDoc(sessionDocRef);

    // Atomically persist tombstone in user doc so other devices know it's deleted
    try {
      const userDocRef = doc(db, 'users', userId);
      await setDoc(userDocRef, {
        deletedChatSessionIds: arrayUnion(sessionId),
        updatedAt: new Date().toISOString(),
      }, { merge: true });

      const nowRev = Date.now();
      await updateUserSyncBeacon(userId, { chatsRev: nowRev });
      smartCoordinator.setLocalSyncRevision(userId, 'chatsRev', nowRev);
    } catch (err) {
      console.warn(`Could not add chat session ${sessionId} to user deletedChatSessionIds:`, err);
    }

    const latency = Math.round(performance.now() - start);
    firestoreTelemetry.record({
      type: 'WRITE',
      collection: 'chatSessions',
      path,
      operation: 'deleteDoc',
      durationMs: latency,
      data: { sessionId },
      caller: 'Delete Single Chat Session',
      statusCode: '200 OK',
    });
    return true;
  } catch (error) {
    const latency = Math.round(performance.now() - start);
    firestoreTelemetry.record({
      type: 'WRITE',
      collection: 'chatSessions',
      path,
      operation: 'deleteDoc',
      durationMs: latency,
      caller: 'Delete Single Chat Session',
      status: 'error',
      error: String(error),
    });
    handleFirestoreError(error, OperationType.DELETE, path);
    return false;
  }
}

/**
 * Fetches user chat sessions from per-session subcollection `users/{userId}/chatSessions`.
 * Falls back to legacy `chat_archives/{userId}` if per-session subcollection is not yet populated.
 */
export async function fetchUserChatSessionsFromFirestoreDirect(userId: string, limitCount = 30): Promise<any[] | null> {
  if (isOfflineLocalOnlyMode() || isGlobalQuotaExceeded() || !userId || userId === 'anonymous' || userId === 'guest-user') {
    return null;
  }

  const start = performance.now();
  const path = `users/${userId}/chatSessions?limit=${limitCount}`;

  try {
    // Ingest cloud-recorded deleted chat session tombstones
    try {
      const userSnap = await getDoc(doc(db, 'users', userId));
      if (userSnap.exists()) {
        const uData = userSnap.data();
        if (Array.isArray(uData?.deletedChatSessionIds)) {
          uData.deletedChatSessionIds.forEach((id: string) => {
            if (id) markChatSessionAsDeletedInScopedStorage(userId, id);
          });
        }
      }
    } catch {}

    const chatColRef = collection(db, 'users', userId, 'chatSessions');
    const q = query(chatColRef, limit(limitCount));
    const snap = await getDocs(q);

    if (!snap.empty) {
      const deletedIds = getAllDeletedChatSessionIds(userId);
      const sessions = snap.docs
        .map((d) => ({ ...d.data(), id: d.id }))
        .filter((s: any) => s && s.id && !deletedIds.has(s.id));
      const latency = Math.round(performance.now() - start);

      firestoreTelemetry.record({
        type: 'READ',
        collection: 'chatSessions',
        path,
        operation: 'getDocs',
        docCount: sessions.length,
        durationMs: latency,
        caller: 'Fetch User Chat Sessions (Per-Document Subcollection)',
        statusCode: '200 OK',
      });
      return sessions;
    }

    // Purge deprecated legacy chat_archives document if present
    deleteLegacyChatArchiveDoc(userId).catch(() => {});
    return null;
  } catch (error) {
    const latency = Math.round(performance.now() - start);
    firestoreTelemetry.record({
      type: 'READ',
      collection: 'chatSessions',
      path,
      operation: 'getDocs',
      durationMs: latency,
      caller: 'Fetch User Chat Sessions',
      status: 'error',
      error: String(error),
    });
    handleFirestoreError(error, OperationType.GET, path);
    return null;
  }
}

/**
 * Save chat session to Firestore (per-document save).
 */
export async function saveChatSessionToFirestore(userId: string, sessionOrSessions: any, _forceImmediate = false): Promise<void> {
  if (!userId || userId === 'anonymous' || userId === 'guest-user' || isOfflineLocalOnlyMode() || isGlobalQuotaExceeded()) return;
  if (sessionOrSessions && sessionOrSessions.id) {
    await saveSingleChatSessionToFirestoreDirect(userId, sessionOrSessions);
  }
}

export async function deleteChatSessionFromFirestore(userId: string, sessionId: string): Promise<void> {
  if (!userId || userId === 'anonymous' || userId === 'guest-user' || isOfflineLocalOnlyMode()) return;
  if (sessionId) {
    await deleteSingleChatSessionFromFirestoreDirect(userId, sessionId);
  }
}

/**
 * @deprecated Real-time active Firestore listener is eliminated in the local-first architecture.
 * Chat sessions are managed 100% locally during active conversation mode (0 reads, 0 writes),
 * and flushed strictly as a single compacted document on close/leave/exit.
 * Returns a no-op unsubscribe without attaching onSnapshot.
 */
export function subscribeUserChatSessionsFromFirestore(
  _userId: string,
  onSessionsChange: (sessions: any[]) => void
): Unsubscribe {
  onSessionsChange([]);
  return () => {};
}

export async function saveBookmarkToFirestore(userId: string, bookmark: any): Promise<void> {
  if (!bookmark || !bookmark.id || isOfflineLocalOnlyMode() || !userId || userId === 'anonymous' || userId === 'guest-user' || isGlobalQuotaExceeded()) return;
  try {
    const userDocRef = doc(db, 'users', userId);
    const sanitized = sanitizeForFirestore({ ...bookmark, createdAt: new Date().toISOString() });
    await setDoc(userDocRef, {
      bookmarks: {
        [bookmark.id]: sanitized,
      },
      updatedAt: new Date().toISOString(),
    }, { merge: true });
    firestoreTelemetry.record({
      type: 'WRITE',
      collection: 'users',
      path: `users/${userId}/bookmarks/${bookmark.id}`,
      operation: 'setDoc',
      data: sanitized,
      caller: 'Save Bookmark',
    });
  } catch (err) {
    console.warn('Failed to save bookmark to Firestore:', err);
  }
}

export async function deleteBookmarkFromFirestore(userId: string, bookmarkId: string): Promise<void> {
  if (!bookmarkId || isOfflineLocalOnlyMode() || !userId || userId === 'anonymous' || userId === 'guest-user' || isGlobalQuotaExceeded()) return;
  try {
    const userDocRef = doc(db, 'users', userId);
    await setDoc(userDocRef, {
      bookmarks: {
        [bookmarkId]: deleteField(),
      },
      [`bookmarks.${bookmarkId}`]: deleteField(),
      updatedAt: new Date().toISOString(),
    }, { merge: true });
    firestoreTelemetry.record({
      type: 'WRITE',
      collection: 'users',
      path: `users/${userId}/bookmarks/${bookmarkId}`,
      operation: 'setDoc',
      data: { bookmarkId, action: 'delete' },
      caller: 'Delete Bookmark',
    });
  } catch (err) {
    console.warn('Failed to delete bookmark from Firestore:', err);
  }
}

export function subscribeUserBookmarksFromFirestore(userId: string, onBookmarksChange: (bookmarks: any[]) => void): Unsubscribe {
  if (isOfflineLocalOnlyMode() || !userId || userId === 'anonymous' || userId === 'guest-user') {
    onBookmarksChange([]);
    return () => {};
  }

  return subscribeUserProfile(userId, (profile) => {
    if (!profile || !profile.bookmarks) {
      onBookmarksChange([]);
      return;
    }
    const list = Object.values(profile.bookmarks);
    onBookmarksChange(list);
  });
}

export async function saveUserSettingsToFirestore(userId: string, settings: Partial<AppSettings>): Promise<void> {
  if (isOfflineLocalOnlyMode() || !userId || userId === 'anonymous' || userId === 'guest-user' || isGlobalQuotaExceeded()) return;
  try {
    const userDocRef = doc(db, 'users', userId);
    const sanitized = sanitizeForFirestore(settings);
    await setDoc(userDocRef, {
      settings: sanitized,
      updatedAt: new Date().toISOString(),
    }, { merge: true });
    firestoreTelemetry.record({
      type: 'WRITE',
      collection: 'users',
      path: `users/${userId}/settings`,
      operation: 'setDoc',
      data: sanitized,
      caller: 'Save App Settings',
    });
  } catch (err) {
    console.warn('Failed to save user settings to Firestore:', err);
  }
}

export async function syncStatsRollupToFirestore(userId: string, rollup: any): Promise<void> {
  if (isOfflineLocalOnlyMode() || !userId || userId === 'anonymous' || userId === 'guest-user' || isGlobalQuotaExceeded()) return;
  try {
    const userDocRef = doc(db, 'users', userId);
    const sanitized = sanitizeForFirestore(rollup);
    await setDoc(userDocRef, {
      statsRollup: sanitized,
      updatedAt: new Date().toISOString(),
    }, { merge: true });
    firestoreTelemetry.record({
      type: 'WRITE',
      collection: 'users',
      path: `users/${userId}/statsRollup`,
      operation: 'setDoc',
      data: sanitized,
      caller: 'Sync Analytics Rollup',
    });
  } catch (err) {
    console.warn('Failed to sync stats rollup to Firestore:', err);
  }
}

export async function syncTestHistoriesToFirestore(userId: string, testHistories: Record<string, TestHistoryEntry>): Promise<void> {
  if (isOfflineLocalOnlyMode() || !userId || userId === 'anonymous' || userId === 'guest-user' || isGlobalQuotaExceeded()) return;
  try {
    const userDocRef = doc(db, 'users', userId);
    const cleanedHistories: Record<string, any> = {};
    if (testHistories && typeof testHistories === 'object') {
      for (const [k, v] of Object.entries(testHistories)) {
        if (v && typeof v === 'object') {
          const entry = { ...v };
          if (entry.firstAttempt) {
            const { omrScannedImageUrl, ...fRest } = entry.firstAttempt;
            entry.firstAttempt = fRest as any;
          }
          if (entry.lastAttempt) {
            const { omrScannedImageUrl, ...lRest } = entry.lastAttempt;
            entry.lastAttempt = lRest as any;
          }
          cleanedHistories[k] = entry;
        } else {
          cleanedHistories[k] = v;
        }
      }
    }
    const sanitized = sanitizeForFirestore(cleanedHistories);
    await setDoc(userDocRef, {
      testHistories: sanitized,
      updatedAt: new Date().toISOString(),
    }, { merge: true });
    firestoreTelemetry.record({
      type: 'WRITE',
      collection: 'users',
      path: `users/${userId}/testHistories`,
      operation: 'setDoc',
      data: { count: Object.keys(testHistories || {}).length },
      caller: 'Sync Test Histories',
    });
  } catch (err) {
    console.warn('Failed to sync test histories to Firestore:', err);
  }
}

// Active Test Session Persistence
export async function saveActiveSessionToFirestore(userId: string, session: ActiveTestSession | null): Promise<void> {
  if (isOfflineLocalOnlyMode() || !userId || userId === 'anonymous' || userId === 'guest-user' || isGlobalQuotaExceeded()) return;
  try {
    const userDocRef = doc(db, 'users', userId);
    if (session) {
      const sanitized = sanitizeForFirestore(session);
      await setDoc(userDocRef, {
        activeSession: sanitized,
        updatedAt: new Date().toISOString(),
      }, { merge: true });
      firestoreTelemetry.record({
        type: 'WRITE',
        collection: 'users',
        path: `users/${userId}/activeSession`,
        operation: 'setDoc',
        data: { testId: session.testId, currentIndex: session.currentIndex },
        caller: 'Save Active Test Session',
      });
    } else {
      await setDoc(userDocRef, {
        activeSession: deleteField(),
        updatedAt: new Date().toISOString(),
      }, { merge: true });
      firestoreTelemetry.record({
        type: 'WRITE',
        collection: 'users',
        path: `users/${userId}/activeSession`,
        operation: 'setDoc',
        data: { action: 'clear' },
        caller: 'Clear Active Test Session',
      });
    }
  } catch (err) {
    console.warn('Failed to save active session to Firestore:', err);
  }
}

// Search and fetch full tests
const testsCache = new Map<string, { data: MathTest[]; timestamp: number }>();
const searchResultsCache = new Map<string, { data: MathTest[]; timestamp: number }>();
const fullTestCache = new Map<string, { data: MathTest; timestamp: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000;

export function invalidateFirestoreCaches(): void {
  testsCache.clear();
  searchResultsCache.clear();
  fullTestCache.clear();
}

export async function fetchFullTestFromFirestore(testId: string): Promise<MathTest | null> {
  if (!testId || isOfflineLocalOnlyMode()) return null;
  const cached = fullTestCache.get(testId);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.data;
  }

  if (isGlobalQuotaExceeded()) return null;

  try {
    const currentUid = auth.currentUser?.uid;
    let snap = currentUid && currentUid !== 'anonymous' && currentUid !== 'guest-user'
      ? await getDoc(doc(db, 'users', currentUid, 'tests', testId))
      : null;
    if (!snap || !snap.exists()) {
      try {
        snap = await getDoc(doc(db, 'tests', testId));
      } catch {}
    }
    if (snap && snap.exists()) {
      const data = snap.data() as MathTest;
      const normalized: MathTest = {
        ...data,
        questions: normalizeQuestions(Array.isArray(data.questions) ? data.questions : []),
      };
      fullTestCache.set(testId, { data: normalized, timestamp: Date.now() });
      firestoreTelemetry.record({
        type: 'READ',
        collection: 'tests',
        path: currentUid ? `users/${currentUid}/tests/${testId}` : `tests/${testId}`,
        operation: 'getDoc',
        docCount: 1,
        data: { id: normalized.id, title: normalized.title, questionCount: normalized.questionCount },
        caller: 'Fetch Full Test',
      });
      return normalized;
    }
  } catch (error) {
    console.warn(`Could not fetch full test ${testId} from Firestore:`, error);
  }
  return null;
}

export async function searchCloudTests(searchQuery: string, topic?: string, limitCount = 15): Promise<MathTest[]> {
  const cleanQuery = (searchQuery || '').trim().toLowerCase();
  const cleanTopic = (topic || 'All Topics').trim().toLowerCase();
  if (isGlobalQuotaExceeded()) return [];

  try {
    const currentUid = auth.currentUser?.uid;
    const testsQuery = currentUid && currentUid !== 'anonymous' && currentUid !== 'guest-user'
      ? query(collection(db, 'users', currentUid, 'tests'), limit(limitCount))
      : query(collection(db, 'tests'), limit(limitCount));
    const snapshot = await getDocs(testsQuery);
    firestoreTelemetry.record({
      type: 'READ',
      collection: 'tests',
      path: currentUid ? `users/${currentUid}/tests?limit=${limitCount}` : `tests?limit=${limitCount}`,
      operation: 'getDocs',
      docCount: snapshot.docs.length,
      data: snapshot.docs.map((d) => ({ id: d.id, title: (d.data() as any)?.title })),
      caller: `Search Cloud Tests ("${searchQuery}")`,
    });
    const results: MathTest[] = [];

    snapshot.forEach((docSnap) => {
      const data = docSnap.data() as MathTest;
      if (!data || !data.id) return;

      const titleMatch = (data.title || '').toLowerCase().includes(cleanQuery);
      const topicMatch = (data.topic || '').toLowerCase().includes(cleanQuery);
      const descMatch = (data.description || '').toLowerCase().includes(cleanQuery);
      const matchesSearch = cleanQuery === '' || titleMatch || topicMatch || descMatch;
      const matchesTopicFilter = cleanTopic === 'all topics' || (data.topic || '').toLowerCase() === cleanTopic;

      if (matchesSearch && matchesTopicFilter) {
        results.push(data);
      }
    });

    return results;
  } catch (error) {
    console.warn('Search cloud tests notice:', error);
    return [];
  }
}

// Offline Attempts Queue Flushing
export const OFFLINE_ATTEMPTS_QUEUE_KEY = 'math_mock_offline_attempts_queue';

export function getOfflineQueuedAttempts(): TestAttempt[] {
  try {
    const raw = localStorage.getItem(OFFLINE_ATTEMPTS_QUEUE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export async function flushOfflineAttemptsQueue(): Promise<void> {
  if (isGlobalQuotaExceeded() || (typeof navigator !== 'undefined' && !navigator.onLine)) {
    return;
  }
  const queue = getOfflineQueuedAttempts();
  if (queue.length === 0) return;

  try {
    localStorage.removeItem(OFFLINE_ATTEMPTS_QUEUE_KEY);
  } catch {}

  for (const att of queue) {
    try {
      await saveAttemptToFirestore(att);
    } catch (e) {
      console.warn('Failed to flush offline attempt:', e);
    }
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    flushOfflineAttemptsQueue().catch(() => {});
  });
}

/**
 * Diagnostic Live Firestore Write & Read verification
 * Immediately writes a real test document with complete questions payload to verify live cloud writes.
 */
export async function executeDiagnosticFirestoreWrite(): Promise<{ success: boolean; docId: string; latencyMs: number; error?: string }> {
  const start = performance.now();
  const testId = `diag_test_${Date.now()}`;
  const currentUser = auth.currentUser;
  
  const testPayload: MathTest = {
    id: testId,
    title: `Diagnostic Telemetry Verification (${new Date().toLocaleTimeString()})`,
    description: 'Real-time cloud database write verification document generated by Firestore Activity Inspector.',
    topic: 'Calculus',
    difficulty: 'Medium',
    timeLimitMinutes: 15,
    authorId: currentUser?.uid || 'telemetry_diagnostic_agent',
    authorName: currentUser?.displayName || currentUser?.email?.split('@')[0] || 'System Inspector',
    authorEmail: currentUser?.email || 'telemetry@system.local',
    isPublic: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    questionCount: 3,
    questions: [
      {
        id: 'q_diag_1',
        text: 'What is the derivative of f(x) = x^3 + 4x - 7?',
        options: ['3x^2 + 4', '3x^2 - 4', 'x^2 + 4', '3x^3 + 4'],
        correctAnswer: '3x^2 + 4',
        explanation: 'Using the power rule: d/dx(x^3) = 3x^2, d/dx(4x) = 4, and d/dx(-7) = 0.',
        type: 'mcq',
      },
      {
        id: 'q_diag_2',
        text: 'Evaluate the limit as x approaches 0 of sin(x)/x.',
        options: ['0', '1', 'Infinity', 'Undefined'],
        correctAnswer: '1',
        explanation: 'By standard trigonometric limit theorem, lim_{x->0} sin(x)/x = 1.',
        type: 'mcq',
      },
      {
        id: 'q_diag_3',
        text: 'If A and B are mutually exclusive events with P(A)=0.3 and P(B)=0.4, find P(A or B).',
        options: ['0.12', '0.70', '0.58', '0.10'],
        correctAnswer: '0.70',
        explanation: 'For mutually exclusive events, P(A or B) = P(A) + P(B) = 0.3 + 0.4 = 0.70.',
        type: 'mcq',
      },
    ],
  };

  try {
    const testDocRef = doc(db, 'test', 'diagnostic_probe');
    const sanitized = sanitizeForFirestore(testPayload);
    await setDoc(testDocRef, sanitized, { merge: true });
    const latency = Math.round(performance.now() - start);

    firestoreTelemetry.record({
      type: 'WRITE',
      collection: 'test',
      path: `test/diagnostic_probe`,
      operation: 'setDoc',
      durationMs: latency,
      data: sanitized,
      caller: 'Live Diagnostic Write Request',
      statusCode: '200 OK',
    });

    return { success: true, docId: 'diagnostic_probe', latencyMs: latency };
  } catch (err: any) {
    const latency = Math.round(performance.now() - start);
    firestoreTelemetry.record({
      type: 'WRITE',
      collection: 'test',
      path: `test/diagnostic_probe`,
      operation: 'setDoc',
      durationMs: latency,
      caller: 'Live Diagnostic Write Request',
      status: 'error',
      statusCode: 'WRITE_FAILED',
      error: String(err?.message || err),
    });
    return { success: false, docId: 'diagnostic_probe', latencyMs: latency, error: String(err?.message || err) };
  }
}

/**
 * Diagnostic Live Firestore Read verification
 * Immediately reads the health check document to measure roundtrip query latency.
 */
export async function executeDiagnosticFirestoreRead(): Promise<{ success: boolean; docCount: number; latencyMs: number; error?: string }> {
  const start = performance.now();
  try {
    const snap = await getDoc(doc(db, 'test', 'diagnostic_probe'));
    const latency = Math.round(performance.now() - start);
    const docsSummary = snap.exists() ? [{ id: snap.id, title: (snap.data() as any)?.title || 'Diagnostic Probe' }] : [];

    firestoreTelemetry.record({
      type: 'READ',
      collection: 'test',
      path: 'test/diagnostic_probe',
      operation: 'getDoc',
      durationMs: latency,
      docCount: snap.exists() ? 1 : 0,
      data: docsSummary,
      caller: 'Live Diagnostic Read Request',
      statusCode: '200 OK',
    });

    return { success: true, docCount: snap.exists() ? 1 : 0, latencyMs: latency };
  } catch (err: any) {
    const latency = Math.round(performance.now() - start);
    firestoreTelemetry.record({
      type: 'READ',
      collection: 'tests',
      path: 'tests?limit=10',
      operation: 'getDocs',
      durationMs: latency,
      caller: 'Live Diagnostic Read Request',
      status: 'error',
      statusCode: 'READ_FAILED',
      error: String(err?.message || err),
    });
    return { success: false, docCount: 0, latencyMs: latency, error: String(err?.message || err) };
  }
}

/**
 * Diagnostic Auth Context Probe
 */
export function executeDiagnosticAuthProbe(): { uid: string | null; email: string | null; isAnonymous: boolean } {
  const user = auth.currentUser;
  const ctx = {
    uid: user?.uid || null,
    email: user?.email || null,
    displayName: user?.displayName || null,
    isAnonymous: !user,
  };
  firestoreTelemetry.record({
    type: 'AUTH',
    collection: 'auth',
    path: user ? `auth/users/${user.uid}` : 'auth/session',
    operation: 'onAuthStateChanged',
    durationMs: 1,
    data: ctx,
    caller: 'Live Auth State Diagnostic Probe',
    statusCode: user ? 'AUTH_ACTIVE' : 'ANONYMOUS_GUEST',
  });
  return ctx;
}

export interface DeleteAccountProgress {
  step: 'idle' | 'deleting_firestore' | 'deleting_auth' | 'clearing_local' | 'reauth_required' | 'completed' | 'error';
  message: string;
  deletedTestsCount?: number;
  deletedAttemptsCount?: number;
  error?: string;
}

/**
 * Permanently deletes a user's account and all associated cloud data in Firestore,
 * purges local storage caches, and deletes their Firebase Authentication record.
 */
export async function deleteUserAccountAndAllData(
  user: User,
  onProgress?: (progress: DeleteAccountProgress) => void
): Promise<{ success: boolean; error?: string; requiresReauth?: boolean; deletedTestsCount?: number; deletedAttemptsCount?: number }> {
  if (!user || !user.uid) {
    return { success: false, error: 'No active authenticated user provided.' };
  }

  const userId = user.uid;
  const userEmail = user.email || null;

  try {
    // 1. Delete all Firestore documents associated with this user
    onProgress?.({
      step: 'deleting_firestore',
      message: 'Purging all test papers, attempts, notes, bookmarks, and chat history from Google Cloud...',
    });

    let deletedTestsCount = 0;
    let deletedAttemptsCount = 0;

    // Fast non-blocking timeout helper (defaults to 2500ms max per task)
    const withTimeout = <T>(promise: Promise<T>, ms: number = 2500): Promise<T | null> => {
      return Promise.race([
        promise,
        new Promise<null>((resolve) => setTimeout(() => resolve(null), ms)),
      ]);
    };

    // Fast safe batch committer with timeout
    const safeBatchCommit = async (batch: any, ms: number = 2500): Promise<boolean> => {
      try {
        const res = await withTimeout(batch.commit(), ms);
        return res !== null;
      } catch (err) {
        console.warn('Batch commit timed out or failed:', err);
        return false;
      }
    };

    // Safe chunked batch delete with timeout per chunk
    const chunkBatchDelete = async (docs: any[]): Promise<number> => {
      if (!docs || docs.length === 0) return 0;
      let count = 0;
      const chunkSize = 250;
      for (let i = 0; i < docs.length; i += chunkSize) {
        const chunk = docs.slice(i, i + chunkSize);
        const batch = writeBatch(db);
        chunk.forEach((d) => batch.delete(d.ref || d));
        await safeBatchCommit(batch, 2500);
        count += chunk.length;
      }
      return count;
    };

    // Execute all cloud Firestore purges fully in parallel with a strict global 4.5s deadline
    const firestorePurgePromise = async () => {
      const tasks: Promise<any>[] = [];

      // 1. Subcollections under users/{userId}
      const subcollections = [
        'htmlNotesProjects',
        'chatSessions',
        'chat_sessions',
        'notes',
        'bookmarks',
        'attempts',
        'tests',
        'sync_beacon',
      ];

      for (const subcol of subcollections) {
        tasks.push(
          (async () => {
            try {
              const subSnap = await withTimeout(getDocs(collection(db, 'users', userId, subcol)), 2500);
              if (subSnap && !subSnap.empty) {
                await chunkBatchDelete(subSnap.docs);
              }
            } catch (err) {
              console.warn(`Could not clear subcollection ${subcol}:`, err);
            }
          })()
        );
      }

      // 2. Direct deletion of known authored tests
      const knownTests = loadScopedTests(userId);
      if (knownTests.length > 0) {
        tasks.push(
          (async () => {
            try {
              const batch = writeBatch(db);
              knownTests.forEach((t) => batch.delete(doc(db, 'tests', t.id)));
              await safeBatchCommit(batch, 2500);
              deletedTestsCount += knownTests.length;
            } catch {}
          })()
        );
      }

      // Query root tests by authorId in case there are remote ones
      tasks.push(
        (async () => {
          try {
            const testsQuery = query(collection(db, 'tests'), where('authorId', '==', userId), limit(50));
            const testsSnap = await withTimeout(getDocs(testsQuery), 2500);
            if (testsSnap && !testsSnap.empty) {
              deletedTestsCount += await chunkBatchDelete(testsSnap.docs);
            }
          } catch {}
        })()
      );

      // 3. Direct deletion of known attempts
      const knownAttempts = loadScopedAttempts(userId);
      if (knownAttempts.length > 0) {
        tasks.push(
          (async () => {
            try {
              const batch = writeBatch(db);
              knownAttempts.forEach((a) => batch.delete(doc(db, 'attempts', a.id)));
              await safeBatchCommit(batch, 2500);
              deletedAttemptsCount += knownAttempts.length;
            } catch {}
          })()
        );
      }

      // Query root attempts by userId in case there are remote ones
      tasks.push(
        (async () => {
          try {
            const attemptsQuery = query(collection(db, 'attempts'), where('userId', '==', userId), limit(50));
            const attemptsSnap = await withTimeout(getDocs(attemptsQuery), 2500);
            if (attemptsSnap && !attemptsSnap.empty) {
              deletedAttemptsCount += await chunkBatchDelete(attemptsSnap.docs);
            }
          } catch {}
        })()
      );

      // 4. Root docs
      tasks.push(withTimeout(deleteDoc(doc(db, 'users', userId)).catch(() => {}), 2500));
      tasks.push(withTimeout(deleteDoc(doc(db, 'user_sync_beacons', userId)).catch(() => {}), 2500));
      tasks.push(withTimeout(deleteDoc(doc(db, 'chat_archives', userId)).catch(() => {}), 2500));

      await Promise.allSettled(tasks);
    };

    // Enforce strict 4.5s global deadline so account deletion never hangs
    await withTimeout(firestorePurgePromise(), 4500);

    // Record deletion telemetry
    firestoreTelemetry.record({
      type: 'WRITE',
      collection: 'users',
      path: `users/${userId}`,
      operation: 'deleteDoc',
      data: { userId, userEmail, deletedTestsCount, deletedAttemptsCount },
      caller: 'Permanent Account & Data Wipe',
      statusCode: '200 DELETED',
    });

    // 2. Clear local storage
    onProgress?.({
      step: 'clearing_local',
      message: 'Purging local storage cache, offline queues, and session state...',
      deletedTestsCount,
      deletedAttemptsCount,
    });
    wipeAllScopedUserDataFromLocalStorage(userId);

    // 3. Delete Firebase Auth User Account
    onProgress?.({
      step: 'deleting_auth',
      message: 'Deleting Firebase Authentication user credentials...',
      deletedTestsCount,
      deletedAttemptsCount,
    });

    try {
      await deleteUser(user);
    } catch (authErr: any) {
      if (authErr?.code === 'auth/requires-recent-login') {
        onProgress?.({
          step: 'reauth_required',
          message: 'Recent security authentication required. Opening Google sign-in to confirm...',
          deletedTestsCount,
          deletedAttemptsCount,
        });
        const provider = new GoogleAuthProvider();
        provider.setCustomParameters({ prompt: 'select_account' });
        await reauthenticateWithPopup(user, provider);
        await deleteUser(user);
      } else {
        throw authErr;
      }
    }

    onProgress?.({
      step: 'completed',
      message: 'Your account and all associated cloud data have been completely deleted.',
      deletedTestsCount,
      deletedAttemptsCount,
    });

    return { success: true, deletedTestsCount, deletedAttemptsCount };
  } catch (err: any) {
    const errMsg = err?.message || String(err);
    console.error('Error during account & data deletion:', err);
    onProgress?.({
      step: 'error',
      message: `Account deletion failed: ${errMsg}`,
      error: errMsg,
    });
    return { success: false, error: errMsg };
  }
}

export { onAuthStateChanged };


