import { initializeApp } from 'firebase/app';
import { getFirestore, collectionGroup, getDocs } from 'firebase/firestore';
import fs from 'fs';

const fbConfig = JSON.parse(fs.readFileSync('Remix-Remix-Remix-Remix-Remix-Remix-Math-Mock-Test-Practice-2026-10-20-0d7ca/firebase-applet-config.json', 'utf8'));
const app = initializeApp(fbConfig);
const db = getFirestore(app);

async function checkAllLeaderboardEntries() {
  const snap = await getDocs(collectionGroup(db, 'entries'));
  console.log('Total entries across all leaderboards in Firestore:', snap.size);
  snap.forEach(d => {
    console.log(`Path: ${d.ref.path}`);
    console.log(`  Data:`, JSON.stringify(d.data()));
  });
  process.exit(0);
}
checkAllLeaderboardEntries().catch(err => {
  console.error(err);
  process.exit(1);
});
