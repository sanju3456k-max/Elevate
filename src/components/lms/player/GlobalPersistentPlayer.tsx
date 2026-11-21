import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  Play,
  Pause,
  X,
  ChevronDown,
  ChevronUp,
  Clock,
  FileText,
  Plus,
  Trash2,
  ChevronRight,
  BookOpen,
  ListVideo,
  Maximize2,
  RotateCcw,
  RotateCw,
  PictureInPicture2,
} from 'lucide-react';
import { CloakedVideoPlayer } from './CloakedVideoPlayer';
import { useApp } from '../../../lms/LmsContext';
import { formatDuration, getLectureThumbnailUrl } from '../../../lms/security';
import { useBackHandler, isBrowserFullscreen, exitBrowserFullscreen } from '../../../hooks/useBackNavigation';
import { enterNativePip, isNativeAndroid, setNativePlaybackPlaying, unlockOrientationPortrait, showNativeStatusBar } from '../../../lib/nativeHardwareBridge';
import type { TimelineMilestone, Lecture } from '../../../lms/types';

export interface PersistentPlaybackData {
  lectureId: string;
  lectureTitle: string;
  lectureDescription?: string;
  batchId: string;
  batchTitle: string;
  chapterId?: string | null;
  thumbnailUrl?: string;
  durationMinutes?: number;
  encryptedVideoId: string;
  milestones?: TimelineMilestone[];
  isMinimized: boolean;
  isPlaying?: boolean;
}

interface GlobalPersistentPlayerProps {
  playback: PersistentPlaybackData | null;
  onUpdatePlayback: React.Dispatch<React.SetStateAction<PersistentPlaybackData | null>>;
  onClose: () => void;
  activeTab: string;
  user: any;
  isInsideBatch?: boolean;
}

export const GlobalPersistentPlayer: React.FC<GlobalPersistentPlayerProps> = ({
  playback,
  onUpdatePlayback,
  onClose,
  activeTab,
  user,
  isInsideBatch = false,
}) => {
  const {
    lectures,
    watchProgress,
    personalNotes,
    addPersonalNote,
    deletePersonalNote,
    updateWatchProgress,
    isEnrolled,
    isGuestAllowedForBatch,
    user: lmsUser,
  } = useApp();

  const [currentPlaybackSec, setCurrentPlaybackSec] = useState<number>(0);
  const [totalDuration, setTotalDuration] = useState<number>(0);
  const [seekSeconds, setSeekSeconds] = useState<number | null>(null);
  const [noteInputText, setNoteInputText] = useState<string>('');

  // Determine authorization: student enrolled or guest mode enabled
  const isUserAllowed = useMemo(() => {
    if (!playback?.batchId) return true;
    return isEnrolled(playback.batchId) || isGuestAllowedForBatch(playback.batchId);
  }, [playback?.batchId, isEnrolled, isGuestAllowedForBatch]);

  // Construct effective LMS user profile with enrolled batch ids
  const effectiveUser = useMemo(() => {
    if (lmsUser && Array.isArray(lmsUser.enrolledBatchIds)) return lmsUser;
    const enrolledIds = playback?.batchId ? [playback.batchId] : [];
    if (user) {
      return {
        ...user,
        id: user.uid || user.id || 'student',
        name: user.displayName || user.name || 'Student',
        role: user.role || 'student',
        enrolledBatchIds: user.enrolledBatchIds || enrolledIds,
      };
    }
    return {
      id: 'guest',
      name: 'Student',
      role: 'student',
      enrolledBatchIds: enrolledIds,
    };
  }, [lmsUser, user, playback?.batchId]);

  // Auto-pause when entering taking an exam or OMR test
  useEffect(() => {
    if (activeTab === 'take-test' || activeTab === 'omr-test') {
      onUpdatePlayback((prev) => (prev ? { ...prev, isPlaying: false } : null));
    }
  }, [activeTab, onUpdatePlayback]);

  // Cleanly close player if currently playing lecture was deleted
  useEffect(() => {
    const handleLectureDeleted = (e: any) => {
      const deletedId = e.detail?.id;
      if (playback && playback.lectureId === deletedId) {
        onClose();
      }
    };
    window.addEventListener('lecture-deleted', handleLectureDeleted);
    return () => {
      window.removeEventListener('lecture-deleted', handleLectureDeleted);
    };
  }, [playback, onClose]);

  // Auto-dock to MiniPlayer if user navigates away to another main tab (Home, Batches, Tests, Analytics)
  const prevActiveTabRef = useRef(activeTab);
  useEffect(() => {
    if (prevActiveTabRef.current !== activeTab) {
      prevActiveTabRef.current = activeTab;
      if (playback && !playback.isMinimized) {
        onUpdatePlayback((prev) => (prev ? { ...prev, isMinimized: true } : null));
      }
    }
  }, [activeTab, playback, onUpdatePlayback]);

  // Back handler when expanded: If fullscreen, exit fullscreen first; otherwise minimize to strip (YouTube style)
  useBackHandler({
    isOpen: Boolean(playback && !playback.isMinimized),
    priority: 50,
    id: 'global_persistent_player_back',
    onBack: () => {
      if (isBrowserFullscreen()) {
        exitBrowserFullscreen();
        return;
      }
      onUpdatePlayback((prev) => (prev ? { ...prev, isMinimized: true } : null));
    },
  });

  // Keep native Android PiP bridge informed of active playback
  useEffect(() => {
    setNativePlaybackPlaying(Boolean(playback && playback.isPlaying));
  }, [playback?.isPlaying]);

  // Track system-level Android OS Picture-in-Picture window transitions
  const [isInNativePip, setIsInNativePip] = useState(false);
  const wasInNativePipRef = useRef(false);

  useEffect(() => {
    const handleNativePip = (e: any) => {
      const inPip = Boolean(e?.detail?.inPip);
      setIsInNativePip(inPip);

      if (wasInNativePipRef.current && !inPip) {
        // User tapped the expand / fullscreen button on the native Android PiP window!
        // Redirect directly to the full video player page in the app instead of staying in mini-player.
        onUpdatePlayback((prev) => (prev ? { ...prev, isMinimized: false } : null));
      }
      wasInNativePipRef.current = inPip;
    };
    window.addEventListener('nativePipChanged', handleNativePip);
    return () => window.removeEventListener('nativePipChanged', handleNativePip);
  }, [onUpdatePlayback]);

  const isTestMode = activeTab === 'take-test' || activeTab === 'omr-test';
  const isBottomNavVisible = !isInsideBatch && ['home', 'batches', 'tests', 'analytics'].includes(activeTab);
  const isMinimized = playback?.isMinimized ?? true;

  const handleMinimize = useCallback((e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (isBrowserFullscreen()) {
      exitBrowserFullscreen();
    }
    onUpdatePlayback((prev) => (prev ? { ...prev, isMinimized: true } : null));
  }, [onUpdatePlayback]);

  const handleExpand = useCallback(() => {
    onUpdatePlayback((prev) => (prev ? { ...prev, isMinimized: false } : null));
  }, [onUpdatePlayback]);

  // Desktop Miniplayer Controls Decay Timer (Keeps controls & bottom cloak active for 5s after play/pause/hover)
  const [isMiniControlsActive, setIsMiniControlsActive] = useState(false);
  const miniControlsTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const showMiniControlsForDuration = useCallback((duration = 5000) => {
    setIsMiniControlsActive(true);
    if (miniControlsTimeoutRef.current) {
      clearTimeout(miniControlsTimeoutRef.current);
    }
    miniControlsTimeoutRef.current = setTimeout(() => {
      setIsMiniControlsActive(false);
      miniControlsTimeoutRef.current = null;
    }, duration);
  }, []);

  const handleTogglePlay = useCallback((e?: React.MouseEvent) => {
    e?.stopPropagation();
    showMiniControlsForDuration(5000);

    const nextIsPlaying = !playback?.isPlaying;

    // 1. Direct synchronous postMessage to YouTube iframe for instant zero-latency playback toggle
    try {
      const iframes = document.querySelectorAll('iframe');
      iframes.forEach((ifr) => {
        if (ifr.src && (ifr.src.includes('youtube') || ifr.src.includes('youtu.be'))) {
          ifr.contentWindow?.postMessage(
            JSON.stringify({
              event: 'command',
              func: nextIsPlaying ? 'playVideo' : 'pauseVideo',
              args: [],
            }),
            '*'
          );
        }
      });
    } catch {}

    // 2. Dispatch custom event for active CloakedVideoPlayer instance
    try {
      window.dispatchEvent(
        new CustomEvent('elevate_player_toggle_play', {
          detail: { isPlaying: nextIsPlaying },
        })
      );
    } catch {}

    // 3. Update persistent state
    onUpdatePlayback((prev) => (prev ? { ...prev, isPlaying: nextIsPlaying } : null));
  }, [onUpdatePlayback, showMiniControlsForDuration, playback?.isPlaying]);

  const handleSkip10 = useCallback(
    (deltaSeconds: number, e?: React.MouseEvent) => {
      e?.stopPropagation();
      showMiniControlsForDuration(5000);
      const effectiveDur = totalDuration > 0 ? totalDuration : ((playback?.durationMinutes || 0) * 60);
      const targetSec = Math.max(0, Math.min(effectiveDur || 999999, currentPlaybackSec + deltaSeconds));
      setSeekSeconds(targetSec);
      setCurrentPlaybackSec(targetSec);
      try {
        const iframes = document.querySelectorAll('iframe');
        iframes.forEach((ifr) => {
          if (ifr.src && (ifr.src.includes('youtube') || ifr.src.includes('youtu.be'))) {
            ifr.contentWindow?.postMessage(
              JSON.stringify({
                event: 'command',
                func: 'seekTo',
                args: [targetSec, true],
              }),
              '*'
            );
          }
        });
      } catch {}
    },
    [currentPlaybackSec, totalDuration, playback, showMiniControlsForDuration]
  );

  const handlePlayStateChange = useCallback(
    (playing: boolean) => {
      onUpdatePlayback((prev) => (prev && prev.isPlaying !== playing ? { ...prev, isPlaying: playing } : prev));
    },
    [onUpdatePlayback]
  );

  const handleProgress = useCallback(
    (sec: number, total: number) => {
      setCurrentPlaybackSec(sec);
      if (total > 0) setTotalDuration(total);
      if (playback?.lectureId) {
        updateWatchProgress(playback.lectureId, sec, total);
      }
    },
    [playback?.lectureId, updateWatchProgress]
  );

  const handleClose = useCallback((e?: React.MouseEvent) => {
    e?.stopPropagation();
    unlockOrientationPortrait().catch(() => {});
    showNativeStatusBar();
    onClose();
  }, [onClose]);

  const handleCreateNote = (e: React.FormEvent) => {
    e.preventDefault();
    if (!noteInputText.trim() || !playback) return;
    addPersonalNote({
      lectureId: playback.lectureId,
      seconds: 0,
      text: noteInputText.trim(),
    });
    setNoteInputText('');
  };

  // All lectures in the same batch for YouTube-style playlist queue
  const batchLectures = useMemo(() => {
    if (!playback) return [];
    return lectures.filter((l) => l.batchId === playback.batchId);
  }, [lectures, playback]);

  const currentLectureNotes = useMemo(() => {
    if (!playback) return [];
    return personalNotes.filter((n) => n.lectureId === playback.lectureId);
  }, [personalNotes, playback]);

  const switchLecture = (lec: Lecture) => {
    if (!playback) return;
    onUpdatePlayback((prev) =>
      prev
        ? {
            ...prev,
            lectureId: lec.id,
            lectureTitle: lec.title,
            lectureDescription: lec.description,
            encryptedVideoId: lec.encryptedVideoId,
            thumbnailUrl: lec.thumbnailUrl,
            durationMinutes: lec.durationMinutes,
            milestones: lec.milestones || [],
            isPlaying: true,
          }
        : null
    );
    setSeekSeconds(0);
    setCurrentPlaybackSec(0);
  };

  // Lock window/body/html scrolling when full persistent player is open on mobile to eliminate any overscroll lift
  useEffect(() => {
    if (!playback || isMinimized || isInNativePip) {
      document.body.style.overflow = '';
      document.documentElement.style.overflow = '';
      return;
    }
    const prevBodyOverflow = document.body.style.overflow;
    const prevHtmlOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevBodyOverflow;
      document.documentElement.style.overflow = prevHtmlOverflow;
    };
  }, [playback, isMinimized, isInNativePip]);

  if (!playback) return null;

  return (
    <>
      {/* Mobile & Tablet Status Bar Background Guard (Ensures seamless plain top area) */}
      {!isMinimized && !isInNativePip && (
        <div className="fixed top-0 inset-x-0 h-[var(--android-status-bar-height,env(safe-area-inset-top,0px))] bg-[#e5e9f0] dark:bg-[#0b0c10] z-50 pointer-events-none transition-colors md:hidden" />
      )}
      <div
        id="global-persistent-player-host"
        className={
          isInNativePip
            ? 'is-native-pip fixed inset-0 w-full h-full z-[99999] bg-black overflow-hidden flex items-center justify-center p-0 m-0'
            : isMinimized
            ? `is-minimized fixed right-3 sm:right-5 md:right-6 w-[280px] xs:w-[300px] sm:w-[340px] md:w-[380px] z-50 bg-[#16181d] text-white rounded-2xl md:rounded-3xl shadow-none border-0 border-none ring-0 p-0 transition-all duration-300 select-none overflow-hidden ${
                !isTestMode ? 'flex flex-col' : 'hidden'
              }`
            : `is-expanded fixed inset-x-0 bottom-0 w-full top-[var(--android-status-bar-height,env(safe-area-inset-top,0px))] md:top-[62px] md:h-[calc(100vh-62px)] z-40 bg-[#e5e9f0] dark:bg-[#0b0c10] flex flex-col lg:grid lg:grid-cols-12 lg:gap-6 items-start overflow-hidden lg:overflow-y-auto lg:px-8 lg:pt-3 lg:pb-24 overscroll-contain select-text`
        }
      style={
        isInNativePip
          ? undefined
          : isMinimized
          ? {
              bottom: isBottomNavVisible
                ? 'calc(76px + env(safe-area-inset-bottom, 0px))'
                : 'calc(16px + env(safe-area-inset-bottom, 0px))',
            }
          : undefined
      }
      onClick={isMinimized && !isInNativePip ? handleExpand : undefined}
    >
      {/* 1. THE PERSISTENT VIDEO PLAYER FRAME (NEVER UNMOUNTS) */}
      <div
        className={
          isInNativePip
            ? 'w-full h-full bg-black flex items-center justify-center p-0 m-0 overflow-hidden'
            : isMinimized
            ? 'w-full aspect-video shrink-0 rounded-t-2xl md:rounded-t-3xl overflow-hidden relative bg-black group/minivid'
            : 'w-full aspect-video shrink-0 bg-black z-40 lg:col-span-7 xl:col-span-8 lg:col-start-1 lg:row-start-1 shadow-none rounded-none lg:rounded-3xl lg:shadow-lg overflow-hidden group relative sticky top-0 lg:static lg:top-auto'
        }
      >
        <div
          className="w-full h-full relative overflow-hidden flex items-center justify-center bg-black"
        >
          {/* In-App Floating PiP Player Controls Overlay (Unified Mobile, Tablet & Desktop) */}
          {isMinimized && !isInNativePip && (
            <div
              className={`absolute inset-0 z-30 transition-opacity duration-200 pointer-events-auto select-none ${
                !playback.isPlaying || isMiniControlsActive
                  ? 'opacity-100'
                  : 'opacity-0 group-hover/minivid:opacity-100'
              }`}
              onMouseEnter={() => showMiniControlsForDuration(5000)}
              onTouchStart={() => showMiniControlsForDuration(5000)}
              onClick={(e) => {
                e.stopPropagation();
                handleTogglePlay(e);
              }}
            >
              {/* Top Row: Expand, External OS PiP, Close buttons */}
              <div
                className="absolute top-0 inset-x-0 h-14 bg-gradient-to-b from-black/80 via-black/40 to-transparent flex items-start justify-between px-2.5 pt-2 z-10"
                onClick={(e) => e.stopPropagation()}
              >
                <button
                  type="button"
                  id="pip-expand-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleExpand();
                  }}
                  className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-black/60 hover:bg-black/80 active:scale-90 text-white flex items-center justify-center transition border border-white/10 cursor-pointer shadow-md"
                  title="Expand to Full Video"
                  aria-label="Expand to Full Video"
                >
                  <Maximize2 className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                </button>
                <div className="flex items-center gap-1.5">
                  {isNativeAndroid() && (
                    <button
                      type="button"
                      id="pip-external-os-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        enterNativePip();
                      }}
                      className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-black/60 hover:bg-black/80 active:scale-90 text-white flex items-center justify-center transition border border-white/10 cursor-pointer shadow-md"
                      title="Float on Android Home Screen (OS PiP)"
                      aria-label="Float on Android Home Screen"
                    >
                      <PictureInPicture2 className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                    </button>
                  )}
                  <button
                    type="button"
                    id="pip-close-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleClose(e);
                    }}
                    className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-black/60 hover:bg-rose-600 active:scale-90 text-white flex items-center justify-center transition border border-white/10 cursor-pointer shadow-md"
                    title="Close Video"
                    aria-label="Close Video"
                  >
                    <X className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                  </button>
                </div>
              </div>

              {/* Center Controls: 10s Rewind | Big Play/Pause | 10s Skip */}
              <div className="absolute inset-0 flex items-center justify-center gap-3 sm:gap-5 pointer-events-none z-20">
                <button
                  type="button"
                  onClick={(e) => handleSkip10(-10, e)}
                  className="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-black/60 hover:bg-black/80 active:scale-90 text-white flex items-center justify-center transition border border-white/10 cursor-pointer shadow-md pointer-events-auto"
                  title="Rewind 10s"
                  aria-label="Rewind 10s"
                >
                  <RotateCcw className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                </button>

                <button
                  type="button"
                  id="pip-play-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleTogglePlay(e);
                  }}
                  className="w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-zinc-950/95 hover:bg-zinc-900 active:scale-95 text-white flex items-center justify-center transition border border-white/20 cursor-pointer shadow-[0_8px_24px_rgba(0,0,0,0.85)] pointer-events-auto select-none"
                  title={playback.isPlaying ? 'Pause' : 'Play'}
                  aria-label={playback.isPlaying ? 'Pause' : 'Play'}
                >
                  {playback.isPlaying ? (
                    <Pause className="w-5 h-5 sm:w-6 sm:h-6 fill-current" />
                  ) : (
                    <Play className="w-5 h-5 sm:w-6 sm:h-6 fill-current ml-0.5" />
                  )}
                </button>

                <button
                  type="button"
                  onClick={(e) => handleSkip10(10, e)}
                  className="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-black/60 hover:bg-black/80 active:scale-90 text-white flex items-center justify-center transition border border-white/10 cursor-pointer shadow-md pointer-events-auto"
                  title="Skip 10s"
                  aria-label="Skip 10s"
                >
                  <RotateCw className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                </button>
              </div>

              {/* Bottom Row: Duration Text */}
              <div
                className="absolute bottom-0 inset-x-0 h-10 bg-gradient-to-t from-black/85 via-black/40 to-transparent flex items-end justify-between px-3 pb-1.5 z-10 select-none"
                onClick={(e) => e.stopPropagation()}
              >
                <span className="text-white text-[10.5px] font-mono font-medium drop-shadow relative z-10">
                  {formatDuration(currentPlaybackSec)} / {formatDuration(totalDuration > 0 ? totalDuration : ((playback.durationMinutes || 0) * 60))}
                </span>
              </div>
            </div>
          )}

          <CloakedVideoPlayer
            encryptedVideoId={playback.encryptedVideoId}
            title={playback.lectureTitle}
            user={effectiveUser}
            batchId={playback.batchId}
            lectureId={playback.lectureId}
            isGuestAllowed={isUserAllowed}
            seekToSeconds={seekSeconds}
            milestones={playback.milestones || []}
            thumbnailUrl={playback.thumbnailUrl}
            isMini={isMinimized}
            autoPlay={true}
            isPlayingProp={playback.isPlaying}
            onPlayStateChange={handlePlayStateChange}
            onProgress={handleProgress}
            onMinimize={handleMinimize}
          />
        </div>
      </div>

      {/* 2. In Minimized View: Unified PiP Bottom Metadata Card & Glowing Progress Bar */}
      {isMinimized && !isInNativePip && (
        <div
          className="px-3 py-2.5 sm:px-3.5 sm:py-2.5 flex items-center justify-between gap-2.5 bg-white dark:bg-[#1a1c22] cursor-pointer relative"
          onClick={handleExpand}
        >
          <div className="min-w-0 flex-1">
            <h4 className="text-xs sm:text-[13px] font-bold text-slate-900 dark:text-zinc-100 truncate leading-snug tracking-tight">
              {playback.lectureTitle}
            </h4>
            <div className="flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-zinc-400 truncate mt-0.5">
              <span className="truncate max-w-[120px] sm:max-w-[180px] font-medium">{playback.batchTitle}</span>
              <span className="text-slate-300 dark:text-zinc-600 font-bold">•</span>
              <span className="font-mono font-semibold text-[10px] text-slate-600 dark:text-zinc-400">
                {formatDuration(currentPlaybackSec)} / {formatDuration(totalDuration > 0 ? totalDuration : ((playback.durationMinutes || 0) * 60))}
              </span>
            </div>
          </div>
          <button
            type="button"
            id="pip-bottom-expand-chevron-btn"
            onClick={(e) => {
              e.stopPropagation();
              handleExpand();
            }}
            className="w-7 h-7 sm:w-8 sm:h-8 rounded-full flex items-center justify-center hover:bg-slate-100 dark:hover:bg-zinc-800 text-slate-600 dark:text-zinc-300 border-none bg-transparent cursor-pointer transition active:scale-90 shrink-0"
            title="Expand to Full Video"
            aria-label="Expand to Full Video"
          >
            <ChevronUp className="w-4 h-4 sm:w-4.5 sm:h-4.5 stroke-[2.2]" />
          </button>

          {/* Embedded linear progress bar */}
          <div className="absolute bottom-0 left-0 right-0 h-[2.5px] bg-slate-200 dark:bg-zinc-800 overflow-hidden pointer-events-none">
            <div
              className="h-full bg-[#0b57d0] dark:bg-[#a8c7fa] transition-all duration-200"
              style={{
                width: `${(() => {
                  const effectiveDur = totalDuration > 0 ? totalDuration : ((playback.durationMinutes || 0) * 60);
                  return effectiveDur > 0 ? Math.min(100, Math.max(0, (currentPlaybackSec / effectiveDur) * 100)) : 0;
                })()}%`,
              }}
            />
          </div>
        </div>
      )}

      {/* 3. In Expanded View: Mobile Scrollable Body / Desktop Grid Placement */}
      {!isMinimized && !isInNativePip && (
        <div 
          className="flex-1 min-h-0 w-full overflow-y-auto overscroll-contain lg:overflow-visible lg:contents space-y-4 lg:space-y-0 px-3.5 sm:px-6 lg:px-0 py-3 lg:py-0 pb-12 lg:pb-0"
          style={{ overscrollBehavior: 'contain', overscrollBehaviorY: 'contain' }}
        >
          {/* Main/Left Column: Title, Badges & Overview */}
          <div className="space-y-4 lg:col-span-7 xl:col-span-8 lg:col-start-1 lg:row-start-2 w-full">
            {/* Title & Actions row */}
            <div className="space-y-2 pt-1 sm:pt-2">
              <h1 className="text-lg sm:text-xl md:text-2xl font-bold text-slate-900 dark:text-zinc-100 leading-snug tracking-tight">
                {playback.lectureTitle}
              </h1>
              <div className="flex flex-wrap items-center justify-between gap-3 pb-1 border-0">
                <div className="flex items-center flex-wrap gap-2">
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white dark:bg-[#1e2024] text-[#0b57d0] dark:text-[#a8c7fa] text-xs font-bold border-0 shadow-[0_1px_3px_rgba(0,0,0,0.06),0_1px_2px_rgba(0,0,0,0.04)]">
                    <BookOpen className="w-3.5 h-3.5" />
                    <span className="truncate max-w-[200px]">{playback.batchTitle}</span>
                  </span>
                  {(totalDuration > 0 || Boolean(playback.durationMinutes)) && (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white dark:bg-[#1e2024] text-slate-700 dark:text-zinc-300 text-xs font-semibold border-0 shadow-[0_1px_3px_rgba(0,0,0,0.06),0_1px_2px_rgba(0,0,0,0.04)]">
                      <Clock className="w-3.5 h-3.5" />
                      <span>
                        {totalDuration > 0
                          ? formatDuration(totalDuration)
                          : `${playback.durationMinutes} mins`}
                      </span>
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* YouTube-style Description Card */}
            <div className="bg-white dark:bg-[#1e2024] rounded-3xl p-4 sm:p-5 space-y-2.5 border-0 shadow-[0_2px_6px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.05)] dark:shadow-[0_2px_8px_rgba(0,0,0,0.35)]">
              <div className="flex items-center justify-between text-xs font-bold text-slate-500 dark:text-zinc-400">
                <span>Lecture Overview</span>
                <span className="text-[11px] font-medium opacity-80">{playback.batchTitle}</span>
              </div>
              <p className="text-xs sm:text-[13px] text-slate-700 dark:text-zinc-200 leading-relaxed whitespace-pre-wrap">
                {playback.lectureDescription || 'Comprehensive recorded session and conceptual curriculum module with practice problems, real-time study notes, and chapter milestones.'}
              </p>

              {playback.milestones && playback.milestones.length > 0 && (
                <div className="pt-2.5 border-t border-slate-100 dark:border-zinc-800">
                  <p className="text-[11px] font-bold text-slate-500 dark:text-zinc-400 mb-2 uppercase tracking-wider">
                    Chapters & Milestones
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {playback.milestones.map((m, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => setSeekSeconds(m.seconds)}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full bg-slate-100 hover:bg-blue-50 dark:bg-zinc-800 dark:hover:bg-blue-950/50 text-[11px] font-semibold text-slate-800 dark:text-zinc-200 border-0 cursor-pointer transition active:scale-95"
                      >
                        <span className="font-mono text-[#0b57d0] dark:text-[#a8c7fa] font-bold">{formatDuration(m.seconds)}</span>
                        <span>{m.title}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Right/Secondary Column (More in this Course + Lecture Notes) */}
          <div className="space-y-5 lg:col-span-5 xl:col-span-4 lg:col-start-8 xl:col-start-9 lg:row-start-1 lg:row-span-2 w-full">
          {/* YouTube-style Course Playlist Queue (Top on Desktop) */}
          {batchLectures.length > 0 && (
            <div className="bg-white dark:bg-[#1e2024] rounded-3xl p-4 sm:p-5 shadow-[0_2px_6px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.05)] dark:shadow-[0_2px_8px_rgba(0,0,0,0.35)] space-y-3 border-0">
              <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-zinc-800">
                <div className="flex items-center space-x-2">
                  <ListVideo className="w-4 h-4 text-[#0b57d0] dark:text-[#a8c7fa]" />
                  <h3 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-zinc-100">
                    More in this Course
                  </h3>
                </div>
                <span className="text-[11px] font-semibold text-slate-500 dark:text-zinc-400">
                  {batchLectures.length} Lectures
                </span>
              </div>

              <div className="space-y-2 max-h-[460px] overflow-y-auto pr-1">
                {batchLectures.map((lec) => {
                  const isCurrent = lec.id === playback.lectureId;
                  return (
                    <div
                      key={lec.id}
                      onClick={() => {
                        if (!isCurrent) switchLecture(lec);
                      }}
                      className={`rounded-2xl overflow-hidden flex flex-row items-stretch p-0 border-0 transition cursor-pointer group relative ${
                        isCurrent
                          ? 'bg-blue-50 dark:bg-blue-950/40 shadow-xs'
                          : 'bg-slate-50 dark:bg-[#141619] hover:bg-slate-100 dark:hover:bg-[#25272c]'
                      }`}
                    >
                      {/* Left: Full edge-to-edge flush video preview on card side */}
                      <div className="relative w-32 sm:w-36 aspect-video shrink-0 self-stretch overflow-hidden bg-black">
                        <img
                          src={getLectureThumbnailUrl(lec)}
                          alt={lec.title}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                          onError={(e) => {
                            const target = e.currentTarget as HTMLImageElement;
                            if (target.src.includes('i.ytimg.com')) {
                              target.src = target.src.replace('i.ytimg.com', 'img.youtube.com');
                            } else if (!target.src.includes('default-course-banner.png')) {
                              target.src = '/assets/default-course-banner.png';
                            }
                          }}
                        />
                        {isCurrent ? (
                          <div className="absolute inset-0 bg-black/50 backdrop-blur-2xs flex items-center justify-center">
                            <div className="w-6 h-6 rounded-full bg-[#0b57d0] text-white flex items-center justify-center shadow-md">
                              <Play className="w-3 h-3 fill-current ml-0.5" />
                            </div>
                          </div>
                        ) : (
                          <span className="absolute bottom-1 right-1 px-1.5 py-0.5 rounded bg-black/80 text-[9px] font-mono font-medium text-white">
                            {(() => {
                              const sec = lec.durationSeconds || watchProgress[lec.id]?.totalSeconds || 0;
                              if (sec > 0) return formatDuration(sec);
                              return lec.durationMinutes ? `${lec.durationMinutes}m` : '15m';
                            })()}
                          </span>
                        )}
                      </div>

                      {/* Right: Content & Metadata */}
                      <div className="flex-1 min-w-0 p-3 sm:p-3.5 flex items-center justify-between gap-2.5">
                        <div className="min-w-0 flex-1 space-y-0.5">
                          {isCurrent && (
                            <span className="text-[10px] font-bold text-[#0b57d0] dark:text-[#a8c7fa] tracking-wider uppercase block">
                              Playing
                            </span>
                          )}
                          <p
                            className={`text-xs sm:text-[13px] font-bold truncate leading-snug ${
                              isCurrent
                                ? 'text-[#0b57d0] dark:text-[#a8c7fa]'
                                : 'text-slate-900 dark:text-zinc-100 group-hover:text-[#0b57d0]'
                            }`}
                          >
                            {lec.title}
                          </p>
                          <p className="text-[11px] text-slate-500 dark:text-zinc-400 truncate leading-normal">
                            {lec.description || playback.batchTitle}
                          </p>
                        </div>
                        {!isCurrent && (
                          <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-[#0b57d0] group-hover:translate-x-0.5 transition shrink-0" />
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Lecture Notes Card (Bottom on Desktop) */}
          <div className="bg-white dark:bg-[#1e2024] rounded-3xl p-4 sm:p-5 shadow-[0_2px_6px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.05)] dark:shadow-[0_2px_8px_rgba(0,0,0,0.35)] space-y-4 border-0">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-zinc-800">
              <div className="flex items-center space-x-2.5">
                <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-950/60 text-[#0b57d0] dark:text-[#a8c7fa] flex items-center justify-center shrink-0">
                  <FileText className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-zinc-100 leading-tight">
                    Lecture Notes
                  </h2>
                  <p className="text-[10px] text-slate-500 dark:text-zinc-400">
                    Personal study notes & key takeaways
                  </p>
                </div>
              </div>
              {currentLectureNotes.length > 0 && (
                <span className="px-2.5 py-0.5 rounded-full bg-slate-100 dark:bg-zinc-800 text-[10px] font-bold text-slate-600 dark:text-zinc-400">
                  {currentLectureNotes.length} saved
                </span>
              )}
            </div>

            {/* Note input form */}
            <form onSubmit={handleCreateNote} className="space-y-2">
              <textarea
                rows={3}
                value={noteInputText}
                onChange={(e) => setNoteInputText(e.target.value)}
                placeholder="Write your study notes, formulas, or key concepts freely..."
                className="w-full px-3.5 py-2.5 rounded-2xl bg-slate-50 dark:bg-zinc-800/60 border-0 text-xs text-slate-900 dark:text-zinc-100 placeholder:text-slate-400 dark:placeholder:text-zinc-500 resize-none focus:outline-hidden focus:ring-1 focus:ring-[#0b57d0] transition"
              />
              <div className="flex items-center justify-end">
                <button
                  type="submit"
                  disabled={!noteInputText.trim()}
                  className="px-4 py-2 rounded-full bg-[#0b57d0] text-white text-xs font-bold border-none cursor-pointer disabled:opacity-50 flex items-center space-x-1.5 hover:bg-[#0842a0] active:scale-95 transition shrink-0 shadow-2xs"
                >
                  <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
                  <span>Save Note</span>
                </button>
              </div>
            </form>

            {/* Saved Notes List */}
            <div className="space-y-2 max-h-64 sm:max-h-72 lg:max-h-80 overflow-y-auto pr-1">
              {currentLectureNotes.length === 0 ? (
                <div className="p-4 text-center rounded-2xl bg-slate-50 dark:bg-zinc-800/40 border-0 space-y-1">
                  <p className="text-xs font-semibold text-slate-800 dark:text-zinc-200">
                    No notes saved yet
                  </p>
                  <p className="text-[10px] text-slate-500 dark:text-zinc-400">
                    Write key concepts or formulas above to review them anytime.
                  </p>
                </div>
              ) : (
                currentLectureNotes.map((note) => (
                  <div
                    key={note.id}
                    className="p-3 rounded-2xl bg-slate-50 dark:bg-zinc-800/60 border-0 flex items-start justify-between gap-2.5 transition hover:shadow-xs group"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-xs sm:text-[13px] text-[var(--md-sys-color-on-surface)] break-words leading-relaxed whitespace-pre-wrap">
                        {note.text}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => deletePersonalNote(note.id)}
                      className="p-1.5 text-slate-400 hover:text-rose-500 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950/20 border-none bg-transparent cursor-pointer shrink-0 transition opacity-80 group-hover:opacity-100"
                      title="Delete Note"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
      )}
    </div>
    </>
  );
};
