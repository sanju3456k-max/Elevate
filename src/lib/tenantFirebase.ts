import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';
import {
  getFirestore,
  doc,
  getDoc,
  getDocs,
  collection,
  query,
  where,
  limit,
  setDoc,
  arrayUnion,
  type Firestore,
} from 'firebase/firestore';
import { db as defaultDb, auth as defaultAuth, sanitizeForFirestore } from './firebase';
import defaultFirebaseConfig from '../../firebase-applet-config.json';
import {
  getCachedMasterWorkspaces,
  fetchMasterWorkspacesFromCloud,
  getActiveAppInstituteIdOrPrimary,
  normalizeEmail,
  type MasterWorkspace,
} from './masterWorkspace';
import { STATIC_INSTITUTES_REGISTRY } from '../config/institutesRegistry';

const ACTIVE_INSTITUTE_STORAGE_KEY = 'elevate_active_institute_id_v1';

export interface InstituteLookupMatch {
  workspace: MasterWorkspace;
  role: 'admin' | 'student';
}

export async function sha256EmailHash(email: string): Promise<string> {
  const clean = normalizeEmail(email);
  const bytes = new TextEncoder().encode(clean);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function getCentralDirectoryDb(): Firestore {
  try {
    const centralProjectId = (defaultFirebaseConfig as any)?.projectId;
    if (!centralProjectId || (defaultDb.app?.options as any)?.projectId === centralProjectId) {
      return defaultDb;
    }
    const appName = 'elevate_central_directory';
    const existing = getApps().find((a) => a.name === appName);
    const app = existing ?? initializeApp(defaultFirebaseConfig, appName);
    const rawDbId = (defaultFirebaseConfig as any)?.firestoreDatabaseId || (defaultFirebaseConfig as any)?.databaseId;
    return rawDbId && rawDbId !== '(default)' ? getFirestore(app, rawDbId) : getFirestore(app);
  } catch {
    return defaultDb;
  }
}

/**
 * Registers a student/user email in the central directory (`email_directory/{sha256}`)
 * so the single Elevate Labs web portal can match them to all their institute(s),
 * even when they signed in or were enrolled inside an isolated tenant APK/project.
 */
export async function registerStudentEmailInDirectory(
  email: string,
  workspaceId: string
): Promise<void> {
  const clean = normalizeEmail(email);
  if (!clean || !clean.includes('@') || !workspaceId) return;
  const emailHash = await sha256EmailHash(clean);
  const payload = sanitizeForFirestore({
    instituteIds: arrayUnion(workspaceId),
    updatedAt: new Date().toISOString(),
  });
  // Always write to the authenticated defaultDb first so isolated tenants succeed with isSignedIn()
  await setDoc(doc(defaultDb, 'email_directory', emailHash), payload, { merge: true }).catch(() => {});
  const centralDb = getCentralDirectoryDb();
  if (centralDb !== defaultDb) {
    await setDoc(doc(centralDb, 'email_directory', emailHash), payload, { merge: true }).catch(() => {});
  }
}

const EMAIL_DIR_BACKFILL_PREFIX = 'elevate_email_dir_backfill_v1_';
const EMAIL_DIR_BACKFILL_TTL_MS = 6 * 60 * 60 * 1000;

/**
 * Backfills existing active `batch_enrollments` and `users` emails in the currently
 * authenticated institute's Firestore into `email_directory/{sha256}` so pre-existing
 * students are immediately discoverable from the unified web portal.
 */
export async function backfillEmailDirectoryForCurrentInstitute(
  workspaceId?: string,
  force = false
): Promise<number> {
  const targetWorkspaceId = workspaceId || getActiveAppInstituteIdOrPrimary();
  if (!targetWorkspaceId) return 0;

  const storageKey = `${EMAIL_DIR_BACKFILL_PREFIX}${targetWorkspaceId}`;
  if (!force && typeof localStorage !== 'undefined') {
    try {
      const lastRun = Number(localStorage.getItem(storageKey) || '0');
      if (lastRun > 0 && Date.now() - lastRun < EMAIL_DIR_BACKFILL_TTL_MS) {
        return 0;
      }
    } catch {
      // Ignore storage read errors
    }
  }

  const emails = new Set<string>();
  const [enrollSnap, usersSnap] = await Promise.all([
    getDocs(
      query(collection(defaultDb, 'batch_enrollments'), where('status', '==', 'active'), limit(2000))
    ).catch(() => null),
    getDocs(query(collection(defaultDb, 'users'), limit(2000))).catch(() => null),
  ]);

  if (enrollSnap) {
    enrollSnap.forEach((d) => {
      const data = d.data();
      const candidate = normalizeEmail(data?.studentEmail || '');
      if (candidate && candidate.includes('@')) {
        emails.add(candidate);
      }
    });
  }

  if (usersSnap) {
    usersSnap.forEach((d) => {
      const data = d.data();
      const candidate = normalizeEmail(data?.email || '');
      if (candidate && candidate.includes('@')) {
        emails.add(candidate);
      }
    });
  }

  const list = Array.from(emails);
  const CHUNK_SIZE = 20;
  for (let i = 0; i < list.length; i += CHUNK_SIZE) {
    const chunk = list.slice(i, i + CHUNK_SIZE);
    await Promise.all(
      chunk.map((em) => registerStudentEmailInDirectory(em, targetWorkspaceId).catch(() => {}))
    );
  }

  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(storageKey, String(Date.now()));
    } catch {
      // Ignore storage write errors
    }
  }

  return list.length;
}

function mergeWithStaticRegistry(cloudList: MasterWorkspace[]): MasterWorkspace[] {
  const byId = new Map<string, MasterWorkspace>();
  for (const ws of cloudList) {
    byId.set(ws.id, ws);
  }
  for (const reg of STATIC_INSTITUTES_REGISTRY) {
    const existing = byId.get(reg.id);
    if (existing) {
      byId.set(reg.id, {
        ...reg,
        ...existing,
        slug: existing.slug || reg.slug,
        logoUrl: existing.logoUrl || reg.logoUrl,
        apkDownloadUrl: existing.apkDownloadUrl || reg.apkDownloadUrl,
        firebaseWebConfig: existing.firebaseWebConfig || reg.firebaseWebConfig,
        packageName: existing.packageName || reg.packageName,
      });
    } else {
      byId.set(reg.id, reg);
    }
  }
  return Array.from(byId.values());
}

/**
 * Looks up all institutes for an email and classifies whether the user is an Admin
 * (who logs into their isolated web app) or a Student (who downloads the institute APK).
 */
export async function lookupInstitutesByEmail(email: string): Promise<InstituteLookupMatch[]> {
  const clean = normalizeEmail(email);
  if (!clean) return [];

  let cloudWorkspaces = getCachedMasterWorkspaces();
  try {
    cloudWorkspaces = await fetchMasterWorkspacesFromCloud();
  } catch {
    // Fallback to cached + static registry if offline
  }

  const allWorkspaces = mergeWithStaticRegistry(cloudWorkspaces);
  const matches = new Map<string, InstituteLookupMatch>();

  // 1. Check Admin / Owner membership for each institute
  for (const ws of allWorkspaces) {
    const isAdmin =
      normalizeEmail(ws.ownerEmail) === clean ||
      ws.teamAdminEmails.some((e) => normalizeEmail(e) === clean);
    if (isAdmin) {
      matches.set(ws.id, { workspace: ws, role: 'admin' });
    }
  }

  // 2. Check static registry studentEmails (if any)
  for (const reg of STATIC_INSTITUTES_REGISTRY) {
    if (reg.studentEmails?.some((e) => normalizeEmail(e) === clean) && !matches.has(reg.id)) {
      const ws = allWorkspaces.find((w) => w.id === reg.id) || reg;
      matches.set(reg.id, { workspace: ws, role: 'student' });
    }
  }

  // 3. Check `email_directory/{sha256}` in parallel across central DB, active DB, and all isolated institute DBs
  try {
    const emailHash = await sha256EmailHash(clean);
    const dbMap = new Map<string, Firestore>();
    const addDb = (candidate: Firestore | null | undefined) => {
      if (!candidate) return;
      const proj = String((candidate.app?.options as any)?.projectId || 'default');
      const dbId = String((candidate as any)?._databaseId?.database || '(default)');
      const key = `${proj}:${dbId}`;
      if (!dbMap.has(key)) dbMap.set(key, candidate);
    };

    addDb(getCentralDirectoryDb());
    addDb(defaultDb);
    for (const ws of allWorkspaces) {
      if (ws.firebaseWebConfig?.projectId && ws.firebaseWebConfig?.apiKey) {
        try {
          addDb(getInstituteFirebaseServices(ws).db);
        } catch {
          // Ignore invalid tenant config
        }
      }
    }

    const snaps = await Promise.all(
      Array.from(dbMap.values()).map((targetDb) =>
        getDoc(doc(targetDb, 'email_directory', emailHash)).catch(() => null)
      )
    );

    for (const snap of snaps) {
      if (snap && snap.exists()) {
        const ids = snap.data()?.instituteIds;
        if (Array.isArray(ids)) {
          ids.forEach((id) => {
            if (typeof id === 'string' && id.trim() && !matches.has(id.trim())) {
              const ws = allWorkspaces.find((w) => w.id === id.trim());
              if (ws) {
                matches.set(ws.id, { workspace: ws, role: 'student' });
              }
            }
          });
        }
      }
    }
  } catch {
    // Ignore directory read error
  }

  return Array.from(matches.values()).sort((a, b) => {
    if (a.role !== b.role) return a.role === 'admin' ? -1 : 1;
    if (a.workspace.id === 'ws_primary') return -1;
    if (b.workspace.id === 'ws_primary') return 1;
    return 0;
  });
}

/**
 * Dynamically initializes (or reuses) a FirebaseApp instance for a specific institute's
 * isolated Firebase project, falling back to the primary platform Firebase for ws_primary.
 */
export function getInstituteFirebaseServices(workspace: MasterWorkspace): {
  app: FirebaseApp | null;
  db: Firestore;
  auth: Auth;
  isIsolatedProject: boolean;
} {
  if (!workspace.firebaseWebConfig?.projectId || !workspace.firebaseWebConfig?.apiKey) {
    return {
      app: null,
      db: defaultDb,
      auth: defaultAuth,
      isIsolatedProject: false,
    };
  }

  const appName = `inst_${workspace.id}`;
  const existing = getApps().find((a) => a.name === appName);
  const app = existing ?? initializeApp(workspace.firebaseWebConfig, appName);
  const rawDbId = workspace.firebaseWebConfig.firestoreDatabaseId;
  const db = rawDbId && rawDbId !== '(default)' ? getFirestore(app, rawDbId) : getFirestore(app);
  return {
    app,
    db,
    auth: getAuth(app),
    isIsolatedProject: true,
  };
}

export function setSelectedInstituteId(workspaceId: string): void {
  try {
    localStorage.setItem(ACTIVE_INSTITUTE_STORAGE_KEY, workspaceId);
  } catch {
    // Ignore storage quota errors
  }
}

export function getSelectedInstituteId(): string | null {
  try {
    return localStorage.getItem(ACTIVE_INSTITUTE_STORAGE_KEY);
  } catch {
    return null;
  }
}
