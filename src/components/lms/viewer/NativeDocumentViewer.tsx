import React, { useState, useEffect, useLayoutEffect, useRef, useCallback, useMemo } from 'react';
import { Capacitor, CapacitorHttp } from '@capacitor/core';
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
  MoveHorizontal,
} from 'lucide-react';
import { extractGoogleDriveId, extractYouTubeId } from '../../../lms/security';
import { getDriveEmbedPreviewUrl } from '../../../lib/filePreviewUtils';
import { getCachedGoogleAccessToken, ensureValidGoogleDriveToken } from '../../../lib/firebase';
import { useApp } from '../../../lms/LmsContext';
import { isMasterUser } from '../../../lib/masterAccount';
import { useScrollLock } from '../../../hooks/useScrollLock';
import { useBackHandler } from '../../../hooks/useBackNavigation';
import { getCachedDocument, saveCachedDocument } from '../../../lib/documentCache';
import { setAppThemeColor } from '../../../lib/appThemeColor';
import { syncNativeStatusBarTheme } from '../../../lib/nativeHardwareBridge';
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
  publicOnly?: boolean;
}

const PRODUCTION_API_ORIGIN = 'https://labselevate.vercel.app';

function inspectMagicBytesStatic(buffer: ArrayBuffer): 'pdf' | 'image' | 'unknown' {
  if (!buffer || buffer.byteLength < 4) return 'unknown';
  const bytes = new Uint8Array(buffer.slice(0, 12));
  if (bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) {
    return 'pdf';
  }
  if (
    (bytes[0] === 0xff && bytes[1] === 0xd8) ||
    (bytes[0] === 0x89 && bytes[1] === 0x50) ||
    (bytes[0] === 0x47 && bytes[1] === 0x49) ||
    (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46)
  ) {
    return 'image';
  }
  return 'unknown';
}

function decodeCapacitorDataToArrayBuffer(data: unknown): ArrayBuffer | null {
  if (!data) return null;
  if (data instanceof ArrayBuffer) return data;
  if (ArrayBuffer.isView(data)) {
    return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
  }
  if (typeof data === 'string') {
    try {
      const cleanB64 = data.replace(/\s+/g, '');
      const binary = atob(cleanB64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      return bytes.buffer;
    } catch {
      return new TextEncoder().encode(data).buffer;
    }
  }
  return null;
}

async function fetchBinaryNativeHttp(
  url: string,
  headers?: Record<string, string>
): Promise<{ ok: boolean; status: number; contentType: string; arrayBuffer: ArrayBuffer } | null> {
  try {
    const res = await CapacitorHttp.get({
      url,
      headers,
      responseType: 'arraybuffer',
    });
    const ok = res.status >= 200 && res.status < 300;
    const rawHeaders = res.headers || {};
    const contentType =
      rawHeaders['content-type'] ||
      rawHeaders['Content-Type'] ||
      'application/octet-stream';
    const arrayBuffer = decodeCapacitorDataToArrayBuffer(res.data);
    if (!ok || !arrayBuffer) return null;
    return { ok, status: res.status, contentType, arrayBuffer };
  } catch {
    return null;
  }
}

async function fetchDriveBinaryOnNative(
  driveId: string,
  driveToken: string | null
): Promise<{ arrayBuffer: ArrayBuffer; contentType: string } | null> {
  // 1. Direct Drive uc?export=download via Capacitor native HTTP (no CORS)
  const ucUrl = `https://drive.google.com/uc?export=download&id=${encodeURIComponent(driveId)}`;
  const ucRes = await fetchBinaryNativeHttp(ucUrl);
  if (ucRes) {
    const magic = inspectMagicBytesStatic(ucRes.arrayBuffer);
    if (magic === 'pdf' || magic === 'image') {
      return { arrayBuffer: ucRes.arrayBuffer, contentType: ucRes.contentType };
    }
    // Check for Google Drive virus-scan HTML confirmation form
    const htmlSnippet = new TextDecoder().decode(ucRes.arrayBuffer.slice(0, 24000));
    if (htmlSnippet.includes('download-form') || htmlSnippet.includes('confirm=')) {
      const actionMatch = htmlSnippet.match(/<form[^>]*id="download-form"[^>]*action="([^"]+)"/i);
      const baseAction = (actionMatch?.[1] || 'https://drive.usercontent.google.com/download').replace(/&amp;/g, '&');
      const params = new URLSearchParams();
      const inputMatches = htmlSnippet.matchAll(/<input[^>]*type="hidden"[^>]*>/gi);
      for (const m of inputMatches) {
        const tag = m[0];
        const nameMatch = tag.match(/name="([^"]+)"/i);
        const valMatch = tag.match(/value="([^"]*)"/i);
        if (nameMatch?.[1]) {
          params.set(nameMatch[1], valMatch?.[1] || '');
        }
      }
      if (!params.has('id')) params.set('id', driveId);
      if (!params.has('export')) params.set('export', 'download');
      if (!params.has('confirm')) params.set('confirm', 't');
      const confirmUrl = `${baseAction}${baseAction.includes('?') ? '&' : '?'}${params.toString()}`;
      const confirmedRes = await fetchBinaryNativeHttp(confirmUrl);
      if (confirmedRes) {
        const cMagic = inspectMagicBytesStatic(confirmedRes.arrayBuffer);
        if (cMagic === 'pdf' || cMagic === 'image') {
          return { arrayBuffer: confirmedRes.arrayBuffer, contentType: confirmedRes.contentType };
        }
      }
    }
  }

  // 2. Direct lh3 CDN (works seamlessly for Drive-hosted images)
  const lh3Res = await fetchBinaryNativeHttp(`https://lh3.googleusercontent.com/d/${encodeURIComponent(driveId)}=s4096`);
  if (lh3Res && inspectMagicBytesStatic(lh3Res.arrayBuffer) === 'image') {
    return { arrayBuffer: lh3Res.arrayBuffer, contentType: lh3Res.contentType };
  }

  // 3. Production backend proxy fallback (Vercel)
  const tokenQuery = driveToken ? `?token=${encodeURIComponent(driveToken)}` : '';
  const prodUrl = `${PRODUCTION_API_ORIGIN}/api/drive/media/${encodeURIComponent(driveId)}${tokenQuery}`;
  const prodRes = await fetchBinaryNativeHttp(prodUrl);
  if (prodRes) {
    const pMagic = inspectMagicBytesStatic(prodRes.arrayBuffer);
    if (pMagic === 'pdf' || pMagic === 'image') {
      return { arrayBuffer: prodRes.arrayBuffer, contentType: prodRes.contentType };
    }
  }

  return null;
}

export const NativeDocumentViewer: React.FC<NativeDocumentViewerProps> = ({
  items,
  initialIndex = 0,
  isOpen,
  onClose,
  publicOnly = false,
}) => {
  const { currentUser, studentFeatureAccess } = useApp();
  const isMaster = isMasterUser(currentUser);
  const canPrintAndDownload =
    isMaster || Boolean(studentFeatureAccess?.allowFilesToBeDownloadedInNotesViaPdfOrImages);

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

  // Reading Theme & Horizontal Stretch state (persists in session)
  const [theme, setTheme] = useState<ReadingTheme>('paper');
  const [isStretchWidth, setIsStretchWidth] = useState<boolean>(() => {
    try {
      return typeof sessionStorage !== 'undefined' && sessionStorage.getItem('elevate_viewer_stretch_width') === 'true';
    } catch {
      return false;
    }
  });
  const toggleStretchWidth = useCallback(() => {
    setIsStretchWidth((prev) => {
      const next = !prev;
      try {
        sessionStorage.setItem('elevate_viewer_stretch_width', String(next));
      } catch {}
      return next;
    });
  }, []);
  const [isThemeDockOpen, setIsThemeDockOpen] = useState<boolean>(false);
  const [isControlsVisible, setIsControlsVisible] = useState<boolean>(true);
  const controlsHideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const themeDockRef = useRef<HTMLDivElement | null>(null);

  const revealControls = useCallback(() => {
    setIsControlsVisible(true);
    if (controlsHideTimerRef.current) {
      clearTimeout(controlsHideTimerRef.current);
      controlsHideTimerRef.current = null;
    }
    if (!isThemeDockOpen) {
      controlsHideTimerRef.current = setTimeout(() => {
        setIsControlsVisible(false);
      }, 2000);
    }
  }, [isThemeDockOpen]);

  useEffect(() => {
    if (!isOpen) return;
    revealControls();
    return () => {
      if (controlsHideTimerRef.current) {
        clearTimeout(controlsHideTimerRef.current);
        controlsHideTimerRef.current = null;
      }
    };
  }, [isOpen, isThemeDockOpen, revealControls]);

  useEffect(() => {
    if (!isThemeDockOpen) return;
    const handleOutside = (e: MouseEvent | TouchEvent) => {
      if (themeDockRef.current && !themeDockRef.current.contains(e.target as Node)) {
        setIsThemeDockOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    document.addEventListener('touchstart', handleOutside);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      document.removeEventListener('touchstart', handleOutside);
    };
  }, [isThemeDockOpen]);

  // Loading & Document Data State
  const [loading, setLoading] = useState<boolean>(true);
  const [loadProgress, setLoadProgress] = useState<number>(0);
  const [docBuffer, setDocBuffer] = useState<ArrayBuffer | null>(null);
  const [docBlobUrl, setDocBlobUrl] = useState<string>('');
  const [detectedKind, setDetectedKind] = useState<'pdf' | 'image' | 'text' | 'embed'>('pdf');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const loadGenerationRef = useRef<number>(0);
  const loadedSourceKeyRef = useRef<string>('');
  const activeBlobUrlRef = useRef<string>('');

  const commitBlobUrl = useCallback((nextUrl: string) => {
    const prevUrl = activeBlobUrlRef.current;
    if (prevUrl && prevUrl !== nextUrl && prevUrl.startsWith('blob:')) {
      try {
        URL.revokeObjectURL(prevUrl);
      } catch {}
    }
    activeBlobUrlRef.current = nextUrl;
    setDocBlobUrl(nextUrl);
  }, []);

  useEffect(() => {
    return () => {
      const prevUrl = activeBlobUrlRef.current;
      if (prevUrl && prevUrl.startsWith('blob:')) {
        try {
          URL.revokeObjectURL(prevUrl);
        } catch {}
      }
      activeBlobUrlRef.current = '';
    };
  }, []);

  // Visual Transforms (for Image Mode)
  const [imageZoom, setImageZoom] = useState<number>(1.0);
  const [imageRotation, setImageRotation] = useState<number>(0);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [imgNaturalSize, setImgNaturalSize] = useState<{ w: number; h: number }>({ w: 0, h: 0 });
  const [imgViewportWidth, setImgViewportWidth] = useState<number>(() =>
    typeof window !== 'undefined' ? window.innerWidth : 1024
  );
  const dragStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const imgContentRef = useRef<HTMLDivElement | null>(null);
  const imgPinchStateRef = useRef<{
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
  const imgLastTapRef = useRef<{ time: number; x: number; y: number }>({ time: 0, x: 0, y: 0 });
  const imgTapOriginRef = useRef<{ x: number; y: number; moved: boolean } | null>(null);
  const imgLastTouchDoubleTapAtRef = useRef<number>(0);
  const imgScrollRef = useRef<HTMLDivElement | null>(null);
  const imgZoomRef = useRef<number>(imageZoom);
  imgZoomRef.current = imageZoom;
  const imgPendingAnchorRef = useRef<{
    prevZoom: number;
    nextZoom: number;
    relX: number;
    relY: number;
    fx: number;
    fy: number;
  } | null>(null);

  const applyAnchoredImageZoom = useCallback(
    (nextZoom: number, clientX?: number, clientY?: number, overrideContentX?: number, overrideContentY?: number) => {
      const el = imgScrollRef.current;
      const contentEl = imgContentRef.current;
      const prevZoom = imgZoomRef.current;
      if (el && contentEl && Math.abs(nextZoom - prevZoom) > 0.001) {
        const elRect = el.getBoundingClientRect();
        const contentRect = contentEl.getBoundingClientRect();
        const relX = clientX !== undefined ? clientX - elRect.left : elRect.width / 2;
        const relY = clientY !== undefined ? clientY - elRect.top : elRect.height / 2;
        const localX = overrideContentX !== undefined ? overrideContentX : (clientX !== undefined ? clientX : elRect.left + elRect.width / 2) - contentRect.left;
        const localY = overrideContentY !== undefined ? overrideContentY : (clientY !== undefined ? clientY : elRect.top + elRect.height / 2) - contentRect.top;
        const fx = contentRect.width > 0 ? Math.max(0, Math.min(1, localX / contentRect.width)) : 0.5;
        const fy = contentRect.height > 0 ? Math.max(0, Math.min(1, localY / contentRect.height)) : 0.5;
        imgPendingAnchorRef.current = {
          prevZoom,
          nextZoom,
          relX,
          relY,
          fx,
          fy,
        };
      }
      setImageZoom(nextZoom);
    },
    []
  );

  useLayoutEffect(() => {
    const anchor = imgPendingAnchorRef.current;
    const el = imgScrollRef.current;
    const contentEl = imgContentRef.current;
    if (!anchor || !el || !contentEl) return;
    imgPendingAnchorRef.current = null;
    el.scrollLeft = Math.max(0, contentEl.offsetLeft + anchor.fx * contentEl.offsetWidth - anchor.relX);
    el.scrollTop = Math.max(0, contentEl.offsetTop + anchor.fy * contentEl.offsetHeight - anchor.relY);
  }, [imageZoom]);

  useEffect(() => {
    const el = imgScrollRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const updateW = () => {
      if (el.clientWidth > 0) setImgViewportWidth(el.clientWidth);
    };
    updateW();
    const ro = new ResizeObserver(updateW);
    ro.observe(el);
    return () => ro.disconnect();
  }, [isOpen, detectedKind]);

  // Non-passive touchstart & touchmove listeners so 2-finger pinch cancels native scroll on Android WebView
  useEffect(() => {
    const el = imgScrollRef.current;
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
  }, [isOpen, detectedKind]);

  const imgPanRef = useRef<{ active: boolean; startX: number; startY: number; scrollLeft: number; scrollTop: number }>({
    active: false,
    startX: 0,
    startY: 0,
    scrollLeft: 0,
    scrollTop: 0,
  });

  const handleImageMouseDown = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (imageZoom <= 1.02 || !imgScrollRef.current) return;
      imgPanRef.current = {
        active: true,
        startX: e.clientX,
        startY: e.clientY,
        scrollLeft: imgScrollRef.current.scrollLeft,
        scrollTop: imgScrollRef.current.scrollTop,
      };
    },
    [imageZoom]
  );

  const handleImageMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!imgPanRef.current.active || !imgScrollRef.current) return;
    const dx = e.clientX - imgPanRef.current.startX;
    const dy = e.clientY - imgPanRef.current.startY;
    imgScrollRef.current.scrollLeft = imgPanRef.current.scrollLeft - dx;
    imgScrollRef.current.scrollTop = imgPanRef.current.scrollTop - dy;
  }, []);

  const handleImageMouseUp = useCallback(() => {
    imgPanRef.current.active = false;
  }, []);

  const handleImageTouchStart = useCallback((e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length === 1) {
      imgTapOriginRef.current = {
        x: e.touches[0].clientX,
        y: e.touches[0].clientY,
        moved: false,
      };
    } else {
      imgTapOriginRef.current = null;
    }
    if (e.touches.length === 2 && imgScrollRef.current && imgContentRef.current) {
      const el = imgScrollRef.current;
      const elRect = el.getBoundingClientRect();
      const contentRect = imgContentRef.current.getBoundingClientRect();
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const midX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
      const midY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
      imgPinchStateRef.current = {
        active: true,
        startDist: Math.max(1, Math.hypot(dx, dy)),
        startZoom: imgZoomRef.current,
        startContentX: midX - contentRect.left,
        startContentY: midY - contentRect.top,
        startScrollLeft: contentRect.left - elRect.left,
        startScrollTop: contentRect.top - elRect.top,
        lastNextZoom: imgZoomRef.current,
        lastClientX: midX,
        lastClientY: midY,
      };
    }
  }, []);

  const handleImageTouchMove = useCallback((e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length === 1 && imgTapOriginRef.current && !imgTapOriginRef.current.moved) {
      const dx = e.touches[0].clientX - imgTapOriginRef.current.x;
      const dy = e.touches[0].clientY - imgTapOriginRef.current.y;
      if (Math.hypot(dx, dy) > 14) {
        imgTapOriginRef.current.moved = true;
      }
    }
    const ps = imgPinchStateRef.current;
    const el = imgScrollRef.current;
    const contentEl = imgContentRef.current;
    if (e.touches.length === 2 && ps?.active && el && contentEl) {
      e.preventDefault();
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.hypot(dx, dy);
      const ratio = dist / ps.startDist;
      const nextZoom = Math.min(3.5, Math.max(1.0, Number((ps.startZoom * ratio).toFixed(3))));
      const relScale = nextZoom / ps.startZoom;

      const rect = el.getBoundingClientRect();
      const midX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
      const midY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
      const curRelX = midX - rect.left;
      const curRelY = midY - rect.top;

      let tx = curRelX - ps.startScrollLeft - relScale * ps.startContentX;
      const ty = curRelY - ps.startScrollTop - relScale * ps.startContentY;
      const scaledW = contentEl.offsetWidth * relScale;
      if (scaledW >= el.clientWidth) {
        tx = Math.min(0, Math.max(el.clientWidth - scaledW, tx));
      }

      contentEl.style.transformOrigin = '0 0';
      contentEl.style.willChange = 'transform';
      contentEl.style.transform = `translate3d(${tx}px, ${ty}px, 0) scale(${relScale})`;

      ps.lastNextZoom = nextZoom;
      ps.lastClientX = midX;
      ps.lastClientY = midY;
    }
  }, []);

  const handleImageTouchEnd = useCallback(
    (e: React.TouchEvent<HTMLDivElement>) => {
      const ps = imgPinchStateRef.current;
      if (e.touches.length < 2 && ps?.active) {
        imgPinchStateRef.current = null;
        if (imgContentRef.current) {
          imgContentRef.current.style.transform = '';
          imgContentRef.current.style.transformOrigin = '';
          imgContentRef.current.style.willChange = '';
        }
        applyAnchoredImageZoom(ps.lastNextZoom, ps.lastClientX, ps.lastClientY, ps.startContentX, ps.startContentY);
        return;
      }
      if (e.touches.length === 0 && e.changedTouches.length === 1) {
        const tapOrigin = imgTapOriginRef.current;
        imgTapOriginRef.current = null;
        if (tapOrigin?.moved) {
          imgLastTapRef.current = { time: 0, x: 0, y: 0 };
          return;
        }
        const t = e.changedTouches[0];
        const now = Date.now();
        const prev = imgLastTapRef.current;
        const tapDist = Math.hypot(t.clientX - prev.x, t.clientY - prev.y);
        if (now - prev.time < 320 && tapDist < 56) {
          e.preventDefault();
          imgLastTouchDoubleTapAtRef.current = now;
          const nextZoom = imgZoomRef.current > 1.15 ? 1.0 : 2.25;
          applyAnchoredImageZoom(nextZoom, t.clientX, t.clientY);
          imgLastTapRef.current = { time: 0, x: 0, y: 0 };
        } else {
          imgLastTapRef.current = { time: now, x: t.clientX, y: t.clientY };
        }
      }
    },
    [applyAnchoredImageZoom]
  );

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

  const ytId = useMemo(() => extractYouTubeId(rawUrl), [rawUrl]);

  const embedFallbackUrl = useMemo(() => {
    if (ytId) return `https://www.youtube.com/embed/${ytId}`;
    if (driveId) {
      if (rawUrl.includes('docs.google.com/document')) {
        return `https://docs.google.com/document/d/${driveId}/preview`;
      }
      if (rawUrl.includes('docs.google.com/spreadsheets')) {
        return `https://docs.google.com/spreadsheets/d/${driveId}/preview`;
      }
      if (rawUrl.includes('docs.google.com/presentation')) {
        return `https://docs.google.com/presentation/d/${driveId}/preview`;
      }
      // For public batch notes, never fall back to Google Drive's iframe (which may show Google Sign-in)
      if (publicOnly) return null;
      return getDriveEmbedPreviewUrl(driveId);
    }
    if (rawUrl && /^https?:\/\//i.test(rawUrl)) {
      return `https://docs.google.com/gview?embedded=true&url=${encodeURIComponent(rawUrl)}`;
    }
    return '';
  }, [ytId, driveId, rawUrl]);

  // Clean cache key
  const cacheKey = useMemo(() => {
    return driveId ? `drive_${driveId}` : rawUrl ? `url_${rawUrl}` : '';
  }, [driveId, rawUrl]);

  const inspectMagicBytes = (buf: ArrayBuffer): 'pdf' | 'image' | 'unknown' => {
    const bytes = new Uint8Array(buf.slice(0, 12));
    if (bytes.length >= 4 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) {
      return 'pdf';
    }
    if (
      (bytes[0] === 0xff && bytes[1] === 0xd8) ||
      (bytes[0] === 0x89 && bytes[1] === 0x50) ||
      (bytes[0] === 0x47 && bytes[1] === 0x49) ||
      (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46)
    ) {
      return 'image';
    }
    return 'unknown';
  };

  // Primary loader: checks IndexedDB -> streams via backend proxy -> fallback direct / embed
  const loadDocument = useCallback(async (forceReload = false) => {
    const sourceKey = `${currentItem?.id || ''}|${rawUrl}|${driveId || ''}`;
    if (!forceReload && loadedSourceKeyRef.current === sourceKey && activeBlobUrlRef.current) {
      setLoading(false);
      setErrorMessage(null);
      return;
    }

    const myGen = ++loadGenerationRef.current;
    const isStale = () => myGen !== loadGenerationRef.current;

    if (!rawUrl && !driveId) {
      if (isStale()) return;
      setErrorMessage('No document source provided.');
      setLoading(false);
      return;
    }

    setLoading(true);
    setErrorMessage(null);
    if (loadedSourceKeyRef.current !== sourceKey) {
      commitBlobUrl('');
    }
    setLoadProgress(15);

    // If YouTube link, render directly in embedded player
    if (ytId) {
      if (isStale()) return;
      loadedSourceKeyRef.current = sourceKey;
      setDetectedKind('embed');
      commitBlobUrl(`https://www.youtube.com/embed/${ytId}`);
      setLoadProgress(100);
      setLoading(false);
      return;
    }

    try {
      // 1. Try local IndexedDB cache first (<10ms instant load offline), strictly validating magic bytes
      if (cacheKey) {
        const cached = await getCachedDocument(cacheKey);
        if (isStale()) return;
        if (cached && cached.data) {
          const magic = inspectMagicBytes(cached.data);
          if (magic === 'pdf' || magic === 'image') {
            loadedSourceKeyRef.current = sourceKey;
            setLoadProgress(100);
            setDocBuffer(cached.data);
            setDetectedKind(magic);

            const resolvedMime = magic === 'pdf' ? 'application/pdf' : cached.contentType || 'image/png';
            const blob = new Blob([cached.data], { type: resolvedMime });
            const bUrl = URL.createObjectURL(blob);
            commitBlobUrl(bUrl);
            setLoading(false);
            return;
          }
        }
      }

      setLoadProgress(35);

      // 2. If Drive ID is present and NOT publicOnly (e.g. user's own Notes Studio content), use cached Drive OAuth token
      let driveToken: string | null = null;
      if (driveId && !publicOnly) {
        driveToken = getCachedGoogleAccessToken();
        if (driveToken) {
          try {
            const directDriveRes = await fetch(
              `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(driveId)}?alt=media&supportsAllDrives=true&acknowledgeAbuse=true`,
              { headers: { Authorization: `Bearer ${driveToken}` } }
            );
            if (directDriveRes.ok) {
              const directBuf = await directDriveRes.arrayBuffer();
              const magic = inspectMagicBytes(directBuf);
              if (magic === 'pdf' || magic === 'image') {
                setLoadProgress(95);
                handleLoadedData(directBuf, directDriveRes.headers.get('content-type') || 'application/pdf');
                return;
              }
            }
          } catch {
            // Fall through to backend stream proxy
          }
        }
      }

      // 3. Native Android/iOS HTTP loader (bypasses https://localhost origin & CORS)
      if (Capacitor.isNativePlatform()) {
        if (driveId) {
          const nativeDrive = await fetchDriveBinaryOnNative(driveId, driveToken);
          if (nativeDrive) {
            setLoadProgress(95);
            handleLoadedData(nativeDrive.arrayBuffer, nativeDrive.contentType);
            return;
          }
          throw new Error('Failed to download Google Drive file natively.');
        }

        if (rawUrl.startsWith('data:')) {
          const dataRes = await fetch(rawUrl);
          if (dataRes.ok) {
            const buf = await dataRes.arrayBuffer();
            setLoadProgress(95);
            handleLoadedData(buf, dataRes.headers.get('content-type') || 'application/pdf');
            return;
          }
        } else {
          const directUrl = rawUrl.startsWith('/api/')
            ? `${PRODUCTION_API_ORIGIN}${rawUrl}`
            : rawUrl;
          const nativeDirect = await fetchBinaryNativeHttp(directUrl);
          if (
            nativeDirect &&
            inspectMagicBytesStatic(nativeDirect.arrayBuffer) !== 'unknown'
          ) {
            setLoadProgress(95);
            handleLoadedData(nativeDirect.arrayBuffer, nativeDirect.contentType);
            return;
          }
          const proxyUrl = `${PRODUCTION_API_ORIGIN}/api/drive/stream?url=${encodeURIComponent(rawUrl)}`;
          const nativeProxy = await fetchBinaryNativeHttp(proxyUrl);
          if (
            nativeProxy &&
            inspectMagicBytesStatic(nativeProxy.arrayBuffer) !== 'unknown'
          ) {
            setLoadProgress(95);
            handleLoadedData(nativeProxy.arrayBuffer, nativeProxy.contentType);
            return;
          }
        }
        throw new Error('Failed to load document natively on device.');
      }

      // 4. Web stream proxy URL
      let targetUrl = '';
      if (driveId) {
        const tokenQuery = driveToken ? `?token=${encodeURIComponent(driveToken)}` : '';
        targetUrl = `/api/drive/media/${encodeURIComponent(driveId)}${tokenQuery}`;
      } else if (rawUrl.startsWith('data:') || rawUrl.includes('/api/')) {
        targetUrl = rawUrl;
      } else {
        targetUrl = `/api/drive/stream?url=${encodeURIComponent(rawUrl)}`;
      }

      const response = await fetch(targetUrl);
      setLoadProgress(70);

      if (!response.ok) {
        // If stream proxy returned error, try direct URL if it is public and not Drive
        if (rawUrl && !rawUrl.includes('drive.google.com') && !rawUrl.includes('docs.google.com')) {
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
      console.warn('Document binary fetch failed, switching to in-app preview:', err);
      // Fallback for direct image preview URL if driveId is present
      if (driveId && (currentItem?.type === 'image' || rawUrl.match(/\.(jpe?g|png|webp|svg)$/i))) {
        loadedSourceKeyRef.current = sourceKey;
        setDetectedKind('image');
        commitBlobUrl(`https://lh3.googleusercontent.com/d/${driveId}`);
        setLoading(false);
        return;
      }

      if (isStale()) return;

      // Never overwrite an already-loaded document if a stale/background check fails
      if (loadedSourceKeyRef.current === sourceKey && activeBlobUrlRef.current) {
        setLoading(false);
        return;
      }

      // Real-time in-app iframe embed fallback for Drive / Docs / External URLs
      if (embedFallbackUrl) {
        loadedSourceKeyRef.current = sourceKey;
        setDetectedKind('embed');
        commitBlobUrl(embedFallbackUrl);
        setLoading(false);
        return;
      }

      setErrorMessage(
        publicOnly
          ? 'Unable to load this note. Please ask your admin to ensure the Google Drive link is shared as "Anyone with the link".'
          : err?.message || 'Unable to open document. Please verify network access or permissions.'
      );
      setLoading(false);
    }
  }, [rawUrl, driveId, ytId, cacheKey, currentItem, embedFallbackUrl, publicOnly, commitBlobUrl]);

  const handleLoadedData = useCallback(
    (arrayBuffer: ArrayBuffer, contentType: string) => {
      const sourceKey = `${currentItem?.id || ''}|${rawUrl}|${driveId || ''}`;
      const magic = inspectMagicBytes(arrayBuffer);

      // Never feed HTML/invalid bytes to PdfCanvasViewer or IndexedDB
      if (magic === 'unknown') {
        if (embedFallbackUrl) {
          loadedSourceKeyRef.current = sourceKey;
          setDetectedKind('embed');
          commitBlobUrl(embedFallbackUrl);
          setLoading(false);
          return;
        }
        if (contentType.includes('text/plain') || currentItem?.content) {
          loadedSourceKeyRef.current = sourceKey;
          setDetectedKind('text');
          setDocBuffer(arrayBuffer);
          setLoading(false);
          return;
        }
        setErrorMessage('Document format could not be previewed directly.');
        setLoading(false);
        return;
      }

      const resolvedKind: 'pdf' | 'image' = magic;
      const resolvedType = magic === 'pdf' ? 'application/pdf' : contentType.startsWith('image/') ? contentType : 'image/png';

      loadedSourceKeyRef.current = sourceKey;
      setDetectedKind(resolvedKind);
      setDocBuffer(arrayBuffer);

      const blob = new Blob([arrayBuffer], { type: resolvedType });
      const bUrl = URL.createObjectURL(blob);
      commitBlobUrl(bUrl);

      // Save only validated PDF/image bytes to IndexedDB cache
      if (cacheKey) {
        saveCachedDocument(cacheKey, arrayBuffer, resolvedType).catch(() => {});
      }

      setLoading(false);
    },
    [cacheKey, currentItem, embedFallbackUrl, rawUrl, driveId, commitBlobUrl]
  );

  // Trigger load on index/item change
  useEffect(() => {
    setImageZoom(1.0);
    setImageRotation(0);
    setPan({ x: 0, y: 0 });
    setPdfPageNum(1);
    setPdfTotalPages(1);

    loadDocument(false);
  }, [currentIndex, currentItem?.id, rawUrl, driveId, loadDocument]);

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

  // Theme styling classes (borderless minimal header)
  const themeClasses = useMemo(() => {
    switch (theme) {
      case 'sepia':
        return {
          wrapper: 'bg-[#f4ecd8] text-[#3d3226]',
          header: 'bg-[#f4ecd8]/95 text-[#3d3226]',
          dock: 'bg-[#ebe1ca]/95 text-[#3d3226] shadow-xl',
          canvasFilter: 'sepia(0.35) contrast(0.96) brightness(0.98)',
        };
      case 'dark':
        return {
          wrapper: 'bg-[#090a0d] text-[#e3e3e3]',
          header: 'bg-[#0f1117]/95 text-[#e3e3e3]',
          dock: 'bg-[#181a22]/95 text-[#e3e3e3] shadow-2xl',
          canvasFilter: 'invert(0.88) hue-rotate(180deg) contrast(1.1) brightness(0.95)',
        };
      case 'paper':
      default:
        return {
          wrapper: 'bg-[#f8f9fa] dark:bg-[#0b0c10] text-slate-900 dark:text-zinc-100',
          header: 'bg-white/95 dark:bg-[#121318]/95 text-slate-900 dark:text-zinc-100',
          dock: 'bg-white/95 dark:bg-[#1a1c24]/95 text-slate-900 dark:text-zinc-100 shadow-xl',
          canvasFilter: 'none',
        };
    }
  }, [theme]);

  // Sync Android Status Bar icons & theme-color with active viewer reading theme (paper / sepia / dark)
  useEffect(() => {
    if (!isOpen) return;
    const appIsDark = typeof document !== 'undefined' && document.documentElement.classList.contains('dark');
    if (theme === 'sepia') {
      syncNativeStatusBarTheme(false);
      setAppThemeColor('#f4ecd8');
    } else if (theme === 'dark') {
      syncNativeStatusBarTheme(true);
      setAppThemeColor('#0f1117');
    } else {
      syncNativeStatusBarTheme(appIsDark);
      setAppThemeColor(appIsDark ? '#121318' : '#ffffff');
    }
    return () => {
      const currentAppDark = typeof document !== 'undefined' && document.documentElement.classList.contains('dark');
      syncNativeStatusBarTheme(currentAppDark);
      setAppThemeColor(currentAppDark ? '#0b0c10' : '#f8f9fa');
    };
  }, [isOpen, theme]);

  if (!isOpen || !currentItem) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.18 }}
        className={`fixed inset-0 z-50 flex flex-col select-none overflow-hidden ${themeClasses.wrapper}`}
        onPointerDown={revealControls}
        onTouchStart={revealControls}
        onMouseMove={revealControls}
        onScrollCapture={revealControls}
        onWheel={revealControls}
        style={{
          paddingTop: 'var(--android-status-bar-height, 0px)',
          paddingBottom: 'var(--android-cutout-bottom, 0px)',
        }}
      >
        {/* ========================================================= */}
        {/* 1. FLOATING CORNER THEME DROPDOWN DOCK (AUTO-HIDES IN 2S) */}
        {/* ========================================================= */}
        <div
          ref={themeDockRef}
          className={`fixed right-3 sm:right-5 z-40 flex flex-col items-end gap-2 transition-opacity duration-300 ${
            isControlsVisible || isThemeDockOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
          }`}
          style={{
            top: 'calc(0.75rem + var(--android-status-bar-height, 0px))',
          }}
        >
          <button
            type="button"
            onClick={() => setIsThemeDockOpen((prev) => !prev)}
            className="w-10 h-10 rounded-full flex items-center justify-center bg-white/90 dark:bg-[#1a1c24]/90 text-slate-800 dark:text-zinc-100 backdrop-blur-md shadow-lg border border-black/10 dark:border-white/10 cursor-pointer transition active:scale-95"
            title="Reading Theme"
            aria-label="Reading Theme Menu"
            aria-expanded={isThemeDockOpen}
          >
            {theme === 'paper' ? (
              <Sun className="w-4.5 h-4.5 text-amber-500" />
            ) : theme === 'sepia' ? (
              <BookOpen className="w-4.5 h-4.5 text-[#6b4f2a] dark:text-amber-300" />
            ) : (
              <Moon className="w-4.5 h-4.5 text-[#0b57d0] dark:text-[#a8c7fa]" />
            )}
          </button>

          {isThemeDockOpen && (
            <div className="flex flex-col items-center gap-1.5 p-1.5 rounded-full bg-white/95 dark:bg-[#1a1c24]/95 backdrop-blur-xl shadow-xl border border-black/10 dark:border-white/10">
              <button
                type="button"
                onClick={() => {
                  setTheme('paper');
                  setIsThemeDockOpen(false);
                }}
                className={`w-9 h-9 rounded-full flex items-center justify-center transition cursor-pointer border-none ${
                  theme === 'paper'
                    ? 'bg-amber-100 text-amber-700 shadow-xs'
                    : 'bg-transparent text-slate-600 dark:text-zinc-300 hover:bg-black/5 dark:hover:bg-white/10'
                }`}
                title="Paper White Mode"
                aria-label="Paper White Mode"
              >
                <Sun className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => {
                  toggleStretchWidth();
                  setIsThemeDockOpen(false);
                }}
                className={`w-9 h-9 rounded-full flex items-center justify-center transition cursor-pointer border-none ${
                  isStretchWidth
                    ? 'bg-[#0b57d0] text-white shadow-xs'
                    : 'bg-transparent text-slate-600 dark:text-zinc-300 hover:bg-black/5 dark:hover:bg-white/10'
                }`}
                title={isStretchWidth ? 'Auto-Fit Aspect Ratio' : 'Stretch Width to Screen (Keep Height)'}
                aria-label="Toggle Horizontal Stretch"
                aria-pressed={isStretchWidth}
              >
                <MoveHorizontal className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => {
                  setTheme('sepia');
                  setIsThemeDockOpen(false);
                }}
                className={`w-9 h-9 rounded-full flex items-center justify-center transition cursor-pointer border-none ${
                  theme === 'sepia'
                    ? 'bg-[#f4ecd8] text-[#433422] shadow-xs'
                    : 'bg-transparent text-slate-600 dark:text-zinc-300 hover:bg-black/5 dark:hover:bg-white/10'
                }`}
                title="Warm Sepia Eye-Care Reading Mode"
                aria-label="Reading Mode"
              >
                <BookOpen className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => {
                  setTheme('dark');
                  setIsThemeDockOpen(false);
                }}
                className={`w-9 h-9 rounded-full flex items-center justify-center transition cursor-pointer border-none ${
                  theme === 'dark'
                    ? 'bg-[#090a0d] text-white shadow-xs'
                    : 'bg-transparent text-slate-600 dark:text-zinc-300 hover:bg-black/5 dark:hover:bg-white/10'
                }`}
                title="OLED Night Mode"
                aria-label="Dark Mode"
              >
                <Moon className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>

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
                  onClick={() => loadDocument(true)}
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
          {detectedKind === 'pdf' && !loading && !errorMessage && docBlobUrl && (
            <div
              className="w-full h-full relative overflow-hidden flex flex-col"
              style={{
                filter: themeClasses.canvasFilter,
                transition: 'filter 0.25s ease-out',
              }}
            >
              <PdfCanvasViewer
                url={docBlobUrl}
                fallbackEmbedUrl={embedFallbackUrl}
                fileName={currentItem.title}
                hideTopToolbar={true}
                hideBottomDock={true}
                stretchWidth={isStretchWidth}
                onClose={onClose}
              />
            </div>
          )}

          {/* C2. REAL-TIME IN-APP EMBED VIEWPORT (Google Drive Preview / Docs / YouTube / External Fallback) */}
          {detectedKind === 'embed' && !loading && !errorMessage && docBlobUrl && (
            <div className="w-full h-full relative overflow-hidden flex flex-col bg-white dark:bg-[#0e1015]">
              <iframe
                src={docBlobUrl}
                title={currentItem.title || 'Document Preview'}
                className="w-full h-full border-0"
                allow="autoplay; fullscreen; encrypted-media"
                allowFullScreen
              />
            </div>
          )}

          {/* D. MINIMAL FIT-TO-WIDTH IMAGE VIEWER (Pinch-to-Zoom, Double-Tap & 4-Way Drag/Scroll) */}
          {detectedKind === 'image' && !loading && !errorMessage && (
            <div
              ref={imgScrollRef}
              onTouchStart={handleImageTouchStart}
              onTouchMove={handleImageTouchMove}
              onTouchEnd={handleImageTouchEnd}
              onMouseDown={handleImageMouseDown}
              onMouseMove={handleImageMouseMove}
              onMouseUp={handleImageMouseUp}
              onMouseLeave={handleImageMouseUp}
              onDoubleClick={(e) => {
                if (Date.now() - imgLastTouchDoubleTapAtRef.current < 500) return;
                const nextZoom = imgZoomRef.current > 1.15 ? 1.0 : 2.25;
                applyAnchoredImageZoom(nextZoom, e.clientX, e.clientY);
              }}
              onWheel={(e) => {
                if (e.ctrlKey || e.metaKey) {
                  e.preventDefault();
                  const delta = e.deltaY < 0 ? 0.2 : -0.2;
                  const nextZoom = Math.max(1.0, Math.min(3.5, Number((imgZoomRef.current + delta).toFixed(2))));
                  applyAnchoredImageZoom(nextZoom, e.clientX, e.clientY);
                }
              }}
              className={`w-full h-full overflow-y-auto ${
                imageZoom > 1.02 ? 'overflow-x-auto items-start cursor-grab active:cursor-grabbing' : 'overflow-x-hidden items-center'
              } flex flex-col p-0 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden select-none relative`}
              style={{
                touchAction: imageZoom > 1.02 ? 'pan-x pan-y' : 'pan-y',
              }}
            >
              {docBlobUrl && (() => {
                const safeVw = Math.max(280, imgViewportWidth);
                const fitBaseW = safeVw < 768 ? safeVw : Math.min(safeVw, 920);
                const baseW = isStretchWidth ? safeVw : fitBaseW;
                const baseH =
                  imgNaturalSize.w > 0 && imgNaturalSize.h > 0
                    ? Math.round(fitBaseW * (imgNaturalSize.h / imgNaturalSize.w))
                    : 0;
                return (
                  <div
                    ref={imgContentRef}
                    className="my-auto shrink-0"
                    style={{
                      width: `${Math.round(baseW * imageZoom)}px`,
                      height: baseH ? `${Math.round(baseH * imageZoom)}px` : 'auto',
                      marginLeft: baseW * imageZoom <= safeVw ? 'auto' : 0,
                      marginRight: baseW * imageZoom <= safeVw ? 'auto' : 0,
                    }}
                  >
                    <img
                      src={docBlobUrl}
                      alt={currentItem.title}
                      draggable={false}
                      decoding="async"
                      onLoad={(e) => {
                        const nw = e.currentTarget.naturalWidth;
                        const nh = e.currentTarget.naturalHeight;
                        if (nw > 0 && nh > 0) setImgNaturalSize({ w: nw, h: nh });
                      }}
                      style={{
                        filter: themeClasses.canvasFilter,
                        objectFit: isStretchWidth ? 'fill' : 'contain',
                      }}
                      className="w-full h-full pointer-events-none select-none block"
                    />
                  </div>
                );
              })()}
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

        </main>
      </motion.div>
    </AnimatePresence>
  );
};
