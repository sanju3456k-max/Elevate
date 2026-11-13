import React, { useState, useEffect } from 'react';
import { X, Layers, Sparkles, Image as ImageIcon, IndianRupee, Calendar, UserCheck, CheckCircle } from 'lucide-react';
import type { Batch } from '../../../lms/types';

interface BatchEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
  batchToEdit?: Batch | null;
  onSave: (batchData: Omit<Batch, 'id' | 'enrolledStudentsCount' | 'rating'>, existingId?: string) => void;
}

const PRESET_BANNERS = [
  'https://images.unsplash.com/photo-1635070041078-e363dbe005cb?w=1200&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1509228468518-180dd4864904?w=1200&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1580582932707-520aed937b7b?w=1200&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1434030216411-0b793f4b4173?w=1200&auto=format&fit=crop&q=80'
];

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

  useEffect(() => {
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
      setBannerUrl(PRESET_BANNERS[0]);
      setThumbnailUrl(PRESET_BANNERS[0]);
      setIsPublished(true);
    }
  }, [batchToEdit, isOpen]);

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
      bannerUrl: bannerUrl.trim() || PRESET_BANNERS[0],
      thumbnailUrl: thumbnailUrl.trim() || bannerUrl.trim() || PRESET_BANNERS[0],
      instructor: {
        name: instructorName.trim() || 'Faculty Team',
        designation: instructorDesignation.trim() || 'Educator',
        avatarUrl: batchToEdit?.instructor?.avatarUrl || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=200&auto=format&fit=crop&q=80',
      },
      isPublished,
    };

    onSave(payload, batchToEdit?.id);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
      <div className="bg-[var(--md-sys-color-surface-container)] rounded-3xl max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-2xl border-none">
        {/* Header */}
        <div className="p-6 border-b border-[var(--md-sys-color-outline-variant)]/20 flex items-center justify-between sticky top-0 bg-[var(--md-sys-color-surface-container)] z-10 backdrop-blur-md">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-2xl bg-[var(--md-sys-color-primary-container)] text-[var(--md-sys-color-primary)] flex items-center justify-center">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-[var(--md-sys-color-on-surface)]">
                {batchToEdit ? 'Edit Batch Properties' : 'Create & Author New Batch'}
              </h2>
              <p className="text-xs text-[var(--md-sys-color-on-surface-variant)]">
                Student-facing identity, pricing, faculty attribution, and validity
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-full hover:bg-[var(--md-sys-color-surface-container-highest)] text-[var(--md-sys-color-on-surface-variant)] transition border-none outline-none cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {/* Title & Category */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="md:col-span-2 space-y-1">
              <label className="text-xs font-bold text-[var(--md-sys-color-on-surface-variant)] block">
                Batch Title *
              </label>
              <input
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Elevate JEE Advanced 2026 - Alpha"
                className="w-full p-3 bg-[var(--md-sys-color-surface-container-high)] rounded-2xl text-xs text-[var(--md-sys-color-on-surface)] border-none outline-none focus:ring-2 focus:ring-[var(--md-sys-color-primary)] font-semibold"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold text-[var(--md-sys-color-on-surface-variant)] block">
                Target Category
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full p-3 bg-[var(--md-sys-color-surface-container-high)] rounded-2xl text-xs text-[var(--md-sys-color-on-surface)] border-none outline-none font-semibold cursor-pointer"
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
              <label className="text-xs font-bold text-[var(--md-sys-color-on-surface-variant)] block">
                Batch Tagline / Subtitle
              </label>
              <input
                type="text"
                value={tagline}
                onChange={(e) => setTagline(e.target.value)}
                placeholder="e.g. Comprehensive 1-Year Math & Physics Sprint"
                className="w-full p-3 bg-[var(--md-sys-color-surface-container-high)] rounded-2xl text-xs text-[var(--md-sys-color-on-surface)] border-none outline-none"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-[var(--md-sys-color-on-surface-variant)] block">
                Full Description & Syllabus Overview
              </label>
              <textarea
                rows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe key highlights, included mock tests, live sessions, and study material..."
                className="w-full p-3 bg-[var(--md-sys-color-surface-container-high)] rounded-2xl text-xs text-[var(--md-sys-color-on-surface)] border-none outline-none resize-none"
              />
            </div>
          </div>

          {/* Pricing & Validity */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 rounded-2xl bg-[var(--md-sys-color-surface-container-high)]/50">
            <div className="space-y-1">
              <label className="text-xs font-bold text-[var(--md-sys-color-on-surface-variant)] flex items-center space-x-1">
                <IndianRupee className="w-3.5 h-3.5 text-emerald-500" />
                <span>Offer Price (₹)</span>
              </label>
              <input
                type="number"
                min="0"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                className="w-full p-2.5 bg-[var(--md-sys-color-surface-container-high)] rounded-xl text-xs text-[var(--md-sys-color-on-surface)] font-bold border-none outline-none"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold text-[var(--md-sys-color-on-surface-variant)] flex items-center space-x-1">
                <IndianRupee className="w-3.5 h-3.5 text-gray-400" />
                <span>Original Price (₹)</span>
              </label>
              <input
                type="number"
                min="0"
                value={originalPrice}
                onChange={(e) => setOriginalPrice(e.target.value)}
                className="w-full p-2.5 bg-[var(--md-sys-color-surface-container-high)] rounded-xl text-xs text-[var(--md-sys-color-on-surface)] border-none outline-none"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold text-[var(--md-sys-color-on-surface-variant)] flex items-center space-x-1">
                <Calendar className="w-3.5 h-3.5 text-indigo-500" />
                <span>Validity (Days)</span>
              </label>
              <input
                type="number"
                min="1"
                value={validityDays}
                onChange={(e) => setValidityDays(e.target.value)}
                className="w-full p-2.5 bg-[var(--md-sys-color-surface-container-high)] rounded-xl text-xs text-[var(--md-sys-color-on-surface)] font-bold border-none outline-none"
              />
            </div>
          </div>

          {/* Instructor Attribution */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-xs font-bold text-[var(--md-sys-color-on-surface-variant)] flex items-center space-x-1">
                <UserCheck className="w-3.5 h-3.5 text-blue-500" />
                <span>Primary Instructor Name</span>
              </label>
              <input
                type="text"
                value={instructorName}
                onChange={(e) => setInstructorName(e.target.value)}
                placeholder="e.g. Sanju Kumar"
                className="w-full p-2.5 bg-[var(--md-sys-color-surface-container-high)] rounded-xl text-xs text-[var(--md-sys-color-on-surface)] border-none outline-none"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold text-[var(--md-sys-color-on-surface-variant)] block">
                Instructor Designation
              </label>
              <input
                type="text"
                value={instructorDesignation}
                onChange={(e) => setInstructorDesignation(e.target.value)}
                placeholder="e.g. Senior Faculty - Mathematics"
                className="w-full p-2.5 bg-[var(--md-sys-color-surface-container-high)] rounded-xl text-xs text-[var(--md-sys-color-on-surface)] border-none outline-none"
              />
            </div>
          </div>

          {/* Banner & Thumbnail URLs with Presets */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-[var(--md-sys-color-on-surface-variant)] flex items-center space-x-1">
              <ImageIcon className="w-3.5 h-3.5 text-purple-500" />
              <span>Banner & Card Media</span>
            </label>
            <input
              type="text"
              value={bannerUrl}
              onChange={(e) => {
                setBannerUrl(e.target.value);
                setThumbnailUrl(e.target.value);
              }}
              placeholder="Paste banner image URL (Unsplash or custom CDN)"
              className="w-full p-2.5 bg-[var(--md-sys-color-surface-container-high)] rounded-xl text-xs text-[var(--md-sys-color-on-surface)] border-none outline-none font-mono text-[11px]"
            />
            {/* Quick preset selector */}
            <div className="flex items-center space-x-2 pt-1">
              <span className="text-[10px] text-[var(--md-sys-color-on-surface-variant)]">Presets:</span>
              {PRESET_BANNERS.map((preset, idx) => (
                <button
                  type="button"
                  key={idx}
                  onClick={() => {
                    setBannerUrl(preset);
                    setThumbnailUrl(preset);
                  }}
                  className={`w-12 h-6 rounded-md overflow-hidden border-2 transition cursor-pointer ${
                    bannerUrl === preset ? 'border-[var(--md-sys-color-primary)] ring-2 ring-[var(--md-sys-color-primary)]/40' : 'border-transparent opacity-60 hover:opacity-100'
                  }`}
                >
                  <img src={preset} alt="" className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
          </div>

          {/* Publish Status Toggle */}
          <div className="flex items-center justify-between p-3.5 rounded-2xl bg-[var(--md-sys-color-surface-container-high)]">
            <div className="flex items-center space-x-2.5">
              <CheckCircle className={`w-4 h-4 ${isPublished ? 'text-emerald-500' : 'text-gray-400'}`} />
              <div>
                <p className="text-xs font-bold text-[var(--md-sys-color-on-surface)]">
                  {isPublished ? 'Batch is Active & Published' : 'Batch is Draft (Hidden from Catalog)'}
                </p>
                <p className="text-[11px] text-[var(--md-sys-color-on-surface-variant)]">
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
                  : 'bg-[var(--md-sys-color-surface-container-highest)] text-[var(--md-sys-color-on-surface-variant)]'
              }`}
            >
              {isPublished ? 'Active' : 'Draft'}
            </button>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end space-x-3 pt-4 border-t border-[var(--md-sys-color-outline-variant)]/20">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2.5 rounded-full text-xs font-bold bg-[var(--md-sys-color-surface-container-highest)] text-[var(--md-sys-color-on-surface)] hover:opacity-80 transition border-none outline-none cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-6 py-2.5 m3-btn-filled text-xs font-bold shadow-md border-none outline-none cursor-pointer flex items-center space-x-1.5"
            >
              <Sparkles className="w-4 h-4" />
              <span>{batchToEdit ? 'Save Changes' : 'Create & Author Batch'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
