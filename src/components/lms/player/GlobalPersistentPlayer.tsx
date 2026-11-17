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
} from 'lucide-react';
import { CloakedVideoPlayer } from './CloakedVideoPlayer';
import { useApp } from '../../../lms/LmsContext';
import { formatDuration, getLectureThumbnailUrl } from '../../../lms/security';
import { useBackHandler, isBrowserFullscreen, exitBrowserFullscreen } from '../../../hooks/useBackNavigation';
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

  if (!playback) return null;

  return (
    <div
      id="global-persistent-player-host"
      className={
        isMinimized
          ? `fixed left-3 right-3 md:left-auto md:right-6 md:w-[360px] md:h-auto h-15 sm:h-16 z-50 bg-white dark:bg-[#1a1c22] backdrop-blur-2xl rounded-2xl shadow-none md:shadow-[0_12px_40px_rgba(0,0,0,0.22),0_4px_12px_rgba(0,0,0,0.12)] dark:shadow-none dark:md:shadow-[0_16px_48px_rgba(0,0,0,0.75)] border border-slate-200/90 dark:border-zinc-800/90 p-0 transition-all duration-200 select-none cursor-pointer overflow-hidden md:!bottom-6 ${
              !isTestMode ? 'flex flex-row md:flex-col items-center md:items-stretch justify-between' : 'hidden'
            }`
          : 'fixed inset-x-0 bottom-0 top-0 md:top-[58px] z-50 md:z-40 bg-[var(--md-sys-color-background)] overflow-y-auto px-0 lg:px-8 py-0 lg:py-6 grid grid-cols-1 lg:grid-cols-12 gap-4 lg:gap-6 max-w-[1720px] mx-auto w-full items-start'
      }
      style={
        isMinimized
          ? {
              bottom: isBottomNavVisible
                ? 'calc(76px + env(safe-area-inset-bottom, 0px))'
                : 'calc(14px + env(safe-area-inset-bottom, 0px))',
            }
          : undefined
      }
      onClick={isMinimized ? handleExpand : undefined}
    >
      {/* 1. THE PERSISTENT VIDEO PLAYER FRAME & WATCH INFO (Left 8 cols on desktop, NEVER UNMOUNTS) */}
      <div
        className={
          isMinimized
            ? 'w-24 sm:w-28 md:w-full h-full md:h-auto md:aspect-video shrink-0 rounded-l-2xl md:rounded-l-none md:rounded-t-2xl overflow-hidden relative bg-black border-r md:border-r-0 md:border-b border-slate-200/50 dark:border-zinc-800/50 group/minivid'
            : 'lg:col-span-8 space-y-4 w-full pt-0'
        }
      >
        <div
          className={
            isMinimized
              ? 'w-full h-full relative overflow-hidden flex items-center justify-center bg-black'
              : 'aspect-video w-full sticky top-0 z-40 bg-black shadow-none rounded-none lg:rounded-3xl lg:shadow-lg overflow-hidden group lg:static'
          }
        >
          {/* YouTube Desktop Miniplayer Hover Controls Overlay */}
          {isMinimized && (
            <div
              className={`hidden md:flex absolute inset-0 z-30 transition-opacity duration-200 flex-col justify-between pointer-events-auto select-none ${
                !playback.isPlaying || isMiniControlsActive
                  ? 'opacity-100'
                  : 'opacity-0 group-hover/minivid:opacity-100'
              }`}
              onMouseEnter={() => showMiniControlsForDuration(5000)}
              onClick={(e) => {
                e.stopPropagation();
                handleTogglePlay(e);
              }}
            >
              {/* Top Row: Solid black base with gradient completely covering YouTube title and channel avatar */}
              <div
                className="w-full h-16 sm:h-18 bg-gradient-to-b from-black from-75% via-black/95 to-transparent flex items-start justify-between px-2.5 pt-2 z-10 relative"
                onClick={(e) => e.stopPropagation()}
              >
                {/* Solid Top Cloak (Zero bleed for YouTube title/channel header) */}
                <div className="absolute top-0 inset-x-0 h-10 bg-black pointer-events-none -z-1" />
                <button
                  type="button"
                  id="desktop-miniplayer-expand-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleExpand();
                  }}
                  className="w-7 h-7 rounded-full bg-black/70 hover:bg-black active:scale-90 text-white flex items-center justify-center transition border-none cursor-pointer shadow-md relative z-10"
                  title="Expand to Full Video"
                  aria-label="Expand to Full Video"
                >
                  <Maximize2 className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  id="desktop-miniplayer-close-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleClose(e);
                  }}
                  className="w-7 h-7 rounded-full bg-black/70 hover:bg-rose-600 active:scale-90 text-white flex items-center justify-center transition border-none cursor-pointer shadow-md relative z-10"
                  title="Close Video"
                  aria-label="Close Video"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Center: Play/Pause Big Button */}
              <div className="flex items-center justify-center flex-1">
                <button
                  type="button"
                  id="desktop-miniplayer-play-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleTogglePlay(e);
                  }}
                  className="w-13 h-13 rounded-full bg-black/85 hover:bg-black active:scale-90 text-white flex items-center justify-center transition border border-white/20 cursor-pointer shadow-2xl"
                  title={playback.isPlaying ? 'Pause' : 'Play'}
                  aria-label={playback.isPlaying ? 'Pause' : 'Play'}
                >
                  {playback.isPlaying ? (
                    <Pause className="w-6 h-6 fill-current" />
                  ) : (
                    <Play className="w-6 h-6 fill-current ml-0.5" />
                  )}
                </button>
              </div>

              {/* Bottom Row: Solid jet-black base + gradient completely covering YouTube official buttons, share, alerts & endcards for 5s */}
              <div
                className="w-full h-16 sm:h-20 bg-gradient-to-t from-black from-70% via-black/95 to-transparent flex items-end justify-between px-3 pb-2.5 z-10 select-none relative"
                onClick={(e) => e.stopPropagation()}
              >
                {/* 100% Solid Black Bottom Shield (Completely hides YouTube share, alerts strip and related video boxes) */}
                <div className="absolute bottom-0 inset-x-0 h-11 bg-black pointer-events-none -z-1" />
                <span className="text-white text-[11px] font-mono font-medium drop-shadow relative z-10">
                  {formatDuration(currentPlaybackSec)} / {formatDuration(totalDuration > 0 ? totalDuration : ((playback.durationMinutes || 0) * 60))}
                </span>
              </div>
            </div>
          )}

          {/* Desktop Miniplayer Bottom Edge Linear Progress Line */}
          {isMinimized && (
            <div className="hidden md:block absolute bottom-0 inset-x-0 h-[3px] bg-slate-400/40 dark:bg-zinc-700/80 overflow-hidden z-35 pointer-events-none">
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

        {/* When Expanded: Lecture Title, Badge, Duration, and YouTube-style Description Card */}
        {!isMinimized && (
          <div className="space-y-4 px-3.5 sm:px-6 lg:px-0">
            {/* Title & Actions row */}
            <div className="space-y-2 pt-1">
              <h1 className="text-base sm:text-xl md:text-2xl font-bold text-[var(--md-sys-color-on-surface)] leading-snug tracking-tight">
                {playback.lectureTitle}
              </h1>
              <div className="flex flex-wrap items-center justify-between gap-3 pb-2 border-b border-[var(--md-sys-color-outline-variant)]/20">
                <div className="flex items-center flex-wrap gap-2">
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[var(--md-sys-color-primary-container)] text-[var(--md-sys-color-on-primary-container)] text-xs font-bold shadow-2xs">
                    <BookOpen className="w-3.5 h-3.5" />
                    <span className="truncate max-w-[200px]">{playback.batchTitle}</span>
                  </span>
                  {(totalDuration > 0 || Boolean(playback.durationMinutes)) && (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[var(--md-sys-color-surface-container-high)] text-[var(--md-sys-color-on-surface-variant)] text-xs font-medium">
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
            <div className="bg-[var(--md-sys-color-surface-container)] rounded-2xl sm:rounded-3xl p-4 sm:p-5 space-y-2 border border-[var(--md-sys-color-outline-variant)]/10 shadow-xs">
              <div className="flex items-center justify-between text-xs font-bold text-[var(--md-sys-color-on-surface-variant)]">
                <span>Lecture Overview</span>
                <span className="text-[11px] font-medium opacity-80">{playback.batchTitle}</span>
              </div>
              <p className="text-xs sm:text-[13px] text-[var(--md-sys-color-on-surface)] leading-relaxed whitespace-pre-wrap">
                {playback.lectureDescription || 'Comprehensive recorded session and conceptual curriculum module with practice problems, real-time study notes, and chapter milestones.'}
              </p>

              {playback.milestones && playback.milestones.length > 0 && (
                <div className="pt-2 border-t border-[var(--md-sys-color-outline-variant)]/15">
                  <p className="text-[11px] font-bold text-[var(--md-sys-color-on-surface-variant)] mb-1.5 uppercase tracking-wider">
                    Chapters & Milestones
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {playback.milestones.map((m, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => setSeekSeconds(m.seconds)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[var(--md-sys-color-surface-container-high)] hover:bg-[var(--md-sys-color-primary-container)] hover:text-[var(--md-sys-color-on-primary-container)] text-[11px] font-medium text-[var(--md-sys-color-on-surface)] border-none cursor-pointer transition"
                      >
                        <span className="font-mono text-[var(--md-sys-color-primary)] font-bold">{formatDuration(m.seconds)}</span>
                        <span>{m.title}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* 2. In Minimized View: Strip Content (Title, Batch, Length Count, Play/Pause, Close) */}
      {isMinimized && (
        <>
          {/* DESKTOP MINIPLAYER BOTTOM CARD (Metadata & Expand Chevron) */}
          <div
            className="hidden md:flex px-4 py-3 items-center justify-between gap-3 bg-white dark:bg-[#1a1c22] cursor-pointer"
            onClick={handleExpand}
          >
            <div className="min-w-0 flex-1">
              <h4 className="text-xs sm:text-[13px] font-bold text-slate-900 dark:text-zinc-100 truncate leading-snug tracking-tight">
                {playback.lectureTitle}
              </h4>
              <p className="text-[11px] text-slate-500 dark:text-zinc-400 truncate mt-0.5">
                {playback.batchTitle}
              </p>
            </div>
            <button
              type="button"
              id="desktop-miniplayer-expand-chevron-btn"
              onClick={(e) => {
                e.stopPropagation();
                handleExpand();
              }}
              className="w-7 h-7 rounded-full flex items-center justify-center hover:bg-slate-100 dark:hover:bg-zinc-800 text-slate-600 dark:text-zinc-300 border-none bg-transparent cursor-pointer transition active:scale-90 shrink-0"
              title="Expand to Full Video"
              aria-label="Expand to Full Video"
            >
              <ChevronUp className="w-4 h-4 stroke-[2.2]" />
            </button>
          </div>

          {/* MOBILE MINIPLAYER STRIP CONTENT */}
          <div className="md:hidden flex-1 min-w-0 pl-3 sm:pl-3.5 pr-2 py-1 flex flex-col justify-center">
            <h4 className="text-xs sm:text-[13px] font-bold text-slate-900 dark:text-zinc-100 truncate leading-snug tracking-tight">
              {playback.lectureTitle}
            </h4>
            <div className="flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-zinc-400 truncate mt-0.5">
              <span className="truncate max-w-[120px] sm:max-w-[170px] font-medium">{playback.batchTitle}</span>
              {(() => {
                const effectiveDur = totalDuration > 0 ? totalDuration : ((playback.durationMinutes || 0) * 60);
                return effectiveDur > 0 ? (
                  <>
                    <span className="text-slate-300 dark:text-zinc-600 font-bold">•</span>
                    <span className="font-mono font-semibold text-[10px] text-slate-600 dark:text-zinc-400">
                      {formatDuration(currentPlaybackSec)} / {formatDuration(effectiveDur)}
                    </span>
                  </>
                ) : null;
              })()}
            </div>
          </div>

          {/* MOBILE ACTION BUTTONS */}
          <div className="md:hidden flex items-center gap-1 pr-2 sm:pr-3 shrink-0" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              id="miniplayer-expand-to-full-btn"
              onClick={handleExpand}
              className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-slate-100 dark:hover:bg-zinc-800 text-slate-700 dark:text-zinc-200 border-none bg-transparent cursor-pointer transition active:scale-90"
              title="Expand to Full Video"
              aria-label="Expand to Full Video"
            >
              <ChevronUp className="w-4.5 h-4.5 stroke-[2.2]" />
            </button>
            <button
              type="button"
              id="miniplayer-toggle-play-btn"
              onClick={handleTogglePlay}
              className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-slate-100 dark:hover:bg-zinc-800 text-slate-800 dark:text-zinc-200 border-none bg-transparent cursor-pointer transition active:scale-90"
              title={playback.isPlaying ? 'Pause' : 'Play'}
            >
              {playback.isPlaying ? (
                <Pause className="w-4.5 h-4.5 fill-current" />
              ) : (
                <Play className="w-4.5 h-4.5 fill-current ml-0.5" />
              )}
            </button>
            <button
              type="button"
              id="miniplayer-close-strip-btn"
              onClick={handleClose}
              className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-rose-50 dark:hover:bg-rose-950/30 text-slate-400 hover:text-rose-500 dark:text-zinc-500 dark:hover:text-rose-400 border-none bg-transparent cursor-pointer transition active:scale-90"
              title="Close video"
            >
              <X className="w-4.5 h-4.5 stroke-[2.2]" />
            </button>
          </div>

          {/* Mobile linear progress bar embedded strictly inside the card */}
          <div className="md:hidden absolute bottom-0 left-0 right-0 h-[2.5px] bg-slate-100 dark:bg-zinc-800/80 overflow-hidden rounded-b-2xl pointer-events-none">
            <div
              className="h-full bg-[#0b57d0] dark:bg-[#a8c7fa] transition-all duration-200 rounded-r-full"
              style={{
                width: `${(() => {
                  const effectiveDur = totalDuration > 0 ? totalDuration : ((playback.durationMinutes || 0) * 60);
                  return effectiveDur > 0 ? Math.min(100, Math.max(0, (currentPlaybackSec / effectiveDur) * 100)) : 0;
                })()}%`,
              }}
            />
          </div>
        </>
      )}

      {/* 3. In Expanded View: Right Sidebar (Course Playlist Queue + Lecture Notes) */}
      {!isMinimized && (
        <div className="lg:col-span-4 space-y-5 w-full px-3.5 sm:px-6 lg:px-0">
          {/* YouTube-style Course Playlist Queue (Top on Desktop) */}
          {batchLectures.length > 0 && (
            <div className="bg-[var(--md-sys-color-surface-container)] rounded-2xl sm:rounded-3xl p-4 sm:p-5 shadow-xs space-y-3 border border-[var(--md-sys-color-outline-variant)]/10">
              <div className="flex items-center justify-between pb-2 border-b border-[var(--md-sys-color-outline-variant)]/15">
                <div className="flex items-center space-x-2">
                  <ListVideo className="w-4 h-4 text-[var(--md-sys-color-primary)]" />
                  <h3 className="text-xs sm:text-sm font-bold text-[var(--md-sys-color-on-surface)]">
                    More in this Course
                  </h3>
                </div>
                <span className="text-[11px] font-semibold text-[var(--md-sys-color-on-surface-variant)]">
                  {batchLectures.length} Lectures
                </span>
              </div>

              <div className="space-y-2 max-h-[380px] overflow-y-auto pr-1">
                {batchLectures.map((lec) => {
                  const isCurrent = lec.id === playback.lectureId;
                  return (
                    <div
                      key={lec.id}
                      onClick={() => {
                        if (!isCurrent) switchLecture(lec);
                      }}
                      className={`rounded-2xl sm:rounded-3xl overflow-hidden flex flex-row items-stretch p-0 border transition cursor-pointer group shadow-2xs hover:shadow-xs relative ${
                        isCurrent
                          ? 'bg-[var(--md-sys-color-primary-container)]/25 border-[var(--md-sys-color-primary)]/40'
                          : 'bg-[var(--md-sys-color-surface)] hover:bg-[var(--md-sys-color-surface-container-high)] border-[var(--md-sys-color-outline-variant)]/15'
                      }`}
                    >
                      {/* Left: Full edge-to-edge flush video preview on card side */}
                      <div className="relative w-32 sm:w-36 aspect-video shrink-0 self-stretch overflow-hidden bg-black">
                        <img
                          src={getLectureThumbnailUrl(lec)}
                          alt={lec.title}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                          onError={(e) => {
                            (e.currentTarget as HTMLImageElement).src = '/assets/default-course-banner.png';
                          }}
                        />
                        {isCurrent ? (
                          <div className="absolute inset-0 bg-black/50 backdrop-blur-2xs flex items-center justify-center">
                            <div className="w-6 h-6 rounded-full bg-[var(--md-sys-color-primary)] text-white flex items-center justify-center shadow-md">
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
                            <span className="text-[10px] font-bold text-[var(--md-sys-color-primary)] tracking-wider uppercase block">
                              Playing
                            </span>
                          )}
                          <p
                            className={`text-xs sm:text-[13px] font-bold truncate leading-snug ${
                              isCurrent
                                ? 'text-[var(--md-sys-color-primary)]'
                                : 'text-[var(--md-sys-color-on-surface)] group-hover:text-[var(--md-sys-color-primary)]'
                            }`}
                          >
                            {lec.title}
                          </p>
                          <p className="text-[11px] text-[var(--md-sys-color-on-surface-variant)] truncate leading-normal">
                            {lec.description || playback.batchTitle}
                          </p>
                        </div>
                        {!isCurrent && (
                          <ChevronRight className="w-4 h-4 text-[var(--md-sys-color-outline)] group-hover:text-[var(--md-sys-color-primary)] group-hover:translate-x-0.5 transition shrink-0" />
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Lecture Notes Card (Bottom on Desktop) */}
          <div className="bg-[var(--md-sys-color-surface-container)] rounded-2xl sm:rounded-3xl p-4 sm:p-5 shadow-xs space-y-4 border border-[var(--md-sys-color-outline-variant)]/10">
            <div className="flex items-center justify-between pb-2 border-b border-[var(--md-sys-color-outline-variant)]/15">
              <div className="flex items-center space-x-2.5">
                <div className="w-8 h-8 rounded-full bg-[var(--md-sys-color-primary-container)] text-[var(--md-sys-color-on-primary-container)] flex items-center justify-center shrink-0">
                  <FileText className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-xs sm:text-sm font-bold text-[var(--md-sys-color-on-surface)] leading-tight">
                    Lecture Notes
                  </h2>
                  <p className="text-[10px] text-[var(--md-sys-color-on-surface-variant)]">
                    Personal study notes & key takeaways
                  </p>
                </div>
              </div>
              {currentLectureNotes.length > 0 && (
                <span className="px-2 py-0.5 rounded-full bg-[var(--md-sys-color-surface-container-high)] text-[10px] font-bold text-[var(--md-sys-color-on-surface-variant)]">
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
                className="w-full px-3 py-2.5 rounded-xl bg-[var(--md-sys-color-surface)] border border-[var(--md-sys-color-outline-variant)]/40 text-xs text-[var(--md-sys-color-on-surface)] placeholder:text-[var(--md-sys-color-on-surface-variant)]/60 resize-none focus:outline-hidden focus:border-[var(--md-sys-color-primary)] transition"
              />
              <div className="flex items-center justify-end">
                <button
                  type="submit"
                  disabled={!noteInputText.trim()}
                  className="px-4 py-2 rounded-xl bg-[var(--md-sys-color-primary)] text-[var(--md-sys-color-on-primary)] text-xs font-bold border-none cursor-pointer disabled:opacity-50 flex items-center space-x-1.5 hover:opacity-95 active:scale-95 transition shrink-0 shadow-2xs"
                >
                  <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
                  <span>Save Note</span>
                </button>
              </div>
            </form>

            {/* Saved Notes List */}
            <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
              {currentLectureNotes.length === 0 ? (
                <div className="p-4 text-center rounded-2xl bg-[var(--md-sys-color-surface)]/60 border border-[var(--md-sys-color-outline-variant)]/10 space-y-1">
                  <p className="text-xs font-semibold text-[var(--md-sys-color-on-surface)]">
                    No notes saved yet
                  </p>
                  <p className="text-[10px] text-[var(--md-sys-color-on-surface-variant)]">
                    Write key concepts or formulas above to review them anytime.
                  </p>
                </div>
              ) : (
                currentLectureNotes.map((note) => (
                  <div
                    key={note.id}
                    className="p-3 rounded-2xl bg-[var(--md-sys-color-surface)] border border-[var(--md-sys-color-outline-variant)]/20 flex items-start justify-between gap-2.5 transition hover:shadow-xs group"
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
      )}
    </div>
  );
};
