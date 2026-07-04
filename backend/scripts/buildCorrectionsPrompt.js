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

async function main() {
  const snap = await db.collection('category_corrections')
    .orderBy('totalCorrections', 'desc')
    .limit(50)
    .get();

  const rows = [];
  for (const docSnap of snap.docs) {
    const d = docSnap.data();
    const entries = Object.entries(d.votes || {});
    if (!entries.length) continue;
    entries.sort((a, b) => b[1] - a[1]);
    const [topCat, topVotes] = entries[0];
    rows.push({ name: d.displayName || docSnap.id, topCat, topVotes, total: d.totalCorrections });
  }

  if (rows.length === 0) {
    console.log('No corrections recorded yet.');
    process.exit(0);
  }

  console.log(`\n=== Top ${rows.length} category corrections ===\n`);
  console.log('GPT-4o injection block:\n');
  console.log('Known item corrections — when you identify one of these items, use the noted category:');
  for (const r of rows) {
    console.log(`  "${r.name}" → ${r.topCat} (${r.topVotes} votes, ${r.total} corrections)`);
  }
  console.log('\n=== End of block ===\n');

  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
