import fs from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { contentSafetyCheck, hasDrinkSignal, inferCategory, SAVORY_PATTERNS } from '../utils/catalogClassifier.js';
import { getUsage, recordUsage, wouldExceedSafetyCap, getTagOffset, setTagOffset, MONTHLY_LIMIT, SAFETY_CAP } from './tastyQuota.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, '..', '..', '.env') });

const serviceAccount = JSON.parse(
  fs.readFileSync(resolve(__dirname, '..', 'serviceAccount.json'), 'utf8')
);
initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY;
const SPOONACULAR_KEY = process.env.SPOONACULAR_API_KEY;

// Confirmed tag slugs via GET /tags/list on 2026-07-04:
//   smoothies_smoothie_bowls → "Smoothies & Smoothie Bowls"
//   shakes                   → "Shakes" (no 'milkshakes' tag exists)
//   juices                   → "Juices"
//   beverages                → "Beverages" (breakfast category — mixed, needs drink-signal gate)
const TASTY_TAGS = [
  { slug: 'smoothies_smoothie_bowls', defaultCat: 'smoothie',  requireDrinkSignal: false },
  { slug: 'shakes',                   defaultCat: 'milkshake', requireDrinkSignal: true  },
  { slug: 'juices',                   defaultCat: 'juice',     requireDrinkSignal: false },
  { slug: 'beverages',                defaultCat: 'smoothie',  requireDrinkSignal: true  },
];

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function parseTastyRecipe(recipe, category) {
  const ingredients = (recipe.sections || []).flatMap(s =>
    (s.components || []).map(c => ({
      amount: c.measurements?.[0]?.quantity ? parseFloat(c.measurements[0].quantity) || 1 : 1,
      unit: c.measurements?.[0]?.unit?.name || 'item',
      name: (c.ingredient?.name || '').toLowerCase().trim(),
    })).filter(i => i.name)
  );
  const steps = (recipe.instructions || []).map(s => s.display_text).filter(Boolean);
  return {
    title: recipe.name,
    category,
    description: (recipe.description || '').slice(0, 200),
    prepTime: recipe.prep_time_minutes ? `${recipe.prep_time_minutes} min`
      : recipe.total_time_minutes ? `${recipe.total_time_minutes} min` : '10 min',
    difficulty: 'Easy',
    baseServings: recipe.num_servings || 1,
    ingredients, steps,
    thumbnail: recipe.thumbnail_url || null,
    tags: (recipe.tags || []).map(t => t.name).filter(Boolean),
  };
}

// Saves a Tasty recipe that failed the beverage check to recipe_catalog instead.
// Returns true if saved, false if already exists or missing required data.
async function saveToRecipeCatalog(recipe) {
  const docId = `tst_${recipe.id}`;
  const existing = await db.collection('recipe_catalog').doc(docId).get();
  if (existing.exists) return false;
  const ingredients = (recipe.sections || []).flatMap(s =>
    (s.components || []).map(c => ({
      amount: c.measurements?.[0]?.quantity ? parseFloat(c.measurements[0].quantity) || 1 : 1,
      unit: c.measurements?.[0]?.unit?.name || 'item',
      name: (c.ingredient?.name || '').toLowerCase().trim(),
    })).filter(i => i.name)
  );
  const steps = (recipe.instructions || []).map(s => s.display_text).filter(Boolean);
  if (!ingredients.length || !steps.length) return false;
  const totalMins = recipe.total_time_minutes || recipe.prep_time_minutes || 30;
  await db.collection('recipe_catalog').doc(docId).set({
    id: docId, source: 'tasty', spoonacularId: null, mealDbId: null, tastyId: String(recipe.id),
    title: recipe.name, description: (recipe.description || '').slice(0, 200),
    cookTime: `${totalMins} min`,
    difficulty: totalMins <= 20 ? 'Easy' : totalMins <= 45 ? 'Medium' : 'Hard',
    cuisine: inferCategory(recipe, 'recipe', 'International'),
    baseServings: recipe.num_servings || 4,
    ingredients, indexedIngredients: ingredients.map(i => i.name).filter(Boolean), steps,
    thumbnail: recipe.thumbnail_url || null,
    tags: (recipe.tags || []).map(t => t.name).filter(Boolean),
    fetchedAt: FieldValue.serverTimestamp(), useCount: 0,
    nutrition: null, sourceUrl: null, avgRating: 0, ratingCount: 0, sourceData: {},
  });
  return true;
}

// ── Primary: Tasty API via RapidAPI ──────────────────────────────────────────
async function seedFromTasty() {
  if (!RAPIDAPI_KEY) {
    console.log('\n[BevSeed]  RAPIDAPI_KEY not found in .env');
    console.log('[BevSeed] Setup steps:');
    console.log('[BevSeed]   1. Sign up at https://rapidapi.com (free)');
    console.log('[BevSeed]   2. Search for "Tasty" and subscribe to the free tier');
    console.log('[BevSeed]   3. Add to backend/.env:  RAPIDAPI_KEY=your_key_here');
    console.log('[BevSeed]   5. Rerun this script — falls through to Spoonacular until key is added\n');
    return { saved: 0, skippedDuplicates: 0, skippedFiltered: 0, skippedMissingData: 0, requestsUsed: 0, apiMissing: true, quotaHit: false };
  }

  const usage = getUsage();
  console.log(`[BevSeed] Tasty usage this month: ${usage.requestsUsed}/${MONTHLY_LIMIT} (safety cap: ${SAFETY_CAP})`);
  console.log(`[BevSeed] Tags: ${TASTY_TAGS.map(t => t.slug).join(', ')}\n`);

  let saved = 0, savedToFood = 0, skippedDuplicates = 0, skippedFiltered = 0, skippedMissingData = 0, requestsThisRun = 0;

  for (const { slug, defaultCat, requireDrinkSignal } of TASTY_TAGS) {
    if (wouldExceedSafetyCap(1)) {
      const rem = MONTHLY_LIMIT - getUsage().requestsUsed;
      console.log(`\n[BevSeed] Stopping — would exceed safety cap (${SAFETY_CAP}/${MONTHLY_LIMIT} used this month). Remaining: ${rem} requests. Resume next month or raise the cap manually.`);
      return { saved, savedToFood, skippedDuplicates, skippedFiltered, skippedMissingData, requestsUsed: requestsThisRun, quotaHit: true };
    }

    const resumeFrom = getTagOffset(slug);
    console.log(`[BevSeed] ── Tag: "${slug}" (default category: ${defaultCat}, resuming from offset ${resumeFrom})`);
    let from = resumeFrom, hasMore = true;

    while (hasMore) {
      if (wouldExceedSafetyCap(1)) {
        const rem = MONTHLY_LIMIT - getUsage().requestsUsed;
        console.log(`\n[BevSeed] Stopping mid-tag — safety cap reached. Remaining: ${rem}. Resume next month.`);
        return { saved, savedToFood, skippedDuplicates, skippedFiltered, skippedMissingData, requestsUsed: requestsThisRun, quotaHit: true };
      }

      try {
        const resp = await fetch(
          `https://tasty.p.rapidapi.com/recipes/list?from=${from}&size=20&tags=${encodeURIComponent(slug)}`,
          { headers: { 'x-rapidapi-host': 'tasty.p.rapidapi.com', 'x-rapidapi-key': RAPIDAPI_KEY } }
        );
        requestsThisRun++;
        recordUsage('beverages', 1);

        if (resp.status === 429 || resp.status === 402) {
          console.log(`\n[BevSeed] Tasty quota exhausted (HTTP ${resp.status}). Resume tomorrow.`);
          return { saved, skippedDuplicates, skippedFiltered, skippedMissingData, requestsUsed: requestsThisRun, quotaHit: true };
        }
        if (!resp.ok) {
          console.error(`[BevSeed] HTTP ${resp.status} for tag="${slug}" from=${from}`);
          hasMore = false; break;
        }

        const data = await resp.json();
        const results = data.results || [];
        if (results.length === 0) { hasMore = false; break; } // offset already persisted from previous iteration

        for (const recipe of results) {
          if (!recipe.name || !recipe.id) {
            skippedMissingData++;
            console.log(`[BevSeed] Skipped [missing data]: (no name/id)`);
            continue;
          }

          const safetyReason = contentSafetyCheck(recipe, 'beverage');
          if (safetyReason) {
            const isSavory = SAVORY_PATTERNS.some(p => (recipe.name || '').toLowerCase().includes(p));
            if (isSavory && !contentSafetyCheck(recipe, 'recipe')) {
              const moved = await saveToRecipeCatalog(recipe);
              if (moved) {
                savedToFood++;
                console.log(`[BevSeed] Moved to Food Catalog: ${recipe.name}`);
              } else {
                skippedDuplicates++;
                console.log(`[BevSeed] Skipped [duplicate in food catalog]: ${recipe.name}`);
              }
            } else {
              skippedFiltered++;
              console.log(`[BevSeed] Skipped [non-beverage]: ${recipe.name}`);
            }
            continue;
          }

          if (requireDrinkSignal && !hasDrinkSignal(recipe)) {
            skippedFiltered++;
            console.log(`[BevSeed] Skipped [not drink-like]: ${recipe.name}`);
            continue;
          }

          const docId = `tasty_${recipe.id}`;
          const existing = await db.collection('beverage_catalog').doc(docId).get();
          if (existing.exists) {
            skippedDuplicates++;
            console.log(`[BevSeed] Skipped [duplicate]: ${recipe.name}`);
            continue;
          }

          const category = inferCategory(recipe, 'beverage', defaultCat);
          const parsed = parseTastyRecipe(recipe, category);

          if (!parsed.ingredients.length || !parsed.steps.length) {
            skippedMissingData++;
            console.log(`[BevSeed] Skipped [missing data]: ${recipe.name} (no ingredients or steps)`);
            continue;
          }

          const indexedIngredients = parsed.ingredients.map(i => i.name).filter(Boolean);
          await db.collection('beverage_catalog').doc(docId).set({
            id: docId, source: 'tasty', tastyId: String(recipe.id), cocktailDbId: null,
            title: parsed.title, category: parsed.category,
            description: parsed.description, prepTime: parsed.prepTime,
            difficulty: parsed.difficulty, baseServings: parsed.baseServings,
            ingredients: parsed.ingredients, indexedIngredients, steps: parsed.steps,
            thumbnail: parsed.thumbnail, tags: parsed.tags,
            isAlcoholic: false, abv: null, glassType: null, garnish: null,
            fetchedAt: FieldValue.serverTimestamp(), useCount: 0, avgRating: 0, ratingCount: 0,
          });
          saved++;
          console.log(`[BevSeed] Saved [${category}]: ${parsed.title}`);
          await sleep(50);
        }

        console.log(`[BevSeed] tag=${slug} from=${from}: ${results.length} results, run-req=${requestsThisRun}, saved=${saved}, toFood=${savedToFood}, dupes=${skippedDuplicates}, filtered=${skippedFiltered}`);
        from += 20;
        setTagOffset(slug, from); // persist after every page — never reset within the month
        hasMore = results.length === 20;
        await sleep(250);
      } catch (err) {
        console.error(`[BevSeed] Error for tag="${slug}" from=${from}:`, err.message);
        hasMore = false;
      }
    }
  }

  return { saved, savedToFood, skippedDuplicates, skippedFiltered, skippedMissingData, requestsUsed: requestsThisRun, quotaHit: false };
}

// ── Fallback: Spoonacular beverage queries ────────────────────────────────────
async function seedFromSpoonacular() {
  if (!SPOONACULAR_KEY) {
    console.log('[BevSeed] SPOONACULAR_API_KEY not set — skipping Spoonacular fallback');
    return { saved: 0, skippedDuplicates: 0, pointsUsed: 0 };
  }
  console.log('\n[BevSeed] Spoonacular fallback — smoothies/juices/milkshakes only');

  const queries = ['smoothie', 'fresh juice', 'milkshake', 'fruit smoothie', 'green smoothie', 'protein shake'];
  let saved = 0, skippedDuplicates = 0, pointsUsed = 0;

  for (const q of queries) {
    if (pointsUsed >= 30) { console.log('[BevSeed] Spoonacular point limit hit — stopping fallback'); break; }
    try {
      const url = `https://api.spoonacular.com/recipes/complexSearch?query=${encodeURIComponent(q)}&type=drink&number=10&addRecipeInformation=true&apiKey=${SPOONACULAR_KEY}`;
      const resp = await fetch(url);
      if (resp.status === 402) { console.log('[BevSeed] Spoonacular daily quota exhausted. Resume tomorrow.'); break; }
      if (!resp.ok) { console.error(`[BevSeed] Spoonacular ${resp.status} for "${q}"`); continue; }
      const data = await resp.json();
      pointsUsed++;

      for (const r of (data.results || [])) {
        const docId = `sp_bev_${r.id}`;
        const existing = await db.collection('beverage_catalog').doc(docId).get();
        if (existing.exists) {
          skippedDuplicates++;
          console.log(`[BevSeed] Skipped [duplicate]: ${r.title}`);
          continue;
        }

        const safetyReason = contentSafetyCheck(r, 'beverage');
        if (safetyReason) {
          console.log(`[BevSeed] Skipped [non-beverage]: ${r.title}`);
          continue;
        }

        const category = inferCategory(r, 'beverage', 'smoothie');
        const mins = r.readyInMinutes || 10;
        const ingredients = (r.extendedIngredients || []).map(ing => ({
          amount: Math.round((ing.amount || 1) * 100) / 100,
          unit: ing.unit || 'item', name: (ing.name || '').toLowerCase(),
        })).filter(i => i.name);
        const steps = r.analyzedInstructions?.[0]?.steps?.map(s => s.step) || ['Blend all ingredients until smooth.'];
        if (!ingredients.length) {
          console.log(`[BevSeed] Skipped [missing data]: ${r.title} (no ingredients)`);
          continue;
        }

        await db.collection('beverage_catalog').doc(docId).set({
          id: docId, source: 'spoonacular', spoonacularId: r.id, cocktailDbId: null,
          title: r.title, category,
          description: ((r.summary || '').replace(/<[^>]*>/g, '').slice(0, 200)),
          prepTime: `${mins} min`, difficulty: 'Easy', baseServings: r.servings || 2,
          ingredients, indexedIngredients: ingredients.map(i => i.name),
          steps, thumbnail: r.image || null,
          tags: [...(r.cuisines || []), ...(r.dishTypes || [])],
          isAlcoholic: false, abv: null, glassType: null, garnish: null,
          fetchedAt: FieldValue.serverTimestamp(), useCount: 0, avgRating: 0, ratingCount: 0,
        });
        saved++;
        console.log(`[BevSeed] Spoonacular saved [${category}]: ${r.title}`);
        await sleep(150);
      }
    } catch (err) {
      console.error(`[BevSeed] Spoonacular error for "${q}":`, err.message);
    }
  }
  return { saved, skippedDuplicates, pointsUsed };
}

async function main() {
  console.log('[BevSeed] ──────────────────────────────────────────');
  console.log('[BevSeed] Beverage Catalog Seed — Smoothies/Juices/Milkshakes');
  console.log('[BevSeed] ──────────────────────────────────────────\n');

  const tasty = await seedFromTasty();
  let spoon = { saved: 0, skippedDuplicates: 0, pointsUsed: 0 };

  if (tasty.apiMissing || (tasty.saved === 0 && !tasty.quotaHit)) {
    spoon = await seedFromSpoonacular();
  }

  console.log('\n[BevSeed] ──────────────────────────────────────────');
  console.log('[BevSeed] Complete!');
  const totalSaved = tasty.saved + spoon.saved;
  const totalDupes = tasty.skippedDuplicates + spoon.skippedDuplicates;
  console.log(`[BevSeed] Done. Saved: ${totalSaved}, Moved to Food: ${tasty.savedToFood || 0}, Skipped (duplicate): ${totalDupes}, Skipped (filtered): ${tasty.skippedFiltered || 0}, Tasty requests this run: ${tasty.requestsUsed}`);
  console.log(`[BevSeed]   Tasty saved:        ${tasty.saved}`);
  console.log(`[BevSeed]   Tasty dupes:        ${tasty.skippedDuplicates}`);
  console.log(`[BevSeed]   Tasty filtered:     ${tasty.skippedFiltered || 0}`);
  console.log(`[BevSeed]   Tasty missing data: ${tasty.skippedMissingData || 0}`);
  if (spoon.saved || spoon.pointsUsed) {
    console.log(`[BevSeed]   Spoonacular saved: ${spoon.saved}`);
    console.log(`[BevSeed]   Spoon. points:     ${spoon.pointsUsed}`);
  }
  const finalUsage = getUsage();
  console.log(`[BevSeed]   Tasty monthly total: ${finalUsage.requestsUsed}/${MONTHLY_LIMIT}`);
  console.log('[BevSeed] ──────────────────────────────────────────');
  process.exit(0);
}

main().catch(err => { console.error('[BevSeed] Fatal:', err); process.exit(1); });
