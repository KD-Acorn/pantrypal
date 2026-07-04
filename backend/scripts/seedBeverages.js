import fs from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, '..', '..', '.env') });

const serviceAccount = JSON.parse(
  fs.readFileSync(resolve(__dirname, '..', 'serviceAccount.json'), 'utf8')
);
initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY;
const SPOONACULAR_KEY = process.env.SPOONACULAR_API_KEY;

// Leave buffer below the RapidAPI free-tier limit (verify current limit on the listing page)
const TASTY_REQUEST_LIMIT = 450;
const PROGRESS_FILE = resolve(__dirname, 'seedBeveragesProgress.json');

// Confirmed tag slugs via GET /tags/list on 2026-07-04:
//   'smoothies_smoothie_bowls' → "Smoothies & Smoothie Bowls" (no standalone 'smoothies' tag exists)
//   'shakes'                   → "Shakes" (no 'milkshakes' tag exists)
//   'juices'                   → "Juices"
//   'beverages'                → "Beverages" (breakfast category)
const TASTY_TAGS = [
  { slug: 'smoothies_smoothie_bowls', category: 'smoothie' },
  { slug: 'shakes',                   category: 'milkshake' },
  { slug: 'juices',                   category: 'juice' },
  { slug: 'beverages',                category: 'smoothie' }, // mixed, infer per recipe
];

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function loadProgress() {
  try { return JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8')); }
  catch { return { requestsUsed: 0, totalSaved: 0 }; }
}
function saveProgress(data) {
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify({ ...data, resumedAt: new Date().toISOString() }, null, 2));
}

// Returns a skip reason string if the recipe should be rejected, or null if it passes.
// Limitation: title-based filtering only — Tasty has no 'is_beverage' flag.
function contentFilterReason(recipe) {
  const title = (recipe.name || '').toLowerCase();
  const tagNames = (recipe.tags || []).map(t => (t.name || '').toLowerCase());

  // Non-beverage food dishes that appear in drink-tagged results
  const nonBeveragePatterns = [
    'smoothie bowl', 'açaí bowl', 'acai bowl', 'smoothie bowls',
    'baby food', 'puree', 'purée', 'toddler',
  ];
  for (const p of nonBeveragePatterns) {
    if (title.includes(p)) return 'non-beverage';
  }

  // Baby food labeled with age ranges e.g. "9+ Months", "6-12 months"
  if (/\d+\+?\s*(?:-\s*\d+\s*)?month/i.test(recipe.name || '')) return 'non-beverage';

  // Tag-level baby food check
  if (tagNames.some(t => t === 'baby_food' || t === 'baby-food' || t === 'baby')) return 'non-beverage';

  // Skip clearly alcoholic content from non-cocktail tags
  if (tagNames.some(t => t === 'cocktails' || t === 'alcohol' || t === 'alcoholic')) return 'non-beverage';

  return null;
}

function inferCategory(recipe, defaultCategory) {
  const tags = (recipe.tags || []).map(t => (t.name || '').toLowerCase());
  const name = (recipe.name || '').toLowerCase();
  if (name.includes('milkshake') || name.includes('milk shake') || tags.some(t => t === 'shakes')) return 'milkshake';
  if (name.includes('smoothie')) return 'smoothie';
  if (name.includes(' juice') || tags.some(t => t === 'juices')) return 'juice';
  return defaultCategory;
}

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

// ── Primary: Tasty API via RapidAPI ──────────────────────────────────────────
async function seedFromTasty() {
  if (!RAPIDAPI_KEY) {
    console.log('\n[BevSeed] ⚠️  RAPIDAPI_KEY not found in .env');
    console.log('[BevSeed] Setup steps:');
    console.log('[BevSeed]   1. Sign up at https://rapidapi.com (free)');
    console.log('[BevSeed]   2. Search for "Tasty" and subscribe to the free tier');
    console.log('[BevSeed]   3. Copy your RapidAPI key from the Tasty API dashboard');
    console.log('[BevSeed]   4. Add to backend/.env:  RAPIDAPI_KEY=your_key_here');
    console.log('[BevSeed]   5. Rerun this script — falls through to Spoonacular until key is added\n');
    return { saved: 0, skippedDuplicates: 0, skippedFiltered: 0, skippedMissingData: 0, requestsUsed: 0, apiMissing: true, quotaHit: false };
  }

  const progress = loadProgress();
  let { requestsUsed, totalSaved } = progress;
  let saved = 0, skippedDuplicates = 0, skippedFiltered = 0, skippedMissingData = 0;

  console.log(`[BevSeed] Tasty seed starting — ${requestsUsed} requests used this month`);
  console.log(`[BevSeed] Limit: ${TASTY_REQUEST_LIMIT} req/run (free tier — check RapidAPI for current limits)`);
  console.log(`[BevSeed] Tags: ${TASTY_TAGS.map(t => t.slug).join(', ')}\n`);

  for (const { slug, category: defaultCategory } of TASTY_TAGS) {
    if (requestsUsed >= TASTY_REQUEST_LIMIT) {
      console.log(`\n[BevSeed] Tasty quota reached (${requestsUsed} requests). Resume tomorrow.`);
      saveProgress({ requestsUsed, totalSaved: totalSaved + saved });
      return { saved, skippedDuplicates, skippedFiltered, skippedMissingData, requestsUsed, quotaHit: true };
    }

    console.log(`[BevSeed] ── Tag: "${slug}" (default category: ${defaultCategory})`);
    let from = 0;
    let hasMore = true;

    while (hasMore) {
      if (requestsUsed >= TASTY_REQUEST_LIMIT) {
        console.log(`\n[BevSeed] Tasty quota reached mid-tag. Resume tomorrow.`);
        saveProgress({ requestsUsed, totalSaved: totalSaved + saved });
        return { saved, skippedDuplicates, skippedFiltered, skippedMissingData, requestsUsed, quotaHit: true };
      }

      try {
        const resp = await fetch(
          `https://tasty.p.rapidapi.com/recipes/list?from=${from}&size=20&tags=${encodeURIComponent(slug)}`,
          { headers: { 'x-rapidapi-host': 'tasty.p.rapidapi.com', 'x-rapidapi-key': RAPIDAPI_KEY } }
        );
        requestsUsed++;

        if (resp.status === 429 || resp.status === 402) {
          console.log(`\n[BevSeed] Tasty quota exhausted (HTTP ${resp.status}). Resume tomorrow.`);
          saveProgress({ requestsUsed, totalSaved: totalSaved + saved });
          return { saved, skippedDuplicates, skippedFiltered, skippedMissingData, requestsUsed, quotaHit: true };
        }
        if (!resp.ok) {
          console.error(`[BevSeed] HTTP ${resp.status} for tag="${slug}" from=${from}`);
          hasMore = false;
          break;
        }

        const data = await resp.json();
        const results = data.results || [];
        if (results.length === 0) { hasMore = false; break; }

        for (const recipe of results) {
          if (!recipe.name || !recipe.id) {
            skippedMissingData++;
            console.log(`[BevSeed] Skipped [missing data]: (no name/id)`);
            continue;
          }

          // Content filter
          const filterReason = contentFilterReason(recipe);
          if (filterReason) {
            skippedFiltered++;
            console.log(`[BevSeed] Skipped [non-beverage]: ${recipe.name}`);
            continue;
          }

          // Duplicate check
          const docId = `tasty_${recipe.id}`;
          const existing = await db.collection('beverage_catalog').doc(docId).get();
          if (existing.exists) {
            skippedDuplicates++;
            console.log(`[BevSeed] Skipped [duplicate]: ${recipe.name}`);
            continue;
          }

          const category = inferCategory(recipe, defaultCategory);
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
          totalSaved++;
          console.log(`[BevSeed] Saved [${category}]: ${parsed.title}`);
          await sleep(50);
        }

        console.log(`[BevSeed] tag=${slug} from=${from}: ${results.length} results, req=${requestsUsed}, saved=${saved}, dupes=${skippedDuplicates}, filtered=${skippedFiltered}`);
        from += 20;
        hasMore = results.length === 20;
        await sleep(250);
      } catch (err) {
        console.error(`[BevSeed] Error for tag="${slug}" from=${from}:`, err.message);
        hasMore = false;
      }
    }
  }

  saveProgress({ requestsUsed, totalSaved: totalSaved + saved });
  return { saved, skippedDuplicates, skippedFiltered, skippedMissingData, requestsUsed, quotaHit: false };
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

        const name = (r.title || '').toLowerCase();
        const category = name.includes('milkshake') || name.includes('shake') ? 'milkshake'
          : name.includes('juice') ? 'juice' : 'smoothie';

        const mins = r.readyInMinutes || 10;
        const ingredients = (r.extendedIngredients || []).map(ing => ({
          amount: Math.round((ing.amount || 1) * 100) / 100,
          unit: ing.unit || 'item',
          name: (ing.name || '').toLowerCase(),
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
  console.log(`[BevSeed] Done. Saved: ${totalSaved}, Skipped (duplicate): ${totalDupes}, Skipped (filtered): ${tasty.skippedFiltered || 0}, Tasty requests: ${tasty.requestsUsed}`);
  if (tasty.requestsUsed) console.log(`[BevSeed]   Tasty requests:     ${tasty.requestsUsed}`);
  console.log(`[BevSeed]   Tasty saved:        ${tasty.saved}`);
  console.log(`[BevSeed]   Tasty dupes:        ${tasty.skippedDuplicates}`);
  console.log(`[BevSeed]   Tasty filtered:     ${tasty.skippedFiltered || 0}`);
  console.log(`[BevSeed]   Tasty missing data: ${tasty.skippedMissingData || 0}`);
  if (spoon.saved || spoon.pointsUsed) {
    console.log(`[BevSeed]   Spoonacular saved: ${spoon.saved}`);
    console.log(`[BevSeed]   Spoon. points:     ${spoon.pointsUsed}`);
  }
  console.log('[BevSeed] ──────────────────────────────────────────');
  process.exit(0);
}

main().catch(err => { console.error('[BevSeed] Fatal:', err); process.exit(1); });
