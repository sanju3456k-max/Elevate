import { db } from '../src/lib/firebase';
import { doc, setDoc } from 'firebase/firestore';

async function touchBeacon() {
  const now = new Date().toISOString();
  await setDoc(doc(db, 'master_catalog', 'batch_catalog_meta'), {
    lastUpdatedAt: now,
    version: Date.now(),
    updatedBy: 'antigravity-master-sync'
  }, { merge: true });
  console.log('✅ Updated master_catalog/batch_catalog_meta beacon with timestamp:', now);
}

touchBeacon().then(() => process.exit(0)).catch(err => { console.error(err); process.exit(1); });
