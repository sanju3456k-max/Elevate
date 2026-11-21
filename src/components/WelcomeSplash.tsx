import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';

interface WelcomeSplashProps {
  durationMs?: number;
  onFinish?: () => void;
}

export const WelcomeSplash: React.FC<WelcomeSplashProps> = ({
  durationMs = 380,
  onFinish,
}) => {
  const [isVisible, setIsVisible] = useState<boolean>(true);

  useEffect(() => {
    // Synchronize status bar theme-color directly with the welcome splash screen card (#ffffff light / #0b0c10 dark)
    const isDark = typeof document !== 'undefined' && (
      document.documentElement.classList.contains('dark') ||
      window.matchMedia('(prefers-color-scheme: dark)').matches
    );
    const targetColor = isDark ? '#0b0c10' : '#ffffff';

    const metaTags = document.querySelectorAll('meta[name="theme-color"]');
    metaTags.forEach((tag) => {
      tag.removeAttribute('media');
      tag.setAttribute('content', targetColor);
    });

    const timer = setTimeout(() => {
      setIsVisible(false);
      if (onFinish) onFinish();
    }, durationMs);

    return () => clearTimeout(timer);
  }, [durationMs, onFinish]);

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          key="elevate-welcome-splash"
          initial={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.25, ease: 'easeInOut' } }}
          className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-white dark:bg-[#0b0c10] text-[#0f172a] dark:text-[#f8fafc] select-none pointer-events-none transition-colors"
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0, y: 2 }}
            animate={{ scale: 1, opacity: 1, y: 0, transition: { duration: 0.28, ease: [0.16, 1, 0.3, 1] } }}
            className="flex flex-col items-center justify-center text-center p-6"
          >
            {/* Authentic Elevate Aperture Emblem with Brand Wordmark */}
            <div className="relative w-28 h-28 sm:w-32 sm:h-32 flex items-center justify-center drop-shadow-sm">
              <img
                src="./assets/preplens-icon.svg?v=23"
                alt="Elevate"
                className="w-full h-full object-contain dark:brightness-125"
              />
            </div>

            {/* Smooth Indeterminate Progress / Loading Bar */}
            <div className="w-36 sm:w-40 h-1 mt-4 bg-slate-300/60 dark:bg-zinc-800 rounded-full overflow-hidden">
              <motion.div
                initial={{ x: '-100%' }}
                animate={{ x: '100%' }}
                transition={{ repeat: Infinity, duration: 1.1, ease: 'easeInOut' }}
                className="w-1/2 h-full bg-[#0b57d0] dark:bg-[#a8c7fa] rounded-full"
              />
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
