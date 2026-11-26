import type { MasterWorkspace } from '../lib/masterWorkspace';
import { GENERATED_INSTITUTES_REGISTRY } from './institutesRegistry.generated';

export interface StoreReviewItem {
  id: string;
  author: string;
  role?: string;
  rating: number;
  comment: string;
  date: string;
}

export interface StorePageConfig {
  tagline?: string;
  description?: string;
  highlights?: string[];
  screenshots?: string[];
  apkSizeLabel?: string;
  contactEmail?: string;
  contactPhone?: string;
  websiteUrl?: string;
  address?: string;
  rating?: number;
  reviewCount?: number;
  enableComments?: boolean;
  accentColor?: string;
  reviews?: StoreReviewItem[];
}

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
  /**
   * Customizable Play Store-style storefront metadata for `/apps/<slug>`.
   */
  storePage?: StorePageConfig;
}

/**
 * Static registry of all institutes configured in this codebase.
 * New institutes are added here alongside `institutes/<slug>/`
 * instead of being created from Sanju's Master Console UI.
 */
export const STATIC_INSTITUTES_REGISTRY: StaticInstituteEntry[] = [
  {
    id: 'ws_primary',
    name: 'Elevate',
    slug: 'elevate-primary',
    logoUrl: './icon-512.png',
    ownerEmail: 'sanju3456k@gmail.com',
    teamAdminEmails: [],
    packageName: 'com.elevate.app',
    apkVersion: '2.0',
    apkDownloadUrl: './elevate.apk',
    storePage: {
      tagline: 'Timed Mock Tests, OMR Evaluation & Smart Study Notes',
      description:
        'Elevate Labs Official App is an all-in-one exam preparation workspace with timed chapter-wise & full-length mock tests, printable OMR sheets with instant optical evaluation, video classes, and structured study notes.',
      highlights: [
        'Timed Mock Tests & Instant Analytics',
        'Printable A4 OMR Sheets & Optical Scanning',
        'KaTeX Math Formulas & Offline Study Notes',
        'Secure Single-Device & Cloud Sync Support',
      ],
      apkSizeLabel: '18 MB',
      contactEmail: 'sanju3456k@gmail.com',
      websiteUrl: 'https://labselevate.vercel.app',
      accentColor: '#0b57d0',
    },
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  ...GENERATED_INSTITUTES_REGISTRY,
];
