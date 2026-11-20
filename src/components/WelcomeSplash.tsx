import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';

interface WelcomeSplashProps {
  durationMs?: number;
  onFinish?: () => void;
}

export const WelcomeSplash: React.FC<WelcomeSplashProps> = ({
  durationMs = 1250,
  onFinish,
}) => {
  const [isVisible, setIsVisible] = useState<boolean>(true);

  useEffect(() => {
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
          exit={{ opacity: 0, transition: { duration: 0.35, ease: 'easeInOut' } }}
          className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-[#e5e9f0] dark:bg-[#0b0c10] text-[#0f172a] dark:text-[#f8fafc] select-none pointer-events-none transition-colors"
        >
          <motion.div
            initial={{ scale: 0.92, opacity: 0, y: 4 }}
            animate={{ scale: 1, opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.16, 1, 0.3, 1] } }}
            className="flex flex-col items-center justify-center text-center p-6"
          >
            {/* Authentic Elevate Aperture Emblem */}
            <div className="relative w-20 h-20 sm:w-24 sm:h-24 flex items-center justify-center drop-shadow-sm">
              <img
                src="./assets/preplens-icon.svg?v=22"
                alt="Elevate"
                className="w-full h-full object-contain dark:brightness-125"
              />
            </div>

            {/* Brand Wordmark (Clean without any bluish bar underneath) */}
            <h1 className="text-3xl sm:text-4xl font-extrabold text-[#0b57d0] dark:text-[#a8c7fa] tracking-tight leading-tight mt-3">
              Elevate
            </h1>

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
