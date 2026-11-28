import React, { useEffect, useRef, useState } from 'react';
import {
  ChevronLeft,
  Radio,
  Send,
  ShieldCheck,
  MessageSquare,
  Sparkles,
  UserCheck,
  AlertCircle,
} from 'lucide-react';
import { useApp } from '../../../lms/LmsContext';
import { getLiveApiBaseUrl, getLiveWsUrl } from '../../../lms/liveApiConfig';
import { CloakedVideoPlayer } from '../player/CloakedVideoPlayer';
import type { LiveChatMessage, LiveClassSession } from '../../../lms/types';

interface LiveClassRoomProps {
  liveClass: LiveClassSession;
  onBack: () => void;
}

export const LiveClassRoom: React.FC<LiveClassRoomProps> = ({ liveClass, onBack }) => {
  const { user, batches, stopLiveClass, showSecurityToast, isGuestAllowedForBatch } = useApp();

  const [messages, setMessages] = useState<LiveChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [syncStatus, setSyncStatus] = useState<LiveClassSession['ytChatSyncStatus']>(
    liveClass.ytChatSyncStatus
  );
  const [isStreamEnded, setIsStreamEnded] = useState(false);
  const [isSending, setIsSending] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const chatEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
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
          if (data.ytChatSyncStatus) setSyncStatus(data.ytChatSyncStatus);
        } else if (data.type === 'chat_message' && data.message) {
          setMessages((prev) => {
            if (prev.some((m) => m.id === data.message.id)) return prev;
            return [...prev, data.message];
          });
        } else if (data.type === 'sync_status' && data.ytChatSyncStatus) {
          setSyncStatus(data.ytChatSyncStatus);
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
        if (data.ytChatSyncStatus) setSyncStatus(data.ytChatSyncStatus);
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

  return (
    <div className="space-y-4 pb-24 md:pb-12 max-w-7xl mx-auto px-3 sm:px-6 pt-4">
      {/* Top Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center space-x-1.5 text-xs sm:text-sm font-bold text-[#0b57d0] dark:text-[#a8c7fa] hover:underline border-none bg-transparent cursor-pointer"
        >
          <ChevronLeft className="w-4 h-4" />
          <span>Back to App</span>
        </button>

        <div className="flex items-center space-x-2">
          <span className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-full bg-red-500/15 text-red-600 dark:text-red-400 text-xs font-bold">
            <Radio className="w-3.5 h-3.5 animate-pulse" />
            <span>{isStreamEnded ? 'Stream Ended' : 'Live Stream Active'}</span>
          </span>

          {user.role === 'admin' && !isStreamEnded && (
            <button
              type="button"
              onClick={async () => {
                if (window.confirm('End this live class for all students?')) {
                  await stopLiveClass(liveClass.id);
                  showSecurityToast('Live class ended and ephemeral chat cleared.');
                  onBack();
                }
              }}
              className="px-3 py-1 rounded-full bg-red-600 hover:bg-red-700 text-white text-xs font-bold border-none outline-none cursor-pointer transition"
            >
              End Live Class
            </button>
          )}
        </div>
      </div>

      {isStreamEnded ? (
        <div className="bg-white dark:bg-[#1e2028] rounded-3xl p-10 text-center space-y-4 shadow-sm">
          <div className="w-14 h-14 rounded-full bg-red-500/15 text-red-500 flex items-center justify-center mx-auto">
            <AlertCircle className="w-7 h-7" />
          </div>
          <h2 className="text-xl font-extrabold text-slate-900 dark:text-white">
            Live Class Has Ended
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
            The educator has ended this live session and the temporary live chat history has been cleared.
          </p>
          <button
            type="button"
            onClick={onBack}
            className="px-6 py-2.5 rounded-full bg-[#0b57d0] text-white text-xs font-bold border-none outline-none cursor-pointer"
          >
            Return to Dashboard
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          {/* LEFT: Cloaked Live Video Player (8 cols) */}
          <div className="lg:col-span-8 space-y-4">
            <CloakedVideoPlayer
              encryptedVideoId={liveClass.encryptedVideoId}
              title={liveClass.title}
              user={user}
              batchId={primaryBatchId}
              lectureId={liveClass.id}
              isGuestAllowed={isGuestAllowedForLive}
              isLive={true}
              autoPlay={true}
            />

            {/* Live Class Metadata Card */}
            <div className="bg-white dark:bg-[#1e2028] rounded-3xl p-5 shadow-xs space-y-3 border border-slate-200/60 dark:border-white/10">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center space-x-2">
                  <span className="px-2.5 py-0.5 rounded-full bg-red-600 text-white text-[10px] font-extrabold uppercase tracking-wider">
                    ● LIVE
                  </span>
                  <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                    Batches: {targetBatchTitles || 'Enrolled Batch'}
                  </span>
                </div>

                <span className="flex items-center space-x-1 text-[11px] font-bold text-emerald-600 dark:text-emerald-400">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span>Cloaked Player (No Share Link)</span>
                </span>
              </div>

              <h1 className="text-lg sm:text-xl font-extrabold text-slate-900 dark:text-white">
                {liveClass.title}
              </h1>
              <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                {liveClass.description}
              </p>

              <div className="pt-2 border-t border-slate-200/60 dark:border-white/10 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                <span>
                  Instructor:{' '}
                  <strong className="text-slate-900 dark:text-white">{liveClass.instructorName}</strong>
                </span>
                <span className="font-mono text-[11px]">
                  Started{' '}
                  {new Date(liveClass.startedAt).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
              </div>
            </div>
          </div>

          {/* RIGHT: App-Native Live Chat Panel (4 cols) */}
          <div className="lg:col-span-4 bg-white dark:bg-[#1e2028] rounded-3xl shadow-xs border border-slate-200/60 dark:border-white/10 flex flex-col h-[500px] lg:h-[600px] overflow-hidden">
            {/* Chat Header */}
            <div className="p-4 border-b border-slate-200/60 dark:border-white/10 flex items-center justify-between bg-slate-50/80 dark:bg-[#262832]">
              <div className="flex items-center space-x-2">
                <MessageSquare className="w-4 h-4 text-[#0b57d0] dark:text-[#a8c7fa]" />
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  Live Class Chat
                </h3>
              </div>

              {syncStatus === 'synced' ? (
                <span
                  className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 text-[10px] font-bold"
                  title="Server-side synced with YouTube Live Chat"
                >
                  <Radio className="w-3 h-3" />
                  <span>YT Synced</span>
                </span>
              ) : (
                <span
                  className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full bg-blue-500/15 text-[#0b57d0] dark:text-[#a8c7fa] text-[10px] font-bold"
                  title="Ephemeral session chat (cleared when stream ends)"
                >
                  <Sparkles className="w-3 h-3" />
                  <span>Session Chat</span>
                </span>
              )}
            </div>

            {/* Ephemeral Notice */}
            <div className="px-4 py-1.5 bg-slate-100/80 dark:bg-[#16181f] text-[10px] text-slate-500 dark:text-slate-400 text-center border-b border-slate-200/40 dark:border-white/5">
              Chat history is temporary and stays active only for this live stream.
            </div>

            {/* Messages Feed */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {messages.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center text-xs text-slate-400 space-y-2">
                  <MessageSquare className="w-8 h-8 opacity-30" />
                  <p>No messages yet. Say hello or ask a doubt!</p>
                </div>
              ) : (
                messages.map((msg) => {
                  const isAdmin = msg.senderRole === 'admin';
                  const isSelf = msg.senderName === user.name && msg.source === 'app';

                  return (
                    <div
                      key={msg.id}
                      className={`p-3 rounded-2xl text-xs space-y-1 transition ${
                        isAdmin
                          ? 'bg-blue-50 dark:bg-blue-950/40 text-slate-900 dark:text-slate-100'
                          : isSelf
                            ? 'bg-emerald-50 dark:bg-emerald-950/30 text-slate-900 dark:text-slate-100'
                            : 'bg-slate-100 dark:bg-[#262832] text-slate-900 dark:text-slate-100'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center space-x-1.5 min-w-0">
                          <span className="font-bold truncate">{msg.senderName}</span>
                          {isAdmin && (
                            <span className="px-1.5 py-0.5 rounded-full bg-[#0b57d0] text-white text-[9px] font-extrabold uppercase">
                              Educator
                            </span>
                          )}
                          {msg.source === 'youtube' && (
                            <span className="px-1.5 py-0.5 rounded-full bg-red-500/15 text-red-500 text-[9px] font-bold">
                              YT
                            </span>
                          )}
                        </div>
                        <span className="text-[10px] text-slate-400 font-mono flex-shrink-0">
                          {new Date(msg.timestamp).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      </div>
                      <p className="text-[12px] leading-relaxed break-words">{msg.message}</p>
                    </div>
                  );
                })
              )}
              <div ref={chatEndRef} />
            </div>

            {/* Chat Input Bar */}
            <form
              onSubmit={handleSendMessage}
              className="p-3 border-t border-slate-200/60 dark:border-white/10 bg-slate-50/80 dark:bg-[#262832] space-y-1.5"
            >
              <div className="flex items-center justify-between text-[10px] text-slate-500 dark:text-slate-400 px-1">
                <span className="flex items-center space-x-1">
                  <UserCheck className="w-3 h-3 text-emerald-500" />
                  <span>
                    Chatting as <strong>{user.name || 'Student'}</strong>
                  </span>
                </span>
              </div>
              <div className="flex items-center space-x-2">
                <input
                  type="text"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  placeholder="Ask a doubt or reply live..."
                  maxLength={500}
                  className="flex-1 px-3.5 py-2.5 bg-white dark:bg-[#16181f] rounded-full text-xs text-slate-900 dark:text-white placeholder-slate-400 border border-slate-200 dark:border-white/10 outline-none"
                />
                <button
                  type="submit"
                  disabled={!chatInput.trim() || isSending}
                  className="p-2.5 rounded-full bg-[#0b57d0] text-white disabled:opacity-40 border-none outline-none cursor-pointer transition hover:scale-105 active:scale-95"
                  title="Send Reply"
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
