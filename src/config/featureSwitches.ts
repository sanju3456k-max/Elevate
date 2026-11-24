/**
 * MCB Feature Switches (Circuit Breakers)
 * ---------------------------------------
 * Toggle experimental or newly added features on/off without touching
 * core application logic. Add a new flag here whenever introducing a
 * major creative feature so it stays isolated from existing workflows.
 */
export const FEATURE_SWITCHES = {
  /** Dynamic math generation inside Custom Test Builder */
  CUSTOM_TEST_DYNAMIC_MODE: true,
  /** Mobile compact overflow menu in Test Creator Studio */
  STUDIO_MOBILE_OVERFLOW_MENU: true,
  /** Bottom-right unpin & borderless live pill on Master Hero Banners */
  MASTER_BANNER_BOTTOM_CONTROLS: true,
} as const;

export type FeatureSwitchKey = keyof typeof FEATURE_SWITCHES;

/**
 * Safely checks whether a feature circuit is enabled.
 * Allows optional localStorage override (`mcb_override_<KEY>`) during local debugging.
 */
export function isFeatureEnabled(key: FeatureSwitchKey): boolean {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const override = window.localStorage.getItem(`mcb_override_${key}`);
      if (override === 'true') return true;
      if (override === 'false') return false;
    }
  } catch {
    // Ignore storage access issues in restricted contexts
  }
  return FEATURE_SWITCHES[key];
}
