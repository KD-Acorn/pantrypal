import fs from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { contentSafetyCheck, inferCategory } from '../utils/catalogClassifier.js';
import { getUsage, recordUsage, wouldExceedSafetyCap, MONTHLY_LIMIT, SAFETY_CAP } from './tastyQuota.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, '..', '..', '.env') });

const serviceAccount = JSON.parse(
  fs.readFileSync(resolve(__dirname, '..', 'serviceAccount.json'), 'utf8')
);
initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY;
if (!RAPIDAPI_KEY) { console.error('[FoodSeed] RAPIDAPI_KEY not set'); process.exit(1); }

// Confirmed tag slugs via GET tasty.p.rapidapi.com/tags/list on 2026-07-04.
// Shared Tasty quota with seedBeverages.js — both draw from the same 500/month pool.
const FOOD_TAGS = [
  { slug: 'dinner',     label: 'Dinner' },
  { slug: 'lunch',      label: 'Lunch' },
  { slug: 'breakfast',  label: 'Breakfast' },
  { slug: 'desserts',   label: 'Desserts' },
  { slug: 'appetizers', label: 'Appetizers' },
  { slug: 'sides',      label: 'Sides' },
  { slug: 'weeknight',  label: 'Weeknight' },
];

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function parseRecipe(recipe) {
  const ingredients = (recipe.sections || []).flatMap(s =>
    (s.components || []).map(c => ({
      amount: c.measurements?.[0]?.quantity ? parseFloat(c.measurements[0].quantity) || 1 : 1,
      unit: c.measurements?.[0]?.unit?.name || 'item',
      name: (c.ingredient?.name || '').toLowerCase().trim(),
    })).filter(i => i.name)
  );
  const steps = (recipe.instructions || []).map(s => s.display_text).filter(Boolean);
  const totalMins = recipe.total_time_minutes || recipe.prep_time_minutes || 30;
  return {
    title: recipe.name,
    description: (recipe.description || '').slice(0, 200),
    cookTime: `${totalMins} min`,
    difficulty: totalMins <= 20 ? 'Easy' : totalMins <= 45 ? 'Medium' : 'Hard',
    cuisine: inferCategory(recipe, 'recipe', 'International'),
    baseServings: recipe.num_servings || 4,
    ingredients, steps,
    thumbnail: recipe.thumbnail_url || null,
    tags: (recipe.tags || []).map(t => t.name).filter(Boolean),
  };
}

async function main() {
  console.log('[FoodSeed] ──────────────────────────────────────────');
  console.log('[FoodSeed] Tasty Food Catalog Seed');
  console.log('[FoodSeed] ──────────────────────────────────────────');

  const usage = getUsage();
  console.log(`[FoodSeed] Tasty usage this month: ${usage.requestsUsed}/${MONTHLY_LIMIT} (safety cap: ${SAFETY_CAP})`);
  console.log(`[FoodSeed] Tags: ${FOOD_TAGS.map(t => t.slug).join(', ')}\n`);

  let saved = 0, skippedDuplicates = 0, skippedFiltered = 0, skippedMissingData = 0, requestsThisRun = 0;

  for (const { slug } of FOOD_TAGS) {
    if (wouldExceedSafetyCap(1)) {
      const rem = MONTHLY_LIMIT - getUsage().requestsUsed;
      console.log(`\n[FoodSeed] Stopping — would exceed safety cap (${SAFETY_CAP}/${MONTHLY_LIMIT} used this month). Remaining: ${rem}. Resume next month or raise the cap manually.`);
      break;
    }

    console.log(`[FoodSeed] ── Tag: "${slug}"`);
    let from = 0, hasMore = true;

    while (hasMore) {
      if (wouldExceedSafetyCap(1)) {
        const rem = MONTHLY_LIMIT - getUsage().requestsUsed;
        console.log(`\n[FoodSeed] Safety cap reached mid-tag. Remaining: ${rem}. Resume next month.`);
        hasMore = false; break;
      }

      try {
        const resp = await fetch(
          `https://tasty.p.rapidapi.com/recipes/list?from=${from}&size=20&tags=${encodeURIComponent(slug)}`,
          { headers: { 'x-rapidapi-host': 'tasty.p.rapidapi.com', 'x-rapidapi-key': RAPIDAPI_KEY } }
        );
        requestsThisRun++;
        recordUsage('food', 1);

        if (resp.status === 429 || resp.status === 402) {
          console.log(`\n[FoodSeed] Tasty quota exhausted (HTTP ${resp.status}). Resume tomorrow.`);
          hasMore = false; break;
        }
        if (!resp.ok) {
          console.error(`[FoodSeed] HTTP ${resp.status} for tag="${slug}" from=${from}`);
          hasMore = false; break;
        }

        const data = await resp.json();
        const results = data.results || [];
        if (results.length === 0) { hasMore = false; break; }

        for (const recipe of results) {
          if (!recipe.name || !recipe.id) {
            skippedMissingData++;
            console.log(`[FoodSeed] Skipped [missing data]: (no name/id)`);
            continue;
          }

          const safetyReason = contentSafetyCheck(recipe, 'recipe');
          if (safetyReason) {
            skippedFiltered++;
            console.log(`[FoodSeed] Skipped [${safetyReason}]: ${recipe.name}`);
            continue;
          }

          const docId = `tst_${recipe.id}`;
          const existing = await db.collection('recipe_catalog').doc(docId).get();
          if (existing.exists) {
            skippedDuplicates++;
            console.log(`[FoodSeed] Skipped [duplicate]: ${recipe.name}`);
            continue;
          }

          const parsed = parseRecipe(recipe);
          if (!parsed.ingredients.length || !parsed.steps.length) {
            skippedMissingData++;
            console.log(`[FoodSeed] Skipped [missing data]: ${recipe.name} (no ingredients or steps)`);
            continue;
          }

          const indexedIngredients = parsed.ingredients.map(i => i.name).filter(Boolean);
          await db.collection('recipe_catalog').doc(docId).set({
            id: docId, source: 'tasty', spoonacularId: null, mealDbId: null, tastyId: String(recipe.id),
            title: parsed.title, description: parsed.description,
            cookTime: parsed.cookTime, difficulty: parsed.difficulty, cuisine: parsed.cuisine,
            baseServings: parsed.baseServings,
            ingredients: parsed.ingredients, indexedIngredients, steps: parsed.steps,
            thumbnail: parsed.thumbnail, tags: parsed.tags,
            fetchedAt: FieldValue.serverTimestamp(), useCount: 0,
            nutrition: null, sourceUrl: null,
            avgRating: 0, ratingCount: 0, sourceData: {},
          });
          saved++;
          console.log(`[FoodSeed] Saved [${parsed.cuisine}]: ${parsed.title}`);
          await sleep(50);
        }

        console.log(`[FoodSeed] tag=${slug} from=${from}: ${results.length} results, run-req=${requestsThisRun}, saved=${saved}, dupes=${skippedDuplicates}, filtered=${skippedFiltered}`);
        from += 20;
        hasMore = results.length === 20;
        await sleep(250);
      } catch (err) {
        console.error(`[FoodSeed] Error tag="${slug}" from=${from}:`, err.message);
        hasMore = false;
      }
    }
  }

  const finalUsage = getUsage();
  console.log('\n[FoodSeed] ──────────────────────────────────────────');
  console.log('[FoodSeed] Complete!');
  console.log(`[FoodSeed] Done. Saved: ${saved}, Skipped (duplicate): ${skippedDuplicates}, Skipped (filtered): ${skippedFiltered}, Missing data: ${skippedMissingData}`);
  console.log(`[FoodSeed] Tasty requests this run: ${requestsThisRun}`);
  console.log(`[FoodSeed] Tasty monthly total: ${finalUsage.requestsUsed}/${MONTHLY_LIMIT}`);
  console.log('[FoodSeed] ──────────────────────────────────────────');
  process.exit(0);
}

main().catch(err => { console.error('[FoodSeed] Fatal:', err); process.exit(1); });
