import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs } from 'firebase/firestore';
import fs from 'fs';

const cfg = JSON.parse(fs.readFileSync('firebase-applet-config.json', 'utf8'));
const app = initializeApp(cfg);
const db = getFirestore(app);

async function check() {
  const s = await getDocs(collection(db, 'tests'));
  console.log('Live tests in Firestore count:', s.docs.length);
  s.docs.forEach(d => {
    const data = d.data();
    console.log(` - ID: [${d.id}] | Title: "${data.title}" | batchId: [${data.batchId || 'none'}]`);
  });

  const batches = await getDocs(collection(db, 'batches'));
  console.log('\nBatches in Firestore count:', batches.docs.length);
  for (const b of batches.docs) {
    const bData = b.data();
    console.log(`\nBatch: [${b.id}] "${bData.title}"`);
    // Check catalog or tests subcollection
    const cat = await getDocs(collection(db, 'batches', b.id, 'tests')).catch(() => null);
    if (cat && !cat.empty) {
      console.log(`  Tests in subcollection 'tests': ${cat.docs.length}`);
      cat.docs.forEach(td => console.log(`   - [${td.id}] "${td.data().title}"`));
    }
  }
  process.exit(0);
}

check().catch(e => {
  console.error(e);
  process.exit(1);
});
