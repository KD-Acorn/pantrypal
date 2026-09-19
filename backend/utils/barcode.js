// Validation for barcode routes. Barcodes are used as Firestore doc ids and are
// interpolated into an outbound URL, so they must be strictly numeric.
import { stripControlChars } from './sanitize.js';

export const BARCODE_RE = /^\d{6,14}$/;

const LIMITS = { name: 100, originalName: 200, unit: 20, itemSize: 30, maxQuantity: 100000 };

const clean = (v) => stripControlChars(v).trim();

// Validates the body of POST /api/scan-barcode/confirm. `uid` in the body is ignored on
// purpose — callers use req.uid. Returns { ok: true, value } or { ok: false, error }.
export function validateConfirmPayload(body) {
  const b = body && typeof body === 'object' ? body : {};

  if (typeof b.barcode !== 'string' || !BARCODE_RE.test(b.barcode)) {
    return { ok: false, error: 'barcode must be 6-14 digits' };
  }
  const name = typeof b.name === 'string' ? clean(b.name) : '';
  if (name.length < 1 || name.length > LIMITS.name) {
    return { ok: false, error: `name must be 1-${LIMITS.name} characters` };
  }
  if (typeof b.quantity !== 'number' || !Number.isFinite(b.quantity) || b.quantity <= 0 || b.quantity > LIMITS.maxQuantity) {
    return { ok: false, error: 'quantity must be a positive number' };
  }
  const unit = typeof b.unit === 'string' ? clean(b.unit) : '';
  if (unit.length < 1 || unit.length > LIMITS.unit) {
    return { ok: false, error: `unit must be 1-${LIMITS.unit} characters` };
  }

  let originalName = '';
  if (b.originalName != null && b.originalName !== '') {
    originalName = typeof b.originalName === 'string' ? clean(b.originalName) : null;
    if (originalName === null || originalName.length > LIMITS.originalName) {
      return { ok: false, error: `originalName must be at most ${LIMITS.originalName} characters` };
    }
  }
  let correctedName = '';
  if (b.correctedName != null && b.correctedName !== '') {
    correctedName = typeof b.correctedName === 'string' ? clean(b.correctedName) : null;
    if (correctedName === null || correctedName.length > LIMITS.name) {
      return { ok: false, error: `correctedName must be at most ${LIMITS.name} characters` };
    }
  }
  let itemSize = null;
  if (b.itemSize != null && b.itemSize !== '') {
    itemSize = typeof b.itemSize === 'string' ? clean(b.itemSize) : null;
    if (itemSize === null || itemSize.length > LIMITS.itemSize) {
      return { ok: false, error: `itemSize must be at most ${LIMITS.itemSize} characters` };
    }
  }

  return {
    ok: true,
    value: {
      barcode: b.barcode, name, quantity: b.quantity, unit,
      originalName, correctedName, itemSize,
      needsReview: b.needsReview === true,
    },
  };
}

// Distinct uids that have confirmed a verified_products doc. `confirmedBy` used to be a
// single uid string (the last confirmer); it is now an array. Legacy strings are read as
// a one-element array and only rewritten when the doc next receives a new confirmation.
export function confirmersOf(doc) {
  const c = doc?.confirmedBy;
  if (Array.isArray(c)) return c.filter((x) => typeof x === 'string');
  if (typeof c === 'string' && c) return [c];
  return [];
}

// Pure core of the confirm transaction: given the current doc data (or null), the caller's
// uid and the validated payload, returns the fields to write, or null when this uid has
// already confirmed the barcode (caller should no-op and still answer 200).
// `now` is the timestamp value to stamp (FieldValue.serverTimestamp() in production).
export function buildConfirmationUpdate(existing, uid, value, now) {
  const confirmers = confirmersOf(existing);
  if (confirmers.includes(uid)) return null;
  const { name, quantity, unit, itemSize, originalName, correctedName, needsReview } = value;
  const data = {
    name, quantity, unit, itemSize,
    originalName: originalName || existing?.originalName || name,
    confirmedBy: [...confirmers, uid],
    confirmCount: (Number.isFinite(existing?.confirmCount) ? existing.confirmCount : 0) + 1,
    lastConfirmedAt: now,
    source: 'user_correction',
  };
  if (needsReview) {
    data.needsReview = true;
    data.correctedName = correctedName || name;
    data.reportedBy = uid;
    data.reportedAt = now;
  }
  return data;
}
