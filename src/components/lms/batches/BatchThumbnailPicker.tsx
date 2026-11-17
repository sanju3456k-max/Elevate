import React, { useState, useMemo } from 'react';
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
} from 'lucide-react';

export interface BatchBannerPreset {
  id: string;
  title: string;
  category: 'Math & Calculus' | 'Physics & Tech' | 'Olympiad & Elite' | 'Study & Practice';
  url: string;
  thumbUrl: string;
}

export const PRESET_BATCH_BANNERS: BatchBannerPreset[] = [
  {
    id: 'preset-math-calc-3d',
    title: 'Calculus & 3D Vector Geometry',
    category: 'Math & Calculus',
    url: 'https://images.unsplash.com/photo-1635070041078-e363dbe005cb?w=1920&auto=format&fit=crop&q=85',
    thumbUrl: 'https://images.unsplash.com/photo-1635070041078-e363dbe005cb?w=600&auto=format&fit=crop&q=80',
  },
  {
    id: 'preset-math-chalkboard',
    title: 'Algebra & Coordinate Geometry',
    category: 'Math & Calculus',
    url: 'https://images.unsplash.com/photo-1509228468518-180dd4864904?w=1920&auto=format&fit=crop&q=85',
    thumbUrl: 'https://images.unsplash.com/photo-1509228468518-180dd4864904?w=600&auto=format&fit=crop&q=80',
  },
  {
    id: 'preset-math-waves',
    title: 'Differential Equations & Waves',
    category: 'Math & Calculus',
    url: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=1920&auto=format&fit=crop&q=85',
    thumbUrl: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=600&auto=format&fit=crop&q=80',
  },
  {
    id: 'preset-math-polyhedra',
    title: 'Abstract Polyhedra & Matrices',
    category: 'Math & Calculus',
    url: 'https://images.unsplash.com/photo-1634017839464-5c339ebe3cb4?w=1920&auto=format&fit=crop&q=85',
    thumbUrl: 'https://images.unsplash.com/photo-1634017839464-5c339ebe3cb4?w=600&auto=format&fit=crop&q=80',
  },
  {
    id: 'preset-physics-quantum',
    title: 'Quantum Mechanics & Microelectronics',
    category: 'Physics & Tech',
    url: 'https://images.unsplash.com/photo-1518770660439-4636190af475?w=1920&auto=format&fit=crop&q=85',
    thumbUrl: 'https://images.unsplash.com/photo-1518770660439-4636190af475?w=600&auto=format&fit=crop&q=80',
  },
  {
    id: 'preset-physics-astro',
    title: 'Astrophysics & Gravitation',
    category: 'Physics & Tech',
    url: 'https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=1920&auto=format&fit=crop&q=85',
    thumbUrl: 'https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=600&auto=format&fit=crop&q=80',
  },
  {
    id: 'preset-tech-code',
    title: 'High-Performance Computational Math',
    category: 'Physics & Tech',
    url: 'https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?w=1920&auto=format&fit=crop&q=85',
    thumbUrl: 'https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?w=600&auto=format&fit=crop&q=80',
  },
  {
    id: 'preset-tech-network',
    title: 'Digital Networks & AI Algorithms',
    category: 'Physics & Tech',
    url: 'https://images.unsplash.com/photo-1516321318423-f06f85e504b3?w=1920&auto=format&fit=crop&q=85',
    thumbUrl: 'https://images.unsplash.com/photo-1516321318423-f06f85e504b3?w=600&auto=format&fit=crop&q=80',
  },
  {
    id: 'preset-olympiad-hall',
    title: 'Olympiad & Advanced Lecture Hall',
    category: 'Olympiad & Elite',
    url: 'https://images.unsplash.com/photo-1580582932707-520aed937b7b?w=1920&auto=format&fit=crop&q=85',
    thumbUrl: 'https://images.unsplash.com/photo-1580582932707-520aed937b7b?w=600&auto=format&fit=crop&q=80',
  },
  {
    id: 'preset-olympiad-cohort',
    title: 'Competitive Coaching Cohort',
    category: 'Olympiad & Elite',
    url: 'https://images.unsplash.com/photo-1509062522246-3755977927d7?w=1920&auto=format&fit=crop&q=85',
    thumbUrl: 'https://images.unsplash.com/photo-1509062522246-3755977927d7?w=600&auto=format&fit=crop&q=80',
  },
  {
    id: 'preset-olympiad-target',
    title: 'All India Rank Target Batch',
    category: 'Olympiad & Elite',
    url: 'https://images.unsplash.com/photo-1501504905252-473c47e087f8?w=1920&auto=format&fit=crop&q=85',
    thumbUrl: 'https://images.unsplash.com/photo-1501504905252-473c47e087f8?w=600&auto=format&fit=crop&q=80',
  },
  {
    id: 'preset-study-desk',
    title: 'Intensive Practice & Mock Tests',
    category: 'Study & Practice',
    url: 'https://images.unsplash.com/photo-1434030216411-0b793f4b4173?w=1920&auto=format&fit=crop&q=85',
    thumbUrl: 'https://images.unsplash.com/photo-1434030216411-0b793f4b4173?w=600&auto=format&fit=crop&q=80',
  },
  {
    id: 'preset-study-books',
    title: 'Complete Reference & Standard Notes',
    category: 'Study & Practice',
    url: 'https://images.unsplash.com/photo-1456513080510-7bf3a84b82f8?w=1920&auto=format&fit=crop&q=85',
    thumbUrl: 'https://images.unsplash.com/photo-1456513080510-7bf3a84b82f8?w=600&auto=format&fit=crop&q=80',
  },
  {
    id: 'preset-study-exam',
    title: 'JEE / Olympiad Mock Test Series',
    category: 'Study & Practice',
    url: 'https://images.unsplash.com/photo-1606326608606-aa0b62935f2b?w=1920&auto=format&fit=crop&q=85',
    thumbUrl: 'https://images.unsplash.com/photo-1606326608606-aa0b62935f2b?w=600&auto=format&fit=crop&q=80',
  },
  {
    id: 'preset-study-workspace',
    title: 'Daily Revision & Doubt Clearing',
    category: 'Study & Practice',
    url: 'https://images.unsplash.com/photo-1517842645767-c639042777db?w=1920&auto=format&fit=crop&q=85',
    thumbUrl: 'https://images.unsplash.com/photo-1517842645767-c639042777db?w=600&auto=format&fit=crop&q=80',
  },
  {
    id: 'preset-physics-chemistry',
    title: 'Advanced Science & Laboratory',
    category: 'Physics & Tech',
    url: 'https://images.unsplash.com/photo-1532094349884-543bc11b234d?w=1920&auto=format&fit=crop&q=85',
    thumbUrl: 'https://images.unsplash.com/photo-1532094349884-543bc11b234d?w=600&auto=format&fit=crop&q=80',
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
  label = 'Batch Preview Thumbnail & Course Banner',
  helperText = 'Select from curated Ultra-HD presets or repair with one click for crystal-clear batch cards.',
  previewTitle,
  previewCategory,
}) => {
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [isUrlInputOpen, setIsUrlInputOpen] = useState<boolean>(false);
  const [customUrlInput, setCustomUrlInput] = useState<string>('');
  const [hasRepairNotice, setHasRepairNotice] = useState<boolean>(false);
  const [imageLoadError, setImageLoadError] = useState<boolean>(false);

  const activeUrl = value && value.trim() ? value.trim() : DEFAULT_HIGH_RES_BANNER;

  const categories = ['All', 'Math & Calculus', 'Physics & Tech', 'Olympiad & Elite', 'Study & Practice'];

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

  const handleApplyCustomUrl = (e: React.FormEvent) => {
    e.preventDefault();
    if (customUrlInput.trim()) {
      onChange(customUrlInput.trim());
      setCustomUrlInput('');
      setIsUrlInputOpen(false);
      setImageLoadError(false);
    }
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

        {/* Thumbnail Repair Button (थंबनेल रिपेयर ऑप्शन) */}
        <div className="flex items-center space-x-1.5">
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

      {/* Live 16:9 Thumbnail Preview Card */}
      <div className="relative rounded-2xl overflow-hidden aspect-video w-full bg-slate-900 border border-[var(--md-sys-color-outline-variant)]/30 shadow-md group">
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
              <span>Ultra-HD 4K Preview</span>
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
              16:9 Ratio • High Quality Crisp Display for Student Catalog
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

      {/* Custom URL Input Section */}
      {isUrlInputOpen && (
        <form onSubmit={handleApplyCustomUrl} className="flex items-center space-x-2 animate-fade-in">
          <input
            type="url"
            value={customUrlInput}
            onChange={(e) => setCustomUrlInput(e.target.value)}
            placeholder="Paste custom image URL (https://...)"
            className="flex-1 px-3 py-2 rounded-xl bg-[var(--md-sys-color-surface-container-high)] text-xs text-[var(--md-sys-color-on-surface)] border border-[var(--md-sys-color-outline-variant)]/40 outline-none font-mono text-[11px]"
          />
          <button
            type="submit"
            className="px-3 py-2 rounded-xl bg-[#0b57d0] text-white text-xs font-bold border-none cursor-pointer hover:bg-[#0842a0] transition"
          >
            Apply
          </button>
        </form>
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
                className={`relative rounded-xl overflow-hidden aspect-video cursor-pointer border-2 transition-all transform hover:scale-[1.02] ${
                  isSelected
                    ? 'border-[#0b57d0] ring-2 ring-[#0b57d0]/40 shadow-sm'
                    : 'border-transparent opacity-75 hover:opacity-100'
                }`}
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
