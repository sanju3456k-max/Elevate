import { db } from '../src/lib/firebase';
import { doc, getDoc } from 'firebase/firestore';

async function check() {
  const d = await getDoc(doc(db, 'batches', 'batch_testing_01', 'tests', 'test_batch_mock_01'));
  console.log('test_batch_mock_01 exists:', d.exists());
  if (d.exists()) {
    console.log('test data:', JSON.stringify(d.data(), null, 2));
  }
}

check().then(() => process.exit(0)).catch((err) => { console.error(err); process.exit(1); });
