// My Pantry Club — API Proxy
// DoneIt Technologies
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import fs from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { initializeApp, cert, applicationDefault } from 'firebase-admin/app';
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';
import { getAuth as getAdminAuth } from 'firebase-admin/auth';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, '..', '.env') });

let adminDb = null;
let adminAuth = null;
try {
  const serviceAccount = JSON.parse(
    fs.readFileSync(resolve(__dirname, 'serviceAccount.json'), 'utf8')
  );
  initializeApp({ credential: cert(serviceAccount) });
  adminDb = getFirestore();
  adminAuth = getAdminAuth();
} catch (err) {
  console.warn('[Admin] Service account not found — Firebase Admin features (account deletion) will be unavailable:', err.message);
}

const app = express();
app.use(express.json({ limit: '10mb' }));
app.use(cors({
  origin: [
    'http://localhost:3004',
    'http://localhost:3005',
    'https://pantry.doneitmobile.com',
    'https://mypantryclub.com',
    'https://www.mypantryclub.com',
    'https://mypantryclub.app',
    'https://www.mypantryclub.app',
    'https://admin.mypantryclub.com',
  ],
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

app.get('/health', (_req, res) => res.json({ ok: true }));

// ── POST /api/scan — OpenAI GPT-4o vision ──────────────────────────────────
app.post('/api/scan', async (req, res) => {
  const { imageBase64, mimeType } = req.body;
  if (!imageBase64) return res.status(400).json({ error: 'imageBase64 is required' });

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        max_tokens: 600,
        messages: [{
          role: 'user',
          content: [
            {
              type: 'text',
              text: `List every food ingredient visible in this image. For each item:
- If you can count individual items, return that count as quantity
- If you see a package, try to read the size from the label
- Assign the most logical unit: 'item' for whole fruits/vegetables you can count, 'bottle' for bottles, 'can' for cans, 'bag' for bags, 'box' for boxes, 'bunch' for herbs or bananas, 'lb' or 'oz' if weight is visible on packaging
- Default to quantity 1 if count is unclear
Examples: 3 visible apples → {"name":"apples","quantity":3,"unit":"item"}, a bag of rice with '5 lb' visible → {"name":"rice","quantity":5,"unit":"lb"}, a 6-pack of beer → {"name":"beer","quantity":6,"unit":"can"}
Return ONLY a JSON array of objects with name, quantity, unit. No markdown, no preamble.`,
            },
            {
              type: 'image_url',
              image_url: { url: `data:${mimeType || 'image/jpeg'};base64,${imageBase64}` },
            },
          ],
        }],
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      console.error('OpenAI error:', err);
      return res.status(502).json({ error: 'Failed to analyze image' });
    }

    const data = await response.json();
    const raw = data.choices?.[0]?.message?.content || '[]';
    const cleaned = raw.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(cleaned);
    const ingredients = Array.isArray(parsed) ? parsed.map(i =>
      typeof i === 'string' ? i : (i.name ? i : null)
    ).filter(Boolean) : [];
    res.json({ ingredients });
  } catch (err) {
    console.error('Scan error:', err);
    res.status(500).json({ error: 'Ingredient scan failed' });
  }
});

// ── TheMealDB helpers ────────────────────────────────────────────────────────
function extractIngredientNames(ingredients) {
  return ingredients.map(i => {
    const raw = typeof i === 'string' ? i : i.name || i;
    return raw.replace(/^\d+\s*(item|box|can|bag|bottle|lb|oz|g|ml|cup|bunch|pack)\s+/i, '').trim().toLowerCase();
  }).filter(Boolean);
}

const BASE_KEYWORDS = [
  'chicken','beef','pork','fish','salmon','tuna','shrimp','turkey','lamb','bacon','sausage','egg',
  'tomato','onion','garlic','potato','carrot','pepper','spinach','lettuce','mushroom','broccoli',
  'lemon','lime','apple','banana','cucumber','zucchini','corn','pea','bean','cherry','berries',
  'strawberry','blueberry','avocado','cabbage','celery','ginger','kale',
  'milk','cheese','butter','cream','yogurt',
  'rice','pasta','flour','bread','oat','noodle','tortilla',
  'oil','vinegar','sauce','broth','stock','sugar','salt','honey','coconut','peanut butter',
  'soy sauce','olive','almond','walnut','pecan',
];
const SKIP_KEYWORDS = [
  'helper','instant','mix','powder','seasoning packet','flavor','kraft','hamburger helper',
  'mac and cheese','ramen','popcorn','chips','crackers','cereal','granola bar','candy',
  'chocolate covered','snack','cookie','pretzel','energy bar','protein bar',
  'soda','energy drink','sports drink',
];

function pickSearchIngredients(pantryNames) {
  const isBase = (name) => BASE_KEYWORDS.some(k => name.includes(k));
  const isSkip = (name) => SKIP_KEYWORDS.some(k => name.includes(k));

  const base = pantryNames.filter(n => isBase(n) && !isSkip(n));
  if (base.length >= 3) return base.slice(0, 3);

  const neutral = pantryNames.filter(n => !isSkip(n) && !base.includes(n));
  return [...base, ...neutral].slice(0, 3);
}

function parseMealDBIngredients(meal) {
  const out = [];
  for (let i = 1; i <= 20; i++) {
    const name = (meal[`strIngredient${i}`] || '').trim();
    if (!name) break;
    const measure = (meal[`strMeasure${i}`] || '').trim();
    const amountMatch = measure.match(/^([\d.\/]+)/);
    let amount = 1;
    if (amountMatch) {
      const raw = amountMatch[1];
      amount = raw.includes('/') ? eval(raw) : parseFloat(raw) || 1;
    }
    const rawUnit = measure.replace(/^[\d.\/]+\s*/, '').trim() || 'whole';
    out.push({ amount: Math.round(amount * 100) / 100, unit: normalizeUnit(rawUnit), name: name.toLowerCase() });
  }
  return out;
}

const STRIP_DESCRIPTORS = /\b(fresh|dried|chopped|minced|ground|large|small|medium|boneless|skinless|whole|sliced|diced|raw|cooked|frozen|canned|organic)\b/gi;

function normalizeIngName(name) {
  let n = name.toLowerCase().replace(STRIP_DESCRIPTORS, '').replace(/\s+/g, ' ').trim();
  if (n.endsWith('ies')) n = n.slice(0, -3) + 'y';
  else if (n.endsWith('ves')) n = n.slice(0, -3) + 'f';
  else if (n.endsWith('es') && !n.endsWith('cheese')) n = n.slice(0, -2);
  else if (n.endsWith('s') && !n.endsWith('ss')) n = n.slice(0, -1);
  return n;
}

function ingredientMatch(a, b) {
  if (a.includes(b) || b.includes(a)) return true;
  const na = normalizeIngName(a), nb = normalizeIngName(b);
  return na.includes(nb) || nb.includes(na);
}

function calcMatchScore(recipeIngredients, pantryNames) {
  if (recipeIngredients.length === 0) return { score: 0, matched: [] };
  const matched = recipeIngredients.filter(ri =>
    pantryNames.some(p => ingredientMatch(ri.name, p))
  );
  return { score: Math.round((matched.length / recipeIngredients.length) * 100), matched: matched.map(m => m.name) };
}

function calcMissing(recipeIngredients, pantryNames) {
  return recipeIngredients
    .filter(ri => !pantryNames.some(p => ingredientMatch(ri.name, p)))
    .map(ri => ri.name);
}

function fetchWithTimeout(url, ms = 5000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ms);
  return fetch(url, { signal: controller.signal }).finally(() => clearTimeout(timeout));
}

async function searchTheMealDB(searchTerms, pantryNames) {

  const filterResults = await Promise.all(
    searchTerms.map(term =>
      fetchWithTimeout(`https://www.themealdb.com/api/json/v1/1/filter.php?i=${encodeURIComponent(term)}`)
        .then(r => r.ok ? r.json() : { meals: null })
        .catch(() => ({ meals: null }))
    )
  );

  const seenIds = new Set();
  const mealIds = [];
  for (const data of filterResults) {
    for (const meal of (data.meals || []).slice(0, 5)) {
      if (!seenIds.has(meal.idMeal)) {
        seenIds.add(meal.idMeal);
        mealIds.push(meal.idMeal);
      }
    }
  }

  const detailResults = await Promise.all(
    mealIds.slice(0, 8).map(id =>
      fetchWithTimeout(`https://www.themealdb.com/api/json/v1/1/lookup.php?i=${id}`)
        .then(r => r.ok ? r.json() : { meals: null })
        .catch(() => ({ meals: null }))
    )
  );

  const recipes = [];
  for (const data of detailResults) {
    const meal = data.meals?.[0];
    if (!meal) continue;

    const ingredients = parseMealDBIngredients(meal);
    const { score: matchScore, matched: matchedNames } = calcMatchScore(ingredients, pantryNames);
    const missing = calcMissing(ingredients, pantryNames);
    const instructions = (meal.strInstructions || '').split(/\r?\n/).filter(s => s.trim());
    const desc = (meal.strInstructions || '').slice(0, 150).trim();

    if (recipes.length < 3) {
      console.log('[Recipes] TheMealDB match:', meal.strMeal, 'score:', matchScore, 'matched:', matchedNames.join(', '));
    }

    recipes.push({
      title: meal.strMeal,
      description: desc + (desc.length >= 150 ? '...' : ''),
      cookTime: '30 min',
      difficulty: 'Medium',
      matchScore,
      missingIngredients: missing,
      cuisine: meal.strArea || meal.strCategory || '',
      baseServings: 4,
      ingredients,
      steps: instructions,
      source: 'themealdb',
      sourceLabel: null,
      mealDbId: meal.idMeal,
      thumbnail: meal.strMealThumb || null,
    });
  }

  return recipes;
}

function stripHtml(str) {
  return (str || '').replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').trim();
}

const UNIT_MAP = {
  'pch': 'pinch', 'dsh': 'dash',
  'tbs': 'tbsp', 'tbl': 'tbsp', 'T': 'tbsp',
  't': 'tsp',
  'c': 'cup', 'C': 'cup',
  'lbs': 'lb',
  'l': 'l', 'L': 'l',
  'sm': 'small', 'sml': 'small',
  'med': 'medium',
  'lg': 'large', 'lrg': 'large',
  'pkg': 'package', 'env': 'envelope',
  'cn': 'can',
  'pt': 'pint', 'qt': 'quart', 'gal': 'gallon',
};

function normalizeUnit(unit) {
  const raw = unit?.trim() || '';
  if (!raw) return 'item';
  return UNIT_MAP[raw] || UNIT_MAP[raw.toLowerCase()] || raw.toLowerCase();
}

function isValidRecipe(recipe) {
  if (!recipe.title || recipe.title.length < 3) return false;
  if (!recipe.ingredients || recipe.ingredients.length < 2) return false;
  if (!recipe.steps || recipe.steps.length < 2) return false;
  if (!recipe.thumbnail) return false;

  const allStepText = recipe.steps.join(' ');
  const nonLatin = allStepText.match(/[^\x00-\x7F]/g) || [];
  if (nonLatin.length > allStepText.length * 0.2) return false;

  const avgStepLength = allStepText.length / recipe.steps.length;
  if (avgStepLength < 20) return false;

  return true;
}

function cleanSpoonacularDescription(summary, title, cuisine, cookTime, difficulty, ingredients) {
  if (!summary) {
    const top3 = (ingredients || []).slice(0, 3).map(i => i.name).join(', ');
    return `${cuisine || 'Homestyle'} recipe featuring ${top3 || 'fresh ingredients'}. Ready in ${cookTime || '30 min'} and ${(difficulty || 'Medium').toLowerCase()} to make.`;
  }

  let clean = stripHtml(summary);
  clean = clean.replace(/The recipe .+? can be made in about \d+ minutes\.?\s*/i, '');
  clean = clean.replace(/For \$[\d.]+ per serving,.*?\./i, '');
  clean = clean.replace(/Watching your figure\?.*?\./i, '');
  clean = clean.replace(/This recipe makes \d+ servings.*?\./i, '');
  clean = clean.replace(/It will be a hit at your.*?\./i, '');

  const sentences = clean.split(/\.(?:\s+|$)/).filter(s => s.trim().length > 20);
  const result = sentences.slice(0, 2).join('. ').trim() + (sentences.length > 0 ? '.' : '');

  if (!result || result.length < 20) {
    const top3 = (ingredients || []).slice(0, 3).map(i => i.name).join(', ');
    return `${cuisine || 'Homestyle'} recipe featuring ${top3 || 'fresh ingredients'}. Ready in ${cookTime || '30 min'} and ${(difficulty || 'Medium').toLowerCase()} to make.`;
  }
  return result;
}

// ── Edamam Recipe Search ────────────────────────────────────────────────────
async function searchEdamam(filteredIngredients, pantryNames, needed) {
  const appId = process.env.EDAMAM_APP_ID;
  const appKey = process.env.EDAMAM_APP_KEY;
  if (!appId || !appKey || needed <= 0) return [];

  try {
    const url = `https://api.edamam.com/api/recipes/v2?type=public&q=${encodeURIComponent(filteredIngredients.join(','))}&app_id=${appId}&app_key=${appKey}&ingr=${needed * 2}&random=true`;
    const resp = await fetchWithTimeout(url, 5000);
    if (!resp.ok) { console.error('[Edamam] Search error:', resp.status); return []; }
    const data = await resp.json();
    const hits = data.hits || [];

    const recipes = [];
    for (const hit of hits) {
      const r = hit.recipe;
      if (!r) continue;
      const ingredients = (r.ingredients || []).map(i => ({
        amount: Math.round((i.quantity || 1) * 100) / 100,
        unit: normalizeUnit(i.measure === '<unit>' ? 'whole' : (i.measure || 'whole')),
        name: (i.food || '').toLowerCase(),
      }));
      const { score: matchScore } = calcMatchScore(ingredients, pantryNames);
      if (matchScore < 20) continue;
      const missing = calcMissing(ingredients, pantryNames);
      const mins = r.totalTime || 30;
      const servings = r.yield || 4;
      const topIngredients = ingredients.slice(0, 3).map(i => i.name).join(', ');

      const nutrition = {};
      try {
        nutrition.calories = Math.round((r.calories || 0) / servings);
        nutrition.protein = Math.round((r.totalNutrients?.PROCNT?.quantity || 0) / servings);
        nutrition.carbs = Math.round((r.totalNutrients?.CHOCDF?.quantity || 0) / servings);
        nutrition.fat = Math.round((r.totalNutrients?.FAT?.quantity || 0) / servings);
        nutrition.fiber = Math.round((r.totalNutrients?.FIBTG?.quantity || 0) / servings);
      } catch {}

      recipes.push({
        title: r.label,
        description: `A ${(r.cuisineType?.[0] || 'homestyle')} dish featuring ${topIngredients}.`,
        cookTime: mins > 0 ? `${mins} min` : '30 min',
        difficulty: mins > 0 && mins <= 20 ? 'Easy' : mins <= 45 ? 'Medium' : 'Hard',
        matchScore,
        missingIngredients: missing,
        cuisine: r.cuisineType?.[0] || r.mealType?.[0] || 'International',
        baseServings: servings,
        ingredients,
        steps: [],
        source: 'edamam',
        sourceLabel: null,
        thumbnail: r.image || null,
        edamamId: r.uri,
        sourceUrl: r.url || null,
        nutrition,
        tags: [...(r.cuisineType || []), ...(r.dishType || [])],
      });
    }

    recipes.sort((a, b) => b.matchScore - a.matchScore);
    return recipes.slice(0, needed);
  } catch (err) {
    console.error('[Edamam] Error:', err.message);
    return [];
  }
}

const spoonCache = new Map();
const SPOON_CACHE_TTL = 60 * 60 * 1000;

async function searchSpoonacular(filteredIngredients, pantryNames, needed) {
  const apiKey = process.env.SPOONACULAR_API_KEY;
  if (!apiKey || needed <= 0) return [];

  const cacheKey = [...filteredIngredients].sort().join('|');
  const cached = spoonCache.get(cacheKey);
  if (cached && Date.now() - cached.cachedAt < SPOON_CACHE_TTL) {
    console.log('[Spoonacular] Cache hit');
    return cached.recipes;
  }

  try {
    const searchUrl = `https://api.spoonacular.com/recipes/findByIngredients?ingredients=${encodeURIComponent(filteredIngredients.join(','))}&number=${needed}&ranking=1&ignorePantry=false&apiKey=${apiKey}`;
    const searchResp = await fetchWithTimeout(searchUrl, 5000);
    if (!searchResp.ok) { console.error('[Spoonacular] Search error:', searchResp.status); return []; }
    const candidates = await searchResp.json();
    if (!Array.isArray(candidates) || candidates.length === 0) return [];

    const worthy = candidates.filter(c => {
      const used = c.usedIngredientCount || 0;
      const missed = c.missedIngredientCount || 0;
      return (used + missed) > 0 && (used / (used + missed)) * 100 >= 30;
    });
    if (worthy.length === 0) { console.log('[Spoonacular] No candidates passed quick score'); return []; }

    const details = await Promise.all(
      worthy.map(c =>
        fetchWithTimeout(`https://api.spoonacular.com/recipes/${c.id}/information?apiKey=${apiKey}`, 5000)
          .then(r => r.ok ? r.json() : null)
          .catch(() => null)
      )
    );
    console.log('[Spoonacular] Est. points used:', worthy.length, 'detail lookups');

    const recipes = [];
    for (const recipe of details) {
      if (!recipe) continue;
      const ingredients = (recipe.extendedIngredients || []).map(i => ({
        amount: Math.round((i.amount || 1) * 100) / 100,
        unit: normalizeUnit(i.unit || 'whole'),
        name: (i.name || '').toLowerCase(),
      }));
      const { score: matchScore } = calcMatchScore(ingredients, pantryNames);
      if (matchScore < 20) continue;
      const missing = calcMissing(ingredients, pantryNames);
      const mins = recipe.readyInMinutes || 30;
      const difficulty = mins <= 20 ? 'Easy' : mins <= 45 ? 'Medium' : 'Hard';
      const cookTime = `${mins} min`;
      const cuisine = recipe.cuisines?.[0] || recipe.dishTypes?.[0] || 'International';
      const steps = recipe.analyzedInstructions?.[0]?.steps?.map(s => s.step) || [];
      const thumbnail = (recipe.image || '').replace('312x231', '556x370') || null;
      const desc = cleanSpoonacularDescription(recipe.summary, recipe.title, cuisine, cookTime, difficulty, ingredients);

      recipes.push({
        title: recipe.title,
        description: desc,
        cookTime,
        difficulty,
        matchScore,
        missingIngredients: missing,
        cuisine,
        baseServings: recipe.servings || 4,
        ingredients,
        steps,
        source: 'spoonacular',
        sourceLabel: null,
        thumbnail,
        spoonacularId: recipe.id,
      });
    }

    recipes.sort((a, b) => b.matchScore - a.matchScore);
    spoonCache.set(cacheKey, { recipes, cachedAt: Date.now() });
    return recipes;
  } catch (err) {
    console.error('[Spoonacular] Error:', err.message);
    return [];
  }
}

async function searchTasty(filteredIngredients, pantryNames, needed) {
  const apiKey = process.env.RAPIDAPI_KEY;
  if (!apiKey || needed <= 0) {
    if (!apiKey) console.log('[Recipes] Tasty API not configured — skipping');
    return [];
  }

  try {
    const url = `https://tasty.p.rapidapi.com/recipes/list?from=0&size=${needed * 2}&q=${encodeURIComponent(filteredIngredients.join(' '))}`;
    const resp = await fetchWithTimeout(url, 5000);
    if (!resp.ok) { console.error('[Tasty] Search error:', resp.status); return []; }
    const data = await resp.json();
    const results = data.results || [];

    const recipes = [];
    for (const recipe of results) {
      const ingredients = (recipe.sections?.[0]?.components || []).map(c => ({
        amount: parseFloat(c.measurements?.[0]?.quantity) || 1,
        unit: normalizeUnit(c.measurements?.[0]?.unit?.name || 'item'),
        name: (c.ingredient?.name || c.raw_text || '').toLowerCase(),
      })).filter(i => i.name);

      const { score: matchScore } = calcMatchScore(ingredients, pantryNames);
      const missing = calcMissing(ingredients, pantryNames);
      const mins = recipe.total_time_minutes || 30;
      const difficulty = recipe.difficulty || (mins <= 20 ? 'Easy' : mins <= 45 ? 'Medium' : 'Hard');
      const cookTime = `${mins} min`;
      const cuisine = recipe.cuisine?.name || 'International';
      const steps = (recipe.instructions || []).map(i => i.display_text).filter(Boolean);
      const thumbnail = recipe.thumbnail_url || null;

      recipes.push({
        title: recipe.name,
        description: recipe.description || '',
        cookTime,
        difficulty,
        matchScore,
        missingIngredients: missing,
        cuisine,
        baseServings: recipe.num_servings || 4,
        ingredients,
        steps,
        source: 'tasty',
        sourceLabel: null,
        thumbnail,
        tastyId: recipe.id,
      });
    }

    recipes.sort((a, b) => b.matchScore - a.matchScore);
    console.log('[Recipes] Tasty returned:', recipes.length, 'recipes');
    return recipes;
  } catch (err) {
    console.error('[Tasty] Error:', err.message);
    return [];
  }
}

function validateRecipe(recipe) {
  if (!recipe.ingredients?.length) return recipe;
  const ingredientNames = recipe.ingredients.map(i => (i.name || '').toLowerCase().trim());
  recipe.missingIngredients = (recipe.missingIngredients || []).filter(missing => {
    const m = missing.toLowerCase().trim();
    return ingredientNames.some(name => name.includes(m) || m.includes(name));
  });
  recipe.matchScore = Math.round(
    ((recipe.ingredients.length - recipe.missingIngredients.length) / recipe.ingredients.length) * 100
  );
  return recipe;
}

// ── Recipe Catalog helpers ──────────────────────────────────────────────────
async function searchCatalog(ingredientNames, excludeIds, limit) {
  if (!adminDb) return [];
  const top5 = ingredientNames.filter(n => BASE_KEYWORDS.some(k => n.includes(k))).slice(0, 5);
  if (top5.length === 0) return [];

  try {
    let query = adminDb.collection('recipe_catalog')
      .where('indexedIngredients', 'array-contains-any', top5)
      .limit(limit * 3);

    const snap = await query.get();
    const results = [];
    for (const doc of snap.docs) {
      if (excludeIds.includes(doc.id)) continue;
      const data = doc.data();
      const { score: matchScore } = calcMatchScore(
        (data.ingredients || []).map(i => ({ name: i.name })),
        ingredientNames
      );
      if (matchScore >= 20) {
        const missing = calcMissing(
          (data.ingredients || []).map(i => ({ name: i.name })),
          ingredientNames
        );
        results.push({
          title: data.title,
          description: data.description || '',
          cookTime: data.cookTime || '30 min',
          difficulty: data.difficulty || 'Medium',
          matchScore,
          missingIngredients: missing,
          cuisine: data.cuisine || '',
          baseServings: data.baseServings || 4,
          ingredients: data.ingredients || [],
          steps: data.steps || [],
          source: data.source || 'catalog',
          thumbnail: data.thumbnail || null,
          spoonacularId: data.spoonacularId || null,
          mealDbId: data.mealDbId || null,
          tastyId: data.tastyId || null,
          catalogId: doc.id,
          nutrition: data.nutrition || null,
          sourceUrl: data.sourceUrl || null,
        });
      }
    }
    results.sort((a, b) => b.matchScore - a.matchScore);
    return results.slice(0, limit);
  } catch (err) {
    console.error('[Catalog] Search error:', err.message);
    return [];
  }
}

async function saveToCatalog(recipes, source) {
  if (!adminDb) return;
  for (const r of recipes) {
    try {
      if (!isValidRecipe(r)) {
        console.log('[Catalog] Rejected low-quality recipe:', r.title);
        continue;
      }
      const docId = source === 'spoonacular' ? String(r.spoonacularId)
        : source === 'themealdb' ? `mdb_${r.mealDbId}`
        : source === 'edamam' && r.edamamId ? `edm_${r.edamamId.split('#recipe_')[1] || r.edamamId.slice(-12)}`
        : source === 'tasty' && r.tastyId ? `tst_${r.tastyId}`
        : null;
      if (!docId) continue;

      const ref = adminDb.collection('recipe_catalog').doc(docId);
      const existing = await ref.get();
      if (existing.exists) {
        await ref.update({ useCount: FieldValue.increment(1) });
      } else {
        const indexedIngredients = (r.ingredients || [])
          .map(i => (i.name || '').toLowerCase().trim())
          .filter(Boolean);
        await ref.set({
          id: docId,
          source,
          spoonacularId: r.spoonacularId || null,
          mealDbId: r.mealDbId || null,
          tastyId: r.tastyId || null,
          title: r.title,
          description: r.description || '',
          cookTime: r.cookTime || '',
          difficulty: r.difficulty || '',
          cuisine: r.cuisine || '',
          baseServings: r.baseServings || 4,
          ingredients: r.ingredients || [],
          indexedIngredients,
          steps: r.steps || [],
          thumbnail: r.thumbnail || null,
          tags: r.tags || [],
          fetchedAt: FieldValue.serverTimestamp(),
          useCount: 1,
          nutrition: r.nutrition || null,
          sourceUrl: r.sourceUrl || null,
          avgRating: 0,
          ratingCount: 0,
          sourceData: {},
        });
      }
    } catch (err) {
      console.error('[Catalog] Save error:', err.message);
    }
  }
}

// ── POST /api/recipes — Hybrid: TheMealDB + Spoonacular + Claude ────────────
app.post('/api/recipes', async (req, res) => {
  const { ingredients, cuisineHint, dietaryFilters, cookTimeMax, difficulty, cuisineWeights, expiringIngredients, mealTypeHint, seenRecipeIds } = req.body;
  if (!ingredients?.length) return res.status(400).json({ error: 'ingredients array is required' });

  const pantryNames = extractIngredientNames(ingredients);
  const TARGET = 5;
  const excludeIds = Array.isArray(seenRecipeIds) ? seenRecipeIds : [];

  try {
    const searchTerms = pickSearchIngredients(pantryNames);
    console.log('[Recipes] Searching base ingredients:', searchTerms.join(', '));

    // Try catalog first (fast, free)
    const catalogHits = await searchCatalog(pantryNames, excludeIds, TARGET);
    let catalogRecipes = [];

    if (catalogHits.length >= 3) {
      console.log('[Recipes] Catalog hit:', catalogHits.length, 'recipes found');
      catalogRecipes = catalogHits;
    } else {
      console.log('[Recipes] Catalog miss — fetching from APIs');

      // Tier 1: TheMealDB and Tasty in parallel (both free)
      const filteredIngredients = searchTerms;
      const [dbRaw, tastyRaw] = await Promise.all([
        searchTheMealDB(searchTerms, pantryNames).catch(err => {
          console.error('[Recipes] TheMealDB failed:', err.message);
          return [];
        }),
        searchTasty(filteredIngredients, pantryNames, TARGET).catch(err => {
          console.error('[Recipes] Tasty failed:', err.message);
          return [];
        }),
      ]);

      let dbRecipes = dbRaw.filter(r => r.matchScore >= 20).sort((a, b) => b.matchScore - a.matchScore).slice(0, 3);
      console.log('[Recipes] TheMealDB returned:', dbRecipes.length, 'recipes');

      const seenTitles = new Set(dbRecipes.map(r => r.title.toLowerCase()));
      let tastyRecipes = tastyRaw.filter(r => !seenTitles.has(r.title.toLowerCase())).slice(0, TARGET - dbRecipes.length);
      tastyRecipes.forEach(r => seenTitles.add(r.title.toLowerCase()));

      // Tier 1.5: Edamam for any remaining slots
      const afterTier1 = dbRecipes.length + tastyRecipes.length;
      let edamamRecipes = [];
      if (afterTier1 < TARGET) {
        const edamamRaw = await searchEdamam(searchTerms, pantryNames, TARGET - afterTier1).catch(err => {
          console.error('[Recipes] Edamam failed:', err.message);
          return [];
        });
        edamamRecipes = edamamRaw.filter(r => !seenTitles.has(r.title.toLowerCase())).slice(0, TARGET - afterTier1);
        edamamRecipes.forEach(r => seenTitles.add(r.title.toLowerCase()));
        console.log('[Recipes] Edamam returned:', edamamRecipes.length, 'recipes');
      }

      // Tier 2: Spoonacular only if combined free results < 3 (conserve daily points)
      let spoonRecipes = [];
      const freeCount = dbRecipes.length + tastyRecipes.length + edamamRecipes.length;
      if (freeCount < 3) {
        const spoonRaw = await searchSpoonacular(searchTerms, pantryNames, TARGET - freeCount).catch(err => {
          console.error('[Recipes] Spoonacular failed:', err.message);
          return [];
        });
        spoonRecipes = spoonRaw.filter(r => !seenTitles.has(r.title.toLowerCase())).slice(0, TARGET - freeCount);
        spoonRecipes.forEach(r => seenTitles.add(r.title.toLowerCase()));
        console.log('[Recipes] Spoonacular returned:', spoonRecipes.length, 'recipes');
      }

      // Save all API results to catalog (background, don't await)
      saveToCatalog(dbRecipes, 'themealdb').catch(() => {});
      saveToCatalog(tastyRecipes, 'tasty').catch(() => {});
      saveToCatalog(edamamRecipes, 'edamam').catch(() => {});
      saveToCatalog(spoonRecipes, 'spoonacular').catch(() => {});

      // Combine catalog partial hits with fresh API results, deduplicate
      const combined = [...catalogHits];
      const usedTitles = new Set(combined.map(r => r.title.toLowerCase()));
      for (const r of [...dbRecipes, ...tastyRecipes, ...edamamRecipes, ...spoonRecipes]) {
        if (!usedTitles.has(r.title.toLowerCase())) {
          usedTitles.add(r.title.toLowerCase());
          combined.push(r);
        }
      }
      catalogRecipes = combined;
    }

    const existingTitles = catalogRecipes.map(r => r.title);

    // Tier 3: Claude Haiku for remaining slots
    const needed = Math.max(1, TARGET - catalogRecipes.length);
    console.log('[Recipes] Claude needs to fill:', needed, 'slots');

    const cuisineClause = cuisineHint && cuisineHint !== 'Any' ? `Focus on ${cuisineHint} cuisine.` : '';
    let dietaryClause = '';
    if (dietaryFilters?.length) {
      const RESTRICTION_DETAILS = {
        'no-pork': 'Contains absolutely NO pork, ham, bacon, or pork products',
        'no-beef': 'Contains absolutely NO beef, veal, or beef products',
        'no-shellfish': 'Contains NO shellfish, shrimp, crab, lobster, or clams',
        'halal': 'All ingredients must be Halal. No pork, no alcohol',
        'kosher': 'All ingredients must be Kosher. No pork, no shellfish, no mixing of meat and dairy',
        'no-alcohol': 'No wine, beer, spirits, or alcohol of any kind even for cooking',
        'egg-free': 'Contains absolutely NO eggs or egg products',
        'soy-free': 'Contains NO soy, tofu, edamame, or soy sauce',
        'low-sodium': 'All recipes must be low sodium. No added salt, use herbs and spices instead',
        'low-sugar': 'Low sugar, low glycemic index recipes only',
        'keto': 'Strict keto: high fat, very low carb (under 20g net carbs)',
        'paleo': 'Strict paleo: no grains, no dairy, no legumes, no processed foods',
        'no-spicy': 'No chili, hot sauce, jalapeños, or spicy ingredients',
        'no-raw-fish': 'No sushi, sashimi, ceviche, or any raw fish preparation',
        'flexitarian': 'Mostly plant-based recipes, minimal meat',
      };
      const details = dietaryFilters.map(f => RESTRICTION_DETAILS[f] || f).join('. ');
      dietaryClause = `\nDIETARY RESTRICTIONS (MANDATORY — NEVER VIOLATE): ${details}. Every single recipe must comply with ALL of these restrictions.`;
    }
    let timeClause = '';
    if (cookTimeMax) timeClause = `\nTIME CONSTRAINT: Each recipe must take no more than ${cookTimeMax} minutes.`;
    let difficultyClause = '';
    if (difficulty && difficulty !== 'Any') difficultyClause = `\nDIFFICULTY: All recipes must be ${difficulty}.`;
    let cuisineWeightClause = '';
    if (cuisineWeights?.length && (!cuisineHint || cuisineHint === 'Any')) cuisineWeightClause = `\nCUISINE PREFERENCE: Lean toward ${cuisineWeights.join(' and ')}.`;
    let expiringClause = '';
    if (expiringIngredients?.length) expiringClause = `\nPRIORITY EXPIRING: Must use these: ${expiringIngredients.join(', ')}.`;
    let mealTypeClause = '';
    if (mealTypeHint) mealTypeClause = `\nMEAL TYPE: ${mealTypeHint}.`;

    const allExcludeTitles = [...existingTitles];
    if (excludeIds.length > 0) allExcludeTitles.push(...excludeIds);
    const excludeClause = allExcludeTitles.length > 0
      ? `\nDo NOT suggest any of these already found recipes: ${allExcludeTitles.join(', ')}.`
      : '';

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 3000,
        messages: [{
          role: 'user',
          content: `You are an experienced chef. A home cook has: ${ingredients.join(', ')}
${cuisineClause}${dietaryClause}${timeClause}${difficultyClause}${cuisineWeightClause}${expiringClause}${mealTypeClause}${excludeClause}

Suggest ${needed} genuinely appealing recipes. Real named dishes, not generic combos.
Return ONLY a valid JSON array of exactly ${needed} recipe objects with these fields:
{
  "title": "Dish name",
  "description": "1-2 sentences",
  "cookTime": "25 min",
  "difficulty": "Easy" | "Medium" | "Hard",
  "matchScore": 0-100,
  "missingIngredients": ["item1"],
  "cuisine": "Italian",
  "baseServings": 2,
  "ingredients": [{ "amount": 2, "unit": "cup", "name": "flour" }],
  "steps": ["Step 1", "Step 2"]
}
Use numeric amounts only. No markdown, no preamble.
CRITICAL: missingIngredients must ONLY contain names that also appear in the ingredients array. It is a filtered subset of ingredients — nothing more.`,
        }],
      }),
    });

    let aiRecipes = [];
    if (response.ok) {
      const data = await response.json();
      const raw = data.content?.[0]?.text || '[]';
      const cleaned = raw.replace(/```json|```/g, '').trim();
      const parsed = JSON.parse(cleaned);
      aiRecipes = (Array.isArray(parsed) ? parsed : []).map(r => validateRecipe({
        ...r,
        source: 'ai',
        sourceLabel: 'AI Generated',
      }));
    } else {
      console.error('Anthropic error:', await response.text());
    }

    const allRecipes = [...catalogRecipes, ...aiRecipes];
    allRecipes.sort((a, b) => (b.matchScore || 0) - (a.matchScore || 0));
    const finalRecipes = allRecipes.slice(0, TARGET);
    console.log('[Recipes] Returning', finalRecipes.length, 'total recipes');

    // Increment useCount for catalog recipes being served (background)
    if (adminDb) {
      for (const r of finalRecipes) {
        const catId = r.catalogId || (r.spoonacularId ? String(r.spoonacularId) : r.mealDbId ? `mdb_${r.mealDbId}` : null);
        if (catId) adminDb.collection('recipe_catalog').doc(catId).update({ useCount: FieldValue.increment(1) }).catch(() => {});
      }
    }

    res.json({ recipes: finalRecipes });
  } catch (err) {
    console.error('Recipe error:', err);
    res.status(500).json({ error: 'Recipe generation failed' });
  }
});

// ── POST /api/scan-receipt — OpenAI GPT-4o receipt parsing ───────────────────
function loadStoreAbbreviations() {
  try { return JSON.parse(fs.readFileSync(resolve(__dirname, 'data', 'storeAbbreviations.json'), 'utf-8')); }
  catch { return {}; }
}

function appendScanLog(entry) {
  const logPath = resolve(__dirname, 'data', 'receiptScanLog.json');
  try {
    const log = JSON.parse(fs.readFileSync(logPath, 'utf-8'));
    log.push(entry);
    fs.writeFileSync(logPath, JSON.stringify(log, null, 2));
  } catch {
    fs.writeFileSync(logPath, JSON.stringify([entry], null, 2));
  }
}

app.post('/api/scan-receipt', async (req, res) => {
  const { imageBase64, mimeType, storeName } = req.body;
  if (!imageBase64) return res.status(400).json({ error: 'imageBase64 is required' });

  const allAbbrevs = loadStoreAbbreviations();
  const storeHint = storeName ? storeName.toLowerCase().trim() : '';
  const storeAbbrevs = storeHint && allAbbrevs[storeHint] ? allAbbrevs[storeHint] : null;

  let abbrevsContext = '';
  if (storeAbbrevs) {
    const pairs = Object.entries(storeAbbrevs).filter(([,v]) => v).map(([k, v]) => `${k} = ${v}`).join(', ');
    abbrevsContext = `\nKnown abbreviations for this store: ${pairs}`;
  }

  const prompt = `This is a grocery store receipt. Extract only food and beverage items.
Strip all non-food line items including: prices, subtotals, tax, store name, address, phone number, cashier info, loyalty points, coupons, transaction IDs, payment method lines, and any non-food household items (cleaning supplies, toiletries, batteries, etc.) unless they are a cooking ingredient.

For each food item:
- Clean up abbreviations and shorthand into full readable names (e.g. 'BRDCRMB' → 'bread crumbs', 'CHKN BRST BNL' → 'boneless chicken breast')
- Use the store name to help decode store-specific abbreviations if known
- Extract quantity if shown (2x, x2, 2 @ = quantity 2), default to 1 if not shown
- Extract weight if shown (0.73 lb, 1.2 kg = that weight and unit)
- For multi-packs in the name (12PK, 6PACK, 24CT): extract the count as quantity and set unit to 'can', 'bottle', or 'item'. Examples:
    'CORONA 12PK' → name: 'Corona', quantity: 12, unit: 'can'
    'EGGS 18CT' → name: 'Eggs', quantity: 18, unit: 'item'
    'CHICKEN BREAST 1.73LB' → name: 'Chicken Breast', quantity: 1.73, unit: 'lb'
    'MILK 1GAL' → name: 'Milk', quantity: 1, unit: 'gallon'
- Assign a sensible unit: 'item' for whole goods, 'lb' if weight shown, 'oz' if ounces shown, 'can' for canned goods, 'bottle' for bottles, 'bag' for bagged goods, 'box' for boxed goods
${abbrevsContext}
Return ONLY a valid JSON object in this exact format, no markdown, no preamble:
{
  "detectedStore": "store name or null",
  "ingredients": [
    { "name": "boneless chicken breast", "quantity": 1.73, "unit": "lb" }
  ]
}`;

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        max_tokens: 1500,
        messages: [{
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            { type: 'image_url', image_url: { url: `data:${mimeType || 'image/jpeg'};base64,${imageBase64}` } },
          ],
        }],
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      console.error('OpenAI receipt error:', err);
      return res.status(502).json({ error: 'Failed to analyze receipt' });
    }

    const data = await response.json();
    const raw = data.choices?.[0]?.message?.content || '{}';
    const cleaned = raw.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(cleaned);

    const ingredients = Array.isArray(parsed.ingredients) ? parsed.ingredients : [];
    const detectedStore = parsed.detectedStore || null;

    appendScanLog({
      timestamp: new Date().toISOString(),
      detectedStore,
      rawItemCount: ingredients.length,
      parsedItemCount: ingredients.filter(i => i.name).length,
    });

    res.json({ ingredients, detectedStore });
  } catch (err) {
    console.error('Receipt scan error:', err);
    res.status(500).json({ error: 'Receipt scan failed' });
  }
});

// ── POST /api/store-abbreviations/add — learn new abbreviations ─────────────
app.post('/api/store-abbreviations/add', async (req, res) => {
  const { store, abbreviation, fullName } = req.body;
  if (!store || !abbreviation || !fullName) {
    return res.status(400).json({ error: 'store, abbreviation, and fullName are required' });
  }

  try {
    const filePath = resolve(__dirname, 'data', 'storeAbbreviations.json');
    const all = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    const key = store.toLowerCase().trim();
    if (!all[key]) all[key] = {};
    all[key][abbreviation] = fullName;
    fs.writeFileSync(filePath, JSON.stringify(all, null, 2));
    res.json({ ok: true });
  } catch (err) {
    console.error('Abbreviation add error:', err);
    res.status(500).json({ error: 'Failed to save abbreviation' });
  }
});

function parseOFFQuantity(quantityStr) {
  if (!quantityStr) return { quantity: 1, unit: 'item' };
  const str = quantityStr.toLowerCase().trim();

  // Multi-pack: "12 x 355 ml" or "6 x 12 fl oz"
  const multiPack = str.match(/^(\d+)\s*x\s*([\d.]+)\s*([a-z\s.]+)/);
  if (multiPack) {
    return {
      quantity: parseInt(multiPack[1]),
      unit: 'item',
      itemSize: parseFloat(multiPack[2]),
      itemUnit: multiPack[3].trim(),
    };
  }

  // Single with unit: "355 ml", "1 kg", "24 fl oz"
  const single = str.match(/^([\d.]+)\s*([a-z\s.]+)/);
  if (single) {
    const num = parseFloat(single[1]);
    const u = single[2].trim();
    if (u.includes('ml')) return { quantity: num, unit: 'ml' };
    if (u === 'l' || u === 'litre' || u === 'liter') return { quantity: Math.round(num * 1000), unit: 'ml' };
    if (u.includes('fl oz') || u.includes('fl. oz')) return { quantity: num, unit: 'fl oz' };
    if (u.includes('oz')) return { quantity: num, unit: 'oz' };
    if (u.includes('kg')) return { quantity: num, unit: 'kg' };
    if (u === 'g' || u === 'gr' || u === 'gram' || u === 'grams') return { quantity: num, unit: 'g' };
    if (u.includes('lb')) return { quantity: num, unit: 'lb' };
    return { quantity: num, unit: u };
  }

  return { quantity: 1, unit: 'item' };
}

function packagingUnit(packagingStr) {
  if (!packagingStr) return null;
  const p = packagingStr.toLowerCase();
  if (p.includes('can')) return 'can';
  if (p.includes('bottle')) return 'bottle';
  if (p.includes('bag')) return 'bag';
  if (p.includes('box')) return 'box';
  if (p.includes('jar')) return 'jar';
  if (p.includes('carton')) return 'carton';
  if (p.includes('pouch')) return 'pouch';
  return null;
}

// ── POST /api/scan-barcode — GPT-4o barcode extraction + Open Food Facts ──────
app.post('/api/scan-barcode', async (req, res) => {
  const { imageBase64, mimeType } = req.body;
  if (!imageBase64) return res.status(400).json({ error: 'imageBase64 is required' });

  try {
    const visionResp = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        max_tokens: 100,
        messages: [{
          role: 'user',
          content: [
            { type: 'text', text: 'Look at this image and find any barcode or QR code. Return ONLY the barcode number as a plain string with no spaces, dashes, or other characters. If no barcode is found, return null. Example response: 0123456789012' },
            { type: 'image_url', image_url: { url: `data:${mimeType || 'image/jpeg'};base64,${imageBase64}` } },
          ],
        }],
      }),
    });

    if (!visionResp.ok) {
      console.error('OpenAI barcode error:', await visionResp.text());
      return res.json({ error: 'scan_failed', message: 'Barcode scan failed. Please try again.' });
    }

    const visionData = await visionResp.json();
    const barcodeRaw = (visionData.choices?.[0]?.message?.content || '').trim();
    const barcode = barcodeRaw.replace(/[^0-9]/g, '');

    if (!barcode || barcodeRaw.toLowerCase() === 'null') {
      return res.json({ error: 'no_barcode', message: 'No barcode detected. Try better lighting or a clearer angle.' });
    }

    // Check community-verified cache first
    if (adminDb) {
      try {
        const verifiedDoc = await adminDb.collection('verified_products').doc(barcode).get();
        if (verifiedDoc.exists) {
          const vd = verifiedDoc.data();
          if (vd.confirmCount >= 2) {
            return res.json({
              ingredients: [{ name: vd.name, quantity: vd.quantity, unit: vd.unit }],
              productName: vd.originalName,
              brand: null,
              barcode,
              communityVerified: true,
              itemSize: vd.itemSize || null,
            });
          }
        }
      } catch (e) { /* non-fatal, fall through to OFF */ }
    }

    const offResp = await fetch(`https://world.openfoodfacts.org/api/v0/product/${barcode}.json`);
    const offData = await offResp.json();

    if (!offData || offData.status === 0) {
      return res.json({ error: 'not_found', message: 'Product not found in database. Try adding manually.', barcode });
    }

    const product = offData.product || {};
    const productName = product.product_name || product.product_name_en || 'Unknown product';
    const brand = product.brands || null;
    const pkgUnit = packagingUnit(product.packaging);

    const parsed = parseOFFQuantity(product.quantity);
    let { quantity, unit, itemSize, itemUnit } = parsed;

    let ingredientName;
    let resolvedItemSize = null;

    if (itemSize) {
      if (pkgUnit) unit = pkgUnit;
      resolvedItemSize = `${itemSize}${itemUnit}`;
      ingredientName = `${productName} (${quantity} x ${itemSize}${itemUnit})`;
    } else {
      if (quantity === 1 && unit === 'item' && pkgUnit) unit = pkgUnit;
      const sizeLabel = product.quantity ? product.quantity.trim() : null;
      ingredientName = sizeLabel ? `${productName} (${sizeLabel})` : productName;
    }

    // Save to verified_products with confirmCount 0 (seeds the cache)
    if (adminDb) {
      adminDb.collection('verified_products').doc(barcode).set({
        barcode,
        originalName: productName,
        name: ingredientName,
        quantity,
        unit,
        itemSize: resolvedItemSize,
        confirmCount: 0,
        lastConfirmedAt: FieldValue.serverTimestamp(),
        source: 'open_food_facts',
      }, { merge: true }).catch(() => {});
    }

    res.json({
      ingredients: [{ name: ingredientName, quantity, unit }],
      productName, brand, barcode, itemSize: resolvedItemSize,
    });
  } catch (err) {
    console.error('Barcode scan error:', err);
    res.json({ error: 'scan_failed', message: 'Barcode scan failed. Please try again.' });
  }
});

// ── POST /api/scan-barcode/confirm — record user-verified barcode correction ──
app.post('/api/scan-barcode/confirm', async (req, res) => {
  const { barcode, originalName, name, quantity, unit, itemSize, uid } = req.body;
  if (!barcode || !name || !uid) return res.status(400).json({ error: 'barcode, name, uid required' });
  if (!adminDb) return res.status(503).json({ error: 'Database unavailable' });
  try {
    const ref = adminDb.collection('verified_products').doc(barcode);
    const snap = await ref.get();
    if (snap.exists) {
      await ref.update({
        name, quantity, unit, itemSize: itemSize || null,
        originalName: originalName || snap.data().originalName,
        confirmedBy: uid,
        confirmCount: FieldValue.increment(1),
        lastConfirmedAt: FieldValue.serverTimestamp(),
        source: 'user_correction',
      });
    } else {
      await ref.set({
        barcode, originalName: originalName || name, name, quantity, unit,
        itemSize: itemSize || null, confirmedBy: uid,
        confirmCount: 1, lastConfirmedAt: FieldValue.serverTimestamp(),
        source: 'user_correction',
      });
    }
    res.json({ ok: true });
  } catch (err) {
    console.error('Barcode confirm error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/substitutions — Anthropic Claude substitution suggestions ──────
app.post('/api/substitutions', async (req, res) => {
  const { ingredient, recipeTitle, recipeContext } = req.body;
  if (!ingredient) return res.status(400).json({ error: 'ingredient is required' });

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 800,
        messages: [{
          role: 'user',
          content: `A home cook is making '${recipeTitle || 'a recipe'}' and doesn't have '${ingredient}'.${recipeContext ? ` Recipe context: ${recipeContext}` : ''}
Suggest 3 practical substitutions that would work in this recipe.
For each substitution return JSON with:
{
  "name": "the substitute ingredient",
  "ratio": "how much to use, e.g. '1:1', 'use 3/4 the amount'",
  "notes": "1 sentence on flavor/texture difference",
  "commonlyAvailable": true or false
}
Return ONLY a valid JSON array of 3 substitution objects. No markdown, no preamble.`,
        }],
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      console.error('Substitution API error:', err);
      return res.status(502).json({ error: 'Failed to get substitutions' });
    }

    const data = await response.json();
    const raw = data.content?.[0]?.text || '[]';
    const cleaned = raw.replace(/```json|```/g, '').trim();
    const substitutions = JSON.parse(cleaned);
    res.json({ substitutions: Array.isArray(substitutions) ? substitutions : [] });
  } catch (err) {
    console.error('Substitution error:', err);
    res.status(500).json({ error: 'Substitution suggestion failed' });
  }
});

// ── POST /api/delete-account — Account deletion with 7-day grace period ──────
app.post('/api/delete-account', async (req, res) => {
  if (!adminAuth) return res.status(503).json({ error: 'Account deletion temporarily unavailable. Please contact support.' });
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing auth token' });
  }

  try {
    const token = authHeader.split('Bearer ')[1];
    const decoded = await adminAuth.verifyIdToken(token);
    const uid = decoded.uid;
    const email = decoded.email || '';

    const scheduledFor = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    // Handle household ownership
    const householdsSnap = await adminDb.collection('households').where('createdBy', '==', uid).get();
    for (const hDoc of householdsSnap.docs) {
      const hData = hDoc.data();
      const members = hData.members || [];
      const coAdmins = members.filter(m => m.role === 'co-admin').sort((a, b) =>
        (a.joinedAt?.toDate?.() || 0) - (b.joinedAt?.toDate?.() || 0)
      );
      if (coAdmins.length > 0) {
        const newOwner = coAdmins[0];
        const updatedMembers = members.map(m =>
          m.uid === newOwner.uid ? { ...m, role: 'owner' } : m
        ).filter(m => m.uid !== uid);
        await hDoc.ref.update({ createdBy: newOwner.uid, members: updatedMembers });
      } else {
        await hDoc.ref.update({
          disbanded: true,
          disbandedAt: FieldValue.serverTimestamp(),
          disbandedReason: 'owner_deleted_account',
        });
      }
    }

    // Remove from households where just a member
    const allHouseholdsSnap = await adminDb.collection('households').get();
    for (const hDoc of allHouseholdsSnap.docs) {
      const members = hDoc.data().members || [];
      if (members.some(m => m.uid === uid) && hDoc.data().createdBy !== uid) {
        await hDoc.ref.update({
          members: members.filter(m => m.uid !== uid),
        });
      }
    }

    // Anonymize public recipes
    const publicSnap = await adminDb.collection('public_recipes').where('authorUid', '==', uid).get();
    for (const pDoc of publicSnap.docs) {
      await pDoc.ref.update({ authorName: 'Community Member', authorUid: 'deleted' });
    }

    // Create pending deletion record
    await adminDb.collection('pending_deletions').doc(uid).set({
      uid,
      email,
      requestedAt: FieldValue.serverTimestamp(),
      scheduledFor: Timestamp.fromDate(scheduledFor),
      status: 'pending',
    });

    res.json({ success: true, scheduledFor: scheduledFor.toISOString() });
  } catch (err) {
    console.error('Delete account error:', err);
    res.status(500).json({ error: 'Account deletion failed' });
  }
});

// ── POST /api/delete-account/cancel — Cancel pending deletion ─────────────────
app.post('/api/delete-account/cancel', async (req, res) => {
  if (!adminAuth) return res.status(503).json({ error: 'Account deletion temporarily unavailable. Please contact support.' });
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) return res.status(401).json({ error: 'Missing auth token' });

  try {
    const decoded = await adminAuth.verifyIdToken(authHeader.split('Bearer ')[1]);
    await adminDb.collection('pending_deletions').doc(decoded.uid).delete();
    res.json({ success: true });
  } catch (err) {
    console.error('Cancel deletion error:', err);
    res.status(500).json({ error: 'Failed to cancel deletion' });
  }
});

// ── POST /api/delete-account/now — Immediate full deletion ───────────────────
async function deleteSubcollection(parentPath, subcollection) {
  const snap = await adminDb.collection(`${parentPath}/${subcollection}`).get();
  if (snap.empty) return;
  const batch = adminDb.batch();
  snap.docs.forEach(d => batch.delete(d.ref));
  await batch.commit();
}

app.post('/api/delete-account/now', async (req, res) => {
  if (!adminAuth) return res.status(503).json({ error: 'Account deletion temporarily unavailable. Please contact support.' });
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) return res.status(401).json({ error: 'Missing auth token' });

  try {
    const decoded = await adminAuth.verifyIdToken(authHeader.split('Bearer ')[1]);
    const uid = decoded.uid;

    await Promise.all([
      deleteSubcollection(`pantry/${uid}`, 'items'),
      deleteSubcollection(`saved_recipes/${uid}`, 'recipes'),
      deleteSubcollection(`cook_history/${uid}`, 'entries'),
      deleteSubcollection(`substitutions/${uid}`, 'entries'),
      deleteSubcollection(`grocery/${uid}`, 'items'),
      deleteSubcollection(`meal_plan/${uid}`, 'days'),
    ]);

    // Handle households
    const ownedSnap = await adminDb.collection('households').where('createdBy', '==', uid).get();
    for (const hDoc of ownedSnap.docs) {
      const members = hDoc.data().members || [];
      const coAdmins = members.filter(m => m.role === 'co-admin').sort((a, b) =>
        (a.joinedAt?.toDate?.() || 0) - (b.joinedAt?.toDate?.() || 0)
      );
      if (coAdmins.length > 0) {
        const newOwner = coAdmins[0];
        await hDoc.ref.update({
          createdBy: newOwner.uid,
          members: members.map(m => m.uid === newOwner.uid ? { ...m, role: 'owner' } : m).filter(m => m.uid !== uid),
        });
      } else {
        await hDoc.ref.update({ disbanded: true, disbandedAt: FieldValue.serverTimestamp(), disbandedReason: 'owner_deleted_account' });
      }
    }

    const allHH = await adminDb.collection('households').get();
    for (const hDoc of allHH.docs) {
      const members = hDoc.data().members || [];
      if (members.some(m => m.uid === uid) && hDoc.data().createdBy !== uid) {
        await hDoc.ref.update({ members: members.filter(m => m.uid !== uid) });
      }
    }

    // Anonymize public recipes
    const publicSnap = await adminDb.collection('public_recipes').where('authorUid', '==', uid).get();
    for (const pDoc of publicSnap.docs) {
      await pDoc.ref.update({ authorName: 'Community Member', authorUid: 'deleted' });
    }

    // Delete user doc and pending deletion
    await adminDb.collection('users').doc(uid).delete().catch(() => {});
    await adminDb.collection('pending_deletions').doc(uid).delete().catch(() => {});

    // Delete Firebase Auth user
    await adminAuth.deleteUser(uid).catch(err => console.error('Auth delete error:', err));

    res.json({ success: true });
  } catch (err) {
    console.error('Immediate delete error:', err);
    res.status(500).json({ error: 'Account deletion failed' });
  }
});

// ── Admin routes — Catalog Management ────────────────────────────────────────
const ADMIN_UID = process.env.ADMIN_UID;

async function verifyAdmin(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ') || !adminAuth || !ADMIN_UID) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  try {
    const decoded = await adminAuth.verifyIdToken(authHeader.split('Bearer ')[1]);
    if (decoded.uid !== ADMIN_UID) return res.status(403).json({ error: 'Not admin' });
    req.adminUid = decoded.uid;
    next();
  } catch { res.status(403).json({ error: 'Invalid token' }); }
}

let seedState = { running: false, stop: false, logs: [], saved: 0, total: 0, pointsUsed: 0 };

app.post('/api/admin/seed-catalog', verifyAdmin, async (req, res) => {
  if (seedState.running) return res.json({ error: 'Seed already running' });

  const apiKey = process.env.SPOONACULAR_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'SPOONACULAR_API_KEY not set' });

  const ingredients = req.body.ingredients?.length ? req.body.ingredients : [
    'chicken breast', 'ground beef', 'eggs', 'salmon', 'shrimp', 'tofu', 'pork',
    'pasta', 'rice', 'garlic', 'onion', 'tomato', 'potato', 'broccoli',
    'cheese', 'butter', 'chicken garlic', 'beef onion', 'pasta tomato',
    'rice chicken', 'salmon lemon', 'shrimp garlic butter',
  ];

  seedState = { running: true, stop: false, logs: [], saved: 0, total: ingredients.length, pointsUsed: 0 };
  res.json({ started: true, total: ingredients.length });

  (async () => {
    for (let i = 0; i < ingredients.length; i++) {
      if (seedState.stop || seedState.pointsUsed >= 45) {
        seedState.logs.push(seedState.stop ? 'Stopped by admin.' : 'Point limit reached.');
        break;
      }
      const query = ingredients[i];
      seedState.logs.push(`Fetching: ${query}`);

      try {
        const searchUrl = `https://api.spoonacular.com/recipes/findByIngredients?ingredients=${encodeURIComponent(query)}&number=8&ranking=1&ignorePantry=false&apiKey=${apiKey}`;
        const searchResp = await fetch(searchUrl);
        if (searchResp.status === 402) { seedState.logs.push('Spoonacular daily quota exhausted.'); break; }
        if (!searchResp.ok) { seedState.logs.push(`Search error ${searchResp.status}`); continue; }
        const candidates = await searchResp.json();
        seedState.pointsUsed++;

        for (const c of candidates) {
          if (seedState.stop || seedState.pointsUsed >= 45) break;
          const docId = String(c.id);
          const existing = await adminDb.collection('recipe_catalog').doc(docId).get();
          if (existing.exists) continue;

          await new Promise(r => setTimeout(r, 500));
          const detailUrl = `https://api.spoonacular.com/recipes/${c.id}/information?apiKey=${apiKey}&includeNutrition=true`;
          const detailResp = await fetch(detailUrl);
          if (detailResp.status === 402) { seedState.logs.push('Spoonacular daily quota exhausted.'); break; }
          if (!detailResp.ok) continue;
          const recipe = await detailResp.json();
          seedState.pointsUsed++;

          const recipeIngredients = (recipe.extendedIngredients || []).map(ing => ({
            amount: Math.round((ing.amount || 1) * 100) / 100,
            unit: ing.unit || 'whole',
            name: (ing.name || '').toLowerCase(),
          }));
          const mins = recipe.readyInMinutes || 30;
          const steps = recipe.analyzedInstructions?.[0]?.steps?.map(s => s.step) || [];
          const desc = stripHtml(recipe.summary || '').slice(0, 200);
          const nutrients = recipe.nutrition?.nutrients || [];
          const findNutrient = (name) => nutrients.find(n => n.name === name)?.amount || 0;
          const servings = recipe.servings || 4;

          await adminDb.collection('recipe_catalog').doc(docId).set({
            id: docId, source: 'spoonacular', spoonacularId: recipe.id, mealDbId: null,
            title: recipe.title,
            description: desc + (desc.length >= 200 ? '...' : ''),
            cookTime: `${mins} min`,
            difficulty: mins <= 20 ? 'Easy' : mins <= 45 ? 'Medium' : 'Hard',
            cuisine: recipe.cuisines?.[0] || recipe.dishTypes?.[0] || 'International',
            baseServings: servings, ingredients: recipeIngredients,
            indexedIngredients: recipeIngredients.map(i => i.name).filter(Boolean),
            steps, thumbnail: (recipe.image || '').replace('312x231', '556x370') || null,
            tags: [...(recipe.cuisines || []), ...(recipe.dishTypes || [])],
            fetchedAt: FieldValue.serverTimestamp(), useCount: 0,
            nutrition: {
              calories: Math.round(findNutrient('Calories') / servings),
              protein: Math.round(findNutrient('Protein') / servings),
              carbs: Math.round(findNutrient('Carbohydrates') / servings),
              fat: Math.round(findNutrient('Fat') / servings),
              fiber: Math.round(findNutrient('Fiber') / servings),
            },
            sourceUrl: recipe.sourceUrl || null, avgRating: 0, ratingCount: 0, sourceData: {},
          });

          seedState.saved++;
          seedState.logs.push(`Saved: ${recipe.title}`);
        }
      } catch (err) {
        seedState.logs.push(`Error: ${err.message}`);
      }
    }
    seedState.running = false;
    seedState.logs.push(`Done. ${seedState.saved} recipes saved, ${seedState.pointsUsed} pts used.`);
  })();
});

app.post('/api/admin/seed-catalog/stop', verifyAdmin, (_req, res) => {
  seedState.stop = true;
  res.json({ stopped: true });
});

app.get('/api/admin/seed-catalog/status', verifyAdmin, (_req, res) => {
  res.json(seedState);
});

app.get('/api/admin/catalog/stats', verifyAdmin, async (_req, res) => {
  try {
    const snap = await adminDb.collection('recipe_catalog').get();
    const bySource = { spoonacular: 0, themealdb: 0, edamam: 0, other: 0 };
    let hasNutrition = 0;
    for (const doc of snap.docs) {
      const d = doc.data();
      bySource[d.source] = (bySource[d.source] || 0) + 1;
      if (d.nutrition?.calories > 0) hasNutrition++;
    }
    const configSnap = await adminDb.collection('config').doc('catalog_sync').get();
    const syncData = configSnap.exists ? configSnap.data() : {};
    res.json({ total: snap.size, bySource, hasNutrition, lastSync: syncData.lastSyncAt || null });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/admin/catalog/recipes', verifyAdmin, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const pageLimit = parseInt(req.query.limit) || 20;
    const sourceFilter = req.query.source || null;

    let q = adminDb.collection('recipe_catalog').orderBy('title');
    if (sourceFilter) q = q.where('source', '==', sourceFilter);
    const snap = await q.get();

    const all = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    const start = (page - 1) * pageLimit;
    res.json({ recipes: all.slice(start, start + pageLimit), total: all.length, page });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/admin/catalog/recipes/:id', verifyAdmin, async (req, res) => {
  try {
    await adminDb.collection('recipe_catalog').doc(req.params.id).delete();
    res.json({ deleted: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

const PORT = process.env.PORT || 3003;
app.listen(PORT, () => console.log(`My Pantry Club API listening on :${PORT}`));
