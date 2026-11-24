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
  Search,
  Loader2,
} from 'lucide-react';
import type { Lecture, PdfNote } from '../../../lms/types';
import type { MathTest } from '../../../types';
import { extractYouTubeId, obfuscateVideoKey } from '../../../lms/security';
import { fetchVideoMetadata, extractYouTubeVideoId, type VideoMetadata } from '../../../lms/videoMetadataService';
import { fetchDocumentMetadata } from '../../../lms/documentMetadataService';
import { SyncedVideoPreviewCard } from './SyncedVideoPreviewCard';
import { M3Switch, M3CircularProgress } from '../../ui/Material3';
import { getTestDurationMinutes } from '../../../utils/testFormatConverter';
import { BatchThumbnailPicker, DEFAULT_HIGH_RES_BANNER } from './BatchThumbnailPicker';

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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/20 dark:bg-black/60 backdrop-blur-md animate-fade-in">
      <div 
        className="w-full max-w-md bg-white/95 dark:bg-[#121316]/95 backdrop-blur-2xl rounded-3xl shadow-[0_20px_50px_rgba(0,0,0,0.08),0_6px_20px_rgba(0,0,0,0.04)] dark:shadow-[0_25px_60px_rgba(0,0,0,0.65)] border border-slate-100 dark:border-white/10 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 sm:p-5 border-b border-slate-100 dark:border-zinc-800 bg-white/80 dark:bg-[#121316]/80 backdrop-blur-md">
          <div className="flex items-center space-x-2.5">
            <div 
              className="w-10 h-10 rounded-full flex items-center justify-center text-white shadow-2xs shrink-0"
              style={{ backgroundColor: color }}
            >
              <FolderPlus className="w-5 h-5 stroke-[2.2]" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-zinc-100">
                {isEdit ? 'Edit Folder' : 'New Subfolder'}
              </h3>
              {parentFolderName && !isEdit && (
                <p className="text-[11px] text-slate-700 dark:text-zinc-300 font-medium truncate max-w-xs">
                  Inside: <span className="font-bold">{parentFolderName}</span>
                </p>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center text-slate-700 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-800 transition active:scale-95 border-none bg-transparent cursor-pointer"
          >
            <X className="w-4.5 h-4.5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 sm:p-5 space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-800 dark:text-zinc-200 mb-1.5">
              Folder Name <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              required
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Chapter 01: Kinematics"
              className="w-full px-3.5 py-2.5 rounded-2xl bg-slate-50/70 hover:bg-slate-50 focus:bg-white dark:bg-zinc-900/40 dark:focus:bg-zinc-900/80 border border-slate-200/80 focus:border-[#0b57d0] dark:border-zinc-700/60 dark:focus:border-[#a8c7fa] text-xs sm:text-sm text-slate-900 dark:text-zinc-100 placeholder:text-slate-500 dark:placeholder:text-zinc-500 focus:outline-hidden backdrop-blur-xs transition font-medium"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-800 dark:text-zinc-200 mb-1.5">
              Description (Optional)
            </label>
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief summary of lectures, notes or tests inside this folder..."
              className="w-full px-3.5 py-2.5 rounded-2xl bg-slate-50/70 hover:bg-slate-50 focus:bg-white dark:bg-zinc-900/40 dark:focus:bg-zinc-900/80 border border-slate-200/80 focus:border-[#0b57d0] dark:border-zinc-700/60 dark:focus:border-[#a8c7fa] text-xs text-slate-900 dark:text-zinc-100 placeholder:text-slate-500 dark:placeholder:text-zinc-500 focus:outline-hidden backdrop-blur-xs transition resize-none font-medium"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-800 dark:text-zinc-200 mb-2">
              Color Tag
            </label>
            <div className="p-2.5 rounded-2xl bg-white/70 dark:bg-zinc-900/40 backdrop-blur-xs border border-slate-100 dark:border-zinc-800 flex items-center gap-2 flex-wrap">
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

          <div className="flex items-center justify-end space-x-2 pt-3 border-t border-slate-100 dark:border-zinc-800">
            <button
              type="button"
              onClick={onClose}
              className="h-9 px-4 text-xs font-bold rounded-full bg-slate-100/80 hover:bg-slate-200/80 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-slate-700 dark:text-zinc-200 border-none cursor-pointer transition active:scale-95"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!title.trim()}
              className="h-9 px-5 text-xs font-bold rounded-full bg-[#0b57d0] hover:bg-[#0842a0] dark:bg-[#a8c7fa] dark:hover:bg-[#d3e3fd] text-white dark:text-[#041e49] disabled:opacity-50 border-none cursor-pointer shadow-xs transition active:scale-95"
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
    thumbnailUrl?: string;
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
  const [videoMeta, setVideoMeta] = useState<VideoMetadata | null>(null);
  const isInitializedRef = useRef(false);
  const activeVideoIdRef = useRef<string | null>(null);
  const [isAutoFetching, setIsAutoFetching] = useState(false);
  const lastFetchedIdRef = useRef<string | null>(null);

  const handleVideoUrlChange = async (url: string, force = false) => {
    setVideoUrl(url);
    const ytId = extractYouTubeVideoId(url);
    if (!ytId) {
      lastFetchedIdRef.current = null;
      setVideoMeta(null);
      return;
    }
    if (!force && ytId === lastFetchedIdRef.current) return;
    lastFetchedIdRef.current = ytId;
    setIsAutoFetching(true);
    try {
      const meta = await fetchVideoMetadata(ytId, force);
      if (meta) {
        setVideoMeta(meta);
        // Auto-generate title & duration, which the user can edit anytime
        if (meta.title && meta.title !== 'Lecture Video') {
          setTitle(meta.title);
        }
        if (meta.durationMinutes && meta.durationMinutes > 0) {
          setDurationMinutes(meta.durationMinutes);
        }
      }
    } catch (err) {
      console.warn('Auto metadata fetch error:', err);
    } finally {
      setIsAutoFetching(false);
    }
  };

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
          const existingYtId = extractYouTubeVideoId(initialData.encryptedVideoId || '');
          if (existingYtId) {
            fetchVideoMetadata(existingYtId).then((meta) => {
              if (meta) setVideoMeta(meta);
            }).catch(() => {});
          } else {
            setVideoMeta(null);
          }
        } else {
          lastFetchedIdRef.current = null;
          setVideoMeta(null);
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
    const rawYtId = extractYouTubeVideoId(videoUrl);
    const resolvedThumb = videoMeta?.thumbnailUrl || (rawYtId ? `https://i.ytimg.com/vi/${rawYtId}/hqdefault.jpg` : undefined);
    onSave({
      title: title.trim(),
      description: description.trim(),
      videoUrl: videoUrl.trim(),
      durationMinutes: Number(durationMinutes) || 15,
      isFreePreview,
      pdfNoteTitle: pdfNoteTitle.trim() || undefined,
      pdfNoteUrl: pdfNoteUrl.trim() || undefined,
      thumbnailUrl: resolvedThumb,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/20 dark:bg-black/60 backdrop-blur-md animate-fade-in">
      <div 
        className="w-full max-w-lg bg-white/95 dark:bg-[#121316]/95 backdrop-blur-2xl rounded-3xl shadow-[0_20px_50px_rgba(0,0,0,0.08),0_6px_20px_rgba(0,0,0,0.04)] dark:shadow-[0_25px_60px_rgba(0,0,0,0.65)] border border-slate-100 dark:border-white/10 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 sm:p-5 border-b border-slate-100 dark:border-zinc-800 bg-white/80 dark:bg-[#121316]/80 backdrop-blur-md">
          <div className="flex items-center space-x-2.5">
            <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-950/70 text-[#0b57d0] dark:text-[#a8c7fa] flex items-center justify-center shadow-2xs shrink-0">
              <Video className="w-5 h-5 stroke-[2.2]" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-zinc-100">
                {initialData ? 'Edit Video Lecture' : 'Add Video Lecture'}
              </h3>
              {folderName && (
                <p className="text-[11px] text-slate-700 dark:text-zinc-300 font-medium truncate max-w-xs">
                  In: <span className="font-bold">{folderName}</span>
                </p>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center text-slate-700 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-800 transition active:scale-95 border-none bg-transparent cursor-pointer"
          >
            <X className="w-4.5 h-4.5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 sm:p-5 space-y-4 max-h-[75vh] overflow-y-auto">
          <div>
            <label className="block text-xs font-bold text-slate-800 dark:text-zinc-200 mb-1.5">
              Lecture Title <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              required
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Lecture 01: Concept Overview & 1D Kinematics"
              className="w-full px-3.5 py-2.5 rounded-2xl bg-slate-50/70 hover:bg-slate-50 focus:bg-white dark:bg-zinc-900/40 dark:focus:bg-zinc-900/80 border border-slate-200/80 focus:border-[#0b57d0] dark:border-zinc-700/60 dark:focus:border-[#a8c7fa] text-xs sm:text-sm text-slate-900 dark:text-zinc-100 placeholder:text-slate-500 dark:placeholder:text-zinc-500 focus:outline-hidden backdrop-blur-xs transition font-medium"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-xs font-bold text-slate-800 dark:text-zinc-200">
                Video Source (YouTube / Vimeo / Direct URL) <span className="text-rose-500">*</span>
              </label>
              {isAutoFetching && (
                <span className="text-[11px] text-[#0b57d0] dark:text-[#a8c7fa] font-semibold flex items-center gap-1.5 animate-pulse">
                  <M3CircularProgress size={12} fourColor={true} />
                  <span>Auto-generating title & timing...</span>
                </span>
              )}
            </div>
            <input
              type="text"
              required
              value={videoUrl}
              onChange={(e) => handleVideoUrlChange(e.target.value)}
              onPaste={(e) => {
                const pasted = e.clipboardData.getData('text');
                if (pasted) {
                  handleVideoUrlChange(pasted, true);
                }
              }}
              placeholder="https://www.youtube.com/watch?v=... or YouTube Video ID"
              className="w-full px-3.5 py-2.5 rounded-2xl bg-slate-50/70 hover:bg-slate-50 focus:bg-white dark:bg-zinc-900/40 dark:focus:bg-zinc-900/80 border border-slate-200/80 focus:border-[#0b57d0] dark:border-zinc-700/60 dark:focus:border-[#a8c7fa] text-xs sm:text-sm text-slate-900 dark:text-zinc-100 placeholder:text-slate-500 dark:placeholder:text-zinc-500 focus:outline-hidden backdrop-blur-xs transition font-medium"
            />
            <p className="text-[11px] text-slate-700 dark:text-zinc-300 font-medium mt-1">
              Supports full YouTube links (including unlisted), Vimeo, or direct video URLs. Obfuscated automatically.
            </p>

            {/* Live YouTube Synced Details & Thumbnail Preview */}
            {extractYouTubeVideoId(videoUrl) && (
              <div className="mt-3">
                <SyncedVideoPreviewCard
                  videoId={extractYouTubeVideoId(videoUrl)}
                  metadata={videoMeta}
                  isLoading={isAutoFetching}
                  onRefresh={() => handleVideoUrlChange(videoUrl, true)}
                />
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-800 dark:text-zinc-200 mb-1.5 flex items-center space-x-1">
                <Clock className="w-3.5 h-3.5 text-slate-600 dark:text-zinc-400" />
                <span>Duration (Minutes)</span>
              </label>
              <input
                type="number"
                min={1}
                max={600}
                value={durationMinutes}
                onChange={(e) => setDurationMinutes(Number(e.target.value))}
                className="w-full px-3.5 py-2.5 rounded-2xl bg-slate-50/70 hover:bg-slate-50 focus:bg-white dark:bg-zinc-900/40 dark:focus:bg-zinc-900/80 border border-slate-200/80 focus:border-[#0b57d0] dark:border-zinc-700/60 dark:focus:border-[#a8c7fa] text-xs sm:text-sm text-slate-900 dark:text-zinc-100 focus:outline-hidden backdrop-blur-xs transition tabular-nums font-bold"
              />
            </div>

            <div className="flex items-center justify-between p-3 rounded-2xl bg-white/70 dark:bg-zinc-900/40 backdrop-blur-xs border border-slate-100/90 dark:border-zinc-800/60">
              <div>
                <span className="text-xs font-bold text-slate-800 dark:text-zinc-200 flex items-center space-x-1">
                  <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                  <span>Free Preview</span>
                </span>
                <span className="text-[10.5px] text-slate-700 dark:text-zinc-300 font-medium block">
                  Allow guests to view
                </span>
              </div>
              <M3Switch
                checked={isFreePreview}
                onChange={setIsFreePreview}
                aria-label="Free Preview for Guests"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-800 dark:text-zinc-200 mb-1.5">
              Description (Optional)
            </label>
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Key concepts covered, milestones, or homework instructions..."
              className="w-full px-3.5 py-2.5 rounded-2xl bg-slate-50/70 hover:bg-slate-50 focus:bg-white dark:bg-zinc-900/40 dark:focus:bg-zinc-900/80 border border-slate-200/80 focus:border-[#0b57d0] dark:border-zinc-700/60 dark:focus:border-[#a8c7fa] text-xs text-slate-900 dark:text-zinc-100 placeholder:text-slate-500 dark:placeholder:text-zinc-500 focus:outline-hidden backdrop-blur-xs transition resize-none font-medium"
            />
          </div>

          <div className="p-3.5 rounded-2xl bg-white/70 dark:bg-zinc-900/40 space-y-2 border border-slate-100/90 dark:border-zinc-800/60 backdrop-blur-xs">
            <span className="text-xs font-bold text-slate-800 dark:text-zinc-200 flex items-center space-x-1.5">
              <FileText className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
              <span>Attach PDF Notes / DPP (Optional)</span>
            </span>
            <input
              type="text"
              value={pdfNoteTitle}
              onChange={(e) => setPdfNoteTitle(e.target.value)}
              placeholder="e.g. Class Handwritten DPP Notes"
              className="w-full px-3 py-2 rounded-xl bg-slate-50/70 hover:bg-slate-50 focus:bg-white dark:bg-zinc-900/40 border border-slate-200/80 dark:border-zinc-700/60 text-xs text-slate-900 dark:text-zinc-100 placeholder:text-slate-500 dark:placeholder:text-zinc-500 font-medium outline-hidden"
            />
            <input
              type="url"
              value={pdfNoteUrl}
              onChange={(e) => {
                const nextUrl = e.target.value;
                setPdfNoteUrl(nextUrl);
                if (nextUrl.trim().startsWith('http') && !pdfNoteTitle.trim()) {
                  fetchDocumentMetadata(nextUrl).then((meta) => {
                    if (meta?.title) {
                      setPdfNoteTitle((prev) => prev.trim() ? prev : meta.title);
                    }
                  }).catch(() => {});
                }
              }}
              placeholder="https://drive.google.com/... or Direct PDF Link"
              className="w-full px-3 py-2 rounded-xl bg-slate-50/70 hover:bg-slate-50 focus:bg-white dark:bg-zinc-900/40 border border-slate-200/80 dark:border-zinc-700/60 text-xs text-slate-900 dark:text-zinc-100 placeholder:text-slate-500 dark:placeholder:text-zinc-500 font-medium outline-hidden"
            />
          </div>

          <div className="flex items-center justify-end space-x-2 pt-3 border-t border-slate-100 dark:border-zinc-800">
            <button
              type="button"
              onClick={onClose}
              className="h-9 px-4 text-xs font-bold rounded-full bg-slate-100/80 hover:bg-slate-200/80 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-slate-700 dark:text-zinc-200 border-none cursor-pointer transition active:scale-95"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!title.trim() || !videoUrl.trim()}
              className="h-9 px-5 text-xs font-bold rounded-full bg-[#0b57d0] hover:bg-[#0842a0] dark:bg-[#a8c7fa] dark:hover:bg-[#d3e3fd] text-white dark:text-[#041e49] disabled:opacity-50 border-none cursor-pointer shadow-xs transition active:scale-95"
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
  const [isAutoFetchingTitle, setIsAutoFetchingTitle] = useState(false);
  const isInitializedRef = useRef(false);
  const activeNoteIdRef = useRef<string | null>(null);
  const lastFetchedUrlRef = useRef<string>('');

  const handleFileUrlChange = async (nextUrl: string) => {
    setFileUrl(nextUrl);
    const trimmed = nextUrl.trim();
    if (!trimmed || !/^https?:\/\//i.test(trimmed)) return;
    if (trimmed === lastFetchedUrlRef.current) return;
    lastFetchedUrlRef.current = trimmed;

    setIsAutoFetchingTitle(true);
    try {
      const meta = await fetchDocumentMetadata(trimmed);
      if (meta?.title) {
        setTitle((prev) => (prev.trim() ? prev : meta.title));
      }
    } catch {
      // Ignore auto-title errors
    } finally {
      setIsAutoFetchingTitle(false);
    }
  };

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
          lastFetchedUrlRef.current = '';
          setTitle('');
          setFileUrl('');
        }
      }
    } else {
      isInitializedRef.current = false;
      activeNoteIdRef.current = null;
      lastFetchedUrlRef.current = '';
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/20 dark:bg-black/60 backdrop-blur-md animate-fade-in">
      <div 
        className="w-full max-w-md bg-white/95 dark:bg-[#121316]/95 backdrop-blur-2xl rounded-3xl shadow-[0_20px_50px_rgba(0,0,0,0.08),0_6px_20px_rgba(0,0,0,0.04)] dark:shadow-[0_25px_60px_rgba(0,0,0,0.65)] border border-slate-100 dark:border-white/10 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 sm:p-5 border-b border-slate-100 dark:border-zinc-800 bg-white/80 dark:bg-[#121316]/80 backdrop-blur-md">
          <div className="flex items-center space-x-2.5">
            <div className="w-10 h-10 rounded-full bg-emerald-100 dark:bg-emerald-950/70 text-emerald-700 dark:text-emerald-300 flex items-center justify-center shadow-2xs shrink-0">
              <FileText className="w-5 h-5 stroke-[2.2]" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-zinc-100">
                {initialData ? 'Edit PDF Note' : 'Add PDF Note / Document'}
              </h3>
              {folderName && (
                <p className="text-[11px] text-slate-700 dark:text-zinc-300 font-medium truncate max-w-xs">
                  In: <span className="font-bold">{folderName}</span>
                </p>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center text-slate-700 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-800 transition active:scale-95 border-none bg-transparent cursor-pointer"
          >
            <X className="w-4.5 h-4.5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 sm:p-5 space-y-4">
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-xs font-bold text-slate-800 dark:text-zinc-200">
                Document Title <span className="text-rose-500">*</span>
              </label>
              {isAutoFetchingTitle && (
                <span className="inline-flex items-center gap-1 text-[10px] font-bold text-[#0b57d0] dark:text-[#a8c7fa]">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  <span>Auto-detecting title...</span>
                </span>
              )}
            </div>
            <input
              type="text"
              required
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Formula Sheet & Cheat Sheet (auto-fills from link)"
              className="w-full px-3.5 py-2.5 rounded-2xl bg-slate-50/70 hover:bg-slate-50 focus:bg-white dark:bg-zinc-900/40 dark:focus:bg-zinc-900/80 border border-slate-200/80 focus:border-[#0b57d0] dark:border-zinc-700/60 dark:focus:border-[#a8c7fa] text-xs sm:text-sm text-slate-900 dark:text-zinc-100 placeholder:text-slate-500 dark:placeholder:text-zinc-500 focus:outline-hidden backdrop-blur-xs transition font-medium"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-800 dark:text-zinc-200 mb-1.5">
              Document / Note Link (Google Drive / YouTube / Direct URL) <span className="text-rose-500">*</span>
            </label>
            <input
              type="url"
              required
              value={fileUrl}
              onChange={(e) => handleFileUrlChange(e.target.value)}
              placeholder="https://drive.google.com/file/d/... or Direct URL"
              className="w-full px-3.5 py-2.5 rounded-2xl bg-slate-50/70 hover:bg-slate-50 focus:bg-white dark:bg-zinc-900/40 dark:focus:bg-zinc-900/80 border border-slate-200/80 focus:border-[#0b57d0] dark:border-zinc-700/60 dark:focus:border-[#a8c7fa] text-xs sm:text-sm text-slate-900 dark:text-zinc-100 placeholder:text-slate-500 dark:placeholder:text-zinc-500 focus:outline-hidden backdrop-blur-xs transition font-medium"
            />
            <p className="text-[11px] text-slate-700 dark:text-zinc-300 font-medium mt-1">
              Supports Google Drive share links, preview links, YouTube links, or HTTPS PDF URLs.
            </p>
          </div>

          <div className="flex items-center justify-end space-x-2 pt-3 border-t border-slate-100 dark:border-zinc-800">
            <button
              type="button"
              onClick={onClose}
              className="h-9 px-4 text-xs font-bold rounded-full bg-slate-100/80 hover:bg-slate-200/80 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-slate-700 dark:text-zinc-200 border-none cursor-pointer transition active:scale-95"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!title.trim() || !fileUrl.trim()}
              className="h-9 px-5 text-xs font-bold rounded-full bg-[#0b57d0] hover:bg-[#0842a0] dark:bg-[#a8c7fa] dark:hover:bg-[#d3e3fd] text-white dark:text-[#041e49] disabled:opacity-50 border-none cursor-pointer shadow-xs transition active:scale-95"
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/20 dark:bg-black/60 backdrop-blur-md animate-fade-in">
      <div 
        className="w-full max-w-lg bg-white/95 dark:bg-[#121316]/95 backdrop-blur-2xl rounded-3xl shadow-[0_20px_50px_rgba(0,0,0,0.08),0_6px_20px_rgba(0,0,0,0.04)] dark:shadow-[0_25px_60px_rgba(0,0,0,0.65)] border border-slate-100 dark:border-white/10 overflow-hidden flex flex-col max-h-[85vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 sm:p-5 border-b border-slate-100 dark:border-zinc-800 bg-white/80 dark:bg-[#121316]/80 backdrop-blur-md shrink-0">
          <div className="flex items-center space-x-2.5">
            <div className="w-10 h-10 rounded-full bg-amber-100 dark:bg-amber-950/70 text-amber-700 dark:text-amber-300 flex items-center justify-center shadow-2xs shrink-0">
              <Award className="w-5 h-5 stroke-[2.2]" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-zinc-100">
                Link Mock Tests
              </h3>
              {folderName && (
                <p className="text-[11px] text-slate-700 dark:text-zinc-300 font-medium truncate max-w-xs">
                  Folder: <span className="font-bold">{folderName}</span>
                </p>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center text-slate-700 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-800 transition active:scale-95 border-none bg-transparent cursor-pointer"
          >
            <X className="w-4.5 h-4.5" />
          </button>
        </div>

        {/* Search */}
        <div className="p-3.5 sm:p-4 border-b border-slate-100 dark:border-zinc-800 bg-white/60 dark:bg-white/[0.01] shrink-0">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-600 dark:text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search mock tests by title or topic..."
              className="w-full pl-9 pr-3.5 py-2.5 rounded-2xl bg-slate-50/70 hover:bg-slate-50 focus:bg-white dark:bg-zinc-900/40 dark:focus:bg-zinc-900/80 border border-slate-200/80 focus:border-[#0b57d0] dark:border-zinc-700/60 dark:focus:border-[#a8c7fa] text-xs sm:text-sm text-slate-900 dark:text-zinc-100 placeholder:text-slate-500 dark:placeholder:text-zinc-500 focus:outline-hidden backdrop-blur-xs transition font-medium"
            />
          </div>
        </div>

        {/* Test List */}
        <div className="p-4 overflow-y-auto space-y-2 flex-1">
          {filteredTests.length === 0 ? (
            <div className="text-center py-8 text-xs text-slate-700 dark:text-zinc-300 font-medium">
              No matching tests found.
            </div>
          ) : (
            filteredTests.map((t) => {
              const isLinked = linkedTestIds.includes(t.id);
              return (
                <div
                  key={t.id}
                  onClick={() => onToggleTest(t.id)}
                  className={`p-3 rounded-2xl border cursor-pointer transition flex items-center justify-between gap-3 backdrop-blur-xs ${
                    isLinked
                      ? 'bg-amber-500/15 border-amber-500/40 text-slate-900 dark:text-zinc-100 shadow-2xs'
                      : 'bg-white/70 dark:bg-zinc-900/40 hover:bg-white dark:hover:bg-zinc-900/70 border-slate-100/90 dark:border-zinc-800/60 text-slate-900 dark:text-zinc-100'
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-bold truncate">{t.title}</p>
                    <p className="text-[11px] text-slate-700 dark:text-zinc-300 font-medium tabular-nums">
                      {t.questions?.length || 0} Questions • {getTestDurationMinutes(t)} Mins • {t.difficulty || 'Medium'}
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

        <div className="p-4 border-t border-slate-100 dark:border-zinc-800 bg-white/80 dark:bg-[#121316]/80 backdrop-blur-md flex items-center justify-between shrink-0">
          <span className="text-xs text-slate-800 dark:text-zinc-200 font-bold tabular-nums">
            {linkedTestIds.length} Tests Linked
          </span>
          <button
            type="button"
            onClick={onClose}
            className="h-9 px-5 text-xs font-bold rounded-full bg-[#0b57d0] hover:bg-[#0842a0] dark:bg-[#a8c7fa] dark:hover:bg-[#d3e3fd] text-white dark:text-[#041e49] border-none cursor-pointer shadow-xs transition active:scale-95"
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/20 dark:bg-black/60 backdrop-blur-md animate-fade-in">
      <div 
        className="w-full max-w-sm bg-white/95 dark:bg-[#121316]/95 backdrop-blur-2xl rounded-3xl shadow-[0_20px_50px_rgba(0,0,0,0.08),0_6px_20px_rgba(0,0,0,0.04)] dark:shadow-[0_25px_60px_rgba(0,0,0,0.65)] border border-slate-100 dark:border-white/10 p-5 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="w-11 h-11 rounded-2xl bg-rose-500/15 text-rose-600 dark:text-rose-400 flex items-center justify-center">
          <AlertTriangle className="w-6 h-6" />
        </div>
        <div>
          <h3 className="text-base font-bold text-slate-900 dark:text-zinc-100">
            {title}
          </h3>
          <p className="text-xs text-slate-700 dark:text-zinc-300 mt-1 leading-relaxed font-medium">
            {message}
          </p>
        </div>
        <div className="flex items-center justify-end space-x-2 pt-2 border-t border-slate-100 dark:border-zinc-800">
          <button
            type="button"
            onClick={onClose}
            className="h-9 px-4 text-xs font-bold rounded-full bg-slate-100/80 hover:bg-slate-200/80 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-slate-700 dark:text-zinc-200 border-none cursor-pointer transition active:scale-95"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => {
              onConfirm();
              onClose();
            }}
            className="h-9 px-5 text-xs font-bold rounded-full bg-rose-600 hover:bg-rose-700 text-white border-none cursor-pointer shadow-xs transition active:scale-95"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
};

/* =========================================================================
   6. CREATE BATCH MODAL
   ========================================================================= */
interface CreateBatchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (batch: {
    title: string;
    description: string;
    category: string;
    price: number;
    originalPrice: number;
    validityDays: number;
    allowGuestAccess: boolean;
    bannerUrl?: string;
    thumbnailUrl?: string;
  }) => void;
}

export const CreateBatchModal: React.FC<CreateBatchModalProps> = ({
  isOpen,
  onClose,
  onCreate,
}) => {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('Mathematics');
  const [price, setPrice] = useState(999);
  const [originalPrice, setOriginalPrice] = useState(1999);
  const [validityDays, setValidityDays] = useState(365);
  const [allowGuestAccess, setAllowGuestAccess] = useState(false);
  const [bannerUrl, setBannerUrl] = useState(DEFAULT_HIGH_RES_BANNER);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/20 dark:bg-black/60 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 animate-fade-in">
      <div className="bg-white/95 dark:bg-[#121316]/95 backdrop-blur-2xl rounded-3xl max-w-lg w-full p-5 sm:p-6 shadow-[0_20px_50px_rgba(0,0,0,0.08),0_6px_20px_rgba(0,0,0,0.04)] dark:shadow-[0_25px_60px_rgba(0,0,0,0.65)] border border-slate-100 dark:border-white/10 space-y-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-zinc-800">
          <div className="flex items-center space-x-2.5">
            <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-950/70 text-[#0b57d0] dark:text-[#a8c7fa] flex items-center justify-center shadow-2xs shrink-0">
              <Sparkles className="w-5 h-5 stroke-[2.2]" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-zinc-100">
                Create New Academic Course
              </h3>
              <p className="text-[11px] text-slate-700 dark:text-zinc-300 font-medium">
                Launch a course container for folders, lectures, and mock tests.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center text-slate-700 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-800 transition active:scale-95 border-none bg-transparent cursor-pointer"
          >
            <X className="w-4.5 h-4.5" />
          </button>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!title.trim()) return;
            onCreate({
              title: title.trim(),
              description: description.trim(),
              category: category.trim() || 'General',
              price: Number(price) || 0,
              originalPrice: Number(originalPrice) || 0,
              validityDays: Number(validityDays) || 365,
              allowGuestAccess,
              bannerUrl: bannerUrl.trim() || DEFAULT_HIGH_RES_BANNER,
              thumbnailUrl: bannerUrl.trim() || DEFAULT_HIGH_RES_BANNER,
            });
            onClose();
          }}
          className="space-y-3.5 text-xs"
        >
          <div>
            <label className="text-[11px] font-bold text-slate-800 dark:text-zinc-200 block mb-1">
              Course / Batch Title *
            </label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. JEE Target 2027: Complete Calculus"
              className="w-full p-2.5 rounded-xl bg-white/60 dark:bg-black/20 hover:bg-white/80 dark:hover:bg-black/30 focus:bg-white dark:focus:bg-black/40 border border-slate-200/70 dark:border-zinc-700/60 text-xs text-slate-900 dark:text-zinc-100 placeholder:text-slate-500 dark:placeholder:text-zinc-500 focus:outline-hidden focus:border-[#0b57d0] dark:focus:border-[#a8c7fa] backdrop-blur-xs transition font-bold"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] font-bold text-slate-800 dark:text-zinc-200 block mb-1">
                Category
              </label>
              <input
                type="text"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder="e.g. Mathematics"
                className="w-full p-2.5 rounded-xl bg-white/60 dark:bg-black/20 hover:bg-white/80 dark:hover:bg-black/30 focus:bg-white dark:focus:bg-black/40 border border-slate-200/70 dark:border-zinc-700/60 text-xs text-slate-900 dark:text-zinc-100 placeholder:text-slate-500 dark:placeholder:text-zinc-500 focus:outline-hidden focus:border-[#0b57d0] dark:focus:border-[#a8c7fa] backdrop-blur-xs transition font-medium"
              />
            </div>
            <div>
              <label className="text-[11px] font-bold text-slate-800 dark:text-zinc-200 block mb-1">
                Selling Price (₹)
              </label>
              <input
                type="number"
                value={price}
                onChange={(e) => setPrice(Number(e.target.value))}
                className="w-full p-2.5 rounded-xl bg-white/60 dark:bg-black/20 hover:bg-white/80 dark:hover:bg-black/30 focus:bg-white dark:focus:bg-black/40 border border-slate-200/70 dark:border-zinc-700/60 text-xs text-slate-900 dark:text-zinc-100 focus:outline-hidden focus:border-[#0b57d0] dark:focus:border-[#a8c7fa] backdrop-blur-xs transition tabular-nums font-bold"
              />
            </div>
          </div>

          <div>
            <label className="text-[11px] font-bold text-slate-800 dark:text-zinc-200 block mb-1">
              Description / Overview
            </label>
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Course description and coverage..."
              className="w-full p-2.5 rounded-xl bg-white/60 dark:bg-black/20 hover:bg-white/80 dark:hover:bg-black/30 focus:bg-white dark:focus:bg-black/40 border border-slate-200/70 dark:border-zinc-700/60 text-xs text-slate-900 dark:text-zinc-100 placeholder:text-slate-500 dark:placeholder:text-zinc-500 focus:outline-hidden focus:border-[#0b57d0] dark:focus:border-[#a8c7fa] backdrop-blur-xs transition resize-none font-medium"
            />
          </div>

          {/* High Quality Thumbnail & Course Banner with Live 16:9 Preview & Repair */}
          <div className="p-3.5 rounded-2xl bg-white/50 dark:bg-zinc-800/40 border border-slate-200/60 dark:border-zinc-700/50 backdrop-blur-xs">
            <BatchThumbnailPicker
              value={bannerUrl}
              onChange={setBannerUrl}
              previewTitle={title}
              previewCategory={category}
            />
          </div>

          <div className="flex items-center justify-between p-3 rounded-2xl bg-white/50 dark:bg-zinc-800/40 border border-slate-200/60 dark:border-zinc-700/50 backdrop-blur-xs">
            <div>
              <span className="text-xs font-bold text-slate-900 dark:text-zinc-100 block">
                Free Guest Mode Preview
              </span>
              <span className="text-[10px] text-slate-700 dark:text-zinc-300 font-medium">
                Allow visitors without accounts to explore preview videos.
              </span>
            </div>
            <M3Switch
              checked={allowGuestAccess}
              onChange={() => setAllowGuestAccess(!allowGuestAccess)}
            />
          </div>

          <div className="flex items-center justify-end space-x-2 pt-2 border-t border-slate-100 dark:border-zinc-800">
            <button
              type="button"
              onClick={onClose}
              className="h-9 px-4 rounded-full text-xs font-bold bg-slate-100/80 hover:bg-slate-200/80 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-slate-700 dark:text-zinc-200 border-none cursor-pointer transition active:scale-95"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="h-9 px-5 rounded-full bg-[#0b57d0] hover:bg-[#0842a0] dark:bg-[#a8c7fa] dark:hover:bg-[#d3e3fd] text-white dark:text-[#041e49] text-xs font-bold border-none cursor-pointer shadow-xs transition active:scale-95"
            >
              Create Course Batch
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
