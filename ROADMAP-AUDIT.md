# My Pantry Club — Ground-Truth Repo Audit (2026-09-08)

**Replaces** the 07-05/07-14 `ROADMAP-AUDIT.md`. That document is now superseded — treat this one as current.

**Method:** Verified by reading actual files, `git log`/`git show`, and live Firestore queries via the backend's `serviceAccount.json` (Admin SDK) run against the production project (`pantrypal-ab665`) on 2026-09-08. Not a summary of README/ROADMAP/chat history.

**Headline fact that reframes every item below:** the repo has had **zero commits since 2026-07-16** (`21ce1ff`, "version tracking"). `git status` is clean, `origin/main` matches local exactly. Nothing has shipped in ~8 weeks. Every "was X ever fixed/changed" question below therefore has a hard answer: either it's in that Jul 16 snapshot or it never happened.

---

## 1. Pantry quantity/unit data model — NEVER TOUCHED

No commits since July 21 exist at all (see headline fact), so trivially nothing touched it in that window. More importantly: it was never touched, period, going back through the whole visible history.

`frontend/src/hooks/usePantry.js` still creates and merges items with exactly the original shape:
```js
{ id, name, quantity: 1, unit: 'item', category, addedAt }
```
(`usePantry.js:132,192,205,239`). No richer unit-type system, no numeric-amount/unit-enum split, nothing resembling a "rebuild" was ever implemented.

One nuance worth logging: `expiryDate` **does** exist on pantry items, but only as a bolt-on optional field written later through the edit flow in `PantryPage.jsx` (`editDraft.expiryDate` → `updateDoc`) — it is not part of the original `addItem`/merge object literal, and it predates this audit's window by a wide margin. It is not related to the quantity/unit question and does not represent progress on it.

**This is confirmed as the single most-flagged unresolved item, and it remains fully unresolved.**

---

## 2. Admin dashboard counters (pantryCount/recipesCount/cookCount) — FIXED AND DEPLOYED

Yes, fixed, and yes, live. Two things to distinguish:

- **`admin/src/pages/UsersPage.jsx`** (the per-user counts table): originally (`fb0cb31`, Jun 25) read a static `data.pantryCount || 0` field off each `users/{uid}` doc — a field that is never actually written anywhere, so it always showed 0. Fixed in `41f5b28` (Jul 4): now calls `getCountFromServer()` against the real subcollections (`pantry/{uid}/items`, `saved_recipes/{uid}/recipes`, `cook_history/{uid}/entries`) live, per user.
- **Confirmed deployed**: `admin/dist` was built 2026-07-04 20:47 (same day as the fix commit), the bundle contains `getCountFromServer`, and `mpc-admin` (PM2, port 3005, `vite preview`) serves that same `dist/` — not a dev server. The fix is live in production.
- **`admin/src/pages/DashboardPage.jsx`** (the top-level dashboard) never referenced `pantryCount`/`recipesCount`/`cookCount` at all — it only touches `users` and `public_recipes` collections. If "0 on the dashboard" was ever reported specifically about `DashboardPage`, that's a different surface than what got fixed; `UsersPage` is where the counter logic lives and it's correct.

**Bonus finding tied to this item:** the `users/{uid}.pantryCount`/`.recipesCount`/`.cookCount` fields themselves are still permanently stuck at (mostly) 0 — see item 6. The admin table works *because* it stopped trusting that field, not because the field got fixed.

---

## 3. `VITE_FIREBASE_API_KEY` — PRESENT, and it works

`admin/.env` has it:
```
VITE_FIREBASE_API_KEY=AIzaSyDUK4QAsoMwLtqB6BrtsceGolfbL0By8cg
```
Referenced in `admin/src/firebase.js:6` (`import.meta.env.VITE_FIREBASE_API_KEY`), and confirmed **baked into the deployed bundle** (`grep -o "AIzaSy..." admin/dist/assets/*.js` returns the real key, not `undefined`). Not missing, not cosmetic — it's live and functioning.

One flag while in there: `admin/.env` is malformed — it's wrapped in stray JS object syntax left over from a copy-paste:
```
const firebaseConfig = {
 VITE_FIREBASE_API_KEY=AIzaSyDUK4QAsoMwLtqB6BrtsceGolfbL0By8cg
...
}
```
It happens to still parse correctly (dotenv/Vite ignore non-`KEY=VALUE` lines), which is why it works — but it's fragile and should be cleaned up before anyone edits this file by hand again. Not tracked in git (`.gitignore` has `.env`), so no exposure risk there.

---

## 4. Dead route `/api/drinks/seed-cocktails` — STILL PRESENT, confirmed dead

Both routes still exist in `backend/index.js`:
- `POST /api/drinks/seed-cocktails` — line 1854
- `POST /api/admin/seed-cocktails` (+ `/status`, `/stop`) — lines 2164, 2224, 2225

The admin UI (`admin/src/pages/CatalogPage.jsx:480-482`) calls **only** `/api/admin/seed-cocktails` and its `/status`/`/stop` companions. `/api/drinks/seed-cocktails` has zero callers anywhere in the codebase (frontend, admin, scripts, docs) other than the prior audit noting it as a near-duplicate. It's unreachable dead code — safe to delete.

---

## 5. Firestore errors (grocery permission-denied, useUserRecipes failed-precondition) — ONE STILL BROKEN, ONE UNVERIFIABLE-BUT-LIKELY-BENIGN

Reproduced live against production Firestore (2026-09-08, via Admin SDK running the app's exact query):

- **`useUserRecipes` failed-precondition — CONFIRMED STILL BROKEN, right now.** The hook (`frontend/src/hooks/useUserRecipes.js:15-18`) runs `where('authorUid','==',uid).orderBy('createdAt','desc')` on `user_recipes` — a composite query. Running that exact query live today throws:
  ```
  FAILED_PRECONDITION: The query requires an index. ...
  https://console.firebase.google.com/v1/r/project/pantrypal-ab665/firestore/indexes?create_composite=...
  ```
  There is no `firestore.indexes.json` anywhere in the repo, so this index was never deployed as IaC and evidently was never manually created in the Firebase console either. Anyone who opens "My Creations" will get an empty/broken list. This is real, current, and trivially fixable — click the console link Firestore hands you, or add `firestore.indexes.json` and deploy it.

- **Grocery listener `permission-denied` — not currently reproducible, likely a benign startup race, not a rule bug.** Firestore client errors never reach `pm2 logs` (they happen in-browser, not on the server), so I couldn't check logs directly. Instead I found real evidence in the `bug_reports` collection: a Jul 14 debug capture from a real user session shows the exact sequence —
  ```
  [Grocery] Setting up Firestore listener for uid: ...
  ERROR permission-denied: Missing or insufficient permissions.
  ERROR useUserRecipes: failed-precondition
  [Grocery] onSnapshot fired: 0 items      ← recovers immediately after
  ```
  The listener throws once, then the *same* `onSnapshot` immediately delivers a successful (if empty) result — consistent with an auth-token-not-yet-attached race on first mount, not a broken security rule. Current `firestore.rules` (`grocery/{uid}/items/{itemId}: allow read, write: if request.auth.uid == uid`) and the hook's `useGroceryList.js` gating (`if (!uid) return`) both look correct on inspection, and `firestore.rules` hasn't been touched since Jun 29 — before this Jul 14 capture — so nothing was changed in response to it either. Only 2 bug reports exist total in the whole collection, so there's no larger pattern to confirm or rule out; would need a live browser session to say for certain whether it still fires.

---

## 6. User count / engagement — 31 users, real usage exists, per-user counter fields are dead

Live Firestore query (2026-09-08):
- **`users` collection: 31 documents.**
- **Per-user doc fields `pantryCount`/`recipesCount`/`cookCount`: effectively all zero**, including for accounts with real activity (e.g. the admin's own account shows `recipesCount: 0, cookCount: 0` on the doc despite having 9 saved recipes and 2 cook-history entries in the real subcollections). These fields are write-never — nothing in the codebase sets them; they're vestigial from whatever originally seeded the `users` doc shape.
- **Real subcollection counts tell a different story — usage is genuine, not zero:** 9 of the 31 accounts have nonzero `pantry`/`saved_recipes`/`cook_history` subcollection data, e.g. `qunishah1@gmail.com` (13 pantry items, 1 recipe), `pameliapatterson1972@gmail.com` (14 pantry items), the admin account itself (32 pantry items, 9 recipes, 2 cooks).

**Conclusion: "0 engagement" was purely a metrics-reading bug**, specifically the same stale `users/{uid}` field bug noted in item 2 — the admin dashboard table now reads around it correctly, but the underlying per-user doc fields are still permanently stuck at 0 and always will be until something actually writes to them (or they get removed and the UI is fully weaned off them).

---

## 7. Doc staleness — README.md and ROADMAP.md are both significantly behind

**README.md** describes a 3-tab MVP (Scan / My Pantry / Discover) with "Fully persistent via localStorage." That's the Phase 1 shape from June. Since then, unmentioned in README: Firestore as the real backend (localStorage is migration-only now via `MigrationBanner.jsx`), the entire `admin/` app and its `mpc-admin` PM2 process (not in Stack, Environment Variables, or Project Structure), Households, Grocery List, Meal Planner, Community Feed, User-Submitted Recipes, the beverage/cocktail catalog and `/api/drinks` endpoints, bug reporting, account deletion, and four env vars actually in use (`SPOONACULAR_API_KEY`, `EDAMAM_APP_ID`, `EDAMAM_APP_KEY`, `RAPIDAPI_KEY`, `ADMIN_UID`) that aren't in its Environment Variables table.

**ROADMAP.md**, specific mismatches:
- **Phase 8 — Admin Dashboard** is marked entirely `🔜` (not started). It's fully built and deployed (8 admin pages, live PM2 process, bug report inbox with status tracking, user management with real counts — see item 2).
- **Phase 8.5, Option B (community barcode dictionary)** marked `[ ]`. It's implemented — `verified_products` collection exists with exactly the described shape (`barcode`, `confirmCount`, `communityVerified`, etc.), shipped in commit `9f2b0e8`.
- **Phase 8.6, "Automatic debug log with every bug report"** marked `[ ]`. Implemented essentially verbatim — confirmed live by reading an actual `bug_reports` doc, which contains `appVersion`, browser/OS, `currentTab`, `pantryItemCount`, `savedRecipeCount`, and a `recentLogs` console capture, exactly matching the spec.
- **"User-Submitted Original Recipes"** section marked entirely `[ ]`. Implemented — `user_recipes` collection, `useUserRecipes.js`, "My Creations" tab, shipped in commit `fe1d94d` ("user-submitted recipes, My Creations tab, comments, creator controls, community FAB").
- **Entire beverage/cocktail/mocktail feature is absent from the roadmap** — `DrinkDiscoverPage.jsx`, `/api/drinks`, `/api/drinks/mocktail/:id`, the `beverage_catalog` collection, TheCocktailDB + Tasty API integration. Multiple real commits of work with no roadmap entry anywhere.
- Also undocumented: the Shop List feature (`ShopListSheet.jsx`, commit `50f2aeb`) and version tracking/About screen/What's New modal (commit `21ce1ff`, the most recent commit in the repo).
- Roadmap items that **are** still accurately `🔜`: Chef Sponsor + Cookbook Marketplace — confirmed zero code hits for "chef"/"sponsor"/"cookbook" anywhere in frontend, backend, or admin. That one's honestly not started.

**CHANGELOG.md** has its own small inconsistency: an `[Unreleased]` entry describes an iOS Safari HEIC/HEIF photo-upload fix as pending, but the code (`ScanPage.jsx`, `IMG_ACCEPT` with `image/heic,image/heif`, `heicWarning` state) is already present on `main` with a clean working tree — the fix shipped, the changelog just never got moved out of Unreleased into a version entry.

---

## 8. General — other things worth flagging

- **No secrets committed to git.** `backend/serviceAccount.json` and both `.env` files are properly gitignored and not tracked (`git ls-files` confirms). `admin/.env`'s Firebase web API key is a public client identifier by design (restricted via Firebase Console, not meant to be secret) — not a real exposure, just noted for completeness.
- **Deploy freeze: nothing has shipped in ~8 weeks.** Working tree is clean, so this isn't "uncommitted work sitting around" — it's just that no development has happened on this project since 2026-07-16. Worth confirming with the user whether that's intentional (project paused) before treating any of the above as urgent.
- **No `firestore.indexes.json` in the repo at all**, for any collection — index management is entirely manual/console-side and untracked. The `user_recipes` missing-index bug (item 5) is a direct symptom of that; there may be other queries with the same latent risk that just haven't been hit yet.
- **`admin/.env` malformed** (item 3) — works today by accident of how dotenv parsers skip non-conforming lines; a bad copy-paste away from silently breaking the build.
- Minor version-hygiene loose end: `admin/package.json` is still at `"version": "0.0.0"` while `frontend/package.json` is at `3.0.1` — cosmetic, no functional impact.
