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
  ExternalLink,
  Info,
  Layers,
  Sparkles,
  Paperclip,
  Check,
} from 'lucide-react';
import { PdfCanvasViewer } from '../../PdfCanvasViewer';
import { extractGoogleDriveId, buildGoogleDrivePreviewUrl } from '../../../lms/security';
import { isImageFile, isPdfFile, getDriveImageCandidates } from '../../../lib/filePreviewUtils';
import { useScrollLock } from '../../../hooks/useScrollLock';
import { useBackHandler } from '../../../hooks/useBackNavigation';

export interface DriveViewerItem {
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

export interface GoogleDriveFileViewerModalProps {
  items: DriveViewerItem[];
  initialIndex?: number;
  isOpen: boolean;
  onClose: () => void;
}

export const GoogleDriveFileViewerModal: React.FC<GoogleDriveFileViewerModalProps> = ({
  items,
  initialIndex = 0,
  isOpen,
  onClose,
}) => {
  // Lock background scrolling while open
  useScrollLock(isOpen);

  // Centralized hardware / mobile browser back-key listener
  useBackHandler({
    isOpen,
    onBack: onClose,
    priority: 60,
    id: 'google_drive_file_viewer_modal',
  });

  // Active Index
  const [currentIndex, setCurrentIndex] = useState<number>(initialIndex);

  // Sync initialIndex whenever it changes or modal opens
  useEffect(() => {
    if (isOpen) {
      const validIndex = Math.max(0, Math.min(initialIndex, Math.max(0, items.length - 1)));
      setCurrentIndex(validIndex);
    }
  }, [isOpen, initialIndex, items.length]);

  const currentItem: DriveViewerItem | null = items[currentIndex] || null;

  // View state & transformations
  const [zoom, setZoom] = useState<number>(1.0);
  const [rotation, setRotation] = useState<number>(0);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const dragStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const imageContainerRef = useRef<HTMLDivElement | null>(null);

  // Controls overlay & Info dropdown
  const [showInfoDropdown, setShowInfoDropdown] = useState<boolean>(false);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [imageLoaded, setImageLoaded] = useState<boolean>(false);
  const [imageError, setImageError] = useState<boolean>(false);
  const [viewEngine, setViewEngine] = useState<'embedded' | 'canvas'>('embedded');

  // Reset transformations on item change
  useEffect(() => {
    setZoom(1.0);
    setRotation(0);
    setPan({ x: 0, y: 0 });
    setImageLoaded(false);
    setImageError(false);
    setShowInfoDropdown(false);
    setViewEngine('embedded');
  }, [currentIndex]);

  // Resolve URLs and Type for current item
  const rawUrl = (currentItem?.fileUrl || currentItem?.url || '').trim();
  const driveId = useMemo(() => {
    if (currentItem?.driveFileId) return currentItem.driveFileId;
    return extractGoogleDriveId(rawUrl);
  }, [currentItem, rawUrl]);

  // File type detection
  const detectedType = useMemo<'pdf' | 'image' | 'doc'>(() => {
    if (!currentItem) return 'doc';
    if (currentItem.type === 'image' || isImageFile({ fileName: currentItem.title, fileUrl: rawUrl })) {
      return 'image';
    }
    if (
      currentItem.type === 'pdf' ||
      isPdfFile({ fileName: currentItem.title, fileUrl: rawUrl }) ||
      /\.pdf($|\?)/i.test(rawUrl) ||
      /\.pdf$/i.test(currentItem.title || '')
    ) {
      return 'pdf';
    }
    return 'doc';
  }, [currentItem, rawUrl]);

  // Google Drive Embedded URL
  const driveEmbedUrl = useMemo(() => {
    if (driveId) {
      return buildGoogleDrivePreviewUrl(driveId);
    }
    if (rawUrl.includes('drive.google.com')) {
      const match = rawUrl.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
      if (match && match[1]) {
        return buildGoogleDrivePreviewUrl(match[1]);
      }
    }
    return '';
  }, [driveId, rawUrl]);

  // High-resolution image candidates
  const imageSrc = useMemo(() => {
    if (detectedType !== 'image') return rawUrl;
    if (currentItem?.previewImageUrl) return currentItem.previewImageUrl;
    if (driveId) {
      const candidates = getDriveImageCandidates(driveId);
      return candidates[0] || `https://lh3.googleusercontent.com/d/${driveId}`;
    }
    return rawUrl;
  }, [detectedType, currentItem, driveId, rawUrl]);

  // Zoom handlers
  const handleZoomIn = useCallback(() => {
    setZoom((prev) => Math.min(Number((prev + 0.25).toFixed(2)), 4.0));
  }, []);

  const handleZoomOut = useCallback(() => {
    setZoom((prev) => Math.max(Number((prev - 0.25).toFixed(2)), 0.25));
  }, []);

  const handleResetZoom = useCallback(() => {
    setZoom(1.0);
    setPan({ x: 0, y: 0 });
  }, []);

  const handleRotate = useCallback(() => {
    setRotation((prev) => (prev + 90) % 360);
  }, []);

  // Carousel navigation
  const canGoPrev = currentIndex > 0;
  const canGoNext = currentIndex < items.length - 1;

  const handlePrev = useCallback(() => {
    if (canGoPrev) {
      setCurrentIndex((prev) => prev - 1);
    }
  }, [canGoPrev]);

  const handleNext = useCallback(() => {
    if (canGoNext) {
      setCurrentIndex((prev) => prev + 1);
    }
  }, [canGoNext]);

  // Fullscreen toggle
  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {});
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {});
    }
  }, []);

  // Keyboard navigation & shortcuts
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't intercept when user is typing in an input
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement)?.tagName)) {
        return;
      }

      switch (e.key) {
        case 'Escape':
          e.preventDefault();
          onClose();
          break;
        case 'ArrowLeft':
          e.preventDefault();
          handlePrev();
          break;
        case 'ArrowRight':
          e.preventDefault();
          handleNext();
          break;
        case '+':
        case '=':
          e.preventDefault();
          handleZoomIn();
          break;
        case '-':
        case '_':
          e.preventDefault();
          handleZoomOut();
          break;
        case '0':
          e.preventDefault();
          handleResetZoom();
          break;
        case 'r':
        case 'R':
          e.preventDefault();
          handleRotate();
          break;
        default:
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose, handlePrev, handleNext, handleZoomIn, handleZoomOut, handleResetZoom, handleRotate]);

  // Clean Print
  const handlePrint = useCallback(() => {
    if (!currentItem) return;

    if (detectedType === 'image' && imageSrc) {
      const printWindow = window.open('', '_blank');
      if (printWindow) {
        printWindow.document.write(`
          <!DOCTYPE html>
          <html>
            <head>
              <title>${currentItem.title}</title>
              <style>
                * { box-sizing: border-box; }
                body { margin: 0; padding: 20px; display: flex; align-items: center; justify-content: center; min-height: 100vh; background: #fff; }
                img { max-width: 100%; max-height: 95vh; object-fit: contain; }
                @page { margin: 1cm; size: auto; }
              </style>
            </head>
            <body>
              <img src="${imageSrc}" onload="window.focus(); window.print(); window.close();" />
            </body>
          </html>
        `);
        printWindow.document.close();
      }
    } else {
      window.print();
    }
  }, [currentItem, detectedType, imageSrc]);

  // Direct Download
  const handleDownload = useCallback(() => {
    if (!rawUrl && !driveId) return;

    const downloadUrl = driveId
      ? `https://drive.google.com/uc?export=download&id=${driveId}`
      : rawUrl;

    const a = document.createElement('a');
    a.href = downloadUrl;
    a.download = currentItem?.title || 'downloaded_document';
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }, [rawUrl, driveId, currentItem?.title]);

  // Mouse wheel zoom on image container
  const handleWheel = useCallback((e: React.WheelEvent) => {
    if (detectedType !== 'image') return;
    e.preventDefault();
    if (e.deltaY < 0) {
      setZoom((prev) => Math.min(Number((prev + 0.15).toFixed(2)), 4.0));
    } else {
      setZoom((prev) => Math.max(Number((prev - 0.15).toFixed(2)), 0.25));
    }
  }, [detectedType]);

  if (!isOpen || !currentItem) return null;

  return (
    <AnimatePresence>
      <motion.div
        data-testid="google-drive-file-viewer"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.15 }}
        className="fixed inset-0 z-50 flex flex-col bg-[#0b0c10] text-white select-none overflow-hidden"
      >
        {/* ================= GOOGLE DRIVE TOP BAR ================= */}
        <header className="h-14 px-3 sm:px-5 bg-[#16171d]/95 backdrop-blur-md border-b border-white/10 shrink-0 flex items-center justify-between gap-3 z-30 select-none shadow-md">
          {/* Left: Back Arrow, File Icon, Title, Counter */}
          <div className="flex items-center gap-2.5 min-w-0 flex-1">
            <button
              type="button"
              onClick={onClose}
              className="w-9 h-9 rounded-full hover:bg-white/10 text-white/80 hover:text-white flex items-center justify-center transition-colors cursor-pointer active:scale-95 border-0 bg-transparent shrink-0"
              title="Close Preview (Esc)"
              aria-label="Close"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>

            {/* File Icon Badge */}
            <div className="shrink-0 p-1.5 rounded-lg bg-white/5 border border-white/10">
              {detectedType === 'pdf' ? (
                <FileText className="w-4 h-4 text-rose-400" />
              ) : detectedType === 'image' ? (
                <ImageIcon className="w-4 h-4 text-emerald-400" />
              ) : (
                <FileText className="w-4 h-4 text-sky-400" />
              )}
            </div>

            {/* Title & Subtitle */}
            <div className="min-w-0 flex flex-col justify-center">
              <div className="flex items-center gap-2">
                <h3 className="text-xs sm:text-sm font-semibold text-white truncate max-w-[180px] sm:max-w-xs md:max-w-md lg:max-w-lg">
                  {currentItem.title}
                </h3>

                {/* Sibling Playlist Counter Badge */}
                {items.length > 1 && (
                  <span className="hidden sm:inline-flex px-2 py-0.5 rounded-full text-[10px] font-mono font-medium bg-white/10 text-white/70 border border-white/10">
                    {currentIndex + 1} / {items.length}
                  </span>
                )}
              </div>

              {currentItem.subtitle && (
                <p className="text-[10px] text-white/50 truncate max-w-xs">
                  {currentItem.subtitle}
                </p>
              )}
            </div>
          </div>

          {/* Center Tools (Zoom, Rotate, Reset) */}
          {(detectedType === 'image' || (detectedType === 'pdf' && viewEngine === 'canvas')) && (
            <div className="hidden md:flex items-center bg-white/5 border border-white/10 rounded-full px-2 py-1 gap-1 text-xs text-white/80 shadow-inner">
              <button
                type="button"
                onClick={handleZoomOut}
                disabled={zoom <= 0.25}
                className="p-1 rounded-full hover:bg-white/15 text-white/70 hover:text-white disabled:opacity-30 cursor-pointer transition-colors border-0 bg-transparent"
                title="Zoom Out (-)"
              >
                <ZoomOut className="w-3.5 h-3.5" />
              </button>

              <button
                type="button"
                onClick={handleResetZoom}
                className="text-[11px] font-bold text-sky-400 hover:text-sky-300 px-1 cursor-pointer transition-colors border-0 bg-transparent min-w-[42px] text-center"
                title="Reset Zoom (0)"
              >
                {Math.round(zoom * 100)}%
              </button>

              <button
                type="button"
                onClick={handleZoomIn}
                disabled={zoom >= 4.0}
                className="p-1 rounded-full hover:bg-white/15 text-white/70 hover:text-white disabled:opacity-30 cursor-pointer transition-colors border-0 bg-transparent"
                title="Zoom In (+)"
              >
                <ZoomIn className="w-3.5 h-3.5" />
              </button>

              <div className="w-px h-3 bg-white/20 mx-0.5" />

              <button
                type="button"
                onClick={handleRotate}
                className="p-1 rounded-full hover:bg-white/15 text-white/70 hover:text-white transition-colors cursor-pointer border-0 bg-transparent"
                title="Rotate 90° Clockwise (R)"
              >
                <RotateCw className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* Right Actions: Print, Download, Fullscreen, More, Close */}
          <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
            {/* View Engine Toggle for PDFs (Drive Embed vs Direct Canvas) */}
            {detectedType === 'pdf' && driveEmbedUrl && (
              <button
                type="button"
                onClick={() => setViewEngine((prev) => (prev === 'embedded' ? 'canvas' : 'embedded'))}
                className="hidden sm:inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-white/10 hover:bg-white/20 text-white/90 transition-colors cursor-pointer border-0"
                title={viewEngine === 'embedded' ? 'Switch to Canvas Rendering' : 'Switch to Google Drive Viewer'}
              >
                <Layers className="w-3.5 h-3.5 text-sky-400" />
                <span>{viewEngine === 'embedded' ? 'Drive Mode' : 'Canvas Mode'}</span>
              </button>
            )}

            {/* Direct Print */}
            <button
              type="button"
              onClick={handlePrint}
              className="w-9 h-9 rounded-full hover:bg-white/10 text-white/80 hover:text-white flex items-center justify-center transition-colors cursor-pointer active:scale-95 border-0 bg-transparent"
              title="Print Document"
              aria-label="Print"
            >
              <Printer className="w-4 h-4" />
            </button>

            {/* Direct Download */}
            <button
              type="button"
              onClick={handleDownload}
              className="w-9 h-9 rounded-full hover:bg-white/10 text-white/80 hover:text-white flex items-center justify-center transition-colors cursor-pointer active:scale-95 border-0 bg-transparent"
              title="Download File"
              aria-label="Download"
            >
              <Download className="w-4 h-4" />
            </button>

            {/* Fullscreen Toggle */}
            <button
              type="button"
              onClick={toggleFullscreen}
              className="w-9 h-9 rounded-full hover:bg-white/10 text-white/80 hover:text-white hidden sm:flex items-center justify-center transition-colors cursor-pointer active:scale-95 border-0 bg-transparent"
              title={isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'}
              aria-label="Toggle Fullscreen"
            >
              {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>

            {/* More / Info Toggle */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowInfoDropdown((prev) => !prev)}
                className={`w-9 h-9 rounded-full flex items-center justify-center transition-colors cursor-pointer active:scale-95 border-0 ${
                  showInfoDropdown ? 'bg-white/20 text-white' : 'hover:bg-white/10 text-white/80 hover:text-white bg-transparent'
                }`}
                title="File Details"
                aria-label="Information"
              >
                <Info className="w-4 h-4" />
              </button>

              {showInfoDropdown && (
                <div className="absolute right-0 top-full mt-2 w-64 rounded-2xl bg-[#1e2028] border border-white/10 shadow-2xl p-4 z-40 text-xs text-white/90 space-y-2.5 animate-in fade-in zoom-in-95 duration-100">
                  <h4 className="text-xs font-bold text-white uppercase tracking-wider text-white/50">
                    File Details
                  </h4>
                  <div className="space-y-1.5 pt-1 border-t border-white/10">
                    <div className="flex justify-between">
                      <span className="text-white/50">Type:</span>
                      <span className="font-medium uppercase">{detectedType}</span>
                    </div>
                    {currentItem.size && (
                      <div className="flex justify-between">
                        <span className="text-white/50">Size:</span>
                        <span className="font-medium">{currentItem.size}</span>
                      </div>
                    )}
                    {currentItem.uploadedAt && (
                      <div className="flex justify-between">
                        <span className="text-white/50">Date:</span>
                        <span className="font-medium">{new Date(currentItem.uploadedAt).toLocaleDateString()}</span>
                      </div>
                    )}
                    {rawUrl && (
                      <div className="pt-2 border-t border-white/10">
                        <a
                          href={rawUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 text-sky-400 hover:text-sky-300 font-medium hover:underline text-[11px]"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                          <span>Open original URL in new tab</span>
                        </a>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Close Cross */}
            <button
              type="button"
              onClick={onClose}
              className="w-9 h-9 rounded-full hover:bg-rose-500/20 text-white/80 hover:text-rose-400 flex items-center justify-center transition-colors cursor-pointer active:scale-95 border-0 bg-transparent"
              title="Close (Esc)"
              aria-label="Close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </header>

        {/* ================= MAIN CONTENT VIEWPORT ================= */}
        <main
          className="flex-1 w-full h-full relative overflow-hidden flex items-center justify-center bg-[#07080b]"
          onWheel={handleWheel}
        >
          {/* FLOATING PREVIOUS ARROW */}
          {items.length > 1 && (
            <button
              type="button"
              onClick={handlePrev}
              disabled={!canGoPrev}
              className={`fixed left-3 sm:left-5 top-1/2 -translate-y-1/2 z-40 w-11 h-11 sm:w-13 sm:h-13 rounded-full flex items-center justify-center transition-all shadow-2xl backdrop-blur-md cursor-pointer border border-white/15 outline-none ${
                canGoPrev
                  ? 'bg-black/60 hover:bg-black/90 hover:scale-105 active:scale-95 text-white'
                  : 'bg-black/20 text-white/20 border-white/5 opacity-0 pointer-events-none'
              }`}
              title="Previous Note (Left Arrow)"
              aria-label="Previous file"
            >
              <ChevronLeft className="w-6 h-6 stroke-[2.5]" />
            </button>
          )}

          {/* FLOATING NEXT ARROW */}
          {items.length > 1 && (
            <button
              type="button"
              onClick={handleNext}
              disabled={!canGoNext}
              className={`fixed right-3 sm:right-5 top-1/2 -translate-y-1/2 z-40 w-11 h-11 sm:w-13 sm:h-13 rounded-full flex items-center justify-center transition-all shadow-2xl backdrop-blur-md cursor-pointer border border-white/15 outline-none ${
                canGoNext
                  ? 'bg-black/60 hover:bg-black/90 hover:scale-105 active:scale-95 text-white'
                  : 'bg-black/20 text-white/20 border-white/5 opacity-0 pointer-events-none'
              }`}
              title="Next Note (Right Arrow)"
              aria-label="Next file"
            >
              <ChevronRight className="w-6 h-6 stroke-[2.5]" />
            </button>
          )}

          {/* 1. IMAGE RENDERING ENGINE */}
          {detectedType === 'image' && (
            <div
              ref={imageContainerRef}
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
                if (zoom !== 1.0 || pan.x !== 0 || pan.y !== 0) {
                  handleResetZoom();
                } else {
                  setZoom(2.0);
                }
              }}
              className="w-full h-full flex items-center justify-center overflow-hidden cursor-grab active:cursor-grabbing select-none relative"
            >
              {/* Spinner while loading */}
              {!imageLoaded && !imageError && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
                  <div className="w-10 h-10 rounded-full border-3 border-sky-400 border-t-transparent animate-spin" />
                  <p className="text-xs text-white/60 font-medium">Loading high-resolution preview...</p>
                </div>
              )}

              {/* Error fallback */}
              {imageError && (
                <div className="text-center p-6 space-y-3">
                  <p className="text-sm font-semibold text-rose-400">Failed to render image preview</p>
                  {rawUrl && (
                    <a
                      href={rawUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-white/10 hover:bg-white/20 text-white text-xs font-semibold"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      <span>Open image in new tab</span>
                    </a>
                  )}
                </div>
              )}

              <img
                src={imageSrc}
                alt={currentItem.title}
                referrerPolicy="no-referrer"
                onLoad={() => setImageLoaded(true)}
                onError={() => {
                  setImageLoaded(true);
                  setImageError(true);
                }}
                style={{
                  transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom}) rotate(${rotation}deg)`,
                  transition: isDragging ? 'none' : 'transform 0.12s ease-out',
                  maxHeight: '92vh',
                  maxWidth: '92vw',
                }}
                className={`object-contain pointer-events-none rounded shadow-2xl transition-opacity duration-200 ${
                  imageLoaded ? 'opacity-100' : 'opacity-0'
                }`}
              />
            </div>
          )}

          {/* 2. PDF RENDERING ENGINE (Drive Embedded Iframe vs Canvas) */}
          {detectedType === 'pdf' && (
            <div className="w-full h-full flex flex-col">
              {viewEngine === 'embedded' && driveEmbedUrl ? (
                /* Google Drive Native Embedded Viewer */
                <iframe
                  src={driveEmbedUrl}
                  title={currentItem.title}
                  className="w-full h-full border-0 bg-[#121318]"
                  allow="autoplay; fullscreen"
                />
              ) : (
                /* Canvas-Based PDF Viewer */
                <PdfCanvasViewer
                  url={rawUrl}
                  fileName={currentItem.title}
                  onClose={onClose}
                  hideTopToolbar={false}
                />
              )}
            </div>
          )}

          {/* 3. DOCUMENT / TEXT / FALLBACK ENGINE */}
          {detectedType === 'doc' && (
            <div className="w-full h-full flex flex-col items-center justify-center p-4">
              {driveEmbedUrl ? (
                <iframe
                  src={driveEmbedUrl}
                  title={currentItem.title}
                  className="w-full h-full border-0 bg-[#121318]"
                  allow="autoplay; fullscreen"
                />
              ) : currentItem.content ? (
                <div className="max-w-3xl w-full max-h-[85vh] overflow-y-auto bg-white dark:bg-[#16171d] text-slate-800 dark:text-zinc-100 p-6 sm:p-8 rounded-2xl shadow-2xl border border-white/10">
                  <h2 className="text-xl font-bold mb-4">{currentItem.title}</h2>
                  <div className="prose dark:prose-invert max-w-none text-sm whitespace-pre-wrap leading-relaxed">
                    {currentItem.content}
                  </div>
                </div>
              ) : (
                <div className="text-center p-8 bg-white/5 rounded-3xl border border-white/10 max-w-md">
                  <FileText className="w-12 h-12 text-sky-400 mx-auto mb-3" />
                  <h3 className="text-base font-bold text-white mb-1">{currentItem.title}</h3>
                  <p className="text-xs text-white/60 mb-5">
                    This document can be previewed or downloaded directly.
                  </p>
                  <button
                    type="button"
                    onClick={handleDownload}
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-sky-500 hover:bg-sky-400 text-white text-xs font-bold transition shadow-lg cursor-pointer border-0"
                  >
                    <Download className="w-4 h-4" />
                    <span>Download Document</span>
                  </button>
                </div>
              )}
            </div>
          )}
        </main>

        {/* Bottom Floating Playlist Preview Dots (when <= 12 items) */}
        {items.length > 1 && items.length <= 12 && (
          <footer className="absolute bottom-4 left-1/2 -translate-x-1/2 z-30 flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-black/60 backdrop-blur-md border border-white/10">
            {items.map((it, idx) => (
              <button
                key={it.id || idx}
                type="button"
                onClick={() => setCurrentIndex(idx)}
                className={`w-2.5 h-2.5 rounded-full transition-all cursor-pointer border-0 ${
                  idx === currentIndex
                    ? 'w-6 bg-sky-400 shadow-sm'
                    : 'bg-white/30 hover:bg-white/60'
                }`}
                title={it.title}
                aria-label={`Go to item ${idx + 1}`}
              />
            ))}
          </footer>
        )}
      </motion.div>
    </AnimatePresence>
  );
};
