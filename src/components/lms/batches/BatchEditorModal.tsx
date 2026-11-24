import React, { useState, useEffect, useRef } from 'react';
import { X, Layers, Sparkles, Image as ImageIcon, IndianRupee, Calendar, UserCheck, CheckCircle, Users, EyeOff } from 'lucide-react';
import type { Batch } from '../../../lms/types';

interface BatchEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
  batchToEdit?: Batch | null;
  onSave: (batchData: Omit<Batch, 'id' | 'enrolledStudentsCount' | 'rating'>, existingId?: string) => void;
}

import { BatchThumbnailPicker, DEFAULT_HIGH_RES_BANNER, PRESET_BATCH_BANNERS } from './BatchThumbnailPicker';

export const BatchEditorModal: React.FC<BatchEditorModalProps> = ({
  isOpen,
  onClose,
  batchToEdit,
  onSave,
}) => {
  const [title, setTitle] = useState('');
  const [tagline, setTagline] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('JEE Advanced');
  const [price, setPrice] = useState('999');
  const [originalPrice, setOriginalPrice] = useState('4999');
  const [validityDays, setValidityDays] = useState('365');
  const [instructorName, setInstructorName] = useState('Sanju Kumar');
  const [instructorDesignation, setInstructorDesignation] = useState('Senior Mathematics Faculty');
  const [bannerUrl, setBannerUrl] = useState('');
  const [thumbnailUrl, setThumbnailUrl] = useState('');
  const [isPublished, setIsPublished] = useState(true);
  const [allowGuestAccess, setAllowGuestAccess] = useState(false);
  const [isPrivateRosterOnly, setIsPrivateRosterOnly] = useState(false);

  // Protection against live Firestore background sync & parent re-renders clearing user edits
  const isInitializedRef = useRef(false);
  const activeBatchIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      const currentBatchId = batchToEdit?.id || '__new_batch__';
      // Only populate on initial open or when the active batch ID switches
      if (!isInitializedRef.current || activeBatchIdRef.current !== currentBatchId) {
        isInitializedRef.current = true;
        activeBatchIdRef.current = currentBatchId;

        if (batchToEdit) {
          setTitle(batchToEdit.title || '');
          setTagline(batchToEdit.tagline || '');
          setDescription(batchToEdit.description || '');
          setCategory(batchToEdit.category || 'JEE Advanced');
          setPrice(String(batchToEdit.price ?? 999));
          setOriginalPrice(String(batchToEdit.originalPrice ?? 4999));
          setValidityDays(String(batchToEdit.validityDays ?? 365));
          setInstructorName(batchToEdit.instructor?.name || 'Sanju Kumar');
          setInstructorDesignation(batchToEdit.instructor?.designation || 'Senior Mathematics Faculty');
          setBannerUrl(batchToEdit.bannerUrl || '');
          setThumbnailUrl(batchToEdit.thumbnailUrl || '');
          setIsPublished(batchToEdit.isPublished ?? true);
          setAllowGuestAccess(batchToEdit.allowGuestAccess ?? false);
          setIsPrivateRosterOnly(batchToEdit.isPrivateRosterOnly ?? false);
        } else {
          setTitle('');
          setTagline('Comprehensive Test & Coaching Masterclass');
          setDescription('');
          setCategory('JEE Advanced');
          setPrice('999');
          setOriginalPrice('4999');
          setValidityDays('365');
          setInstructorName('Sanju Kumar');
          setInstructorDesignation('Senior Mathematics Faculty');
          setBannerUrl(DEFAULT_HIGH_RES_BANNER);
          setThumbnailUrl(DEFAULT_HIGH_RES_BANNER);
          setIsPublished(true);
          setAllowGuestAccess(false);
          setIsPrivateRosterOnly(false);
        }
      }
    } else {
      isInitializedRef.current = false;
      activeBatchIdRef.current = null;
    }
  }, [isOpen, batchToEdit?.id]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    const payload: Omit<Batch, 'id' | 'enrolledStudentsCount' | 'rating'> = {
      title: title.trim(),
      tagline: tagline.trim() || 'Comprehensive Masterclass',
      description: description.trim() || 'Complete coaching batch with cloaked lectures, study notes, and mock tests.',
      category: category.trim() || 'JEE Advanced',
      price: Number(price) || 0,
      originalPrice: Number(originalPrice) || Number(price) || 0,
      validityDays: Number(validityDays) || 365,
      startDate: batchToEdit?.startDate || new Date().toISOString(),
      bannerUrl: bannerUrl.trim() || DEFAULT_HIGH_RES_BANNER,
      thumbnailUrl: thumbnailUrl.trim() || bannerUrl.trim() || DEFAULT_HIGH_RES_BANNER,
      instructor: {
        name: instructorName.trim() || 'Faculty Team',
        designation: instructorDesignation.trim() || 'Educator',
        avatarUrl: batchToEdit?.instructor?.avatarUrl || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=200&auto=format&fit=crop&q=80',
      },
      isPublished,
      allowGuestAccess,
      isPrivateRosterOnly,
    };

    onSave(payload, batchToEdit?.id);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/20 dark:bg-black/60 backdrop-blur-md animate-fade-in">
      <div className="bg-white/95 dark:bg-[#121316]/95 backdrop-blur-2xl rounded-3xl max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-[0_20px_50px_rgba(0,0,0,0.08),0_6px_20px_rgba(0,0,0,0.04)] dark:shadow-[0_25px_60px_rgba(0,0,0,0.65)] border border-slate-100 dark:border-white/10">
        {/* Header */}
        <div className="p-4 sm:p-6 border-b border-slate-100 dark:border-zinc-800 flex items-center justify-between sticky top-0 bg-white/80 dark:bg-[#121316]/80 z-10 backdrop-blur-md">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-950/70 text-[#0b57d0] dark:text-[#a8c7fa] flex items-center justify-center shadow-2xs shrink-0">
              <Layers className="w-5 h-5 stroke-[2.2]" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-zinc-100">
                {batchToEdit ? 'Edit Batch Properties' : 'Create & Author New Batch'}
              </h2>
              <p className="text-xs text-slate-700 dark:text-zinc-300 font-medium">
                Student-facing identity, pricing, faculty attribution, and validity
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center text-slate-700 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-800 transition active:scale-95 border-none outline-none cursor-pointer"
          >
            <X className="w-4.5 h-4.5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-4 sm:p-6 space-y-4 sm:space-y-5">
          {/* Title & Category */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 sm:gap-4">
            <div className="md:col-span-2 space-y-1">
              <label className="text-xs font-bold text-slate-800 dark:text-zinc-200 block">
                Batch Title *
              </label>
              <input
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Elevate JEE Advanced 2026 - Alpha"
                className="w-full p-3 bg-white/60 dark:bg-black/20 hover:bg-white/80 dark:hover:bg-black/30 focus:bg-white dark:focus:bg-black/40 border border-slate-200/70 dark:border-zinc-700/60 rounded-2xl text-xs sm:text-sm text-slate-900 dark:text-zinc-100 placeholder:text-slate-500 outline-none focus:border-[#0b57d0] dark:focus:border-[#a8c7fa] font-semibold backdrop-blur-xs transition"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-800 dark:text-zinc-200 block">
                Target Category
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full p-3 bg-white/60 dark:bg-black/20 hover:bg-white/80 dark:hover:bg-black/30 focus:bg-white dark:focus:bg-black/40 border border-slate-200/70 dark:border-zinc-700/60 rounded-2xl text-xs sm:text-sm text-slate-900 dark:text-zinc-100 outline-none focus:border-[#0b57d0] dark:focus:border-[#a8c7fa] font-semibold cursor-pointer backdrop-blur-xs transition"
              >
                <option value="JEE Advanced">JEE Advanced</option>
                <option value="JEE Main">JEE Main</option>
                <option value="NEET UG">NEET UG</option>
                <option value="Foundation">Class 9/10 Foundation</option>
                <option value="Board Exams">Class 12 Boards</option>
                <option value="Olympiad">Math / Physics Olympiad</option>
              </select>
            </div>
          </div>

          {/* Tagline & Description */}
          <div className="space-y-3">
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-800 dark:text-zinc-200 block">
                Batch Tagline / Subtitle
              </label>
              <input
                type="text"
                value={tagline}
                onChange={(e) => setTagline(e.target.value)}
                placeholder="e.g. Comprehensive 1-Year Math & Physics Sprint"
                className="w-full p-3 bg-white/60 dark:bg-black/20 hover:bg-white/80 dark:hover:bg-black/30 focus:bg-white dark:focus:bg-black/40 border border-slate-200/70 dark:border-zinc-700/60 rounded-2xl text-xs text-slate-900 dark:text-zinc-100 placeholder:text-slate-500 outline-none focus:border-[#0b57d0] dark:focus:border-[#a8c7fa] backdrop-blur-xs transition font-medium"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-800 dark:text-zinc-200 block">
                Full Description & Syllabus Overview
              </label>
              <textarea
                rows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe key highlights, included mock tests, live sessions, and study material..."
                className="w-full p-3 bg-white/60 dark:bg-black/20 hover:bg-white/80 dark:hover:bg-black/30 focus:bg-white dark:focus:bg-black/40 border border-slate-200/70 dark:border-zinc-700/60 rounded-2xl text-xs text-slate-900 dark:text-zinc-100 placeholder:text-slate-500 outline-none focus:border-[#0b57d0] dark:focus:border-[#a8c7fa] backdrop-blur-xs transition resize-none font-medium"
              />
            </div>
          </div>

          {/* Pricing & Validity */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 p-3.5 sm:p-4 rounded-2xl bg-white/50 dark:bg-zinc-800/40 border border-slate-200/60 dark:border-zinc-700/50 backdrop-blur-xs">
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-800 dark:text-zinc-200 flex items-center space-x-1">
                <IndianRupee className="w-3.5 h-3.5 text-emerald-500" />
                <span>Offer Price (₹)</span>
              </label>
              <input
                type="number"
                min="0"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                className="w-full p-2.5 bg-white/70 dark:bg-black/30 border border-slate-200/70 dark:border-zinc-700/60 rounded-xl text-xs text-slate-900 dark:text-zinc-100 font-bold outline-none tabular-nums"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700 dark:text-zinc-300 flex items-center space-x-1">
                <IndianRupee className="w-3.5 h-3.5 text-slate-600 dark:text-zinc-400" />
                <span>Original Price (₹)</span>
              </label>
              <input
                type="number"
                min="0"
                value={originalPrice}
                onChange={(e) => setOriginalPrice(e.target.value)}
                className="w-full p-2.5 bg-white/70 dark:bg-black/30 border border-slate-200/70 dark:border-zinc-700/60 rounded-xl text-xs text-slate-900 dark:text-zinc-100 border-none outline-none tabular-nums font-bold"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700 dark:text-zinc-300 flex items-center space-x-1">
                <Calendar className="w-3.5 h-3.5 text-indigo-500" />
                <span>Validity (Days)</span>
              </label>
              <input
                type="number"
                min="1"
                value={validityDays}
                onChange={(e) => setValidityDays(e.target.value)}
                className="w-full p-2.5 bg-white/70 dark:bg-black/30 border border-slate-200/70 dark:border-zinc-700/60 rounded-xl text-xs text-slate-900 dark:text-zinc-100 font-bold border-none outline-none tabular-nums"
              />
            </div>
          </div>

          {/* Instructor Attribution */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-800 dark:text-zinc-200 flex items-center space-x-1">
                <UserCheck className="w-3.5 h-3.5 text-blue-500" />
                <span>Primary Instructor Name</span>
              </label>
              <input
                type="text"
                value={instructorName}
                onChange={(e) => setInstructorName(e.target.value)}
                placeholder="e.g. Sanju Kumar"
                className="w-full p-2.5 bg-white/60 dark:bg-black/20 hover:bg-white/80 dark:hover:bg-black/30 focus:bg-white dark:focus:bg-black/40 border border-slate-200/70 dark:border-zinc-700/60 rounded-xl text-xs text-slate-900 dark:text-zinc-100 outline-none backdrop-blur-xs font-medium"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-800 dark:text-zinc-200 block">
                Instructor Designation
              </label>
              <input
                type="text"
                value={instructorDesignation}
                onChange={(e) => setInstructorDesignation(e.target.value)}
                placeholder="e.g. Senior Faculty - Mathematics"
                className="w-full p-2.5 bg-white/60 dark:bg-black/20 hover:bg-white/80 dark:hover:bg-black/30 focus:bg-white dark:focus:bg-black/40 border border-slate-200/70 dark:border-zinc-700/60 rounded-xl text-xs text-slate-900 dark:text-zinc-100 outline-none backdrop-blur-xs font-medium"
              />
            </div>
          </div>

          {/* High-Resolution Thumbnail & Course Banner with Live 1200x500 Preview & Repair */}
          <div className="p-4 rounded-2xl bg-white/50 dark:bg-zinc-800/40 border border-slate-200/60 dark:border-zinc-700/50 backdrop-blur-xs">
            <BatchThumbnailPicker
              value={bannerUrl}
              onChange={(url) => {
                setBannerUrl(url);
                setThumbnailUrl(url);
              }}
              previewTitle={title}
              previewCategory={category}
            />
          </div>

          {/* Publish Status Toggle */}
          <div className="flex items-center justify-between p-3.5 rounded-2xl bg-white/50 dark:bg-zinc-800/40 border border-slate-200/60 dark:border-zinc-700/50 backdrop-blur-xs">
            <div className="flex items-center space-x-2.5">
              <CheckCircle className={`w-4 h-4 ${isPublished ? 'text-emerald-500' : 'text-gray-400'}`} />
              <div>
                <p className="text-xs font-bold text-slate-900 dark:text-zinc-100">
                  {isPublished ? 'Batch is Active & Published' : 'Batch is Draft (Hidden from Catalog)'}
                </p>
                <p className="text-[11px] text-slate-700 dark:text-zinc-300 font-medium">
                  Controls whether students can browse this batch on the home portal
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setIsPublished(!isPublished)}
              className={`px-3 py-1.5 rounded-full text-xs font-bold transition cursor-pointer border-none outline-none ${
                isPublished
                  ? 'bg-emerald-500 text-white'
                  : 'bg-slate-200 dark:bg-zinc-700 text-slate-700 dark:text-zinc-300'
              }`}
            >
              {isPublished ? 'Active' : 'Draft'}
            </button>
          </div>

          {/* Guest Access Option Toggle */}
          {(() => {
            const isGuestPassDisabled = !isPublished || isPrivateRosterOnly;
            return (
              <div 
                onClick={() => {
                  if (!isGuestPassDisabled) setAllowGuestAccess(!allowGuestAccess);
                }}
                className={`flex items-center justify-between p-3.5 rounded-2xl bg-white/50 dark:bg-zinc-800/40 border border-slate-200/60 dark:border-zinc-700/50 backdrop-blur-xs transition select-none ${
                  isGuestPassDisabled ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer hover:bg-white/80 dark:hover:bg-zinc-800/70'
                }`}
              >
                <div className="flex items-center space-x-2.5">
                  <Users className={`w-4 h-4 ${!isGuestPassDisabled && allowGuestAccess ? 'text-indigo-500' : 'text-slate-600 dark:text-zinc-400'}`} />
                  <div>
                    <p className="text-xs font-bold text-slate-900 dark:text-zinc-100 flex items-center space-x-1.5">
                      <span>{allowGuestAccess ? 'Free Guest Mode Pass (Active)' : 'Restricted Roster Only (No Guests)'}</span>
                      {isGuestPassDisabled && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-500/20 text-slate-600 dark:text-zinc-400 font-semibold">
                          Overrides Inactive
                        </span>
                      )}
                    </p>
                    <p className="text-[11px] text-slate-700 dark:text-zinc-300 font-medium">
                      {!isPublished
                        ? '🚫 Inactive in Draft mode: Course must be Published to allow guest access.'
                        : isPrivateRosterOnly
                        ? '🔒 Inactive in Secret Roster mode: Stealth courses are strictly hidden from guests.'
                        : allowGuestAccess
                        ? 'Visitors and guest users can freely explore and access curriculum, video streams, and tests.'
                        : 'Strict roster mode: only students admitted by Master Admin have access.'}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  disabled={isGuestPassDisabled}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (!isGuestPassDisabled) setAllowGuestAccess(!allowGuestAccess);
                  }}
                  className={`px-3 py-1.5 rounded-full text-xs font-bold transition border-none outline-none shadow-xs active:scale-95 flex items-center space-x-1 ${
                    isGuestPassDisabled
                      ? 'bg-slate-300 dark:bg-slate-700 text-slate-500 cursor-not-allowed'
                      : allowGuestAccess
                      ? 'bg-indigo-600 text-white hover:bg-indigo-700 cursor-pointer'
                      : 'bg-slate-200 dark:bg-zinc-700 text-slate-700 dark:text-zinc-300 cursor-pointer'
                  }`}
                >
                  <span>{isGuestPassDisabled ? '🔒 Disabled' : allowGuestAccess ? '👥 Guests Allowed' : '🔒 Roster Only'}</span>
                </button>
              </div>
            );
          })()}

          {/* Secret / Roster-Exclusive Toggle */}
          <div 
            onClick={() => setIsPrivateRosterOnly(!isPrivateRosterOnly)}
            className="flex items-center justify-between p-3.5 rounded-2xl bg-white/50 dark:bg-zinc-800/40 border border-slate-200/60 dark:border-zinc-700/50 backdrop-blur-xs cursor-pointer hover:bg-white/80 dark:hover:bg-zinc-800/70 transition select-none"
          >
            <div className="flex items-center space-x-2.5">
              <EyeOff className={`w-4 h-4 ${isPrivateRosterOnly ? 'text-amber-500' : 'text-slate-400'}`} />
              <div>
                <p className="text-xs font-bold text-slate-900 dark:text-zinc-100">
                  {isPrivateRosterOnly ? 'Secret Roster-Exclusive (100% Hidden from Catalog & Guests)' : 'Catalog Visible Course'}
                </p>
                <p className="text-[11px] text-slate-700 dark:text-zinc-300 font-medium">
                  {isPrivateRosterOnly
                    ? 'Completely invisible to guests and other learners. ONLY students enrolled via Master Console will see & access this batch.'
                    : 'Appears in public catalog according to your publish & guest pass settings.'}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setIsPrivateRosterOnly(!isPrivateRosterOnly);
              }}
              className={`px-3 py-1.5 rounded-full text-xs font-bold transition cursor-pointer border-none outline-none shadow-xs active:scale-95 flex items-center space-x-1 ${
                isPrivateRosterOnly
                  ? 'bg-amber-600 text-white hover:bg-amber-700'
                  : 'bg-slate-200 dark:bg-zinc-700 text-slate-700 dark:text-zinc-300'
              }`}
            >
              <span>{isPrivateRosterOnly ? '👁️‍🗨️ Secret Roster Only' : '🌐 Catalog Listed'}</span>
            </button>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end space-x-3 pt-4 border-t border-slate-100 dark:border-zinc-800">
            <button
              type="button"
              onClick={onClose}
              className="h-10 px-5 rounded-full text-xs font-bold bg-slate-100/80 hover:bg-slate-200/80 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-slate-700 dark:text-zinc-200 transition border-none outline-none cursor-pointer active:scale-95"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="h-10 px-6 rounded-full bg-[#0b57d0] hover:bg-[#0842a0] dark:bg-[#a8c7fa] dark:hover:bg-[#d3e3fd] text-white dark:text-[#041e49] text-xs font-bold shadow-xs border-none outline-none cursor-pointer flex items-center space-x-1.5 transition active:scale-95"
            >
              <Sparkles className="w-4 h-4 stroke-[2.2]" />
              <span>{batchToEdit ? 'Save Changes' : 'Create & Author Batch'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
