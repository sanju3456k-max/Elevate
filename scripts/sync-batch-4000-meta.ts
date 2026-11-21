import { db } from '../src/lib/firebase';
import { doc, setDoc, updateDoc } from 'firebase/firestore';

async function sync() {
  console.log('Synchronizing batch metadata for batch_testing_01...');
  
  // 1. Batch metadata
  await setDoc(doc(db, 'batches', 'batch_testing_01'), {
    enrolledStudentsCount: 4000,
    title: 'Testing Batch',
    updatedAt: new Date().toISOString()
  }, { merge: true });
  console.log('✅ batches/batch_testing_01 enrolledStudentsCount set to 4000');

  // 2. Roster document
  await setDoc(doc(db, 'batches', 'batch_testing_01', 'access', 'roster'), {
    totalStudents: 4000,
    totalReported: 4000,
    updatedAt: new Date().toISOString()
  }, { merge: true });
  console.log('✅ batches/batch_testing_01/access/roster totalStudents & totalReported set to 4000');

  // 3. Ensure test has batchId and title
  await setDoc(doc(db, 'batches', 'batch_testing_01', 'tests', 'test_batch_mock_01'), {
    batchId: 'batch_testing_01',
    id: 'test_batch_mock_01',
    testId: 'test_batch_mock_01',
    title: 'Curriculum Chapter Assessment',
    isPublic: true,
    updatedAt: new Date().toISOString()
  }, { merge: true });
  console.log('✅ batches/batch_testing_01/tests/test_batch_mock_01 updated with batchId');

  // 4. Ensure catalog manifest includes test_batch_mock_01
  await setDoc(doc(db, 'batches', 'batch_testing_01', 'catalog', 'manifest'), {
    batchId: 'batch_testing_01',
    tests: [
      {
        id: 'test_batch_mock_01',
        testId: 'test_batch_mock_01',
        title: 'Curriculum Chapter Assessment',
        batchId: 'batch_testing_01',
        questionCount: 20,
        timeLimitMinutes: 25,
        durationMinutes: 25,
        topic: 'General Mathematics',
        difficulty: 'Medium',
        publishedAt: new Date().toISOString()
      }
    ],
    updatedAt: new Date().toISOString()
  }, { merge: true });
  console.log('✅ batches/batch_testing_01/catalog/manifest updated with test_batch_mock_01');
}

sync().then(() => {
  console.log('All metadata successfully synchronized.');
  process.exit(0);
}).catch(err => {
  console.error('Sync error:', err);
  process.exit(1);
});
