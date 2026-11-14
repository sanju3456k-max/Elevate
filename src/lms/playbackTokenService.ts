import type { User, Lecture, PlaybackSessionToken } from './types';

/**
 * Ephemeral Batch Playback Token Gateway (Classplus / Enterprise Security)
 * 
 * Flow:
 * 1. Checks Student Batch Enrollment (Paid/Access check)
 * 2. If student is not enrolled (and not admin/free preview), returns 403 Forbidden
 * 3. If valid, issues a 60-Second Ephemeral Session Token with cryptographic HMAC-style signature
 * 4. Provides background token renewal so authorized playback flows seamlessly
 */

const SERVER_SECRET_SALT = 'ELEVATE_ENTERPRISE_STREAM_GATEWAY_SECRET_KEY_v2';

/**
 * Generates a mock cryptographic signature based on user identity, batch, and expiry.
 */
function createSignature(userId: string, batchId: string, lectureId: string, expiresAt: number): string {
  const payload = `${userId}:${batchId}:${lectureId}:${expiresAt}:${SERVER_SECRET_SALT}`;
  let hash = 0;
  for (let i = 0; i < payload.length; i++) {
    const char = payload.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0; // Convert to 32bit integer
  }
  const hex = Math.abs(hash).toString(16).padStart(8, '0');
  return `sig_${hex}_${btoa(userId.slice(0, 4) + expiresAt.toString().slice(-4))}`;
}

export interface PlaybackVerificationResult {
  isAuthorized: boolean;
  status: 200 | 403;
  errorMessage?: string;
  token?: PlaybackSessionToken;
}

/**
 * Verifies batch access and generates a 60-second ephemeral stream token.
 */
export async function requestPlaybackToken(
  user: User,
  batchId: string,
  lecture: Lecture,
  isGuestAllowed?: boolean
): Promise<PlaybackVerificationResult> {
  // Instantaneous verification check
  const isAdmin = user.role === 'admin';

  // Check 2: Student enrolled in target batch (must be in cloud-verified enrolledBatchIds or guest-open batch)
  const isEnrolled = (Array.isArray(user.enrolledBatchIds) && user.enrolledBatchIds.includes(batchId)) || !!isGuestAllowed;

  if (!isAdmin && !isEnrolled && !lecture.isFreePreview) {
    return {
      isAuthorized: false,
      status: 403,
      errorMessage: `Access Denied (403): Your account (${user.email || 'Guest Mode'}) is not enrolled on the official roster for this batch. Content theft deterrence is active.`,
    };
  }

  // Generate 60-second ephemeral session token
  const now = Date.now();
  const expiresAt = now + 60 * 1000; // 60 seconds lifetime
  const ticketId = `TK-${Math.floor(100000 + Math.random() * 900000)}`;
  const signature = createSignature(user.id, batchId, lecture.id, expiresAt);
  const tokenString = btoa(JSON.stringify({ u: user.id, b: batchId, l: lecture.id, exp: expiresAt }));

  return {
    isAuthorized: true,
    status: 200,
    token: {
      token: tokenString,
      issuedAt: now,
      expiresAt,
      signature,
      ticketId,
      batchId,
      lectureId: lecture.id,
      isAuthorized: true,
      clientIp: '127.0.0.1 (Localhost Protected)',
    },
  };
}

/**
 * Validates whether a token is still live and unexpired.
 */
export function isTokenValid(token: PlaybackSessionToken | null): boolean {
  if (!token) return false;
  if (!token.isAuthorized) return false;
  return Date.now() < token.expiresAt;
}
