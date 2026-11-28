import React, { useState, useRef, useEffect, useCallback } from 'react';
import { RefreshCw } from 'lucide-react';
import { useApp } from '../../lms/LmsContext';
import { triggerLightHaptic, triggerSuccessHaptic } from '../../lib/nativeHardwareBridge';

interface PullToRefreshWrapperProps {
  enabled?: boolean;
  onRefresh?: () => Promise<void> | void;
  children: React.ReactNode;
}

const PULL_THRESHOLD = 64;

/**
 * Shared YouTube-style pull-to-refresh wrapper for primary app pages
 * (Home, Courses/Batches, Tests, Analytics).
 */
export const PullToRefreshWrapper: React.FC<PullToRefreshWrapperProps> = ({
  enabled = true,
  onRefresh,
  children,
}) => {
  const { refreshCloudContent, refreshLiveClasses } = useApp();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [pullDistance, setPullDistance] = useState<number>(0);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const pullStateRef = useRef<{
    active: boolean;
    startX: number;
    startY: number;
    hapticFired: boolean;
    distance: number;
  }>({ active: false, startX: 0, startY: 0, hapticFired: false, distance: 0 });
  const isRefreshingRef = useRef<boolean>(false);
  isRefreshingRef.current = isRefreshing;

  const triggerRefresh = useCallback(async () => {
    if (isRefreshingRef.current) return;
    setIsRefreshing(true);
    setPullDistance(56);
    try {
      await Promise.allSettled([
        refreshCloudContent(),
        refreshLiveClasses(),
        Promise.resolve(onRefresh?.()),
        new Promise((r) => setTimeout(r, 550)),
      ]);
      triggerSuccessHaptic();
    } finally {
      setIsRefreshing(false);
      setPullDistance(0);
    }
  }, [refreshCloudContent, refreshLiveClasses, onRefresh]);

  useEffect(() => {
    const el = rootRef.current;
    if (!el || !enabled) {
      pullStateRef.current.active = false;
      setPullDistance(0);
      return;
    }

    const getTopScroll = () =>
      Math.max(window.scrollY || 0, document.documentElement?.scrollTop || 0, el.scrollTop || 0);

    const onTouchStart = (e: TouchEvent) => {
      if (isRefreshingRef.current || e.touches.length !== 1) return;
      if (getTopScroll() <= 2) {
        pullStateRef.current = {
          active: true,
          startX: e.touches[0].clientX,
          startY: e.touches[0].clientY,
          hapticFired: false,
          distance: 0,
        };
      } else {
        pullStateRef.current.active = false;
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      const ps = pullStateRef.current;
      if (!ps.active || isRefreshingRef.current || e.touches.length !== 1) return;
      const dx = e.touches[0].clientX - ps.startX;
      const dy = e.touches[0].clientY - ps.startY;
      // Cancel pull-to-refresh if scrolling up or swiping horizontally (e.g. hero banner)
      if (dy <= 0 || Math.abs(dx) > Math.abs(dy) * 1.1 || getTopScroll() > 4) {
        if (ps.distance > 0) {
          ps.distance = 0;
          setPullDistance(0);
        }
        if (dy < -8 || Math.abs(dx) > 14) ps.active = false;
        return;
      }
      e.preventDefault();
      const damped = Math.min(108, Math.round(dy * 0.45));
      ps.distance = damped;
      setPullDistance(damped);
      if (damped >= PULL_THRESHOLD && !ps.hapticFired) {
        ps.hapticFired = true;
        triggerLightHaptic();
      }
    };

    const onTouchEnd = () => {
      const ps = pullStateRef.current;
      if (!ps.active) return;
      ps.active = false;
      if (ps.distance >= PULL_THRESHOLD) {
        triggerRefresh();
      } else {
        ps.distance = 0;
        setPullDistance(0);
      }
    };

    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    el.addEventListener('touchend', onTouchEnd, { passive: true });
    el.addEventListener('touchcancel', onTouchEnd, { passive: true });
    return () => {
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('touchend', onTouchEnd);
      el.removeEventListener('touchcancel', onTouchEnd);
    };
  }, [enabled, triggerRefresh]);

  return (
    <div
      ref={rootRef}
      className="relative"
      style={{
        transform: pullDistance > 0 ? `translateY(${Math.round(pullDistance * 0.35)}px)` : undefined,
        transition: pullStateRef.current.active ? 'none' : 'transform 220ms cubic-bezier(0.2, 0.8, 0.2, 1)',
      }}
    >
      {/* YouTube-Style Floating Circular Pull-to-Refresh Indicator */}
      {enabled && (pullDistance > 8 || isRefreshing) && (
        <div
          className="fixed left-1/2 -translate-x-1/2 z-[120] pointer-events-none flex items-center justify-center"
          style={{
            top: `calc(var(--android-status-bar-height, 0px) + ${Math.min(76, 12 + pullDistance * 0.72)}px)`,
            opacity: isRefreshing ? 1 : Math.min(1, pullDistance / 42),
            transition: pullStateRef.current.active ? 'none' : 'all 200ms ease-out',
          }}
        >
          <div className="w-10 h-10 rounded-full bg-white dark:bg-[#1e2024] shadow-[0_4px_16px_rgba(0,0,0,0.18)] border border-slate-200/70 dark:border-white/10 flex items-center justify-center">
            <RefreshCw
              className={`w-5 h-5 ${
                isRefreshing
                  ? 'animate-spin text-[#0b57d0] dark:text-[#a8c7fa]'
                  : pullDistance >= PULL_THRESHOLD
                    ? 'text-[#0b57d0] dark:text-[#a8c7fa]'
                    : 'text-slate-500 dark:text-zinc-400'
              }`}
              style={!isRefreshing ? { transform: `rotate(${pullDistance * 4}deg)` } : undefined}
            />
          </div>
        </div>
      )}
      {children}
    </div>
  );
};
