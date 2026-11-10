import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs } from 'firebase/firestore';
import fs from 'fs';

const fbConfig = JSON.parse(fs.readFileSync('Remix-Remix-Remix-Remix-Remix-Remix-Math-Mock-Test-Practice-2026-10-20-0d7ca/firebase-applet-config.json', 'utf8'));
const app = initializeApp(fbConfig);
const db = getFirestore(app);

async function checkAll() {
  const titles = [
    'test_title_complex_numbers_assessment',
    'test-1793856964816',
    'shared_1794286618030_01b3k',
    'test_title_new_matcs_assessment',
    'test-1794287636530',
    'test-1794209339577',
    'test_title_straight_lines_transformation_of_axes_assessment',
    'test-1793116020776'
  ];
  for (const t of titles) {
    const sub = await getDocs(collection(db, 'test_leaderboards', t, 'entries'));
    console.log(t, 'entries count:', sub.size);
    sub.forEach(d => console.log('  ', d.id, d.data().userName, d.data().score));
  }
  process.exit(0);
}
checkAll().catch(err => {
  console.error(err);
  process.exit(1);
});
