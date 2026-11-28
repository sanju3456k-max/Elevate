import React, { useEffect, useRef, useState } from 'react';
import {
  Radio,
  Send,
  MessageSquare,
  AlertCircle,
  Clock,
  Layers,
  Smile,
} from 'lucide-react';
import { useApp } from '../../../lms/LmsContext';
import { getLiveApiBaseUrl, getLiveWsUrl } from '../../../lms/liveApiConfig';
import { useBackHandler } from '../../../hooks/useBackNavigation';
import { CloakedVideoPlayer } from '../player/CloakedVideoPlayer';
import type { LiveChatMessage, LiveClassSession } from '../../../lms/types';

interface LiveClassRoomProps {
  liveClass: LiveClassSession;
  onBack: () => void;
}

const QUICK_EMOJIS = ['🙏', '❤️', '🔥', '👏', '😂', '🎉', '👍', '🙌', '💯', '✨', '🥳', '🚀'];

export const LiveClassRoom: React.FC<LiveClassRoomProps> = ({ liveClass, onBack }) => {
  const { user, batches, stopLiveClass, showSecurityToast, isGuestAllowedForBatch } = useApp();

  const [messages, setMessages] = useState<LiveChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [isStreamEnded, setIsStreamEnded] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showEndConfirmModal, setShowEndConfirmModal] = useState(false);
  const [isEndingClass, setIsEndingClass] = useState(false);

  // Desktop Theatre Fullscreen + Toggleable Side Chat
  const theatreRef = useRef<HTMLDivElement | null>(null);
  const [isDesktop, setIsDesktop] = useState<boolean>(() =>
    typeof window !== 'undefined' ? window.innerWidth >= 1024 : false
  );
  const [isTheatreFullscreen, setIsTheatreFullscreen] = useState(false);
  const [isFullscreenChatOpen, setIsFullscreenChatOpen] = useState(true);

  const wsRef = useRef<WebSocket | null>(null);
  const chatScrollContainerRef = useRef<HTMLDivElement | null>(null);

  useBackHandler({
    id: `live_class_room_${liveClass.id}`,
    isOpen: true,
    priority: 50,
    onBack: () => {
      onBack();
    },
  });

  useEffect(() => {
    const onResize = () => setIsDesktop(window.innerWidth >= 1024);
    const onFsChange = () => {
      const fsEl = document.fullscreenElement || (document as any).webkitFullscreenElement;
      if (!fsEl) setIsTheatreFullscreen(false);
    };
    window.addEventListener('resize', onResize);
    document.addEventListener('fullscreenchange', onFsChange);
    document.addEventListener('webkitfullscreenchange', onFsChange);
    return () => {
      window.removeEventListener('resize', onResize);
      document.removeEventListener('fullscreenchange', onFsChange);
      document.removeEventListener('webkitfullscreenchange', onFsChange);
    };
  }, []);

  useEffect(() => {
    const el = chatScrollContainerRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages]);

  useEffect(() => {
    let isMounted = true;
    const ws = new WebSocket(getLiveWsUrl());
    wsRef.current = ws;

    ws.onopen = () => {
      ws.send(
        JSON.stringify({
          type: 'subscribe',
          liveClassId: liveClass.id,
        })
      );
    };

    ws.onmessage = (event) => {
      if (!isMounted) return;
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'chat_history' && Array.isArray(data.messages)) {
          setMessages(data.messages);
        } else if (data.type === 'chat_message' && data.message) {
          setMessages((prev) => {
            if (prev.some((m) => m.id === data.message.id)) return prev;
            return [...prev, data.message];
          });
        } else if (data.type === 'live_class_ended' && data.liveClassId === liveClass.id) {
          setIsStreamEnded(true);
        }
      } catch {}
    };

    fetch(`${getLiveApiBaseUrl()}/api/live/${liveClass.id}/chat`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!isMounted || !data) return;
        if (Array.isArray(data.messages)) setMessages(data.messages);
      })
      .catch(() => {});

    return () => {
      isMounted = false;
      if (ws.readyState <= 1) ws.close();
    };
  }, [liveClass.id]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = chatInput.trim();
    if (!text || isStreamEnded || isSending) return;

    setIsSending(true);
    setChatInput('');
    setShowEmojiPicker(false);

    try {
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(
          JSON.stringify({
            type: 'chat_message',
            liveClassId: liveClass.id,
            senderName: user.name || 'Student',
            senderRole: user.role,
            message: text,
          })
        );
      } else {
        await fetch(`${getLiveApiBaseUrl()}/api/live/${liveClass.id}/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            senderName: user.name || 'Student',
            senderRole: user.role,
            message: text,
          }),
        });
      }
    } finally {
      setIsSending(false);
    }
  };

  const targetBatchTitles = batches
    .filter((b) => liveClass.batchIds.includes(b.id))
    .map((b) => b.title)
    .join(', ');

  const primaryBatchId = liveClass.batchIds[0] || 'batch_testing_01';
  const isGuestAllowedForLive = liveClass.batchIds.some((bid) => isGuestAllowedForBatch(bid));
  const startedTimeText = new Date(liveClass.startedAt).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });

  if (isStreamEnded) {
    return (
      <div className="max-w-3xl mx-auto px-4 pt-10 pb-20">
        <div className="bg-white dark:bg-[#1e2028] rounded-3xl p-8 sm:p-10 text-center space-y-4 shadow-sm">
          <div className="w-14 h-14 rounded-full bg-red-500/15 text-red-500 flex items-center justify-center mx-auto">
            <AlertCircle className="w-7 h-7" />
          </div>
          <h2 className="text-xl font-extrabold text-slate-900 dark:text-white">
            Live Class Has Ended
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
            This live session has ended and its temporary live chat has been cleared.
          </p>
          <button
            type="button"
            onClick={onBack}
            className="px-6 py-2.5 rounded-full bg-[#0b57d0] text-white text-xs font-bold border-none outline-none cursor-pointer"
          >
            Return to Home
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={theatreRef}
      className={
        isTheatreFullscreen
          ? 'fixed inset-0 z-[9999] w-screen h-screen bg-black flex flex-row overflow-hidden'
          : 'w-full h-[100dvh] lg:h-[calc(100vh-4.25rem)] flex flex-col lg:w-full lg:max-w-[1760px] lg:mx-auto lg:px-6 lg:pt-3 lg:pb-3 overflow-hidden bg-transparent'
      }
    >
      {/* Main Split Container (Desktop: Video scales diagonally to max viewport fit; Live Chat optimizes remaining width) */}
      <div
        className={
          isTheatreFullscreen
            ? 'flex-1 flex flex-row min-h-0 min-w-0 w-full h-full'
            : 'flex-1 min-h-0 flex flex-col lg:flex-row lg:gap-5'
        }
      >
        {/* LEFT / TOP: Cloaked Video Player + Title Card (Desktop has gentle safety scroll so title card always reads comfortably) */}
        <div
          className={
            isTheatreFullscreen
              ? 'flex-1 min-w-0 h-full flex flex-col bg-black relative'
              : 'shrink-0 lg:flex-[999_1_0%] lg:min-w-0 lg:max-w-[calc((100vh-10rem)*16/9)] lg:h-full lg:overflow-y-auto lg:overscroll-contain lg:pr-0.5 lg:pb-6 flex flex-col lg:space-y-2.5'
          }
        >
          {/* Video Player Frame (Left-aligned, strict 16:9 matching title card width) */}
          <div
            className={
              isTheatreFullscreen
                ? 'flex-1 min-h-0 w-full h-full flex items-center justify-center bg-black'
                : 'w-full aspect-video bg-black lg:rounded-3xl overflow-hidden shrink-0'
            }
          >
            <CloakedVideoPlayer
              encryptedVideoId={liveClass.encryptedVideoId}
              title={liveClass.title}
              user={user}
              batchId={primaryBatchId}
              lectureId={liveClass.id}
              isGuestAllowed={isGuestAllowedForLive}
              isLive={true}
              autoPlay={true}
              externalFullscreenContainerRef={isDesktop ? theatreRef : undefined}
              onFullscreenChange={(fs) => {
                if (isDesktop) setIsTheatreFullscreen(fs);
              }}
              isChatOpen={isFullscreenChatOpen}
              onToggleChat={() => setIsFullscreenChatOpen((prev) => !prev)}
            />
          </div>

          {/* Compact Metadata & Status Card (Live Stream Active + End Class live here on Desktop) */}
          {!isTheatreFullscreen && (
            <div className="px-3.5 py-2.5 lg:px-4 lg:py-3 bg-white dark:bg-[#16181f] lg:dark:bg-[#1e2028] lg:rounded-2xl shrink-0">
              <div className="flex items-center justify-between gap-2.5">
                <div className="flex items-center space-x-2.5 min-w-0">
                  <h1 className="text-sm sm:text-base font-extrabold text-slate-900 dark:text-white truncate">
                    {liveClass.title}
                  </h1>
                  <span className="hidden lg:inline-flex items-center space-x-1.5 px-2.5 py-0.5 rounded-full bg-red-500/15 text-red-600 dark:text-red-400 text-[11px] font-bold shrink-0">
                    <Radio className="w-3 h-3 animate-pulse" />
                    <span>Live Stream Active</span>
                  </span>
                </div>

                {user.role === 'admin' && (
                  <button
                    type="button"
                    onClick={() => setShowEndConfirmModal(true)}
                    className="px-2.5 py-1 lg:px-3.5 lg:py-1.5 rounded-full bg-red-600 hover:bg-red-700 text-white text-[10px] lg:text-xs font-bold border-none outline-none cursor-pointer shrink-0 transition"
                  >
                    End Class
                  </button>
                )}
              </div>

              <div className="mt-1 flex items-center flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-500 dark:text-slate-400 font-medium">
                <span className="inline-flex items-center space-x-1 truncate">
                  <Layers className="w-3 h-3 text-[#0b57d0] dark:text-[#a8c7fa] shrink-0" />
                  <span className="truncate">{targetBatchTitles || 'Enrolled Batch'}</span>
                </span>
                <span className="inline-flex items-center space-x-1 font-mono text-[10px] shrink-0">
                  <Clock className="w-3 h-3 shrink-0" />
                  <span>Started {startedTimeText}</span>
                </span>
              </div>
            </div>
          )}
        </div>

        {/* RIGHT / BOTTOM: White Card on Desktop (Fixed height, adapts remaining width), Plain White on Mobile */}
        {(!isTheatreFullscreen || isFullscreenChatOpen) && (
          <div
            className={
              isTheatreFullscreen
                ? 'w-[300px] xl:w-[320px] h-full flex flex-col bg-white/95 dark:bg-[#12141a] text-slate-900 dark:text-white shrink-0'
                : 'flex-1 min-h-0 lg:flex-[1_0_320px] xl:flex-[1_0_340px] 2xl:flex-[1_0_380px] lg:max-w-[440px] flex flex-col lg:h-full bg-white dark:bg-[#0b0c10] lg:bg-white lg:dark:bg-[#1e2028] lg:rounded-3xl lg:shadow-sm overflow-hidden'
            }
          >
            {/* Chat Header (Borderless) */}
            <div className="px-4 pt-3 pb-2 flex items-center justify-between shrink-0 bg-transparent">
              <div className="flex items-center space-x-2">
                <MessageSquare className="w-4 h-4 text-[#0b57d0] dark:text-[#a8c7fa]" />
                <h3 className="text-xs sm:text-sm font-extrabold text-slate-900 dark:text-white">
                  Live Chat
                </h3>
              </div>
            </div>

            {/* Transparent Compact Messages Feed (Independent scroll only inside chat list) */}
            <div
              ref={chatScrollContainerRef}
              className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-2.5 py-1 space-y-0.5"
            >
              {messages.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center text-xs text-slate-400 space-y-1.5">
                  <MessageSquare className="w-6 h-6 opacity-30" />
                  <p>No messages yet. Say hello!</p>
                </div>
              ) : (
                messages.map((msg) => {
                  const isAdmin = msg.senderRole === 'admin';
                  return (
                    <div
                      key={msg.id}
                      className="px-2 py-1 rounded-xl text-xs transition hover:bg-black/5 dark:hover:bg-white/5 text-slate-900 dark:text-slate-100"
                    >
                      <div className="flex items-baseline justify-between gap-1.5">
                        <div className="flex items-center space-x-1.5 min-w-0">
                          <span
                            className={`font-bold truncate text-[11.5px] ${
                              isAdmin
                                ? 'text-[#0b57d0] dark:text-[#a8c7fa]'
                                : 'text-slate-600 dark:text-slate-300'
                            }`}
                          >
                            {msg.senderName}
                          </span>
                          {isAdmin && (
                            <span className="px-1.5 py-0.2 rounded-full bg-[#0b57d0] text-white text-[9px] font-extrabold uppercase shrink-0">
                              Educator
                            </span>
                          )}
                        </div>
                        <span className="text-[9.5px] text-slate-400 font-mono shrink-0">
                          {new Date(msg.timestamp).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      </div>
                      <p className="text-[12px] leading-snug break-words">{msg.message}</p>
                    </div>
                  );
                })
              )}
            </div>

            {/* Pinned Bottom Borderless Chat Input Bar with Emoji Picker */}
            <form
              onSubmit={handleSendMessage}
              className="relative px-2.5 py-2 shrink-0 bg-transparent pb-[max(0.5rem,env(safe-area-inset-bottom))]"
            >
              {showEmojiPicker && (
                <div className="absolute bottom-14 left-2.5 right-2.5 p-2 rounded-2xl bg-white dark:bg-[#1e2028] shadow-lg flex flex-wrap gap-1.5 z-20">
                  {QUICK_EMOJIS.map((emoji) => (
                    <button
                      key={emoji}
                      type="button"
                      onClick={() => setChatInput((prev) => `${prev}${emoji}`)}
                      className="w-8 h-8 rounded-full hover:bg-slate-100 dark:hover:bg-white/10 flex items-center justify-center text-base border-none outline-none cursor-pointer bg-transparent transition active:scale-90"
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              )}

              <div className="flex items-center space-x-1.5 bg-[#eef2f6] dark:bg-[#282a32] rounded-full px-2.5 py-1.5 focus-within:ring-2 focus-within:ring-[#0b57d0]/30 transition">
                <button
                  type="button"
                  onClick={() => setShowEmojiPicker((prev) => !prev)}
                  className="p-1.5 rounded-full text-slate-600 dark:text-slate-300 hover:bg-black/5 dark:hover:bg-white/10 border-none outline-none cursor-pointer bg-transparent transition shrink-0"
                  title="Add Emoji"
                >
                  <Smile className="w-4 h-4" />
                </button>
                <input
                  type="text"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  placeholder={`Chat as ${user.name || 'Student'}...`}
                  maxLength={500}
                  className="flex-1 px-1.5 py-1 bg-transparent text-xs text-slate-900 dark:text-white placeholder-slate-500 dark:placeholder-slate-400 border-none outline-none"
                />
                <button
                  type="submit"
                  disabled={!chatInput.trim() || isSending}
                  className="p-2 rounded-full bg-[#0b57d0] text-white disabled:opacity-40 border-none outline-none cursor-pointer transition hover:scale-105 active:scale-95 shrink-0"
                  title="Send Reply"
                >
                  <Send className="w-3.5 h-3.5" />
                </button>
              </div>
            </form>
          </div>
        )}
      </div>

      {/* End Class Confirmation Pop-up Modal */}
      {showEndConfirmModal && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white dark:bg-[#1e2028] rounded-3xl max-w-sm w-full p-5 sm:p-6 shadow-2xl space-y-4">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 rounded-full bg-red-500/15 text-red-600 dark:text-red-400 flex items-center justify-center shrink-0">
                <AlertCircle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm sm:text-base font-extrabold text-slate-900 dark:text-white">
                  End Live Class?
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  This will stop the stream for all students and clear temporary chat history.
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end space-x-2 pt-1">
              <button
                type="button"
                disabled={isEndingClass}
                onClick={() => setShowEndConfirmModal(false)}
                className="px-4 py-2 rounded-full bg-slate-100 dark:bg-white/10 text-slate-700 dark:text-slate-200 text-xs font-bold border-none outline-none cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isEndingClass}
                onClick={async () => {
                  setIsEndingClass(true);
                  await stopLiveClass(liveClass.id);
                  setIsEndingClass(false);
                  setShowEndConfirmModal(false);
                  showSecurityToast('Live class ended and ephemeral chat cleared.');
                  onBack();
                }}
                className="px-4 py-2 rounded-full bg-red-600 hover:bg-red-700 text-white text-xs font-bold border-none outline-none cursor-pointer disabled:opacity-50"
              >
                {isEndingClass ? 'Ending...' : 'Yes, End Class'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
