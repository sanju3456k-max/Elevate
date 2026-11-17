import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import {
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  RotateCw,
  Download,
  RefreshCw,
  FileText,
  AlertTriangle,
  Scroll,
  Square,
  Maximize2,
  Minimize2,
} from 'lucide-react';
import { APP_STYLES } from './ui/AppStyles';

// Set up worker CDN URL compatible with pdfjs-dist version
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version || '4.10.38'}/pdf.worker.min.mjs`;

interface PdfCanvasViewerProps {
  url: string;
  fallbackEmbedUrl?: string;
  fileName?: string;
  onClose?: () => void;
  hideTopToolbar?: boolean;
  hideBottomDock?: boolean;
}

// Single Page Canvas Renderer Component for Continuous Scroll and High Performance
interface ContinuousPageItemProps {
  pdfDoc: pdfjsLib.PDFDocumentProxy;
  pageNumber: number;
  scale: number;
  rotation: number;
  onEnterView?: (pageNum: number) => void;
}

const ContinuousPageItem: React.FC<ContinuousPageItemProps> = ({
  pdfDoc,
  pageNumber,
  scale,
  rotation,
  onEnterView,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [rendered, setRendered] = useState<boolean>(false);
  const [rendering, setRendering] = useState<boolean>(false);
  const [pageDims, setPageDims] = useState<{ width: number; height: number }>({ width: 0, height: 0 });
  const activeTaskRef = useRef<any>(null);

  // Measure initial page dimensions
  useEffect(() => {
    let active = true;
    pdfDoc.getPage(pageNumber).then((page) => {
      if (!active) return;
      const viewport = page.getViewport({ scale, rotation });
      setPageDims({ width: viewport.width, height: viewport.height });
    }).catch(() => {});
    return () => {
      active = false;
    };
  }, [pdfDoc, pageNumber, scale, rotation]);

  // Render on intersection / visibility
  const renderPage = useCallback(async () => {
    if (!canvasRef.current || rendering) return;

    if (activeTaskRef.current) {
      try {
        activeTaskRef.current.cancel();
        await activeTaskRef.current.promise;
      } catch {}
    }

    setRendering(true);
    try {
      const page = await pdfDoc.getPage(pageNumber);
      const canvas = canvasRef.current;
      if (!canvas) return;
      const context = canvas.getContext('2d');
      if (!context) return;

      const viewport = page.getViewport({ scale, rotation });
      const outputScale = Math.max(window.devicePixelRatio || 1, 2);

      canvas.width = Math.floor(viewport.width * outputScale);
      canvas.height = Math.floor(viewport.height * outputScale);
      canvas.style.width = `${Math.floor(viewport.width)}px`;
      canvas.style.height = `${Math.floor(viewport.height)}px`;

      setPageDims({ width: viewport.width, height: viewport.height });

      const transform = outputScale !== 1 ? [outputScale, 0, 0, outputScale, 0, 0] : undefined;
      const renderTask = page.render({
        canvasContext: context,
        viewport,
        transform,
      });
      activeTaskRef.current = renderTask;
      await renderTask.promise;
      setRendered(true);
    } catch (err: any) {
      if (err?.name !== 'RenderingCancelledException') {
        console.warn(`Error rendering page ${pageNumber}:`, err);
      }
    } finally {
      activeTaskRef.current = null;
      setRendering(false);
    }
  }, [pdfDoc, pageNumber, scale, rotation, rendering]);

  // IntersectionObserver to lazy-render and track active page
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            onEnterView?.(pageNumber);
            renderPage();
          }
        });
      },
      { rootMargin: '300px 0px', threshold: 0.1 }
    );

    observer.observe(el);
    return () => {
      observer.disconnect();
      if (activeTaskRef.current) {
        try {
          activeTaskRef.current.cancel();
        } catch {}
      }
    };
  }, [pageNumber, onEnterView, renderPage]);

  // Re-render when scale or rotation changes
  useEffect(() => {
    setRendered(false);
    renderPage();
  }, [scale, rotation]);

  return (
    <div
      ref={containerRef}
      id={`pdf-page-container-${pageNumber}`}
      style={{
        width: pageDims.width ? `${pageDims.width}px` : '100%',
        minHeight: pageDims.height ? `${pageDims.height}px` : '320px',
      }}
      className="relative flex items-center justify-center bg-white dark:bg-[#181a20] transition-all duration-75 overflow-hidden my-[2px] first:mt-0 last:mb-0 shadow-xs dark:shadow-md border-0"
    >
      <canvas ref={canvasRef} className="block max-w-none" />
      {(!rendered || rendering) && (
        <div className="absolute inset-0 flex items-center justify-center bg-white/70 dark:bg-black/30 backdrop-blur-2xs text-[11px] text-slate-500 dark:text-zinc-400 font-mono">
          <RefreshCw className="w-4 h-4 animate-spin text-emerald-500 mr-1.5" />
          <span>Slide {pageNumber}</span>
        </div>
      )}
    </div>
  );
};

export const PdfCanvasViewer: React.FC<PdfCanvasViewerProps> = ({
  url,
  fallbackEmbedUrl,
  fileName,
  onClose,
  hideTopToolbar = false,
  hideBottomDock = false,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);

  const [pdfDoc, setPdfDoc] = useState<pdfjsLib.PDFDocumentProxy | null>(null);
  const [pageNum, setPageNum] = useState<number>(1);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [fitScale, setFitScale] = useState<number>(1.0);
  const [rotation, setRotation] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);
  const [rendering, setRendering] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [pageWidth, setPageWidth] = useState<number>(0);
  const [pageHeight, setPageHeight] = useState<number>(0);

  // View Mode: 'continuous' (all slides stacked vertically with 0/minor gap) or 'single' (one slide at a time)
  const [displayMode, setDisplayMode] = useState<'continuous' | 'single'>('continuous');

  // Compute PDF File Size if it is base64 Data URI
  const pdfSizeStr = useMemo(() => {
    if (!url || !url.startsWith('data:')) return '';
    try {
      const base64Str = url.split(',')[1] || '';
      const bytes = Math.round((base64Str.length * 3) / 4);
      if (bytes < 1024) return `${bytes} B`;
      if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
      return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    } catch {
      return '';
    }
  }, [url]);

  // Zoom & Pan state
  const [zoom, setZoom] = useState<number>(1.0);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [panPosition, setPanPosition] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const dragStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  // Load PDF Document from base64 or URL
  useEffect(() => {
    let isCancelled = false;
    setLoading(true);
    setError(null);

    const loadPdf = async () => {
      if (!url || typeof url !== 'string' || !url.trim()) {
        if (!isCancelled) {
          setError('No valid PDF document source provided.');
          setLoading(false);
        }
        return;
      }

      const cleanUrl = url.trim();

      try {
        let loadingTask: any;
        if (cleanUrl.startsWith('data:application/pdf') || cleanUrl.startsWith('data:')) {
          const base64Str = cleanUrl.includes(',') ? cleanUrl.split(',')[1] : cleanUrl;
          const binaryStr = atob(base64Str);
          const bytes = new Uint8Array(binaryStr.length);
          for (let i = 0; i < binaryStr.length; i++) {
            bytes[i] = binaryStr.charCodeAt(i);
          }
          loadingTask = pdfjsLib.getDocument({ data: bytes });
        } else {
          loadingTask = pdfjsLib.getDocument({ url: cleanUrl });
        }

        const pdf = await loadingTask.promise;
        if (!isCancelled) {
          setPdfDoc(pdf);
          setTotalPages(pdf.numPages);
          setPageNum(1);

          // Flush-fit: Calculate exact 100% full width/height fit without empty margins
          try {
            const firstPage = await pdf.getPage(1);
            const unscaledViewport = firstPage.getViewport({ scale: 1 });
            const containerWidth = containerRef.current?.clientWidth || window.innerWidth || 800;
            const containerHeight = (containerRef.current?.clientHeight || window.innerHeight || 900) - (hideTopToolbar ? 0 : 56);

            // Fit full width cleanly (minor 8px margin instead of 64px)
            const widthScale = (containerWidth - 8) / unscaledViewport.width;
            const heightScale = containerHeight / unscaledViewport.height;
            const autoScale = Math.min(widthScale, heightScale);
            setFitScale(Math.max(0.4, Number(autoScale.toFixed(2))));
          } catch {
            setFitScale(1.0);
          }

          setLoading(false);
        }
      } catch (err: any) {
        if (!isCancelled) {
          console.error('PDF.js loading error:', err);
          setError(err?.message || 'Failed to parse PDF document.');
          setLoading(false);
        }
      }
    };

    loadPdf();
    return () => {
      isCancelled = true;
    };
  }, [url, hideTopToolbar]);

  // Active render task ref for single slide mode
  const activeRenderTaskRef = useRef<any>(null);

  // Render Current Page to Canvas in Single Slide Mode
  useEffect(() => {
    if (!pdfDoc || !canvasRef.current || displayMode !== 'single') return;
    let isCancelled = false;

    const renderPage = async () => {
      if (activeRenderTaskRef.current) {
        try {
          activeRenderTaskRef.current.cancel();
          await activeRenderTaskRef.current.promise;
        } catch {}
      }

      if (isCancelled) return;
      setRendering(true);

      try {
        const page = await pdfDoc.getPage(pageNum);
        if (isCancelled) return;

        const canvas = canvasRef.current;
        if (!canvas) return;
        const context = canvas.getContext('2d');
        if (!context) return;

        const layoutViewport = page.getViewport({ scale: fitScale, rotation });
        const outputScale = Math.max(window.devicePixelRatio || 1, 2);

        canvas.width = Math.floor(layoutViewport.width * outputScale);
        canvas.height = Math.floor(layoutViewport.height * outputScale);
        canvas.style.width = `${Math.floor(layoutViewport.width)}px`;
        canvas.style.height = `${Math.floor(layoutViewport.height)}px`;

        setPageWidth(layoutViewport.width);
        setPageHeight(layoutViewport.height);

        const transform = outputScale !== 1 ? [outputScale, 0, 0, outputScale, 0, 0] : undefined;
        const renderTask = page.render({
          canvasContext: context,
          viewport: layoutViewport,
          transform,
          canvas,
        });
        activeRenderTaskRef.current = renderTask;
        await renderTask.promise;

        if (!isCancelled) {
          setRendering(false);
        }
      } catch (err: any) {
        if (err?.name !== 'RenderingCancelledException' && !err?.message?.includes('cancelled')) {
          console.error('PDF canvas render error:', err);
        }
        if (!isCancelled) {
          setRendering(false);
        }
      } finally {
        if (activeRenderTaskRef.current?.promise) {
          activeRenderTaskRef.current = null;
        }
      }
    };

    renderPage();
    return () => {
      isCancelled = true;
      if (activeRenderTaskRef.current) {
        try {
          activeRenderTaskRef.current.cancel();
        } catch {}
      }
    };
  }, [pdfDoc, pageNum, fitScale, rotation, displayMode]);

  const handleZoomIn = () => setZoom((prev) => Math.min(Number((prev + 0.2).toFixed(2)), 4.0));
  const handleZoomOut = () => setZoom((prev) => Math.max(Number((prev - 0.2).toFixed(2)), 0.5));
  const handleResetZoom = () => {
    setZoom(1.0);
    setPanPosition({ x: 0, y: 0 });
  };
  const handleRotate = () => setRotation((prev) => (prev + 90) % 360);

  const handlePrevPage = () => {
    const nextP = Math.max(pageNum - 1, 1);
    setPageNum(nextP);
    setPanPosition({ x: 0, y: 0 });
    if (displayMode === 'continuous') {
      const el = document.getElementById(`pdf-page-container-${nextP}`);
      el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const handleNextPage = () => {
    const nextP = Math.min(pageNum + 1, totalPages);
    setPageNum(nextP);
    setPanPosition({ x: 0, y: 0 });
    if (displayMode === 'continuous') {
      const el = document.getElementById(`pdf-page-container-${nextP}`);
      el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  // Drag handlers for single slide mode
  const handleMouseDown = (e: React.MouseEvent) => {
    if (displayMode === 'continuous' && zoom === 1.0) return;
    setIsDragging(true);
    dragStartRef.current = { x: e.clientX - panPosition.x, y: e.clientY - panPosition.y };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    setPanPosition({
      x: e.clientX - dragStartRef.current.x,
      y: e.clientY - dragStartRef.current.y,
    });
  };

  const handleMouseUp = () => setIsDragging(false);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        handlePrevPage();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        handleNextPage();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [totalPages, pageNum, displayMode]);

  const effectiveScale = fitScale * zoom;

  return (
    <div className="flex flex-col flex-1 w-full h-full bg-white dark:bg-[#0b0c10] text-slate-900 dark:text-zinc-100 font-sans relative overflow-hidden select-none transition-colors duration-200">
      {/* Top Controls Toolbar (adaptive Dark / Light mode) */}
      {!hideTopToolbar && (
        <div className="h-14 px-3 sm:px-5 bg-white/95 dark:bg-[#16171d]/95 backdrop-blur-md border-b border-slate-200/80 dark:border-white/10 shrink-0 flex items-center justify-between gap-2.5 z-20 shadow-xs">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="p-2 rounded-xl bg-rose-500/10 dark:bg-rose-500/15 text-rose-600 dark:text-rose-400 shrink-0">
              <FileText className="w-4 h-4" />
            </div>
            <div className="flex flex-col min-w-0">
              <span className="text-xs font-bold text-slate-800 dark:text-slate-100 truncate max-w-[140px] sm:max-w-[260px]">
                {fileName || 'PDF Document'}
              </span>
              <span className="text-[10px] text-slate-500 dark:text-slate-400 font-mono">
                {totalPages} {totalPages === 1 ? 'Slide' : 'Slides'} {pdfSizeStr ? `• ${pdfSizeStr}` : ''}
              </span>
            </div>
          </div>

          {/* Centered Controls: Page Navigation, Zoom, Rotate, Mode Toggle */}
          <div className="flex items-center gap-1 bg-slate-100/90 dark:bg-white/5 px-2.5 py-1 rounded-full border border-slate-200/80 dark:border-white/10 text-xs font-mono shadow-inner">
            {/* Prev Page */}
            <button
              type="button"
              onClick={handlePrevPage}
              disabled={pageNum <= 1 || loading}
              className="p-1 hover:bg-slate-200 dark:hover:bg-white/10 rounded-full text-slate-700 dark:text-slate-300 disabled:opacity-20 cursor-pointer transition-colors border-0 bg-transparent"
              title="Previous Slide (Left Arrow)"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            {/* Page Counter Badge */}
            <span className="text-slate-800 dark:text-slate-200 font-bold px-1 text-[11px]">
              {pageNum} / {totalPages}
            </span>

            {/* Next Page */}
            <button
              type="button"
              onClick={handleNextPage}
              disabled={pageNum >= totalPages || loading}
              className="p-1 hover:bg-slate-200 dark:hover:bg-white/10 rounded-full text-slate-700 dark:text-slate-300 disabled:opacity-20 cursor-pointer transition-colors border-0 bg-transparent"
              title="Next Slide (Right Arrow)"
            >
              <ChevronRight className="w-4 h-4" />
            </button>

            <div className="w-px h-3 bg-slate-300 dark:bg-white/20 mx-0.5" />

            {/* Zoom Out */}
            <button
              type="button"
              onClick={handleZoomOut}
              disabled={zoom <= 0.5 || loading}
              className="p-1 hover:bg-slate-200 dark:hover:bg-white/10 rounded-full text-slate-700 dark:text-slate-300 disabled:opacity-20 cursor-pointer transition-colors border-0 bg-transparent"
              title="Zoom Out (-)"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>

            {/* Reset Zoom */}
            <button
              type="button"
              onClick={handleResetZoom}
              className="text-[11px] font-bold text-sky-600 dark:text-sky-400 hover:opacity-80 px-1 cursor-pointer transition-colors border-0 bg-transparent min-w-[38px] text-center"
              title="Reset Zoom (100%)"
            >
              {Math.round(zoom * 100)}%
            </button>

            {/* Zoom In */}
            <button
              type="button"
              onClick={handleZoomIn}
              disabled={zoom >= 4.0 || loading}
              className="p-1 hover:bg-slate-200 dark:hover:bg-white/10 rounded-full text-slate-700 dark:text-slate-300 disabled:opacity-20 cursor-pointer transition-colors border-0 bg-transparent"
              title="Zoom In (+)"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>

            <div className="w-px h-3 bg-slate-300 dark:bg-white/20 mx-0.5" />

            {/* Rotate */}
            <button
              type="button"
              onClick={handleRotate}
              disabled={loading}
              className="p-1 hover:bg-slate-200 dark:hover:bg-white/10 rounded-full text-slate-700 dark:text-slate-300 cursor-pointer transition-colors border-0 bg-transparent"
              title="Rotate 90° (R)"
            >
              <RotateCw className="w-3.5 h-3.5" />
            </button>

            <div className="w-px h-3 bg-slate-300 dark:bg-white/20 mx-0.5" />

            {/* Continuous vs Single Slide Toggle */}
            <button
              type="button"
              onClick={() => setDisplayMode((prev) => (prev === 'continuous' ? 'single' : 'continuous'))}
              className={`p-1 rounded-full cursor-pointer transition-colors border-0 ${
                displayMode === 'continuous'
                  ? 'bg-sky-500/15 text-sky-600 dark:text-sky-400 font-bold'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-white/10'
              }`}
              title={displayMode === 'continuous' ? 'Continuous Scroll (Zero Gap)' : 'Single Slide View'}
            >
              {displayMode === 'continuous' ? <Scroll className="w-3.5 h-3.5" /> : <Square className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>
      )}

      {/* Main Viewport Container: Zero padding / minor spacing between slides */}
      <div
        ref={containerRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        className={`flex-1 w-full h-full relative overflow-hidden flex flex-col items-center justify-start bg-white dark:bg-[#0b0c10] select-none ${
          isDragging ? 'cursor-grabbing' : ''
        }`}
      >
        {/* Floating Minimal Controls Dock when top toolbar is hidden and bottom dock not suppressed */}
        {hideTopToolbar && !hideBottomDock && (
          <div className="absolute bottom-5 left-1/2 -translate-x-1/2 z-30 flex items-center gap-1 px-3 py-1.5 rounded-full bg-white/95 dark:bg-[#16171d]/95 border border-slate-200/80 dark:border-white/10 shadow-2xl backdrop-blur-md text-xs select-none">
            <button
              type="button"
              onClick={handlePrevPage}
              disabled={pageNum <= 1 || loading}
              className="p-1 hover:bg-slate-100 dark:hover:bg-white/10 rounded-full text-slate-700 dark:text-slate-300 disabled:opacity-20 cursor-pointer border-0 bg-transparent"
              title="Previous Slide"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-slate-800 dark:text-slate-200 font-mono font-bold px-1.5 text-[11px]">
              {pageNum} / {totalPages}
            </span>
            <button
              type="button"
              onClick={handleNextPage}
              disabled={pageNum >= totalPages || loading}
              className="p-1 hover:bg-slate-100 dark:hover:bg-white/10 rounded-full text-slate-700 dark:text-slate-300 disabled:opacity-20 cursor-pointer border-0 bg-transparent"
              title="Next Slide"
            >
              <ChevronRight className="w-4 h-4" />
            </button>

            <div className="w-px h-3.5 bg-slate-200 dark:bg-white/15 mx-1" />

            <button
              type="button"
              onClick={handleZoomOut}
              disabled={zoom <= 0.5 || loading}
              className="p-1 hover:bg-slate-100 dark:hover:bg-white/10 rounded-full text-slate-700 dark:text-slate-300 disabled:opacity-20 cursor-pointer border-0 bg-transparent"
              title="Zoom Out"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={handleResetZoom}
              className="text-[11px] font-bold text-sky-600 dark:text-sky-400 px-1 cursor-pointer border-0 bg-transparent"
              title="Reset Zoom"
            >
              {Math.round(zoom * 100)}%
            </button>
            <button
              type="button"
              onClick={handleZoomIn}
              disabled={zoom >= 4.0 || loading}
              className="p-1 hover:bg-slate-100 dark:hover:bg-white/10 rounded-full text-slate-700 dark:text-slate-300 disabled:opacity-20 cursor-pointer border-0 bg-transparent"
              title="Zoom In"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>

            <div className="w-px h-3.5 bg-slate-200 dark:bg-white/15 mx-1" />

            <button
              type="button"
              onClick={() => setDisplayMode((prev) => (prev === 'continuous' ? 'single' : 'continuous'))}
              className="p-1 hover:bg-slate-100 dark:hover:bg-white/10 rounded-full text-slate-700 dark:text-slate-300 cursor-pointer border-0 bg-transparent"
              title={displayMode === 'continuous' ? 'Switch to Single Slide' : 'Switch to Continuous Scroll'}
            >
              {displayMode === 'continuous' ? <Scroll className="w-3.5 h-3.5 text-sky-500" /> : <Square className="w-3.5 h-3.5" />}
            </button>
          </div>
        )}

        {/* Loading Spinner */}
        {loading && (
          <div className="absolute inset-0 bg-white/70 dark:bg-black/70 backdrop-blur-2xs flex flex-col items-center justify-center gap-3 z-30 text-slate-700 dark:text-slate-300">
            <RefreshCw className="w-7 h-7 animate-spin text-sky-500" />
            <span className="text-xs font-semibold">Loading Slides...</span>
          </div>
        )}

        {/* Error Notification or Seamless Embedded Fallback */}
        {error ? (
          fallbackEmbedUrl ? (
            <div className="w-full h-full flex flex-col relative bg-white dark:bg-[#121318]">
              <iframe
                src={fallbackEmbedUrl}
                title={fileName || 'PDF Document'}
                className="w-full h-full border-0 bg-white dark:bg-[#121318]"
                allow="autoplay; fullscreen"
              />
            </div>
          ) : (
            <div className="m-auto text-center p-6 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800/60 rounded-3xl max-w-md space-y-3 shadow-lg">
              <AlertTriangle className="w-8 h-8 text-rose-500 mx-auto" />
              <h4 className="text-sm font-bold text-rose-700 dark:text-rose-200">Unable to Render PDF</h4>
              <p className="text-xs text-rose-600/80 dark:text-rose-300/80">{error}</p>
              <a
                href={url}
                download={fileName || 'document.pdf'}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold transition-all no-underline"
              >
                <Download className="w-4 h-4" />
                <span>Download PDF File</span>
              </a>
            </div>
          )
        ) : pdfDoc ? (
          /* 1. CONTINUOUS VERTICAL SCROLL MODE (Zero or minor 1-2px gap between slides) */
          displayMode === 'continuous' ? (
            <div
              ref={scrollContainerRef}
              className="w-full h-full overflow-y-auto overflow-x-hidden flex flex-col items-center p-0 scrollbar-thin scrollbar-thumb-slate-300 dark:scrollbar-thumb-zinc-700"
              style={{
                scrollBehavior: 'smooth',
              }}
            >
              <div
                className="flex flex-col items-center w-full max-w-full my-0"
                style={{
                  transform: `scale(${zoom})`,
                  transformOrigin: 'top center',
                  transition: 'transform 0.1s ease-out',
                }}
              >
                {Array.from({ length: totalPages }, (_, idx) => idx + 1).map((pNum) => (
                  <ContinuousPageItem
                    key={`page-${pNum}`}
                    pdfDoc={pdfDoc}
                    pageNumber={pNum}
                    scale={fitScale}
                    rotation={rotation}
                    onEnterView={(currentVisible) => setPageNum(currentVisible)}
                  />
                ))}
              </div>
            </div>
          ) : (
            /* 2. SINGLE SLIDE MODE (Zero Margin, Centered, Touch Drag & Zoom) */
            <div className="w-full h-full flex items-center justify-center overflow-hidden p-0 relative">
              <div
                className="relative shadow-lg dark:shadow-2xl rounded-none sm:rounded-sm overflow-hidden bg-white dark:bg-[#181a20] transition-transform duration-75 shrink-0"
                style={{
                  width: pageWidth ? `${pageWidth}px` : 'auto',
                  height: pageHeight ? `${pageHeight}px` : 'auto',
                  transform: `translate(${panPosition.x}px, ${panPosition.y}px) scale(${zoom})`,
                  transformOrigin: 'center center',
                }}
              >
                <canvas ref={canvasRef} className="block max-w-none" />
                {rendering && (
                  <div className="absolute top-2 right-2 bg-slate-900/80 text-sky-400 px-2.5 py-1 rounded-full text-[10px] font-mono flex items-center gap-1.5 shadow-md">
                    <RefreshCw className="w-3 h-3 animate-spin" />
                    <span>Rendering...</span>
                  </div>
                )}
              </div>
            </div>
          )
        ) : null}
      </div>
    </div>
  );
};
