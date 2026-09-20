// Household data backfill — run BEFORE the 6.3 Firestore rules are published.
//
// The new read rule is `request.auth.uid in resource.data.memberUids`, so a household whose memberUids is
// missing or stale would lock its members out. This script:
//   1. recomputes memberUids from members for every household and reports any mismatch
//   2. makes sure every household has a join code (generates an 8-char one if missing)
//   3. reports orphaned household_* subcollection docs (parent id with no households doc)
//   4. reports the household_invites count
//
// DRY RUN by default: it only reads and prints counts. `--apply` performs the fixes:
//   sets memberUids, generates missing codes, and deletes orphaned subcollection docs — but only if there
//   are at most --max-orphan-deletes of them (default 10), so an unexpected pile of orphans is reported, not
//   silently wiped. Idempotent: a second run finds nothing to do. Output is counts only (no ids, names, codes).
//
//   node scripts/backfillHouseholds.js                 # dry run against production (read-only)
//   node scripts/backfillHouseholds.js --apply
import fs from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { writeMembers, generateCode } from '../utils/households.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const maxArg = args.find((a) => a.startsWith('--max-orphan-deletes='));
const MAX_ORPHAN_DELETES = maxArg ? Number(maxArg.split('=')[1]) : 10;

const serviceAccount = JSON.parse(fs.readFileSync(resolve(__dirname, '..', 'serviceAccount.json'), 'utf8'));
initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

const TREES = [
  ['household_pantry', 'items'],
  ['household_recipes', 'recipes'],
  ['household_meal_plan', 'days'],
  ['household_activity', 'events'],
];

const sameSet = (a, b) => a.length === b.length && new Set(a).size === new Set(b).size && a.every((x) => b.includes(x));

async function main() {
  console.log(APPLY ? 'MODE: --apply (writes enabled)' : 'MODE: dry run (read-only)');
  const summary = {
    households: 0, memberUidsMissing: 0, memberUidsStale: 0, membersUnusable: 0, codeMissing: 0,
    invites: 0, orphanParents: 0, orphanDocs: 0,
    fixedMemberUids: 0, generatedCodes: 0, deletedOrphanDocs: 0, orphansSkippedOverCap: false,
  };

  const snap = await db.collection('households').get();
  const ids = new Set(snap.docs.map((d) => d.id));
  summary.households = snap.size;

  for (const d of snap.docs) {
    const h = d.data();
    const update = {};

    if (!Array.isArray(h.members)) {
      summary.membersUnusable++; // cannot derive memberUids from a missing/invalid members array
    } else {
      let computed;
      try { computed = writeMembers(h.members).memberUids; } catch { computed = null; }
      if (computed === null) {
        summary.membersUnusable++;
      } else if (!Array.isArray(h.memberUids)) {
        summary.memberUidsMissing++;
        update.memberUids = computed;
      } else if (!sameSet(h.memberUids, computed)) {
        summary.memberUidsStale++;
        update.memberUids = computed;
      }
    }

    if (typeof h.code !== 'string' || !h.code) {
      summary.codeMissing++;
      if (APPLY) { update.code = await generateCode(db); summary.generatedCodes++; }
    }

    if (APPLY && Object.keys(update).length) {
      await d.ref.update(update);
      if (update.memberUids) summary.fixedMemberUids++;
    }
  }

  summary.invites = (await db.collection('household_invites').select().get()).size;

  const orphans = [];
  for (const [root, sub] of TREES) {
    for (const parent of await db.collection(root).listDocuments()) {
      if (ids.has(parent.id)) continue;
      const n = (await parent.collection(sub).select().get()).size;
      summary.orphanParents++;
      summary.orphanDocs += n;
      orphans.push(parent);
    }
  }
  if (APPLY && orphans.length) {
    if (summary.orphanDocs <= MAX_ORPHAN_DELETES) {
      for (const parent of orphans) await db.recursiveDelete(parent);
      summary.deletedOrphanDocs = summary.orphanDocs;
    } else {
      summary.orphansSkippedOverCap = true;
    }
  }

  console.log(`households scanned:                    ${summary.households}`);
  console.log(`memberUids missing:                    ${summary.memberUidsMissing}`);
  console.log(`memberUids stale/mismatched:           ${summary.memberUidsStale}`);
  console.log(`members array unusable (not fixable):  ${summary.membersUnusable}`);
  console.log(`code missing:                          ${summary.codeMissing}`);
  console.log(`household_invites docs:                ${summary.invites}`);
  console.log(`orphan parents / orphan docs:          ${summary.orphanParents} / ${summary.orphanDocs}`);
  if (APPLY) {
    console.log(`fixed memberUids:                      ${summary.fixedMemberUids}`);
    console.log(`generated codes:                       ${summary.generatedCodes}`);
    console.log(`deleted orphan docs:                   ${summary.deletedOrphanDocs}${summary.orphansSkippedOverCap ? `  (SKIPPED: more than ${MAX_ORPHAN_DELETES}; rerun with --max-orphan-deletes=N)` : ''}`);
  } else {
    const wouldFix = summary.memberUidsMissing + summary.memberUidsStale + summary.codeMissing + summary.orphanDocs;
    console.log(wouldFix ? `\nDry run: ${wouldFix} item(s) would be fixed by --apply.` : '\nDry run: nothing to fix.');
  }
  console.log(`SUMMARY ${JSON.stringify(summary)}`);
}

main().then(() => process.exit(0)).catch((err) => { console.error('backfill failed:', err.code || err.message); process.exit(1); });
