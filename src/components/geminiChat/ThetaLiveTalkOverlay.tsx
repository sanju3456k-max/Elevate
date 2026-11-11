import React, { useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Mic, 
  MicOff, 
  PhoneOff, 
  Sparkles, 
  Radio, 
  Volume2, 
  Square,
  MessageSquare,
  User as UserIcon,
  Bot
} from 'lucide-react';
import { GeminiLiveStatus } from '../../lib/geminiLiveClient';
import { ChatbotMessage } from './GeminiChatbotView';

export interface ThetaLiveTalkOverlayProps {
  isOpen: boolean;
  onCloseToChat: () => void;
  onEndCall: () => void;
  status: GeminiLiveStatus;
  volume: number;
  isMicMuted: boolean;
  onToggleMic: () => void;
  onInterrupt: () => void;
  currentUserTranscript: string;
  currentAssistantTranscript: string;
  messages: ChatbotMessage[];
  studentName?: string;
}

export const ThetaLiveTalkOverlay: React.FC<ThetaLiveTalkOverlayProps> = ({
  isOpen,
  onCloseToChat,
  onEndCall,
  status,
  volume,
  isMicMuted,
  onToggleMic,
  onInterrupt,
  currentUserTranscript,
  currentAssistantTranscript,
  messages,
  studentName = 'Harry',
}) => {
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll transcript container as speech streams in
  useEffect(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight;
    }
  }, [currentUserTranscript, currentAssistantTranscript, messages.length]);

  if (!isOpen) return null;

  const isSpeaking = status === 'speaking';
  const isListening = status === 'listening';
  const isConnecting = status === 'connecting';
  const isPaused = status === 'paused' || isMicMuted;

  // Normalized visual volume scale
  const normVol = Math.max(0.05, Math.min(1.0, volume * 2.2));
  const orbScale = isSpeaking ? 1 + normVol * 0.45 : isListening ? 1 + normVol * 0.25 : 1;

  // Recent messages for the live conversation thread (filtering system status)
  const recentDisplayMessages = messages
    .filter((m) => !m.isError && m.roleUsed !== 'System Status')
    .slice(-10);

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.98 }}
        transition={{ duration: 0.2, ease: 'easeOut' }}
        className="fixed inset-0 z-[120] bg-[#0c0d12]/95 backdrop-blur-2xl text-white flex flex-col justify-between overflow-hidden select-none"
      >
        {/* Ambient Animated Glow Mesh in Background */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden opacity-40">
          <motion.div
            animate={{
              scale: isSpeaking ? [1, 1.3, 1] : [1, 1.1, 1],
              opacity: isSpeaking ? [0.35, 0.6, 0.35] : [0.2, 0.35, 0.2],
            }}
            transition={{ repeat: Infinity, duration: isSpeaking ? 2.5 : 4, ease: 'easeInOut' }}
            className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[340px] sm:w-[500px] h-[340px] sm:h-[500px] rounded-full bg-gradient-to-tr from-blue-600/30 via-indigo-500/25 to-purple-600/30 blur-[90px]"
          />
        </div>

        {/* TOP BAR: Model Badge, Status & Clickable Theta Toggle Button */}
        <div className="relative z-10 flex items-center justify-between px-4 sm:px-6 py-3.5 border-b border-white/10 bg-white/5 backdrop-blur-md">
          {/* Left: Theta Live Brand & Live Audio Badge */}
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-blue-600 via-indigo-600 to-purple-600 flex items-center justify-center shadow-lg shadow-indigo-500/20">
              <span className="text-white font-bold text-sm tracking-tight">θ</span>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-sm sm:text-base tracking-tight bg-gradient-to-r from-blue-400 via-indigo-300 to-purple-300 bg-clip-text text-transparent">
                  Theta Live
                </span>
                <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 border border-blue-400/30">
                  Voice
                </span>
              </div>
              <p className="text-[11px] text-zinc-400">
                Speaking with {studentName}
              </p>
            </div>
          </div>

          {/* Right: Switch to Chat View (Theta Icon Button) & End Call */}
          <div className="flex items-center gap-2">
            {/* THETA BUTTON TO SWITCH TO FULL CHAT PAGE */}
            <button
              type="button"
              onClick={onCloseToChat}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-gradient-to-r from-blue-600/30 to-purple-600/30 hover:from-blue-600/50 hover:to-purple-600/50 text-blue-200 border border-blue-400/40 transition-all cursor-pointer active:scale-95 shadow-md shadow-indigo-900/20"
              title="Switch to full chat view (call continues in background)"
            >
              <div className="w-4.5 h-4.5 rounded-full bg-blue-500 flex items-center justify-center text-[11px] font-bold text-white">
                θ
              </div>
              <span className="text-xs font-semibold">View Chat</span>
              <MessageSquare className="w-3.5 h-3.5 opacity-80" />
            </button>

            {/* End Call Button */}
            <button
              type="button"
              onClick={onEndCall}
              className="w-8.5 h-8.5 rounded-full bg-red-500/20 hover:bg-red-500/30 text-red-400 border border-red-500/30 flex items-center justify-center transition-all cursor-pointer active:scale-95"
              title="End Live Voice Call"
            >
              <PhoneOff className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* CENTER INTERACTIVE STAGE: Dynamic Audio Orb & Live Streaming Transcript */}
        <div className="relative z-10 flex-1 flex flex-col items-center justify-between px-4 sm:px-8 py-3 overflow-hidden max-w-3xl mx-auto w-full">
          {/* Animated Voice Orb Visualizer (ChatGPT Voice Mode Style) */}
          <div className="my-auto flex flex-col items-center justify-center shrink-0 py-2">
            <div className="relative flex items-center justify-center">
              {/* Outer Pulsing Soundwave Rings */}
              {isSpeaking && (
                <>
                  <motion.div
                    animate={{ scale: [1, 1.45, 1], opacity: [0.6, 0.1, 0.6] }}
                    transition={{ repeat: Infinity, duration: 1.8, ease: 'easeInOut' }}
                    className="absolute w-36 sm:w-44 h-36 sm:h-44 rounded-full border border-blue-400/40"
                  />
                  <motion.div
                    animate={{ scale: [1, 1.7, 1], opacity: [0.4, 0, 0.4] }}
                    transition={{ repeat: Infinity, duration: 2.2, ease: 'easeInOut', delay: 0.3 }}
                    className="absolute w-36 sm:w-44 h-36 sm:h-44 rounded-full border border-purple-400/30"
                  />
                </>
              )}

              {isListening && (
                <motion.div
                  animate={{ scale: [1, 1.25, 1], opacity: [0.5, 0.15, 0.5] }}
                  transition={{ repeat: Infinity, duration: 1.5, ease: 'easeInOut' }}
                  className="absolute w-36 sm:w-44 h-36 sm:h-44 rounded-full border border-cyan-400/40"
                />
              )}

              {/* Main Dynamic Glowing Orb */}
              <motion.div
                animate={{
                  scale: orbScale,
                }}
                transition={{ type: 'spring', stiffness: 260, damping: 20 }}
                className={`w-28 sm:w-36 h-28 sm:h-36 rounded-full flex items-center justify-center shadow-2xl transition-all duration-300 ${
                  isSpeaking
                    ? 'bg-gradient-to-tr from-blue-600 via-indigo-500 to-purple-600 shadow-blue-500/50'
                    : isListening
                    ? 'bg-gradient-to-tr from-cyan-600 via-blue-600 to-indigo-600 shadow-cyan-500/40'
                    : isConnecting
                    ? 'bg-gradient-to-tr from-amber-600 via-orange-500 to-indigo-600 animate-pulse shadow-amber-500/30'
                    : 'bg-zinc-800 shadow-zinc-900 border border-zinc-700/60'
                }`}
              >
                {/* Center Theta Glyph / Icon */}
                <div className="flex flex-col items-center justify-center">
                  <span className="text-3xl sm:text-4xl font-extrabold text-white tracking-wider drop-shadow-md">
                    θ
                  </span>
                  {/* Miniature live wave bars inside orb */}
                  <div className="flex items-center gap-0.5 mt-1">
                    {[1, 2, 3, 4, 5].map((i) => {
                      const h = isSpeaking
                        ? 3 + normVol * 14 * Math.sin(i * 1.2)
                        : isListening
                        ? 2 + normVol * 8 * Math.cos(i * 1.1)
                        : 2;
                      return (
                        <div
                          key={i}
                          style={{ height: `${Math.max(2, h)}px` }}
                          className="w-1 bg-white/90 rounded-full transition-all duration-100"
                        />
                      );
                    })}
                  </div>
                </div>
              </motion.div>
            </div>

            {/* Current State Text Label */}
            <div className="mt-3.5 flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full ${
                isSpeaking
                  ? 'bg-emerald-400 animate-ping'
                  : isListening
                  ? 'bg-blue-400 animate-pulse'
                  : isConnecting
                  ? 'bg-amber-400 animate-spin'
                  : 'bg-zinc-500'
              }`} />
              <span className="text-xs sm:text-sm font-semibold tracking-wide text-zinc-300">
                {isConnecting
                  ? 'Connecting to Gemini Live...'
                  : isSpeaking
                  ? 'Theta is speaking...'
                  : isListening
                  ? 'Listening to you... Speak anytime'
                  : isPaused
                  ? 'Microphone muted'
                  : 'Ready'}
              </span>
            </div>
          </div>

          {/* REAL-TIME SPOKEN TRANSCRIPT STREAM (Messages showing as spoken) */}
          <div
            ref={scrollContainerRef}
            className="w-full max-h-[36vh] sm:max-h-[42vh] overflow-y-auto space-y-2.5 px-2 py-2 rounded-2xl bg-white/[0.04] border border-white/10 backdrop-blur-md scroll-smooth"
          >
            {/* Previous Turn History */}
            {recentDisplayMessages.map((msg) => (
              <div
                key={msg.id}
                className={`flex gap-2.5 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                {msg.role !== 'user' && (
                  <div className="w-6 h-6 rounded-full bg-indigo-600/80 flex items-center justify-center shrink-0 text-white text-[11px] font-bold mt-0.5">
                    θ
                  </div>
                )}
                <div
                  className={`max-w-[85%] px-3.5 py-2 rounded-2xl text-xs sm:text-[13px] leading-relaxed ${
                    msg.role === 'user'
                      ? 'bg-blue-600/70 text-white rounded-br-xs'
                      : 'bg-zinc-800/80 text-zinc-100 rounded-bl-xs border border-white/5'
                  }`}
                >
                  <p className="whitespace-pre-wrap">{msg.content}</p>
                </div>
                {msg.role === 'user' && (
                  <div className="w-6 h-6 rounded-full bg-blue-600 flex items-center justify-center shrink-0 text-white text-[10px] font-bold mt-0.5">
                    <UserIcon className="w-3.5 h-3.5" />
                  </div>
                )}
              </div>
            ))}

            {/* LIVE REAL-TIME IN-PROGRESS USER SPEECH (Types dynamically as spoken) */}
            {currentUserTranscript && (
              <div className="flex gap-2.5 justify-end animate-in fade-in duration-150">
                <div className="max-w-[85%] px-3.5 py-2 rounded-2xl text-xs sm:text-[13px] leading-relaxed bg-blue-600 text-white rounded-br-xs shadow-md shadow-blue-900/30 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-white animate-pulse shrink-0" />
                  <p className="whitespace-pre-wrap font-medium">{currentUserTranscript}</p>
                </div>
                <div className="w-6 h-6 rounded-full bg-blue-500 flex items-center justify-center shrink-0 text-white text-[10px] font-bold mt-0.5">
                  <Mic className="w-3.5 h-3.5" />
                </div>
              </div>
            )}

            {/* LIVE REAL-TIME IN-PROGRESS THETA RESPONSE (Types dynamically as spoken) */}
            {currentAssistantTranscript && (
              <div className="flex gap-2.5 justify-start animate-in fade-in duration-150">
                <div className="w-6 h-6 rounded-full bg-gradient-to-tr from-blue-600 to-purple-600 flex items-center justify-center shrink-0 text-white text-[11px] font-bold mt-0.5 shadow-xs">
                  θ
                </div>
                <div className="max-w-[85%] px-3.5 py-2 rounded-2xl text-xs sm:text-[13px] leading-relaxed bg-zinc-800 text-zinc-100 rounded-bl-xs border border-indigo-500/30 shadow-md shadow-indigo-950/20 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping shrink-0" />
                  <p className="whitespace-pre-wrap font-medium">{currentAssistantTranscript}</p>
                </div>
              </div>
            )}

            {/* Empty State Prompt */}
            {!currentUserTranscript && !currentAssistantTranscript && recentDisplayMessages.length === 0 && (
              <div className="text-center py-6 text-zinc-400 space-y-1">
                <p className="text-xs sm:text-sm font-medium">
                  Say anything to begin...
                </p>
                <p className="text-[11px] text-zinc-500">
                  "Theta, what are my weak topics?" or "Test me on calculus"
                </p>
              </div>
            )}
          </div>
        </div>

        {/* BOTTOM ACTION DOCK: Mic Mute, Interrupt, Theta Chat Toggle & End Call */}
        <div className="relative z-10 px-4 sm:px-6 py-4 border-t border-white/10 bg-white/5 backdrop-blur-xl">
          <div className="flex items-center justify-center gap-4 sm:gap-6 max-w-md mx-auto">
            {/* 1. Mute / Unmute Mic Button */}
            <button
              type="button"
              onClick={onToggleMic}
              className={`w-13 h-13 sm:w-14 sm:h-14 rounded-full flex flex-col items-center justify-center transition-all cursor-pointer active:scale-95 shadow-lg ${
                isMicMuted
                  ? 'bg-red-500/20 text-red-400 border border-red-500/40 shadow-red-500/10'
                  : 'bg-white/10 hover:bg-white/20 text-white border border-white/20'
              }`}
              title={isMicMuted ? 'Unmute microphone' : 'Mute microphone'}
            >
              {isMicMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
              <span className="text-[9px] font-bold mt-0.5">
                {isMicMuted ? 'Muted' : 'Mic'}
              </span>
            </button>

            {/* 2. Switch to Full Chat View (THETA ICON BUTTON) */}
            <button
              type="button"
              onClick={onCloseToChat}
              className="w-14 h-14 sm:w-15 sm:h-15 rounded-full bg-gradient-to-tr from-blue-600 via-indigo-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white flex flex-col items-center justify-center transition-all cursor-pointer active:scale-95 shadow-xl shadow-indigo-500/30 border border-white/20"
              title="Open full chat conversation (Call keeps running)"
            >
              <span className="text-lg font-black tracking-tight leading-none">θ</span>
              <span className="text-[9px] font-bold mt-0.5 tracking-wide">Chat</span>
            </button>

            {/* 3. Interrupt / Cancel Response Button (Active when Theta is speaking) */}
            <button
              type="button"
              onClick={onInterrupt}
              disabled={!isSpeaking}
              className={`w-13 h-13 sm:w-14 sm:h-14 rounded-full flex flex-col items-center justify-center transition-all cursor-pointer active:scale-95 shadow-lg ${
                isSpeaking
                  ? 'bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 animate-pulse'
                  : 'bg-white/5 text-zinc-500 border border-white/5 opacity-50 cursor-not-allowed'
              }`}
              title="Interrupt Theta's spoken response"
            >
              <Square className="w-4.5 h-4.5 fill-current" />
              <span className="text-[9px] font-bold mt-0.5">Pause</span>
            </button>

            {/* 4. End Call Hang-Up Button */}
            <button
              type="button"
              onClick={onEndCall}
              className="w-13 h-13 sm:w-14 sm:h-14 rounded-full bg-red-600 hover:bg-red-500 text-white flex flex-col items-center justify-center transition-all cursor-pointer active:scale-95 shadow-xl shadow-red-600/30 border border-red-400/40"
              title="End Voice Call"
            >
              <PhoneOff className="w-5 h-5" />
              <span className="text-[9px] font-bold mt-0.5">End</span>
            </button>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
};
