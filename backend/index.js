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
  const { ingredients, cuisineHint } = req.body;
  if (!ingredients?.length) return res.status(400).json({ error: 'ingredients array is required' });

  const cuisineClause = cuisineHint && cuisineHint !== 'Any'
    ? `Focus on ${cuisineHint} cuisine.`
    : '';

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
          content: `I have these ingredients: ${ingredients.join(', ')}. Suggest 3 recipes I can make. ${cuisineClause}
For each recipe return a JSON object with exactly these fields:
- title: string
- description: string (1-2 sentences)
- cookTime: string (e.g. "25 min")
- difficulty: "Easy" | "Medium" | "Hard"
- matchScore: number (percentage of my ingredients the recipe uses, 0-100)
- missingIngredients: string[] (items I'd need to buy)
- cuisine: string
- baseServings: number (what serving size the amounts are written for, typically 2 or 4)
- ingredients: array of { amount: number, unit: string, name: string }
  Use standard units: cup, tbsp, tsp, oz, g, ml, whole, pinch, clove, slice, lb, can
  Use numeric amounts only (e.g. 0.5 not "1/2")
- steps: string[] (cooking instructions, one step per string)

Return ONLY a valid JSON array of 3 recipe objects. No markdown, no preamble, no commentary.`,
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

const PORT = process.env.PORT || 3003;
app.listen(PORT, () => console.log(`PantryPal API listening on :${PORT}`));
