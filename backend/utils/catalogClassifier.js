// Shared content classification and safety for recipe_catalog and beverage_catalog.
// One authoritative set of signal words used by ALL seed paths (scripts and inline routes).

export const SAVORY_PATTERNS = [
  'burger', 'nacho', 'pizza', 'dumpling', 'empanada', 'casserole',
  'stuffed bun', 'chicken wing', 'buffalo wing', 'wings', 'pot roast',
  'roast chicken', 'roast beef', 'roast pork', 'steak', 'potato stacker',
  'onion ring', 'deviled egg', 'enchilada', 'baked ham', 'glazed ham',
];

export const DRINK_SIGNALS = [
  'smoothie', 'shake', 'juice', 'latte', 'tea', 'coffee', 'cider',
  'lassi', 'lemonade', 'drink', 'slushie', 'frappe', 'cocoa', 'milk', 'boba',
];

const NON_BEVERAGE_PATTERNS = [
  'smoothie bowl', 'açaí bowl', 'acai bowl', 'smoothie bowls',
  'baby food', 'puree', 'purée', 'toddler',
];

// Drink-type titles that should never land in recipe_catalog
const DRINK_REJECT_FOR_FOOD = ['smoothie', 'milkshake', 'cocktail', 'lemonade', 'mocktail'];

function getTitle(item) {
  return ((item.name || item.title) || '').toLowerCase();
}

function getTags(item) {
  return (item.tags || []).map(t => (typeof t === 'string' ? t : (t.name || '')).toLowerCase());
}

function getIngredientNames(item) {
  return [
    ...(item.sections || []).flatMap(s =>
      (s.components || []).map(c => (c.ingredient?.name || '').toLowerCase())
    ),
    ...(item.extendedIngredients || []).map(i => (i.name || '').toLowerCase()),
    ...(item.ingredients || []).map(i =>
      (typeof i === 'string' ? i : (i.name || '')).toLowerCase()
    ),
  ];
}

// Returns null if safe, or a skip-reason string if not.
// targetCatalog: 'beverage' | 'recipe'
export function contentSafetyCheck(item, targetCatalog) {
  const title = getTitle(item);
  const tagNames = getTags(item);

  if (targetCatalog === 'beverage') {
    for (const p of NON_BEVERAGE_PATTERNS) {
      if (title.includes(p)) return 'non-beverage';
    }
    for (const p of SAVORY_PATTERNS) {
      if (title.includes(p)) return 'non-beverage';
    }
    if (/\d+\+?\s*(?:-\s*\d+\s*)?month/i.test(item.name || item.title || '')) return 'non-beverage';
    if (tagNames.some(t => t === 'baby_food' || t === 'baby-food' || t === 'baby')) return 'non-beverage';
    if (tagNames.some(t => t === 'cocktails' || t === 'alcohol' || t === 'alcoholic')) return 'non-beverage';
    return null;
  }

  if (targetCatalog === 'recipe') {
    for (const p of DRINK_REJECT_FOR_FOOD) {
      if (title.includes(p)) return 'drink';
    }
    return null;
  }

  return null;
}

// Returns true if the item contains at least one drink-indicating signal in title or ingredients.
// Used as an inclusion gate for ambiguous tags (shakes, beverages) that also return food.
export function hasDrinkSignal(item) {
  const allText = getTitle(item) + ' ' + getIngredientNames(item).join(' ');
  return DRINK_SIGNALS.some(s => allText.includes(s));
}

// Infers drink category (for beverages) or cuisine (for food recipes).
// defaultValue is used as the final fallback; pass 'smoothie' for beverages, 'International' for food.
export function inferCategory(item, targetCatalog, defaultValue) {
  const name = getTitle(item);
  const tagNames = getTags(item);

  if (targetCatalog === 'beverage') {
    if (name.includes('shake') || name.includes('frappe') || name.includes('frappuccino')) return 'milkshake';
    if (name.includes('smoothie')) return 'smoothie';
    if (name.includes('juice') || name.includes('lemonade') || name.includes('agua fresca') || name.includes('spritz')
      || tagNames.some(t => t === 'juices')) return 'juice';
    if (name.includes('latte') || name.includes('coffee') || name.includes('tea') || name.includes('cider')
      || name.includes('lassi') || name.includes('cocoa') || name.includes('hot chocolate') || name.includes('chai')) return 'other';
    return defaultValue ?? 'smoothie';
  }

  if (targetCatalog === 'recipe') {
    if (name.includes('pasta') || name.includes('risotto') || name.includes('lasagna') || name.includes('gnocchi')) return 'Italian';
    if (name.includes('taco') || name.includes('burrito') || name.includes('enchilada') || name.includes('quesadilla') || name.includes('fajita') || name.includes('tamale')) return 'Mexican';
    if (name.includes('stir fry') || name.includes('fried rice') || name.includes('ramen') || name.includes('sushi') || name.includes('lo mein')) return 'Asian';
    if (name.includes('curry') || name.includes('tikka') || name.includes('masala') || name.includes('dal') || name.includes('biryani') || name.includes('naan')) return 'Indian';
    if (name.includes('burger') || name.includes('bbq') || name.includes('barbecue') || name.includes('mac and cheese') || name.includes('chili')) return 'American';
    if (name.includes('soup') || name.includes('stew')) return 'Comfort Food';
    if (name.includes('salad')) return 'Salad';
    return defaultValue ?? 'International';
  }

  return defaultValue ?? '';
}
