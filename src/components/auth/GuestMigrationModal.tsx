import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Sparkles, ArrowRight, X, BookOpen, CheckCircle, FileText, Award } from 'lucide-react';
import { executeGuestToAccountMigration, type GuestDataSummary } from '../../lib/storage';

interface GuestMigrationModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: {
    uid: string;
    email?: string | null;
    displayName?: string | null;
  } | null;
  summary: GuestDataSummary | null;
  onMigrationComplete?: (result: { migratedTests: number; migratedAttempts: number; migratedNotes: number }) => void;
}

export const GuestMigrationModal: React.FC<GuestMigrationModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  summary,
  onMigrationComplete,
}) => {
  const [isMigrating, setIsMigrating] = useState(false);
  const [migratedSuccess, setMigratedSuccess] = useState(false);

  if (!isOpen || !summary || !summary.hasData || !currentUser?.uid) {
    return null;
  }

  const handleMigrate = async () => {
    if (!currentUser?.uid || isMigrating) return;
    setIsMigrating(true);
    try {
      const result = await executeGuestToAccountMigration(
        currentUser.uid,
        currentUser.email,
        currentUser.displayName
      );
      setMigratedSuccess(true);
      if (onMigrationComplete) {
        onMigrationComplete(result);
      }
      setTimeout(() => {
        onClose();
        setMigratedSuccess(false);
      }, 1600);
    } catch (err) {
      console.warn('Guest migration error:', err);
    } finally {
      setIsMigrating(false);
    }
  };

  const handleDismiss = () => {
    try {
      if (typeof localStorage !== 'undefined' && currentUser?.uid) {
        localStorage.setItem(`mockmc_guest_migration_dismissed_${currentUser.uid}`, 'true');
      }
    } catch {}
    onClose();
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 15 }}
          transition={{ duration: 0.2 }}
          className="relative w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl overflow-hidden p-6 text-slate-900 dark:text-slate-100"
        >
          {/* Close button */}
          <button
            onClick={handleDismiss}
            disabled={isMigrating}
            className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 rounded-lg transition-colors"
            title="Dismiss"
          >
            <X className="w-5 h-5" />
          </button>

          {/* Header Icon */}
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-indigo-500 to-purple-500 flex items-center justify-center text-white shadow-lg shadow-indigo-500/25">
              <Sparkles className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-lg font-bold">Transfer Guest Progress</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Found unlinked activities from your guest session
              </p>
            </div>
          </div>

          <p className="text-sm text-slate-600 dark:text-slate-300 mb-4 leading-relaxed">
            Welcome, <strong className="text-indigo-600 dark:text-indigo-400">{currentUser.displayName || currentUser.email || 'Student'}</strong>! Would you like to merge your guest test attempts and study notes into your personal account?
          </p>

          {/* Activity Badges */}
          <div className="grid grid-cols-3 gap-2.5 mb-6">
            <div className="flex flex-col items-center justify-center p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700/60">
              <Award className="w-5 h-5 text-indigo-500 mb-1" />
              <span className="text-lg font-bold">{summary.attempts.length}</span>
              <span className="text-[11px] text-slate-500 dark:text-slate-400">Attempts</span>
            </div>
            <div className="flex flex-col items-center justify-center p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700/60">
              <BookOpen className="w-5 h-5 text-purple-500 mb-1" />
              <span className="text-lg font-bold">{summary.customTests.length}</span>
              <span className="text-[11px] text-slate-500 dark:text-slate-400">Custom Tests</span>
            </div>
            <div className="flex flex-col items-center justify-center p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700/60">
              <FileText className="w-5 h-5 text-emerald-500 mb-1" />
              <span className="text-lg font-bold">{summary.notes.length}</span>
              <span className="text-[11px] text-slate-500 dark:text-slate-400">Notes</span>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col gap-2.5">
            <button
              onClick={handleMigrate}
              disabled={isMigrating || migratedSuccess}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-medium rounded-xl shadow-md shadow-indigo-500/20 active:scale-[0.98] transition-all disabled:opacity-60 cursor-pointer"
            >
              {migratedSuccess ? (
                <>
                  <CheckCircle className="w-5 h-5 text-emerald-300" />
                  <span>Successfully Merged!</span>
                </>
              ) : isMigrating ? (
                <>
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Merging into account...</span>
                </>
              ) : (
                <>
                  <span>Merge into My Account</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>

            <button
              onClick={handleDismiss}
              disabled={isMigrating}
              className="w-full py-2.5 text-xs text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 font-medium transition-colors cursor-pointer"
            >
              Keep in Guest Mode (Don't transfer)
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
