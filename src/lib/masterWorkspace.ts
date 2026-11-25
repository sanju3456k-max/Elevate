import { db, sanitizeForFirestore } from './firebase';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  deleteDoc,
  onSnapshot,
  type Unsubscribe,
} from 'firebase/firestore';

export interface MasterWorkspace {
  id: string;
  name: string;
  ownerEmail: string;
  teamAdminEmails: string[];
  createdAt: string;
  updatedAt: string;
}

export const PRIMARY_WORKSPACE_ID = 'ws_primary';
export const MASTER_WORKSPACES_CACHE_KEY = 'elevate_master_workspaces_v1';
export const ACTIVE_WORKSPACE_PREF_KEY = 'elevate_active_master_workspace_id';

export const ROOT_SUPER_ADMIN_EMAILS = [
  'sanju3456k@gmail.com',
];

const DEFAULT_PRIMARY_WORKSPACE: MasterWorkspace = {
  id: PRIMARY_WORKSPACE_ID,
  name: 'Elevate Primary Institute (Sanju)',
  ownerEmail: 'sanju3456k@gmail.com',
  teamAdminEmails: [],
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

export function normalizeEmail(email?: string | null): string {
  return (email || '').trim().toLowerCase();
}

export function isRootSuperAdmin(email?: string | null): boolean {
  const norm = normalizeEmail(email);
  if (!norm) return false;
  return ROOT_SUPER_ADMIN_EMAILS.some((e) => e.toLowerCase() === norm);
}

function normalizeWorkspace(raw: any): MasterWorkspace {
  const ownerEmail = normalizeEmail(raw?.ownerEmail);
  const rawTeam = Array.isArray(raw?.teamAdminEmails) ? raw.teamAdminEmails : [];
  const teamSet = new Set<string>();
  rawTeam.forEach((em: any) => {
    const clean = normalizeEmail(typeof em === 'string' ? em : '');
    if (clean && clean !== ownerEmail) {
      teamSet.add(clean);
    }
  });
  return {
    id: String(raw?.id || PRIMARY_WORKSPACE_ID),
    name: String(raw?.name || 'Master Institute'),
    ownerEmail: ownerEmail || DEFAULT_PRIMARY_WORKSPACE.ownerEmail,
    teamAdminEmails: Array.from(teamSet),
    createdAt: raw?.createdAt || new Date().toISOString(),
    updatedAt: raw?.updatedAt || new Date().toISOString(),
  };
}

export function getCachedMasterWorkspaces(): MasterWorkspace[] {
  try {
    const raw = localStorage.getItem(MASTER_WORKSPACES_CACHE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        const list = parsed.map(normalizeWorkspace);
        if (!list.some((w) => w.id === PRIMARY_WORKSPACE_ID)) {
          list.unshift(DEFAULT_PRIMARY_WORKSPACE);
        }
        return list;
      }
    }
  } catch {}
  return [DEFAULT_PRIMARY_WORKSPACE];
}

export function saveCachedMasterWorkspaces(workspaces: MasterWorkspace[]): void {
  try {
    const normalized = workspaces.map(normalizeWorkspace);
    localStorage.setItem(MASTER_WORKSPACES_CACHE_KEY, JSON.stringify(normalized));
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('master-workspaces-updated', { detail: { workspaces: normalized } }));
    }
  } catch {}
}

export function isMasterWorkspaceMember(email?: string | null): boolean {
  const norm = normalizeEmail(email);
  if (!norm) return false;
  if (isRootSuperAdmin(norm)) return true;
  const workspaces = getCachedMasterWorkspaces();
  return workspaces.some(
    (ws) => ws.ownerEmail === norm || ws.teamAdminEmails.includes(norm)
  );
}

export function getWorkspacesForUser(email?: string | null): MasterWorkspace[] {
  const norm = normalizeEmail(email);
  const all = getCachedMasterWorkspaces();
  if (!norm) return [];
  if (isRootSuperAdmin(norm)) {
    return all;
  }
  return all.filter((ws) => ws.ownerEmail === norm || ws.teamAdminEmails.includes(norm));
}

export function getActiveWorkspaceForUser(
  email?: string | null,
  preferredWorkspaceId?: string | null
): MasterWorkspace | null {
  const accessible = getWorkspacesForUser(email);
  if (accessible.length === 0) return null;

  if (preferredWorkspaceId) {
    const match = accessible.find((w) => w.id === preferredWorkspaceId);
    if (match) return match;
  }

  try {
    const savedPref = localStorage.getItem(ACTIVE_WORKSPACE_PREF_KEY);
    if (savedPref) {
      const match = accessible.find((w) => w.id === savedPref);
      if (match) return match;
    }
  } catch {}

  const norm = normalizeEmail(email);
  const owned = accessible.find((w) => w.ownerEmail === norm);
  return owned || accessible[0];
}

export function setPreferredWorkspaceId(workspaceId: string): void {
  try {
    localStorage.setItem(ACTIVE_WORKSPACE_PREF_KEY, workspaceId);
  } catch {}
}

export function canManageWorkspaceTeam(
  workspace: MasterWorkspace | null | undefined,
  actorEmail?: string | null
): boolean {
  if (!workspace || !actorEmail) return false;
  const norm = normalizeEmail(actorEmail);
  return workspace.ownerEmail === norm || isRootSuperAdmin(norm);
}

export async function fetchMasterWorkspacesFromCloud(): Promise<MasterWorkspace[]> {
  try {
    const snap = await getDocs(collection(db, 'master_workspaces'));
    const cloudList: MasterWorkspace[] = [];
    snap.forEach((docSnap) => {
      if (docSnap.exists()) {
        cloudList.push(normalizeWorkspace({ ...docSnap.data(), id: docSnap.id }));
      }
    });

    if (!cloudList.some((w) => w.id === PRIMARY_WORKSPACE_ID)) {
      cloudList.unshift(DEFAULT_PRIMARY_WORKSPACE);
      setDoc(
        doc(db, 'master_workspaces', PRIMARY_WORKSPACE_ID),
        sanitizeForFirestore(DEFAULT_PRIMARY_WORKSPACE),
        { merge: true }
      ).catch(() => {});
    }

    saveCachedMasterWorkspaces(cloudList);
    return cloudList;
  } catch (err) {
    console.warn('Could not fetch master workspaces from cloud:', err);
    return getCachedMasterWorkspaces();
  }
}

export function subscribeToMasterWorkspaces(
  onUpdate: (workspaces: MasterWorkspace[]) => void
): Unsubscribe {
  try {
    return onSnapshot(
      collection(db, 'master_workspaces'),
      (snap) => {
        const list: MasterWorkspace[] = [];
        snap.forEach((d) => {
          if (d.exists()) {
            list.push(normalizeWorkspace({ ...d.data(), id: d.id }));
          }
        });
        if (!list.some((w) => w.id === PRIMARY_WORKSPACE_ID)) {
          list.unshift(DEFAULT_PRIMARY_WORKSPACE);
        }
        saveCachedMasterWorkspaces(list);
        onUpdate(list);
      },
      (err) => {
        console.warn('Master workspaces snapshot error:', err);
      }
    );
  } catch {
    return () => {};
  }
}

async function persistWorkspace(ws: MasterWorkspace): Promise<MasterWorkspace> {
  const clean = normalizeWorkspace({ ...ws, updatedAt: new Date().toISOString() });
  const current = getCachedMasterWorkspaces();
  const next = current.some((w) => w.id === clean.id)
    ? current.map((w) => (w.id === clean.id ? clean : w))
    : [...current, clean];
  saveCachedMasterWorkspaces(next);
  await setDoc(doc(db, 'master_workspaces', clean.id), sanitizeForFirestore(clean), { merge: true });
  return clean;
}

export async function addTeamAdminToWorkspace(params: {
  workspaceId: string;
  emailToAdd: string;
  actorEmail: string;
}): Promise<{ success: boolean; error?: string; workspace?: MasterWorkspace }> {
  const targetEmail = normalizeEmail(params.emailToAdd);
  if (!targetEmail || !targetEmail.includes('@')) {
    return { success: false, error: 'Please enter a valid email address.' };
  }

  const all = getCachedMasterWorkspaces();
  const ws = all.find((w) => w.id === params.workspaceId);
  if (!ws) return { success: false, error: 'Workspace not found.' };
  if (!canManageWorkspaceTeam(ws, params.actorEmail)) {
    return { success: false, error: 'Only the Master Owner can add team members to this account.' };
  }
  if (ws.ownerEmail === targetEmail) {
    return { success: false, error: 'This email is already the Master Owner of this workspace.' };
  }
  if (ws.teamAdminEmails.includes(targetEmail)) {
    return { success: false, error: 'This team member already has Master Console access.' };
  }

  const updated = await persistWorkspace({
    ...ws,
    teamAdminEmails: [...ws.teamAdminEmails, targetEmail],
  });
  return { success: true, workspace: updated };
}

export async function removeTeamAdminFromWorkspace(params: {
  workspaceId: string;
  emailToRemove: string;
  actorEmail: string;
}): Promise<{ success: boolean; error?: string; workspace?: MasterWorkspace }> {
  const targetEmail = normalizeEmail(params.emailToRemove);
  const all = getCachedMasterWorkspaces();
  const ws = all.find((w) => w.id === params.workspaceId);
  if (!ws) return { success: false, error: 'Workspace not found.' };
  if (!canManageWorkspaceTeam(ws, params.actorEmail)) {
    return { success: false, error: 'Only the Master Owner can remove team members.' };
  }
  if (ws.ownerEmail === targetEmail) {
    return { success: false, error: 'The Master Owner cannot be removed.' };
  }

  const updated = await persistWorkspace({
    ...ws,
    teamAdminEmails: ws.teamAdminEmails.filter((e) => e !== targetEmail),
  });
  return { success: true, workspace: updated };
}

export async function createMasterWorkspace(params: {
  name: string;
  ownerEmail: string;
  actorEmail: string;
}): Promise<{ success: boolean; error?: string; workspace?: MasterWorkspace }> {
  if (!isRootSuperAdmin(params.actorEmail)) {
    return { success: false, error: 'Only Root Super-Admin can provision a new Institute Master account.' };
  }
  const cleanName = params.name.trim();
  const cleanOwner = normalizeEmail(params.ownerEmail);
  if (!cleanName) return { success: false, error: 'Institute / Workspace name is required.' };
  if (!cleanOwner || !cleanOwner.includes('@')) {
    return { success: false, error: 'Valid Owner email is required.' };
  }

  const newWs: MasterWorkspace = {
    id: `ws_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    name: cleanName,
    ownerEmail: cleanOwner,
    teamAdminEmails: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const saved = await persistWorkspace(newWs);
  return { success: true, workspace: saved };
}

export async function deleteMasterWorkspace(params: {
  workspaceId: string;
  actorEmail: string;
}): Promise<{ success: boolean; error?: string }> {
  if (!isRootSuperAdmin(params.actorEmail)) {
    return { success: false, error: 'Only Root Super-Admin can delete a Master Workspace.' };
  }
  if (params.workspaceId === PRIMARY_WORKSPACE_ID) {
    return { success: false, error: 'Primary workspace cannot be deleted.' };
  }
  const current = getCachedMasterWorkspaces().filter((w) => w.id !== params.workspaceId);
  saveCachedMasterWorkspaces(current);
  await deleteDoc(doc(db, 'master_workspaces', params.workspaceId)).catch(() => {});
  return { success: true };
}

/**
 * Sync a test created/edited by a Workspace Owner or Team Admin into the workspace's
 * shared cloud tests collection (`master_workspaces/{workspaceId}/tests/{testId}`)
 * so all Team Admins in that same institute workspace automatically see it.
 */
export async function syncWorkspaceTestToCloud(workspaceId: string, test: any): Promise<void> {
  if (!workspaceId || !test?.id) return;
  try {
    const cleanTest = sanitizeForFirestore({
      ...test,
      workspaceId,
      updatedAt: test.updatedAt || new Date().toISOString(),
    });
    await setDoc(doc(db, 'master_workspaces', workspaceId, 'tests', test.id), cleanTest, { merge: true });
    try {
      const localKey = `elevate_ws_tests_${workspaceId}`;
      const existing = JSON.parse(localStorage.getItem(localKey) || '[]');
      const next = Array.isArray(existing)
        ? existing.filter((t: any) => t.id !== test.id).concat(cleanTest)
        : [cleanTest];
      localStorage.setItem(localKey, JSON.stringify(next));
    } catch {}
  } catch (err) {
    console.warn('Could not sync workspace test to cloud:', err);
  }
}

/**
 * Fetch all tests shared within the user's accessible Master Workspaces.
 * Returns [] for regular students so workspace draft tests never leak to non-members.
 */
export async function fetchWorkspaceTestsForUser(email?: string | null): Promise<any[]> {
  const accessible = getWorkspacesForUser(email);
  if (accessible.length === 0) return [];
  const allTestsMap = new Map<string, any>();

  for (const ws of accessible) {
    try {
      const snap = await getDocs(collection(db, 'master_workspaces', ws.id, 'tests'));
      const wsList: any[] = [];
      snap.forEach((d) => {
        if (d.exists()) {
          const t = { ...d.data(), id: d.id, workspaceId: ws.id };
          wsList.push(t);
          allTestsMap.set(t.id, t);
        }
      });
      try {
        localStorage.setItem(`elevate_ws_tests_${ws.id}`, JSON.stringify(wsList));
      } catch {}
    } catch {
      try {
        const cached = JSON.parse(localStorage.getItem(`elevate_ws_tests_${ws.id}`) || '[]');
        if (Array.isArray(cached)) {
          cached.forEach((t: any) => t?.id && allTestsMap.set(t.id, t));
        }
      } catch {}
    }
  }

  return Array.from(allTestsMap.values());
}

export const APP_INSTITUTE_PREF_KEY = 'elevate_active_app_institute_id';
export const APP_INSTITUTE_GUEST_PREF_KEY = 'elevate_app_institute_guest_mode';
export const APP_INSTITUTE_CHANGED_EVENT = 'elevate-app-institute-changed';

export function getUrlInstituteParam(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const params = new URLSearchParams(window.location.search);
    const val = params.get('institute') || params.get('ws');
    return val ? val.trim() : null;
  } catch {
    return null;
  }
}

export function getSelectedAppInstituteId(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const fromUrl = getUrlInstituteParam();
    if (fromUrl) {
      localStorage.setItem(APP_INSTITUTE_PREF_KEY, fromUrl);
      return fromUrl;
    }
    const saved = localStorage.getItem(APP_INSTITUTE_PREF_KEY);
    return saved && saved.trim() ? saved.trim() : null;
  } catch {
    return null;
  }
}

export function setSelectedAppInstituteId(workspaceId: string | null): void {
  if (typeof window === 'undefined') return;
  try {
    if (workspaceId && workspaceId.trim()) {
      const clean = workspaceId.trim();
      localStorage.setItem(APP_INSTITUTE_PREF_KEY, clean);
      setPreferredWorkspaceId(clean);
    } else {
      localStorage.removeItem(APP_INSTITUTE_PREF_KEY);
      localStorage.removeItem(APP_INSTITUTE_GUEST_PREF_KEY);
    }
    window.dispatchEvent(new CustomEvent(APP_INSTITUTE_CHANGED_EVENT, { detail: { workspaceId: workspaceId || null } }));
  } catch {}
}

export function getAppInstituteGuestMode(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return localStorage.getItem(APP_INSTITUTE_GUEST_PREF_KEY) === 'true';
  } catch {
    return false;
  }
}

export function setAppInstituteGuestMode(enabled: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    if (enabled) {
      localStorage.setItem(APP_INSTITUTE_GUEST_PREF_KEY, 'true');
    } else {
      localStorage.removeItem(APP_INSTITUTE_GUEST_PREF_KEY);
    }
    window.dispatchEvent(new CustomEvent(APP_INSTITUTE_CHANGED_EVENT, { detail: { guestMode: enabled } }));
  } catch {}
}

export function getWorkspaceById(workspaceId?: string | null): MasterWorkspace | null {
  if (!workspaceId) return null;
  const all = getCachedMasterWorkspaces();
  return all.find((w) => w.id === workspaceId) || null;
}

export function canEmailUnlockInstituteWeb(email?: string | null, workspaceId?: string | null): boolean {
  const norm = normalizeEmail(email);
  if (!norm) return false;
  if (isRootSuperAdmin(norm)) return true;
  if (!workspaceId) return isMasterWorkspaceMember(norm);
  const ws = getWorkspaceById(workspaceId);
  if (!ws) return false;
  return ws.ownerEmail === norm || ws.teamAdminEmails.includes(norm);
}

export function getInstituteInviteLink(workspaceId: string): string {
  if (typeof window === 'undefined') return `/?institute=${encodeURIComponent(workspaceId)}`;
  return `${window.location.origin}/?institute=${encodeURIComponent(workspaceId)}`;
}

export function getActiveAppInstituteIdOrPrimary(): string {
  return getSelectedAppInstituteId() || PRIMARY_WORKSPACE_ID;
}

export function belongsToInstitute(
  record: { workspaceId?: string | null } | null | undefined,
  instituteId?: string | null
): boolean {
  const target = instituteId || PRIMARY_WORKSPACE_ID;
  const owner = record?.workspaceId || PRIMARY_WORKSPACE_ID;
  return owner === target;
}

/**
 * Migrates all legacy Sanju batches, published catalog tests, and announcements
 * (documents missing workspaceId) into Sanju's Primary Workspace (ws_primary).
 */
export async function migrateLegacyDataToPrimaryWorkspace(
  actorEmail?: string | null
): Promise<{ batchesMigrated: number; testsMigrated: number; announcementsMigrated: number }> {
  if (actorEmail && !isRootSuperAdmin(actorEmail)) {
    return { batchesMigrated: 0, testsMigrated: 0, announcementsMigrated: 0 };
  }

  let batchesMigrated = 0;
  let testsMigrated = 0;
  let announcementsMigrated = 0;
  const primaryOwner = DEFAULT_PRIMARY_WORKSPACE.ownerEmail;
  const nowIso = new Date().toISOString();

  // 1. Ensure ws_primary workspace doc exists
  await setDoc(
    doc(db, 'master_workspaces', PRIMARY_WORKSPACE_ID),
    sanitizeForFirestore({ ...DEFAULT_PRIMARY_WORKSPACE, updatedAt: nowIso }),
    { merge: true }
  );

  // 2. Migrate legacy batches missing workspaceId -> ws_primary
  const batchesSnap = await getDocs(collection(db, 'batches'));
  for (const bDoc of batchesSnap.docs) {
    const data = bDoc.data() || {};
    if (!data.workspaceId) {
      await setDoc(
        doc(db, 'batches', bDoc.id),
        sanitizeForFirestore({
          workspaceId: PRIMARY_WORKSPACE_ID,
          ownerEmail: data.ownerEmail || primaryOwner,
          updatedAt: nowIso,
        }),
        { merge: true }
      );
      batchesMigrated++;
    }
  }

  // 3. Migrate legacy published catalog tests (Part 1 & Part 2) -> ws_primary
  for (const partId of ['published_tests', 'published_tests_part_2']) {
    const catRef = doc(db, 'test_leaderboards', 'MASTER_CATALOG', 'summary', partId);
    const catSnap = await getDoc(catRef);
    if (!catSnap.exists()) continue;
    const catData = catSnap.data() || {};
    const testsMap = { ...(catData.tests || {}) };
    let changed = false;

    for (const [tid, tMeta] of Object.entries<any>(testsMap)) {
      if (tMeta && !tMeta.workspaceId) {
        const updatedMeta = { ...tMeta, workspaceId: PRIMARY_WORKSPACE_ID, ownerEmail: tMeta.ownerEmail || primaryOwner };
        testsMap[tid] = updatedMeta;
        changed = true;
        testsMigrated++;
        await setDoc(
          doc(db, 'master_workspaces', PRIMARY_WORKSPACE_ID, 'tests', tid),
          sanitizeForFirestore(updatedMeta),
          { merge: true }
        ).catch(() => {});
      }
    }

    if (changed) {
      await setDoc(catRef, sanitizeForFirestore({ tests: testsMap, updatedAt: nowIso }), { merge: true });
    }
  }

  // 4. Migrate legacy announcements missing workspaceId -> ws_primary
  const annRef = doc(db, 'master_catalog', 'lms_announcements');
  const annSnap = await getDoc(annRef);
  if (annSnap.exists()) {
    const rawList = Array.isArray(annSnap.data()?.list) ? annSnap.data()!.list : [];
    let changed = false;
    const nextList = rawList.map((ann: any) => {
      if (ann && !ann.workspaceId) {
        changed = true;
        announcementsMigrated++;
        return { ...ann, workspaceId: PRIMARY_WORKSPACE_ID };
      }
      return ann;
    });
    if (changed) {
      await setDoc(annRef, sanitizeForFirestore({ list: nextList, updatedAt: nowIso }), { merge: true });
    }
  }

  return { batchesMigrated, testsMigrated, announcementsMigrated };
}


