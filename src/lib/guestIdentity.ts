const GUEST_DISPLAY_NAME_KEY = 'elevate_guest_display_name_v1';
const GUEST_DEVICE_UID_KEY = 'elevate_guest_device_uid_v1';

export function getGuestDisplayName(): string {
  if (typeof window === 'undefined') return '';
  try {
    return (localStorage.getItem(GUEST_DISPLAY_NAME_KEY) || '').trim();
  } catch {
    return '';
  }
}

export function setGuestDisplayName(name: string): string {
  const clean = String(name || '').trim().slice(0, 80);
  if (typeof window !== 'undefined') {
    try {
      if (clean) {
        localStorage.setItem(GUEST_DISPLAY_NAME_KEY, clean);
      } else {
        localStorage.removeItem(GUEST_DISPLAY_NAME_KEY);
      }
    } catch {}
  }
  return clean;
}

export function getOrCreateGuestDeviceUid(): string {
  if (typeof window === 'undefined') return 'guest_device';
  try {
    const existing = localStorage.getItem(GUEST_DEVICE_UID_KEY);
    if (existing && existing.startsWith('guest_')) return existing;
    const generated = `guest_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    localStorage.setItem(GUEST_DEVICE_UID_KEY, generated);
    return generated;
  } catch {
    return `guest_${Date.now().toString(36)}`;
  }
}
