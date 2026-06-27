// My Pantry Club — API Proxy
// DoneIt Technologies
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import fs from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, '..', '.env') });

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
        max_tokens: 500,
        messages: [{
          role: 'user',
          content: [
            {
              type: 'text',
              text: 'List every food ingredient visible in this image. Return ONLY a JSON array of strings. Example: ["eggs","milk","cheddar cheese"]',
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
    const ingredients = JSON.parse(cleaned);
    res.json({ ingredients: Array.isArray(ingredients) ? ingredients : [] });
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
    const unit = measure.replace(/^[\d.\/]+\s*/, '').trim().toLowerCase() || 'whole';
    out.push({ amount: Math.round(amount * 100) / 100, unit, name: name.toLowerCase() });
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

// TODO: Pass filteredIngredients (base ingredients only) not raw pantryNames
// Spoonacular handles branded products but returns better results with base ingredients
// GET https://api.spoonacular.com/recipes/findByIngredients
//   ?ingredients={filteredIngredients.join(',')}&number={needed}&apiKey={SPOONACULAR_API_KEY}
// Also update the function signature to accept filteredIngredients as parameter
function stubSpoonacular(_ingredients, _needed) {
  return [];
}

// ── POST /api/recipes — Hybrid: TheMealDB + Spoonacular + Claude ────────────
app.post('/api/recipes', async (req, res) => {
  const { ingredients, cuisineHint, dietaryFilters, cookTimeMax, difficulty, cuisineWeights, expiringIngredients, mealTypeHint } = req.body;
  if (!ingredients?.length) return res.status(400).json({ error: 'ingredients array is required' });

  const pantryNames = extractIngredientNames(ingredients);
  const TARGET = 5;

  try {
    // Tier 1: TheMealDB (free, instant)
    let dbRecipes = [];
    try {
      const searchTerms = pickSearchIngredients(pantryNames);
      console.log('[Recipes] TheMealDB searching base ingredients:', searchTerms.join(', '));
      dbRecipes = await searchTheMealDB(searchTerms, pantryNames);
      dbRecipes = dbRecipes.filter(r => r.matchScore >= 20);
      dbRecipes.sort((a, b) => b.matchScore - a.matchScore);
    } catch (err) {
      console.error('[Recipes] TheMealDB failed, falling back to Claude only:', err.message);
      dbRecipes = [];
    }
    dbRecipes = dbRecipes.slice(0, 4);
    console.log('[Recipes] TheMealDB returned:', dbRecipes.length, 'recipes');

    // Tier 2: Spoonacular (stubbed)
    const spoonRecipes = stubSpoonacular(pantryNames, TARGET - dbRecipes.length);

    const catalogRecipes = [...dbRecipes, ...spoonRecipes];
    const existingTitles = catalogRecipes.map(r => r.title);

    // Tier 3: Claude Haiku for remaining slots
    const needed = Math.max(1, TARGET - catalogRecipes.length);
    console.log('[Recipes] Claude needs to fill:', needed, 'slots');

    const cuisineClause = cuisineHint && cuisineHint !== 'Any' ? `Focus on ${cuisineHint} cuisine.` : '';
    let dietaryClause = '';
    if (dietaryFilters?.length) dietaryClause = `\nDIETARY RESTRICTIONS (MANDATORY): Recipes MUST be ${dietaryFilters.join(', ')}.`;
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

    const excludeClause = existingTitles.length > 0
      ? `\nDo NOT suggest any of these already found recipes: ${existingTitles.join(', ')}.`
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
Use numeric amounts only. No markdown, no preamble.`,
        }],
      }),
    });

    let aiRecipes = [];
    if (response.ok) {
      const data = await response.json();
      const raw = data.content?.[0]?.text || '[]';
      const cleaned = raw.replace(/```json|```/g, '').trim();
      const parsed = JSON.parse(cleaned);
      aiRecipes = (Array.isArray(parsed) ? parsed : []).map(r => ({
        ...r,
        source: 'ai',
        sourceLabel: 'AI Generated',
      }));
    } else {
      console.error('Anthropic error:', await response.text());
    }

    const allRecipes = [...catalogRecipes, ...aiRecipes];
    allRecipes.sort((a, b) => (b.matchScore || 0) - (a.matchScore || 0));
    console.log('[Recipes] Returning', allRecipes.length, 'total recipes');

    res.json({ recipes: allRecipes.slice(0, TARGET) });
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
- Extract quantity if visible on the receipt (e.g. '2x', 'x3'), default to 1 if not shown
- Assign a sensible unit based on the item type: use 'item' for whole goods, 'lb' if weight is shown, 'oz' if ounce quantity shown, 'pack' for multi-packs, 'bag' for bagged goods, 'box' for boxed goods
${abbrevsContext}
Return ONLY a valid JSON object in this exact format, no markdown, no preamble:
{
  "detectedStore": "store name or null",
  "ingredients": [
    { "name": "boneless chicken breast", "quantity": 1, "unit": "lb" }
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
            {
              type: 'text',
              text: 'Look at this image and find any barcode or QR code. Return ONLY the barcode number as a plain string with no spaces, dashes, or other characters. If no barcode is found, return null. Example response: 0123456789012',
            },
            {
              type: 'image_url',
              image_url: { url: `data:${mimeType || 'image/jpeg'};base64,${imageBase64}` },
            },
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

    const offResp = await fetch(`https://world.openfoodfacts.org/api/v0/product/${barcode}.json`);
    const offData = await offResp.json();

    if (!offData || offData.status === 0) {
      return res.json({ error: 'not_found', message: 'Product not found in database. Try adding manually.', barcode });
    }

    const product = offData.product || {};
    const productName = product.product_name || product.product_name_en || 'Unknown product';
    const brand = product.brands || null;

    let quantity = 1;
    let unit = 'item';
    const qtyStr = product.quantity || '';
    const qtyMatch = qtyStr.match(/^([\d.]+)\s*(g|kg|ml|l|oz|lb|fl oz)/i);
    if (qtyMatch) {
      quantity = parseFloat(qtyMatch[1]);
      const u = qtyMatch[2].toLowerCase();
      if (u === 'kg') { quantity = quantity * 1000; unit = 'g'; }
      else if (u === 'fl oz') { unit = 'oz'; }
      else { unit = u; }
    }

    res.json({
      ingredients: [{ name: productName, quantity, unit }],
      productName,
      brand,
      barcode,
    });
  } catch (err) {
    console.error('Barcode scan error:', err);
    res.json({ error: 'scan_failed', message: 'Barcode scan failed. Please try again.' });
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

const PORT = process.env.PORT || 3003;
app.listen(PORT, () => console.log(`My Pantry Club API listening on :${PORT}`));
