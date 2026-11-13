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
} from 'lucide-react';
import { useApp } from '../../lms/LmsContext';
import { extractYouTubeId, obfuscateVideoKey } from '../../lms/security';
import { CloakedVideoPlayer } from './player/CloakedVideoPlayer';

export const BatchAdminStudio: React.FC = () => {
  const {
    batches,
    addBatch,
    deleteBatch,
    subjects,
    addSubject,
    chapters,
    addChapter,
    lectures,
    addLecture,
    user,
    showSecurityToast,
  } = useApp();

  const [activeTab, setActiveTab] = useState<'add_lecture' | 'manage_batches' | 'curriculum'>('add_lecture');

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
  const [detectedYtId, setDetectedYtId] = useState<string | null>(null);

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

  const availableSubjects = subjects.filter((s) => s.batchId === selectedBatchId);
  const availableChapters = chapters.filter(
    (c) => c.batchId === selectedBatchId && (!selectedSubjectId || c.subjectId === selectedSubjectId)
  );

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
      pdfNotes: pdfTitle.trim()
        ? [
            {
              id: `pdf_${Date.now()}`,
              title: pdfTitle.trim(),
              url: '#',
              size: '2.5 MB',
              pages: 12,
            },
          ]
        : [],
    });

    showSecurityToast(`✅ Lecture "${lectureTitle}" added and cloaked successfully!`);
    setVideoUrlInput('');
    setDetectedYtId(null);
    setLectureTitle('');
    setLectureDesc('');
    setPdfTitle('');
  };

  const handleCreateBatch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newBatchTitle.trim()) {
      alert('Please enter batch title');
      return;
    }

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
    setNewBatchTitle('');
    setNewBatchTagline('');
    setNewBatchDesc('');
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

        {/* M3 Segmented Tab Switcher (Borderless) */}
        <div className="flex bg-[var(--md-sys-color-surface-container-high)] p-1 rounded-full border-none self-stretch md:self-auto shadow-xs">
          <button
            onClick={() => setActiveTab('add_lecture')}
            className={`flex-1 md:flex-none px-4 py-2 rounded-full text-xs font-bold flex items-center justify-center space-x-2 transition border-none outline-none ${
              activeTab === 'add_lecture'
                ? 'm3-nav-pill-active shadow-xs'
                : 'text-[var(--md-sys-color-on-surface-variant)] hover:text-[var(--md-sys-color-on-surface)]'
            }`}
          >
            <Video className="w-4 h-4" />
            <span>Add Lecture</span>
          </button>

          <button
            onClick={() => setActiveTab('curriculum')}
            className={`flex-1 md:flex-none px-4 py-2 rounded-full text-xs font-bold flex items-center justify-center space-x-2 transition border-none outline-none ${
              activeTab === 'curriculum'
                ? 'm3-nav-pill-active shadow-xs'
                : 'text-[var(--md-sys-color-on-surface-variant)] hover:text-[var(--md-sys-color-on-surface)]'
            }`}
          >
            <FolderPlus className="w-4 h-4" />
            <span>Folders</span>
          </button>

          <button
            onClick={() => setActiveTab('manage_batches')}
            className={`flex-1 md:flex-none px-4 py-2 rounded-full text-xs font-bold flex items-center justify-center space-x-2 transition border-none outline-none ${
              activeTab === 'manage_batches'
                ? 'm3-nav-pill-active shadow-xs'
                : 'text-[var(--md-sys-color-on-surface-variant)] hover:text-[var(--md-sys-color-on-surface)]'
            }`}
          >
            <Layers className="w-4 h-4" />
            <span>Batches ({batches.length})</span>
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

              {/* PDF Notes Title */}
              <div>
                <label className="text-xs font-bold text-[var(--md-sys-color-on-surface-variant)] block mb-1">
                  Attached PDF Notes (Optional)
                </label>
                <input
                  type="text"
                  value={pdfTitle}
                  onChange={(e) => setPdfTitle(e.target.value)}
                  placeholder="e.g. Sample Handwritten Derivations.pdf"
                  className="w-full p-2.5 bg-[var(--md-sys-color-surface-container-high)] rounded-2xl text-xs text-[var(--md-sys-color-on-surface)] placeholder-[var(--md-sys-color-outline)] border-none outline-none focus:bg-[var(--md-sys-color-surface-container-highest)]"
                />
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

      {/* TAB 3: MANAGE BATCHES */}
      {activeTab === 'manage_batches' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Create Batch Form */}
          <div className="lg:col-span-5 bg-[var(--md-sys-color-surface-container)] rounded-3xl p-6 shadow-xs border-none space-y-4">
            <h2 className="text-base font-bold text-[var(--md-sys-color-on-surface)] flex items-center space-x-2">
              <PlusCircle className="w-5 h-5 text-[var(--md-sys-color-primary)]" />
              <span>Create New Batch</span>
            </h2>

            <form onSubmit={handleCreateBatch} className="space-y-3">
              <div>
                <label className="text-xs font-bold text-[var(--md-sys-color-on-surface-variant)] block mb-1">
                  Batch Title
                </label>
                <input
                  type="text"
                  value={newBatchTitle}
                  onChange={(e) => setNewBatchTitle(e.target.value)}
                  placeholder="e.g. Elevate Testing Batch 02"
                  className="w-full p-2.5 bg-[var(--md-sys-color-surface-container-high)] rounded-2xl text-xs text-[var(--md-sys-color-on-surface)] border-none outline-none"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-[var(--md-sys-color-on-surface-variant)] block mb-1">
                  Tagline
                </label>
                <input
                  type="text"
                  value={newBatchTagline}
                  onChange={(e) => setNewBatchTagline(e.target.value)}
                  placeholder="Testing environment"
                  className="w-full p-2.5 bg-[var(--md-sys-color-surface-container-high)] rounded-2xl text-xs text-[var(--md-sys-color-on-surface)] border-none outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-[var(--md-sys-color-on-surface-variant)] block mb-1">
                    Price (₹)
                  </label>
                  <input
                    type="number"
                    value={newBatchPrice}
                    onChange={(e) => setNewBatchPrice(Number(e.target.value))}
                    className="w-full p-2.5 bg-[var(--md-sys-color-surface-container-high)] rounded-2xl text-xs text-[var(--md-sys-color-on-surface)] border-none outline-none"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-[var(--md-sys-color-on-surface-variant)] block mb-1">
                    MRP (₹)
                  </label>
                  <input
                    type="number"
                    value={newBatchOrigPrice}
                    onChange={(e) => setNewBatchOrigPrice(Number(e.target.value))}
                    className="w-full p-2.5 bg-[var(--md-sys-color-surface-container-high)] rounded-2xl text-xs text-[var(--md-sys-color-on-surface)] border-none outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-[var(--md-sys-color-on-surface-variant)] block mb-1">
                    Category
                  </label>
                  <input
                    type="text"
                    value={newBatchCategory}
                    onChange={(e) => setNewBatchCategory(e.target.value)}
                    className="w-full p-2.5 bg-[var(--md-sys-color-surface-container-high)] rounded-2xl text-xs text-[var(--md-sys-color-on-surface)] border-none outline-none"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-[var(--md-sys-color-on-surface-variant)] block mb-1">
                    Instructor
                  </label>
                  <input
                    type="text"
                    value={newBatchInstructor}
                    onChange={(e) => setNewBatchInstructor(e.target.value)}
                    className="w-full p-2.5 bg-[var(--md-sys-color-surface-container-high)] rounded-2xl text-xs text-[var(--md-sys-color-on-surface)] border-none outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-[var(--md-sys-color-on-surface-variant)] block mb-1">
                  Banner Image URL
                </label>
                <input
                  type="text"
                  value={newBatchBanner}
                  onChange={(e) => setNewBatchBanner(e.target.value)}
                  className="w-full p-2.5 bg-[var(--md-sys-color-surface-container-high)] rounded-2xl text-xs text-[var(--md-sys-color-on-surface)] border-none outline-none font-mono text-[11px]"
                />
              </div>

              <button
                type="submit"
                className="w-full py-3 m3-btn-filled text-xs shadow-xs border-none outline-none"
              >
                + Launch Batch
              </button>
            </form>
          </div>

          {/* Batches Table: 7 cols */}
          <div className="lg:col-span-7 bg-[var(--md-sys-color-surface-container)] rounded-3xl p-6 shadow-xs border-none space-y-4">
            <h3 className="text-base font-bold text-[var(--md-sys-color-on-surface)]">
              Active Batches ({batches.length})
            </h3>

            <div className="space-y-3">
              {batches.map((b) => (
                <div
                  key={b.id}
                  className="p-4 rounded-3xl bg-[var(--md-sys-color-surface-container-high)] border-none flex items-center justify-between gap-3 shadow-xs"
                >
                  <div className="flex items-center space-x-3 min-w-0">
                    <img
                      src={b.thumbnailUrl}
                      alt={b.title}
                      className="w-12 h-12 rounded-2xl object-cover flex-shrink-0"
                    />
                    <div className="min-w-0">
                      <h4 className="text-xs font-bold text-[var(--md-sys-color-on-surface)] truncate">
                        {b.title}
                      </h4>
                      <p className="text-[11px] text-[var(--md-sys-color-on-surface-variant)]">
                        ₹{b.price} • {b.enrolledStudentsCount} student enrolled
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center space-x-2">
                    <button
                      onClick={() => deleteBatch(b.id)}
                      className="p-2.5 rounded-full hover:bg-red-500/15 text-red-500 transition border-none outline-none"
                      title="Delete Batch"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
