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
if (!API_KEY) { console.error('[Seed] SPOONACULAR_API_KEY not set'); process.exit(1); }

const POINT_LIMIT = 45;
const PROGRESS_FILE = resolve(__dirname, 'seedProgress.json');

const PROTEINS = ['chicken breast', 'ground beef', 'eggs', 'salmon',
  'shrimp', 'tofu', 'pork', 'turkey', 'tuna', 'bacon'];
const PRODUCE = ['garlic', 'onion', 'tomato', 'spinach', 'broccoli',
  'potato', 'carrot', 'bell pepper', 'mushroom', 'avocado'];
const GRAINS = ['pasta', 'rice', 'bread', 'flour', 'oats', 'quinoa'];
const DAIRY = ['cheese', 'butter', 'milk', 'cream', 'yogurt'];
const PANTRY_ITEMS = ['olive oil', 'lemon', 'soy sauce', 'coconut milk',
  'canned tomatoes', 'black beans', 'chickpeas'];
const COMBINATIONS = [
  'chicken garlic', 'beef onion', 'pasta tomato', 'rice chicken',
  'eggs cheese', 'salmon lemon', 'tofu soy sauce',
  'shrimp garlic butter', 'potato cheese', 'broccoli garlic',
];

const ALL_QUERIES = [...PROTEINS, ...PRODUCE, ...GRAINS, ...DAIRY, ...PANTRY_ITEMS, ...COMBINATIONS];

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function stripHtml(str) {
  return (str || '').replace(/<[^>]*>/g, '').replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').trim();
}

function loadProgress() {
  try {
    return JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8'));
  } catch { return { lastIngredientIndex: 0, totalSaved: 0 }; }
}

function saveProgress(data) {
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify({ ...data, resumeAt: new Date().toISOString() }, null, 2));
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

async function seed() {
  const progress = loadProgress();
  let { lastIngredientIndex, totalSaved } = progress;
  let pointsUsed = 0;

  console.log(`[Seed] Starting from index ${lastIngredientIndex}, ${totalSaved} previously saved`);
  console.log(`[Seed] ${ALL_QUERIES.length} total ingredient queries to process\n`);

  for (let i = lastIngredientIndex; i < ALL_QUERIES.length; i++) {
    if (pointsUsed >= POINT_LIMIT) {
      console.log(`\n[Seed] Daily point limit reached (${pointsUsed} pts). Resume tomorrow.`);
      saveProgress({ lastIngredientIndex: i, totalSaved });
      return;
    }

    const query = ALL_QUERIES[i];
    console.log(`[Seed] Fetching recipes for: ${query}`);

    try {
      const searchUrl = `https://api.spoonacular.com/recipes/findByIngredients?ingredients=${encodeURIComponent(query)}&number=10&ranking=1&ignorePantry=false&apiKey=${API_KEY}`;
      const searchResp = await fetch(searchUrl);
      if (searchResp.status === 402) {
        console.log(`\n[Seed] Spoonacular daily quota exhausted. Resume tomorrow.`);
        saveProgress({ lastIngredientIndex: i, totalSaved });
        return;
      }
      if (!searchResp.ok) {
        console.error(`[Seed] Search error ${searchResp.status} for "${query}"`);
        continue;
      }
      const candidates = await searchResp.json();
      pointsUsed++;
      console.log(`[Seed] Found ${candidates.length} candidates`);

      for (const c of candidates) {
        if (pointsUsed >= POINT_LIMIT) break;

        const docId = String(c.id);
        const ref = db.collection('recipe_catalog').doc(docId);
        const existing = await ref.get();
        if (existing.exists) {
          console.log(`[Seed] Skipped (exists): ${c.title} (id: ${c.id})`);
          continue;
        }

        await sleep(500);

        const detailUrl = `https://api.spoonacular.com/recipes/${c.id}/information?apiKey=${API_KEY}&includeNutrition=true`;
        const detailResp = await fetch(detailUrl);
        if (detailResp.status === 402) {
          console.log(`\n[Seed] Spoonacular daily quota exhausted. Resume tomorrow.`);
          saveProgress({ lastIngredientIndex: i, totalSaved });
          return;
        }
        if (!detailResp.ok) {
          console.error(`[Seed] Detail error ${detailResp.status} for id ${c.id}`);
          continue;
        }
        const recipe = await detailResp.json();
        pointsUsed++;

        const ingredients = (recipe.extendedIngredients || []).map(ing => ({
          amount: Math.round((ing.amount || 1) * 100) / 100,
          unit: ing.unit || 'whole',
          name: (ing.name || '').toLowerCase(),
        }));

        const indexedIngredients = ingredients.map(ing => ing.name).filter(Boolean);
        const mins = recipe.readyInMinutes || 30;
        const steps = recipe.analyzedInstructions?.[0]?.steps?.map(s => s.step) || [];
        const desc = stripHtml(recipe.summary || '').slice(0, 200);

        await ref.set({
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
          indexedIngredients,
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
        console.log(`[Seed] Saved: ${recipe.title} (id: ${recipe.id})`);
        console.log(`[Seed] Progress: ${totalSaved} recipes saved, ~${pointsUsed} pts used`);
      }
    } catch (err) {
      console.error(`[Seed] Error on "${query}":`, err.message);
    }

    console.log(`[Seed] Est. points used: ${pointsUsed} (remaining: ~${50 - pointsUsed})\n`);
    saveProgress({ lastIngredientIndex: i + 1, totalSaved });
  }

  console.log(`\n[Seed] Complete! ${totalSaved} total recipes in catalog.`);
  try { fs.unlinkSync(PROGRESS_FILE); } catch {}
}

seed().catch(err => { console.error('[Seed] Fatal:', err); process.exit(1); });
