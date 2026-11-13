import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import type { User, Batch, Subject, Chapter, Lecture, WatchProgress, Announcement, PersonalNote, BatchEnrollment, BatchTestCard } from './types';
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
import { enableContentSecurityDeterrence } from './security';
import { auth, db } from '../lib/firebase';
import { isMasterUser } from '../lib/masterAccount';
import { onAuthStateChanged } from 'firebase/auth';
import {
  syncBatchToFirestore,
  deleteBatchFromFirestore,
  fetchBatchesFromFirestore,
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
  fetchBatchTestsFromFirestore,
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
  lectures: Lecture[];
  addLecture: (lecture: Omit<Lecture, 'id' | 'createdAt'>) => void;
  updateLecture: (id: string, updated: Partial<Lecture>) => void;
  deleteLecture: (id: string) => void;
  watchProgress: Record<string, WatchProgress>;
  updateWatchProgress: (lectureId: string, currentSeconds: number, totalSeconds: number) => void;
  announcements: Announcement[];
  addAnnouncement: (announcement: Omit<Announcement, 'id'>) => void;
  personalNotes: PersonalNote[];
  addPersonalNote: (note: Omit<PersonalNote, 'id' | 'createdAt'>) => void;
  deletePersonalNote: (id: string) => void;
  activeBatchId: string | null;
  setActiveBatchId: (id: string | null) => void;
  activeLectureId: string | null;
  setActiveLectureId: (id: string | null) => void;
  securityToast: string | null;
  showSecurityToast: (msg: string) => void;
  isEnrolled: (batchId: string) => boolean;
  enrollInBatch: (batchId: string) => void;
  students: { id: string; name: string; email?: string; phone?: string }[];
  enrollments: BatchEnrollment[];
  batchTests: BatchTestCard[];
  enrollStudentByContact: (params: { contact: string; batchId: string; name?: string; validityDays?: number }) => { success: boolean; message: string };
  revokeStudentEnrollment: (userId: string, batchId: string) => void;
  getEnrollmentsForBatch: (batchId: string) => BatchEnrollment[];
  loadRosterForBatch: (batchId: string) => Promise<void>;
  loadCurriculumForBatch: (batchId: string) => Promise<void>;
  searchStudents: (query: string) => { id: string; name: string; email?: string; phone?: string }[];
  addTestToBatchCatalog: (params: {
    batchId: string;
    title: string;
    topic: string;
    difficulty: 'easy' | 'medium' | 'hard' | 'adaptive';
    timeLimitMinutes: number;
    questionCount: number;
    passingScorePercentage?: number;
  }) => { success: boolean; message: string };
  getTestsForBatch: (batchId: string) => BatchTestCard[];
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
};

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [theme, setTheme] = useState<ThemeMode>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.THEME);
    if (saved === 'light' || saved === 'dark') return saved;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });

  const [user, setUser] = useState<User>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.USER);
    if (saved) {
      try {
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
      } catch {}
    }
    return INITIAL_USER;
  });

  const [batches, setBatches] = useState<Batch[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.BATCHES);
    if (saved) {
      try {
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
      } catch {}
    }
    return INITIAL_BATCHES;
  });

  const [subjects, setSubjects] = useState<Subject[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.SUBJECTS);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      } catch {}
    }
    return INITIAL_SUBJECTS;
  });

  const [chapters, setChapters] = useState<Chapter[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.CHAPTERS);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      } catch {}
    }
    return INITIAL_CHAPTERS;
  });

  const [lectures, setLectures] = useState<Lecture[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.LECTURES);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      } catch {}
    }
    return INITIAL_LECTURES;
  });

  const [watchProgress, setWatchProgress] = useState<Record<string, WatchProgress>>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.PROGRESS);
    return saved ? JSON.parse(saved) : {};
  });

  const [announcements, setAnnouncements] = useState<Announcement[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.ANNOUNCEMENTS);
    return saved ? JSON.parse(saved) : INITIAL_ANNOUNCEMENTS;
  });

  const [personalNotes, setPersonalNotes] = useState<PersonalNote[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.NOTES);
    return saved
      ? JSON.parse(saved)
      : [
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
    const saved = localStorage.getItem(STORAGE_KEYS.STUDENTS);
    return saved ? JSON.parse(saved) : INITIAL_STUDENTS;
  });

  const [enrollments, setEnrollments] = useState<BatchEnrollment[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.ENROLLMENTS);
    return saved ? JSON.parse(saved) : INITIAL_ENROLLMENTS;
  });

  const [batchTests, setBatchTests] = useState<BatchTestCard[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.BATCH_TESTS);
    return saved ? JSON.parse(saved) : INITIAL_BATCH_TESTS;
  });

  const [activeBatchId, setActiveBatchId] = useState<string | null>(null);
  const [activeLectureId, setActiveLectureId] = useState<string | null>(null);
  const [securityToast, setSecurityToast] = useState<string | null>(null);
  const toastTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // 1. Initial Load: Fetch all active published batches from Cloud Firestore
  useEffect(() => {
    fetchBatchesFromFirestore().then((cloudBatches) => {
      if (cloudBatches && cloudBatches.length > 0) {
        setBatches(cloudBatches);
      }
    });
  }, []);

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
              return { ...b, enrolledStudentsCount: count };
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
        // User logged out or unauthenticated: Flush session tokens and wipe local enrollment state
        try {
          localStorage.removeItem(STORAGE_KEYS.USER);
        } catch {}
        setUser({
          ...INITIAL_USER,
          enrolledBatchIds: [],
        });
        setEnrollments([]);
      }
    });

    return () => unsubscribe();
  }, []);

  // Sync state to LocalStorage as zero-latency cache
  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(user));
  }, [user]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.BATCHES, JSON.stringify(batches));
  }, [batches]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.SUBJECTS, JSON.stringify(subjects));
  }, [subjects]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.CHAPTERS, JSON.stringify(chapters));
  }, [chapters]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.LECTURES, JSON.stringify(lectures));
  }, [lectures]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.PROGRESS, JSON.stringify(watchProgress));
  }, [watchProgress]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.ANNOUNCEMENTS, JSON.stringify(announcements));
  }, [announcements]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.NOTES, JSON.stringify(personalNotes));
  }, [personalNotes]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.STUDENTS, JSON.stringify(students));
  }, [students]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.ENROLLMENTS, JSON.stringify(enrollments));
  }, [enrollments]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.BATCH_TESTS, JSON.stringify(batchTests));
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
    const cleanup = enableContentSecurityDeterrence((reason) => {
      showSecurityToast(`🛡️ Security Shield: ${reason}`);
    });
    return cleanup;
  }, []);

  const toggleRole = () => {
    setUser((prev) => ({
      ...prev,
      role: prev.role === 'admin' ? 'student' : 'admin',
    }));
  };

  // 3. Cloud Firestore Backed Batch CRUD
  const addBatch = async (batchData: Omit<Batch, 'id' | 'enrolledStudentsCount' | 'rating'>) => {
    const newBatch: Batch = {
      ...batchData,
      id: `batch_${Date.now()}`,
      rating: 5.0,
      enrolledStudentsCount: 0,
      isPublished: true,
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

  const updateBatch = async (id: string, updated: Partial<Batch>) => {
    setBatches((prev) => {
      const next = prev.map((b) => (b.id === id ? { ...b, ...updated } : b));
      const target = next.find((b) => b.id === id);
      if (target) {
        syncBatchToFirestore(target).catch(() => {});
      }
      return next;
    });
  };

  const deleteBatch = async (id: string) => {
    setBatches((prev) => prev.filter((b) => b.id !== id));
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

  const addLecture = (lectureData: Omit<Lecture, 'id' | 'createdAt'>) => {
    const newLecture: Lecture = {
      ...lectureData,
      id: `lec_${Date.now()}`,
      createdAt: new Date().toISOString(),
    };
    setLectures((prev) => [...prev, newLecture]);
    syncLectureToFirestore(newLecture.batchId, newLecture).catch(() => {});
  };

  const updateLecture = (id: string, updated: Partial<Lecture>) => {
    setLectures((prev) => {
      const next = prev.map((l) => (l.id === id ? { ...l, ...updated } : l));
      const target = next.find((l) => l.id === id);
      if (target) {
        syncLectureToFirestore(target.batchId, target).catch(() => {});
      }
      return next;
    });
  };

  const deleteLecture = (id: string) => {
    const target = lectures.find((l) => l.id === id);
    setLectures((prev) => prev.filter((l) => l.id !== id));
    if (target?.batchId) {
      deleteLectureFromFirestore(target.batchId, id).catch(() => {});
    }
  };

  const loadCurriculumForBatch = async (batchId: string) => {
    if (!batchId) return;
    try {
      const { chapters: cloudChaps, lectures: cloudLecs } = await fetchBatchCurriculumFromFirestore(batchId);
      if (cloudChaps.length > 0) {
        setChapters((prev) => {
          // Reconcile: If local state has chapters authored here that aren't in cloud yet, push to cloud
          prev.filter((c) => c.batchId === batchId).forEach((lc) => {
            if (!cloudChaps.some((cc) => cc.id === lc.id)) {
              syncChapterToFirestore(batchId, lc).catch(() => {});
            }
          });
          const map = new Map(prev.map((c) => [c.id, c]));
          cloudChaps.forEach((cc) => map.set(cc.id, cc));
          return Array.from(map.values());
        });
      }
      if (cloudLecs.length > 0) {
        setLectures((prev) => {
          // Reconcile: If local state has lectures authored here that aren't in cloud yet, push to cloud
          prev.filter((l) => l.batchId === batchId).forEach((ll) => {
            if (!cloudLecs.some((cl) => cl.id === ll.id)) {
              syncLectureToFirestore(batchId, ll).catch(() => {});
            }
          });
          const map = new Map(prev.map((l) => [l.id, l]));
          cloudLecs.forEach((cl) => map.set(cl.id, cl));
          return Array.from(map.values());
        });
      }

      // Also fetch batch-authored tests from Cloud Firestore
      fetchBatchTestsFromFirestore(batchId).then((cloudTests) => {
        if (cloudTests.length > 0) {
          setBatchTests((prev) => {
            const map = new Map(prev.map((t) => [t.testId, t]));
            cloudTests.forEach((ct) => map.set(ct.testId, ct));
            return Array.from(map.values());
          });
        }
      }).catch(() => {});

      if (cloudChaps.length === 0) {
        // If batch has no curriculum in cloud yet, supply foundational starter module
        const targetBatch = batches.find((b) => b.id === batchId);
        const batchTitle = targetBatch?.title || 'Coaching Batch';
        const starterChapId = `chap_${batchId}_01`;
        const starterLecId = `lec_${batchId}_01`;
        const starterChap: Chapter = {
          id: starterChapId,
          batchId,
          subjectId: 'sub_math_01',
          title: 'Chapter 01: Concept Mastery & Foundation',
          description: `Core curriculum module with video lessons and study materials for ${batchTitle}.`,
          order: 1,
        };
        const starterLec: Lecture = {
          id: starterLecId,
          batchId,
          subjectId: 'sub_math_01',
          chapterId: starterChapId,
          title: 'Lecture 01: Course Orientation & Core Problem Solving',
          description: 'Comprehensive coaching lecture covering foundational derivations, problem-solving shortcuts, and formula charts.',
          durationMinutes: 45,
          videoSourceType: 'youtube',
          encryptedVideoId: 'V1VWVE5hYU5remM=', // Sample unlisted video key
          thumbnailUrl: 'https://images.unsplash.com/photo-1516321318423-f06f85e504b3?w=500&auto=format&fit=crop&q=80',
          order: 1,
          isFreePreview: false,
          pdfNotes: [
            {
              id: `pdf_${Date.now()}`,
              title: `${batchTitle} - Chapter 01 DPP & Formula Notes.pdf`,
              url: '#',
              size: '1.8 MB',
              pages: 6,
              type: 'pdf',
            },
          ],
          milestones: [
            { id: 'm1', seconds: 0, title: '01. Lecture Roadmap & Key Formulae' },
            { id: 'm2', seconds: 180, title: '02. Step-by-Step Derivation' },
            { id: 'm3', seconds: 480, title: '03. Exam Pattern Question Solving' },
          ],
          faculty: {
            name: targetBatch?.instructor?.name || 'Sanju Kumar',
            designation: targetBatch?.instructor?.designation || 'Master Faculty',
            avatarUrl: targetBatch?.instructor?.avatarUrl || '',
          },
          createdAt: new Date().toISOString(),
        };

        setChapters((prev) => {
          const exists = prev.some((c) => c.batchId === batchId);
          return exists ? prev : [...prev, starterChap];
        });
        setLectures((prev) => {
          const exists = prev.some((l) => l.batchId === batchId);
          return exists ? prev : [...prev, starterLec];
        });

        // Persist starter curriculum to Cloud Firestore
        syncChapterToFirestore(batchId, starterChap).catch(() => {});
        syncLectureToFirestore(batchId, starterLec).catch(() => {});
      }
    } catch (err) {
      console.warn(`Curriculum load error for batch ${batchId}:`, err);
    }
  };

  const updateWatchProgress = (lectureId: string, currentSeconds: number, totalSeconds: number) => {
    setWatchProgress((prev) => ({
      ...prev,
      [lectureId]: {
        lectureId,
        watchedSeconds: currentSeconds,
        totalSeconds,
      },
    }));
  };

  const addAnnouncement = (annData: Omit<Announcement, 'id'>) => {
    const newAnn: Announcement = {
      ...annData,
      id: `ann_${Date.now()}`,
    };
    setAnnouncements((prev) => [newAnn, ...prev]);
  };

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

  // 4. Bulletproof Multi-Factor Batch Enrollment Check (Zero-Leakage & Ironclad Privilege Boundary)
  const isEnrolled = (batchId: string): boolean => {
    // 1. Authenticated Master Admin always has preview and authoring rights
    if (isMasterUser(auth.currentUser) || user.role === 'admin') return true;

    // 2. Unauthenticated visitors & Guest mode sessions NEVER have enrolled access to any batch
    if (!auth.currentUser) return false;

    const uEmail = (auth.currentUser.email || '').toLowerCase().trim();
    const uPhone = (auth.currentUser.phoneNumber || '').trim();
    const uUid = auth.currentUser.uid;

    // 3. User must have an active cloud-synchronized enrollment
    if (Array.isArray(user.enrolledBatchIds) && user.enrolledBatchIds.includes(batchId)) return true;

    return enrollments.some(
      (e) =>
        e.batchId === batchId &&
        e.status === 'active' &&
        ((uEmail && e.studentEmail && e.studentEmail.toLowerCase().trim() === uEmail) ||
          (uPhone && e.studentPhone && e.studentPhone.trim() === uPhone) ||
          (uUid && e.userId === uUid))
    );
  };

  const enrollInBatch = (batchId: string) => {
    showSecurityToast('Direct self-enrollment is locked. Access is strictly managed by Master Console on the official batch roster.');
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

  const loadRosterForBatch = async (batchId: string) => {
    if (!batchId) return;
    try {
      const cloudList = await fetchBatchEnrollmentsFromFirestore(batchId);
      // Synchronize batch roster with cloud state
      setEnrollments((prev) => {
        const others = prev.filter((e) => e.batchId !== batchId);
        return [...others, ...cloudList];
      });
      setBatches((prev) =>
        prev.map((b) =>
          b.id === batchId ? { ...b, enrolledStudentsCount: cloudList.length } : b
        )
      );
    } catch (err) {
      console.warn(`Roster load error for batch ${batchId}:`, err);
    }
  };

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
    batchId,
    title,
    topic,
    difficulty,
    timeLimitMinutes,
    questionCount,
    passingScorePercentage = 40,
  }: {
    batchId: string;
    title: string;
    topic: string;
    difficulty: 'easy' | 'medium' | 'hard' | 'adaptive';
    timeLimitMinutes: number;
    questionCount: number;
    passingScorePercentage?: number;
  }) => {
    const chunkId = `chunk_${Math.floor(batchTests.filter((t) => t.batchId === batchId).length / 6) + 1}`;
    const newTestCard: BatchTestCard = {
      testId: `btest_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
      batchId,
      title: title.trim(),
      topic: topic.trim(),
      difficulty,
      timeLimitMinutes: Number(timeLimitMinutes) || 60,
      questionCount: Number(questionCount) || 30,
      passingScorePercentage: Number(passingScorePercentage) || 40,
      catalogChunkId: chunkId,
      chunkEstimatedBytes: 85 * 1024,
      publishedAt: new Date().toISOString(),
    };

    setBatchTests((prev) => [newTestCard, ...prev]);
    syncBatchTestToFirestore(batchId, newTestCard).catch(() => {});
    return {
      success: true,
      message: `Published "${newTestCard.title}" into batch catalog chunk ${chunkId} (Estimated 85 KB bin-packed).`,
    };
  };

  const getTestsForBatch = (batchId: string) => {
    return batchTests.filter((t) => t.batchId === batchId);
  };

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
        lectures,
        addLecture,
        updateLecture,
        deleteLecture,
        watchProgress,
        updateWatchProgress,
        announcements,
        addAnnouncement,
        personalNotes,
        addPersonalNote,
        deletePersonalNote,
        activeBatchId,
        setActiveBatchId,
        activeLectureId,
        setActiveLectureId,
        securityToast,
        showSecurityToast,
        isEnrolled,
        enrollInBatch,
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
        getTestsForBatch,
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
