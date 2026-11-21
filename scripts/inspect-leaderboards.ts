import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, doc, getDoc } from 'firebase/firestore';
import fs from 'fs';

const cfg = JSON.parse(fs.readFileSync('firebase-applet-config.json', 'utf8'));
const app = initializeApp(cfg);
const db = getFirestore(app);

async function check() {
  console.log('=== TEST LEADERBOARDS COLLECTION ===');
  const lbSnap = await getDocs(collection(db, 'test_leaderboards'));
  console.log(`Found ${lbSnap.docs.length} documents in test_leaderboards:`);
  for (const d of lbSnap.docs) {
    const b1Ref = doc(db, 'test_leaderboards', d.id, 'summary', 'cohort_bucket_1');
    const b1Snap = await getDoc(b1Ref).catch(() => null);
    if (b1Snap && b1Snap.exists()) {
      const bData = b1Snap.data();
      console.log(` - ID: [${d.id}] | Title: "${bData.testTitle}" | Attempts count: ${bData.attempts?.length || 0} | totalParticipants: ${bData.totalParticipants} | totalParts: ${bData.totalParts}`);
    } else {
      console.log(` - ID: [${d.id}] | (no cohort_bucket_1 doc)`);
    }
  }
  process.exit(0);
}

check().catch(console.error);
