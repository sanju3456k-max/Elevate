import React, { useState } from 'react';
import {
  PlusCircle,
  Video,
  Layers,
  FolderPlus,
  BookPlus,
  Trash2,
  ShieldCheck,
  Check,
  Sparkles,
  Play,
  Users,
  UserPlus,
  Mail,
  Phone,
  Search,
  FileText,
  Ban,
  CheckSquare,
  Edit3,
  Eye,
  Sliders,
  Calendar,
  Award,
  BookOpen,
  ArrowRight,
  ExternalLink,
  IndianRupee,
} from 'lucide-react';
import { useApp } from '../../lms/LmsContext';
import {
  extractYouTubeId,
  obfuscateVideoKey,
  extractGoogleDriveId,
  buildGoogleDrivePreviewUrl,
} from '../../lms/security';
import { CloakedVideoPlayer } from './player/CloakedVideoPlayer';
import { BatchEditorModal } from './batches/BatchEditorModal';
import { BatchQuickEnrollModal } from './batches/BatchQuickEnrollModal';
import { InSituBatchWorkspace } from './batches/InSituBatchWorkspace';
import type { Batch } from '../../lms/types';

export const BatchAdminStudio: React.FC = () => {
  const {
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
    user,
    showSecurityToast,
    enrollStudentByContact,
    revokeStudentEnrollment,
    getEnrollmentsForBatch,
    searchStudents,
    batchTests,
    addTestToBatchCatalog,
    getTestsForBatch,
    globalGuestAccessMode,
    setGlobalGuestAccessMode,
    toggleBatchGuestAccess,
  } = useApp();

  const [activeTab, setActiveTab] = useState<'manage_batches' | 'student_enrollments' | 'add_lecture' | 'curriculum' | 'batch_tests_authoring'>('manage_batches');
  const [editingBatchId, setEditingBatchId] = useState<string | null>(null);

  // Unified In-Situ Studio States
  const [workspaceBatchId, setWorkspaceBatchId] = useState<string | null>(null);
  const [catalogViewMode, setCatalogViewMode] = useState<'studio' | 'student'>('studio');
  const [catalogCategoryFilter, setCatalogCategoryFilter] = useState<string>('all');
  const [catalogSearchQuery, setCatalogSearchQuery] = useState<string>('');
  const [isCreateBatchModalOpen, setIsCreateBatchModalOpen] = useState(false);
  const [quickEnrollTargetBatch, setQuickEnrollTargetBatch] = useState<Batch | null>(null);
  const [editBatchTarget, setEditBatchTarget] = useState<Batch | null>(null);

  // Form states for Test Authoring & Bin-Packing
  const [testTitleInput, setTestTitleInput] = useState('');
  const [testTopicInput, setTestTopicInput] = useState('');
  const [testDifficultyInput, setTestDifficultyInput] = useState<'easy' | 'medium' | 'hard' | 'adaptive'>('medium');
  const [testDurationInput, setTestDurationInput] = useState(60);
  const [testQCountInput, setTestQCountInput] = useState(30);

  // Form states for Add Lecture
  const [selectedBatchId, setSelectedBatchId] = useState<string>(batches[0]?.id || '');
  const [selectedSubjectId, setSelectedSubjectId] = useState<string>('');
  const [selectedChapterId, setSelectedChapterId] = useState<string>('');
  const [videoUrlInput, setVideoUrlInput] = useState('');
  const [lectureTitle, setLectureTitle] = useState('');
  const [lectureDesc, setLectureDesc] = useState('');
  const [durationMinutes, setDurationMinutes] = useState(45);
  const [isFreePreview, setIsFreePreview] = useState(false);
  const [pdfTitle, setPdfTitle] = useState('');
  const [driveUrlInput, setDriveUrlInput] = useState('');
  const [detectedDriveId, setDetectedDriveId] = useState<string | null>(null);
  const [detectedYtId, setDetectedYtId] = useState<string | null>(null);

  // Form states for Student Enrollment
  const [enrollContactInput, setEnrollContactInput] = useState('');
  const [enrollNameInput, setEnrollNameInput] = useState('');
  const [enrollValidityDays, setEnrollValidityDays] = useState(365);
  const [studentSearchQuery, setStudentSearchQuery] = useState('');

  // Form states for Create Batch
  const [newBatchTitle, setNewBatchTitle] = useState('');
  const [newBatchTagline, setNewBatchTagline] = useState('');
  const [newBatchDesc, setNewBatchDesc] = useState('');
  const [newBatchCategory, setNewBatchCategory] = useState('Testing Environment');
  const [newBatchPrice, setNewBatchPrice] = useState(999);
  const [newBatchOrigPrice, setNewBatchOrigPrice] = useState(2999);
  const [newBatchInstructor, setNewBatchInstructor] = useState('Elevate Labs Faculty');
  const [newBatchBanner, setNewBatchBanner] = useState(
    'https://images.unsplash.com/photo-1516321318423-f06f85e504b3?w=1200&auto=format&fit=crop&q=80'
  );

  // Form states for Add Subject / Chapter
  const [newSubjectTitle, setNewSubjectTitle] = useState('');
  const [newChapterTitle, setNewChapterTitle] = useState('');
  const [newChapterDesc, setNewChapterDesc] = useState('');

  // Handle YouTube URL paste & auto detection
  const handleVideoUrlChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setVideoUrlInput(val);
    const ytId = extractYouTubeId(val);
    setDetectedYtId(ytId);
  };

  // Handle Google Drive URL paste & auto detection
  const handleDriveUrlChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setDriveUrlInput(val);
    const driveId = extractGoogleDriveId(val);
    setDetectedDriveId(driveId);
  };

  const availableSubjects = subjects.filter((s) => s.batchId === selectedBatchId);
  const availableChapters = chapters.filter(
    (c) => c.batchId === selectedBatchId && (!selectedSubjectId || c.subjectId === selectedSubjectId)
  );

  const activeBatchEnrollments = getEnrollmentsForBatch(selectedBatchId);
  const filteredStudents = searchStudents(studentSearchQuery);

  const handleSaveLecture = (e: React.FormEvent) => {
    e.preventDefault();
    if (!detectedYtId) {
      alert('Please enter a valid YouTube link (Unlisted or Public).');
      return;
    }
    if (!selectedBatchId || !selectedSubjectId || !selectedChapterId) {
      alert('Please select Batch, Subject, and Chapter folder.');
      return;
    }
    if (!lectureTitle.trim()) {
      alert('Please enter a lecture title.');
      return;
    }

    const encryptedKey = obfuscateVideoKey(detectedYtId);
    const generatedThumbnail = `https://img.youtube.com/vi/${detectedYtId}/hqdefault.jpg`;

    const notesList = [];
    if (pdfTitle.trim()) {
      if (detectedDriveId) {
        notesList.push({
          id: `doc_${Date.now()}`,
          title: pdfTitle.trim(),
          url: buildGoogleDrivePreviewUrl(detectedDriveId),
          size: 'Drive PDF',
          type: 'drive_doc' as const,
          driveFileId: detectedDriveId,
          drivePreviewUrl: buildGoogleDrivePreviewUrl(detectedDriveId),
        });
      } else {
        notesList.push({
          id: `pdf_${Date.now()}`,
          title: pdfTitle.trim(),
          url: '#',
          size: '2.5 MB',
          pages: 12,
        });
      }
    }

    addLecture({
      batchId: selectedBatchId,
      subjectId: selectedSubjectId,
      chapterId: selectedChapterId,
      title: lectureTitle.trim(),
      description: lectureDesc.trim() || 'Comprehensive coaching session with problem solving.',
      durationMinutes: Number(durationMinutes) || 45,
      videoSourceType: 'youtube',
      encryptedVideoId: encryptedKey,
      thumbnailUrl: generatedThumbnail,
      order: lectures.length + 1,
      isFreePreview,
      pdfNotes: notesList,
    });

    showSecurityToast(`✅ Lecture "${lectureTitle}" added and cloaked successfully!`);
    setVideoUrlInput('');
    setDetectedYtId(null);
    setLectureTitle('');
    setLectureDesc('');
    setPdfTitle('');
    setDriveUrlInput('');
    setDetectedDriveId(null);
  };

  const handleEnrollStudent = (e: React.FormEvent) => {
    e.preventDefault();
    if (!enrollContactInput.trim()) {
      alert('Please enter a phone number or email address');
      return;
    }
    if (!selectedBatchId) {
      alert('Please select a target batch');
      return;
    }

    const result = enrollStudentByContact({
      contact: enrollContactInput.trim(),
      batchId: selectedBatchId,
      name: enrollNameInput.trim() || undefined,
      validityDays: Number(enrollValidityDays) || 365,
    });

    if (result.success) {
      showSecurityToast(`🎉 ${result.message}`);
      setEnrollContactInput('');
      setEnrollNameInput('');
    } else {
      showSecurityToast(`⚠️ ${result.message}`);
    }
  };

  const handleRevokeEnrollment = async (identifier: string, studentName: string) => {
    if (window.confirm(`Revoke batch access for ${studentName}?`)) {
      await revokeStudentEnrollment(identifier, selectedBatchId);
      showSecurityToast(`Batch access revoked for ${studentName}.`);
    }
  };

  const startEditingBatch = (b: (typeof batches)[0]) => {
    setEditingBatchId(b.id);
    setNewBatchTitle(b.title);
    setNewBatchTagline(b.tagline);
    setNewBatchDesc(b.description);
    setNewBatchCategory(b.category);
    setNewBatchPrice(b.price);
    setNewBatchOrigPrice(b.originalPrice);
    setNewBatchInstructor(b.instructor?.name || 'Elevate Labs Faculty');
    setNewBatchBanner(b.bannerUrl);
    setActiveTab('manage_batches');
    showSecurityToast(`Editing batch: ${b.title}`);
  };

  const cancelEditingBatch = () => {
    setEditingBatchId(null);
    setNewBatchTitle('');
    setNewBatchTagline('');
    setNewBatchDesc('');
    setNewBatchCategory('Testing Environment');
    setNewBatchPrice(999);
    setNewBatchOrigPrice(2999);
    setNewBatchInstructor('Elevate Labs Faculty');
  };

  const handleSaveBatch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newBatchTitle.trim()) {
      alert('Please enter batch title');
      return;
    }

    if (editingBatchId) {
      updateBatch(editingBatchId, {
        title: newBatchTitle.trim(),
        tagline: newBatchTagline.trim(),
        description: newBatchDesc.trim(),
        category: newBatchCategory,
        price: Number(newBatchPrice),
        originalPrice: Number(newBatchOrigPrice),
        bannerUrl: newBatchBanner,
        thumbnailUrl: newBatchBanner,
        instructor: {
          name: newBatchInstructor,
          designation: 'Lead Educator',
          avatarUrl:
            'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=150&auto=format&fit=crop&q=80',
        },
      });
      showSecurityToast(`✅ Batch "${newBatchTitle}" updated successfully!`);
      cancelEditingBatch();
    } else {
      addBatch({
        title: newBatchTitle.trim(),
        tagline: newBatchTagline.trim() || 'Official testing batch for Elevate Labs',
        description: newBatchDesc.trim() || 'Testing batch for video cloaking verification.',
        category: newBatchCategory,
        price: Number(newBatchPrice),
        originalPrice: Number(newBatchOrigPrice),
        bannerUrl: newBatchBanner,
        thumbnailUrl: newBatchBanner,
        instructor: {
          name: newBatchInstructor,
          designation: 'Lead Educator',
          avatarUrl:
            'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=150&auto=format&fit=crop&q=80',
        },
        validityDays: 365,
        startDate: 'Immediate Access',
        isPublished: true,
      });
      showSecurityToast(`🎉 New Batch "${newBatchTitle}" created!`);
      cancelEditingBatch();
    }
  };

  const handleAddSubject = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSubjectTitle.trim() || !selectedBatchId) return;
    addSubject({
      batchId: selectedBatchId,
      title: newSubjectTitle.trim(),
      order: availableSubjects.length + 1,
      color: '#0b57d0',
    });
    setNewSubjectTitle('');
    showSecurityToast('Subject added to batch.');
  };

  const handleAddChapter = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newChapterTitle.trim() || !selectedBatchId || !selectedSubjectId) {
      alert('Please select batch and subject first');
      return;
    }
    addChapter({
      batchId: selectedBatchId,
      subjectId: selectedSubjectId,
      title: newChapterTitle.trim(),
      description: newChapterDesc.trim(),
      order: availableChapters.length + 1,
    });
    setNewChapterTitle('');
    setNewChapterDesc('');
    showSecurityToast('Chapter folder added.');
  };

  const handlePublishTest = (e: React.FormEvent) => {
    e.preventDefault();
    if (!testTitleInput.trim()) {
      alert('Please enter test title');
      return;
    }
    if (!selectedBatchId) {
      alert('Please select target batch');
      return;
    }

    const result = addTestToBatchCatalog({
      batchId: selectedBatchId,
      title: testTitleInput.trim(),
      topic: testTopicInput.trim() || 'General Mathematics & Physics',
      difficulty: testDifficultyInput,
      timeLimitMinutes: Number(testDurationInput) || 60,
      questionCount: Number(testQCountInput) || 30,
      passingScorePercentage: 45,
    });

    showSecurityToast(`⚡ ${result.message}`);
    setTestTitleInput('');
    setTestTopicInput('');
  };

  return (
    <div className="space-y-6 pb-24 md:pb-16">
      {/* Studio Header (Borderless) */}
      <div className="bg-[var(--md-sys-color-surface-container)] rounded-3xl p-6 sm:p-8 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shadow-xs border-none">
        <div className="space-y-1">
          <div className="flex items-center space-x-2">
            <span className="px-3 py-1 rounded-full bg-[var(--md-sys-color-primary-container)] text-[var(--md-sys-color-on-primary-container)] text-xs font-bold uppercase tracking-wider border-none">
              Elevate Labs Studio
            </span>
            <span className="flex items-center space-x-1 text-xs text-emerald-600 dark:text-emerald-400 font-semibold">
              <ShieldCheck className="w-4 h-4" />
              <span>Zero-Bandwidth Engine</span>
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-[var(--md-sys-color-on-surface)]">
            Curriculum & Video Management
          </h1>
          <p className="text-xs sm:text-sm text-[var(--md-sys-color-on-surface-variant)]">
            Paste YouTube Unlisted links, organise into multi-tier folders, and serve protected streams.
          </p>
        </div>

        {/* M3 Segmented Tab Switcher (Horizontal Scrollable & Borderless) */}
        <div className="flex items-center overflow-x-auto scrollbar-none gap-1.5 bg-[var(--md-sys-color-surface-container-high)] p-1.5 rounded-2xl md:rounded-full border-none max-w-full shadow-xs">
          <button
            onClick={() => setActiveTab('manage_batches')}
            className={`px-4 py-2 rounded-xl md:rounded-full text-xs font-bold flex items-center space-x-2 transition border-none outline-none whitespace-nowrap flex-shrink-0 cursor-pointer ${
              activeTab === 'manage_batches'
                ? 'm3-nav-pill-active shadow-xs'
                : 'text-[var(--md-sys-color-on-surface-variant)] hover:text-[var(--md-sys-color-on-surface)]'
            }`}
          >
            <Layers className="w-4 h-4 text-[var(--md-sys-color-primary)]" />
            <span>Batches & Authoring ({batches.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('student_enrollments')}
            className={`px-4 py-2 rounded-xl md:rounded-full text-xs font-bold flex items-center space-x-2 transition border-none outline-none whitespace-nowrap flex-shrink-0 cursor-pointer ${
              activeTab === 'student_enrollments'
                ? 'm3-nav-pill-active shadow-xs'
                : 'text-[var(--md-sys-color-on-surface-variant)] hover:text-[var(--md-sys-color-on-surface)]'
            }`}
          >
            <Users className="w-4 h-4 text-emerald-500" />
            <span>Student Access & Batches</span>
          </button>

          <button
            onClick={() => setActiveTab('batch_tests_authoring')}
            className={`px-4 py-2 rounded-xl md:rounded-full text-xs font-bold flex items-center space-x-2 transition border-none outline-none whitespace-nowrap flex-shrink-0 cursor-pointer ${
              activeTab === 'batch_tests_authoring'
                ? 'm3-nav-pill-active shadow-xs'
                : 'text-[var(--md-sys-color-on-surface-variant)] hover:text-[var(--md-sys-color-on-surface)]'
            }`}
          >
            <CheckSquare className="w-4 h-4 text-indigo-500" />
            <span>Test Catalogs ({batchTests.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('add_lecture')}
            className={`px-4 py-2 rounded-xl md:rounded-full text-xs font-bold flex items-center space-x-2 transition border-none outline-none whitespace-nowrap flex-shrink-0 cursor-pointer ${
              activeTab === 'add_lecture'
                ? 'm3-nav-pill-active shadow-xs'
                : 'text-[var(--md-sys-color-on-surface-variant)] hover:text-[var(--md-sys-color-on-surface)]'
            }`}
          >
            <Video className="w-4 h-4 text-amber-500" />
            <span>Add Lecture</span>
          </button>

          <button
            onClick={() => setActiveTab('curriculum')}
            className={`px-4 py-2 rounded-xl md:rounded-full text-xs font-bold flex items-center space-x-2 transition border-none outline-none whitespace-nowrap flex-shrink-0 cursor-pointer ${
              activeTab === 'curriculum'
                ? 'm3-nav-pill-active shadow-xs'
                : 'text-[var(--md-sys-color-on-surface-variant)] hover:text-[var(--md-sys-color-on-surface)]'
            }`}
          >
            <FolderPlus className="w-4 h-4 text-purple-500" />
            <span>Folders</span>
          </button>
        </div>
      </div>

      {/* TAB 1: ADD LECTURE BY YOUTUBE UNLISTED LINK */}
      {activeTab === 'add_lecture' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Form: 7 cols */}
          <div className="lg:col-span-7 bg-[var(--md-sys-color-surface-container)] rounded-3xl p-6 shadow-xs border-none space-y-5">
            <div className="flex items-center justify-between border-b border-[var(--md-sys-color-outline-variant)]/20 pb-3">
              <h2 className="text-base font-bold text-[var(--md-sys-color-on-surface)] flex items-center space-x-2">
                <Video className="w-5 h-5 text-[var(--md-sys-color-primary)]" />
                <span>Link Video to Batch Curriculum</span>
              </h2>
              <span className="text-[11px] font-semibold text-[var(--md-sys-color-on-surface-variant)]">
                Zero-Bandwidth Streaming
              </span>
            </div>

            <form onSubmit={handleSaveLecture} className="space-y-4">
              {/* Batch, Subject, Chapter Selection Row */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="text-xs font-bold text-[var(--md-sys-color-on-surface-variant)] block mb-1">
                    Target Batch
                  </label>
                  <select
                    value={selectedBatchId}
                    onChange={(e) => {
                      setSelectedBatchId(e.target.value);
                      setSelectedSubjectId('');
                      setSelectedChapterId('');
                    }}
                    className="w-full p-2.5 bg-[var(--md-sys-color-surface-container-high)] rounded-2xl text-xs text-[var(--md-sys-color-on-surface)] border-none outline-none focus:bg-[var(--md-sys-color-surface-container-highest)]"
                  >
                    {batches.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.title}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-xs font-bold text-[var(--md-sys-color-on-surface-variant)] block mb-1">
                    Subject
                  </label>
                  <select
                    value={selectedSubjectId}
                    onChange={(e) => {
                      setSelectedSubjectId(e.target.value);
                      setSelectedChapterId('');
                    }}
                    className="w-full p-2.5 bg-[var(--md-sys-color-surface-container-high)] rounded-2xl text-xs text-[var(--md-sys-color-on-surface)] border-none outline-none focus:bg-[var(--md-sys-color-surface-container-highest)]"
                  >
                    <option value="">Select Subject</option>
                    {availableSubjects.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.title}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-xs font-bold text-[var(--md-sys-color-on-surface-variant)] block mb-1">
                    Chapter / Folder
                  </label>
                  <select
                    value={selectedChapterId}
                    onChange={(e) => setSelectedChapterId(e.target.value)}
                    className="w-full p-2.5 bg-[var(--md-sys-color-surface-container-high)] rounded-2xl text-xs text-[var(--md-sys-color-on-surface)] border-none outline-none focus:bg-[var(--md-sys-color-surface-container-highest)]"
                  >
                    <option value="">Select Chapter</option>
                    {availableChapters.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.title}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* YouTube Link Input with Auto Detection */}
              <div>
                <label className="text-xs font-bold text-[var(--md-sys-color-on-surface-variant)] block mb-1">
                  YouTube Video Link (Unlisted / Public)
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={videoUrlInput}
                    onChange={handleVideoUrlChange}
                    placeholder="e.g. https://www.youtube.com/watch?v=WUvTyaaNkzM or youtu.be/..."
                    className="w-full pl-3.5 pr-10 py-2.5 bg-[var(--md-sys-color-surface-container-high)] rounded-2xl text-xs text-[var(--md-sys-color-on-surface)] placeholder-[var(--md-sys-color-outline)] border-none outline-none focus:bg-[var(--md-sys-color-surface-container-highest)] font-mono"
                  />
                  {detectedYtId && (
                    <div className="absolute inset-y-0 right-0 pr-3 flex items-center text-emerald-500">
                      <Check className="w-4 h-4" />
                    </div>
                  )}
                </div>
                {detectedYtId && (
                  <p className="text-[11px] text-emerald-600 dark:text-emerald-400 mt-1 flex items-center space-x-1">
                    <span>Detected Video ID:</span>
                    <span className="font-mono bg-[var(--md-sys-color-tertiary-container)] text-[var(--md-sys-color-on-tertiary-container)] px-2 py-0.5 rounded-full font-bold">
                      {detectedYtId}
                    </span>
                    <span>(Will be cloaked)</span>
                  </p>
                )}
              </div>

              {/* Lecture Title & Duration */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2">
                  <label className="text-xs font-bold text-[var(--md-sys-color-on-surface-variant)] block mb-1">
                    Lecture Title
                  </label>
                  <input
                    type="text"
                    value={lectureTitle}
                    onChange={(e) => setLectureTitle(e.target.value)}
                    placeholder="e.g. Testing Lecture 02: Streaming Verification"
                    className="w-full p-2.5 bg-[var(--md-sys-color-surface-container-high)] rounded-2xl text-xs text-[var(--md-sys-color-on-surface)] placeholder-[var(--md-sys-color-outline)] border-none outline-none focus:bg-[var(--md-sys-color-surface-container-highest)]"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-[var(--md-sys-color-on-surface-variant)] block mb-1">
                    Duration (Mins)
                  </label>
                  <input
                    type="number"
                    value={durationMinutes}
                    onChange={(e) => setDurationMinutes(Number(e.target.value))}
                    className="w-full p-2.5 bg-[var(--md-sys-color-surface-container-high)] rounded-2xl text-xs text-[var(--md-sys-color-on-surface)] border-none outline-none focus:bg-[var(--md-sys-color-surface-container-highest)]"
                  />
                </div>
              </div>

              {/* Description */}
              <div>
                <label className="text-xs font-bold text-[var(--md-sys-color-on-surface-variant)] block mb-1">
                  Description / Syllabus Summary
                </label>
                <textarea
                  rows={2}
                  value={lectureDesc}
                  onChange={(e) => setLectureDesc(e.target.value)}
                  placeholder="Key concepts covered, notes..."
                  className="w-full p-2.5 bg-[var(--md-sys-color-surface-container-high)] rounded-2xl text-xs text-[var(--md-sys-color-on-surface)] placeholder-[var(--md-sys-color-outline)] border-none outline-none focus:bg-[var(--md-sys-color-surface-container-highest)]"
                />
              </div>

              {/* Study Material & Google Drive Link Ingestion */}
              <div className="p-3.5 bg-[var(--md-sys-color-surface-container-high)]/60 rounded-2xl space-y-3 border-none">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-[var(--md-sys-color-on-surface)] flex items-center space-x-1.5">
                    <FileText className="w-4 h-4 text-[var(--md-sys-color-primary)]" />
                    <span>Attach Class Notes / Formula Sheets (Optional)</span>
                  </label>
                  <span className="text-[10px] text-[var(--md-sys-color-on-surface-variant)]">Zero Storage Pointers</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-[11px] font-bold text-[var(--md-sys-color-on-surface-variant)] block mb-1">
                      Material Document Title
                    </label>
                    <input
                      type="text"
                      value={pdfTitle}
                      onChange={(e) => setPdfTitle(e.target.value)}
                      placeholder="e.g. Chapter 01 Notes & DPP.pdf"
                      className="w-full p-2.5 bg-[var(--md-sys-color-surface-container-high)] rounded-2xl text-xs text-[var(--md-sys-color-on-surface)] placeholder-[var(--md-sys-color-outline)] border-none outline-none focus:bg-[var(--md-sys-color-surface-container-highest)]"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] font-bold text-[var(--md-sys-color-on-surface-variant)] block mb-1">
                      Google Drive Share Link (Zero-Storage)
                    </label>
                    <div className="relative">
                      <input
                        type="text"
                        value={driveUrlInput}
                        onChange={handleDriveUrlChange}
                        placeholder="https://drive.google.com/file/d/.../view"
                        className="w-full pl-3 pr-8 py-2.5 bg-[var(--md-sys-color-surface-container-high)] rounded-2xl text-xs text-[var(--md-sys-color-on-surface)] placeholder-[var(--md-sys-color-outline)] border-none outline-none focus:bg-[var(--md-sys-color-surface-container-highest)] font-mono text-[11px]"
                      />
                      {detectedDriveId && (
                        <div className="absolute inset-y-0 right-0 pr-2.5 flex items-center text-emerald-500">
                          <Check className="w-4 h-4" />
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {detectedDriveId && (
                  <p className="text-[11px] text-emerald-600 dark:text-emerald-400 flex items-center space-x-1.5">
                    <Check className="w-3.5 h-3.5" />
                    <span>Detected Drive Document ID:</span>
                    <span className="font-mono bg-[var(--md-sys-color-tertiary-container)] text-[var(--md-sys-color-on-tertiary-container)] px-2 py-0.5 rounded-full font-bold text-[10px]">
                      {detectedDriveId}
                    </span>
                    <span>(Direct Sandboxed Embed)</span>
                  </p>
                )}
              </div>

              {/* Free Demo Toggle */}
              <div className="flex items-center space-x-3 p-3.5 bg-[var(--md-sys-color-surface-container-high)] rounded-2xl border-none">
                <input
                  type="checkbox"
                  id="freePreview"
                  checked={isFreePreview}
                  onChange={(e) => setIsFreePreview(e.target.checked)}
                  className="w-4 h-4 rounded text-[var(--md-sys-color-primary)] border-none outline-none"
                />
                <label htmlFor="freePreview" className="text-xs text-[var(--md-sys-color-on-surface)] cursor-pointer">
                  <span className="font-bold">Mark as Free Demo Lecture</span>
                  <span className="block text-[11px] text-[var(--md-sys-color-on-surface-variant)]">
                    Non-enrolled guests can watch this video as a preview demo.
                  </span>
                </label>
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={!detectedYtId}
                className="w-full py-3 m3-btn-filled text-xs disabled:opacity-50 flex items-center justify-center space-x-2 shadow-xs border-none outline-none"
              >
                <Sparkles className="w-4 h-4" />
                <span>Save Lecture & Cloak YouTube Stream</span>
              </button>
            </form>
          </div>

          {/* Right Live Preview: 5 cols */}
          <div className="lg:col-span-5 space-y-4">
            <div className="bg-[var(--md-sys-color-surface-container)] rounded-3xl p-5 shadow-xs border-none space-y-4">
              <div className="flex items-center justify-between border-b border-[var(--md-sys-color-outline-variant)]/20 pb-2">
                <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--md-sys-color-primary)] flex items-center space-x-1.5">
                  <ShieldCheck className="w-4 h-4" />
                  <span>Real-Time Masking Preview</span>
                </h3>
                <span className="text-[10px] bg-[var(--md-sys-color-tertiary-container)] text-[var(--md-sys-color-on-tertiary-container)] px-2.5 py-0.5 rounded-full font-bold border-none">
                  Live Test
                </span>
              </div>

              {detectedYtId ? (
                <div className="space-y-3">
                  <div className="rounded-2xl overflow-hidden border-none shadow-md">
                    <CloakedVideoPlayer
                      encryptedVideoId={obfuscateVideoKey(detectedYtId)}
                      title={lectureTitle || 'Preview Lecture'}
                      user={user}
                    />
                  </div>
                  <div className="p-3.5 bg-[var(--md-sys-color-surface-container-high)] rounded-2xl border-none text-xs space-y-1">
                    <p className="font-bold text-emerald-600 dark:text-emerald-400 flex items-center space-x-1">
                      <Check className="w-3.5 h-3.5" />
                      <span>YouTube branding masked</span>
                    </p>
                    <p className="text-[var(--md-sys-color-on-surface-variant)] text-[11px]">
                      Guest watermarks, custom speed controls and security shields are active.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="aspect-video bg-[var(--md-sys-color-surface-container-high)] rounded-2xl flex flex-col items-center justify-center p-6 text-center space-y-2 border-none">
                  <Play className="w-10 h-10 text-[var(--md-sys-color-outline)]" />
                  <p className="text-xs text-[var(--md-sys-color-on-surface-variant)]">
                    Paste a YouTube link on the left to see the cloaked player preview live.
                  </p>
                </div>
              )}
            </div>

            {/* Quick Tips */}
            <div className="bg-[var(--md-sys-color-surface-container)] rounded-3xl p-5 text-xs space-y-2 text-[var(--md-sys-color-on-surface-variant)] border-none shadow-xs">
              <span className="font-bold text-[var(--md-sys-color-on-surface)] block">
                💡 Elevate Labs Zero-Bandwidth:
              </span>
              <p>
                Because videos are streamed from unlisted YouTube links, your database stores lightweight strings.
                Bandwidth and storage charges remain <strong>₹0 / Free</strong>.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: CURRICULUM BUILDER */}
      {activeTab === 'curriculum' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Create Subject */}
          <div className="bg-[var(--md-sys-color-surface-container)] rounded-3xl p-6 shadow-xs border-none space-y-4">
            <h2 className="text-base font-bold text-[var(--md-sys-color-on-surface)] flex items-center space-x-2">
              <FolderPlus className="w-5 h-5 text-[var(--md-sys-color-primary)]" />
              <span>Add Subject to Batch</span>
            </h2>

            <form onSubmit={handleAddSubject} className="space-y-3">
              <div>
                <label className="text-xs font-bold text-[var(--md-sys-color-on-surface-variant)] block mb-1">
                  Target Batch
                </label>
                <select
                  value={selectedBatchId}
                  onChange={(e) => setSelectedBatchId(e.target.value)}
                  className="w-full p-2.5 bg-[var(--md-sys-color-surface-container-high)] rounded-2xl text-xs text-[var(--md-sys-color-on-surface)] border-none outline-none"
                >
                  {batches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.title}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-bold text-[var(--md-sys-color-on-surface-variant)] block mb-1">
                  Subject Name
                </label>
                <input
                  type="text"
                  value={newSubjectTitle}
                  onChange={(e) => setNewSubjectTitle(e.target.value)}
                  placeholder="e.g. Physics / Mathematics / Chemistry"
                  className="w-full p-2.5 bg-[var(--md-sys-color-surface-container-high)] rounded-2xl text-xs text-[var(--md-sys-color-on-surface)] border-none outline-none"
                />
              </div>

              <button
                type="submit"
                className="w-full py-2.5 m3-btn-filled text-xs shadow-xs border-none outline-none"
              >
                + Create Subject
              </button>
            </form>

            <div className="pt-2 border-t border-[var(--md-sys-color-outline-variant)]/20">
              <span className="text-xs font-bold text-[var(--md-sys-color-on-surface-variant)] block mb-2">
                Existing Subjects:
              </span>
              <div className="space-y-1.5 max-h-48 overflow-y-auto">
                {availableSubjects.map((s) => (
                  <div
                    key={s.id}
                    className="p-2.5 rounded-2xl bg-[var(--md-sys-color-surface-container-high)] text-xs text-[var(--md-sys-color-on-surface)] font-medium flex items-center justify-between border-none"
                  >
                    <span>{s.title}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Create Chapter / Folder */}
          <div className="bg-[var(--md-sys-color-surface-container)] rounded-3xl p-6 shadow-xs border-none space-y-4">
            <h2 className="text-base font-bold text-[var(--md-sys-color-on-surface)] flex items-center space-x-2">
              <BookPlus className="w-5 h-5 text-[var(--md-sys-color-secondary)]" />
              <span>Add Chapter Folder</span>
            </h2>

            <form onSubmit={handleAddChapter} className="space-y-3">
              <div>
                <label className="text-xs font-bold text-[var(--md-sys-color-on-surface-variant)] block mb-1">
                  Select Subject
                </label>
                <select
                  value={selectedSubjectId}
                  onChange={(e) => setSelectedSubjectId(e.target.value)}
                  className="w-full p-2.5 bg-[var(--md-sys-color-surface-container-high)] rounded-2xl text-xs text-[var(--md-sys-color-on-surface)] border-none outline-none"
                >
                  <option value="">Select Subject</option>
                  {availableSubjects.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.title}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-bold text-[var(--md-sys-color-on-surface-variant)] block mb-1">
                  Chapter Title
                </label>
                <input
                  type="text"
                  value={newChapterTitle}
                  onChange={(e) => setNewChapterTitle(e.target.value)}
                  placeholder="e.g. Chapter 02: Advanced Stream Testing"
                  className="w-full p-2.5 bg-[var(--md-sys-color-surface-container-high)] rounded-2xl text-xs text-[var(--md-sys-color-on-surface)] border-none outline-none"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-[var(--md-sys-color-on-surface-variant)] block mb-1">
                  Chapter Summary
                </label>
                <input
                  type="text"
                  value={newChapterDesc}
                  onChange={(e) => setNewChapterDesc(e.target.value)}
                  placeholder="Testing descriptions"
                  className="w-full p-2.5 bg-[var(--md-sys-color-surface-container-high)] rounded-2xl text-xs text-[var(--md-sys-color-on-surface)] border-none outline-none"
                />
              </div>

              <button
                type="submit"
                disabled={!selectedSubjectId}
                className="w-full py-2.5 m3-btn-tonal disabled:opacity-50 text-xs shadow-xs border-none outline-none"
              >
                + Create Chapter Folder
              </button>
            </form>

            <div className="pt-2 border-t border-[var(--md-sys-color-outline-variant)]/20">
              <span className="text-xs font-bold text-[var(--md-sys-color-on-surface-variant)] block mb-2">
                Existing Chapters:
              </span>
              <div className="space-y-1.5 max-h-48 overflow-y-auto">
                {availableChapters.map((c) => (
                  <div
                    key={c.id}
                    className="p-2.5 rounded-2xl bg-[var(--md-sys-color-surface-container-high)] text-xs text-[var(--md-sys-color-on-surface)] font-medium flex items-center justify-between border-none"
                  >
                    <span>{c.title}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB: MANAGE BATCHES & IN-SITU AUTHORING CANVAS */}
      {activeTab === 'manage_batches' && (
        <div className="space-y-6 animate-fade-in">
          {workspaceBatchId ? (
            /* LEVEL 2: IN-SITU BATCH WORKSPACE */
            <InSituBatchWorkspace
              batchId={workspaceBatchId}
              onBack={() => setWorkspaceBatchId(null)}
              onNavigateToTestPublish={() => {
                setSelectedBatchId(workspaceBatchId);
                setActiveTab('batch_tests_authoring');
              }}
            />
          ) : (
            /* LEVEL 1: VISUAL BATCH CATALOG CANVAS */
            <div className="space-y-6">
              {/* Studio Canvas Control Bar */}
              <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 p-5 rounded-3xl bg-[var(--md-sys-color-surface-container)] shadow-xs">
                <div>
                  <h2 className="text-base font-bold text-[var(--md-sys-color-on-surface)] flex items-center space-x-2">
                    <Layers className="w-5 h-5 text-[var(--md-sys-color-primary)]" />
                    <span>Batches & Authoring Studio ({batches.length})</span>
                  </h2>
                  <p className="text-xs text-[var(--md-sys-color-on-surface-variant)] mt-0.5">
                    Live student-fidelity cards with in-situ authoring superpowers, DRM video inspection & instant student enrollment
                  </p>
                </div>

                <div className="flex items-center space-x-3 self-stretch md:self-auto justify-between md:justify-end flex-wrap gap-y-2">
                  {/* Minimal Guest Access Mode Option */}
                  <div className="flex items-center bg-[var(--md-sys-color-surface-container-high)] p-1 rounded-full text-xs font-bold">
                    <span className="px-2 text-[10px] text-[var(--md-sys-color-on-surface-variant)] uppercase tracking-wider hidden sm:inline">
                      Guests:
                    </span>
                    <button
                      type="button"
                      onClick={() => setGlobalGuestAccessMode('specific_batches')}
                      className={`px-2.5 py-1 rounded-full transition border-none outline-none cursor-pointer text-[10.5px] ${
                        globalGuestAccessMode === 'specific_batches'
                          ? 'bg-indigo-600 text-white shadow-xs'
                          : 'text-[var(--md-sys-color-on-surface-variant)] hover:text-[var(--md-sys-color-on-surface)]'
                      }`}
                      title="Only batches specifically enabled for guests are open"
                    >
                      Specific Batches
                    </button>
                    <button
                      type="button"
                      onClick={() => setGlobalGuestAccessMode('all_batches')}
                      className={`px-2.5 py-1 rounded-full transition border-none outline-none cursor-pointer text-[10.5px] ${
                        globalGuestAccessMode === 'all_batches'
                          ? 'bg-emerald-600 text-white shadow-xs'
                          : 'text-[var(--md-sys-color-on-surface-variant)] hover:text-[var(--md-sys-color-on-surface)]'
                      }`}
                      title="All active batches are open for free guest enrollment"
                    >
                      All Batches
                    </button>
                    <button
                      type="button"
                      onClick={() => setGlobalGuestAccessMode('none')}
                      className={`px-2.5 py-1 rounded-full transition border-none outline-none cursor-pointer text-[10.5px] ${
                        globalGuestAccessMode === 'none'
                          ? 'bg-amber-600 text-white shadow-xs'
                          : 'text-[var(--md-sys-color-on-surface-variant)] hover:text-[var(--md-sys-color-on-surface)]'
                      }`}
                      title="Strict roster mode: no guest access"
                    >
                      Roster Only
                    </button>
                  </div>

                  {/* View Mode Toggle */}
                  <div className="flex items-center bg-[var(--md-sys-color-surface-container-high)] p-1 rounded-full text-xs font-bold">
                    <button
                      type="button"
                      onClick={() => setCatalogViewMode('studio')}
                      className={`px-3 py-1.5 rounded-full transition border-none outline-none cursor-pointer flex items-center space-x-1.5 ${
                        catalogViewMode === 'studio'
                          ? 'bg-[var(--md-sys-color-primary)] text-[var(--md-sys-color-on-primary)] shadow-xs'
                          : 'text-[var(--md-sys-color-on-surface-variant)] hover:text-[var(--md-sys-color-on-surface)]'
                      }`}
                    >
                      <Sliders className="w-3.5 h-3.5" />
                      <span>Studio Mode</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setCatalogViewMode('student')}
                      className={`px-3 py-1.5 rounded-full transition border-none outline-none cursor-pointer flex items-center space-x-1.5 ${
                        catalogViewMode === 'student'
                          ? 'bg-emerald-500 text-white shadow-xs'
                          : 'text-[var(--md-sys-color-on-surface-variant)] hover:text-[var(--md-sys-color-on-surface)]'
                      }`}
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>Student View</span>
                    </button>
                  </div>

                  {/* Create New Batch Action Button */}
                  <button
                    type="button"
                    onClick={() => {
                      setEditBatchTarget(null);
                      setIsCreateBatchModalOpen(true);
                    }}
                    className="px-4 py-2 m3-btn-filled text-xs font-bold shadow-xs border-none outline-none cursor-pointer flex items-center space-x-1.5"
                  >
                    <PlusCircle className="w-4 h-4" />
                    <span>+ Create New Batch</span>
                  </button>
                </div>
              </div>

              {/* Search & Category Filter Pills */}
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-3 rounded-2xl bg-[var(--md-sys-color-surface-container)]/70">
                <div className="flex items-center space-x-1.5 overflow-x-auto w-full sm:w-auto pb-1 sm:pb-0">
                  {['all', 'JEE Advanced', 'JEE Main', 'NEET UG', 'Foundation'].map((cat) => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setCatalogCategoryFilter(cat)}
                      className={`px-3 py-1.5 rounded-full text-xs font-bold transition border-none outline-none cursor-pointer whitespace-nowrap ${
                        catalogCategoryFilter === cat
                          ? 'bg-[var(--md-sys-color-primary-container)] text-[var(--md-sys-color-on-primary-container)] shadow-xs'
                          : 'text-[var(--md-sys-color-on-surface-variant)] hover:bg-[var(--md-sys-color-surface-container-high)]'
                      }`}
                    >
                      {cat === 'all' ? 'All Categories' : cat}
                    </button>
                  ))}
                </div>

                <div className="relative w-full sm:w-64">
                  <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-[var(--md-sys-color-on-surface-variant)]" />
                  <input
                    type="text"
                    value={catalogSearchQuery}
                    onChange={(e) => setCatalogSearchQuery(e.target.value)}
                    placeholder="Search batches..."
                    className="w-full pl-8 pr-3 py-1.5 bg-[var(--md-sys-color-surface-container-high)] rounded-xl text-xs text-[var(--md-sys-color-on-surface)] border-none outline-none"
                  />
                </div>
              </div>

              {/* Student-Fidelity Batch Cards Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {batches
                  .filter((b) => {
                    if (catalogCategoryFilter !== 'all' && b.category !== catalogCategoryFilter) return false;
                    if (catalogSearchQuery.trim()) {
                      const q = catalogSearchQuery.toLowerCase();
                      return b.title.toLowerCase().includes(q) || b.description.toLowerCase().includes(q);
                    }
                    return true;
                  })
                  .map((b) => {
                    const batchEnrollments = getEnrollmentsForBatch(b.id);
                    const batchTestList = getTestsForBatch(b.id);
                    const batchLectureList = lectures.filter((l) => l.batchId === b.id);
                    const batchChapterList = chapters.filter((c) => c.batchId === b.id);

                    return (
                      <div
                        key={b.id}
                        className="rounded-3xl bg-[var(--md-sys-color-surface-container)] overflow-hidden shadow-xs hover:shadow-lg transition flex flex-col justify-between border-none group"
                      >
                        <div>
                          {/* Banner Image with Category & Status Overlay */}
                          <div className="h-44 w-full relative overflow-hidden bg-black">
                            <img
                              src={b.bannerUrl || b.thumbnailUrl}
                              alt={b.title}
                              className="w-full h-full object-cover group-hover:scale-105 transition duration-500"
                            />
                            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent pointer-events-none" />

                            <div className="absolute top-3 left-3 z-20 flex items-center space-x-1.5 flex-wrap gap-y-1">
                              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-black/70 backdrop-blur-md text-white">
                                {b.category}
                              </span>
                              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold text-white ${b.isPublished ? 'bg-emerald-500/80' : 'bg-amber-500/80'}`}>
                                {b.isPublished ? '● Active' : '○ Draft'}
                              </span>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  e.preventDefault();
                                  toggleBatchGuestAccess(b.id);
                                }}
                                title="Click to toggle Guest Access for this batch"
                                className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold text-white transition cursor-pointer border-none outline-none shadow-xs hover:scale-105 active:scale-95 ${
                                  b.allowGuestAccess ? 'bg-indigo-600 hover:bg-indigo-500' : 'bg-black/70 hover:bg-black/90'
                                }`}
                              >
                                {b.allowGuestAccess ? '👥 Guests Open' : '🔒 Roster Only'}
                              </button>
                            </div>

                            {/* Price on Image */}
                            <div className="absolute bottom-3 left-3 flex items-baseline space-x-1.5">
                              <span className="text-base font-black text-white">
                                ₹{b.price}
                              </span>
                              {b.originalPrice > b.price && (
                                <span className="text-xs text-white/70 line-through">
                                  ₹{b.originalPrice}
                                </span>
                              )}
                            </div>

                            {/* Validity */}
                            <span className="absolute bottom-3 right-3 text-[10px] font-bold text-white/80 bg-black/60 px-2 py-0.5 rounded-md backdrop-blur-sm">
                              {b.validityDays} Days Validity
                            </span>
                          </div>

                          {/* Details */}
                          <div className="p-5 space-y-3">
                            <div>
                              <h3 className="text-sm font-bold text-[var(--md-sys-color-on-surface)] line-clamp-1 group-hover:text-[var(--md-sys-color-primary)] transition">
                                {b.title}
                              </h3>
                              <p className="text-xs text-[var(--md-sys-color-on-surface-variant)] line-clamp-2 mt-1">
                                {b.tagline || b.description}
                              </p>
                            </div>

                            <p className="text-[11px] text-[var(--md-sys-color-on-surface-variant)]">
                              Instructor: <span className="font-semibold text-[var(--md-sys-color-on-surface)]">{b.instructor?.name || 'Sanju Kumar'}</span>
                            </p>

                            {/* Live Metrics Row */}
                            <div className="grid grid-cols-2 gap-2 pt-1 text-[11px]">
                              <button
                                type="button"
                                onClick={() => setQuickEnrollTargetBatch(b)}
                                className="p-2 rounded-xl bg-[var(--md-sys-color-surface-container-high)] text-left hover:bg-[var(--md-sys-color-primary-container)]/30 transition border-none outline-none cursor-pointer flex items-center justify-between"
                                title="Click to manage student access"
                              >
                                <span className="text-[var(--md-sys-color-on-surface-variant)] flex items-center space-x-1">
                                  <Users className="w-3.5 h-3.5 text-emerald-500" />
                                  <span>Students</span>
                                </span>
                                <span className="font-bold text-[var(--md-sys-color-on-surface)]">
                                  {batchEnrollments.length}
                                </span>
                              </button>

                              <div className="p-2 rounded-xl bg-[var(--md-sys-color-surface-container-high)] flex items-center justify-between">
                                <span className="text-[var(--md-sys-color-on-surface-variant)] flex items-center space-x-1">
                                  <Award className="w-3.5 h-3.5 text-amber-500" />
                                  <span>Tests</span>
                                </span>
                                <span className="font-bold text-[var(--md-sys-color-on-surface)]">
                                  {batchTestList.length}
                                </span>
                              </div>

                              <div className="p-2 rounded-xl bg-[var(--md-sys-color-surface-container-high)] flex items-center justify-between">
                                <span className="text-[var(--md-sys-color-on-surface-variant)] flex items-center space-x-1">
                                  <Play className="w-3.5 h-3.5 text-indigo-500" />
                                  <span>Lectures</span>
                                </span>
                                <span className="font-bold text-[var(--md-sys-color-on-surface)]">
                                  {batchLectureList.length}
                                </span>
                              </div>

                              <div className="p-2 rounded-xl bg-[var(--md-sys-color-surface-container-high)] flex items-center justify-between">
                                <span className="text-[var(--md-sys-color-on-surface-variant)] flex items-center space-x-1">
                                  <BookOpen className="w-3.5 h-3.5 text-purple-500" />
                                  <span>Chapters</span>
                                </span>
                                <span className="font-bold text-[var(--md-sys-color-on-surface)]">
                                  {batchChapterList.length}
                                </span>
                              </div>
                            </div>

                            {/* Guest Access Mode Quick Switch Row */}
                            <div className="pt-2.5 border-t border-[var(--md-sys-color-outline-variant)]/20 flex items-center justify-between text-xs">
                              <span className="text-[11px] font-semibold text-[var(--md-sys-color-on-surface-variant)] flex items-center space-x-1">
                                <Users className="w-3.5 h-3.5 text-indigo-500" />
                                <span>Guest Policy:</span>
                              </span>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  e.preventDefault();
                                  toggleBatchGuestAccess(b.id);
                                }}
                                title="Click to toggle between Guest Open and Roster Only"
                                className={`px-2.5 py-1 rounded-full text-[10.5px] font-bold transition cursor-pointer border-none outline-none flex items-center space-x-1 shadow-xs active:scale-95 ${
                                  b.allowGuestAccess
                                    ? 'bg-indigo-600 text-white hover:bg-indigo-700'
                                    : 'bg-[var(--md-sys-color-surface-container-highest)] text-[var(--md-sys-color-on-surface-variant)] hover:text-[var(--md-sys-color-on-surface)]'
                                }`}
                              >
                                <span>{b.allowGuestAccess ? '👥 Guests Open' : '🔒 Roster Only'}</span>
                              </button>
                            </div>
                          </div>
                        </div>

                        {/* Card Superpower Action Bar */}
                        <div className="p-4 border-t border-[var(--md-sys-color-outline-variant)]/20 bg-[var(--md-sys-color-surface-container-high)]/30 flex items-center justify-between gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedBatchId(b.id);
                              setWorkspaceBatchId(b.id);
                            }}
                            className="flex-1 py-2 px-3 m3-btn-filled text-xs font-bold shadow-xs border-none outline-none cursor-pointer flex items-center justify-center space-x-1.5"
                          >
                            <Sliders className="w-3.5 h-3.5" />
                            <span>Enter Batch Studio</span>
                          </button>

                          {catalogViewMode === 'studio' && (
                            <div className="flex items-center space-x-1">
                              <button
                                type="button"
                                onClick={() => setQuickEnrollTargetBatch(b)}
                                className="p-2 rounded-xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/25 transition border-none outline-none cursor-pointer"
                                title="Quick Enroll Student"
                              >
                                <UserPlus className="w-4 h-4" />
                              </button>

                              <button
                                type="button"
                                onClick={() => {
                                  setEditBatchTarget(b);
                                  setIsCreateBatchModalOpen(true);
                                }}
                                className="p-2 rounded-xl bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-500/25 transition border-none outline-none cursor-pointer"
                                title="Edit Batch Details"
                              >
                                <Edit3 className="w-4 h-4" />
                              </button>

                              <button
                                type="button"
                                onClick={() => {
                                  if (window.confirm(`Are you sure you want to delete batch "${b.title}"?`)) {
                                    deleteBatch(b.id);
                                    showSecurityToast(`Batch "${b.title}" deleted.`);
                                  }
                                }}
                                className="p-2 rounded-xl hover:bg-rose-500/15 text-rose-500 transition border-none outline-none cursor-pointer"
                                title="Delete Batch"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 4: STUDENT BATCH SETTINGS & ENROLLMENTS */}
      {activeTab === 'student_enrollments' && (
        <div className="space-y-6">
          {/* Target Batch Selection Header Banner */}
          <div className="bg-[var(--md-sys-color-surface-container)] rounded-3xl p-5 shadow-xs border-none flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 rounded-2xl bg-[var(--md-sys-color-primary-container)] text-[var(--md-sys-color-on-primary-container)] flex items-center justify-center font-bold">
                <Users className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-sm sm:text-base font-bold text-[var(--md-sys-color-on-surface)]">
                  Student Batch Enrollments & Access Control
                </h2>
                <p className="text-xs text-[var(--md-sys-color-on-surface-variant)]">
                  Manage student admissions by Phone Number or Email with custom validity dates.
                </p>
              </div>
            </div>

            <div className="flex items-center space-x-3 w-full sm:w-auto">
              <label className="text-xs font-bold text-[var(--md-sys-color-on-surface-variant)] whitespace-nowrap">
                Selected Batch:
              </label>
              <select
                value={selectedBatchId}
                onChange={(e) => setSelectedBatchId(e.target.value)}
                className="w-full sm:w-64 p-2.5 bg-[var(--md-sys-color-surface-container-high)] rounded-2xl text-xs font-bold text-[var(--md-sys-color-on-surface)] border-none outline-none"
              >
                {batches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.title} (₹{b.price})
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Left Column: Fast Add/Enroll Student Form (5 cols) */}
            <div className="lg:col-span-5 space-y-5">
              <div className="bg-[var(--md-sys-color-surface-container)] rounded-3xl p-6 shadow-xs border-none space-y-4">
                <div className="flex items-center justify-between border-b border-[var(--md-sys-color-outline-variant)]/20 pb-3">
                  <h3 className="text-sm font-bold text-[var(--md-sys-color-on-surface)] flex items-center space-x-2">
                    <UserPlus className="w-4 h-4 text-[var(--md-sys-color-primary)]" />
                    <span>Add Student to Batch</span>
                  </h3>
                  <span className="text-[10px] bg-[var(--md-sys-color-primary-container)] text-[var(--md-sys-color-on-primary-container)] px-2.5 py-0.5 rounded-full font-bold">
                    Fast Admissions
                  </span>
                </div>

                <form onSubmit={handleEnrollStudent} className="space-y-3.5">
                  <div>
                    <label className="text-xs font-bold text-[var(--md-sys-color-on-surface-variant)] block mb-1">
                      Target Batch
                    </label>
                    <select
                      value={selectedBatchId}
                      onChange={(e) => setSelectedBatchId(e.target.value)}
                      className="w-full p-2.5 bg-[var(--md-sys-color-surface-container-high)] rounded-2xl text-xs text-[var(--md-sys-color-on-surface)] border-none outline-none"
                    >
                      {batches.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.title}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="text-xs font-bold text-[var(--md-sys-color-on-surface-variant)] block mb-1">
                      Student Phone Number or Email Address *
                    </label>
                    <div className="relative">
                      <input
                        type="text"
                        value={enrollContactInput}
                        onChange={(e) => setEnrollContactInput(e.target.value)}
                        placeholder="e.g. +91 98201 11223 or student@gmail.com"
                        className="w-full pl-3.5 pr-10 py-2.5 bg-[var(--md-sys-color-surface-container-high)] rounded-2xl text-xs text-[var(--md-sys-color-on-surface)] placeholder-[var(--md-sys-color-outline)] border-none outline-none focus:bg-[var(--md-sys-color-surface-container-highest)] font-medium"
                      />
                      <div className="absolute inset-y-0 right-0 pr-3 flex items-center text-[var(--md-sys-color-outline)]">
                        {enrollContactInput.includes('@') ? (
                          <Mail className="w-4 h-4 text-[var(--md-sys-color-primary)]" />
                        ) : enrollContactInput.replace(/\D/g, '').length >= 5 ? (
                          <Phone className="w-4 h-4 text-emerald-500" />
                        ) : (
                          <Search className="w-4 h-4" />
                        )}
                      </div>
                    </div>
                    {enrollContactInput.trim() && (
                      <p className="text-[11px] text-[var(--md-sys-color-on-surface-variant)] mt-1 flex items-center space-x-1">
                        <span>Recognized format:</span>
                        <span className="font-bold text-[var(--md-sys-color-primary)]">
                          {enrollContactInput.includes('@')
                            ? '✉️ Email Address'
                            : '📱 Mobile Phone Number'}
                        </span>
                      </p>
                    )}
                  </div>

                  <div>
                    <label className="text-xs font-bold text-[var(--md-sys-color-on-surface-variant)] block mb-1">
                      Student Full Name (Optional)
                    </label>
                    <input
                      type="text"
                      value={enrollNameInput}
                      onChange={(e) => setEnrollNameInput(e.target.value)}
                      placeholder="e.g. Aarav Sharma (Auto-generated if blank)"
                      className="w-full p-2.5 bg-[var(--md-sys-color-surface-container-high)] rounded-2xl text-xs text-[var(--md-sys-color-on-surface)] placeholder-[var(--md-sys-color-outline)] border-none outline-none focus:bg-[var(--md-sys-color-surface-container-highest)]"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-bold text-[var(--md-sys-color-on-surface-variant)] block mb-1">
                      Batch Validity Duration
                    </label>
                    <select
                      value={enrollValidityDays}
                      onChange={(e) => setEnrollValidityDays(Number(e.target.value))}
                      className="w-full p-2.5 bg-[var(--md-sys-color-surface-container-high)] rounded-2xl text-xs text-[var(--md-sys-color-on-surface)] border-none outline-none"
                    >
                      <option value={30}>1 Month (30 Days)</option>
                      <option value={90}>3 Months (90 Days)</option>
                      <option value={180}>6 Months (180 Days)</option>
                      <option value={365}>1 Year (365 Days) — Standard</option>
                      <option value={730}>2 Years (730 Days)</option>
                      <option value={3650}>Lifetime Access</option>
                    </select>
                  </div>

                  <button
                    type="submit"
                    disabled={!enrollContactInput.trim()}
                    className="w-full py-3 m3-btn-filled text-xs disabled:opacity-50 flex items-center justify-center space-x-2 shadow-xs border-none outline-none"
                  >
                    <UserPlus className="w-4 h-4" />
                    <span>Enroll Student into Batch</span>
                  </button>
                </form>

                <div className="pt-3 border-t border-[var(--md-sys-color-outline-variant)]/20 text-xs text-[var(--md-sys-color-on-surface-variant)] space-y-1.5">
                  <span className="font-bold text-[var(--md-sys-color-on-surface)] block">
                    ⚡ Auto-Provisioning Engine:
                  </span>
                  <p className="text-[11px] leading-relaxed">
                    If this phone or email belongs to an existing user, they receive instant access immediately.
                    If they are a new student, an account is automatically created so when they log in with that phone/email, the batch is already unlocked!
                  </p>
                </div>
              </div>
            </div>

            {/* Right Column: Enrolled Students & Platform Directory (7 cols) */}
            <div className="lg:col-span-7 space-y-6">
              {/* Active Enrollments in Selected Batch */}
              <div className="bg-[var(--md-sys-color-surface-container)] rounded-3xl p-6 shadow-xs border-none space-y-4">
                <div className="flex items-center justify-between border-b border-[var(--md-sys-color-outline-variant)]/20 pb-3">
                  <div>
                    <h3 className="text-sm font-bold text-[var(--md-sys-color-on-surface)] flex items-center space-x-2">
                      <Users className="w-4 h-4 text-[var(--md-sys-color-primary)]" />
                      <span>Enrolled Students in this Batch</span>
                    </h3>
                    <p className="text-[11px] text-[var(--md-sys-color-on-surface-variant)]">
                      {batches.find((b) => b.id === selectedBatchId)?.title || 'Selected Batch'} (
                      {activeBatchEnrollments.length} active)
                    </p>
                  </div>
                  <span className="text-[11px] bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 font-bold px-2.5 py-0.5 rounded-full">
                    {activeBatchEnrollments.length} Enrolled
                  </span>
                </div>

                {activeBatchEnrollments.length === 0 ? (
                  <div className="py-10 text-center text-xs text-[var(--md-sys-color-on-surface-variant)] bg-[var(--md-sys-color-surface-container-high)] rounded-2xl p-4">
                    No students currently enrolled in this batch. Use the form on the left to add by phone or email.
                  </div>
                ) : (
                  <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1">
                    {activeBatchEnrollments.map((enr) => (
                      <div
                        key={enr.id}
                        className="p-3.5 rounded-2xl bg-[var(--md-sys-color-surface-container-high)] flex items-center justify-between gap-3 border-none shadow-xs"
                      >
                        <div className="flex items-center space-x-3 min-w-0">
                          <div className="w-9 h-9 rounded-full bg-[var(--md-sys-color-primary-container)] text-[var(--md-sys-color-on-primary-container)] flex items-center justify-center font-bold text-xs flex-shrink-0">
                            {enr.studentName.charAt(0).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <h4 className="text-xs font-bold text-[var(--md-sys-color-on-surface)] truncate">
                              {enr.studentName}
                            </h4>
                            <p className="text-[11px] text-[var(--md-sys-color-on-surface-variant)] truncate flex items-center space-x-2">
                              <span>{enr.studentPhone}</span>
                              <span>•</span>
                              <span>{enr.studentEmail}</span>
                            </p>
                            <div className="flex items-center space-x-2 text-[10px] text-[var(--md-sys-color-outline)] font-mono mt-0.5">
                              <span>Enrolled: {enr.enrolledAt}</span>
                              <span>•</span>
                              <span className="text-emerald-600 dark:text-emerald-400 font-bold">
                                Valid until: {enr.validUntil || enr.expiresAt || 'Active'}
                              </span>
                            </div>
                          </div>
                        </div>

                        <button
                          onClick={() => handleRevokeEnrollment(enr.studentEmail || enr.studentPhone || enr.userId || enr.id, enr.studentName)}
                          className="p-2 rounded-full hover:bg-red-500/15 text-red-500 transition border-none outline-none flex-shrink-0"
                          title="Revoke Batch Access"
                        >
                          <Ban className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* All Platform Students Directory (Fast Quick-Enroll) */}
              <div className="bg-[var(--md-sys-color-surface-container)] rounded-3xl p-6 shadow-xs border-none space-y-4">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 border-b border-[var(--md-sys-color-outline-variant)]/20 pb-3">
                  <div>
                    <h3 className="text-sm font-bold text-[var(--md-sys-color-on-surface)] flex items-center space-x-2">
                      <Search className="w-4 h-4 text-[var(--md-sys-color-secondary)]" />
                      <span>Platform Student Directory</span>
                    </h3>
                    <p className="text-[11px] text-[var(--md-sys-color-on-surface-variant)]">
                      Instant search across all registered users
                    </p>
                  </div>
                  <div className="relative w-full sm:w-56">
                    <input
                      type="text"
                      value={studentSearchQuery}
                      onChange={(e) => setStudentSearchQuery(e.target.value)}
                      placeholder="Search name, phone, email..."
                      className="w-full pl-3 pr-8 py-2 bg-[var(--md-sys-color-surface-container-high)] rounded-2xl text-xs text-[var(--md-sys-color-on-surface)] placeholder-[var(--md-sys-color-outline)] border-none outline-none"
                    />
                    <Search className="w-3.5 h-3.5 absolute right-2.5 top-2.5 text-[var(--md-sys-color-outline)]" />
                  </div>
                </div>

                <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                  {filteredStudents.map((stu: any) => {
                    const isAlreadyEnrolled =
                      (Array.isArray(stu.enrolledBatchIds) && stu.enrolledBatchIds.includes(selectedBatchId)) ||
                      activeBatchEnrollments.some((e) => e.userId === stu.id);

                    const enrolledCount = Array.isArray(stu.enrolledBatchIds)
                      ? stu.enrolledBatchIds.length
                      : (stu.id ? 1 : 0);

                    return (
                      <div
                        key={stu.id}
                        className="p-3 rounded-2xl bg-[var(--md-sys-color-surface-container-high)] flex items-center justify-between gap-3 border-none"
                      >
                        <div className="flex items-center space-x-3 min-w-0">
                          {stu.avatarUrl ? (
                            <img
                              src={stu.avatarUrl}
                              alt={stu.name}
                              className="w-8 h-8 rounded-full object-cover flex-shrink-0"
                            />
                          ) : (
                            <div className="w-8 h-8 rounded-full bg-[var(--md-sys-color-primary-container)] text-[var(--md-sys-color-on-primary-container)] flex items-center justify-center text-xs font-bold flex-shrink-0">
                              {stu.name?.charAt(0) || 'S'}
                            </div>
                          )}
                          <div className="min-w-0">
                            <h4 className="text-xs font-bold text-[var(--md-sys-color-on-surface)] truncate">
                              {stu.name}
                            </h4>
                            <p className="text-[10px] text-[var(--md-sys-color-on-surface-variant)] truncate">
                              {stu.phone || stu.email}
                            </p>
                            <div className="flex items-center space-x-1 mt-0.5">
                              <span className="text-[9px] bg-[var(--md-sys-color-surface-container-highest)] text-[var(--md-sys-color-on-surface-variant)] px-2 py-0.2 rounded-full font-bold">
                                {enrolledCount} {enrolledCount === 1 ? 'batch' : 'batches'} enrolled
                              </span>
                            </div>
                          </div>
                        </div>

                        {isAlreadyEnrolled ? (
                          <span className="text-[10px] px-2.5 py-1 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 font-bold flex items-center space-x-1 flex-shrink-0">
                            <Check className="w-3 h-3" />
                            <span>Enrolled</span>
                          </span>
                        ) : (
                          <button
                            onClick={() => {
                              const result = enrollStudentByContact({
                                contact: stu.email || stu.phone,
                                batchId: selectedBatchId,
                                validityDays: 365,
                              });
                              if (result.success) {
                                showSecurityToast(`Enrolled ${stu.name} into batch!`);
                              }
                            }}
                            className="px-3 py-1.5 rounded-full bg-[var(--md-sys-color-primary-container)] text-[var(--md-sys-color-on-primary-container)] text-xs font-bold hover:opacity-90 transition border-none outline-none flex items-center space-x-1 flex-shrink-0"
                          >
                            <PlusCircle className="w-3.5 h-3.5" />
                            <span>Quick Enroll</span>
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 5: BATCH TEST CATALOG AUTHORING & 750KB BIN-PACKING */}
      {activeTab === 'batch_tests_authoring' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Form: Test Authoring (5 cols) */}
          <div className="lg:col-span-5 bg-[var(--md-sys-color-surface-container)] rounded-3xl p-6 shadow-xs border-none space-y-4">
            <div className="flex items-center justify-between border-b border-[var(--md-sys-color-outline-variant)]/20 pb-3">
              <h2 className="text-base font-bold text-[var(--md-sys-color-on-surface)] flex items-center space-x-2">
                <CheckSquare className="w-5 h-5 text-[var(--md-sys-color-primary)]" />
                <span>Publish Test to Batch Catalog</span>
              </h2>
              <span className="text-[10px] bg-[var(--md-sys-color-primary-container)] text-[var(--md-sys-color-on-primary-container)] px-2.5 py-0.5 rounded-full font-bold">
                750 KB Bin-Pack
              </span>
            </div>

            <form onSubmit={handlePublishTest} className="space-y-3.5">
              <div>
                <label className="text-xs font-bold text-[var(--md-sys-color-on-surface-variant)] block mb-1">
                  Target Batch
                </label>
                <select
                  value={selectedBatchId}
                  onChange={(e) => setSelectedBatchId(e.target.value)}
                  className="w-full p-2.5 bg-[var(--md-sys-color-surface-container-high)] rounded-2xl text-xs text-[var(--md-sys-color-on-surface)] border-none outline-none font-bold"
                >
                  {batches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.title}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-bold text-[var(--md-sys-color-on-surface-variant)] block mb-1">
                  Test / Paper Title *
                </label>
                <input
                  type="text"
                  value={testTitleInput}
                  onChange={(e) => setTestTitleInput(e.target.value)}
                  placeholder="e.g. Full Syllabus Mock Test 03"
                  className="w-full p-2.5 bg-[var(--md-sys-color-surface-container-high)] rounded-2xl text-xs text-[var(--md-sys-color-on-surface)] placeholder-[var(--md-sys-color-outline)] border-none outline-none focus:bg-[var(--md-sys-color-surface-container-highest)]"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-[var(--md-sys-color-on-surface-variant)] block mb-1">
                  Topic / Syllabus Classification
                </label>
                <input
                  type="text"
                  value={testTopicInput}
                  onChange={(e) => setTestTopicInput(e.target.value)}
                  placeholder="e.g. Mechanics, Optics, Calculus"
                  className="w-full p-2.5 bg-[var(--md-sys-color-surface-container-high)] rounded-2xl text-xs text-[var(--md-sys-color-on-surface)] placeholder-[var(--md-sys-color-outline)] border-none outline-none focus:bg-[var(--md-sys-color-surface-container-highest)]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-[var(--md-sys-color-on-surface-variant)] block mb-1">
                    Difficulty Level
                  </label>
                  <select
                    value={testDifficultyInput}
                    onChange={(e) => setTestDifficultyInput(e.target.value as any)}
                    className="w-full p-2.5 bg-[var(--md-sys-color-surface-container-high)] rounded-2xl text-xs text-[var(--md-sys-color-on-surface)] border-none outline-none"
                  >
                    <option value="easy">Easy</option>
                    <option value="medium">Medium</option>
                    <option value="hard">Hard</option>
                    <option value="adaptive">Adaptive</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-bold text-[var(--md-sys-color-on-surface-variant)] block mb-1">
                    Duration (Minutes)
                  </label>
                  <input
                    type="number"
                    value={testDurationInput}
                    onChange={(e) => setTestDurationInput(Number(e.target.value))}
                    className="w-full p-2.5 bg-[var(--md-sys-color-surface-container-high)] rounded-2xl text-xs text-[var(--md-sys-color-on-surface)] border-none outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-[var(--md-sys-color-on-surface-variant)] block mb-1">
                  Question Count
                </label>
                <input
                  type="number"
                  value={testQCountInput}
                  onChange={(e) => setTestQCountInput(Number(e.target.value))}
                  className="w-full p-2.5 bg-[var(--md-sys-color-surface-container-high)] rounded-2xl text-xs text-[var(--md-sys-color-on-surface)] border-none outline-none"
                />
              </div>

              <button
                type="submit"
                disabled={!testTitleInput.trim()}
                className="w-full py-3 m3-btn-filled text-xs disabled:opacity-50 flex items-center justify-center space-x-2 shadow-xs border-none outline-none cursor-pointer"
              >
                <Sparkles className="w-4 h-4" />
                <span>Publish Test & Bin-Pack into Catalog Chunk</span>
              </button>
            </form>

            <div className="p-3.5 bg-[var(--md-sys-color-surface-container-high)] rounded-2xl text-[11px] text-[var(--md-sys-color-on-surface-variant)] space-y-1">
              <span className="font-bold text-[var(--md-sys-color-on-surface)] block">
                📦 Multi-Test Bin-Packing Engine:
              </span>
              <p>
                Each test paper consumes ~80-100 KB. We safely store multiple tests inside one 750 KB document.
                When full, chunk K+1 is auto-allocated. Zero test data is ever lost.
              </p>
            </div>
          </div>

          {/* Right Panel: Current Batch Tests & Chunk Breakdown (7 cols) */}
          <div className="lg:col-span-7 bg-[var(--md-sys-color-surface-container)] rounded-3xl p-6 shadow-xs border-none space-y-4">
            <div className="flex items-center justify-between border-b border-[var(--md-sys-color-outline-variant)]/20 pb-3">
              <div>
                <h3 className="text-base font-bold text-[var(--md-sys-color-on-surface)] flex items-center space-x-2">
                  <Layers className="w-5 h-5 text-[var(--md-sys-color-primary)]" />
                  <span>Batch Test Catalog Manifest</span>
                </h3>
                <p className="text-[11px] text-[var(--md-sys-color-on-surface-variant)]">
                  {batches.find((b) => b.id === selectedBatchId)?.title || 'Selected Batch'} (
                  {getTestsForBatch(selectedBatchId).length} tests published)
                </p>
              </div>
              <span className="text-[11px] bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 font-bold px-2.5 py-0.5 rounded-full">
                1-Read Card Manifest
              </span>
            </div>

            <div className="space-y-3 max-h-[550px] overflow-y-auto pr-1">
              {getTestsForBatch(selectedBatchId).length === 0 ? (
                <div className="py-12 text-center text-xs text-[var(--md-sys-color-on-surface-variant)] bg-[var(--md-sys-color-surface-container-high)] rounded-2xl p-4">
                  No tests published in this batch yet. Use the form on the left to author a test.
                </div>
              ) : (
                getTestsForBatch(selectedBatchId).map((t) => (
                  <div
                    key={t.testId || t.id}
                    className="p-4 rounded-2xl bg-[var(--md-sys-color-surface-container-high)] flex items-center justify-between gap-3 border-none shadow-xs"
                  >
                    <div className="min-w-0 space-y-1">
                      <div className="flex items-center space-x-2">
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-[var(--md-sys-color-primary-container)] text-[var(--md-sys-color-on-primary-container)] font-bold">
                          {t.catalogChunkId || t.chunkId || t.testId}
                        </span>
                        <h4 className="text-xs sm:text-sm font-bold text-[var(--md-sys-color-on-surface)] truncate">
                          {t.title}
                        </h4>
                      </div>
                      <p className="text-[11px] text-[var(--md-sys-color-on-surface-variant)] truncate">
                        {t.topic} • {t.questionCount} Questions • {t.timeLimitMinutes} Mins • Passing {t.passingScorePercentage}%
                      </p>
                    </div>

                    <span className="text-[10px] px-2.5 py-1 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 font-bold uppercase flex-shrink-0">
                      {t.difficulty}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
          {/* Modals for Create/Edit Batch & Quick Enroll */}
      <BatchEditorModal
        isOpen={isCreateBatchModalOpen || !!editBatchTarget}
        onClose={() => {
          setIsCreateBatchModalOpen(false);
          setEditBatchTarget(null);
        }}
        batchToEdit={editBatchTarget}
        onSave={(data, existingId) => {
          if (existingId) {
            updateBatch(existingId, data);
            showSecurityToast(`Batch "${data.title}" updated.`);
          } else {
            addBatch(data);
            showSecurityToast(`Batch "${data.title}" launched successfully!`);
          }
        }}
      />

      <BatchQuickEnrollModal
        isOpen={!!quickEnrollTargetBatch}
        onClose={() => setQuickEnrollTargetBatch(null)}
        batch={quickEnrollTargetBatch}
      />
    </div>
  );
};
