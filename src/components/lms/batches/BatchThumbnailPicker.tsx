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
  label = 'Course Banner & Thumbnail',
  helperText = '',
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
            className="px-3 py-1.5 rounded-full text-[11px] font-bold bg-[#e8f0fe] hover:bg-[#d3e3fd] text-[#0b57d0] dark:bg-[#0b57d0]/20 dark:hover:bg-[#0b57d0]/30 dark:text-[#a8c7fa] border-0 ring-0 transition flex items-center space-x-1.5 cursor-pointer"
            title="Choose custom thumbnail image from your device"
          >
            <Upload className="w-3 h-3" />
            <span>Select Image</span>
          </button>

          <button
            type="button"
            onClick={handleRepairToDefault}
            className="px-3 py-1.5 rounded-full text-[11px] font-bold bg-[#f1f4f9] hover:bg-[#e4e9f2] text-slate-700 dark:bg-zinc-800 dark:hover:bg-zinc-700 dark:text-zinc-200 border-0 ring-0 transition flex items-center space-x-1.5 cursor-pointer"
            title="Reset thumbnail to default HD banner"
          >
            <Wrench className="w-3 h-3 text-[#0b57d0] dark:text-[#a8c7fa]" />
            <span>Repair to HD</span>
          </button>

          <button
            type="button"
            onClick={() => setIsUrlInputOpen(!isUrlInputOpen)}
            className={`px-3 py-1.5 rounded-full text-[11px] font-bold border-0 ring-0 transition flex items-center space-x-1.5 cursor-pointer ${
              isUrlInputOpen
                ? 'bg-[#0b57d0] text-white dark:bg-[#a8c7fa] dark:text-[#041e49]'
                : 'bg-[#f1f4f9] hover:bg-[#e4e9f2] text-slate-700 dark:bg-zinc-800 dark:hover:bg-zinc-700 dark:text-zinc-200'
            }`}
          >
            <Link className="w-3 h-3" />
            <span>{isUrlInputOpen ? 'Close URL' : 'Custom URL'}</span>
          </button>
        </div>
      </div>

      {hasRepairNotice && (
        <div className="p-2.5 rounded-2xl bg-[#e8f0fe] dark:bg-[#0b57d0]/20 border-0 ring-0 text-[#0b57d0] dark:text-[#a8c7fa] text-[11px] font-bold flex items-center space-x-1.5 animate-fade-in">
          <Check className="w-3.5 h-3.5" />
          <span>Banner reset to default HD</span>
        </div>
      )}

      {/* Live 12:5 Thumbnail Preview Card */}
      <div
        className="relative rounded-2xl overflow-hidden aspect-[1200/500] w-full bg-slate-900 border-0 ring-0 shadow-sm group"
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

        {/* Minimal Gradient Overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/15 to-transparent flex flex-col justify-between p-3 pointer-events-none">
          <div className="flex items-center justify-between gap-2">
            <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-black/50 backdrop-blur-md text-white/90 border-0">
              12:5 Preview
            </span>

            {previewCategory && (
              <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-white/20 backdrop-blur-md text-white border-0">
                {previewCategory}
              </span>
            )}
          </div>

          <div>
            <p className="text-white text-xs font-bold drop-shadow-sm truncate max-w-full">
              {previewTitle || 'Batch Banner Preview'}
            </p>
          </div>
        </div>

        {/* Quick Reset button on hover */}
        <div className="absolute top-2.5 right-2.5 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            type="button"
            onClick={handleRepairToDefault}
            className="p-1.5 rounded-full bg-black/65 hover:bg-black text-white text-[10px] font-bold backdrop-blur-md border-0 ring-0 flex items-center space-x-1 cursor-pointer"
          >
            <RefreshCw className="w-3 h-3" />
            <span>Reset</span>
          </button>
        </div>
      </div>

      {/* Custom URL Input Section */}
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
            placeholder="Paste image URL or Google Drive link"
            className="flex-1 px-3.5 py-2 rounded-2xl bg-[#f1f4f9] dark:bg-zinc-900 text-xs text-slate-900 dark:text-zinc-100 border-0 ring-0 outline-none focus:ring-2 focus:ring-[#0b57d0]/30 font-mono text-[11px]"
          />
          <button
            type="button"
            onClick={handleApplyCustomUrl}
            className="px-3.5 py-2 rounded-full bg-[#0b57d0] dark:bg-[#a8c7fa] text-white dark:text-[#041e49] text-xs font-bold border-0 ring-0 cursor-pointer hover:bg-[#0842a0] transition"
          >
            Apply
          </button>
        </div>
      )}

      {/* Preset Category Filter Chips */}
      <div className="space-y-2 pt-0.5">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-bold text-slate-700 dark:text-zinc-300 flex items-center space-x-1.5">
            <Layers className="w-3.5 h-3.5 text-[#0b57d0] dark:text-[#a8c7fa]" />
            <span>Presets</span>
          </span>
        </div>

        <div className="flex items-center space-x-1.5 overflow-x-auto pb-1 scrollbar-none">
          {categories.map((cat) => (
            <button
              type="button"
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-3 py-1 rounded-full text-[11px] font-bold whitespace-nowrap transition border-0 ring-0 cursor-pointer ${
                selectedCategory === cat
                  ? 'bg-[#0b57d0] text-white dark:bg-[#a8c7fa] dark:text-[#041e49]'
                  : 'bg-[#f1f4f9] text-slate-700 hover:bg-[#e4e9f2] dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Presets Grid Gallery (Borderless & Ringless) */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-0.5 max-h-56 overflow-y-auto">
          {filteredPresets.map((preset) => {
            const isSelected = activeUrl === preset.url;
            return (
              <div
                key={preset.id}
                onClick={() => handleSelectPreset(preset)}
                className={`relative rounded-xl overflow-hidden aspect-[1200/500] cursor-pointer border-0 ring-0 transition-all ${
                  isSelected
                    ? 'opacity-100 shadow-md scale-[1.01]'
                    : 'opacity-75 hover:opacity-100'
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

                <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-transparent to-transparent flex flex-col justify-end p-1.5">
                  <span className="text-[9px] font-bold text-white leading-tight truncate drop-shadow-sm">
                    {preset.title}
                  </span>
                </div>

                {isSelected && (
                  <div className="absolute top-1.5 right-1.5 w-4.5 h-4.5 rounded-full bg-[#0b57d0] text-white flex items-center justify-center shadow-sm">
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
