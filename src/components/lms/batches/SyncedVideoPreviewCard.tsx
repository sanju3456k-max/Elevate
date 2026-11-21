import React from 'react';
import { VideoMetadata, formatDurationLabel } from '../../../lms/videoMetadataService';
import { Check, RefreshCw, Youtube, Clock, User, Sparkles } from 'lucide-react';
import { M3CircularProgress } from '../../ui/Material3';

interface SyncedVideoPreviewCardProps {
  videoId: string | null;
  metadata: VideoMetadata | null;
  isLoading: boolean;
  onRefresh?: () => void;
  className?: string;
}

export const SyncedVideoPreviewCard: React.FC<SyncedVideoPreviewCardProps> = ({
  videoId,
  metadata,
  isLoading,
  onRefresh,
  className = '',
}) => {
  if (!videoId) return null;

  const thumbnailSrc =
    metadata?.rawThumbnailUrl ||
    '/assets/default-course-banner.png';

  const durationText = metadata?.durationSeconds
    ? formatDurationLabel(metadata.durationSeconds, true)
    : metadata?.durationMinutes
    ? `${metadata.durationMinutes} min`
    : null;

  return (
    <div
      className={`rounded-2xl border border-[var(--md-sys-color-outline-variant)]/40 bg-[var(--md-sys-color-surface-container-low)] p-3 transition-all ${className}`}
    >
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
        {/* 16:9 Thumbnail Image with Duration Badge */}
        <div className="relative w-full sm:w-36 aspect-video rounded-xl overflow-hidden bg-black shrink-0 shadow-xs border border-white/10 group">
          <img
            src={thumbnailSrc}
            alt={metadata?.title || 'Lecture Video'}
            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).src = '/assets/default-course-banner.png';
            }}
          />
          {durationText && (
            <div className="absolute bottom-1.5 right-1.5 px-1.5 py-0.5 rounded-md bg-black/80 backdrop-blur-xs text-[10px] font-bold text-white font-mono flex items-center space-x-1 shadow-xs">
              <Clock className="w-2.5 h-2.5 text-amber-400" />
              <span>{durationText}</span>
            </div>
          )}
          <div className="absolute top-1.5 left-1.5 w-5 h-5 rounded-md bg-red-600/90 text-white flex items-center justify-center shadow-xs">
            <Youtube className="w-3 h-3" />
          </div>
        </div>

        {/* Video Metadata & Auto-Sync Status */}
        <div className="flex-1 min-w-0 w-full space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
              <Check className="w-3 h-3" />
              <span>YouTube Synced</span>
            </span>

            {onRefresh && (
              <button
                type="button"
                onClick={onRefresh}
                disabled={isLoading}
                title="Re-sync details from YouTube"
                className="inline-flex items-center gap-1 text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 bg-transparent border-none cursor-pointer p-1 rounded-lg hover:bg-indigo-500/10 transition"
              >
                <RefreshCw className={`w-3 h-3 ${isLoading ? 'animate-spin' : ''}`} />
                <span className="hidden sm:inline">Re-sync</span>
              </button>
            )}
          </div>

          <h5 className="text-xs font-bold text-[var(--md-sys-color-on-surface)] truncate" title={metadata?.title || 'YouTube Video'}>
            {metadata?.title || (isLoading ? 'Fetching video title...' : 'YouTube Video')}
          </h5>

          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-[var(--md-sys-color-on-surface-variant)]">
            {metadata?.author && (
              <span className="flex items-center gap-1 truncate max-w-[140px]">
                <User className="w-3 h-3 text-slate-400" />
                <span className="truncate">{metadata.author}</span>
              </span>
            )}
            {durationText && (
              <span className="flex items-center gap-1 font-medium">
                <Clock className="w-3 h-3 text-slate-400" />
                <span>{durationText}</span>
              </span>
            )}
            <span className="font-mono text-[10px] opacity-75">ID: {videoId}</span>
          </div>

          <div className="text-[10px] text-[var(--md-sys-color-on-surface-variant)] flex items-center gap-1 pt-0.5">
            <Sparkles className="w-3 h-3 text-amber-500 shrink-0" />
            <span>Title and timing auto-filled below. You can edit them freely.</span>
          </div>
        </div>
      </div>
    </div>
  );
};
