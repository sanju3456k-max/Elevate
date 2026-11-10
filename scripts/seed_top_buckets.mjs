import { initializeApp } from 'firebase/app';
import { getFirestore, doc, getDoc, setDoc } from 'firebase/firestore';
import fs from 'fs';

const fbConfig = JSON.parse(fs.readFileSync('Remix-Remix-Remix-Remix-Remix-Remix-Math-Mock-Test-Practice-2026-10-20-0d7ca/firebase-applet-config.json', 'utf8'));
const app = initializeApp(fbConfig);
const db = getFirestore(app);

async function testBucket() {
  const canonicalId = 'test_title_complex_numbers_assessment';
  const bucketRef = doc(db, 'test_leaderboards', canonicalId, 'summary', 'top_bucket');
  console.log('Writing top_bucket for', canonicalId);

  const entries = [
    {
      userId: 'lALjKP07QqYwTCLChTdgT295P9y1',
      userName: 'Harry Kapoor',
      userEmail: 'harry4444u@gmail.com',
      score: 2,
      totalPoints: 10,
      percentage: 20,
      timeSpentSeconds: 22,
      attemptMode: 'online',
      completedAt: '2026-11-10T04:57:45.793Z',
      rank: 1
    },
    {
      userId: 'B0DeZmlpyGToNoNm9laiTQ3KNqp1',
      userName: 'Sanju Kumar',
      userEmail: 'sanju3456k@gmail.com',
      score: 1,
      totalPoints: 10,
      percentage: 10,
      timeSpentSeconds: 19,
      attemptMode: 'online',
      completedAt: '2026-11-10T04:57:42.370Z',
      rank: 2
    }
  ];

  await setDoc(bucketRef, {
    testId: canonicalId,
    testTitle: 'Complex Numbers Assessment',
    totalParticipants: 2,
    updatedAt: new Date().toISOString(),
    version: 1,
    entries
  }, { merge: true });

  const snap = await getDoc(bucketRef);
  console.log('Read top_bucket successfully:', snap.exists(), snap.data().totalParticipants, 'students');

  // Also write for new matcs assessment
  const matcsId = 'test_title_new_matcs_assessment';
  const matcsRef = doc(db, 'test_leaderboards', matcsId, 'summary', 'top_bucket');
  const matcsEntries = [
    {
      userId: 'lALjKP07QqYwTCLChTdgT295P9y1',
      userName: 'Harry Kapoor',
      userEmail: 'harry4444u@gmail.com',
      score: 1,
      totalPoints: 4,
      percentage: 25,
      timeSpentSeconds: 23,
      attemptMode: 'online',
      completedAt: '2026-11-10T05:14:28.513Z',
      rank: 1
    },
    {
      userId: 'B0DeZmlpyGToNoNm9laiTQ3KNqp1',
      userName: 'Sanju Kumar',
      userEmail: 'sanju3456k@gmail.com',
      score: 0,
      totalPoints: 4,
      percentage: 0,
      timeSpentSeconds: 7,
      attemptMode: 'online',
      completedAt: '2026-11-10T05:14:29.464Z',
      rank: 2
    }
  ];
  await setDoc(matcsRef, {
    testId: matcsId,
    testTitle: 'New Matcs Assessment',
    totalParticipants: 2,
    updatedAt: new Date().toISOString(),
    version: 1,
    entries: matcsEntries
  }, { merge: true });

  console.log('Read new matcs bucket successfully:', (await getDoc(matcsRef)).exists());
  process.exit(0);
}

testBucket().catch(e => { console.error(e); process.exit(1); });
