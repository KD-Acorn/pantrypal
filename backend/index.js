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
  origin: ['http://localhost:3004', 'https://pantry.doneitmobile.com'],
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

// ── POST /api/recipes — Anthropic Claude ────────────────────────────────────
app.post('/api/recipes', async (req, res) => {
  const { ingredients, cuisineHint, dietaryFilters, cookTimeMax, difficulty, cuisineWeights } = req.body;
  if (!ingredients?.length) return res.status(400).json({ error: 'ingredients array is required' });

  const cuisineClause = cuisineHint && cuisineHint !== 'Any'
    ? `Focus on ${cuisineHint} cuisine.`
    : '';

  let dietaryClause = '';
  if (dietaryFilters?.length) {
    const labels = dietaryFilters.join(', ');
    dietaryClause = `\nDIETARY RESTRICTIONS (MANDATORY):\nThese recipes MUST be ${labels}. Do not suggest any recipe that violates these dietary restrictions. Check every ingredient against these restrictions.`;
  }

  let timeClause = '';
  if (cookTimeMax) {
    timeClause = `\nTIME CONSTRAINT: Each recipe must take no more than ${cookTimeMax} minutes total cook time.`;
  }

  let difficultyClause = '';
  if (difficulty && difficulty !== 'Any') {
    difficultyClause = `\nDIFFICULTY CONSTRAINT: All recipes must be ${difficulty} difficulty.`;
  }

  let cuisineWeightClause = '';
  if (cuisineWeights?.length && (!cuisineHint || cuisineHint === 'Any')) {
    cuisineWeightClause = `\nCUISINE PREFERENCE: The user tends to prefer ${cuisineWeights.join(' and ')} cuisine — lean toward these styles if the ingredients allow, but still offer variety.`;
  }

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 3000,
        messages: [{
          role: 'user',
          content: `You are an experienced chef and culinary expert. A home cook has these ingredients available:
${ingredients.join(', ')}

${cuisineClause}${dietaryClause}${timeClause}${difficultyClause}${cuisineWeightClause}

Suggest 3 genuinely appealing, real recipes that a person would actually want to cook and eat.
Follow these rules strictly:

RECIPE QUALITY RULES:
- Suggest real, named dishes that people recognize (e.g. "Classic Carbonara", "Peanut Butter Banana Smoothie Bowl", "Spicy Tuna Fried Rice") — not generic combinations like "Egg and Potato Mix"
- Think like a chef: if the user has most ingredients for a beloved classic dish, suggest it even if a few items are missing
- Prioritize flavor cohesion — do not mix sweet dessert ingredients into savory mains
- Consider cooking techniques that elevate simple ingredients (caramelizing, toasting, emulsifying)
- Each recipe must be something a real restaurant or home cook would proudly serve
- Vary the 3 suggestions: aim for different meal types (e.g. one light, one hearty, one creative)
- If ingredients are limited or unusual, be creative but stay realistic and appetizing
- Never suggest a recipe just because the ingredients technically combine — only suggest it if it tastes good

MISSING INGREDIENTS:
- It is completely fine to suggest a recipe where the user is missing several ingredients
- Missing ingredients should be common pantry staples easy to buy (not exotic specialty items)
- A 40% match score on a beloved classic is better than a 90% match on a bland combination

FORMATTING RULES:
- Return ONLY a valid JSON array of exactly 3 recipe objects
- No markdown, no backticks, no preamble, no explanation outside the JSON
- Each object must have exactly these fields:
  {
    "title": "Classic dish name",
    "description": "1-2 sentences describing why this dish is delicious and appealing",
    "cookTime": "25 min",
    "difficulty": "Easy" | "Medium" | "Hard",
    "matchScore": number 0-100,
    "missingIngredients": ["item1", "item2"],
    "cuisine": "Italian",
    "baseServings": 2,
    "ingredients": [
      { "amount": 2, "unit": "cup", "name": "all-purpose flour" }
    ],
    "steps": [
      "Step 1 instruction here",
      "Step 2 instruction here"
    ]
  }
- Use numeric amounts only (0.5 not "1/2")
- Standard units: cup, tbsp, tsp, oz, g, ml, whole, pinch, clove, slice, lb, can, bag, bunch`,
        }],
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      console.error('Anthropic error:', err);
      return res.status(502).json({ error: 'Failed to generate recipes' });
    }

    const data = await response.json();
    const raw = data.content?.[0]?.text || '[]';
    const cleaned = raw.replace(/```json|```/g, '').trim();
    const recipes = JSON.parse(cleaned);
    res.json({ recipes: Array.isArray(recipes) ? recipes : [] });
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

const PORT = process.env.PORT || 3003;
app.listen(PORT, () => console.log(`PantryPal API listening on :${PORT}`));
