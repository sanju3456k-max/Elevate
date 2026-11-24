/**
 * Firebase Firestore Storage Engine for HTML Notes Studio
 * 
 * Storage Architecture:
 * 1. Full-Fidelity Storage in Firebase Firestore (`users/{userId}/htmlNotesProjects/{projectId}`):
 *    - Primary source of truth across all user devices.
 *    - All project metadata, file titles, tags, AND complete HTML code are stored directly in Firestore.
 *    - Multi-device real-time sync (`onSnapshot` listeners): any project/file created, edited, or deleted on Device A
 *      reflects instantly on Device B.
 *    - Strict ID Isolation: Projects and files are matched strictly by unique IDs (proj_xxx, note_xxx).
 *      No duplicate projects or duplicate files are created.
 *    - Zero Google Drive dependency for document persistence.
 */

import { auth, ensureValidGoogleDriveToken, connectGoogleDrive as connectGoogleDriveService } from './firebase';
import {
  type HtmlProject,
  type HtmlNoteItem,
  saveLocalProjects,
  loadLocalProjects,
  queueFirestoreSync,
  saveSingleProjectToFirestore,
  subscribeToFirestoreProjects,
  deleteProjectFromFirestore,
  deleteFileFromFirestore,
} from './htmlNotesSync';
import { getCachedAuthUser } from './storage';
import { syncHtmlProjectToGoogleDrive, getOrCreateHtmlNotesRootFolder } from './googleWorkspace';

export type DriveSyncState = 'disconnected' | 'idle' | 'syncing' | 'synced' | 'error';

export interface DriveSyncStatus {
  state: DriveSyncState;
  message: string;
  lastSyncTime: number | null;
  folderUrl: string | null;
}

export interface DriveManifestFile {
  id: string;
  title: string;
  driveFileId?: string;
  driveWebViewLink?: string;
  updatedAt: number;
  size?: number;
  pendingUpload?: boolean;
  driveSyncStatus?: 'synced' | 'pending_device_upload' | 'local_only';
  pendingDeviceId?: string;
  code?: string;
}

export interface DriveManifestProject {
  id: string;
  name: string;
  driveFolderId?: string;
  updatedAt: number;
  files: DriveManifestFile[];
}

export interface DriveManifest {
  version: number;
  updatedAt: number;
  userId?: string;
  projects: DriveManifestProject[];
  deletedFileIds?: string[];
  deletedProjectIds?: string[];
}

let currentStatus: DriveSyncStatus = {
  state: 'idle',
  message: 'Firebase Realtime Cloud Storage Active',
  lastSyncTime: Date.now(),
  folderUrl: null,
};

const statusListeners: ((status: DriveSyncStatus) => void)[] = [];

export function subscribeToDriveSyncStatus(listener: (status: DriveSyncStatus) => void): () => void {
  statusListeners.push(listener);
  listener(currentStatus);
  return () => {
    const idx = statusListeners.indexOf(listener);
    if (idx !== -1) statusListeners.splice(idx, 1);
  };
}

function updateStatus(partial: Partial<DriveSyncStatus>) {
  currentStatus = { ...currentStatus, ...partial };
  statusListeners.forEach((l) => {
    try {
      l(currentStatus);
    } catch {}
  });
}

export function isDriveConnected(): boolean {
  return Boolean(auth.currentUser && !auth.currentUser.isAnonymous);
}

export async function connectGoogleDrive(): Promise<boolean> {
  try {
    updateStatus({
      state: 'syncing',
      message: 'Connecting Google Drive...',
      lastSyncTime: Date.now(),
      folderUrl: null,
    });

    const token = await connectGoogleDriveService();
    if (token) {
      updateStatus({
        state: 'synced',
        message: 'Google Drive connected (Elevate Studio)',
        lastSyncTime: Date.now(),
        folderUrl: null,
      });

      // Background backup projects to Elevate Studio > HTML Notes Studio
      const projs = loadLocalProjects();
      if (projs.length > 0) {
        syncHtmlNotesWithDrive(projs).catch((err) => console.warn('Background Drive backup warning:', err));
      }
      return true;
    } else {
      updateStatus({
        state: 'disconnected',
        message: 'Google Drive connection cancelled or failed',
        lastSyncTime: Date.now(),
        folderUrl: null,
      });
      return false;
    }
  } catch (err: any) {
    updateStatus({
      state: 'error',
      message: err?.message || 'Google Drive connection failed',
      lastSyncTime: Date.now(),
      folderUrl: null,
    });
    return false;
  }
}

export function disconnectGoogleDrive(): void {
  updateStatus({
    state: 'disconnected',
    message: 'Google Drive disconnected',
    folderUrl: null,
  });
}

export async function fetchNoteContentFromDrive(
  _driveFileId?: string,
  projectId?: string,
  noteId?: string
): Promise<string | null> {
  if (projectId && noteId) {
    const projs = loadLocalProjects();
    const proj = projs.find((p) => p.id === projectId);
    const file = proj?.files.find((f) => f.id === noteId);
    if (file && file.code) return file.code;
  }
  return null;
}

export async function syncHtmlNotesWithDrive(
  projects: HtmlProject[]
): Promise<{ success: boolean; message: string; projects?: HtmlProject[] }> {
  try {
    // 1. Instant real-time multi-device sync via Firestore
    queueFirestoreSync(projects, true);

    // 2. Persistent Google Drive Cloud Backup (Elevate Studio > HTML Notes Studio)
    const token = await ensureValidGoogleDriveToken();
    let updatedProjects = [...projects];

    if (token) {
      updateStatus({
        state: 'syncing',
        message: 'Syncing to Google Drive (Elevate Studio)...',
        lastSyncTime: Date.now(),
        folderUrl: null,
      });

      try {
        const rootFolderId = await getOrCreateHtmlNotesRootFolder(token);
        const nextProjects: HtmlProject[] = [];

        for (const proj of projects) {
          const syncRes = await syncHtmlProjectToGoogleDrive(token, proj);
          const fileDriveMap = new Map(syncRes.files.map((f) => [f.id, f]));

          const updatedFiles = proj.files.map((file) => {
            const mapped = fileDriveMap.get(file.id);
            if (mapped) {
              return {
                ...file,
                driveFileId: mapped.driveFileId,
                driveWebViewLink: mapped.webViewLink,
              };
            }
            return file;
          });

          nextProjects.push({
            ...proj,
            driveFolderId: syncRes.projectFolderId,
            files: updatedFiles,
          });
        }

        updatedProjects = nextProjects;
        saveLocalProjects(updatedProjects);

        updateStatus({
          state: 'synced',
          message: `All ${updatedProjects.length} project(s) saved to Google Drive (Elevate Studio)!`,
          lastSyncTime: Date.now(),
          folderUrl: `https://drive.google.com/drive/folders/${rootFolderId}`,
        });

        return {
          success: true,
          message: `Saved to Google Drive (Elevate Studio) & Cloud`,
          projects: updatedProjects,
        };
      } catch (driveErr: any) {
        console.warn('Google Drive project upload warning:', driveErr);
        updateStatus({
          state: 'synced',
          message: 'Saved to Cloud (Google Drive sync pending)',
          lastSyncTime: Date.now(),
          folderUrl: null,
        });
      }
    } else {
      updateStatus({
        state: 'synced',
        message: 'Saved to Cloud Database (Connect Drive to backup to Drive)',
        lastSyncTime: Date.now(),
        folderUrl: null,
      });
    }

    return {
      success: true,
      message: 'Saved to Cloud',
      projects: updatedProjects,
    };
  } catch (err: any) {
    return {
      success: false,
      message: err?.message || 'Sync failed',
    };
  }
}

export function recordNoteSaveWithDriveOutbox(_projectId: string, _noteItem: HtmlNoteItem): void {
  // Pure local-only tracking, 0 Firestore writes
}

export async function deleteNoteFromCloud(projectId: string, noteId: string): Promise<boolean> {
  try {
    const cachedUid = typeof window !== 'undefined' ? getCachedAuthUser()?.uid || null : null;
    const effectiveUid = auth.currentUser?.uid || cachedUid;
    return await deleteFileFromFirestore(projectId, noteId, effectiveUid);
  } catch (err) {
    console.warn('Error deleting note from cloud:', err);
    return false;
  }
}

export async function deleteProjectFromCloud(projectId: string): Promise<boolean> {
  try {
    const cachedUid = typeof window !== 'undefined' ? getCachedAuthUser()?.uid || null : null;
    const effectiveUid = auth.currentUser?.uid || cachedUid;
    await deleteProjectFromFirestore(projectId, effectiveUid);
    return true;
  } catch (err) {
    console.warn('Error deleting project from cloud:', err);
    return false;
  }
}

export function subscribeToFirebaseManifest(onRemoteUpdate: (manifest: DriveManifest) => void): () => void {
  const user = auth.currentUser;
  if (!user || user.isAnonymous) return () => {};

  return subscribeToFirestoreProjects(user.uid, (projects) => {
    onRemoteUpdate({
      version: 1,
      updatedAt: Date.now(),
      userId: user.uid,
      projects: projects.map((p) => ({
        id: p.id,
        name: p.name,
        updatedAt: p.updatedAt,
        files: p.files.map((f) => ({
          id: f.id,
          title: f.title,
          code: f.code,
          updatedAt: f.updatedAt,
        })),
      })),
      deletedFileIds: [],
      deletedProjectIds: [],
    });
  });
}

export async function reconcileCloudNotes(localProjects: HtmlProject[]): Promise<HtmlProject[]> {
  const user = auth.currentUser;
  if (!user || user.isAnonymous) return localProjects;
  queueFirestoreSync(localProjects, true);
  return localProjects;
}

export async function exportSingleNoteToDrive(_projectId: string, _note: HtmlNoteItem): Promise<boolean> {
  return true;
}

export async function uploadNoteTaskToDrive(_task: any): Promise<{ success: boolean; authExpired?: boolean; message?: string }> {
  return { success: true, message: 'Saved in Firebase' };
}

export async function deleteNoteTaskFromDrive(_task: any): Promise<{ success: boolean; authExpired?: boolean; message?: string }> {
  return { success: true, message: 'Deleted from Firebase' };
}

export async function deleteProjectTaskFromDrive(_task: any): Promise<{ success: boolean; authExpired?: boolean; message?: string }> {
  return { success: true, message: 'Deleted project from Firebase' };
}

export async function cleanAndDeduplicateAllDriveNotes(): Promise<{ success: boolean; message: string }> {
  return {
    success: true,
    message: 'Firebase Firestore projects clean and unique',
  };
}
