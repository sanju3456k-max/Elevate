export interface AppBrandFirebaseConfig {
  projectId: string;
  appId: string;
  apiKey: string;
  authDomain: string;
  firestoreDatabaseId?: string;
  storageBucket: string;
  messagingSenderId: string;
  measurementId?: string;
  oAuthClientId?: string;
}

export interface WebInstituteSessionOverride {
  instituteId: string;
  name: string;
  logoUrl?: string;
  ownerEmail: string;
  firebaseConfig?: AppBrandFirebaseConfig;
}

const WEB_INSTITUTE_OVERRIDE_KEY = 'elevate_active_web_institute_override_v1';

function parseEnvFirebaseConfig(): AppBrandFirebaseConfig | null {
  const raw = import.meta.env?.VITE_FIREBASE_CONFIG_JSON;
  if (!raw || typeof raw !== 'string') return null;
  try {
    const parsed = JSON.parse(raw);
    if (parsed && parsed.projectId && parsed.apiKey && parsed.appId) {
      return parsed as AppBrandFirebaseConfig;
    }
  } catch {
    // Ignore malformed env JSON and fall back to default Elevate config
  }
  return null;
}

function readWebInstituteOverride(): WebInstituteSessionOverride | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(WEB_INSTITUTE_OVERRIDE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && parsed.instituteId) {
      return parsed as WebInstituteSessionOverride;
    }
  } catch {
    // Ignore storage parse error
  }
  return null;
}

export function saveWebInstituteSession(session: WebInstituteSessionOverride): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(WEB_INSTITUTE_OVERRIDE_KEY, JSON.stringify(session));
  } catch {
    // Ignore storage error
  }
}

export function clearWebInstituteSession(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(WEB_INSTITUTE_OVERRIDE_KEY);
  } catch {
    // Ignore storage error
  }
}

const FALLBACK_TENANT_LOGOS: Record<string, string> = {
  inst_apex_01: './assets/tenants/apexAcademy.png',
};

const envInstituteId = (import.meta.env?.VITE_INSTITUTE_ID || '').trim();
const isBuildTimeWhiteLabel = Boolean(envInstituteId);
const webOverride = isBuildTimeWhiteLabel ? null : readWebInstituteOverride();
const isWebInstituteActive = Boolean(webOverride?.firebaseConfig?.projectId);
const resolvedInstituteId = envInstituteId || webOverride?.instituteId || '';

export const APP_BRAND = {
  instituteId: resolvedInstituteId,
  isLockedApk: isBuildTimeWhiteLabel,
  isWhiteLabel: isBuildTimeWhiteLabel || isWebInstituteActive,
  isWebInstituteActive,
  name: (
    import.meta.env?.VITE_INSTITUTE_NAME ||
    (isWebInstituteActive ? webOverride?.name : '') ||
    'Elevate'
  ).trim(),
  activeInstituteLabel: isBuildTimeWhiteLabel
    ? (import.meta.env?.VITE_INSTITUTE_NAME || 'Elevate').trim()
    : (webOverride?.name || ''),
  logoUrl: (
    import.meta.env?.VITE_INSTITUTE_LOGO ||
    (isWebInstituteActive ? webOverride?.logoUrl || FALLBACK_TENANT_LOGOS[resolvedInstituteId] || '' : '') ||
    './assets/preplens-icon.svg?v=25'
  ).trim(),
  ownerEmail: (
    import.meta.env?.VITE_OWNER_EMAIL ||
    webOverride?.ownerEmail ||
    'sanju3456k@gmail.com'
  )
    .trim()
    .toLowerCase(),
  firebaseConfig: parseEnvFirebaseConfig() ?? webOverride?.firebaseConfig ?? null,
} as const;
