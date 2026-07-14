import fs from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, '..', '..', '.env') });

const serviceAccount = JSON.parse(
  fs.readFileSync(resolve(__dirname, '..', 'serviceAccount.json'), 'utf8')
);
initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

const SAVORY_PATTERNS = [
  'burger', 'nacho', 'pizza', 'dumpling', 'empanada', 'casserole',
  'stuffed bun', 'chicken wing', 'buffalo wing', 'wings', 'pot roast',
  'roast chicken', 'roast beef', 'roast pork', 'steak', 'potato stacker',
  'onion ring', 'deviled egg', 'enchilada', 'baked ham', 'glazed ham',
];

async function main() {
  const snap = await db.collection('beverage_catalog').get();
  const flagged = [];

  for (const d of snap.docs) {
    const data = d.data();
    const title = (data.title || '').toLowerCase();
    const matchedPattern = SAVORY_PATTERNS.find(p => title.includes(p));
    if (matchedPattern) {
      flagged.push({ id: d.id, title: data.title, category: data.category, source: data.source, matched: matchedPattern });
    }
  }

  console.log(`\nScanned ${snap.size} beverage_catalog docs.`);

  if (!flagged.length) {
    console.log('No savory-food items found. Catalog looks clean.\n');
    process.exit(0);
  }

  console.log(`\nFlagged ${flagged.length} item(s) for review — delete via Admin Drinks browser:\n`);
  console.log('ID'.padEnd(30), 'Category'.padEnd(12), 'Source'.padEnd(12), 'Title');
  console.log('-'.repeat(90));
  for (const r of flagged) {
    console.log(r.id.padEnd(30), (r.category || '?').padEnd(12), (r.source || '?').padEnd(12), r.title);
  }
  console.log('');

  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
