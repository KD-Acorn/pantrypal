import fs from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { contentSafetyCheck } from '../utils/catalogClassifier.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, '..', '..', '.env') });

const serviceAccount = JSON.parse(
  fs.readFileSync(resolve(__dirname, '..', 'serviceAccount.json'), 'utf8')
);
initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

const UNIT_MAP = {
  'pch': 'pinch', 'dsh': 'dash', 'tbs': 'tbsp', 'tbl': 'tbsp', 'T': 'tbsp',
  't': 'tsp', 'c': 'cup', 'C': 'cup', 'lbs': 'lb', 'l': 'l', 'L': 'l',
  'sm': 'small', 'sml': 'small', 'med': 'medium', 'lg': 'large', 'lrg': 'large',
  'pkg': 'package', 'env': 'envelope', 'cn': 'can', 'pt': 'pint', 'qt': 'quart',
};
function normalizeUnit(unit) {
  const raw = unit?.trim() || '';
  if (!raw) return 'item';
  return UNIT_MAP[raw] || UNIT_MAP[raw.toLowerCase()] || raw.toLowerCase();
}

function parseDrink(drink) {
  const ingredients = [];
  for (let i = 1; i <= 15; i++) {
    const name = (drink[`strIngredient${i}`] || '').trim();
    if (!name) break;
    const measure = (drink[`strMeasure${i}`] || '').trim();
    const amountMatch = measure.match(/^([\d.\/]+)/);
    let amount = 1;
    if (amountMatch) {
      const raw = amountMatch[1];
      // eslint-disable-next-line no-eval
      amount = raw.includes('/') ? eval(raw) : parseFloat(raw) || 1;
    }
    const rawUnit = measure.replace(/^[\d.\/]+\s*/, '').trim() || 'whole';
    ingredients.push({ amount: Math.round(amount * 100) / 100, unit: normalizeUnit(rawUnit), name: name.toLowerCase() });
  }
  const instructions = drink.strInstructions || '';
  const steps = instructions.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  return {
    title: drink.strDrink,
    isAlcoholic: drink.strAlcoholic === 'Alcoholic',
    glassType: drink.strGlass || null,
    thumbnail: drink.strDrinkThumb || null,
    ingredients,
    steps: steps.length ? steps : [instructions.slice(0, 500)].filter(Boolean),
    cocktailDbId: drink.idDrink,
    tags: (drink.strTags || '').split(',').map(t => t.trim()).filter(Boolean),
    description: instructions.slice(0, 150).trim(),
  };
}

async function seed() {
  const letters = 'abcdefghijklmnopqrstuvwxyz'.split('');
  let seeded = 0, skipped = 0, errors = 0;

  console.log('[DrinkSeed] Starting CocktailDB seed — fetching all cocktails a-z\n');

  for (const letter of letters) {
    try {
      const resp = await fetch(
        `https://www.thecocktaildb.com/api/json/v1/1/search.php?f=${letter}`
      );
      if (!resp.ok) {
        console.error(`[DrinkSeed] HTTP ${resp.status} for letter ${letter}`);
        errors++;
        await sleep(200);
        continue;
      }
      const data = await resp.json();
      if (!data.drinks) {
        console.log(`[DrinkSeed] No drinks for letter: ${letter}`);
        await sleep(200);
        continue;
      }

      console.log(`[DrinkSeed] Letter ${letter.toUpperCase()}: ${data.drinks.length} drinks`);

      for (const drink of data.drinks) {
        try {
          const docId = `cdb_${drink.idDrink}`;
          const existing = await db.collection('beverage_catalog').doc(docId).get();
          if (existing.exists) {
            skipped++;
            continue;
          }

          const parsed = parseDrink(drink);
          if (!parsed.title || parsed.ingredients.length < 1) {
            console.log(`[DrinkSeed] Skipping invalid: ${drink.strDrink}`);
            skipped++;
            continue;
          }

          const safetyReason = contentSafetyCheck({ title: parsed.title, tags: parsed.tags, ingredients: parsed.ingredients }, 'beverage');
          if (safetyReason) {
            console.log(`[DrinkSeed] Skipped [safety backstop - ${safetyReason}]: ${parsed.title}`);
            skipped++;
            continue;
          }

          const indexedIngredients = parsed.ingredients
            .map(i => i.name.toLowerCase().trim()).filter(Boolean);

          await db.collection('beverage_catalog').doc(docId).set({
            id: docId,
            source: 'cocktaildb',
            cocktailDbId: drink.idDrink,
            title: parsed.title,
            category: 'cocktail',
            description: parsed.description || '',
            prepTime: '5 min',
            difficulty: 'Easy',
            baseServings: 1,
            ingredients: parsed.ingredients,
            indexedIngredients,
            steps: parsed.steps,
            thumbnail: parsed.thumbnail,
            tags: parsed.tags,
            isAlcoholic: parsed.isAlcoholic,
            glassType: parsed.glassType,
            garnish: null,
            fetchedAt: FieldValue.serverTimestamp(),
            useCount: 0,
            avgRating: 0,
            ratingCount: 0,
          });

          seeded++;
          console.log(`[DrinkSeed] Saved: ${parsed.title}`);
          await sleep(50);
        } catch (err) {
          errors++;
          console.error(`[DrinkSeed] Error saving ${drink.strDrink}:`, err.message);
        }
      }

      console.log(`[DrinkSeed] Progress: seeded=${seeded}, skipped=${skipped}, errors=${errors}\n`);
      await sleep(200);
    } catch (err) {
      errors++;
      console.error(`[DrinkSeed] Letter ${letter} failed:`, err.message);
      await sleep(200);
    }
  }

  console.log('\n[DrinkSeed] ─────────────────────────────');
  console.log(`[DrinkSeed] Complete!`);
  console.log(`[DrinkSeed]   Seeded:  ${seeded}`);
  console.log(`[DrinkSeed]   Skipped: ${skipped}`);
  console.log(`[DrinkSeed]   Errors:  ${errors}`);
  console.log('[DrinkSeed] ─────────────────────────────');
  process.exit(0);
}

seed().catch(err => {
  console.error('[DrinkSeed] Fatal error:', err);
  process.exit(1);
});
