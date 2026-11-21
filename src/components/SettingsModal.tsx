import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { setAppThemeColor } from '../lib/appThemeColor';
import { 
  ChevronLeft,
  ArrowLeft,
  Upload, 
  Download, 
  FileJson, 
  Cloud, 
  CloudDownload, 
  CheckCircle2, 
  AlertCircle,
  RefreshCw,
  HardDrive,
  UserCheck,
  UserX,
  Trash2,
  ShieldAlert,
  FileText,
  BarChart2,
  Bot,
  Layers,
  Sparkles,
  X
} from 'lucide-react';
import { useBackHandler } from '../hooks/useBackNavigation';
import { useScrollLock } from '../hooks/useScrollLock';
import { gpuAcceleratedStyle } from '../lib/animationConfig';
import { 
  getLocalDataStorageStats,
  exportAllLocalDataAsJson,
  importAllLocalDataFromJson,
  getCustomDataStats,
  deleteCustomDataAuthoredTests,
  deleteCustomDataAttempts,
  deleteCustomDataChatHistories,
  deleteCustomDataNotes,
  deleteCustomDataHtmlNotes
} from '../lib/storage';
import { syncHub } from '../lib/syncEngine';
import { DeleteAccountModal } from './DeleteAccountModal';
import { APP_STYLES } from './ui/AppStyles';
import { M3Switch, M3Button, M3Divider } from './ui/Material3';
import { Sun, Moon, Monitor, Sliders } from 'lucide-react';
import type { User } from 'firebase/auth';
import { probeFirestoreConnectivity, isGlobalQuotaExceeded } from '../lib/firebase';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser?: User | null;
  onDataChanged?: () => void;
  uiScale?: any;
  onScaleChange?: (_scale: any) => void;
  isDarkMode?: boolean;
  onToggleTheme?: () => void;
}

type ConfirmDeleteTarget = {
  type: 'tests' | 'attempts_all' | 'attempts_omr' | 'attempts_online' | 'chats' | 'notes' | 'html_notes';
  title: string;
  description: string;
  count: number;
} | null;

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  onDataChanged,
  uiScale,
  onScaleChange,
  isDarkMode,
  onToggleTheme,
}) => {
  const [storageStats, setStorageStats] = useState(() => getLocalDataStorageStats(currentUser?.uid || null));
  const [customStats, setCustomStats] = useState(() => getCustomDataStats(currentUser?.uid || null));
  const [syncStatus, setSyncStatus] = useState<{ type: 'idle' | 'loading' | 'success' | 'error'; message: string }>({
    type: 'idle',
    message: '',
  });
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [confirmDeleteTarget, setConfirmDeleteTarget] = useState<ConfirmDeleteTarget>(null);
  const [isDeletingCustomData, setIsDeletingCustomData] = useState(false);
  const [isDraggingBackup, setIsDraggingBackup] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Lock body & html scrolling while Settings & Storage page is open
  useScrollLock(isOpen);

  useBackHandler({
    isOpen,
    onBack: onClose,
    priority: 50,
    id: 'settings_modal_back',
  });

  const refreshStats = () => {
    const activeUid = currentUser?.uid || null;
    setStorageStats(getLocalDataStorageStats(activeUid));
    setCustomStats(getCustomDataStats(activeUid));
  };

  useEffect(() => {
    if (isOpen) {
      refreshStats();
      setSyncStatus({ type: 'idle', message: '' });
    }
  }, [isOpen, currentUser]);

  // Synchronize browser status bar theme-color with Settings modal header background (#ffffff light / #0b0c10 dark)
  useEffect(() => {
    if (!isOpen) return;
    const targetColor = isDarkMode ? '#0b0c10' : '#ffffff';
    setAppThemeColor(targetColor);
  }, [isOpen, isDarkMode]);

  const handleExportJsonArchive = async () => {
    try {
      setSyncStatus({ type: 'loading', message: 'Generating complete backup archive...' });
      const jsonStr = await exportAllLocalDataAsJson(currentUser?.uid || null);
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const dateStr = new Date().toISOString().split('T')[0];
      a.href = url;
      a.download = `elevate_storage_backup_${dateStr}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setSyncStatus({ type: 'success', message: 'Comprehensive JSON backup exported (tests, attempts, chats, study notes, HTML notes studio projects & preferences).' });
    } catch (err: any) {
      setSyncStatus({ type: 'error', message: `Export failed: ${err.message || String(err)}` });
    }
  };

  const processImportBackupFile = (file: File) => {
    const fileNameLower = file.name.toLowerCase();
    const isJson = fileNameLower.endsWith('.json') || fileNameLower.endsWith('.txt') || file.type.includes('json') || file.type.includes('text');
    if (!isJson) {
      setSyncStatus({ type: 'error', message: 'Invalid file type. Please provide a valid JSON (.json) backup file.' });
      return;
    }

    setSyncStatus({ type: 'loading', message: 'Restoring backup data...' });
    const reader = new FileReader();
    reader.onload = async (event) => {
      const content = event.target?.result as string;
      if (content) {
        const result = await importAllLocalDataFromJson(content, currentUser?.uid || null);
        if (result.success) {
          syncHub.ingestImportedData({
            tests: result.mergedTests,
            attempts: result.mergedAttempts,
            activeUserId: currentUser?.uid || null,
          });
          setSyncStatus({ type: 'success', message: result.message || 'Data import succeeded!' });
          refreshStats();
          onDataChanged?.();

          // If signed in, immediately flush to Google Cloud so the restored data is permanently preserved
          if (currentUser?.uid) {
            syncHub.backupAllLocalDataToCloud(currentUser.uid).then((res) => {
              if (res.success) {
                setSyncStatus({
                  type: 'success',
                  message: `${result.message} (Synced to Google Cloud)`,
                });
              }
            }).catch((err) => {
              console.warn('Post-import cloud backup error:', err);
            });
          }
        } else {
          setSyncStatus({ type: 'error', message: result.message || 'Import failed.' });
        }
      }
      if (fileInputRef.current) fileInputRef.current.value = '';
    };
    reader.onerror = () => {
      setSyncStatus({ type: 'error', message: 'Failed to read backup file.' });
      if (fileInputRef.current) fileInputRef.current.value = '';
    };
    reader.readAsText(file);
  };

  const handleImportFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    processImportBackupFile(file);
  };

  const handleCloudBackupAll = async () => {
    if (!currentUser) {
      setSyncStatus({ type: 'error', message: 'Sign in with Google required for Cloud Backup.' });
      return;
    }
    setSyncStatus({ type: 'loading', message: 'Verifying cloud connection...' });
    if (isGlobalQuotaExceeded()) {
      await probeFirestoreConnectivity();
    }
    setSyncStatus({ type: 'loading', message: 'Backing up local data to Google Cloud...' });
    try {
      const res = await syncHub.backupAllLocalDataToCloud(currentUser.uid);
      if (res.success) {
        setSyncStatus({
          type: 'success',
          message: `Backed up ${res.testsBackedUp} tests, ${res.attemptsBackedUp} attempts & ${res.htmlProjectsBackedUp || 0} HTML projects to Google Cloud!`,
        });
        refreshStats();
      } else {
        setSyncStatus({ type: 'error', message: res.error || 'Cloud backup failed.' });
      }
    } catch (err: any) {
      setSyncStatus({ type: 'error', message: `Cloud backup error: ${err.message || String(err)}` });
    }
  };

  const handleCloudDownloadAll = async () => {
    if (!currentUser) {
      setSyncStatus({ type: 'error', message: 'Sign in with Google required to download from Cloud.' });
      return;
    }
    setSyncStatus({ type: 'loading', message: 'Verifying cloud connection...' });
    if (isGlobalQuotaExceeded()) {
      await probeFirestoreConnectivity();
    }
    setSyncStatus({ type: 'loading', message: 'Downloading data from Google Cloud...' });
    try {
      const res = await syncHub.downloadAllDataFromCloud(currentUser.uid);
      if (res.success) {
        setSyncStatus({
          type: 'success',
          message: `Synchronized ${res.testsFetched} tests, ${res.attemptsFetched} attempts & ${res.htmlProjectsFetched || 0} HTML projects from Cloud!`,
        });
        refreshStats();
        onDataChanged?.();
      } else {
        setSyncStatus({ type: 'error', message: res.error || 'Cloud download failed.' });
      }
    } catch (err: any) {
      setSyncStatus({ type: 'error', message: `Cloud download error: ${err.message || String(err)}` });
    }
  };

  const handleExecuteDeleteCustomData = async () => {
    if (!confirmDeleteTarget) return;
    setIsDeletingCustomData(true);
    const uid = currentUser?.uid || null;

    try {
      let deletedCount = 0;
      let label = '';

      if (confirmDeleteTarget.type === 'tests') {
        deletedCount = await deleteCustomDataAuthoredTests(uid);
        label = `${deletedCount} authored test papers deleted.`;
      } else if (confirmDeleteTarget.type === 'attempts_all') {
        deletedCount = await deleteCustomDataAttempts(uid, 'all');
        label = `${deletedCount} total exam attempts deleted.`;
      } else if (confirmDeleteTarget.type === 'attempts_omr') {
        deletedCount = await deleteCustomDataAttempts(uid, 'omr');
        label = `${deletedCount} OMR exam attempts deleted.`;
      } else if (confirmDeleteTarget.type === 'attempts_online') {
        deletedCount = await deleteCustomDataAttempts(uid, 'online');
        label = `${deletedCount} Online exam attempts deleted.`;
      } else if (confirmDeleteTarget.type === 'chats') {
        deletedCount = await deleteCustomDataChatHistories(uid);
        label = `${deletedCount} Gemini AI chat conversations cleared.`;
      } else if (confirmDeleteTarget.type === 'notes') {
        deletedCount = await deleteCustomDataNotes(uid);
        label = `${deletedCount} Study notes & formulas deleted.`;
      } else if (confirmDeleteTarget.type === 'html_notes') {
        deletedCount = await deleteCustomDataHtmlNotes(uid);
        label = `${deletedCount} HTML notes projects & files deleted.`;
      }

      setSyncStatus({ type: 'success', message: label });
      refreshStats();
      onDataChanged?.();
    } catch (err: any) {
      setSyncStatus({ type: 'error', message: `Failed to delete data: ${err.message || String(err)}` });
    } finally {
      setIsDeletingCustomData(false);
      setConfirmDeleteTarget(null);
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex flex-col md:items-center md:justify-center md:p-6 lg:p-8 overflow-hidden">
        {/* Desktop Backdrop with blur */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          onClick={onClose}
          className="fixed inset-0 bg-black/45 backdrop-blur-xs hidden md:block"
          aria-hidden="true"
        />

        {/* Modal Window: Fullscreen on mobile, centered rounded dialog on desktop */}
        <motion.div 
          initial={{ opacity: 0, scale: 0.98, y: 12 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.98, y: 12 }}
          transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
          style={gpuAcceleratedStyle}
          className="relative w-full h-full md:max-w-4xl md:max-h-[86vh] bg-white dark:bg-[#0b0c10] text-[#1f1f1f] dark:text-[#e3e3e3] font-sans antialiased flex flex-col md:rounded-[28px] md:shadow-2xl md:border md:border-slate-200/80 dark:md:border-zinc-800/80 overflow-hidden z-10"
        >
          {/* HEADER: TRANSPARENT BACKGROUND, OMR STYLE BACK BUTTON + DESKTOP CLOSE */}
          <div className="px-3.5 sm:px-6 pt-[calc(var(--android-status-bar-height,env(safe-area-inset-top,0px))+0.55rem)] md:pt-3 pb-3 flex items-center justify-between shrink-0 z-30 bg-transparent border-b border-slate-100 dark:border-zinc-800/80 md:border-none shadow-none">
            <div className="flex items-center gap-3 min-w-0">
              {/* Pure Back Array Button */}
              <button
                id="back-from-settings-btn"
                type="button"
                onClick={onClose}
                title="Back to App"
                aria-label="Back"
                className="p-1 -ml-1 rounded-full text-[#1f1f1f] dark:text-[#e3e3e3] hover:bg-black/5 dark:hover:bg-white/10 flex items-center justify-center transition-all active:scale-95 cursor-pointer shrink-0 border-none border-0 bg-transparent shadow-none outline-none"
              >
                <ChevronLeft className="w-6 h-6 stroke-[2.2]" />
              </button>

              {/* Round Icon Badge */}
              <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0 border-0">
                <HardDrive className="w-4 h-4 sm:w-5 sm:h-5" />
              </div>

              <div className="min-w-0">
                <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-zinc-100 tracking-tight truncate">
                  Data Backup & Sync
                </h2>
                <p className="text-xs text-slate-500 dark:text-zinc-400 truncate">
                  Manage backups, cloud sync, and custom activity data
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2.5 shrink-0">
              {/* Profile pill */}
              <div className={`hidden sm:flex items-center gap-2 px-3.5 py-1.5 ${APP_STYLES.card.compact} text-xs text-slate-700 dark:text-zinc-300 font-medium`}>
                {currentUser ? (
                  <>
                    <UserCheck className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                    <span className="truncate max-w-[180px] font-semibold">{currentUser.email || currentUser.uid}</span>
                  </>
                ) : (
                  <>
                    <UserX className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                    <span>Guest Mode (Local Storage)</span>
                  </>
                )}
              </div>

              {/* Desktop Close Button */}
              <button
                id="close-settings-modal-btn"
                type="button"
                onClick={onClose}
                title="Close (Esc)"
                aria-label="Close"
                className="hidden md:flex w-9 h-9 rounded-full bg-slate-100/80 hover:bg-slate-200/80 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-[#1f1f1f] dark:text-[#e3e3e3] items-center justify-center transition active:scale-95 cursor-pointer border-none outline-none"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

        {/* MAIN SCROLLABLE CONTENT BODY (M3 SURFACE CARDS) */}
        <div 
          className="flex-1 min-h-0 overflow-y-auto px-3.5 sm:px-8 py-5 max-w-5xl mx-auto w-full space-y-4 md:space-y-5 pb-32 sm:pb-32 md:pb-20 overscroll-y-contain [webkit-overflow-scrolling:touch]"
          data-scrollable="true"
        >

          {/* STATUS BANNER */}
          {syncStatus.message && (
            <motion.div 
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              className={`p-4 rounded-[20px] text-xs flex items-center gap-3 font-semibold border-0 shadow-xs ${
                syncStatus.type === 'success' ? 'bg-[#c4eed0] dark:bg-[#0f5223] text-[#072711] dark:text-[#c4eed0]' :
                syncStatus.type === 'loading' ? 'bg-[#d3e3fd] dark:bg-[#0842a0] text-[#041e49] dark:text-[#d3e3fd]' :
                'bg-[#f9dedc] dark:bg-[#8c1d18] text-[#410e0b] dark:text-[#f9dedc]'
              }`}
            >
              {syncStatus.type === 'success' && <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-700 dark:text-emerald-300 stroke-[2.5]" />}
              {syncStatus.type === 'loading' && <RefreshCw className="w-4 h-4 shrink-0 text-[#0b57d0] dark:text-[#a8c7fa] animate-spin" />}
              {syncStatus.type === 'error' && <AlertCircle className="w-4 h-4 shrink-0 text-rose-700 dark:text-rose-300 stroke-[2.5]" />}
              <span className="flex-1 leading-relaxed">{syncStatus.message}</span>
            </motion.div>
          )}

          {/* TOP SECTION: APPEARANCE & PROFILE OVERVIEW */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* SECTION 0: DISPLAY & APPEARANCE */}
            <div className="space-y-2 bg-transparent p-1 sm:p-2">
              <div className="flex items-center gap-2 pb-1.5 border-b border-slate-100 dark:border-zinc-800/80">
                <Sliders className="w-4 h-4 text-[#0b57d0] dark:text-[#a8c7fa]" />
                <h3 className="text-xs font-bold text-[#0b57d0] dark:text-[#a8c7fa] uppercase tracking-wider">
                  Display & Appearance
                </h3>
              </div>

              <div className="divide-y divide-slate-100 dark:divide-zinc-800/80 bg-transparent rounded-2xl">
                {/* Dark Theme Toggle with M3Switch */}
                <div 
                  className="flex items-center justify-between p-3 sm:p-3.5 rounded-2xl cursor-pointer hover:bg-slate-50/80 dark:hover:bg-zinc-900/50 transition-colors select-none"
                  onClick={() => onToggleTheme && onToggleTheme()}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onToggleTheme && onToggleTheme();
                    }
                  }}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-full bg-slate-100 dark:bg-zinc-800 text-[#1a1b1f] dark:text-[#e3e2e6] flex items-center justify-center shrink-0">
                      {isDarkMode ? <Moon className="w-5 h-5 text-[#a8c7fa] fill-[#a8c7fa]/20" /> : <Sun className="w-5 h-5 text-amber-500 fill-amber-500/20" />}
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs sm:text-sm font-semibold text-[#1a1b1f] dark:text-[#e3e2e6]">Dark Theme</div>
                      <div className="text-[11px] text-slate-500 dark:text-zinc-400">
                        {isDarkMode ? 'Dark surface tonal palette active' : 'Light surface tonal palette active'}
                      </div>
                    </div>
                  </div>

                  {onToggleTheme && (
                    <div 
                      onClick={(e) => {
                        e.stopPropagation();
                        onToggleTheme();
                      }}
                      className="shrink-0"
                    >
                      <M3Switch
                        checked={!!isDarkMode}
                        onChange={() => onToggleTheme()}
                        id="m3-settings-dark-mode-toggle"
                      />
                    </div>
                  )}
                </div>

                {/* UI Scale Presets */}
                {onScaleChange && (
                  <div className="flex items-center justify-between p-3 sm:p-3.5 rounded-2xl flex-wrap sm:flex-nowrap gap-3 hover:bg-slate-50/80 dark:hover:bg-zinc-900/50 transition-colors">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-full bg-slate-100 dark:bg-zinc-800 text-[#1a1b1f] dark:text-[#e3e2e6] flex items-center justify-center shrink-0">
                        <Monitor className="w-5 h-5 text-[#0b57d0] dark:text-[#a8c7fa]" />
                      </div>
                      <div className="min-w-0">
                        <div className="text-xs sm:text-sm font-semibold text-[#1a1b1f] dark:text-[#e3e2e6]">Interface Density</div>
                        <div className="text-[11px] text-slate-500 dark:text-zinc-400">
                          Select zoom scale for readability
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-zinc-800 p-1 rounded-full shrink-0">
                      {(['compact', 'standard', 'comfortable'] as const).map((scaleOption) => {
                        const isSelected = (uiScale || 'standard') === scaleOption;
                        return (
                          <button
                            key={scaleOption}
                            type="button"
                            onClick={() => onScaleChange(scaleOption)}
                            aria-pressed={isSelected}
                            className={`px-3 py-1 rounded-full text-xs font-semibold capitalize transition-all cursor-pointer border-0 outline-none select-none ${
                              isSelected
                                ? 'bg-[#0b57d0] dark:bg-[#a8c7fa] text-white dark:text-[#062e6f] shadow-xs'
                                : 'bg-transparent text-[#44474f] dark:text-[#c4c6d0] hover:text-[#1a1b1f] dark:hover:text-white'
                            }`}
                          >
                            {scaleOption}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* SECTION 1: ACCOUNT & STORAGE STATS OVERVIEW */}
            <div className="space-y-2 bg-transparent p-1 sm:p-2">
              <div className="flex items-center gap-2 pb-1.5 border-b border-slate-100 dark:border-zinc-800/80">
                <HardDrive className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                <h3 className="text-xs font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">
                  Storage & Cloud Account
                </h3>
              </div>

              <div className="space-y-2.5 pt-1">
                <div className="flex items-center gap-3 p-2.5 sm:p-3 rounded-2xl hover:bg-slate-50/80 dark:hover:bg-zinc-900/50 transition-colors">
                  <div className="w-10 h-10 rounded-full bg-emerald-50 dark:bg-emerald-950/50 flex items-center justify-center text-emerald-600 dark:text-emerald-400 shrink-0 border-0">
                    {currentUser ? <UserCheck className="w-5 h-5 text-emerald-600 dark:text-emerald-400 stroke-[2.2]" /> : <UserX className="w-5 h-5 text-amber-500 stroke-[2.2]" />}
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-xs sm:text-sm font-semibold text-[#1a1b1f] dark:text-[#e3e2e6] truncate">
                      {currentUser ? 'Google Cloud Profile Linked' : 'Guest Account Mode'}
                    </h3>
                    <p className="text-[11px] text-slate-500 dark:text-zinc-400 truncate">
                      {currentUser ? currentUser.email || currentUser.uid : 'Data is stored locally on this device'}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 text-xs">
                  <div className="p-2.5 rounded-2xl bg-slate-50/80 dark:bg-zinc-900/50 flex flex-col">
                    <span className="text-[10px] text-slate-500 dark:text-zinc-400">Tests</span>
                    <span className="font-bold text-[#1a1b1f] dark:text-[#e3e2e6] text-sm mt-0.5">{customStats.authoredTestsCount}</span>
                  </div>
                  <div className="p-2.5 rounded-2xl bg-slate-50/80 dark:bg-zinc-900/50 flex flex-col">
                    <span className="text-[10px] text-slate-500 dark:text-zinc-400">Attempts</span>
                    <span className="font-bold text-[#1a1b1f] dark:text-[#e3e2e6] text-sm mt-0.5">{customStats.totalAttemptsCount}</span>
                  </div>
                  <div className="p-2.5 rounded-2xl bg-slate-50/80 dark:bg-zinc-900/50 flex flex-col">
                    <span className="text-[10px] text-slate-500 dark:text-zinc-400">AI Chats</span>
                    <span className="font-bold text-[#1a1b1f] dark:text-[#e3e2e6] text-sm mt-0.5">{customStats.chatHistoriesCount}</span>
                  </div>
                  <div className="p-2.5 rounded-2xl bg-slate-50/80 dark:bg-zinc-900/50 flex flex-col">
                    <span className="text-[10px] text-slate-500 dark:text-zinc-400">HTML Notes</span>
                    <span className="font-bold text-[#1a1b1f] dark:text-[#e3e2e6] text-sm mt-0.5">{customStats.htmlProjectsCount || 0}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* SECTION 2: LOCAL FILE BACKUP (.JSON) */}
          <div className="space-y-2 bg-transparent p-1 sm:p-2">
            <div className="flex items-center gap-2 pb-1.5 border-b border-slate-100 dark:border-zinc-800/80">
              <FileJson className="w-4 h-4 text-[#0b57d0] dark:text-[#a8c7fa]" />
              <h3 className="text-xs font-bold text-[#0b57d0] dark:text-[#a8c7fa] uppercase tracking-wider">
                Local File Backup (.json)
              </h3>
            </div>
            <p className="text-xs text-slate-500 dark:text-zinc-400">
              Export all local tests, exam attempts, Gemini AI chats, study notes, HTML Notes Studio projects & documents, and app preferences into a portable JSON backup file, or restore a previously saved archive.
            </p>

            <div className="divide-y divide-slate-100 dark:divide-zinc-800/80 bg-transparent rounded-2xl pt-1">
              {/* Export JSON */}
              <div className="flex items-center justify-between gap-3 p-3 sm:p-3.5 rounded-2xl hover:bg-slate-50/80 dark:hover:bg-zinc-900/50 transition-colors">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-full bg-slate-100 dark:bg-zinc-800 text-[#1a1b1f] dark:text-[#e3e2e6] flex items-center justify-center shrink-0 border-0">
                    <Download className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs sm:text-sm font-semibold text-[#1a1b1f] dark:text-[#e3e2e6] truncate">Export Complete Backup</div>
                    <div className="text-[11px] text-slate-500 dark:text-zinc-400 truncate">Save .json file directly to device</div>
                  </div>
                </div>

                <M3Button
                  id="export-json-backup-btn"
                  onClick={handleExportJsonArchive}
                  variant="filled"
                  className="h-9 px-4 text-xs shrink-0 rounded-full"
                  icon={<Download className="w-3.5 h-3.5" />}
                >
                  Export
                </M3Button>
              </div>

              {/* Import JSON with Drag & Drop */}
              <div 
                onDragOver={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setIsDraggingBackup(true);
                }}
                onDragLeave={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setIsDraggingBackup(false);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setIsDraggingBackup(false);
                  const file = e.dataTransfer.files?.[0];
                  if (file) {
                    processImportBackupFile(file);
                  }
                }}
                className={`flex items-center justify-between gap-3 p-3 sm:p-3.5 rounded-2xl transition-all hover:bg-slate-50/80 dark:hover:bg-zinc-900/50 ${
                  isDraggingBackup 
                    ? 'ring-2 ring-[#0b57d0] dark:ring-[#a8c7fa] bg-[#0b57d0]/10 dark:bg-[#a8c7fa]/15' 
                    : ''
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 border-0 transition-colors ${
                    isDraggingBackup
                      ? 'bg-[#0b57d0] text-white dark:bg-[#a8c7fa] dark:text-[#062e6f]'
                      : 'bg-slate-100 dark:bg-zinc-800 text-[#1a1b1f] dark:text-[#e3e2e6]'
                  }`}>
                    <Upload className={`w-5 h-5 ${isDraggingBackup ? 'animate-bounce' : ''}`} />
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs sm:text-sm font-semibold text-[#1a1b1f] dark:text-[#e3e2e6] truncate">
                      {isDraggingBackup ? 'Drop .json backup file here' : 'Import Backup Archive'}
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-zinc-400 truncate">
                      {isDraggingBackup ? 'Release to restore immediately' : 'Restore from .json (or drag & drop)'}
                    </div>
                  </div>
                </div>

                <M3Button
                  id="import-json-backup-btn"
                  onClick={() => fileInputRef.current?.click()}
                  variant="tonal"
                  className="h-9 px-4 text-xs shrink-0 rounded-full"
                  icon={<Upload className="w-3.5 h-3.5" />}
                >
                  Import
                </M3Button>
                <input 
                  ref={fileInputRef}
                  type="file"
                  accept=".json,application/json,text/json,text/plain,*/*"
                  className="hidden"
                  onChange={handleImportFileChange}
                />
              </div>
            </div>
          </div>

          {/* SECTION 3: GOOGLE CLOUD DATABASE SYNC */}
          <div className="space-y-2 bg-transparent p-1 sm:p-2">
            <div className="flex items-center gap-2 pb-1.5 border-b border-slate-100 dark:border-zinc-800/80">
              <Cloud className="w-4 h-4 text-[#0b57d0] dark:text-[#a8c7fa]" />
              <h3 className="text-xs font-bold text-[#0b57d0] dark:text-[#a8c7fa] uppercase tracking-wider">
                Google Cloud Database Sync
              </h3>
            </div>
            <p className="text-xs text-slate-500 dark:text-zinc-400">
              Synchronize test papers, exam results, and HTML Notes Studio projects with your Google account in Firestore cloud storage.
            </p>

            <div className="divide-y divide-slate-100 dark:divide-zinc-800/80 bg-transparent rounded-2xl pt-1">
              {/* Backup to Cloud */}
              <div className="flex items-center justify-between gap-3 p-3 sm:p-3.5 rounded-2xl hover:bg-slate-50/80 dark:hover:bg-zinc-900/50 transition-colors">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-full bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0 border-0">
                    <Cloud className="w-5 h-5 stroke-[2.2]" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs sm:text-sm font-semibold text-[#1a1b1f] dark:text-[#e3e2e6] truncate">Backup to Cloud</div>
                    <div className="text-[11px] text-slate-500 dark:text-zinc-400 truncate">Upload tests, history & HTML notes</div>
                  </div>
                </div>

                <M3Button
                  id="cloud-backup-all-btn"
                  onClick={handleCloudBackupAll}
                  disabled={!currentUser}
                  variant="filled"
                  className="h-9 px-4 text-xs shrink-0 rounded-full"
                  icon={<Cloud className="w-3.5 h-3.5" />}
                >
                  Upload
                </M3Button>
              </div>

              {/* Download from Cloud */}
              <div className="flex items-center justify-between gap-3 p-3 sm:p-3.5 rounded-2xl hover:bg-slate-50/80 dark:hover:bg-zinc-900/50 transition-colors">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-full bg-blue-50 dark:bg-blue-950/50 text-[#0b57d0] dark:text-[#a8c7fa] flex items-center justify-center shrink-0 border-0">
                    <CloudDownload className="w-5 h-5 stroke-[2.2]" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs sm:text-sm font-semibold text-[#1a1b1f] dark:text-[#e3e2e6] truncate">Download Cloud Data</div>
                    <div className="text-[11px] text-slate-500 dark:text-zinc-400 truncate">Restore remote account data</div>
                  </div>
                </div>

                <M3Button
                  id="cloud-download-all-btn"
                  onClick={handleCloudDownloadAll}
                  disabled={!currentUser}
                  variant="tonal"
                  className="h-9 px-4 text-xs shrink-0 rounded-full"
                  icon={<CloudDownload className="w-3.5 h-3.5" />}
                >
                  Restore
                </M3Button>
              </div>
            </div>
          </div>

          {/* SECTION 4: DELETE CUSTOM DATA (SELECTIVE ACTIVITY WIPE) */}
          <div className="space-y-2 bg-transparent p-1 sm:p-2">
            <div className="flex items-center gap-2 pb-1.5 border-b border-slate-100 dark:border-zinc-800/80">
              <Layers className="w-4 h-4 text-rose-600 dark:text-rose-400" />
              <h3 className="text-xs font-bold text-rose-600 dark:text-rose-400 uppercase tracking-wider">
                Delete Custom Data
              </h3>
            </div>
            <p className="text-xs text-slate-500 dark:text-zinc-400">
              Wipe specific activity records and logs (tests, exam attempts, or AI chats) without deleting your account.
            </p>

            <div className="divide-y divide-slate-100 dark:divide-zinc-800/80 bg-transparent rounded-2xl pt-1">
              {/* 1. Authored Tests */}
              <div className="flex items-center justify-between gap-3 flex-wrap sm:flex-nowrap p-3 sm:p-3.5 rounded-2xl hover:bg-slate-50/80 dark:hover:bg-zinc-900/50 transition-colors">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-full bg-slate-100 dark:bg-zinc-800 text-[#1a1b1f] dark:text-[#e3e2e6] flex items-center justify-center shrink-0 border-0">
                    <FileText className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs sm:text-sm font-semibold text-[#1a1b1f] dark:text-[#e3e2e6] truncate">
                      Authored Test Papers
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-zinc-400">
                      {customStats.authoredTestsCount} user-created tests
                    </div>
                  </div>
                </div>

                <M3Button
                  id="delete-authored-tests-btn"
                  disabled={customStats.authoredTestsCount === 0}
                  onClick={() => setConfirmDeleteTarget({
                    type: 'tests',
                    title: 'Delete All Authored Test Papers',
                    description: 'This will permanently remove all test papers authored by you from local storage and cloud databases.',
                    count: customStats.authoredTestsCount
                  })}
                  variant="danger"
                  className="h-9 px-4 text-xs shrink-0 rounded-full"
                  icon={<Trash2 className="w-3.5 h-3.5" />}
                >
                  Delete ({customStats.authoredTestsCount})
                </M3Button>
              </div>

              {/* 2. Exam Attempts */}
              <div className="space-y-3 p-3 sm:p-3.5 rounded-2xl hover:bg-slate-50/80 dark:hover:bg-zinc-900/50 transition-colors">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-full bg-slate-100 dark:bg-zinc-800 text-[#1a1b1f] dark:text-[#e3e2e6] flex items-center justify-center shrink-0 border-0">
                      <BarChart2 className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs sm:text-sm font-semibold text-[#1a1b1f] dark:text-[#e3e2e6] truncate">
                        Exam Attempts & Submissions
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-zinc-400">
                        {customStats.totalAttemptsCount} total attempts ({customStats.onlineAttemptsCount} Online, {customStats.omrAttemptsCount} OMR)
                      </div>
                    </div>
                  </div>

                  <M3Button
                    id="delete-all-attempts-btn"
                    disabled={customStats.totalAttemptsCount === 0}
                    onClick={() => setConfirmDeleteTarget({
                      type: 'attempts_all',
                      title: 'Delete All Exam Attempts',
                      description: 'This will permanently remove all exam submissions and scores (both OMR and Online) from your history.',
                      count: customStats.totalAttemptsCount
                    })}
                    variant="danger"
                    className="h-9 px-4 text-xs shrink-0 rounded-full"
                    icon={<Trash2 className="w-3.5 h-3.5" />}
                  >
                    Delete All ({customStats.totalAttemptsCount})
                  </M3Button>
                </div>

                {/* Sub-options for Online vs OMR attempts */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2 border-t border-slate-100 dark:border-zinc-800/80">
                  <button
                    id="delete-online-attempts-btn"
                    disabled={customStats.onlineAttemptsCount === 0}
                    onClick={() => setConfirmDeleteTarget({
                      type: 'attempts_online',
                      title: 'Delete Online Attempts Only',
                      description: 'This will remove only digital online exam submissions while preserving your OMR optical scan history.',
                      count: customStats.onlineAttemptsCount
                    })}
                    className={`px-3.5 py-2 rounded-full text-[11px] font-bold transition-all flex items-center justify-between gap-2 active:scale-95 border-0 ${
                      customStats.onlineAttemptsCount > 0
                        ? 'bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 hover:bg-rose-100 dark:hover:bg-rose-900/50 cursor-pointer'
                        : 'bg-slate-100/50 dark:bg-zinc-800/50 text-slate-400 dark:text-zinc-600 cursor-not-allowed opacity-50'
                    }`}
                  >
                    <span>Online Attempts Only</span>
                    <span className="font-mono text-[10px] bg-rose-200 dark:bg-rose-900 text-rose-800 dark:text-rose-200 px-2 py-0.5 rounded-full font-bold">{customStats.onlineAttemptsCount}</span>
                  </button>

                  <button
                    id="delete-omr-attempts-btn"
                    disabled={customStats.omrAttemptsCount === 0}
                    onClick={() => setConfirmDeleteTarget({
                      type: 'attempts_omr',
                      title: 'Delete OMR Attempts Only',
                      description: 'This will remove only optical OMR sheet scan attempts while preserving your online digital test history.',
                      count: customStats.omrAttemptsCount
                    })}
                    className={`px-3.5 py-2 rounded-full text-[11px] font-bold transition-all flex items-center justify-between gap-2 active:scale-95 border-0 ${
                      customStats.omrAttemptsCount > 0
                        ? 'bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 hover:bg-rose-100 dark:hover:bg-rose-900/50 cursor-pointer'
                        : 'bg-slate-100/50 dark:bg-zinc-800/50 text-slate-400 dark:text-zinc-600 cursor-not-allowed opacity-50'
                    }`}
                  >
                    <span>OMR Attempts Only</span>
                    <span className="font-mono text-[10px] bg-rose-200 dark:bg-rose-900 text-rose-800 dark:text-rose-200 px-2 py-0.5 rounded-full font-bold">{customStats.omrAttemptsCount}</span>
                  </button>
                </div>
              </div>

              {/* 3. Gemini AI Chat Histories */}
              <div className="flex items-center justify-between gap-3 flex-wrap sm:flex-nowrap p-3 sm:p-3.5 rounded-2xl hover:bg-slate-50/80 dark:hover:bg-zinc-900/50 transition-colors">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-full bg-slate-100 dark:bg-zinc-800 text-[#1a1b1f] dark:text-[#e3e2e6] flex items-center justify-center shrink-0 border-0">
                    <Bot className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs sm:text-sm font-semibold text-[#1a1b1f] dark:text-[#e3e2e6] truncate">
                      Gemini Chat Histories
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-zinc-400">
                      {customStats.chatHistoriesCount} AI conversation threads & formulas
                    </div>
                  </div>
                </div>

                <M3Button
                  id="delete-chat-histories-btn"
                  disabled={customStats.chatHistoriesCount === 0}
                  onClick={() => setConfirmDeleteTarget({
                    type: 'chats',
                    title: 'Clear Gemini AI Chat Histories',
                    description: 'This will wipe all saved AI tutor chat threads, mathematical solver histories, and canvas formulas.',
                    count: customStats.chatHistoriesCount
                  })}
                  variant="danger"
                  className="h-9 px-4 text-xs shrink-0 rounded-full"
                  icon={<Sparkles className="w-3.5 h-3.5" />}
                >
                  Clear ({customStats.chatHistoriesCount})
                </M3Button>
              </div>

              {/* 4. Study Notes & Formulas */}
              <div className="flex items-center justify-between gap-3 flex-wrap sm:flex-nowrap p-3 sm:p-3.5 rounded-2xl hover:bg-slate-50/80 dark:hover:bg-zinc-900/50 transition-colors">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-full bg-slate-100 dark:bg-zinc-800 text-[#1a1b1f] dark:text-[#e3e2e6] flex items-center justify-center shrink-0 border-0">
                    <FileText className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs sm:text-sm font-semibold text-[#1a1b1f] dark:text-[#e3e2e6] truncate">
                      Study Notes & Formulas
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-zinc-400">
                      {customStats.notesCount || 0} user study notes & LaTeX solutions
                    </div>
                  </div>
                </div>

                <M3Button
                  id="delete-study-notes-btn"
                  disabled={!customStats.notesCount || customStats.notesCount === 0}
                  onClick={() => setConfirmDeleteTarget({
                    type: 'notes',
                    title: 'Delete All Study Notes & Formulas',
                    description: 'This will permanently remove all authored study notes, formulas, and solution tricks from local storage and cloud databases.',
                    count: customStats.notesCount || 0
                  })}
                  variant="danger"
                  className="h-9 px-4 text-xs shrink-0 rounded-full"
                  icon={<Trash2 className="w-3.5 h-3.5" />}
                >
                  Delete ({customStats.notesCount || 0})
                </M3Button>
              </div>

              {/* 5. HTML Notes Studio (Projects & Slide Decks) */}
              <div className="flex items-center justify-between gap-3 flex-wrap sm:flex-nowrap p-3 sm:p-3.5 rounded-2xl hover:bg-slate-50/80 dark:hover:bg-zinc-900/50 transition-colors">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-full bg-slate-100 dark:bg-zinc-800 text-[#1a1b1f] dark:text-[#e3e2e6] flex items-center justify-center shrink-0 border-0">
                    <FileText className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs sm:text-sm font-semibold text-[#1a1b1f] dark:text-[#e3e2e6] truncate">
                      HTML Notes & Slide Decks
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-zinc-400">
                      {customStats.htmlProjectsCount || 0} projects ({customStats.htmlNotesCount || 0} note files)
                    </div>
                  </div>
                </div>

                <M3Button
                  id="delete-html-notes-btn"
                  disabled={!customStats.htmlProjectsCount || customStats.htmlProjectsCount === 0}
                  onClick={() => setConfirmDeleteTarget({
                    type: 'html_notes',
                    title: 'Delete All HTML Notes & Slide Decks',
                    description: 'This will permanently remove all HTML notes studio projects, slides, and math documents from local storage and Firebase Cloud.',
                    count: customStats.htmlProjectsCount || 0
                  })}
                  variant="danger"
                  className="h-9 px-4 text-xs shrink-0 rounded-full"
                  icon={<Trash2 className="w-3.5 h-3.5" />}
                >
                  Delete ({customStats.htmlProjectsCount || 0})
                </M3Button>
              </div>

            </div>
          </div>

          {/* SECTION 5: ACCOUNT & DANGER ZONE */}
          {currentUser && (
            <div className="p-4 sm:p-5 bg-rose-500/10 dark:bg-rose-950/20 rounded-2xl border border-rose-500/20 space-y-3">
              <div className="flex items-center gap-2 text-rose-600 dark:text-rose-400 font-bold text-xs uppercase tracking-wider">
                <ShieldAlert className="w-4 h-4" />
                <span>Account Deletion Safeguard (Danger Zone)</span>
              </div>

              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div>
                  <div className="text-xs sm:text-sm font-semibold text-rose-900 dark:text-rose-200">
                    Delete Entire Account & Permanent Cloud Wipe
                  </div>
                  <div className="text-[11px] text-rose-700/80 dark:text-rose-300/80 mt-0.5">
                    Triggers 3-step permanent deletion of account credentials, cloud Firestore records, and local caches.
                  </div>
                </div>

                <M3Button
                  id="open-delete-account-modal-btn"
                  onClick={() => setIsDeleteDialogOpen(true)}
                  variant="danger"
                  className="h-9 px-4 text-xs shrink-0 rounded-full"
                  icon={<Trash2 className="w-3.5 h-3.5" />}
                >
                  Delete Account
                </M3Button>
              </div>
            </div>
          )}

        </div>

        {/* CUSTOM DATA DELETE CONFIRMATION DIALOG (M3 DIALOG 28PX) */}
        <AnimatePresence>
          {confirmDeleteTarget && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center z-60 p-4 select-none"
              onClick={() => !isDeletingCustomData && setConfirmDeleteTarget(null)}
            >
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="w-full max-w-md bg-[#f7f2fa] dark:bg-[#202125] text-[#1a1b1f] dark:text-[#e3e2e6] rounded-[28px] p-6 sm:p-7 space-y-4 shadow-[0_8px_28px_rgba(0,0,0,0.28)]"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center gap-3 text-[#ba1a1a] dark:text-[#ffb4ab]">
                  <div className="w-10 h-10 rounded-full bg-[#ffdad6] dark:bg-[#93000a] text-[#410002] dark:text-[#ffdad6] flex items-center justify-center shrink-0 border-0">
                    <Trash2 className="w-5 h-5 stroke-[2.2]" />
                  </div>
                  <h3 className="text-base font-semibold tracking-tight text-[#1a1b1f] dark:text-[#e3e2e6]">
                    {confirmDeleteTarget.title}
                  </h3>
                </div>

                <p className="text-xs text-[#44474f] dark:text-[#c4c6d0] leading-relaxed">
                  {confirmDeleteTarget.description}
                </p>

                <div className="p-3.5 bg-[#ffdad6] dark:bg-[#93000a]/40 rounded-[20px] text-xs font-bold text-[#410002] dark:text-[#ffdad6] border-0">
                  Target Items: {confirmDeleteTarget.count} records
                </div>

                <div className="flex items-center justify-end gap-2.5 pt-2">
                  <M3Button
                    disabled={isDeletingCustomData}
                    onClick={() => setConfirmDeleteTarget(null)}
                    variant="tonal"
                    className="h-9 px-4 text-xs"
                  >
                    Cancel
                  </M3Button>

                  <M3Button
                    disabled={isDeletingCustomData}
                    onClick={handleExecuteDeleteCustomData}
                    variant="danger"
                    className="h-9 px-4 text-xs"
                    icon={isDeletingCustomData ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                  >
                    {isDeletingCustomData ? 'Deleting...' : 'Confirm Delete'}
                  </M3Button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* 3-STEP DELETE ACCOUNT MODAL */}
        <DeleteAccountModal
          isOpen={isDeleteDialogOpen}
          onClose={() => setIsDeleteDialogOpen(false)}
          currentUser={currentUser || null}
          onAccountDeleted={() => {
            setIsDeleteDialogOpen(false);
            refreshStats();
            onDataChanged?.();
            onClose();
          }}
        />
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
