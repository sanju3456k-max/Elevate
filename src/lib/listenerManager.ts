/**
 * ============================================================================
 * ENTERPRISE VISIBILITY-AWARE SINGLETON LISTENER MANAGER
 * ============================================================================
 * 
 * Performance & Quota Optimization Guarantees:
 * 1. Singleton Listener per Document: Eliminates duplicate concurrent `onSnapshot`
 *    listeners for the same Firestore document across React components & views.
 * 2. Visibility-Aware Lifecycle: Automatically pauses non-critical active listeners
 *    when the browser tab is hidden or minimized (`document.visibilityState === 'hidden'`),
 *    stopping billable reads and connection overhead while the student is away.
 * 3. Safe Reconnect: Resumes subscriptions seamlessly when the student focuses back.
 * 4. Quota Guard: Respects `smartCoordinator.shouldAttachLiveListener()` to prevent
 *    quota drain during network outages or quota caps.
 */

import { onSnapshot, type DocumentReference, type DocumentSnapshot } from 'firebase/firestore';
import { smartCoordinator } from './smartLocalCoordinator';

interface SharedListenerRecord {
  path: string;
  docRefFactory: () => DocumentReference;
  subscribers: Set<{
    onNext: (snap: DocumentSnapshot) => void;
    onError?: (err: any) => void;
  }>;
  unsubFirestore: (() => void) | null;
  lastSnapshot: DocumentSnapshot | null;
  pauseWhenHidden: boolean;
}

class EnterpriseListenerManager {
  private registry: Map<string, SharedListenerRecord> = new Map();
  private isVisibilityListenerAttached = false;

  constructor() {
    this.initVisibilityListener();
  }

  private initVisibilityListener(): void {
    if (typeof window === 'undefined' || typeof document === 'undefined' || this.isVisibilityListenerAttached) {
      return;
    }

    this.isVisibilityListenerAttached = true;
    document.addEventListener('visibilitychange', () => {
      const isHidden = document.visibilityState === 'hidden';
      this.handleVisibilityChange(isHidden);
    });
  }

  private handleVisibilityChange(isHidden: boolean): void {
    this.registry.forEach((record) => {
      if (!record.pauseWhenHidden) return;

      if (isHidden) {
        // Tab backgrounded: detach listener to stop billing reads & socket activity
        if (record.unsubFirestore) {
          try {
            record.unsubFirestore();
          } catch {}
          record.unsubFirestore = null;
        }
      } else {
        // Tab foregrounded: re-attach listener if subscribers exist
        if (!record.unsubFirestore && record.subscribers.size > 0) {
          this.attachFirestoreStream(record);
        }
      }
    });
  }

  private attachFirestoreStream(record: SharedListenerRecord): void {
    if (!smartCoordinator.shouldAttachLiveListener()) {
      return;
    }

    try {
      const docRef = record.docRefFactory();
      record.unsubFirestore = onSnapshot(
        docRef,
        (snap) => {
          record.lastSnapshot = snap;
          record.subscribers.forEach((sub) => {
            try {
              sub.onNext(snap);
            } catch (err) {
              console.warn(`[ListenerManager] Subscriber handler error on ${record.path}:`, err);
            }
          });
        },
        (error) => {
          console.warn(`[ListenerManager] Stream error on ${record.path}:`, error);
          record.subscribers.forEach((sub) => {
            try {
              sub.onError?.(error);
            } catch {}
          });
        }
      );
    } catch (err) {
      console.warn(`[ListenerManager] Failed to attach stream on ${record.path}:`, err);
    }
  }

  /**
   * Subscribes to a Firestore document with singleton deduplication & visibility lifecycle.
   */
  public subscribeDocument(
    docPath: string,
    docRefFactory: () => DocumentReference,
    onNext: (snap: DocumentSnapshot) => void,
    onError?: (err: any) => void,
    options: { pauseWhenHidden?: boolean } = { pauseWhenHidden: true }
  ): () => void {
    const subscriber = { onNext, onError };
    let record = this.registry.get(docPath);

    if (!record) {
      record = {
        path: docPath,
        docRefFactory,
        subscribers: new Set([subscriber]),
        unsubFirestore: null,
        lastSnapshot: null,
        pauseWhenHidden: options.pauseWhenHidden ?? true,
      };
      this.registry.set(docPath, record);

      // Only attach if tab is currently visible (or if pauseWhenHidden is false)
      const isHidden = typeof document !== 'undefined' && document.visibilityState === 'hidden';
      if (!isHidden || !record.pauseWhenHidden) {
        this.attachFirestoreStream(record);
      }
    } else {
      record.subscribers.add(subscriber);

      // Immediately replay last known snapshot if available for instant 0ms response
      if (record.lastSnapshot) {
        try {
          onNext(record.lastSnapshot);
        } catch {}
      }

      // If existing record was paused and now someone is subscribing while tab is visible, attach
      const isHidden = typeof document !== 'undefined' && document.visibilityState === 'hidden';
      if (!record.unsubFirestore && (!isHidden || !record.pauseWhenHidden)) {
        this.attachFirestoreStream(record);
      }
    }

    // Return cleanup function for the individual subscriber
    return () => {
      const current = this.registry.get(docPath);
      if (!current) return;

      current.subscribers.delete(subscriber);
      if (current.subscribers.size === 0) {
        if (current.unsubFirestore) {
          try {
            current.unsubFirestore();
          } catch {}
          current.unsubFirestore = null;
        }
        this.registry.delete(docPath);
      }
    };
  }

  /**
   * Returns active listener metrics for telemetry & debugging.
   */
  public getActiveListenerStats(): { activePaths: string[]; totalSubscribers: number } {
    let totalSubscribers = 0;
    const activePaths: string[] = [];
    this.registry.forEach((rec, path) => {
      if (rec.unsubFirestore) activePaths.push(path);
      totalSubscribers += rec.subscribers.size;
    });
    return { activePaths, totalSubscribers };
  }
}

export const listenerManager = new EnterpriseListenerManager();
