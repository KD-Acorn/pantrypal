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
import { contentSafetyCheck, inferCategory, hasDrinkSignal, SAVORY_PATTERNS } from './utils/catalogClassifier.js';
import { getUsage, recordUsage, wouldExceedSafetyCap, getTagOffset, setTagOffset, MONTHLY_LIMIT, SAFETY_CAP } from './scripts/tastyQuota.js';

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
  methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

app.get('/health', (_req, res) => res.json({ ok: true }));

// ── Category corrections cache — refreshed hourly, injected into scan prompt ─
let _correctionsBlock = '';
let _correctionsBlockAt = 0;

async function refreshCorrectionsBlock() {
  if (!adminDb) return;
  try {
    const snap = await adminDb.collection('category_corrections')
      .orderBy('totalCorrections', 'desc')
      .limit(30)
      .get();
    const lines = [];
    for (const d of snap.docs) {
      const data = d.data();
      const entries = Object.entries(data.votes || {});
      if (!entries.length) continue;
      entries.sort((a, b) => b[1] - a[1]);
      const [topCat, topVotes] = entries[0];
      if (topVotes >= 2) lines.push(`  "${data.displayName || d.id}" → ${topCat}`);
    }
    _correctionsBlock = lines.length
      ? `\nKnown item corrections — when you identify one of these, use the noted category:\n${lines.join('\n')}\n`
      : '';
    _correctionsBlockAt = Date.now();
  } catch {
    // Non-critical — scan still works without corrections
  }
}

// Load on startup
refreshCorrectionsBlock();

// ── POST /api/scan — OpenAI GPT-4o vision ──────────────────────────────────
app.post('/api/scan', async (req, res) => {
  const { imageBase64, mimeType } = req.body;
  if (!imageBase64) return res.status(400).json({ error: 'imageBase64 is required' });

  // Refresh corrections block if stale (> 1 hour)
  if (Date.now() - _correctionsBlockAt > 3600_000) refreshCorrectionsBlock();

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
              text: `Look at this image of a kitchen, fridge, or pantry.${_correctionsBlock}

TASK 1 — Identify food ingredients:
List every food ingredient you can identify visually. For each item:
- If you can count individual items, return that count as quantity
- If you see a package, try to read the size from the label
- Assign the most logical unit: 'item' for whole fruits/vegetables you can count, 'bottle' for bottles, 'can' for cans, 'bag' for bags, 'box' for boxes, 'bunch' for herbs or bananas, 'lb' or 'oz' if weight is visible on packaging
- Default to quantity 1 if count is unclear

BEVERAGES & BOTTLES — read labels carefully:
Pay close attention to any bottles, cans, cartons, or jugs. Read the brand name and product name from the label or logo to identify the specific product — do NOT guess from bottle shape alone.
- Alcoholic beverages: beer (e.g. "Corona Extra", "Heineken", "Budweiser", "Blue Moon"), wine bottles, spirit bottles (whiskey, vodka, rum, gin, tequila, etc.)
- Non-alcoholic beverages: soda (e.g. "Sprite", "Coca-Cola", "Pepsi", "Dr Pepper"), juice ("Tropicana Orange Juice"), sports drinks ("Gatorade Lemon-Lime"), energy drinks ("Red Bull"), water, sparkling water
- Return the specific product name as shown on the label (e.g. "Corona Extra" not "beer", "Sprite" not "soda", "Tropicana Orange Juice" not "juice")
- If the label is not readable, use the most specific generic name you can determine (e.g. "IPA beer bottle", "wine bottle — red")

TASK 2 — Detect barcodes:
Also look for any product barcodes (vertical black and white lines) that are clearly visible and readable in the image.
For each barcode you can confidently read:
- Read the human-readable digits printed below the barcode — use those digits, not the bars themselves
- Only include barcodes where you can read ALL digits confidently
- Skip any barcode that is blurry, partially visible, at an angle, or too far away to read accurately — do NOT guess
- Skip barcodes where you can only see part of the digits

For each ingredient, assign a "category" from this exact list:
"🥩 Meat & Seafood", "🥛 Dairy & Eggs", "🥦 Produce", "🌾 Grains & Bread",
"🥫 Canned & Packaged", "🧂 Spices & Condiments", "🧊 Frozen",
"🥤 Beverages", "🍫 Snacks & Sweets", "🛍 Other"
Beverages (including beer, wine, liquor, juice, soda, water, sports drinks) → "🥤 Beverages"

Return ONLY a JSON object with this exact structure (no markdown, no preamble):
{"ingredients":[{"name":"apples","quantity":3,"unit":"item","category":"🥦 Produce"}],"barcodes":["0048700000315"]}

If no barcodes are found return an empty array for "barcodes". If no food items are found return an empty array for "ingredients".`,
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
    const raw = data.choices?.[0]?.message?.content || '{}';
    const cleaned = raw.replace(/```json|```/g, '').trim();
    let parsed;
    try { parsed = JSON.parse(cleaned); } catch { parsed = null; }
    // Handle both new object format {ingredients,barcodes} and legacy array format
    const rawIngredients = Array.isArray(parsed) ? parsed : (Array.isArray(parsed?.ingredients) ? parsed.ingredients : []);
    const ingredients = rawIngredients.map(i =>
      typeof i === 'string' ? { name: i, quantity: 1, unit: 'item' } : (i?.name ? i : null)
    ).filter(Boolean);
    const detectedBarcodes = Array.isArray(parsed?.barcodes)
      ? parsed.barcodes.filter(b => b && /^\d{6,}$/.test(String(b)))
      : [];
    res.json({ ingredients, detectedBarcodes });
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
      const recipeSkipReason = contentSafetyCheck(r, 'recipe');
      if (recipeSkipReason) {
        console.log(`[Catalog] Rejected (${recipeSkipReason}):`, r.title);
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

// ── GET /api/barcode-lookup — look up a barcode string via verified_products + OFF ─
app.get('/api/barcode-lookup', async (req, res) => {
  const { barcode } = req.query;
  if (!barcode) return res.status(400).json({ error: 'barcode required' });
  try {
    if (adminDb) {
      try {
        const verifiedDoc = await adminDb.collection('verified_products').doc(barcode).get();
        if (verifiedDoc.exists) {
          const vd = verifiedDoc.data();
          if (vd.confirmCount >= 2) {
            return res.json({
              name: vd.name, quantity: vd.quantity, unit: vd.unit,
              productName: vd.originalName, brand: null, barcode,
              communityVerified: true, itemSize: vd.itemSize || null,
            });
          }
        }
      } catch { /* non-fatal */ }
    }
    const offResp = await fetch(`https://world.openfoodfacts.org/api/v0/product/${barcode}.json`);
    const offData = await offResp.json();
    if (!offData || offData.status === 0) return res.json({ error: 'not_found', barcode });
    const product = offData.product || {};
    const productName = product.product_name || product.product_name_en || 'Unknown product';
    const brand = product.brands || null;
    const pkgUnit = packagingUnit(product.packaging);
    const parsedQ = parseOFFQuantity(product.quantity);
    let { quantity, unit, itemSize, itemUnit } = parsedQ;
    let ingredientName, resolvedItemSize = null;
    if (itemSize) {
      if (pkgUnit) unit = pkgUnit;
      resolvedItemSize = `${itemSize}${itemUnit}`;
      ingredientName = `${productName} (${quantity} x ${itemSize}${itemUnit})`;
    } else {
      if (quantity === 1 && unit === 'item' && pkgUnit) unit = pkgUnit;
      const sizeLabel = product.quantity ? product.quantity.trim() : null;
      ingredientName = sizeLabel ? `${productName} (${sizeLabel})` : productName;
    }
    res.json({ name: ingredientName, quantity, unit, productName, brand, barcode, itemSize: resolvedItemSize });
  } catch (err) {
    console.error('Barcode lookup error:', err);
    res.status(500).json({ error: err.message });
  }
});

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
            { type: 'text', text: 'Look carefully at this image for any barcode (1D linear barcode) or QR code. Barcodes are the pattern of vertical black and white lines typically found on product packaging.\n\nInstructions:\n1. Find the barcode in the image\n2. Read each digit carefully — accuracy is critical, one wrong digit returns a completely different product\n3. Common barcode formats: UPC-A (12 digits), EAN-13 (13 digits), UPC-E (8 digits)\n4. If you can see the human-readable numbers printed below the barcode, use those — they are more reliable than reading the bars themselves\n5. Return ONLY the digits with no spaces, dashes, or other characters\n6. If you cannot confidently read all digits, return null\n\nExample good response: 0048700000315\nExample bad response: \'004870000031\' (wrong digit count) or \'0048700-000315\' (contains dash)' },
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
  const { barcode, originalName, name, correctedName, quantity, unit, itemSize, uid, needsReview } = req.body;
  if (!barcode || !name || !uid) return res.status(400).json({ error: 'barcode, name, uid required' });
  if (!adminDb) return res.status(503).json({ error: 'Database unavailable' });
  try {
    const ref = adminDb.collection('verified_products').doc(barcode);
    const snap = await ref.get();
    if (snap.exists) {
      const updateData = {
        name, quantity, unit, itemSize: itemSize || null,
        originalName: originalName || snap.data().originalName,
        confirmedBy: uid,
        confirmCount: FieldValue.increment(1),
        lastConfirmedAt: FieldValue.serverTimestamp(),
        source: 'user_correction',
      };
      if (needsReview) {
        updateData.needsReview = true;
        updateData.correctedName = correctedName || name;
        updateData.reportedBy = uid;
        updateData.reportedAt = FieldValue.serverTimestamp();
      }
      await ref.update(updateData);
    } else {
      const setData = {
        barcode, originalName: originalName || name, name, quantity, unit,
        itemSize: itemSize || null, confirmedBy: uid,
        confirmCount: 1, lastConfirmedAt: FieldValue.serverTimestamp(),
        source: 'user_correction',
      };
      if (needsReview) {
        setData.needsReview = true;
        setData.correctedName = correctedName || name;
        setData.reportedBy = uid;
        setData.reportedAt = FieldValue.serverTimestamp();
      }
      await ref.set(setData);
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

// ── Drinks helpers ────────────────────────────────────────────────────────────

function isValidDrink(drink) {
  if (!drink.title || drink.title.length < 3) return false;
  if (!drink.ingredients || drink.ingredients.length < 2) return false;
  if (!drink.steps || drink.steps.length < 1) return false;
  return true;
}

function parseCocktailDBDrink(drink) {
  const ingredients = [];
  for (let i = 1; i <= 15; i++) {
    const name = (drink[`strIngredient${i}`] || '').trim();
    if (!name) break;
    const measure = (drink[`strMeasure${i}`] || '').trim();
    const amountMatch = measure.match(/^([\d.\/]+)/);
    let amount = 1;
    if (amountMatch) {
      const raw = amountMatch[1];
      amount = raw.includes('/') ? eval(raw) : parseFloat(raw) || 1;
    }
    const rawUnit = measure.replace(/^[\d.\/]+\s*/, '').trim() || 'whole';
    ingredients.push({ amount: Math.round(amount * 100) / 100, unit: normalizeUnit(rawUnit), name: name.toLowerCase() });
  }
  const instructions = drink.strInstructions || '';
  const steps = instructions.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  return {
    title: drink.strDrink,
    category: 'cocktail',
    isAlcoholic: drink.strAlcoholic === 'Alcoholic',
    glassType: drink.strGlass || null,
    garnish: null,
    thumbnail: drink.strDrinkThumb || null,
    ingredients,
    steps: steps.length ? steps : [instructions.slice(0, 500)],
    source: 'cocktaildb',
    cocktailDbId: drink.idDrink,
    tags: (drink.strTags || '').split(',').map(t => t.trim()).filter(Boolean),
    description: instructions.slice(0, 150).trim(),
    prepTime: '5 min',
    difficulty: 'Easy',
    baseServings: 1,
  };
}

async function searchDrinkCatalog(ingredientNames, category, excludeIds, limit) {
  if (!adminDb) return [];
  const top5 = ingredientNames.slice(0, 5);
  if (top5.length === 0) return [];
  try {
    const snap = await adminDb.collection('beverage_catalog')
      .where('indexedIngredients', 'array-contains-any', top5)
      .limit(limit * 6)
      .get();
    const results = [];
    for (const docSnap of snap.docs) {
      if (excludeIds.includes(docSnap.id)) continue;
      const data = docSnap.data();
      if (category && data.category !== category) continue;
      const { score: matchScore } = calcMatchScore(
        (data.ingredients || []).map(i => ({ name: i.name })), ingredientNames
      );
      if (matchScore >= 20) {
        const missing = calcMissing(
          (data.ingredients || []).map(i => ({ name: i.name })), ingredientNames
        );
        results.push({
          title: data.title,
          description: data.description || '',
          prepTime: data.prepTime || '5 min',
          difficulty: data.difficulty || 'Easy',
          matchScore,
          missingIngredients: missing,
          baseServings: data.baseServings || 1,
          ingredients: data.ingredients || [],
          steps: data.steps || [],
          source: data.source || 'catalog',
          thumbnail: data.thumbnail || null,
          cocktailDbId: data.cocktailDbId || null,
          catalogId: docSnap.id,
          category: data.category,
          isAlcoholic: data.isAlcoholic || false,
          glassType: data.glassType || null,
          garnish: data.garnish || null,
          tags: data.tags || [],
        });
      }
    }
    results.sort((a, b) => b.matchScore - a.matchScore);
    return results.slice(0, limit);
  } catch (err) {
    console.error('[Drinks] Catalog search error:', err.message);
    return [];
  }
}

async function saveToBeverageCatalog(drinks) {
  if (!adminDb) return;
  for (const d of drinks) {
    try {
      if (!isValidDrink(d)) { console.log('[BevCatalog] Rejected:', d.title); continue; }
      const bevSkipReason = contentSafetyCheck(d, 'beverage');
      if (bevSkipReason) { console.log(`[BevCatalog] Rejected (${bevSkipReason}):`, d.title); continue; }
      let docId;
      if (d.source === 'cocktaildb' && d.cocktailDbId) {
        docId = `cdb_${d.cocktailDbId}`;
      } else if (d.source === 'ai' && d.isAlcoholic) {
        continue; // Don't persist AI cocktails — too variable
      } else if (d.source === 'ai') {
        docId = `ai_${(d.title || '').toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 40)}_${Date.now()}`;
      } else {
        continue;
      }
      const ref = adminDb.collection('beverage_catalog').doc(docId);
      const existing = await ref.get();
      if (existing.exists) {
        await ref.update({ useCount: FieldValue.increment(1) });
      } else {
        const indexedIngredients = (d.ingredients || [])
          .map(i => (i.name || '').toLowerCase().trim()).filter(Boolean);
        await ref.set({
          id: docId, source: d.source, cocktailDbId: d.cocktailDbId || null,
          title: d.title, category: d.category || 'cocktail',
          description: d.description || '', prepTime: d.prepTime || '5 min',
          difficulty: d.difficulty || 'Easy', baseServings: d.baseServings || 1,
          ingredients: d.ingredients || [], indexedIngredients, steps: d.steps || [],
          thumbnail: d.thumbnail || null, tags: d.tags || [],
          isAlcoholic: d.isAlcoholic || false, glassType: d.glassType || null, garnish: d.garnish || null,
          fetchedAt: FieldValue.serverTimestamp(), useCount: 1, avgRating: 0, ratingCount: 0,
        });
      }
    } catch (err) { console.error('[BevCatalog] Save error:', err.message); }
  }
}

async function searchCocktailDB(pantryNames) {
  const topIngredients = pantryNames.slice(0, 2);
  const filterResults = await Promise.all(
    topIngredients.map(ing =>
      fetchWithTimeout(`https://www.thecocktaildb.com/api/json/v1/1/filter.php?i=${encodeURIComponent(ing)}`)
        .then(r => r.ok ? r.json() : { drinks: null })
        .catch(() => ({ drinks: null }))
    )
  );
  const seenIds = new Set();
  const drinkIds = [];
  for (const data of filterResults) {
    for (const d of (data.drinks || []).slice(0, 5)) {
      if (!seenIds.has(d.idDrink)) { seenIds.add(d.idDrink); drinkIds.push(d.idDrink); }
    }
  }
  const detailResults = await Promise.all(
    drinkIds.slice(0, 8).map(id =>
      fetchWithTimeout(`https://www.thecocktaildb.com/api/json/v1/1/lookup.php?i=${id}`)
        .then(r => r.ok ? r.json() : { drinks: null })
        .catch(() => ({ drinks: null }))
    )
  );
  return detailResults.map(data => data.drinks?.[0]).filter(Boolean).map(parseCocktailDBDrink);
}

async function generateAIDrinks(category, pantryNames, dietaryFilters, needed) {
  if (needed <= 0) return [];
  const ingList = pantryNames.slice(0, 10).join(', ');
  const dietaryClause = dietaryFilters?.length
    ? `Dietary requirements: ${dietaryFilters.join(', ')}. Strictly respect these.`
    : '';
  const schema = `{"title":"","description":"","prepTime":"5 min","difficulty":"Easy","baseServings":1,"ingredients":[{"amount":1,"unit":"cup","name":""}],"steps":[""],"tags":[],"matchScore":0,"missingIngredients":[]}`;
  const cocktailSchema = `{"title":"","description":"","prepTime":"5 min","difficulty":"Easy","baseServings":1,"isAlcoholic":true,"glassType":"","garnish":"","ingredients":[{"amount":1,"unit":"oz","name":""}],"steps":[""],"tags":[],"matchScore":0,"missingIngredients":[]}`;

  const prompts = {
    smoothie: `You are a nutritionist and smoothie expert. The user has these ingredients: ${ingList}. Suggest ${needed} smoothie recipes they can make. Focus on flavor balance, nutrition, and realistic combinations. ${dietaryClause} Return ONLY a valid JSON array, no other text. Each object: ${schema}`,
    juice: `You are a juice bar expert. The user has these ingredients: ${ingList}. Suggest ${needed} cold-pressed or blended juice recipes. ${dietaryClause} Return ONLY a valid JSON array, no other text. Each object: ${schema}`,
    milkshake: `You are a dessert chef specializing in milkshakes. The user has these ingredients: ${ingList}. Suggest ${needed} creamy, indulgent milkshake recipes. ${dietaryClause} Return ONLY a valid JSON array, no other text. Each object: ${schema}`,
    cocktail: `You are a professional mixologist. Suggest ${needed} cocktail recipes using these available ingredients: ${ingList}. Include classic cocktails and creative originals. ${dietaryClause} Return ONLY a valid JSON array, no other text. Each object: ${cocktailSchema}`,
  };

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 2048, messages: [{ role: 'user', content: prompts[category] || prompts.smoothie }] }),
    });
    if (!response.ok) throw new Error(`Claude API error: ${response.status}`);
    const data = await response.json();
    const rawText = data.content?.[0]?.text || '[]';
    const jsonMatch = rawText.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return [];
    const drinks = JSON.parse(jsonMatch[0]);
    return Array.isArray(drinks) ? drinks.map(d => ({ ...d, source: 'ai' })) : [];
  } catch (err) {
    console.error('[Drinks] AI generation error:', err.message);
    return [];
  }
}

// ── POST /api/drinks — Hybrid: BeverageCatalog + TheCocktailDB + Claude ───────
app.post('/api/drinks', async (req, res) => {
  const { ingredients, category, dietaryFilters, seenDrinkIds } = req.body;
  if (!ingredients?.length) return res.status(400).json({ error: 'ingredients array is required' });
  if (!category) return res.status(400).json({ error: 'category is required' });

  const pantryNames = extractIngredientNames(ingredients);
  const TARGET = 5;
  const excludeIds = Array.isArray(seenDrinkIds) ? seenDrinkIds : [];

  try {
    // Step 1: Search beverage_catalog
    const catalogHits = await searchDrinkCatalog(pantryNames, category, excludeIds, TARGET);
    if (catalogHits.length >= 3) {
      console.log('[Drinks] Catalog hit:', catalogHits.length, 'drinks found');
      return res.json({ drinks: catalogHits.slice(0, TARGET) });
    }

    console.log('[Drinks] Catalog miss — fetching from APIs, category:', category);
    const allDrinks = [...catalogHits];
    const seenTitles = new Set(allDrinks.map(d => d.title.toLowerCase()));

    // Step 2: TheCocktailDB for cocktails
    if (category === 'cocktail') {
      const cdbDrinks = await searchCocktailDB(pantryNames).catch(err => {
        console.error('[Drinks] CocktailDB failed:', err.message);
        return [];
      });
      for (const d of cdbDrinks) {
        if (seenTitles.has(d.title.toLowerCase())) continue;
        if (excludeIds.includes(`cdb_${d.cocktailDbId}`)) continue;
        const { score: matchScore } = calcMatchScore(d.ingredients, pantryNames);
        const missing = calcMissing(d.ingredients, pantryNames);
        allDrinks.push({ ...d, matchScore, missingIngredients: missing });
        seenTitles.add(d.title.toLowerCase());
      }
      saveToBeverageCatalog(cdbDrinks).catch(() => {});
      console.log('[Drinks] CocktailDB returned:', cdbDrinks.length, 'drinks');
    }

    // Step 3: AI for remaining slots
    const needed = TARGET - allDrinks.length;
    if (needed > 0) {
      const aiDrinks = await generateAIDrinks(category, pantryNames, dietaryFilters, needed);
      for (const d of aiDrinks) {
        if (!d.title || seenTitles.has(d.title.toLowerCase())) continue;
        const ings = (d.ingredients || []).map(i => ({ ...i, name: (i.name || '').toLowerCase() }));
        const { score: matchScore } = calcMatchScore(ings, pantryNames);
        const missing = calcMissing(ings, pantryNames);
        allDrinks.push({
          ...d,
          ingredients: ings,
          matchScore: d.matchScore || matchScore,
          missingIngredients: d.missingIngredients || missing,
          category,
          isAlcoholic: d.isAlcoholic ?? (category === 'cocktail'),
          glassType: d.glassType || null,
          garnish: d.garnish || null,
        });
        seenTitles.add(d.title.toLowerCase());
      }
      saveToBeverageCatalog(aiDrinks.filter(d => !d.isAlcoholic).map(d => ({ ...d, category }))).catch(() => {});
      console.log('[Drinks] AI generated:', aiDrinks.length, 'drinks');
    }

    allDrinks.sort((a, b) => (b.matchScore || 0) - (a.matchScore || 0));
    res.json({ drinks: allDrinks.slice(0, TARGET) });
  } catch (err) {
    console.error('[Drinks] Error:', err.message);
    res.status(500).json({ error: 'Failed to fetch drink recipes' });
  }
});

// ── GET /api/drinks/mocktail/:cocktailId — AI mocktail conversion ─────────────
app.get('/api/drinks/mocktail/:cocktailId', async (req, res) => {
  const { cocktailId } = req.params;
  if (!adminDb) return res.status(500).json({ error: 'Database unavailable' });
  try {
    // Return cached version if available
    const cacheRef = adminDb.collection('beverage_catalog').doc(cocktailId)
      .collection('mocktail').doc('version');
    const cached = await cacheRef.get();
    if (cached.exists) return res.json({ mocktail: cached.data() });

    const cocktailDoc = await adminDb.collection('beverage_catalog').doc(cocktailId).get();
    if (!cocktailDoc.exists) return res.status(404).json({ error: 'Cocktail not found' });
    const cocktail = cocktailDoc.data();

    const ingredientList = (cocktail.ingredients || [])
      .map(i => `${i.amount} ${i.unit} ${i.name}`).join(', ');

    const prompt = `Convert this cocktail to a non-alcoholic mocktail:
Title: ${cocktail.title}
Ingredients: ${ingredientList}

Replace each alcoholic ingredient with a non-alcoholic alternative:
- Vodka/Gin/Rum/Tequila → sparkling water or ginger beer
- Whiskey/Bourbon → apple cider or strong tea
- Wine → grape juice or sparkling cider
- Beer → sparkling water with a splash of lemon
- Liqueurs → fruit juice of similar flavor

Keep the same ratios and preparation method.
Return JSON only, no other text: {"title":"","description":"","ingredients":[{"amount":1,"unit":"oz","name":""}],"steps":[""]}`;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 1024, messages: [{ role: 'user', content: prompt }] }),
    });
    if (!response.ok) throw new Error(`Claude API error: ${response.status}`);
    const data = await response.json();
    const rawText = data.content?.[0]?.text || '{}';
    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON in Claude response');

    const mocktail = { ...JSON.parse(jsonMatch[0]), originalCocktailId: cocktailId, isAlcoholic: false, generatedAt: new Date().toISOString() };
    await cacheRef.set(mocktail);
    res.json({ mocktail });
  } catch (err) {
    console.error('[Drinks] Mocktail error:', err.message);
    res.status(500).json({ error: 'Failed to generate mocktail' });
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

// ── POST /api/drinks/seed-cocktails — Seed entire TheCocktailDB ───────────────
app.post('/api/drinks/seed-cocktails', verifyAdmin, async (req, res) => {
  if (!adminDb) return res.status(500).json({ error: 'Database unavailable' });
  res.json({ message: 'Cocktail seed started in background — watch server logs for progress' });

  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const letters = 'abcdefghijklmnopqrstuvwxyz'.split('');
  let seeded = 0, skipped = 0, errors = 0;

  (async () => {
    for (const letter of letters) {
      try {
        const r = await fetchWithTimeout(
          `https://www.thecocktaildb.com/api/json/v1/1/search.php?f=${letter}`, 10000
        );
        if (!r.ok) { errors++; await sleep(200); continue; }
        const data = await r.json();
        if (!data.drinks) { await sleep(200); continue; }

        for (const drink of data.drinks) {
          try {
            const docId = `cdb_${drink.idDrink}`;
            const existing = await adminDb.collection('beverage_catalog').doc(docId).get();
            if (existing.exists) { skipped++; continue; }

            const parsed = parseCocktailDBDrink(drink);
            const indexedIngredients = parsed.ingredients.map(i => i.name.toLowerCase().trim()).filter(Boolean);
            await adminDb.collection('beverage_catalog').doc(docId).set({
              id: docId, source: 'cocktaildb', cocktailDbId: drink.idDrink,
              title: parsed.title, category: 'cocktail',
              description: parsed.description || '', prepTime: parsed.prepTime,
              difficulty: parsed.difficulty, baseServings: parsed.baseServings,
              ingredients: parsed.ingredients, indexedIngredients,
              steps: parsed.steps, thumbnail: parsed.thumbnail,
              tags: parsed.tags, isAlcoholic: parsed.isAlcoholic,
              glassType: parsed.glassType, garnish: null,
              fetchedAt: FieldValue.serverTimestamp(), useCount: 0, avgRating: 0, ratingCount: 0,
            });
            seeded++;
            console.log(`[DrinkSeed] Saved: ${parsed.title}`);
          } catch (err) {
            errors++;
            console.error(`[DrinkSeed] Error saving ${drink.strDrink}:`, err.message);
          }
          await sleep(50);
        }
        console.log(`[DrinkSeed] Progress: letter=${letter}, seeded=${seeded}, skipped=${skipped}`);
        await sleep(200);
      } catch (err) {
        errors++;
        console.error(`[DrinkSeed] Letter ${letter} failed:`, err.message);
        await sleep(200);
      }
    }
    console.log(`[DrinkSeed] Complete — seeded:${seeded}, skipped:${skipped}, errors:${errors}`);
  })().catch(err => console.error('[DrinkSeed] Fatal:', err.message));
});

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

// ── Admin routes — Beverage Catalog Management ───────────────────────────────

let cocktailAdminState = { running: false, stop: false, logs: [], seeded: 0, skipped: 0, errors: 0 };
// Saves a Tasty recipe that failed the beverage safety check to recipe_catalog.
// Returns 'saved', 'duplicate', or 'missing-data'.
async function saveTastyRecipeToFood(recipe) {
  if (!adminDb) return 'missing-data';
  const docId = `tst_${recipe.id}`;
  const existing = await adminDb.collection('recipe_catalog').doc(docId).get();
  if (existing.exists) return 'duplicate';
  const ingredients = (recipe.sections || []).flatMap(s =>
    (s.components || []).map(c => ({
      amount: c.measurements?.[0]?.quantity ? parseFloat(c.measurements[0].quantity) || 1 : 1,
      unit: c.measurements?.[0]?.unit?.name || 'item',
      name: (c.ingredient?.name || '').toLowerCase().trim(),
    })).filter(i => i.name)
  );
  const steps = (recipe.instructions || []).map(s => s.display_text).filter(Boolean);
  if (!ingredients.length || !steps.length) return 'missing-data';
  const totalMins = recipe.total_time_minutes || recipe.prep_time_minutes || 30;
  await adminDb.collection('recipe_catalog').doc(docId).set({
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
  return 'saved';
}

let beverageSeedState = { running: false, stop: false, logs: [], saved: 0, requestsUsed: 0, errors: 0 };

// ── POST /api/admin/seed-cocktails ────────────────────────────────────────────
app.post('/api/admin/seed-cocktails', verifyAdmin, async (req, res) => {
  if (!adminDb) return res.status(500).json({ error: 'Database unavailable' });
  if (cocktailAdminState.running) return res.json({ error: 'Cocktail seed already running' });

  cocktailAdminState = { running: true, stop: false, logs: ['Starting CocktailDB seed a-z...'], seeded: 0, skipped: 0, errors: 0 };
  res.json({ started: true });

  const sleepMs = ms => new Promise(r => setTimeout(r, ms));
  const letters = 'abcdefghijklmnopqrstuvwxyz'.split('');

  (async () => {
    for (const letter of letters) {
      if (cocktailAdminState.stop) { cocktailAdminState.logs.push('Stopped by admin.'); break; }
      try {
        const r = await fetchWithTimeout(`https://www.thecocktaildb.com/api/json/v1/1/search.php?f=${letter}`, 10000);
        if (!r.ok) { cocktailAdminState.errors++; await sleepMs(200); continue; }
        const data = await r.json();
        if (!data.drinks) { await sleepMs(200); continue; }
        cocktailAdminState.logs.push(`Letter ${letter.toUpperCase()}: ${data.drinks.length} drinks`);

        for (const drink of data.drinks) {
          if (cocktailAdminState.stop) break;
          try {
            const docId = `cdb_${drink.idDrink}`;
            const existing = await adminDb.collection('beverage_catalog').doc(docId).get();
            if (existing.exists) { cocktailAdminState.skipped++; continue; }

            const parsed = parseCocktailDBDrink(drink);
            const indexedIngredients = parsed.ingredients.map(i => i.name.toLowerCase().trim()).filter(Boolean);
            await adminDb.collection('beverage_catalog').doc(docId).set({
              id: docId, source: 'cocktaildb', cocktailDbId: drink.idDrink,
              title: parsed.title, category: 'cocktail',
              description: parsed.description || '', prepTime: '5 min',
              difficulty: 'Easy', baseServings: 1,
              ingredients: parsed.ingredients, indexedIngredients, steps: parsed.steps,
              thumbnail: parsed.thumbnail, tags: parsed.tags,
              isAlcoholic: parsed.isAlcoholic, glassType: parsed.glassType, garnish: null,
              fetchedAt: FieldValue.serverTimestamp(), useCount: 0, avgRating: 0, ratingCount: 0,
            });
            cocktailAdminState.seeded++;
            cocktailAdminState.logs.push(`Saved: ${parsed.title}`);
          } catch (err) {
            cocktailAdminState.errors++;
            cocktailAdminState.logs.push(`Error: ${drink.strDrink} — ${err.message}`);
          }
          await sleepMs(50);
        }
        cocktailAdminState.logs.push(`Progress: seeded=${cocktailAdminState.seeded}, skipped=${cocktailAdminState.skipped}`);
        await sleepMs(200);
      } catch (err) {
        cocktailAdminState.errors++;
        cocktailAdminState.logs.push(`Letter ${letter} failed: ${err.message}`);
        await sleepMs(200);
      }
    }
    cocktailAdminState.running = false;
    cocktailAdminState.logs.push(`Done. Seeded: ${cocktailAdminState.seeded}, Skipped: ${cocktailAdminState.skipped}, Errors: ${cocktailAdminState.errors}`);
  })().catch(err => { cocktailAdminState.running = false; cocktailAdminState.logs.push(`Fatal: ${err.message}`); });
});

app.get('/api/admin/seed-cocktails/status', verifyAdmin, (_req, res) => res.json(cocktailAdminState));
app.post('/api/admin/seed-cocktails/stop', verifyAdmin, (_req, res) => {
  cocktailAdminState.stop = true;
  res.json({ stopped: true });
});

// ── POST /api/admin/seed-beverages ────────────────────────────────────────────
// Confirmed Tasty tag slugs (verified via /tags/list):
//   smoothies_smoothie_bowls → "Smoothies & Smoothie Bowls" (no standalone 'smoothies' tag)
//   shakes                   → "Shakes" (no 'milkshakes' tag)
//   juices                   → "Juices"
//   beverages                → "Beverages"
const BEV_TASTY_TAGS = [
  { slug: 'smoothies_smoothie_bowls', defaultCat: 'smoothie',  requireDrinkSignal: false },
  { slug: 'shakes',                   defaultCat: 'milkshake', requireDrinkSignal: true  },
  { slug: 'juices',                   defaultCat: 'juice',     requireDrinkSignal: false },
  { slug: 'beverages',                defaultCat: 'smoothie',  requireDrinkSignal: true  },
];

// Confirmed Tasty food tag slugs (verified via /tags/list on 2026-07-04).
// Food and beverage seeding share the same 500/month Tasty quota (see tastyQuota.js).
const FOOD_TASTY_TAGS = [
  { slug: 'dinner',     label: 'Dinner' },
  { slug: 'lunch',      label: 'Lunch' },
  { slug: 'breakfast',  label: 'Breakfast' },
  { slug: 'desserts',   label: 'Desserts' },
  { slug: 'appetizers', label: 'Appetizers' },
  { slug: 'sides',      label: 'Sides' },
  { slug: 'weeknight',  label: 'Weeknight' },
];

app.post('/api/admin/seed-beverages', verifyAdmin, async (req, res) => {
  if (!adminDb) return res.status(500).json({ error: 'Database unavailable' });
  if (beverageSeedState.running) return res.json({ error: 'Beverage seed already running' });

  const rapidKey = process.env.RAPIDAPI_KEY;
  const spoonKey = process.env.SPOONACULAR_API_KEY;

  beverageSeedState = { running: true, stop: false, logs: [], saved: 0, savedToFood: 0, requestsUsed: 0, skippedDuplicates: 0, skippedFiltered: 0, errors: 0 };
  res.json({ started: true, hasTasty: !!rapidKey });

  const sleepMs = ms => new Promise(r => setTimeout(r, ms));

  if (!rapidKey) {
    beverageSeedState.logs.push('RAPIDAPI_KEY not set — falling back to Spoonacular.');
  } else {
    const usage = getUsage();
    beverageSeedState.logs.push(`Tasty usage this month: ${usage.requestsUsed}/${MONTHLY_LIMIT} (safety cap: ${SAFETY_CAP})`);
  }

  (async () => {
    // Primary: Tasty API
    if (rapidKey && !beverageSeedState.stop) {
      beverageSeedState.logs.push(`Tasty API: tags = ${BEV_TASTY_TAGS.map(t => t.slug).join(', ')}`);

      for (const { slug, defaultCat, requireDrinkSignal } of BEV_TASTY_TAGS) {
        if (beverageSeedState.stop || wouldExceedSafetyCap(1)) {
          if (wouldExceedSafetyCap(1)) beverageSeedState.logs.push(`Safety cap reached (${SAFETY_CAP}/${MONTHLY_LIMIT}). Stopping.`);
          break;
        }
        const resumeFrom = getTagOffset(slug);
        beverageSeedState.logs.push(`Tag "${slug}": resuming from offset ${resumeFrom}`);
        let from = resumeFrom, hasMore = true;

        while (hasMore && !beverageSeedState.stop && !wouldExceedSafetyCap(1)) {
          try {
            const resp = await fetch(
              `https://tasty.p.rapidapi.com/recipes/list?from=${from}&size=20&tags=${encodeURIComponent(slug)}`,
              { headers: { 'x-rapidapi-host': 'tasty.p.rapidapi.com', 'x-rapidapi-key': rapidKey } }
            );
            beverageSeedState.requestsUsed++;
            recordUsage('beverages', 1);

            if (resp.status === 429 || resp.status === 402) {
              beverageSeedState.logs.push(`Tasty quota exhausted (HTTP ${resp.status}). Resume tomorrow.`);
              beverageSeedState.stop = true; break;
            }
            if (!resp.ok) { beverageSeedState.errors++; hasMore = false; break; }

            const data = await resp.json();
            const results = data.results || [];
            if (!results.length) { hasMore = false; break; } // offset already persisted from previous iteration

            for (const recipe of results) {
              if (!recipe.name || !recipe.id) {
                beverageSeedState.logs.push('Skipped [missing data]: (no name/id)');
                continue;
              }

              const safetyReason = contentSafetyCheck(recipe, 'beverage');
              if (safetyReason) {
                const isSavory = SAVORY_PATTERNS.some(p => (recipe.name || '').toLowerCase().includes(p));
                if (isSavory && !contentSafetyCheck(recipe, 'recipe')) {
                  const result = await saveTastyRecipeToFood(recipe);
                  if (result === 'saved') {
                    beverageSeedState.savedToFood++;
                    beverageSeedState.logs.push(`Moved to Food Catalog: ${recipe.name}`);
                  } else if (result === 'duplicate') {
                    beverageSeedState.skippedDuplicates++;
                    beverageSeedState.logs.push(`Skipped [duplicate in food catalog]: ${recipe.name}`);
                  }
                } else {
                  beverageSeedState.skippedFiltered++;
                  beverageSeedState.logs.push(`Skipped [non-beverage]: ${recipe.name}`);
                }
                continue;
              }

              if (requireDrinkSignal && !hasDrinkSignal(recipe)) {
                beverageSeedState.skippedFiltered++;
                beverageSeedState.logs.push(`Skipped [not drink-like]: ${recipe.name}`);
                continue;
              }

              const docId = `tasty_${recipe.id}`;
              const existing = await adminDb.collection('beverage_catalog').doc(docId).get();
              if (existing.exists) {
                beverageSeedState.skippedDuplicates++;
                beverageSeedState.logs.push(`Skipped [duplicate]: ${recipe.name}`);
                continue;
              }

              const category = inferCategory(recipe, 'beverage', defaultCat);

              const ingredients = (recipe.sections || []).flatMap(s =>
                (s.components || []).map(c => ({
                  amount: c.measurements?.[0]?.quantity ? parseFloat(c.measurements[0].quantity) || 1 : 1,
                  unit: c.measurements?.[0]?.unit?.name || 'item',
                  name: (c.ingredient?.name || '').toLowerCase().trim(),
                })).filter(i => i.name)
              );
              const steps = (recipe.instructions || []).map(s => s.display_text).filter(Boolean);
              if (!ingredients.length || !steps.length) {
                beverageSeedState.logs.push(`Skipped [missing data]: ${recipe.name} (no ingredients or steps)`);
                continue;
              }

              await adminDb.collection('beverage_catalog').doc(docId).set({
                id: docId, source: 'tasty', tastyId: String(recipe.id), cocktailDbId: null,
                title: recipe.name, category,
                description: (recipe.description || '').slice(0, 200),
                prepTime: recipe.prep_time_minutes ? `${recipe.prep_time_minutes} min` : '10 min',
                difficulty: 'Easy', baseServings: recipe.num_servings || 1,
                ingredients, indexedIngredients: ingredients.map(i => i.name).filter(Boolean),
                steps, thumbnail: recipe.thumbnail_url || null,
                tags: (recipe.tags || []).map(t => t.name).filter(Boolean),
                isAlcoholic: false, abv: null, glassType: null, garnish: null,
                fetchedAt: FieldValue.serverTimestamp(), useCount: 0, avgRating: 0, ratingCount: 0,
              });
              beverageSeedState.saved++;
              beverageSeedState.logs.push(`Saved [${category}]: ${recipe.name}`);
              await sleepMs(50);
            }

            beverageSeedState.logs.push(`tag=${slug} from=${from}: ${results.length} results, req=${beverageSeedState.requestsUsed}, saved=${beverageSeedState.saved}, toFood=${beverageSeedState.savedToFood}, dupes=${beverageSeedState.skippedDuplicates}, filtered=${beverageSeedState.skippedFiltered}`);
            from += 20;
            setTagOffset(slug, from); // persist after every page — never reset within the month
            hasMore = results.length === 20;
            await sleepMs(250);
          } catch (err) {
            beverageSeedState.errors++;
            beverageSeedState.logs.push(`Error tag=${slug}: ${err.message}`);
            hasMore = false;
          }
        }
      }
    }

    // Fallback / secondary: Spoonacular
    if (spoonKey && !beverageSeedState.stop && (beverageSeedState.saved === 0 || !rapidKey)) {
      beverageSeedState.logs.push('Spoonacular fallback: fetching smoothies/juices/milkshakes...');
      const queries = ['smoothie', 'fresh juice', 'milkshake', 'fruit smoothie', 'green smoothie'];
      let spoonPoints = 0;

      for (const q of queries) {
        if (beverageSeedState.stop || spoonPoints >= 30) break;
        try {
          const url = `https://api.spoonacular.com/recipes/complexSearch?query=${encodeURIComponent(q)}&type=drink&number=10&addRecipeInformation=true&apiKey=${spoonKey}`;
          const resp = await fetch(url);
          if (resp.status === 402) { beverageSeedState.logs.push('Spoonacular daily quota exhausted.'); break; }
          if (!resp.ok) continue;
          const data = await resp.json();
          spoonPoints++;

          for (const r of (data.results || [])) {
            const docId = `sp_bev_${r.id}`;
            const existing = await adminDb.collection('beverage_catalog').doc(docId).get();
            if (existing.exists) {
              beverageSeedState.skippedDuplicates++;
              beverageSeedState.logs.push(`Skipped [duplicate]: ${r.title}`);
              continue;
            }

            const name = (r.title || '').toLowerCase();
            const category = name.includes('milkshake') || name.includes('shake') ? 'milkshake'
              : name.includes('juice') ? 'juice' : 'smoothie';

            const ingredients = (r.extendedIngredients || []).map(ing => ({
              amount: Math.round((ing.amount || 1) * 100) / 100,
              unit: ing.unit || 'item', name: (ing.name || '').toLowerCase(),
            })).filter(i => i.name);
            const steps = r.analyzedInstructions?.[0]?.steps?.map(s => s.step) || ['Blend all ingredients until smooth.'];
            if (!ingredients.length) {
              beverageSeedState.logs.push(`Skipped [missing data]: ${r.title} (no ingredients)`);
              continue;
            }

            await adminDb.collection('beverage_catalog').doc(docId).set({
              id: docId, source: 'spoonacular', spoonacularId: r.id, cocktailDbId: null,
              title: r.title, category,
              description: ((r.summary || '').replace(/<[^>]*>/g, '').slice(0, 200)),
              prepTime: `${r.readyInMinutes || 10} min`, difficulty: 'Easy', baseServings: r.servings || 2,
              ingredients, indexedIngredients: ingredients.map(i => i.name),
              steps, thumbnail: r.image || null,
              tags: [...(r.cuisines || []), ...(r.dishTypes || [])],
              isAlcoholic: false, abv: null, glassType: null, garnish: null,
              fetchedAt: FieldValue.serverTimestamp(), useCount: 0, avgRating: 0, ratingCount: 0,
            });
            beverageSeedState.saved++;
            beverageSeedState.logs.push(`Spoonacular saved [${category}]: ${r.title}`);
            await sleepMs(150);
          }
        } catch (err) {
          beverageSeedState.logs.push(`Spoonacular error "${q}": ${err.message}`);
        }
      }
    }

    beverageSeedState.running = false;
    beverageSeedState.logs.push(`Done. Saved: ${beverageSeedState.saved}, Moved to Food: ${beverageSeedState.savedToFood}, Skipped (duplicate): ${beverageSeedState.skippedDuplicates}, Skipped (filtered): ${beverageSeedState.skippedFiltered}, Tasty requests: ${beverageSeedState.requestsUsed}`);
  })().catch(err => { beverageSeedState.running = false; beverageSeedState.logs.push(`Fatal: ${err.message}`); });
});

app.get('/api/admin/seed-beverages/status', verifyAdmin, (_req, res) => res.json(beverageSeedState));
app.post('/api/admin/seed-beverages/stop', verifyAdmin, (_req, res) => {
  beverageSeedState.stop = true;
  res.json({ stopped: true });
});

// ── GET /api/admin/tasty-quota ────────────────────────────────────────────────
app.get('/api/admin/tasty-quota', verifyAdmin, (_req, res) => {
  try { res.json({ ...getUsage(), monthlyLimit: MONTHLY_LIMIT, safetyCap: SAFETY_CAP }); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

// ── POST /api/admin/seed-food-tasty — Seed recipe_catalog from Tasty food tags ─
let foodTastyState = { running: false, stop: false, logs: [], saved: 0, requestsUsed: 0, skippedDuplicates: 0, skippedFiltered: 0, errors: 0 };

app.post('/api/admin/seed-food-tasty', verifyAdmin, async (req, res) => {
  if (!adminDb) return res.status(500).json({ error: 'Database unavailable' });
  if (foodTastyState.running) return res.json({ error: 'Food Tasty seed already running' });

  const rapidKey = process.env.RAPIDAPI_KEY;
  if (!rapidKey) return res.status(400).json({ error: 'RAPIDAPI_KEY not set' });

  foodTastyState = { running: true, stop: false, logs: [], saved: 0, requestsUsed: 0, skippedDuplicates: 0, skippedFiltered: 0, errors: 0 };
  res.json({ started: true });

  const sleepMs = ms => new Promise(r => setTimeout(r, ms));
  const usage = getUsage();
  foodTastyState.logs.push(`Tasty usage this month: ${usage.requestsUsed}/${MONTHLY_LIMIT} (safety cap: ${SAFETY_CAP})`);
  foodTastyState.logs.push(`Tags: ${FOOD_TASTY_TAGS.map(t => t.slug).join(', ')}`);

  (async () => {
    for (const { slug } of FOOD_TASTY_TAGS) {
      if (foodTastyState.stop || wouldExceedSafetyCap(1)) {
        if (wouldExceedSafetyCap(1)) foodTastyState.logs.push(`Safety cap reached (${SAFETY_CAP}/${MONTHLY_LIMIT}). Stopping.`);
        break;
      }
      let from = 0, hasMore = true;

      while (hasMore && !foodTastyState.stop && !wouldExceedSafetyCap(1)) {
        try {
          const resp = await fetch(
            `https://tasty.p.rapidapi.com/recipes/list?from=${from}&size=20&tags=${encodeURIComponent(slug)}`,
            { headers: { 'x-rapidapi-host': 'tasty.p.rapidapi.com', 'x-rapidapi-key': rapidKey } }
          );
          foodTastyState.requestsUsed++;
          recordUsage('food', 1);

          if (resp.status === 429 || resp.status === 402) {
            foodTastyState.logs.push(`Tasty quota exhausted (HTTP ${resp.status}). Resume tomorrow.`);
            foodTastyState.stop = true; break;
          }
          if (!resp.ok) { foodTastyState.errors++; hasMore = false; break; }

          const data = await resp.json();
          const results = data.results || [];
          if (!results.length) { hasMore = false; break; }

          for (const recipe of results) {
            if (!recipe.name || !recipe.id) {
              foodTastyState.logs.push('Skipped [missing data]: (no name/id)');
              continue;
            }

            const safetyReason = contentSafetyCheck(recipe, 'recipe');
            if (safetyReason) {
              foodTastyState.skippedFiltered++;
              foodTastyState.logs.push(`Skipped [${safetyReason}]: ${recipe.name}`);
              continue;
            }

            const docId = `tst_${recipe.id}`;
            const existing = await adminDb.collection('recipe_catalog').doc(docId).get();
            if (existing.exists) {
              foodTastyState.skippedDuplicates++;
              foodTastyState.logs.push(`Skipped [duplicate]: ${recipe.name}`);
              continue;
            }

            const totalMins = recipe.total_time_minutes || recipe.prep_time_minutes || 30;
            const cuisine = inferCategory(recipe, 'recipe', 'International');
            const ingredients = (recipe.sections || []).flatMap(s =>
              (s.components || []).map(c => ({
                amount: c.measurements?.[0]?.quantity ? parseFloat(c.measurements[0].quantity) || 1 : 1,
                unit: c.measurements?.[0]?.unit?.name || 'item',
                name: (c.ingredient?.name || '').toLowerCase().trim(),
              })).filter(i => i.name)
            );
            const steps = (recipe.instructions || []).map(s => s.display_text).filter(Boolean);
            if (!ingredients.length || !steps.length) {
              foodTastyState.logs.push(`Skipped [missing data]: ${recipe.name} (no ingredients or steps)`);
              continue;
            }

            await adminDb.collection('recipe_catalog').doc(docId).set({
              id: docId, source: 'tasty', spoonacularId: null, mealDbId: null, tastyId: String(recipe.id),
              title: recipe.name,
              description: (recipe.description || '').slice(0, 200),
              cookTime: `${totalMins} min`,
              difficulty: totalMins <= 20 ? 'Easy' : totalMins <= 45 ? 'Medium' : 'Hard',
              cuisine,
              baseServings: recipe.num_servings || 4,
              ingredients, indexedIngredients: ingredients.map(i => i.name).filter(Boolean), steps,
              thumbnail: recipe.thumbnail_url || null,
              tags: (recipe.tags || []).map(t => t.name).filter(Boolean),
              fetchedAt: FieldValue.serverTimestamp(), useCount: 0,
              nutrition: null, sourceUrl: null,
              avgRating: 0, ratingCount: 0, sourceData: {},
            });
            foodTastyState.saved++;
            foodTastyState.logs.push(`Saved [${cuisine}]: ${recipe.name}`);
            await sleepMs(50);
          }

          foodTastyState.logs.push(`tag=${slug} from=${from}: ${results.length} results, req=${foodTastyState.requestsUsed}, saved=${foodTastyState.saved}`);
          from += 20;
          hasMore = results.length === 20;
          await sleepMs(250);
        } catch (err) {
          foodTastyState.errors++;
          foodTastyState.logs.push(`Error tag=${slug}: ${err.message}`);
          hasMore = false;
        }
      }
    }

    const finalUsage = getUsage();
    foodTastyState.running = false;
    foodTastyState.logs.push(`Done. Saved: ${foodTastyState.saved}, Skipped (duplicate): ${foodTastyState.skippedDuplicates}, Skipped (filtered): ${foodTastyState.skippedFiltered}, Tasty requests: ${foodTastyState.requestsUsed}`);
    foodTastyState.logs.push(`Tasty monthly total: ${finalUsage.requestsUsed}/${MONTHLY_LIMIT}`);
  })().catch(err => { foodTastyState.running = false; foodTastyState.logs.push(`Fatal: ${err.message}`); });
});

app.get('/api/admin/seed-food-tasty/status', verifyAdmin, (_req, res) => res.json(foodTastyState));
app.post('/api/admin/seed-food-tasty/stop', verifyAdmin, (_req, res) => {
  foodTastyState.stop = true;
  res.json({ stopped: true });
});

// ── POST /api/admin/beverage-catalog/drinks/:id/move-to-food ──────────────────
app.post('/api/admin/beverage-catalog/drinks/:id/move-to-food', verifyAdmin, async (req, res) => {
  if (!adminDb) return res.status(500).json({ error: 'Database unavailable' });
  try {
    const bevDoc = await adminDb.collection('beverage_catalog').doc(req.params.id).get();
    if (!bevDoc.exists) return res.status(404).json({ error: 'Not found in beverage_catalog' });

    const d = bevDoc.data();
    const newId = d.tastyId ? `tst_${d.tastyId}` : `moved_${req.params.id}`;
    const totalMins = parseInt((d.prepTime || '30 min').replace(/[^0-9]/g, '')) || 30;

    const existing = await adminDb.collection('recipe_catalog').doc(newId).get();
    if (!existing.exists) {
      await adminDb.collection('recipe_catalog').doc(newId).set({
        id: newId,
        source: d.source === 'tasty' ? 'tasty' : 'catalog',
        spoonacularId: null, mealDbId: null,
        tastyId: d.tastyId || null,
        title: d.title, description: d.description || '',
        cookTime: d.prepTime || '30 min',
        difficulty: totalMins <= 20 ? 'Easy' : totalMins <= 45 ? 'Medium' : 'Hard',
        cuisine: inferCategory(d, 'recipe', 'International'),
        baseServings: d.baseServings || 4,
        ingredients: d.ingredients || [],
        indexedIngredients: d.indexedIngredients || [],
        steps: d.steps || [],
        thumbnail: d.thumbnail || null,
        tags: d.tags || [],
        fetchedAt: FieldValue.serverTimestamp(), useCount: d.useCount || 0,
        nutrition: null, sourceUrl: null,
        avgRating: 0, ratingCount: 0, sourceData: {},
      });
    }

    await adminDb.collection('beverage_catalog').doc(req.params.id).delete();
    res.json({ moved: true, newId });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── GET /api/admin/beverage-catalog/stats ─────────────────────────────────────
app.get('/api/admin/beverage-catalog/stats', verifyAdmin, async (_req, res) => {
  try {
    const snap = await adminDb.collection('beverage_catalog').get();
    const bySource = { cocktaildb: 0, tasty: 0, spoonacular: 0, ai: 0, other: 0 };
    const byCategory = { cocktail: 0, smoothie: 0, juice: 0, milkshake: 0, other: 0 };
    let alcoholic = 0, nonAlcoholic = 0;
    for (const d of snap.docs) {
      const data = d.data();
      const src = data.source || 'other';
      bySource[src] = (bySource[src] || 0) + 1;
      const cat = data.category || 'cocktail';
      byCategory[cat] = (byCategory[cat] || 0) + 1;
      if (data.isAlcoholic) alcoholic++; else nonAlcoholic++;
    }
    const configSnap = await adminDb.collection('config').doc('beverage_seed').get();
    const cfg = configSnap.exists ? configSnap.data() : {};
    res.json({ total: snap.size, bySource, byCategory, alcoholic, nonAlcoholic, lastCocktailSeed: cfg.lastCocktailSeed || null, lastBeverageSeed: cfg.lastBeverageSeed || null });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── GET /api/admin/beverage-catalog/drinks ────────────────────────────────────
app.get('/api/admin/beverage-catalog/drinks', verifyAdmin, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const pageLimit = parseInt(req.query.limit) || 20;
    const sourceFilter = req.query.source || null;
    const categoryFilter = req.query.category || null;
    const search = (req.query.search || '').toLowerCase();

    let snap = await adminDb.collection('beverage_catalog').orderBy('title').get();
    let all = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    if (sourceFilter) all = all.filter(d => d.source === sourceFilter);
    if (categoryFilter) all = all.filter(d => d.category === categoryFilter);
    if (search) all = all.filter(d => (d.title || '').toLowerCase().includes(search));

    const total = all.length;
    const start = (page - 1) * pageLimit;
    res.json({ drinks: all.slice(start, start + pageLimit), total, page });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── DELETE /api/admin/beverage-catalog/drinks/:id ─────────────────────────────
app.delete('/api/admin/beverage-catalog/drinks/:id', verifyAdmin, async (req, res) => {
  try {
    await adminDb.collection('beverage_catalog').doc(req.params.id).delete();
    res.json({ deleted: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── POST /api/support/chat — Claude-powered support assistant ─────────────────
app.post('/api/support/chat', async (req, res) => {
  const { messages, context, sessionId, useSonnet } = req.body;
  if (!Array.isArray(messages)) return res.status(400).json({ error: 'messages required' });

  const model = useSonnet ? 'claude-sonnet-4-6' : 'claude-haiku-4-5-20251001';
  const ctx = context || {};
  const di = ctx.deviceInfo || {};
  const recentErrorsText = (ctx.recentErrors || []).length > 0
    ? ctx.recentErrors.map(e => `  - ${e.message || e}`).join('\n')
    : 'None';

  const systemPrompt = `You are Pantry, the support assistant for My Pantry Club.
You help users fix problems and learn the app.

PERSONALITY:
- Talk like a helpful person, not a support document
- Match the user's energy — casual stays casual, frustrated gets calm and direct
- Short responses. 2-4 sentences max unless absolutely necessary
- Never use bullet points unless listing more than 3 things
- Never say "Here's what I'm noting" or "I'm logging this" — just do it silently
- Never number your questions — ask ONE question at a time
- Don't restate what the user just told you back to them

CONVERSATION FLOW:
Step 1 — Understand first, fix second:
  First response: acknowledge the problem in one line, then ask what they've already tried. Don't suggest fixes yet.
  Example: "That sounds annoying. What have you already tried?"

Step 2 — One suggestion at a time:
  Based on what they've tried, suggest ONE specific thing. Wait for their response before suggesting anything else.
  Example: "Try closing the app completely and reopening it — does that change anything?"

Step 3 — Dig deeper if needed:
  If basic fixes don't work, ask ONE targeted diagnostic question.
  Example: "When you take the photo, does it show you a list of items to confirm before saving?"

Step 4 — Last resort before escalating:
  "Let me try one more thing with you before I send this up..."
  Suggest the last thing. If it fails, move to Step 5.

Step 5 — Escalate cleanly:
  "Okay, I'm sending this up to the dev team now. In the meantime, [one workaround if available]."
  Then file the bug report silently — don't announce what you're logging or noting.

WHAT NOT TO DO:
- Don't list multiple questions at once
- Don't use headers or bold text in casual conversation
- Don't say "Great question!" or "I understand your frustration"
- Don't restate the problem back in detail
- Don't announce "Here's what I'm noting:" — just note it internally
- Don't give 4-step instructions when 1 step will do
- Don't say "Our team will investigate" — say "I'm sending this up"

ESCALATION:
After 3-4 back and forth exchanges with no resolution, naturally transition: "Let me get some extra help on this one."
Set escalateToSonnet: true in metadata. Continue the conversation — don't make a big deal of the switch.

BUG REPORT FILING:
When filing a bug report, just say: "Sent it up. [one sentence workaround if relevant]"
Set fileBugReport: true in metadata. The UI will show the confirmation card — you don't need to describe what you logged.

RESPONSE LENGTH RULE:
If your response is more than 3 sentences, cut it in half. The user wants help, not a manual.

APP KNOWLEDGE:
- SCAN TAB: Camera scan (food photo), Receipt scan, Barcode scan. Three modes toggled at top. Camera has Take Photo + Upload from Gallery. Barcode uses GPT-4o to read barcode then looks up Open Food Facts. Receipt uses GPT-4o to parse grocery receipt line items.
- MY PANTRY TAB: Toggle between Pantry and Grocery list. Pantry shows ingredients with quantity, unit, expiry date, category. Sort by A-Z, Category, Recently Added, Expiring Soon. Filter by category. Grocery: add items manually or sync from saved recipes. Shop List: select checked items, tap Shop to open Amazon Fresh/Instacart.
- MY RECIPES TAB: 4 sub-tabs: My Recipes | My Creations | Meal Plan | Cook History. My Recipes: saved recipes from Discover. My Creations: original recipes. Meal Plan: weekly calendar. Cook History: log of what you've made.
- DISCOVER TAB: AI Recipes tab + Community tab. AI Recipes: Find Recipes button, cuisine shuffle, dietary filters, Use Expiring Soon mode, recipe cards with match score, portion scaler, nutrition info, Made It button, Customize button. Community: recipes shared by other users.
- SETTINGS: Dietary preferences, Shopping partners, Household management, Account deletion, Privacy Policy, Terms of Service, Replay Tour.
- HOUSEHOLDS: Create or join a household with a 6-digit code. Share pantry, recipes, and meal plan in real time with family.

CURRENT USER CONTEXT:
Tab: ${ctx.currentTab || 'unknown'}
Pantry items: ${ctx.pantryItemCount || 0}
Device: ${di.browser || 'unknown'} on ${di.os || 'unknown'}
Recent errors:
${recentErrorsText}

RESPONSE FORMAT — You MUST always respond with valid JSON only, no markdown, no preamble:
{"message":"your conversational response here","metadata":{"fileBugReport":false,"escalateToSonnet":false,"issueResolved":false,"suggestManualReport":false,"bugReportSummary":null}}

Use \\n for line breaks inside the message string.`;

  try {
    const claudeMessages = messages.map(m => ({ role: m.role, content: m.content }));
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model, max_tokens: 1024, system: systemPrompt, messages: claudeMessages }),
    });
    if (!response.ok) throw new Error(`Claude API error: ${response.status}`);
    const data = await response.json();
    const rawContent = data.content?.[0]?.text || '';
    let parsed;
    try {
      parsed = JSON.parse(rawContent.replace(/```json|```/g, '').trim());
    } catch {
      parsed = { message: rawContent || "I'm having trouble responding right now. Please try again.", metadata: {} };
    }
    const meta = parsed.metadata || {};

    // Auto-file bug report
    let bugReportId = null;
    if (meta.fileBugReport && adminDb) {
      try {
        const bugRef = await adminDb.collection('bug_reports').add({
          type: 'bug',
          description: meta.bugReportSummary || 'Issue reported via AI support chat',
          currentTab: ctx.currentTab || 'unknown', domain: ctx.domain || '',
          userAgent: `${di.browser} on ${di.os}`, uid: ctx.uid || 'anonymous',
          status: 'in_progress', source: 'support_chat', sessionId: sessionId || null,
          debugInfo: {
            browser: di.browser, os: di.os, deviceType: di.deviceType,
            currentTab: ctx.currentTab, pantryItemCount: ctx.pantryItemCount,
            appVersion: ctx.appVersion, recentLogs: ctx.recentLogs || [],
            recentErrors: ctx.recentErrors || [], capturedAt: new Date().toISOString(),
          },
          timestamp: FieldValue.serverTimestamp(),
        });
        bugReportId = bugRef.id;
      } catch (e) { console.error('[Support] Bug report filing failed:', e.message); }
    }

    // Update or create support session
    if (adminDb && sessionId) {
      try {
        const sessionRef = adminDb.collection('support_sessions').doc(sessionId);
        const now = new Date().toISOString();
        const allMessages = [...messages, { role: 'assistant', content: parsed.message, timestamp: now }];
        const status = meta.issueResolved ? 'resolved' : meta.fileBugReport ? 'in-progress' : meta.suggestManualReport ? 'manual-report' : 'active';
        const sessionSnap = await sessionRef.get();
        if (!sessionSnap.exists) {
          await sessionRef.set({
            sessionId, uid: ctx.uid || 'anonymous', displayName: ctx.displayName || '',
            startedAt: FieldValue.serverTimestamp(), lastMessageAt: FieldValue.serverTimestamp(),
            status, model: useSonnet ? 'sonnet' : 'haiku', messages: allMessages,
            context: ctx, bugReportId, resolution: meta.issueResolved ? parsed.message : null,
            escalated: meta.escalateToSonnet || false, deviceInfo: di,
          });
        } else {
          const existing = sessionSnap.data();
          await sessionRef.update({
            lastMessageAt: FieldValue.serverTimestamp(), status,
            model: useSonnet ? 'sonnet' : 'haiku', messages: allMessages,
            bugReportId: bugReportId || existing.bugReportId || null,
            resolution: meta.issueResolved ? parsed.message : (existing.resolution || null),
            escalated: meta.escalateToSonnet || existing.escalated || false,
          });
        }
      } catch (e) { console.error('[Support] Session update failed:', e.message); }
    }

    res.json({
      message: parsed.message,
      metadata: {
        fileBugReport: meta.fileBugReport || false,
        escalateToSonnet: meta.escalateToSonnet || false,
        issueResolved: meta.issueResolved || false,
        suggestManualReport: meta.suggestManualReport || false,
        bugReportSummary: meta.bugReportSummary || null,
        bugReportId,
      },
    });
  } catch (err) {
    console.error('[Support] Chat error:', err);
    res.status(500).json({ error: 'Support chat failed' });
  }
});

// ── GET /api/admin/support/sessions — paginated sessions list ─────────────────
app.get('/api/admin/support/sessions', verifyAdmin, async (req, res) => {
  if (!adminDb) return res.status(503).json({ error: 'Database unavailable' });
  try {
    const status = req.query.status || null;
    let q = adminDb.collection('support_sessions').orderBy('lastMessageAt', 'desc').limit(100);
    if (status) q = q.where('status', '==', status);
    const snap = await q.get();
    const sessions = snap.docs.map(d => ({ id: d.id, ...d.data(), startedAt: d.data().startedAt?.toDate?.()?.toISOString() || null, lastMessageAt: d.data().lastMessageAt?.toDate?.()?.toISOString() || null }));
    res.json({ sessions });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

const PORT = process.env.PORT || 3003;
app.listen(PORT, () => console.log(`My Pantry Club API listening on :${PORT}`));
