import React, { useState, useMemo, useEffect } from 'react';
import {
  ArrowLeft,
  Edit3,
  Users,
  PlusCircle,
  PlayCircle,
  FileText,
  Award,
  Calendar,
  IndianRupee,
  ShieldCheck,
  CheckCircle,
  Trash2,
  FolderPlus,
  Video,
  Eye,
  Sliders,
  ExternalLink,
  Search,
  BookOpen,
  Sparkles,
  Layers,
} from 'lucide-react';
import { useApp } from '../../../lms/LmsContext';
import { CloakedVideoPlayer } from '../player/CloakedVideoPlayer';
import { extractYouTubeId, obfuscateVideoKey, buildGoogleDrivePreviewUrl, extractGoogleDriveId } from '../../../lms/security';
import type { Batch, Chapter, Lecture, BatchTestCard } from '../../../lms/types';
import { BatchEditorModal } from './BatchEditorModal';
import { BatchQuickEnrollModal } from './BatchQuickEnrollModal';
import { BatchDetailView } from './BatchDetailView';

interface InSituBatchWorkspaceProps {
  batchId: string;
  onBack: () => void;
  onNavigateToTestPublish?: () => void;
}

export const InSituBatchWorkspace: React.FC<InSituBatchWorkspaceProps> = ({
  batchId,
  onBack,
  onNavigateToTestPublish,
}) => {
  const {
    batches,
    updateBatch,
    deleteBatch,
    chapters,
    addChapter,
    lectures,
    addLecture,
    deleteLecture,
    user,
    getEnrollmentsForBatch,
    loadRosterForBatch,
    loadCurriculumForBatch,
    getTestsForBatch,
    showSecurityToast,
  } = useApp();

  const batch = useMemo(() => batches.find((b) => b.id === batchId) || batches[0], [batches, batchId]);

  // View mode: 'studio' (with admin controls) or 'student' (pure student fidelity)
  const [viewMode, setViewMode] = useState<'studio' | 'student'>('studio');

  // Active Workspace Tab
  const [activeTab, setActiveTab] = useState<'curriculum' | 'lectures' | 'notes' | 'tests' | 'students'>('curriculum');

  // Currently playing lecture for DRM inspection
  const [inspectedLecture, setInspectedLecture] = useState<Lecture | null>(null);

  // Modals
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isEnrollModalOpen, setIsEnrollModalOpen] = useState(false);

  // In-situ Add Chapter states
  const [isAddingChapter, setIsAddingChapter] = useState(false);
  const [newChapterTitle, setNewChapterTitle] = useState('');
  const [newChapterDesc, setNewChapterDesc] = useState('');

  // In-situ Add Lecture states
  const [isAddingLecture, setIsAddingLecture] = useState(false);
  const [newLectureTitle, setNewLectureTitle] = useState('');
  const [newLectureVideoUrl, setNewLectureVideoUrl] = useState('');
  const [newLectureChapterId, setNewLectureChapterId] = useState('');
  const [newLectureDuration, setNewLectureDuration] = useState('45');
  const [newLectureNotesTitle, setNewLectureNotesTitle] = useState('');
  const [newLectureNotesUrl, setNewLectureNotesUrl] = useState('');

  // Filtered data for this batch
  const batchChapters = useMemo(() => chapters.filter((c) => c.batchId === batch?.id), [chapters, batch?.id]);
  const batchLectures = useMemo(() => lectures.filter((l) => l.batchId === batch?.id), [lectures, batch?.id]);
  const batchEnrollments = useMemo(() => (batch ? getEnrollmentsForBatch(batch.id) : []), [batch, getEnrollmentsForBatch]);
  const batchTests = useMemo(() => (batch ? getTestsForBatch(batch.id) : []), [batch, getTestsForBatch]);

  useEffect(() => {
    if (batch?.id) {
      loadRosterForBatch(batch.id);
      loadCurriculumForBatch(batch.id);
    }
  }, [batch?.id, loadRosterForBatch, loadCurriculumForBatch]);

  if (!batch) {
    return (
      <div className="p-8 text-center text-xs text-[var(--md-sys-color-on-surface-variant)]">
        Batch not found.
        <button onClick={onBack} className="ml-2 underline font-bold">Return to catalog</button>
      </div>
    );
  }

  const handleSaveBatchEdit = (updatedData: any, existingId?: string) => {
    const targetId = existingId || batch.id;
    updateBatch(targetId, updatedData);
    showSecurityToast(`Batch "${updatedData.title || batch.title}" updated successfully.`);
  };

  const handleCreateChapter = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newChapterTitle.trim()) return;

    addChapter({
      batchId: batch.id,
      subjectId: 'sub_math_01',
      title: newChapterTitle.trim(),
      description: newChapterDesc.trim() || 'Curriculum module with video lessons and study materials.',
      order: batchChapters.length + 1,
    });

    setNewChapterTitle('');
    setNewChapterDesc('');
    setIsAddingChapter(false);
    showSecurityToast(`Chapter added to ${batch.title}`);
  };

  const handleCreateLecture = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newLectureTitle.trim() || !newLectureVideoUrl.trim()) return;

    const ytId = extractYouTubeId(newLectureVideoUrl) || 'dQw4w9WgXcQ';
    const encryptedKey = obfuscateVideoKey(ytId);
    const driveId = newLectureNotesUrl ? extractGoogleDriveId(newLectureNotesUrl) : null;

    const notesList = [];
    if (newLectureNotesTitle.trim() && newLectureNotesUrl.trim()) {
      notesList.push({
        id: `note_${Date.now()}`,
        title: newLectureNotesTitle.trim(),
        url: driveId ? buildGoogleDrivePreviewUrl(driveId) : newLectureNotesUrl.trim(),
        size: 'Drive PDF',
        type: 'pdf' as const,
      });
    }

    addLecture({
      batchId: batch.id,
      subjectId: 'sub_math_01',
      chapterId: newLectureChapterId || batchChapters[0]?.id || 'chap_default',
      title: newLectureTitle.trim(),
      description: 'Comprehensive coaching lecture with problem solving and notes.',
      durationMinutes: Number(newLectureDuration) || 45,
      videoSourceType: 'youtube',
      encryptedVideoId: encryptedKey,
      thumbnailUrl: `https://img.youtube.com/vi/${ytId}/hqdefault.jpg`,
      order: batchLectures.length + 1,
      isFreePreview: false,
      pdfNotes: notesList,
      notes: notesList,
      faculty: {
        name: batch.instructor?.name || 'Sanju Kumar',
        designation: batch.instructor?.designation || 'Senior Faculty',
        avatarUrl: batch.instructor?.avatarUrl || '',
      },
    });

    setNewLectureTitle('');
    setNewLectureVideoUrl('');
    setNewLectureNotesTitle('');
    setNewLectureNotesUrl('');
    setIsAddingLecture(false);
    showSecurityToast(`Lecture "${newLectureTitle}" published to batch`);
  };

  return (
    <div className="space-y-6 animate-fade-in pb-12">
      {/* Top Breadcrumb & Dual-Mode Toggle Bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4 rounded-3xl bg-[var(--md-sys-color-surface-container)] shadow-xs">
        <div className="flex items-center space-x-3">
          <button
            onClick={onBack}
            className="p-2 rounded-2xl bg-[var(--md-sys-color-surface-container-high)] text-[var(--md-sys-color-on-surface)] hover:opacity-80 transition border-none outline-none cursor-pointer flex items-center space-x-1"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="text-xs font-bold hidden sm:inline">Batches Catalog</span>
          </button>
          <div>
            <div className="flex items-center space-x-2 text-xs font-semibold text-[var(--md-sys-color-on-surface-variant)]">
              <span>Batches</span>
              <span>/</span>
              <span className="text-[var(--md-sys-color-on-surface)] font-bold">{batch.title}</span>
            </div>
          </div>
        </div>

        {/* Studio vs Student View Toggle */}
        <div className="flex items-center space-x-2 self-end sm:self-center">
          <div className="flex items-center bg-[var(--md-sys-color-surface-container-high)] p-1 rounded-full text-xs font-bold">
            <button
              onClick={() => setViewMode('studio')}
              className={`px-3 py-1.5 rounded-full transition border-none outline-none cursor-pointer flex items-center space-x-1.5 ${
                viewMode === 'studio'
                  ? 'bg-[var(--md-sys-color-primary)] text-[var(--md-sys-color-on-primary)] shadow-xs'
                  : 'text-[var(--md-sys-color-on-surface-variant)] hover:text-[var(--md-sys-color-on-surface)]'
              }`}
            >
              <Sliders className="w-3.5 h-3.5" />
              <span>Studio Mode (Admin)</span>
            </button>
            <button
              onClick={() => setViewMode('student')}
              className={`px-3 py-1.5 rounded-full transition border-none outline-none cursor-pointer flex items-center space-x-1.5 ${
                viewMode === 'student'
                  ? 'bg-emerald-500 text-white shadow-xs'
                  : 'text-[var(--md-sys-color-on-surface-variant)] hover:text-[var(--md-sys-color-on-surface)]'
              }`}
            >
              <Eye className="w-3.5 h-3.5" />
              <span>Student Preview</span>
            </button>
          </div>
        </div>
      </div>

      {/* Hero Header with In-Situ Admin Controls */}
      <div className="relative rounded-3xl overflow-hidden bg-[var(--md-sys-color-surface-container)] shadow-sm">
        {/* Banner Image with Gradient Overlay */}
        <div className="h-48 md:h-60 w-full relative overflow-hidden">
          <img
            src={batch.bannerUrl || batch.thumbnailUrl}
            alt={batch.title}
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[var(--md-sys-color-surface-container)] via-black/40 to-black/20" />

          {/* Badges on Banner */}
          <div className="absolute top-4 left-4 flex items-center space-x-2">
            <span className="px-3 py-1 rounded-full text-xs font-bold bg-black/60 backdrop-blur-md text-white shadow-md">
              {batch.category}
            </span>
            <span className={`px-3 py-1 rounded-full text-xs font-bold backdrop-blur-md text-white ${batch.isPublished ? 'bg-emerald-500/80' : 'bg-amber-500/80'}`}>
              {batch.isPublished ? '● Published' : '○ Draft'}
            </span>
          </div>

          {/* Top-Right Admin Action Triggers (Studio Mode Only) */}
          {viewMode === 'studio' && (
            <div className="absolute top-4 right-4 flex items-center space-x-2">
              <button
                onClick={() => setIsEditModalOpen(true)}
                className="px-3 py-1.5 rounded-full text-xs font-bold bg-white/90 text-gray-900 hover:bg-white shadow-md backdrop-blur-md transition border-none outline-none cursor-pointer flex items-center space-x-1.5"
              >
                <Edit3 className="w-3.5 h-3.5 text-indigo-600" />
                <span>Edit Batch</span>
              </button>
              <button
                onClick={() => setIsEnrollModalOpen(true)}
                className="px-3 py-1.5 rounded-full text-xs font-bold bg-emerald-600 text-white hover:bg-emerald-500 shadow-md backdrop-blur-md transition border-none outline-none cursor-pointer flex items-center space-x-1.5"
              >
                <Users className="w-3.5 h-3.5" />
                <span>Enroll Students ({batchEnrollments.length})</span>
              </button>
            </div>
          )}
        </div>

        {/* Hero Details */}
        <div className="p-6 md:p-8 space-y-4">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
            <div className="space-y-1">
              <h1 className="text-xl md:text-2xl font-black text-[var(--md-sys-color-on-surface)]">
                {batch.title}
              </h1>
              <p className="text-xs md:text-sm text-[var(--md-sys-color-on-surface-variant)] max-w-3xl">
                {batch.tagline || batch.description}
              </p>
            </div>

            {/* Price & Validity Card */}
            <div className="flex items-center space-x-4 bg-[var(--md-sys-color-surface-container-high)] p-3.5 rounded-2xl flex-shrink-0">
              <div>
                <span className="text-lg font-black text-emerald-600 dark:text-emerald-400">
                  ₹{batch.price}
                </span>
                {batch.originalPrice > batch.price && (
                  <span className="text-xs line-through opacity-60 ml-2">₹{batch.originalPrice}</span>
                )}
                <p className="text-[10px] text-[var(--md-sys-color-on-surface-variant)] flex items-center space-x-1 mt-0.5">
                  <Calendar className="w-3 h-3 text-indigo-500" />
                  <span>Valid for {batch.validityDays} Days</span>
                </p>
              </div>

              {viewMode === 'studio' && onNavigateToTestPublish && (
                <button
                  onClick={onNavigateToTestPublish}
                  className="px-3 py-2 m3-btn-filled text-xs font-bold shadow-xs border-none outline-none cursor-pointer flex items-center space-x-1.5"
                >
                  <Award className="w-3.5 h-3.5" />
                  <span>Publish Tests</span>
                </button>
              )}
            </div>
          </div>

          {/* Quick Metrics Bar */}
          <div className="flex items-center space-x-3 pt-2 text-xs font-semibold text-[var(--md-sys-color-on-surface-variant)] flex-wrap gap-y-2">
            <span className="px-3 py-1 rounded-full bg-[var(--md-sys-color-surface-container-high)] flex items-center space-x-1.5">
              <Users className="w-3.5 h-3.5 text-emerald-500" />
              <span>{batchEnrollments.length} Enrolled Students</span>
            </span>
            <span className="px-3 py-1 rounded-full bg-[var(--md-sys-color-surface-container-high)] flex items-center space-x-1.5">
              <Award className="w-3.5 h-3.5 text-amber-500" />
              <span>{batchTests.length} Batch Tests</span>
            </span>
            <span className="px-3 py-1 rounded-full bg-[var(--md-sys-color-surface-container-high)] flex items-center space-x-1.5">
              <PlayCircle className="w-3.5 h-3.5 text-indigo-500" />
              <span>{batchLectures.length} Video Lectures</span>
            </span>
            <span className="px-3 py-1 rounded-full bg-[var(--md-sys-color-surface-container-high)] flex items-center space-x-1.5">
              <BookOpen className="w-3.5 h-3.5 text-purple-500" />
              <span>{batchChapters.length} Curriculum Chapters</span>
            </span>
          </div>
        </div>
      </div>

      {/* Live DRM Video Inspection Player (when an admin or student clicks a lecture) */}
      {inspectedLecture && (
        <div className="bg-[var(--md-sys-color-surface-container)] p-6 rounded-3xl shadow-lg border-none space-y-3 animate-fade-in">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
              <h3 className="text-sm font-bold text-[var(--md-sys-color-on-surface)]">
                Live Player Preview: {inspectedLecture.title}
              </h3>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 font-bold">
                DRM Watermarked
              </span>
            </div>
            <button
              onClick={() => setInspectedLecture(null)}
              className="px-3 py-1 rounded-full text-xs font-bold bg-[var(--md-sys-color-surface-container-high)] hover:opacity-80 transition border-none outline-none cursor-pointer"
            >
              Close Player Preview
            </button>
          </div>

          <div className="rounded-2xl overflow-hidden shadow-md max-w-4xl mx-auto">
            <CloakedVideoPlayer
              encryptedVideoId={inspectedLecture.encryptedVideoId}
              title={inspectedLecture.title}
              user={user}
              batchId={batch.id}
              lectureId={inspectedLecture.id}
              isGuestAllowed={true}
            />
          </div>
          <p className="text-[11px] text-center text-[var(--md-sys-color-on-surface-variant)]">
            Inspecting student-fidelity video playback: dynamic moving DRM watermark and 5-second persistent overlay touch controls active.
          </p>
        </div>
      )}

      {/* Student-Fidelity Navigation Tabs */}
      <div className="flex items-center space-x-2 border-b border-[var(--md-sys-color-outline-variant)]/20 pb-3 overflow-x-auto">
        <button
          onClick={() => setActiveTab('curriculum')}
          className={`px-4 py-2 rounded-full text-xs font-bold flex items-center space-x-1.5 transition border-none outline-none cursor-pointer whitespace-nowrap ${
            activeTab === 'curriculum'
              ? 'm3-btn-filled shadow-xs'
              : 'text-[var(--md-sys-color-on-surface-variant)] hover:bg-[var(--md-sys-color-surface-container-high)]'
          }`}
        >
          <BookOpen className="w-4 h-4" />
          <span>Curriculum & Chapters ({batchChapters.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('lectures')}
          className={`px-4 py-2 rounded-full text-xs font-bold flex items-center space-x-1.5 transition border-none outline-none cursor-pointer whitespace-nowrap ${
            activeTab === 'lectures'
              ? 'm3-btn-filled shadow-xs'
              : 'text-[var(--md-sys-color-on-surface-variant)] hover:bg-[var(--md-sys-color-surface-container-high)]'
          }`}
        >
          <PlayCircle className="w-4 h-4" />
          <span>Lectures & DRM Videos ({batchLectures.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('tests')}
          className={`px-4 py-2 rounded-full text-xs font-bold flex items-center space-x-1.5 transition border-none outline-none cursor-pointer whitespace-nowrap ${
            activeTab === 'tests'
              ? 'm3-btn-filled shadow-xs'
              : 'text-[var(--md-sys-color-on-surface-variant)] hover:bg-[var(--md-sys-color-surface-container-high)]'
          }`}
        >
          <Award className="w-4 h-4" />
          <span>Batch Mock Tests ({batchTests.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('students')}
          className={`px-4 py-2 rounded-full text-xs font-bold flex items-center space-x-1.5 transition border-none outline-none cursor-pointer whitespace-nowrap ${
            activeTab === 'students'
              ? 'm3-btn-filled shadow-xs'
              : 'text-[var(--md-sys-color-on-surface-variant)] hover:bg-[var(--md-sys-color-surface-container-high)]'
          }`}
        >
          <Users className="w-4 h-4" />
          <span>Enrolled Students ({batchEnrollments.length})</span>
        </button>
      </div>

      {/* TAB CONTENT: CURRICULUM & HIERARCHICAL FOLDERS (Google Drive-Style Explorer) */}
      {activeTab === 'curriculum' && (
        <div className="space-y-4">
          <BatchDetailView
            batchId={batch.id}
            isMasterEditMode={viewMode === 'studio'}
          />
        </div>
      )}

      {/* TAB CONTENT: LECTURES & VIDEOS */}
      {activeTab === 'lectures' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-[var(--md-sys-color-on-surface)]">
                Video Lectures with DRM Cloaking
              </h3>
              <p className="text-xs text-[var(--md-sys-color-on-surface-variant)]">
                Encrypted video playback with dynamic moving watermark and touch controls
              </p>
            </div>

            {viewMode === 'studio' && (
              <button
                onClick={() => setIsAddingLecture(true)}
                className="px-3.5 py-2 m3-btn-filled text-xs font-bold shadow-xs border-none outline-none cursor-pointer flex items-center space-x-1.5"
              >
                <Video className="w-3.5 h-3.5" />
                <span>+ Add Video Lecture</span>
              </button>
            )}
          </div>

          {/* In-Situ Add Lecture Form (Studio Mode) */}
          {isAddingLecture && viewMode === 'studio' && (
            <form onSubmit={handleCreateLecture} className="p-5 rounded-3xl bg-[var(--md-sys-color-surface-container-high)] space-y-4 animate-fade-in">
              <h4 className="text-xs font-bold text-[var(--md-sys-color-on-surface)] flex items-center space-x-1.5">
                <Video className="w-4 h-4 text-[var(--md-sys-color-primary)]" />
                <span>Publish New Video Lecture (Auto-Cloaked)</span>
              </h4>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-bold text-[var(--md-sys-color-on-surface-variant)] block mb-1">
                    Lecture Title *
                  </label>
                  <input
                    type="text"
                    required
                    value={newLectureTitle}
                    onChange={(e) => setNewLectureTitle(e.target.value)}
                    placeholder="e.g. Masterclass 01: Standard Limits & L'Hopital Rule"
                    className="w-full p-2.5 bg-[var(--md-sys-color-surface-container-highest)] rounded-xl text-xs text-[var(--md-sys-color-on-surface)] border-none outline-none font-semibold"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-bold text-[var(--md-sys-color-on-surface-variant)] block mb-1">
                    YouTube Video URL *
                  </label>
                  <input
                    type="text"
                    required
                    value={newLectureVideoUrl}
                    onChange={(e) => setNewLectureVideoUrl(e.target.value)}
                    placeholder="https://www.youtube.com/watch?v=..."
                    className="w-full p-2.5 bg-[var(--md-sys-color-surface-container-highest)] rounded-xl text-xs text-[var(--md-sys-color-on-surface)] border-none outline-none font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label className="text-[11px] font-bold text-[var(--md-sys-color-on-surface-variant)] block mb-1">
                    Assign to Chapter
                  </label>
                  <select
                    value={newLectureChapterId}
                    onChange={(e) => setNewLectureChapterId(e.target.value)}
                    className="w-full p-2.5 bg-[var(--md-sys-color-surface-container-highest)] rounded-xl text-xs text-[var(--md-sys-color-on-surface)] border-none outline-none cursor-pointer"
                  >
                    {batchChapters.map((c) => (
                      <option key={c.id} value={c.id}>{c.title}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-[11px] font-bold text-[var(--md-sys-color-on-surface-variant)] block mb-1">
                    Duration (Minutes)
                  </label>
                  <input
                    type="number"
                    value={newLectureDuration}
                    onChange={(e) => setNewLectureDuration(e.target.value)}
                    className="w-full p-2.5 bg-[var(--md-sys-color-surface-container-highest)] rounded-xl text-xs text-[var(--md-sys-color-on-surface)] border-none outline-none"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-bold text-[var(--md-sys-color-on-surface-variant)] block mb-1">
                    Attached Study Notes PDF Link
                  </label>
                  <input
                    type="text"
                    value={newLectureNotesUrl}
                    onChange={(e) => {
                      setNewLectureNotesUrl(e.target.value);
                      if (!newLectureNotesTitle) setNewLectureNotesTitle('Classroom Notes PDF');
                    }}
                    placeholder="Google Drive PDF link"
                    className="w-full p-2.5 bg-[var(--md-sys-color-surface-container-highest)] rounded-xl text-xs text-[var(--md-sys-color-on-surface)] border-none outline-none font-mono"
                  />
                </div>
              </div>

              <div className="flex justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsAddingLecture(false)}
                  className="px-3.5 py-1.5 rounded-full text-xs font-bold bg-[var(--md-sys-color-surface-container-highest)] text-[var(--md-sys-color-on-surface)] border-none outline-none cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-1.5 m3-btn-filled text-xs font-bold shadow-xs border-none outline-none cursor-pointer"
                >
                  Cloak & Publish Lecture
                </button>
              </div>
            </form>
          )}

          {/* Lectures List */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {batchLectures.length === 0 ? (
              <div className="col-span-2 p-8 text-center rounded-3xl bg-[var(--md-sys-color-surface-container)] text-xs text-[var(--md-sys-color-on-surface-variant)]">
                No video lectures in this batch yet.
              </div>
            ) : (
              batchLectures.map((lec) => (
                <div
                  key={lec.id}
                  className="p-4 rounded-3xl bg-[var(--md-sys-color-surface-container)] hover:shadow-md transition space-y-3 flex flex-col justify-between"
                >
                  <div className="space-y-2.5">
                    <div className="relative rounded-2xl overflow-hidden aspect-video bg-black">
                      <img
                        src={lec.thumbnailUrl}
                        alt={lec.title}
                        className="w-full h-full object-cover"
                      />
                      <button
                        onClick={() => setInspectedLecture(lec)}
                        className="absolute inset-0 flex items-center justify-center bg-black/40 hover:bg-black/20 transition cursor-pointer border-none outline-none group"
                      >
                        <div className="w-12 h-12 rounded-full bg-white/90 text-gray-900 flex items-center justify-center shadow-lg group-hover:scale-110 transition">
                          <PlayCircle className="w-7 h-7 text-[var(--md-sys-color-primary)]" />
                        </div>
                      </button>
                      <span className="absolute bottom-2 right-2 px-2 py-0.5 rounded-md bg-black/80 text-[10px] font-bold text-white">
                        {lec.durationMinutes} mins
                      </span>
                    </div>

                    <div>
                      <h4 className="text-xs font-bold text-[var(--md-sys-color-on-surface)] line-clamp-1">
                        {lec.title}
                      </h4>
                      <p className="text-[11px] text-[var(--md-sys-color-on-surface-variant)] line-clamp-2 mt-0.5">
                        {lec.description}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-[var(--md-sys-color-outline-variant)]/20 text-xs">
                    <span className="text-[10px] text-[var(--md-sys-color-on-surface-variant)]">
                      Faculty: {lec.faculty?.name || 'Sanju Kumar'}
                    </span>

                    <div className="flex items-center space-x-1.5">
                      <button
                        onClick={() => setInspectedLecture(lec)}
                        className="px-2.5 py-1 rounded-full bg-[var(--md-sys-color-primary-container)] text-[var(--md-sys-color-on-primary-container)] text-[10px] font-bold hover:opacity-90 transition border-none outline-none cursor-pointer flex items-center space-x-1"
                      >
                        <PlayCircle className="w-3 h-3" />
                        <span>Play Live</span>
                      </button>

                      {viewMode === 'studio' && (
                        <button
                          onClick={() => {
                            if (window.confirm(`Delete lecture "${lec.title}"?`)) {
                              deleteLecture(lec.id);
                              showSecurityToast(`Deleted ${lec.title}`);
                            }
                          }}
                          className="p-1 rounded-full hover:bg-rose-500/15 text-rose-500 transition border-none outline-none cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* TAB CONTENT: BATCH MOCK TESTS */}
      {activeTab === 'tests' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-[var(--md-sys-color-on-surface)]">
                Batch Mock Tests Catalog (1-Read Manifest)
              </h3>
              <p className="text-xs text-[var(--md-sys-color-on-surface-variant)]">
                Pre-packaged 750 KB bin-packed test payloads loaded with zero redundant reads
              </p>
            </div>

            {viewMode === 'studio' && onNavigateToTestPublish && (
              <button
                onClick={onNavigateToTestPublish}
                className="px-3.5 py-2 m3-btn-filled text-xs font-bold shadow-xs border-none outline-none cursor-pointer flex items-center space-x-1.5"
              >
                <Award className="w-3.5 h-3.5" />
                <span>+ Publish New Test to Batch</span>
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {batchTests.length === 0 ? (
              <div className="col-span-3 p-8 text-center rounded-3xl bg-[var(--md-sys-color-surface-container)] text-xs text-[var(--md-sys-color-on-surface-variant)]">
                No mock tests published to this batch yet. Use "+ Publish New Test to Batch" to bin-pack tests into 750 KB chunks.
              </div>
            ) : (
              batchTests.map((test) => (
                <div
                  key={test.testId}
                  className="p-4 rounded-3xl bg-[var(--md-sys-color-surface-container)] shadow-xs space-y-3 flex flex-col justify-between"
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/15 text-amber-600 dark:text-amber-400 capitalize">
                        {test.difficulty}
                      </span>
                      <span className="text-[10px] font-mono text-[var(--md-sys-color-on-surface-variant)]">
                        {test.chunkEstimatedBytes ? `${Math.round(test.chunkEstimatedBytes / 1024)} KB` : '750 KB Bin'}
                      </span>
                    </div>

                    <h4 className="text-xs font-bold text-[var(--md-sys-color-on-surface)] line-clamp-1">
                      {test.title}
                    </h4>
                    <p className="text-[11px] text-[var(--md-sys-color-on-surface-variant)]">
                      Topic: {test.topic}
                    </p>

                    <div className="flex items-center space-x-3 text-[10px] text-[var(--md-sys-color-on-surface-variant)]">
                      <span>📝 {test.questionCount} Questions</span>
                      <span>⏱️ {test.timeLimitMinutes} Mins</span>
                      <span>🎯 {test.passingScorePercentage}% Pass</span>
                    </div>
                  </div>

                  <div className="pt-2 border-t border-[var(--md-sys-color-outline-variant)]/20 flex items-center justify-between">
                    <span className="text-[10px] text-[var(--md-sys-color-on-surface-variant)]">
                      Published: {new Date(test.publishedAt).toLocaleDateString()}
                    </span>
                    <button
                      onClick={() => showSecurityToast(`Launching student preview for ${test.title}`)}
                      className="px-3 py-1 rounded-full bg-[var(--md-sys-color-primary-container)] text-[var(--md-sys-color-on-primary-container)] text-[10px] font-bold hover:opacity-90 transition border-none outline-none cursor-pointer flex items-center space-x-1"
                    >
                      <Eye className="w-3 h-3" />
                      <span>Take Test</span>
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* TAB CONTENT: ENROLLED STUDENTS */}
      {activeTab === 'students' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-[var(--md-sys-color-on-surface)]">
                Enrolled Students ({batchEnrollments.length})
              </h3>
              <p className="text-xs text-[var(--md-sys-color-on-surface-variant)]">
                Roster of authenticated accounts with valid batch access
              </p>
            </div>

            {viewMode === 'studio' && (
              <button
                onClick={() => setIsEnrollModalOpen(true)}
                className="px-3.5 py-2 m3-btn-filled text-xs font-bold shadow-xs border-none outline-none cursor-pointer flex items-center space-x-1.5"
              >
                <Users className="w-3.5 h-3.5" />
                <span>+ Enroll Student</span>
              </button>
            )}
          </div>

          <div className="bg-[var(--md-sys-color-surface-container)] rounded-3xl p-4 shadow-xs">
            {batchEnrollments.length === 0 ? (
              <div className="p-8 text-center text-xs text-[var(--md-sys-color-on-surface-variant)]">
                No students enrolled in this batch yet.
              </div>
            ) : (
              <div className="divide-y divide-[var(--md-sys-color-outline-variant)]/20">
                {batchEnrollments.map((enr) => (
                  <div key={enr.id} className="py-3 flex items-center justify-between text-xs">
                    <div>
                      <p className="font-bold text-[var(--md-sys-color-on-surface)]">{enr.studentName}</p>
                      <p className="text-[11px] text-[var(--md-sys-color-on-surface-variant)]">
                        {enr.studentEmail || enr.studentPhone || enr.userId}
                      </p>
                    </div>
                    <div className="flex items-center space-x-3">
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 font-bold">
                        Active
                      </span>
                      <span className="text-[10px] text-[var(--md-sys-color-on-surface-variant)]">
                        Enrolled {new Date(enr.enrolledAt).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Editor & Enroll Modals */}
      <BatchEditorModal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        batchToEdit={batch}
        onSave={handleSaveBatchEdit}
      />

      <BatchQuickEnrollModal
        isOpen={isEnrollModalOpen}
        onClose={() => setIsEnrollModalOpen(false)}
        batch={batch}
      />
    </div>
  );
};
