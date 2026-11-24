import React, { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Megaphone,
  X,
  Image as ImageIcon,
  Trash2,
  Send,
  Loader2,
  Users,
  Sparkles,
  Link2,
  Bell,
  CheckCircle2,
  Palette,
  Check,
} from 'lucide-react';
import { useApp } from '../../lms/LmsContext';
import { compressImageToDataUrl } from '../../lib/diagramPresets';
import type { User } from 'firebase/auth';
import type { Announcement } from '../../lms/types';

const THEME_OPTIONS = [
  { id: 'orange', label: 'Orange', bg: 'bg-orange-500', swatch: 'from-orange-500 to-amber-500' },
  { id: 'blue', label: 'Blue', bg: 'bg-blue-500', swatch: 'from-blue-500 to-indigo-500' },
  { id: 'green', label: 'Emerald', bg: 'bg-emerald-500', swatch: 'from-emerald-500 to-teal-500' },
  { id: 'purple', label: 'Purple', bg: 'bg-purple-500', swatch: 'from-purple-500 to-fuchsia-500' },
  { id: 'rose', label: 'Rose', bg: 'bg-rose-500', swatch: 'from-rose-500 to-pink-500' },
  { id: 'slate', label: 'Slate', bg: 'bg-slate-600', swatch: 'from-slate-600 to-zinc-700' },
] as const;

interface CreatePostModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser?: User | null;
  defaultBatchId?: string;
}

export const CreatePostModal: React.FC<CreatePostModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  defaultBatchId,
}) => {
  const { batches, addAnnouncement } = useApp();

  const [postMode, setPostMode] = useState<'banner' | 'notification'>('banner');
  const [themeColor, setThemeColor] = useState<'orange' | 'blue' | 'green' | 'purple' | 'rose' | 'slate'>('orange');
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [selectedBatchId, setSelectedBatchId] = useState<string>(defaultBatchId || '');
  const [imageUrl, setImageUrl] = useState('');
  const [isCompressing, setIsCompressing] = useState(false);
  const [showUrlInput, setShowUrlInput] = useState(false);
  const [urlInputVal, setUrlInputVal] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleImageFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      alert('Please select a valid image file (PNG, JPG, WebP).');
      return;
    }

    try {
      setIsCompressing(true);
      const compressedDataUrl = await compressImageToDataUrl(file, 900, 0.85);
      setImageUrl(compressedDataUrl);
    } catch (err) {
      console.error('Image compression failed:', err);
      const reader = new FileReader();
      reader.onload = (event) => {
        if (event.target?.result) {
          setImageUrl(event.target.result as string);
        }
      };
      reader.readAsDataURL(file);
    } finally {
      setIsCompressing(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleAddUrl = () => {
    if (urlInputVal.trim()) {
      setImageUrl(urlInputVal.trim());
      setUrlInputVal('');
      setShowUrlInput(false);
    }
  };

  const handleRemoveImage = () => {
    setImageUrl('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handlePublish = (e: React.FormEvent) => {
    e.preventDefault();
    const hasImage = Boolean(imageUrl.trim());
    const hasText = Boolean(title.trim() || message.trim());
    if (!hasImage && !hasText) return;

    const postPayload: Omit<Announcement, 'id'> = {
      title: title.trim(),
      message: message.trim(),
      authorName: currentUser?.displayName || 'Master Academic Head',
      authorRole: 'Master Admin',
      createdAt: Date.now(),
      date: new Date().toISOString(),
      isHeroBanner: postMode === 'banner',
    };

    if (postMode === 'banner') {
      postPayload.themeColor = themeColor;
    }
    if (selectedBatchId) {
      postPayload.batchId = selectedBatchId;
    }
    if (hasImage) {
      postPayload.imageUrl = imageUrl.trim();
    }

    addAnnouncement(postPayload);

    // Reset fields & close
    setTitle('');
    setMessage('');
    setSelectedBatchId(defaultBatchId || '');
    setImageUrl('');
    setShowUrlInput(false);
    setPostMode('banner');
    setThemeColor('orange');
    onClose();
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 overflow-y-auto">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 bg-slate-900/60 dark:bg-black/80 backdrop-blur-sm"
        />

        {/* Modal Card */}
        <motion.div
          initial={{ y: 40, opacity: 0, scale: 0.98 }}
          animate={{ y: 0, opacity: 1, scale: 1 }}
          exit={{ y: 40, opacity: 0, scale: 0.98 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          className="relative w-full max-w-lg bg-white dark:bg-[#18191d] rounded-t-[28px] sm:rounded-3xl shadow-2xl border border-slate-100 dark:border-zinc-800/80 overflow-hidden z-10 flex flex-col max-h-[92dvh] sm:max-h-[88dvh]"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-slate-100 dark:border-zinc-800/80 shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-orange-500/20 to-amber-500/25 text-orange-600 dark:text-orange-400 flex items-center justify-center shrink-0">
                <Megaphone className="w-5 h-5 stroke-[2.2]" />
              </div>
              <div>
                <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white leading-tight">
                  Academic Broadcast Station
                </h2>
                <p className="text-xs text-slate-500 dark:text-zinc-400 font-medium">
                  Publish to Home Screen Banner or Student Notifications
                </p>
              </div>
            </div>

            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-600 dark:hover:text-zinc-200 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Form Content */}
          <form onSubmit={handlePublish} className="flex-1 overflow-y-auto p-5 space-y-4">
            {/* 1. BROADCAST DESTINATION MODE CARDS */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700 dark:text-zinc-300">
                Broadcast Destination
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {/* Option A: Home Screen Hero Banner */}
                <div
                  onClick={() => setPostMode('banner')}
                  className={`p-3 rounded-2xl border-2 cursor-pointer transition-all flex items-start gap-2.5 relative ${
                    postMode === 'banner'
                      ? 'border-orange-500 bg-orange-500/10 dark:bg-orange-950/30 shadow-xs'
                      : 'border-slate-200 dark:border-zinc-800 hover:border-slate-300 dark:hover:border-zinc-700 bg-slate-50/50 dark:bg-zinc-900/50'
                  }`}
                >
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${
                      postMode === 'banner'
                        ? 'bg-orange-500 text-white'
                        : 'bg-slate-200 dark:bg-zinc-800 text-slate-600 dark:text-zinc-400'
                    }`}
                  >
                    <Megaphone className="w-4 h-4 stroke-[2.2]" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-1">
                      <h4 className="text-xs font-bold text-slate-900 dark:text-white leading-tight">
                        Home Screen Banner
                      </h4>
                      {postMode === 'banner' && (
                        <CheckCircle2 className="w-4 h-4 text-orange-500 shrink-0" />
                      )}
                    </div>
                    <p className="text-[11px] text-slate-600 dark:text-zinc-400 leading-tight mt-1">
                      Prominent hero banner at top of Home feed (pushes latest classes down).
                    </p>
                  </div>
                </div>

                {/* Option B: Notification Only */}
                <div
                  onClick={() => setPostMode('notification')}
                  className={`p-3 rounded-2xl border-2 cursor-pointer transition-all flex items-start gap-2.5 relative ${
                    postMode === 'notification'
                      ? 'border-[#0b57d0] dark:border-[#a8c7fa] bg-blue-500/10 dark:bg-blue-950/30 shadow-xs'
                      : 'border-slate-200 dark:border-zinc-800 hover:border-slate-300 dark:hover:border-zinc-700 bg-slate-50/50 dark:bg-zinc-900/50'
                  }`}
                >
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${
                      postMode === 'notification'
                        ? 'bg-[#0b57d0] dark:bg-[#a8c7fa] text-white dark:text-[#041e49]'
                        : 'bg-slate-200 dark:bg-zinc-800 text-slate-600 dark:text-zinc-400'
                    }`}
                  >
                    <Bell className="w-4 h-4 stroke-[2.2]" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-1">
                      <h4 className="text-xs font-bold text-slate-900 dark:text-white leading-tight">
                        Notification Only
                      </h4>
                      {postMode === 'notification' && (
                        <CheckCircle2 className="w-4 h-4 text-[#0b57d0] dark:text-[#a8c7fa] shrink-0" />
                      )}
                    </div>
                    <p className="text-[11px] text-slate-600 dark:text-zinc-400 leading-tight mt-1">
                      Message alert delivered strictly to the Updates feed.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Banner Theme Background Color Picker (When Home Screen Banner is selected) */}
            {postMode === 'banner' && (
              <div className="space-y-2 p-3 rounded-2xl bg-orange-500/5 dark:bg-orange-950/20 border border-orange-500/20 dark:border-orange-500/15">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-800 dark:text-zinc-200 flex items-center gap-1.5">
                    <Palette className="w-3.5 h-3.5 text-orange-500" />
                    <span>Banner Theme Color</span>
                  </label>
                  <span className="text-[11px] font-bold text-orange-600 dark:text-orange-400 capitalize">
                    {THEME_OPTIONS.find((t) => t.id === themeColor)?.label || 'Orange'} (Default)
                  </span>
                </div>
                <div className="grid grid-cols-6 gap-2 pt-0.5">
                  {THEME_OPTIONS.map((theme) => {
                    const isSelected = themeColor === theme.id;
                    return (
                      <button
                        key={theme.id}
                        type="button"
                        onClick={() => setThemeColor(theme.id)}
                        className={`group flex flex-col items-center gap-1.5 p-1.5 rounded-xl transition-all cursor-pointer border ${
                          isSelected
                            ? 'border-orange-500 bg-white dark:bg-zinc-800 shadow-sm scale-105'
                            : 'border-transparent hover:bg-black/5 dark:hover:bg-white/5 opacity-75 hover:opacity-100'
                        }`}
                        title={`${theme.label} theme`}
                      >
                        <div
                          className={`w-7 h-7 rounded-full bg-gradient-to-br ${theme.swatch} shadow-xs flex items-center justify-center text-white transition-transform ${
                            isSelected ? 'scale-110 ring-2 ring-orange-500/40 ring-offset-1 dark:ring-offset-zinc-900' : ''
                          }`}
                        >
                          {isSelected && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                        </div>
                        <span className="text-[10px] font-semibold text-slate-700 dark:text-zinc-300 truncate max-w-full">
                          {theme.label}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Target Audience Selector */}
            <div className="space-y-1.5">
              <label className="flex items-center gap-1.5 text-xs font-bold text-slate-700 dark:text-zinc-300">
                <Users className="w-3.5 h-3.5 text-[#0b57d0] dark:text-[#a8c7fa]" />
                <span>Target Audience</span>
              </label>
              <select
                value={selectedBatchId}
                onChange={(e) => setSelectedBatchId(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 text-xs sm:text-sm font-semibold text-slate-800 dark:text-zinc-200 focus:outline-none focus:ring-2 focus:ring-orange-500"
              >
                <option value="">All Students (Global Broadcast)</option>
                {batches.map((b) => (
                  <option key={b.id} value={b.id}>
                    Batch: {b.title}
                  </option>
                ))}
              </select>
            </div>

            {/* Post Title */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700 dark:text-zinc-300 flex items-center justify-between">
                <span>Post Title</span>
                <span className="text-[11px] font-normal text-slate-400 dark:text-zinc-500">(Optional)</span>
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g., Special Batch / Important Notice (Optional)"
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 text-xs sm:text-sm text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-zinc-500 font-medium focus:outline-none focus:ring-2 focus:ring-orange-500"
              />
            </div>

            {/* Post Message */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700 dark:text-zinc-300 flex items-center justify-between">
                <span>Message Details</span>
                <span className="text-[11px] font-normal text-slate-400 dark:text-zinc-500">(Optional if uploading poster)</span>
              </label>
              <textarea
                rows={3}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Write your announcement, instructions, or exam tips here (Optional if sharing a poster)..."
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 text-xs sm:text-sm text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-zinc-500 font-medium focus:outline-none focus:ring-2 focus:ring-orange-500 resize-none"
              />
            </div>

            {/* Image Attachment Section */}
            <div className="space-y-2 pt-1">
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-1.5 text-xs font-bold text-slate-700 dark:text-zinc-300">
                  <ImageIcon className="w-3.5 h-3.5 text-slate-500" />
                  <span>Attach Image (Optional)</span>
                </label>
                {!imageUrl && (
                  <button
                    type="button"
                    onClick={() => setShowUrlInput(!showUrlInput)}
                    className="text-[11px] font-semibold text-[#0b57d0] dark:text-[#a8c7fa] hover:underline flex items-center gap-1"
                  >
                    <Link2 className="w-3 h-3" />
                    <span>{showUrlInput ? 'Hide URL input' : 'Paste Image URL'}</span>
                  </button>
                )}
              </div>

              {/* Paste URL Input */}
              {showUrlInput && !imageUrl && (
                <div className="flex items-center gap-2">
                  <input
                    type="url"
                    value={urlInputVal}
                    onChange={(e) => setUrlInputVal(e.target.value)}
                    placeholder="https://example.com/image.png"
                    className="flex-1 px-3 py-2 rounded-xl bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-orange-500"
                  />
                  <button
                    type="button"
                    onClick={handleAddUrl}
                    className="px-3 py-2 rounded-xl bg-slate-200 dark:bg-zinc-800 hover:bg-slate-300 dark:hover:bg-zinc-700 text-xs font-bold text-slate-800 dark:text-white transition-colors"
                  >
                    Add
                  </button>
                </div>
              )}

              {/* Image Preview / File Picker */}
              {imageUrl ? (
                <div className="relative rounded-2xl overflow-hidden border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-900 group">
                  <img
                    src={imageUrl}
                    alt="Post preview"
                    className="w-full max-h-56 object-cover rounded-2xl"
                  />
                  <button
                    type="button"
                    onClick={handleRemoveImage}
                    className="absolute top-2 right-2 p-1.5 rounded-full bg-black/70 hover:bg-red-600 text-white transition-colors shadow-md"
                    title="Remove image"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleImageFileChange}
                    className="hidden"
                  />
                  <button
                    type="button"
                    disabled={isCompressing}
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full py-3.5 px-4 rounded-xl border-2 border-dashed border-slate-200 dark:border-zinc-800 hover:border-orange-500 dark:hover:border-orange-400 bg-slate-50/50 dark:bg-zinc-900/50 flex items-center justify-center gap-2 text-xs font-semibold text-slate-600 dark:text-zinc-400 hover:text-orange-600 dark:hover:text-orange-400 transition-all"
                  >
                    {isCompressing ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin text-orange-500" />
                        <span>Optimizing image for fast delivery...</span>
                      </>
                    ) : (
                      <>
                        <ImageIcon className="w-4 h-4" />
                        <span>Choose image from device (auto-compressed)</span>
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>

            {/* Master Credentials footer pill */}
            <div className="pt-2 flex items-center justify-between text-[11px] text-slate-500 dark:text-zinc-400">
              <div className="flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                <span>Posting as: <strong className="text-slate-800 dark:text-zinc-200">{currentUser?.email || 'Master Console'}</strong></span>
              </div>
            </div>

            {/* Actions */}
            <div className="pt-3 flex items-center justify-end gap-2.5 border-t border-slate-100 dark:border-zinc-800/80">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2.5 rounded-full border border-slate-200 dark:border-zinc-800 hover:bg-slate-100 dark:hover:bg-zinc-800 text-xs sm:text-sm font-semibold text-slate-700 dark:text-zinc-300 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={(!title.trim() && !message.trim() && !imageUrl.trim()) || isCompressing}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 disabled:from-slate-300 disabled:to-slate-300 dark:disabled:from-zinc-800 dark:disabled:to-zinc-800 disabled:text-slate-500 text-white text-xs sm:text-sm font-bold shadow-md shadow-orange-500/20 active:scale-95 transition-all cursor-pointer"
              >
                <Send className="w-3.5 h-3.5" />
                <span>{postMode === 'banner' ? 'Broadcast Banner' : 'Send Notification'}</span>
              </button>
            </div>
          </form>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
