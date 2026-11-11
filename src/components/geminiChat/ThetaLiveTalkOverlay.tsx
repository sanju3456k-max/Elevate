import React, { useRef, useEffect, useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Mic, 
  MicOff, 
  X, 
  Sparkles, 
  MessageSquare, 
  Video, 
  Upload, 
  Menu, 
  MoreHorizontal, 
  ThumbsUp, 
  ThumbsDown, 
  Copy, 
  Check, 
  Share2, 
  Square,
  ArrowRight
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
  onSendPrompt?: (text: string) => void;
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
  onSendPrompt,
}) => {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [likedMap, setLikedMap] = useState<Record<string, 'up' | 'down'>>({});
  const [cameraActive, setCameraActive] = useState(false);
  const [showOptions, setShowOptions] = useState(false);

  // Auto-scroll transcript container as speech streams in
  useEffect(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight;
    }
  }, [currentUserTranscript, currentAssistantTranscript, messages.length]);

  // Find the latest completed user prompt and assistant response
  const conversationTurns = useMemo(() => {
    const valid = messages.filter((m) => !m.isError && m.roleUsed !== 'System Status');
    return valid;
  }, [messages]);

  const latestUserMessage = useMemo(() => {
    for (let i = conversationTurns.length - 1; i >= 0; i--) {
      if (conversationTurns[i].role === 'user') {
        return conversationTurns[i].content;
      }
    }
    return '';
  }, [conversationTurns]);

  const latestAssistantMessage = useMemo(() => {
    for (let i = conversationTurns.length - 1; i >= 0; i--) {
      if (conversationTurns[i].role === 'assistant') {
        return conversationTurns[i];
      }
    }
    return null;
  }, [conversationTurns]);

  // Copy helper
  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleLike = (id: string, type: 'up' | 'down') => {
    setLikedMap((prev) => ({
      ...prev,
      [id]: prev[id] === type ? undefined! : type,
    }));
  };

  if (!isOpen) return null;

  const isSpeaking = status === 'speaking';
  const isListening = status === 'listening';
  const isConnecting = status === 'connecting';
  const isPaused = status === 'paused' || isMicMuted;

  // Normalized visual volume scale
  const normVol = Math.max(0.08, Math.min(1.0, volume * 2.5));

  // Determine user prompt card text
  const displayUserPrompt = currentUserTranscript
    ? currentUserTranscript
    : latestUserMessage
    ? latestUserMessage
    : '';

  // Determine assistant response to show
  const hasActiveAssistantStream = Boolean(currentAssistantTranscript);
  const displayAssistantText = currentAssistantTranscript || latestAssistantMessage?.content || '';

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.98 }}
        transition={{ duration: 0.22, ease: 'easeOut' }}
        className="fixed inset-0 z-[120] bg-gradient-to-b from-[#f8fafd] via-[#edf3fa] to-[#e4eefb] dark:from-[#0c0d12] dark:via-[#11131a] dark:to-[#171a24] text-neutral-900 dark:text-neutral-100 flex flex-col justify-between overflow-hidden select-none"
      >
        {/* Ambient Animated Glow Mesh in Background */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden opacity-30 dark:opacity-40">
          <motion.div
            animate={{
              scale: isSpeaking ? [1, 1.25, 1] : [1, 1.1, 1],
              opacity: isSpeaking ? [0.45, 0.7, 0.45] : [0.25, 0.4, 0.25],
            }}
            transition={{ repeat: Infinity, duration: isSpeaking ? 2.5 : 4, ease: 'easeInOut' }}
            className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[340px] sm:w-[540px] h-[340px] sm:h-[540px] rounded-full bg-gradient-to-tr from-sky-400/30 via-indigo-400/25 to-purple-400/30 dark:from-blue-600/30 dark:via-indigo-500/25 dark:to-purple-600/30 blur-[100px]"
          />
        </div>

        {/* TOP BAR: Menu on Left, Pill on Right (Theta Button & Chat View Toggle) */}
        <div className="relative z-20 flex items-center justify-between px-5 sm:px-8 pt-5 pb-3">
          {/* Left: Menu / Drawer Icon Button */}
          <button
            type="button"
            onClick={onCloseToChat}
            className="w-10 h-10 rounded-full flex items-center justify-center text-neutral-700 dark:text-neutral-300 hover:bg-neutral-200/60 dark:hover:bg-neutral-800/60 transition-all cursor-pointer active:scale-95"
            title="Chat menu"
          >
            <Menu className="w-5 h-5" />
          </button>

          {/* Right: Pill container with Clickable Theta Icon Button, Chat Icon & Options */}
          <div className="flex items-center gap-1.5 p-1 rounded-full bg-white/80 dark:bg-neutral-800/80 backdrop-blur-md shadow-sm border border-neutral-200/60 dark:border-neutral-700/60">
            {/* THETA BUTTON TO SWITCH TO FULL CHAT PAGE */}
            <button
              type="button"
              onClick={onCloseToChat}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-gradient-to-r from-blue-600/15 via-indigo-600/15 to-purple-600/15 hover:from-blue-600/25 hover:to-purple-600/25 text-blue-700 dark:text-blue-300 transition-all cursor-pointer active:scale-95 group"
              title="Click Theta to switch to full chat conversation"
            >
              <div className="w-5 h-5 rounded-full bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center text-white text-xs font-bold shadow-xs">
                θ
              </div>
              <span className="text-xs font-bold tracking-tight">Theta</span>
            </button>

            {/* Chat Document/View Icon Button */}
            <button
              type="button"
              onClick={onCloseToChat}
              className="w-8 h-8 rounded-full flex items-center justify-center text-neutral-600 dark:text-neutral-300 hover:bg-neutral-200/50 dark:hover:bg-neutral-700/50 transition-all cursor-pointer active:scale-95"
              title="Open Chat Transcript"
            >
              <MessageSquare className="w-4 h-4" />
            </button>

            {/* 3-Dots Options Menu */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowOptions(!showOptions)}
                className="w-8 h-8 rounded-full flex items-center justify-center text-neutral-600 dark:text-neutral-300 hover:bg-neutral-200/50 dark:hover:bg-neutral-700/50 transition-all cursor-pointer active:scale-95"
                title="Options"
              >
                <MoreHorizontal className="w-4 h-4" />
              </button>

              {showOptions && (
                <div className="absolute right-0 mt-2 w-48 rounded-2xl bg-white dark:bg-neutral-800 shadow-xl border border-neutral-200 dark:border-neutral-700 p-2 z-30 animate-in fade-in zoom-in-95 duration-150">
                  <button
                    type="button"
                    onClick={() => {
                      setShowOptions(false);
                      onCloseToChat();
                    }}
                    className="w-full text-left px-3 py-2 text-xs font-medium text-neutral-700 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-700/60 rounded-xl transition-all flex items-center gap-2"
                  >
                    <MessageSquare className="w-3.5 h-3.5 text-blue-500" />
                    Open Chat View
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowOptions(false);
                      onToggleMic();
                    }}
                    className="w-full text-left px-3 py-2 text-xs font-medium text-neutral-700 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-700/60 rounded-xl transition-all flex items-center gap-2"
                  >
                    {isMicMuted ? <Mic className="w-3.5 h-3.5 text-emerald-500" /> : <MicOff className="w-3.5 h-3.5 text-amber-500" />}
                    {isMicMuted ? 'Unmute Microphone' : 'Mute Microphone'}
                  </button>
                  <div className="my-1 border-t border-neutral-200/60 dark:border-neutral-700/60" />
                  <button
                    type="button"
                    onClick={() => {
                      setShowOptions(false);
                      onEndCall();
                    }}
                    className="w-full text-left px-3 py-2 text-xs font-semibold text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-xl transition-all flex items-center gap-2"
                  >
                    <X className="w-3.5 h-3.5" />
                    End Live Call
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* UPPER CONVERSATION CANVAS (Google Gemini Live Response Experience) */}
        <div 
          ref={scrollContainerRef}
          className="relative z-10 flex-1 overflow-y-auto px-6 sm:px-12 md:px-20 py-4 flex flex-col justify-start max-w-3xl mx-auto w-full scroll-smooth"
        >
          {/* INITIAL STATE: Glowing Multi-Color Star + "What's next, [Name]?" */}
          {!displayAssistantText && !displayUserPrompt && (
            <div className="my-auto flex flex-col items-center justify-center text-center space-y-5 py-6">
              {/* Four-Point Multi-Color Radiant Star */}
              <motion.div
                animate={{
                  scale: [1, 1.1, 1],
                  rotate: [0, 4, -4, 0],
                }}
                transition={{ repeat: Infinity, duration: 4, ease: 'easeInOut' }}
                className="relative w-14 h-14 flex items-center justify-center"
              >
                <svg viewBox="0 0 48 48" fill="none" className="w-14 h-14 drop-shadow-md">
                  <defs>
                    <linearGradient id="geminiStarGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="#38bdf8" />
                      <stop offset="35%" stopColor="#4f46e5" />
                      <stop offset="70%" stopColor="#9333ea" />
                      <stop offset="100%" stopColor="#ec4899" />
                    </linearGradient>
                  </defs>
                  <path
                    d="M24 0C24 13.255 13.255 24 0 24C13.255 24 24 34.745 24 48C24 34.745 34.745 24 48 24C34.745 24 24 13.255 24 0Z"
                    fill="url(#geminiStarGrad)"
                  />
                </svg>
              </motion.div>

              {/* Greeting */}
              <div className="space-y-1">
                <h1 className="text-2xl sm:text-3xl font-medium tracking-tight text-neutral-800 dark:text-neutral-100">
                  What's next, {studentName}?
                </h1>
                <p className="text-sm text-neutral-500 dark:text-neutral-400">
                  {isConnecting ? 'Connecting to Gemini Live...' : 'Ask Theta anything or practice together'}
                </p>
              </div>

              {/* Quick suggestion chips */}
              <div className="flex flex-wrap items-center justify-center gap-2 pt-2 max-w-md">
                {[
                  'How are my test scores?',
                  'Test me on calculus',
                  'Summarize my weak topics',
                ].map((chip) => (
                  <button
                    key={chip}
                    type="button"
                    onClick={() => {
                      if (onSendPrompt) onSendPrompt(chip);
                    }}
                    className="px-3.5 py-2 rounded-full bg-white/70 dark:bg-neutral-800/70 hover:bg-white dark:hover:bg-neutral-800 text-neutral-700 dark:text-neutral-200 text-xs font-medium border border-neutral-200/60 dark:border-neutral-700/60 shadow-xs transition-all cursor-pointer active:scale-95"
                  >
                    {chip}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* ACTIVE ASSISTANT RESPONSE DISPLAY (Types out in real time) */}
          {(displayAssistantText || isSpeaking || isConnecting) && (
            <div className="w-full space-y-4 pt-2">
              {/* Connecting / Thinking Status */}
              {isConnecting && !displayAssistantText && (
                <div className="flex items-center gap-2 text-neutral-500 dark:text-neutral-400 text-sm font-medium animate-pulse">
                  <Sparkles className="w-4 h-4 text-blue-500 animate-spin" />
                  <span>Connecting to Theta Live...</span>
                </div>
              )}

              {/* Streaming or Completed Response Text */}
              {displayAssistantText && (
                <div className="space-y-3">
                  <div className="text-base sm:text-lg md:text-xl font-normal leading-relaxed text-neutral-800 dark:text-neutral-100 tracking-normal">
                    <p className="whitespace-pre-wrap">{displayAssistantText}</p>
                    {/* Glowing Live Cursor while Assistant is actively streaming */}
                    {hasActiveAssistantStream && (
                      <span className="inline-block w-2 h-4.5 ml-1 bg-gradient-to-b from-blue-500 to-indigo-500 rounded-sm animate-pulse align-middle" />
                    )}
                  </div>

                  {/* Under-Response Action Row (Thumbs Up, Down, Share, Copy, More) */}
                  {!hasActiveAssistantStream && displayAssistantText && (
                    <div className="flex items-center gap-1 text-neutral-500 dark:text-neutral-400 pt-1">
                      {/* Thumbs Up */}
                      <button
                        type="button"
                        onClick={() => handleLike('latest', 'up')}
                        className={`p-2 rounded-full hover:bg-neutral-200/50 dark:hover:bg-neutral-800/60 transition-all cursor-pointer active:scale-95 ${
                          likedMap['latest'] === 'up' ? 'text-blue-600 dark:text-blue-400' : ''
                        }`}
                        title="Good response"
                      >
                        <ThumbsUp className="w-4 h-4" />
                      </button>

                      {/* Thumbs Down */}
                      <button
                        type="button"
                        onClick={() => handleLike('latest', 'down')}
                        className={`p-2 rounded-full hover:bg-neutral-200/50 dark:hover:bg-neutral-800/60 transition-all cursor-pointer active:scale-95 ${
                          likedMap['latest'] === 'down' ? 'text-red-500' : ''
                        }`}
                        title="Poor response"
                      >
                        <ThumbsDown className="w-4 h-4" />
                      </button>

                      {/* Share */}
                      <button
                        type="button"
                        onClick={() => {
                          if (navigator.share) {
                            navigator.share({ title: 'Theta Live Response', text: displayAssistantText }).catch(() => {});
                          }
                        }}
                        className="p-2 rounded-full hover:bg-neutral-200/50 dark:hover:bg-neutral-800/60 transition-all cursor-pointer active:scale-95"
                        title="Share"
                      >
                        <Share2 className="w-4 h-4" />
                      </button>

                      {/* Copy */}
                      <button
                        type="button"
                        onClick={() => handleCopy(displayAssistantText, 'latest')}
                        className="p-2 rounded-full hover:bg-neutral-200/50 dark:hover:bg-neutral-800/60 transition-all cursor-pointer active:scale-95 relative"
                        title="Copy response"
                      >
                        {copiedId === 'latest' ? (
                          <Check className="w-4 h-4 text-emerald-500" />
                        ) : (
                          <Copy className="w-4 h-4" />
                        )}
                      </button>

                      {/* Pause / Interrupt if currently speaking */}
                      {isSpeaking && (
                        <button
                          type="button"
                          onClick={onInterrupt}
                          className="ml-2 flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/15 hover:bg-amber-500/25 text-amber-600 dark:text-amber-400 text-xs font-semibold border border-amber-500/30 transition-all cursor-pointer active:scale-95"
                          title="Interrupt Theta"
                        >
                          <Square className="w-3 h-3 fill-current" />
                          <span>Pause</span>
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* LOWER SECTION: User Prompt Card & Bottom Dock */}
        <div className="relative z-20 px-5 sm:px-8 pb-7 pt-2 flex flex-col items-center gap-4 max-w-xl mx-auto w-full">
          {/* USER INSTRUCTION CARD (Italic typography matching Gemini Live) */}
          <div className="w-full">
            <div className="w-full px-5 py-3.5 rounded-2xl bg-[#edf2f8]/90 dark:bg-neutral-800/90 border border-neutral-300/50 dark:border-neutral-700/60 shadow-xs backdrop-blur-md transition-all">
              {displayUserPrompt ? (
                <div className="flex items-center gap-2.5">
                  {currentUserTranscript && (
                    <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse shrink-0" />
                  )}
                  <p className="text-sm sm:text-base italic text-neutral-800 dark:text-neutral-200 font-normal leading-snug">
                    {displayUserPrompt}
                  </p>
                </div>
              ) : (
                <p className="text-sm italic text-neutral-400 dark:text-neutral-500 font-normal">
                  {isListening ? 'Listening to you... Speak anytime' : 'Ask Theta anything or tap the mic...'}
                </p>
              )}
            </div>
          </div>

          {/* BOTTOM DOCK (5 Circular / Pill Controls matching Gemini Live) */}
          <div className="w-full flex items-center justify-between sm:justify-center sm:gap-5 px-1">
            {/* 1. Camera / Video Button */}
            <button
              type="button"
              onClick={() => setCameraActive(!cameraActive)}
              className={`w-12 h-12 rounded-full shadow-md flex items-center justify-center transition-all cursor-pointer active:scale-95 border ${
                cameraActive
                  ? 'bg-blue-600 text-white border-blue-500 shadow-blue-500/30'
                  : 'bg-white dark:bg-neutral-800 text-neutral-700 dark:text-neutral-200 border-neutral-200/70 dark:border-neutral-700/70 hover:bg-neutral-50 dark:hover:bg-neutral-750'
              }`}
              title={cameraActive ? 'Camera active' : 'Enable camera / visuals'}
            >
              <Video className="w-5 h-5" />
            </button>

            {/* 2. Upload / App Context Button */}
            <button
              type="button"
              onClick={onCloseToChat}
              className="w-12 h-12 rounded-full bg-white dark:bg-neutral-800 shadow-md flex items-center justify-center text-neutral-700 dark:text-neutral-200 border border-neutral-200/70 dark:border-neutral-700/70 hover:bg-neutral-50 dark:hover:bg-neutral-750 transition-all cursor-pointer active:scale-95"
              title="Upload context or view chat notes"
            >
              <Upload className="w-5 h-5" />
            </button>

            {/* 3. Centerpiece: The Iconic Gemini Live Glowing Fluid Wave Capsule */}
            <div className="w-24 sm:w-28 h-12 rounded-full relative overflow-hidden bg-white/95 dark:bg-neutral-900/95 shadow-lg border border-neutral-200/70 dark:border-neutral-700/70 flex items-center justify-center select-none">
              {/* Fluid animated liquid wave background */}
              <motion.div
                animate={{
                  y: isSpeaking
                    ? [4, -4, 4]
                    : isListening
                    ? [2, -2, 2]
                    : [0, 0, 0],
                  scaleY: isSpeaking
                    ? [1, 1 + normVol * 0.9, 1]
                    : isListening
                    ? [1, 1 + normVol * 0.5, 1]
                    : 1,
                }}
                transition={{
                  repeat: Infinity,
                  duration: isSpeaking ? 1.6 : 2.4,
                  ease: 'easeInOut',
                }}
                className="absolute inset-0 flex items-end justify-center pointer-events-none"
              >
                {/* Radiant Aurora Gradient Wave */}
                <div 
                  style={{
                    height: `${Math.max(22, 22 + normVol * 26)}px`,
                  }}
                  className={`w-full rounded-t-full transition-all duration-150 blur-[2px] opacity-90 ${
                    isSpeaking
                      ? 'bg-gradient-to-t from-blue-600 via-indigo-500 to-cyan-400'
                      : isListening
                      ? 'bg-gradient-to-t from-cyan-500 via-sky-400 to-indigo-500'
                      : 'bg-gradient-to-t from-blue-500/40 via-indigo-500/30 to-purple-500/20'
                  }`}
                />
              </motion.div>

              {/* Center Theta Glyph overlaid */}
              <div className="relative z-10 flex items-center justify-center">
                <span className="text-white font-extrabold text-sm drop-shadow-md">
                  θ
                </span>
              </div>
            </div>

            {/* 4. Microphone Toggle Button */}
            <button
              type="button"
              onClick={onToggleMic}
              className={`w-12 h-12 rounded-full shadow-md flex items-center justify-center transition-all cursor-pointer active:scale-95 border ${
                isMicMuted
                  ? 'bg-red-500/15 text-red-500 border-red-500/30'
                  : isListening
                  ? 'bg-white dark:bg-neutral-800 text-neutral-800 dark:text-neutral-100 border-blue-400/50 shadow-blue-500/20 ring-2 ring-blue-400/30'
                  : 'bg-white dark:bg-neutral-800 text-neutral-700 dark:text-neutral-200 border-neutral-200/70 dark:border-neutral-700/70 hover:bg-neutral-50 dark:hover:bg-neutral-750'
              }`}
              title={isMicMuted ? 'Unmute microphone' : 'Mute microphone'}
            >
              {isMicMuted ? <MicOff className="w-5 h-5 text-red-500" /> : <Mic className="w-5 h-5" />}
            </button>

            {/* 5. Close / End Live Talk Button */}
            <button
              type="button"
              onClick={onEndCall}
              className="w-12 h-12 rounded-full bg-white dark:bg-neutral-800 shadow-md flex items-center justify-center text-neutral-700 dark:text-neutral-200 border border-neutral-200/70 dark:border-neutral-700/70 hover:bg-neutral-50 dark:hover:bg-neutral-750 transition-all cursor-pointer active:scale-95"
              title="End Live Talk"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
};
