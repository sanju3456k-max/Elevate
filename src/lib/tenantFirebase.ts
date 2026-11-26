import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  arrayUnion,
  type Firestore,
} from 'firebase/firestore';
import { db as defaultDb, auth as defaultAuth, sanitizeForFirestore } from './firebase';
import {
  getCachedMasterWorkspaces,
  fetchMasterWorkspacesFromCloud,
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

/**
 * Registers a student email in the central directory (`email_directory/{sha256}`)
 * so the single Elevate Labs web portal can match them to their institute APK(s).
 */
export async function registerStudentEmailInDirectory(
  email: string,
  workspaceId: string
): Promise<void> {
  const clean = normalizeEmail(email);
  if (!clean || !workspaceId) return;
  const emailHash = await sha256EmailHash(clean);
  await setDoc(
    doc(defaultDb, 'email_directory', emailHash),
    sanitizeForFirestore({
      instituteIds: arrayUnion(workspaceId),
      updatedAt: new Date().toISOString(),
    }),
    { merge: true }
  );
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

  // 3. Check central Firestore `email_directory/{sha256}` for enrolled students
  try {
    const emailHash = await sha256EmailHash(clean);
    const snap = await getDoc(doc(defaultDb, 'email_directory', emailHash));
    if (snap.exists()) {
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
  } catch {
    // Ignore directory read error
  }

  return Array.from(matches.values());
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
