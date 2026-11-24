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
  Clock,
  Calendar,
} from 'lucide-react';
import { useApp } from '../../lms/LmsContext';
import { compressImageToDataUrl } from '../../lib/diagramPresets';
import { useBackHandler } from '../../hooks/useBackNavigation';
import { PLAIN_BANNER_TEMPLATES } from '../../lib/bannerTemplates';
import type { User } from 'firebase/auth';
import type { Announcement, Batch } from '../../lms/types';
import { DEFAULT_HIGH_RES_BANNER } from '../lms/batches/BatchThumbnailPicker';
import { BookOpen } from 'lucide-react';

const THEME_OPTIONS = [
  { id: 'yellow', label: 'Plain Yellow', bg: 'bg-[#fbc404]', swatch: 'from-[#ffd000] to-[#fbc404]' },
  { id: 'orange', label: 'Sunset Orange', bg: 'bg-orange-500', swatch: 'from-orange-500 to-amber-500' },
  { id: 'blue', label: 'Ocean Blue', bg: 'bg-blue-500', swatch: 'from-blue-500 to-indigo-500' },
  { id: 'green', label: 'Emerald Green', bg: 'bg-emerald-500', swatch: 'from-emerald-500 to-teal-500' },
  { id: 'purple', label: 'Royal Purple', bg: 'bg-purple-500', swatch: 'from-purple-500 to-fuchsia-500' },
  { id: 'rose', label: 'Blossom Rose', bg: 'bg-rose-500', swatch: 'from-rose-500 to-pink-500' },
  { id: 'slate', label: 'Slate Minimal', bg: 'bg-slate-600', swatch: 'from-slate-600 to-zinc-700' },
] as const;

interface CreatePostModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser?: any;
  defaultBatchId?: string;
}

export const CreatePostModal: React.FC<CreatePostModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  defaultBatchId,
}) => {
  const { batches, addAnnouncement } = useApp();

  const [postMode, setPostMode] = useState<'banner' | 'broadcast_batch' | 'notification'>('banner');
  const [themeColor, setThemeColor] = useState<'yellow' | 'orange' | 'blue' | 'green' | 'purple' | 'rose' | 'slate'>('yellow');
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [selectedBatchId, setSelectedBatchId] = useState<string>(defaultBatchId || '');
  const [imageUrl, setImageUrl] = useState('');
  const [isCompressing, setIsCompressing] = useState(false);
  const [showUrlInput, setShowUrlInput] = useState(false);
  const [urlInputVal, setUrlInputVal] = useState('');
  const [durationMode, setDurationMode] = useState<'permanent' | '1h' | '6h' | '12h' | '24h' | '3d' | '7d' | 'custom'>('permanent');
  const [customExpiryDate, setCustomExpiryDate] = useState<string>('');

  const fileInputRef = useRef<HTMLInputElement>(null);

  useBackHandler({
    isOpen,
    onBack: onClose,
    priority: 35,
    id: 'create_post_modal',
  });

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
      // High-fidelity compression preserving full 1200x500px banner resolution
      const compressedDataUrl = await compressImageToDataUrl(file, 1200, 0.88);
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

  const handleSelectBatchForBroadcast = (b: Batch) => {
    setSelectedBatchId(b.id);
    setImageUrl(b.bannerUrl || b.thumbnailUrl || DEFAULT_HIGH_RES_BANNER);
    setTitle(b.title);
    setMessage(b.description || `Explore ${b.title} curriculum, lectures, and mock tests.`);
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

    // Compute banner display duration / auto-expiry timestamp
    let calculatedExpiresAt: number | null = null;
    let durationLabel = 'Permanent';

    const now = Date.now();
    if (durationMode === '1h') {
      calculatedExpiresAt = now + 1 * 60 * 60 * 1000;
      durationLabel = '1 Hour';
    } else if (durationMode === '6h') {
      calculatedExpiresAt = now + 6 * 60 * 60 * 1000;
      durationLabel = '6 Hours';
    } else if (durationMode === '12h') {
      calculatedExpiresAt = now + 12 * 60 * 60 * 1000;
      durationLabel = '12 Hours';
    } else if (durationMode === '24h') {
      calculatedExpiresAt = now + 24 * 60 * 60 * 1000;
      durationLabel = '24 Hours';
    } else if (durationMode === '3d') {
      calculatedExpiresAt = now + 3 * 24 * 60 * 60 * 1000;
      durationLabel = '3 Days';
    } else if (durationMode === '7d') {
      calculatedExpiresAt = now + 7 * 24 * 60 * 60 * 1000;
      durationLabel = '7 Days';
    } else if (durationMode === 'custom' && customExpiryDate) {
      const parsed = new Date(customExpiryDate).getTime();
      if (!isNaN(parsed) && parsed > now) {
        calculatedExpiresAt = parsed;
        durationLabel = `Custom: ${new Date(parsed).toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}`;
      }
    }

    const postPayload: Omit<Announcement, 'id'> = {
      title: title.trim(),
      message: message.trim(),
      authorName: currentUser?.displayName || 'Master Academic Head',
      authorRole: 'Master Admin',
      createdAt: Date.now(),
      date: new Date().toISOString(),
      isHeroBanner: postMode === 'banner' || postMode === 'broadcast_batch',
      expiresAt: calculatedExpiresAt,
      durationLabel,
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
    setThemeColor('yellow');
    setDurationMode('permanent');
    setCustomExpiryDate('');
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
                  Create Post & Announcement
                </h2>
                <p className="text-xs text-slate-500 dark:text-zinc-400 font-medium">
                  Publish Campus Post, Broadcast Course Batch, or Send Notification
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
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-2.5">
                {/* Option A: Home Screen Hero Banner */}
                <div
                  onClick={() => setPostMode('banner')}
                  className={`p-2.5 sm:p-3 rounded-2xl border-2 cursor-pointer transition-all flex items-start gap-2 relative ${
                    postMode === 'banner'
                      ? 'border-orange-500 bg-orange-500/10 dark:bg-orange-950/30 shadow-xs'
                      : 'border-slate-200 dark:border-zinc-800 hover:border-slate-300 dark:hover:border-zinc-700 bg-slate-50/50 dark:bg-zinc-900/50'
                  }`}
                >
                  <div
                    className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${
                      postMode === 'banner'
                        ? 'bg-orange-500 text-white'
                        : 'bg-slate-200 dark:bg-zinc-800 text-slate-600 dark:text-zinc-400'
                    }`}
                  >
                    <Megaphone className="w-3.5 h-3.5 stroke-[2.2]" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-1">
                      <h4 className="text-xs font-bold text-slate-900 dark:text-white leading-tight">
                        Custom Banner
                      </h4>
                      {postMode === 'banner' && (
                        <CheckCircle2 className="w-4 h-4 text-orange-500 shrink-0" />
                      )}
                    </div>
                    <p className="text-[10px] text-slate-600 dark:text-zinc-400 leading-tight mt-1">
                      Announcements with 1200x500 banner.
                    </p>
                  </div>
                </div>

                {/* Option B: Broadcast a Course Batch */}
                <div
                  onClick={() => {
                    setPostMode('broadcast_batch');
                    if (batches.length > 0) {
                      const initial = batches.find(b => b.id === selectedBatchId) || batches[0];
                      handleSelectBatchForBroadcast(initial);
                    }
                  }}
                  className={`p-2.5 sm:p-3 rounded-2xl border-2 cursor-pointer transition-all flex items-start gap-2 relative ${
                    postMode === 'broadcast_batch'
                      ? 'border-emerald-500 bg-emerald-500/10 dark:bg-emerald-950/30 shadow-xs'
                      : 'border-slate-200 dark:border-zinc-800 hover:border-slate-300 dark:hover:border-zinc-700 bg-slate-50/50 dark:bg-zinc-900/50'
                  }`}
                >
                  <div
                    className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${
                      postMode === 'broadcast_batch'
                        ? 'bg-emerald-500 text-white'
                        : 'bg-slate-200 dark:bg-zinc-800 text-slate-600 dark:text-zinc-400'
                    }`}
                  >
                    <BookOpen className="w-3.5 h-3.5 stroke-[2.2]" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-1">
                      <h4 className="text-xs font-bold text-slate-900 dark:text-white leading-tight">
                        Broadcast a Batch
                      </h4>
                      {postMode === 'broadcast_batch' && (
                        <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                      )}
                    </div>
                    <p className="text-[10px] text-slate-600 dark:text-zinc-400 leading-tight mt-1">
                      Pin course batch. Tapping it navigates to batch!
                    </p>
                  </div>
                </div>

                {/* Option C: Notification Only */}
                <div
                  onClick={() => setPostMode('notification')}
                  className={`p-2.5 sm:p-3 rounded-2xl border-2 cursor-pointer transition-all flex items-start gap-2 relative ${
                    postMode === 'notification'
                      ? 'border-[#0b57d0] dark:border-[#a8c7fa] bg-blue-500/10 dark:bg-blue-950/30 shadow-xs'
                      : 'border-slate-200 dark:border-zinc-800 hover:border-slate-300 dark:hover:border-zinc-700 bg-slate-50/50 dark:bg-zinc-900/50'
                  }`}
                >
                  <div
                    className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${
                      postMode === 'notification'
                        ? 'bg-[#0b57d0] dark:bg-[#a8c7fa] text-white dark:text-[#041e49]'
                        : 'bg-slate-200 dark:bg-zinc-800 text-slate-600 dark:text-zinc-400'
                    }`}
                  >
                    <Bell className="w-3.5 h-3.5 stroke-[2.2]" />
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
                    <p className="text-[10px] text-slate-600 dark:text-zinc-400 leading-tight mt-1">
                      Alert sent to Updates feed only.
                    </p>
                  </div>
                </div>
              </div>
            </div>

                        {/* Dedicated Batch Selector for 'Broadcast a Batch' Mode */}
            {postMode === 'broadcast_batch' && (
              <div className="space-y-2 p-3.5 rounded-2xl bg-emerald-500/5 dark:bg-emerald-950/20 border border-emerald-500/20">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-800 dark:text-zinc-200 flex items-center gap-1.5">
                    <BookOpen className="w-3.5 h-3.5 text-emerald-500" />
                    <span>Select Course Batch to Broadcast</span>
                  </label>
                  <span className="text-[10.5px] font-bold text-emerald-600 dark:text-emerald-400">
                    {batches.find(b => b.id === selectedBatchId)?.title || 'Select a batch'}
                  </span>
                </div>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1 max-h-48 overflow-y-auto pr-1">
                  {batches.map((b) => {
                    const isSelected = selectedBatchId === b.id;
                    const thumb = b.bannerUrl || b.thumbnailUrl || DEFAULT_HIGH_RES_BANNER;
                    return (
                      <button
                        key={b.id}
                        type="button"
                        onClick={() => handleSelectBatchForBroadcast(b)}
                        className={`p-2 rounded-xl flex items-center gap-2.5 text-left border transition-all cursor-pointer ${
                          isSelected
                            ? 'border-emerald-500 bg-white dark:bg-zinc-800 shadow-sm ring-2 ring-emerald-500/30'
                            : 'border-slate-200/80 dark:border-zinc-800 hover:border-slate-300 dark:hover:border-zinc-700 bg-white/50 dark:bg-zinc-900/50'
                        }`}
                      >
                        <img
                          src={thumb}
                          alt={b.title}
                          className="w-12 h-7.5 object-cover rounded-lg shrink-0 border border-black/5"
                        />
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-bold text-slate-900 dark:text-white truncate">
                            {b.title}
                          </p>
                          <p className="text-[10px] text-slate-500 dark:text-zinc-400 truncate">
                            {b.category || 'Course'} • {b.instructor?.name || 'Faculty'}
                          </p>
                        </div>
                        {isSelected && (
                          <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                        )}
                      </button>
                    );
                  })}
                </div>
                <p className="text-[10px] text-slate-500 dark:text-zinc-400 pt-0.5">
                  💡 This batch's <strong>1200×500 thumbnail</strong> will be pinned to the Home Screen. When students tap it, they will be taken straight into the batch curriculum.
                </p>
              </div>
            )}

            {/* Banner Theme Background Color Picker (When Home Screen Banner is selected) */}
            {postMode === 'banner' && (
              <div className="space-y-3 p-3.5 rounded-2xl bg-amber-500/5 dark:bg-amber-950/20 border border-amber-500/20 dark:border-amber-500/15">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-800 dark:text-zinc-200 flex items-center gap-1.5">
                    <Palette className="w-3.5 h-3.5 text-amber-500" />
                    <span>Banner Theme Color</span>
                  </label>
                  <span className="text-[11px] font-bold text-amber-600 dark:text-amber-400 capitalize">
                    {THEME_OPTIONS.find((t) => t.id === themeColor)?.label || 'Golden Amber'} {themeColor === 'yellow' ? '(Default)' : ''}
                  </span>
                </div>
                <div className="grid grid-cols-4 sm:grid-cols-7 gap-1.5 pt-0.5">
                  {THEME_OPTIONS.map((theme) => {
                    const isSelected = themeColor === theme.id;
                    return (
                      <button
                        key={theme.id}
                        type="button"
                        onClick={() => setThemeColor(theme.id)}
                        className={`group flex flex-col items-center gap-1.5 p-1.5 rounded-xl transition-all cursor-pointer border ${
                          isSelected
                            ? 'border-amber-500 bg-white dark:bg-zinc-800 shadow-sm scale-105'
                            : 'border-transparent hover:bg-black/5 dark:hover:bg-white/5 opacity-75 hover:opacity-100'
                        }`}
                        title={`${theme.label} theme`}
                      >
                        <div
                          className={`w-7 h-7 rounded-full bg-gradient-to-br ${theme.swatch} shadow-xs flex items-center justify-center text-white transition-transform ${
                            isSelected ? 'scale-110 ring-2 ring-amber-500/50 ring-offset-1 dark:ring-offset-zinc-900' : ''
                          }`}
                        >
                          {isSelected && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                        </div>
                        <span className="text-[10px] font-semibold text-slate-700 dark:text-zinc-300 truncate max-w-full text-center">
                          {theme.label.split(' ')[0]}
                        </span>
                      </button>
                    );
                  })}
                </div>

                {/* Banner Dimensions Guide for External Graphic Designers & Admin */}
                <div className="mt-1 pt-2 border-t border-amber-500/15 text-slate-700 dark:text-zinc-300 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                      Universal Banner Dimensions Guide
                    </span>
                    <span className="text-[9.5px] font-bold px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-300">
                      Mobile • Tablet • Desktop Fit
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-[11px]">
                    <div className="p-2 rounded-xl bg-white/80 dark:bg-zinc-900/80 border border-slate-200/60 dark:border-zinc-800/80">
                      <span className="text-slate-400 dark:text-zinc-500 text-[10px] font-medium block">Standard Banner Size</span>
                      <strong className="text-slate-900 dark:text-zinc-100 font-extrabold text-xs block mt-0.5">1200 × 500 px</strong>
                      <span className="text-[9.5px] text-amber-600 dark:text-amber-400 font-semibold block mt-0.5">2.4 : 1 Aspect Ratio</span>
                    </div>
                    <div className="p-2 rounded-xl bg-white/80 dark:bg-zinc-900/80 border border-slate-200/60 dark:border-zinc-800/80">
                      <span className="text-slate-400 dark:text-zinc-500 text-[10px] font-medium block">Safe Content Area</span>
                      <strong className="text-emerald-600 dark:text-emerald-400 font-extrabold text-xs block mt-0.5">1000 × 420 px</strong>
                      <span className="text-[9.5px] text-slate-500 dark:text-zinc-400 font-medium block mt-0.5">Centered (Logo & Text)</span>
                    </div>
                  </div>

                  <p className="text-[10px] text-slate-500 dark:text-zinc-400 leading-tight">
                    💡 <em>Tip:</em> Share this standard size (1200×500) with your graphic designer. Keeping important text and logos within the 1000×420 center zone guarantees zero cropping across all mobile screens, iPads, and wide desktop monitors.
                  </p>
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

            {/* Banner Live Duration / Auto-Expiry Control */}
            <div className="space-y-2 p-3 sm:p-3.5 rounded-2xl bg-gradient-to-br from-amber-500/10 via-orange-500/5 to-transparent border border-amber-500/25 dark:border-amber-500/30">
              <div className="flex items-center justify-between gap-2">
                <label className="flex items-center gap-1.5 text-xs font-bold text-slate-800 dark:text-zinc-200">
                  <Clock className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                  <span>Banner Live Duration (प्रसारण अवधि)</span>
                </label>
                <span className="text-[9.5px] font-bold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-800 dark:text-amber-300 shrink-0">
                  Auto-Expiry Control
                </span>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-zinc-400">
                तय करें कि यह बैनर कितनी देर तक लाइव रहेगा। समय पूरा होते ही यह अपने आप होम स्क्रीन से हट जाएगा।
              </p>

              {/* Quick Preset Duration Chips */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 pt-1">
                {[
                  { id: 'permanent', label: '⚡ Always Live', sub: 'Until Deleted' },
                  { id: '1h', label: '1 Hour', sub: 'Flash Alert' },
                  { id: '6h', label: '6 Hours', sub: 'Half Day' },
                  { id: '12h', label: '12 Hours', sub: 'Day Event' },
                  { id: '24h', label: '24 Hours', sub: '1 Full Day' },
                  { id: '3d', label: '3 Days', sub: 'Short Notice' },
                  { id: '7d', label: '7 Days', sub: '1 Full Week' },
                  { id: 'custom', label: '🗓️ Custom', sub: 'Pick Date/Time' },
                ].map((item) => {
                  const isSelected = durationMode === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setDurationMode(item.id as any)}
                      className={`p-2 rounded-xl text-left transition-all border cursor-pointer ${
                        isSelected
                          ? 'bg-amber-500 text-slate-950 font-black border-amber-500 shadow-sm shadow-amber-500/25 ring-2 ring-amber-400/40'
                          : 'bg-white/90 dark:bg-zinc-800/80 text-slate-700 dark:text-zinc-300 border-slate-200/70 dark:border-zinc-700/60 hover:border-amber-300 dark:hover:border-amber-500/50'
                      }`}
                    >
                      <span className={`text-[11px] font-extrabold block leading-tight ${isSelected ? 'text-slate-950' : 'text-slate-900 dark:text-zinc-100'}`}>
                        {item.label}
                      </span>
                      <span className={`text-[9.5px] block leading-tight mt-0.5 ${isSelected ? 'text-slate-900/80' : 'text-slate-400 dark:text-zinc-500'}`}>
                        {item.sub}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Custom Date/Time Picker */}
              {durationMode === 'custom' && (
                <div className="pt-1.5 space-y-1 animate-fade-in">
                  <label className="text-[11px] font-semibold text-slate-700 dark:text-zinc-300 flex items-center gap-1">
                    <Calendar className="w-3 h-3 text-amber-500" />
                    <span>Select Exact Expiry Date & Time:</span>
                  </label>
                  <input
                    type="datetime-local"
                    value={customExpiryDate}
                    min={new Date().toISOString().slice(0, 16)}
                    onChange={(e) => setCustomExpiryDate(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 text-xs font-semibold text-slate-800 dark:text-zinc-200 focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </div>
              )}

              {/* Status pill showing current auto-expiry time */}
              <div className="p-2 rounded-xl bg-white/80 dark:bg-zinc-900/80 border border-slate-200/60 dark:border-zinc-800 flex items-center justify-between text-[11px]">
                <span className="text-slate-500 dark:text-zinc-400 font-medium">Auto-Expiry:</span>
                <span className="font-extrabold text-slate-800 dark:text-zinc-100 flex items-center gap-1.5">
                  {durationMode === 'permanent' && (
                    <>
                      <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                      <span>Permanent (Always Live until deleted)</span>
                    </>
                  )}
                  {durationMode === '1h' && 'Live for 1 Hour (Flash)'}
                  {durationMode === '6h' && 'Live for 6 Hours'}
                  {durationMode === '12h' && 'Live for 12 Hours'}
                  {durationMode === '24h' && 'Live for 24 Hours (1 Day)'}
                  {durationMode === '3d' && 'Live for 3 Days'}
                  {durationMode === '7d' && 'Live for 7 Days (1 Week)'}
                  {durationMode === 'custom' && (
                    customExpiryDate
                      ? `Expires: ${new Date(customExpiryDate).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}`
                      : 'Please choose expiry date above'
                  )}
                </span>
              </div>
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
            {/* Quick 1-Click Plain Templates (Official 1200x500 Minimal Style) */}
            <div className="space-y-2 p-3 rounded-2xl bg-slate-50 dark:bg-zinc-900 border border-slate-200/80 dark:border-zinc-800">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-800 dark:text-zinc-200 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                  <span>Choose Plain Template (1200 × 500 px)</span>
                </span>
                <span className="text-[10px] text-slate-500 dark:text-zinc-400 font-medium">
                  {PLAIN_BANNER_TEMPLATES.find(t => t.dataUrl === imageUrl)?.name || 'Optional 1-Click Canvas'}
                </span>
              </div>
              <div className="grid grid-cols-5 gap-2 pt-0.5">
                {PLAIN_BANNER_TEMPLATES.map((tmpl) => {
                  const isSelected = imageUrl === tmpl.dataUrl;
                  return (
                    <button
                      key={tmpl.id}
                      type="button"
                      onClick={() => {
                        if (isSelected) {
                          setImageUrl('');
                        } else {
                          setImageUrl(tmpl.dataUrl);
                          setThemeColor(tmpl.themeColor);
                        }
                      }}
                      className={`group flex flex-col items-center gap-1.5 p-1 rounded-xl transition-all cursor-pointer border ${
                        isSelected
                          ? 'border-orange-500 bg-white dark:bg-zinc-800 shadow-sm ring-2 ring-orange-500/50 scale-102'
                          : 'border-slate-200/70 dark:border-zinc-800 hover:border-slate-300 dark:hover:border-zinc-700 bg-white/50 dark:bg-zinc-800/50'
                      }`}
                      title={`Apply ${tmpl.name} (1200x500) plain template`}
                    >
                      <div
                        className="w-full aspect-[1200/500] rounded-lg shadow-2xs relative overflow-hidden flex items-end justify-end p-0.5 border border-black/5"
                        style={{ backgroundColor: tmpl.colorHex }}
                      >
                        
                        {isSelected && (
                          <div className="absolute inset-0 bg-black/30 backdrop-blur-2xs flex items-center justify-center">
                            <Check className="w-3.5 h-3.5 text-white stroke-[3]" />
                          </div>
                        )}
                      </div>
                      <span className="text-[10px] font-bold text-slate-700 dark:text-zinc-300 truncate max-w-full text-center">
                        {tmpl.name.split(' ')[0]}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="space-y-2 pt-1">
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-1.5 text-xs font-bold text-slate-700 dark:text-zinc-300">
                  <ImageIcon className="w-3.5 h-3.5 text-slate-500" />
                  <span>Attach Banner Image (Standard 1200x500px, 12:5 ratio)</span>
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
                    placeholder="https://example.com/banner-1200x500.png"
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

              {/* Image Preview / File Picker (Strictly 1200x500 Aspect Ratio) */}
              {imageUrl ? (
                <div
                  className="relative rounded-2xl overflow-hidden border border-slate-200 dark:border-zinc-800 bg-slate-100 dark:bg-zinc-900 group w-full aspect-[1200/500] flex items-center justify-center"
                  style={{ aspectRatio: '1200 / 500' }}
                >
                  <img
                    src={imageUrl}
                    alt="Banner preview 1200x500"
                    className="w-full h-full object-cover rounded-2xl"
                  />
                  <div className="absolute bottom-2 left-2 px-2 py-0.5 rounded-md bg-black/70 text-[10px] text-white font-medium backdrop-blur-xs select-none">
                    1200 × 500 px · Full View (No side cutting)
                  </div>
                  <button
                    type="button"
                    onClick={handleRemoveImage}
                    className="absolute top-2 right-2 p-1.5 rounded-full bg-black/70 hover:bg-red-600 text-white transition-colors shadow-md cursor-pointer"
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
                    className="w-full py-3.5 px-4 rounded-xl border-2 border-dashed border-slate-200 dark:border-zinc-800 hover:border-orange-500 dark:hover:border-orange-400 bg-slate-50/50 dark:bg-zinc-900/50 flex items-center justify-center gap-2 text-xs font-semibold text-slate-600 dark:text-zinc-400 hover:text-orange-600 dark:hover:text-orange-400 transition-all cursor-pointer"
                  >
                    {isCompressing ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin text-orange-500" />
                        <span>Optimizing 1200x500 banner for lightning-fast loading...</span>
                      </>
                    ) : (
                      <>
                        <ImageIcon className="w-4 h-4" />
                        <span>Choose 1200x500 banner image from device</span>
                      </>
                    )}
                  </button>
                  <p className="text-[11px] text-slate-500 dark:text-zinc-400 mt-1 pl-1">
                    Standard dimension: <strong>1200 × 500 px</strong> (2.4:1 ratio). Displayed in full without side cropping across phone, tablet, and desktop.
                  </p>
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
                <span>{postMode === 'broadcast_batch' ? 'Broadcast Batch Banner' : postMode === 'banner' ? 'Publish Post & Banner' : 'Send Notification'}</span>
              </button>
            </div>
          </form>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
