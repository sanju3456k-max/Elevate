import { initializeApp, deleteApp } from 'firebase/app';
import {
  getFirestore,
  doc,
  deleteDoc,
  collection,
  getDocs,
  query,
  where,
} from 'firebase/firestore';
import fs from 'fs';
import path from 'path';
import { DEFAULT_SYNTHETIC_PERSONA, type SyntheticRunManifest } from './types';

export async function purgeSyntheticTestData(manifestFile?: string): Promise<{
  deletedCount: number;
  details: string[];
}> {
  const details: string[] = [];
  let deletedCount = 0;

  const configPath = path.resolve(process.cwd(), 'firebase-applet-config.json');
  if (!fs.existsSync(configPath)) {
    throw new Error('firebase-applet-config.json not found');
  }

  const fbConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  const app = initializeApp(fbConfig, `synthetic_purge_${Date.now()}`);
  const db = getFirestore(app);

  try {
    const defaultManifestPath = path.resolve(
      process.cwd(),
      'scripts/synthetic-tester/last-run-manifest.json'
    );
    const targetManifest = manifestFile || defaultManifestPath;

    // 1. Purge exact records from manifest
    if (fs.existsSync(targetManifest)) {
      const manifest: SyntheticRunManifest = JSON.parse(
        fs.readFileSync(targetManifest, 'utf8')
      );
      for (const rec of manifest.createdRecords || []) {
        try {
          await deleteDoc(doc(db, rec.collectionPath, rec.docId));
          deletedCount++;
          details.push(`Deleted ${rec.collectionPath}/${rec.docId} (${rec.description})`);
        } catch (err) {
          details.push(
            `Skipped ${rec.collectionPath}/${rec.docId}: ${(err as Error).message}`
          );
        }
      }
      fs.unlinkSync(targetManifest);
      details.push('Removed manifest file after cleanup.');
    }

    // 2. Fallback sweep for any lingering synthetic_tester_bot_01 profile or enrollments
    try {
      const profileRef = doc(db, 'user_profiles', DEFAULT_SYNTHETIC_PERSONA.uid);
      await deleteDoc(profileRef);
      details.push(`Ensured user_profiles/${DEFAULT_SYNTHETIC_PERSONA.uid} is clean.`);
    } catch {}

    try {
      const enrSnap = await getDocs(
        query(
          collection(db, 'batch_enrollments'),
          where('studentEmail', '==', DEFAULT_SYNTHETIC_PERSONA.email)
        )
      );
      for (const d of enrSnap.docs) {
        await deleteDoc(d.ref);
        deletedCount++;
        details.push(`Deleted residual synthetic enrollment ${d.id}`);
      }
    } catch {}
  } finally {
    await deleteApp(app).catch(() => {});
  }

  return { deletedCount, details };
}

// Allow direct CLI execution: npx tsx scripts/synthetic-tester/purge.ts
const isMain =
  typeof process !== 'undefined' &&
  process.argv[1] &&
  process.argv[1].replace(/\\/g, '/').endsWith('synthetic-tester/purge.ts');

if (isMain) {
  console.log('🧹 Starting Synthetic Test Data Purge...');
  purgeSyntheticTestData()
    .then((res) => {
      console.log(`✅ Purge complete! Deleted ${res.deletedCount} synthetic records.`);
      res.details.forEach((d) => console.log(`   • ${d}`));
    })
    .catch((err) => {
      console.error('❌ Purge failed:', err);
      process.exit(1);
    });
}
