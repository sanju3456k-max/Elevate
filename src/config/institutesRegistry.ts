import type { MasterWorkspace } from '../lib/masterWorkspace';
import { GENERATED_INSTITUTES_REGISTRY, GENERATED_ELEVATE_APK_META } from './institutesRegistry.generated';

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
    apkVersion: GENERATED_ELEVATE_APK_META.apkVersion || '1.0',
    apkDownloadUrl: './elevate.apk',
    storePage: {
      tagline: '',
      description:
        'Elevate Labs Official App is an all-in-one exam preparation workspace with structured batch video classes, timed chapter-wise & full-length mock tests, printable A4 OMR sheets with instant optical evaluation scans, smart study notes, remedial teaching for weak topics, real-time ranking leaderboards, and performance analytics.',
      highlights: [
        'Batch Classes, Chapters & Video Lectures',
        'Timed Mock Tests & Adaptive Exam Runner',
        'Printable A4 OMR Sheets & Optical Evaluation Scans',
        'Smart Study Notes & KaTeX Math Formulas',
        'Remedial Teaching & Targeted Weakness Recovery',
        'Real-time Ranking, Accuracy & Mastery Graphs',
      ],
      screenshots: [
        './assets/store-elevate/01-home-dashboard.png',
        './assets/store-elevate/02-batch-classes.png',
        './assets/store-elevate/03-tests-library.png',
        './assets/store-elevate/04-timed-mock-tests.png',
        './assets/store-elevate/05-omr-evaluation.png',
        './assets/store-elevate/06-omr-scan.png',
        './assets/store-elevate/07-smart-study-notes.png',
        './assets/store-elevate/08-realtime-leaderboard.png',
        './assets/store-elevate/09-realtime-analytics.png',
      ],
      apkSizeLabel: GENERATED_ELEVATE_APK_META.apkSizeLabel || '9.2 MB',
      contactEmail: 'sanju3456k@gmail.com',
      websiteUrl: 'https://labselevate.vercel.app',
      accentColor: '#0b57d0',
    },
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  ...GENERATED_INSTITUTES_REGISTRY,
];
