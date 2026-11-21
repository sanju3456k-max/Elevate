import { initializeApp } from 'firebase/app';
import { getFirestore, doc, getDoc } from 'firebase/firestore';
import fs from 'fs';

const cfg = JSON.parse(fs.readFileSync('firebase-applet-config.json', 'utf8'));
const app = initializeApp(cfg);
const db = getFirestore(app);

async function check() {
  const ids = [
    'test_batch_mock_01',
    'test-1794902920979-1ga6z',
    'test_title_curriculum_chapter_assessment',
    'test_title_3d_geometry_vectors_complex_numbers',
    'canonical_test_batch_stress_01'
  ];

  for (const id of ids) {
    console.log(`\nChecking leaderboard ID: [${id}]`);
    const c1Ref = doc(db, 'test_leaderboards', id, 'summary', 'cohort_bucket_1');
    const c1Snap = await getDoc(c1Ref).catch(() => null);
    if (c1Snap && c1Snap.exists()) {
      const d = c1Snap.data();
      console.log(` ✅ EXISTS: attempts=${d.attempts?.length}, totalParticipants=${d.totalParticipants}, totalParts=${d.totalParts}, testTitle="${d.testTitle}"`);
    } else {
      console.log(` ❌ Does NOT exist`);
    }
  }
  process.exit(0);
}

check().catch(console.error);
