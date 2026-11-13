import React, { useState, useMemo, useEffect } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Folder,
  FolderOpen,
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
} from 'lucide-react';
import { useApp } from '../../../lms/LmsContext';
import { CloakedVideoPlayer } from '../player/CloakedVideoPlayer';
import { formatDuration } from '../../../lms/security';
import type { PdfNote } from '../../../lms/types';
import type { MathTest } from '../../../types';
import { Award, Timer, HelpCircle } from 'lucide-react';

interface BatchDetailViewProps {
  batchId?: string;
  initialLectureId?: string | null;
  onBack?: () => void;
  availableTests?: MathTest[];
  onStartTest?: (test: MathTest) => void;
  initialFilter?: 'all' | 'my-batches';
  onStageChange?: (stage: 'batch_list' | 'folder_list' | 'folder_content' | 'lecture_view') => void;
}

export const BatchDetailView: React.FC<BatchDetailViewProps> = ({
  batchId: propBatchId,
  initialLectureId,
  onBack,
  availableTests = [],
  onStartTest,
  initialFilter = 'all',
  onStageChange,
}) => {
  const {
    batches,
    chapters,
    lectures,
    user,
    updateWatchProgress,
    isEnrolled,
    enrollInBatch,
    personalNotes,
    addPersonalNote,
    deletePersonalNote,
    showSecurityToast,
  } = useApp();

  // Selected Batch
  const [selectedBatchId, setSelectedBatchId] = useState<string>(() => {
    return propBatchId || batches[0]?.id || 'batch_testing_01';
  });

  // Selected Folder (Chapter)
  const [selectedChapterId, setSelectedChapterId] = useState<string | null>(null);

  // Selected Lecture
  const [selectedLectureId, setSelectedLectureId] = useState<string | null>(initialLectureId || null);

  // Stage Navigation: 'batch_list' | 'batch_folders' | 'folder_content' | 'lecture_view'
  const [currentStage, setCurrentStage] = useState<'batch_list' | 'batch_folders' | 'folder_content' | 'lecture_view'>(() => {
    if (initialLectureId) return 'lecture_view';
    return 'batch_list'; // Start with only batch list as requested
  });

  // Inside Folder Tab: 'videos' | 'notes_content'
  const [folderActiveTab, setFolderActiveTab] = useState<'videos' | 'notes_content' | 'tests'>('videos');

  // Filter state for All Batches vs My Batches
  const [batchFilter, setBatchFilter] = useState<'all' | 'my-batches'>(initialFilter || 'all');

  useEffect(() => {
    onStageChange?.(currentStage as any);
  }, [currentStage, onStageChange]);

  React.useEffect(() => {
    if (initialFilter) {
      setBatchFilter(initialFilter);
    }
  }, [initialFilter]);

  const enrolledBatches = useMemo(
    () => batches.filter((b) => isEnrolled(b.id)),
    [batches, isEnrolled]
  );

  const displayedBatches = batchFilter === 'my-batches' ? enrolledBatches : batches;

  // Image preview modal state
  const [previewImage, setPreviewImage] = useState<{ title: string; url: string } | null>(null);

  // Track live playback position for timestamped bookmarks
  const [currentPlaybackSec, setCurrentPlaybackSec] = useState<number>(0);
  const [activeSeekSeconds, setActiveSeekSeconds] = useState<number | null>(null);
  const [noteInputText, setNoteInputText] = useState('');
  const [lectureTab, setLectureTab] = useState<'personal_notes' | 'milestones' | 'notes_content'>('personal_notes');

  const currentBatch = batches.find((b) => b.id === selectedBatchId) || batches[0];

  // Chapters (Folders) in this batch
  const batchFolders = useMemo(
    () => chapters.filter((c) => c.batchId === currentBatch.id),
    [chapters, currentBatch.id]
  );

  // Current selected folder
  const currentFolder = batchFolders.find((f) => f.id === selectedChapterId) || batchFolders[0];

  // Lectures in current folder
  const folderLectures = useMemo(() => {
    if (!currentFolder) return [];
    return lectures.filter((l) => l.chapterId === currentFolder.id);
  }, [lectures, currentFolder]);

  // Notes & Study Materials in current folder
  const folderNotesContent = useMemo(() => {
    const allNotes: { note: PdfNote; lectureTitle: string }[] = [];
    folderLectures.forEach((lec) => {
      (lec.pdfNotes || []).forEach((n) => {
        allNotes.push({ note: n, lectureTitle: lec.title });
      });
    });
    return allNotes;
  }, [folderLectures]);

  // Folder Mock Tests (linked to chapter)
  const folderTests = useMemo(() => {
    if (!currentFolder) return [];
    if (currentFolder.testIds && currentFolder.testIds.length > 0) {
      const explicit = availableTests.filter((t) => currentFolder.testIds?.includes(t.id));
      if (explicit.length > 0) return explicit;
    }
    // Fallback: match by chapter keyword or provide sample tests
    const folderKeyword = currentFolder.title.toLowerCase();
    const matched = availableTests.filter((t) =>
      folderKeyword.includes(t.title.toLowerCase()) ||
      t.title.toLowerCase().includes('matrix') ||
      t.title.toLowerCase().includes('practice')
    );
    return matched.length > 0 ? matched.slice(0, 3) : availableTests.slice(0, 2);
  }, [currentFolder, availableTests]);

  // Selected Lecture for viewing
  const activeLecture = folderLectures.find((l) => l.id === selectedLectureId) || folderLectures[0] || lectures[0];

  const lecturePersonalNotes = personalNotes.filter(
    (n) => n.lectureId === (activeLecture?.id || '')
  );

  const handleCreateNote = (e: React.FormEvent) => {
    e.preventDefault();
    if (!noteInputText.trim() || !activeLecture) return;
    addPersonalNote({
      lectureId: activeLecture.id,
      seconds: currentPlaybackSec,
      text: noteInputText.trim(),
    });
    setNoteInputText('');
    showSecurityToast(`Bookmark saved at ${formatDuration(currentPlaybackSec)}`);
  };

  // Hardware Back Button Integration for Batch Stages (Android / Browser Back Button)
  React.useEffect(() => {
    const handleBatchPopState = () => {
      if (previewImage) {
        setPreviewImage(null);
        return;
      }
      if (currentStage === 'lecture_view') {
        setCurrentStage('folder_content');
        return;
      }
      if (currentStage === 'folder_content') {
        setCurrentStage('batch_folders');
        return;
      }
      if (currentStage === 'batch_folders') {
        setCurrentStage('batch_list');
        return;
      }
    };

    window.addEventListener('popstate', handleBatchPopState);
    return () => window.removeEventListener('popstate', handleBatchPopState);
  }, [currentStage, previewImage]);

  const goToBatchFolders = (batchId: string) => {
    setSelectedBatchId(batchId);
    window.history.pushState({ stage: 'batch_folders', batchId }, '');
    setCurrentStage('batch_folders');
  };

  const goToFolderContent = (chapterId: string) => {
    setSelectedChapterId(chapterId);
    window.history.pushState({ stage: 'folder_content', chapterId }, '');
    setCurrentStage('folder_content');
  };

  const goToLectureView = (lectureId: string) => {
    setSelectedLectureId(lectureId);
    window.history.pushState({ stage: 'lecture_view', lectureId }, '');
    setCurrentStage('lecture_view');
  };

  /* =========================================================================
     STAGE 1: BATCH LIST (Shows only the batch list with All / My Batches filters)
     ========================================================================= */
  if (currentStage === 'batch_list') {
    return (
      <div className="space-y-6 pb-24 md:pb-16 max-w-7xl mx-auto m3-transition-enter">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-[var(--md-sys-color-outline-variant)]/20">
          <div className="flex items-center space-x-2">
            {onBack && (
              <button
                onClick={onBack}
                className="p-1.5 rounded-full hover:bg-[var(--md-sys-color-surface-container-high)] text-[var(--md-sys-color-on-surface)] border-none bg-transparent cursor-pointer"
                title="Go back"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
            )}
            <div>
              <h1 className="text-xl sm:text-2xl font-extrabold text-[var(--md-sys-color-on-surface)] tracking-tight">
                {batchFilter === 'my-batches' ? 'My Enrolled Batches' : 'Coaching Batches'}
              </h1>
              <p className="text-xs sm:text-sm text-[var(--md-sys-color-on-surface-variant)]">
                {batchFilter === 'my-batches'
                  ? 'Batches you are actively enrolled in with complete curriculum access'
                  : 'Select a batch to explore its folders, video classes, and study materials'}
              </p>
            </div>
          </div>

          {/* Filter Pills: All Batches vs My Batches */}
          <div className="flex items-center space-x-2 self-start sm:self-auto">
            <button
              id="batch-filter-all-btn"
              type="button"
              onClick={() => setBatchFilter('all')}
              className={`px-4 py-2 rounded-full text-xs font-bold transition flex items-center space-x-1.5 border-none cursor-pointer active:scale-95 ${
                batchFilter === 'all'
                  ? 'bg-[var(--md-sys-color-primary)] text-[var(--md-sys-color-on-primary)] shadow-sm'
                  : 'bg-[var(--md-sys-color-surface-container)] text-[var(--md-sys-color-on-surface-variant)] hover:bg-[var(--md-sys-color-surface-container-high)]'
              }`}
            >
              <span>All Batches</span>
              <span className="opacity-80 text-[11px]">({batches.length})</span>
            </button>

            <button
              id="batch-filter-my-btn"
              type="button"
              onClick={() => setBatchFilter('my-batches')}
              className={`px-4 py-2 rounded-full text-xs font-bold transition flex items-center space-x-1.5 border-none cursor-pointer active:scale-95 ${
                batchFilter === 'my-batches'
                  ? 'bg-[var(--md-sys-color-primary)] text-[var(--md-sys-color-on-primary)] shadow-sm'
                  : 'bg-[var(--md-sys-color-surface-container)] text-[var(--md-sys-color-on-surface-variant)] hover:bg-[var(--md-sys-color-surface-container-high)]'
              }`}
            >
              <span>My Batches</span>
              <span className="opacity-80 text-[11px]">({enrolledBatches.length})</span>
            </button>
          </div>
        </div>

        {/* Batches Grid or Empty State */}
        {displayedBatches.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
            {displayedBatches.map((b) => (
              <div
                key={b.id}
                onClick={() => goToBatchFolders(b.id)}
                className="bg-[var(--md-sys-color-surface-container)] rounded-2xl sm:rounded-3xl overflow-hidden group cursor-pointer transition flex flex-row sm:flex-col p-0 border-none shadow-xs hover:shadow-md items-stretch"
              >
                <div className="relative w-36 sm:w-full aspect-video shrink-0 self-stretch overflow-hidden">
                  <img
                    src={b.thumbnailUrl}
                    alt={b.title}
                    className="w-full h-full object-cover group-hover:scale-105 transition duration-500"
                  />
                  <span className="absolute top-1.5 left-1.5 sm:top-3 sm:left-3 px-2 sm:px-3 py-0.5 sm:py-1 rounded-full bg-[var(--md-sys-color-surface-container-highest)]/90 backdrop-blur-md text-[var(--md-sys-color-on-surface)] text-[9px] sm:text-xs font-semibold">
                    {b.category}
                  </span>
                  <div className="absolute bottom-1.5 left-1.5 right-1.5 sm:bottom-3 sm:left-3 sm:right-3 flex items-center justify-between text-[9px] sm:text-xs text-white">
                    <span className="flex items-center space-x-1 bg-black/60 backdrop-blur-xs px-1.5 sm:px-2.5 py-0.5 rounded-full">
                      <Star className="w-3 sm:w-3.5 h-3 sm:h-3.5 text-amber-400 fill-current" />
                      <span className="font-bold">{b.rating}</span>
                    </span>
                    <span className="hidden sm:flex items-center space-x-1 bg-black/60 backdrop-blur-xs px-2.5 py-0.5 rounded-full">
                      <Users className="w-3.5 h-3.5 text-slate-300" />
                      <span>Interactive Batch</span>
                    </span>
                  </div>
                </div>

                <div className="p-3 sm:p-5 flex-1 min-w-0 flex flex-col justify-between space-y-2 sm:space-y-4">
                  <div className="space-y-1">
                    <h3 className="text-xs sm:text-base font-bold text-[var(--md-sys-color-on-surface)] group-hover:text-[var(--md-sys-color-primary)] transition leading-snug line-clamp-1 sm:line-clamp-2">
                      {b.title}
                    </h3>
                    <p className="hidden sm:block text-xs text-[var(--md-sys-color-on-surface-variant)] line-clamp-2 leading-relaxed">
                      {b.tagline}
                    </p>
                  </div>

                  <div className="flex items-center space-x-2 sm:space-x-3 pt-1 sm:pt-2 border-t border-[var(--md-sys-color-outline-variant)]/20">
                    <img
                      src={b.instructor.avatarUrl}
                      alt={b.instructor.name}
                      className="w-7 h-7 sm:w-9 sm:h-9 rounded-full object-cover border-none"
                    />
                    <div className="text-[11px] sm:text-xs min-w-0">
                      <p className="font-bold text-[var(--md-sys-color-on-surface)] truncate">{b.instructor.name}</p>
                      <p className="text-[9px] sm:text-[10px] text-[var(--md-sys-color-on-surface-variant)] truncate">
                        {b.instructor.designation}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-1">
                    {isEnrolled(b.id) ? (
                      <div className="flex items-center space-x-1 sm:space-x-1.5 text-[10px] sm:text-xs font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2 sm:px-3 py-0.5 sm:py-1 rounded-full">
                        <CheckCircle className="w-3 sm:w-3.5 h-3 sm:h-3.5" />
                        <span>Full Access</span>
                      </div>
                    ) : (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          enrollInBatch(b.id);
                        }}
                        className="m3-btn-tonal px-2.5 sm:px-3 py-1 text-[11px] sm:text-xs font-bold border-none cursor-pointer"
                      >
                        Enroll (₹{b.price})
                      </button>
                    )}

                    <button className="m3-btn-filled px-3 sm:px-4 py-1.5 sm:py-2 text-xs font-bold flex items-center space-x-1 border-none outline-none cursor-pointer">
                      <span>View</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="p-12 text-center bg-[var(--md-sys-color-surface-container)] rounded-3xl space-y-4 max-w-lg mx-auto my-8">
            <BookOpen className="w-12 h-12 text-[var(--md-sys-color-outline)] mx-auto opacity-50" />
            <h3 className="text-lg font-bold text-[var(--md-sys-color-on-surface)]">
              No Enrolled Batches
            </h3>
            <p className="text-xs text-[var(--md-sys-color-on-surface-variant)] leading-relaxed">
              You are not currently enrolled in any coaching batches. Explore our available coaching batches to get started.
            </p>
            <button
              type="button"
              onClick={() => setBatchFilter('all')}
              className="m3-btn-filled px-5 py-2.5 text-xs font-bold rounded-full cursor-pointer border-none"
            >
              Explore All Batches
            </button>
          </div>
        )}
      </div>
    );
  }

  /* =========================================================================
     STAGE 2: BATCH FOLDERS (Shows the folders/chapters of the selected batch)
     ========================================================================= */
  if (currentStage === 'batch_folders') {
    return (
      <div className="space-y-6 pb-24 md:pb-16 max-w-7xl mx-auto m3-transition-enter">
        {/* Navigation Breadcrumb */}
        <div className="flex items-center justify-between">
          <button
            onClick={() => setCurrentStage('batch_list')}
            className="flex items-center space-x-1.5 text-xs sm:text-sm font-bold text-[var(--md-sys-color-primary)] hover:underline border-none bg-transparent cursor-pointer"
          >
            <ChevronLeft className="w-4 h-4" />
            <span>All Batches</span>
          </button>

          <span className="text-xs text-[var(--md-sys-color-on-surface-variant)]">
            {batchFolders.length} Folders Available
          </span>
        </div>

        {/* Batch Banner Summary */}
        <div className="bg-[var(--md-sys-color-surface-container)] rounded-3xl p-5 sm:p-6 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <span className="text-[10px] uppercase font-bold tracking-wider px-2.5 py-0.5 rounded-full bg-[var(--md-sys-color-secondary-container)] text-[var(--md-sys-color-on-secondary-container)]">
              {currentBatch.category}
            </span>
            <h1 className="text-xl sm:text-2xl font-extrabold text-[var(--md-sys-color-on-surface)]">
              {currentBatch.title}
            </h1>
            <p className="text-xs text-[var(--md-sys-color-on-surface-variant)] max-w-xl">
              {currentBatch.description}
            </p>
          </div>

          <div className="flex items-center space-x-3 sm:self-center">
            <img
              src={currentBatch.instructor.avatarUrl}
              alt={currentBatch.instructor.name}
              className="w-10 h-10 rounded-full object-cover"
            />
            <div className="text-xs">
              <p className="font-bold text-[var(--md-sys-color-on-surface)]">{currentBatch.instructor.name}</p>
              <p className="text-[10px] text-[var(--md-sys-color-on-surface-variant)]">Instructor</p>
            </div>
          </div>
        </div>

        {/* Folders List */}
        <div className="space-y-3">
          <h2 className="text-base sm:text-lg font-bold text-[var(--md-sys-color-on-surface)] flex items-center space-x-2">
            <Folder className="w-5 h-5 text-[var(--md-sys-color-primary)]" />
            <span>Batch Folders (Chapters)</span>
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {batchFolders.map((fld) => {
              const fldLectures = lectures.filter((l) => l.chapterId === fld.id);
              let notesCount = 0;
              fldLectures.forEach((l) => (notesCount += l.pdfNotes?.length || 0));

              return (
                <div
                  key={fld.id}
                  onClick={() => goToFolderContent(fld.id)}
                  className="p-5 rounded-3xl bg-[var(--md-sys-color-surface-container)] hover:bg-[var(--md-sys-color-surface-container-high)] cursor-pointer transition shadow-xs flex items-center justify-between group border-none"
                >
                  <div className="flex items-center space-x-4">
                    <div className="w-12 h-12 rounded-2xl bg-[var(--md-sys-color-primary-container)] text-[var(--md-sys-color-on-primary-container)] flex items-center justify-center font-bold group-hover:scale-105 transition">
                      <Folder className="w-6 h-6 text-[var(--md-sys-color-primary)]" />
                    </div>
                    <div>
                      <h3 className="text-sm sm:text-base font-bold text-[var(--md-sys-color-on-surface)] group-hover:text-[var(--md-sys-color-primary)] transition">
                        {fld.title}
                      </h3>
                      <p className="text-[11px] text-[var(--md-sys-color-on-surface-variant)] line-clamp-1 mt-0.5">
                        {fld.description}
                      </p>
                      <div className="flex items-center space-x-3 mt-2 text-[10px] font-bold text-[var(--md-sys-color-on-surface-variant)]">
                        <span className="flex items-center space-x-1">
                          <PlayCircle className="w-3.5 h-3.5 text-[var(--md-sys-color-primary)]" />
                          <span>{fldLectures.length} Videos</span>
                        </span>
                        <span>•</span>
                        <span className="flex items-center space-x-1">
                          <FileText className="w-3.5 h-3.5 text-amber-500" />
                          <span>{notesCount} Notes Content</span>
                        </span>
                      </div>
                    </div>
                  </div>

                  <ChevronRight className="w-5 h-5 text-[var(--md-sys-color-outline)] group-hover:translate-x-1 transition" />
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  /* =========================================================================
     STAGE 3: FOLDER CONTENT (Inside a folder: Videos & Notes Content)
     ========================================================================= */
  if (currentStage === 'folder_content') {
    return (
      <div className="space-y-6 pb-24 md:pb-16 max-w-7xl mx-auto m3-transition-enter">
        {/* Navigation Breadcrumb */}
        <div className="flex items-center space-x-2 text-xs sm:text-sm font-bold">
          <button
            onClick={() => setCurrentStage('batch_folders')}
            className="flex items-center space-x-1 text-[var(--md-sys-color-primary)] hover:underline border-none bg-transparent cursor-pointer"
          >
            <ChevronLeft className="w-4 h-4" />
            <span>{currentBatch.title} Folders</span>
          </button>
          <span className="text-[var(--md-sys-color-outline)]">/</span>
          <span className="text-[var(--md-sys-color-on-surface)] truncate">{currentFolder?.title}</span>
        </div>

        {/* Folder Header */}
        <div className="bg-[var(--md-sys-color-surface-container)] rounded-3xl p-5 sm:p-6 shadow-xs flex items-center justify-between">
          <div className="space-y-1">
            <div className="flex items-center space-x-2">
              <FolderOpen className="w-5 h-5 text-[var(--md-sys-color-primary)]" />
              <h1 className="text-lg sm:text-xl font-bold text-[var(--md-sys-color-on-surface)]">
                {currentFolder?.title}
              </h1>
            </div>
            <p className="text-xs text-[var(--md-sys-color-on-surface-variant)]">
              {currentFolder?.description}
            </p>
          </div>

          <div className="hidden sm:flex items-center space-x-2 text-xs font-semibold px-3 py-1.5 rounded-full bg-[var(--md-sys-color-surface-container-high)] text-[var(--md-sys-color-on-surface-variant)]">
            <span>{folderLectures.length} Videos</span>
            <span>•</span>
            <span>{folderNotesContent.length} Notes</span>
            <span>•</span>
            <span>{folderTests.length} Tests</span>
          </div>
        </div>

        {/* THREE SECTIONS TABS: 'Videos' | 'Notes Content' | 'Tests' */}
        <div className="flex items-center space-x-2 p-1 bg-[var(--md-sys-color-surface-container)] rounded-full max-w-md">
          <button
            onClick={() => setFolderActiveTab('videos')}
            className={`flex-1 py-2 px-3 sm:px-4 rounded-full text-xs font-bold transition flex items-center justify-center space-x-1.5 border-none outline-none cursor-pointer ${
              folderActiveTab === 'videos'
                ? 'bg-[var(--md-sys-color-primary)] text-[var(--md-sys-color-on-primary)] shadow-xs'
                : 'text-[var(--md-sys-color-on-surface-variant)] hover:text-[var(--md-sys-color-on-surface)]'
            }`}
          >
            <PlayCircle className="w-3.5 h-3.5" />
            <span>Videos ({folderLectures.length})</span>
          </button>

          <button
            onClick={() => setFolderActiveTab('notes_content')}
            className={`flex-1 py-2 px-3 sm:px-4 rounded-full text-xs font-bold transition flex items-center justify-center space-x-1.5 border-none outline-none cursor-pointer ${
              folderActiveTab === 'notes_content'
                ? 'bg-[var(--md-sys-color-primary)] text-[var(--md-sys-color-on-primary)] shadow-xs'
                : 'text-[var(--md-sys-color-on-surface-variant)] hover:text-[var(--md-sys-color-on-surface)]'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Notes ({folderNotesContent.length})</span>
          </button>

          <button
            onClick={() => setFolderActiveTab('tests')}
            className={`flex-1 py-2 px-3 sm:px-4 rounded-full text-xs font-bold transition flex items-center justify-center space-x-1.5 border-none outline-none cursor-pointer ${
              folderActiveTab === 'tests'
                ? 'bg-[var(--md-sys-color-primary)] text-[var(--md-sys-color-on-primary)] shadow-xs'
                : 'text-[var(--md-sys-color-on-surface-variant)] hover:text-[var(--md-sys-color-on-surface)]'
            }`}
          >
            <Award className="w-3.5 h-3.5" />
            <span>Tests ({folderTests.length})</span>
          </button>
        </div>

        {/* SECTION 1: VIDEOS */}
        {folderActiveTab === 'videos' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-5">
            {folderLectures.map((lec) => (
              <div
                key={lec.id}
                onClick={() => goToLectureView(lec.id)}
                className="bg-[var(--md-sys-color-surface-container)] rounded-2xl sm:rounded-3xl overflow-hidden group cursor-pointer transition flex flex-row sm:flex-col p-0 border-none shadow-xs hover:shadow-md items-stretch"
              >
                <div className="relative w-36 sm:w-full aspect-video shrink-0 self-stretch overflow-hidden">
                  <img
                    src={lec.thumbnailUrl}
                    alt={lec.title}
                    className="w-full h-full object-cover group-hover:scale-105 transition duration-500"
                  />
                  {lec.isFreePreview && (
                    <span className="absolute top-1.5 left-1.5 sm:top-2.5 sm:left-2.5 px-2 sm:px-2.5 py-0.5 rounded-full bg-[var(--md-sys-color-tertiary-container)] text-[var(--md-sys-color-on-tertiary-container)] font-bold text-[9px] sm:text-[10px] uppercase">
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
                </div>

                <div className="p-3 sm:p-4 flex-1 min-w-0 flex flex-col justify-between space-y-1.5 sm:space-y-3">
                  <div>
                    <h4 className="text-xs sm:text-sm font-bold text-[var(--md-sys-color-on-surface)] group-hover:text-[var(--md-sys-color-primary)] transition line-clamp-1 sm:line-clamp-2 leading-snug">
                      {lec.title}
                    </h4>
                    <p className="hidden sm:block text-[11px] text-[var(--md-sys-color-on-surface-variant)] line-clamp-2 mt-1">
                      {lec.description}
                    </p>
                  </div>

                  <div className="flex items-center justify-between text-[10px] sm:text-[11px] pt-1 border-t border-[var(--md-sys-color-outline-variant)]/20 mt-auto">
                    <span className="text-[var(--md-sys-color-on-surface-variant)] truncate max-w-[120px] sm:max-w-none">
                      {lec.pdfNotes?.length || 0} Notes Content
                    </span>
                    <button className="text-[var(--md-sys-color-primary)] font-bold flex items-center space-x-1 border-none bg-transparent cursor-pointer shrink-0">
                      <span>Watch</span>
                      <ArrowRight className="w-3 sm:w-3.5 h-3 sm:h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* SECTION 2: NOTES CONTENT (PDFs, Images, Formula Sheets) */}
        {folderActiveTab === 'notes_content' && (
          <div className="space-y-4">
            {folderNotesContent.length === 0 ? (
              <div className="text-center py-16 bg-[var(--md-sys-color-surface-container)] rounded-3xl p-6 text-xs text-[var(--md-sys-color-on-surface-variant)]">
                No study material or notes added to this folder yet.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {folderNotesContent.map(({ note, lectureTitle }, idx) => {
                  const isImage = note.type === 'image' || note.title.endsWith('.png') || note.title.endsWith('.jpg');

                  return (
                    <div
                      key={note.id || idx}
                      className="p-4 rounded-3xl bg-[var(--md-sys-color-surface-container)] hover:bg-[var(--md-sys-color-surface-container-high)] transition shadow-xs flex items-center justify-between gap-3 border-none"
                    >
                      <div className="flex items-center space-x-3.5 min-w-0">
                        {isImage ? (
                          <div
                            onClick={() =>
                              setPreviewImage({
                                title: note.title,
                                url: note.previewImageUrl || note.url,
                              })
                            }
                            className="w-12 h-12 rounded-2xl overflow-hidden bg-slate-900 flex-shrink-0 cursor-pointer group"
                            title="Click to preview image"
                          >
                            <img
                              src={note.previewImageUrl || note.url}
                              alt={note.title}
                              className="w-full h-full object-cover group-hover:scale-110 transition"
                            />
                          </div>
                        ) : (
                          <div className="w-12 h-12 rounded-2xl bg-[var(--md-sys-color-tertiary-container)] text-[var(--md-sys-color-on-tertiary-container)] flex items-center justify-center flex-shrink-0 font-bold">
                            <FileText className="w-6 h-6" />
                          </div>
                        )}

                        <div className="min-w-0">
                          <h4 className="text-xs sm:text-sm font-bold text-[var(--md-sys-color-on-surface)] truncate">
                            {note.title}
                          </h4>
                          <p className="text-[10px] text-[var(--md-sys-color-on-surface-variant)] truncate mt-0.5">
                            Attached to: {lectureTitle}
                          </p>
                          <div className="flex items-center space-x-2 text-[10px] text-[var(--md-sys-color-outline)] font-mono mt-1">
                            <span>{note.size}</span>
                            {note.pages && <span>• {note.pages} Pages</span>}
                            <span>• {isImage ? 'Diagram / Image' : 'PDF Document'}</span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center space-x-2 flex-shrink-0">
                        {isImage && (
                          <button
                            onClick={() =>
                              setPreviewImage({
                                title: note.title,
                                url: note.previewImageUrl || note.url,
                              })
                            }
                            className="p-2 rounded-full hover:bg-[var(--md-sys-color-surface-container-highest)] text-[var(--md-sys-color-primary)] transition border-none outline-none cursor-pointer"
                            title="Preview Image"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                        )}

                        <a
                          href={note.url}
                          download={note.title}
                          onClick={(e) => {
                            if (note.url === '#') {
                              e.preventDefault();
                              showSecurityToast('Simulated Download: ' + note.title);
                            }
                          }}
                          className="p-2 rounded-full hover:bg-[var(--md-sys-color-surface-container-highest)] text-[var(--md-sys-color-primary)] transition border-none outline-none cursor-pointer"
                          title="Download Material"
                        >
                          <Download className="w-4 h-4" />
                        </a>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* SECTION 3: TESTS (Integrated with Elevate Test Runner) */}
        {folderActiveTab === 'tests' && (
          <div className="space-y-4">
            {folderTests.length === 0 ? (
              <div className="text-center py-16 bg-[var(--md-sys-color-surface-container)] rounded-3xl p-6 text-xs text-[var(--md-sys-color-on-surface-variant)]">
                No mock tests linked to this folder yet.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-5">
                {folderTests.map((t) => (
                  <div
                    key={t.id}
                    onClick={() => {
                      if (onStartTest) {
                        onStartTest(t);
                      } else {
                        showSecurityToast('Opening test runner...');
                      }
                    }}
                    className="bg-[var(--md-sys-color-surface-container)] rounded-2xl sm:rounded-3xl overflow-hidden group cursor-pointer transition flex flex-row sm:flex-col p-0 border-none shadow-xs hover:shadow-md items-stretch"
                  >
                    {/* Corner Test Clip / Banner */}
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
                    </div>

                    {/* Test Details */}
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
                              onStartTest(t);
                            } else {
                              showSecurityToast('Opening test runner...');
                            }
                          }}
                          className="text-emerald-600 dark:text-emerald-400 font-bold flex items-center space-x-1 border-none bg-transparent cursor-pointer shrink-0"
                        >
                          <span>Start</span>
                          <ChevronRight className="w-3 sm:w-3.5 h-3 sm:h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
        {previewImage && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
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
      </div>
    );
  }

  /* =========================================================================
     STAGE 4: LECTURE VIEW (Full Cloaked Video Player with Notes & Milestones)
     ========================================================================= */
  return (
    <div className="space-y-4 sm:space-y-6 pb-24 md:pb-16 max-w-7xl mx-auto m3-transition-enter">
      {/* Mobile Top Back Bar: Only Back Button (Replaces top header on mobile) */}
      <div className="flex items-center justify-between sm:hidden px-3.5 py-2">
        <button
          onClick={() => setCurrentStage('folder_content')}
          className="flex items-center space-x-1 text-xs font-bold text-[var(--md-sys-color-primary)] border-none bg-transparent cursor-pointer p-0 hover:underline"
        >
          <ChevronLeft className="w-5 h-5 -ml-1" />
          <span>Back to {currentFolder?.title || 'Chapter'}</span>
        </button>

        <span className="text-[11px] font-mono text-[var(--md-sys-color-on-surface-variant)]">
          {activeLecture?.durationMinutes} Mins
        </span>
      </div>

      {/* Desktop Navigation Breadcrumbs */}
      <div className="hidden sm:flex items-center justify-between">
        <button
          onClick={() => setCurrentStage('folder_content')}
          className="flex items-center space-x-1.5 text-xs sm:text-sm font-bold text-[var(--md-sys-color-primary)] hover:underline border-none bg-transparent cursor-pointer"
        >
          <ChevronLeft className="w-4 h-4" />
          <span>Back to {currentFolder?.title || 'Folder'}</span>
        </button>

        <span className="text-xs font-mono text-[var(--md-sys-color-on-surface-variant)]">
          {activeLecture?.durationMinutes} Mins Lecture
        </span>
      </div>

      {/* Main Grid: Player on Left, In-Video Notes & Chapters on Right */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-6">
        {/* LEFT COLUMN: Full-Width Video Player on Mobile & Lecture Info */}
        <div className="lg:col-span-8 space-y-4">
          <div className="w-full rounded-none sm:rounded-3xl overflow-hidden shadow-2xl border-none">
            <CloakedVideoPlayer
              encryptedVideoId={activeLecture.encryptedVideoId}
              title={activeLecture.title}
              user={user}
              batchId={currentBatch.id}
              lectureId={activeLecture.id}
              seekToSeconds={activeSeekSeconds}
              milestones={activeLecture.milestones || []}
              onProgress={(sec, total) => {
                setCurrentPlaybackSec(sec);
                updateWatchProgress(activeLecture.id, sec, total);
              }}
            />
          </div>

          {/* Lecture Metadata - Mobile padding prevents touching boundary edges */}
          <div className="px-3.5 sm:px-0">
            <div className="bg-[var(--md-sys-color-surface-container)] rounded-2xl sm:rounded-3xl p-4 sm:p-5 space-y-2 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-xs text-[var(--md-sys-color-primary)] font-bold">
                  {currentFolder?.title}
                </span>
              </div>
              <h1 className="text-base sm:text-lg font-bold text-[var(--md-sys-color-on-surface)] leading-snug">
                {activeLecture.title}
              </h1>
              <p className="text-xs text-[var(--md-sys-color-on-surface-variant)] leading-relaxed">
                {activeLecture.description}
              </p>
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: Interactive Tabs (In-Video Notes / Milestones / Notes Content) */}
        <div className="lg:col-span-4 space-y-4 px-3.5 sm:px-0">
          <div className="bg-[var(--md-sys-color-surface-container)] rounded-2xl sm:rounded-3xl overflow-hidden shadow-xs p-4 space-y-4">
            {/* Tabs Header - Scrollable without cutting buttons on mobile */}
            <div className="flex border-b border-[var(--md-sys-color-outline-variant)]/20 pb-2 space-x-1.5 overflow-x-auto scrollbar-none">
              <button
                onClick={() => setLectureTab('personal_notes')}
                className={`py-1.5 px-3 rounded-full text-xs font-bold transition border-none outline-none cursor-pointer whitespace-nowrap shrink-0 ${
                  lectureTab === 'personal_notes'
                    ? 'bg-[var(--md-sys-color-primary)] text-[var(--md-sys-color-on-primary)]'
                    : 'text-[var(--md-sys-color-on-surface-variant)] hover:bg-[var(--md-sys-color-surface-container-high)]'
                }`}
              >
                In-Video Notes ({lecturePersonalNotes.length})
              </button>

              <button
                onClick={() => setLectureTab('milestones')}
                className={`py-1.5 px-3 rounded-full text-xs font-bold transition border-none outline-none cursor-pointer whitespace-nowrap shrink-0 ${
                  lectureTab === 'milestones'
                    ? 'bg-[var(--md-sys-color-primary)] text-[var(--md-sys-color-on-primary)]'
                    : 'text-[var(--md-sys-color-on-surface-variant)] hover:bg-[var(--md-sys-color-surface-container-high)]'
                }`}
              >
                Milestones ({activeLecture.milestones?.length || 0})
              </button>

              <button
                onClick={() => setLectureTab('notes_content')}
                className={`py-1.5 px-3 rounded-full text-xs font-bold transition border-none outline-none cursor-pointer whitespace-nowrap shrink-0 ${
                  lectureTab === 'notes_content'
                    ? 'bg-[var(--md-sys-color-primary)] text-[var(--md-sys-color-on-primary)]'
                    : 'text-[var(--md-sys-color-on-surface-variant)] hover:bg-[var(--md-sys-color-surface-container-high)]'
                }`}
              >
                Notes Content
              </button>
            </div>

            {/* TAB 1: IN-VIDEO NOTES */}
            {lectureTab === 'personal_notes' && (
              <div className="space-y-4">
                <form onSubmit={handleCreateNote} className="space-y-2">
                  <div className="flex items-center justify-between text-[11px] text-[var(--md-sys-color-on-surface-variant)]">
                    <span>Pin Note at Current Video Clock:</span>
                    <span className="font-mono font-bold text-[var(--md-sys-color-primary)]">
                      ⏱️ {formatDuration(currentPlaybackSec)}
                    </span>
                  </div>
                  <div className="flex space-x-2">
                    <input
                      type="text"
                      value={noteInputText}
                      onChange={(e) => setNoteInputText(e.target.value)}
                      placeholder="Add key formula or concept bookmark..."
                      className="flex-1 px-3 py-2 bg-[var(--md-sys-color-surface-container-high)] rounded-2xl text-xs text-[var(--md-sys-color-on-surface)] border-none outline-none"
                    />
                    <button
                      type="submit"
                      className="m3-btn-filled px-3 py-2 text-xs font-bold border-none outline-none cursor-pointer"
                    >
                      Save
                    </button>
                  </div>
                </form>

                {/* Notes List */}
                <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                  {lecturePersonalNotes.length === 0 ? (
                    <div className="text-center py-8 text-xs text-[var(--md-sys-color-on-surface-variant)]">
                      No notes created yet. Play the video and bookmark timestamps above!
                    </div>
                  ) : (
                    lecturePersonalNotes.map((pn) => (
                      <div
                        key={pn.id}
                        className="p-3 rounded-2xl bg-[var(--md-sys-color-surface-container-high)] space-y-1.5"
                      >
                        <div className="flex items-center justify-between">
                          <button
                            onClick={() => setActiveSeekSeconds(pn.seconds)}
                            className="px-2.5 py-0.5 rounded-full bg-[var(--md-sys-color-primary-container)] text-[var(--md-sys-color-on-primary-container)] font-mono text-[10px] font-bold flex items-center space-x-1 border-none cursor-pointer"
                          >
                            <Play className="w-2.5 h-2.5 fill-current" />
                            <span>{formatDuration(pn.seconds)}</span>
                          </button>
                          <button
                            onClick={() => deletePersonalNote(pn.id)}
                            className="text-[var(--md-sys-color-outline)] hover:text-red-400 p-1 border-none bg-transparent cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        <p className="text-xs text-[var(--md-sys-color-on-surface)] leading-relaxed">
                          {pn.text}
                        </p>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}

            {/* TAB 2: MILESTONES */}
            {lectureTab === 'milestones' && (
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {activeLecture.milestones?.map((m) => (
                  <div
                    key={m.id}
                    onClick={() => setActiveSeekSeconds(m.seconds)}
                    className="p-3 rounded-2xl bg-[var(--md-sys-color-surface-container-high)] hover:bg-[var(--md-sys-color-surface-container-highest)] cursor-pointer transition flex items-center justify-between text-xs"
                  >
                    <div className="flex items-center space-x-2">
                      <Flag className="w-3.5 h-3.5 text-amber-500" />
                      <span className="font-semibold text-[var(--md-sys-color-on-surface)]">
                        {m.title}
                      </span>
                    </div>
                    <span className="font-mono text-[11px] text-[var(--md-sys-color-primary)] font-bold">
                      {formatDuration(m.seconds)}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {/* TAB 3: NOTES CONTENT */}
            {lectureTab === 'notes_content' && (
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {activeLecture.pdfNotes?.map((pn) => (
                  <div
                    key={pn.id}
                    className="p-3 rounded-2xl bg-[var(--md-sys-color-surface-container-high)] flex items-center justify-between text-xs"
                  >
                    <div className="flex items-center space-x-2 truncate">
                      <FileText className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                      <span className="truncate font-semibold text-[var(--md-sys-color-on-surface)]">
                        {pn.title}
                      </span>
                    </div>
                    <span className="font-mono text-[10px] text-[var(--md-sys-color-outline)] flex-shrink-0">
                      {pn.size}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
