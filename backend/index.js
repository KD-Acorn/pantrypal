import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
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
        model: 'claude-haiku-4-5-20251001',
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

const PORT = process.env.PORT || 3003;
app.listen(PORT, () => console.log(`PantryPal API listening on :${PORT}`));
