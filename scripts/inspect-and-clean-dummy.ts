import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, doc, deleteDoc, writeBatch } from 'firebase/firestore';
import fs from 'fs';
import path from 'path';

async function main() {
  const configPath = path.resolve(process.cwd(), 'firebase-applet-config.json');
  const fbConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  const app = initializeApp(fbConfig, `cleaner_${Date.now()}`);
  const db = getFirestore(app);

  console.log(`Connected to: ${fbConfig.projectId}`);

  // 1. Inspect batches
  const bSnap = await getDocs(collection(db, 'batches'));
  console.log(`\nFound ${bSnap.size} batches:`);
  bSnap.forEach(d => console.log(` - Batch: ${d.id} | ${d.data()?.title}`));

  // 2. Inspect enrollments
  const eSnap = await getDocs(collection(db, 'batch_enrollments'));
  console.log(`\nFound ${eSnap.size} enrollments:`);
  eSnap.forEach(d => {
    const data = d.data();
    console.log(` - Enrollment: ${d.id} | Name: ${data.studentName} | Email: ${data.studentEmail} | Phone: ${data.studentPhone}`);
  });

  // 3. Inspect test_leaderboards
  const lSnap = await getDocs(collection(db, 'test_leaderboards'));
  console.log(`\nFound ${lSnap.size} leaderboards:`);
  lSnap.forEach(d => console.log(` - LB: ${d.id}`));
}

main().catch(console.error);
