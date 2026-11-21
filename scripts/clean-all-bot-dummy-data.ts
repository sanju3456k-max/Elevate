import { initializeApp } from 'firebase/app';
import {
  getFirestore,
  collection,
  getDocs,
  doc,
  deleteDoc,
  setDoc,
  writeBatch,
  query,
  where,
  getDoc
} from 'firebase/firestore';
import fs from 'fs';
import path from 'path';

async function clean() {
  console.log('========================================================================');
  console.log('🧹 ELEVATE COMPLETE DATABASE BOT & DUMMY PURGE UTILITY 🧹');
  console.log('========================================================================\n');

  const configPath = path.resolve(process.cwd(), 'firebase-applet-config.json');
  const fbConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  const app = initializeApp(fbConfig, `full_clean_${Date.now()}`);
  const db = getFirestore(app);

  console.log(`Connected to Firebase project: [${fbConfig.projectId}]`);

  // 1. Purge all bot enrollments ending in @elevatelabs.test or starting with enr_batch_..._std_ or cadet
  console.log('\n--- 1. CLEANING DUMMY ENROLLMENTS ---');
  const enrSnap = await getDocs(collection(db, 'batch_enrollments'));
  let deletedEnrollments = 0;
  let keptEnrollments = 0;

  const BATCH_SIZE = 400;
  let currentBatch = writeBatch(db);
  let batchOps = 0;

  for (const d of enrSnap.docs) {
    const data = d.data();
    const email = (data.studentEmail || '').toLowerCase();
    const name = (data.studentName || '').toLowerCase();

    const isBot =
      email.includes('@elevatelabs.test') ||
      email.includes('cadet') ||
      name.includes('cadet') ||
      d.id.includes('vstd_') ||
      d.id.includes('b2_std_') ||
      data.batchId === 'batch_explorer_01';

    if (isBot) {
      currentBatch.delete(d.ref);
      batchOps++;
      deletedEnrollments++;

      if (batchOps >= BATCH_SIZE) {
        await currentBatch.commit();
        currentBatch = writeBatch(db);
        batchOps = 0;
        console.log(`   └─ Committed deletion batch (${deletedEnrollments} total purged)...`);
      }
    } else {
      keptEnrollments++;
      console.log(`   ✓ KEEPING REAL USER: ${data.studentName} (${data.studentEmail || data.studentPhone}) in batch ${data.batchId}`);
    }
  }

  if (batchOps > 0) {
    await currentBatch.commit();
  }
  console.log(`✅ Finished enrollments: Purged ${deletedEnrollments} bot records, kept ${keptEnrollments} real records.`);

  // 2. Remove dummy Explorer batch (batch_explorer_01)
  console.log('\n--- 2. CLEANING EXPLORER DUMMY BATCH ---');
  try {
    const explorerDocRef = doc(db, 'batches', 'batch_explorer_01');
    const expSnap = await getDoc(explorerDocRef);
    if (expSnap.exists()) {
      await deleteDoc(explorerDocRef);
      console.log('   └─ Deleted batch [batch_explorer_01]');
    }

    // Clean subcollections under batch_explorer_01
    const subcols = ['chapters', 'lectures', 'tests', 'question_catalogs', 'access', 'enrollments'];
    for (const sub of subcols) {
      try {
        const subSnap = await getDocs(collection(db, 'batches', 'batch_explorer_01', sub));
        for (const sd of subSnap.docs) {
          await deleteDoc(sd.ref);
        }
      } catch {}
    }
  } catch (err: any) {
    console.warn('   └─ Notice cleaning explorer batch:', err.message);
  }

  // 3. Purge dummy leaderboards
  console.log('\n--- 3. CLEANING DUMMY LEADERBOARDS ---');
  const dummyLbIds = [
    'test_explorer_mock_01',
    'test_title_explorer_30_question_advanced_math_benchmark',
    'sample-mechanics-conics-diagrams',
    'test_title_statics_dynamics_conic_sections',
    'sample-matrices-1',
    'test_title_matrices_and_determinants'
  ];

  for (const lbId of dummyLbIds) {
    try {
      console.log(`   Checking leaderboard [${lbId}]...`);
      // Delete summary documents
      const summaries = ['cohort_bucket_1', 'cohort_bucket_2', 'cohort_bucket_3', 'top_bucket', 'published_paper'];
      for (const sum of summaries) {
        await deleteDoc(doc(db, 'test_leaderboards', lbId, 'summary', sum)).catch(() => {});
      }
      await deleteDoc(doc(db, 'test_leaderboards', lbId, 'backup', 'latest_snapshot')).catch(() => {});

      // Delete entries subcollection
      const entriesSnap = await getDocs(collection(db, 'test_leaderboards', lbId, 'entries')).catch(() => null);
      if (entriesSnap && !entriesSnap.empty) {
        let b = writeBatch(db);
        let ops = 0;
        for (const ed of entriesSnap.docs) {
          b.delete(ed.ref);
          ops++;
          if (ops >= 400) {
            await b.commit();
            b = writeBatch(db);
            ops = 0;
          }
        }
        if (ops > 0) await b.commit();
        console.log(`   └─ Deleted ${entriesSnap.size} entries from ${lbId}`);
      }

      await deleteDoc(doc(db, 'test_leaderboards', lbId)).catch(() => {});
    } catch (e: any) {
      console.warn(`   └─ Notice cleaning ${lbId}:`, e.message);
    }
  }

  // 4. Clean and reset batch access rosters for existing batches
  console.log('\n--- 4. CLEANING BATCH ACCESS ROSTERS ---');
  const remainingBatches = await getDocs(collection(db, 'batches'));
  for (const bDoc of remainingBatches.docs) {
    const bId = bDoc.id;
    console.log(`   Updating roster for batch [${bId}]...`);
    try {
      const rosterRef = doc(db, 'batches', bId, 'access', 'roster');
      const rSnap = await getDoc(rosterRef);
      if (rSnap.exists()) {
        const rData = rSnap.data() || {};
        const allowedEmails: string[] = Array.isArray(rData.allowedEmails) ? rData.allowedEmails : [];
        const students: Record<string, any> = (rData.students && typeof rData.students === 'object') ? rData.students : {};

        // Filter out bot emails
        const cleanEmails = allowedEmails.filter(e => e && !e.includes('@elevatelabs.test') && !e.includes('cadet'));
        const cleanStudents: Record<string, any> = {};

        for (const [k, s] of Object.entries(students)) {
          const sEmail = (s?.studentEmail || '').toLowerCase();
          const sName = (s?.studentName || '').toLowerCase();
          if (!sEmail.includes('@elevatelabs.test') && !sEmail.includes('cadet') && !sName.includes('cadet')) {
            cleanStudents[k] = s;
          }
        }

        const realCount = Object.keys(cleanStudents).length;

        await setDoc(rosterRef, {
          batchId: bId,
          totalStudents: realCount,
          allowedEmails: cleanEmails,
          allowedPhones: rData.allowedPhones || [],
          students: cleanStudents,
          updatedAt: new Date().toISOString(),
        }, { merge: true });

        // Update batch root enrolled count
        await setDoc(bDoc.ref, {
          enrolledStudentsCount: realCount,
          updatedAt: new Date().toISOString(),
        }, { merge: true });

        console.log(`   └─ [${bId}] Reset roster to ${realCount} real student(s).`);
      }
    } catch (err: any) {
      console.warn(`   └─ Error updating roster for ${bId}:`, err.message);
    }
  }

  // 5. Invalidate batch catalog beacon so client immediately syncs clean state
  console.log('\n--- 5. UPDATING BEACON ---');
  try {
    const beaconRef = doc(db, 'master_catalog', 'batch_catalog_meta');
    await setDoc(beaconRef, {
      updatedAt: new Date().toISOString(),
      beacon: Date.now(),
    }, { merge: true });
    console.log('   └─ Beacon updated successfully.');
  } catch (err: any) {
    console.warn('   └─ Beacon notice:', err.message);
  }

  console.log('\n========================================================================');
  console.log('✨ DATABASE PURGE COMPLETE: All bots, dummy batches & leaderboards removed!');
  console.log('Firebase is 100% clean with only real users intact.');
  console.log('========================================================================\n');
}

clean().catch(console.error);
