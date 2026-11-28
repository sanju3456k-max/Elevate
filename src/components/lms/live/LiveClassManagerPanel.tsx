import React, { useState, useEffect } from 'react';
import {
  Radio,
  Check,
  CheckSquare,
  Square,
  ShieldCheck,
  Play,
  ArrowLeft,
  Maximize2,
  Power,
} from 'lucide-react';
import { useApp } from '../../../lms/LmsContext';
import { extractYouTubeId, obfuscateVideoKey, deobfuscateVideoKey } from '../../../lms/security';
import { CloakedVideoPlayer } from '../player/CloakedVideoPlayer';

export const LiveClassManagerPanel: React.FC<{
  onOpenLiveRoom?: (id: string) => void;
  onBack?: () => void;
}> = ({
  onOpenLiveRoom,
  onBack,
}) => {
  const {
    batches,
    user,
    liveClasses,
    startLiveClass,
    stopLiveClass,
    setActiveLiveClassId,
    showSecurityToast,
  } = useApp();

  const [liveUrlInput, setLiveUrlInput] = useState('');
  const [detectedLiveYtId, setDetectedLiveYtId] = useState<string | null>(null);
  const [liveTitleInput, setLiveTitleInput] = useState('');
  const [liveDescInput, setLiveDescInput] = useState('');
  const [liveInstructorInput, setLiveInstructorInput] = useState('Elevate Labs Faculty');
  const [liveTargetBatchIds, setLiveTargetBatchIds] = useState<string[]>(() =>
    batches[0]?.id ? [batches[0].id] : []
  );
  const [isStartingLive, setIsStartingLive] = useState(false);
  const [statusBanner, setStatusBanner] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    if (liveTargetBatchIds.length === 0 && batches.length > 0) {
      setLiveTargetBatchIds([batches[0].id]);
    }
  }, [batches, liveTargetBatchIds.length]);

  const handleToggleLiveBatch = (batchId: string) => {
    setLiveTargetBatchIds((prev) =>
      prev.includes(batchId) ? prev.filter((id) => id !== batchId) : [...prev, batchId]
    );
  };

  const handleStartLiveClass = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatusBanner(null);

    if (!detectedLiveYtId) {
      setStatusBanner({ type: 'error', text: 'Please enter a valid YouTube Unlisted Live Stream URL or Video ID.' });
      return;
    }
    if (!liveTitleInput.trim()) {
      setStatusBanner({ type: 'error', text: 'Please enter a live class title.' });
      return;
    }
    if (liveTargetBatchIds.length === 0) {
      setStatusBanner({ type: 'error', text: 'Please select at least one target batch.' });
      return;
    }

    setIsStartingLive(true);
    const res = await startLiveClass({
      title: liveTitleInput.trim(),
      description: liveDescInput.trim() || 'Interactive Live Class Session',
      youtubeUrl: liveUrlInput.trim(),
      batchIds: liveTargetBatchIds,
      instructorName: liveInstructorInput.trim() || 'Elevate Labs Faculty',
    });
    setIsStartingLive(false);

    if (res.success && res.liveClass) {
      const msg = `🔴 Live Class "${res.liveClass.title}" started for ${liveTargetBatchIds.length} batch(es)!`;
      setStatusBanner({ type: 'success', text: msg });
      showSecurityToast(msg);
      setLiveUrlInput('');
      setDetectedLiveYtId(null);
      setLiveTitleInput('');
      setLiveDescInput('');
    } else {
      const errMsg = res.error || 'Could not start live class';
      setStatusBanner({ type: 'error', text: errMsg });
      showSecurityToast(`⚠️ ${errMsg}`);
    }
  };

  const primaryLive = liveClasses[0] || null;
  const primaryLiveYtId = primaryLive ? deobfuscateVideoKey(primaryLive.encryptedVideoId) : '';

  return (
    <div className={`space-y-4 ${liveClasses.length > 0 ? 'pb-28 lg:pb-0' : 'pb-6 lg:pb-0'}`}>
      {/* Full-Page Top Header (Borderless, exact same color as status bar in both light & dark themes) */}
      {onBack && (
        <div className="sticky top-0 z-30 md:static bg-[#e5e9f0] dark:bg-[#0b0c10] md:bg-transparent border-0 border-none shadow-none outline-none px-3.5 py-3 md:px-0 md:py-0 flex items-center justify-between gap-3 pt-[calc(var(--android-status-bar-height,env(safe-area-inset-top,0px))+0.65rem)] md:pt-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <button
              type="button"
              onClick={onBack}
              aria-label="Back"
              className="w-9 h-9 rounded-full bg-white dark:bg-[#1e2028] text-slate-700 dark:text-slate-200 flex items-center justify-center border-none outline-none cursor-pointer shadow-xs hover:bg-slate-100 dark:hover:bg-white/10 active:scale-95 transition shrink-0"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div className="min-w-0">
              <h1 className="text-base sm:text-xl font-extrabold text-slate-900 dark:text-white truncate">
                Live Classes
              </h1>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate hidden sm:block">
                YouTube Unlisted Live Streams &amp; Synced Chat
              </p>
            </div>
          </div>

          {liveClasses.length > 0 && (
            <button
              type="button"
              onClick={() => {
                if (primaryLive) {
                  setActiveLiveClassId(primaryLive.id);
                  onOpenLiveRoom?.(primaryLive.id);
                }
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-red-600 text-white text-xs font-extrabold border-none outline-none cursor-pointer shadow-xs active:scale-95 transition shrink-0"
            >
              <Radio className="w-3.5 h-3.5 animate-pulse" />
              <span>{liveClasses.length} LIVE</span>
            </button>
          )}
        </div>
      )}

      <div className="px-3.5 md:px-0 grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* Left: Start New Live Class Form (6 cols) */}
        <div className="lg:col-span-6 bg-white dark:bg-[#1e2028] rounded-3xl p-4 sm:p-5 shadow-xs space-y-4">
          <div className="flex items-center justify-between pb-1">
            <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center space-x-2">
              <Radio className="w-5 h-5 text-red-500 animate-pulse" />
              <span>Go Live (YouTube Unlisted)</span>
            </h2>
            <span className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
              Cloaked + Chat Sync
            </span>
          </div>

          <form onSubmit={handleStartLiveClass} className="space-y-4">
            <div>
              <label className="text-xs font-bold text-slate-600 dark:text-slate-300 block mb-1">
                YouTube Unlisted Live Stream URL / Video ID
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={liveUrlInput}
                  onChange={(e) => {
                    const val = e.target.value;
                    setLiveUrlInput(val);
                    setDetectedLiveYtId(extractYouTubeId(val));
                  }}
                  placeholder="https://www.youtube.com/live/... or watch?v=..."
                  className="w-full pl-3.5 pr-10 py-2.5 bg-slate-100 dark:bg-[#16181f] rounded-2xl text-xs text-slate-900 dark:text-white placeholder-slate-400 border-none outline-none font-mono"
                />
                {detectedLiveYtId && (
                  <div className="absolute inset-y-0 right-0 pr-3 flex items-center text-emerald-500">
                    <Check className="w-4 h-4" />
                  </div>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-bold text-slate-600 dark:text-slate-300 block mb-1">
                  Live Class Title
                </label>
                <input
                  type="text"
                  value={liveTitleInput}
                  onChange={(e) => setLiveTitleInput(e.target.value)}
                  placeholder="e.g. Physics Live Doubt & Revision"
                  className="w-full p-2.5 bg-slate-100 dark:bg-[#16181f] rounded-2xl text-xs text-slate-900 dark:text-white border-none outline-none"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-600 dark:text-slate-300 block mb-1">
                  Instructor Name
                </label>
                <input
                  type="text"
                  value={liveInstructorInput}
                  onChange={(e) => setLiveInstructorInput(e.target.value)}
                  className="w-full p-2.5 bg-slate-100 dark:bg-[#16181f] rounded-2xl text-xs text-slate-900 dark:text-white border-none outline-none"
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-bold text-slate-600 dark:text-slate-300 block mb-1">
                Session Description (Optional)
              </label>
              <textarea
                rows={2}
                value={liveDescInput}
                onChange={(e) => setLiveDescInput(e.target.value)}
                placeholder="Topics covered in this live class..."
                className="w-full p-2.5 bg-slate-100 dark:bg-[#16181f] rounded-2xl text-xs text-slate-900 dark:text-white border-none outline-none"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-slate-600 dark:text-slate-300 block mb-2">
                Target Batches (Only enrolled students in selected batches will see & join)
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto">
                {batches.map((b) => {
                  const checked = liveTargetBatchIds.includes(b.id);
                  return (
                    <button
                      key={b.id}
                      type="button"
                      onClick={() => handleToggleLiveBatch(b.id)}
                      className={`p-3 rounded-2xl text-left text-xs font-bold flex items-center justify-between transition border-none outline-none cursor-pointer ${
                        checked
                          ? 'bg-blue-100 dark:bg-blue-900/40 text-[#0b57d0] dark:text-[#a8c7fa]'
                          : 'bg-slate-100 dark:bg-[#16181f] text-slate-600 dark:text-slate-300'
                      }`}
                    >
                      <span className="truncate pr-2">{b.title}</span>
                      {checked ? (
                        <CheckSquare className="w-4 h-4 flex-shrink-0" />
                      ) : (
                        <Square className="w-4 h-4 flex-shrink-0 opacity-50" />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            <button
              type="submit"
              disabled={!detectedLiveYtId || isStartingLive}
              className="w-full py-3 rounded-full bg-red-600 hover:bg-red-700 text-white font-bold text-xs disabled:opacity-50 flex items-center justify-center space-x-2 shadow-sm border-none outline-none cursor-pointer transition"
            >
              <Radio className="w-4 h-4 animate-pulse" />
              <span>{isStartingLive ? 'Starting Live Stream...' : 'Start Live Class Now'}</span>
            </button>

            {statusBanner && (
              <div
                className={`p-3 rounded-2xl text-xs font-semibold ${
                  statusBanner.type === 'success'
                    ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                    : 'bg-red-500/15 text-red-700 dark:text-red-300'
                }`}
              >
                {statusBanner.text}
              </div>
            )}
          </form>
        </div>

        {/* Right: Cloaked Live Preview & Active Streams (6 cols) */}
        <div className="lg:col-span-6 space-y-4">
          <div className={`${detectedLiveYtId ? 'block' : 'hidden lg:block'} bg-white dark:bg-[#1e2028] rounded-3xl p-4 sm:p-5 shadow-xs space-y-3`}>
            <div className="flex items-center justify-between pb-1">
              <h3 className="text-xs font-bold uppercase tracking-wider text-red-500 flex items-center space-x-1.5">
                <ShieldCheck className="w-4 h-4" />
                <span>Cloaked Live Preview</span>
              </h3>
              <span className="text-[10px] bg-red-500/15 text-red-500 px-2.5 py-0.5 rounded-full font-bold">
                No Share UI
              </span>
            </div>

            {detectedLiveYtId ? (
              <CloakedVideoPlayer
                encryptedVideoId={obfuscateVideoKey(detectedLiveYtId)}
                title={liveTitleInput || 'Live Class Preview'}
                user={user}
                isLive={true}
              />
            ) : (
              <div className="aspect-video bg-slate-100 dark:bg-[#16181f] rounded-2xl flex flex-col items-center justify-center p-6 text-center space-y-2">
                <Play className="w-10 h-10 text-slate-400" />
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Paste your YouTube Unlisted Live link on the left to preview the cloaked live player.
                </p>
              </div>
            )}
          </div>

          <div className="hidden lg:block bg-white dark:bg-[#1e2028] rounded-3xl p-5 shadow-xs space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Currently Live ({liveClasses.length})
            </h3>
            {liveClasses.length === 0 ? (
              <p className="text-xs text-slate-400">No active live classes right now.</p>
            ) : (
              <div className="space-y-2.5">
                {liveClasses.map((lc) => {
                  const ytId = deobfuscateVideoKey(lc.encryptedVideoId);
                  return (
                    <div
                      key={lc.id}
                      className="p-3 rounded-2xl bg-slate-100 dark:bg-[#16181f] flex items-center gap-3"
                    >
                      <button
                        type="button"
                        onClick={() => {
                          setActiveLiveClassId(lc.id);
                          onOpenLiveRoom?.(lc.id);
                        }}
                        className="w-24 aspect-video rounded-xl overflow-hidden bg-black relative shrink-0 border-none outline-none cursor-pointer p-0"
                        title="Open Live Classroom"
                      >
                        {ytId && (
                          <img
                            src={`https://i.ytimg.com/vi/${ytId}/mqdefault.jpg`}
                            alt={lc.title}
                            className="w-full h-full object-cover"
                          />
                        )}
                        <span className="absolute top-1 left-1 px-1.5 py-0.5 rounded-full bg-red-600 text-white text-[8px] font-extrabold uppercase">
                          ● LIVE
                        </span>
                      </button>

                      <div className="flex-1 min-w-0 space-y-1.5">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-bold text-slate-900 dark:text-white truncate">
                            {lc.title}
                          </span>
                          <span className="text-[10px] font-mono text-slate-500 shrink-0">
                            {lc.ytChatSyncStatus === 'synced' ? 'YT Synced' : 'Local Chat'}
                          </span>
                        </div>
                        <div className="flex items-center space-x-2">
                          <button
                            type="button"
                            onClick={() => {
                              setActiveLiveClassId(lc.id);
                              onOpenLiveRoom?.(lc.id);
                            }}
                            className="flex-1 py-1.5 px-3 rounded-full bg-[#0b57d0] text-white text-[11px] font-bold border-none outline-none cursor-pointer inline-flex items-center justify-center gap-1.5"
                          >
                            <Maximize2 className="w-3 h-3" />
                            <span>Open Live Room</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => stopLiveClass(lc.id)}
                            className="px-3 py-1.5 rounded-full bg-red-500/15 text-red-500 hover:bg-red-500/25 text-[11px] font-bold border-none outline-none cursor-pointer"
                          >
                            End Stream
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Mobile Floating Running Video Mini-Player Strip (Bottom) */}
      {primaryLive && (
        <div className="lg:hidden fixed bottom-3 inset-x-3 z-40 pb-[env(safe-area-inset-bottom,0px)]">
          <div className="bg-white/95 dark:bg-[#1e2028]/95 backdrop-blur-md rounded-2xl p-2.5 shadow-xl flex items-center gap-2.5">
            <button
              type="button"
              onClick={() => {
                setActiveLiveClassId(primaryLive.id);
                onOpenLiveRoom?.(primaryLive.id);
              }}
              className="w-20 aspect-video rounded-xl overflow-hidden bg-black relative shrink-0 border-none outline-none cursor-pointer p-0"
              title="Open Live Classroom"
            >
              {primaryLiveYtId && (
                <img
                  src={`https://i.ytimg.com/vi/${primaryLiveYtId}/mqdefault.jpg`}
                  alt={primaryLive.title}
                  className="w-full h-full object-cover"
                />
              )}
              <span className="absolute top-1 left-1 px-1.5 py-0.5 rounded-full bg-red-600 text-white text-[8px] font-extrabold uppercase flex items-center gap-0.5">
                <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                LIVE
              </span>
            </button>

            <div
              onClick={() => {
                setActiveLiveClassId(primaryLive.id);
                onOpenLiveRoom?.(primaryLive.id);
              }}
              className="flex-1 min-w-0 cursor-pointer"
            >
              <div className="text-xs font-extrabold text-slate-900 dark:text-white truncate">
                {primaryLive.title}
              </div>
              <div className="text-[10px] font-medium text-slate-500 dark:text-slate-400 truncate">
                {primaryLive.ytChatSyncStatus === 'synced' ? 'YT Chat Synced' : 'Local Chat'} • Tap to open
              </div>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={() => {
                  setActiveLiveClassId(primaryLive.id);
                  onOpenLiveRoom?.(primaryLive.id);
                }}
                className="px-3 py-1.5 rounded-full bg-[#0b57d0] text-white text-[11px] font-bold border-none outline-none cursor-pointer active:scale-95 transition"
              >
                Open Room
              </button>
              <button
                type="button"
                onClick={() => stopLiveClass(primaryLive.id)}
                title="End Stream"
                aria-label="End Stream"
                className="w-8 h-8 rounded-full bg-red-500/15 text-red-600 dark:text-red-400 flex items-center justify-center border-none outline-none cursor-pointer active:scale-95 transition"
              >
                <Power className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
