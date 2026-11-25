import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import type { User, Batch, Subject, Chapter, Lecture, WatchProgress, Announcement, PersonalNote, BatchEnrollment, BatchTestCard, PdfNote, SecuritySettingsConfig, StudentFeatureAccessConfig } from './types';
import { DEFAULT_STUDENT_FEATURE_ACCESS } from './types';
import {
  INITIAL_USER,
  INITIAL_BATCHES,
  INITIAL_SUBJECTS,
  INITIAL_CHAPTERS,
  INITIAL_LECTURES,
  INITIAL_ANNOUNCEMENTS,
  INITIAL_STUDENTS,
  INITIAL_ENROLLMENTS,
  INITIAL_BATCH_TESTS,
} from './initialData';
import { enableContentSecurityDeterrence, obfuscateVideoKey, initConsoleSecurityNotice } from './security';
import { secureStorage } from '../lib/secureStorage';
import { auth, db, getCachedFullTest, sanitizeForFirestore } from '../lib/firebase';
import { dismissNotificationId, NOTIFICATIONS_EVENT } from '../lib/notifications';
import { isMasterUser, publishTestToBatchCatalog, isDeprecatedTest, DEPRECATED_TEST_IDS } from '../lib/masterAccount';
import { hydrateQuestionsForTest } from '../lib/questionCatalogService';
import { getTestDurationMinutes } from '../utils/testFormatConverter';
import { listenerManager } from '../lib/listenerManager';
import { DEFAULT_HIGH_RES_BANNER } from '../components/lms/batches/BatchThumbnailPicker';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc, setDoc, updateDoc, collection, onSnapshot, arrayUnion } from 'firebase/firestore';
import {
  syncBatchToFirestore,
  deleteBatchFromFirestore,
  fetchBatchesFromFirestore,
  touchBatchCatalogBeacon,
  enrollStudentInFirestore,
  revokeStudentInFirestore,
  fetchStudentEnrollmentsFromFirestore,
  fetchAllEnrollmentsFromFirestore,
  fetchBatchEnrollmentsFromFirestore,
  syncChapterToFirestore,
  deleteChapterFromFirestore,
  syncLectureToFirestore,
  deleteLectureFromFirestore,
  fetchBatchCurriculumFromFirestore,
  cleanKeyForFirestore,
  syncBatchTestToFirestore,
  deleteBatchTestFromFirestore,
  fetchBatchTestsFromFirestore,
  getCachedBatchCatalogBeacon,
  setCachedBatchCatalogBeacon,
} from '../lib/batchCloudSync';


export type ThemeMode = 'light' | 'dark';

export const FACULTY_DEFAULT_AVATAR = '/assets/default-profile.svg';

export const getFacultyAvatarUrl = (rawUrl?: string): string => {
  if (!rawUrl || rawUrl.includes('unsplash.com')) {
    return FACULTY_DEFAULT_AVATAR;
  }
  return rawUrl;
};

interface AppContextType {
  user: User;
  setUser: React.Dispatch<React.SetStateAction<User>>;
  toggleRole: () => void;
  theme: ThemeMode;
  toggleTheme: () => void;
  batches: Batch[];
  addBatch: (batch: Omit<Batch, 'id' | 'enrolledStudentsCount' | 'rating'>) => void;
  updateBatch: (id: string, updated: Partial<Batch>) => void;
  deleteBatch: (id: string) => void;
  subjects: Subject[];
  addSubject: (subject: Omit<Subject, 'id'>) => void;
  chapters: Chapter[];
  addChapter: (chapter: Omit<Chapter, 'id'>) => void;
  updateChapter: (id: string, updated: Partial<Chapter>) => void;
  deleteChapter: (id: string) => void;
  addFolder: (folderData: { batchId: string; title: string; parentId?: string | null; subjectId?: string; color?: string; description?: string }) => Chapter;
  addPdfNoteToChapter: (chapterId: string, note: Omit<PdfNote, 'id'>) => void;
  deletePdfNoteFromChapter: (chapterId: string, noteId: string) => void;
  toggleTestInChapter: (chapterId: string, testId: string, testData?: any) => void;
  getBreadcrumbs: (chapterId: string | null, batchId: string) => Array<{ id: string | null; title: string }>;
  getSubfolders: (batchId: string, parentId?: string | null) => Chapter[];
  lectures: Lecture[];
  addLecture: (lecture: Omit<Lecture, 'id' | 'createdAt'>) => void;
  updateLecture: (id: string, updated: Partial<Lecture>) => void;
  deleteLecture: (id: string) => void;
  watchProgress: Record<string, WatchProgress>;
  updateWatchProgress: (lectureId: string, currentSeconds: number, totalSeconds: number) => void;
  announcements: Announcement[];
  addAnnouncement: (announcement: Omit<Announcement, 'id'>) => void;
  updateAnnouncement: (id: string, updated: Partial<Announcement>) => void;
  deleteAnnouncement: (id: string) => void;
  personalNotes: PersonalNote[];
  addPersonalNote: (note: Omit<PersonalNote, 'id' | 'createdAt'>) => void;
  deletePersonalNote: (id: string) => void;
  activeBatchId: string | null;
  setActiveBatchId: (id: string | null) => void;
  refreshCloudContent: () => Promise<void>;
  activeLectureId: string | null;
  setActiveLectureId: (id: string | null) => void;
  securityToast: string | null;
  showSecurityToast: (msg: string) => void;
  isEnrolled: (batchId: string) => boolean;
  enrollInBatch: (batchId: string) => void;
  enrollAsGuest: (batchId: string) => { success: boolean; message: string };
  isGuestAllowedForBatch: (batchId: string) => boolean;
  toggleBatchGuestAccess: (batchId: string) => Promise<void>;
  toggleBatchPrivateRosterOnly: (batchId: string) => Promise<void>;
  globalGuestAccessMode: 'specific_batches' | 'all_batches' | 'none';
  setGlobalGuestAccessMode: (mode: 'specific_batches' | 'all_batches' | 'none') => void;
  students: { id: string; name: string; email?: string; phone?: string }[];
  enrollments: BatchEnrollment[];
  batchTests: BatchTestCard[];
  enrollStudentByContact: (params: { contact: string; batchId: string; name?: string; validityDays?: number }) => { success: boolean; message: string };
  revokeStudentEnrollment: (userId: string, batchId: string) => void;
  getEnrollmentsForBatch: (batchId: string) => BatchEnrollment[];
  loadRosterForBatch: (batchId: string) => Promise<void>;
  loadCurriculumForBatch: (batchId: string, forceRefresh?: boolean) => Promise<void>;
  searchStudents: (query: string) => { id: string; name: string; email?: string; phone?: string }[];
  addTestToBatchCatalog: (params: {
    testId?: string;
    batchId: string;
    chapterId?: string | null;
    title: string;
    topic: string;
    difficulty: 'easy' | 'medium' | 'hard' | 'adaptive';
    timeLimitMinutes: number;
    questionCount: number;
    passingScorePercentage?: number;
    questions?: any[];
  }) => { success: boolean; message: string };
  deleteBatchTest: (batchId: string, testId: string, testTitle?: string) => void;
  getTestsForBatch: (batchId: string) => BatchTestCard[];
  securitySettings: SecuritySettingsConfig;
  updateSecuritySettings: (newSettings: Partial<SecuritySettingsConfig>) => void;
  studentFeatureAccess: StudentFeatureAccessConfig;
  updateStudentFeatureAccess: (newSettings: Partial<StudentFeatureAccessConfig>) => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

const STORAGE_KEYS = {
  USER: 'elevatelabs_user_v2',
  THEME: 'elevatelabs_theme_v2',
  BATCHES: 'elevatelabs_batches_v2',
  SUBJECTS: 'elevatelabs_subjects_v2',
  CHAPTERS: 'elevatelabs_chapters_v2',
  LECTURES: 'elevatelabs_lectures_v2',
  PROGRESS: 'elevatelabs_progress_v2',
  ANNOUNCEMENTS: 'elevatelabs_announcements_v2',
  NOTES: 'elevatelabs_notes_v2',
  STUDENTS: 'elevatelabs_students_v2',
  ENROLLMENTS: 'elevatelabs_enrollments_v2',
  BATCH_TESTS: 'elevatelabs_batch_tests_v2',
  GUEST_ACCESS_MODE: 'elevatelabs_guest_access_mode_v2',
  SECURITY_SETTINGS: 'elevatelabs_security_settings_v2',
  STUDENT_FEATURE_ACCESS: 'elevatelabs_student_feature_access_v2',
  DELETED_ANNOUNCEMENTS: 'elevatelabs_deleted_announcements_v2',
};

export function getLocalDeletedAnnouncementIds(): Set<string> {
  try {
    const raw =
      secureStorage.getItem(STORAGE_KEYS.DELETED_ANNOUNCEMENTS) ||
      (typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEYS.DELETED_ANNOUNCEMENTS) : null);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    return new Set(Array.isArray(arr) ? arr.map(String).filter(Boolean) : []);
  } catch {
    return new Set();
  }
}

export function addLocalDeletedAnnouncementId(id: string): void {
  if (!id) return;
  try {
    const set = getLocalDeletedAnnouncementIds();
    set.add(String(id));
    const arr = Array.from(set).slice(-500);
    const jsonStr = JSON.stringify(arr);
    secureStorage.setItem(STORAGE_KEYS.DELETED_ANNOUNCEMENTS, jsonStr);
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_KEYS.DELETED_ANNOUNCEMENTS, jsonStr);
    }
  } catch {}
}

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [theme, setTheme] = useState<ThemeMode>(() => {
    try {
      const saved = secureStorage.getItem(STORAGE_KEYS.THEME);
      if (saved === 'light' || saved === 'dark') return saved;
    } catch {}
    return typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });

  const [user, setUser] = useState<User>(() => {
    try {
      const saved = secureStorage.getItem(STORAGE_KEYS.USER);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && typeof parsed === 'object') {
          const batchIds = Array.isArray(parsed.enrolledBatchIds) && parsed.enrolledBatchIds.length > 0
            ? parsed.enrolledBatchIds
            : INITIAL_USER.enrolledBatchIds;
          return {
            ...INITIAL_USER,
            ...parsed,
            enrolledBatchIds: batchIds,
          };
        }
      }
    } catch {}
    return INITIAL_USER;
  });

  const [batches, setBatches] = useState<Batch[]>(() => {
    try {
      const saved = secureStorage.getItem(STORAGE_KEYS.BATCHES);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          return parsed.map((b: Batch) => ({
            ...b,
            instructor: {
              ...b.instructor,
              avatarUrl: getFacultyAvatarUrl(b.instructor?.avatarUrl),
            },
          }));
        }
      }
    } catch {}
    return INITIAL_BATCHES;
  });

  const [subjects, setSubjects] = useState<Subject[]>(() => {
    try {
      const saved = secureStorage.getItem(STORAGE_KEYS.SUBJECTS);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {}
    return INITIAL_SUBJECTS;
  });

  const [chapters, setChapters] = useState<Chapter[]>(() => {
    let parsed: Chapter[] = INITIAL_CHAPTERS;
    try {
      const saved = secureStorage.getItem(STORAGE_KEYS.CHAPTERS);
      if (saved) {
        const raw = JSON.parse(saved);
        if (Array.isArray(raw)) parsed = raw;
      }
    } catch {}
    return parsed.map((c) => ({
      ...c,
      testIds: Array.isArray(c.testIds) ? c.testIds.filter((id) => !DEPRECATED_TEST_IDS.has(id) && !id.includes('mix_test') && !id.includes('imported-1789747440687')) : [],
    }));
  });

  const [lectures, setLectures] = useState<Lecture[]>(() => {
    try {
      const saved = secureStorage.getItem(STORAGE_KEYS.LECTURES);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {}
    return INITIAL_LECTURES;
  });

  const [watchProgress, setWatchProgress] = useState<Record<string, WatchProgress>>(() => {
    try {
      const saved = secureStorage.getItem(STORAGE_KEYS.PROGRESS);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && typeof parsed === 'object') return parsed;
      }
    } catch {}
    return {};
  });

  const [announcements, setAnnouncements] = useState<Announcement[]>(() => {
    try {
      const deletedSet = getLocalDeletedAnnouncementIds();
      const saved = secureStorage.getItem(STORAGE_KEYS.ANNOUNCEMENTS);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          const sanitized = parsed.map((a: any) => {
            if (a.id === 'ann_test_1' || (a.title && String(a.title).includes('Testing Environment Active'))) {
              return INITIAL_ANNOUNCEMENTS[0];
            }
            return a;
          });
          const filtered = sanitized.filter((a: any) => a?.id && !deletedSet.has(String(a.id)));
          if (filtered.length === 0) return INITIAL_ANNOUNCEMENTS;
          return filtered;
        }
      }
    } catch {}
    const deletedSet = getLocalDeletedAnnouncementIds();
    return INITIAL_ANNOUNCEMENTS.filter((a) => a?.id && !deletedSet.has(String(a.id)));
  });

  const [personalNotes, setPersonalNotes] = useState<PersonalNote[]>(() => {
    try {
      const saved = secureStorage.getItem(STORAGE_KEYS.NOTES);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {}
    return [
      {
        id: 'note_init_1',
        lectureId: 'lec_testing_01',
        seconds: 95,
        text: 'Key visual demonstration begins here. Great concept clarity!',
        createdAt: 'Today, 11:45 AM',
      },
    ];
  });

  const [students, setStudents] = useState<{ id: string; name: string; email?: string; phone?: string }[]>(() => {
    try {
      const saved = secureStorage.getItem(STORAGE_KEYS.STUDENTS);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {}
    return INITIAL_STUDENTS;
  });

  const [enrollments, setEnrollments] = useState<BatchEnrollment[]>(() => {
    try {
      const saved = secureStorage.getItem(STORAGE_KEYS.ENROLLMENTS);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {}
    return INITIAL_ENROLLMENTS;
  });

  const [batchTests, setBatchTests] = useState<BatchTestCard[]>(() => {
    let cleanList: BatchTestCard[] = [];
    try {
      const saved = secureStorage.getItem(STORAGE_KEYS.BATCH_TESTS);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          cleanList = parsed.filter((t) => !isDeprecatedTest(t));
        }
      }
    } catch {}
    if (cleanList.length === 0) {
      cleanList = INITIAL_BATCH_TESTS.filter((t) => !isDeprecatedTest(t));
    }
    return cleanList;
  });

  const [activeBatchId, setActiveBatchId] = useState<string | null>(null);
  const [activeLectureId, setActiveLectureId] = useState<string | null>(null);
  const [securityToast, setSecurityToast] = useState<string | null>(null);
  const toastTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const [securitySettings, setSecuritySettings] = useState<SecuritySettingsConfig>(() => {
    const saved = secureStorage.getItem(STORAGE_KEYS.SECURITY_SETTINGS);
    if (saved) {
      try {
        return {
          enableDrmScreenProtection: true,
          enableDynamicWatermark: true,
          enableExamAnswerMasking: true,
          enableDevToolsDeterrence: true,
          enableStorageEncryption: true,
          enableTestShareButton: false,
          ...JSON.parse(saved),
        };
      } catch {}
    }
    return {
      enableDrmScreenProtection: true,
      enableDynamicWatermark: true,
      enableExamAnswerMasking: true,
      enableDevToolsDeterrence: true,
      enableStorageEncryption: true,
      enableTestShareButton: false,
    };
  });

  const updateSecuritySettings = useCallback((newSettings: Partial<SecuritySettingsConfig>) => {
    setSecuritySettings((prev) => {
      const next = { ...prev, ...newSettings };
      try {
        secureStorage.setItem(STORAGE_KEYS.SECURITY_SETTINGS, JSON.stringify(next));
      } catch {}
      setDoc(doc(db, 'master_catalog', 'lms_security_config'), next, { merge: true }).catch(() => {});
      return next;
    });
    showSecurityToast('Security policy updated');
  }, []);

  const [studentFeatureAccess, setStudentFeatureAccess] = useState<StudentFeatureAccessConfig>(() => {
    try {
      const saved = secureStorage.getItem(STORAGE_KEYS.STUDENT_FEATURE_ACCESS);
      if (saved) {
        return {
          ...DEFAULT_STUDENT_FEATURE_ACCESS,
          ...JSON.parse(saved),
        };
      }
    } catch {}
    return DEFAULT_STUDENT_FEATURE_ACCESS;
  });

  const updateStudentFeatureAccess = useCallback((newSettings: Partial<StudentFeatureAccessConfig>) => {
    setStudentFeatureAccess((prev) => {
      const next: StudentFeatureAccessConfig = {
        ...prev,
        ...newSettings,
        updatedAt: new Date().toISOString(),
      };
      try {
        secureStorage.setItem(STORAGE_KEYS.STUDENT_FEATURE_ACCESS, JSON.stringify(next));
      } catch {}
      setDoc(doc(db, 'master_catalog', 'student_feature_access'), next, { merge: true }).catch(() => {});
      return next;
    });
    showSecurityToast('Student module access updated');
  }, []);

  // 1. Initial Load: Fetch all active published batches and global guest access policy from Cloud Firestore
  useEffect(() => {
    // Inject legal and compliance notice into DevTools console (DPDP Act 2023 & IT Act 2000)
    initConsoleSecurityNotice();
    // Seamless automatic migration of legacy plaintext storage keys to encrypted cipher format
    secureStorage.migrateLegacyKeys(Object.values(STORAGE_KEYS));

    fetchBatchesFromFirestore().then((cloudBatches) => {
      if (cloudBatches && cloudBatches.length > 0) {
        setBatches(cloudBatches);
      }
    });

    // Enterprise 1-Document Revision Beacon Listener:
    // Listens strictly to lightweight metadata doc /master_catalog/batch_catalog_meta (1 doc read instead of N collection reads)
    // Equipped with singleton deduplication & visibility-aware background pausing via listenerManager.
    // When faculty publishes a course, edits prices, or modifies syllabus, beacon triggers instant refresh.
    // When individual students enroll, batch counters update without triggering catalog beacon, eliminating 99% of wasteful reads.
    const unsubBatchCatalogBeacon = listenerManager.subscribeDocument(
      'master_catalog/batch_catalog_meta',
      () => doc(db, 'master_catalog', 'batch_catalog_meta'),
      (snap) => {
        if (snap.exists()) {
          const serverBeacon = String(snap.data()?.lastUpdatedAt || '');
          const localBeacon = getCachedBatchCatalogBeacon();
          // Skip full batches collection read if encrypted local cache already matches this revision
          if (serverBeacon && localBeacon && serverBeacon === localBeacon) {
            return;
          }
          fetchBatchesFromFirestore({ forceRefresh: Boolean(serverBeacon && localBeacon && serverBeacon !== localBeacon) })
            .then((cloudBatches) => {
              if (cloudBatches && cloudBatches.length > 0) {
                setBatches(cloudBatches);
                if (serverBeacon) {
                  setCachedBatchCatalogBeacon(serverBeacon);
                }
              }
            })
            .catch(() => {});
        }
      }
    );

    // Real-time live listener for global guest policy across Master and Guest browsers
    // Equipped with singleton deduplication & visibility-aware background pausing
    const unsubPolicy = listenerManager.subscribeDocument(
      'master_catalog/lms_guest_policy',
      () => doc(db, 'master_catalog', 'lms_guest_policy'),
      (snap) => {
        if (snap.exists()) {
          const val = snap.data()?.globalGuestAccessMode;
          if (val === 'specific_batches' || val === 'all_batches' || val === 'none') {
            setGlobalGuestAccessModeState(val);
            try {
              secureStorage.setItem(STORAGE_KEYS.GUEST_ACCESS_MODE, val);
            } catch {}
          }
        }
      },
      (err) => {
        console.warn('LMS policy live listener notice:', err);
      }
    );

    // Live listener for Master Console security configuration
    const unsubSecurity = listenerManager.subscribeDocument(
      'master_catalog/lms_security_config',
      () => doc(db, 'master_catalog', 'lms_security_config'),
      (snap) => {
        if (snap.exists()) {
          const val = snap.data() as Partial<SecuritySettingsConfig>;
          if (val) {
            setSecuritySettings((prev) => ({ ...prev, ...val }));
            try {
              secureStorage.setItem(STORAGE_KEYS.SECURITY_SETTINGS, JSON.stringify(val));
            } catch {}
          }
        }
      },
      (err) => {
        console.warn('LMS security config live listener notice:', err);
      }
    );

    // Live listener for Master Console student feature access configuration
    const unsubStudentFeatures = listenerManager.subscribeDocument(
      'master_catalog/student_feature_access',
      () => doc(db, 'master_catalog', 'student_feature_access'),
      (snap) => {
        if (snap.exists()) {
          const val = snap.data() as Partial<StudentFeatureAccessConfig>;
          if (val) {
            setStudentFeatureAccess((prev) => ({ ...prev, ...val }));
            try {
              secureStorage.setItem(STORAGE_KEYS.STUDENT_FEATURE_ACCESS, JSON.stringify(val));
            } catch {}
          }
        }
      },
      (err) => {
        console.warn('LMS student feature access live listener notice:', err);
      }
    );

    // Live listener for global announcements and master broadcast posts (Real-time student & admin sync)
    const unsubAnnouncements = listenerManager.subscribeDocument(
      'master_catalog/lms_announcements',
      () => doc(db, 'master_catalog', 'lms_announcements'),
      (snap) => {
        if (snap.exists()) {
          const val = snap.data();
          if (Array.isArray(val?.list)) {
            // Robust parsing of deleted announcement IDs from Firestore (supports arrays and legacy maps)
            const rawDeleted = Array.isArray(val?.deletedIds)
              ? val.deletedIds
              : Array.isArray(val?.deletedIdsList)
              ? val.deletedIdsList
              : typeof val?.deletedIds === 'object' && val?.deletedIds !== null
              ? Object.values(val.deletedIds)
              : [];

            const firestoreDeletedIds = new Set<string>(
              rawDeleted.map((x: any) => String(x)).filter(Boolean)
            );

            // Persist all deleted IDs into local storage on this client (student or admin)
            firestoreDeletedIds.forEach((delId) => {
              addLocalDeletedAnnouncementId(delId);
              try {
                dismissNotificationId(`notif-ann-${delId}`);
              } catch {}
            });

            const localDeletedIds = getLocalDeletedAnnouncementIds();
            const allDeletedIds = new Set([...firestoreDeletedIds, ...localDeletedIds]);

            setAnnouncements((currentLocal) => {
              const map = new Map<string, Announcement>();

              // Authoritative published announcements from Firestore, strictly excluding deleted items
              val.list.forEach((item: Announcement) => {
                if (item?.id && !allDeletedIds.has(String(item.id))) {
                  map.set(String(item.id), item);
                }
              });

              // Only preserve freshly composed local drafts created in the last 45s (prevent post loss during composition)
              const now = Date.now();
              currentLocal.forEach((item) => {
                if (
                  item?.id &&
                  !map.has(String(item.id)) &&
                  !allDeletedIds.has(String(item.id)) &&
                  typeof item.createdAt === 'number' &&
                  now - item.createdAt < 45000
                ) {
                  map.set(String(item.id), item);
                }
              });

              const merged = Array.from(map.values()).sort(
                (a, b) => (b.createdAt || 0) - (a.createdAt || 0)
              );
              try {
                secureStorage.setItem(STORAGE_KEYS.ANNOUNCEMENTS, JSON.stringify(merged));
              } catch {}
              return merged;
            });

            // Trigger notification update event so all notification views re-render
            try {
              window.dispatchEvent(new CustomEvent(NOTIFICATIONS_EVENT));
            } catch {}
          }
        }
      },
      (err) => {
        console.warn('LMS announcements live listener notice:', err);
      }
    );

    return () => {
      unsubBatchCatalogBeacon();
      unsubPolicy();
      unsubSecurity();
      unsubStudentFeatures();
      unsubAnnouncements();
    };
  }, []);

  // Proactively fetch tests for all active batches from Firestore on startup & batch changes
  useEffect(() => {
    if (!batches || batches.length === 0) return;

    let isMounted = true;
    const syncActiveBatchTests = async () => {
      try {
        let hasNew = false;
        let currentTests = [...batchTests];

        for (const b of batches) {
          if (!b.id) continue;
          const isEnrolledOrAccessible =
            user.role === 'admin' ||
            user.enrolledBatchIds.includes(b.id) ||
            Boolean(b.allowGuestAccess);
          if (!isEnrolledOrAccessible) continue;
          try {
            const cloudTests = await fetchBatchTestsFromFirestore(b.id);
            if (Array.isArray(cloudTests) && cloudTests.length > 0) {
              cloudTests.forEach((ct) => {
                const cId = ct.testId || ct.id;
                if (!cId || isDeprecatedTest(ct)) return;
                const existingIdx = currentTests.findIndex(
                  (t) => (t.testId || t.id) === cId && t.batchId === b.id
                );
                if (existingIdx >= 0) {
                  currentTests[existingIdx] = { ...currentTests[existingIdx], ...ct };
                } else {
                  currentTests.push(ct);
                  hasNew = true;
                }
              });
            }
          } catch {}
        }

        if (isMounted && hasNew) {
          const cleanList = currentTests.filter((t) => !isDeprecatedTest(t));
          setBatchTests(cleanList);
          try {
            secureStorage.setItem(STORAGE_KEYS.BATCH_TESTS, JSON.stringify(cleanList));
          } catch {}
          window.dispatchEvent(new CustomEvent('batch-tests-updated'));
        }
      } catch (err) {
        console.warn('Batch tests background sync notice:', err);
      }
    };

    syncActiveBatchTests();
    return () => {
      isMounted = false;
    };
  }, [batches.length]);

  // 2. Live Auth State & Cloud Firestore Student Enrollment Synchronization (Zero-Leakage Session Lifecycle)
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        const email = (firebaseUser.email || '').toLowerCase().trim();
        const isMaster = isMasterUser(firebaseUser);

        if (isMaster) {
          // Master Admin: Fetch ALL active student enrollments across all batches from Cloud Firestore
          const allEnrollments = await fetchAllEnrollmentsFromFirestore();
          setEnrollments(allEnrollments || []);
          setBatches((prevBatches) =>
            prevBatches.map((b) => {
              const count = (allEnrollments || []).filter((e) => e.batchId === b.id && e.status === 'active').length;
              return { ...b, enrolledStudentsCount: Math.max(b.enrolledStudentsCount || 0, count) };
            })
          );
          setUser({
            id: firebaseUser.uid,
            name: firebaseUser.displayName || 'Master Admin',
            email,
            phone: firebaseUser.phoneNumber || '',
            role: 'admin',
            enrolledBatchIds: [], // Master admin has universal access via role: 'admin'
          });
        } else {
          // Student: Fetch ONLY their own authorized enrollments (1-Read Access)
          const { batchIds: cloudBatchIds, enrollments: cloudEnrollments } = await fetchStudentEnrollmentsFromFirestore(
            email,
            firebaseUser.phoneNumber
          );
          setUser({
            id: firebaseUser.uid,
            name: firebaseUser.displayName || email.split('@')[0] || 'Student',
            email,
            phone: firebaseUser.phoneNumber || '',
            role: 'student',
            enrolledBatchIds: cloudBatchIds,
          });
          setEnrollments(cloudEnrollments);
        }
      } else {
        // User logged out or unauthenticated: Check if a local guest session exists
        let guestUser: User | null = null;
        try {
          const saved = secureStorage.getItem(STORAGE_KEYS.USER);
          if (saved) {
            const parsed = JSON.parse(saved);
            if (parsed && parsed.role !== 'admin') {
              guestUser = parsed;
            }
          }
        } catch {}

        if (guestUser) {
          setUser(guestUser);
        } else {
          setUser({
            ...INITIAL_USER,
            enrolledBatchIds: [],
          });
        }
        setEnrollments([]);
      }
    });

    return () => unsubscribe();
  }, []);

  // Sync state to SecureStorage Vault as zero-latency encrypted cache (enc_v2_...)
  useEffect(() => {
    secureStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(user));
  }, [user]);

  useEffect(() => {
    secureStorage.setItem(STORAGE_KEYS.BATCHES, JSON.stringify(batches));
  }, [batches]);

  useEffect(() => {
    secureStorage.setItem(STORAGE_KEYS.SUBJECTS, JSON.stringify(subjects));
  }, [subjects]);

  useEffect(() => {
    secureStorage.setItem(STORAGE_KEYS.CHAPTERS, JSON.stringify(chapters));
  }, [chapters]);

  useEffect(() => {
    secureStorage.setItem(STORAGE_KEYS.LECTURES, JSON.stringify(lectures));
  }, [lectures]);

  useEffect(() => {
    secureStorage.setItem(STORAGE_KEYS.PROGRESS, JSON.stringify(watchProgress));
  }, [watchProgress]);

  useEffect(() => {
    secureStorage.setItem(STORAGE_KEYS.ANNOUNCEMENTS, JSON.stringify(announcements));
  }, [announcements]);

  useEffect(() => {
    secureStorage.setItem(STORAGE_KEYS.NOTES, JSON.stringify(personalNotes));
  }, [personalNotes]);

  // Role-based student roster data protection (DPDP Act 2023 compliance):
  // Never expose all students' PII (phone/email) in a non-admin student's browser storage
  useEffect(() => {
    if (user.role === 'admin' || (user as any).isMaster) {
      secureStorage.setItem(STORAGE_KEYS.STUDENTS, JSON.stringify(students));
    } else {
      secureStorage.removeItem(STORAGE_KEYS.STUDENTS);
    }
  }, [students, user.role]);

  useEffect(() => {
    secureStorage.setItem(STORAGE_KEYS.ENROLLMENTS, JSON.stringify(enrollments));
  }, [enrollments]);

  useEffect(() => {
    secureStorage.setItem(STORAGE_KEYS.BATCH_TESTS, JSON.stringify(batchTests));
  }, [batchTests]);

  // Apply theme class to HTML root element
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
      root.classList.remove('light');
    } else {
      root.classList.add('light');
      root.classList.remove('dark');
    }
    localStorage.setItem(STORAGE_KEYS.THEME, theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme((prev) => (prev === 'light' ? 'dark' : 'light'));
  };

  const showSecurityToast = (msg: string) => {
    setSecurityToast(msg);
    if (toastTimeoutRef.current) {
      clearTimeout(toastTimeoutRef.current);
    }
    toastTimeoutRef.current = setTimeout(() => {
      setSecurityToast(null);
      toastTimeoutRef.current = null;
    }, 5000);
  };

  useEffect(() => {
    // Global DevTools & Inspection Deterrence across all pages (Home, Batches, Tests, Curriculum)
    if (!securitySettings.enableDevToolsDeterrence) {
      return;
    }
    const isLocal = typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
    const isAdmin = user.role === 'admin' || (user as any).isMaster;

    // Preserve full developer tooling on localhost for admin, enforce globally in production & for students
    if (isLocal && isAdmin) {
      return;
    }

    const cleanup = enableContentSecurityDeterrence((reason) => {
      showSecurityToast(`🛡️ Security Shield: ${reason}`);
    });
    return cleanup;
  }, [securitySettings.enableDevToolsDeterrence, user.role]);

  const toggleRole = () => {
    setUser((prev) => ({
      ...prev,
      role: prev.role === 'admin' ? 'student' : 'admin',
    }));
  };

  // 3. Cloud Firestore Backed Batch CRUD
  const addBatch = async (batchData: Omit<Batch, 'id' | 'enrolledStudentsCount' | 'rating'>) => {
    const resolvedBanner = batchData.bannerUrl?.trim() || batchData.thumbnailUrl?.trim() || DEFAULT_HIGH_RES_BANNER;
    const newBatch: Batch = {
      ...batchData,
      id: `batch_${Date.now()}`,
      rating: 5.0,
      enrolledStudentsCount: 0,
      isPublished: true,
      bannerUrl: resolvedBanner,
      thumbnailUrl: batchData.thumbnailUrl?.trim() || resolvedBanner,
    };
    setBatches((prev) => [newBatch, ...prev]);
    const res = await syncBatchToFirestore(newBatch);
    if (!res.success) {
      console.error('Batch sync failure:', res.error);
      showSecurityToast(`Warning: Cloud sync failed (${res.error}). Verify master account connection.`);
    } else {
      showSecurityToast(`Batch "${newBatch.title}" successfully synced to Cloud Firestore.`);
    }
  };

  const updateBatch = useCallback(async (id: string, updated: Partial<Batch>) => {
    let targetToSync: Batch | null = null;
    const nowIso = new Date().toISOString();
    setBatches((prev) => {
      const next = prev.map((b) => {
        if (b.id === id) {
          const merged = { ...b, ...updated, updatedAt: nowIso };
          targetToSync = merged;
          return merged;
        }
        return b;
      });
      try {
        secureStorage.setItem(STORAGE_KEYS.BATCHES, JSON.stringify(next));
        secureStorage.setItem('elevatelabs_cloud_batches_cache', JSON.stringify(next));
        if (typeof window !== 'undefined' && window.localStorage) {
          window.localStorage.setItem('math_mock_batches_cache', JSON.stringify(next));
          window.localStorage.setItem('math_mock_batches_cache_time', String(Date.now()));
        }
      } catch {}
      return next;
    });

    try {
      const batchRef = doc(db, 'batches', id);
      await setDoc(
        batchRef,
        {
          ...updated,
          updatedAt: nowIso,
        },
        { merge: true }
      );
      touchBatchCatalogBeacon().catch(() => {});
      window.dispatchEvent(new CustomEvent('batch-catalog-updated', { detail: { batchId: id, updated } }));
    } catch {
      if (targetToSync) {
        await syncBatchToFirestore(targetToSync).catch(() => {});
      }
    }
  }, []);

  const deleteBatch = async (id: string) => {
    setBatches((prev) => {
      const next = prev.filter((b) => b.id !== id);
      try {
        secureStorage.setItem(STORAGE_KEYS.BATCHES, JSON.stringify(next));
        secureStorage.setItem('elevatelabs_cloud_batches_cache', JSON.stringify(next));
        if (typeof window !== 'undefined' && window.localStorage) {
          window.localStorage.setItem('math_mock_batches_cache', JSON.stringify(next));
          window.localStorage.setItem('math_mock_batches_cache_time', String(Date.now()));
        }
      } catch {}
      return next;
    });
    await deleteBatchFromFirestore(id);
  };

  const addSubject = (subjectData: Omit<Subject, 'id'>) => {
    const newSubject: Subject = {
      ...subjectData,
      id: `sub_${Date.now()}`,
    };
    setSubjects((prev) => [...prev, newSubject]);
  };

  const addChapter = (chapterData: Omit<Chapter, 'id'>) => {
    const newChapter: Chapter = {
      ...chapterData,
      id: `chap_${Date.now()}`,
    };
    setChapters((prev) => [...prev, newChapter]);
    syncChapterToFirestore(newChapter.batchId, newChapter).catch(() => {});
  };

  const addFolder = useCallback((folderData: { batchId: string; title: string; parentId?: string | null; subjectId?: string; color?: string; description?: string }): Chapter => {
    const parent = folderData.parentId ? chapters.find((c) => c.id === folderData.parentId) : null;
    const siblingCount = chapters.filter((c) => c.batchId === folderData.batchId && (c.parentId || null) === (folderData.parentId || null)).length;
    const newFolder: Chapter = {
      id: `folder_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      batchId: folderData.batchId,
      subjectId: folderData.subjectId || parent?.subjectId || 'sub_general',
      title: folderData.title.trim(),
      description: folderData.description || '',
      parentId: folderData.parentId || null,
      folderType: 'folder',
      color: folderData.color || '#0b57d0',
      order: siblingCount + 1,
      testIds: [],
      pdfNotes: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    setChapters((prev) => [...prev, newFolder]);
    syncChapterToFirestore(newFolder.batchId, newFolder).catch(() => {});
    return newFolder;
  }, [chapters]);

  const updateChapter = useCallback((id: string, updated: Partial<Chapter>) => {
    setChapters((prev) => {
      const next = prev.map((c) => (c.id === id ? { ...c, ...updated, updatedAt: new Date().toISOString() } : c));
      const target = next.find((c) => c.id === id);
      if (target) {
        syncChapterToFirestore(target.batchId, target).catch(() => {});
      }
      return next;
    });
  }, []);

  const deleteChapter = useCallback((id: string) => {
    const target = chapters.find((c) => c.id === id);
    if (!target) return;

    // Recursively collect all descendant folder ids
    const idsToDelete = new Set<string>([id]);
    let added = true;
    while (added) {
      added = false;
      chapters.forEach((c) => {
        if (c.parentId && idsToDelete.has(c.parentId) && !idsToDelete.has(c.id)) {
          idsToDelete.add(c.id);
          added = true;
        }
      });
    }

    setChapters((prev) => prev.filter((c) => !idsToDelete.has(c.id)));
    setLectures((prev) => prev.filter((l) => !idsToDelete.has(l.chapterId)));

    idsToDelete.forEach((delId) => {
      deleteChapterFromFirestore(target.batchId, delId).catch(() => {});
    });
  }, [chapters]);

  const addPdfNoteToChapter = useCallback((chapterId: string, noteData: Omit<PdfNote, 'id'>) => {
    const newNote: PdfNote = {
      ...noteData,
      id: `pdf_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    };
    setChapters((prev) => {
      const next = prev.map((c) => {
        if (c.id !== chapterId) return c;
        const existingNotes = c.pdfNotes || [];
        return {
          ...c,
          pdfNotes: [...existingNotes, newNote],
          updatedAt: new Date().toISOString(),
        };
      });
      const target = next.find((c) => c.id === chapterId);
      if (target) {
        syncChapterToFirestore(target.batchId, target).catch(() => {});
      }
      return next;
    });
  }, []);

  const deletePdfNoteFromChapter = useCallback((chapterId: string, noteId: string) => {
    setChapters((prev) => {
      const next = prev.map((c) => {
        if (c.id !== chapterId) return c;
        return {
          ...c,
          pdfNotes: (c.pdfNotes || []).filter((n) => n.id !== noteId),
          updatedAt: new Date().toISOString(),
        };
      });
      const target = next.find((c) => c.id === chapterId);
      if (target) {
        syncChapterToFirestore(target.batchId, target).catch(() => {});
      }
      return next;
    });
  }, []);

  const toggleTestInChapter = useCallback((chapterId: string, testId: string, testData?: any) => {
    setChapters((prev) => {
      let isAdded = false;
      const next = prev.map((c) => {
        if (c.id !== chapterId) return c;
        const currentTests = c.testIds || [];
        const exists = currentTests.includes(testId);
        isAdded = !exists;
        const newTestIds = exists ? currentTests.filter((t) => t !== testId) : [...currentTests, testId];
        return {
          ...c,
          testIds: newTestIds,
          updatedAt: new Date().toISOString(),
        };
      });
      const target = next.find((c) => c.id === chapterId);
      if (target) {
        syncChapterToFirestore(target.batchId, target).catch(() => {});
        try {
          secureStorage.setItem(STORAGE_KEYS.CHAPTERS, JSON.stringify(next));
        } catch {}

        if (isAdded) {
          let testObj = testData || getCachedFullTest(testId);
          if (!testObj || !testObj.questions || testObj.questions.length === 0) {
            const fallbackCount = (testObj as any)?.questionCount || 20;
            const hydrated = hydrateQuestionsForTest(testObj || { id: testId, title: 'Curriculum Assessment' }, fallbackCount);
            testObj = {
              ...(testObj || {}),
              id: testId,
              title: testObj?.title || 'Curriculum Mock Test',
              topic: testObj?.topic || target.title || 'Curriculum Assessment',
              difficulty: (testObj?.difficulty as any) || 'medium',
              questions: hydrated,
              questionCount: hydrated.length,
            };
          }
          publishTestToBatchCatalog(target.batchId, testObj).catch(() => {});
          const dur = testObj ? getTestDurationMinutes(testObj) : 25;
          const card: BatchTestCard = {
            id: testId,
            testId: testId,
            batchId: target.batchId,
            chapterId: chapterId,
            folderId: chapterId,
            title: testObj?.title || 'Curriculum Mock Test',
            topic: testObj?.topic || target.title || 'Curriculum Assessment',
            timeLimitMinutes: dur,
            time: dur,
            durationMinutes: dur,
            questionCount: testObj?.questions?.length || (testObj as any)?.questionCount || 20,
            difficulty: (testObj?.difficulty as any) || 'medium',
            passingScorePercentage: testObj?.passingScorePercentage || 40,
            catalogChunkId: 'chunk_1',
            chunkEstimatedBytes: 85 * 1024,
            publishedAt: new Date().toISOString(),
          };
          syncBatchTestToFirestore(target.batchId, {
            ...card,
            questions: testObj.questions || [],
          }).catch(() => {});
          setBatchTests((btPrev) => {
            const filtered = btPrev.filter((b) => (b.testId || b.id) !== testId || b.batchId !== target.batchId);
            const updatedBt = [card, ...filtered];
            try {
              secureStorage.setItem(STORAGE_KEYS.BATCH_TESTS, JSON.stringify(updatedBt));
            } catch {}
            return updatedBt;
          });
        } else {
          // Unlink & delete test from batch and cloud
          setBatchTests((btPrev) => {
            const updatedBt = btPrev.filter((b) => (b.testId || b.id) !== testId || b.batchId !== target.batchId);
            try {
              secureStorage.setItem(STORAGE_KEYS.BATCH_TESTS, JSON.stringify(updatedBt));
            } catch {}
            return updatedBt;
          });
          deleteBatchTestFromFirestore(target.batchId, testId).catch(() => {});
        }
        touchBatchCatalogBeacon().catch(() => {});
      }
      return next;
    });
  }, []);

  const getBreadcrumbs = useCallback((chapterId: string | null, batchId: string) => {
    const crumbs: Array<{ id: string | null; title: string }> = [
      { id: null, title: 'All Folders' }
    ];
    if (!chapterId) return crumbs;

    const path: Array<{ id: string; title: string }> = [];
    let currentId: string | null = chapterId;
    const visited = new Set<string>();

    while (currentId && !visited.has(currentId)) {
      visited.add(currentId);
      const node = chapters.find((c) => c.id === currentId && c.batchId === batchId);
      if (!node) break;
      path.unshift({ id: node.id, title: node.title });
      currentId = node.parentId || null;
    }

    return [...crumbs, ...path];
  }, [chapters]);

  const getSubfolders = useCallback((batchId: string, parentId: string | null = null) => {
    return chapters.filter((c) => {
      if (c.batchId !== batchId) return false;
      if (!parentId) {
        return !c.parentId; // null or undefined means root
      }
      return c.parentId === parentId;
    }).sort((a, b) => (a.order || 0) - (b.order || 0));
  }, [chapters]);

  const addLecture = useCallback((lectureData: Omit<Lecture, 'id' | 'createdAt'>) => {
    const nowIso = new Date().toISOString();
    const newLecture: Lecture = {
      ...lectureData,
      id: `lec_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      createdAt: nowIso,
      updatedAt: nowIso,
    };
    setLectures((prev) => [...prev, newLecture]);
    syncLectureToFirestore(newLecture.batchId, newLecture).catch(() => {});
    return newLecture;
  }, []);

  const updateLecture = useCallback((id: string, updated: Partial<Lecture>) => {
    const nowIso = new Date().toISOString();
    setLectures((prev) => {
      const next = prev.map((l) => (l.id === id ? { ...l, ...updated, updatedAt: nowIso } : l));
      const target = next.find((l) => l.id === id);
      if (target) {
        syncLectureToFirestore(target.batchId, target).catch(() => {});
      }
      return next;
    });
  }, []);

  const deleteLecture = useCallback((id: string) => {
    setLectures((prev) => {
      const target = prev.find((l) => l.id === id);
      if (target?.batchId) {
        deleteLectureFromFirestore(target.batchId, id).catch(() => {});
      }
      const next = prev.filter((l) => l.id !== id);
      try {
        secureStorage.setItem(STORAGE_KEYS.LECTURES, JSON.stringify(next));
      } catch {}
      return next;
    });
    window.dispatchEvent(new CustomEvent('lecture-deleted', { detail: { id } }));
  }, []);

  const curriculumDebounceTimers = useRef<Map<string, NodeJS.Timeout>>(new Map());
  const activeCurriculumPromises = useRef<Map<string, Promise<void>>>(new Map());

  const loadCurriculumForBatch = useCallback(async (batchId: string, forceRefresh = false) => {
    if (!batchId) return;

    // Reuse in-flight promise if a request is already executing for this batchId
    if (!forceRefresh) {
      const inFlight = activeCurriculumPromises.current.get(batchId);
      if (inFlight) return inFlight;
    }

    const executeLoad = async () => {
      try {
        const { chapters: cloudChaps, lectures: cloudLecs } = await fetchBatchCurriculumFromFirestore(batchId);

        // 1. Authoritative Chapter Reconciliation:
        // Replace chapters for batchId with cloud chapters (purging deleted ones)
        setChapters((prev) => {
          if (cloudChaps.length > 0) {
            const otherBatchChaps = prev.filter((c) => c.batchId !== batchId);
            const next = [...otherBatchChaps, ...cloudChaps];
            try {
              secureStorage.setItem(STORAGE_KEYS.CHAPTERS, JSON.stringify(next));
            } catch {}
            return next;
          }
          return prev;
        });

        // 2. Authoritative Lecture Reconciliation:
        // Cloud is the single source of truth for batchId.
        // Replace batchId lectures with cloudLecs (purging deleted ones completely!)
        setLectures((prev) => {
          const otherBatchLecs = prev.filter((l) => l.batchId !== batchId);
          const next = [...otherBatchLecs, ...cloudLecs];
          try {
            secureStorage.setItem(STORAGE_KEYS.LECTURES, JSON.stringify(next));
          } catch {}
          return next;
        });

        // 3. Batch Tests Authoritative Reconciliation
        fetchBatchTestsFromFirestore(batchId).then((cloudTests) => {
          setBatchTests((prev) => {
            const otherBatchTests = prev.filter((t) => t.batchId !== batchId && !isDeprecatedTest(t));
            const cleanCloud = (cloudTests || []).filter((t: any) => !isDeprecatedTest(t));
            const next = [...otherBatchTests, ...cleanCloud];
            try {
              secureStorage.setItem(STORAGE_KEYS.BATCH_TESTS, JSON.stringify(next));
            } catch {}
            return next;
          });
        }).catch(() => {});

        if (cloudChaps.length === 0) {
          // If batch has no curriculum in cloud yet, supply foundational starter module
          setChapters((prev) => {
            const targetBatch = prev.find((c) => c.batchId === batchId);
            if (targetBatch) return prev; // already has local chapters
            const starterChapId = `chap_${batchId}_01`;
            const starterChap: Chapter = {
              id: starterChapId,
              batchId,
              subjectId: 'sub_math_01',
              title: 'Chapter 01: Concept Mastery & Foundation',
              description: `Core curriculum module with video lessons and study materials.`,
              order: 1,
            };
            syncChapterToFirestore(batchId, starterChap).catch(() => {});
            return [...prev, starterChap];
          });
        }
      } catch (err) {
        console.warn(`Curriculum load error for batch ${batchId}:`, err);
      } finally {
        activeCurriculumPromises.current.delete(batchId);
      }
    };

    // Debounce rapid successive calls (e.g. 3 simultaneous onSnapshot listeners)
    return new Promise<void>((resolve) => {
      const existingTimer = curriculumDebounceTimers.current.get(batchId);
      if (existingTimer) {
        clearTimeout(existingTimer);
      }

      const timer = setTimeout(() => {
        curriculumDebounceTimers.current.delete(batchId);
        const p = executeLoad();
        activeCurriculumPromises.current.set(batchId, p);
        p.then(resolve).catch(() => resolve());
      }, 150);

      curriculumDebounceTimers.current.set(batchId, timer);
    });
  }, []);

  const updateWatchProgress = (lectureId: string, currentSeconds: number, totalSeconds: number) => {
    const isCompleted = totalSeconds > 0 && currentSeconds >= totalSeconds * 0.9;
    setWatchProgress((prev) => {
      const wasCompleted = prev[lectureId]?.isCompleted || false;
      const nextCompleted = wasCompleted || isCompleted;

      // Milestone Completion Sync: If newly completed, record lightweight completion status in Firestore (1 write per completed video, 0 during streaming)
      if (!wasCompleted && nextCompleted) {
        const studentUid = auth.currentUser?.uid || (user?.id && user.id !== 'guest' ? user.id : null);
        if (studentUid) {
          const payload = {
            lectureId,
            batchId: activeBatchId || undefined,
            isCompleted: true,
            watchedSeconds: Math.round(currentSeconds),
            totalSeconds: Math.round(totalSeconds),
            completedAt: new Date().toISOString(),
          };

          const progressDocRef = doc(db, 'users', studentUid, 'lecture_progress', lectureId);
          setDoc(progressDocRef, sanitizeForFirestore(payload), { merge: true }).catch(() => {});

          // Zero-Waste Compact Document Summary (Enables 1 single read for Admin Master Console)
          const summaryDocRef = doc(db, 'user_progress', studentUid);
          setDoc(summaryDocRef, sanitizeForFirestore({
            [`lectures.${lectureId}`]: payload,
            'stats.lastActiveAt': Date.now()
          }), { merge: true }).catch(() => {});
        }
      }

      return {
        ...prev,
        [lectureId]: {
          lectureId,
          watchedSeconds: currentSeconds,
          totalSeconds,
          isCompleted: nextCompleted,
          lastWatchedAt: new Date().toISOString(),
        },
      };
    });

    if (totalSeconds > 0) {
      const roundedMins = Math.max(1, Math.round(totalSeconds / 60));
      const exactSeconds = Math.round(totalSeconds);
      setLectures((prev) =>
        prev.map((l) => {
          if (l.id === lectureId && (l.durationSeconds !== exactSeconds || l.durationMinutes !== roundedMins)) {
            const updated = { ...l, durationSeconds: exactSeconds, durationMinutes: roundedMins };
            syncLectureToFirestore(l.batchId, updated).catch(() => {});
            return updated;
          }
          return l;
        })
      );
    }
  };

  const addAnnouncement = (annData: Omit<Announcement, 'id'>) => {
    const rawAnn: Announcement = {
      ...annData,
      id: `ann_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      createdAt: Date.now(),
      date: annData.date || new Date().toISOString(),
    };
    const newAnn: Announcement = sanitizeForFirestore(rawAnn);
    setAnnouncements((prev) => {
      // Prepend new announcement and preserve all previous announcements cleanly
      const map = new Map<string, Announcement>();
      map.set(newAnn.id, newAnn);
      prev.forEach((a) => {
        if (a.id && !map.has(a.id)) {
          map.set(a.id, a);
        }
      });
      const next = Array.from(map.values()).sort(
        (a, b) => (b.createdAt || 0) - (a.createdAt || 0)
      );
      try {
        secureStorage.setItem(STORAGE_KEYS.ANNOUNCEMENTS, JSON.stringify(next));
      } catch {}
      setDoc(
        doc(db, 'master_catalog', 'lms_announcements'),
        sanitizeForFirestore({ list: next, updatedAt: new Date().toISOString() }),
        { merge: true }
      ).catch((err) => {
        console.warn('Failed to sync announcement to Firestore:', err);
      });
      return next;
    });
    showSecurityToast('Broadcast post published');
  };

  const updateAnnouncement = useCallback((id: string, updated: Partial<Announcement>) => {
    setAnnouncements((prev) => {
      const next = prev.map((a) => (a.id === id ? sanitizeForFirestore({ ...a, ...updated }) : a));
      try {
        secureStorage.setItem(STORAGE_KEYS.ANNOUNCEMENTS, JSON.stringify(next));
      } catch {}
      setDoc(
        doc(db, 'master_catalog', 'lms_announcements'),
        sanitizeForFirestore({ list: next, updatedAt: new Date().toISOString() }),
        { merge: true }
      ).catch((err) => {
        console.warn('Failed to sync updated announcement to Firestore:', err);
      });
      return next;
    });
    showSecurityToast('Broadcast post updated');
  }, []);

  const deleteAnnouncement = useCallback((id: string) => {
    if (!id) return;
    const cleanId = String(id).trim();
    addLocalDeletedAnnouncementId(cleanId);

    // Dismiss any corresponding notification on this device immediately
    try {
      dismissNotificationId(`notif-ann-${cleanId}`);
      window.dispatchEvent(
        new CustomEvent('elevate-inapp-notification-dismiss', { detail: { id: `notif-ann-${cleanId}` } })
      );
      window.dispatchEvent(new CustomEvent(NOTIFICATIONS_EVENT));
    } catch {}

    setAnnouncements((prev) => {
      const next = prev.filter((a) => a.id !== cleanId);
      try {
        secureStorage.setItem(STORAGE_KEYS.ANNOUNCEMENTS, JSON.stringify(next));
      } catch {}

      // Write authoritative updated list and append deleted ID to Firestore
      const allDeletedList = Array.from(getLocalDeletedAnnouncementIds());
      const payload = {
        list: sanitizeForFirestore(next),
        deletedIds: arrayUnion(cleanId), // real FieldValue
        deletedIdsList: allDeletedList, // plain array fallback for direct queries
        updatedAt: new Date().toISOString(),
      };

      setDoc(doc(db, 'master_catalog', 'lms_announcements'), payload, { merge: true })
        .then(() => {
          console.log(`[LMS] Broadcast post ${cleanId} successfully deleted across all student clients.`);
        })
        .catch((err) => {
          console.warn('Failed to sync deleted announcement to Firestore:', err);
        });

      return next;
    });
    showSecurityToast('Broadcast post removed');
  }, []);

  const addPersonalNote = (noteData: Omit<PersonalNote, 'id' | 'createdAt'>) => {
    const newNote: PersonalNote = {
      ...noteData,
      id: `note_${Date.now()}`,
      createdAt: 'Just now',
    };
    setPersonalNotes((prev) => [newNote, ...prev]);
  };

  const deletePersonalNote = (id: string) => {
    setPersonalNotes((prev) => prev.filter((n) => n.id !== id));
  };

  // Global Guest Access Configuration (persisted across sessions)
  const [globalGuestAccessMode, setGlobalGuestAccessModeState] = useState<'specific_batches' | 'all_batches' | 'none'>(() => {
    try {
      const saved = localStorage.getItem('ELEVATE_GUEST_ACCESS_MODE');
      if (saved === 'all_batches' || saved === 'none' || saved === 'specific_batches') {
        return saved;
      }
    } catch {}
    return 'specific_batches';
  });

  const setGlobalGuestAccessMode = async (mode: 'specific_batches' | 'all_batches' | 'none') => {
    setGlobalGuestAccessModeState(mode);
    try {
      localStorage.setItem('ELEVATE_GUEST_ACCESS_MODE', mode);
      localStorage.setItem(STORAGE_KEYS.GUEST_ACCESS_MODE, mode);
    } catch {}
    showSecurityToast(
      mode === 'all_batches'
        ? 'Universal Guest Access: All active batches are now open for free guest enrollment.'
        : mode === 'specific_batches'
        ? 'Selective Guest Access: Guests can enroll only in specific batches designated by Master Admin.'
        : 'Strict Roster Mode: Guest enrollment disabled. All batches require Master Admin admission.'
    );
    try {
      const policyRef = doc(db, 'master_catalog', 'lms_guest_policy');
      await setDoc(policyRef, { globalGuestAccessMode: mode, updatedAt: new Date().toISOString() }, { merge: true });
    } catch (policyErr) {
      console.warn('Failed to sync global guest mode to Firestore:', policyErr);
    }
  };

  const isGuestAllowedForBatch = (batchId: string): boolean => {
    const b = batches.find((x) => x.id === batchId);
    if (!b) return false;

    // Rule 1: DRAFT LOCK - Unpublished (Draft) batches can NEVER be accessed by guests!
    if (b.isPublished === false) return false;

    // Rule 2: SECRET ROSTER LOCK - Stealth/Private batches can NEVER be accessed by guests!
    if (b.isPrivateRosterOnly === true) return false;

    // Rule 3: Batch-Specific Guest Pass - If batch has allowGuestAccess === true, guests ALWAYS have access!
    if (b.allowGuestAccess === true) return true;

    // Rule 4: Explicit restriction - If batch specifically sets allowGuestAccess === false, guests are locked out
    if (b.allowGuestAccess === false) return false;

    // Rule 5: Fallback to global policy only if individual batch setting is unspecified
    if (globalGuestAccessMode === 'all_batches') return true;
    return false;
  };

  const toggleBatchGuestAccess = async (batchId: string) => {
    const targetBatch = batches.find((b) => b.id === batchId);
    if (!targetBatch) return;
    const nextState = !targetBatch.allowGuestAccess;
    const nowIso = new Date().toISOString();
    const updated = { ...targetBatch, allowGuestAccess: nextState, updatedAt: nowIso };
    setBatches((prev) => {
      const next = prev.map((b) => (b.id === batchId ? updated : b));
      try {
        secureStorage.setItem(STORAGE_KEYS.BATCHES, JSON.stringify(next));
        secureStorage.setItem('elevatelabs_cloud_batches_cache', JSON.stringify(next));
        if (typeof window !== 'undefined' && window.localStorage) {
          window.localStorage.setItem('math_mock_batches_cache', JSON.stringify(next));
          window.localStorage.setItem('math_mock_batches_cache_time', String(Date.now()));
        }
      } catch {}
      return next;
    });
    showSecurityToast(
      nextState
        ? `Guest access enabled for "${targetBatch.title}". Open to all visitors.`
        : `Guest access restricted for "${targetBatch.title}". Roster admission required.`
    );
    try {
      const batchRef = doc(db, 'batches', batchId);
      await setDoc(batchRef, { allowGuestAccess: nextState, updatedAt: nowIso }, { merge: true });
      touchBatchCatalogBeacon().catch(() => {});
      window.dispatchEvent(new CustomEvent('batch-catalog-updated', { detail: { batchId, updated: { allowGuestAccess: nextState } } }));
    } catch {
      await syncBatchToFirestore(updated).catch(() => {});
    }
  };

  const toggleBatchPrivateRosterOnly = async (batchId: string) => {
    const targetBatch = batches.find((b) => b.id === batchId);
    if (!targetBatch) return;
    const nextState = !targetBatch.isPrivateRosterOnly;
    const nowIso = new Date().toISOString();
    const updated = { ...targetBatch, isPrivateRosterOnly: nextState, updatedAt: nowIso };
    setBatches((prev) => {
      const next = prev.map((b) => (b.id === batchId ? updated : b));
      try {
        secureStorage.setItem(STORAGE_KEYS.BATCHES, JSON.stringify(next));
        secureStorage.setItem('elevatelabs_cloud_batches_cache', JSON.stringify(next));
        if (typeof window !== 'undefined' && window.localStorage) {
          window.localStorage.setItem('math_mock_batches_cache', JSON.stringify(next));
          window.localStorage.setItem('math_mock_batches_cache_time', String(Date.now()));
        }
      } catch {}
      return next;
    });
    showSecurityToast(
      nextState
        ? `"${targetBatch.title}" is now Secret Roster-Exclusive. Completely hidden from catalog and guests.`
        : `"${targetBatch.title}" is now catalog visible according to publish settings.`
    );
    try {
      const batchRef = doc(db, 'batches', batchId);
      await setDoc(batchRef, { isPrivateRosterOnly: nextState, updatedAt: nowIso }, { merge: true });
      touchBatchCatalogBeacon().catch(() => {});
      window.dispatchEvent(new CustomEvent('batch-catalog-updated', { detail: { batchId, updated: { isPrivateRosterOnly: nextState } } }));
    } catch {
      await syncBatchToFirestore(updated).catch(() => {});
    }
  };

  // 4. Multi-Factor Batch Enrollment Check (Supports Master Admin, Enrolled Students, and Active Guest Sessions)
  const isEnrolled = (batchId: string): boolean => {
    // 1. Authenticated Master Admin or Faculty always has preview and authoring rights
    if (isMasterUser(auth.currentUser) || user.role === 'admin' || (user as any)?.role === 'teacher') return true;

    // 2. Check if student is explicitly enrolled in the roster (by email, phone, uid, or user profile state)
    // CRITICAL FIX: An officially enrolled student ALWAYS has full access to their enrolled course,
    // EVEN IF the batch is in Draft mode (isPublished === false) or Secret mode (isPrivateRosterOnly === true)!
    const isRosterEnrolled = ((): boolean => {
      // 2a. User profile state has active enrolled batch ID
      if (Array.isArray(user.enrolledBatchIds) && user.enrolledBatchIds.includes(batchId)) return true;

      // 2b. Authenticated students checked against Firestore enrollments roster
      if (!auth.currentUser) return false;
      const uEmail = (auth.currentUser.email || '').toLowerCase().trim();
      const uPhone = (auth.currentUser.phoneNumber || '').trim();
      const uUid = auth.currentUser.uid;

      return enrollments.some(
        (e) =>
          e.batchId === batchId &&
          e.status === 'active' &&
          ((uEmail && e.studentEmail && e.studentEmail.toLowerCase().trim() === uEmail) ||
            (uPhone && e.studentPhone && e.studentPhone.trim() === uPhone) ||
            (uUid && e.userId === uUid))
      );
    })();

    if (isRosterEnrolled) return true;

    const b = batches.find((x) => x.id === batchId);
    // DRAFT LOCK & SECRET ROSTER LOCK: Non-enrolled users and guests can NEVER access Draft or Secret Private batches!
    if (b && (b.isPublished === false || b.isPrivateRosterOnly === true)) return false;

    // 3. Batches open to guests: If this public batch allows guest access (or global policy allows all), it is open to all visitor & guest accounts!
    if (isGuestAllowedForBatch(batchId)) return true;

    return false;
  };

  const enrollAsGuest = (batchId: string) => {
    const targetBatch = batches.find((b) => b.id === batchId);
    if (!targetBatch) return { success: false, message: 'Batch not found' };

    if (targetBatch.isPublished === false || targetBatch.isPrivateRosterOnly === true) {
      showSecurityToast(`Access Denied: "${targetBatch.title}" is private. Official student roster enrollment is required.`);
      return { success: false, message: 'Batch requires Master Console roster admission.' };
    }

    if (!isGuestAllowedForBatch(batchId)) {
      showSecurityToast(`Access Denied: "${targetBatch.title}" requires official student roster enrollment.`);
      return { success: false, message: 'Batch requires Master Console roster admission.' };
    }

    const updatedBatchIds = Array.from(new Set([...(user.enrolledBatchIds || []), batchId]));
    const updatedUser: User = {
      ...user,
      enrolledBatchIds: updatedBatchIds,
    };
    setUser(updatedUser);
    try {
      secureStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(updatedUser));
    } catch {}

    const guestId = user.id || `guest_${Date.now()}`;
    const guestEnrollment: BatchEnrollment = {
      id: `enr_guest_${batchId}_${guestId}`,
      batchId,
      userId: guestId,
      studentName: user.name && user.name !== 'Master Admin' ? user.name : 'Guest Student',
      studentEmail: user.email || 'guest@elevate.internal',
      enrolledAt: new Date().toISOString().split('T')[0],
      expiresAt: new Date(Date.now() + (targetBatch.validityDays || 365) * 86400000).toISOString().split('T')[0],
      status: 'active',
    };

    setEnrollments((prev) => {
      const exists = prev.some((e) => e.batchId === batchId && e.userId === guestEnrollment.userId);
      return exists ? prev : [...prev, guestEnrollment];
    });

    showSecurityToast(`🎉 Free Guest Access Activated for "${targetBatch.title}"!`);

    fetchBatchTestsFromFirestore(batchId).then((tests) => {
      if (Array.isArray(tests) && tests.length > 0) {
        setBatchTests((prev) => {
          const others = prev.filter((t) => t.batchId !== batchId && !isDeprecatedTest(t));
          const clean = tests.filter((t) => !isDeprecatedTest(t));
          const next = [...others, ...clean];
          try {
            secureStorage.setItem(STORAGE_KEYS.BATCH_TESTS, JSON.stringify(next));
          } catch {}
          return next;
        });
      }
      window.dispatchEvent(new CustomEvent('batch-tests-updated', { detail: { batchId } }));
    }).catch(() => {
      window.dispatchEvent(new CustomEvent('batch-tests-updated', { detail: { batchId } }));
    });

    return { success: true, message: `Successfully enrolled in ${targetBatch.title} as guest.` };
  };

  const enrollInBatch = (batchId: string) => {
    if (isGuestAllowedForBatch(batchId)) {
      enrollAsGuest(batchId);
    } else {
      showSecurityToast('Direct self-enrollment is locked. Access is strictly managed by Master Console on the official batch roster.');
    }
  };

  // 5. Cloud Firestore Backed Student Enrollment
  const enrollStudentByContact = ({
    contact,
    batchId,
    name,
    validityDays = 365,
  }: {
    contact: string;
    batchId: string;
    name?: string;
    validityDays?: number;
  }) => {
    const cleanedContact = contact.trim().toLowerCase();
    const isEmail = cleanedContact.includes('@');
    const isPhone = !isEmail && /^\+?[\d\s-]{7,15}$/.test(cleanedContact);

    if (!isEmail && !isPhone) {
      return { success: false, message: 'Please enter a valid email or phone number.' };
    }

    const targetBatch = batches.find((b) => b.id === batchId);
    const batchTitle = targetBatch?.title || 'Batch';

    // 1. Immediate Local State & Student Directory Update
    let student = students.find((s: any) =>
      isEmail ? s.email?.toLowerCase() === cleanedContact : s.phone === cleanedContact
    );

    if (!student) {
      student = {
        id: `usr_${cleanKeyForFirestore(cleanedContact)}`,
        name: name?.trim() || (isEmail ? cleanedContact.split('@')[0] : `Student ${cleanedContact.slice(-4)}`),
        email: isEmail ? cleanedContact : undefined,
        phone: isPhone ? cleanedContact : undefined,
      };
      setStudents((prev: any) => [...prev, student]);
    }

    const expiresAt = new Date(Date.now() + validityDays * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const newEnrollment: BatchEnrollment = {
      id: `${batchId}__${cleanKeyForFirestore(cleanedContact)}`,
      batchId,
      userId: student.id,
      studentName: student.name,
      studentEmail: student.email,
      studentPhone: student.phone,
      enrolledAt: new Date().toISOString().split('T')[0],
      expiresAt,
      status: 'active',
    };

    setEnrollments((prev) => [...prev.filter((e) => e.id !== newEnrollment.id), newEnrollment]);

    setBatches((prev) =>
      prev.map((b) =>
        b.id === batchId ? { ...b, enrolledStudentsCount: (b.enrolledStudentsCount || 0) + 1 } : b
      )
    );

    // 2. Call Cloud Firestore Enrollment Engine (Persists across all devices)
    enrollStudentInFirestore({
      batchId,
      batchTitle,
      contact: cleanedContact,
      name: student.name,
      validityDays,
    }).then((res) => {
      if (res.success) {
        setEnrollments((prev) => {
          const map = new Map(prev.map((e) => [e.id, e]));
          map.set(res.enrollment.id, res.enrollment);
          return Array.from(map.values());
        });
        showSecurityToast(`🎉 Synced ${student.name} to Cloud Firestore.`);
      } else {
        console.warn('Cloud enrollment error:', res.error);
        showSecurityToast(`Warning: Cloud sync error (${res.error || 'Firestore write error'}).`);
      }
    }).catch((err) => {
      console.warn('Cloud enrollment exception:', err);
      showSecurityToast(`Warning: Failed to reach cloud Firestore.`);
    });

    // 3. If currently signed in user matches, grant immediate access without waiting
    if (
      (user.email && isEmail && user.email.toLowerCase() === cleanedContact) ||
      (user.phone && isPhone && user.phone === cleanedContact) ||
      user.id === student.id
    ) {
      setUser((prev) => ({
        ...prev,
        enrolledBatchIds: Array.from(new Set([...(prev.enrolledBatchIds || []), batchId])),
      }));
    }

    return {
      success: true,
      message: `Enrolled ${student.name} successfully into ${batchTitle}! (Valid until ${expiresAt})`,
    };
  };

  const revokeStudentEnrollment = async (userIdOrContact: string, batchId: string) => {
    const cleaned = (userIdOrContact || '').trim().toLowerCase();
    const targetEnr = enrollments.find(
      (e) =>
        e.batchId === batchId &&
        (e.userId === userIdOrContact ||
          e.id === userIdOrContact ||
          (e.studentEmail && e.studentEmail.toLowerCase().trim() === cleaned) ||
          (e.studentPhone && e.studentPhone.trim() === userIdOrContact.trim()))
    );

    const contact = targetEnr?.studentEmail || targetEnr?.studentPhone || userIdOrContact;

    // Purge completely from local enrollments state
    setEnrollments((prev) =>
      prev.filter(
        (e) =>
          !(
            e.batchId === batchId &&
            (e.userId === userIdOrContact ||
              e.id === userIdOrContact ||
              (e.studentEmail && e.studentEmail.toLowerCase().trim() === contact.toLowerCase().trim()) ||
              (e.studentPhone && e.studentPhone.trim() === contact.trim()))
          )
      )
    );

    // Decrement batch count in local state
    setBatches((prev) =>
      prev.map((b) => {
        if (b.id === batchId) {
          const currentCount = b.enrolledStudentsCount || 1;
          return { ...b, enrolledStudentsCount: Math.max(0, currentCount - 1) };
        }
        return b;
      })
    );

    // If current user is the revoked student, remove batch from their profile
    if (
      user.id === userIdOrContact ||
      (user.email && user.email.toLowerCase().trim() === contact.toLowerCase().trim()) ||
      (user.phone && user.phone.trim() === contact.trim())
    ) {
      setUser((prev) => ({
        ...prev,
        enrolledBatchIds: (prev.enrolledBatchIds || []).filter((id) => id !== batchId),
      }));
    }

    // Cloud Firestore Revocation
    if (contact) {
      await revokeStudentInFirestore(batchId, contact).catch((err) =>
        console.warn('Failed to revoke in Firestore:', err)
      );
    }
  };

  const getEnrollmentsForBatch = (batchId: string) => {
    return enrollments.filter((e) => e.batchId === batchId && e.status === 'active');
  };

  const loadRosterForBatch = useCallback(async (batchId: string) => {
    if (!batchId) return;
    try {
      const cloudList = await fetchBatchEnrollmentsFromFirestore(batchId);
      const reportedCount = (cloudList as any)?.totalReported || cloudList.length;
      // Synchronize batch roster with cloud state
      setEnrollments((prev) => {
        const others = prev.filter((e) => e.batchId !== batchId);
        return [...others, ...cloudList];
      });
      setBatches((prev) =>
        prev.map((b) =>
          b.id === batchId ? { ...b, enrolledStudentsCount: Math.max(b.enrolledStudentsCount || 0, reportedCount) } : b
        )
      );
    } catch (err) {
      console.warn(`Roster load error for batch ${batchId}:`, err);
    }
  }, []);

  const searchStudents = (queryStr: string) => {
    if (!queryStr.trim()) return students;
    const q = queryStr.toLowerCase().trim();
    return students.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        (s.email && s.email.toLowerCase().includes(q)) ||
        (s.phone && s.phone.includes(q))
    );
  };

  const addTestToBatchCatalog = ({
    testId,
    batchId,
    chapterId,
    title,
    topic,
    difficulty,
    timeLimitMinutes,
    questionCount,
    passingScorePercentage = 40,
    questions,
  }: {
    testId?: string;
    batchId: string;
    chapterId?: string | null;
    title: string;
    topic: string;
    difficulty: 'easy' | 'medium' | 'hard' | 'adaptive';
    timeLimitMinutes: number;
    questionCount: number;
    passingScorePercentage?: number;
    questions?: any[];
  }) => {
    const cleanTestId = testId?.trim() || `btest_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
    const chunkId = `chunk_${Math.floor(batchTests.filter((t) => t.batchId === batchId).length / 6) + 1}`;
    const dur = Number(timeLimitMinutes) || 60;
    const cleanTitle = title.trim();

    // Resolve chapter: if explicit chapterId not passed, attach to the first/primary chapter in this batch
    const targetChapter = chapterId
      ? chapters.find((c) => c.id === chapterId && c.batchId === batchId)
      : chapters.find((c) => c.batchId === batchId);
    const resolvedChapterId = targetChapter?.id || chapterId || null;

    // Resolve or synthesize questions so test paper is never empty
    const resolvedQuestions = (questions && Array.isArray(questions) && questions.length > 0)
      ? questions
      : hydrateQuestionsForTest(
          { id: cleanTestId, title: cleanTitle, topic: topic.trim(), difficulty: difficulty as any, questionCount: Number(questionCount) || 20 },
          Number(questionCount) || 20
        );

    const fullTestPaper: any = {
      id: cleanTestId,
      testId: cleanTestId,
      batchId,
      chapterId: resolvedChapterId,
      folderId: resolvedChapterId,
      title: cleanTitle,
      topic: topic.trim(),
      difficulty,
      timeLimitMinutes: dur,
      time: dur,
      durationMinutes: dur,
      questionCount: resolvedQuestions.length,
      questions: resolvedQuestions,
      passingScorePercentage: Number(passingScorePercentage) || 40,
      catalogChunkId: chunkId,
      chunkId,
      chunkEstimatedBytes: 85 * 1024,
      isPublic: true,
      publishedAt: new Date().toISOString(),
    };

    const newTestCard: BatchTestCard = {
      testId: cleanTestId,
      id: cleanTestId,
      batchId,
      chapterId: resolvedChapterId,
      folderId: resolvedChapterId,
      title: cleanTitle,
      topic: topic.trim(),
      difficulty,
      timeLimitMinutes: dur,
      time: dur,
      durationMinutes: dur,
      questionCount: resolvedQuestions.length,
      passingScorePercentage: Number(passingScorePercentage) || 40,
      catalogChunkId: chunkId,
      chunkEstimatedBytes: 85 * 1024,
      publishedAt: new Date().toISOString(),
    };

    setBatchTests((prev) => {
      // Deduplicate: replace any test in this batch with matching cleanTestId OR exact same title
      const filtered = prev.filter(
        (t) =>
          t.batchId !== batchId ||
          (t.testId !== cleanTestId &&
            (t as any).id !== cleanTestId &&
            t.title.trim().toLowerCase() !== cleanTitle.toLowerCase())
      );
      const next = [newTestCard, ...filtered];
      try {
        secureStorage.setItem(STORAGE_KEYS.BATCH_TESTS, JSON.stringify(next));
        localStorage.setItem(`batch_${batchId}_test_${cleanTestId}`, JSON.stringify(fullTestPaper));
      } catch {}
      return next;
    });

    // Also update chapter so that its testIds array includes cleanTestId
    if (resolvedChapterId) {
      setChapters((prev) => {
        const next = prev.map((c) => {
          if (c.id !== resolvedChapterId) return c;
          const currentTests = c.testIds || [];
          if (currentTests.includes(cleanTestId)) return c;
          const updated = {
            ...c,
            testIds: [...currentTests, cleanTestId],
            updatedAt: new Date().toISOString(),
          };
          syncChapterToFirestore(batchId, updated).catch(() => {});
          return updated;
        });
        try {
          secureStorage.setItem(STORAGE_KEYS.CHAPTERS, JSON.stringify(next));
        } catch {}
        return next;
      });
    }

    publishTestToBatchCatalog(batchId, fullTestPaper).catch(() => {});
    syncBatchTestToFirestore(batchId, fullTestPaper).catch(() => {});
    window.dispatchEvent(new CustomEvent('batch-tests-updated', { detail: { batchId, testId: cleanTestId } }));
    return {
      success: true,
      message: `Published "${newTestCard.title}" into batch catalog chunk ${chunkId} (Estimated 85 KB bin-packed).`,
    };
  };

  const deleteBatchTest = useCallback((batchId: string, testId: string, testTitle?: string) => {
    const matchingDeletedIds = new Set<string>();
    if (testId) matchingDeletedIds.add(testId);

    setBatchTests((prev) => {
      const next = prev.filter((t) => {
        const matchesBatch = !batchId || t.batchId === batchId;
        if (!matchesBatch) return true;
        const matchesId = (t.testId || t.id) === testId || (t as any).originalTestId === testId;
        const matchesTitle = testTitle && t.title && t.title.trim().toLowerCase() === testTitle.trim().toLowerCase();
        if (matchesId || matchesTitle) {
          if (t.testId) matchingDeletedIds.add(t.testId);
          if (t.id) matchingDeletedIds.add(t.id);
          return false;
        }
        return true;
      });
      try {
        secureStorage.setItem(STORAGE_KEYS.BATCH_TESTS, JSON.stringify(next));
      } catch {}
      return next;
    });

    setChapters((prev) => {
      const next = prev.map((c) => {
        const matchesBatch = !batchId || c.batchId === batchId;
        if (!matchesBatch || !c.testIds) return c;
        const hasAnyMatching = c.testIds.some((tid) => matchingDeletedIds.has(tid) || tid === testId);
        if (!hasAnyMatching) return c;
        const updated = {
          ...c,
          testIds: c.testIds.filter((tid) => !matchingDeletedIds.has(tid) && tid !== testId),
          updatedAt: new Date().toISOString(),
        };
        syncChapterToFirestore(c.batchId, updated).catch(() => {});
        return updated;
      });
      try {
        secureStorage.setItem(STORAGE_KEYS.CHAPTERS, JSON.stringify(next));
      } catch {}
      return next;
    });

    const deletedIdsArray = Array.from(matchingDeletedIds);
    deleteBatchTestFromFirestore(batchId, testId, testTitle, deletedIdsArray).catch(() => {});
    window.dispatchEvent(new CustomEvent('batch-tests-updated', { detail: { batchId, testId } }));
  }, []);

  const getTestsForBatch = (batchId: string) => {
    return batchTests.filter((t) => t.batchId === batchId && !isDeprecatedTest(t));
  };

  const refreshCloudContent = useCallback(async () => {
    try {
      const cloudBatches = await fetchBatchesFromFirestore({ forceRefresh: true });
      if (cloudBatches && cloudBatches.length > 0) {
        setBatches(cloudBatches);
      }
      if (activeBatchId) {
        await loadCurriculumForBatch(activeBatchId, true).catch(() => {});
      }
    } catch (err) {
      console.warn('Pull-to-refresh cloud content error:', err);
    }
  }, [activeBatchId, loadCurriculumForBatch]);

  return (
    <AppContext.Provider
      value={{
        user,
        setUser,
        toggleRole,
        theme,
        toggleTheme,
        batches,
        addBatch,
        updateBatch,
        deleteBatch,
        subjects,
        addSubject,
        chapters,
        addChapter,
        updateChapter,
        deleteChapter,
        addFolder,
        addPdfNoteToChapter,
        deletePdfNoteFromChapter,
        toggleTestInChapter,
        getBreadcrumbs,
        getSubfolders,
        lectures,
        addLecture,
        updateLecture,
        deleteLecture,
        watchProgress,
        updateWatchProgress,
        announcements,
        addAnnouncement,
        updateAnnouncement,
        deleteAnnouncement,
        personalNotes,
        addPersonalNote,
        deletePersonalNote,
        activeBatchId,
        setActiveBatchId,
        refreshCloudContent,
        activeLectureId,
        setActiveLectureId,
        securityToast,
        showSecurityToast,
        isEnrolled,
        enrollInBatch,
        enrollAsGuest,
        isGuestAllowedForBatch,
        toggleBatchGuestAccess,
        toggleBatchPrivateRosterOnly,
        globalGuestAccessMode,
        setGlobalGuestAccessMode,
        students,
        enrollments,
        batchTests,
        enrollStudentByContact,
        revokeStudentEnrollment,
        getEnrollmentsForBatch,
        loadRosterForBatch,
        loadCurriculumForBatch,
        searchStudents,
        addTestToBatchCatalog,
        deleteBatchTest,
        getTestsForBatch,
        securitySettings,
        updateSecuritySettings,
        studentFeatureAccess,
        updateStudentFeatureAccess,
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
};

export const LmsProvider = AppProvider;
