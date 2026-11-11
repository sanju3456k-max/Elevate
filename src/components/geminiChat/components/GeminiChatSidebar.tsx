import React from 'react';
import { 
  Sparkles, 
  ArrowLeft, 
  Plus, 
  Search, 
  RotateCcw, 
  Trash2, 
  MessageSquare, 
  Cloud, 
  CloudOff,
  Settings2,
  X
} from 'lucide-react';
import { ChatSession, GeminiModelTier } from '../types';

interface GeminiChatSidebarProps {
  isSidebarOpen: boolean;
  setIsSidebarOpen: (open: boolean) => void;
  historySearchQuery: string;
  setHistorySearchQuery: (query: string) => void;
  handleNewChat: () => void;
  handleClearCurrentChat: () => void;
  handleDeleteAllSessions: () => void;
  filteredSessions: ChatSession[];
  activeSessionId: string;
  setActiveSessionId: (id: string) => void;
  setSelectedModel: (model: GeminiModelTier) => void;
  handleDeleteSession: (sessionId: string, e: React.MouseEvent) => void;
  activeSessionHasMessages: boolean;
  hasSessions: boolean;
  selectedModel?: GeminiModelTier;
  onOpenModelDropdown?: () => void;
  onOpenPersonaSettings?: () => void;
  activeRoleName?: string;
}

export const GeminiChatSidebar: React.FC<GeminiChatSidebarProps> = ({
  isSidebarOpen,
  setIsSidebarOpen,
  historySearchQuery,
  setHistorySearchQuery,
  handleNewChat,
  handleClearCurrentChat,
  handleDeleteAllSessions,
  filteredSessions,
  activeSessionId,
  setActiveSessionId,
  setSelectedModel,
  handleDeleteSession,
  activeSessionHasMessages,
  hasSessions,
  selectedModel = 'gemini-3.1-flash-lite',
  onOpenModelDropdown,
  onOpenPersonaSettings,
  activeRoleName = 'Theta AI Tutor'
}) => {
  return (
    <aside
      className={`fixed inset-y-0 right-0 z-50 h-full w-[88vw] max-w-[340px] sm:max-w-sm bg-white dark:bg-[#1e2024] shadow-2xl rounded-l-[28px] flex flex-col justify-between overflow-hidden touch-pan-y cursor-default drawer-panel relative z-10 text-[#1f1f1f] dark:text-[#e3e3e3] border-0 ring-0 transition-transform duration-200 ease-out ${
        isSidebarOpen ? 'translate-x-0' : 'translate-x-full'
      }`}
    >
      {/* Sidebar Header */}
      <div className="p-4 sm:p-5 pt-[calc(env(safe-area-inset-top,0px)+1rem)] bg-white dark:bg-[#1e2024] flex items-center justify-between shrink-0 rounded-tl-[28px] border-b border-slate-100 dark:border-zinc-800/80">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-[#d3e3fd]/60 dark:bg-[#004a77]/40 text-[#0b57d0] dark:text-[#a8c7fa] flex items-center justify-center shrink-0 shadow-xs">
            <Sparkles className="w-5 h-5 stroke-[2.2]" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="font-bold text-base text-[#1f1f1f] dark:text-[#e3e3e3] tracking-tight">
                Chat History
              </span>
            </div>
            <span className="text-[11px] font-medium text-[#5e5e5e] dark:text-[#9aa0a6]">
              Theta conversations
            </span>
          </div>
        </div>
        <button
          onClick={() => setIsSidebarOpen(false)}
          className="w-9 h-9 rounded-full bg-[#f0f4f9] dark:bg-[#282a30] hover:bg-[#e2e8f0] dark:hover:bg-[#32363d] text-[#1f1f1f] dark:text-[#e3e3e3] flex items-center justify-center transition-all cursor-pointer active:scale-95 border-0 shadow-none"
          title="Close chat history (Esc)"
          aria-label="Close chat history"
        >
          <ArrowLeft className="w-4.5 h-4.5" />
        </button>
      </div>

      <div className="p-3 sm:p-4 bg-white dark:bg-[#1e2024] border-b border-slate-100 dark:border-zinc-800/80 shrink-0">
        {/* Search, Clear Messages & New Conversation in ONE ROW */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1 min-w-0">
            <div className="h-10 w-full rounded-full bg-[#f0f4f9] dark:bg-[#141619] flex items-center px-3.5 gap-2 border-0 shadow-none transition-all">
              <Search className="w-4 h-4 text-[#0b57d0] dark:text-[#a8c7fa] shrink-0 stroke-[2.2]" />
              <input
                type="text"
                value={historySearchQuery}
                onChange={(e) => setHistorySearchQuery(e.target.value)}
                placeholder="Search chats..."
                className="w-full bg-transparent text-xs text-[#1f1f1f] dark:text-[#e3e3e3] placeholder-[#5e5e5e]/70 dark:placeholder-[#9aa0a6]/70 border-0 outline-none focus:ring-0 font-normal min-w-0"
              />
              {historySearchQuery && (
                <button
                  type="button"
                  onClick={() => setHistorySearchQuery('')}
                  className="w-5 h-5 rounded-full bg-transparent hover:bg-[#1f1f1f]/8 dark:hover:bg-[#e3e3e3]/8 text-[#5e5e5e] dark:text-[#9aa0a6] flex items-center justify-center transition-all cursor-pointer border-0 shrink-0"
                  title="Clear search"
                >
                  <X className="w-3.5 h-3.5 stroke-[2.5]" />
                </button>
              )}
            </div>
          </div>
          {activeSessionHasMessages && (
            <button
              type="button"
              onClick={handleClearCurrentChat}
              className="w-10 h-10 rounded-full bg-[#f0f4f9] dark:bg-[#141619] hover:bg-amber-50 hover:text-amber-600 dark:hover:bg-amber-950/40 text-[#5e5e5e] dark:text-[#9aa0a6] border-0 shadow-none flex items-center justify-center transition-all cursor-pointer active:scale-95 shrink-0"
              title="Clear messages in current chat"
              aria-label="Clear messages in current chat"
            >
              <RotateCcw className="w-4 h-4 stroke-[2.2]" />
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              handleNewChat();
              setIsSidebarOpen(false);
            }}
            className="w-10 h-10 rounded-full bg-[#0b57d0] hover:bg-[#0842a0] text-white flex items-center justify-center shadow-[0_2px_6px_rgba(11,87,208,0.25)] cursor-pointer active:scale-95 transition-all select-none border-0 outline-none shrink-0"
            title="New Conversation"
            aria-label="New Conversation"
          >
            <Plus className="w-5 h-5 stroke-[2.5]" />
          </button>
        </div>
      </div>

      {/* Scrollable Sessions List (Transparent entries on white background) */}
      <div className="p-3 sm:p-4 space-y-1 overflow-y-auto flex-1 overscroll-contain bg-white dark:bg-[#1e2024] [scrollbar-width:thin]">
        {filteredSessions.length === 0 ? (
          <div className="py-12 text-center text-xs text-[#5e5e5e] dark:text-[#9aa0a6]">
            No conversations found.
          </div>
        ) : (
          filteredSessions.map((session) => {
            const isActive = session.id === activeSessionId;
            return (
              <div
                key={session.id}
                onClick={() => {
                  setActiveSessionId(session.id);
                  if (session.modelTier) {
                    setSelectedModel(session.modelTier);
                  }
                  if (typeof window !== 'undefined') {
                    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
                    if (document.documentElement) document.documentElement.scrollTop = 0;
                    if (document.body) document.body.scrollTop = 0;
                    if (window.innerWidth < 1024) {
                      setIsSidebarOpen(false);
                    }
                  }
                }}
                className={`w-full flex items-center justify-between p-3 rounded-[20px] sm:rounded-[24px] transition-all duration-150 cursor-pointer border-0 select-none group ${
                  isActive
                    ? 'bg-[#d3e3fd]/60 dark:bg-[#004a77]/35 text-[#041e49] dark:text-[#c2e7ff] font-bold shadow-none'
                    : 'bg-transparent hover:bg-[#f0f4f9] dark:hover:bg-[#282a30] text-[#1f1f1f] dark:text-[#e3e3e3] shadow-none'
                }`}
              >
                <div className="flex items-center gap-3 min-w-0 flex-1 pr-1">
                  <div className={`w-9 h-9 sm:w-10 sm:h-10 rounded-full flex items-center justify-center shrink-0 transition-colors ${
                    isActive 
                      ? 'bg-[#0b57d0] text-white dark:bg-[#a8c7fa] dark:text-[#041e49] shadow-xs' 
                      : 'bg-[#f0f4f9] dark:bg-[#282a30] text-[#0b57d0] dark:text-[#a8c7fa] group-hover:bg-[#e1e9f5] dark:group-hover:bg-[#343840]'
                  }`}>
                    <MessageSquare className="w-4.5 h-4.5 stroke-[2]" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-semibold text-xs sm:text-[13px] text-[#1f1f1f] dark:text-[#e3e3e3] leading-snug">
                      {session.title || 'New Conversation'}
                    </div>
                    <div className="text-[11px] text-[#5e5e5e] dark:text-[#9aa0a6] flex items-center gap-1.5 mt-0.5 font-medium">
                      <span>{session.messages?.length || 0} msgs</span>
                      {session.updatedAt && (
                        <>
                          <span>•</span>
                          <span>{new Date(session.updatedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-1 shrink-0 ml-1">
                  <button
                    type="button"
                    onClick={(e) => handleDeleteSession(session.id, e)}
                    className="w-8 h-8 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 text-[#5e5e5e] dark:text-[#9aa0a6] hover:text-[#ba1a1a] dark:hover:text-[#ffb4ab] hover:bg-red-50 dark:hover:bg-red-950/40 transition-all cursor-pointer border-0 bg-transparent shrink-0"
                    title="Delete chat"
                    aria-label="Delete conversation"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </aside>
  );
};
