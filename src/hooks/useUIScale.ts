import { useState, useCallback, useEffect } from 'react';

export type UiScale = 'compact' | 'standard' | 'comfortable' | '85%' | '100%' | '115%' | '130%' | '145%';

export interface UIScaleConfig {
  appZoom: number;
}

export const LOCAL_STORAGE_UI_DENSITY_KEY = 'elevate_ui_density';
export const LOCAL_STORAGE_UI_SCALE_KEY = 'elevate_ui_scale';

export const DEFAULT_UI_SCALE_CONFIG: UIScaleConfig = {
  appZoom: 100,
};

function normalizeDensity(val: string | null | undefined): 'compact' | 'standard' | 'comfortable' {
  if (!val) return 'standard';
  const lower = String(val).toLowerCase().trim();
  if (lower === 'compact' || lower === '85%') return 'compact';
  if (lower === 'comfortable' || lower === '115%' || lower === '130%' || lower === '145%') return 'comfortable';
  return 'standard';
}

function getScaleFactor(density: 'compact' | 'standard' | 'comfortable'): number {
  switch (density) {
    case 'compact':
      return 0.92;
    case 'comfortable':
      return 1.08;
    case 'standard':
    default:
      return 1.0;
  }
}

export function useUIScale() {
  const [scale, setScaleState] = useState<'compact' | 'standard' | 'comfortable'>(() => {
    try {
      if (typeof window === 'undefined') return 'standard';
      const saved = localStorage.getItem(LOCAL_STORAGE_UI_DENSITY_KEY) || localStorage.getItem(LOCAL_STORAGE_UI_SCALE_KEY);
      return normalizeDensity(saved);
    } catch {
      return 'standard';
    }
  });

  const [scaleConfig, setScaleConfig] = useState<UIScaleConfig>(() => ({
    appZoom: Math.round(getScaleFactor(scale) * 100),
  }));

  // Apply density & font scaling to root document
  useEffect(() => {
    try {
      if (typeof document === 'undefined') return;
      const factor = getScaleFactor(scale);
      const root = document.documentElement;
      
      // Update HTML root attributes and styles
      root.setAttribute('data-ui-density', scale);
      root.style.setProperty('--app-density-scale', String(factor));
      
      // Tailwind rem units dynamically scale with root font-size:
      // 16px default * factor
      if (factor === 1.0) {
        root.style.fontSize = '';
      } else {
        root.style.fontSize = `${(factor * 100).toFixed(1)}%`;
      }

      // Persist in localStorage
      localStorage.setItem(LOCAL_STORAGE_UI_DENSITY_KEY, scale);
      localStorage.setItem(LOCAL_STORAGE_UI_SCALE_KEY, scale);

      // Dispatch custom event for any listening subcomponents
      window.dispatchEvent(new CustomEvent('ui-scale-changed', { detail: { scale, factor } }));
    } catch (e) {
      console.warn('Could not apply UI scale:', e);
    }
  }, [scale]);

  const setScale = useCallback((newScale: UiScale | string) => {
    const normalized = normalizeDensity(newScale);
    setScaleState(normalized);
    const factor = getScaleFactor(normalized);
    setScaleConfig({ appZoom: Math.round(factor * 100) });
  }, []);

  const updateScaleConfig = useCallback((updates: Partial<UIScaleConfig>) => {
    setScaleConfig((prev) => ({ ...prev, ...updates }));
  }, []);

  const resetToDefaults = useCallback(() => {
    setScale('standard');
  }, [setScale]);

  return {
    scaleConfig,
    updateScaleConfig,
    resetToDefaults,
    scale,
    setScale,
  };
}

export { useUIScale as useUiScale };
