import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Smartphone, Download, Share, PlusSquare, MoreVertical, CheckCircle2, Monitor, ExternalLink, Sigma } from 'lucide-react';
import { BeforeInstallPromptEvent } from '../hooks/usePWAInstall';
import { useBackHandler } from '../hooks/useBackNavigation';
import { useScrollLock } from '../hooks/useScrollLock';
import { 
  studioBackdropVariants, 
  studioModalVariants, 
  gpuAcceleratedStyle, 
  gpuTransformStyle 
} from '../lib/animationConfig';
import { APP_STYLES } from './ui/AppStyles';
import { M3Button, M3IconButton } from './ui/Material3';

interface InstallAppModalProps {
  isOpen: boolean;
  onClose: () => void;
  deferredPrompt: BeforeInstallPromptEvent | null;
  isIOS: boolean;
  isIframe?: boolean;
  onTriggerInstall: () => Promise<string>;
}

export const InstallAppModal: React.FC<InstallAppModalProps> = ({
  isOpen,
  onClose,
  deferredPrompt,
  isIOS,
  isIframe,
  onTriggerInstall,
}) => {
  useScrollLock(isOpen);
  useBackHandler({
    isOpen,
    onBack: onClose,
    priority: 50,
    id: 'install_app_modal_back',
  });

  const handleOpenInNewTab = () => {
    window.open(window.location.href, '_blank', 'noopener,noreferrer');
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div 
          variants={studioBackdropVariants}
          initial="initial"
          animate="animate"
          exit="exit"
          style={gpuAcceleratedStyle}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs select-none cursor-pointer"
          onClick={onClose}
        >
          <motion.div
            variants={studioModalVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            style={gpuTransformStyle}
            className="relative w-full max-w-md p-6 sm:p-7 overflow-hidden cursor-default bg-[#f7f2fa] dark:bg-[#202125] text-[#1a1b1f] dark:text-[#e3e2e6] rounded-[28px] shadow-[0_8px_28px_rgba(0,0,0,0.28)] space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
          {/* Close button */}
          <button
            onClick={onClose}
            className="absolute top-4 right-4 w-9 h-9 rounded-full flex items-center justify-center text-[#44474f] dark:text-[#c4c6d0] hover:bg-[#1a1b1f]/8 dark:hover:bg-[#e3e2e6]/8 transition-colors cursor-pointer border-0"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>

          {/* Header */}
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-full flex items-center justify-center shrink-0 overflow-hidden">
              <img 
                src="./assets/preplens-icon.png" 
                alt="PrepLens" 
                className="w-full h-full object-contain"
              />
            </div>
            <div>
              <h2 className="text-lg font-black text-[#1a1b1f] dark:text-[#e3e2e6] leading-snug">
                Install PrepLens App
              </h2>
              <div className="w-24 h-[2px] my-0.5 rounded-full bg-gradient-to-r from-teal-500 via-sky-500 to-amber-400 opacity-90" />
              <p className="text-xs text-[#44474f] dark:text-[#c4c6d0]">
                Your Vision. Your Path. Your Success.
              </p>
            </div>
          </div>

          {/* Home Screen App Icon Visual Preview */}
          <div className="p-3.5 rounded-[22px] bg-white dark:bg-[#1a1b1f] border border-slate-200/80 dark:border-zinc-800 shadow-xs flex items-center gap-3.5">
            <div className="relative w-13 h-13 rounded-[16px] bg-[#f0f4f8] dark:bg-[#282a30] p-1.5 flex items-center justify-center shrink-0 border border-slate-200/60 dark:border-zinc-700">
              <img 
                src="./assets/preplens-icon.png" 
                alt="PrepLens Home Screen Icon" 
                className="w-full h-full object-contain" 
              />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-bold text-sm text-[#1a1b1f] dark:text-[#e3e2e6] tracking-tight">
                  PrepLens
                </span>
                <span className="text-[10px] px-2 py-0.5 font-bold rounded-full bg-teal-500/15 text-teal-700 dark:text-teal-300">
                  Home Screen Icon
                </span>
              </div>
              <p className="text-[11px] text-[#5e5e5e] dark:text-[#9aa0a6] mt-0.5 leading-snug">
                One-tap instant launch directly from your home screen with offline mock test access.
              </p>
            </div>
          </div>

          {/* If running inside iframe, show warning & open in new tab button */}
          {isIframe && (
            <div className="p-4 rounded-[20px] bg-[#ffe088]/40 dark:bg-[#5b4300]/40 text-[#241a00] dark:text-[#ffe088] space-y-3">
              <div className="flex items-start gap-2.5">
                <ExternalLink className="w-4 h-4 text-amber-700 dark:text-amber-300 shrink-0 mt-0.5" />
                <p className="text-xs leading-relaxed font-medium">
                  Browser security blocks PWA installs inside embedded preview frames. Please open the app in a new browser tab to trigger installation.
                </p>
              </div>
              <M3Button
                onClick={handleOpenInNewTab}
                variant="filled"
                className="w-full h-9 text-xs"
                icon={<ExternalLink className="w-3.5 h-3.5" />}
              >
                Open in New Tab to Install
              </M3Button>
            </div>
          )}

          {/* Prompt Trigger Button if ready */}
          {deferredPrompt ? (
            <div className="p-4 rounded-[20px] bg-[#c4eed0] dark:bg-[#0f5223] text-[#072711] dark:text-[#c4eed0] text-center space-y-3">
              <p className="text-xs font-medium">
                Your browser supports direct 1-click installation!
              </p>
              <M3Button
                onClick={onTriggerInstall}
                variant="filled"
                className="w-full h-10 text-xs font-bold"
                icon={<Download className="w-4 h-4" />}
              >
                Install PrepLens Web App
              </M3Button>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="p-3.5 rounded-[20px] bg-[#f3edf7] dark:bg-[#1a1b1f] text-xs text-[#44474f] dark:text-[#c4c6d0] flex items-start gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-[#0b57d0] dark:text-[#a8c7fa] shrink-0 mt-0.5" />
                <span>
                  Install PrepLens directly from your browser options to run as a full-screen, native application with offline test access.
                </span>
              </div>

              {/* iOS Instructions */}
              {isIOS ? (
                <div className="p-4 rounded-[20px] bg-[#f3edf7] dark:bg-[#1a1b1f] space-y-2.5">
                  <h3 className="text-xs font-bold text-[#1a1b1f] dark:text-[#e3e2e6] flex items-center gap-1.5">
                    <Share className="w-4 h-4 text-[#0b57d0] dark:text-[#a8c7fa]" />
                    <span>iOS Safari Installation Steps:</span>
                  </h3>
                  <ol className="text-xs text-[#44474f] dark:text-[#c4c6d0] space-y-1.5 list-decimal list-inside pl-1">
                    <li>
                      Tap the <strong className="text-[#1a1b1f] dark:text-[#e3e2e6]">Share button</strong> at the bottom of Safari.
                    </li>
                    <li>
                      Scroll down and select <strong className="text-[#1a1b1f] dark:text-[#e3e2e6]">Add to Home Screen</strong>.
                    </li>
                    <li className="flex items-center gap-1.5 flex-wrap">
                      <span>Tap <strong className="text-[#1a1b1f] dark:text-[#e3e2e6]">Add</strong>. Look for the</span>
                      <img src="./assets/preplens-icon.png" alt="" className="w-4 h-4 object-contain inline-block" />
                      <strong className="text-[#1a1b1f] dark:text-[#e3e2e6]">PrepLens</strong>
                      <span>icon on your home screen.</span>
                    </li>
                  </ol>
                </div>
              ) : (
                /* Chrome / Android / Desktop Instructions */
                <div className="p-4 rounded-[20px] bg-[#f3edf7] dark:bg-[#1a1b1f] space-y-2.5">
                  <h3 className="text-xs font-bold text-[#1a1b1f] dark:text-[#e3e2e6] flex items-center gap-1.5">
                    <Monitor className="w-4 h-4 text-[#0b57d0] dark:text-[#a8c7fa]" />
                    <span>Chrome / Android / Desktop Installation Steps:</span>
                  </h3>
                  <ol className="text-xs text-[#44474f] dark:text-[#c4c6d0] space-y-1.5 list-decimal list-inside pl-1">
                    <li>
                      Click or tap the Chrome <strong className="text-[#1a1b1f] dark:text-[#e3e2e6]">Menu</strong> icon (top right).
                    </li>
                    <li>
                      Select <strong className="text-[#1a1b1f] dark:text-[#e3e2e6]">Install PrepLens</strong> or <strong className="text-[#1a1b1f] dark:text-[#e3e2e6]">Add to Home screen</strong>.
                    </li>
                    <li className="flex items-center gap-1.5 flex-wrap">
                      <span>The</span>
                      <img src="./assets/preplens-icon.png" alt="" className="w-4 h-4 object-contain inline-block" />
                      <strong className="text-[#1a1b1f] dark:text-[#e3e2e6]">PrepLens</strong>
                      <span>app icon will be added to your home screen.</span>
                    </li>
                  </ol>
                </div>
              )}
            </div>
          )}

          {/* Footer actions */}
          <div className="pt-2 flex justify-between items-center">
            <button
              onClick={handleOpenInNewTab}
              className="text-xs text-[#0b57d0] dark:text-[#a8c7fa] hover:underline font-medium flex items-center gap-1 cursor-pointer border-0 bg-transparent"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span>Open in new tab</span>
            </button>
            <M3Button
              onClick={onClose}
              variant="tonal"
              className="h-9 px-5 text-xs"
            >
              Got it
            </M3Button>
          </div>
        </motion.div>
      </motion.div>
    )}
  </AnimatePresence>
);
};
