import { Router } from "express";
import fs from "fs";
import path from "path";

const router = Router();

export interface ServerLeaderboardEntry {
  userId: string;
  userName: string;
  userEmail?: string;
  score: number;
  totalPoints: number;
  percentage: number;
  timeSpentSeconds: number;
  attemptMode: 'online' | 'omr';
  completedAt: string;
  testTitle?: string;
  rank?: number;
  attemptNumber?: number;
  firstAttemptId?: string;
}

export interface ServerTopBucketDoc {
  testId: string;
  testTitle: string;
  totalParticipants: number;
  updatedAt: string;
  version: number;
  entries: ServerLeaderboardEntry[];
  packedTop?: string[];
}

const STORAGE_DIR = path.join(process.cwd(), ".leaderboards");

function ensureStorageDir() {
  try {
    if (!fs.existsSync(STORAGE_DIR)) {
      fs.mkdirSync(STORAGE_DIR, { recursive: true });
    }
  } catch (err) {
    console.warn("Could not create leaderboards directory:", err);
  }
}

export function computeCanonicalId(testId: string, testTitle?: string): string {
  if (testTitle && typeof testTitle === 'string' && testTitle.trim().length >= 3) {
    const slug = testTitle.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
    if (slug.length >= 3) {
      return `test_title_${slug}`;
    }
  }
  return (testId || "default").replace(/[^a-zA-Z0-9_-]/g, "_");
}

function getTestFilePath(id: string): string {
  const safeId = (id || "default").replace(/[^a-zA-Z0-9_-]/g, "_");
  return path.join(STORAGE_DIR, `${safeId}.json`);
}

function getBucketFilePath(id: string): string {
  const safeId = (id || "default").replace(/[^a-zA-Z0-9_-]/g, "_");
  return path.join(STORAGE_DIR, `bucket_${safeId}.json`);
}

function loadEntriesFromFile(id: string): ServerLeaderboardEntry[] {
  ensureStorageDir();
  const filePath = getTestFilePath(id);
  if (fs.existsSync(filePath)) {
    try {
      const data = fs.readFileSync(filePath, "utf-8");
      const parsed = JSON.parse(data);
      if (Array.isArray(parsed)) {
        return parsed;
      }
    } catch {}
  }
  return [];
}

/**
 * Saves entries and updates the 1-Read top bucket document.
 */
function saveEntriesAndBucket(id: string, testTitle: string, entries: ServerLeaderboardEntry[]) {
  // Sort descending by score, ascending by time spent
  entries.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.timeSpentSeconds - b.timeSpentSeconds;
  });

  // Assign ranks
  entries.forEach((e, idx) => {
    e.rank = idx + 1;
  });

  ensureStorageDir();
  try {
    fs.writeFileSync(getTestFilePath(id), JSON.stringify(entries, null, 2), "utf-8");
  } catch (err) {
    console.warn(`Could not write leaderboard ${id} to disk:`, err);
  }

  // Create compact 100-student Top Bucket
  const top100 = entries.slice(0, 100);
  const packedTop = top100.map(e => 
    `${e.userId}|${e.userName}|${e.score}|${e.totalPoints}|${e.percentage}|${e.timeSpentSeconds}|${e.attemptMode}|${e.completedAt}`
  );

  const bucket: ServerTopBucketDoc = {
    testId: id,
    testTitle: testTitle || '',
    totalParticipants: entries.length,
    updatedAt: new Date().toISOString(),
    version: 1,
    entries: top100,
    packedTop,
  };

  try {
    fs.writeFileSync(getBucketFilePath(id), JSON.stringify(bucket, null, 2), "utf-8");
  } catch (err) {
    console.warn(`Could not write bucket ${id} to disk:`, err);
  }

  return bucket;
}

/**
 * First-Attempt Policy:
 * Only the user's first-ever attempt is accepted into the ranking system.
 * Subsequent attempts by the same user are ignored to preserve ranking fairness
 * and eliminate unnecessary disk/server writes.
 */
function mergeEntryIntoList(list: ServerLeaderboardEntry[], newEntry: ServerLeaderboardEntry): { list: ServerLeaderboardEntry[]; isNewOrUpdated: boolean } {
  const existingIndex = list.findIndex((e) => e.userId === newEntry.userId);
  if (existingIndex >= 0) {
    // User already has their initial attempt recorded!
    // Strict First-Attempt Only rule: Do NOT modify existing ranking record!
    return { list, isNewOrUpdated: false };
  } else {
    list.push({
      ...newEntry,
      attemptNumber: 1,
    });
    return { list, isNewOrUpdated: true };
  }
}

// GET /api/leaderboard/:testId/bucket?title=...
// Returns the single lightweight bucket (100 students packed)
router.get("/:testId/bucket", (req, res) => {
  try {
    const { testId } = req.params;
    const testTitle = (req.query.title as string) || '';
    const canonicalId = computeCanonicalId(testId, testTitle);

    const bucketPath = getBucketFilePath(canonicalId);
    if (fs.existsSync(bucketPath)) {
      try {
        const raw = fs.readFileSync(bucketPath, "utf-8");
        return res.json(JSON.parse(raw));
      } catch {}
    }

    // Fallback: build from entries
    const entries = loadEntriesFromFile(canonicalId);
    const bucket = saveEntriesAndBucket(canonicalId, testTitle, entries);
    return res.json(bucket);
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || "Failed to get leaderboard bucket" });
  }
});

// GET /api/leaderboard/:testId?title=...
router.get("/:testId", (req, res) => {
  try {
    const { testId } = req.params;
    const testTitle = (req.query.title as string) || '';
    const canonicalId = computeCanonicalId(testId, testTitle);

    const mergedMap = new Map<string, ServerLeaderboardEntry>();

    // Load from raw testId file
    const rawEntries = loadEntriesFromFile(testId);
    rawEntries.forEach((e) => {
      if (e && e.userId) mergedMap.set(e.userId, e);
    });

    // If canonical ID is different, load from canonical file as well
    if (canonicalId && canonicalId !== testId) {
      const canonicalEntries = loadEntriesFromFile(canonicalId);
      canonicalEntries.forEach((e) => {
        if (!e || !e.userId) return;
        const existing = mergedMap.get(e.userId);
        if (!existing || e.score > existing.score || (e.score === existing.score && e.timeSpentSeconds < existing.timeSpentSeconds)) {
          mergedMap.set(e.userId, e);
        }
      });
    }

    const allEntries = Array.from(mergedMap.values());
    allEntries.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return (a.timeSpentSeconds || 0) - (b.timeSpentSeconds || 0);
    });

    allEntries.forEach((e, idx) => {
      e.rank = idx + 1;
    });

    return res.json({
      entries: allEntries,
      totalParticipants: allEntries.length,
    });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || "Failed to get leaderboard" });
  }
});

// POST /api/leaderboard/:testId
router.post("/:testId", (req, res) => {
  try {
    const { testId } = req.params;
    const newEntry = req.body as ServerLeaderboardEntry;

    if (!newEntry || !newEntry.userId) {
      return res.status(400).json({ error: "Invalid leaderboard entry: userId is required" });
    }

    const testTitle = newEntry.testTitle || (req.query.title as string) || '';
    const canonicalId = computeCanonicalId(testId, testTitle);

    // Check if user already has an entry in canonical or raw test
    const rawEntries = loadEntriesFromFile(testId);
    const canonicalEntries = canonicalId !== testId ? loadEntriesFromFile(canonicalId) : rawEntries;

    const alreadyExists = canonicalEntries.some(e => e.userId === newEntry.userId) || rawEntries.some(e => e.userId === newEntry.userId);
    if (alreadyExists) {
      // Zero server writes! First attempt already sealed.
      return res.json({
        success: true,
        ignored: true,
        message: "First attempt already recorded. Subsequent attempts do not alter test rankings.",
        canonicalId,
      });
    }

    // Update raw testId file
    const { list: updatedRaw } = mergeEntryIntoList(rawEntries, newEntry);
    saveEntriesAndBucket(testId, testTitle, updatedRaw);

    // Update canonical title file if different
    if (canonicalId && canonicalId !== testId) {
      const { list: updatedCanonical } = mergeEntryIntoList(canonicalEntries, newEntry);
      saveEntriesAndBucket(canonicalId, testTitle, updatedCanonical);
    }

    return res.json({
      success: true,
      entry: newEntry,
      canonicalId,
    });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || "Failed to update leaderboard" });
  }
});

export default router;
