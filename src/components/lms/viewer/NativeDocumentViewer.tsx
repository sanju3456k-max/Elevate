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

  // Reading Theme state (persists across document switches in session)
  const [theme, setTheme] = useState<ReadingTheme>('paper');

  // Loading & Document Data State
  const [loading, setLoading] = useState<boolean>(true);
  const [loadProgress, setLoadProgress] = useState<number>(0);
  const [docBuffer, setDocBuffer] = useState<ArrayBuffer | null>(null);
  const [docBlobUrl, setDocBlobUrl] = useState<string>('');
  const [detectedKind, setDetectedKind] = useState<'pdf' | 'image' | 'text' | 'embed'>('pdf');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Visual Transforms (for Image Mode)
  const [imageZoom, setImageZoom] = useState<number>(1.0);
  const [imageRotation, setImageRotation] = useState<number>(0);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState<boolean>(false);
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
  const imgLastTapRef = useRef<number>(0);
  const imgScrollRef = useRef<HTMLDivElement | null>(null);
  const imgZoomRef = useRef<number>(imageZoom);
  imgZoomRef.current = imageZoom;
  const imgPendingAnchorRef = useRef<{
    prevZoom: number;
    nextZoom: number;
    relX: number;
    relY: number;
    contentX: number;
    contentY: number;
  } | null>(null);

  const applyAnchoredImageZoom = useCallback((nextZoom: number, clientX?: number, clientY?: number) => {
    const el = imgScrollRef.current;
    const prevZoom = imgZoomRef.current;
    if (el && Math.abs(nextZoom - prevZoom) > 0.001) {
      const rect = el.getBoundingClientRect();
      const relX = clientX !== undefined ? clientX - rect.left : rect.width / 2;
      const relY = clientY !== undefined ? clientY - rect.top : rect.height / 2;
      imgPendingAnchorRef.current = {
        prevZoom,
        nextZoom,
        relX,
        relY,
        contentX: el.scrollLeft + relX,
        contentY: el.scrollTop + relY,
      };
    }
    setImageZoom(nextZoom);
  }, []);

  useLayoutEffect(() => {
    const anchor = imgPendingAnchorRef.current;
    const el = imgScrollRef.current;
    if (!anchor || !el) return;
    imgPendingAnchorRef.current = null;
    const scale = anchor.nextZoom / anchor.prevZoom;
    el.scrollLeft = Math.max(0, anchor.contentX * scale - anchor.relX);
    el.scrollTop = Math.max(0, anchor.contentY * scale - anchor.relY);
  }, [imageZoom]);

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
    if (e.touches.length === 2 && imgScrollRef.current) {
      const el = imgScrollRef.current;
      const rect = el.getBoundingClientRect();
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const midX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
      const midY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
      const relX = midX - rect.left;
      const relY = midY - rect.top;
      imgPinchStateRef.current = {
        active: true,
        startDist: Math.max(1, Math.hypot(dx, dy)),
        startZoom: imgZoomRef.current,
        startContentX: el.scrollLeft + relX,
        startContentY: el.scrollTop + relY,
        startScrollLeft: el.scrollLeft,
        startScrollTop: el.scrollTop,
        lastNextZoom: imgZoomRef.current,
        lastClientX: midX,
        lastClientY: midY,
      };
    }
  }, []);

  const handleImageTouchMove = useCallback((e: React.TouchEvent<HTMLDivElement>) => {
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
        applyAnchoredImageZoom(ps.lastNextZoom, ps.lastClientX, ps.lastClientY);
        return;
      }
      if (e.touches.length === 0 && e.changedTouches.length === 1) {
        const now = Date.now();
        if (now - imgLastTapRef.current < 280) {
          const t = e.changedTouches[0];
          const nextZoom = imgZoomRef.current > 1.15 ? 1.0 : 2.2;
          applyAnchoredImageZoom(nextZoom, t.clientX, t.clientY);
          imgLastTapRef.current = 0;
        } else {
          imgLastTapRef.current = now;
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
  const loadDocument = useCallback(async () => {
    if (!rawUrl && !driveId) {
      setErrorMessage('No document source provided.');
      setLoading(false);
      return;
    }

    setLoading(true);
    setErrorMessage(null);
    setDocBlobUrl('');
    setLoadProgress(15);

    // If YouTube link, render directly in embedded player
    if (ytId) {
      setDetectedKind('embed');
      setDocBlobUrl(`https://www.youtube.com/embed/${ytId}`);
      setLoadProgress(100);
      setLoading(false);
      return;
    }

    try {
      // 1. Try local IndexedDB cache first (<10ms instant load offline), strictly validating magic bytes
      if (cacheKey) {
        const cached = await getCachedDocument(cacheKey);
        if (cached && cached.data) {
          const magic = inspectMagicBytes(cached.data);
          if (magic === 'pdf' || magic === 'image') {
            setLoadProgress(100);
            setDocBuffer(cached.data);
            setDetectedKind(magic);

            const resolvedMime = magic === 'pdf' ? 'application/pdf' : cached.contentType || 'image/png';
            const blob = new Blob([cached.data], { type: resolvedMime });
            const bUrl = URL.createObjectURL(blob);
            setDocBlobUrl(bUrl);
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
        setDetectedKind('image');
        setDocBlobUrl(`https://lh3.googleusercontent.com/d/${driveId}`);
        setLoading(false);
        return;
      }

      // Real-time in-app iframe embed fallback for Drive / Docs / External URLs
      if (embedFallbackUrl) {
        setDetectedKind('embed');
        setDocBlobUrl(embedFallbackUrl);
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
  }, [rawUrl, driveId, ytId, cacheKey, currentItem, embedFallbackUrl, publicOnly]);

  const handleLoadedData = useCallback(
    (arrayBuffer: ArrayBuffer, contentType: string) => {
      const magic = inspectMagicBytes(arrayBuffer);

      // Never feed HTML/invalid bytes to PdfCanvasViewer or IndexedDB
      if (magic === 'unknown') {
        if (embedFallbackUrl) {
          setDetectedKind('embed');
          setDocBlobUrl(embedFallbackUrl);
          setLoading(false);
          return;
        }
        if (contentType.includes('text/plain') || currentItem?.content) {
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

      setDetectedKind(resolvedKind);
      setDocBuffer(arrayBuffer);

      const blob = new Blob([arrayBuffer], { type: resolvedType });
      const bUrl = URL.createObjectURL(blob);
      setDocBlobUrl(bUrl);

      // Save only validated PDF/image bytes to IndexedDB cache
      if (cacheKey) {
        saveCachedDocument(cacheKey, arrayBuffer, resolvedType).catch(() => {});
      }

      setLoading(false);
    },
    [cacheKey, currentItem, embedFallbackUrl]
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
        style={{
          paddingBottom: 'var(--android-cutout-bottom, 0px)',
        }}
      >
        {/* ========================================================= */}
        {/* 1. BORDERLESS MINIMAL HEADER BAR                          */}
        {/* ========================================================= */}
        <header
          className={`shrink-0 h-[calc(3.5rem+var(--android-status-bar-height,0px))] px-3 sm:px-6 flex items-center justify-between border-0 backdrop-blur-xl z-30 transition-colors ${themeClasses.header}`}
          style={{
            paddingTop: 'var(--android-status-bar-height, 0px)',
          }}
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
              <ChevronLeft className="w-5 h-5 stroke-[2.4]" />
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

            {/* Print & Download (Controlled by Master Console `allowFilesToBeDownloadedInNotesViaPdfOrImages`) */}
            {canPrintAndDownload && (
              <>
                <button
                  type="button"
                  onClick={handlePrint}
                  className="w-8 h-8 sm:w-9 sm:h-9 rounded-full flex items-center justify-center hover:bg-black/5 dark:hover:bg-white/10 transition cursor-pointer border-none bg-transparent active:scale-95"
                  title="Print Note"
                >
                  <Printer className="w-4 h-4" />
                </button>

                <button
                  type="button"
                  onClick={handleDownload}
                  className="w-8 h-8 sm:w-9 sm:h-9 rounded-full flex items-center justify-center hover:bg-black/5 dark:hover:bg-white/10 transition cursor-pointer border-none bg-transparent active:scale-95"
                  title="Save / Download File"
                >
                  <Download className="w-4 h-4" />
                </button>
              </>
            )}
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
                const nextZoom = imgZoomRef.current > 1.15 ? 1.0 : 2.2;
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
              } flex flex-col p-0 sm:p-2 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden select-none relative`}
              style={{
                touchAction: imageZoom > 1.02 ? 'pan-x pan-y' : 'pan-y',
              }}
            >
              {docBlobUrl && (
                <div
                  ref={imgContentRef}
                  className={`flex ${imageZoom > 1.02 ? 'justify-start' : 'justify-center'} my-auto shrink-0`}
                  style={{
                    width: imageZoom > 1.02 ? `${imageZoom * 100}%` : '100%',
                  }}
                >
                  <img
                    src={docBlobUrl}
                    alt={currentItem.title}
                    draggable={false}
                    style={{
                      filter: themeClasses.canvasFilter,
                      maxWidth: imageZoom > 1.02 ? `${Math.round(920 * imageZoom)}px` : undefined,
                    }}
                    className={`w-full ${
                      imageZoom > 1.02 ? '' : 'sm:max-w-[920px]'
                    } h-auto object-contain pointer-events-none select-none block`}
                  />
                </div>
              )}
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
