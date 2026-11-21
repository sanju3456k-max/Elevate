import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  Play,
  Pause,
  RotateCcw,
  RotateCw,
  FastForward,
  Volume2,
  VolumeX,
  Maximize2,
  Minimize2,
  PictureInPicture2,
  Gauge,
  ShieldAlert,
  AlertTriangle,
  Lock,
  SlidersHorizontal,
  Check,
  Flag,
  Settings,
  ChevronRight,
  ChevronLeft,
  ChevronDown,
} from 'lucide-react';
import { deobfuscateVideoKey, extractYouTubeId, formatDuration, getLectureThumbnailUrl, initDevToolsDetector, initFocusLossProtector } from '../../../lms/security';
import { requestPlaybackToken } from '../../../lms/playbackTokenService';
import { useApp } from '../../../lms/LmsContext';
import { useBackHandler, isBrowserFullscreen, exitBrowserFullscreen } from '../../../hooks/useBackNavigation';
import { enterNativePip, setNativePlaybackPlaying, isNativeAndroid, hideNativeStatusBar, showNativeStatusBar, lockOrientationLandscape, unlockOrientationPortrait } from '../../../lib/nativeHardwareBridge';
import type { User, TimelineMilestone, PlaybackSessionToken } from '../../../lms/types';

declare global {
  interface Window {
    YT: any;
    onYouTubeIframeAPIReady: () => void;
  }
}

interface CloakedVideoPlayerProps {
  encryptedVideoId: string;
  title: string;
  user: User;
  batchId?: string;
  lectureId?: string;
  isGuestAllowed?: boolean;
  seekToSeconds?: number | null;
  milestones?: TimelineMilestone[];
  onProgress?: (seconds: number, totalSeconds: number) => void;
  onComplete?: () => void;
  thumbnailUrl?: string;
  posterUrl?: string;
  isMini?: boolean;
  autoPlay?: boolean;
  isPlayingProp?: boolean;
  onPlayStateChange?: (isPlaying: boolean) => void;
  onMinimize?: () => void;
}

export interface QualityOption {
  label: string;
  value: string;
  badge?: string;
}

const QUALITY_OPTIONS: QualityOption[] = [
  { label: 'Auto (Best Quality)', value: 'default', badge: 'Auto' },
  { label: '2160p 4K', value: 'hd2160', badge: '4K' },
  { label: '1440p 2K', value: 'hd1440', badge: '1440p' },
  { label: '1080p HD', value: 'hd1080', badge: '1080p' },
  { label: '720p HD', value: 'hd720', badge: '720p' },
  { label: '480p', value: 'large', badge: '480p' },
  { label: '360p', value: 'medium', badge: '360p' },
  { label: '240p', value: 'small', badge: '240p' },
  { label: '144p', value: 'tiny', badge: '144p' },
];

const QUALITY_CODE_TO_LABEL: Record<string, string> = {
  highres: '1080p HD',
  hd2160: '4K HD',
  hd1440: '1440p HD',
  hd1080: '1080p HD',
  hd720: '720p HD',
  large: '480p',
  medium: '360p',
  small: '240p',
  tiny: '144p',
  default: 'Auto',
};

export const CloakedVideoPlayer: React.FC<CloakedVideoPlayerProps> = ({
  encryptedVideoId,
  title,
  user,
  batchId = 'batch-01',
  lectureId = 'lec-01',
  isGuestAllowed = false,
  seekToSeconds,
  milestones = [],
  onProgress,
  onComplete,
  thumbnailUrl,
  posterUrl,
  isMini = false,
  autoPlay = false,
  isPlayingProp,
  onPlayStateChange,
  onMinimize,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<any>(null);
  const playerContainerId = useRef(`yt-player-${Math.random().toString(36).substring(2, 9)}`);

  // 1. Ephemeral Playback Token & Batch Access Verification State
  const [authStatus, setAuthStatus] = useState<'verifying' | 'authorized' | 'denied'>('verifying');
  const [playbackToken, setPlaybackToken] = useState<PlaybackSessionToken | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);

  // 2. Active DevTools / Screen Inspection Detection State
  const [isDevToolsOpen, setIsDevToolsOpen] = useState(false);

  // Security Context & Focus-Loss (Snipping Tool / Background Window) Protection
  const { securitySettings } = useApp();
  const [isWindowObscured, setIsWindowObscured] = useState(false);

  useEffect(() => {
    if (!securitySettings?.enableDrmScreenProtection) {
      setIsWindowObscured(false);
      return;
    }
    const cleanup = initFocusLossProtector((obscured) => {
      setIsWindowObscured(obscured);
    });
    return cleanup;
  }, [securitySettings?.enableDrmScreenProtection]);

  // Anti-Inspection & Anti-Proxy/VPN Protection (Blocks HTTP Toolkit, Charles Proxy & packet sniffers)
  const [isProxyVpnDetected, setIsProxyVpnDetected] = useState(false);

  // 3. Playback lifecycle states & Cloaking Curtain
  const [hasEverPlayed, setHasEverPlayed] = useState(false);
  const [isBufferingOrStarting, setIsBufferingOrStarting] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(100);
  const [isMuted, setIsMuted] = useState(false);
  const [isVolumeSliderOpen, setIsVolumeSliderOpen] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isControlsVisible, setIsControlsVisible] = useState(true);
  const [isPlayerReady, setIsPlayerReady] = useState(false);

  // 4. Dynamic Moving DRM Watermark Coordinates (drift every 7s)
  const [watermarkPos, setWatermarkPos] = useState({ top: 22, left: 18 });
  
  // Options (Settings) Menu State: Unified Quality, Speed & Captions
  const [optionsMenuOpen, setOptionsMenuOpen] = useState(false);
  const [optionsView, setOptionsView] = useState<'main' | 'speed' | 'quality'>('main');
  const [currentQuality, setCurrentQuality] = useState<string>(() => {
    try {
      return localStorage.getItem('elevate_video_quality') || '1080p HD';
    } catch {
      return '1080p HD';
    }
  });
  const [availableQualityLevels, setAvailableQualityLevels] = useState<string[]>([]);
  const [captionsEnabled, setCaptionsEnabled] = useState(false);
  const captionsEnabledRef = useRef(false);
  captionsEnabledRef.current = captionsEnabled;
  const [securityNotice, setSecurityNotice] = useState<string | null>(null);

  // Double-tap seek gesture state (10s Rewind/Forward)
  const lastTapRef = useRef<{ time: number; side: 'left' | 'right' }>({ time: 0, side: 'left' });

  // Native Android PiP (Picture-in-Picture) state & bridge
  const [isInNativePip, setIsInNativePip] = useState(false);

  useEffect(() => {
    setNativePlaybackPlaying(isPlaying);
  }, [isPlaying]);

  useEffect(() => {
    const handler = (e: any) => {
      const inPip = Boolean(e?.detail?.inPip);
      setIsInNativePip(inPip);
      if (inPip) {
        document.body.classList.add('in-native-pip');
      } else {
        document.body.classList.remove('in-native-pip');
      }
    };
    window.addEventListener('nativePipChanged', handler);
    return () => {
      window.removeEventListener('nativePipChanged', handler);
      document.body.classList.remove('in-native-pip');
      setNativePlaybackPlaying(false);
    };
  }, []);
  const tapTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const controlsTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastBackdropClickRef = useRef<number>(0);
  const [seekFeedback, setSeekFeedback] = useState<{ side: 'left' | 'right'; seconds: number } | null>(null);
  const seekFeedbackTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const seekFeedbackRef = useRef(false);
  const lastSeekEndTimeRef = useRef(0);

  // Hold-to-2X Speed Gesture State & Refs (YouTube signature feature)
  const [is2xSpeedActive, setIs2xSpeedActive] = useState(false);
  const is2xSpeedActiveRef = useRef(false);
  is2xSpeedActiveRef.current = is2xSpeedActive;
  const speedBefore2xRef = useRef(1);
  const longPressTimerRef = useRef<NodeJS.Timeout | null>(null);
  const last2xEndTimeRef = useRef(0);
  const playbackSpeedRef = useRef(playbackSpeed);
  playbackSpeedRef.current = playbackSpeed;

  // Track whether mouse/pointer is hovering over the bottom control bar
  const [isHoveringControls, setIsHoveringControls] = useState(false);
  const isHoveringControlsRef = useRef(false);
  isHoveringControlsRef.current = isHoveringControls;

  // Refs to allow event listeners and timers to read current open state without stale closures
  const optionsMenuOpenRef = useRef(false);
  const selectedQualityRef = useRef('Auto');
  optionsMenuOpenRef.current = optionsMenuOpen;
  selectedQualityRef.current = currentQuality;

  // Dedicated refs to break state feedback loop with external controllers (e.g. MiniPlayer toggle)
  const isPlayingRef = useRef(isPlaying);
  isPlayingRef.current = isPlaying;

  const onPlayStateChangeRef = useRef(onPlayStateChange);
  useEffect(() => {
    onPlayStateChangeRef.current = onPlayStateChange;
  }, [onPlayStateChange]);

  const isControlsVisibleRef = useRef(isControlsVisible);
  isControlsVisibleRef.current = isControlsVisible;
  const lastControlsRevealedAt = useRef(0);

  // Helper: Show streamline and tools controls for a set duration (5s by default)
  const showControlsForDuration = useCallback((duration = 5000) => {
    lastControlsRevealedAt.current = Date.now();
    setIsControlsVisible(true);
    isControlsVisibleRef.current = true;
    if (controlsTimeoutRef.current) {
      clearTimeout(controlsTimeoutRef.current);
      controlsTimeoutRef.current = null;
    }
    if (duration > 0) {
      controlsTimeoutRef.current = setTimeout(() => {
        // Auto-hide when video is playing and settings menu is not open
        // (and desktop mouse isn't hovering over controls)
        if (isPlayingRef.current && !optionsMenuOpenRef.current && !isHoveringControlsRef.current) {
          setIsControlsVisible(false);
          isControlsVisibleRef.current = false;
        }
      }, duration);
    }
  }, []);

  // Helper: Hide controls immediately
  const hideControls = useCallback(() => {
    if (controlsTimeoutRef.current) {
      clearTimeout(controlsTimeoutRef.current);
      controlsTimeoutRef.current = null;
    }
    setIsHoveringControls(false);
    isHoveringControlsRef.current = false;
    setOptionsMenuOpen(false);
    optionsMenuOpenRef.current = false;
    setIsControlsVisible(false);
    isControlsVisibleRef.current = false;
  }, []);

  // Helper: Toggle controls on single click/tap
  // If visible: re-click hides immediately.
  // If hidden: click shows controls for 5 seconds.
  const toggleControls = useCallback(() => {
    if (isControlsVisibleRef.current) {
      hideControls();
    } else {
      showControlsForDuration(5000);
    }
  }, [hideControls, showControlsForDuration]);

  // Helper: Scientific 5-second decay for in-video note tabs and status notices
  const securityNoticeTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const showNoticeWithDecay = useCallback((msg: string, duration = 5000) => {
    setSecurityNotice(msg);
    if (securityNoticeTimeoutRef.current) {
      clearTimeout(securityNoticeTimeoutRef.current);
    }
    securityNoticeTimeoutRef.current = setTimeout(() => {
      setSecurityNotice(null);
      securityNoticeTimeoutRef.current = null;
    }, duration);
  }, []);

  // Safe helper to interact with YouTube player instance without risking widgetapi postMessage / unmounted iframe crashes
  const safeCallPlayer = useCallback((action: (player: any) => void) => {
    try {
      const p = playerRef.current;
      if (!p) return;
      if (typeof p.getIframe === 'function') {
        const iframe = p.getIframe();
        if (!iframe || !iframe.src) return;
      }
      action(p);
    } catch {
      // Safely swallow any widgetapi postMessage / unmounted iframe errors
    }
  }, []);

  useEffect(() => {
    const handleNativeSecurityStatus = (e: any) => {
      const active = Boolean(e?.detail?.isProxyOrVpnActive);
      setIsProxyVpnDetected(active);
      if (active) {
        try {
          if (playerRef.current && typeof playerRef.current.destroy === 'function') {
            playerRef.current.destroy();
          }
        } catch {}
        playerRef.current = null;
        setIsPlayerReady(false);
        setIsPlaying(false);
        const container = document.getElementById(playerContainerId.current);
        if (container) {
          container.innerHTML = '';
        }
      }
    };

    if (typeof window !== 'undefined' && (window as any).__ELEVATE_NETWORK_SECURITY?.isProxyOrVpnActive) {
      setIsProxyVpnDetected(true);
    }

    window.addEventListener('elevate_security_status', handleNativeSecurityStatus);
    return () => {
      window.removeEventListener('elevate_security_status', handleNativeSecurityStatus);
    };
  }, [safeCallPlayer]);

  const rawVideoId = deobfuscateVideoKey(encryptedVideoId);
  const safeVideoId =
    extractYouTubeId(rawVideoId) ||
    (/^[a-zA-Z0-9_-]{11}$/.test(rawVideoId) ? rawVideoId : 'WUvTyaaNkzM');

  // Secure thumbnail resolution: Never construct raw i.ytimg.com links directly to prevent video ID leakage
  const resolvedThumbnail = getLectureThumbnailUrl({ encryptedVideoId, thumbnailUrl: thumbnailUrl || posterUrl });
  const posterSource =
    resolvedThumbnail ||
    posterUrl ||
    thumbnailUrl ||
    '/assets/default-course-banner.png';

  const [activePosterImage, setActivePosterImage] = useState<string>(posterSource);

  useEffect(() => {
    setActivePosterImage(posterSource);
  }, [posterSource]);

  // Dynamic Moving DRM Watermark Position (drifts smoothly across screen with gentle easing, 0 flicker)
  useEffect(() => {
    const waypoints = [
      { top: 22, left: 18 },
      { top: 28, left: 62 },
      { top: 65, left: 68 },
      { top: 58, left: 22 },
      { top: 35, left: 45 },
      { top: 70, left: 40 },
      { top: 25, left: 30 },
    ];
    let step = 0;
    const interval = setInterval(() => {
      step = (step + 1) % waypoints.length;
      const base = waypoints[step];
      const jitterTop = Math.floor((Math.random() - 0.5) * 6);
      const jitterLeft = Math.floor((Math.random() - 0.5) * 6);
      setWatermarkPos({
        top: Math.max(16, Math.min(74, base.top + jitterTop)),
        left: Math.max(12, Math.min(72, base.left + jitterLeft)),
      });
    }, 11000);
    return () => clearInterval(interval);
  }, []);

  // Ephemeral Batch Token Verification Gateway
  useEffect(() => {
    let isCancelled = false;

    // Strict Anti-Sniffer Guard: Never request or exchange tokens if network interception is active
    if (isProxyVpnDetected) {
      setAuthStatus('denied');
      setAuthError('Security Violation: Active network proxy / VPN detected.');
      return;
    }

    setAuthStatus('verifying');

    requestPlaybackToken(user, batchId, {
      id: lectureId,
      batchId,
      subjectId: 'sub-01',
      chapterId: 'chap-01',
      title,
      description: '',
      durationMinutes: 10,
      videoSourceType: 'youtube',
      encryptedVideoId,
      thumbnailUrl: '',
      order: 1,
      isFreePreview: false,
      pdfNotes: [],
      createdAt: new Date().toISOString(),
    }, isGuestAllowed).then((res) => {
      if (isCancelled) return;
      if (res.isAuthorized && res.token) {
        setAuthStatus('authorized');
        setPlaybackToken(res.token);
      } else {
        setAuthStatus('denied');
        setAuthError(res.errorMessage || 'Access Denied: Batch Enrollment Required');
      }
    });

    return () => {
      isCancelled = true;
    };
  }, [user, batchId, lectureId, encryptedVideoId, isGuestAllowed, isProxyVpnDetected]);

  // Seamless 45-second background token renewal
  useEffect(() => {
    if (authStatus !== 'authorized') return;
    const renewTimer = setInterval(() => {
      requestPlaybackToken(user, batchId, {
        id: lectureId,
        batchId,
        subjectId: 'sub-01',
        chapterId: 'chap-01',
        title,
        description: '',
        durationMinutes: 10,
        videoSourceType: 'youtube',
        encryptedVideoId,
        thumbnailUrl: '',
        order: 1,
        isFreePreview: false,
        pdfNotes: [],
        createdAt: new Date().toISOString(),
      }, isGuestAllowed).then((res) => {
        if (res.isAuthorized && res.token) {
          setPlaybackToken(res.token);
        }
      });
    }, 45000);
    return () => clearInterval(renewTimer);
  }, [authStatus, user, batchId, lectureId, isGuestAllowed]);

  // Real-time Developer Tools Active Tamper Protection
  useEffect(() => {
    const cleanup = initDevToolsDetector((isOpen) => {
      setIsDevToolsOpen(isOpen);
      if (isOpen) {
        safeCallPlayer((p) => {
          if (p.pauseVideo) {
            p.pauseVideo();
            setIsPlaying(false);
          }
        });
      }
    });
    return cleanup;
  }, [safeCallPlayer]);

  // Load YouTube IFrame API once
  useEffect(() => {
    if (!window.YT) {
      const tag = document.createElement('script');
      tag.src = 'https://www.youtube.com/iframe_api';
      const firstScriptTag = document.getElementsByTagName('script')[0];
      firstScriptTag?.parentNode?.insertBefore(tag, firstScriptTag);
    }
  }, []);

  // Handle external seek requests (e.g. clicking a timestamped personal note or milestone)
  useEffect(() => {
    if (seekToSeconds !== undefined && seekToSeconds !== null && isPlayerReady) {
      safeCallPlayer((p) => {
        if (typeof p.seekTo === 'function') {
          p.seekTo(seekToSeconds, true);
          p.playVideo?.();
          isPlayingRef.current = true;
          setIsPlaying(true);
          onPlayStateChangeRef.current?.(true);
          setCurrentTime(seekToSeconds);
          showNoticeWithDecay(`Jumped to ${formatDuration(seekToSeconds)}`, 5000);
        }
      });
    }
  }, [seekToSeconds, isPlayerReady, safeCallPlayer, showNoticeWithDecay]);

  // Synchronize external play/pause state (e.g. from YouTube MiniPlayer controls)
  // Clean one-way sink: updates player hardware without triggering an echo feedback loop
  useEffect(() => {
    if (isPlayingProp === undefined) return;
    if (isPlayingRef.current === isPlayingProp) return;

    isPlayingRef.current = isPlayingProp;
    setIsPlaying(isPlayingProp);

    safeCallPlayer((p) => {
      if (isPlayingProp) {
        if (p.playVideo) p.playVideo();
        setHasEverPlayed(true);
      } else {
        if (p.pauseVideo) p.pauseVideo();
      }
    });
  }, [isPlayingProp, safeCallPlayer]);

  // Synchronous Custom Event listener for instant zero-latency miniplayer controls
  useEffect(() => {
    const handleGlobalToggle = (e: any) => {
      const shouldPlay = e.detail?.isPlaying;
      if (shouldPlay !== undefined) {
        setIsPlaying(shouldPlay);
        isPlayingRef.current = shouldPlay;
        safeCallPlayer((p) => {
          if (shouldPlay) {
            if (p.playVideo) p.playVideo();
            setHasEverPlayed(true);
          } else {
            if (p.pauseVideo) p.pauseVideo();
          }
        });
      }
    };
    window.addEventListener('elevate_player_toggle_play', handleGlobalToggle);
    return () => window.removeEventListener('elevate_player_toggle_play', handleGlobalToggle);
  }, [safeCallPlayer]);

  // Initialize or re-create player with high definition rendering
  useEffect(() => {
    let checkInterval: any = null;

    if (authStatus !== 'authorized' || isProxyVpnDetected) {
      try {
        if (playerRef.current && typeof playerRef.current.destroy === 'function') {
          playerRef.current.destroy();
        }
      } catch {}
      playerRef.current = null;
      setIsPlayerReady(false);
      const container = document.getElementById(playerContainerId.current);
      if (container) {
        container.innerHTML = '';
      }
      return;
    }

    if (!autoPlay && !isMini) {
      setHasEverPlayed(false);
      setIsPlaying(false);
      setIsBufferingOrStarting(false);
    }

    const initPlayer = () => {
      if (!window.YT || !window.YT.Player) return false;

      // Extract and sanitize valid 11-char ID
      const safeVideoId =
        extractYouTubeId(rawVideoId) ||
        (/^[a-zA-Z0-9_-]{11}$/.test(rawVideoId) ? rawVideoId : 'WUvTyaaNkzM');

      // Destroy existing player if any
      try {
        if (playerRef.current && typeof playerRef.current.destroy === 'function') {
          playerRef.current.destroy();
        }
      } catch {}
      playerRef.current = null;
      setIsPlayerReady(false);

      try {
        // Classplus-style Cloaked Embedding:
        // Do NOT pass `videoId` in the YT.Player constructor options.
        // YouTube then initializes the iframe with `https://www.youtube.com/embed/?...`
        // without exposing any video ID in the HTTP GET path (hiding it from HTTP Toolkit / network sniffers).
        playerRef.current = new window.YT.Player(playerContainerId.current, {
          width: '100%',
          height: '100%',
          playerVars: {
            autoplay: (autoPlay || isMini) ? 1 : 0,
            controls: 0, // Hides native YouTube controls
            disablekb: 1, // Disable keyboard controls to prevent unmasking
            fs: 0, // Hide YouTube's native fullscreen button
            modestbranding: 1, // Suppress YouTube logo
            rel: 0, // Do not show related videos
            iv_load_policy: 3, // Disable annotations
            playsinline: 1,
            cc_load_policy: 0, // Controlled via our custom CC button
            origin: window.location.origin,
            enablejsapi: 1,
            widget_referrer: window.location.origin,
            vq: 'hd1080',
            hd: 1,
            suggestedQuality: 'hd1080',
          },
          events: {
            onReady: (event: any) => {
              setIsPlayerReady(true);

              const shouldPlay = (autoPlay || isMini) && isPlayingProp !== false;
              const startSec = (seekToSeconds !== undefined && seekToSeconds !== null && seekToSeconds > 0) ? seekToSeconds : 0;

              // Phase 2: Send the videoId strictly through encrypted postMessage command
              if (shouldPlay) {
                try {
                  event.target.loadVideoById({
                    videoId: safeVideoId,
                    startSeconds: startSec,
                    suggestedQuality: 'hd1080',
                  });
                  isPlayingRef.current = true;
                  setIsPlaying(true);
                  setIsBufferingOrStarting(true);
                  onPlayStateChangeRef.current?.(true);
                } catch {}
              } else {
                try {
                  event.target.cueVideoById({
                    videoId: safeVideoId,
                    startSeconds: startSec,
                    suggestedQuality: 'hd1080',
                  });
                } catch {}
              }

              const total = event.target.getDuration() || 0;
              if (total > 0) {
                setDuration(total);
                if (onProgress) onProgress(startSec, total);
              }

              // Detect and enforce maximum HD playback quality
              try {
                if (event.target.getAvailableQualityLevels) {
                  const levels = event.target.getAvailableQualityLevels();
                  if (Array.isArray(levels) && levels.length > 0) {
                    setAvailableQualityLevels(levels);
                  }
                }
                const targetLabel = selectedQualityRef.current || '1080p HD';
                const targetObj = QUALITY_OPTIONS.find((o) => o.label === targetLabel);
                const qualityValue = targetObj && targetObj.value !== 'default' ? targetObj.value : 'hd1080';

                if (event.target.setPlaybackQualityRange) {
                  event.target.setPlaybackQualityRange(qualityValue, 'highres');
                }
                if (event.target.setPlaybackQuality) {
                  event.target.setPlaybackQuality(qualityValue);
                }

                // Send direct postMessage commands to ensure DASH pipeline locks to highest quality
                try {
                  const iframe = containerRef.current?.querySelector('iframe');
                  if (iframe?.contentWindow) {
                    iframe.contentWindow.postMessage(JSON.stringify({
                      event: 'command',
                      func: 'setPlaybackQuality',
                      args: [qualityValue]
                    }), '*');
                    iframe.contentWindow.postMessage(JSON.stringify({
                      event: 'command',
                      func: 'setPlaybackQualityRange',
                      args: [qualityValue, 'highres']
                    }), '*');
                  }
                } catch {}

                // Strictly turn off subtitles/captions by default on start
                if (event.target.unloadModule) {
                  event.target.unloadModule('captions');
                }
                if (event.target.setOption) {
                  event.target.setOption('captions', 'track', {});
                  event.target.setOption('captions', 'reload', false);
                }
              } catch {
                // fallback
              }
            },
            onPlaybackQualityChange: (event: any) => {
              const qCode = event.data;
              if (qCode && QUALITY_CODE_TO_LABEL[qCode]) {
                const label = QUALITY_CODE_TO_LABEL[qCode];
                if (selectedQualityRef.current.startsWith('Auto')) {
                  setCurrentQuality(`Auto (${label})`);
                } else {
                  setCurrentQuality(label);
                }
              }
              try {
                if (event.target.getAvailableQualityLevels) {
                  const levels = event.target.getAvailableQualityLevels();
                  if (Array.isArray(levels) && levels.length > 0) {
                    setAvailableQualityLevels(levels);
                  }
                }
              } catch {}
            },
            onStateChange: (event: any) => {
              // YT.PlayerState: -1 (unstarted), 0 (ended), 1 (playing), 2 (paused), 3 (buffering), 5 (video cued)
              try {
                const streamDuration = event.target.getDuration ? (event.target.getDuration() || 0) : 0;
                if (streamDuration > 0) {
                  setDuration((prev) => (prev <= 0 ? streamDuration : prev));
                }
              } catch {}

              if (event.data === 1) {
                isPlayingRef.current = true;
                setIsPlaying(true);
                const isInitialStart = !hasEverPlayed;
                setHasEverPlayed(true);
                setIsBufferingOrStarting(false);
                onPlayStateChangeRef.current?.(true);

                // Auto-hide controls after 5 seconds ONLY on initial video start or if controls were already open
                // Never wake up controls during/after seeking or 2X speed!
                if (isInitialStart) {
                  showControlsForDuration(5000);
                } else if (isControlsVisibleRef.current && !seekFeedbackRef.current && !is2xSpeedActiveRef.current) {
                  showControlsForDuration(5000);
                }

                // Enforce maximum available quality as soon as streaming starts
                try {
                  const targetLabel = selectedQualityRef.current || '1080p HD';
                  const targetObj = QUALITY_OPTIONS.find((o) => o.label === targetLabel);
                  const qualityValue = targetObj && targetObj.value !== 'default' ? targetObj.value : 'hd1080';
                  if (event.target.setPlaybackQualityRange) {
                    event.target.setPlaybackQualityRange(qualityValue, 'highres');
                  }
                  if (event.target.setPlaybackQuality) {
                    event.target.setPlaybackQuality(qualityValue);
                  }
                  const iframe = containerRef.current?.querySelector('iframe');
                  if (iframe?.contentWindow) {
                    iframe.contentWindow.postMessage(JSON.stringify({
                      event: 'command',
                      func: 'setPlaybackQuality',
                      args: [qualityValue]
                    }), '*');
                    iframe.contentWindow.postMessage(JSON.stringify({
                      event: 'command',
                      func: 'setPlaybackQualityRange',
                      args: [qualityValue, 'highres']
                    }), '*');
                  }
                  if (event.target.getAvailableQualityLevels) {
                    const levels = event.target.getAvailableQualityLevels();
                    if (Array.isArray(levels) && levels.length > 0) {
                      setAvailableQualityLevels(levels);
                    }
                  }

                  // Force captions off if not explicitly toggled on by user
                  if (!captionsEnabledRef.current) {
                    if (event.target.unloadModule) {
                      event.target.unloadModule('captions');
                    }
                    if (event.target.setOption) {
                      event.target.setOption('captions', 'track', {});
                      event.target.setOption('captions', 'reload', false);
                    }
                  }
                } catch {}
              } else if (event.data === 2) {
                // Ignore transient seek pause events so controls NEVER pop up after double-tap seek
                if (seekFeedbackRef.current || Date.now() - lastSeekEndTimeRef.current < 800) {
                  return;
                }
                isPlayingRef.current = false;
                setIsPlaying(false);
                setIsBufferingOrStarting(false);
                onPlayStateChangeRef.current?.(false);
                // When paused, keep controls visible so student can see controls & timeline
                if (controlsTimeoutRef.current) {
                  clearTimeout(controlsTimeoutRef.current);
                  controlsTimeoutRef.current = null;
                }
                setIsControlsVisible(true);
                isControlsVisibleRef.current = true;
              } else if (event.data === 0) {
                isPlayingRef.current = false;
                setIsPlaying(false);
                setIsBufferingOrStarting(false);
                onPlayStateChangeRef.current?.(false);
                setIsControlsVisible(true);
                isControlsVisibleRef.current = true;
                if (onComplete) onComplete();
              }
            },
            onError: (errEvent: any) => {
              console.warn('YouTube Player runtime event code:', errEvent?.data);
              showNoticeWithDecay('Connecting to alternative high-speed stream...', 4000);
            },
          },
        });
        return true;
      } catch (err) {
        console.warn('Failed to initialize YouTube Player instance:', err);
        return false;
      }
    };

    if (window.YT && window.YT.Player) {
      initPlayer();
    } else {
      checkInterval = setInterval(() => {
        if (window.YT && window.YT.Player) {
          if (initPlayer()) {
            clearInterval(checkInterval);
          }
        }
      }, 200);
    }

    return () => {
      if (checkInterval) clearInterval(checkInterval);
      setIsPlayerReady(false);
      try {
        if (playerRef.current && typeof playerRef.current.destroy === 'function') {
          playerRef.current.destroy();
        }
      } catch {}
      playerRef.current = null;
    };
  }, [rawVideoId, authStatus, isProxyVpnDetected]);

  // Update current time every 500ms when playing
  useEffect(() => {
    let timer: any = null;
    if (isPlaying) {
      timer = setInterval(() => {
        safeCallPlayer((p) => {
          if (p.getCurrentTime) {
            const curr = p.getCurrentTime() || 0;
            const dur = p.getDuration ? (p.getDuration() || duration) : duration;
            setCurrentTime(curr);
            if (dur && dur !== duration) setDuration(dur);
            if (onProgress) onProgress(curr, dur);
          }
        });
      }, 500);
    }
    return () => clearInterval(timer);
  }, [isPlaying, duration, onProgress, safeCallPlayer]);

  const handleSkip = useCallback((seconds: number) => {
    safeCallPlayer((p) => {
      if (p.getCurrentTime && p.seekTo) {
        const curr = p.getCurrentTime() || 0;
        const maxTime = duration > 0 ? duration : 999999;
        const nextTime = Math.max(0, Math.min(maxTime, curr + seconds));
        p.seekTo(nextTime, true);
        setCurrentTime(nextTime);
      }
    });
  }, [safeCallPlayer, duration]);

  // Touch & Tap gesture tracking for mobile & desktop
  const touchStartRef = useRef<{ x: number; y: number; time: number } | null>(null);
  const lastTouchHandledTimeRef = useRef<number>(0);

  // 1. Hold to 2X Speed Handler (Activates when pressing on the right side/surface for >350ms while playing)
  const startHold2xTimer = useCallback((clientX: number, target: HTMLElement) => {
    if (!isPlayingRef.current) return;

    const rect = target.getBoundingClientRect();
    if (rect.width <= 0) return;
    const ratio = (clientX - rect.left) / rect.width;
    if (ratio < 0.35) return; // Left 35% reserved for rewind double-tap

    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
    }

    longPressTimerRef.current = setTimeout(() => {
      if (isPlayingRef.current) {
        is2xSpeedActiveRef.current = true;
        setIs2xSpeedActive(true);
        // Immediately hide controls so video is 100% full and unobstructed during 2X speed
        hideControls();
        speedBefore2xRef.current = playbackSpeedRef.current;
        safeCallPlayer((p) => {
          if (p.setPlaybackRate) {
            p.setPlaybackRate(2);
          }
        });
        if (typeof navigator !== 'undefined' && navigator.vibrate) {
          try {
            navigator.vibrate(35);
          } catch {}
        }
      }
    }, 350);
  }, [safeCallPlayer, hideControls]);

  const releaseHold2x = useCallback((): boolean => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }

    if (is2xSpeedActiveRef.current) {
      is2xSpeedActiveRef.current = false;
      setIs2xSpeedActive(false);
      last2xEndTimeRef.current = Date.now();
      const prevSpeed = speedBefore2xRef.current || 1;
      safeCallPlayer((p) => {
        if (p.setPlaybackRate) {
          p.setPlaybackRate(prevSpeed);
        }
      });
      // Keep controls hidden after 2X speed release so video continues full-screen seamlessly
      hideControls();
      return true;
    }
    return false;
  }, [safeCallPlayer, hideControls]);

  // 2. Surface Tap & Double-Tap seek gestures (10s Rewind on Left, 10s Forward on Right, Instant toggle in Center)
  const handleSurfaceTap = useCallback((zone: 'left' | 'center' | 'right') => {
    const now = Date.now();
    const DOUBLE_TAP_WINDOW = 280;

    // If options menu is open, tapping anywhere outside dismisses the options menu while preserving controls
    if (optionsMenuOpenRef.current) {
      setOptionsMenuOpen(false);
      optionsMenuOpenRef.current = false;
      showControlsForDuration(5000);
      return;
    }

    // Suppress accidental tap right after 2X speed hold release
    if (now - last2xEndTimeRef.current < 350) {
      return;
    }

    // 1. CENTER ZONE: Instant Single-Tap Toggle
    // Center has no double-tap seek: single tap toggles controls immediately
    // (If shown -> hides immediately; If hidden -> shows for 5s)
    if (zone === 'center') {
      if (tapTimeoutRef.current) {
        clearTimeout(tapTimeoutRef.current);
        tapTimeoutRef.current = null;
      }
      lastTapRef.current = { time: 0, side: 'left' };
      toggleControls();
      return;
    }

    // 2. DOUBLE-TAP SEEK CHECK (Left or Right zone):
    // If consecutive tap on same side within window (or while seek ripple is actively running):
    const isConsecutiveSeekTap =
      lastTapRef.current.side === zone &&
      (now - lastTapRef.current.time < DOUBLE_TAP_WINDOW ||
        (seekFeedbackRef.current && now - lastTapRef.current.time < 650));

    if (isConsecutiveSeekTap) {
      // Cancel pending single tap timeout so controls NEVER show!
      if (tapTimeoutRef.current) {
        clearTimeout(tapTimeoutRef.current);
        tapTimeoutRef.current = null;
      }

      // Hide all controls overlay immediately so screen remains 100% full
      hideControls();

      const delta = zone === 'left' ? -10 : 10;
      handleSkip(delta);

      setSeekFeedback((prev) => {
        const nextSeconds = prev && prev.side === zone ? prev.seconds + 10 : 10;
        return { side: zone, seconds: nextSeconds };
      });
      seekFeedbackRef.current = true;

      if (seekFeedbackTimeoutRef.current) {
        clearTimeout(seekFeedbackTimeoutRef.current);
      }
      seekFeedbackTimeoutRef.current = setTimeout(() => {
        setSeekFeedback(null);
        seekFeedbackRef.current = false;
        lastSeekEndTimeRef.current = Date.now();
        // Strict guarantee: controls stay completely hidden after seek ripple ends
        setIsControlsVisible(false);
        isControlsVisibleRef.current = false;
      }, 650);

      lastTapRef.current = { time: now, side: zone };
      return;
    }

    // 3. FIRST TAP ON LEFT OR RIGHT:
    // Wait for DOUBLE_TAP_WINDOW to distinguish single tap from double tap seek
    lastTapRef.current = { time: now, side: zone };
    if (tapTimeoutRef.current) {
      clearTimeout(tapTimeoutRef.current);
    }

    tapTimeoutRef.current = setTimeout(() => {
      // Single tap confirmed: toggle controls (re-click hides, click reveals for 5s)
      toggleControls();
      lastTapRef.current = { time: 0, side: zone };
      tapTimeoutRef.current = null;
    }, DOUBLE_TAP_WINDOW);
  }, [toggleControls, hideControls, showControlsForDuration, handleSkip]);

  const getZoneFromX = (clientX: number, target: HTMLElement): 'left' | 'center' | 'right' => {
    const rect = target.getBoundingClientRect();
    if (rect.width <= 0) return 'center';
    const relativeX = clientX - rect.left;
    const ratio = relativeX / rect.width;
    if (ratio < 0.35) return 'left';
    if (ratio > 0.65) return 'right';
    return 'center';
  };

  const handleSurfaceTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length === 1) {
      touchStartRef.current = {
        x: e.touches[0].clientX,
        y: e.touches[0].clientY,
        time: Date.now(),
      };
      startHold2xTimer(e.touches[0].clientX, e.currentTarget);
    }
  };

  const handleSurfaceTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    if (!touchStartRef.current || e.touches.length === 0) return;
    const dx = e.touches[0].clientX - touchStartRef.current.x;
    const dy = e.touches[0].clientY - touchStartRef.current.y;
    // Cancel 2x hold timer if finger moves significantly (e.g. scroll or drag)
    if (Math.hypot(dx, dy) > 12) {
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = null;
      }
    }
  };

  const handleSurfaceTouchEnd = (e: React.TouchEvent<HTMLDivElement>) => {
    const was2x = releaseHold2x();
    if (!touchStartRef.current || e.changedTouches.length === 0) return;
    const endX = e.changedTouches[0].clientX;
    const endY = e.changedTouches[0].clientY;
    const dx = endX - touchStartRef.current.x;
    const dy = endY - touchStartRef.current.y;
    const dur = Date.now() - touchStartRef.current.time;
    touchStartRef.current = null;

    // ALWAYS mark touch handled on any touch release so synthetic mouse clicks are reliably suppressed
    lastTouchHandledTimeRef.current = Date.now();

    // If this release was from a 2X hold or long press, do NOT trigger any tap
    if (was2x || dur >= 350) {
      return;
    }

    // Standard touch slop: allow up to 30px displacement for natural mobile touchscreen finger squish/roll
    if (Math.hypot(dx, dy) < 30) {
      const zone = getZoneFromX(endX, e.currentTarget);
      handleSurfaceTap(zone);
    }
  };

  const handleSurfaceMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.button !== 0) return; // Left mouse button only
    startHold2xTimer(e.clientX, e.currentTarget);
  };

  const handleSurfaceMouseUp = () => {
    releaseHold2x();
  };

  const handleSurfaceMouseLeave = () => {
    releaseHold2x();
  };

  const handleSurfaceClick = (e: React.MouseEvent<HTMLDivElement>) => {
    // If handled by touch within 1200ms or if just released 2x hold within 500ms, suppress synthetic click
    if (Date.now() - lastTouchHandledTimeRef.current < 1200 || Date.now() - last2xEndTimeRef.current < 500) {
      return;
    }
    const zone = getZoneFromX(e.clientX, e.currentTarget);
    handleSurfaceTap(zone);
  };

  // Screen Security & Focus Listener (Pause if student switches tab / minimises)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden && isPlaying) {
        handlePause();
        showNoticeWithDecay('Playback paused: Application focus lost.', 5000);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [isPlaying]);

  // Control Handlers
  const handleStartPlayback = () => {
    setIsBufferingOrStarting(true);
    showControlsForDuration(5000);
    safeCallPlayer((p) => {
      try {
        const state = p.getPlayerState ? p.getPlayerState() : -1;
        if (state === 5 || state === 2) {
          if (p.playVideo) p.playVideo();
        } else if (p.loadVideoById) {
          p.loadVideoById({
            videoId: safeVideoId,
            startSeconds: currentTime > 0 ? currentTime : (seekToSeconds || 0),
            suggestedQuality: 'hd1080',
          });
        } else if (p.playVideo) {
          p.playVideo();
        }
      } catch {
        if (p.playVideo) p.playVideo();
      }
      isPlayingRef.current = true;
      setIsPlaying(true);
      // Retain pre-playback poster curtain until onStateChange reports event.data === 1 (PLAYING)
      // so the user never sees YouTube's raw unstarted embed, channel avatar or native controls
      onPlayStateChangeRef.current?.(true);
    });
  };

  const handlePlay = () => {
    if (!hasEverPlayed) {
      handleStartPlayback();
      return;
    }
    safeCallPlayer((p) => {
      if (p.playVideo) {
        p.playVideo();
        isPlayingRef.current = true;
        setIsPlaying(true);
        onPlayStateChangeRef.current?.(true);
        showControlsForDuration(5000);
      }
    });
  };

  const handlePause = () => {
    safeCallPlayer((p) => {
      if (p.pauseVideo) {
        p.pauseVideo();
        isPlayingRef.current = false;
        setIsPlaying(false);
        onPlayStateChangeRef.current?.(false);
        if (controlsTimeoutRef.current) {
          clearTimeout(controlsTimeoutRef.current);
          controlsTimeoutRef.current = null;
        }
        setIsControlsVisible(true);
      }
    });
  };

  const togglePlay = () => {
    if (!hasEverPlayed) {
      handleStartPlayback();
      return;
    }
    if (isPlaying) {
      handlePause();
    } else {
      handlePlay();
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const targetTime = parseFloat(e.target.value);
    setCurrentTime(targetTime);
    lastTouchHandledTimeRef.current = Date.now();
    lastControlsRevealedAt.current = Date.now();
    showControlsForDuration(5000);
    safeCallPlayer((p) => {
      if (p.seekTo) {
        p.seekTo(targetTime, true);
      }
    });
  };

  const handleSpeedChange = (speed: number) => {
    setPlaybackSpeed(speed);
    safeCallPlayer((p) => {
      if (p.setPlaybackRate) {
        p.setPlaybackRate(speed);
      }
    });
    setOptionsMenuOpen(false);
  };

  // Video Quality Handler - YouTube-grade HD enforcement & instantaneous buffer refresh
  const handleQualityChange = (q: QualityOption) => {
    setCurrentQuality(q.label);
    selectedQualityRef.current = q.label;
    try {
      localStorage.setItem('elevate_video_quality', q.label);
    } catch {}

    safeCallPlayer((p) => {
      const qVal = q.value === 'default' ? 'hd1080' : q.value;
      if (q.value === 'default') {
        // Reset to automatic highest adaptive stream
        if (p.setPlaybackQualityRange) {
          p.setPlaybackQualityRange('hd1080', 'highres');
        }
        if (p.setPlaybackQuality) {
          p.setPlaybackQuality('highres');
        }
      } else {
        // Manually enforce selected target resolution
        if (p.setPlaybackQualityRange) {
          p.setPlaybackQualityRange(q.value, q.value);
        }
        if (p.setPlaybackQuality) {
          p.setPlaybackQuality(q.value);
        }
      }

      // Send postMessage directly to YouTube iframe to force DASH engine resolution update
      try {
        const iframe = containerRef.current?.querySelector('iframe');
        if (iframe?.contentWindow) {
          iframe.contentWindow.postMessage(JSON.stringify({
            event: 'command',
            func: 'setPlaybackQuality',
            args: [qVal]
          }), '*');
          iframe.contentWindow.postMessage(JSON.stringify({
            event: 'command',
            func: 'setPlaybackQualityRange',
            args: [qVal, q.value === 'default' ? 'highres' : qVal]
          }), '*');
        }
      } catch {}

      // Trigger YouTube DASH engine to flush buffer and re-fetch chunks immediately in new quality
      if (p.getCurrentTime && p.seekTo) {
        const curr = p.getCurrentTime();
        if (curr > 0) {
          p.seekTo(curr, true);
        }
      }
    });

    setOptionsMenuOpen(false);
    setSecurityNotice(q.label === 'Auto (Best Quality)' ? 'Quality: Auto (Best Available)' : `Quality: ${q.label}`);
    setTimeout(() => setSecurityNotice(null), 2500);
  };

  // Captions / Subtitles Toggle Handler
  const toggleCaptions = () => {
    const nextState = !captionsEnabled;
    setCaptionsEnabled(nextState);

    safeCallPlayer((p) => {
      if (nextState) {
        if (p.loadModule) {
          p.loadModule('captions');
        }
        if (p.setOption) {
          p.setOption('captions', 'track', { languageCode: 'en' });
          p.setOption('captions', 'reload', true);
        }
      } else {
        if (p.unloadModule) {
          p.unloadModule('captions');
        }
        if (p.setOption) {
          p.setOption('captions', 'track', {});
        }
      }
    });

    showNoticeWithDecay(nextState ? 'Subtitles / Captions Enabled' : 'Subtitles Disabled', 5000);
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseInt(e.target.value, 10);
    setVolume(val);
    safeCallPlayer((p) => {
      if (p.setVolume) {
        p.setVolume(val);
        if (val === 0) {
          setIsMuted(true);
          p.mute?.();
        } else if (isMuted) {
          setIsMuted(false);
          p.unMute?.();
        }
      }
    });
  };

  const toggleMute = () => {
    safeCallPlayer((p) => {
      if (isMuted) {
        p.unMute?.();
        setIsMuted(false);
        p.setVolume?.(volume || 50);
      } else {
        p.mute?.();
        setIsMuted(true);
      }
    });
  };

  // Fullscreen & Screen Orientation Management (Auto landscape in fullscreen)
  useEffect(() => {
    const handleFullscreenChange = () => {
      const isNowFullscreen = !!(
        document.fullscreenElement ||
        (document as any).webkitFullscreenElement ||
        (document as any).mozFullScreenElement ||
        (document as any).msFullscreenElement
      );
      setIsFullscreen(isNowFullscreen);

      if (!isNowFullscreen) {
        // When exiting fullscreen, restore original orientation and status bar
        unlockOrientationPortrait().catch(() => {});
        showNativeStatusBar();
        try {
          if (screen.orientation && typeof (screen.orientation as any).unlock === 'function') {
            (screen.orientation as any).unlock();
          } else if ((screen as any).unlockOrientation) {
            (screen as any).unlockOrientation();
          }
        } catch (e) {
          // Ignore unlock errors
        }
      } else {
        lockOrientationLandscape().catch(() => {});
        hideNativeStatusBar();
      }
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
    document.addEventListener('mozfullscreenchange', handleFullscreenChange);
    document.addEventListener('MSFullscreenChange', handleFullscreenChange);

    return () => {
      unlockOrientationPortrait().catch(() => {});
      showNativeStatusBar();
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
      document.removeEventListener('mozfullscreenchange', handleFullscreenChange);
      document.removeEventListener('MSFullscreenChange', handleFullscreenChange);
    };
  }, []);

  const toggleFullscreen = async () => {
    if (!containerRef.current) return;

    const el = containerRef.current as any;
    const isCurrentlyFullscreen = !!(
      document.fullscreenElement ||
      (document as any).webkitFullscreenElement ||
      (document as any).mozFullScreenElement ||
      (document as any).msFullscreenElement ||
      isFullscreen
    );

    try {
      if (!isCurrentlyFullscreen) {
        // Request fullscreen on container
        if (el.requestFullscreen) {
          await el.requestFullscreen().catch(() => {});
        } else if (el.webkitRequestFullscreen) {
          await el.webkitRequestFullscreen().catch(() => {});
        } else if (el.mozRequestFullScreen) {
          await el.mozRequestFullScreen().catch(() => {});
        } else if (el.msRequestFullscreen) {
          await el.msRequestFullscreen().catch(() => {});
        }

        setIsFullscreen(true);
        hideNativeStatusBar();
        await lockOrientationLandscape();

        // Lock screen to landscape in full screen
        try {
          if (screen.orientation && typeof (screen.orientation as any).lock === 'function') {
            await (screen.orientation as any).lock('landscape').catch(async () => {
              await (screen.orientation as any).lock('landscape-primary').catch(() => {});
            });
          } else if ((screen as any).lockOrientation) {
            (screen as any).lockOrientation('landscape');
          } else if ((screen as any).mozLockOrientation) {
            (screen as any).mozLockOrientation('landscape');
          } else if ((screen as any).msLockOrientation) {
            (screen as any).msLockOrientation('landscape');
          }
        } catch (err) {
          console.debug('Screen orientation lock error/unsupported:', err);
        }
      } else {
        // Exit fullscreen
        await unlockOrientationPortrait();
        showNativeStatusBar();
        try {
          if (screen.orientation && typeof (screen.orientation as any).unlock === 'function') {
            (screen.orientation as any).unlock();
          } else if ((screen as any).unlockOrientation) {
            (screen as any).unlockOrientation();
          }
        } catch (e) {}

        if (document.exitFullscreen) {
          await document.exitFullscreen().catch(() => {});
        } else if ((document as any).webkitExitFullscreen) {
          await (document as any).webkitExitFullscreen().catch(() => {});
        } else if ((document as any).mozCancelFullScreen) {
          await (document as any).mozCancelFullScreen().catch(() => {});
        } else if ((document as any).msExitFullscreen) {
          await (document as any).msExitFullscreen().catch(() => {});
        }

        setIsFullscreen(false);
      }
    } catch (err) {
      console.error('Error toggling fullscreen:', err);
    }
  };

  // Top Priority Back Navigation Stack: When in fullscreen, any back gesture/mouse button MUST exit fullscreen first
  useBackHandler({
    isOpen: isFullscreen,
    priority: 100,
    id: `cloaked_video_fs_${lectureId || encryptedVideoId || 'active'}`,
    onBack: () => {
      toggleFullscreen();
    },
  });

  // Safety Guard: if component transitions to mini mode while still in fullscreen, exit immediately
  useEffect(() => {
    if (isMini && (isFullscreen || isBrowserFullscreen())) {
      exitBrowserFullscreen();
      unlockOrientationPortrait().catch(() => {});
      showNativeStatusBar();
      setIsFullscreen(false);
    }
  }, [isMini, isFullscreen]);

  // Safety Guard: On unmount, ensure browser is not left trapped in fullscreen and orientation is unlocked
  useEffect(() => {
    return () => {
      if (isBrowserFullscreen()) {
        exitBrowserFullscreen();
      }
      unlockOrientationPortrait().catch(() => {});
      showNativeStatusBar();
    };
  }, []);

  // Reveal controls on desktop mouse movement if currently hidden (suppressed on mobile/touch, 2X speed, or double-tap seek)
  const handleMouseMove = () => {
    // Only execute on devices with a real mouse / hover capability (never on mobile touchscreens)
    if (typeof window !== 'undefined' && window.matchMedia && !window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
      return;
    }
    if (is2xSpeedActiveRef.current || seekFeedbackRef.current || Date.now() - lastSeekEndTimeRef.current < 800) return;
    if (!isControlsVisibleRef.current && !isHoveringControlsRef.current) {
      showControlsForDuration(5000);
    }
  };

  // Keyboard Shortcuts for enterprise player navigation (Space, J/K/L, Arrows, F, M)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // If user is focused on an input or textarea, don't intercept
      const activeEl = document.activeElement;
      if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || (activeEl as HTMLElement).isContentEditable)) {
        return;
      }

      if (e.code === 'Space' || e.key === 'k' || e.key === 'K') {
        e.preventDefault();
        togglePlay();
      } else if (e.key === 'ArrowLeft' || e.key === 'j' || e.key === 'J') {
        e.preventDefault();
        handleSkip(-10);
        showNoticeWithDecay('Rewind 10s', 2000);
      } else if (e.key === 'ArrowRight' || e.key === 'l' || e.key === 'L') {
        e.preventDefault();
        handleSkip(10);
        showNoticeWithDecay('Skip 10s', 2000);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setVolume((prev) => {
          const next = Math.min(100, prev + 10);
          safeCallPlayer((p) => {
            if (p.setVolume) p.setVolume(next);
            if (isMuted) {
              setIsMuted(false);
              p.unMute?.();
            }
          });
          return next;
        });
        showNoticeWithDecay('Volume Up', 2000);
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setVolume((prev) => {
          const next = Math.max(0, prev - 10);
          safeCallPlayer((p) => {
            if (p.setVolume) p.setVolume(next);
          });
          return next;
        });
        showNoticeWithDecay('Volume Down', 2000);
      } else if (e.key === 'f' || e.key === 'F') {
        e.preventDefault();
        toggleFullscreen();
      } else if (e.key === 'm' || e.key === 'M') {
        e.preventDefault();
        toggleMute();
        showNoticeWithDecay(isMuted ? 'Audio Unmuted' : 'Audio Muted', 2000);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [togglePlay, handleSkip, toggleFullscreen, toggleMute, isMuted, showNoticeWithDecay]);

  // Native Android PiP RemoteAction Play/Pause listener
  useEffect(() => {
    const handleNativePipToggle = () => {
      togglePlay();
    };
    window.addEventListener('nativePipTogglePlayPause', handleNativePipToggle);
    return () => window.removeEventListener('nativePipTogglePlayPause', handleNativePipToggle);
  }, [togglePlay]);

  const availableSpeeds = [0.75, 1, 1.25, 1.5, 1.75, 2];

  // Persistent Single-Instance YouTube Engine (DOM element & iframe NEVER unmount during mini/expanded transitions)
  return (
    <div
      ref={containerRef}
      onMouseMove={isMini ? undefined : handleMouseMove}
      style={{
        WebkitFontSmoothing: 'antialiased',
        touchAction: 'manipulation',
      }}
      className={`relative w-full bg-black overflow-hidden border-none select-none transition-all duration-200 ${
        isInNativePip
          ? '!fixed !inset-0 !z-[9999999] !w-screen !h-screen !rounded-none flex items-center justify-center'
          : isFullscreen
            ? 'h-full w-full aspect-auto rounded-none flex items-center justify-center'
            : isMini
              ? 'h-full w-full rounded-none'
              : 'w-full h-full aspect-video rounded-none lg:rounded-3xl shadow-none group'
      }`}
    >
      {/* 1. HD Scaled YouTube Iframe Engine (Adapts cleanly to UI & device width without artificial zoom distortion) */}
      {authStatus === 'authorized' && (
        <div className="absolute inset-0 w-full h-full overflow-hidden pointer-events-none flex items-center justify-center select-none bg-black">
          <div
            className="relative pointer-events-none flex items-center justify-center w-full h-full"
            style={{
              width: '100%',
              height: '100%',
              minWidth: '100%',
              minHeight: '100%',
              transform: 'none',
              transformOrigin: 'center center',
            }}
          >
            <div
              id={playerContainerId.current}
              className="w-full h-full pointer-events-none [&>iframe]:w-full [&>iframe]:h-full [&>iframe]:pointer-events-none [&_iframe]:pointer-events-none"
            />
          </div>
        </div>
      )}

      {/* 1a. Miniplayer Paused / Pre-playback Clean Poster Cover (Completely eliminates YouTube's paused title bleed, avatar, and native huge play icon) */}
      {isMini && !isFullscreen && authStatus === 'authorized' && (!isPlaying || !hasEverPlayed) && (
        <div className="absolute inset-0 z-20 bg-black flex items-center justify-center overflow-hidden pointer-events-none">
          {activePosterImage ? (
            <img
              src={activePosterImage}
              alt={title}
              onError={(e) => {
                e.currentTarget.src = '/assets/default-course-banner.png';
              }}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full bg-slate-900 flex items-center justify-center">
              <span className="text-[10px] text-slate-400 font-bold">{title.slice(0, 1)}</span>
            </div>
          )}
        </div>
      )}




      {/* 1d. Forensic Dynamic Moving Watermark Overlay (100% Transparent, Ultra-Smooth Continuous Glide, 0 Distraction) */}
      {securitySettings?.enableDynamicWatermark !== false && (
        <div
          id="cloaked-player-dynamic-watermark"
          className={`absolute pointer-events-none select-none z-35 font-medium tabular-nums text-white/30 drop-shadow-[0_1px_2px_rgba(0,0,0,0.85)] flex flex-col items-center text-center leading-tight tracking-wider scale-85 sm:scale-100 ${
            isMini && !isFullscreen ? 'scale-70 origin-top-left' : ''
          }`}
          style={{
            top: `${watermarkPos.top}%`,
            left: `${watermarkPos.left}%`,
            transform: 'translate(-50%, -50%)',
            transition: 'top 8500ms cubic-bezier(0.4, 0, 0.2, 1), left 8500ms cubic-bezier(0.4, 0, 0.2, 1)',
            willChange: 'top, left',
          }}
        >
          <span className="text-[8.5px] sm:text-[11px] font-bold tracking-wider text-white/35">
            {user?.name || 'Elevate Student'}
          </span>
          <span className="text-[7.5px] sm:text-[9.5px] font-medium tracking-wide text-white/30">
            {user?.email || user?.phone || `UID: ${user?.id ? user.id.slice(0, 8).toUpperCase() : 'STUDENT'}`}
          </span>
          <span className="text-[6.5px] sm:text-[8.5px] tracking-widest uppercase text-white/25">
            ID: {playbackToken?.token ? playbackToken.token.slice(0, 8).toUpperCase() : (user?.id ? user.id.slice(0, 8).toUpperCase() : 'SECURE')}
          </span>
        </div>
      )}

      {(!isMini || isFullscreen) && (
        <>



      {/* 1e. Snipping Tool / Screen Recording Focus Loss Blackout Shield */}
      {isWindowObscured && securitySettings?.enableDrmScreenProtection && isPlaying && (
        <div className="absolute inset-0 z-45 bg-black/95 backdrop-blur-2xl flex flex-col items-center justify-center p-6 text-center text-white select-none animate-in fade-in duration-200">
          <div className="w-14 h-14 rounded-full bg-amber-500/20 text-amber-400 flex items-center justify-center mb-3 ring-4 ring-amber-500/10">
            <ShieldAlert className="w-7 h-7" />
          </div>
          <h3 className="text-sm sm:text-base font-bold text-white mb-1">
            Protected Lecture Stream
          </h3>
          <p className="text-[11px] text-slate-300 max-w-xs mb-3 leading-relaxed">
            Screen capture utility or background window detected. Click or return focus to this window to resume playback.
          </p>
          <div className="flex items-center space-x-2 text-[9px] font-medium text-amber-400/90 bg-amber-950/60 px-3 py-1 rounded-full border border-amber-500/30">
            <span>DRM Shield Active</span>
            <span>•</span>
            <span>Anti-Piracy Enforcement</span>
          </div>
        </div>
      )}

      {/* 1f. Network Security Shield: Anti-Proxy / VPN Detection */}
      {isProxyVpnDetected && (
        <div className="absolute inset-0 z-50 bg-black/95 backdrop-blur-2xl flex flex-col items-center justify-center p-6 text-center text-white select-none animate-in fade-in duration-200">
          <div className="w-16 h-16 rounded-2xl bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center justify-center mb-4 ring-4 ring-amber-500/10">
            <ShieldAlert className="w-8 h-8" />
          </div>
          <h3 className="text-base sm:text-lg font-bold text-white mb-2">
            Network Security Protection
          </h3>
          <p className="text-xs sm:text-sm text-slate-300 max-w-sm mb-4 leading-relaxed">
            An active proxy, VPN, or network inspection tool was detected. To protect proprietary course content, video playback and data streaming are paused while network interceptors are active.
          </p>
          <div className="flex items-center space-x-2 text-[10px] font-medium text-amber-400/90 bg-amber-950/60 px-3 py-1.5 rounded-full border border-amber-500/30 mb-5">
            <span>Anti-Inspection Shield</span>
            <span>•</span>
            <span>Disconnect Proxy or VPN to Continue</span>
          </div>
          <button
            onClick={() => {
              const active = Boolean((window as any).__ELEVATE_NETWORK_SECURITY?.isProxyOrVpnActive);
              setIsProxyVpnDetected(active);
              if (!active) {
                showNoticeWithDecay('Network verified. Resuming stream...', 3000);
              }
            }}
            className="px-5 py-2.5 rounded-xl bg-white text-black font-semibold text-xs sm:text-sm hover:bg-zinc-200 active:scale-95 transition-all shadow-md"
          >
            Check & Resume
          </button>
        </div>
      )}

      {/* 1c. Access Denied (403 Forbidden) Theft Deterrent Screen */}
      {authStatus === 'denied' && (
        <div className="absolute inset-0 z-40 bg-slate-950 flex flex-col items-center justify-center p-6 text-center text-white select-none">
          <div className="w-16 h-16 rounded-full bg-red-500/20 text-red-400 flex items-center justify-center mb-3">
            <Lock className="w-8 h-8" />
          </div>
          <h3 className="text-base sm:text-lg font-bold text-red-400 mb-1">Batch Access Required</h3>
          <p className="text-xs text-slate-300 max-w-sm mb-4 leading-relaxed">
            {authError || 'Your account is not enrolled in this batch. Content theft prevention is active.'}
          </p>
          <span className="text-[10px] font-medium tabular-nums text-slate-400 bg-slate-900 px-3 py-1 rounded-full border border-slate-800">
            HTTP 403 Forbidden (Anti-Piracy Gateway)
          </span>
        </div>
      )}

      {/* 1d. Active DevTools / Screen Inspection Detected Overlay */}
      {isDevToolsOpen && (
        <div className="absolute inset-0 z-50 bg-black/98 backdrop-blur-md flex flex-col items-center justify-center p-6 text-center text-white select-none animate-in fade-in">
          <div className="w-16 h-16 rounded-full bg-red-500/20 text-red-400 flex items-center justify-center mb-3 shadow-lg">
            <ShieldAlert className="w-8 h-8" />
          </div>
          <h3 className="text-base sm:text-lg font-bold text-red-400 mb-1">Developer Tools / Screen Inspection Detected</h3>
          <p className="text-xs text-slate-300 max-w-sm mb-4 leading-relaxed">
            Video playback and streaming are securely halted to protect educator copyright. Please close Developer Tools or inspection windows to resume watching.
          </p>
          <div className="flex items-center space-x-2 text-[10px] font-medium text-slate-300 bg-slate-900/90 px-3 py-1 rounded-full border border-slate-800 mb-4">
            <span>Security Shield: Active</span>
          </div>

          <button
            onClick={() => setIsDevToolsOpen(false)}
            className="px-5 py-2 rounded-full bg-[var(--md-sys-color-primary)] text-[var(--md-sys-color-on-primary)] text-xs font-bold shadow-lg hover:opacity-95 active:scale-95 transition border-none cursor-pointer"
          >
            Dismiss & Resume Playback
          </button>
        </div>
      )}

      {/* 2. Full-Screen Gestures: Double-Tap Seek (±10s/±20s/±30s) & Hold for 2X Speed Surface */}
      <div
        onTouchStart={handleSurfaceTouchStart}
        onTouchMove={handleSurfaceTouchMove}
        onTouchEnd={handleSurfaceTouchEnd}
        onTouchCancel={handleSurfaceTouchEnd}
        onMouseDown={handleSurfaceMouseDown}
        onMouseUp={handleSurfaceMouseUp}
        onMouseLeave={handleSurfaceMouseLeave}
        onClick={handleSurfaceClick}
        className="absolute inset-0 z-20 flex select-none cursor-pointer bg-transparent pointer-events-auto"
        style={{ touchAction: 'manipulation' }}
      >
        {/* Left 35%: double-tap rewind feedback (Ringless Minimal Modern UI) */}
        <div className="relative w-[35%] h-full flex items-center justify-center pointer-events-none overflow-hidden">
          {seekFeedback?.side === 'left' && (
            <>
              {/* YouTube-style soft side ripple without harsh rings */}
              <div className="absolute inset-y-0 left-0 w-full bg-white/10 rounded-r-full animate-in fade-in duration-150" />
              <div className="relative flex flex-col items-center justify-center select-none animate-in fade-in zoom-in-90 duration-150">
                <div className="flex items-center text-white drop-shadow-sm">
                  <ChevronLeft className="w-8 h-8 stroke-[2.5] -mr-3.5 animate-pulse" />
                  <ChevronLeft className="w-8 h-8 stroke-[2.5] -mr-3.5 animate-pulse [animation-delay:100ms]" />
                  <ChevronLeft className="w-8 h-8 stroke-[2.5] animate-pulse [animation-delay:200ms]" />
                </div>
                <span className="mt-2 text-xs sm:text-sm font-medium text-white tracking-wide drop-shadow-sm">
                  {seekFeedback.seconds} seconds
                </span>
              </div>
            </>
          )}
        </div>

        {/* Center 30%: direct tap to toggle */}
        <div className="relative w-[30%] h-full pointer-events-none" />

        {/* Right 35%: double-tap forward feedback (Ringless Minimal Modern UI) */}
        <div className="relative w-[35%] h-full flex items-center justify-center pointer-events-none overflow-hidden">
          {seekFeedback?.side === 'right' && (
            <>
              {/* YouTube-style soft side ripple without harsh rings */}
              <div className="absolute inset-y-0 right-0 w-full bg-white/10 rounded-l-full animate-in fade-in duration-150" />
              <div className="relative flex flex-col items-center justify-center select-none animate-in fade-in zoom-in-90 duration-150">
                <div className="flex items-center text-white drop-shadow-sm">
                  <ChevronRight className="w-8 h-8 stroke-[2.5] animate-pulse [animation-delay:200ms]" />
                  <ChevronRight className="w-8 h-8 stroke-[2.5] -ml-3.5 animate-pulse [animation-delay:100ms]" />
                  <ChevronRight className="w-8 h-8 stroke-[2.5] -ml-3.5 animate-pulse" />
                </div>
                <span className="mt-2 text-xs sm:text-sm font-medium text-white tracking-wide drop-shadow-sm">
                  {seekFeedback.seconds} seconds
                </span>
              </div>
            </>
          )}
        </div>
      </div>

      {/* 2b. 2X Speed Floating Indicator (Ringless Minimal Modern UI) */}
      {is2xSpeedActive && (
        <div className="absolute top-4 left-1/2 transform -translate-x-1/2 z-40 bg-black/80 text-white text-xs sm:text-sm font-medium px-4 py-1.5 rounded-full border border-white/10 flex items-center space-x-2 shadow-none animate-in fade-in zoom-in-95 duration-150 pointer-events-none select-none">
          <FastForward className="w-4 h-4 text-amber-400 fill-current animate-pulse" />
          <span className="tracking-wide">2X Speed</span>
        </div>
      )}

      {/* 3. Top Header Bar (Minimize Button & Video Title) */}
      {(!isMini || isFullscreen) && !isInNativePip && (
        <div
          onClick={(e) => e.stopPropagation()}
          className={`absolute top-0 inset-x-0 z-30 px-3 pt-3 pb-8 sm:px-5 sm:pt-4 sm:pb-10 bg-gradient-to-b from-black/75 via-black/35 to-transparent flex items-center justify-between gap-3 transition-opacity duration-300 ${
            !is2xSpeedActive && !seekFeedback && isControlsVisible ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
          }`}
        >
          <div className="flex items-center gap-2.5 min-w-0 flex-1">
            {onMinimize && !isFullscreen && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onMinimize();
                }}
                className="w-9 h-9 rounded-full bg-black/60 hover:bg-black/80 active:scale-95 text-white flex items-center justify-center backdrop-blur-md transition border border-white/10 cursor-pointer shadow-none select-none shrink-0"
                title="Minimize to MiniPlayer"
                aria-label="Minimize to MiniPlayer"
              >
                <ChevronDown className="w-5 h-5 stroke-[2.5]" />
              </button>
            )}
          </div>
        </div>
      )}

      {/* 4. Center Play/Pause Floating Control (YouTube frame handles its own native loading effect) */}
      {!is2xSpeedActive && !seekFeedback && isControlsVisible && !isBufferingOrStarting && isPlayerReady && authStatus === 'authorized' && (
        <div
          className="absolute inset-0 z-22 flex items-center justify-center pointer-events-none bg-transparent"
        >
          <button
            type="button"
              onClick={(e) => {
                e.stopPropagation();
                // Prevent synthetic delayed click from firing togglePlay if touch just occurred
                if (Date.now() - lastTouchHandledTimeRef.current < 600) {
                  return;
                }
                togglePlay();
                showControlsForDuration(5000);
              }}
              onTouchStart={(e) => {
                e.stopPropagation();
                lastTouchHandledTimeRef.current = Date.now();
                lastControlsRevealedAt.current = Date.now();
                showControlsForDuration(5000);
              }}
              onTouchEnd={(e) => {
                e.stopPropagation();
                lastTouchHandledTimeRef.current = Date.now();
                lastControlsRevealedAt.current = Date.now();
                togglePlay();
                showControlsForDuration(5000);
              }}
              onMouseDown={(e) => {
                e.stopPropagation();
              }}
              className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-zinc-950/95 text-white flex items-center justify-center border border-white/10 hover:border-white/25 hover:scale-105 active:scale-95 transition-all duration-150 cursor-pointer pointer-events-auto shadow-none"
              title={isPlaying ? 'Pause (Space)' : 'Play (Space)'}
            >
              {isPlaying ? (
                <Pause className="w-7 h-7 sm:w-8 sm:h-8 fill-current" />
              ) : (
                <Play className="w-7 h-7 sm:w-8 sm:h-8 fill-current ml-1" />
              )}
            </button>
        </div>
      )}

      {/* 5. Status Toast Notification */}
      {securityNotice && (
        <div className="absolute top-16 left-1/2 transform -translate-x-1/2 z-40 bg-[var(--md-sys-color-inverse-surface)] text-[var(--md-sys-color-inverse-on-surface)] font-semibold px-4 py-2 rounded-full shadow-2xl flex items-center space-x-2 text-xs animate-in fade-in zoom-in-95 border-none">
          <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
          <span>{securityNotice}</span>
        </div>
      )}

      {/* 6. CUSTOM BOTTOM CONTROL BAR */}
      <div
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
        onTouchStart={(e) => {
          e.stopPropagation();
          lastTouchHandledTimeRef.current = Date.now();
          lastControlsRevealedAt.current = Date.now();
          if (isPlayingRef.current) {
            showControlsForDuration(5000);
          }
        }}
        onTouchMove={(e) => {
          e.stopPropagation();
          lastTouchHandledTimeRef.current = Date.now();
        }}
        onTouchEnd={(e) => {
          e.stopPropagation();
          lastTouchHandledTimeRef.current = Date.now();
          if (isPlayingRef.current) {
            showControlsForDuration(5000);
          }
        }}
        onMouseEnter={() => {
          if (typeof window !== 'undefined' && window.matchMedia && !window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
            return;
          }
          setIsHoveringControls(true);
          isHoveringControlsRef.current = true;
          setIsControlsVisible(true);
          isControlsVisibleRef.current = true;
          if (controlsTimeoutRef.current) {
            clearTimeout(controlsTimeoutRef.current);
            controlsTimeoutRef.current = null;
          }
        }}
        onMouseLeave={() => {
          if (typeof window !== 'undefined' && window.matchMedia && !window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
            return;
          }
          setIsHoveringControls(false);
          isHoveringControlsRef.current = false;
          if (isPlayingRef.current) {
            showControlsForDuration(5000);
          }
        }}
        className={`absolute bottom-0 inset-x-0 z-30 px-4 sm:px-6 pt-8 sm:pt-10 pb-3 sm:pb-3.5 bg-gradient-to-t from-black/85 via-black/40 to-transparent transition-opacity duration-300 flex flex-col space-y-1 ${
          !isInNativePip && !is2xSpeedActive && !seekFeedback && (isControlsVisible || optionsMenuOpen) ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
      >
        {/* TIMELINE MILESTONES (Topic Breakpoints) STRIP */}
        {milestones && milestones.length > 0 && (
          <div
            onClick={(e) => e.stopPropagation()}
            className={`${isFullscreen ? 'flex' : 'hidden sm:flex'} items-center space-x-1.5 overflow-x-auto pb-1 scrollbar-none`}
          >
            {milestones.map((m) => {
              const isPassed = currentTime >= m.seconds;
              return (
                <button
                  key={m.id}
                  onClick={(e) => {
                    e.stopPropagation();
                    safeCallPlayer((p) => {
                      if (p.seekTo) {
                        p.seekTo(m.seconds, true);
                        p.playVideo?.();
                        isPlayingRef.current = true;
                        setIsPlaying(true);
                        onPlayStateChangeRef.current?.(true);
                        setCurrentTime(m.seconds);
                      }
                    });
                  }}
                  className={`px-2.5 py-1 rounded-full text-[10px] font-bold whitespace-nowrap transition flex items-center space-x-1 border-none outline-none cursor-pointer ${
                    isPassed
                      ? 'bg-[var(--md-sys-color-secondary-container)] text-[var(--md-sys-color-on-secondary-container)]'
                      : 'bg-white/15 text-slate-300 hover:bg-white/25'
                  }`}
                >
                  <Flag className="w-2.5 h-2.5" />
                  <span>{m.title}</span>
                  <span className="font-mono text-[9px] opacity-75">({formatDuration(m.seconds)})</span>
                </button>
              );
            })}
          </div>
        )}

        {/* Scroller / Progress Bar Track (Streaming Line) with Milestone Markers */}
        <div
          onClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          onTouchStart={(e) => {
            e.stopPropagation();
            lastTouchHandledTimeRef.current = Date.now();
            lastControlsRevealedAt.current = Date.now();
            showControlsForDuration(5000);
          }}
          onTouchMove={(e) => {
            e.stopPropagation();
            lastTouchHandledTimeRef.current = Date.now();
            showControlsForDuration(5000);
          }}
          onTouchEnd={(e) => {
            e.stopPropagation();
            lastTouchHandledTimeRef.current = Date.now();
            showControlsForDuration(5000);
          }}
          className="relative py-2 flex items-center cursor-pointer group/scrub"
        >
          <input
            type="range"
            min="0"
            max={duration || 100}
            step="0.5"
            value={currentTime}
            onChange={handleSeek}
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            onTouchStart={(e) => {
              e.stopPropagation();
              lastTouchHandledTimeRef.current = Date.now();
              lastControlsRevealedAt.current = Date.now();
              showControlsForDuration(5000);
            }}
            onTouchMove={(e) => {
              e.stopPropagation();
              lastTouchHandledTimeRef.current = Date.now();
              showControlsForDuration(5000);
            }}
            onTouchEnd={(e) => {
              e.stopPropagation();
              lastTouchHandledTimeRef.current = Date.now();
              showControlsForDuration(5000);
            }}
            style={{
              background: `linear-gradient(to right, #0b57d0 0%, #0b57d0 ${
                duration > 0 ? Math.min(100, Math.max(0, (currentTime / duration) * 100)) : 0
              }%, rgba(255, 255, 255, 0.28) ${
                duration > 0 ? Math.min(100, Math.max(0, (currentTime / duration) * 100)) : 0
              }%, rgba(255, 255, 255, 0.28) 100%)`,
            }}
            className="w-full h-1.5 rounded-lg appearance-none cursor-pointer accent-[#0b57d0] hover:h-2.5 transition-all relative z-10"
          />

          {/* Notch dots for milestones along the timeline */}
          {duration > 0 &&
            milestones.map((m) => {
              const leftPercent = Math.min(100, Math.max(0, (m.seconds / duration) * 100));
              return (
                <div
                  key={m.id}
                  style={{ left: `${leftPercent}%` }}
                  title={`${m.title} (${formatDuration(m.seconds)})`}
                  className="absolute top-1/2 -translate-y-1/2 w-1 h-2 bg-amber-300/90 rounded-full pointer-events-none z-20 shadow-xs"
                />
              );
            })}
        </div>

        {/* Action Controls Row */}
        <div
          onClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          className="relative flex items-center justify-between text-white pt-1"
        >
          {/* Left Controls: Play, Skip (Desktop), Volume & Slider, Time */}
          <div className="flex items-center space-x-1 sm:space-x-2 pl-2 sm:pl-0">
            <button
              onClick={(e) => {
                e.stopPropagation();
                togglePlay();
              }}
              className="p-1.5 sm:p-2 rounded-full hover:bg-white/15 active:scale-90 transition border-none outline-none cursor-pointer"
              title={isPlaying ? 'Pause (Space)' : 'Play (Space)'}
            >
              {isPlaying ? <Pause className="w-5 h-5 fill-current" /> : <Play className="w-5 h-5 fill-current" />}
            </button>

            {/* Desktop-only 10s skip buttons (on mobile, double-tap is used so buttons don't get cut) */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleSkip(-10);
              }}
              className="hidden sm:inline-flex p-2 rounded-full hover:bg-white/15 active:scale-90 transition text-slate-300 hover:text-white border-none outline-none cursor-pointer"
              title="Rewind 10s"
            >
              <RotateCcw className="w-4 h-4" />
            </button>

            <button
              onClick={(e) => {
                e.stopPropagation();
                handleSkip(10);
              }}
              className="hidden sm:inline-flex p-2 rounded-full hover:bg-white/15 active:scale-90 transition text-slate-300 hover:text-white border-none outline-none cursor-pointer"
              title="Skip 10s"
            >
              <RotateCw className="w-4 h-4" />
            </button>

            {/* Volume Button & Expandable Slider */}
            <div
              onClick={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
              className="relative flex items-center"
            >
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setIsVolumeSliderOpen((prev) => !prev);
                }}
                className="p-1.5 sm:p-2 rounded-full hover:bg-white/15 text-slate-300 hover:text-white transition border-none outline-none cursor-pointer"
                title="Toggle Volume Slider"
              >
                {isMuted || volume === 0 ? (
                  <VolumeX className="w-4 h-4 sm:w-4.5 sm:h-4.5 text-red-400" />
                ) : (
                  <Volume2 className="w-4 h-4 sm:w-4.5 sm:h-4.5" />
                )}
              </button>

              {/* Volume Slider: Smoothly appears when clicked */}
              {isVolumeSliderOpen && (
                <div className="flex items-center space-x-1.5 bg-black/85 backdrop-blur-md px-2 py-1 rounded-full animate-in fade-in zoom-in-95 border border-white/10 shadow-none ml-0.5">
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={isMuted ? 0 : volume}
                    onChange={handleVolumeChange}
                    onClick={(e) => e.stopPropagation()}
                    onMouseDown={(e) => e.stopPropagation()}
                    style={{
                      background: `linear-gradient(to right, #0b57d0 0%, #0b57d0 ${isMuted ? 0 : volume}%, rgba(255, 255, 255, 0.28) ${isMuted ? 0 : volume}%, rgba(255, 255, 255, 0.28) 100%)`,
                    }}
                    className="w-14 sm:w-20 h-1 rounded-lg appearance-none cursor-pointer accent-[#0b57d0]"
                  />
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleMute();
                    }}
                    className="text-[10px] font-semibold tabular-nums text-slate-300 hover:text-white bg-transparent border-none cursor-pointer px-1"
                  >
                    {isMuted ? '0%' : `${volume}%`}
                  </button>
                </div>
              )}
            </div>

            {/* Time Stamp */}
            <div
              onClick={(e) => e.stopPropagation()}
              className="text-[10.5px] sm:text-xs font-semibold tabular-nums text-slate-300 select-none px-1 cursor-default whitespace-nowrap"
            >
              <span>{formatDuration(currentTime)}</span>
              <span className="mx-1 text-slate-500">/</span>
              <span>{formatDuration(duration)}</span>
            </div>
          </div>

          {/* Right Controls: Captions (CC), Settings Menu & Fullscreen */}
          <div
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            className="flex items-center space-x-1.5 sm:space-x-2 pr-2 sm:pr-0"
          >
            {/* Captions (CC) Button - Direct 1-tap toggle on control bar */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                toggleCaptions();
              }}
              className={`px-2 py-1 rounded-lg transition border-none outline-none cursor-pointer flex items-center justify-center font-bold text-xs select-none ${
                captionsEnabled
                  ? 'bg-white text-black shadow-none'
                  : 'hover:bg-white/15 text-slate-300 hover:text-white'
              }`}
              title={captionsEnabled ? 'Turn off captions (c)' : 'Turn on captions (c)'}
            >
              <span className="tracking-tighter font-mono text-[11px] sm:text-xs">CC</span>
            </button>

            {/* Unified Option / Settings Button */}
            <div className="relative" onClick={(e) => e.stopPropagation()}>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setOptionsMenuOpen((prev) => !prev);
                  setOptionsView('main');
                }}
                className={`p-1.5 sm:p-2 rounded-full transition border-none outline-none cursor-pointer ${
                  optionsMenuOpen
                    ? 'bg-white/25 text-white'
                    : 'hover:bg-white/15 text-slate-300 hover:text-white'
                }`}
                title="Options (Quality & Speed)"
              >
                <Settings className="w-4 h-4 sm:w-5 sm:h-5" />
              </button>

              {/* Options Popup / Menu - Mobile-Optimized Borderless Modern YouTube Style */}
              {optionsMenuOpen && (
                <div
                  onClick={(e) => e.stopPropagation()}
                  onMouseDown={(e) => e.stopPropagation()}
                  onTouchStart={(e) => e.stopPropagation()}
                  className="absolute bottom-10 sm:bottom-12 right-0 bg-zinc-950/95 backdrop-blur-2xl rounded-2xl border border-white/15 p-1.5 sm:p-2 w-44 sm:w-56 max-h-[120px] sm:max-h-80 flex flex-col z-50 animate-in fade-in zoom-in-95 text-white select-none shadow-none"
                >
                  {/* MAIN VIEW */}
                  {optionsView === 'main' && (
                    <div className="space-y-0.5 sm:space-y-1">
                      <div className="px-2.5 py-1 text-[11px] font-semibold tracking-wide text-zinc-400 border-b border-white/10 flex items-center justify-between shrink-0">
                        <span>Settings</span>
                        <button
                          onClick={() => setOptionsMenuOpen(false)}
                          className="text-zinc-400 hover:text-white bg-transparent border-none cursor-pointer text-xs p-1"
                        >
                          ✕
                        </button>
                      </div>

                      {/* Option 1: Quality */}
                      <button
                        onClick={() => setOptionsView('quality')}
                        className="w-full text-left px-2.5 py-1.5 sm:py-2 rounded-xl text-xs transition flex items-center justify-between hover:bg-white/10 border-none outline-none cursor-pointer text-zinc-200"
                      >
                        <div className="flex items-center space-x-2">
                          <SlidersHorizontal className="w-4 h-4 text-emerald-400" />
                          <span>Quality</span>
                        </div>
                        <div className="flex items-center space-x-1 text-xs">
                          <span className="font-semibold text-emerald-300 truncate max-w-[80px]">
                            {currentQuality.replace(' (Best Quality)', '')}
                          </span>
                          <ChevronRight className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                        </div>
                      </button>

                      {/* Option 2: Playback Speed */}
                      <button
                        onClick={() => setOptionsView('speed')}
                        className="w-full text-left px-2.5 py-1.5 sm:py-2 rounded-xl text-xs transition flex items-center justify-between hover:bg-white/10 border-none outline-none cursor-pointer text-zinc-200"
                      >
                        <div className="flex items-center space-x-2">
                          <Gauge className="w-4 h-4 text-purple-400" />
                          <span>Playback speed</span>
                        </div>
                        <div className="flex items-center space-x-1 text-zinc-400 font-mono text-[11px]">
                          <span>{playbackSpeed}x</span>
                          <ChevronRight className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                        </div>
                      </button>
                    </div>
                  )}

                  {/* SPEED SUB-MENU */}
                  {optionsView === 'speed' && (
                    <div className="flex flex-col min-h-0 flex-1 space-y-0.5">
                      <div className="px-1.5 py-1 text-xs font-semibold text-zinc-200 border-b border-white/10 flex items-center space-x-1 shrink-0">
                        <button
                          onClick={() => setOptionsView('main')}
                          className="p-1 rounded-full hover:bg-white/10 text-zinc-400 hover:text-white bg-transparent border-none cursor-pointer"
                        >
                          <ChevronLeft className="w-4 h-4" />
                        </button>
                        <span>Playback speed</span>
                      </div>
                      <div className="overflow-y-auto space-y-0.5 pt-1 pr-0.5 max-h-[82px] sm:max-h-56 scrollbar-thin">
                        {availableSpeeds.map((spd) => (
                          <button
                            key={spd}
                            onClick={() => {
                              handleSpeedChange(spd);
                              setOptionsMenuOpen(false);
                            }}
                            className={`w-full text-left px-2 py-1 sm:px-2.5 sm:py-2 text-[10.5px] sm:text-xs rounded-lg sm:rounded-xl transition flex items-center justify-between border-none outline-none cursor-pointer ${
                              playbackSpeed === spd
                                ? 'bg-white/15 text-white font-bold'
                                : 'text-zinc-300 hover:bg-white/10'
                            }`}
                          >
                            <span>{spd}x {spd === 1 && '(Normal)'}</span>
                            {playbackSpeed === spd && <Check className="w-3.5 h-3.5 text-white stroke-[2.5]" />}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* QUALITY SUB-MENU */}
                  {optionsView === 'quality' && (
                    <div className="flex flex-col min-h-0 flex-1 space-y-0.5">
                      <div className="px-1.5 py-1 text-xs font-semibold text-zinc-200 border-b border-white/10 flex items-center justify-between shrink-0">
                        <div className="flex items-center space-x-1">
                          <button
                            onClick={() => setOptionsView('main')}
                            className="p-1 rounded-full hover:bg-white/10 text-zinc-400 hover:text-white bg-transparent border-none cursor-pointer"
                          >
                            <ChevronLeft className="w-4 h-4" />
                          </button>
                          <span className="text-xs">Video Quality</span>
                        </div>
                      </div>
                      <div className="overflow-y-auto space-y-0.5 pt-1 pr-0.5 max-h-[82px] sm:max-h-60 scrollbar-thin">
                        {QUALITY_OPTIONS.map((q) => {
                          const isSelected =
                            currentQuality === q.label ||
                            (q.value === 'default' && currentQuality.startsWith('Auto'));
                          return (
                            <button
                              key={q.value}
                              onClick={() => {
                                handleQualityChange(q);
                              }}
                              className={`w-full text-left px-2 py-1 sm:px-2.5 sm:py-2 text-[10.5px] sm:text-xs rounded-lg sm:rounded-xl transition flex items-center justify-between border-none outline-none cursor-pointer ${
                                isSelected
                                  ? 'bg-white/15 text-white font-bold'
                                  : 'text-zinc-300 hover:bg-white/10'
                              }`}
                            >
                              <div className="flex items-center space-x-1.5">
                                <span>{q.label}</span>
                                {q.label.includes('HD') && (
                                  <span className="text-[8.5px] font-extrabold px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-300 uppercase tracking-wider">
                                    HD
                                  </span>
                                )}
                              </div>
                              {isSelected && <Check className="w-3.5 h-3.5 text-emerald-400 stroke-[2.5]" />}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Fullscreen Button */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                toggleFullscreen();
              }}
              className="p-1.5 sm:p-2 rounded-full hover:bg-white/15 text-slate-300 hover:text-white transition border-none outline-none cursor-pointer"
              title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
            >
              {isFullscreen ? <Minimize2 className="w-4 h-4 sm:w-5 sm:h-5" /> : <Maximize2 className="w-4 h-4 sm:w-5 sm:h-5" />}
            </button>
          </div>
        </div>
      </div>
        </>
      )}
    </div>
  );
};
