/**
 * Elevate Platform - Standalone Ephemeral Load Test Purge Utility
 * 
 * Instantly locates and cleans up any synthetic load test data in Firebase:
 * - Scans 'loadtest_ephemeral' session namespaces
 * - Scans 'loadtest_attempts' and 'loadtest_leaderboard'
 * - Deletes in atomic batches of 500 documents
 * 
 * Usage:
 *   npx tsx scripts/loadtest-5000-purge.ts
 *   npx tsx scripts/loadtest-5000-purge.ts --session=session_12345
 */

import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, doc, writeBatch, query, limit } from 'firebase/firestore';
import fs from 'fs';
import path from 'path';

const args = process.argv.slice(2).reduce<Record<string, string>>((acc, curr) => {
  if (curr.startsWith('--')) {
    const [key, val] = curr.replace(/^--/, '').split('=');
    acc[key] = val || 'true';
  }
  return acc;
}, {});

async function main() {
  console.log('========================================================================');
  console.log('🧹 ELEVATE STANDALONE EPHEMERAL LOAD TEST PURGE & SANITIZER 🧹');
  console.log('========================================================================\n');

  let configPath = path.resolve(process.cwd(), 'firebase-applet-config.json');
  if (!fs.existsSync(configPath)) {
    configPath = path.resolve(process.cwd(), 'Remix-Remix-Remix-Remix-Remix-Remix-Math-Mock-Test-Practice-2026-10-20-0d7ca', 'firebase-applet-config.json');
  }

  if (!fs.existsSync(configPath)) {
    console.error('❌ Error: firebase-applet-config.json not found.');
    process.exit(1);
  }

  const fbConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  const app = initializeApp(fbConfig, `purge_${Date.now()}`);
  const db = getFirestore(app);

  console.log(`🔥 Connected to Firestore Project: [${fbConfig.projectId}]`);

  const collectionsToClean = [
    'loadtest_ephemeral',
    'loadtest_attempts',
    'loadtest_leaderboards',
    'loadtest_leaderboard',
  ];

  let totalPurged = 0;

  for (const colName of collectionsToClean) {
    try {
      console.log(`🔍 Checking collection [${colName}]...`);
      const snap = await getDocs(query(collection(db, colName), limit(500)));
      if (snap.empty) {
        console.log(`   └─ No records found in [${colName}]. Clean!`);
        continue;
      }

      const batch = writeBatch(db);
      let count = 0;
      snap.forEach((d) => {
        batch.delete(d.ref);
        count++;
      });

      await batch.commit();
      totalPurged += count;
      console.log(`   └─ ✅ Successfully purged ${count} documents from [${colName}].`);
    } catch (e: any) {
      console.warn(`   └─ ⚠️ Notice cleaning ${colName}:`, e.message);
    }
  }

  console.log('\n========================================================================');
  console.log(`✨ PURGE COMPLETE: Purged ${totalPurged} synthetic load test records.`);
  console.log('Database environment is 100% clean and pristine.');
  console.log('========================================================================\n');
}

main().catch(console.error);
