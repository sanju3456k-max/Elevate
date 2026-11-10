import { initializeApp } from 'firebase/app';
import { getFirestore, getDocs, collectionGroup } from 'firebase/firestore';
import fs from 'fs';

const fbConfig = JSON.parse(fs.readFileSync('Remix-Remix-Remix-Remix-Remix-Remix-Math-Mock-Test-Practice-2026-10-20-0d7ca/firebase-applet-config.json', 'utf8'));
const app = initializeApp(fbConfig);
const db = getFirestore(app);

async function checkAttempts() {
  const snap = await getDocs(collectionGroup(db, 'attempts'));
  console.log('Total attempts in Firestore:', snap.size);
  const byTest = {};
  snap.forEach(d => {
    const data = d.data();
    const title = (data.testTitle || 'Untitled').trim();
    if (!byTest[title]) byTest[title] = [];
    byTest[title].push({
      user: data.userName || data.userEmail || data.userId,
      userId: data.userId,
      testId: data.testId,
      score: data.score,
      pct: data.percentage,
      time: data.timeSpentSeconds,
      date: data.completedAt
    });
  });
  console.log(JSON.stringify(byTest, null, 2));
  process.exit(0);
}
checkAttempts().catch(err => {
  console.error(err);
  process.exit(1);
});
