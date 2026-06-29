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

const API_KEY = process.env.SPOONACULAR_API_KEY;
if (!API_KEY) { console.error('[WeeklySync] SPOONACULAR_API_KEY not set'); process.exit(1); }

const WEEKLY_TARGET = 50;
const POINT_LIMIT = 45;

const ALL_COMBOS = [
  'chicken garlic lemon', 'beef onion potato', 'pasta tomato basil',
  'rice shrimp soy sauce', 'eggs cheese spinach', 'salmon dill',
  'tofu ginger sesame', 'pork apple', 'turkey cranberry',
  'bacon mushroom', 'tuna avocado', 'lamb rosemary',
  'chicken coconut milk curry', 'beef broccoli', 'pasta cream mushroom',
  'rice beans cilantro', 'eggs bacon cheese', 'salmon asparagus',
  'shrimp coconut', 'pork cabbage', 'chicken thigh honey',
  'ground turkey taco', 'fish lemon butter', 'chicken marsala',
  'beef stroganoff', 'pasta pesto', 'rice pilaf', 'omelette vegetable',
  'steak pepper', 'chicken tikka', 'teriyaki salmon', 'meatball marinara',
  'cauliflower cheese', 'zucchini noodle', 'sweet potato black bean',
  'lentil soup', 'chickpea curry', 'pulled pork', 'fish taco',
  'chicken alfredo', 'shrimp scampi', 'beef chili', 'mushroom risotto',
  'eggplant parmesan', 'coconut shrimp', 'chicken quesadilla',
  'greek salad chicken', 'peanut butter banana', 'avocado toast egg',
  'butter chicken', 'pad thai', 'falafel',
];

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function stripHtml(str) {
  return (str || '').replace(/<[^>]*>/g, '').replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').trim();
}

function extractNutrition(recipe) {
  const nutrients = recipe.nutrition?.nutrients || [];
  const find = (name) => nutrients.find(n => n.name === name)?.amount || 0;
  const servings = recipe.servings || 4;
  return {
    calories: Math.round(find('Calories') / servings),
    protein: Math.round(find('Protein') / servings),
    carbs: Math.round(find('Carbohydrates') / servings),
    fat: Math.round(find('Fat') / servings),
    fiber: Math.round(find('Fiber') / servings),
  };
}

async function weeklySync() {
  const startedAt = new Date();
  console.log(`[WeeklySync] Starting at ${startedAt.toISOString()}`);

  const configRef = db.collection('config').doc('catalog_sync');
  const configSnap = await configRef.get();
  const lastOffset = configSnap.exists ? (configSnap.data().lastOffset || 0) : 0;

  const weekOffset = lastOffset % ALL_COMBOS.length;
  const queries = [];
  for (let i = 0; i < 10; i++) {
    queries.push(ALL_COMBOS[(weekOffset + i) % ALL_COMBOS.length]);
  }

  console.log(`[WeeklySync] Using queries (offset ${weekOffset}):`, queries.join(', '));

  let totalSaved = 0;
  let totalSkipped = 0;
  let pointsUsed = 0;

  for (const query of queries) {
    if (pointsUsed >= POINT_LIMIT || totalSaved >= WEEKLY_TARGET) break;

    console.log(`[WeeklySync] Fetching: ${query}`);

    try {
      const searchUrl = `https://api.spoonacular.com/recipes/findByIngredients?ingredients=${encodeURIComponent(query)}&number=8&ranking=1&ignorePantry=false&apiKey=${API_KEY}`;
      const searchResp = await fetch(searchUrl);
      if (searchResp.status === 402) { console.log('[WeeklySync] Spoonacular daily quota exhausted.'); break; }
      if (!searchResp.ok) { console.error(`[WeeklySync] Search error: ${searchResp.status}`); continue; }
      const candidates = await searchResp.json();
      pointsUsed++;

      for (const c of candidates) {
        if (pointsUsed >= POINT_LIMIT || totalSaved >= WEEKLY_TARGET) break;

        const docId = String(c.id);
        const existing = await db.collection('recipe_catalog').doc(docId).get();
        if (existing.exists) { totalSkipped++; continue; }

        await sleep(500);

        const detailUrl = `https://api.spoonacular.com/recipes/${c.id}/information?apiKey=${API_KEY}&includeNutrition=true`;
        const detailResp = await fetch(detailUrl);
        if (detailResp.status === 402) { console.log('[WeeklySync] Spoonacular daily quota exhausted.'); break; }
        if (!detailResp.ok) continue;
        const recipe = await detailResp.json();
        pointsUsed++;

        const ingredients = (recipe.extendedIngredients || []).map(ing => ({
          amount: Math.round((ing.amount || 1) * 100) / 100,
          unit: ing.unit || 'whole',
          name: (ing.name || '').toLowerCase(),
        }));

        const mins = recipe.readyInMinutes || 30;
        const steps = recipe.analyzedInstructions?.[0]?.steps?.map(s => s.step) || [];
        const desc = stripHtml(recipe.summary || '').slice(0, 200);

        await db.collection('recipe_catalog').doc(docId).set({
          id: docId,
          source: 'spoonacular',
          spoonacularId: recipe.id,
          mealDbId: null,
          title: recipe.title,
          description: desc + (desc.length >= 200 ? '...' : ''),
          cookTime: `${mins} min`,
          difficulty: mins <= 20 ? 'Easy' : mins <= 45 ? 'Medium' : 'Hard',
          cuisine: recipe.cuisines?.[0] || recipe.dishTypes?.[0] || 'International',
          baseServings: recipe.servings || 4,
          ingredients,
          indexedIngredients: ingredients.map(i => i.name).filter(Boolean),
          steps,
          thumbnail: (recipe.image || '').replace('312x231', '556x370') || null,
          tags: [...(recipe.cuisines || []), ...(recipe.dishTypes || [])],
          fetchedAt: FieldValue.serverTimestamp(),
          useCount: 0,
          nutrition: extractNutrition(recipe),
          sourceUrl: recipe.sourceUrl || null,
          avgRating: 0,
          ratingCount: 0,
          sourceData: {},
        });

        totalSaved++;
        console.log(`[WeeklySync] Saved: ${recipe.title}`);
      }
    } catch (err) {
      console.error(`[WeeklySync] Error on "${query}":`, err.message);
    }
  }

  await configRef.set({
    lastOffset: weekOffset + 10,
    lastSyncAt: FieldValue.serverTimestamp(),
  }, { merge: true });

  const logRef = db.collection('catalog_sync_logs').doc(startedAt.toISOString());
  await logRef.set({
    startedAt: startedAt.toISOString(),
    completedAt: new Date().toISOString(),
    saved: totalSaved,
    skipped: totalSkipped,
    pointsUsed,
    queries,
  });

  console.log(`\n[WeeklySync] Done. Saved: ${totalSaved}, Skipped: ${totalSkipped}, Points: ${pointsUsed}`);
}

weeklySync()
  .then(() => process.exit(0))
  .catch(err => { console.error('[WeeklySync] Fatal:', err); process.exit(1); });
