import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';

interface WelcomeSplashProps {
  durationMs?: number;
  onFinish?: () => void;
}

export const WelcomeSplash: React.FC<WelcomeSplashProps> = ({
  durationMs = 1200,
  onFinish,
}) => {
  const [isVisible, setIsVisible] = useState<boolean>(true);

  useEffect(() => {
    // Detect standalone PWA mode (where Android already displayed the OS native splash screen)
    const isStandalone = typeof window !== 'undefined' && (
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as any).standalone === true ||
      document.referrer.includes('android-app://')
    );

    // In standalone mode, transition out quickly to avoid duplicate splash screens
    const effectiveDuration = isStandalone ? 350 : durationMs;

    const timer = setTimeout(() => {
      setIsVisible(false);
      if (onFinish) onFinish();
    }, effectiveDuration);

    return () => clearTimeout(timer);
  }, [durationMs, onFinish]);

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          key="elevate-welcome-splash"
          initial={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.35, ease: 'easeInOut' } }}
          className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-[#e5e9f0] dark:bg-[#0b0c10] text-[#0f172a] dark:text-[#f8fafc] select-none pointer-events-none transition-colors"
        >
          <motion.div
            initial={{ scale: 0.92, opacity: 0, y: 6 }}
            animate={{ scale: 1, opacity: 1, y: 0, transition: { duration: 0.45, ease: [0.16, 1, 0.3, 1] } }}
            className="flex flex-col items-center justify-center gap-4 text-center p-6"
          >
            {/* Authentic Static Aperture Lens Emblem - Clean without white shadow */}
            <div className="relative w-25 h-25 sm:w-28 sm:h-28 rounded-full flex items-center justify-center overflow-hidden">
              <img
                src="./assets/preplens-icon.png"
                alt="Elevate"
                className="w-full h-full object-contain"
              />
            </div>

            {/* Brand Wordmark & Calibration Arc */}
            <div className="flex flex-col items-center">
              <h1 className="text-3xl sm:text-4xl font-black text-[#0b57d0] dark:text-[#a8c7fa] tracking-tight leading-tight">
                Elevate
              </h1>
              <div className="w-32 h-[2.5px] mt-2 mb-1 rounded-full bg-gradient-to-r from-cyan-400 via-sky-500 to-blue-600 opacity-90" />
            </div>

            {/* Subtle Progress Bar */}
            <div className="w-36 h-1 mt-3 bg-slate-300/60 dark:bg-zinc-800 rounded-full overflow-hidden">
              <motion.div
                initial={{ x: '-100%' }}
                animate={{ x: '100%' }}
                transition={{ repeat: Infinity, duration: 1, ease: 'easeInOut' }}
                className="w-1/2 h-full bg-gradient-to-r from-cyan-400 to-sky-500 rounded-full"
              />
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
