import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import type { User, Batch, Subject, Chapter, Lecture, WatchProgress, Announcement, PersonalNote } from './types';
import {
  INITIAL_USER,
  INITIAL_BATCHES,
  INITIAL_SUBJECTS,
  INITIAL_CHAPTERS,
  INITIAL_LECTURES,
  INITIAL_ANNOUNCEMENTS,
} from './initialData';
import { enableContentSecurityDeterrence } from './security';

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
};

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [theme, setTheme] = useState<ThemeMode>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.THEME);
    if (saved === 'light' || saved === 'dark') return saved;
    // Default to dark or system preference
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
      } catch {
        // Fallback
      }
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
      } catch {
        // Fallback
      }
    }
    return INITIAL_BATCHES;
  });

  const [subjects, setSubjects] = useState<Subject[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.SUBJECTS);
    return saved ? JSON.parse(saved) : INITIAL_SUBJECTS;
  });

  const [chapters, setChapters] = useState<Chapter[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.CHAPTERS);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length >= INITIAL_CHAPTERS.length) {
          return parsed;
        }
      } catch {
        // fallback
      }
    }
    return INITIAL_CHAPTERS;
  });

  const [lectures, setLectures] = useState<Lecture[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.LECTURES);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length >= INITIAL_LECTURES.length) {
          return parsed;
        }
      } catch {
        // fallback
      }
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

  const [activeBatchId, setActiveBatchId] = useState<string | null>(null);
  const [activeLectureId, setActiveLectureId] = useState<string | null>(null);
  const [securityToast, setSecurityToast] = useState<string | null>(null);
  const toastTimeoutRef = useRef<NodeJS.Timeout | null>(null);

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

  // Sync to localStorage
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

  // Enable Anti-Piracy Deterrence (Right-click block, Inspect Element key block)
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

  const addBatch = (batchData: Omit<Batch, 'id' | 'enrolledStudentsCount' | 'rating'>) => {
    const newBatch: Batch = {
      ...batchData,
      id: `batch_${Date.now()}`,
      rating: 5.0,
      enrolledStudentsCount: 1,
    };
    setBatches((prev) => [newBatch, ...prev]);
  };

  const updateBatch = (id: string, updated: Partial<Batch>) => {
    setBatches((prev) => prev.map((b) => (b.id === id ? { ...b, ...updated } : b)));
  };

  const deleteBatch = (id: string) => {
    setBatches((prev) => prev.filter((b) => b.id !== id));
  };

  const addSubject = (subData: Omit<Subject, 'id'>) => {
    const newSub: Subject = {
      ...subData,
      id: `sub_${Date.now()}`,
    };
    setSubjects((prev) => [...prev, newSub]);
  };

  const addChapter = (chapData: Omit<Chapter, 'id'>) => {
    const newChap: Chapter = {
      ...chapData,
      id: `chap_${Date.now()}`,
    };
    setChapters((prev) => [...prev, newChap]);
  };

  const addLecture = (lecData: Omit<Lecture, 'id' | 'createdAt'>) => {
    const newLec: Lecture = {
      ...lecData,
      id: `lec_${Date.now()}`,
      createdAt: new Date().toISOString().split('T')[0],
    };
    setLectures((prev) => [...prev, newLec]);
  };

  const updateLecture = (id: string, updated: Partial<Lecture>) => {
    setLectures((prev) => prev.map((l) => (l.id === id ? { ...l, ...updated } : l)));
  };

  const deleteLecture = (id: string) => {
    setLectures((prev) => prev.filter((l) => l.id !== id));
  };

  const updateWatchProgress = (lectureId: string, currentSeconds: number, totalSeconds: number) => {
    if (!totalSeconds) return;
    const isCompleted = currentSeconds / totalSeconds >= 0.9;
    setWatchProgress((prev) => ({
      ...prev,
      [lectureId]: {
        lectureId,
        watchedSeconds: Math.floor(currentSeconds),
        totalSeconds: Math.floor(totalSeconds),
        isCompleted,
        lastWatchedAt: new Date().toISOString(),
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

  const isEnrolled = (batchId: string) => {
    return user.role === 'admin' || (Array.isArray(user.enrolledBatchIds) && user.enrolledBatchIds.includes(batchId));
  };

  const enrollInBatch = (batchId: string) => {
    if (!user.enrolledBatchIds.includes(batchId)) {
      setUser((prev) => ({
        ...prev,
        enrolledBatchIds: [...prev.enrolledBatchIds, batchId],
      }));
      setBatches((prev) =>
        prev.map((b) => (b.id === batchId ? { ...b, enrolledStudentsCount: b.enrolledStudentsCount + 1 } : b))
      );
    }
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
