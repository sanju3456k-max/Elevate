import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db as activeDb, sanitizeForFirestore } from './firebase';
import { getInstituteFirebaseServices } from './tenantFirebase';
import type { StaticInstituteEntry, StorePageConfig } from '../config/institutesRegistry';

export interface StorefrontOverrideData {
  id: string;
  appName?: string;
  apkVersion?: string;
  storePage: StorePageConfig;
  updatedAt: string;
  updatedBy?: string;
}

const LOCAL_STOREFRONT_CACHE_PREFIX = 'elevate_storefront_override_v1_';

function readLocalStorefrontCache(instituteId: string): StorefrontOverrideData | null {
  if (typeof window === 'undefined' || !instituteId) return null;
  try {
    const raw = localStorage.getItem(`${LOCAL_STOREFRONT_CACHE_PREFIX}${instituteId}`);
    if (!raw) return null;
    return JSON.parse(raw) as StorefrontOverrideData;
  } catch {
    return null;
  }
}

function writeLocalStorefrontCache(instituteId: string, data: StorefrontOverrideData): void {
  if (typeof window === 'undefined' || !instituteId) return;
  try {
    localStorage.setItem(`${LOCAL_STOREFRONT_CACHE_PREFIX}${instituteId}`, JSON.stringify(data));
  } catch {
    // Ignore storage quota errors
  }
}

/**
 * Fetches live `app_storefront/{instituteId}` override from that institute's
 * isolated Firestore project (or active Firebase), falling back to local cache.
 */
export async function fetchStorefrontOverride(
  inst: StaticInstituteEntry
): Promise<StorefrontOverrideData | null> {
  const cached = readLocalStorefrontCache(inst.id);
  try {
    const services = inst.firebaseWebConfig?.projectId
      ? getInstituteFirebaseServices(inst)
      : null;
    const targetDb = services?.db || activeDb;
    const snap = await getDoc(doc(targetDb, 'app_storefront', inst.id));
    if (snap.exists()) {
      const data = snap.data() as StorefrontOverrideData;
      writeLocalStorefrontCache(inst.id, data);
      return data;
    }
  } catch {
    // Graceful fallback to local cache / static registry defaults
  }
  return cached;
}

/**
 * Saves live `app_storefront/{instituteId}` configuration from Master Console
 * to the active institute's Firestore database and local cache.
 */
export async function saveStorefrontOverride(
  instituteId: string,
  payload: Omit<StorefrontOverrideData, 'id' | 'updatedAt'>
): Promise<StorefrontOverrideData> {
  const fullData: StorefrontOverrideData = {
    id: instituteId,
    appName: (payload.appName || '').trim(),
    apkVersion: (payload.apkVersion || '').trim(),
    storePage: payload.storePage || {},
    updatedAt: new Date().toISOString(),
    updatedBy: payload.updatedBy || '',
  };

  writeLocalStorefrontCache(instituteId, fullData);
  await setDoc(
    doc(activeDb, 'app_storefront', instituteId),
    sanitizeForFirestore(fullData),
    { merge: true }
  );
  return fullData;
}

/**
 * Merges static registry defaults with any live Firestore storefront override.
 */
export function mergeInstituteWithStorefrontOverride(
  inst: StaticInstituteEntry,
  override: StorefrontOverrideData | null
): StaticInstituteEntry {
  if (!override) return inst;
  return {
    ...inst,
    name: override.appName?.trim() ? override.appName.trim() : inst.name,
    apkVersion: override.apkVersion?.trim() ? override.apkVersion.trim() : inst.apkVersion,
    storePage: {
      ...(inst.storePage || {}),
      ...(override.storePage || {}),
    },
  };
}
