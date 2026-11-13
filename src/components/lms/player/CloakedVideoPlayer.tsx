import React, { useEffect, useRef, useState } from 'react';
import {
  Play,
  Pause,
  RotateCcw,
  RotateCw,
  Volume2,
  VolumeX,
  Maximize2,
  Minimize2,
  Gauge,
  ShieldCheck,
  ShieldAlert,
  AlertTriangle,
  Lock,
  Captions,
  SlidersHorizontal,
  Check,
  Flag,
  Settings,
  ChevronRight,
  ChevronLeft,
} from 'lucide-react';
import { deobfuscateVideoKey, formatDuration, initDevToolsDetector } from '../../../lms/security';
import { requestPlaybackToken } from '../../../lms/playbackTokenService';
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
  seekToSeconds?: number | null;
  milestones?: TimelineMilestone[];
  onProgress?: (seconds: number, totalSeconds: number) => void;
  onComplete?: () => void;
}

const QUALITY_OPTIONS = [
  { label: 'Auto', value: 'default' },
  { label: '1080p', value: 'hd1080' },
  { label: '720p', value: 'hd720' },
  { label: '480p', value: 'large' },
  { label: '360p', value: 'medium' },
  { label: '240p', value: 'small' },
];

export const CloakedVideoPlayer: React.FC<CloakedVideoPlayerProps> = ({
  encryptedVideoId,
  title,
  user,
  batchId = 'batch-01',
  lectureId = 'lec-01',
  seekToSeconds,
  milestones = [],
  onProgress,
  onComplete,
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
  
  // Options (Settings) Menu State: Unified Quality, Speed & Captions
  const [optionsMenuOpen, setOptionsMenuOpen] = useState(false);
  const [optionsView, setOptionsView] = useState<'main' | 'speed' | 'quality'>('main');
  const [currentQuality, setCurrentQuality] = useState('Auto');
  const [captionsEnabled, setCaptionsEnabled] = useState(false);
  const [securityNotice, setSecurityNotice] = useState<string | null>(null);

  // Double-tap seek gesture state (10s Rewind/Forward)
  const lastTapRef = useRef<{ time: number; side: 'left' | 'right' }>({ time: 0, side: 'left' });
  const tapTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [seekFeedback, setSeekFeedback] = useState<{ side: 'left' | 'right'; seconds: number } | null>(null);
  const seekFeedbackTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Track whether mouse/pointer is hovering over the bottom control bar
  const [isHoveringControls, setIsHoveringControls] = useState(false);
  const isHoveringControlsRef = useRef(false);
  isHoveringControlsRef.current = isHoveringControls;

  // Refs to allow event listeners and timers to read current open state without stale closures
  const optionsMenuOpenRef = useRef(false);
  const selectedQualityRef = useRef('Auto');
  optionsMenuOpenRef.current = optionsMenuOpen;
  selectedQualityRef.current = currentQuality;

  const rawVideoId = deobfuscateVideoKey(encryptedVideoId);

  // Ephemeral Batch Token Verification Gateway
  useEffect(() => {
    let isCancelled = false;
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
    }).then((res) => {
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
  }, [user, batchId, lectureId, encryptedVideoId]);

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
      }).then((res) => {
        if (res.isAuthorized && res.token) {
          setPlaybackToken(res.token);
        }
      });
    }, 45000);
    return () => clearInterval(renewTimer);
  }, [authStatus, user, batchId, lectureId]);

  // Real-time Developer Tools Active Tamper Protection
  useEffect(() => {
    const cleanup = initDevToolsDetector((isOpen) => {
      setIsDevToolsOpen(isOpen);
      if (isOpen) {
        if (playerRef.current && playerRef.current.pauseVideo) {
          playerRef.current.pauseVideo();
          setIsPlaying(false);
        }
      }
    });
    return cleanup;
  }, []);

  // Automatically hide "Encrypted" text after 6 seconds, leaving only the clean shield logo
  useEffect(() => {
    const labelTimer = setTimeout(() => {
      setShowEncryptedLabel(false);
    }, 6000);
    return () => clearTimeout(labelTimer);
  }, []);

  // Also collapse label once video reaches 6 seconds
  useEffect(() => {
    if (currentTime >= 6 && showEncryptedLabel) {
      setShowEncryptedLabel(false);
    }
  }, [currentTime, showEncryptedLabel]);

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
    if (seekToSeconds !== undefined && seekToSeconds !== null && playerRef.current && playerRef.current.seekTo) {
      playerRef.current.seekTo(seekToSeconds, true);
      playerRef.current.playVideo();
      setIsPlaying(true);
      setCurrentTime(seekToSeconds);
      setSecurityNotice(`Jumped to ${formatDuration(seekToSeconds)}`);
      setTimeout(() => setSecurityNotice(null), 2500);
    }
  }, [seekToSeconds]);

  // Initialize or re-create player with high definition rendering
  useEffect(() => {
    let checkInterval: any = null;

    if (authStatus !== 'authorized') {
      return;
    }

    const initPlayer = () => {
      if (!window.YT || !window.YT.Player) return false;

      // Destroy existing player if any
      if (playerRef.current && typeof playerRef.current.destroy === 'function') {
        playerRef.current.destroy();
      }

      playerRef.current = new window.YT.Player(playerContainerId.current, {
        width: '100%',
        height: '100%',
        videoId: rawVideoId,
        playerVars: {
          autoplay: 0,
          controls: 0, // Hides native YouTube controls
          disablekb: 1, // Disable keyboard controls to prevent unmasking
          fs: 0, // Hide YouTube's native fullscreen button
          modestbranding: 1, // Suppress YouTube logo
          rel: 0, // Do not show related videos
          iv_load_policy: 3, // Disable annotations
          playsinline: 1,
          cc_load_policy: 0, // Controlled via our custom CC button
          origin: window.location.origin,
        },
        events: {
          onReady: (event: any) => {
            setIsPlayerReady(true);
            const total = event.target.getDuration() || 0;
            setDuration(total);

            // If user has explicitly selected manual quality before video load, apply it
            try {
              if (selectedQualityRef.current !== 'Auto' && event.target.setPlaybackQuality) {
                const targetObj = QUALITY_OPTIONS.find((o) => o.label === selectedQualityRef.current);
                if (targetObj) {
                  event.target.setPlaybackQuality(targetObj.value);
                }
              }
            } catch {
              // fallback
            }
          },
          onStateChange: (event: any) => {
            // YT.PlayerState: -1 (unstarted), 0 (ended), 1 (playing), 2 (paused), 3 (buffering)
            if (event.data === 1) {
              setIsPlaying(true);
            } else if (event.data === 2) {
              setIsPlaying(false);
            } else if (event.data === 0) {
              setIsPlaying(false);
              if (onComplete) onComplete();
            }
          },
        },
      });
      return true;
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
      if (playerRef.current && typeof playerRef.current.destroy === 'function') {
        playerRef.current.destroy();
      }
    };
  }, [rawVideoId, authStatus]);

  // Update current time every 500ms when playing
  useEffect(() => {
    let timer: any = null;
    if (isPlaying && playerRef.current) {
      timer = setInterval(() => {
        try {
          if (playerRef.current.getCurrentTime) {
            const curr = playerRef.current.getCurrentTime() || 0;
            const dur = playerRef.current.getDuration() || duration;
            setCurrentTime(curr);
            if (dur && dur !== duration) setDuration(dur);
            if (onProgress) onProgress(curr, dur);
          }
        } catch {
          // ignore transient API errors
        }
      }, 500);
    }
    return () => clearInterval(timer);
  }, [isPlaying, duration, onProgress]);

  // YouTube-style Double-tap to seek (10s Rewind on Left, 10s Forward on Right)
  const handleTap = (side: 'left' | 'right') => {
    const now = Date.now();
    const DOUBLE_TAP_DELAY = 300;

    if (now - lastTapRef.current.time < DOUBLE_TAP_DELAY && lastTapRef.current.side === side) {
      // Double tap recognized!
      if (tapTimeoutRef.current) {
        clearTimeout(tapTimeoutRef.current);
        tapTimeoutRef.current = null;
      }
      const delta = side === 'left' ? -10 : 10;
      handleSkip(delta);

      setSeekFeedback({ side, seconds: 10 });
      if (seekFeedbackTimeoutRef.current) {
        clearTimeout(seekFeedbackTimeoutRef.current);
      }
      seekFeedbackTimeoutRef.current = setTimeout(() => {
        setSeekFeedback(null);
      }, 700);

      lastTapRef.current = { time: 0, side };
    } else {
      // First tap
      lastTapRef.current = { time: now, side };
      if (tapTimeoutRef.current) {
        clearTimeout(tapTimeoutRef.current);
      }
      tapTimeoutRef.current = setTimeout(() => {
        // Single tap: toggle controls visibility
        setIsControlsVisible((prev) => !prev);
        lastTapRef.current = { time: 0, side };
      }, DOUBLE_TAP_DELAY);
    }
  };

  // Screen Security & Focus Listener (Pause if student switches tab / minimises)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden && isPlaying) {
        handlePause();
        setSecurityNotice('Playback paused: Application focus lost.');
        setTimeout(() => setSecurityNotice(null), 4000);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [isPlaying]);

  // Control Handlers
  const handlePlay = () => {
    if (playerRef.current && playerRef.current.playVideo) {
      playerRef.current.playVideo();
      setIsPlaying(true);
    }
  };

  const handlePause = () => {
    if (playerRef.current && playerRef.current.pauseVideo) {
      playerRef.current.pauseVideo();
      setIsPlaying(false);
    }
  };

  const togglePlay = () => {
    if (isPlaying) {
      handlePause();
    } else {
      handlePlay();
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const targetTime = parseFloat(e.target.value);
    setCurrentTime(targetTime);
    if (playerRef.current && playerRef.current.seekTo) {
      playerRef.current.seekTo(targetTime, true);
    }
  };

  const handleSkip = (seconds: number) => {
    if (playerRef.current && playerRef.current.getCurrentTime) {
      const nextTime = Math.min(Math.max(0, playerRef.current.getCurrentTime() + seconds), duration);
      playerRef.current.seekTo(nextTime, true);
      setCurrentTime(nextTime);
    }
  };

  const handleSpeedChange = (speed: number) => {
    setPlaybackSpeed(speed);
    if (playerRef.current && playerRef.current.setPlaybackRate) {
      playerRef.current.setPlaybackRate(speed);
    }
    setSpeedMenuOpen(false);
  };

  // Video Quality Handler - minimal, clean, and responsive
  const handleQualityChange = (q: { label: string; value: string }) => {
    setCurrentQuality(q.label);
    selectedQualityRef.current = q.label;

    if (playerRef.current) {
      try {
        const p = playerRef.current;
        if (q.label === 'Auto') {
          // Reset to YouTube's automatic adaptive network streaming
          if (p.setPlaybackQuality) {
            p.setPlaybackQuality('default');
          }
          if (p.setPlaybackQualityRange) {
            p.setPlaybackQualityRange('default', 'highres');
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

        // Trigger YouTube DASH engine to flush buffer and re-fetch chunks immediately in new quality
        if (p.getCurrentTime && p.seekTo) {
          const curr = p.getCurrentTime();
          if (curr > 0) {
            p.seekTo(curr, true);
          }
        }
      } catch (err) {
        console.warn('Quality switch error:', err);
      }
    }
    setQualityMenuOpen(false);
    setSecurityNotice(q.label === 'Auto' ? 'Quality: Auto (Network)' : `Quality: ${q.label}`);
    setTimeout(() => setSecurityNotice(null), 2500);
  };

  // Captions / Subtitles Toggle Handler
  const toggleCaptions = () => {
    const nextState = !captionsEnabled;
    setCaptionsEnabled(nextState);

    if (playerRef.current) {
      try {
        if (nextState) {
          if (playerRef.current.loadModule) {
            playerRef.current.loadModule('captions');
          }
          if (playerRef.current.setOption) {
            playerRef.current.setOption('captions', 'track', { languageCode: 'en' });
            playerRef.current.setOption('captions', 'reload', true);
          }
        } else {
          if (playerRef.current.unloadModule) {
            playerRef.current.unloadModule('captions');
          }
          if (playerRef.current.setOption) {
            playerRef.current.setOption('captions', 'track', {});
          }
        }
      } catch {
        // ignore iframe restriction
      }
    }

    setSecurityNotice(nextState ? 'Subtitles / Captions Enabled' : 'Subtitles Disabled');
    setTimeout(() => setSecurityNotice(null), 3000);
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseInt(e.target.value, 10);
    setVolume(val);
    if (playerRef.current && playerRef.current.setVolume) {
      playerRef.current.setVolume(val);
      if (val === 0) {
        setIsMuted(true);
        playerRef.current.mute();
      } else if (isMuted) {
        setIsMuted(false);
        playerRef.current.unMute();
      }
    }
  };

  const toggleMute = () => {
    if (!playerRef.current) return;
    if (isMuted) {
      playerRef.current.unMute();
      setIsMuted(false);
      playerRef.current.setVolume(volume || 50);
    } else {
      playerRef.current.mute();
      setIsMuted(true);
    }
  };

  const toggleFullscreen = () => {
    if (!containerRef.current) return;

    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {});
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {});
    }
  };

  // Keep controls and dropdowns visible. If pointer is over bottom controls or menus are open, do NOT auto-hide.
  const controlsTimeoutRef = useRef<any>(null);
  const handleMouseMove = () => {
    setIsControlsVisible(true);
    if (controlsTimeoutRef.current) {
      clearTimeout(controlsTimeoutRef.current);
    }
    controlsTimeoutRef.current = setTimeout(() => {
      // Do NOT hide controls if pointer is directly in bottom navigation buttons or dropdown menus are open
      if (
        isPlaying &&
        !isHoveringControlsRef.current &&
        !speedMenuOpenRef.current &&
        !qualityMenuOpenRef.current
      ) {
        setIsControlsVisible(false);
      }
    }, 3500);
  };

  const availableSpeeds = [0.75, 1, 1.25, 1.5, 1.75, 2];

  return (
    <div
      ref={containerRef}
      onMouseMove={handleMouseMove}
      onMouseLeave={() => {
        if (isPlaying && !speedMenuOpen && !qualityMenuOpen && !isHoveringControls) {
          setIsControlsVisible(false);
        }
      }}
      style={{
        transform: 'translateZ(0)',
        WebkitFontSmoothing: 'antialiased',
      }}
      className="relative w-full aspect-video bg-black rounded-3xl overflow-hidden shadow-2xl border-none select-none group"
    >
      {/* 1. Underlying YouTube Iframe Container - active only when authorized */}
      {authStatus === 'authorized' && (
        <div className="absolute inset-0 w-full h-full pointer-events-none [&>iframe]:w-full [&>iframe]:h-full [&>iframe]:object-cover">
          <div id={playerContainerId.current} className="w-full h-full" />
        </div>
      )}

      {/* 1b. Batch Token Verifying Spinner Screen */}
      {authStatus === 'verifying' && (
        <div className="absolute inset-0 z-30 bg-black/95 flex flex-col items-center justify-center text-white space-y-3">
          <div className="w-8 h-8 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin" />
          <span className="text-xs font-mono text-emerald-400 tracking-wider">Verifying Batch Access & Ephemeral Token...</span>
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
          <span className="text-[10px] font-mono text-slate-500 bg-slate-900 px-3 py-1 rounded-full border border-slate-800">
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
          <div className="flex items-center space-x-2 text-[10px] font-mono text-slate-400 bg-slate-900/90 px-3 py-1 rounded-full border border-slate-800 mb-4">
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

      {/* 2. Interaction Layer with Left/Right Double-Tap Seek (YouTube-style 10s Rewind/Skip) */}
      <div className="absolute top-0 inset-x-0 bottom-24 z-10 flex">
        {/* Left half: double-tap rewind 10s */}
        <div
          onClick={() => handleTap('left')}
          className="relative w-1/2 h-full cursor-pointer flex items-center justify-center select-none"
        >
          {seekFeedback?.side === 'left' && (
            <div className="flex flex-col items-center justify-center bg-black/75 backdrop-blur-xs rounded-full w-20 h-20 text-white animate-in zoom-in-75 duration-200 border border-white/20 shadow-2xl">
              <RotateCcw className="w-6 h-6 mb-1 text-white" />
              <span className="text-[10px] font-bold tracking-tight">10 seconds</span>
            </div>
          )}
        </div>

        {/* Right half: double-tap forward 10s */}
        <div
          onClick={() => handleTap('right')}
          className="relative w-1/2 h-full cursor-pointer flex items-center justify-center select-none"
        >
          {seekFeedback?.side === 'right' && (
            <div className="flex flex-col items-center justify-center bg-black/75 backdrop-blur-xs rounded-full w-20 h-20 text-white animate-in zoom-in-75 duration-200 border border-white/20 shadow-2xl">
              <RotateCw className="w-6 h-6 mb-1 text-white" />
              <span className="text-[10px] font-bold tracking-tight">10 seconds</span>
            </div>
          )}
        </div>
      </div>

      {/* 3. Top Header Bar (Clean Lecture Title when controls are visible) */}
      <div
        onClick={(e) => e.stopPropagation()}
        className={`absolute top-0 inset-x-0 z-30 p-3 sm:p-4 bg-gradient-to-b from-black/80 via-black/40 to-transparent flex items-center justify-between transition-opacity duration-300 ${
          isControlsVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      >
        <h2 className="text-white text-xs sm:text-sm font-semibold truncate max-w-sm sm:max-w-md drop-shadow">
          {title}
        </h2>
      </div>

      {/* 4. Center Play/Pause Large Pulse Button (When Paused) */}
      {!isPlaying && isPlayerReady && (
        <div
          onClick={togglePlay}
          className="absolute inset-0 z-20 flex items-center justify-center cursor-pointer bg-black/35 backdrop-blur-xs transition-all"
        >
          <button className="w-18 h-18 rounded-full bg-[var(--md-sys-color-primary)] text-[var(--md-sys-color-on-primary)] flex items-center justify-center shadow-2xl hover:scale-110 active:scale-95 transition transform border-none">
            <Play className="w-8 h-8 fill-current ml-1" />
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
        onMouseEnter={() => {
          setIsHoveringControls(true);
          setIsControlsVisible(true);
          if (controlsTimeoutRef.current) {
            clearTimeout(controlsTimeoutRef.current);
          }
        }}
        onMouseLeave={() => {
          setIsHoveringControls(false);
          if (controlsTimeoutRef.current) {
            clearTimeout(controlsTimeoutRef.current);
          }
          controlsTimeoutRef.current = setTimeout(() => {
            if (
              isPlaying &&
              !optionsMenuOpenRef.current
            ) {
              setIsControlsVisible(false);
            }
          }, 3000);
        }}
        className={`absolute bottom-0 inset-x-0 z-30 px-3 sm:px-4 py-2 sm:py-3 bg-gradient-to-t from-black/95 via-black/80 to-transparent transition-opacity duration-300 flex flex-col space-y-1 ${
          isControlsVisible || isHoveringControls || optionsMenuOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      >
        {/* TIMELINE MILESTONES (Topic Breakpoints) STRIP */}
        {milestones && milestones.length > 0 && (
          <div
            onClick={(e) => e.stopPropagation()}
            className="flex items-center space-x-1.5 overflow-x-auto pb-1 scrollbar-none"
          >
            {milestones.map((m) => {
              const isPassed = currentTime >= m.seconds;
              return (
                <button
                  key={m.id}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (playerRef.current?.seekTo) {
                      playerRef.current.seekTo(m.seconds, true);
                      playerRef.current.playVideo();
                      setIsPlaying(true);
                      setCurrentTime(m.seconds);
                    }
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

        {/* Scroller / Progress Bar Track with Milestone Markers */}
        <div
          onClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
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
            className="w-full h-1.5 bg-white/25 rounded-lg appearance-none cursor-pointer accent-[var(--md-sys-color-primary)] hover:h-2.5 transition-all relative z-10"
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
                  className="absolute top-1/2 -translate-y-1/2 w-1.5 h-3 bg-amber-400/80 rounded-full pointer-events-none z-20 shadow-xs"
                />
              );
            })}
        </div>

        {/* Action Controls Row */}
        <div
          onClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          className="flex items-center justify-between text-white pt-0.5"
        >
          {/* Left Controls: Play, Skip (Desktop), Volume & Slider, Time */}
          <div className="flex items-center space-x-1 sm:space-x-2">
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
                <div className="flex items-center space-x-1.5 bg-black/85 backdrop-blur-md px-2 py-1 rounded-full animate-in fade-in zoom-in-95 border border-white/10 shadow-lg ml-0.5">
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={isMuted ? 0 : volume}
                    onChange={handleVolumeChange}
                    onClick={(e) => e.stopPropagation()}
                    onMouseDown={(e) => e.stopPropagation()}
                    className="w-14 sm:w-20 h-1 bg-slate-600 rounded-lg appearance-none cursor-pointer accent-[var(--md-sys-color-primary)]"
                  />
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleMute();
                    }}
                    className="text-[10px] font-mono text-slate-300 hover:text-white bg-transparent border-none cursor-pointer px-1"
                  >
                    {isMuted ? '0%' : `${volume}%`}
                  </button>
                </div>
              )}
            </div>

            {/* Time Stamp */}
            <div
              onClick={(e) => e.stopPropagation()}
              className="text-[10.5px] sm:text-xs font-mono text-slate-300 select-none px-1 cursor-default whitespace-nowrap"
            >
              <span>{formatDuration(currentTime)}</span>
              <span className="mx-1 text-slate-500">/</span>
              <span>{formatDuration(duration)}</span>
            </div>
          </div>

          {/* Right Controls: Unified Option / Settings Menu & Fullscreen */}
          <div
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            className="flex items-center space-x-1 sm:space-x-2"
          >
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
                title="Options (Quality, Speed, Captions)"
              >
                <Settings className="w-4 h-4 sm:w-5 sm:h-5" />
              </button>

              {/* Options Popup / Menu */}
              {optionsMenuOpen && (
                <div
                  onClick={(e) => e.stopPropagation()}
                  onMouseDown={(e) => e.stopPropagation()}
                  className="absolute bottom-11 right-0 bg-slate-900/98 backdrop-blur-md rounded-2xl shadow-2xl p-2 w-52 sm:w-56 z-50 animate-in fade-in zoom-in-95 border border-slate-700/80 text-white"
                >
                  {/* MAIN VIEW */}
                  {optionsView === 'main' && (
                    <div className="space-y-1">
                      <div className="px-3 py-1.5 text-[10px] uppercase font-bold tracking-wider text-slate-400 border-b border-slate-800 flex items-center justify-between">
                        <span>Playback Options</span>
                        <button
                          onClick={() => setOptionsMenuOpen(false)}
                          className="text-slate-400 hover:text-white bg-transparent border-none cursor-pointer text-xs"
                        >
                          ✕
                        </button>
                      </div>

                      {/* Option 1: Playback Speed */}
                      <button
                        onClick={() => setOptionsView('speed')}
                        className="w-full text-left px-3 py-2 rounded-xl text-xs transition flex items-center justify-between hover:bg-slate-800/80 border-none outline-none cursor-pointer text-slate-200"
                      >
                        <div className="flex items-center space-x-2">
                          <Gauge className="w-4 h-4 text-purple-400" />
                          <span>Playback Speed</span>
                        </div>
                        <div className="flex items-center space-x-1 text-slate-400 font-mono text-[11px]">
                          <span>{playbackSpeed}x</span>
                          <ChevronRight className="w-3.5 h-3.5" />
                        </div>
                      </button>

                      {/* Option 2: Quality */}
                      <button
                        onClick={() => setOptionsView('quality')}
                        className="w-full text-left px-3 py-2 rounded-xl text-xs transition flex items-center justify-between hover:bg-slate-800/80 border-none outline-none cursor-pointer text-slate-200"
                      >
                        <div className="flex items-center space-x-2">
                          <SlidersHorizontal className="w-4 h-4 text-emerald-400" />
                          <span>Quality</span>
                        </div>
                        <div className="flex items-center space-x-1 text-slate-400 text-[11px]">
                          <span>{currentQuality}</span>
                          <ChevronRight className="w-3.5 h-3.5" />
                        </div>
                      </button>

                      {/* Option 3: Captions */}
                      <button
                        onClick={toggleCaptions}
                        className="w-full text-left px-3 py-2 rounded-xl text-xs transition flex items-center justify-between hover:bg-slate-800/80 border-none outline-none cursor-pointer text-slate-200"
                      >
                        <div className="flex items-center space-x-2">
                          <Captions className="w-4 h-4 text-sky-400" />
                          <span>Captions (CC)</span>
                        </div>
                        <span className={`text-[11px] font-bold ${captionsEnabled ? 'text-emerald-400' : 'text-slate-500'}`}>
                          {captionsEnabled ? 'On' : 'Off'}
                        </span>
                      </button>
                    </div>
                  )}

                  {/* SPEED SUB-MENU */}
                  {optionsView === 'speed' && (
                    <div className="space-y-1">
                      <div className="px-2 py-1.5 text-xs font-bold text-slate-200 border-b border-slate-800 flex items-center space-x-1">
                        <button
                          onClick={() => setOptionsView('main')}
                          className="p-1 rounded-full hover:bg-slate-800 text-slate-400 hover:text-white bg-transparent border-none cursor-pointer"
                        >
                          <ChevronLeft className="w-4 h-4" />
                        </button>
                        <span>Playback Speed</span>
                      </div>
                      <div className="max-h-52 overflow-y-auto space-y-0.5 pt-1">
                        {availableSpeeds.map((spd) => (
                          <button
                            key={spd}
                            onClick={() => {
                              handleSpeedChange(spd);
                              setOptionsMenuOpen(false);
                            }}
                            className={`w-full text-left px-3 py-1.5 text-xs rounded-lg transition flex items-center justify-between border-none outline-none cursor-pointer ${
                              playbackSpeed === spd
                                ? 'bg-[var(--md-sys-color-primary)]/20 text-[var(--md-sys-color-primary)] font-bold'
                                : 'text-slate-300 hover:bg-slate-800/80'
                            }`}
                          >
                            <span>{spd}x {spd === 1 && '(Normal)'}</span>
                            {playbackSpeed === spd && <Check className="w-3.5 h-3.5" />}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* QUALITY SUB-MENU */}
                  {optionsView === 'quality' && (
                    <div className="space-y-1">
                      <div className="px-2 py-1.5 text-xs font-bold text-slate-200 border-b border-slate-800 flex items-center space-x-1">
                        <button
                          onClick={() => setOptionsView('main')}
                          className="p-1 rounded-full hover:bg-slate-800 text-slate-400 hover:text-white bg-transparent border-none cursor-pointer"
                        >
                          <ChevronLeft className="w-4 h-4" />
                        </button>
                        <span>Video Quality</span>
                      </div>
                      <div className="max-h-52 overflow-y-auto space-y-0.5 pt-1">
                        {QUALITY_OPTIONS.map((q) => (
                          <button
                            key={q.value}
                            onClick={() => {
                              handleQualityChange(q);
                              setOptionsMenuOpen(false);
                            }}
                            className={`w-full text-left px-3 py-1.5 text-xs rounded-lg transition flex items-center justify-between border-none outline-none cursor-pointer ${
                              currentQuality === q.label
                                ? 'bg-[var(--md-sys-color-primary)]/20 text-[var(--md-sys-color-primary)] font-bold'
                                : 'text-slate-300 hover:bg-slate-800/80'
                            }`}
                          >
                            <span>{q.label}</span>
                            {currentQuality === q.label && <Check className="w-3.5 h-3.5" />}
                          </button>
                        ))}
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
    </div>
  );
};
