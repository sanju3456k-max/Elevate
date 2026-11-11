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
  CloudOff 
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
  hasSessions
}) => {
  return (
    <aside
      className={`fixed inset-y-0 right-0 z-50 h-full w-[88vw] max-w-[340px] sm:max-w-sm bg-white dark:bg-[#1e2024] border-l border-slate-100 dark:border-zinc-800/80 shadow-2xl rounded-l-[24px] flex flex-col shrink-0 transition-transform duration-200 ease-out drawer-panel ${
        isSidebarOpen ? 'translate-x-0' : 'translate-x-full'
      }`}
    >
      {/* Sidebar Header */}
      <div className="p-4 sm:p-5 pt-[calc(env(safe-area-inset-top,0px)+1rem)] bg-white dark:bg-[#1e2024] flex items-center justify-between shrink-0 rounded-tl-[24px] border-b border-slate-100 dark:border-zinc-800/80">
        <div className="flex items-center gap-2.5">
          <div className="w-10 h-10 rounded-full bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0 border border-blue-100 dark:border-blue-900/40 shadow-xs">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="font-bold text-base text-slate-800 dark:text-zinc-100 tracking-tight">
                Chat History
              </span>
            </div>
            <div className="w-full h-[2px] mt-0.5 rounded-full bg-gradient-to-r from-blue-500 to-indigo-500 opacity-90" />
          </div>
        </div>
        <button
          onClick={() => setIsSidebarOpen(false)}
          className="w-9 h-9 rounded-full flex items-center justify-center text-slate-500 hover:text-slate-800 dark:text-zinc-400 dark:hover:text-zinc-100 hover:bg-slate-100 dark:hover:bg-[#282a2d] cursor-pointer transition-colors"
          title="Close chat history (Esc)"
          aria-label="Close chat history"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
      </div>

      <div className="p-4 space-y-3 bg-white dark:bg-[#1e2024] border-b border-slate-100 dark:border-zinc-800/80 shrink-0">
        <button
          onClick={() => {
            handleNewChat();
            setIsSidebarOpen(false);
          }}
          className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs transition-all shadow-xs cursor-pointer active:scale-98"
        >
          <Plus className="w-4 h-4" />
          <span>New Conversation</span>
        </button>
        </button>

        {/* Search conversations */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search chats..."
              value={historySearchQuery}
              onChange={(e) => setHistorySearchQuery(e.target.value)}
              className="w-full bg-slate-50 dark:bg-[#21222e] border border-slate-200/80 dark:border-transparent shadow-xs rounded-xl pl-8.5 pr-3 py-1.5 text-xs text-slate-800 dark:text-zinc-200 placeholder-slate-400 focus:outline-none focus:border-blue-500 focus:bg-white transition-all"
            />
          </div>
          {activeSessionHasMessages && (
            <button
              onClick={handleClearCurrentChat}
              className="w-8 h-8 rounded-xl flex items-center justify-center text-slate-500 hover:text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-950/30 transition-colors shrink-0 cursor-pointer shadow-xs border border-slate-200/80 dark:border-transparent bg-slate-50 dark:bg-[#21222e]"
              title="Clear messages in current chat"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          )}
          {hasSessions && (
            <button
              onClick={handleDeleteAllSessions}
              className="w-8 h-8 rounded-xl flex items-center justify-center text-slate-500 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors shrink-0 cursor-pointer shadow-xs border border-slate-200/80 dark:border-transparent bg-slate-50 dark:bg-[#21222e]"
              title="Delete all chat history"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Scrollable Sessions List */}
      <div className="flex-1 overflow-y-auto p-2.5 space-y-1.5 bg-white dark:bg-[#1a1b1e]">
        {filteredSessions.length === 0 ? (
          <div className="p-4 text-center text-xs text-slate-400">
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
                className={`group relative flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-medium cursor-pointer transition-all border ${
                  isActive
                    ? 'bg-blue-50 dark:bg-[#282a2d] border-blue-200/80 dark:border-blue-900/60 text-blue-900 dark:text-blue-300 font-bold shadow-xs'
                    : 'bg-white dark:bg-[#1a1b1e] border-slate-100 dark:border-zinc-800/60 text-slate-700 dark:text-zinc-300 hover:bg-slate-50 dark:hover:bg-[#232428] hover:border-slate-200'
                }`}
              >
                <div className="flex items-center gap-2 min-w-0 flex-1 pr-1">
                  <MessageSquare className={`w-3.5 h-3.5 shrink-0 ${isActive ? 'text-blue-600 dark:text-blue-400' : 'text-slate-400'}`} />
                  <span className="truncate">{session.title || 'New Conversation'}</span>
                </div>

                <div className="flex items-center gap-1 shrink-0 ml-1">
                  <button
                    type="button"
                    onClick={(e) => handleDeleteSession(session.id, e)}
                    className="w-6.5 h-6.5 rounded-lg flex items-center justify-center opacity-0 group-hover:opacity-100 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-[#3c4043] transition-all cursor-pointer"
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
