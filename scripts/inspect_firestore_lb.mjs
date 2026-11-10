import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, doc, getDoc } from 'firebase/firestore';
import fs from 'fs';

const fbConfig = JSON.parse(fs.readFileSync('Remix-Remix-Remix-Remix-Remix-Remix-Math-Mock-Test-Practice-2026-10-20-0d7ca/firebase-applet-config.json', 'utf8'));
const app = initializeApp(fbConfig);
const db = getFirestore(app);

async function inspect() {
  console.log('Inspecting test_leaderboards in Firestore...');
  try {
    const rootSnap = await getDocs(collection(db, 'test_leaderboards'));
    console.log('test_leaderboards root docs count:', rootSnap.size);
    for (const d of rootSnap.docs) {
      console.log('Document ID:', d.id, 'data:', d.data());
      // Check subcollection entries
      try {
        const subSnap = await getDocs(collection(db, 'test_leaderboards', d.id, 'entries'));
        console.log(`  -> subcollection entries count for ${d.id}:`, subSnap.size);
        subSnap.forEach(s => console.log('     ', s.id, '=>', s.data()));
      } catch (subErr) {
        console.log(`  -> subcollection entries error for ${d.id}:`, subErr.message);
      }
    }
  } catch (err) {
    console.error('Error querying test_leaderboards root:', err.message, err.code);
  }

  // Also check specific known IDs directly
  const testIds = [
    'test-1793856964816',
    'shared_1794286618030_01b3k',
    'test_title_complex_numbers_assessment',
    'test_title_straight_lines_transformation_of_axes_assessment'
  ];

  for (const tid of testIds) {
    console.log('\nChecking directly for testId:', tid);
    try {
      const docSnap = await getDoc(doc(db, 'test_leaderboards', tid));
      console.log(`  doc exists:`, docSnap.exists(), docSnap.data());
    } catch (e) {
      console.log(`  doc getDoc error:`, e.message, e.code);
    }

    try {
      const sub = await getDocs(collection(db, 'test_leaderboards', tid, 'entries'));
      console.log(`  subcollection entries count:`, sub.size);
      sub.forEach(s => console.log('     ', s.id, '=>', s.data()));
    } catch (e) {
      console.log(`  subcollection getDocs error:`, e.message, e.code);
    }
  }
  process.exit(0);
}

inspect().catch(err => {
  console.error('Inspect fatal error:', err);
  process.exit(1);
});
