import React, { useEffect, useLayoutEffect, useRef, useState, useMemo, useCallback } from 'react';
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
  const [baseDims, setBaseDims] = useState<{ width: number; height: number }>({ width: 0, height: 0 });
  const activeTaskRef = useRef<any>(null);
  const renderingRef = useRef<boolean>(false);
  const renderedRef = useRef<boolean>(false);
  const isNearViewportRef = useRef<boolean>(false);
  const onEnterViewRef = useRef(onEnterView);
  onEnterViewRef.current = onEnterView;

  // Measure base page dimensions at scale=1 ONCE so zoomed dimensions update synchronously
  useEffect(() => {
    let active = true;
    pdfDoc.getPage(pageNumber).then((page) => {
      if (!active) return;
      const viewport = page.getViewport({ scale: 1, rotation });
      setBaseDims({ width: viewport.width, height: viewport.height });
    }).catch(() => {});
    return () => {
      active = false;
    };
  }, [pdfDoc, pageNumber, rotation]);

  const pageDims = useMemo(() => ({
    width: baseDims.width ? Math.floor(baseDims.width * scale) : 0,
    height: baseDims.height ? Math.floor(baseDims.height * scale) : 0,
  }), [baseDims, scale]);

  // Render on intersection / visibility (stable callback: never depends on `rendering` or `onEnterView`)
  const renderPage = useCallback(async () => {
    if (!canvasRef.current || renderingRef.current) return;

    if (activeTaskRef.current) {
      try {
        activeTaskRef.current.cancel();
        await activeTaskRef.current.promise;
      } catch {}
    }

    renderingRef.current = true;
    setRendering(true);
    try {
      const page = await pdfDoc.getPage(pageNumber);
      const canvas = canvasRef.current;
      if (!canvas) return;
      const context = canvas.getContext('2d');
      if (!context) return;

      const viewport = page.getViewport({ scale, rotation });
      const outputScale = Math.min(Math.max(window.devicePixelRatio || 1, 2), 3);
      const targetW = Math.floor(viewport.width * outputScale);
      const targetH = Math.floor(viewport.height * outputScale);

      // Render into an offscreen buffer first so the visible canvas NEVER flashes blank white during zoom
      const offscreen = document.createElement('canvas');
      offscreen.width = targetW;
      offscreen.height = targetH;
      const offCtx = offscreen.getContext('2d');
      if (!offCtx) return;

      const transform = outputScale !== 1 ? [outputScale, 0, 0, outputScale, 0, 0] : undefined;
      const renderTask = page.render({
        canvasContext: offCtx,
        viewport,
        transform,
      });
      activeTaskRef.current = renderTask;
      await renderTask.promise;

      if (canvasRef.current === canvas) {
        canvas.width = targetW;
        canvas.height = targetH;
        canvas.style.width = '100%';
        canvas.style.height = '100%';
        context.drawImage(offscreen, 0, 0);
      }
      renderedRef.current = true;
      setRendered(true);
    } catch (err: any) {
      if (err?.name !== 'RenderingCancelledException') {
        console.warn(`Error rendering page ${pageNumber}:`, err);
      }
    } finally {
      activeTaskRef.current = null;
      renderingRef.current = false;
      setRendering(false);
    }
  }, [pdfDoc, pageNumber, scale, rotation]);

  // IntersectionObserver 1: Lazy-render pages near the viewport
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const renderObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          isNearViewportRef.current = entry.isIntersecting;
          if (entry.isIntersecting && !renderedRef.current) {
            renderPage();
          }
        });
      },
      { rootMargin: '350px 0px', threshold: 0.01 }
    );

    // IntersectionObserver 2: Track which page is actually centered in view
    const activeObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            onEnterViewRef.current?.(pageNumber);
          }
        });
      },
      { rootMargin: '-35% 0px -35% 0px', threshold: 0 }
    );

    renderObserver.observe(el);
    activeObserver.observe(el);
    return () => {
      renderObserver.disconnect();
      activeObserver.disconnect();
      if (activeTaskRef.current) {
        try {
          activeTaskRef.current.cancel();
        } catch {}
      }
      renderingRef.current = false;
    };
  }, [pageNumber, renderPage]);

  // Re-render only visible/near-viewport pages when scale or rotation changes
  useEffect(() => {
    renderedRef.current = false;
    if (isNearViewportRef.current || pageNumber <= 2) {
      renderPage();
    }
  }, [scale, rotation, pageNumber, renderPage]);

  return (
    <div
      ref={containerRef}
      id={`pdf-page-container-${pageNumber}`}
      style={{
        width: pageDims.width ? `${pageDims.width}px` : '100%',
        height: pageDims.height ? `${pageDims.height}px` : undefined,
        minHeight: pageDims.height ? `${pageDims.height}px` : '320px',
      }}
      className="relative flex items-center justify-center bg-white dark:bg-[#181a20] overflow-hidden my-0 border-0 rounded-none shrink-0"
    >
      <canvas ref={canvasRef} className="block w-full h-full max-w-none" />
      {!rendered && (
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

  // View Mode: 'continuous' (default seamless continuous scroll)
  const [displayMode, setDisplayMode] = useState<'continuous' | 'single'>('continuous');
  const [zoom, setZoom] = useState<number>(1.0);

  // Google-Drive-style scroll-only page indicator
  const [isScrolling, setIsScrolling] = useState<boolean>(false);
  const scrollHideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleContainerScroll = useCallback(() => {
    setIsScrolling(true);
    if (scrollHideTimerRef.current) {
      clearTimeout(scrollHideTimerRef.current);
    }
    scrollHideTimerRef.current = setTimeout(() => {
      setIsScrolling(false);
    }, 1500);
  }, []);

  useEffect(() => {
    return () => {
      if (scrollHideTimerRef.current) clearTimeout(scrollHideTimerRef.current);
    };
  }, []);

  // Touch Pinch-to-Zoom (1x to 3x) & Double-Tap Zoom (1x <-> 2x)
  // Uses 60fps GPU CSS transform during active pinch, then commits crisp PDF.js render ONCE on touchend.
  const pdfContentRef = useRef<HTMLDivElement | null>(null);
  const pinchStateRef = useRef<{
    active: boolean;
    startDist: number;
    startZoom: number;
    startContentX: number;
    startContentY: number;
    startScrollLeft: number;
    startScrollTop: number;
    lastNextZoom: number;
    lastClientX: number;
    lastClientY: number;
  } | null>(null);
  const lastTapRef = useRef<{ time: number; x: number; y: number }>({ time: 0, x: 0, y: 0 });
  const touchTapOriginRef = useRef<{ x: number; y: number; moved: boolean } | null>(null);
  const lastTouchDoubleTapAtRef = useRef<number>(0);
  const zoomRef = useRef<number>(zoom);
  zoomRef.current = zoom;

  const pendingZoomAnchorRef = useRef<{
    prevZoom: number;
    nextZoom: number;
    relX: number;
    relY: number;
    contentX: number;
    contentY: number;
  } | null>(null);

  const applyAnchoredZoom = useCallback(
    (nextZoom: number, clientX?: number, clientY?: number, overrideContentX?: number, overrideContentY?: number) => {
      const el = scrollContainerRef.current;
      const prevZoom = zoomRef.current;
      if (el && Math.abs(nextZoom - prevZoom) > 0.001) {
        const rect = el.getBoundingClientRect();
        const relX = clientX !== undefined ? clientX - rect.left : rect.width / 2;
        const relY = clientY !== undefined ? clientY - rect.top : rect.height / 2;
        pendingZoomAnchorRef.current = {
          prevZoom,
          nextZoom,
          relX,
          relY,
          contentX: overrideContentX !== undefined ? overrideContentX : el.scrollLeft + relX,
          contentY: overrideContentY !== undefined ? overrideContentY : el.scrollTop + relY,
        };
      }
      setZoom(nextZoom);
    },
    []
  );

  useLayoutEffect(() => {
    const anchor = pendingZoomAnchorRef.current;
    const el = scrollContainerRef.current;
    if (!anchor || !el) return;
    pendingZoomAnchorRef.current = null;
    const scale = anchor.nextZoom / anchor.prevZoom;
    el.scrollLeft = Math.max(0, anchor.contentX * scale - anchor.relX);
    el.scrollTop = Math.max(0, anchor.contentY * scale - anchor.relY);
  }, [zoom]);

  // Non-passive touchstart & touchmove listeners so 2-finger pinch actually cancels native scroll on Android WebView
  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const preventPinchScroll = (ev: TouchEvent) => {
      if (ev.touches.length >= 2) {
        ev.preventDefault();
      }
    };
    el.addEventListener('touchstart', preventPinchScroll, { passive: false });
    el.addEventListener('touchmove', preventPinchScroll, { passive: false });
    return () => {
      el.removeEventListener('touchstart', preventPinchScroll);
      el.removeEventListener('touchmove', preventPinchScroll);
    };
  }, [pdfDoc, displayMode]);

  const getTouchDistance = (t1: React.Touch, t2: React.Touch) => {
    const dx = t1.clientX - t2.clientX;
    const dy = t1.clientY - t2.clientY;
    return Math.hypot(dx, dy);
  };

  const handleTouchStart = useCallback((e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length === 1) {
      touchTapOriginRef.current = {
        x: e.touches[0].clientX,
        y: e.touches[0].clientY,
        moved: false,
      };
    } else {
      touchTapOriginRef.current = null;
    }
    if (e.touches.length === 2 && scrollContainerRef.current) {
      const el = scrollContainerRef.current;
      const rect = el.getBoundingClientRect();
      const midX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
      const midY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
      const relX = midX - rect.left;
      const relY = midY - rect.top;
      pinchStateRef.current = {
        active: true,
        startDist: Math.max(1, getTouchDistance(e.touches[0], e.touches[1])),
        startZoom: zoomRef.current,
        startContentX: el.scrollLeft + relX,
        startContentY: el.scrollTop + relY,
        startScrollLeft: el.scrollLeft,
        startScrollTop: el.scrollTop,
        lastNextZoom: zoomRef.current,
        lastClientX: midX,
        lastClientY: midY,
      };
    }
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length === 1 && touchTapOriginRef.current && !touchTapOriginRef.current.moved) {
      const dx = e.touches[0].clientX - touchTapOriginRef.current.x;
      const dy = e.touches[0].clientY - touchTapOriginRef.current.y;
      if (Math.hypot(dx, dy) > 14) {
        touchTapOriginRef.current.moved = true;
      }
    }
    const ps = pinchStateRef.current;
    const el = scrollContainerRef.current;
    const contentEl = pdfContentRef.current;
    if (e.touches.length === 2 && ps?.active && el && contentEl) {
      e.preventDefault();
      const currentDist = getTouchDistance(e.touches[0], e.touches[1]);
      const ratio = currentDist / ps.startDist;
      const nextZoom = Math.min(3.0, Math.max(1.0, Number((ps.startZoom * ratio).toFixed(3))));
      const relScale = nextZoom / ps.startZoom;

      const rect = el.getBoundingClientRect();
      const midX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
      const midY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
      const curRelX = midX - rect.left;
      const curRelY = midY - rect.top;

      const tx = ps.startScrollLeft + curRelX - relScale * ps.startContentX;
      const ty = ps.startScrollTop + curRelY - relScale * ps.startContentY;

      contentEl.style.transformOrigin = '0 0';
      contentEl.style.willChange = 'transform';
      contentEl.style.transform = `translate3d(${tx}px, ${ty}px, 0) scale(${relScale})`;

      ps.lastNextZoom = nextZoom;
      ps.lastClientX = midX;
      ps.lastClientY = midY;
    }
  }, []);

  const handleTouchEnd = useCallback(
    (e: React.TouchEvent<HTMLDivElement>) => {
      const ps = pinchStateRef.current;
      if (e.touches.length < 2 && ps?.active) {
        pinchStateRef.current = null;
        if (pdfContentRef.current) {
          pdfContentRef.current.style.transform = '';
          pdfContentRef.current.style.transformOrigin = '';
          pdfContentRef.current.style.willChange = '';
        }
        applyAnchoredZoom(ps.lastNextZoom, ps.lastClientX, ps.lastClientY, ps.startContentX, ps.startContentY);
        return;
      }
      if (e.touches.length === 0 && e.changedTouches.length === 1) {
        const tapOrigin = touchTapOriginRef.current;
        touchTapOriginRef.current = null;
        if (tapOrigin?.moved) {
          lastTapRef.current = { time: 0, x: 0, y: 0 };
          return;
        }
        const t = e.changedTouches[0];
        const now = Date.now();
        const prev = lastTapRef.current;
        const tapDist = Math.hypot(t.clientX - prev.x, t.clientY - prev.y);
        if (now - prev.time < 320 && tapDist < 56) {
          e.preventDefault();
          lastTouchDoubleTapAtRef.current = now;
          const nextZoom = zoomRef.current > 1.15 ? 1.0 : 2.0;
          applyAnchoredZoom(nextZoom, t.clientX, t.clientY);
          lastTapRef.current = { time: 0, x: 0, y: 0 };
        } else {
          lastTapRef.current = { time: now, x: t.clientX, y: t.clientY };
        }
      }
    },
    [applyAnchoredZoom]
  );

  const handleDoubleClickZoom = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      // Ignore synthetic dblclick fired by mobile browsers right after touch double-tap
      if (Date.now() - lastTouchDoubleTapAtRef.current < 500) return;
      const nextZoom = zoomRef.current > 1.15 ? 1.0 : 2.0;
      applyAnchoredZoom(nextZoom, e.clientX, e.clientY);
    },
    [applyAnchoredZoom]
  );

  // Desktop mouse grab-and-drag pan for zoomed Continuous Scroll
  const scrollPanRef = useRef<{ active: boolean; startX: number; startY: number; scrollLeft: number; scrollTop: number }>({
    active: false,
    startX: 0,
    startY: 0,
    scrollLeft: 0,
    scrollTop: 0,
  });

  const handleScrollMouseDown = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (zoom <= 1.02 || !scrollContainerRef.current) return;
      scrollPanRef.current = {
        active: true,
        startX: e.clientX,
        startY: e.clientY,
        scrollLeft: scrollContainerRef.current.scrollLeft,
        scrollTop: scrollContainerRef.current.scrollTop,
      };
    },
    [zoom]
  );

  const handleScrollMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!scrollPanRef.current.active || !scrollContainerRef.current) return;
    const dx = e.clientX - scrollPanRef.current.startX;
    const dy = e.clientY - scrollPanRef.current.startY;
    scrollContainerRef.current.scrollLeft = scrollPanRef.current.scrollLeft - dx;
    scrollContainerRef.current.scrollTop = scrollPanRef.current.scrollTop - dy;
  }, []);

  const handleScrollMouseUp = useCallback(() => {
    scrollPanRef.current.active = false;
  }, []);

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

  // Pan state
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

          // Device-Resolution Fit-to-Width (full desktop width for landscape/PPT slides, readable max-width for portrait docs)
          try {
            const firstPage = await pdf.getPage(1);
            const unscaledViewport = firstPage.getViewport({ scale: 1 });
            const containerWidth = containerRef.current?.clientWidth || window.innerWidth || 800;
            const isLandscapeSlide = unscaledViewport.width > unscaledViewport.height * 1.05;
            const targetWidth =
              containerWidth < 768
                ? Math.max(containerWidth - 8, 280)
                : isLandscapeSlide
                ? Math.max(containerWidth - 24, 280)
                : Math.min(containerWidth - 32, 920);
            const autoScale = targetWidth / unscaledViewport.width;
            setFitScale(Math.max(0.4, Number(autoScale.toFixed(3))));
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

  // Dynamically re-fit PDF pages when device rotates or viewport resizes
  useEffect(() => {
    if (!pdfDoc || !containerRef.current) return;
    let cancelled = false;

    const recalcFit = async () => {
      if (cancelled || !containerRef.current) return;
      try {
        const firstPage = await pdfDoc.getPage(1);
        const unscaledViewport = firstPage.getViewport({ scale: 1, rotation });
        const containerWidth = containerRef.current.clientWidth || window.innerWidth || 800;
        const containerHeight =
          (containerRef.current.clientHeight || window.innerHeight || 900) - (hideTopToolbar ? 0 : 56);

        let autoScale: number;
        if (displayMode === 'single') {
          const wScale = (containerWidth - 16) / unscaledViewport.width;
          const hScale = containerHeight / unscaledViewport.height;
          autoScale = Math.min(wScale, hScale);
        } else {
          const isLandscapeSlide = unscaledViewport.width > unscaledViewport.height * 1.05;
          const targetWidth =
            containerWidth < 768
              ? Math.max(containerWidth - 8, 280)
              : isLandscapeSlide
              ? Math.max(containerWidth - 24, 280)
              : Math.min(containerWidth - 32, 920);
          autoScale = targetWidth / unscaledViewport.width;
        }
        if (!cancelled && Number.isFinite(autoScale) && autoScale > 0) {
          setFitScale(Math.max(0.4, Number(autoScale.toFixed(3))));
        }
      } catch {}
    };

    recalcFit();

    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => recalcFit()) : null;
    if (ro) ro.observe(containerRef.current);

    return () => {
      cancelled = true;
      ro?.disconnect();
    };
  }, [pdfDoc, displayMode, rotation, hideTopToolbar]);

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
        className={`flex-1 w-full h-full relative overflow-hidden flex flex-col items-center justify-start bg-slate-100/90 dark:bg-[#0b0c10] select-none ${
          isDragging ? 'cursor-grabbing' : ''
        }`}
      >
        {/* Google-Drive-Style Scroll-Only Page Counter Pill (auto-hides when not scrolling) */}
        {hideTopToolbar && hideBottomDock && pdfDoc && !error && !loading && (
          <div
            className={`pointer-events-none absolute bottom-5 left-1/2 -translate-x-1/2 z-30 px-3.5 py-1.5 rounded-full bg-black/75 dark:bg-zinc-900/90 text-white border-0 ring-0 shadow-[0_6px_20px_rgba(0,0,0,0.22)] backdrop-blur-md text-[11.5px] font-semibold tabular-nums whitespace-nowrap select-none transition-opacity duration-300 ${
              isScrolling ? 'opacity-100' : 'opacity-0'
            }`}
          >
            {pageNum} / {totalPages}
          </div>
        )}

        {/* Floating Minimal Borderless Controls Dock (only shown when bottom dock is explicitly enabled) */}
        {hideTopToolbar && !hideBottomDock && pdfDoc && !error && !loading && (
          <div className="absolute bottom-5 left-1/2 -translate-x-1/2 z-30 flex items-center gap-1 px-3 py-1.5 rounded-full bg-white/95 dark:bg-[#181a20]/95 border-0 ring-0 shadow-[0_8px_28px_rgba(0,0,0,0.12),0_2px_8px_rgba(0,0,0,0.06)] dark:shadow-[0_10px_32px_rgba(0,0,0,0.55)] backdrop-blur-xl text-xs select-none">
            <button
              type="button"
              onClick={handlePrevPage}
              disabled={pageNum <= 1 || loading}
              className="w-7 h-7 flex items-center justify-center hover:bg-slate-100 dark:hover:bg-white/10 rounded-full text-slate-700 dark:text-slate-300 disabled:opacity-25 cursor-pointer border-0 outline-none bg-transparent transition-colors active:scale-95"
              title="Previous Slide"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-slate-800 dark:text-slate-200 font-semibold tabular-nums whitespace-nowrap px-1.5 text-[11.5px]">
              {pageNum} / {totalPages}
            </span>
            <button
              type="button"
              onClick={handleNextPage}
              disabled={pageNum >= totalPages || loading}
              className="w-7 h-7 flex items-center justify-center hover:bg-slate-100 dark:hover:bg-white/10 rounded-full text-slate-700 dark:text-slate-300 disabled:opacity-25 cursor-pointer border-0 outline-none bg-transparent transition-colors active:scale-95"
              title="Next Slide"
            >
              <ChevronRight className="w-4 h-4" />
            </button>

            <div className="w-px h-3.5 bg-slate-200/80 dark:bg-white/12 mx-1" />

            <button
              type="button"
              onClick={handleZoomOut}
              disabled={zoom <= 0.5 || loading}
              className="w-7 h-7 flex items-center justify-center hover:bg-slate-100 dark:hover:bg-white/10 rounded-full text-slate-700 dark:text-slate-300 disabled:opacity-25 cursor-pointer border-0 outline-none bg-transparent transition-colors active:scale-95"
              title="Zoom Out"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={handleResetZoom}
              className="text-[11.5px] font-bold tabular-nums text-[#0b57d0] dark:text-[#a8c7fa] px-1.5 py-0.5 rounded-full hover:bg-[#0b57d0]/10 dark:hover:bg-[#a8c7fa]/10 cursor-pointer border-0 outline-none bg-transparent transition-colors"
              title="Reset Zoom"
            >
              {Math.round(zoom * 100)}%
            </button>
            <button
              type="button"
              onClick={handleZoomIn}
              disabled={zoom >= 4.0 || loading}
              className="w-7 h-7 flex items-center justify-center hover:bg-slate-100 dark:hover:bg-white/10 rounded-full text-slate-700 dark:text-slate-300 disabled:opacity-25 cursor-pointer border-0 outline-none bg-transparent transition-colors active:scale-95"
              title="Zoom In"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>

            <div className="w-px h-3.5 bg-slate-200/80 dark:bg-white/12 mx-1" />

            <button
              type="button"
              onClick={() => setDisplayMode((prev) => (prev === 'continuous' ? 'single' : 'continuous'))}
              className={`w-7 h-7 flex items-center justify-center rounded-full cursor-pointer border-0 outline-none transition-colors active:scale-95 ${
                displayMode === 'continuous'
                  ? 'bg-[#0b57d0]/12 text-[#0b57d0] dark:bg-[#a8c7fa]/15 dark:text-[#a8c7fa]'
                  : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/10 bg-transparent'
              }`}
              title={displayMode === 'continuous' ? 'Switch to Single Slide' : 'Switch to Continuous Scroll'}
            >
              {displayMode === 'continuous' ? <Scroll className="w-3.5 h-3.5" /> : <Square className="w-3.5 h-3.5" />}
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
              onScroll={handleContainerScroll}
              onTouchStart={handleTouchStart}
              onTouchMove={handleTouchMove}
              onTouchEnd={handleTouchEnd}
              onDoubleClick={handleDoubleClickZoom}
              onMouseDown={handleScrollMouseDown}
              onMouseMove={handleScrollMouseMove}
              onMouseUp={handleScrollMouseUp}
              onMouseLeave={handleScrollMouseUp}
              className={`w-full h-full overflow-y-auto ${
                zoom > 1.02 ? 'overflow-x-auto items-start cursor-grab active:cursor-grabbing' : 'overflow-x-hidden items-center'
              } flex flex-col p-0 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden`}
              style={{
                scrollBehavior: 'auto',
                touchAction: zoom > 1.02 ? 'pan-x pan-y' : 'pan-y',
              }}
            >
              <div ref={pdfContentRef} className={`flex flex-col ${zoom > 1.02 ? 'items-start' : 'items-center'} min-w-full my-0`}>
                {Array.from({ length: totalPages }, (_, idx) => idx + 1).map((pNum) => (
                  <ContinuousPageItem
                    key={`page-${pNum}`}
                    pdfDoc={pdfDoc}
                    pageNumber={pNum}
                    scale={fitScale * zoom}
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
