import { initializeApp } from 'firebase/app';
import { getFirestore, doc, getDoc } from 'firebase/firestore';
import fs from 'fs';

const fbConfig = JSON.parse(fs.readFileSync('firebase-applet-config.json', 'utf8'));
const app = initializeApp(fbConfig);
const db = getFirestore(app);

async function check() {
  const ids = ['test_explorer_mock_01', 'test_title_explorer_30_question_advanced_math_benchmark'];
  for (const id of ids) {
    const metaSnap = await getDoc(doc(db, 'test_leaderboards', id, 'summary', 'metadata'));
    console.log(id, 'metadata exists:', metaSnap.exists(), metaSnap.data());
    const b1Snap = await getDoc(doc(db, 'test_leaderboards', id, 'summary', 'cohort_bucket_1'));
    if (b1Snap.exists()) {
      const data = b1Snap.data();
      console.log(id, 'bucket_1 entries:', data.entries?.length, 'attempts:', data.attempts?.length, 'totalParticipants:', data.totalParticipants);
    } else {
      console.log(id, 'bucket_1 not found');
    }
    const b2Snap = await getDoc(doc(db, 'test_leaderboards', id, 'summary', 'cohort_bucket_2'));
    console.log(id, 'bucket_2 exists:', b2Snap.exists(), 'count:', b2Snap.data()?.entries?.length);
    const b3Snap = await getDoc(doc(db, 'test_leaderboards', id, 'summary', 'cohort_bucket_3'));
    console.log(id, 'bucket_3 exists:', b3Snap.exists(), 'count:', b3Snap.data()?.entries?.length);
  }
}
check().then(() => process.exit(0)).catch(err => { console.error(err); process.exit(1); });
