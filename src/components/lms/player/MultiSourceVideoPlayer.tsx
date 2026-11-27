import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  Maximize2,
  ExternalLink,
  AlertCircle,
  Tv,
  Loader2,
} from 'lucide-react';
import { resolveVideoSource, type ResolvedVideoSource } from '../../../lib/videoSourceResolver';

interface MultiSourceVideoPlayerProps {
  url: string;
  title?: string;
  autoPlay?: boolean;
}

function formatClock(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return '0:00';
  const total = Math.floor(sec);
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export const MultiSourceVideoPlayer: React.FC<MultiSourceVideoPlayerProps> = ({
  url,
  title = 'Multi-Source Video Player',
  autoPlay = false,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const hlsRef = useRef<any>(null);

  const resolved: ResolvedVideoSource = useMemo(() => resolveVideoSource(url), [url]);

  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(1);

  // Initialize HTML5 / lazy-loaded hls.js for direct video and .m3u8 streams
  useEffect(() => {
    setErrorMsg(null);
    setIsPlaying(false);
    setCurrentTime(0);
    setDuration(0);

    if (hlsRef.current) {
      try {
        hlsRef.current.destroy();
      } catch {}
      hlsRef.current = null;
    }

    const videoEl = videoRef.current;
    if (!videoEl || !resolved.supportsDirectControls || !resolved.playUrl) return;

    let cancelled = false;

    const setupStream = async () => {
      setIsLoading(true);
      if (resolved.engine === 'hls') {
        if (videoEl.canPlayType('application/vnd.apple.mpegurl')) {
          videoEl.src = resolved.playUrl;
          setIsLoading(false);
          return;
        }
        try {
          const mod = await import('hls.js');
          if (cancelled) return;
          const Hls = mod.default;
          if (Hls.isSupported()) {
            const hls = new Hls({ enableWorker: true });
            hlsRef.current = hls;
            hls.loadSource(resolved.playUrl);
            hls.attachMedia(videoEl);
            hls.on(Hls.Events.MANIFEST_PARSED, () => {
              if (!cancelled) setIsLoading(false);
            });
            hls.on(Hls.Events.ERROR, (_ev: any, data: any) => {
              if (data?.fatal && !cancelled) {
                setIsLoading(false);
                setErrorMsg('Could not load HLS stream (CORS or network error). Try opening the source link directly.');
              }
            });
          } else {
            setIsLoading(false);
            setErrorMsg('HLS playback is not supported in this browser.');
          }
        } catch {
          if (!cancelled) {
            setIsLoading(false);
            setErrorMsg('Failed to initialize HLS engine.');
          }
        }
      } else {
        videoEl.src = resolved.playUrl;
        setIsLoading(false);
      }
    };

    setupStream();

    return () => {
      cancelled = true;
      if (hlsRef.current) {
        try {
          hlsRef.current.destroy();
        } catch {}
        hlsRef.current = null;
      }
    };
  }, [resolved.playUrl, resolved.engine, resolved.supportsDirectControls]);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.playbackRate = playbackRate;
    }
  }, [playbackRate]);

  const togglePlay = () => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) {
      v.play().catch(() => setErrorMsg('Playback blocked. Tap Play again.'));
    } else {
      v.pause();
    }
  };

  const toggleMute = () => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = !v.muted;
    setIsMuted(v.muted);
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const next = Number(e.target.value);
    if (videoRef.current && Number.isFinite(next)) {
      videoRef.current.currentTime = next;
      setCurrentTime(next);
    }
  };

  const handleFullscreen = () => {
    const el = containerRef.current;
    if (!el) return;
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    } else {
      el.requestFullscreen?.().catch(() => {});
    }
  };

  if (resolved.engine === 'invalid') {
    return (
      <div className="w-full aspect-video rounded-2xl bg-slate-900 text-slate-300 flex flex-col items-center justify-center gap-2 p-6 text-center border border-slate-800">
        <AlertCircle className="w-7 h-7 text-amber-400" />
        <p className="text-sm font-semibold text-white">Paste a valid video URL above</p>
        <p className="text-xs text-slate-400">Supports .mp4, .m3u8 (HLS), YouTube, Vimeo, Dailymotion, Google Drive, Loom & embeddable sites.</p>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="w-full rounded-2xl overflow-hidden bg-black border border-slate-800 shadow-lg"
    >
      {/* Top Engine Status Strip */}
      <div className="px-4 py-2 bg-slate-950/90 border-b border-slate-800/80 flex items-center justify-between gap-2 text-xs text-slate-300">
        <div className="flex items-center gap-2 min-w-0">
          <Tv className="w-3.5 h-3.5 text-[#a8c7fa] shrink-0" />
          <span className="font-semibold text-white truncate">{title}</span>
          <span className="px-2 py-0.5 rounded-full bg-[#0b57d0]/30 text-[#a8c7fa] text-[10px] font-bold shrink-0">
            {resolved.label}
          </span>
        </div>
        <a
          href={resolved.originalUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[11px] font-semibold text-slate-400 hover:text-white inline-flex items-center gap-1 no-underline shrink-0"
        >
          <span>Open Source</span>
          <ExternalLink className="w-3 h-3" />
        </a>
      </div>

      {/* Video Surface */}
      <div className="relative w-full aspect-video bg-black">
        {resolved.supportsDirectControls ? (
          <>
            <video
              ref={videoRef}
              autoPlay={autoPlay}
              playsInline
              onClick={togglePlay}
              onPlay={() => setIsPlaying(true)}
              onPause={() => setIsPlaying(false)}
              onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
              onLoadedMetadata={(e) => setDuration(e.currentTarget.duration || 0)}
              onError={() => {
                setIsLoading(false);
                setErrorMsg('Unable to play this media stream in browser (CORS or unsupported codec).');
              }}
              className="w-full h-full object-contain cursor-pointer"
            />
            {isLoading && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/50 text-white gap-2 text-xs font-semibold">
                <Loader2 className="w-5 h-5 animate-spin text-[#a8c7fa]" />
                <span>Loading stream...</span>
              </div>
            )}
            {errorMsg && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950/90 text-center p-6 gap-3">
                <AlertCircle className="w-7 h-7 text-rose-400" />
                <p className="text-xs text-slate-200 max-w-md">{errorMsg}</p>
                <a
                  href={resolved.originalUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-4 py-2 rounded-xl bg-[#0b57d0] text-white text-xs font-bold no-underline inline-flex items-center gap-1.5"
                >
                  <span>Open External Link</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>
            )}
          </>
        ) : (
          <iframe
            key={resolved.playUrl}
            src={resolved.playUrl}
            title={title}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
            allowFullScreen
            referrerPolicy="no-referrer-when-downgrade"
            className="w-full h-full border-0"
          />
        )}
      </div>

      {/* Custom Controls Bar for Direct MP4 & HLS */}
      {resolved.supportsDirectControls && (
        <div className="px-3.5 py-2.5 bg-slate-950 text-white flex flex-wrap items-center gap-3 border-t border-slate-800/80">
          <button
            type="button"
            onClick={togglePlay}
            className="w-8 h-8 rounded-full bg-[#0b57d0] hover:bg-[#0947a8] text-white flex items-center justify-center border-0 cursor-pointer shrink-0"
            title={isPlaying ? 'Pause' : 'Play'}
          >
            {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
          </button>

          <span className="text-[11px] font-mono text-slate-300 shrink-0">
            {formatClock(currentTime)} / {formatClock(duration)}
          </span>

          <input
            type="range"
            min={0}
            max={Math.max(1, duration)}
            step={0.5}
            value={Math.min(currentTime, Math.max(1, duration))}
            onChange={handleSeek}
            className="flex-1 min-w-[100px] accent-[#0b57d0] cursor-pointer"
          />

          <select
            value={playbackRate}
            onChange={(e) => setPlaybackRate(Number(e.target.value))}
            className="bg-slate-900 text-slate-200 text-[11px] font-bold px-2 py-1 rounded-lg border border-slate-700 cursor-pointer"
            title="Playback Speed"
          >
            {[0.75, 1, 1.25, 1.5, 2].map((r) => (
              <option key={r} value={r}>
                {r}x
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={toggleMute}
            className="p-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-700 cursor-pointer"
            title={isMuted ? 'Unmute' : 'Mute'}
          >
            {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
          </button>

          <button
            type="button"
            onClick={handleFullscreen}
            className="p-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-700 cursor-pointer"
            title="Fullscreen"
          >
            <Maximize2 className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
};
