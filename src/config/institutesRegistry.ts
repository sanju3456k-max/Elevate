import type { MasterWorkspace } from '../lib/masterWorkspace';
import { GENERATED_INSTITUTES_REGISTRY } from './institutesRegistry.generated';

export interface StaticInstituteEntry extends MasterWorkspace {
  /**
   * GitHub Release download URL for this institute's isolated Android APK.
   */
  apkDownloadUrl: string;
  /**
   * Optional list of enrolled student emails for local/registry lookup
   * (in addition to Firestore `email_directory/{sha256}`).
   */
  studentEmails?: string[];
}

/**
 * Static registry of all institutes configured in this codebase.
 * New institutes are added here alongside `elevate-android/tenants/<slug>/`
 * instead of being created from Sanju's Master Console UI.
 */
export const STATIC_INSTITUTES_REGISTRY: StaticInstituteEntry[] = [
  {
    id: 'ws_primary',
    name: 'Elevate Primary Institute (Sanju)',
    slug: 'elevate-primary',
    ownerEmail: 'sanju3456k@gmail.com',
    teamAdminEmails: [],
    packageName: 'com.elevate.app',
    apkVersion: '2.0',
    apkDownloadUrl:
      'https://github.com/sanju3456k/elevate-android/releases/latest/download/elevatePrimary-release.apk',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  ...GENERATED_INSTITUTES_REGISTRY,
];
