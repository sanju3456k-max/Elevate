import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  ArrowLeft,
  X,
  ZoomIn,
  ZoomOut,
  RotateCw,
  Download,
  Printer,
  ChevronLeft,
  ChevronRight,
  FileText,
  Image as ImageIcon,
  Maximize2,
  Minimize2,
  RefreshCw,
  Sun,
  Moon,
  BookOpen,
  Columns,
  Square,
  Sparkles,
  ExternalLink,
} from 'lucide-react';
import { extractGoogleDriveId } from '../../../lms/security';
import { useScrollLock } from '../../../hooks/useScrollLock';
import { useBackHandler } from '../../../hooks/useBackNavigation';
import { getCachedDocument, saveCachedDocument } from '../../../lib/documentCache';
import { PdfCanvasViewer } from '../../PdfCanvasViewer';

export type ReadingTheme = 'paper' | 'sepia' | 'dark';

export interface DocumentViewerItem {
  id?: string;
  title: string;
  url: string;
  fileUrl?: string;
  previewImageUrl?: string;
  type?: 'pdf' | 'image' | 'doc' | 'file';
  size?: string;
  driveFileId?: string;
  content?: string;
  subtitle?: string;
  uploadedAt?: string;
}

export interface NativeDocumentViewerProps {
  items: DocumentViewerItem[];
  initialIndex?: number;
  isOpen: boolean;
  onClose: () => void;
}

export const NativeDocumentViewer: React.FC<NativeDocumentViewerProps> = ({
  items,
  initialIndex = 0,
  isOpen,
  onClose,
}) => {
  // Prevent background page scroll while reading
  useScrollLock(isOpen);

  // Android hardware back button handler
  useBackHandler({
    isOpen,
    onBack: onClose,
    priority: 60,
    id: 'native_document_viewer_modal',
  });

  const [currentIndex, setCurrentIndex] = useState<number>(initialIndex);

  useEffect(() => {
    if (isOpen) {
      const valid = Math.max(0, Math.min(initialIndex, items.length - 1));
      setCurrentIndex(valid);
    }
  }, [isOpen, initialIndex, items.length]);

  const currentItem = items[currentIndex] || null;

  // Reading Theme state (persists across document switches in session)
  const [theme, setTheme] = useState<ReadingTheme>('paper');

  // Loading & Document Data State
  const [loading, setLoading] = useState<boolean>(true);
  const [loadProgress, setLoadProgress] = useState<number>(0);
  const [docBuffer, setDocBuffer] = useState<ArrayBuffer | null>(null);
  const [docBlobUrl, setDocBlobUrl] = useState<string>('');
  const [detectedKind, setDetectedKind] = useState<'pdf' | 'image' | 'text'>('pdf');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Visual Transforms (for Image Mode)
  const [imageZoom, setImageZoom] = useState<number>(1.0);
  const [imageRotation, setImageRotation] = useState<number>(0);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const dragStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  // PDF page tracker state (synced with bottom dock)
  const [pdfPageNum, setPdfPageNum] = useState<number>(1);
  const [pdfTotalPages, setPdfTotalPages] = useState<number>(1);

  // Fullscreen state
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);

  // Clean URLs & IDs
  const rawUrl = (currentItem?.fileUrl || currentItem?.url || '').trim();
  const driveId = useMemo(() => {
    if (currentItem?.driveFileId) return currentItem.driveFileId;
    return extractGoogleDriveId(rawUrl);
  }, [currentItem, rawUrl]);

  // Clean cache key
  const cacheKey = useMemo(() => {
    return driveId ? `drive_${driveId}` : rawUrl ? `url_${rawUrl}` : '';
  }, [driveId, rawUrl]);

  // Primary loader: checks IndexedDB -> streams via backend proxy -> fallback direct
  const loadDocument = useCallback(async () => {
    if (!rawUrl && !driveId) {
      setErrorMessage('No document source provided.');
      setLoading(false);
      return;
    }

    setLoading(true);
    setErrorMessage(null);
    setLoadProgress(15);

    try {
      // 1. Try local IndexedDB cache first (<10ms instant load offline)
      if (cacheKey) {
        const cached = await getCachedDocument(cacheKey);
        if (cached && cached.data) {
          setLoadProgress(100);
          setDocBuffer(cached.data);
          const isPdf = cached.contentType.includes('pdf') || rawUrl.endsWith('.pdf') || currentItem?.title?.endsWith('.pdf');
          const isImg = cached.contentType.startsWith('image/');
          setDetectedKind(isPdf ? 'pdf' : isImg ? 'image' : 'pdf');

          const blob = new Blob([cached.data], { type: cached.contentType });
          const bUrl = URL.createObjectURL(blob);
          setDocBlobUrl(bUrl);
          setLoading(false);
          return;
        }
      }

      setLoadProgress(35);

      // 2. Build stream proxy URL
      let targetUrl = '';
      if (driveId) {
        targetUrl = `/api/drive/media/${encodeURIComponent(driveId)}`;
      } else if (rawUrl.startsWith('data:') || rawUrl.includes('/api/')) {
        targetUrl = rawUrl;
      } else {
        targetUrl = `/api/drive/stream?url=${encodeURIComponent(rawUrl)}`;
      }

      const response = await fetch(targetUrl);
      setLoadProgress(70);

      if (!response.ok) {
        // If stream proxy returned error, try direct URL if it is public
        if (rawUrl && !rawUrl.includes('drive.google.com')) {
          const directRes = await fetch(rawUrl);
          if (directRes.ok) {
            const buf = await directRes.arrayBuffer();
            const cType = directRes.headers.get('content-type') || 'application/pdf';
            handleLoadedData(buf, cType);
            return;
          }
        }
        throw new Error(`Failed to load document (${response.status})`);
      }

      const contentType = response.headers.get('content-type') || 'application/pdf';
      const arrayBuffer = await response.arrayBuffer();
      setLoadProgress(95);

      handleLoadedData(arrayBuffer, contentType);
    } catch (err: any) {
      console.warn('Document loading issue, falling back:', err);
      // Fallback for direct image preview URL if driveId is present
      if (driveId && (currentItem?.type === 'image' || rawUrl.match(/\.(jpe?g|png|webp|svg)$/i))) {
        setDetectedKind('image');
        setDocBlobUrl(`https://lh3.googleusercontent.com/d/${driveId}`);
        setLoading(false);
        return;
      }

      setErrorMessage(
        err?.message || 'Unable to open document. Please verify network access or permissions.'
      );
      setLoading(false);
    }
  }, [rawUrl, driveId, cacheKey, currentItem]);

  const handleLoadedData = useCallback(
    (arrayBuffer: ArrayBuffer, contentType: string) => {
      // Magic bytes inspection
      const bytes = new Uint8Array(arrayBuffer.slice(0, 10));
      const isPdf =
        bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46; // %PDF-
      const isJpeg = bytes[0] === 0xff && bytes[1] === 0xd8;
      const isPng = bytes[0] === 0x89 && bytes[1] === 0x50;
      const isGif = bytes[0] === 0x47 && bytes[1] === 0x49;

      let resolvedKind: 'pdf' | 'image' | 'text' = 'pdf';
      let resolvedType = contentType;

      if (isPdf) {
        resolvedKind = 'pdf';
        resolvedType = 'application/pdf';
      } else if (isJpeg || isPng || isGif || contentType.startsWith('image/')) {
        resolvedKind = 'image';
      } else if (contentType.includes('text') || currentItem?.content) {
        resolvedKind = 'text';
      }

      setDetectedKind(resolvedKind);
      setDocBuffer(arrayBuffer);

      const blob = new Blob([arrayBuffer], { type: resolvedType });
      const bUrl = URL.createObjectURL(blob);
      setDocBlobUrl(bUrl);

      // Save to IndexedDB cache in background
      if (cacheKey) {
        saveCachedDocument(cacheKey, arrayBuffer, resolvedType).catch(() => {});
      }

      setLoading(false);
    },
    [cacheKey, currentItem]
  );

  // Trigger load on index/item change
  useEffect(() => {
    setImageZoom(1.0);
    setImageRotation(0);
    setPan({ x: 0, y: 0 });
    setPdfPageNum(1);
    setPdfTotalPages(1);

    loadDocument();

    return () => {
      if (docBlobUrl && docBlobUrl.startsWith('blob:')) {
        URL.revokeObjectURL(docBlobUrl);
      }
    };
  }, [currentIndex, currentItem?.id, rawUrl, driveId]);

  // Carousel navigation
  const canGoPrev = currentIndex > 0;
  const canGoNext = currentIndex < items.length - 1;

  const handlePrev = useCallback(() => {
    if (canGoPrev) setCurrentIndex((i) => i - 1);
  }, [canGoPrev]);

  const handleNext = useCallback(() => {
    if (canGoNext) setCurrentIndex((i) => i + 1);
  }, [canGoNext]);

  // Keyboard navigation
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if (e.key === 'ArrowLeft' && canGoPrev && detectedKind !== 'pdf') {
        e.preventDefault();
        handlePrev();
      } else if (e.key === 'ArrowRight' && canGoNext && detectedKind !== 'pdf') {
        e.preventDefault();
        handleNext();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose, canGoPrev, canGoNext, handlePrev, handleNext, detectedKind]);

  // Fullscreen toggle
  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {});
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {});
    }
  }, []);

  // Direct Download
  const handleDownload = useCallback(() => {
    if (docBlobUrl) {
      const a = document.createElement('a');
      a.href = docBlobUrl;
      a.download = currentItem?.title || (detectedKind === 'pdf' ? 'document.pdf' : 'image.png');
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      return;
    }
    const dl = driveId
      ? `https://drive.google.com/uc?export=download&id=${driveId}`
      : rawUrl;
    window.open(dl, '_blank');
  }, [docBlobUrl, driveId, rawUrl, currentItem?.title, detectedKind]);

  // Print
  const handlePrint = useCallback(() => {
    if (detectedKind === 'image' && docBlobUrl) {
      const printWin = window.open('', '_blank');
      if (printWin) {
        printWin.document.write(`
          <!DOCTYPE html>
          <html>
            <head><title>${currentItem?.title || 'Document'}</title>
            <style>body{margin:0;display:flex;align-items:center;justify-content:center;min-height:100vh;}img{max-width:100%;max-height:95vh;}</style>
            </head>
            <body><img src="${docBlobUrl}" onload="window.print();window.close();"/></body>
          </html>
        `);
        printWin.document.close();
      }
    } else {
      window.print();
    }
  }, [detectedKind, docBlobUrl, currentItem?.title]);

  // Theme styling classes
  const themeClasses = useMemo(() => {
    switch (theme) {
      case 'sepia':
        return {
          wrapper: 'bg-[#f4ecd8] text-[#3d3226]',
          header: 'bg-[#f4ecd8]/90 text-[#3d3226] border-[#dfd4bd]',
          dock: 'bg-[#ebe1ca]/95 text-[#3d3226] border-[#dacdb2] shadow-xl',
          canvasFilter: 'sepia(0.35) contrast(0.96) brightness(0.98)',
        };
      case 'dark':
        return {
          wrapper: 'bg-[#090a0d] text-[#e3e3e3]',
          header: 'bg-[#0f1117]/90 text-[#e3e3e3] border-white/10',
          dock: 'bg-[#181a22]/95 text-[#e3e3e3] border-white/10 shadow-2xl',
          canvasFilter: 'invert(0.88) hue-rotate(180deg) contrast(1.1) brightness(0.95)',
        };
      case 'paper':
      default:
        return {
          wrapper: 'bg-[#f8f9fa] dark:bg-[#0b0c10] text-slate-900 dark:text-zinc-100',
          header: 'bg-white/90 dark:bg-[#121318]/90 text-slate-900 dark:text-zinc-100 border-slate-200/80 dark:border-white/10',
          dock: 'bg-white/95 dark:bg-[#1a1c24]/95 text-slate-900 dark:text-zinc-100 border-slate-200 dark:border-white/10 shadow-xl',
          canvasFilter: 'none',
        };
    }
  }, [theme]);

  if (!isOpen || !currentItem) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.18 }}
        className={`fixed inset-0 z-50 flex flex-col select-none overflow-hidden ${themeClasses.wrapper}`}
        style={{
          paddingTop: 'var(--android-status-bar-height, 0px)',
          paddingBottom: 'var(--android-cutout-bottom, 0px)',
        }}
      >
        {/* ========================================================= */}
        {/* 1. FLOATING MINIMAL HEADER BAR                            */}
        {/* ========================================================= */}
        <header
          className={`shrink-0 h-14 px-3 sm:px-6 flex items-center justify-between border-b backdrop-blur-xl z-30 transition-colors ${themeClasses.header}`}
        >
          {/* Left: Back Arrow + Document Title + Badges */}
          <div className="flex items-center gap-2.5 sm:gap-3.5 min-w-0 flex-1 mr-2">
            <button
              type="button"
              onClick={onClose}
              className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-black/5 dark:hover:bg-white/10 transition cursor-pointer border-none bg-transparent active:scale-95 shrink-0"
              title="Close Note Viewer (Esc)"
              aria-label="Close"
            >
              <ArrowLeft className="w-5 h-5 stroke-[2.2]" />
            </button>

            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <h3 className="text-xs sm:text-sm font-bold truncate leading-tight">
                  {currentItem.title || 'Course Lecture Note'}
                </h3>
                <span className="hidden sm:inline-flex px-2 py-0.5 rounded-full text-[9.5px] font-mono font-extrabold tracking-wider uppercase bg-[#0b57d0]/10 text-[#0b57d0] dark:bg-blue-950/60 dark:text-blue-400">
                  {detectedKind.toUpperCase()}
                </span>
                {items.length > 1 && (
                  <span className="text-[10px] sm:text-xs text-slate-500 dark:text-zinc-400 font-medium shrink-0">
                    ({currentIndex + 1} of {items.length})
                  </span>
                )}
              </div>
              {currentItem.subtitle && (
                <p className="text-[10px] text-slate-500 dark:text-zinc-400 truncate mt-0.5">
                  {currentItem.subtitle}
                </p>
              )}
            </div>
          </div>

          {/* Right Actions: Reading Theme Pill, Print, Download, Fullscreen, Close */}
          <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
            {/* Reading Theme Switcher (Paper, Sepia, OLED Night) */}
            <div className="flex items-center p-0.5 rounded-full bg-black/5 dark:bg-white/10 border border-black/5 dark:border-white/5 mr-1">
              <button
                type="button"
                onClick={() => setTheme('paper')}
                className={`p-1.5 rounded-full transition cursor-pointer border-none ${
                  theme === 'paper' ? 'bg-white dark:bg-white/20 shadow-xs' : 'bg-transparent opacity-60 hover:opacity-100'
                }`}
                title="Paper White Mode"
              >
                <Sun className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setTheme('sepia')}
                className={`p-1.5 rounded-full transition cursor-pointer border-none ${
                  theme === 'sepia' ? 'bg-[#f4ecd8] text-[#433422] shadow-xs' : 'bg-transparent opacity-60 hover:opacity-100'
                }`}
                title="Warm Sepia Eye-Care Reading Mode"
              >
                <BookOpen className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setTheme('dark')}
                className={`p-1.5 rounded-full transition cursor-pointer border-none ${
                  theme === 'dark' ? 'bg-[#090a0d] text-white shadow-xs' : 'bg-transparent opacity-60 hover:opacity-100'
                }`}
                title="OLED Night Mode"
              >
                <Moon className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Print */}
            <button
              type="button"
              onClick={handlePrint}
              className="w-8 h-8 sm:w-9 sm:h-9 rounded-full flex items-center justify-center hover:bg-black/5 dark:hover:bg-white/10 transition cursor-pointer border-none bg-transparent active:scale-95"
              title="Print Note"
            >
              <Printer className="w-4 h-4" />
            </button>

            {/* Download */}
            <button
              type="button"
              onClick={handleDownload}
              className="w-8 h-8 sm:w-9 sm:h-9 rounded-full flex items-center justify-center hover:bg-black/5 dark:hover:bg-white/10 transition cursor-pointer border-none bg-transparent active:scale-95"
              title="Save / Download File"
            >
              <Download className="w-4 h-4" />
            </button>

            {/* Fullscreen */}
            <button
              type="button"
              onClick={toggleFullscreen}
              className="hidden sm:flex w-9 h-9 rounded-full items-center justify-center hover:bg-black/5 dark:hover:bg-white/10 transition cursor-pointer border-none bg-transparent active:scale-95"
              title={isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'}
            >
              {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>

            {/* Close Cross */}
            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 sm:w-9 sm:h-9 rounded-full flex items-center justify-center hover:bg-black/5 dark:hover:bg-white/10 transition cursor-pointer border-none bg-transparent active:scale-95"
              title="Close"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </header>

        {/* ========================================================= */}
        {/* 2. MAIN DOCUMENT CANVAS VIEWPORT                          */}
        {/* ========================================================= */}
        <main className="relative flex-1 w-full h-full overflow-hidden flex items-center justify-center">
          {/* A. LOADING SPINNER WITH SKELETON BAR */}
          {loading && (
            <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-3 bg-white/70 dark:bg-black/60 backdrop-blur-sm">
              <div className="w-10 h-10 rounded-full border-3 border-[#0b57d0] border-t-transparent animate-spin" />
              <div className="text-center space-y-1">
                <p className="text-xs font-bold text-slate-800 dark:text-zinc-200">
                  Loading high-resolution document...
                </p>
                <div className="w-36 h-1.5 rounded-full bg-slate-200 dark:bg-zinc-800 overflow-hidden mx-auto">
                  <div
                    className="h-full bg-[#0b57d0] transition-all duration-300"
                    style={{ width: `${loadProgress}%` }}
                  />
                </div>
              </div>
            </div>
          )}

          {/* B. ERROR FALLBACK WITH DIRECT RETRY & GOOGLE DRIVE LINK */}
          {errorMessage && !loading && (
            <div className="p-8 text-center max-w-md bg-white dark:bg-[#1a1c24] rounded-3xl border border-slate-200 dark:border-white/10 shadow-xl space-y-4 m-4">
              <FileText className="w-12 h-12 mx-auto text-rose-500 opacity-80" />
              <div className="space-y-1">
                <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                  Unable to Preview Note
                </h4>
                <p className="text-xs text-slate-500 dark:text-zinc-400">
                  {errorMessage}
                </p>
              </div>
              <div className="flex items-center justify-center gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => loadDocument()}
                  className="px-4 py-2 rounded-full bg-[#0b57d0] text-white text-xs font-bold border-none cursor-pointer hover:bg-blue-700 transition"
                >
                  <RefreshCw className="w-3.5 h-3.5 inline mr-1.5" />
                  Retry
                </button>
                {rawUrl && (
                  <a
                    href={rawUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-4 py-2 rounded-full bg-slate-100 dark:bg-zinc-800 text-slate-800 dark:text-zinc-200 text-xs font-semibold no-underline hover:bg-slate-200 transition inline-flex items-center gap-1.5"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    Open Source
                  </a>
                )}
              </div>
            </div>
          )}

          {/* C. PDF VIEWPORT (Virtual Continuous Canvas with High-DPI Scaling) */}
          {detectedKind === 'pdf' && !errorMessage && (
            <div
              className="w-full h-full relative overflow-hidden flex flex-col"
              style={{
                filter: themeClasses.canvasFilter,
                transition: 'filter 0.25s ease-out',
              }}
            >
              <PdfCanvasViewer
                url={docBlobUrl || (driveId ? `/api/drive/media/${driveId}` : rawUrl)}
                fileName={currentItem.title}
                hideTopToolbar={true}
                hideBottomDock={false}
                onClose={onClose}
              />
            </div>
          )}

          {/* D. HIGH-DPI IMAGE PAN-ZOOM CANVAS */}
          {detectedKind === 'image' && !errorMessage && (
            <div
              onMouseDown={(e) => {
                setIsDragging(true);
                dragStartRef.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
              }}
              onMouseMove={(e) => {
                if (!isDragging) return;
                setPan({
                  x: e.clientX - dragStartRef.current.x,
                  y: e.clientY - dragStartRef.current.y,
                });
              }}
              onMouseUp={() => setIsDragging(false)}
              onMouseLeave={() => setIsDragging(false)}
              onDoubleClick={() => {
                if (imageZoom !== 1.0 || pan.x !== 0 || pan.y !== 0) {
                  setImageZoom(1.0);
                  setPan({ x: 0, y: 0 });
                } else {
                  setImageZoom(2.2);
                }
              }}
              onWheel={(e) => {
                e.preventDefault();
                const delta = e.deltaY < 0 ? 0.2 : -0.2;
                setImageZoom((z) => Math.max(0.4, Math.min(4.5, Number((z + delta).toFixed(2)))));
              }}
              className="w-full h-full flex items-center justify-center overflow-hidden cursor-grab active:cursor-grabbing select-none relative"
            >
              {docBlobUrl && (
                <img
                  src={docBlobUrl}
                  alt={currentItem.title}
                  draggable={false}
                  style={{
                    transform: `translate3d(${pan.x}px, ${pan.y}px, 0) scale(${imageZoom}) rotate(${imageRotation}deg)`,
                    transition: isDragging ? 'none' : 'transform 0.15s ease-out',
                    maxHeight: '92vh',
                    maxWidth: '92vw',
                    filter: themeClasses.canvasFilter,
                  }}
                  className="object-contain pointer-events-none rounded shadow-2xl transition-all"
                />
              )}

              {/* Floating Bottom Pill for Images */}
              <div
                className={`absolute bottom-6 left-1/2 -translate-x-1/2 z-30 px-3 py-1.5 rounded-full flex items-center gap-2 border backdrop-blur-2xl ${themeClasses.dock}`}
              >
                <button
                  type="button"
                  onClick={() => setImageZoom((z) => Math.max(0.4, Number((z - 0.25).toFixed(2))))}
                  className="p-1 rounded-full hover:bg-black/10 dark:hover:bg-white/10 border-none bg-transparent cursor-pointer"
                  title="Zoom Out (-)"
                >
                  <ZoomOut className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setImageZoom(1.0);
                    setPan({ x: 0, y: 0 });
                  }}
                  className="text-[11px] font-mono font-bold px-1.5 cursor-pointer border-none bg-transparent"
                >
                  {Math.round(imageZoom * 100)}%
                </button>
                <button
                  type="button"
                  onClick={() => setImageZoom((z) => Math.min(4.0, Number((z + 0.25).toFixed(2))))}
                  className="p-1 rounded-full hover:bg-black/10 dark:hover:bg-white/10 border-none bg-transparent cursor-pointer"
                  title="Zoom In (+)"
                >
                  <ZoomIn className="w-3.5 h-3.5" />
                </button>
                <div className="w-px h-3.5 bg-black/15 dark:bg-white/20 mx-0.5" />
                <button
                  type="button"
                  onClick={() => setImageRotation((r) => (r + 90) % 360)}
                  className="p-1 rounded-full hover:bg-black/10 dark:hover:bg-white/10 border-none bg-transparent cursor-pointer"
                  title="Rotate 90Â°"
                >
                  <RotateCw className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}

          {/* E. FORMATTED TEXT / HTML NOTES READER */}
          {detectedKind === 'text' && !errorMessage && currentItem.content && (
            <div className="w-full h-full overflow-y-auto p-4 sm:p-8 flex justify-center">
              <div
                className={`max-w-3xl w-full p-6 sm:p-10 rounded-3xl shadow-xl border my-auto ${
                  theme === 'sepia'
                    ? 'bg-[#ede3ce] border-[#dfd4bd] text-[#3d3226]'
                    : theme === 'dark'
                    ? 'bg-[#14161f] border-white/10 text-zinc-100'
                    : 'bg-white dark:bg-[#16171d] border-slate-200 dark:border-white/10 text-slate-900 dark:text-zinc-100'
                }`}
              >
                <h2 className="text-lg sm:text-xl font-bold mb-4">{currentItem.title}</h2>
                <div className="prose dark:prose-invert max-w-none text-xs sm:text-sm whitespace-pre-wrap leading-relaxed">
                  {currentItem.content}
                </div>
              </div>
            </div>
          )}

          {/* FLOATING PREV / NEXT CHEVRONS FOR MULTI-ITEM FOLDERS */}
          {items.length > 1 && canGoPrev && (
            <button
              type="button"
              onClick={handlePrev}
              className="absolute left-3 sm:left-5 top-1/2 -translate-y-1/2 z-40 w-11 h-11 sm:w-12 sm:h-12 rounded-full flex items-center justify-center transition shadow-2xl backdrop-blur-xl cursor-pointer border border-black/10 dark:border-white/15 bg-white/90 dark:bg-black/70 hover:scale-105 active:scale-95 text-slate-800 dark:text-white"
              title="Previous Note (Left Arrow)"
            >
              <ChevronLeft className="w-6 h-6 stroke-[2.5]" />
            </button>
          )}

          {items.length > 1 && canGoNext && (
            <button
              type="button"
              onClick={handleNext}
              className="absolute right-3 sm:right-5 top-1/2 -translate-y-1/2 z-40 w-11 h-11 sm:w-12 sm:h-12 rounded-full flex items-center justify-center transition shadow-2xl backdrop-blur-xl cursor-pointer border border-black/10 dark:border-white/15 bg-white/90 dark:bg-black/70 hover:scale-105 active:scale-95 text-slate-800 dark:text-white"
              title="Next Note (Right Arrow)"
            >
              <ChevronRight className="w-6 h-6 stroke-[2.5]" />
            </button>
          )}
        </main>
      </motion.div>
    </AnimatePresence>
  );
};
