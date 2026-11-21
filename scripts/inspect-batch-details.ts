import { initializeApp } from 'firebase/app';
import { getFirestore, doc, getDoc, collection, getDocs } from 'firebase/firestore';
import fs from 'fs';

const cfg = JSON.parse(fs.readFileSync('firebase-applet-config.json', 'utf8'));
const app = initializeApp(cfg);
const db = getFirestore(app);

async function check() {
  const batches = ['batch_testing_01', 'batch_1794900009520', 'batch_1794899971089', 'batch_1795010696666'];
  for (const bId of batches) {
    console.log(`\n================ BATCH [${bId}] ================`);
    const bSnap = await getDoc(doc(db, 'batches', bId));
    if (bSnap.exists()) {
      console.log('Batch Title:', bSnap.data().title);
    } else {
      console.log('Batch doc not found in root /batches');
    }

    const testsCol = await getDocs(collection(db, 'batches', bId, 'tests')).catch(() => null);
    if (testsCol && !testsCol.empty) {
      console.log(`Tests count: ${testsCol.docs.length}`);
      testsCol.docs.forEach(t => {
        const d = t.data();
        console.log(` • Test [${t.id}] "${d.title}" - Questions: ${d.questions?.length ?? 0}`);
      });
    } else {
      console.log('No tests found in batches/' + bId + '/tests');
    }

    // Check roster
    const rSnap = await getDoc(doc(db, 'batches', bId, 'access', 'roster')).catch(() => null);
    if (rSnap && rSnap.exists()) {
      const r = rSnap.data();
      console.log(`Roster students: ${Object.keys(r.students || {}).length}, total: ${r.totalStudents}`);
    } else {
      console.log('No roster doc in batches/' + bId + '/access/roster');
    }
  }
  process.exit(0);
}

check().catch(console.error);
