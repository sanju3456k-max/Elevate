import React, { useState, useMemo, useEffect } from 'react';
import {
  ArrowLeft,
  Download,
  ShieldCheck,
  Search,
  Building2,
  CheckCircle2,
  Share2,
  Check,
  Mail,
  Phone,
  Globe,
  MapPin,
  Smartphone,
  BookOpen,
  BarChart3,
  Eye,
  Edit3,
  Save,
  Loader2,
  Upload,
  Plus,
  X,
  ExternalLink,
} from 'lucide-react';
import {
  STATIC_INSTITUTES_REGISTRY,
  type StaticInstituteEntry,
  type StorePageConfig,
} from '../../config/institutesRegistry';
import {
  fetchStorefrontOverride,
  saveStorefrontOverride,
  mergeInstituteWithStorefrontOverride,
  type StorefrontOverrideData,
} from '../../lib/storefrontService';

interface InstituteAppStoreEditorConfig {
  enabled: boolean;
  institute: StaticInstituteEntry;
  userEmail?: string;
}

interface InstituteAppStorePageProps {
  /** Optional institute slug (`/apps/<slug>`). When omitted, shows the `/apps` directory. */
  selectedSlug?: string | null;
  onNavigateHome?: () => void;
  onSelectInstituteSlug?: (slug: string | null) => void;
  /** When passed from Master Console, renders the identical page with Preview / Edit & Save controls. */
  editorMode?: InstituteAppStoreEditorConfig;
}

async function compressScreenshotToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const maxW = 540;
        const scale = Math.min(1, maxW / Math.max(1, img.width));
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Canvas unavailable'));
          return;
        }
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', 0.78));
      };
      img.onerror = () => reject(new Error('Invalid image file'));
      img.src = String(reader.result || '');
    };
    reader.onerror = () => reject(new Error('Could not read file'));
    reader.readAsDataURL(file);
  });
}

export const InstituteAppStorePage: React.FC<InstituteAppStorePageProps> = ({
  selectedSlug,
  onNavigateHome = () => {},
  onSelectInstituteSlug = () => {},
  editorMode,
}) => {
  const isEditorCapable = Boolean(editorMode?.enabled);
  const [searchQuery, setSearchQuery] = useState('');
  const [copiedLink, setCopiedLink] = useState(false);

  // Live Firestore overrides keyed by institute ID
  const [overridesMap, setOverridesMap] = useState<Record<string, StorefrontOverrideData>>({});

  // Master Console Editor state
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveToast, setSaveToast] = useState<string | null>(null);
  const [newScreenshotUrl, setNewScreenshotUrl] = useState('');
  const [newHighlight, setNewHighlight] = useState('');

  const [draftAppName, setDraftAppName] = useState('');
  const [draftVersion, setDraftVersion] = useState('');
  const [draftStorePage, setDraftStorePage] = useState<StorePageConfig>({});

  const institutes = useMemo(() => {
    const list = [...STATIC_INSTITUTES_REGISTRY];
    list.sort((a, b) => (a.id === 'ws_primary' ? -1 : b.id === 'ws_primary' ? 1 : 0));
    return list.map((inst) => mergeInstituteWithStorefrontOverride(inst, overridesMap[inst.id] || null));
  }, [overridesMap]);

  const filteredInstitutes = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return institutes;
    return institutes.filter(
      (inst) =>
        inst.name.toLowerCase().includes(q) ||
        inst.slug.toLowerCase().includes(q) ||
        (inst.storePage?.tagline || '').toLowerCase().includes(q)
    );
  }, [institutes, searchQuery]);

  const activeApp: StaticInstituteEntry | null = useMemo(() => {
    if (isEditorCapable && editorMode?.institute) {
      const base = editorMode.institute;
      const merged = mergeInstituteWithStorefrontOverride(base, overridesMap[base.id] || null);
      return {
        ...merged,
        name: draftAppName.trim() ? draftAppName : merged.name,
        apkVersion: draftVersion.trim() ? draftVersion : merged.apkVersion,
        storePage: {
          ...(merged.storePage || {}),
          ...draftStorePage,
        },
      };
    }
    if (!selectedSlug) return null;
    const clean = selectedSlug.trim().toLowerCase();
    return (
      institutes.find((i) => i.slug.toLowerCase() === clean || i.id.toLowerCase() === clean) ||
      null
    );
  }, [institutes, selectedSlug, isEditorCapable, editorMode, overridesMap, draftAppName, draftVersion, draftStorePage]);

  // Fetch live storefront override when viewing an institute or opening Master Console editor
  useEffect(() => {
    let mounted = true;
    const targetInst = isEditorCapable
      ? editorMode?.institute
      : STATIC_INSTITUTES_REGISTRY.find(
          (i) =>
            selectedSlug &&
            (i.slug.toLowerCase() === selectedSlug.trim().toLowerCase() ||
              i.id.toLowerCase() === selectedSlug.trim().toLowerCase())
        );

    if (targetInst) {
      fetchStorefrontOverride(targetInst).then((ov) => {
        if (!mounted) return;
        if (ov) {
          setOverridesMap((prev) => ({ ...prev, [targetInst.id]: ov }));
        }
        if (isEditorCapable) {
          const merged = mergeInstituteWithStorefrontOverride(targetInst, ov);
          setDraftAppName(merged.name);
          setDraftVersion(merged.apkVersion || '1.0');
          setDraftStorePage({ ...(merged.storePage || {}) });
        }
      });
    } else if (!isEditorCapable) {
      // Directory view: load overrides for all institutes
      Promise.all(
        STATIC_INSTITUTES_REGISTRY.map(async (inst) => {
          const ov = await fetchStorefrontOverride(inst);
          return ov ? ([inst.id, ov] as const) : null;
        })
      ).then((results) => {
        if (!mounted) return;
        const next: Record<string, StorefrontOverrideData> = {};
        results.forEach((r) => {
          if (r) next[r[0]] = r[1];
        });
        if (Object.keys(next).length > 0) {
          setOverridesMap((prev) => ({ ...prev, ...next }));
        }
      });
    }

    return () => {
      mounted = false;
    };
  }, [selectedSlug, isEditorCapable, editorMode?.institute]);

  const toRootAssetUrl = (url?: string) => {
    if (!url) return '';
    return url.startsWith('./') ? `/${url.slice(2)}` : url;
  };

  const handleCopyShareLink = async (slug: string) => {
    const shareUrl = `${window.location.origin}/apps/${encodeURIComponent(slug)}`;
    let copied = false;
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(shareUrl);
        copied = true;
      }
    } catch {
      copied = false;
    }
    if (!copied) {
      try {
        const textarea = document.createElement('textarea');
        textarea.value = shareUrl;
        textarea.setAttribute('readonly', '');
        textarea.style.position = 'fixed';
        textarea.style.left = '-9999px';
        document.body.appendChild(textarea);
        textarea.select();
        copied = document.execCommand('copy');
        document.body.removeChild(textarea);
      } catch {
        copied = false;
      }
    }
    if (copied) {
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    }
  };

  const handleScreenshotUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    const current = draftStorePage.screenshots || [];
    const remaining = Math.max(0, 8 - current.length);
    const toProcess = files.slice(0, remaining);
    try {
      const compressed = await Promise.all(toProcess.map((f) => compressScreenshotToDataUrl(f)));
      setDraftStorePage((prev) => ({
        ...prev,
        screenshots: [...(prev.screenshots || []), ...compressed],
      }));
    } catch {
      setSaveToast('Could not process one of the selected images.');
    } finally {
      e.target.value = '';
    }
  };

  const handleAddScreenshotUrl = () => {
    const url = newScreenshotUrl.trim();
    if (!url) return;
    const current = draftStorePage.screenshots || [];
    if (current.length >= 8) {
      setSaveToast('Maximum 8 screenshots allowed.');
      return;
    }
    setDraftStorePage((prev) => ({
      ...prev,
      screenshots: [...current, url],
    }));
    setNewScreenshotUrl('');
  };

  const handleRemoveScreenshot = (idx: number) => {
    setDraftStorePage((prev) => ({
      ...prev,
      screenshots: (prev.screenshots || []).filter((_, i) => i !== idx),
    }));
  };

  const handleAddHighlight = () => {
    const text = newHighlight.trim();
    if (!text) return;
    setDraftStorePage((prev) => ({
      ...prev,
      highlights: [...(prev.highlights || []), text],
    }));
    setNewHighlight('');
  };

  const handleSaveChanges = async () => {
    if (!editorMode?.institute) return;
    setIsSaving(true);
    setSaveToast(null);
    try {
      const saved = await saveStorefrontOverride(editorMode.institute.id, {
        appName: draftAppName.trim() || editorMode.institute.name,
        apkVersion: draftVersion.trim() || editorMode.institute.apkVersion || '1.0',
        storePage: draftStorePage,
        updatedBy: editorMode.userEmail || '',
      });
      setOverridesMap((prev) => ({ ...prev, [editorMode.institute.id]: saved }));
      setIsEditing(false);
      setSaveToast('App Store Page published live!');
      setTimeout(() => setSaveToast(null), 3500);
    } catch (err: any) {
      setSaveToast(err?.message || 'Failed to save changes. Please verify Firestore rules.');
    } finally {
      setIsSaving(false);
    }
  };

  const renderAppIcon = (inst: StaticInstituteEntry, sizeClass = 'w-14 h-14') =>
    inst.logoUrl ? (
      <img
        src={toRootAssetUrl(inst.logoUrl)}
        alt={inst.name}
        className={`${sizeClass} rounded-2xl object-cover shrink-0 bg-white`}
      />
    ) : (
      <div
        className={`${sizeClass} rounded-2xl bg-blue-50 text-[#0b57d0] flex items-center justify-center shrink-0`}
      >
        <Building2 className="w-7 h-7" />
      </div>
    );

  // ============================================================================
  // DETAIL / MASTER CONSOLE PREVIEW-EDIT VIEW
  // ============================================================================
  if (activeApp) {
    const isPrimary = activeApp.id === 'ws_primary';
    const displayName =
      isPrimary && activeApp.name === 'Elevate' ? 'Elevate Labs Official App' : activeApp.name;
    const downloadHref = isPrimary ? '/elevate.apk' : toRootAssetUrl(activeApp.apkDownloadUrl);
    const sp = activeApp.storePage || {};
    const screenshots = sp.screenshots || [];

    return (
      <div className={`${isEditorCapable ? 'rounded-3xl border border-slate-200/80 dark:border-zinc-800 overflow-hidden bg-white text-slate-800' : 'min-h-screen w-full bg-white text-slate-800'} antialiased`}>
        {/* Sticky Minimal Top Navigation (or Master Console Editor Toolbar) */}
        <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-slate-200/60">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-3">
            {isEditorCapable ? (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsEditing(false)}
                  className={`px-3.5 py-1.5 rounded-full text-xs font-semibold flex items-center gap-1.5 border-0 cursor-pointer transition-colors ${
                    !isEditing
                      ? 'bg-[#0b57d0] text-white'
                      : 'bg-slate-100/90 hover:bg-slate-200/80 text-slate-700'
                  }`}
                >
                  <Eye className="w-3.5 h-3.5" />
                  <span>Preview</span>
                </button>
                <button
                  type="button"
                  onClick={() => setIsEditing(true)}
                  className={`px-3.5 py-1.5 rounded-full text-xs font-semibold flex items-center gap-1.5 border-0 cursor-pointer transition-colors ${
                    isEditing
                      ? 'bg-[#0b57d0] text-white'
                      : 'bg-slate-100/90 hover:bg-slate-200/80 text-slate-700'
                  }`}
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  <span>Edit Page</span>
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2 min-w-0">
                <button
                  type="button"
                  onClick={() => onSelectInstituteSlug(null)}
                  className="px-3.5 py-1.5 rounded-full bg-slate-100/90 hover:bg-slate-200/80 text-slate-700 text-xs font-medium flex items-center gap-1.5 border-0 cursor-pointer transition-colors shrink-0"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>All Apps</span>
                </button>
                <span className="text-xs text-slate-300 hidden sm:inline">/</span>
                <span className="text-xs font-medium text-slate-600 truncate hidden sm:inline">
                  {displayName}
                </span>
              </div>
            )}

            <div className="flex items-center gap-2 shrink-0">
              {isEditorCapable && (
                <>
                  <button
                    type="button"
                    onClick={handleSaveChanges}
                    disabled={isSaving}
                    className="px-4 py-1.5 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold flex items-center gap-1.5 border-0 cursor-pointer transition-colors disabled:opacity-50"
                  >
                    {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                    <span>{isSaving ? 'Publishing...' : 'Save & Publish'}</span>
                  </button>
                  <a
                    href={`/apps/${activeApp.slug}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-3 py-1.5 rounded-full bg-slate-100/90 hover:bg-slate-200/80 text-slate-700 text-xs font-medium hidden sm:inline-flex items-center gap-1.5 no-underline"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span>Live Page</span>
                  </a>
                </>
              )}

              <button
                type="button"
                onClick={() => handleCopyShareLink(activeApp.slug)}
                className="px-3.5 py-1.5 rounded-full bg-slate-100/90 hover:bg-slate-200/80 text-slate-700 text-xs font-medium flex items-center gap-1.5 border-0 cursor-pointer transition-colors"
              >
                {copiedLink ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Share2 className="w-3.5 h-3.5" />}
                <span>{copiedLink ? 'Link Copied' : 'Share Page'}</span>
              </button>

              {!isEditorCapable && (
                <button
                  type="button"
                  onClick={onNavigateHome}
                  className="px-3.5 py-1.5 rounded-full bg-transparent hover:bg-slate-100 text-slate-600 text-xs font-medium border-0 cursor-pointer transition-colors"
                >
                  Home
                </button>
              )}
            </div>
          </div>
        </header>

        {saveToast && (
          <div className="max-w-5xl mx-auto px-4 sm:px-6 pt-4">
            <div className="px-4 py-2.5 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-medium flex items-center justify-between">
              <span>{saveToast}</span>
              <button
                type="button"
                onClick={() => setSaveToast(null)}
                className="p-0.5 bg-transparent border-0 cursor-pointer text-emerald-700"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}

        {/* Main Responsive Container: Transparent on Pure White Body */}
        <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8 sm:py-10">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-start">
            {/* Left Primary Column */}
            <div className="lg:col-span-8 space-y-9">
              {/* Hero App Header */}
              <section className="flex items-start sm:items-center gap-4 pb-7 border-b border-slate-200/60">
                {renderAppIcon(activeApp, 'w-18 h-18 sm:w-20 sm:h-20')}
                <div className="space-y-1.5 min-w-0 flex-1">
                  {isEditing ? (
                    <div className="space-y-2.5">
                      <input
                        type="text"
                        value={draftAppName}
                        onChange={(e) => setDraftAppName(e.target.value)}
                        placeholder="App display name..."
                        className="w-full px-3.5 py-2 rounded-xl bg-slate-50 border border-slate-200 text-lg font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#0b57d0]"
                      />
                      <input
                        type="text"
                        value={draftStorePage.tagline || ''}
                        onChange={(e) =>
                          setDraftStorePage((prev) => ({ ...prev, tagline: e.target.value }))
                        }
                        placeholder="Short tagline..."
                        className="w-full px-3.5 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs sm:text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#0b57d0]"
                      />
                    </div>
                  ) : (
                    <>
                      <h1 className="text-xl sm:text-2xl font-semibold text-slate-900 tracking-tight leading-snug">
                        {displayName}
                      </h1>
                      <div className="flex flex-wrap items-center gap-2 text-xs text-[#0b57d0] font-medium">
                        <span>{isPrimary ? 'Elevate Labs' : activeApp.name}</span>
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-[11px] font-medium">
                          <ShieldCheck className="w-3 h-3" />
                          Verified Official Build
                        </span>
                      </div>
                      <p className="text-xs sm:text-sm text-slate-500">
                        {sp.tagline || `Official Android learning app for ${activeApp.name}`}
                      </p>
                    </>
                  )}
                </div>
              </section>

              {/* Minimal App Info Row + Borderless Download CTA */}
              <section className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
                {isEditing ? (
                  <div className="grid grid-cols-2 gap-3 w-full sm:w-auto">
                    <div>
                      <label className="block text-[11px] text-slate-500 mb-1">Version</label>
                      <input
                        type="text"
                        value={draftVersion}
                        onChange={(e) => setDraftVersion(e.target.value)}
                        placeholder="1.0"
                        className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-semibold text-slate-900"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] text-slate-500 mb-1">Download Size</label>
                      <input
                        type="text"
                        value={draftStorePage.apkSizeLabel || ''}
                        onChange={(e) =>
                          setDraftStorePage((prev) => ({ ...prev, apkSizeLabel: e.target.value }))
                        }
                        placeholder="19 MB"
                        className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-semibold text-slate-900"
                      />
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-3 gap-5 sm:gap-8 text-center sm:text-left">
                    <div>
                      <div className="text-sm sm:text-base font-semibold text-slate-900">
                        v{activeApp.apkVersion || '1.0'}
                      </div>
                      <div className="text-[11px] text-slate-400">Version</div>
                    </div>
                    <div className="border-l border-slate-200/70 pl-5 sm:pl-8">
                      <div className="text-sm sm:text-base font-semibold text-slate-900">
                        {sp.apkSizeLabel || '19 MB'}
                      </div>
                      <div className="text-[11px] text-slate-400">Download size</div>
                    </div>
                    <div className="border-l border-slate-200/70 pl-5 sm:pl-8">
                      <div className="text-sm sm:text-base font-semibold text-slate-900">
                        Android 7.0+
                      </div>
                      <div className="text-[11px] text-slate-400">Compatibility</div>
                    </div>
                  </div>
                )}

                {downloadHref && (
                  <a
                    href={downloadHref}
                    {...(isPrimary
                      ? { download: 'elevate.apk' }
                      : { target: '_blank', rel: 'noopener noreferrer' })}
                    className="w-full sm:w-auto px-7 py-3.5 rounded-2xl bg-[#0b57d0] hover:bg-[#0947a8] text-white text-sm font-semibold flex items-center justify-center gap-2.5 transition-all active:scale-[0.99] border-0 no-underline shrink-0"
                  >
                    <Download className="w-4 h-4" />
                    <span>Download Android App</span>
                  </a>
                )}
              </section>

              {/* Minimal Screenshots / App Preview */}
              <section className="space-y-3.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="text-base font-semibold text-slate-900">App Preview</h2>
                  {isEditing && (
                    <label className="px-3.5 py-1.5 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer">
                      <Upload className="w-3.5 h-3.5 text-[#0b57d0]" />
                      <span>Upload Screenshots</span>
                      <input
                        type="file"
                        accept="image/*"
                        multiple
                        onChange={handleScreenshotUpload}
                        className="hidden"
                      />
                    </label>
                  )}
                </div>

                {isEditing && (
                  <div className="flex gap-2">
                    <input
                      type="url"
                      value={newScreenshotUrl}
                      onChange={(e) => setNewScreenshotUrl(e.target.value)}
                      placeholder="Or paste screenshot image URL..."
                      className="flex-1 px-3.5 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#0b57d0]"
                    />
                    <button
                      type="button"
                      onClick={handleAddScreenshotUrl}
                      className="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold border-0 cursor-pointer flex items-center gap-1"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Add</span>
                    </button>
                  </div>
                )}

                <div className="flex gap-4 overflow-x-auto pb-2 snap-x snap-mandatory">
                  {screenshots.length > 0 ? (
                    screenshots.map((src, idx) => (
                      <div
                        key={`${src.slice(0, 32)}-${idx}`}
                        className="snap-start shrink-0 w-52 sm:w-60 aspect-[9/16] rounded-2xl overflow-hidden bg-transparent border border-slate-200/60 relative group"
                      >
                        <img
                          src={toRootAssetUrl(src)}
                          alt={`${displayName} screenshot ${idx + 1}`}
                          className="w-full h-full object-cover"
                        />
                        {isEditing && (
                          <button
                            type="button"
                            onClick={() => handleRemoveScreenshot(idx)}
                            className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/70 text-white flex items-center justify-center border-0 cursor-pointer"
                            title="Remove screenshot"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    ))
                  ) : (
                    <>
                      <div className="snap-start shrink-0 w-56 sm:w-64 p-5 rounded-2xl bg-transparent border border-slate-200/70 flex flex-col justify-between gap-4">
                        <div className="w-9 h-9 rounded-xl bg-[#0b57d0]/10 text-[#0b57d0] flex items-center justify-center">
                          <Smartphone className="w-4.5 h-4.5" />
                        </div>
                        <div className="space-y-1">
                          <div className="text-sm font-semibold text-slate-900">Timed Mock Tests</div>
                          <p className="text-xs text-slate-500 leading-relaxed">
                            Distraction-free exam runner with section timers, palette, and instant OMR scoring.
                          </p>
                        </div>
                      </div>
                      <div className="snap-start shrink-0 w-56 sm:w-64 p-5 rounded-2xl bg-transparent border border-slate-200/70 flex flex-col justify-between gap-4">
                        <div className="w-9 h-9 rounded-xl bg-emerald-600/10 text-emerald-700 flex items-center justify-center">
                          <BookOpen className="w-4.5 h-4.5" />
                        </div>
                        <div className="space-y-1">
                          <div className="text-sm font-semibold text-slate-900">Batches &amp; PDFs</div>
                          <p className="text-xs text-slate-500 leading-relaxed">
                            Organized chapters, video classes, and offline study notes for {activeApp.name}.
                          </p>
                        </div>
                      </div>
                      <div className="snap-start shrink-0 w-56 sm:w-64 p-5 rounded-2xl bg-transparent border border-slate-200/70 flex flex-col justify-between gap-4">
                        <div className="w-9 h-9 rounded-xl bg-amber-500/10 text-amber-700 flex items-center justify-center">
                          <BarChart3 className="w-4.5 h-4.5" />
                        </div>
                        <div className="space-y-1">
                          <div className="text-sm font-semibold text-slate-900">Smart Analytics</div>
                          <p className="text-xs text-slate-500 leading-relaxed">
                            Track accuracy, speed, and chapter mastery across every mock attempt.
                          </p>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </section>

              {/* About This App & Minimal Key Features */}
              <section className="space-y-4 pt-6 border-t border-slate-200/60">
                <h2 className="text-base font-semibold text-slate-900">About this app</h2>
                {isEditing ? (
                  <textarea
                    rows={4}
                    value={draftStorePage.description || ''}
                    onChange={(e) =>
                      setDraftStorePage((prev) => ({ ...prev, description: e.target.value }))
                    }
                    placeholder="Describe what your app offers..."
                    className="w-full px-3.5 py-2.5 rounded-2xl bg-slate-50 border border-slate-200 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#0b57d0]"
                  />
                ) : (
                  <p className="text-sm text-slate-600 leading-relaxed">
                    {sp.description ||
                      `${displayName} provides students with structured batch learning, mock tests, and performance analytics in a dedicated, isolated Android environment.`}
                  </p>
                )}

                {isEditing ? (
                  <div className="space-y-2.5 pt-1">
                    <div className="text-xs font-semibold text-slate-700">Key Features / Highlights</div>
                    {(draftStorePage.highlights || []).map((item, idx) => (
                      <div key={idx} className="flex items-center gap-2">
                        <input
                          type="text"
                          value={item}
                          onChange={(e) => {
                            const next = [...(draftStorePage.highlights || [])];
                            next[idx] = e.target.value;
                            setDraftStorePage((prev) => ({ ...prev, highlights: next }));
                          }}
                          className="flex-1 px-3 py-1.5 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-800"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            setDraftStorePage((prev) => ({
                              ...prev,
                              highlights: (prev.highlights || []).filter((_, i) => i !== idx),
                            }))
                          }
                          className="p-1.5 rounded-lg bg-rose-50 text-rose-600 border-0 cursor-pointer"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={newHighlight}
                        onChange={(e) => setNewHighlight(e.target.value)}
                        placeholder="Add a key feature..."
                        className="flex-1 px-3 py-1.5 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-800"
                      />
                      <button
                        type="button"
                        onClick={handleAddHighlight}
                        className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold border-0 cursor-pointer flex items-center gap-1"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Add</span>
                      </button>
                    </div>
                  </div>
                ) : (
                  Array.isArray(sp.highlights) &&
                  sp.highlights.length > 0 && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                      {sp.highlights.map((item) => (
                        <div
                          key={item}
                          className="flex items-center gap-2.5 text-xs sm:text-sm text-slate-700 py-1.5"
                        >
                          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                          <span>{item}</span>
                        </div>
                      ))}
                    </div>
                  )
                )}
              </section>
            </div>

            {/* Right Sticky Sidebar: Transparent Minimal Contact & App Info */}
            <aside className="lg:col-span-4 lg:sticky lg:top-20">
              <div className="p-5 sm:p-6 rounded-3xl bg-transparent border border-slate-200/70 space-y-4">
                <h3 className="text-sm font-semibold text-slate-900">App Info &amp; Support</h3>
                {isEditing ? (
                  <div className="space-y-3 text-xs">
                    <div>
                      <label className="block text-[11px] text-slate-500 mb-1">Support Email</label>
                      <input
                        type="email"
                        value={draftStorePage.contactEmail || ''}
                        onChange={(e) =>
                          setDraftStorePage((prev) => ({ ...prev, contactEmail: e.target.value }))
                        }
                        placeholder={activeApp.ownerEmail}
                        className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-800"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] text-slate-500 mb-1">Phone / WhatsApp</label>
                      <input
                        type="text"
                        value={draftStorePage.contactPhone || ''}
                        onChange={(e) =>
                          setDraftStorePage((prev) => ({ ...prev, contactPhone: e.target.value }))
                        }
                        placeholder="+91-..."
                        className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-800"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] text-slate-500 mb-1">Website URL</label>
                      <input
                        type="url"
                        value={draftStorePage.websiteUrl || ''}
                        onChange={(e) =>
                          setDraftStorePage((prev) => ({ ...prev, websiteUrl: e.target.value }))
                        }
                        placeholder="https://..."
                        className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-800"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] text-slate-500 mb-1">Institute Address</label>
                      <input
                        type="text"
                        value={draftStorePage.address || ''}
                        onChange={(e) =>
                          setDraftStorePage((prev) => ({ ...prev, address: e.target.value }))
                        }
                        placeholder="City, State"
                        className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-800"
                      />
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3.5 text-xs text-slate-600">
                    {(sp.contactEmail || activeApp.ownerEmail) && (
                      <div className="flex items-start gap-2.5">
                        <Mail className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                        <div className="min-w-0">
                          <div className="text-[11px] text-slate-400">Support Email</div>
                          <a
                            href={`mailto:${sp.contactEmail || activeApp.ownerEmail}`}
                            className="text-slate-800 font-medium hover:text-[#0b57d0] break-all no-underline"
                          >
                            {sp.contactEmail || activeApp.ownerEmail}
                          </a>
                        </div>
                      </div>
                    )}
                    {sp.contactPhone && (
                      <div className="flex items-start gap-2.5">
                        <Phone className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                        <div>
                          <div className="text-[11px] text-slate-400">Phone / WhatsApp</div>
                          <span className="text-slate-800 font-medium">{sp.contactPhone}</span>
                        </div>
                      </div>
                    )}
                    {sp.websiteUrl && (
                      <div className="flex items-start gap-2.5">
                        <Globe className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                        <div className="min-w-0">
                          <div className="text-[11px] text-slate-400">Website</div>
                          <a
                            href={sp.websiteUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[#0b57d0] font-medium break-all no-underline hover:underline"
                          >
                            {sp.websiteUrl}
                          </a>
                        </div>
                      </div>
                    )}
                    {sp.address && (
                      <div className="flex items-start gap-2.5">
                        <MapPin className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                        <div>
                          <div className="text-[11px] text-slate-400">Institute Address</div>
                          <span className="text-slate-700">{sp.address}</span>
                        </div>
                      </div>
                    )}
                    {activeApp.packageName && (
                      <div className="pt-2.5 border-t border-slate-200/60 flex items-center justify-between text-[11px]">
                        <span className="text-slate-400">Package ID</span>
                        <code className="text-slate-700 font-mono">{activeApp.packageName}</code>
                      </div>
                    )}
                  </div>
                )}

                <div className="pt-3 border-t border-slate-200/60 flex flex-wrap items-center gap-3 text-[11px] text-slate-500">
                  <a href="/privacy" className="text-[#0b57d0] hover:underline no-underline font-medium">
                    Privacy Policy
                  </a>
                  <span>&middot;</span>
                  <a href="/terms" className="text-[#0b57d0] hover:underline no-underline font-medium">
                    Terms of Service
                  </a>
                </div>
              </div>
            </aside>
          </div>
        </main>
      </div>
    );
  }

  // ============================================================================
  // DIRECTORY VIEW: Choose Your Own Institute's App (/apps)
  // ============================================================================
  return (
    <div className="min-h-screen w-full bg-white text-slate-800 antialiased">
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-slate-200/60">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onNavigateHome}
            className="px-3.5 py-1.5 rounded-full bg-slate-100/90 hover:bg-slate-200/80 text-slate-700 text-xs font-medium flex items-center gap-1.5 border-0 cursor-pointer transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back to Welcome</span>
          </button>
          <span className="text-sm font-semibold text-slate-900">
            Elevate <span className="text-[#0b57d0] font-medium">Apps</span>
          </span>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8 sm:py-12 space-y-8">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-5">
          <div className="space-y-1.5">
            <h1 className="text-2xl sm:text-3xl font-semibold text-slate-900 tracking-tight">
              Choose Your Institute&apos;s App
            </h1>
            <p className="text-sm text-slate-500 max-w-xl">
              Select your coaching institute or Elevate Labs Official App to view app details and download the verified Android APK.
            </p>
          </div>

          {/* Round Borderless Search Input */}
          <div className="relative w-full md:w-64 shrink-0">
            <Search className="w-4 h-4 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search..."
              aria-label="Search"
              className="w-full pl-10 pr-4 py-2.5 rounded-full bg-slate-100/90 hover:bg-slate-100 border-0 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#0b57d0]/30 transition-colors"
            />
          </div>
        </div>

        {/* Transparent Minimal Cards on Pure White Body */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredInstitutes.map((inst) => {
            const isPrimary = inst.id === 'ws_primary';
            const title = isPrimary && inst.name === 'Elevate' ? 'Elevate Labs Official App' : inst.name;
            return (
              <button
                key={inst.id}
                type="button"
                onClick={() => onSelectInstituteSlug(inst.slug)}
                className="text-left p-5 rounded-3xl bg-transparent hover:bg-slate-50/70 border border-slate-200/70 transition-all flex flex-col justify-between gap-4 cursor-pointer active:scale-[0.99]"
              >
                <div className="flex items-start gap-3.5">
                  {renderAppIcon(inst, 'w-14 h-14')}
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="text-sm font-semibold text-slate-900 truncate">{title}</div>
                    <div className="text-xs text-slate-500 truncate">
                      {isPrimary ? 'Official Flagship App' : inst.name}
                    </div>
                    <div className="text-[11px] font-medium text-slate-400">
                      v{inst.apkVersion || '1.0'} &bull; {inst.storePage?.apkSizeLabel || '19 MB'}
                    </div>
                  </div>
                </div>
                <p className="text-xs text-slate-500 line-clamp-2 leading-relaxed">
                  {inst.storePage?.tagline || `Official Android learning app for ${inst.name}.`}
                </p>
                <div className="w-full py-2.5 px-3 rounded-2xl bg-slate-100/90 text-slate-800 text-xs font-semibold text-center border-0">
                  View App &amp; Download
                </div>
              </button>
            );
          })}
        </div>

        {filteredInstitutes.length === 0 && (
          <div className="py-12 text-center text-sm text-slate-500">
            No institutes found matching &ldquo;{searchQuery}&rdquo;.
          </div>
        )}
      </main>
    </div>
  );
};
