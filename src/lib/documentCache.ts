/**
 * High-performance client-side document caching layer using IndexedDB.
 * Enables instant (<10ms) zero-latency offline loading for PDF notes and images.
 */

const DB_NAME = 'theta_notes_document_cache';
const DB_VERSION = 1;
const STORE_NAME = 'documents';

interface CachedDocEntry {
  key: string;
  data: ArrayBuffer;
  contentType: string;
  etag?: string;
  size: number;
  cachedAt: number;
}

function openCacheDb(): Promise<IDBDatabase | null> {
  if (typeof window === 'undefined' || !('indexedDB' in window)) {
    return Promise.resolve(null);
  }

  return new Promise((resolve) => {
    try {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = (event: any) => {
        const db = event.target?.result as IDBDatabase;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'key' });
          store.createIndex('cachedAt', 'cachedAt', { unique: false });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

/**
 * Retrieve cached document by key (Drive ID or URL)
 */
export async function getCachedDocument(
  key: string
): Promise<{ data: ArrayBuffer; contentType: string } | null> {
  const db = await openCacheDb();
  if (!db) return null;

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(key);

      req.onsuccess = () => {
        const result = req.result as CachedDocEntry | undefined;
        if (result && result.data) {
          // If cached within the last 7 days, return it
          const isFresh = Date.now() - result.cachedAt < 7 * 24 * 60 * 60 * 1000;
          if (isFresh) {
            resolve({ data: result.data, contentType: result.contentType });
            return;
          }
        }
        resolve(null);
      };

      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

/**
 * Save document to IndexedDB cache
 */
export async function saveCachedDocument(
  key: string,
  data: ArrayBuffer,
  contentType: string,
  etag?: string
): Promise<void> {
  // Avoid caching files larger than 40MB in client IndexedDB
  if (data.byteLength > 40 * 1024 * 1024) return;

  const db = await openCacheDb();
  if (!db) return;

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const entry: CachedDocEntry = {
        key,
        data,
        contentType,
        etag,
        size: data.byteLength,
        cachedAt: Date.now(),
      };
      store.put(entry);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}
