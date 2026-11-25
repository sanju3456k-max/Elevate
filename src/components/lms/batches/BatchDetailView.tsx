import { DEFAULT_HIGH_RES_BANNER } from './BatchThumbnailPicker';
import {
  getSelectedAppInstituteId,
  PRIMARY_WORKSPACE_ID,
  APP_INSTITUTE_CHANGED_EVENT,
} from '../../../lib/masterWorkspace';
import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { Capacitor } from '@capacitor/core';
import {
  Megaphone,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Folder,
  FolderOpen,
  FolderPlus,
  PlayCircle,
  FileText,
  Download,
  CheckCircle,
  Star,
  Flag,
  Trash2,
  Play,
  ArrowRight,
  Eye,
  Users,
  BookOpen,
  Lock,
  ShieldAlert,
  Sparkles,
  Award,
  Timer,
  HelpCircle,
  MoreVertical,
  MoreHorizontal,
  Edit3,
  Plus,
  ExternalLink,
  Video,
  Layers,
  FilePlus,
  Grid,
  List,
  Home,
  Clock,
  Settings,
  Smartphone,
  Globe,
  Image as ImageIcon,
} from 'lucide-react';
import { isImageFile } from '../../../lib/filePreviewUtils';
import { useApp, getFacultyAvatarUrl } from '../../../lms/LmsContext';
import { auth, db, getCachedFullTest } from '../../../lib/firebase';
import { loadFullTestOnDemand } from '../../../lib/storage';
import { collection, onSnapshot, doc } from 'firebase/firestore';
import { listenerManager } from '../../../lib/listenerManager';
import { cleanKeyForFirestore, getCachedBatchRevision, setCachedBatchRevision } from '../../../lib/batchCloudSync';
import { isMasterUser, getGlobalPublishedTests, isDeprecatedTest, DEPRECATED_TEST_IDS } from '../../../lib/masterAccount';
import { getTestDurationMinutes } from '../../../utils/testFormatConverter';
import { CloakedVideoPlayer } from '../player/CloakedVideoPlayer';
import { formatDuration, extractYouTubeId, obfuscateVideoKey, getLectureThumbnailUrl, deobfuscateVideoKey } from '../../../lms/security';
import { stripFileExtension } from '../../../lms/documentMetadataService';
import type { PdfNote, Chapter, Lecture, Batch } from '../../../lms/types';
import type { MathTest, TestAttempt, UserProfile } from '../../../types';
import { M3TestCard } from '../../ui/M3TestCard';
import { TestDetailModal } from '../../TestDetailModal';
import { GoogleDriveFileViewerModal, type DriveViewerItem } from '../viewer/GoogleDriveFileViewerModal';
import { useBackHandler, isBrowserFullscreen, exitBrowserFullscreen } from '../../../hooks/useBackNavigation';
import {
  CreateOrEditFolderModal,
  AddOrEditVideoModal,
  AddOrEditNoteModal,
  LinkTestModal,
  ConfirmDeleteModal,
  CreateBatchModal,
} from './FolderEditorModals';
import { EditBatchModal, BatchRosterModal } from './BatchAdminModals';

interface BatchDetailViewProps {
  batchId?: string;
  initialLectureId?: string | null;
  initialChapterId?: string | null;
  initialFolderTab?: 'videos' | 'notes_content' | 'tests' | null;
  onBack?: () => void;
  availableTests?: MathTest[];
  attempts?: TestAttempt[];
  userProfile?: UserProfile | null;
  currentUser?: any;
  onStartTest?: (
    test: MathTest,
    context?: { batchId: string; chapterId?: string | null; folderTab: 'videos' | 'notes_content' | 'tests' }
  ) => void;
  onStartOmrTest?: (
    test: MathTest,
    context?: { batchId: string; chapterId?: string | null; folderTab: 'videos' | 'notes_content' | 'tests' }
  ) => void;
  onViewAttemptResult?: (attempt: TestAttempt) => void;
  initialFilter?: 'all' | 'my-batches';
  onStageChange?: (stage: 'batch_list' | 'folder_list' | 'folder_content' | 'lecture_view') => void;
  onBatchChange?: (batchId: string | null) => void;
  onChapterChange?: (chapterId: string | null) => void;
  onLectureChange?: (lectureId: string | null) => void;
  onFolderTabChange?: (tab: 'videos' | 'notes_content' | 'tests') => void;
  isMasterEditMode?: boolean;
  onSetMiniPlayer?: (video: any) => void;
  onPlayLecture?: (lecture: Lecture, batch: Batch) => void;
  initialSeekSeconds?: number | null;
}

export const BatchDetailView: React.FC<BatchDetailViewProps> = ({
  batchId: propBatchId,
  initialLectureId,
  initialChapterId,
  initialFolderTab,
  onBack,
  availableTests = [],
  attempts = [],
  userProfile = null,
  currentUser = null,
  onStartTest,
  onStartOmrTest,
  onViewAttemptResult,
  initialFilter = 'all',
  onStageChange,
  onBatchChange,
  onChapterChange,
  onLectureChange,
  onFolderTabChange,
  isMasterEditMode = false,
  onSetMiniPlayer,
  onPlayLecture,
  initialSeekSeconds = null,
}) => {
  const {
    batches,
    chapters,
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
    user,
    watchProgress,
    updateWatchProgress,
    isEnrolled,
    enrollInBatch,
    enrollAsGuest,
    isGuestAllowedForBatch,
    personalNotes,
    addPersonalNote,
    deletePersonalNote,
    loadCurriculumForBatch,
    showSecurityToast,
    announcements,
    addAnnouncement,
    batchTests,
    deleteBatchTest,
    addBatch,
    updateBatch,
    deleteBatch,
    getEnrollmentsForBatch,
    toggleBatchGuestAccess,
  } = useApp();

  const isMaster = isMasterUser(auth.currentUser) || (Boolean(isMasterEditMode) && isMasterUser(user as any));

  // Modal state for Creating New Batch (Master User)
  const [isCreateBatchModalOpen, setIsCreateBatchModalOpen] = useState(false);

  // Modal states for Editing Batch & Batch Roster (Master User)
  const [isEditBatchModalOpen, setIsEditBatchModalOpen] = useState(false);
  const [batchToEdit, setBatchToEdit] = useState<Batch | null>(null);

  // Active Test for Detailed Test Overview & Dual Mode (OMR + Online) Modal
  const [detailedTest, setDetailedTest] = useState<MathTest | null>(null);

  const [isBatchRosterModalOpen, setIsBatchRosterModalOpen] = useState(false);
  const [batchForRoster, setBatchForRoster] = useState<Batch | null>(null);

  const [activeCardMenuBatchId, setActiveCardMenuBatchId] = useState<string | null>(null);
  const isNativeAndroidApp = Capacitor.isNativePlatform();

  const handleBroadcastBatchAsHero = (targetB: Batch) => {
    const existing = announcements?.find((a) => a.batchId === targetB.id && a.isHeroBanner);
    if (existing) {
      showSecurityToast(`Batch "${targetB.title}" is already broadcasting on the Home Screen!`);
      return;
    }
    addAnnouncement({
      title: targetB.title,
      message: targetB.description || `Explore ${targetB.title} curriculum, lectures, and mock tests.`,
      batchId: targetB.id,
      imageUrl: targetB.bannerUrl || targetB.thumbnailUrl || DEFAULT_HIGH_RES_BANNER,
      isHeroBanner: true,
      themeColor: 'yellow',
      authorName: targetB.instructor?.name || 'Master Academic Head',
      authorRole: 'Master Admin',
      date: new Date().toISOString(),
    });
    showSecurityToast(`Batch "${targetB.title}" broadcasted to Home Screen as 1200x500 banner!`);
  };

  // Close 3-dots card menu when clicking outside
  useEffect(() => {
    const handleOutsideClick = () => setActiveCardMenuBatchId(null);
    window.addEventListener('click', handleOutsideClick);
    return () => window.removeEventListener('click', handleOutsideClick);
  }, []);

  // Selected Batch
  const [selectedBatchId, setSelectedBatchId] = useState<string>(() => {
    return propBatchId || batches[0]?.id || 'batch_testing_01';
  });

  // Selected Folder (null = Root level of the batch)
  const [selectedChapterId, setSelectedChapterId] = useState<string | null>(initialChapterId || null);

  // Selected Lecture (for video player)
  const [selectedLectureId, setSelectedLectureId] = useState<string | null>(initialLectureId || null);
  const [isCurrentLecturePlaying, setIsCurrentLecturePlaying] = useState(true);

  // Stage Navigation: 'batch_list' | 'folder_content' | 'lecture_view'
  const [currentStage, setCurrentStage] = useState<'batch_list' | 'folder_content' | 'lecture_view'>(() => {
    if (initialLectureId) return 'lecture_view';
    if (propBatchId) return 'folder_content';
    return 'batch_list';
  });

  // Inside Folder Tab: 'videos' | 'notes_content' | 'tests'
  const [folderActiveTab, setFolderActiveTab] = useState<'videos' | 'notes_content' | 'tests'>(
    initialFolderTab || 'videos'
  );

  // Filter state for All Batches vs My Batches
  const [batchFilter, setBatchFilter] = useState<'all' | 'my-batches'>(initialFilter || 'all');

  // Modals state for Master Editing
  const [isFolderModalOpen, setIsFolderModalOpen] = useState(false);
  const [editingFolder, setEditingFolder] = useState<Chapter | null>(null);

  const [isVideoModalOpen, setIsVideoModalOpen] = useState(false);
  const [editingLecture, setEditingLecture] = useState<Lecture | null>(null);

  const [isNoteModalOpen, setIsNoteModalOpen] = useState(false);
  const [editingNote, setEditingNote] = useState<PdfNote | null>(null);

  const [isLinkTestModalOpen, setIsLinkTestModalOpen] = useState(false);

  const [deleteModalConfig, setDeleteModalConfig] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {},
  });

  // Active contextual menu dropdown
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);

  // Google Drive In-App File & Image Viewer state
  const [viewerItems, setViewerItems] = useState<DriveViewerItem[]>([]);
  const [viewerInitialIndex, setViewerInitialIndex] = useState<number>(0);
  const [isViewerOpen, setIsViewerOpen] = useState<boolean>(false);

  // Helper to open PDF notes in Google Drive In-App Viewer
  const handleOpenNoteViewer = useCallback((clickedNote: PdfNote, allNotes: PdfNote[] = []) => {
    const currBatch = batches.find((b) => b.id === selectedBatchId) || batches[0];
    const hasFullAccess = isMaster || (currBatch && (isEnrolled(currBatch.id) || isGuestAllowedForBatch(currBatch.id)));
    if (!hasFullAccess) {
      showSecurityToast(`Access Locked: PDF Note "${clickedNote.title}" is restricted to enrolled students.`);
      return;
    }
    const list = allNotes.length > 0 ? allNotes : [clickedNote];
    const currFold = selectedChapterId ? chapters.find((c) => c.id === selectedChapterId) : null;
    const formatted: DriveViewerItem[] = list.map((n) => ({
      id: n.id,
      title: n.title,
      url: n.fileUrl || n.url || '',
      fileUrl: n.fileUrl || n.url || '',
      previewImageUrl: n.previewImageUrl,
      type: isImageFile({ fileName: n.title, fileUrl: n.fileUrl || n.url }) ? 'image' : 'pdf',
      subtitle: currFold?.title || currBatch?.title || 'Chapter Resource',
      uploadedAt: n.createdAt,
    }));
    const foundIdx = formatted.findIndex((it) => it.id === clickedNote.id);
    setViewerItems(formatted);
    setViewerInitialIndex(foundIdx >= 0 ? foundIdx : 0);
    setIsViewerOpen(true);
  }, [selectedChapterId, chapters, selectedBatchId, batches, isMaster, isEnrolled, isGuestAllowedForBatch, showSecurityToast]);

  // Helper to open images in Google Drive In-App Viewer
  const handleOpenImageViewer = useCallback((title: string, url: string) => {
    setViewerItems([
      {
        id: `img_${Date.now()}`,
        title,
        url,
        previewImageUrl: url,
        type: 'image',
      },
    ]);
    setViewerInitialIndex(0);
    setIsViewerOpen(true);
  }, []);

  // Live video player notes
  const [currentPlaybackSec, setCurrentPlaybackSec] = useState<number>(0);
  const [activeSeekSeconds, setActiveSeekSeconds] = useState<number | null>(initialSeekSeconds || null);
  const [noteInputText, setNoteInputText] = useState('');

  useEffect(() => {
    if (initialSeekSeconds !== undefined && initialSeekSeconds !== null) {
      setActiveSeekSeconds(initialSeekSeconds);
    }
  }, [initialSeekSeconds]);

  useEffect(() => {
    onStageChange?.(currentStage as any);
  }, [currentStage, onStageChange]);

  useEffect(() => {
    if (initialFilter) {
      setBatchFilter(initialFilter);
    }
  }, [initialFilter]);

  // Track consumed initialLectureId to prevent navigation bounce loops
  const consumedLectureIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (propBatchId) {
      setSelectedBatchId(propBatchId);
      if (initialChapterId) {
        setSelectedChapterId(initialChapterId);
      }
      if (initialFolderTab) {
        setFolderActiveTab(initialFolderTab);
      }
      if (initialLectureId && consumedLectureIdRef.current !== initialLectureId) {
        consumedLectureIdRef.current = initialLectureId;
        setSelectedLectureId(initialLectureId);
        const targetLec = lectures.find((l) => l.id === initialLectureId);
        if (targetLec && currentBatch && onPlayLecture) {
          onPlayLecture(targetLec, currentBatch);
        } else {
          setCurrentStage('lecture_view');
          onStageChange?.('lecture_view');
        }
      } else if (!initialLectureId && currentStage === 'batch_list') {
        setCurrentStage('folder_content');
      }
    } else {
      consumedLectureIdRef.current = null;
      setCurrentStage('batch_list');
    }
  }, [propBatchId, initialChapterId, initialLectureId, initialFolderTab, onStageChange]);

  // Real-time synchronization for lectures & chapters:
  // - Master Admin: Maintains active real-time collection streams for instant live authoring & editing.
  // - Students: Listens to the 1-document catalog beacon (visibility-aware, zero-socket battery drain during 45min videos).
  useEffect(() => {
    if (!selectedBatchId) return;

    // Real-time synchronization:
    // - Master: 3 live collection streams fire immediately on attach (150ms debounced in LmsContext) — no extra initial call needed.
    // - Students: 1 initial authoritative load + revision-gated 1-doc beacon (skips initial replay & unrelated batch updates).
    if (isMaster) {
      let unsubLectures: (() => void) | null = null;
      let unsubChapters: (() => void) | null = null;
      let unsubTests: (() => void) | null = null;
      try {
        const lecsCol = collection(db, 'batches', selectedBatchId, 'lectures');
        unsubLectures = onSnapshot(
          lecsCol,
          () => {
            loadCurriculumForBatch(selectedBatchId);
          },
          (err) => {
            console.warn('Lectures live stream notice:', err);
          }
        );
      } catch {}

      try {
        const chapsCol = collection(db, 'batches', selectedBatchId, 'chapters');
        unsubChapters = onSnapshot(
          chapsCol,
          () => {
            loadCurriculumForBatch(selectedBatchId);
          },
          (err) => {
            console.warn('Chapters live stream notice:', err);
          }
        );
      } catch {}

      try {
        const testsCol = collection(db, 'batches', selectedBatchId, 'tests');
        unsubTests = onSnapshot(
          testsCol,
          () => {
            loadCurriculumForBatch(selectedBatchId);
          },
          (err) => {
            console.warn('Batch tests live stream notice:', err);
          }
        );
      } catch {}

      return () => {
        if (unsubLectures) unsubLectures();
        if (unsubChapters) unsubChapters();
        if (unsubTests) unsubTests();
      };
    } else {
      loadCurriculumForBatch(selectedBatchId);

      const batchRevKey = cleanKeyForFirestore(selectedBatchId);
      let lastSeenBatchRev = getCachedBatchRevision(selectedBatchId);
      let isFirstBeaconEvent = true;

      // Enrolled students: listen to the lightweight 1-document beacon with auto background sleep
      const unsubBeacon = listenerManager.subscribeDocument(
        'master_catalog/batch_catalog_meta',
        () => doc(db, 'master_catalog', 'batch_catalog_meta'),
        (snap) => {
          if (!snap.exists()) return;
          const data = snap.data() as any;
          const serverBatchRev = Number(data?.batchRevisions?.[batchRevKey] || 0);

          if (isFirstBeaconEvent) {
            isFirstBeaconEvent = false;
            if (serverBatchRev > lastSeenBatchRev) {
              lastSeenBatchRev = serverBatchRev;
              setCachedBatchRevision(selectedBatchId, serverBatchRev);
            }
            return;
          }

          if (serverBatchRev > lastSeenBatchRev) {
            lastSeenBatchRev = serverBatchRev;
            setCachedBatchRevision(selectedBatchId, serverBatchRev);
            loadCurriculumForBatch(selectedBatchId, true);
          }
        }
      );
      return () => {
        unsubBeacon();
      };
    }
  }, [selectedBatchId, loadCurriculumForBatch, isMaster]);

  // Gracefully handle if current lecture was deleted by instructor in real time
  useEffect(() => {
    if (selectedLectureId) {
      const exists = lectures.some((l) => l.id === selectedLectureId);
      if (!exists && currentStage === 'lecture_view') {
        showSecurityToast('This lecture has been removed by the instructor.');
        setSelectedLectureId(null);
        setCurrentStage('folder_content');
      }
    }
  }, [selectedLectureId, lectures, currentStage, showSecurityToast]);

  // One-time initial deep-link alignment when opening a lecture via direct link
  const hasAlignedInitialDeepLinkRef = useRef(false);
  useEffect(() => {
    if (!hasAlignedInitialDeepLinkRef.current && initialLectureId) {
      const targetLec = lectures.find((l) => l.id === initialLectureId);
      if (targetLec) {
        hasAlignedInitialDeepLinkRef.current = true;
        if (targetLec.chapterId && !selectedChapterId) setSelectedChapterId(targetLec.chapterId);
        if (targetLec.batchId && !selectedBatchId) setSelectedBatchId(targetLec.batchId);
      }
    }
  }, [initialLectureId, lectures]);

  const [activeInstituteId, setActiveInstituteId] = useState<string>(
    () => getSelectedAppInstituteId() || PRIMARY_WORKSPACE_ID
  );

  useEffect(() => {
    const syncInst = () => {
      setActiveInstituteId(getSelectedAppInstituteId() || PRIMARY_WORKSPACE_ID);
    };
    window.addEventListener(APP_INSTITUTE_CHANGED_EVENT, syncInst);
    return () => window.removeEventListener(APP_INSTITUTE_CHANGED_EVENT, syncInst);
  }, []);

  const visibleBatches = useMemo(() => {
    const instituteBatches = batches.filter(
      (b) => (b.workspaceId || PRIMARY_WORKSPACE_ID) === activeInstituteId
    );
    if (isMaster) return instituteBatches;
    return instituteBatches.filter((b) => {
      // An officially enrolled student can ALWAYS see their enrolled course, even if Draft or Secret Roster-Only!
      if (isEnrolled(b.id)) return true;
      // Non-enrolled visitors and guests can NEVER see Draft or Secret Roster-Only courses:
      if (b.isPublished === false) return false;
      if (b.isPrivateRosterOnly === true) return false;
      return true;
    });
  }, [batches, isMaster, isEnrolled, activeInstituteId]);

  const enrolledBatches = useMemo(
    () => visibleBatches.filter((b) => isEnrolled(b.id)),
    [visibleBatches, isEnrolled]
  );

  const displayedBatches = batchFilter === 'my-batches' ? enrolledBatches : visibleBatches;
  const currentBatch = batches.find((b) => b.id === selectedBatchId) || visibleBatches[0];

  // Auto-protect: If non-admin user is in draft or secret batch and not enrolled, return to catalog with alert
  useEffect(() => {
    if (!isMaster && currentBatch && currentStage !== 'batch_list') {
      const isUserEnrolled = isEnrolled(currentBatch.id);
      const isSecretOrDraft = currentBatch.isPublished === false || currentBatch.isPrivateRosterOnly === true;
      if (isSecretOrDraft && !isUserEnrolled) {
        showSecurityToast(
          currentBatch.isPublished === false
            ? `Access Denied: "${currentBatch.title}" is in Draft mode. Official roster enrollment required.`
            : `Access Denied: You are not enrolled in "${currentBatch.title}". Official roster admission required.`
        );
        setCurrentStage('batch_list');
        setSelectedBatchId('');
        onBatchChange?.(null);
      }
    }
  }, [currentBatch, isMaster, currentStage, onBatchChange, showSecurityToast, isEnrolled]);

  // Dynamic Google Drive Breadcrumb Path
  const breadcrumbPath = useMemo(() => {
    if (!currentBatch) return [];
    return getBreadcrumbs(selectedChapterId, currentBatch.id);
  }, [getBreadcrumbs, selectedChapterId, currentBatch]);

  // Current Folder Node (if inside a subfolder)
  const currentFolder = useMemo(() => {
    return selectedChapterId ? chapters.find((c) => c.id === selectedChapterId) : null;
  }, [chapters, selectedChapterId]);

  // Subfolders at the current level
  const currentSubfolders = useMemo(() => {
    if (!currentBatch) return [];
    return getSubfolders(currentBatch.id, selectedChapterId);
  }, [getSubfolders, currentBatch, selectedChapterId]);

  // Only show the Videos / Notes / Tests toggle bar and contents inside a specific folder
  // On the batch's root folder page, only display the subfolders
  const shouldShowContentTabs = Boolean(selectedChapterId) || currentSubfolders.length === 0;

  // Lectures directly at the current level
  const folderLectures = useMemo(() => {
    if (!currentBatch) return [];
    return lectures.filter((l) => {
      if (l.batchId !== currentBatch.id) return false;
      if (selectedChapterId) {
        return l.chapterId === selectedChapterId;
      }
      return !l.chapterId || l.chapterId === 'root';
    });
  }, [lectures, currentBatch, selectedChapterId]);

  // Dynamic accurate duration resolution for all folder lectures
  const [exactDurations, setExactDurations] = useState<Record<string, number>>({});

  useEffect(() => {
    folderLectures.forEach((lec) => {
      // 1. From existing watch progress
      const progressSec = watchProgress[lec.id]?.totalSeconds;
      if (progressSec && progressSec > 0) {
        setExactDurations((prev) => (prev[lec.id] === progressSec ? prev : { ...prev, [lec.id]: progressSec }));
        return;
      }
      // 2. From lecture record durationSeconds
      if (lec.durationSeconds && lec.durationSeconds > 0) {
        setExactDurations((prev) => (prev[lec.id] === lec.durationSeconds ? prev : { ...prev, [lec.id]: lec.durationSeconds! }));
        return;
      }
      // 3. Fallback from lecture record durationMinutes
      if (lec.durationMinutes && lec.durationMinutes > 0) {
        const sec = lec.durationMinutes * 60;
        setExactDurations((prev) => (prev[lec.id] === sec ? prev : { ...prev, [lec.id]: sec }));
        return;
      }
      // 4. Safe default fallback (1800s)
      setExactDurations((prev) => (prev[lec.id] ? prev : { ...prev, [lec.id]: 1800 }));
    });
  }, [folderLectures, watchProgress]);

  // Total videos count (all batch videos if at root, or chapter videos if inside a chapter)
  const totalFolderVideosCount = useMemo(() => {
    if (!currentBatch) return 0;
    if (!selectedChapterId) {
      return lectures.filter((l) => l.batchId === currentBatch.id).length;
    }
    const chapterIds = new Set<string>([selectedChapterId]);
    const addDescendants = (parentId: string) => {
      chapters.filter((c) => c.parentId === parentId).forEach((c) => {
        chapterIds.add(c.id);
        addDescendants(c.id);
      });
    };
    addDescendants(selectedChapterId);
    return lectures.filter((l) => l.batchId === currentBatch.id && l.chapterId && chapterIds.has(l.chapterId)).length;
  }, [lectures, currentBatch, selectedChapterId, chapters]);

  // Notes directly at the current level (folder direct attachments + lecture notes)
  const folderNotesContent = useMemo(() => {
    const directNotes = currentFolder?.pdfNotes || [];
    const lectureNotes = folderLectures.flatMap((l) => l.pdfNotes || []);
    const map = new Map<string, PdfNote>();
    [...directNotes, ...lectureNotes].forEach((n) => {
      const key = n.id || n.fileUrl || n.url;
      if (key && !map.has(key)) {
        map.set(key, n);
      }
    });
    return Array.from(map.values());
  }, [currentFolder, folderLectures]);

  // Total notes count
  const totalFolderNotesCount = useMemo(() => {
    if (!currentBatch) return 0;
    if (!selectedChapterId) {
      let count = 0;
      const batchLectures = lectures.filter((l) => l.batchId === currentBatch.id);
      batchLectures.forEach((l) => (count += l.pdfNotes?.length || 0));
      chapters.filter((c) => c.batchId === currentBatch.id).forEach((c) => (count += c.pdfNotes?.length || 0));
      return count;
    }
    return folderNotesContent.length;
  }, [currentBatch, selectedChapterId, lectures, chapters, folderNotesContent]);

  // Comprehensive list of candidate tests: availableTests prop + global published tests + batchTests
  const allCandidateTests = useMemo(() => {
    const testMap = new Map<string, MathTest>();

    // 1. Tests passed as prop
    (availableTests || []).forEach((t) => {
      if (t && t.id && !isDeprecatedTest(t)) testMap.set(t.id, t);
    });

    // 2. Tests from global master published storage
    try {
      const globalPublished = getGlobalPublishedTests();
      (globalPublished || []).forEach((t) => {
        if (t && t.id && !testMap.has(t.id) && !isDeprecatedTest(t)) {
          testMap.set(t.id, t);
        }
      });
    } catch {
      // ignore
    }

    // 3. Batch tests catalog
    (batchTests || []).forEach((bt) => {
      const tid = bt.testId || bt.id;
      if (tid && !testMap.has(tid) && !isDeprecatedTest(bt)) {
        let cached = getCachedFullTest(tid);
        if (!cached && typeof localStorage !== 'undefined') {
          try {
            const raw = localStorage.getItem(`batch_${bt.batchId}_test_${tid}`);
            if (raw) cached = JSON.parse(raw);
          } catch {}
        }
        const resolvedDuration = getTestDurationMinutes(bt) || (cached ? getTestDurationMinutes(cached) : 25);
        const resolvedQuestions = cached?.questions || [];
        testMap.set(tid, {
          id: tid,
          batchId: bt.batchId,
          catalogChunkId: bt.catalogChunkId || (bt as any).chunkId,
          title: bt.title || 'Mock Test',
          topic: bt.topic || (bt as any).subject || 'Assessment',
          difficulty: ((bt.difficulty as any) || 'Medium') as any,
          timeLimitMinutes: resolvedDuration,
          time: resolvedDuration,
          durationMinutes: resolvedDuration,
          questionCount: bt.questionCount || (resolvedQuestions.length > 0 ? resolvedQuestions.length : 20),
          questions: resolvedQuestions,
          isPublic: true,
        } as any);
      }
    });

    return Array.from(testMap.values());
  }, [availableTests, batchTests]);

  // Tests linked to the current folder or batch root
  const folderTests = useMemo(() => {
    const candidateMap = new Map<string, MathTest>();
    allCandidateTests.forEach((t) => candidateMap.set(t.id, t));

    // When inside a folder/chapter
    if (selectedChapterId && currentFolder) {
      const activeBatchId = currentBatch?.id || selectedBatchId;
      const isFirstOrOnlyChapter = chapters.filter((c) => c.batchId === activeBatchId)[0]?.id === selectedChapterId;
      
      const chapterTestIdSet = new Set<string>();
      (currentFolder.testIds || []).forEach((tid) => {
        if (!DEPRECATED_TEST_IDS.has(tid) && !tid.includes('mix_test') && !tid.includes('imported-1789747440687')) {
          chapterTestIdSet.add(tid);
        }
      });

      // Associate batchTests: either explicitly matching chapterId or fallback to first chapter
      (batchTests || []).forEach((bt) => {
        if (!bt.batchId || bt.batchId !== activeBatchId || isDeprecatedTest(bt)) return;
        const tid = bt.testId || bt.id;
        if (!tid) return;
        if (bt.chapterId === selectedChapterId || bt.chapterId === currentFolder.id) {
          chapterTestIdSet.add(tid);
        } else if (!bt.chapterId && isFirstOrOnlyChapter) {
          chapterTestIdSet.add(tid);
        }
      });

      const resolvedList: MathTest[] = [];

      chapterTestIdSet.forEach((tid) => {
        let candidate = candidateMap.get(tid) || getCachedFullTest(tid);
        const bt = (batchTests || []).find((b) => (b.testId === tid || b.id === tid) && b.batchId === activeBatchId);

        if (!candidate && typeof localStorage !== 'undefined') {
          try {
            const raw = localStorage.getItem(`batch_${activeBatchId}_test_${tid}`);
            if (raw) candidate = JSON.parse(raw);
          } catch {}
        }

        const resolvedQuestions = candidate?.questions || [];
        const questionCount = (resolvedQuestions.length > 0 ? resolvedQuestions.length : (bt?.questionCount || candidate?.questionCount || 20));

        if (candidate) {
          const resolvedDuration = (bt ? getTestDurationMinutes(bt) : 0) || getTestDurationMinutes(candidate) || 25;
          resolvedList.push({
            ...candidate,
            id: tid,
            batchId: activeBatchId,
            catalogChunkId: bt?.catalogChunkId || (bt as any)?.chunkId,
            timeLimitMinutes: resolvedDuration,
            time: resolvedDuration,
            durationMinutes: resolvedDuration,
            questionCount,
            questions: resolvedQuestions,
          } as any);
        } else if (bt) {
          const resolvedDuration = getTestDurationMinutes(bt) || 25;
          resolvedList.push({
            id: tid,
            batchId: activeBatchId,
            catalogChunkId: bt.catalogChunkId || (bt as any).chunkId,
            title: bt.title || 'Mock Test',
            topic: bt.topic || (bt as any).subject || currentFolder.title || 'Assessment',
            difficulty: ((bt.difficulty as any) || 'Medium') as any,
            timeLimitMinutes: resolvedDuration,
            time: resolvedDuration,
            durationMinutes: resolvedDuration,
            questionCount,
            questions: resolvedQuestions,
            isPublic: true,
          } as any);
        } else {
          // Fallback placeholder so count and card is never lost
          resolvedList.push({
            id: tid,
            batchId: activeBatchId,
            title: `Mock Test (${currentFolder.title || 'Chapter Test'})`,
            topic: currentFolder.title || 'Assessment',
            difficulty: 'Medium' as any,
            timeLimitMinutes: 25,
            time: 25,
            durationMinutes: 25,
            questionCount: 20,
            questions: [],
            isPublic: true,
          } as any);
        }
      });

      const seenTitles = new Set<string>();
      return resolvedList.filter((t) => {
        if (isDeprecatedTest(t)) return false;
        const norm = (t.title || '').trim().toLowerCase();
        if (!norm || seenTitles.has(norm)) return false;
        seenTitles.add(norm);
        return true;
      });
    }

    // When at root batch level (no specific chapter selected)
    const activeBatchId = currentBatch?.id || selectedBatchId;
    const allBatchFolderTestIds = new Set<string>();
    chapters.filter((c) => c.batchId === activeBatchId).forEach((c) => {
      (c.testIds || []).forEach((tid) => {
        if (!DEPRECATED_TEST_IDS.has(tid) && !tid.includes('mix_test') && !tid.includes('imported-1789747440687')) {
          allBatchFolderTestIds.add(tid);
        }
      });
    });

    const rootList: MathTest[] = [];
    allBatchFolderTestIds.forEach((tid) => {
      const candidate = candidateMap.get(tid) || getCachedFullTest(tid);
      if (candidate && !isDeprecatedTest(candidate)) rootList.push(candidate);
    });

    (batchTests || []).forEach((bt) => {
      if (!bt.batchId || bt.batchId !== activeBatchId || isDeprecatedTest(bt)) return;
      const tid = bt.testId || bt.id;
      if (!rootList.some((t) => t.id === tid)) {
        const candidate = candidateMap.get(tid) || getCachedFullTest(tid);
        if (candidate) {
          if (!isDeprecatedTest(candidate)) rootList.push(candidate);
        } else {
          const resolvedDuration = getTestDurationMinutes(bt);
          rootList.push({
            id: tid,
            title: bt.title || 'Mock Test',
            topic: bt.topic || (bt as any).subject || 'Assessment',
            difficulty: ((bt.difficulty as any) || 'Medium') as any,
            timeLimitMinutes: resolvedDuration,
            time: resolvedDuration,
            durationMinutes: resolvedDuration,
            questionCount: bt.questionCount || 20,
            questions: [],
            isPublic: true,
          });
        }
      }
    });

    return rootList.filter((t) => !isDeprecatedTest(t));
  }, [allCandidateTests, currentFolder, selectedChapterId, chapters, currentBatch, selectedBatchId, batchTests]);

  // Total tests count
  const totalFolderTestsCount = useMemo(() => {
    if (!currentBatch) return 0;
    const activeBatchId = currentBatch.id || selectedBatchId;
    if (!selectedChapterId) {
      return folderTests.length || batchTests.filter((b) => b.batchId === activeBatchId).length;
    }
    return folderTests.length;
  }, [currentBatch, selectedChapterId, folderTests, batchTests, selectedBatchId]);

  // Active Lecture for Player
  const activeLecture = useMemo(() => {
    return lectures.find((l) => l.id === selectedLectureId) || folderLectures[0] || lectures[0];
  }, [lectures, selectedLectureId, folderLectures]);

  // Dedicated collapse/exit handler from lecture view that passes video into YouTube-style bottom strip
  const handleExitLectureView = useCallback(() => {
    if (isBrowserFullscreen()) {
      exitBrowserFullscreen();
    }
    if (activeLecture && onSetMiniPlayer && currentBatch) {
      onSetMiniPlayer({
        lectureId: activeLecture.id,
        lectureTitle: activeLecture.title,
        batchId: currentBatch.id,
        batchTitle: currentBatch.title,
        chapterId: selectedChapterId,
        thumbnailUrl: getLectureThumbnailUrl(activeLecture),
        durationMinutes: activeLecture.durationMinutes,
        encryptedVideoId: activeLecture.encryptedVideoId,
        playbackSeconds: currentPlaybackSec,
        isPlaying: isCurrentLecturePlaying,
      });
    }
    setSelectedLectureId(null);
    consumedLectureIdRef.current = null;
    onLectureChange?.(null);
    setCurrentStage('folder_content');
    onStageChange?.('folder_content');
  }, [activeLecture, currentBatch, selectedChapterId, currentPlaybackSec, isCurrentLecturePlaying, onSetMiniPlayer, onLectureChange, onStageChange]);

  // Centralized Hierarchical Back Navigation Stack:
  // 1. Batch Root -> Batch List (priority 23)
  useBackHandler({
    isOpen: currentStage !== 'batch_list',
    priority: 23,
    id: 'batch_detail_root_back',
    onBack: () => {
      if (isBrowserFullscreen()) {
        exitBrowserFullscreen();
        return;
      }
      setSelectedBatchId('');
      onBatchChange?.(null);
      setCurrentStage('batch_list');
    },
  });

  // 2. Folder / Subfolder -> Parent Folder or Batch Root (priority 25)
  useBackHandler({
    isOpen: currentStage !== 'batch_list' && Boolean(selectedChapterId),
    priority: 25,
    id: `batch_folder_back_${selectedChapterId || 'root'}`,
    onBack: () => {
      if (isBrowserFullscreen()) {
        exitBrowserFullscreen();
        return;
      }
      const cur = chapters.find((c) => c.id === selectedChapterId);
      const parentId = cur?.parentId || null;
      setSelectedChapterId(parentId);
      onChapterChange?.(parentId);
    },
  });

  // 3. Inline Lecture View -> Folder Content (priority 27)
  useBackHandler({
    isOpen: currentStage === 'lecture_view',
    priority: 27,
    id: 'batch_lecture_view_back',
    onBack: () => {
      handleExitLectureView();
    },
  });

  // 4. Document / Media Viewer Modal -> Folder Content (priority 30)
  useBackHandler({
    isOpen: isViewerOpen,
    priority: 30,
    id: 'batch_viewer_modal_back',
    onBack: () => {
      setIsViewerOpen(false);
    },
  });

  const goToBatchFolders = (batchId: string) => {
    const targetBatch = batches.find((b) => b.id === batchId);
    if (!targetBatch) return;
    const hasEnrollment = isEnrolled(batchId);
    const guestAllowed = isGuestAllowedForBatch(batchId);

    // Rule 1: Draft or Secret Roster course strictly requires official roster enrollment
    if (!isMaster && (targetBatch.isPublished === false || targetBatch.isPrivateRosterOnly === true) && !hasEnrollment) {
      showSecurityToast(`Access Locked: "${targetBatch.title}" is private. Official student roster admission is required.`);
      return;
    }

    // Rule 2: Live course with non-enrolled user: if guest pass is enabled, activate free pass
    if (!isMaster && !hasEnrollment && guestAllowed) {
      enrollAsGuest(batchId);
    }
    // If not enrolled and guest pass is off, user enters in Curriculum Preview / Exploration mode!

    setSelectedBatchId(batchId);
    onBatchChange?.(batchId);
    setSelectedChapterId(null);
    onChapterChange?.(null);
    setFolderActiveTab('videos');
    onFolderTabChange?.('videos');
    setCurrentStage('folder_content');
  };

  const handleGoToAllCourses = useCallback(() => {
    setSelectedBatchId('');
    setSelectedChapterId(null);
    setSelectedLectureId(null);
    consumedLectureIdRef.current = null;
    onBatchChange?.(null);
    onChapterChange?.(null);
    onLectureChange?.(null);
    setCurrentStage('batch_list');
    onStageChange?.('batch_list');
  }, [onBatchChange, onChapterChange, onLectureChange, onStageChange]);

  const handleGoToBatchRoot = useCallback(() => {
    setSelectedChapterId(null);
    setSelectedLectureId(null);
    consumedLectureIdRef.current = null;
    onChapterChange?.(null);
    onLectureChange?.(null);
    setCurrentStage('folder_content');
    onStageChange?.('folder_content');
  }, [onChapterChange, onLectureChange, onStageChange]);

  const handleGoToChapter = useCallback((chapterId: string) => {
    setSelectedChapterId(chapterId);
    setSelectedLectureId(null);
    consumedLectureIdRef.current = null;
    onChapterChange?.(chapterId);
    onLectureChange?.(null);
    setCurrentStage('folder_content');
    onStageChange?.('folder_content');
  }, [onChapterChange, onLectureChange, onStageChange]);

  const handleStepBack = useCallback(() => {
    if (selectedChapterId) {
      const cur = chapters.find((c) => c.id === selectedChapterId);
      const parentId = cur?.parentId || null;
      if (parentId) {
        handleGoToChapter(parentId);
      } else {
        handleGoToBatchRoot();
      }
    } else {
      handleGoToAllCourses();
    }
  }, [selectedChapterId, chapters, handleGoToChapter, handleGoToBatchRoot, handleGoToAllCourses]);

  const goToFolderContent = (chapterId: string) => {
    handleGoToChapter(chapterId);
  };

  const goToLectureView = (lectureId: string) => {
    const targetLecture = lectures.find((l) => l.id === lectureId) || folderLectures.find((l) => l.id === lectureId);
    const hasFullAccess = isMaster || (currentBatch && (isEnrolled(currentBatch.id) || isGuestAllowedForBatch(currentBatch.id)));
    const canPlay = hasFullAccess || Boolean(targetLecture?.isFreePreview);

    if (!canPlay) {
      showSecurityToast(`Access Locked: "${targetLecture?.title || 'This video'}" requires full course enrollment.`);
      return;
    }

    if (targetLecture && currentBatch && onPlayLecture) {
      onPlayLecture(targetLecture, currentBatch, selectedChapterId);
      setSelectedLectureId(lectureId);
      consumedLectureIdRef.current = lectureId;
      onLectureChange?.(lectureId);
      return;
    }
    onSetMiniPlayer?.(null);
    setSelectedLectureId(lectureId);
    consumedLectureIdRef.current = lectureId;
    onLectureChange?.(lectureId);
    setCurrentStage('lecture_view');
    onStageChange?.('lecture_view');
  };

  const handleCreateNote = (e: React.FormEvent) => {
    e.preventDefault();
    if (!noteInputText.trim() || !activeLecture) return;
    addPersonalNote({
      lectureId: activeLecture.id,
      seconds: 0,
      text: noteInputText.trim(),
    });
    setNoteInputText('');
    showSecurityToast('Study note saved successfully');
  };

  /* =========================================================================
     STAGE 1: BATCH LIST (Shows the list of batches with All / My Batches filters)
     ========================================================================= */
  if (currentStage === 'batch_list') {
    return (
      <div className="space-y-6 pb-28 sm:pb-28 md:pb-16 max-w-7xl mx-auto m3-transition-enter">
        {/* Course Filter Toggle: All Courses vs My Courses & Master Actions */}
        <div className="flex items-center justify-between gap-2 pb-1 flex-nowrap w-full overflow-x-auto [scrollbar-width:none]">
          {isMaster ? (
            <button
              type="button"
              id="create-new-batch-btn"
              onClick={() => setIsCreateBatchModalOpen(true)}
              className="px-3 sm:px-4 py-2 rounded-full bg-[#0b57d0] hover:bg-[#0842a0] text-white font-bold text-xs flex items-center gap-1.5 shadow-xs transition border-none cursor-pointer active:scale-95 shrink-0 whitespace-nowrap"
              title="Create New Batch"
            >
              <Plus className="w-4 h-4 stroke-[2.5] shrink-0" />
              <span>New Batch</span>
            </button>
          ) : (
            <div />
          )}

          {/* Unified Single Toggle Container for All Courses vs My Courses */}
          <div className="inline-flex items-center p-1 rounded-full bg-white dark:bg-[#1e2024] shadow-[0_2px_6px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.05)] dark:shadow-[0_2px_8px_rgba(0,0,0,0.35)] border-0 shrink-0">
            <button
              id="batch-filter-all-btn"
              type="button"
              onClick={() => setBatchFilter('all')}
              className={`h-8 sm:h-8.5 px-3 sm:px-4 rounded-full text-xs font-bold transition-all duration-200 border-0 outline-none cursor-pointer flex items-center gap-1.5 active:scale-95 whitespace-nowrap ${
                batchFilter === 'all'
                  ? 'bg-[#0b57d0] text-white shadow-[0_2px_6px_rgba(11,87,208,0.25)]'
                  : 'bg-transparent text-slate-700 dark:text-zinc-300 hover:text-slate-900 dark:hover:text-zinc-100 font-semibold'
              }`}
            >
              <span>All Courses</span>
              <span
                className={`px-1.5 sm:px-2 py-0.5 rounded-full text-[10px] font-bold tabular-nums ${
                  batchFilter === 'all'
                    ? 'bg-white/20 text-white'
                    : 'bg-slate-100 dark:bg-zinc-800 text-slate-700 dark:text-zinc-300'
                }`}
              >
                {batches.length}
              </span>
            </button>
            <button
              id="batch-filter-my-btn"
              type="button"
              onClick={() => setBatchFilter('my-batches')}
              className={`h-8 sm:h-8.5 px-3 sm:px-4 rounded-full text-xs font-bold transition-all duration-200 border-0 outline-none cursor-pointer flex items-center gap-1.5 active:scale-95 whitespace-nowrap ${
                batchFilter === 'my-batches'
                  ? 'bg-[#0b57d0] text-white shadow-[0_2px_6px_rgba(11,87,208,0.25)]'
                  : 'bg-transparent text-slate-700 dark:text-zinc-300 hover:text-slate-900 dark:hover:text-zinc-100 font-semibold'
              }`}
            >
              <span>My Courses</span>
              <span
                className={`px-1.5 sm:px-2 py-0.5 rounded-full text-[10px] font-bold tabular-nums ${
                  batchFilter === 'my-batches'
                    ? 'bg-white/20 text-white'
                    : 'bg-slate-100 dark:bg-zinc-800 text-slate-700 dark:text-zinc-300'
                }`}
              >
                {enrolledBatches.length}
              </span>
            </button>
          </div>
        </div>

        {displayedBatches.length > 0 ? (
          <div className="grid grid-cols-1 responsive-tablet-batches-grid gap-4 sm:gap-5">
            {displayedBatches.map((b) => (
              <div
                key={b.id}
                onClick={() => goToBatchFolders(b.id)}
                className="bg-white dark:bg-[#1e2024] rounded-3xl border-0 shadow-[0_2px_6px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.05)] dark:shadow-[0_2px_8px_rgba(0,0,0,0.35)] hover:shadow-[0_6px_16px_rgba(0,0,0,0.12)] dark:hover:shadow-[0_6px_20px_rgba(0,0,0,0.5)] overflow-hidden transition-all duration-200 group cursor-pointer flex flex-col justify-between"
              >
                <div
                  className="relative aspect-[1200/500] w-full overflow-hidden bg-slate-900"
                  style={{ aspectRatio: '1200 / 500' }}
                >
                  <img
                    src={b.bannerUrl || b.thumbnailUrl}
                    alt={b.title}
                    className="w-full h-full object-cover group-hover:scale-105 transition duration-500"
                    onError={(e) => {
                      (e.currentTarget as HTMLImageElement).src = '/assets/default-course-banner.png';
                    }}
                  />
                  <span className="absolute top-3 left-3 px-3 py-1 rounded-full bg-black/60 backdrop-blur-md text-white font-bold text-[10px] tracking-wider uppercase">
                    {b.category}
                  </span>
                  {b.isPublished === false ? (
                    <span className={`absolute top-3 ${isMaster ? 'right-11' : 'right-3'} px-2.5 py-0.5 rounded-full bg-amber-600/90 text-white font-bold text-[9px] uppercase tracking-wider flex items-center space-x-1 shadow-xs`}>
                      <Lock className="w-3 h-3" />
                      <span>Draft</span>
                    </span>
                  ) : b.isPrivateRosterOnly ? (
                    <span className={`absolute top-3 ${isMaster ? 'right-11' : 'right-3'} px-2.5 py-0.5 rounded-full bg-indigo-600/90 text-white font-bold text-[9px] uppercase tracking-wider flex items-center space-x-1 shadow-xs`}>
                      <Lock className="w-3 h-3" />
                      <span>Roster Only</span>
                    </span>
                  ) : b.allowGuestAccess ? (
                    <span className={`absolute top-3 ${isMaster ? 'right-11' : 'right-3'} px-2.5 py-0.5 rounded-full bg-emerald-600/90 text-white font-bold text-[9px] uppercase tracking-wider flex items-center space-x-1 shadow-xs`}>
                      <Sparkles className="w-3 h-3" />
                      <span>Guest Pass</span>
                    </span>
                  ) : null}

                  {/* Master Admin 3-Dots Quick Actions Menu */}
                  {isMaster && (
                    <div className="absolute top-2.5 right-2.5 z-20">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setActiveCardMenuBatchId(activeCardMenuBatchId === b.id ? null : b.id);
                        }}
                        className="w-7 h-7 rounded-full bg-black/70 hover:bg-black/90 active:scale-95 text-white flex items-center justify-center backdrop-blur-md transition shadow-md border-none cursor-pointer"
                        title="Course Management Options"
                        aria-label="Course Management Options"
                      >
                        <MoreVertical className="w-4 h-4" />
                      </button>

                      {activeCardMenuBatchId === b.id && (
                        <div
                          className="absolute right-0 top-8 w-48 bg-white dark:bg-[#1e2024] rounded-2xl shadow-2xl border border-[var(--md-sys-color-outline-variant)]/20 py-1.5 z-30 animate-fade-in text-xs font-semibold"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            type="button"
                            onClick={() => {
                              setActiveCardMenuBatchId(null);
                              setBatchToEdit(b);
                              setIsEditBatchModalOpen(true);
                            }}
                            className="w-full px-3.5 py-2 text-left text-[var(--md-sys-color-on-surface)] hover:bg-[var(--md-sys-color-surface-container-high)] flex items-center space-x-2 border-none bg-transparent cursor-pointer"
                          >
                            <Edit3 className="w-3.5 h-3.5 text-[#0b57d0]" />
                            <span>Edit Details & Price</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              setActiveCardMenuBatchId(null);
                              setBatchForRoster(b);
                              setIsBatchRosterModalOpen(true);
                            }}
                            className="w-full px-3.5 py-2 text-left text-[var(--md-sys-color-on-surface)] hover:bg-[var(--md-sys-color-surface-container-high)] flex items-center space-x-2 border-none bg-transparent cursor-pointer"
                          >
                            <Users className="w-3.5 h-3.5 text-emerald-600" />
                            <span>Manage Students</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              setActiveCardMenuBatchId(null);
                              handleBroadcastBatchAsHero(b);
                            }}
                            className="w-full px-3.5 py-2 text-left text-orange-600 dark:text-orange-400 hover:bg-orange-500/10 flex items-center space-x-2 border-none bg-transparent cursor-pointer font-bold"
                          >
                            <Megaphone className="w-3.5 h-3.5" />
                            <span>Broadcast to Home Banner</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              setActiveCardMenuBatchId(null);
                              const willPublish = b.isPublished === false;
                              updateBatch(b.id, { isPublished: willPublish });
                              showSecurityToast(
                                willPublish
                                  ? `Batch "${b.title}" is now Published (Live)`
                                  : `Batch "${b.title}" moved to Draft mode`
                              );
                            }}
                            className="w-full px-3.5 py-2 text-left text-[var(--md-sys-color-on-surface)] hover:bg-[var(--md-sys-color-surface-container-high)] flex items-center space-x-2 border-none bg-transparent cursor-pointer"
                          >
                            <Globe className="w-3.5 h-3.5 text-indigo-500" />
                            <span>{b.isPublished === false ? 'Publish (Go Live)' : 'Set to Draft'}</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              setActiveCardMenuBatchId(null);
                              toggleBatchGuestAccess(b.id);
                            }}
                            className="w-full px-3.5 py-2 text-left text-[var(--md-sys-color-on-surface)] hover:bg-[var(--md-sys-color-surface-container-high)] flex items-center space-x-2 border-none bg-transparent cursor-pointer"
                          >
                            <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                            <span>{b.allowGuestAccess ? 'Disable Guest Pass' : 'Enable Guest Pass'}</span>
                          </button>

                          <div className="my-1 border-t border-[var(--md-sys-color-outline-variant)]/15" />

                          <button
                            type="button"
                            onClick={() => {
                              setActiveCardMenuBatchId(null);
                              setDeleteModalConfig({
                                isOpen: true,
                                title: 'Delete Course Batch',
                                message: `Are you sure you want to delete "${b.title}"? This cannot be undone.`,
                                onConfirm: () => {
                                  deleteBatch(b.id);
                                  showSecurityToast(`Batch "${b.title}" deleted.`);
                                },
                              });
                            }}
                            className="w-full px-3.5 py-2 text-left text-rose-600 dark:text-rose-400 hover:bg-rose-500/10 flex items-center space-x-2 border-none bg-transparent cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>Delete Batch</span>
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <div className="px-3.5 sm:px-4.5 pt-1.5 sm:pt-2 pb-2.5 sm:pb-3 flex-1 min-w-0 flex flex-col justify-between space-y-1.5 sm:space-y-2">
                  <div>
                    <h3 className="text-[15px] sm:text-base font-bold text-[var(--md-sys-color-on-surface)] group-hover:text-[var(--md-sys-color-primary)] transition leading-snug line-clamp-1">
                      {b.title}
                    </h3>
                    {b.description && (
                      <p className="text-[11px] sm:text-xs text-[var(--md-sys-color-on-surface-variant)] line-clamp-2 mt-0.5">
                        {b.description}
                      </p>
                    )}
                  </div>

                  <div className="flex items-center justify-between pt-0.5 border-0 text-xs text-[var(--md-sys-color-on-surface-variant)] mt-auto">
                    <div className="flex items-center space-x-2">
                      <img
                        src={getFacultyAvatarUrl(b.instructor?.avatarUrl)}
                        alt={b.instructor?.name || 'Instructor'}
                        className="w-6 h-6 rounded-full object-cover shrink-0"
                        onError={(e) => {
                          (e.currentTarget as HTMLImageElement).src = '/assets/default-profile.png';
                        }}
                      />
                      <span className="truncate max-w-[120px] font-medium">{b.instructor?.name || 'Elevate Faculty'}</span>
                    </div>

                    {isMaster && b.isPublished === false ? (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          goToBatchFolders(b.id);
                        }}
                        className="h-8 px-3.5 rounded-full text-xs font-bold flex items-center space-x-1.5 bg-amber-500/15 text-amber-800 dark:text-amber-200 border-0 outline-none cursor-pointer hover:bg-amber-500/25 transition"
                      >
                        <Edit3 className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                        <span>Manage Draft</span>
                      </button>
                    ) : isEnrolled(b.id) ? (
                      <div className="flex items-center space-x-1.5 text-xs font-bold text-emerald-700 dark:text-emerald-400 bg-emerald-500/10 px-3 py-1 rounded-full border-0">
                        <CheckCircle className="w-3.5 h-3.5" />
                        <span>Enrolled</span>
                      </div>
                    ) : b.allowGuestAccess ? (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          enrollAsGuest(b.id);
                          setSelectedBatchId(b.id);
                          setCurrentStage('folder_content');
                        }}
                        className="h-8 px-3.5 rounded-full text-xs font-bold flex items-center space-x-1.5 bg-[#0b57d0] hover:bg-[#0842a0] text-white border-0 outline-none cursor-pointer shadow-[0_2px_6px_rgba(11,87,208,0.25)] active:scale-95 transition"
                      >
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>Free Access</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          goToBatchFolders(b.id);
                        }}
                        className="h-8 px-3.5 rounded-full text-xs font-bold flex items-center space-x-1.5 text-[#0b57d0] dark:text-[#a8c7fa] bg-[#0b57d0]/10 hover:bg-[#0b57d0]/15 border-0 outline-none cursor-pointer transition"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>Explore Syllabus</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="p-12 text-center bg-[var(--md-sys-color-surface-container)] rounded-3xl space-y-4 max-w-lg mx-auto my-8">
            <BookOpen className="w-12 h-12 text-[var(--md-sys-color-outline)] mx-auto opacity-50" />
            <h3 className="text-lg font-bold text-[var(--md-sys-color-on-surface)]">
              No Enrolled Courses
            </h3>
            <p className="text-xs text-[var(--md-sys-color-on-surface-variant)] leading-relaxed">
              You are not currently enrolled in any courses. Explore our available courses to get started.
            </p>
            <button
              type="button"
              onClick={() => setBatchFilter('all')}
              className="m3-btn-filled px-5 py-2.5 text-xs font-bold rounded-full cursor-pointer border-none"
            >
              Explore All Courses
            </button>
          </div>
        )}

        {/* MODAL: CREATE BATCH (Exclusively for Master Admin) */}
        {isMaster && (
          <>
            <CreateBatchModal
              isOpen={isCreateBatchModalOpen}
              onClose={() => setIsCreateBatchModalOpen(false)}
              onCreate={(batchData) => {
                addBatch(batchData as any);
              }}
            />

            <EditBatchModal
              isOpen={isEditBatchModalOpen}
              onClose={() => {
                setIsEditBatchModalOpen(false);
                setBatchToEdit(null);
              }}
              batch={batchToEdit}
              onSave={(bId, updated) => {
                updateBatch(bId, updated);
                showSecurityToast(`Batch settings updated.`);
              }}
              onDelete={(bId) => {
                deleteBatch(bId);
                showSecurityToast(`Batch deleted.`);
              }}
            />

            <BatchRosterModal
              isOpen={isBatchRosterModalOpen}
              onClose={() => {
                setIsBatchRosterModalOpen(false);
                setBatchForRoster(null);
              }}
              batch={batchForRoster}
            />
          </>
        )}
      </div>
    );
  }

  /* =========================================================================
     STAGE 2 & 3: GOOGLE DRIVE-STYLE HIERARCHICAL FOLDER & CONTENT EXPLORER
     ========================================================================= */
  if (currentStage === 'folder_content') {
    // Gatekeeper: Draft or Secret courses MUST be accessed ONLY by Master or enrolled students!
    const isSecretOrDraft = currentBatch.isPublished === false || currentBatch.isPrivateRosterOnly === true;
    const canAccessFolderContent = isMaster || isEnrolled(currentBatch.id) || !isSecretOrDraft;
    if (!canAccessFolderContent) {
      return (
        <div className="p-8 text-center max-w-md mx-auto my-12 rounded-3xl bg-[var(--md-sys-color-surface-container)] space-y-4">
          <div className="w-12 h-12 rounded-full bg-rose-500/15 text-rose-500 flex items-center justify-center mx-auto">
            <Lock className="w-6 h-6" />
          </div>
          <h3 className="text-base font-bold text-[var(--md-sys-color-on-surface)]">
            {currentBatch.isPublished === false ? 'Draft Mode Course' : 'Roster Admission Required'}
          </h3>
          <p className="text-xs text-[var(--md-sys-color-on-surface-variant)] leading-relaxed">
            {currentBatch.isPublished === false
              ? `"${currentBatch.title}" is currently in Draft mode. Access is restricted to instructors and officially enrolled students.`
              : `"${currentBatch.title}" is private and restricted to enrolled students. Your account is not on the active roster for this course.`}
          </p>
          <button
            type="button"
            onClick={handleGoToAllCourses}
            className="px-5 py-2.5 rounded-full bg-[#0b57d0] text-white text-xs font-bold border-0 cursor-pointer transition active:scale-95"
          >
            Return to Courses
          </button>
        </div>
      );
    }

    const hasFullBatchAccess = isMaster || isEnrolled(currentBatch.id) || isGuestAllowedForBatch(currentBatch.id);

    return (
      <div className="space-y-4 pb-28 sm:pb-28 md:pb-16 max-w-7xl mx-auto m3-transition-enter">
        {/* Sticky Non-Scrollable Header: Breadcrumbs + Actions + Videos/Notes/Tests Toggle (Zero Partition Line) */}
        <div className="sticky top-[calc(var(--android-status-bar-height,env(safe-area-inset-top,0px))+3.5rem)] sm:top-[calc(var(--android-status-bar-height,env(safe-area-inset-top,0px))+3.8rem)] z-30 bg-white dark:bg-[#0b0c10] -mx-3 sm:-mx-6 px-3 sm:px-6 pt-1 pb-2.5 space-y-3 border-0 shadow-none">
        {/* Top Header: Back Button & Dynamic Google Drive Breadcrumbs */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-1 border-0 border-none">
          <div className="flex items-center space-x-2 flex-wrap gap-y-1.5">
            {/* Direct Step-Back Button */}
            <button
              onClick={handleStepBack}
              className="p-1.5 rounded-full hover:bg-[var(--md-sys-color-surface-container-high)] text-[var(--md-sys-color-on-surface)] border-none bg-transparent cursor-pointer flex items-center justify-center transition shrink-0"
              title="Up one level"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>

            {/* Google Drive Breadcrumbs Trail */}
            <div className="flex items-center space-x-1.5 text-[13px] sm:text-xs font-semibold overflow-x-auto py-1 scrollbar-none">
              <button
                onClick={handleGoToAllCourses}
                className="px-2 py-1 rounded-lg hover:bg-[var(--md-sys-color-surface-container)] text-slate-700 dark:text-zinc-300 font-semibold border-none bg-transparent cursor-pointer shrink-0"
              >
                All Courses
              </button>

              <ChevronRight className="w-3.5 h-3.5 text-slate-600 dark:text-zinc-400 shrink-0" />

              <button
                onClick={handleGoToBatchRoot}
                className={`px-2.5 py-1 rounded-lg border-none bg-transparent cursor-pointer shrink-0 truncate max-w-[140px] sm:max-w-xs ${
                  !selectedChapterId
                    ? 'font-bold text-[var(--md-sys-color-primary)] bg-[var(--md-sys-color-surface-container)]'
                    : 'text-slate-700 dark:text-zinc-300 font-semibold hover:bg-[var(--md-sys-color-surface-container)]'
                }`}
                title={currentBatch.title}
              >
                {currentBatch.title}
              </button>

              {breadcrumbPath.map((crumb, idx) => {
                if (!crumb.id) return null; // skip root label already rendered above
                const isCurrent = crumb.id === selectedChapterId;
                return (
                  <React.Fragment key={crumb.id}>
                    <ChevronRight className="w-3.5 h-3.5 text-slate-600 dark:text-zinc-400 shrink-0" />
                    <button
                      onClick={() => handleGoToChapter(crumb.id)}
                      className={`px-2.5 py-1 rounded-lg border-none bg-transparent cursor-pointer shrink-0 truncate max-w-[130px] sm:max-w-xs ${
                        isCurrent
                          ? 'font-bold text-[var(--md-sys-color-primary)] bg-[var(--md-sys-color-surface-container)]'
                          : 'text-slate-700 dark:text-zinc-300 font-semibold hover:bg-[var(--md-sys-color-surface-container)]'
                      }`}
                      title={crumb.title}
                    >
                      {crumb.title}
                    </button>
                  </React.Fragment>
                );
              })}
            </div>
          </div>

          {/* Master Admin Contextual Action Bar (Compact Round Icon Buttons on Mobile, Full Pills on Desktop) */}
          {isMaster && (
            <div className="flex items-center justify-end gap-2 sm:gap-2.5 shrink-0 flex-nowrap self-end ml-auto overflow-x-auto pt-2 pb-1.5 px-1.5 [scrollbar-width:none]">
              {/* Batch Management: Students Roster & Batch Settings */}
              <button
                type="button"
                onClick={() => {
                  setBatchForRoster(currentBatch);
                  setIsBatchRosterModalOpen(true);
                }}
                className="relative w-9 h-9 md:w-auto md:h-auto p-0 md:px-3 md:py-1.5 aspect-square md:aspect-auto rounded-full bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs flex items-center justify-center md:space-x-1.5 shadow-xs active:scale-95 transition border-none cursor-pointer shrink-0"
                title={`Manage Students (${getEnrollmentsForBatch(currentBatch?.id || selectedBatchId).length})`}
                aria-label="Manage Students"
              >
                <Users className="w-4 h-4 shrink-0" />
                <span className="hidden md:inline">Students ({getEnrollmentsForBatch(currentBatch?.id || selectedBatchId).length})</span>
                {getEnrollmentsForBatch(currentBatch?.id || selectedBatchId).length > 0 && (
                  <span className="md:hidden absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-emerald-950 text-white text-[10px] font-extrabold flex items-center justify-center shadow-xs leading-none pointer-events-none z-10 tabular-nums">
                    {getEnrollmentsForBatch(currentBatch?.id || selectedBatchId).length}
                  </span>
                )}
              </button>

              <button
                type="button"
                onClick={() => currentBatch && handleBroadcastBatchAsHero(currentBatch)}
                className="relative w-9 h-9 md:w-auto md:h-auto p-0 md:px-3 md:py-1.5 aspect-square md:aspect-auto rounded-full bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 active:scale-95 text-white font-bold text-xs flex items-center justify-center md:space-x-1.5 shadow-xs transition border-none cursor-pointer shrink-0"
                title="Broadcast this Course Batch as a 1200x500 Hero Banner on Home Screen"
                aria-label="Broadcast Batch"
              >
                <Megaphone className="w-4 h-4 shrink-0" />
                <span className="hidden md:inline">Broadcast Batch</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setBatchToEdit(currentBatch);
                  setIsEditBatchModalOpen(true);
                }}
                className="relative w-9 h-9 md:w-auto md:h-auto p-0 md:px-3 md:py-1.5 aspect-square md:aspect-auto rounded-full bg-slate-700 hover:bg-slate-800 dark:bg-slate-600 dark:hover:bg-slate-500 text-white font-bold text-xs flex items-center justify-center md:space-x-1.5 shadow-xs active:scale-95 transition border-none cursor-pointer shrink-0"
                title="Edit Batch Settings, Pricing and Access"
                aria-label="Batch Settings"
              >
                <Settings className="w-4 h-4 shrink-0" />
                <span className="hidden md:inline">Settings</span>
              </button>

              <div className="w-[1px] h-4 sm:h-5 bg-[var(--md-sys-color-outline-variant)]/40 mx-0.5 shrink-0" />

              <button
                type="button"
                onClick={() => {
                  setEditingFolder(null);
                  setIsFolderModalOpen(true);
                }}
                className="w-9 h-9 md:w-auto md:h-auto p-0 md:px-3 md:py-1.5 aspect-square md:aspect-auto rounded-full bg-[#0b57d0] dark:bg-[#a8c7fa] text-white dark:text-[#041e49] font-bold text-xs flex items-center justify-center md:space-x-1.5 shadow-xs hover:opacity-90 active:scale-95 transition border-none cursor-pointer shrink-0"
                title={selectedChapterId ? "Add Subfolder" : "Add Chapter Folder"}
                aria-label={selectedChapterId ? "Add Subfolder" : "Add Folder"}
              >
                <FolderPlus className="w-4 h-4 shrink-0" />
                <span className="hidden md:inline">{selectedChapterId ? "+ Subfolder" : "+ Folder"}</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setEditingLecture(null);
                  setIsVideoModalOpen(true);
                }}
                className="w-9 h-9 md:w-auto md:h-auto p-0 md:px-3 md:py-1.5 aspect-square md:aspect-auto rounded-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs flex items-center justify-center md:space-x-1.5 shadow-xs active:scale-95 transition border-none cursor-pointer shrink-0"
                title="Add Video Lecture"
                aria-label="Add Lecture"
              >
                <Video className="w-4 h-4 shrink-0" />
                <span className="hidden md:inline">+ Lecture</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setEditingNote(null);
                  setIsNoteModalOpen(true);
                }}
                className="w-9 h-9 md:w-auto md:h-auto p-0 md:px-3 md:py-1.5 aspect-square md:aspect-auto rounded-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center justify-center md:space-x-1.5 shadow-xs active:scale-95 transition border-none cursor-pointer shrink-0"
                title="Add Notes or Document Files"
                aria-label="Add File"
              >
                <FilePlus className="w-4 h-4 shrink-0" />
                <span className="hidden md:inline">+ File</span>
              </button>

              <button
                type="button"
                onClick={() => setIsLinkTestModalOpen(true)}
                className="w-9 h-9 md:w-auto md:h-auto p-0 md:px-3 md:py-1.5 aspect-square md:aspect-auto rounded-full bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs flex items-center justify-center md:space-x-1.5 shadow-xs active:scale-95 transition border-none cursor-pointer shrink-0"
                title="Link Mock Test"
                aria-label="Link Test"
              >
                <Award className="w-4 h-4 shrink-0" />
                <span className="hidden md:inline">+ Test</span>
              </button>
            </div>
          )}
        </div>

        {/* Curriculum Preview Banner for Non-Enrolled Users */}
        {!hasFullBatchAccess && (
          <div className="flex items-center justify-between p-4 sm:p-5 rounded-3xl bg-white dark:bg-[#1e2024] border-0 shadow-[0_2px_6px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.05)] dark:shadow-[0_2px_8px_rgba(0,0,0,0.35)] text-[#1f1f1f] dark:text-[#e3e3e3] animate-fade-in">
            <div className="flex items-center space-x-3">
              <div className="w-9 h-9 rounded-full bg-amber-500/15 flex items-center justify-center text-amber-600 dark:text-amber-400 shrink-0 border-0">
                <Lock className="w-4 h-4" />
              </div>
              <div>
                <p className="text-xs font-bold text-[#1f1f1f] dark:text-[#e3e3e3]">Curriculum Exploration Mode</p>
                <p className="text-[11px] text-slate-700 dark:text-zinc-300 font-medium">You can explore folders and syllabus preview. Full video playback, study notes, and mock tests are restricted to enrolled students.</p>
              </div>
            </div>
            {currentBatch.price ? (
              <span className="text-xs font-bold px-3 py-1 rounded-full bg-amber-500/15 text-amber-800 dark:text-amber-200 border-0 shrink-0">
                ₹{currentBatch.price}
              </span>
            ) : null}
          </div>
        )}

        {/* Draft Mode Notice Banner (Faculty only) */}
        {isMaster && currentBatch && currentBatch.isPublished === false && (
          <div className="flex items-center justify-between p-3.5 sm:p-4 rounded-2xl bg-amber-500/15 border border-amber-500/30 text-amber-900 dark:text-amber-200">
            <div className="flex items-center space-x-2.5 min-w-0">
              <Lock className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
              <div className="text-xs">
                <p className="font-bold">Draft Mode Active</p>
                <p className="text-[11px] opacity-90 truncate max-w-xs sm:max-w-md">This course is hidden from students. Only instructors can access and edit curriculum.</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                updateBatch(currentBatch.id, { isPublished: true });
                showSecurityToast(`Batch "${currentBatch.title}" is now Published (Live)!`);
              }}
              className="px-3.5 py-1.5 rounded-full bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs flex items-center space-x-1.5 shadow-xs transition border-none cursor-pointer shrink-0 ml-2"
            >
              <Globe className="w-3.5 h-3.5" />
              <span>Publish (Go Live)</span>
            </button>
          </div>
        )}

        {/* TOP TOGGLE BAR: VIDEOS | NOTES | TESTS (Only displayed inside subfolders; hidden on batch root folder listing) */}
        {shouldShowContentTabs && (
          <div className="flex items-center space-x-1.5 p-1 bg-slate-100/70 dark:bg-zinc-900/60 rounded-full max-w-md border-0">
            <button
              type="button"
              onClick={() => {
                setFolderActiveTab('videos');
                onFolderTabChange?.('videos');
              }}
              className={`flex-1 h-9 px-3.5 sm:px-4 rounded-full text-[13px] sm:text-xs font-bold transition flex items-center justify-center space-x-1.5 border-0 outline-none cursor-pointer active:scale-95 ${
                folderActiveTab === 'videos'
                  ? 'bg-[#0b57d0] text-white shadow-[0_2px_6px_rgba(11,87,208,0.25)]'
                  : 'text-slate-700 dark:text-zinc-300 hover:text-[#1f1f1f] dark:hover:text-[#e3e3e3] bg-transparent'
              }`}
            >
              <PlayCircle className="w-3.5 h-3.5" />
              <span>Videos ({totalFolderVideosCount})</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setFolderActiveTab('notes_content');
                onFolderTabChange?.('notes_content');
              }}
              className={`flex-1 h-9 px-3.5 sm:px-4 rounded-full text-[13px] sm:text-xs font-bold transition flex items-center justify-center space-x-1.5 border-0 outline-none cursor-pointer active:scale-95 ${
                folderActiveTab === 'notes_content'
                  ? 'bg-[#0b57d0] text-white shadow-[0_2px_6px_rgba(11,87,208,0.25)]'
                  : 'text-slate-700 dark:text-zinc-300 hover:text-[#1f1f1f] dark:hover:text-[#e3e3e3] bg-transparent'
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              <span>Notes ({totalFolderNotesCount})</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setFolderActiveTab('tests');
                onFolderTabChange?.('tests');
              }}
              className={`flex-1 h-9 px-3.5 sm:px-4 rounded-full text-[13px] sm:text-xs font-bold transition flex items-center justify-center space-x-1.5 border-0 outline-none cursor-pointer active:scale-95 ${
                folderActiveTab === 'tests'
                  ? 'bg-[#0b57d0] text-white shadow-[0_2px_6px_rgba(11,87,208,0.25)]'
                  : 'text-slate-700 dark:text-zinc-300 hover:text-[#1f1f1f] dark:hover:text-[#e3e3e3] bg-transparent'
              }`}
            >
              <Award className="w-3.5 h-3.5" />
              <span>Tests ({totalFolderTestsCount})</span>
            </button>
          </div>
        )}
        </div>

        {/* SECTION 1: SUBFOLDERS GRID (Spacious 2-Col Wide Folder Cards on Desktop, Full Width on Mobile with Partition Lines) */}
        {currentSubfolders.length > 0 && (
          <div className="space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 sm:gap-x-8 gap-y-0">
              {currentSubfolders.map((fld) => {
                const subLectures = lectures.filter((l) => l.chapterId === fld.id && l.batchId === currentBatch.id);
                let notesCount = (fld.pdfNotes?.length || 0);
                subLectures.forEach((l) => (notesCount += l.pdfNotes?.length || 0));
                
                const activeBatchId = currentBatch?.id || selectedBatchId;
                const isFirstOrOnlyChapter = chapters.filter((c) => c.batchId === activeBatchId)[0]?.id === fld.id;
                const folderTestIdSet = new Set<string>();
                (fld.testIds || []).forEach((tid) => folderTestIdSet.add(tid));
                (batchTests || []).forEach((bt) => {
                  if (bt.batchId !== activeBatchId) return;
                  const tid = bt.testId || bt.id;
                  if (!tid) return;
                  if (bt.chapterId === fld.id || fld.testIds?.includes(tid)) {
                    folderTestIdSet.add(tid);
                  } else if (!bt.chapterId && isFirstOrOnlyChapter) {
                    folderTestIdSet.add(tid);
                  }
                });
                const subTestsCount = folderTestIdSet.size;
                const nestedChildFolders = chapters.filter((c) => c.parentId === fld.id);

                return (
                  <div
                    key={fld.id}
                    onClick={() => goToFolderContent(fld.id)}
                    className={`py-3 sm:py-3.5 px-2 sm:px-3 bg-transparent hover:bg-slate-50/80 dark:hover:bg-zinc-900/50 ${isNativeAndroidApp ? '' : 'md:border-b border-slate-200/80 dark:border-zinc-800/80'} cursor-pointer transition-colors duration-150 flex items-center justify-between group relative`}
                  >
                    <div className="flex items-center space-x-3 min-w-0 flex-1">
                      <div
                        className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 border-0"
                        style={{ backgroundColor: fld.color ? `${fld.color}15` : '#0b57d015' }}
                      >
                        <Folder
                          className="w-5 h-5"
                          style={{ color: fld.color || '#0b57d0' }}
                        />
                      </div>
                      <div className="min-w-0 flex-1">
                        <h4 className="text-sm sm:text-[14.5px] font-semibold text-[#1f1f1f] dark:text-[#e3e3e3] group-hover:text-[#0b57d0] dark:group-hover:text-[#a8c7fa] transition break-words leading-snug">
                          {fld.title}
                        </h4>
                        <p className="text-[11.5px] sm:text-xs text-slate-700 dark:text-zinc-300 font-medium tabular-nums truncate mt-0.5">
                          {nestedChildFolders.length > 0 && `${nestedChildFolders.length} Folders • `}
                          {subLectures.length} Videos • {notesCount} Notes • {subTestsCount} Tests
                        </p>
                      </div>
                    </div>

                    {/* Master Contextual Corner Menu */}
                    {isMaster ? (
                      <div 
                        className="relative shrink-0 ml-1"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          type="button"
                          onClick={() => setActiveMenuId(activeMenuId === `folder_${fld.id}` ? null : `folder_${fld.id}`)}
                          className="w-7 h-7 rounded-full flex items-center justify-center hover:bg-black/10 dark:hover:bg-white/10 text-[var(--md-sys-color-on-surface-variant)] transition border-none bg-transparent cursor-pointer"
                          title="Folder options"
                        >
                          <MoreVertical className="w-4 h-4" />
                        </button>
                        {activeMenuId === `folder_${fld.id}` && (
                          <>
                            <div 
                              className="fixed inset-0 z-40" 
                              onClick={() => setActiveMenuId(null)} 
                            />
                            <div className="absolute right-0 top-full mt-1 w-40 bg-white/95 dark:bg-[#121316]/95 backdrop-blur-2xl rounded-2xl shadow-[0_15px_35px_rgba(0,0,0,0.08)] border border-slate-100 dark:border-zinc-800 py-1.5 z-50 text-xs">
                              <button
                                type="button"
                                onClick={() => {
                                  setActiveMenuId(null);
                                  setEditingFolder(fld);
                                  setIsFolderModalOpen(true);
                                }}
                                className="w-full px-3 py-2 flex items-center space-x-2 text-left hover:bg-[var(--md-sys-color-surface-container)] text-[var(--md-sys-color-on-surface)] border-none bg-transparent cursor-pointer font-medium"
                              >
                                <Edit3 className="w-3.5 h-3.5 text-blue-500" />
                                <span>Rename</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setActiveMenuId(null);
                                  setDeleteModalConfig({
                                    isOpen: true,
                                    title: `Delete "${fld.title}"?`,
                                    message: 'This will delete this subfolder and any lessons or documents inside it.',
                                    onConfirm: () => {
                                      deleteChapter(fld.id);
                                      showSecurityToast(`Folder "${fld.title}" deleted.`);
                                    },
                                  });
                                }}
                                className="w-full px-3 py-2 flex items-center space-x-2 text-left hover:bg-rose-50 dark:hover:bg-rose-950/30 text-rose-600 dark:text-rose-400 border-none bg-transparent cursor-pointer font-medium"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                                <span>Delete</span>
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    ) : (
                      <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-[var(--md-sys-color-primary)] transition shrink-0 ml-1" />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* SECTION 2: CONTENT (VIDEOS, NOTES & TESTS - Scoped inside specific folders) */}
        {shouldShowContentTabs && (
          <div className="space-y-4 pt-1">

          {/* TAB 1: VIDEOS */}
          {folderActiveTab === 'videos' && (
            <div>
              {folderLectures.length === 0 ? (
                currentSubfolders.length > 0 ? (
                  <div className="p-4 sm:p-5 text-center bg-white dark:bg-[#1e2024] rounded-3xl border-0 shadow-[0_2px_6px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.05)] dark:shadow-[0_2px_8px_rgba(0,0,0,0.35)] space-y-1">
                    <p className="text-xs font-semibold text-slate-700 dark:text-zinc-300">
                      Select a subfolder above to view chapter video lectures
                    </p>
                    {isMaster && (
                      <button
                        type="button"
                        onClick={() => {
                          setEditingLecture(null);
                          setIsVideoModalOpen(true);
                        }}
                        className="mt-1 px-3 py-1 rounded-full bg-indigo-600 text-white text-xs font-bold border-none cursor-pointer shadow-xs"
                      >
                        + Add Lecture Directly Here
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="p-8 text-center bg-white dark:bg-[#1e2024] rounded-3xl border-0 shadow-[0_2px_6px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.05)] dark:shadow-[0_2px_8px_rgba(0,0,0,0.35)] space-y-2">
                    <Video className="w-8 h-8 mx-auto text-indigo-500 opacity-60" />
                    <h4 className="text-sm sm:text-base font-bold text-[#1f1f1f] dark:text-[#e3e3e3]">
                      No Video Lectures in this folder yet
                    </h4>
                    {isMaster ? (
                      <button
                        type="button"
                        onClick={() => {
                          setEditingLecture(null);
                          setIsVideoModalOpen(true);
                        }}
                        className="px-4 py-1.5 rounded-full bg-indigo-600 text-white text-xs font-bold border-none cursor-pointer shadow-xs"
                      >
                        + Add First Lecture
                      </button>
                    ) : (
                      <p className="text-[11px] text-slate-700 dark:text-zinc-300 font-medium">
                        Faculty will upload video lectures and recorded sessions for this section soon.
                      </p>
                    )}
                  </div>
                )
              ) : (
                <div className={`${isNativeAndroidApp ? '' : 'md:divide-y'} divide-slate-100 dark:divide-zinc-800/80 bg-transparent rounded-2xl`}>
                  {folderLectures.map((lec) => (
                    <div
                      key={lec.id}
                      onClick={() => goToLectureView(lec.id)}
                      className="group cursor-pointer bg-transparent hover:bg-slate-50/80 dark:hover:bg-zinc-900/50 transition-colors p-2.5 sm:p-3.5 rounded-2xl flex flex-row items-center justify-between gap-3 sm:gap-4 relative"
                    >
                      <div className="flex items-center gap-3 sm:gap-4 min-w-0 flex-1">
                        {/* 16:9 Thumbnail with Rounded-xl */}
                        <div className="relative w-36 sm:w-48 md:w-56 aspect-video shrink-0 rounded-xl sm:rounded-2xl overflow-hidden bg-slate-900/10 dark:bg-black/30 shadow-xs">
                          <img
                            src={getLectureThumbnailUrl(lec)}
                            alt={lec.title}
                            className="w-full h-full object-cover group-hover:scale-105 transition duration-500"
                            onError={(e) => {
                              const target = e.currentTarget as HTMLImageElement;
                              if (target.src.includes('maxresdefault.jpg')) {
                                target.src = target.src.replace('maxresdefault.jpg', 'hqdefault.jpg');
                              } else if (target.src.includes('i.ytimg.com')) {
                                target.src = target.src.replace('i.ytimg.com', 'img.youtube.com');
                              } else if (lec.encryptedVideoId && !target.dataset.ytFallbackTried) {
                                const fallbackYtId = deobfuscateVideoKey(lec.encryptedVideoId);
                                if (fallbackYtId && fallbackYtId !== 'WUvTyaaNkzM') {
                                  target.dataset.ytFallbackTried = '1';
                                  target.src = `https://i.ytimg.com/vi/${fallbackYtId}/hqdefault.jpg`;
                                  return;
                                }
                                target.src = '/assets/default-course-banner.png';
                              } else if (!target.src.includes('default-course-banner.png')) {
                                target.src = '/assets/default-course-banner.png';
                              }
                            }}
                          />
                          {lec.isFreePreview && (
                            <span className="absolute top-1 left-1 px-1.5 py-0.5 rounded-full bg-emerald-600 text-white font-bold text-[8px] sm:text-[9px] uppercase shadow-xs">
                              Free
                            </span>
                          )}
                          <span className="absolute bottom-1 right-1 px-1.5 py-0.5 rounded-md bg-black/80 tabular-nums text-[8.5px] sm:text-[9.5px] text-white font-bold shadow-xs">
                            {(() => {
                              const totalSec = exactDurations[lec.id] || lec.durationSeconds || watchProgress[lec.id]?.totalSeconds || 0;
                              if (totalSec > 0) {
                                return formatDuration(totalSec);
                              }
                              return (lec.durationMinutes && lec.durationMinutes !== 45 && lec.durationMinutes !== 30)
                                ? `${lec.durationMinutes}:00`
                                : formatDuration((lec.durationMinutes || 15) * 60);
                            })()}
                          </span>
                          <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition duration-300 bg-black/30">
                            <div className="w-8 h-8 rounded-full bg-[#0b57d0] text-white flex items-center justify-center shadow-lg">
                              {(!hasFullBatchAccess && !lec.isFreePreview) ? (
                                <Lock className="w-3.5 h-3.5" />
                              ) : (
                                <Play className="w-3.5 h-3.5 fill-current ml-0.5" />
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Lecture Meta & Title */}
                        <div className="min-w-0 flex-1 py-0.5">
                          <h4 className="text-sm sm:text-[14.5px] font-semibold text-[#1f1f1f] dark:text-[#e3e3e3] group-hover:text-[#0b57d0] dark:group-hover:text-[#a8c7fa] transition break-words leading-snug">
                            {lec.title}
                          </h4>
                          <p className="hidden sm:block text-[11px] text-slate-700 dark:text-zinc-300 font-medium line-clamp-1 mt-0.5">
                            {lec.description || 'Watch concept masterclass with bookmarkable milestones.'}
                          </p>
                          <div className="flex items-center gap-2 text-[10px] sm:text-[11px] text-slate-700 dark:text-zinc-300 font-medium tabular-nums mt-1">
                            <span className="truncate">
                              {lec.pdfNotes?.length || 0} Attached Notes
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Right affordance and Master Actions */}
                      {((!hasFullBatchAccess && !lec.isFreePreview) || isMaster) && (
                        <div className="flex items-center gap-1 sm:gap-2 shrink-0">
                          {(!hasFullBatchAccess && !lec.isFreePreview) && (
                            <span className="text-amber-700 dark:text-amber-400 font-bold flex items-center space-x-1 shrink-0 text-[10px] sm:text-xs px-2.5 py-1 rounded-full bg-amber-500/10">
                              <Lock className="w-3 h-3" />
                              <span>Locked</span>
                            </span>
                          )}

                          {/* Master Corner Menu */}
                          {isMaster && (
                            <div 
                              className="relative shrink-0"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <button
                                type="button"
                                onClick={() => setActiveMenuId(activeMenuId === `lec_${lec.id}` ? null : `lec_${lec.id}`)}
                                className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-black/5 dark:hover:bg-white/10 text-slate-500 dark:text-zinc-400 transition border-none bg-transparent cursor-pointer"
                                title="Lecture Options"
                              >
                                <MoreVertical className="w-4 h-4" />
                              </button>
                            {activeMenuId === `lec_${lec.id}` && (
                              <>
                                <div 
                                  className="fixed inset-0 z-40" 
                                  onClick={() => setActiveMenuId(null)} 
                                />
                                <div className="absolute right-0 top-full mt-1 w-40 bg-white/95 dark:bg-[#121316]/95 backdrop-blur-2xl rounded-2xl shadow-[0_15px_35px_rgba(0,0,0,0.08)] border border-slate-100 dark:border-zinc-800 py-1.5 z-50 text-xs">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setActiveMenuId(null);
                                      setEditingLecture(lec);
                                      setIsVideoModalOpen(true);
                                    }}
                                    className="w-full px-3 py-2 flex items-center space-x-2 text-left hover:bg-slate-50 dark:hover:bg-zinc-800 text-[#1f1f1f] dark:text-[#e3e3e3] border-0 bg-transparent cursor-pointer font-medium"
                                  >
                                    <Edit3 className="w-3.5 h-3.5 text-blue-500" />
                                    <span>Edit</span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setActiveMenuId(null);
                                      setDeleteModalConfig({
                                        isOpen: true,
                                        title: `Delete "${lec.title}"?`,
                                        message: 'Are you sure you want to remove this video lecture?',
                                        onConfirm: () => {
                                          deleteLecture(lec.id);
                                          showSecurityToast(`Lecture removed.`);
                                        },
                                      });
                                    }}
                                    className="w-full px-3 py-2 flex items-center space-x-2 text-left hover:bg-rose-50 dark:hover:bg-rose-950/30 text-rose-600 dark:text-rose-400 border-0 bg-transparent cursor-pointer font-medium"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                    <span>Delete</span>
                                  </button>
                                </div>
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 2: NOTES */}
          {folderActiveTab === 'notes_content' && (
            <div>
              {folderNotesContent.length === 0 ? (
                currentSubfolders.length > 0 ? (
                  <div className="p-4 sm:p-5 text-center bg-white dark:bg-[#1e2024] rounded-3xl border-0 shadow-[0_2px_6px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.05)] dark:shadow-[0_2px_8px_rgba(0,0,0,0.35)] space-y-1">
                    <p className="text-xs font-semibold text-slate-700 dark:text-zinc-300">
                      Select a subfolder above to view chapter notes & documents
                    </p>
                    {isMaster && (
                      <button
                        type="button"
                        onClick={() => {
                          setEditingNote(null);
                          setIsNoteModalOpen(true);
                        }}
                        className="mt-1 px-3 py-1 rounded-full bg-emerald-600 text-white text-xs font-bold border-none cursor-pointer shadow-xs"
                      >
                        + Add Note Directly Here
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="p-8 text-center bg-white dark:bg-[#1e2024] rounded-3xl border-0 shadow-[0_2px_6px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.05)] dark:shadow-[0_2px_8px_rgba(0,0,0,0.35)] space-y-2">
                    <FileText className="w-8 h-8 mx-auto text-emerald-500 opacity-60" />
                    <h4 className="text-sm sm:text-base font-bold text-[#1f1f1f] dark:text-[#e3e3e3]">
                      No PDF Notes in this folder yet
                    </h4>
                    {isMaster ? (
                      <button
                        type="button"
                        onClick={() => {
                          setEditingNote(null);
                          setIsNoteModalOpen(true);
                        }}
                        className="px-4 py-1.5 rounded-full bg-emerald-600 text-white text-xs font-bold border-none cursor-pointer shadow-xs"
                      >
                        + Add PDF Note
                      </button>
                    ) : (
                      <p className="text-[11px] text-slate-700 dark:text-zinc-300 font-medium">
                        Faculty will upload chapter cheat sheets and DPP notes here soon.
                      </p>
                    )}
                  </div>
                )
              ) : (
                <div className={`${isNativeAndroidApp ? '' : 'md:divide-y'} divide-slate-100 dark:divide-zinc-800/80 bg-transparent rounded-2xl`}>
                  {folderNotesContent.map((note) => (
                    <div
                      key={note.id || note.fileUrl || note.url}
                      onClick={() => handleOpenNoteViewer(note, folderNotesContent)}
                      className="p-3 sm:p-3.5 rounded-2xl bg-transparent hover:bg-slate-50/80 dark:hover:bg-zinc-900/50 transition-colors flex items-center justify-between group cursor-pointer relative"
                    >
                      <div className="flex items-center space-x-3.5 min-w-0 flex-1">
                        {(() => {
                          const noteIsImage = isImageFile({ fileName: note.title, fileUrl: note.fileUrl || note.url });
                          return (
                            <>
                              <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${
                                noteIsImage
                                  ? 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400'
                                  : 'bg-rose-500/10 text-rose-600 dark:text-rose-400'
                              }`}>
                                {noteIsImage ? <ImageIcon className="w-5 h-5" /> : <FileText className="w-5 h-5" />}
                              </div>
                              <div className="min-w-0 flex-1">
                                <h4 className="text-sm sm:text-[14.5px] font-semibold text-slate-800 dark:text-slate-100 group-hover:text-sky-600 dark:group-hover:text-sky-400 transition-colors break-words leading-snug">
                                  {stripFileExtension(note.title || 'Untitled Note')}
                                </h4>
                                <div className="flex items-center gap-1.5 mt-0.5">
                                  <span className={`text-[9.5px] font-bold tracking-wide px-1.5 py-0.2 rounded-md ${
                                    noteIsImage
                                      ? 'bg-indigo-500/10 dark:bg-indigo-500/20 text-indigo-700 dark:text-indigo-300'
                                      : 'bg-rose-500/10 dark:bg-rose-500/20 text-rose-700 dark:text-rose-300'
                                  }`}>
                                    {noteIsImage ? 'IMG' : 'PDF'}
                                  </span>
                            {!hasFullBatchAccess ? (
                              <span className="text-[9.5px] font-bold tracking-wide px-1.5 py-0.2 rounded-md bg-amber-500/15 text-amber-700 dark:text-amber-300 flex items-center space-x-0.5">
                                <Lock className="w-2.5 h-2.5" />
                                <span>Locked</span>
                              </span>
                            ) : (
                              <span className="text-[10px] text-slate-700 dark:text-zinc-300 font-medium">
                                Drive Viewer
                              </span>
                            )}
                                </div>
                              </div>
                            </>
                          );
                        })()}
                      </div>

                      <div className="flex items-center space-x-1 shrink-0 ml-2">
                        {note.previewImageUrl && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleOpenImageViewer(note.title, note.previewImageUrl!);
                            }}
                            className="w-8 h-8 rounded-full hover:bg-slate-100 dark:hover:bg-white/10 text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white flex items-center justify-center transition border-0 bg-transparent cursor-pointer"
                            title="Preview Thumbnail"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleOpenNoteViewer(note, folderNotesContent);
                          }}
                          className={`w-8 h-8 rounded-full flex items-center justify-center transition border-0 bg-transparent cursor-pointer ${
                            !hasFullBatchAccess
                              ? 'hover:bg-amber-500/15 text-amber-600 dark:text-amber-400'
                              : 'hover:bg-sky-50 dark:hover:bg-sky-500/15 text-sky-600 dark:text-sky-400'
                          }`}
                          title={!hasFullBatchAccess ? 'Locked Resource' : 'Open in Google Drive Viewer'}
                        >
                          {!hasFullBatchAccess ? <Lock className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                        {isMaster && selectedChapterId && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              deletePdfNoteFromChapter(selectedChapterId, note.id);
                              showSecurityToast('Document removed.');
                            }}
                            className="w-8 h-8 rounded-full hover:bg-rose-50 dark:hover:bg-rose-950/30 text-slate-400 hover:text-rose-600 flex items-center justify-center transition border-0 bg-transparent cursor-pointer"
                            title="Delete Note"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 3: TESTS */}
          {folderActiveTab === 'tests' && (
            <div>
              {folderTests.length === 0 ? (
                currentSubfolders.length > 0 ? (
                  <div className="p-4 sm:p-5 text-center bg-white dark:bg-[#1e2024] rounded-3xl border-0 shadow-[0_2px_6px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.05)] dark:shadow-[0_2px_8px_rgba(0,0,0,0.35)] space-y-1">
                    <p className="text-xs font-semibold text-slate-700 dark:text-zinc-300">
                      Select a subfolder above to take chapter mock tests
                    </p>
                    {isMaster && (
                      <button
                        type="button"
                        onClick={() => setIsLinkTestModalOpen(true)}
                        className="mt-1 px-3 py-1 rounded-full bg-amber-500 text-white text-xs font-bold border-none cursor-pointer shadow-xs"
                      >
                        + Link CBT Test Directly Here
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="p-8 text-center bg-white dark:bg-[#1e2024] rounded-3xl border-0 shadow-[0_2px_6px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.05)] dark:shadow-[0_2px_8px_rgba(0,0,0,0.35)] space-y-2">
                    <Award className="w-8 h-8 mx-auto text-amber-500 opacity-60" />
                    <h4 className="text-sm sm:text-base font-bold text-[#1f1f1f] dark:text-[#e3e3e3]">
                      No Mock Tests in this folder yet
                    </h4>
                    {isMaster ? (
                      <button
                        type="button"
                        onClick={() => setIsLinkTestModalOpen(true)}
                        className="px-4 py-1.5 rounded-full bg-amber-500 text-white text-xs font-bold border-none cursor-pointer shadow-xs"
                      >
                        + Link CBT Test
                      </button>
                    ) : (
                      <p className="text-[11px] text-slate-700 dark:text-zinc-300 font-medium">
                        Faculty will schedule and publish chapter mock exams here soon.
                      </p>
                    )}
                  </div>
                )
              ) : (
                <div className="grid grid-cols-1 responsive-tablet-tests-grid gap-2.5 sm:gap-3">
                  {folderTests.map((t, idx) => (
                    <M3TestCard
                      key={t.id || `folder-test-${idx}`}
                      test={t}
                      attempts={attempts}
                      index={idx}
                      isMaster={isMaster && !!selectedChapterId}
                      titleClassName="text-sm sm:text-[14.5px] font-semibold text-[#1f1f1f] dark:text-[#e3e3e3] group-hover:text-[#0b57d0] dark:group-hover:text-[#a8c7fa] transition-colors leading-snug break-words"
                      onDelete={() => {
                        const targetBatchId = currentBatch?.id || selectedBatchId;
                        deleteBatchTest(targetBatchId, t.id, t.title);
                        showSecurityToast(`Test "${t.title}" removed from batch.`);
                      }}
                      onClick={() => setDetailedTest(t)}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
        )}

        {/* Google Drive In-App File & Image Viewer Modal */}
        <GoogleDriveFileViewerModal
          isOpen={isViewerOpen}
          items={viewerItems}
          initialIndex={viewerInitialIndex}
          onClose={() => setIsViewerOpen(false)}
          publicOnly={true}
        />

        {/* MODAL 1: CREATE OR EDIT FOLDER */}
        <CreateOrEditFolderModal
          isOpen={isFolderModalOpen}
          onClose={() => {
            setIsFolderModalOpen(false);
            setEditingFolder(null);
          }}
          onSave={({ title, description, color }) => {
            if (editingFolder) {
              updateChapter(editingFolder.id, { title, description, color });
              showSecurityToast(`Folder "${title}" updated.`);
            } else {
              const newF = addFolder({
                batchId: selectedBatchId,
                title,
                description,
                color,
                parentId: selectedChapterId,
              });
              showSecurityToast(`Subfolder "${title}" created.`);
            }
          }}
          initialTitle={editingFolder?.title}
          initialDescription={editingFolder?.description}
          initialColor={editingFolder?.color}
          parentFolderName={currentFolder?.title || currentBatch?.title}
          isEdit={Boolean(editingFolder)}
        />

        {/* MODAL 2: ADD OR EDIT VIDEO LECTURE */}
        <AddOrEditVideoModal
          isOpen={isVideoModalOpen}
          onClose={() => {
            setIsVideoModalOpen(false);
            setEditingLecture(null);
          }}
          onSave={({ title, description, videoUrl, durationMinutes, isFreePreview, pdfNoteTitle, pdfNoteUrl, thumbnailUrl }) => {
            const rawYtId = extractYouTubeId(videoUrl) || videoUrl;
            const obfuscated = obfuscateVideoKey(rawYtId);
            const resolvedThumb = thumbnailUrl || (rawYtId ? `https://i.ytimg.com/vi/${rawYtId}/hqdefault.jpg` : '/assets/default-course-banner.png');
            const notes: PdfNote[] = pdfNoteTitle && pdfNoteUrl ? [{
              id: `pdf_${Date.now()}`,
              title: pdfNoteTitle,
              url: pdfNoteUrl,
              fileUrl: pdfNoteUrl,
              size: '1.2 MB',
              type: 'pdf',
            }] : [];

            if (editingLecture) {
              updateLecture(editingLecture.id, {
                title,
                description,
                encryptedVideoId: obfuscated,
                durationMinutes,
                isFreePreview,
                thumbnailUrl: resolvedThumb,
                pdfNotes: notes.length > 0 ? notes : editingLecture.pdfNotes,
              });
              showSecurityToast(`Lecture "${title}" updated.`);
            } else {
              addLecture({
                batchId: selectedBatchId,
                subjectId: currentFolder?.subjectId || 'sub_general',
                chapterId: selectedChapterId || 'root',
                title,
                description,
                encryptedVideoId: obfuscated,
                videoSourceType: 'youtube',
                durationMinutes,
                isFreePreview,
                order: folderLectures.length + 1,
                thumbnailUrl: resolvedThumb,
                pdfNotes: notes,
              });
              showSecurityToast(`Lecture "${title}" added.`);
            }
          }}
          initialData={editingLecture}
          folderName={currentFolder?.title || currentBatch?.title}
        />

        {/* MODAL 3: ADD OR EDIT PDF NOTE */}
        <AddOrEditNoteModal
          isOpen={isNoteModalOpen}
          onClose={() => {
            setIsNoteModalOpen(false);
            setEditingNote(null);
          }}
          onSave={({ title, fileUrl }) => {
            if (selectedChapterId) {
              addPdfNoteToChapter(selectedChapterId, { title, fileUrl, url: fileUrl });
              showSecurityToast(`Note "${title}" added.`);
            }
          }}
          initialData={editingNote}
          folderName={currentFolder?.title || currentBatch?.title}
        />

        {/* MODAL 4: LINK MOCK TESTS */}
        <LinkTestModal
          isOpen={isLinkTestModalOpen}
          onClose={() => setIsLinkTestModalOpen(false)}
          availableTests={allCandidateTests}
          linkedTestIds={folderTests.map((t) => t.id)}
          onToggleTest={async (testId) => {
            if (selectedChapterId) {
              const isAlreadyInFolder = folderTests.some((t) => t.id === testId);
              const targetBatchId = currentBatch?.id || selectedBatchId;
              if (isAlreadyInFolder) {
                deleteBatchTest(targetBatchId, testId);
                showSecurityToast('Test unlinked from folder.');
              } else {
                const found = allCandidateTests.find((t) => t.id === testId);
                const fullFound = (found && found.questions && found.questions.length > 0)
                  ? found
                  : (await loadFullTestOnDemand(testId, allCandidateTests, null, targetBatchId)) || found;
                toggleTestInChapter(selectedChapterId, testId, fullFound);
                showSecurityToast('Test linked to folder.');
              }
            }
          }}
          folderName={currentFolder?.title || currentBatch?.title}
        />

        {/* MODAL 5: CONFIRM DELETE */}
        <ConfirmDeleteModal
          isOpen={deleteModalConfig.isOpen}
          onClose={() => setDeleteModalConfig((prev) => ({ ...prev, isOpen: false }))}
          onConfirm={deleteModalConfig.onConfirm}
          title={deleteModalConfig.title}
          message={deleteModalConfig.message}
        />

        {/* MODALS 6 & 7: EDIT BATCH & BATCH ROSTER */}
        {isMaster && (
          <>
            <EditBatchModal
              isOpen={isEditBatchModalOpen}
              onClose={() => {
                setIsEditBatchModalOpen(false);
                setBatchToEdit(null);
              }}
              batch={batchToEdit || currentBatch}
              onSave={(bId, updated) => {
                updateBatch(bId, updated);
                showSecurityToast(`Batch settings updated.`);
              }}
              onDelete={(bId) => {
                deleteBatch(bId);
                showSecurityToast(`Batch deleted.`);
                handleGoToAllCourses();
              }}
            />

            <BatchRosterModal
              isOpen={isBatchRosterModalOpen}
              onClose={() => {
                setIsBatchRosterModalOpen(false);
                setBatchForRoster(null);
              }}
              batch={batchForRoster || currentBatch}
            />
          </>
        )}

        {/* Test Detail & Attempt Records Modal with Dual Mode Options (OMR + Online) */}
        <TestDetailModal
          test={detailedTest}
          onClose={() => setDetailedTest(null)}
          attempts={attempts}
          userProfile={userProfile}
          currentUser={auth.currentUser || (currentUser as any)}
          allTests={allCandidateTests}
          onStartTest={(testToStart) => {
            const hasFullAccess = isMaster || (currentBatch && (isEnrolled(currentBatch.id) || isGuestAllowedForBatch(currentBatch.id)));
            if (!hasFullAccess) {
              showSecurityToast(`Access Locked: Mock test "${testToStart.title}" requires full enrollment in "${currentBatch.title}".`);
              return;
            }
            if (onStartTest) {
              return onStartTest(testToStart, {
                batchId: selectedBatchId || currentBatch?.id || '',
                chapterId: selectedChapterId,
                folderTab: 'tests',
              });
            }
          }}
          onStartOmrTest={(testToStart) => {
            const hasFullAccess = isMaster || (currentBatch && (isEnrolled(currentBatch.id) || isGuestAllowedForBatch(currentBatch.id)));
            if (!hasFullAccess) {
              showSecurityToast(`Access Locked: OMR exam mode requires full enrollment in "${currentBatch.title}".`);
              return;
            }
            if (onStartOmrTest) {
              return onStartOmrTest(testToStart, {
                batchId: selectedBatchId || currentBatch?.id || '',
                chapterId: selectedChapterId,
                folderTab: 'tests',
              });
            } else {
              showSecurityToast('Opening OMR runner...');
            }
          }}
          onViewAttemptResult={onViewAttemptResult}
        />
      </div>
    );
  }

  /* =========================================================================
     STAGE 4: LECTURE VIEW (Full Cloaked Video Player with Notes & Milestones)
     ========================================================================= */
  return (
    <div className="space-y-4 sm:space-y-6 pb-28 sm:pb-28 md:pb-16 max-w-7xl mx-auto m3-transition-enter">
      {/* Main Grid: Player on Left, In-Video Notes & Chapters on Right */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 lg:gap-6">
        {/* LEFT COLUMN: Full-Width Video Player on Mobile & Tablet, Card Grid on Desktop */}
        <div className="lg:col-span-8 space-y-4">
          <div className="-mx-3.5 sm:-mx-6 lg:mx-0 -mt-4 sm:-mt-6 lg:mt-0 w-[calc(100%+1.75rem)] sm:w-[calc(100%+3rem)] lg:w-full rounded-none lg:rounded-3xl overflow-hidden shadow-none lg:shadow-2xl border-none relative group sticky top-0 z-40 bg-black lg:static">
            {/* YouTube-style Top-Left Collapse Down-Chevron Button */}
            <button
              type="button"
              id="video-player-collapse-btn"
              onClick={handleExitLectureView}
              className="absolute top-2.5 left-2.5 z-30 w-8 h-8 rounded-full bg-black/60 hover:bg-black/80 active:scale-95 text-white flex items-center justify-center backdrop-blur-md transition border-none cursor-pointer shadow-md select-none"
              title="Minimize to bottom strip"
              aria-label="Collapse video"
            >
              <ChevronDown className="w-5 h-5 stroke-[2.5]" />
            </button>
            <CloakedVideoPlayer
              encryptedVideoId={activeLecture.encryptedVideoId}
              title={activeLecture.title}
              user={user}
              batchId={currentBatch.id}
              lectureId={activeLecture.id}
              isGuestAllowed={isEnrolled(currentBatch.id) || isGuestAllowedForBatch(currentBatch.id)}
              seekToSeconds={activeSeekSeconds}
              milestones={activeLecture.milestones || []}
              thumbnailUrl={activeLecture.thumbnailUrl}
              onPlayStateChange={setIsCurrentLecturePlaying}
              onProgress={(sec, total) => {
                setCurrentPlaybackSec(sec);
                updateWatchProgress(activeLecture.id, sec, total);
              }}
            />
          </div>

          <div className="px-3.5 sm:px-6 lg:px-0">
            <div className="bg-[var(--md-sys-color-surface-container)] rounded-2xl sm:rounded-3xl p-4 sm:p-5 space-y-2 shadow-xs">
              <h1 className="text-base sm:text-lg font-bold text-[#1f1f1f] dark:text-[#e3e3e3] leading-snug">
                {activeLecture.title}
              </h1>
              <p className="text-xs text-slate-700 dark:text-zinc-300 font-medium leading-relaxed">
                {activeLecture.description}
              </p>
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: Lecture Notes (Free-form study notes without timing stamps) */}
        <div className="lg:col-span-4 px-3.5 sm:px-6 lg:px-0 space-y-4">
          <div className="bg-[var(--md-sys-color-surface-container)] rounded-2xl sm:rounded-3xl p-4 sm:p-5 shadow-xs space-y-4">
            {/* Header: Title */}
            <div className="flex items-center justify-between pb-2 border-b border-[var(--md-sys-color-outline-variant)]/20">
              <div className="flex items-center space-x-2">
                <div className="w-8 h-8 rounded-full bg-[var(--md-sys-color-primary-container)] text-[var(--md-sys-color-on-primary-container)] flex items-center justify-center">
                  <FileText className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-xs sm:text-sm font-bold text-[var(--md-sys-color-on-surface)] leading-tight">
                    Lecture Notes
                  </h2>
                  <p className="text-[11px] text-slate-700 dark:text-zinc-300 font-medium">
                    Write and save your personal study notes freely
                  </p>
                </div>
              </div>
            </div>

            {/* Note Input Box & Save Button */}
            <form onSubmit={handleCreateNote} className="space-y-2">
              <textarea
                rows={3}
                value={noteInputText}
                onChange={(e) => setNoteInputText(e.target.value)}
                placeholder="Write your study notes, formulas, or key concepts freely..."
                className="w-full px-3 py-2.5 rounded-xl bg-[var(--md-sys-color-surface)] border border-[var(--md-sys-color-outline-variant)]/40 text-xs text-[var(--md-sys-color-on-surface)] placeholder:text-slate-500 resize-none focus:outline-hidden focus:border-[var(--md-sys-color-primary)] transition"
              />
              <div className="flex items-center justify-end">
                <button
                  type="submit"
                  disabled={!noteInputText.trim()}
                  className="px-4 py-2 rounded-xl bg-[var(--md-sys-color-primary)] text-[var(--md-sys-color-on-primary)] text-xs font-bold border-none cursor-pointer disabled:opacity-50 flex items-center space-x-1.5 hover:opacity-95 active:scale-95 transition shrink-0"
                >
                  <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
                  <span>Save Note</span>
                </button>
              </div>
            </form>

            {/* Saved Notes List (Clean typography without timing stamps) */}
            <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
              {personalNotes.filter((n) => n.lectureId === activeLecture.id).length === 0 ? (
                <div className="p-6 text-center rounded-2xl bg-[var(--md-sys-color-surface)]/60 border border-[var(--md-sys-color-outline-variant)]/10 space-y-1.5">
                  <FileText className="w-6 h-6 mx-auto text-[var(--md-sys-color-outline)] opacity-50" />
                  <p className="text-xs font-semibold text-[var(--md-sys-color-on-surface)]">
                    No notes yet
                  </p>
                  <p className="text-[11px] text-slate-700 dark:text-zinc-300 font-medium max-w-xs mx-auto">
                    Type your thoughts or key concepts above and save them freely.
                  </p>
                </div>
              ) : (
                personalNotes
                  .filter((n) => n.lectureId === activeLecture.id)
                  .map((note) => (
                    <div
                      key={note.id}
                      className="p-3 rounded-2xl bg-[var(--md-sys-color-surface)] border border-[var(--md-sys-color-outline-variant)]/20 flex items-start justify-between gap-2.5 transition hover:shadow-xs group"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-xs sm:text-sm text-slate-800 dark:text-zinc-100 font-medium break-words leading-relaxed whitespace-pre-wrap">
                          {note.text}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => deletePersonalNote(note.id)}
                        className="p-1.5 text-slate-600 dark:text-zinc-400 hover:text-rose-500 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950/20 border-none bg-transparent cursor-pointer shrink-0 transition"
                        title="Delete Note"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Test Detail & Attempt Records Modal with Dual Mode Options (OMR + Online) */}
      <TestDetailModal
        test={detailedTest}
        onClose={() => setDetailedTest(null)}
        attempts={attempts}
        userProfile={userProfile}
        currentUser={auth.currentUser || (currentUser as any)}
        allTests={allCandidateTests}
        onStartTest={(testToStart) => {
          const hasFullAccess = isMaster || (currentBatch && (isEnrolled(currentBatch.id) || isGuestAllowedForBatch(currentBatch.id)));
          if (!hasFullAccess) {
            showSecurityToast(`Access Locked: Mock test "${testToStart.title}" requires full enrollment in "${currentBatch.title}".`);
            return;
          }
          if (onStartTest) {
            return onStartTest(testToStart, {
              batchId: selectedBatchId || currentBatch?.id || '',
              chapterId: selectedChapterId,
              folderTab: 'tests',
            });
          }
        }}
        onStartOmrTest={(testToStart) => {
          const hasFullAccess = isMaster || (currentBatch && (isEnrolled(currentBatch.id) || isGuestAllowedForBatch(currentBatch.id)));
          if (!hasFullAccess) {
            showSecurityToast(`Access Locked: OMR exam mode requires full enrollment in "${currentBatch.title}".`);
            return;
          }
          if (onStartOmrTest) {
            return onStartOmrTest(testToStart, {
              batchId: selectedBatchId || currentBatch?.id || '',
              chapterId: selectedChapterId,
              folderTab: 'tests',
            });
          } else {
            showSecurityToast('Opening OMR runner...');
          }
        }}
        onViewAttemptResult={onViewAttemptResult}
      />

      {/* Google Drive In-App File & Image Viewer Modal */}
      <GoogleDriveFileViewerModal
        isOpen={isViewerOpen}
        items={viewerItems}
        initialIndex={viewerInitialIndex}
        onClose={() => setIsViewerOpen(false)}
        publicOnly={true}
      />
    </div>
  );
};
