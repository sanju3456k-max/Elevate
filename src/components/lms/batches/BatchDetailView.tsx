import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import {
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
} from 'lucide-react';
import { useApp, getFacultyAvatarUrl } from '../../../lms/LmsContext';
import { CloakedVideoPlayer } from '../player/CloakedVideoPlayer';
import { formatDuration, extractYouTubeId, obfuscateVideoKey } from '../../../lms/security';
import type { PdfNote, Chapter, Lecture } from '../../../lms/types';
import type { MathTest } from '../../../types';
import { useBackHandler } from '../../../hooks/useBackNavigation';
import {
  CreateOrEditFolderModal,
  AddOrEditVideoModal,
  AddOrEditNoteModal,
  LinkTestModal,
  ConfirmDeleteModal,
} from './FolderEditorModals';

interface BatchDetailViewProps {
  batchId?: string;
  initialLectureId?: string | null;
  initialChapterId?: string | null;
  initialFolderTab?: 'videos' | 'notes_content' | 'tests' | null;
  onBack?: () => void;
  availableTests?: MathTest[];
  onStartTest?: (
    test: MathTest,
    context?: { batchId: string; chapterId?: string | null; folderTab: 'videos' | 'notes_content' | 'tests' }
  ) => void;
  initialFilter?: 'all' | 'my-batches';
  onStageChange?: (stage: 'batch_list' | 'folder_list' | 'folder_content' | 'lecture_view') => void;
  onBatchChange?: (batchId: string | null) => void;
  onChapterChange?: (chapterId: string | null) => void;
  onLectureChange?: (lectureId: string | null) => void;
  onFolderTabChange?: (tab: 'videos' | 'notes_content' | 'tests') => void;
  isMasterEditMode?: boolean;
  onSetMiniPlayer?: (video: any) => void;
  initialSeekSeconds?: number | null;
}

export const BatchDetailView: React.FC<BatchDetailViewProps> = ({
  batchId: propBatchId,
  initialLectureId,
  initialChapterId,
  initialFolderTab,
  onBack,
  availableTests = [],
  onStartTest,
  initialFilter = 'all',
  onStageChange,
  onBatchChange,
  onChapterChange,
  onLectureChange,
  onFolderTabChange,
  isMasterEditMode = false,
  onSetMiniPlayer,
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
    batchTests,
  } = useApp();

  const isMaster = Boolean(isMasterEditMode);

  // Selected Batch
  const [selectedBatchId, setSelectedBatchId] = useState<string>(() => {
    return propBatchId || batches[0]?.id || 'batch_testing_01';
  });

  // Selected Folder (null = Root level of the batch)
  const [selectedChapterId, setSelectedChapterId] = useState<string | null>(initialChapterId || null);

  // Selected Lecture (for video player)
  const [selectedLectureId, setSelectedLectureId] = useState<string | null>(initialLectureId || null);

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

  // Image preview modal state
  const [previewImage, setPreviewImage] = useState<{ title: string; url: string } | null>(null);

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
        setCurrentStage('lecture_view');
        onStageChange?.('lecture_view');
      } else if (!initialLectureId && currentStage === 'batch_list') {
        setCurrentStage('folder_content');
      }
    } else {
      consumedLectureIdRef.current = null;
      setCurrentStage('batch_list');
    }
  }, [propBatchId, initialChapterId, initialLectureId, initialFolderTab, onStageChange]);

  useEffect(() => {
    if (selectedBatchId) {
      loadCurriculumForBatch(selectedBatchId);
    }
  }, [selectedBatchId, loadCurriculumForBatch]);

  // When lectures are loaded, if we have an active initial lecture, ensure its chapter/batch are aligned without re-triggering stage changes
  useEffect(() => {
    if (initialLectureId && consumedLectureIdRef.current === initialLectureId && selectedLectureId === initialLectureId) {
      const targetLec = lectures.find((l) => l.id === initialLectureId);
      if (targetLec) {
        if (targetLec.chapterId && !selectedChapterId) setSelectedChapterId(targetLec.chapterId);
        if (targetLec.batchId && !selectedBatchId) setSelectedBatchId(targetLec.batchId);
      }
    }
  }, [initialLectureId, lectures, selectedLectureId, selectedChapterId, selectedBatchId]);

  const enrolledBatches = useMemo(
    () => batches.filter((b) => isEnrolled(b.id)),
    [batches, isEnrolled]
  );

  const displayedBatches = batchFilter === 'my-batches' ? enrolledBatches : batches;
  const currentBatch = batches.find((b) => b.id === selectedBatchId) || batches[0];

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

  // Tests linked to the current folder or batch root
  const folderTests = useMemo(() => {
    const folderTestIds = new Set(currentFolder?.testIds || []);
    const matchingTests = availableTests.filter((t) => folderTestIds.has(t.id));
    if (!selectedChapterId && matchingTests.length === 0) {
      return batchTests.map((bt) => availableTests.find((t) => t.id === bt.testId)).filter(Boolean) as MathTest[];
    }
    return matchingTests;
  }, [availableTests, currentFolder, selectedChapterId, batchTests]);

  // Total tests count
  const totalFolderTestsCount = useMemo(() => {
    if (!currentBatch) return 0;
    if (!selectedChapterId) {
      return batchTests.length || folderTests.length;
    }
    return folderTests.length;
  }, [currentBatch, selectedChapterId, batchTests, folderTests]);

  // Active Lecture for Player
  const activeLecture = useMemo(() => {
    return lectures.find((l) => l.id === selectedLectureId) || folderLectures[0] || lectures[0];
  }, [lectures, selectedLectureId, folderLectures]);

  // Dedicated collapse/exit handler from lecture view that passes video into YouTube-style bottom strip
  const handleExitLectureView = useCallback(() => {
    if (activeLecture && onSetMiniPlayer && currentBatch) {
      onSetMiniPlayer({
        lectureId: activeLecture.id,
        lectureTitle: activeLecture.title,
        batchId: currentBatch.id,
        batchTitle: currentBatch.title,
        chapterId: selectedChapterId,
        thumbnailUrl: activeLecture.thumbnailUrl || currentBatch.thumbnailUrl,
        durationMinutes: activeLecture.durationMinutes,
        encryptedVideoId: activeLecture.encryptedVideoId,
        playbackSeconds: currentPlaybackSec,
        isPlaying: true,
      });
    }
    setSelectedLectureId(null);
    consumedLectureIdRef.current = null;
    onLectureChange?.(null);
    setCurrentStage('folder_content');
    onStageChange?.('folder_content');
  }, [activeLecture, currentBatch, selectedChapterId, currentPlaybackSec, onSetMiniPlayer, onLectureChange, onStageChange]);

  // Centralized Back Navigation Stack Integration
  useBackHandler({
    isOpen: currentStage !== 'batch_list' || Boolean(previewImage),
    priority: 25,
    id: 'batch_detail_stage_back',
    onBack: () => {
      if (previewImage) {
        setPreviewImage(null);
        return;
      }
      if (currentStage === 'lecture_view') {
        handleExitLectureView();
        return;
      }
      if (selectedChapterId) {
        // Step up to parent folder in Google Drive hierarchy
        const cur = chapters.find((c) => c.id === selectedChapterId);
        const parentId = cur?.parentId || null;
        setSelectedChapterId(parentId);
        onChapterChange?.(parentId);
        return;
      }
      // If at batch root, step back to batch list
      setSelectedBatchId('');
      onBatchChange?.(null);
      setCurrentStage('batch_list');
    },
  });

  const goToBatchFolders = (batchId: string) => {
    if (!isEnrolled(batchId)) {
      if (isGuestAllowedForBatch(batchId)) {
        enrollAsGuest(batchId);
        setSelectedBatchId(batchId);
        onBatchChange?.(batchId);
        setSelectedChapterId(null);
        onChapterChange?.(null);
        setFolderActiveTab('videos');
        onFolderTabChange?.('videos');
        setCurrentStage('folder_content');
        return;
      }
      const bTitle = batches.find((b) => b.id === batchId)?.title || 'this batch';
      showSecurityToast(`Access Denied: You are not enrolled in "${bTitle}". Access is restricted to students on the official roster.`);
      return;
    }
    setSelectedBatchId(batchId);
    onBatchChange?.(batchId);
    setSelectedChapterId(null);
    onChapterChange?.(null);
    setFolderActiveTab('videos');
    onFolderTabChange?.('videos');
    setCurrentStage('folder_content');
  };

  const goToFolderContent = (chapterId: string) => {
    setSelectedChapterId(chapterId);
    onChapterChange?.(chapterId);
    setFolderActiveTab('videos');
    onFolderTabChange?.('videos');
    setCurrentStage('folder_content');
  };

  const goToLectureView = (lectureId: string) => {
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
      seconds: currentPlaybackSec,
      text: noteInputText.trim(),
    });
    setNoteInputText('');
    showSecurityToast(`Note saved at ${formatDuration(currentPlaybackSec)}`);
  };

  /* =========================================================================
     STAGE 1: BATCH LIST (Shows the list of batches with All / My Batches filters)
     ========================================================================= */
  if (currentStage === 'batch_list') {
    return (
      <div className="space-y-6 pb-8 max-w-7xl mx-auto m3-transition-enter">
        {/* Course Filter Toggle: All Courses vs My Courses */}
        <div className="flex items-center justify-start sm:justify-end pb-1">
          <div className="flex items-center space-x-2 p-1 bg-[var(--md-sys-color-surface-container)] rounded-full self-start sm:self-auto">
            <button
              onClick={() => setBatchFilter('all')}
              className={`px-4 py-1.5 rounded-full text-xs font-bold transition border-none outline-none cursor-pointer ${
                batchFilter === 'all'
                  ? 'bg-[var(--md-sys-color-primary)] text-[var(--md-sys-color-on-primary)] shadow-xs'
                  : 'text-[var(--md-sys-color-on-surface-variant)] hover:text-[var(--md-sys-color-on-surface)]'
              }`}
            >
              All Courses ({batches.length})
            </button>
            <button
              onClick={() => setBatchFilter('my-batches')}
              className={`px-4 py-1.5 rounded-full text-xs font-bold transition border-none outline-none cursor-pointer ${
                batchFilter === 'my-batches'
                  ? 'bg-[var(--md-sys-color-primary)] text-[var(--md-sys-color-on-primary)] shadow-xs'
                  : 'text-[var(--md-sys-color-on-surface-variant)] hover:text-[var(--md-sys-color-on-surface)]'
              }`}
            >
              My Courses ({enrolledBatches.length})
            </button>
          </div>
        </div>

        {displayedBatches.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {displayedBatches.map((b) => (
              <div
                key={b.id}
                onClick={() => goToBatchFolders(b.id)}
                className="bg-[var(--md-sys-color-surface-container)] rounded-3xl overflow-hidden shadow-xs hover:shadow-md transition group cursor-pointer border-none flex flex-col justify-between"
              >
                <div className="relative aspect-video w-full overflow-hidden bg-slate-900">
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
                  {b.allowGuestAccess && (
                    <span className="absolute top-3 right-3 px-2.5 py-0.5 rounded-full bg-emerald-600/90 text-white font-bold text-[9px] uppercase tracking-wider flex items-center space-x-1 shadow-xs">
                      <Sparkles className="w-3 h-3" />
                      <span>Guest Pass</span>
                    </span>
                  )}
                </div>

                <div className="p-5 space-y-3 flex-1 flex flex-col justify-between">
                  <div className="space-y-1.5">
                    <h3 className="text-base font-bold text-[var(--md-sys-color-on-surface)] group-hover:text-[var(--md-sys-color-primary)] transition line-clamp-1">
                      {b.title}
                    </h3>
                    <p className="text-xs text-[var(--md-sys-color-on-surface-variant)] line-clamp-2">
                      {b.description}
                    </p>
                  </div>

                  <div className="flex items-center justify-between pt-3 border-t border-[var(--md-sys-color-outline-variant)]/20 text-xs text-[var(--md-sys-color-on-surface-variant)] mt-auto">
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

                    {isEnrolled(b.id) ? (
                      <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 flex items-center space-x-1">
                        <CheckCircle className="w-4 h-4" />
                        <span>Enrolled</span>
                      </span>
                    ) : b.allowGuestAccess ? (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          enrollAsGuest(b.id);
                          setSelectedBatchId(b.id);
                          setCurrentStage('folder_content');
                        }}
                        className="m3-btn-filled px-3 sm:px-4 py-1.5 sm:py-2 text-xs font-bold flex items-center space-x-1 bg-indigo-600 text-white border-none outline-none cursor-pointer shadow-xs hover:opacity-95"
                      >
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>Free Access</span>
                      </button>
                    ) : (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          showSecurityToast(`Access Denied: You are not enrolled in "${b.title}". Contact Master Admin to be added to the roster.`);
                        }}
                        className="m3-btn-tonal px-3 sm:px-4 py-1.5 sm:py-2 text-xs font-bold flex items-center space-x-1 text-slate-500 opacity-80 border-none outline-none cursor-pointer"
                      >
                        <Lock className="w-3.5 h-3.5" />
                        <span>Locked</span>
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
      </div>
    );
  }

  /* =========================================================================
     STAGE 2 & 3: GOOGLE DRIVE-STYLE HIERARCHICAL FOLDER & CONTENT EXPLORER
     ========================================================================= */
  if (currentStage === 'folder_content') {
    return (
      <div className="space-y-5 pb-24 md:pb-16 max-w-7xl mx-auto m3-transition-enter">
        {/* Top Header: Back Button & Dynamic Google Drive Breadcrumbs */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-3 border-b border-[var(--md-sys-color-outline-variant)]/20">
          <div className="flex items-center space-x-2 flex-wrap gap-y-1.5">
            {/* Direct Step-Back Button */}
            <button
              onClick={() => {
                if (selectedChapterId) {
                  const cur = chapters.find((c) => c.id === selectedChapterId);
                  const parentId = cur?.parentId || null;
                  setSelectedChapterId(parentId);
                  onChapterChange?.(parentId);
                } else {
                  setSelectedBatchId('');
                  onBatchChange?.(null);
                  setCurrentStage('batch_list');
                }
              }}
              className="p-1.5 rounded-full hover:bg-[var(--md-sys-color-surface-container-high)] text-[var(--md-sys-color-on-surface)] border-none bg-transparent cursor-pointer flex items-center justify-center transition shrink-0"
              title="Up one level"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>

            {/* Google Drive Breadcrumbs Trail */}
            <div className="flex items-center space-x-1.5 text-xs font-semibold overflow-x-auto py-1 scrollbar-none">
              <button
                onClick={() => {
                  setSelectedBatchId('');
                  onBatchChange?.(null);
                  setCurrentStage('batch_list');
                }}
                className="px-2 py-1 rounded-lg hover:bg-[var(--md-sys-color-surface-container)] text-[var(--md-sys-color-on-surface-variant)] border-none bg-transparent cursor-pointer shrink-0"
              >
                All Courses
              </button>

              <ChevronRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />

              <button
                onClick={() => {
                  setSelectedChapterId(null);
                  onChapterChange?.(null);
                }}
                className={`px-2.5 py-1 rounded-lg border-none bg-transparent cursor-pointer shrink-0 truncate max-w-[140px] sm:max-w-xs ${
                  !selectedChapterId
                    ? 'font-bold text-[var(--md-sys-color-primary)] bg-[var(--md-sys-color-surface-container)]'
                    : 'text-[var(--md-sys-color-on-surface-variant)] hover:bg-[var(--md-sys-color-surface-container)]'
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
                    <ChevronRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <button
                      onClick={() => {
                        setSelectedChapterId(crumb.id);
                        onChapterChange?.(crumb.id);
                      }}
                      className={`px-2.5 py-1 rounded-lg border-none bg-transparent cursor-pointer shrink-0 truncate max-w-[130px] sm:max-w-xs ${
                        isCurrent
                          ? 'font-bold text-[var(--md-sys-color-primary)] bg-[var(--md-sys-color-surface-container)]'
                          : 'text-[var(--md-sys-color-on-surface-variant)] hover:bg-[var(--md-sys-color-surface-container)]'
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

          {/* Master Admin Contextual Action Bar (Only visible in Master Console View) */}
          {isMaster && (
            <div className="flex items-center space-x-2 shrink-0 self-start md:self-auto">
              <button
                type="button"
                onClick={() => {
                  setEditingFolder(null);
                  setIsFolderModalOpen(true);
                }}
                className="p-2 sm:px-3.5 sm:py-1.5 rounded-full bg-[var(--md-sys-color-primary)] text-[var(--md-sys-color-on-primary)] font-bold text-xs flex items-center justify-center space-x-1.5 shadow-xs hover:opacity-95 transition border-none cursor-pointer shrink-0"
                title={selectedChapterId ? "Add Subfolder" : "Add Chapter Folder"}
                aria-label="Add Subfolder"
              >
                <Plus className="w-4 h-4 sm:w-3.5 sm:h-3.5 stroke-[2.5]" />
                <span className="hidden sm:inline">Add Subfolder</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setEditingLecture(null);
                  setIsVideoModalOpen(true);
                }}
                className="p-2 sm:px-3 sm:py-1.5 rounded-full bg-indigo-600 text-white font-bold text-xs flex items-center justify-center space-x-1.5 shadow-xs hover:bg-indigo-700 transition border-none cursor-pointer shrink-0"
                title="Add Lecture"
              >
                <Video className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
                <span className="hidden sm:inline">Add Lecture</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setEditingNote(null);
                  setIsNoteModalOpen(true);
                }}
                className="p-2 sm:px-3 sm:py-1.5 rounded-full bg-emerald-600 text-white font-bold text-xs flex items-center justify-center space-x-1.5 shadow-xs hover:bg-emerald-700 transition border-none cursor-pointer shrink-0"
                title="Add Notes or Document Files"
              >
                <FilePlus className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
                <span className="hidden sm:inline">Add Notes</span>
              </button>

              <button
                type="button"
                onClick={() => setIsLinkTestModalOpen(true)}
                className="p-2 sm:px-3 sm:py-1.5 rounded-full bg-amber-500 text-white font-bold text-xs flex items-center justify-center space-x-1.5 shadow-xs hover:bg-amber-600 transition border-none cursor-pointer shrink-0"
                title="Link Mock Test"
              >
                <Award className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
                <span className="hidden sm:inline">Link Mock Test</span>
              </button>
            </div>
          )}
        </div>

        {/* TOP TOGGLE BAR: VIDEOS | NOTES | TESTS (Only displayed inside subfolders; hidden on batch root folder listing) */}
        {shouldShowContentTabs && (
          <div className="flex items-center space-x-2 p-1 bg-[var(--md-sys-color-surface-container)] rounded-full max-w-md shadow-xs">
            <button
              onClick={() => {
                setFolderActiveTab('videos');
                onFolderTabChange?.('videos');
              }}
              className={`flex-1 py-2 px-3 sm:px-4 rounded-full text-xs font-bold transition flex items-center justify-center space-x-1.5 border-none outline-none cursor-pointer ${
                folderActiveTab === 'videos'
                  ? 'bg-[var(--md-sys-color-primary)] text-[var(--md-sys-color-on-primary)] shadow-xs'
                  : 'text-[var(--md-sys-color-on-surface-variant)] hover:text-[var(--md-sys-color-on-surface)]'
              }`}
            >
              <PlayCircle className="w-3.5 h-3.5" />
              <span>Videos ({totalFolderVideosCount})</span>
            </button>

            <button
              onClick={() => {
                setFolderActiveTab('notes_content');
                onFolderTabChange?.('notes_content');
              }}
              className={`flex-1 py-2 px-3 sm:px-4 rounded-full text-xs font-bold transition flex items-center justify-center space-x-1.5 border-none outline-none cursor-pointer ${
                folderActiveTab === 'notes_content'
                  ? 'bg-[var(--md-sys-color-primary)] text-[var(--md-sys-color-on-primary)] shadow-xs'
                  : 'text-[var(--md-sys-color-on-surface-variant)] hover:text-[var(--md-sys-color-on-surface)]'
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              <span>Notes ({totalFolderNotesCount})</span>
            </button>

            <button
              onClick={() => {
                setFolderActiveTab('tests');
                onFolderTabChange?.('tests');
              }}
              className={`flex-1 py-2 px-3 sm:px-4 rounded-full text-xs font-bold transition flex items-center justify-center space-x-1.5 border-none outline-none cursor-pointer ${
                folderActiveTab === 'tests'
                  ? 'bg-[var(--md-sys-color-primary)] text-[var(--md-sys-color-on-primary)] shadow-xs'
                  : 'text-[var(--md-sys-color-on-surface-variant)] hover:text-[var(--md-sys-color-on-surface)]'
              }`}
            >
              <Award className="w-3.5 h-3.5" />
              <span>Tests ({totalFolderTestsCount})</span>
            </button>
          </div>
        )}

        {/* SECTION 1: SUBFOLDERS GRID (Google Drive Folder Cards) */}
        {currentSubfolders.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-xs sm:text-sm font-bold text-[var(--md-sys-color-on-surface)] flex items-center space-x-2">
                <Folder className="w-4 h-4 text-[var(--md-sys-color-primary)]" />
                <span>Subfolders ({currentSubfolders.length})</span>
              </h2>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
              {currentSubfolders.map((fld) => {
                const subLectures = lectures.filter((l) => l.chapterId === fld.id && l.batchId === currentBatch.id);
                let notesCount = (fld.pdfNotes?.length || 0);
                subLectures.forEach((l) => (notesCount += l.pdfNotes?.length || 0));
                const subTestsCount = fld.testIds?.length || 0;
                const nestedChildFolders = chapters.filter((c) => c.parentId === fld.id);

                return (
                  <div
                    key={fld.id}
                    onClick={() => goToFolderContent(fld.id)}
                    className="p-4 rounded-2xl bg-[var(--md-sys-color-surface-container)] hover:bg-[var(--md-sys-color-surface-container-high)] cursor-pointer transition shadow-xs flex items-center justify-between group border-none relative"
                  >
                    <div className="flex items-center space-x-3 min-w-0 flex-1">
                      <div
                        className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 shadow-xs"
                        style={{ backgroundColor: fld.color ? `${fld.color}20` : '#0b57d020' }}
                      >
                        <Folder
                          className="w-5 h-5"
                          style={{ color: fld.color || '#0b57d0' }}
                        />
                      </div>
                      <div className="min-w-0 flex-1">
                        <h4 className="text-xs sm:text-sm font-bold text-[var(--md-sys-color-on-surface)] group-hover:text-[var(--md-sys-color-primary)] transition truncate">
                          {fld.title}
                        </h4>
                        <p className="text-[10px] text-[var(--md-sys-color-on-surface-variant)] truncate">
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
                            <div className="absolute right-0 top-full mt-1 w-40 bg-white dark:bg-[#1e2024] rounded-2xl shadow-xl border border-[var(--md-sys-color-outline-variant)]/20 py-1.5 z-50 text-xs">
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
                  <div className="p-4 sm:p-5 text-center bg-[var(--md-sys-color-surface-container)]/60 rounded-2xl border border-dashed border-[var(--md-sys-color-outline-variant)]/30 space-y-1">
                    <p className="text-xs font-semibold text-[var(--md-sys-color-on-surface-variant)]">
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
                  <div className="p-8 text-center bg-[var(--md-sys-color-surface-container)] rounded-3xl border border-dashed border-[var(--md-sys-color-outline-variant)]/40 space-y-2">
                    <Video className="w-8 h-8 mx-auto text-indigo-500 opacity-60" />
                    <h4 className="text-xs sm:text-sm font-bold text-[var(--md-sys-color-on-surface)]">
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
                      <p className="text-[11px] text-[var(--md-sys-color-on-surface-variant)]">
                        Faculty will upload video lectures and recorded sessions for this section soon.
                      </p>
                    )}
                  </div>
                )
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-5">
                  {folderLectures.map((lec) => (
                    <div
                      key={lec.id}
                      onClick={() => goToLectureView(lec.id)}
                      className="bg-[var(--md-sys-color-surface-container)] rounded-2xl sm:rounded-3xl overflow-hidden group cursor-pointer transition flex flex-row sm:flex-col p-0 border-none shadow-xs hover:shadow-md items-stretch relative"
                    >
                      <div className="relative w-36 sm:w-full aspect-video shrink-0 self-stretch overflow-hidden bg-slate-900">
                        <img
                          src={lec.thumbnailUrl || '/assets/default-course-banner.png'}
                          alt={lec.title}
                          className="w-full h-full object-cover group-hover:scale-105 transition duration-500"
                          onError={(e) => {
                            (e.currentTarget as HTMLImageElement).src = '/assets/default-course-banner.png';
                          }}
                        />
                        {lec.isFreePreview && (
                          <span className="absolute top-1.5 left-1.5 sm:top-2.5 sm:left-2.5 px-2 sm:px-2.5 py-0.5 rounded-full bg-emerald-600 text-white font-bold text-[9px] sm:text-[10px] uppercase shadow-xs">
                            Free
                          </span>
                        )}
                        <span className="absolute bottom-1.5 right-1.5 sm:bottom-2.5 sm:right-2.5 px-1.5 sm:px-2 py-0.5 rounded-md bg-black/75 font-mono text-[9px] sm:text-[11px] text-white">
                          {lec.durationMinutes}:00
                        </span>
                        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition bg-black/30">
                          <div className="w-8 h-8 sm:w-12 sm:h-12 rounded-full bg-[var(--md-sys-color-primary)] text-[var(--md-sys-color-on-primary)] flex items-center justify-center shadow-lg">
                            <Play className="w-3.5 h-3.5 sm:w-6 sm:h-6 fill-current ml-0.5" />
                          </div>
                        </div>

                        {/* Master Corner Menu */}
                        {isMaster && (
                          <div
                            className="absolute top-2 right-2 z-10"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <button
                              type="button"
                              onClick={() => setActiveMenuId(activeMenuId === `lec_${lec.id}` ? null : `lec_${lec.id}`)}
                              className="w-7 h-7 rounded-full bg-black/60 hover:bg-black/80 text-white flex items-center justify-center transition border-none cursor-pointer shadow-md"
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
                                <div className="absolute right-0 top-full mt-1 w-40 bg-white dark:bg-[#1e2024] rounded-2xl shadow-xl border border-[var(--md-sys-color-outline-variant)]/20 py-1.5 z-50 text-xs">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setActiveMenuId(null);
                                      setEditingLecture(lec);
                                      setIsVideoModalOpen(true);
                                    }}
                                    className="w-full px-3 py-2 flex items-center space-x-2 text-left hover:bg-[var(--md-sys-color-surface-container)] text-[var(--md-sys-color-on-surface)] border-none bg-transparent cursor-pointer font-medium"
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
                                    className="w-full px-3 py-2 flex items-center space-x-2 text-left hover:bg-rose-50 dark:hover:bg-rose-950/30 text-rose-600 dark:text-rose-400 border-none bg-transparent cursor-pointer font-medium"
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

                      <div className="p-3 sm:p-4 flex-1 min-w-0 flex flex-col justify-between space-y-1.5 sm:space-y-3">
                        <div>
                          <h4 className="text-xs sm:text-sm font-bold text-[var(--md-sys-color-on-surface)] group-hover:text-[var(--md-sys-color-primary)] transition line-clamp-1 sm:line-clamp-2 leading-snug">
                            {lec.title}
                          </h4>
                          <p className="hidden sm:block text-[11px] text-[var(--md-sys-color-on-surface-variant)] line-clamp-2 mt-1">
                            {lec.description || 'Watch concept masterclass with bookmarkable milestones.'}
                          </p>
                        </div>

                        <div className="flex items-center justify-between text-[10px] sm:text-[11px] pt-1 border-t border-[var(--md-sys-color-outline-variant)]/20 mt-auto">
                          <span className="text-[var(--md-sys-color-on-surface-variant)] truncate max-w-[120px] sm:max-w-none">
                            {lec.pdfNotes?.length || 0} Attached Notes
                          </span>
                          <button className="text-[var(--md-sys-color-primary)] font-bold flex items-center space-x-1 border-none bg-transparent cursor-pointer shrink-0">
                            <span>Watch</span>
                            <ChevronRight className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
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
                  <div className="p-4 sm:p-5 text-center bg-[var(--md-sys-color-surface-container)]/60 rounded-2xl border border-dashed border-[var(--md-sys-color-outline-variant)]/30 space-y-1">
                    <p className="text-xs font-semibold text-[var(--md-sys-color-on-surface-variant)]">
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
                  <div className="p-8 text-center bg-[var(--md-sys-color-surface-container)] rounded-3xl border border-dashed border-[var(--md-sys-color-outline-variant)]/40 space-y-2">
                    <FileText className="w-8 h-8 mx-auto text-emerald-500 opacity-60" />
                    <h4 className="text-xs sm:text-sm font-bold text-[var(--md-sys-color-on-surface)]">
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
                      <p className="text-[11px] text-[var(--md-sys-color-on-surface-variant)]">
                        Faculty will upload chapter cheat sheets and DPP notes here soon.
                      </p>
                    )}
                  </div>
                )
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
                  {folderNotesContent.map((note) => (
                    <div
                      key={note.id || note.fileUrl || note.url}
                      className="p-4 rounded-2xl bg-[var(--md-sys-color-surface-container)] hover:bg-[var(--md-sys-color-surface-container-high)] transition shadow-xs flex items-center justify-between group border-none"
                    >
                      <div className="flex items-center space-x-3 min-w-0 flex-1">
                        <div className="w-9 h-9 rounded-xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                          <FileText className="w-5 h-5" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <h4 className="text-xs sm:text-sm font-bold text-[var(--md-sys-color-on-surface)] truncate">
                            {note.title}
                          </h4>
                          <p className="text-[10px] text-[var(--md-sys-color-on-surface-variant)]">
                            PDF Document
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center space-x-1 shrink-0 ml-2">
                        {note.previewImageUrl && (
                          <button
                            type="button"
                            onClick={() => setPreviewImage({ title: note.title, url: note.previewImageUrl! })}
                            className="p-1.5 rounded-full hover:bg-[var(--md-sys-color-surface-container)] text-[var(--md-sys-color-on-surface-variant)] border-none bg-transparent cursor-pointer"
                            title="Preview Note"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                        )}
                        <a
                          href={note.fileUrl || note.url || '#'}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-1.5 rounded-full hover:bg-[var(--md-sys-color-surface-container)] text-emerald-600 dark:text-emerald-400 border-none bg-transparent cursor-pointer"
                          title="Open PDF"
                        >
                          <ExternalLink className="w-4 h-4" />
                        </a>
                        {isMaster && selectedChapterId && (
                          <button
                            type="button"
                            onClick={() => {
                              deletePdfNoteFromChapter(selectedChapterId, note.id);
                              showSecurityToast('Document removed.');
                            }}
                            className="p-1.5 rounded-full hover:bg-rose-500/10 text-rose-500 border-none bg-transparent cursor-pointer"
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
                  <div className="p-4 sm:p-5 text-center bg-[var(--md-sys-color-surface-container)]/60 rounded-2xl border border-dashed border-[var(--md-sys-color-outline-variant)]/30 space-y-1">
                    <p className="text-xs font-semibold text-[var(--md-sys-color-on-surface-variant)]">
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
                  <div className="p-8 text-center bg-[var(--md-sys-color-surface-container)] rounded-3xl border border-dashed border-[var(--md-sys-color-outline-variant)]/40 space-y-2">
                    <Award className="w-8 h-8 mx-auto text-amber-500 opacity-60" />
                    <h4 className="text-xs sm:text-sm font-bold text-[var(--md-sys-color-on-surface)]">
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
                      <p className="text-[11px] text-[var(--md-sys-color-on-surface-variant)]">
                        Faculty will schedule and publish chapter mock exams here soon.
                      </p>
                    )}
                  </div>
                )
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-5">
                  {folderTests.map((t) => (
                    <div
                      key={t.id}
                      onClick={() => {
                        if (onStartTest) {
                          onStartTest(t, {
                            batchId: selectedBatchId,
                            chapterId: selectedChapterId,
                            folderTab: 'tests',
                          });
                        } else {
                          showSecurityToast('Opening test runner...');
                        }
                      }}
                      className="bg-[var(--md-sys-color-surface-container)] rounded-2xl sm:rounded-3xl overflow-hidden group cursor-pointer transition flex flex-row sm:flex-col p-0 border-none shadow-xs hover:shadow-md items-stretch relative"
                    >
                      <div className="relative w-36 sm:w-full aspect-video shrink-0 self-stretch overflow-hidden bg-gradient-to-br from-emerald-500/20 via-[var(--md-sys-color-surface-container-high)] to-teal-500/15 flex flex-col justify-between p-2.5 sm:p-4">
                        <div className="flex items-center justify-between">
                          <span className="px-2 py-0.5 rounded-full text-[9px] sm:text-[10px] font-bold uppercase tracking-wider bg-emerald-500 text-white shadow-xs">
                            {t.difficulty || 'Medium'}
                          </span>
                          <span className="px-1.5 py-0.5 rounded-md bg-white/80 dark:bg-black/60 font-mono text-[9px] sm:text-[10.5px] font-bold text-emerald-700 dark:text-emerald-300">
                            CBT
                          </span>
                        </div>
                        <div className="flex items-center space-x-1.5 text-[10px] sm:text-xs text-emerald-700 dark:text-emerald-300 font-mono font-bold">
                          <Timer className="w-3.5 h-3.5" />
                          <span>{t.timeLimitMinutes || 25} Mins</span>
                        </div>

                        {/* Master Unlink Test Button */}
                        {isMaster && selectedChapterId && (
                          <div 
                            className="absolute top-2 right-2"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <button
                              type="button"
                              onClick={() => {
                                toggleTestInChapter(selectedChapterId, t.id);
                                showSecurityToast(`Test unlinked from folder.`);
                              }}
                              className="p-1 rounded-full bg-black/60 hover:bg-rose-600 text-white transition border-none cursor-pointer"
                              title="Unlink Test"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}
                      </div>

                      <div className="p-3 sm:p-4 flex-1 min-w-0 flex flex-col justify-between space-y-1.5 sm:space-y-3">
                        <div>
                          <h4 className="text-xs sm:text-sm font-bold text-[var(--md-sys-color-on-surface)] group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition line-clamp-1 sm:line-clamp-2 leading-snug">
                            {t.title}
                          </h4>
                          <p className="hidden sm:block text-[11px] text-[var(--md-sys-color-on-surface-variant)] line-clamp-2 mt-1">
                            {t.description || 'Test your conceptual understanding of this chapter.'}
                          </p>
                        </div>

                        <div className="flex items-center justify-between text-[10px] sm:text-[11px] pt-1 border-t border-[var(--md-sys-color-outline-variant)]/20 mt-auto">
                          <div className="flex items-center space-x-1 text-[var(--md-sys-color-on-surface-variant)] truncate max-w-[120px] sm:max-w-none">
                            <HelpCircle className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                            <span>{t.questions?.length || 10} Questions</span>
                          </div>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              if (onStartTest) {
                                onStartTest(t, {
                                  batchId: selectedBatchId,
                                  chapterId: selectedChapterId,
                                  folderTab: 'tests',
                                });
                              } else {
                                showSecurityToast('Opening test runner...');
                              }
                            }}
                            className="text-emerald-600 dark:text-emerald-400 font-bold flex items-center space-x-1 border-none bg-transparent cursor-pointer shrink-0"
                          >
                            <span>Start</span>
                            <ChevronRight className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
        )}

        {/* Image Preview Modal */}
        {previewImage && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
            <div className="bg-[var(--md-sys-color-surface-container)] rounded-3xl max-w-2xl w-full p-5 space-y-4 shadow-2xl relative">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-[var(--md-sys-color-on-surface)] truncate">
                  {previewImage.title}
                </h3>
                <button
                  onClick={() => setPreviewImage(null)}
                  className="px-3 py-1 rounded-full text-xs font-bold m3-btn-tonal border-none outline-none cursor-pointer"
                >
                  Close
                </button>
              </div>
              <div className="rounded-2xl overflow-hidden bg-black max-h-[70vh] flex items-center justify-center">
                <img
                  src={previewImage.url}
                  alt={previewImage.title}
                  className="max-h-[65vh] w-auto object-contain"
                />
              </div>
            </div>
          </div>
        )}

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
          onSave={({ title, description, videoUrl, durationMinutes, isFreePreview, pdfNoteTitle, pdfNoteUrl }) => {
            const rawYtId = extractYouTubeId(videoUrl) || videoUrl;
            const obfuscated = obfuscateVideoKey(rawYtId);
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
                thumbnailUrl: `https://img.youtube.com/vi/${rawYtId}/hqdefault.jpg`,
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
                thumbnailUrl: `https://img.youtube.com/vi/${rawYtId}/hqdefault.jpg`,
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
          availableTests={availableTests}
          linkedTestIds={currentFolder?.testIds || []}
          onToggleTest={(testId) => {
            if (selectedChapterId) {
              toggleTestInChapter(selectedChapterId, testId);
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
      </div>
    );
  }

  /* =========================================================================
     STAGE 4: LECTURE VIEW (Full Cloaked Video Player with Notes & Milestones)
     ========================================================================= */
  return (
    <div className="space-y-4 sm:space-y-6 pb-24 md:pb-16 max-w-7xl mx-auto m3-transition-enter">
      {/* Desktop Navigation Breadcrumbs */}
      <div className="hidden sm:flex items-center justify-between">
        <button
          onClick={handleExitLectureView}
          className="flex items-center space-x-1.5 text-xs sm:text-sm font-bold text-[var(--md-sys-color-primary)] hover:underline border-none bg-transparent cursor-pointer"
        >
          <ChevronDown className="w-4 h-4" />
          <span>Minimize Video ({currentFolder?.title || currentBatch?.title || 'Batch'})</span>
        </button>

        <span className="text-xs font-mono text-[var(--md-sys-color-on-surface-variant)]">
          {activeLecture?.durationMinutes} Mins Lecture
        </span>
      </div>

      {/* Main Grid: Player on Left, In-Video Notes & Chapters on Right */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-6">
        {/* LEFT COLUMN: Full-Width Video Player on Mobile & Lecture Info */}
        <div className="lg:col-span-8 space-y-4">
          <div className="-mx-3.5 sm:mx-0 -mt-4 sm:mt-0 w-[calc(100%+1.75rem)] sm:w-full rounded-none sm:rounded-3xl overflow-hidden shadow-2xl border-none relative group">
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
              isGuestAllowed={isGuestAllowedForBatch(currentBatch.id)}
              seekToSeconds={activeSeekSeconds}
              milestones={activeLecture.milestones || []}
              thumbnailUrl={activeLecture.thumbnailUrl}
              onProgress={(sec, total) => {
                setCurrentPlaybackSec(sec);
                updateWatchProgress(activeLecture.id, sec, total);
              }}
            />
          </div>

          <div className="px-3.5 sm:px-0">
            <div className="bg-[var(--md-sys-color-surface-container)] rounded-2xl sm:rounded-3xl p-4 sm:p-5 space-y-2 shadow-xs">
              <h1 className="text-base sm:text-lg font-bold text-[var(--md-sys-color-on-surface)] leading-snug">
                {activeLecture.title}
              </h1>
              <p className="text-xs text-[var(--md-sys-color-on-surface-variant)] leading-relaxed">
                {activeLecture.description}
              </p>
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: Lecture Notes (Type & Save Notes with Video Timestamp) */}
        <div className="lg:col-span-4 px-3.5 sm:px-0 space-y-4">
          <div className="bg-[var(--md-sys-color-surface-container)] rounded-2xl sm:rounded-3xl p-4 sm:p-5 shadow-xs space-y-4">
            {/* Header: Title, Count, & Live Timestamp */}
            <div className="flex items-center justify-between pb-2 border-b border-[var(--md-sys-color-outline-variant)]/20">
              <div className="flex items-center space-x-2">
                <div className="w-8 h-8 rounded-full bg-[var(--md-sys-color-primary-container)] text-[var(--md-sys-color-on-primary-container)] flex items-center justify-center">
                  <FileText className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-xs sm:text-sm font-bold text-[var(--md-sys-color-on-surface)] leading-tight">
                    Lecture Notes
                  </h2>
                  <p className="text-[10px] text-[var(--md-sys-color-on-surface-variant)]">
                    Save key takeaways at timestamps
                  </p>
                </div>
              </div>

              <div className="flex items-center space-x-1.5 px-2.5 py-1 rounded-full bg-[var(--md-sys-color-surface-container-high)] text-[var(--md-sys-color-primary)] font-mono text-xs font-bold">
                <Clock className="w-3.5 h-3.5" />
                <span>{formatDuration(currentPlaybackSec)}</span>
              </div>
            </div>

            {/* Note Input Box & Save Button */}
            <form onSubmit={handleCreateNote} className="space-y-2">
              <textarea
                rows={2}
                value={noteInputText}
                onChange={(e) => setNoteInputText(e.target.value)}
                placeholder={`Type your note here at ${formatDuration(currentPlaybackSec)}...`}
                className="w-full px-3 py-2.5 rounded-xl bg-[var(--md-sys-color-surface)] border border-[var(--md-sys-color-outline-variant)]/40 text-xs text-[var(--md-sys-color-on-surface)] placeholder:text-[var(--md-sys-color-on-surface-variant)]/60 resize-none focus:outline-hidden focus:border-[var(--md-sys-color-primary)] transition"
              />
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-[var(--md-sys-color-on-surface-variant)]">
                  Click timestamp to seek video
                </span>
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

            {/* Saved Notes List */}
            <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
              {personalNotes.filter((n) => n.lectureId === activeLecture.id).length === 0 ? (
                <div className="p-6 text-center rounded-2xl bg-[var(--md-sys-color-surface)]/60 border border-[var(--md-sys-color-outline-variant)]/10 space-y-1.5">
                  <FileText className="w-6 h-6 mx-auto text-[var(--md-sys-color-outline)] opacity-50" />
                  <p className="text-xs font-semibold text-[var(--md-sys-color-on-surface)]">
                    No notes yet
                  </p>
                  <p className="text-[11px] text-[var(--md-sys-color-on-surface-variant)] max-w-xs mx-auto">
                    Type your thoughts or key concepts above and save them at any video timestamp.
                  </p>
                </div>
              ) : (
                personalNotes
                  .filter((n) => n.lectureId === activeLecture.id)
                  .map((note) => (
                    <div
                      key={note.id}
                      className="p-3 rounded-2xl bg-[var(--md-sys-color-surface)] border border-[var(--md-sys-color-outline-variant)]/20 flex items-start justify-between gap-2.5 transition hover:shadow-xs"
                    >
                      <div className="min-w-0 flex-1 space-y-1">
                        <button
                          type="button"
                          onClick={() => setActiveSeekSeconds(note.seconds)}
                          className="inline-flex items-center space-x-1 font-mono font-bold text-[11px] px-2 py-0.5 rounded-full bg-[var(--md-sys-color-primary-container)] text-[var(--md-sys-color-on-primary-container)] hover:opacity-85 border-none cursor-pointer"
                          title="Seek video to this timestamp"
                        >
                          <Play className="w-2.5 h-2.5 fill-current" />
                          <span>{formatDuration(note.seconds)}</span>
                        </button>
                        <p className="text-xs text-[var(--md-sys-color-on-surface)] break-words leading-relaxed">
                          {note.text}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => deletePersonalNote(note.id)}
                        className="p-1.5 text-slate-400 hover:text-rose-500 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950/20 border-none bg-transparent cursor-pointer shrink-0 transition"
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
    </div>
  );
};
