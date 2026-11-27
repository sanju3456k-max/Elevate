import { doc, getDoc, setDoc, updateDoc, onSnapshot } from 'firebase/firestore';
import { db } from './firebase';
import { isMasterUser } from './masterAccount';
import type { User } from 'firebase/auth';

const DEVICE_ID_STORAGE_KEY = 'elevate_device_id_v1';

export interface DeviceMetadata {
  id: string;
  label: string;
  os: string;
  browser: string;
  registeredAt?: string;
  lastActiveAt?: string;
}

export interface DeviceLockStatus {
  allowed: boolean;
  isMaster?: boolean;
  registeredDeviceLabel?: string;
  registeredDeviceAt?: string;
  currentDeviceLabel?: string;
  currentDeviceId?: string;
  userEmail?: string;
  userName?: string;
}

/**
 * Returns or generates a persistent device UUID in localStorage.
 */
export function getOrCreateDeviceId(): string {
  if (typeof window === 'undefined' || !window.localStorage) {
    return 'dev_unknown_' + Math.random().toString(36).substring(2, 8);
  }
  let id = localStorage.getItem(DEVICE_ID_STORAGE_KEY);
  if (!id) {
    id = `dev_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
    localStorage.setItem(DEVICE_ID_STORAGE_KEY, id);
  }
  return id;
}

/**
 * Detects device, OS, and browser to produce a human-friendly label.
 * e.g. "Chrome on Windows", "Safari on iPhone", "Edge on Android"
 */
export function getDeviceMetadata(): DeviceMetadata {
  const id = getOrCreateDeviceId();
  if (typeof navigator === 'undefined') {
    return { id, label: 'Unknown Device', os: 'Unknown', browser: 'Unknown' };
  }

  const ua = navigator.userAgent || '';
  let os = 'Unknown OS';
  if (/android/i.test(ua)) os = 'Android';
  else if (/iPad|iPhone|iPod/.test(ua)) os = 'iOS';
  else if (/windows nt/i.test(ua)) os = 'Windows';
  else if (/macintosh|mac os x/i.test(ua)) os = 'macOS';
  else if (/linux/i.test(ua)) os = 'Linux';

  let browser = 'Browser';
  if (/edg/i.test(ua)) browser = 'Edge';
  else if (/chrome|crios/i.test(ua) && !/opr|opera/i.test(ua)) browser = 'Chrome';
  else if (/firefox|fxios/i.test(ua)) browser = 'Firefox';
  else if (/safari/i.test(ua) && !/chrome/i.test(ua)) browser = 'Safari';
  else if (/opr|opera/i.test(ua)) browser = 'Opera';

  const label = `${browser} on ${os}`;
  return { id, label, os, browser };
}

/**
 * Checks if the current device is authorized for this user account.
 * - Master Admin is ALWAYS allowed (bypass).
 * - First login on an account binds that device ID.
 * - Subsequent logins on different devices are BLOCKED.
 */
export async function enforceDeviceLock(user: User): Promise<DeviceLockStatus> {
  if (!user || !user.uid) {
    return { allowed: true };
  }

  // Master Admin accounts are never locked to a single device
  if (isMasterUser(user)) {
    return { allowed: true, isMaster: true };
  }

  const currentDev = getDeviceMetadata();
  const userRef = doc(db, 'users', user.uid);

  try {
    const snap = await getDoc(userRef);
    const data = snap.exists() ? snap.data() : null;

    const registeredId = data?.registeredDeviceId;

    // Case 1: First-time device binding (or previous reset by admin)
    if (!registeredId) {
      const now = new Date().toISOString();
      await setDoc(
        userRef,
        {
          registeredDeviceId: currentDev.id,
          registeredDeviceLabel: currentDev.label,
          registeredDeviceAt: now,
          lastActiveAt: now,
          deviceInfo: {
            id: currentDev.id,
            label: currentDev.label,
            os: currentDev.os,
            browser: currentDev.browser,
            updatedAt: now,
          },
        },
        { merge: true }
      );
      return { allowed: true, currentDeviceId: currentDev.id, currentDeviceLabel: currentDev.label };
    }

    // Case 2: Matching registered device
    if (registeredId === currentDev.id) {
      // Update activity timestamp non-blockingly
      updateDoc(userRef, { lastActiveAt: new Date().toISOString() }).catch(() => {});
      return { allowed: true, currentDeviceId: currentDev.id, currentDeviceLabel: currentDev.label };
    }

    // Case 3: Device mismatch! Blocked!
    return {
      allowed: false,
      registeredDeviceLabel: data?.registeredDeviceLabel || 'Another Device',
      registeredDeviceAt: data?.registeredDeviceAt || '',
      currentDeviceLabel: currentDev.label,
      currentDeviceId: currentDev.id,
      userEmail: user.email || '',
      userName: user.displayName || user.email?.split('@')[0] || 'Student',
    };
  } catch (err) {
    console.warn('Device lock verification failed, permitting fallback:', err);
    return { allowed: true };
  }
}

/**
 * Submits a device reset request to Admin.
 */
export async function submitDeviceResetRequest(
  user: User,
  reason: string = 'Device changed or upgraded'
): Promise<boolean> {
  if (!user || !user.uid) return false;
  try {
    const currentDev = getDeviceMetadata();
    const reqRef = doc(db, 'device_reset_requests', user.uid);
    await setDoc(reqRef, {
      uid: user.uid,
      studentName: user.displayName || user.email?.split('@')[0] || 'Student',
      studentEmail: user.email || '',
      newDeviceLabel: currentDev.label,
      newDeviceId: currentDev.id,
      requestedAt: new Date().toISOString(),
      reason,
      status: 'pending',
    });
    return true;
  } catch (err) {
    console.error('Failed to submit device reset request:', err);
    return false;
  }
}

/**
 * Admin action: Resets device lock for a student so they can register their new device.
 */
export async function adminResetDeviceLock(studentUid: string, requestId?: string): Promise<boolean> {
  if (!studentUid && !requestId) return false;
  try {
    if (studentUid) {
      const userRef = doc(db, 'users', studentUid);
      await setDoc(
        userRef,
        {
          registeredDeviceId: null,
          registeredDeviceLabel: null,
          registeredDeviceAt: null,
          resetAt: new Date().toISOString(),
        },
        { merge: true }
      );
    }

    // Update the matching pending reset request document (whether keyed by requestId or studentUid)
    const targetRequestIds = Array.from(new Set([requestId, studentUid].filter(Boolean) as string[]));
    await Promise.all(
      targetRequestIds.map((reqId) =>
        setDoc(
          doc(db, 'device_reset_requests', reqId),
          {
            status: 'approved',
            approvedAt: new Date().toISOString(),
          },
          { merge: true }
        ).catch(() => {})
      )
    );

    return true;
  } catch (err) {
    console.error('Failed to reset student device lock:', err);
    return false;
  }
}
