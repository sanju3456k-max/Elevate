import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Play,
  Pause,
  X,
  ChevronDown,
  Clock,
  FileText,
  Plus,
  Trash2,
  ChevronRight,
} from 'lucide-react';
import { CloakedVideoPlayer } from './CloakedVideoPlayer';
import { useApp } from '../../../lms/LmsContext';
import { formatDuration } from '../../../lms/security';
import { useBackHandler } from '../../../hooks/useBackNavigation';
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

  // Back handler when expanded: Minimize to strip on back press (YouTube style)
  useBackHandler({
    isOpen: Boolean(playback && !playback.isMinimized),
    priority: 50,
    id: 'global_persistent_player_back',
    onBack: () => {
      onUpdatePlayback((prev) => (prev ? { ...prev, isMinimized: true } : null));
    },
  });

  const isPrimaryTab = ['home', 'batches', 'tests', 'analytics'].includes(activeTab);
  const isBottomNavVisible = isPrimaryTab && !isInsideBatch;
  const isMinimized = playback?.isMinimized ?? true;

  const handleMinimize = useCallback((e?: React.MouseEvent) => {
    e?.stopPropagation();
    onUpdatePlayback((prev) => (prev ? { ...prev, isMinimized: true } : null));
  }, [onUpdatePlayback]);

  const handleExpand = useCallback(() => {
    onUpdatePlayback((prev) => (prev ? { ...prev, isMinimized: false } : null));
  }, [onUpdatePlayback]);

  const handleTogglePlay = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onUpdatePlayback((prev) => (prev ? { ...prev, isPlaying: !prev.isPlaying } : null));
  }, [onUpdatePlayback]);

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

  // Other lectures in the same batch for quick playlist switching
  const otherLectures = useMemo(() => {
    if (!playback) return [];
    return lectures.filter((l) => l.batchId === playback.batchId && l.id !== playback.lectureId);
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
          ? `fixed left-3 right-3 ${
              isBottomNavVisible ? 'bottom-[68px] md:bottom-4' : 'bottom-3 md:bottom-4'
            } md:left-auto md:right-4 md:w-[390px] z-50 bg-[var(--md-sys-color-surface-container-high)]/95 dark:bg-[#1e2024]/95 backdrop-blur-xl rounded-2xl shadow-[0_8px_30px_rgba(0,0,0,0.32)] border border-[var(--md-sys-color-outline-variant)]/25 p-2 transition-all duration-200 select-none cursor-pointer ${
              isPrimaryTab ? 'flex items-center justify-between gap-3' : 'hidden'
            }`
          : 'fixed inset-0 z-50 bg-[var(--md-sys-color-background)] overflow-y-auto flex flex-col'
      }
      onClick={isMinimized ? handleExpand : undefined}
    >
      {/* 1. In Expanded View: Top Bar on Desktop */}
      {!isMinimized && (
        <div className="hidden sm:flex h-14 sm:h-16 px-4 sm:px-6 border-b border-[var(--md-sys-color-outline-variant)]/20 items-center justify-between shrink-0 bg-[var(--md-sys-color-surface)] sticky top-0 z-50 backdrop-blur-md">
          <div className="flex items-center space-x-3 min-w-0">
            <button
              type="button"
              id="watch-minimize-btn"
              onClick={handleMinimize}
              className="flex items-center space-x-1.5 px-3 py-1.5 rounded-full bg-[var(--md-sys-color-surface-container-high)] hover:bg-[var(--md-sys-color-surface-container-highest)] text-xs font-bold text-[var(--md-sys-color-on-surface)] transition cursor-pointer border-none active:scale-95 shrink-0"
              title="Minimize to miniplayer strip"
            >
              <ChevronDown className="w-4 h-4 stroke-[2.5]" />
              <span className="hidden sm:inline">Minimize</span>
            </button>
            <div className="min-w-0">
              <h3 className="text-xs sm:text-sm font-bold text-[var(--md-sys-color-on-surface)] truncate">
                {playback.lectureTitle}
              </h3>
              <p className="text-[10px] sm:text-xs text-[var(--md-sys-color-on-surface-variant)] truncate">
                {playback.batchTitle}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="w-8 h-8 rounded-full flex items-center justify-center text-[var(--md-sys-color-on-surface-variant)] hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/20 transition cursor-pointer border-none bg-transparent shrink-0"
            title="Close video"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      )}

      {/* 2. THE PERSISTENT VIDEO PLAYER FRAME (Sticky on Mobile, NEVER UNMOUNTS) */}
      <div
        className={
          isMinimized
            ? 'w-24 sm:w-28 h-14 sm:h-16 aspect-video rounded-xl overflow-hidden relative shrink-0 bg-black pointer-events-none'
            : 'sticky top-0 z-40 sm:static w-full sm:max-w-5xl sm:mx-auto px-0 sm:px-4 pt-0 sm:pt-4 shrink-0 bg-black'
        }
      >
        <div
          className={
            isMinimized
              ? 'w-full h-full'
              : 'aspect-video w-full rounded-none sm:rounded-3xl overflow-hidden shadow-2xl relative group bg-black'
          }
        >
          {/* Top-left minimize button on video for mobile when expanded */}
          {!isMinimized && (
            <button
              type="button"
              onClick={handleMinimize}
              className="absolute top-2.5 left-2.5 z-30 w-8 h-8 rounded-full bg-black/60 hover:bg-black/80 active:scale-95 text-white flex items-center justify-center backdrop-blur-md transition border-none cursor-pointer shadow-md select-none"
              title="Minimize to bottom strip"
            >
              <ChevronDown className="w-5 h-5 stroke-[2.5]" />
            </button>
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
            onProgress={(sec, total) => {
              setCurrentPlaybackSec(sec);
              setTotalDuration(total);
              updateWatchProgress(playback.lectureId, sec, total);
            }}
          />
        </div>
      </div>

      {/* 3. In Minimized View: Strip Content (Title, Play/Pause, Close) */}
      {isMinimized && (
        <>
          <div className="flex-1 min-w-0 pr-1">
            <h4 className="text-xs sm:text-sm font-bold text-[var(--md-sys-color-on-surface)] truncate leading-snug">
              {playback.lectureTitle}
            </h4>
            <p className="text-[10px] text-[var(--md-sys-color-on-surface-variant)] truncate mt-0.5">
              {playback.batchTitle}
            </p>
          </div>

          <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              id="miniplayer-toggle-play-btn"
              onClick={handleTogglePlay}
              className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-black/10 dark:hover:bg-white/10 text-[var(--md-sys-color-on-surface)] border-none bg-transparent cursor-pointer transition active:scale-90"
              title={playback.isPlaying ? 'Pause' : 'Play'}
            >
              {playback.isPlaying ? (
                <Pause className="w-4 h-4 fill-current" />
              ) : (
                <Play className="w-4 h-4 fill-current ml-0.5" />
              )}
            </button>
            <button
              type="button"
              id="miniplayer-close-strip-btn"
              onClick={handleClose}
              className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-black/10 dark:hover:bg-white/10 text-[var(--md-sys-color-on-surface-variant)] hover:text-rose-500 border-none bg-transparent cursor-pointer transition active:scale-90"
              title="Close video"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* YouTube-style linear progress bar at bottom of mini strip */}
          <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-black/20 overflow-hidden rounded-b-2xl">
            <div
              className="h-full bg-[var(--md-sys-color-primary)] transition-all duration-300"
              style={{
                width: `${totalDuration > 0 ? (currentPlaybackSec / totalDuration) * 100 : 0}%`,
              }}
            />
          </div>
        </>
      )}

      {/* 4. In Expanded View: Watch Details & Lecture Notes */}
      {!isMinimized && (
        <div className="max-w-5xl mx-auto w-full px-4 sm:px-4 py-4 sm:py-6 flex-1 grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Lecture Info on Left */}
          <div className="lg:col-span-7 space-y-4">
            <div className="bg-[var(--md-sys-color-surface-container)] rounded-2xl sm:rounded-3xl p-4 sm:p-5 space-y-2 shadow-xs">
              <h1 className="text-base sm:text-lg font-bold text-[var(--md-sys-color-on-surface)] leading-snug">
                {playback.lectureTitle}
              </h1>
              <p className="text-xs text-[var(--md-sys-color-on-surface-variant)] leading-relaxed">
                {playback.lectureDescription || 'Comprehensive recorded session and conceptual curriculum module.'}
              </p>
            </div>

            {/* Up Next in Batch */}
            {otherLectures.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-xs font-bold text-[var(--md-sys-color-on-surface-variant)] uppercase tracking-wider">
                  More in this Course
                </h3>
                <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                  {otherLectures.map((lec) => (
                    <div
                      key={lec.id}
                      onClick={() => switchLecture(lec)}
                      className="p-2.5 rounded-xl bg-[var(--md-sys-color-surface-container)] hover:bg-[var(--md-sys-color-surface-container-high)] flex items-center justify-between gap-3 cursor-pointer transition group"
                    >
                      <div className="flex items-center space-x-2.5 min-w-0">
                        <div className="w-16 h-10 aspect-video rounded-lg overflow-hidden bg-black shrink-0 relative">
                          <img
                            src={lec.thumbnailUrl || '/assets/default-course-banner.png'}
                            alt={lec.title}
                            className="w-full h-full object-cover"
                            onError={(e) => {
                              (e.currentTarget as HTMLImageElement).src = '/assets/default-course-banner.png';
                            }}
                          />
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-[var(--md-sys-color-on-surface)] truncate group-hover:text-[var(--md-sys-color-primary)]">
                            {lec.title}
                          </p>
                          <span className="text-[10px] text-[var(--md-sys-color-on-surface-variant)]">
                            {lec.durationMinutes} mins
                          </span>
                        </div>
                      </div>
                      <ChevronRight className="w-4 h-4 text-[var(--md-sys-color-on-surface-variant)] group-hover:translate-x-0.5 transition" />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Lecture Notes on Right (Free-form without timing stamps) */}
          <div className="lg:col-span-5 space-y-4">
            <div className="bg-[var(--md-sys-color-surface-container)] rounded-2xl sm:rounded-3xl p-4 sm:p-5 shadow-xs space-y-4">
              <div className="flex items-center justify-between pb-2 border-b border-[var(--md-sys-color-outline-variant)]/20">
                <div className="flex items-center space-x-2">
                  <div className="w-8 h-8 rounded-full bg-[var(--md-sys-color-primary-container)] text-[var(--md-sys-color-on-primary-container)] flex items-center justify-center">
                    <FileText className="w-4 h-4" />
                  </div>
                  <div>
                    <h2 className="text-xs sm:text-sm font-bold text-[var(--md-sys-color-on-surface)] leading-tight">
                      Lecture Notes
                    </h2>
                    <p className="text-[10px] text-[var(--md-sys-color-on-surface-variant)]">
                      Write and save your personal study notes freely
                    </p>
                  </div>
                </div>
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
                    className="px-4 py-2 rounded-xl bg-[var(--md-sys-color-primary)] text-[var(--md-sys-color-on-primary)] text-xs font-bold border-none cursor-pointer disabled:opacity-50 flex items-center space-x-1.5 hover:opacity-95 active:scale-95 transition shrink-0"
                  >
                    <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
                    <span>Save Note</span>
                  </button>
                </div>
              </form>

              {/* Saved Notes List (Clean typography without timing stamps) */}
              <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                {currentLectureNotes.length === 0 ? (
                  <div className="p-4 text-center rounded-2xl bg-[var(--md-sys-color-surface)]/60 border border-[var(--md-sys-color-outline-variant)]/10 space-y-1">
                    <p className="text-xs font-semibold text-[var(--md-sys-color-on-surface)]">
                      No notes yet
                    </p>
                    <p className="text-[10px] text-[var(--md-sys-color-on-surface-variant)]">
                      Write your notes, formulas, or insights above and save them freely.
                    </p>
                  </div>
                ) : (
                  currentLectureNotes.map((note) => (
                    <div
                      key={note.id}
                      className="p-3 rounded-2xl bg-[var(--md-sys-color-surface)] border border-[var(--md-sys-color-outline-variant)]/20 flex items-start justify-between gap-2.5 transition hover:shadow-xs group"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-xs sm:text-sm text-[var(--md-sys-color-on-surface)] break-words leading-relaxed whitespace-pre-wrap">
                          {note.text}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => deletePersonalNote(note.id)}
                        className="p-1.5 text-slate-400 hover:text-rose-500 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950/20 border-none bg-transparent cursor-pointer shrink-0 transition"
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
  );
};
