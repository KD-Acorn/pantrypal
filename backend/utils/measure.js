// Safe parsing of recipe-API measure strings ("1/2 cup", "1 1/2 tsp", "200g").
// Replaces the eval() that used to run on TheMealDB/TheCocktailDB text — those strings
// come from third-party data, so nothing here may evaluate or construct code.

const DECIMAL = /^\d+(\.\d+)?$/;
const FRACTION = /^(\d+)\/(\d+)$/;
const MIXED = /^(\d+)\s+(\d+)\/(\d+)$/;

// Accepts only "2", "2.5", "1/2" and "1 1/2". Anything else — including a zero
// denominator — returns null instead of throwing.
export function parseMeasureAmount(raw) {
  if (typeof raw !== 'string') return null;
  const s = raw.trim();
  let m;
  if (DECIMAL.test(s)) return parseFloat(s);
  if ((m = FRACTION.exec(s))) {
    const den = Number(m[2]);
    return den === 0 ? null : Number(m[1]) / den;
  }
  if ((m = MIXED.exec(s))) {
    const den = Number(m[3]);
    return den === 0 ? null : Number(m[1]) + Number(m[2]) / den;
  }
  return null;
}

// Leading amount token: a mixed number ("1 1/2") or a run of digits/dots/slashes.
const AMOUNT_TOKEN = /^(\d+\s+\d+\/\d+|[\d.\/]+)/;

// Splits "1 1/2 cups" into { amount: 1.5, rawUnit: 'cups' }. An amount that is missing
// or fails parseMeasureAmount defaults to 1 (the same default the old code used).
export function splitMeasure(measure) {
  const text = typeof measure === 'string' ? measure.trim() : '';
  const m = AMOUNT_TOKEN.exec(text);
  if (!m) return { amount: 1, rawUnit: text };
  return { amount: parseMeasureAmount(m[1]) || 1, rawUnit: text.slice(m[0].length).trim() };
}
