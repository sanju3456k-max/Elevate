import React, { useState, useEffect, useRef } from 'react';
import { 
  X, 
  FolderPlus, 
  Video, 
  FileText, 
  Award, 
  Trash2, 
  Check, 
  AlertTriangle,
  Link,
  Sparkles,
  ExternalLink,
  Clock,
  Search
} from 'lucide-react';
import type { Lecture, PdfNote } from '../../../lms/types';
import type { MathTest } from '../../../types';
import { extractYouTubeId, obfuscateVideoKey } from '../../../lms/security';

const FOLDER_COLORS = [
  { id: 'blue', value: '#0b57d0', label: 'Classic Blue' },
  { id: 'emerald', value: '#10b981', label: 'Emerald' },
  { id: 'indigo', value: '#6366f1', label: 'Indigo' },
  { id: 'purple', value: '#a855f7', label: 'Purple' },
  { id: 'amber', value: '#f59e0b', label: 'Amber' },
  { id: 'rose', value: '#f43f5e', label: 'Rose' },
  { id: 'teal', value: '#14b8a6', label: 'Teal' },
  { id: 'slate', value: '#64748b', label: 'Slate' },
];

/* =========================================================================
   1. CREATE OR EDIT FOLDER MODAL
   ========================================================================= */
interface CreateOrEditFolderModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: { title: string; description?: string; color: string }) => void;
  initialTitle?: string;
  initialDescription?: string;
  initialColor?: string;
  parentFolderName?: string;
  isEdit?: boolean;
}

export const CreateOrEditFolderModal: React.FC<CreateOrEditFolderModalProps> = ({
  isOpen,
  onClose,
  onSave,
  initialTitle = '',
  initialDescription = '',
  initialColor = '#0b57d0',
  parentFolderName,
  isEdit = false,
}) => {
  const [title, setTitle] = useState(initialTitle);
  const [description, setDescription] = useState(initialDescription);
  const [color, setColor] = useState(initialColor);
  const isInitializedRef = useRef(false);

  useEffect(() => {
    if (isOpen) {
      if (!isInitializedRef.current) {
        isInitializedRef.current = true;
        setTitle(initialTitle);
        setDescription(initialDescription);
        setColor(initialColor);
      }
    } else {
      isInitializedRef.current = false;
    }
  }, [isOpen, initialTitle, initialDescription, initialColor]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    onSave({ title: title.trim(), description: description.trim(), color });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-fade-in">
      <div 
        className="w-full max-w-md bg-white dark:bg-[#1e2024] rounded-3xl shadow-2xl border border-[var(--md-sys-color-outline-variant)]/20 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-5 border-b border-[var(--md-sys-color-outline-variant)]/15">
          <div className="flex items-center space-x-2.5">
            <div 
              className="w-9 h-9 rounded-2xl flex items-center justify-center text-white shadow-xs"
              style={{ backgroundColor: color }}
            >
              <FolderPlus className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-[var(--md-sys-color-on-surface)]">
                {isEdit ? 'Edit Folder' : 'New Subfolder'}
              </h3>
              {parentFolderName && !isEdit && (
                <p className="text-[11px] text-[var(--md-sys-color-on-surface-variant)] truncate max-w-xs">
                  Inside: <span className="font-semibold">{parentFolderName}</span>
                </p>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center text-[var(--md-sys-color-on-surface-variant)] hover:bg-[var(--md-sys-color-surface-container-high)] border-none bg-transparent cursor-pointer"
          >
            <X className="w-4.5 h-4.5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="block text-xs font-bold text-[var(--md-sys-color-on-surface)] mb-1.5">
              Folder Name <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              required
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Chapter 01: Kinematics"
              className="w-full px-3.5 py-2.5 rounded-2xl bg-[var(--md-sys-color-surface-container)] border border-[var(--md-sys-color-outline-variant)]/40 text-xs sm:text-sm text-[var(--md-sys-color-on-surface)] focus:outline-hidden focus:border-[var(--md-sys-color-primary)] transition"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-[var(--md-sys-color-on-surface)] mb-1.5">
              Description (Optional)
            </label>
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief summary of lectures, notes or tests inside this folder..."
              className="w-full px-3.5 py-2.5 rounded-2xl bg-[var(--md-sys-color-surface-container)] border border-[var(--md-sys-color-outline-variant)]/40 text-xs text-[var(--md-sys-color-on-surface)] focus:outline-hidden focus:border-[var(--md-sys-color-primary)] transition resize-none"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-[var(--md-sys-color-on-surface)] mb-2">
              Color Tag
            </label>
            <div className="flex items-center gap-2 flex-wrap">
              {FOLDER_COLORS.map((col) => (
                <button
                  key={col.id}
                  type="button"
                  onClick={() => setColor(col.value)}
                  className={`w-7 h-7 rounded-full flex items-center justify-center cursor-pointer transition border-2 ${
                    color === col.value ? 'scale-110 border-white dark:border-black shadow-md' : 'border-transparent opacity-80 hover:opacity-100'
                  }`}
                  style={{ backgroundColor: col.value }}
                  title={col.label}
                >
                  {color === col.value && <Check className="w-3.5 h-3.5 text-white" />}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-end space-x-2 pt-2 border-t border-[var(--md-sys-color-outline-variant)]/15">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-bold rounded-full text-[var(--md-sys-color-on-surface-variant)] hover:bg-[var(--md-sys-color-surface-container)] border-none bg-transparent cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!title.trim()}
              className="px-5 py-2 text-xs font-bold rounded-full bg-[var(--md-sys-color-primary)] text-[var(--md-sys-color-on-primary)] hover:opacity-95 disabled:opacity-50 border-none cursor-pointer shadow-xs"
            >
              {isEdit ? 'Save Changes' : 'Create Folder'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

/* =========================================================================
   2. ADD OR EDIT VIDEO LECTURE MODAL
   ========================================================================= */
interface AddOrEditVideoModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: {
    title: string;
    description: string;
    videoUrl: string;
    durationMinutes: number;
    isFreePreview: boolean;
    pdfNoteTitle?: string;
    pdfNoteUrl?: string;
  }) => void;
  initialData?: Partial<Lecture> | null;
  folderName?: string;
}

export const AddOrEditVideoModal: React.FC<AddOrEditVideoModalProps> = ({
  isOpen,
  onClose,
  onSave,
  initialData,
  folderName,
}) => {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [videoUrl, setVideoUrl] = useState('');
  const [durationMinutes, setDurationMinutes] = useState<number>(30);
  const [isFreePreview, setIsFreePreview] = useState(false);
  const [pdfNoteTitle, setPdfNoteTitle] = useState('');
  const [pdfNoteUrl, setPdfNoteUrl] = useState('');
  const isInitializedRef = useRef(false);
  const activeVideoIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      const currentId = initialData?.id || '__new_video__';
      if (!isInitializedRef.current || activeVideoIdRef.current !== currentId) {
        isInitializedRef.current = true;
        activeVideoIdRef.current = currentId;
        if (initialData) {
          setTitle(initialData.title || '');
          setDescription(initialData.description || '');
          setVideoUrl(initialData.encryptedVideoId || '');
          setDurationMinutes(initialData.durationMinutes || 30);
          setIsFreePreview(Boolean(initialData.isFreePreview));
          const firstNote = initialData.pdfNotes?.[0];
          setPdfNoteTitle(firstNote?.title || '');
          setPdfNoteUrl(firstNote?.fileUrl || firstNote?.url || '');
        } else {
          setTitle('');
          setDescription('');
          setVideoUrl('');
          setDurationMinutes(30);
          setIsFreePreview(false);
          setPdfNoteTitle('');
          setPdfNoteUrl('');
        }
      }
    } else {
      isInitializedRef.current = false;
      activeVideoIdRef.current = null;
    }
  }, [isOpen, initialData?.id]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !videoUrl.trim()) return;
    onSave({
      title: title.trim(),
      description: description.trim(),
      videoUrl: videoUrl.trim(),
      durationMinutes: Number(durationMinutes) || 15,
      isFreePreview,
      pdfNoteTitle: pdfNoteTitle.trim() || undefined,
      pdfNoteUrl: pdfNoteUrl.trim() || undefined,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-fade-in">
      <div 
        className="w-full max-w-lg bg-white dark:bg-[#1e2024] rounded-3xl shadow-2xl border border-[var(--md-sys-color-outline-variant)]/20 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-5 border-b border-[var(--md-sys-color-outline-variant)]/15">
          <div className="flex items-center space-x-2.5">
            <div className="w-9 h-9 rounded-2xl bg-indigo-600 text-white flex items-center justify-center shadow-xs">
              <Video className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-[var(--md-sys-color-on-surface)]">
                {initialData ? 'Edit Video Lecture' : 'Add Video Lecture'}
              </h3>
              {folderName && (
                <p className="text-[11px] text-[var(--md-sys-color-on-surface-variant)] truncate max-w-xs">
                  In: <span className="font-semibold">{folderName}</span>
                </p>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center text-[var(--md-sys-color-on-surface-variant)] hover:bg-[var(--md-sys-color-surface-container-high)] border-none bg-transparent cursor-pointer"
          >
            <X className="w-4.5 h-4.5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4 max-h-[75vh] overflow-y-auto">
          <div>
            <label className="block text-xs font-bold text-[var(--md-sys-color-on-surface)] mb-1.5">
              Lecture Title <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              required
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Lecture 01: Concept Overview & 1D Kinematics"
              className="w-full px-3.5 py-2.5 rounded-2xl bg-[var(--md-sys-color-surface-container)] border border-[var(--md-sys-color-outline-variant)]/40 text-xs sm:text-sm text-[var(--md-sys-color-on-surface)] focus:outline-hidden focus:border-[var(--md-sys-color-primary)] transition"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-[var(--md-sys-color-on-surface)] mb-1.5">
              Video Source (YouTube / Vimeo / Direct URL) <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              required
              value={videoUrl}
              onChange={(e) => setVideoUrl(e.target.value)}
              placeholder="https://www.youtube.com/watch?v=... or YouTube Video ID"
              className="w-full px-3.5 py-2.5 rounded-2xl bg-[var(--md-sys-color-surface-container)] border border-[var(--md-sys-color-outline-variant)]/40 text-xs sm:text-sm text-[var(--md-sys-color-on-surface)] focus:outline-hidden focus:border-[var(--md-sys-color-primary)] transition font-mono"
            />
            <p className="text-[10px] text-[var(--md-sys-color-on-surface-variant)] mt-1">
              Supports full YouTube links (including unlisted), Vimeo, or direct video URLs. Obfuscated automatically.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-[var(--md-sys-color-on-surface)] mb-1.5 flex items-center space-x-1">
                <Clock className="w-3.5 h-3.5 text-slate-400" />
                <span>Duration (Minutes)</span>
              </label>
              <input
                type="number"
                min={1}
                max={600}
                value={durationMinutes}
                onChange={(e) => setDurationMinutes(Number(e.target.value))}
                className="w-full px-3.5 py-2.5 rounded-2xl bg-[var(--md-sys-color-surface-container)] border border-[var(--md-sys-color-outline-variant)]/40 text-xs sm:text-sm text-[var(--md-sys-color-on-surface)] focus:outline-hidden focus:border-[var(--md-sys-color-primary)] transition"
              />
            </div>

            <div className="flex items-center space-x-2 pt-6">
              <label className="flex items-center space-x-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={isFreePreview}
                  onChange={(e) => setIsFreePreview(e.target.checked)}
                  className="w-4 h-4 rounded text-indigo-600 focus:ring-0 cursor-pointer"
                />
                <span className="text-xs font-bold text-[var(--md-sys-color-on-surface)] flex items-center space-x-1">
                  <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                  <span>Free Preview for Guests</span>
                </span>
              </label>
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-[var(--md-sys-color-on-surface)] mb-1.5">
              Description (Optional)
            </label>
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Key concepts covered, milestones, or homework instructions..."
              className="w-full px-3.5 py-2.5 rounded-2xl bg-[var(--md-sys-color-surface-container)] border border-[var(--md-sys-color-outline-variant)]/40 text-xs text-[var(--md-sys-color-on-surface)] focus:outline-hidden focus:border-[var(--md-sys-color-primary)] transition resize-none"
            />
          </div>

          <div className="p-3.5 rounded-2xl bg-[var(--md-sys-color-surface-container-low)] space-y-2 border border-[var(--md-sys-color-outline-variant)]/20">
            <span className="text-xs font-bold text-[var(--md-sys-color-on-surface)] flex items-center space-x-1.5">
              <FileText className="w-3.5 h-3.5 text-emerald-600" />
              <span>Attach PDF Notes / DPP (Optional)</span>
            </span>
            <input
              type="text"
              value={pdfNoteTitle}
              onChange={(e) => setPdfNoteTitle(e.target.value)}
              placeholder="e.g. Class Handwritten DPP Notes"
              className="w-full px-3 py-2 rounded-xl bg-[var(--md-sys-color-surface-container)] border border-[var(--md-sys-color-outline-variant)]/40 text-xs text-[var(--md-sys-color-on-surface)]"
            />
            <input
              type="url"
              value={pdfNoteUrl}
              onChange={(e) => setPdfNoteUrl(e.target.value)}
              placeholder="https://drive.google.com/... or Direct PDF Link"
              className="w-full px-3 py-2 rounded-xl bg-[var(--md-sys-color-surface-container)] border border-[var(--md-sys-color-outline-variant)]/40 text-xs text-[var(--md-sys-color-on-surface)] font-mono"
            />
          </div>

          <div className="flex items-center justify-end space-x-2 pt-2 border-t border-[var(--md-sys-color-outline-variant)]/15">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-bold rounded-full text-[var(--md-sys-color-on-surface-variant)] hover:bg-[var(--md-sys-color-surface-container)] border-none bg-transparent cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!title.trim() || !videoUrl.trim()}
              className="px-5 py-2 text-xs font-bold rounded-full bg-indigo-600 hover:bg-indigo-700 text-white disabled:opacity-50 border-none cursor-pointer shadow-xs"
            >
              {initialData ? 'Save Lecture' : 'Add Lecture'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

/* =========================================================================
   3. ADD OR EDIT PDF NOTE MODAL
   ========================================================================= */
interface AddOrEditNoteModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: { title: string; fileUrl: string; sizeBytes?: number }) => void;
  initialData?: Partial<PdfNote> | null;
  folderName?: string;
}

export const AddOrEditNoteModal: React.FC<AddOrEditNoteModalProps> = ({
  isOpen,
  onClose,
  onSave,
  initialData,
  folderName,
}) => {
  const [title, setTitle] = useState('');
  const [fileUrl, setFileUrl] = useState('');
  const isInitializedRef = useRef(false);
  const activeNoteIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      const currentId = initialData?.id || '__new_note__';
      if (!isInitializedRef.current || activeNoteIdRef.current !== currentId) {
        isInitializedRef.current = true;
        activeNoteIdRef.current = currentId;
        if (initialData) {
          setTitle(initialData.title || '');
          setFileUrl(initialData.fileUrl || initialData.url || '');
        } else {
          setTitle('');
          setFileUrl('');
        }
      }
    } else {
      isInitializedRef.current = false;
      activeNoteIdRef.current = null;
    }
  }, [isOpen, initialData?.id]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !fileUrl.trim()) return;
    onSave({ title: title.trim(), fileUrl: fileUrl.trim() });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-fade-in">
      <div 
        className="w-full max-w-md bg-white dark:bg-[#1e2024] rounded-3xl shadow-2xl border border-[var(--md-sys-color-outline-variant)]/20 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-5 border-b border-[var(--md-sys-color-outline-variant)]/15">
          <div className="flex items-center space-x-2.5">
            <div className="w-9 h-9 rounded-2xl bg-emerald-600 text-white flex items-center justify-center shadow-xs">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-[var(--md-sys-color-on-surface)]">
                {initialData ? 'Edit PDF Note' : 'Add PDF Note / Document'}
              </h3>
              {folderName && (
                <p className="text-[11px] text-[var(--md-sys-color-on-surface-variant)] truncate max-w-xs">
                  In: <span className="font-semibold">{folderName}</span>
                </p>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center text-[var(--md-sys-color-on-surface-variant)] hover:bg-[var(--md-sys-color-surface-container-high)] border-none bg-transparent cursor-pointer"
          >
            <X className="w-4.5 h-4.5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="block text-xs font-bold text-[var(--md-sys-color-on-surface)] mb-1.5">
              Document Title <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              required
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Formula Sheet & Cheat Sheet"
              className="w-full px-3.5 py-2.5 rounded-2xl bg-[var(--md-sys-color-surface-container)] border border-[var(--md-sys-color-outline-variant)]/40 text-xs sm:text-sm text-[var(--md-sys-color-on-surface)] focus:outline-hidden focus:border-[var(--md-sys-color-primary)] transition"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-[var(--md-sys-color-on-surface)] mb-1.5">
              PDF Document Link (Google Drive / Direct URL) <span className="text-rose-500">*</span>
            </label>
            <input
              type="url"
              required
              value={fileUrl}
              onChange={(e) => setFileUrl(e.target.value)}
              placeholder="https://drive.google.com/file/d/... or Direct PDF link"
              className="w-full px-3.5 py-2.5 rounded-2xl bg-[var(--md-sys-color-surface-container)] border border-[var(--md-sys-color-outline-variant)]/40 text-xs sm:text-sm text-[var(--md-sys-color-on-surface)] focus:outline-hidden focus:border-[var(--md-sys-color-primary)] transition font-mono"
            />
            <p className="text-[10px] text-[var(--md-sys-color-on-surface-variant)] mt-1">
              Supports Google Drive share links, preview links, or secure HTTPS PDF URLs.
            </p>
          </div>

          <div className="flex items-center justify-end space-x-2 pt-2 border-t border-[var(--md-sys-color-outline-variant)]/15">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-bold rounded-full text-[var(--md-sys-color-on-surface-variant)] hover:bg-[var(--md-sys-color-surface-container)] border-none bg-transparent cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!title.trim() || !fileUrl.trim()}
              className="px-5 py-2 text-xs font-bold rounded-full bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-50 border-none cursor-pointer shadow-xs"
            >
              {initialData ? 'Save Note' : 'Add Note'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

/* =========================================================================
   4. LINK MOCK TESTS MODAL
   ========================================================================= */
interface LinkTestModalProps {
  isOpen: boolean;
  onClose: () => void;
  availableTests: MathTest[];
  linkedTestIds: string[];
  onToggleTest: (testId: string) => void;
  folderName?: string;
}

export const LinkTestModal: React.FC<LinkTestModalProps> = ({
  isOpen,
  onClose,
  availableTests,
  linkedTestIds,
  onToggleTest,
  folderName,
}) => {
  const [search, setSearch] = useState('');

  if (!isOpen) return null;

  const filteredTests = availableTests.filter((t) =>
    (t.title || '').toLowerCase().includes(search.toLowerCase()) ||
    (t.topic || '').toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-fade-in">
      <div 
        className="w-full max-w-lg bg-white dark:bg-[#1e2024] rounded-3xl shadow-2xl border border-[var(--md-sys-color-outline-variant)]/20 overflow-hidden flex flex-col max-h-[80vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-5 border-b border-[var(--md-sys-color-outline-variant)]/15 shrink-0">
          <div className="flex items-center space-x-2.5">
            <div className="w-9 h-9 rounded-2xl bg-amber-500 text-white flex items-center justify-center shadow-xs">
              <Award className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-[var(--md-sys-color-on-surface)]">
                Link Mock Tests
              </h3>
              {folderName && (
                <p className="text-[11px] text-[var(--md-sys-color-on-surface-variant)] truncate max-w-xs">
                  Folder: <span className="font-semibold">{folderName}</span>
                </p>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center text-[var(--md-sys-color-on-surface-variant)] hover:bg-[var(--md-sys-color-surface-container-high)] border-none bg-transparent cursor-pointer"
          >
            <X className="w-4.5 h-4.5" />
          </button>
        </div>

        {/* Search */}
        <div className="p-4 border-b border-[var(--md-sys-color-outline-variant)]/15 shrink-0">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search mock tests by title or topic..."
              className="w-full pl-9 pr-3.5 py-2 rounded-2xl bg-[var(--md-sys-color-surface-container)] border border-[var(--md-sys-color-outline-variant)]/30 text-xs text-[var(--md-sys-color-on-surface)] focus:outline-hidden"
            />
          </div>
        </div>

        {/* Test List */}
        <div className="p-4 overflow-y-auto space-y-2 flex-1">
          {filteredTests.length === 0 ? (
            <div className="text-center py-8 text-xs text-[var(--md-sys-color-on-surface-variant)]">
              No matching tests found.
            </div>
          ) : (
            filteredTests.map((t) => {
              const isLinked = linkedTestIds.includes(t.id);
              return (
                <div
                  key={t.id}
                  onClick={() => onToggleTest(t.id)}
                  className={`p-3 rounded-2xl border cursor-pointer transition flex items-center justify-between gap-3 ${
                    isLinked
                      ? 'bg-amber-500/10 border-amber-500/40 text-[var(--md-sys-color-on-surface)]'
                      : 'bg-[var(--md-sys-color-surface-container)] border-transparent hover:bg-[var(--md-sys-color-surface-container-high)] text-[var(--md-sys-color-on-surface)]'
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-bold truncate">{t.title}</p>
                    <p className="text-[10px] text-[var(--md-sys-color-on-surface-variant)]">
                      {t.questions?.length || 0} Questions • {t.timeLimitMinutes || 25} Mins • {t.difficulty || 'Medium'}
                    </p>
                  </div>
                  <div
                    className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 transition ${
                      isLinked ? 'bg-amber-500 text-white shadow-xs' : 'border border-slate-300 dark:border-zinc-600'
                    }`}
                  >
                    {isLinked && <Check className="w-3.5 h-3.5" />}
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div className="p-4 border-t border-[var(--md-sys-color-outline-variant)]/15 flex items-center justify-between shrink-0">
          <span className="text-xs text-[var(--md-sys-color-on-surface-variant)] font-semibold">
            {linkedTestIds.length} Tests Linked
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 text-xs font-bold rounded-full bg-[var(--md-sys-color-primary)] text-[var(--md-sys-color-on-primary)] border-none cursor-pointer shadow-xs"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};

/* =========================================================================
   5. CONFIRM DELETE MODAL
   ========================================================================= */
interface ConfirmDeleteModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
}

export const ConfirmDeleteModal: React.FC<ConfirmDeleteModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-fade-in">
      <div 
        className="w-full max-w-sm bg-white dark:bg-[#1e2024] rounded-3xl shadow-2xl border border-[var(--md-sys-color-outline-variant)]/20 p-5 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="w-11 h-11 rounded-2xl bg-rose-500/15 text-rose-600 dark:text-rose-400 flex items-center justify-center">
          <AlertTriangle className="w-6 h-6" />
        </div>
        <div>
          <h3 className="text-base font-bold text-[var(--md-sys-color-on-surface)]">
            {title}
          </h3>
          <p className="text-xs text-[var(--md-sys-color-on-surface-variant)] mt-1 leading-relaxed">
            {message}
          </p>
        </div>
        <div className="flex items-center justify-end space-x-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-bold rounded-full text-[var(--md-sys-color-on-surface-variant)] hover:bg-[var(--md-sys-color-surface-container)] border-none bg-transparent cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => {
              onConfirm();
              onClose();
            }}
            className="px-5 py-2 text-xs font-bold rounded-full bg-rose-600 hover:bg-rose-700 text-white border-none cursor-pointer shadow-xs"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
};
