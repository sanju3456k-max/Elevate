import React, { useState, useMemo, useRef } from 'react';
import {
  Image as ImageIcon,
  Sparkles,
  Check,
  RefreshCw,
  Wrench,
  Link,
  Layers,
  ChevronDown,
  ChevronUp,
  Eye,
  Upload,
} from 'lucide-react';
import { extractGoogleDriveId } from '../../../lms/security';

export interface BatchBannerPreset {
  id: string;
  title: string;
  category: 'Complete Course' | 'TGT Maths';
  url: string;
  thumbUrl: string;
}

export const PRESET_BATCH_BANNERS: BatchBannerPreset[] = [
  {
    id: 'preset-complete-coral',
    title: 'Complete Course Batch (Coral)',
    category: 'Complete Course',
    url: '/assets/batch-banners/batch-banner-1.jpg',
    thumbUrl: '/assets/batch-banners/batch-banner-1.jpg',
  },
  {
    id: 'preset-complete-yellow',
    title: 'Complete Course Batch (Yellow)',
    category: 'Complete Course',
    url: '/assets/batch-banners/batch-banner-2.jpg',
    thumbUrl: '/assets/batch-banners/batch-banner-2.jpg',
  },
  {
    id: 'preset-tgt-math-sketch',
    title: 'Math for TGT Exam (Sketch)',
    category: 'TGT Maths',
    url: '/assets/batch-banners/batch-banner-3.jpg',
    thumbUrl: '/assets/batch-banners/batch-banner-3.jpg',
  },
  {
    id: 'preset-tgt-maths-green',
    title: 'Maths for TGT Exam (Chalkboard)',
    category: 'TGT Maths',
    url: '/assets/batch-banners/batch-banner-4.jpg',
    thumbUrl: '/assets/batch-banners/batch-banner-4.jpg',
  },
];

export const DEFAULT_HIGH_RES_BANNER = PRESET_BATCH_BANNERS[0].url;

interface BatchThumbnailPickerProps {
  value: string;
  onChange: (url: string) => void;
  label?: string;
  helperText?: string;
  previewTitle?: string;
  previewCategory?: string;
}

export const BatchThumbnailPicker: React.FC<BatchThumbnailPickerProps> = ({
  value,
  onChange,
  label = 'Batch Preview Thumbnail & Course Banner (1200 × 500 px)',
  helperText = 'Select from curated Ultra-HD presets or paste custom URL. Unified 1200 × 500 px (12:5 ratio) renders identically in batch cards and Home Hero banner.',
  previewTitle,
  previewCategory,
}) => {
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [isUrlInputOpen, setIsUrlInputOpen] = useState<boolean>(false);
  const [customUrlInput, setCustomUrlInput] = useState<string>('');
  const [hasRepairNotice, setHasRepairNotice] = useState<boolean>(false);
  const [imageLoadError, setImageLoadError] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const activeUrl = value && value.trim() ? value.trim() : DEFAULT_HIGH_RES_BANNER;

  const categories = ['All', 'Complete Course', 'TGT Maths'];

  const filteredPresets = useMemo(() => {
    if (selectedCategory === 'All') return PRESET_BATCH_BANNERS;
    return PRESET_BATCH_BANNERS.filter((p) => p.category === selectedCategory);
  }, [selectedCategory]);

  const handleRepairToDefault = () => {
    onChange(DEFAULT_HIGH_RES_BANNER);
    setImageLoadError(false);
    setHasRepairNotice(true);
    setTimeout(() => setHasRepairNotice(false), 3000);
  };

  const handleSelectPreset = (preset: BatchBannerPreset) => {
    onChange(preset.url);
    setImageLoadError(false);
  };

  const handleApplyCustomUrl = () => {
    const raw = customUrlInput.trim();
    if (!raw) return;
    const driveId = extractGoogleDriveId(raw);
    const resolvedUrl = driveId
      ? `https://lh3.googleusercontent.com/d/${encodeURIComponent(driveId)}=s1920`
      : raw;
    onChange(resolvedUrl);
    setCustomUrlInput('');
    setIsUrlInputOpen(false);
    setImageLoadError(false);
  };

  const handleManualFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = typeof reader.result === 'string' ? reader.result : '';
      if (!dataUrl) return;
      const img = new Image();
      img.onload = () => {
        const maxW = 1200;
        const scale = img.width > maxW ? maxW / img.width : 1;
        const targetW = Math.max(1, Math.round(img.width * scale));
        const targetH = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = targetW;
        canvas.height = targetH;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, targetW, targetH);
          const compressed = canvas.toDataURL('image/jpeg', 0.86);
          onChange(compressed);
        } else {
          onChange(dataUrl);
        }
        setImageLoadError(false);
      };
      img.onerror = () => {
        onChange(dataUrl);
        setImageLoadError(false);
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="space-y-3.5 pt-1">
      {/* Label and Repair Header */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <label className="text-xs font-bold text-[var(--md-sys-color-on-surface)] flex items-center space-x-1.5">
            <ImageIcon className="w-4 h-4 text-[#0b57d0] dark:text-[#a8c7fa]" />
            <span>{label}</span>
          </label>
          {helperText && (
            <p className="text-[10px] text-[var(--md-sys-color-on-surface-variant)] mt-0.5">
              {helperText}
            </p>
          )}
        </div>

        {/* Thumbnail Repair, Upload & Paste URL Buttons */}
        <div className="flex items-center flex-wrap gap-1.5">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleManualFileSelect}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-500/12 hover:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30 transition flex items-center space-x-1 cursor-pointer"
            title="Choose custom thumbnail image from your device"
          >
            <Upload className="w-3 h-3" />
            <span>Select Image</span>
          </button>

          <button
            type="button"
            onClick={handleRepairToDefault}
            className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-[#0b57d0]/10 hover:bg-[#0b57d0]/20 text-[#0b57d0] dark:text-[#a8c7fa] border border-[#0b57d0]/30 transition flex items-center space-x-1 cursor-pointer"
            title="Repair thumbnail: instantly resets to Ultra-HD Default pic"
          >
            <Wrench className="w-3 h-3" />
            <span>Repair to HD Default</span>
          </button>

          <button
            type="button"
            onClick={() => setIsUrlInputOpen(!isUrlInputOpen)}
            className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-[var(--md-sys-color-surface-container-high)] text-[var(--md-sys-color-on-surface-variant)] hover:bg-[var(--md-sys-color-surface-container-highest)] border border-[var(--md-sys-color-outline-variant)]/30 transition flex items-center space-x-1 cursor-pointer"
          >
            <Link className="w-3 h-3" />
            <span>{isUrlInputOpen ? 'Close URL' : 'Custom URL'}</span>
          </button>
        </div>
      </div>

      {hasRepairNotice && (
        <div className="p-2 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-700 dark:text-emerald-300 text-[11px] font-bold flex items-center space-x-1.5 animate-fade-in">
          <Check className="w-3.5 h-3.5" />
          <span>✅ Thumbnail successfully repaired to Ultra-HD Default!</span>
        </div>
      )}

      {/* Live 1200x500 Thumbnail Preview Card */}
      <div
        className="relative rounded-2xl overflow-hidden aspect-[1200/500] w-full bg-slate-900 border border-[var(--md-sys-color-outline-variant)]/30 shadow-md group"
        style={{ aspectRatio: '1200 / 500' }}
      >
        <img
          src={imageLoadError ? DEFAULT_HIGH_RES_BANNER : activeUrl}
          alt="Thumbnail Preview"
          className="w-full h-full object-cover transition duration-300 group-hover:scale-105"
          onError={() => {
            setImageLoadError(true);
          }}
        />

        {/* Gradient Overlay & Badges */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/25 to-black/30 flex flex-col justify-between p-3.5 pointer-events-none">
          <div className="flex items-center justify-between">
            <span className="px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-black/60 backdrop-blur-md text-emerald-400 border border-emerald-400/30 flex items-center space-x-1">
              <Sparkles className="w-2.5 h-2.5" />
              <span>1200 × 500 px Ultra-HD Preview</span>
            </span>

            {previewCategory && (
              <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-white/20 backdrop-blur-md text-white border border-white/20">
                {previewCategory}
              </span>
            )}
          </div>

          <div>
            <p className="text-white text-xs font-black drop-shadow-md truncate max-w-full">
              {previewTitle || 'Batch Card Live Preview'}
            </p>
            <p className="text-[10px] text-white/80 font-medium">
              1200 × 500 px (12:5 Ratio) • Exact 1:1 Match with Home Banner & Batch Cards
            </p>
          </div>
        </div>

        {/* Quick Quick-Switch button on hover */}
        <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            type="button"
            onClick={handleRepairToDefault}
            className="p-1.5 rounded-xl bg-black/70 hover:bg-black text-white text-[10px] font-bold backdrop-blur-md border border-white/20 flex items-center space-x-1 cursor-pointer shadow-lg"
          >
            <RefreshCw className="w-3 h-3" />
            <span>Reset HD</span>
          </button>
        </div>
      </div>

      {/* Custom URL Input Section (div instead of nested form so outer modal form doesn't break it) */}
      {isUrlInputOpen && (
        <div className="flex items-center space-x-2 animate-fade-in">
          <input
            type="text"
            value={customUrlInput}
            onChange={(e) => setCustomUrlInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                e.stopPropagation();
                handleApplyCustomUrl();
              }
            }}
            placeholder="Paste image URL or Google Drive link (https://...)"
            className="flex-1 px-3 py-2 rounded-xl bg-[var(--md-sys-color-surface-container-high)] text-xs text-[var(--md-sys-color-on-surface)] border border-[var(--md-sys-color-outline-variant)]/40 outline-none font-mono text-[11px]"
          />
          <button
            type="button"
            onClick={handleApplyCustomUrl}
            className="px-3 py-2 rounded-xl bg-[#0b57d0] text-white text-xs font-bold border-none cursor-pointer hover:bg-[#0842a0] transition"
          >
            Apply
          </button>
        </div>
      )}

      {/* Preset Category Filter Chips */}
      <div className="space-y-2 pt-1">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-bold text-[var(--md-sys-color-on-surface-variant)] flex items-center space-x-1">
            <Layers className="w-3 h-3 text-[#0b57d0]" />
            <span>Default High Quality Presets ({PRESET_BATCH_BANNERS.length} Curated)</span>
          </span>
          <span className="text-[9px] text-[var(--md-sys-color-on-surface-variant)]">
            Click any pic to apply instantly
          </span>
        </div>

        <div className="flex items-center space-x-1.5 overflow-x-auto pb-1 scrollbar-none">
          {categories.map((cat) => (
            <button
              type="button"
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-2.5 py-1 rounded-full text-[10px] font-bold whitespace-nowrap transition border-none cursor-pointer ${
                selectedCategory === cat
                  ? 'bg-[#0b57d0] text-white shadow-xs'
                  : 'bg-[var(--md-sys-color-surface-container-high)] text-[var(--md-sys-color-on-surface-variant)] hover:bg-[var(--md-sys-color-surface-container-highest)]'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Presets Horizontal / Grid Gallery */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 max-h-56 overflow-y-auto pr-1">
          {filteredPresets.map((preset) => {
            const isSelected = activeUrl === preset.url;
            return (
              <div
                key={preset.id}
                onClick={() => handleSelectPreset(preset)}
                className={`relative rounded-xl overflow-hidden aspect-[1200/500] cursor-pointer border-2 transition-all transform hover:scale-[1.02] ${
                  isSelected
                    ? 'border-[#0b57d0] ring-2 ring-[#0b57d0]/40 shadow-sm'
                    : 'border-transparent opacity-75 hover:opacity-100'
                }`}
                style={{ aspectRatio: '1200 / 500' }}
                title={`${preset.title} (${preset.category})`}
              >
                <img
                  src={preset.thumbUrl}
                  alt={preset.title}
                  className="w-full h-full object-cover"
                  loading="lazy"
                />

                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent flex flex-col justify-end p-1.5">
                  <span className="text-[9px] font-bold text-white leading-tight truncate drop-shadow-sm">
                    {preset.title}
                  </span>
                </div>

                {isSelected && (
                  <div className="absolute top-1 right-1 w-4 h-4 rounded-full bg-[#0b57d0] text-white flex items-center justify-center shadow-md">
                    <Check className="w-2.5 h-2.5 stroke-[3]" />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
