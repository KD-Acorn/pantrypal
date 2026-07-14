// Shared, file-persisted Tasty API request counter.
// All scripts drawing from the Tasty RapidAPI share this pool.
// Free-tier limit: 500 requests/month — update MONTHLY_LIMIT if the plan changes.

import fs from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const USAGE_FILE = resolve(__dirname, '..', 'data', 'tastyUsage.json');
const MONTHLY_LIMIT = 500; // RapidAPI free tier — verify on the listing page if upgraded
const SAFETY_CAP = 450;    // Never let any single run push past this; leaves a 50-request buffer

function currentMonthKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function readFile() {
  try { return JSON.parse(fs.readFileSync(USAGE_FILE, 'utf8')); }
  catch { return null; }
}

function writeFile(data) {
  fs.writeFileSync(USAGE_FILE, JSON.stringify(data, null, 2));
}

// Reads current usage, auto-resets if the stored month is no longer the current month.
export function getUsage() {
  const data = readFile();
  const monthKey = currentMonthKey();
  if (!data || data.monthKey !== monthKey) {
    const fresh = {
      monthKey,
      requestsUsed: 0,
      lastUpdated: new Date().toISOString(),
      log: (data?.log || []).slice(-50),
    };
    writeFile(fresh);
    return fresh;
  }
  return data;
}

// Increments counter and appends a log entry. Returns total requests used this month.
export function recordUsage(script, count) {
  const data = getUsage();
  data.requestsUsed += count;
  data.lastUpdated = new Date().toISOString();
  data.log = [...(data.log || []).slice(-49), { date: data.lastUpdated, script, requests: count }];
  writeFile(data);
  return data.requestsUsed;
}

export function remainingThisMonth() {
  return MONTHLY_LIMIT - getUsage().requestsUsed;
}

// Returns true if making requestedCount more calls would push past the 450 safety cap.
export function wouldExceedSafetyCap(requestedCount) {
  return getUsage().requestsUsed + requestedCount > SAFETY_CAP;
}

// Per-tag Tasty pagination offsets — lets runs resume mid-catalog instead of restarting.
// Returns 0 if the stored month has rolled over (fresh start after monthly reset).
export function getTagOffset(slug) {
  const data = readFile();
  if (!data || data.monthKey !== currentMonthKey()) return 0;
  return (data.tagOffsets || {})[slug] || 0;
}

// Persist the current pagination offset for a Tasty tag.
// Pass offset=0 to reset a tag that has reached the end of its catalog.
export function setTagOffset(slug, offset) {
  const data = readFile();
  if (!data || data.monthKey !== currentMonthKey()) return; // month will reset on next getUsage()
  data.tagOffsets = data.tagOffsets || {};
  data.tagOffsets[slug] = offset;
  writeFile(data);
}

export { MONTHLY_LIMIT, SAFETY_CAP };
