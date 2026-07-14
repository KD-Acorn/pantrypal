# My Pantry Club — Ground-Truth Repo Audit

**Purpose:** This document reflects the CURRENT ACTUAL STATE of the codebase at
`/home/sketchy/projects/pantrypal`, verified by reading the real files — not by
summarizing `README.md`, `ROADMAP.md`, or chat/commit history. Where those
documents disagree with the code, that's called out explicitly in §10. This is
a snapshot; re-run the audit after significant changes rather than trusting it
indefinitely.

Generated: 2026-07-14.

---

## 1. Full Directory Structure

Excludes `node_modules`, `dist`, `.git`.

```
.
├── .claude/
│   └── settings.local.json
├── .env
├── .env.example
├── .gitignore
├── README.md
├── ROADMAP.md
├── ecosystem.config.cjs
├── firestore.rules
├── admin/
│   ├── .env
│   ├── .gitignore
│   ├── .oxlintrc.json
│   ├── index.html
│   ├── package.json
│   ├── package-lock.json
│   ├── README.md
│   ├── vite.config.js
│   ├── public/
│   │   ├── favicon.svg
│   │   ├── full_logo-removebg-preview.png
│   │   ├── icons.svg
│   │   └── small_logo-removebg-preview.png
│   └── src/
│       ├── App.jsx
│       ├── firebase.js
│       ├── main.jsx
│       ├── assets/
│       │   ├── hero.png
│       │   └── vite.svg
│       ├── components/
│       │   └── AdminSidebar.jsx
│       ├── context/
│       │   └── AdminAuthContext.jsx
│       └── pages/
│           ├── AdminLoginPage.jsx
│           ├── AnalyticsPage.jsx
│           ├── BugReportsPage.jsx
│           ├── CatalogPage.jsx
│           ├── DashboardPage.jsx
│           ├── PlaceholderPage.jsx
│           ├── RecipesPage.jsx
│           ├── SupportPage.jsx
│           └── UsersPage.jsx
├── backend/
│   ├── ecosystem.config.cjs
│   ├── index.js
│   ├── package.json
│   ├── package-lock.json
│   ├── serviceAccount.json
│   ├── data/
│   │   ├── receiptScanLog.json
│   │   ├── storeAbbreviations.json
│   │   └── tastyUsage.json
│   ├── scripts/
│   │   ├── buildCorrectionsPrompt.js
│   │   ├── flagBadBeverages.js
│   │   ├── seedBeverages.js
│   │   ├── seedCatalog.js
│   │   ├── seedCocktails.js
│   │   ├── seedFoodFromTasty.js
│   │   ├── seedProgress.json
│   │   ├── tastyQuota.js
│   │   └── weeklySync.js
│   └── utils/
│       └── catalogClassifier.js
└── frontend/
    ├── .env
    ├── index.html
    ├── package.json
    ├── package-lock.json
    ├── vite.config.js
    ├── public/
    │   ├── manifest.json
    │   ├── privacy.html
    │   ├── robots.txt
    │   ├── sitemap.xml
    │   ├── sw.js
    │   ├── terms.html
    │   └── images/
    │       ├── full logo.png
    │       ├── full_logo-removebg-preview.png
    │       ├── icon-192.png
    │       ├── icon-512-maskable.png
    │       ├── icon-512.png
    │       ├── og-image.html
    │       └── small logo.jpg
    └── src/
        ├── App.jsx
        ├── firebase.js
        ├── main.jsx
        ├── components/
        │   ├── AppTour.jsx
        │   ├── BottomNav.jsx
        │   ├── BugReportButton.jsx
        │   ├── CreateHouseholdSheet.jsx
        │   ├── CreateRecipeSheet.jsx
        │   ├── CustomizeRecipeSheet.jsx
        │   ├── JoinHouseholdSheet.jsx
        │   ├── MadeItSheet.jsx
        │   ├── MigrationBanner.jsx
        │   ├── OnboardingFlow.jsx
        │   ├── PendingDeletionScreen.jsx
        │   ├── RateLimitModal.jsx
        │   ├── RecipeCard.jsx
        │   ├── ShopListSheet.jsx
        │   ├── Spinner.jsx
        │   ├── SupportChatBubble.jsx
        │   └── Toast.jsx
        ├── config/
        │   └── shoppingPartners.js
        ├── context/
        │   └── AuthContext.jsx
        ├── hooks/
        │   ├── useCategoryLearning.js
        │   ├── useCookHistory.js
        │   ├── useGroceryList.js
        │   ├── useHousehold.js
        │   ├── useHouseholdMealPlan.js
        │   ├── useHouseholdPantry.js
        │   ├── useHouseholdRecipes.js
        │   ├── useMealPlan.js
        │   ├── usePantry.js
        │   ├── useRateLimit.js
        │   ├── useSavedDrinks.js
        │   ├── useSavedRecipes.js
        │   ├── useSeenDrinks.js
        │   ├── useSeenRecipes.js
        │   ├── useSettings.js
        │   ├── useToast.js
        │   └── useUserRecipes.js
        ├── pages/
        │   ├── AuthPage.jsx
        │   ├── CommunityFeed.jsx
        │   ├── DiscoverPage.jsx
        │   ├── DrinkDiscoverPage.jsx
        │   ├── GroceryPage.jsx
        │   ├── LegalPage.jsx
        │   ├── MealPlanPage.jsx
        │   ├── PantryPage.jsx
        │   ├── RecipesPage.jsx
        │   ├── ScanPage.jsx
        │   └── SettingsPage.jsx
        └── utils/
            └── analytics.js
```

---

## 2. Backend Routes

All 37 routes (36 API + `/health`) live in a **single file**,
`backend/index.js` (2798 lines) — there is no `routes/` directory or
router-splitting. `backend/utils/catalogClassifier.js` supplies content-safety
helper functions used by several routes/scripts; it registers no routes.

**Global middleware** (top of `index.js`): `express.json({limit:'10mb'})`;
`cors(...)` restricted to an origin allowlist (`localhost:3004`,
`localhost:3005`, `pantry.doneitmobile.com`, `mypantryclub.com`/`www`,
`mypantryclub.app`/`www`, `admin.mypantryclub.com`) allowing only
`GET, POST, DELETE, OPTIONS` — **note: zero PUT/PATCH routes exist anywhere in
the backend**. There is no global auth middleware; auth is applied per-route.

**Auth middleware — actual implementation:**

- **`verifyAdmin`** (index.js:1840): requires a `Bearer <token>` header,
  verifies it as a Firebase ID token via `adminAuth.verifyIdToken`, then
  checks `decoded.uid === ADMIN_UID` (a single hardcoded UID from an env
  var). **This is a one-user allowlist, not a Firebase custom-claim check.**
  If `ADMIN_UID` isn't set or `adminAuth` failed to init (missing
  `serviceAccount.json`), every admin route 401s.
- **Inline pattern** (not a shared middleware, hand-repeated in the 3
  `/api/delete-account*` routes): manually checks `Bearer` header + calls
  `adminAuth.verifyIdToken` — confirms "a valid logged-in Firebase user," with
  no admin/role check (appropriate here since it's self-service account
  deletion).
- **Every other route has no authentication at all** — open to any HTTP
  client that can reach it (browser-only CORS restriction doesn't stop direct
  API calls). A few routes (`/api/scan-barcode/confirm`,
  `/api/support/chat`) accept a client-supplied `uid` field and store it
  as-is, unverified against any token — spoofable.

### Pantry / Grocery

**No backend HTTP routes exist for Pantry or Grocery CRUD.** A full grep of
`index.js` for pantry/grocery route registrations returns nothing. These
collections (`pantry/{uid}/items`, `grocery/{uid}/items`) are touched
server-side only inside the account-deletion cleanup logic. All day-to-day
pantry/grocery reads and writes happen **client-side, directly against
Firestore**, via the `usePantry`/`useGroceryList`/`useHouseholdPantry` hooks —
not proxied through this Express backend at all.

### Scan

| Method & Path | Description | Auth |
|---|---|---|
| `POST /api/scan` | Sends an uploaded photo to OpenAI GPT-4o to identify pantry ingredients (qty/unit/category) + read visible barcodes; injects a community "corrections block" from Firestore `category_corrections` into the prompt. | none |
| `POST /api/scan-receipt` | Sends a receipt photo to GPT-4o to extract food/beverage line items, using `data/storeAbbreviations.json` as an expansion hint; appends to `data/receiptScanLog.json`. | none |
| `POST /api/scan-barcode` | GPT-4o reads barcode digits from an image, checks Firestore `verified_products` cache (used if `confirmCount >= 2`), else queries Open Food Facts and upserts the cache doc. | none |
| `GET /api/barcode-lookup` | Same `verified_products` → Open Food Facts lookup, but takes `?barcode=` directly (no image/OCR). | none |
| `POST /api/scan-barcode/confirm` | Records a user correction against a barcode in `verified_products` (increments `confirmCount`); trusts client-supplied `uid` unverified. | none |
| `POST /api/store-abbreviations/add` | Adds/updates a store abbreviation mapping in `backend/data/storeAbbreviations.json` on disk. | none |

### Recipes

| Method & Path | Description | Auth |
|---|---|---|
| `POST /api/recipes` | Core recipe engine: searches Firestore `recipe_catalog` first, fans out to TheMealDB + Tasty in parallel if <3 hits, then Edamam, then Spoonacular only if still short (to conserve quota); caches new external hits into `recipe_catalog`; fills remaining slots via Anthropic Claude (`claude-haiku-4-5-20251001`) generation; merges/sorts by match score, returns top 5. | none |
| `POST /api/substitutions` | Claude call suggesting 3 ingredient substitutions for a given ingredient/recipe context. | none |

### Drinks

| Method & Path | Description | Auth |
|---|---|---|
| `POST /api/drinks` | Same hybrid pattern as `/api/recipes` for drinks: Firestore `beverage_catalog` first, TheCocktailDB (cocktails only), then Claude-generated fill (non-alcoholic AI drinks get cached back to catalog; alcoholic ones don't). | none |
| `GET /api/drinks/mocktail/:cocktailId` | Converts a cocktail to a non-alcoholic version via Claude, caches result in subcollection `beverage_catalog/{id}/mocktail/version`. | none |

### Admin

| Method & Path | Description | Auth |
|---|---|---|
| `POST /api/drinks/seed-cocktails` | Background job, walks TheCocktailDB a–z, bulk-seeds `beverage_catalog`. **Near-duplicate of `/api/admin/seed-cocktails` below** — see §10. | verifyAdmin |
| `POST /api/admin/seed-catalog` | Background Spoonacular recipe-catalog seed job (hardcoded query list, capped at 45 Spoonacular points/run), tracked in `seedState`. | verifyAdmin |
| `POST /api/admin/seed-catalog/stop` | Halts the running seed job. | verifyAdmin |
| `GET /api/admin/seed-catalog/status` | Returns `seedState`. | verifyAdmin |
| `GET /api/admin/catalog/stats` | Aggregate stats on `recipe_catalog` (counts by source, nutrition coverage, last sync from `config/catalog_sync`). | verifyAdmin |
| `GET /api/admin/catalog/recipes` | Paginated `recipe_catalog` listing, optional `source` filter. | verifyAdmin |
| `DELETE /api/admin/catalog/recipes/:id` | Deletes one `recipe_catalog` doc. | verifyAdmin |
| `POST /api/admin/seed-cocktails` | TheCocktailDB a–z bulk seed into `beverage_catalog`, tracked via persistent `cocktailAdminState` (has matching status/stop endpoints, unlike route #1 above). | verifyAdmin |
| `GET /api/admin/seed-cocktails/status` | Returns `cocktailAdminState`. | verifyAdmin |
| `POST /api/admin/seed-cocktails/stop` | Halts it. | verifyAdmin |
| `POST /api/admin/seed-beverages` | Background job seeding `beverage_catalog` from Tasty API tags (smoothies/shakes/juices/beverages), content-safety filtered, quota/offset-aware via `tastyQuota.js`; falls back to Spoonacular if no Tasty key/results. | verifyAdmin |
| `GET /api/admin/seed-beverages/status` | Returns `beverageSeedState`. | verifyAdmin |
| `POST /api/admin/seed-beverages/stop` | Halts it. | verifyAdmin |
| `GET /api/admin/tasty-quota` | Returns current Tasty monthly usage + limit/safety-cap constants. | verifyAdmin |
| `POST /api/admin/seed-food-tasty` | Background job seeding `recipe_catalog` from Tasty food tags, content-safety filtered, shared quota with beverages. Requires `RAPIDAPI_KEY` or 400s. | verifyAdmin |
| `GET /api/admin/seed-food-tasty/status` | Returns `foodTastyState`. | verifyAdmin |
| `POST /api/admin/seed-food-tasty/stop` | Halts it. | verifyAdmin |
| `POST /api/admin/beverage-catalog/drinks/:id/move-to-food` | Moves a doc from `beverage_catalog` to `recipe_catalog` (fixing miscategorization), infers cuisine, deletes original. | verifyAdmin |
| `GET /api/admin/beverage-catalog/stats` | Aggregate stats on `beverage_catalog`. | verifyAdmin |
| `GET /api/admin/beverage-catalog/drinks` | Paginated/filterable `beverage_catalog` listing. | verifyAdmin |
| `DELETE /api/admin/beverage-catalog/drinks/:id` | Deletes one `beverage_catalog` doc. | verifyAdmin |
| `GET /api/admin/support/sessions` | Paginated `support_sessions` listing, optional `status` filter, ordered by `lastMessageAt` desc. | verifyAdmin |

### Support

| Method & Path | Description | Auth |
|---|---|---|
| `POST /api/support/chat` | AI support chatbot ("Pantry") via Claude (`claude-haiku-4-5-20251001`, escalates to `claude-sonnet-4-6` if flagged); parses structured metadata from the reply to auto-file `bug_reports` and persist the transcript in `support_sessions/{sessionId}`. Trusts a client-supplied `uid` unverified. | none |

### Other / Uncategorized

| Method & Path | Description | Auth |
|---|---|---|
| `POST /api/delete-account` | Schedules account deletion 7 days out: reassigns/disbands owned households, removes membership elsewhere, anonymizes `public_recipes`, writes `pending_deletions/{uid}`. | Bearer + verifyIdToken |
| `POST /api/delete-account/cancel` | Deletes the `pending_deletions/{uid}` doc. | Bearer + verifyIdToken |
| `POST /api/delete-account/now` | Immediately wipes all user subcollections, handles household reassignment, anonymizes public recipes, deletes `users/{uid}` and the Firebase Auth user record. | Bearer + verifyIdToken |
| `GET /health` | Trivial liveness check, `{ok:true}`. | none |

---

## 3. Firestore Collections — Actual Current Schema

SDK note: `frontend/src/firebase.js` and `admin/src/firebase.js` both use the
**Firebase v9 modular SDK**; `backend/index.js` and `backend/scripts/*.js` use
**firebase-admin**. No `collectionGroup()` calls exist anywhere.

| Collection | Path shape | Read by | Written by | Known fields |
|---|---|---|---|---|
| `users` | top-level, doc id = uid | `AuthContext.jsx`, `App.jsx`, `useSettings.js`, `DrinkDiscoverPage.jsx`, admin `DashboardPage.jsx`/`UsersPage.jsx` | `AuthContext.jsx` (create), `usePantry.js`/`useSavedRecipes.js`/`useCookHistory.js` (counters), `useSettings.js`, `OnboardingFlow.jsx`, `SettingsPage.jsx`, `DrinkDiscoverPage.jsx`, backend (delete on account removal) | `uid, displayName, email, createdAt, onboardingComplete, pantryCount, recipesCount, cookCount, dietaryPreferences, cuisinePreferences, cocktailVerified, cocktailVerifiedAt, dietaryRestrictions` (admin `UsersPage.jsx` also defensively reads a `name` fallback field that's never written anywhere) |
| `pantry` | `pantry/{uid}/items/{itemId}` | `usePantry.js` (onSnapshot); admin only via `getCountFromServer` | `usePantry.js`, `MigrationBanner.jsx`; backend deletes wholesale on account deletion | `id, name, quantity, unit, category, addedAt` |
| `saved_recipes` | `saved_recipes/{uid}/recipes/{id}` | `useSavedRecipes.js`; admin count-only | `useSavedRecipes.js`, `MigrationBanner.jsx`, `RecipesPage.jsx` (share fields) | recipe fields + `id, savedAt, userRating, sharedToPublic, publicRecipeId` |
| `cook_history` | `cook_history/{uid}/entries/{id}` | `useCookHistory.js`; admin count-only | `useCookHistory.js`, `MigrationBanner.jsx` | entry fields + `id, cookedAt` |
| `substitutions` | `substitutions/{uid}/entries/{id}` | `useCookHistory.js` | `useCookHistory.js`, `MigrationBanner.jsx` | sub fields + `id, loggedAt` |
| `grocery` | `grocery/{uid}/items/{id}` | `useGroceryList.js` only | `useGroceryList.js` only | `id, name, quantity, unit, category, checked, addedAt, source`. **Never touched by admin app.** |
| `meal_plan` | `meal_plan/{uid}/days/{dateKey}` | `useMealPlan.js` only | `useMealPlan.js` only | `breakfast/lunch/dinner` slot objects `{recipeId, title, cookTime, matchScore, cuisine, missingIngredients}`. **Never touched by admin app.** |
| `households` | top-level | `useHousehold.js`; backend (owner-transfer/disband queries) | `useHousehold.js`, `SettingsPage.jsx` (disband), backend | `id, name, code, createdBy, createdAt, members[]{uid,displayName,email,role,joinedAt}, memberUids[], settings{sharesPantry,sharesRecipes,sharesMealPlan}, disbanded, disbandedAt, disbandedReason` |
| `household_pantry` | `household_pantry/{householdId}/items/{id}` | `useHouseholdPantry.js` only | same | `id, name, quantity, unit, addedBy, addedByName, lastUpdatedBy, addedAt, expiryDate` |
| `household_recipes` | `household_recipes/{householdId}/recipes/{id}` | `useHouseholdRecipes.js` only | same | recipe fields + `id, savedAt, addedBy, addedByName, userRating` |
| `household_meal_plan` | `household_meal_plan/{householdId}/days/{dateKey}` | `useHouseholdMealPlan.js` only | same | same shape as `meal_plan` |
| `household_activity` | `household_activity/{householdId}/events/{id}` | `useHousehold.js`, `PantryPage.jsx` (onSnapshot) | `useHousehold.js` (`logActivity`) | `type, uid, displayName, description, timestamp` |
| `household_invites` | top-level, doc id = lowercased email | — (nothing reads it) | `useHousehold.js` (`inviteByEmail`) | `householdId, householdName, invitedBy, invitedAt`. **Write-only — flagged in §10.** |
| `saved_drinks` | `saved_drinks/{uid}/drinks/{id}` | `useSavedDrinks.js` only | same | drink fields + `id, savedAt`. Never touched by backend or admin. |
| `user_recipes` | top-level | `useUserRecipes.js` (`where authorUid==`) | `useUserRecipes.js` | `id, authorUid, authorName, createdAt, updatedAt, madeCount, savedCount, avgRating, ratingCount, isOriginal, visibility` + a spread `recipeData` object whose full shape wasn't traced (title/ingredients/steps etc. come from the calling component). **Not fully confident of complete shape.** Never touched by admin app. |
| `public_recipes` | top-level | `CommunityFeed.jsx`, admin `DashboardPage.jsx`/`RecipesPage.jsx` | `useUserRecipes.js` (mirror), `CustomizeRecipeSheet.jsx`, `RecipesPage.jsx`, `CommunityFeed.jsx` (ratings), backend (anonymize on deletion) | `id, title, description, cookTime, difficulty, cuisine, baseServings, ingredients, steps, authorUid, authorName, sharedAt, rating, ratingCount, saveCount, isCustom, originalTitle, isUserSubmitted, originalRecipeId` |
| `recipe_comments` | `recipe_comments/{recipeId}/comments/{commentId}` | `useUserRecipes.js` only | same | `id, authorUid, authorName, text, createdAt, likes, likedBy`. Structurally odd: sits at top level rather than nested under `public_recipes`/`user_recipes`; only one call site touches it. |
| `recipe_catalog` | top-level, doc id = `<spoonacularId>` / `mdb_{id}` / `edm_{id}` / `tst_{id}` | backend (search/admin routes), admin `CatalogPage.jsx`, `weeklySync.js`, `seedBeverages.js`, `seedCatalog.js`, `seedFoodFromTasty.js` | backend, same scripts | `id, source, spoonacularId, mealDbId, tastyId, title, description, cookTime, difficulty, cuisine, baseServings, ingredients[], indexedIngredients[], steps[], thumbnail, tags[], fetchedAt, useCount, nutrition{calories,protein,carbs,fat,fiber}, sourceUrl, avgRating, ratingCount, sourceData{}`. Never read directly by the frontend — only via backend API. |
| `beverage_catalog` | top-level, doc id = `cdb_{id}` etc. | backend, admin `CatalogPage.jsx`, `seedBeverages.js`, `seedCocktails.js`, `flagBadBeverages.js` | backend, same scripts | `id, source, cocktailDbId, title, category, description, prepTime, difficulty, baseServings, ingredients[], indexedIngredients[], steps[], thumbnail, tags[], isAlcoholic, glassType, garnish, fetchedAt, useCount, avgRating, ratingCount`. Subcollection `beverage_catalog/{id}/mocktail/version` (AI mocktail cache). Never read directly by frontend. |
| `verified_products` | top-level, doc id = barcode | backend, admin `BugReportsPage.jsx` (review queue) | backend, admin (`approveCorrection`/`rejectCorrection`) | `barcode, originalName, name, quantity, unit, itemSize, confirmCount, lastConfirmedAt, source, confirmedBy, needsReview, correctedName, reportedBy, reportedAt, communityVerified, approvedAt` |
| `category_corrections` | top-level, doc id = normalized item name | backend (`refreshCorrectionsBlock`), `buildCorrectionsPrompt.js`, `useCategoryLearning.js` | `useCategoryLearning.js` | `normalizedName, displayName, votes{[category]:count}, totalCorrections, lastCorrectedAt, lastCorrectedBy`. Never touched by admin app. |
| `pending_deletions` | top-level, doc id = uid | `App.jsx`, admin `UsersPage.jsx` | backend only | `uid, email, requestedAt, scheduledFor, status`. Expected read-only-on-client pattern, not a bug. |
| `bug_reports` | top-level, auto-generated doc id | admin `BugReportsPage.jsx`, `AdminSidebar.jsx` | `BugReportButton.jsx`, `SupportChatBubble.jsx`, backend (auto-filed from support chat) | `type, description, currentTab, domain, userAgent, uid, status, source, sessionId, debugInfo{...}, timestamp`; admin writes `status` updates |
| `support_sessions` | top-level, doc id = client-generated `support_{uid}_{timestamp}` | admin `SupportPage.jsx`/`AdminSidebar.jsx`, backend | backend (per chat turn), `SupportChatBubble.jsx` (rating), admin `SupportPage.jsx` (resolve/notes) | `sessionId, uid, displayName, startedAt, lastMessageAt, status, model, messages[], context{}, bugReportId, resolution, escalated, deviceInfo, rating, resolvedAt, adminNotes[]{text,addedAt,addedBy}` |
| `analytics_events` | top-level | — (nothing reads it) | `utils/analytics.js` (`trackEvent`) | `event, domain, uid, timestamp` + arbitrary spread data varying by call site. **Write-only, no consumer anywhere — flagged in §10.** |
| `analytics_daily` | top-level, doc id = `YYYY-MM-DD` | admin `DashboardPage.jsx`/`AnalyticsPage.jsx` | `utils/analytics.js` (merge-write) | `date, domains.{domain}, pageViews, recipeGenerates, scans, signups` |
| `config` | top-level, docs `catalog_sync` / `beverage_seed` | backend, `weeklySync.js` | `weeklySync.js` writes `catalog_sync` (`lastOffset, lastSyncAt`) | `beverage_seed` fields `lastCocktailSeed, lastBeverageSeed` are **read by backend but no writer was found anywhere in the codebase** — flagged in §10. |
| `catalog_sync_logs` | top-level, doc id = ISO timestamp | — (nothing reads it) | `weeklySync.js` | `startedAt, completedAt, saved, skipped, pointsUsed, queries`. **Write-only, no viewer UI — flagged in §10.** |

**Structural note:** `households` is a flat top-level collection, while
household-scoped data (`household_pantry`, `household_recipes`,
`household_meal_plan`, `household_activity`, `household_invites`) lives in
*separate* top-level collections keyed by `householdId` rather than as true
Firestore subcollections of `households/{id}`. This is consistent and
deliberate, just worth knowing before assuming Firestore-rules subcollection
semantics apply.

---

## 4. Frontend Page & Component Inventory

### Pages (`frontend/src/pages/`)

- **AuthPage.jsx** — Sign in / sign up / Google auth screen with tab
  switching; delegates to `useAuth()`.
- **CommunityFeed.jsx** — Browses `public_recipes` (paginated, 20/page,
  ordered by `sharedAt`), rates recipes, saves them locally, ranks
  pantry-matching recipes first.
- **DiscoverPage.jsx** — Main AI recipe discovery hub with AI
  Recipes/Community/Drinks sub-tabs; posts pantry + filters to
  `POST /api/recipes`, handles shuffle/rate-limiting, renders `RecipeCard`.
- **DrinkDiscoverPage.jsx** — Drink discovery with an age-verification gate
  for cocktails (`users/{uid}.cocktailVerified`, 30-day recheck); posts to
  `POST /api/drinks`.
- **GroceryPage.jsx** — Standalone grocery list view; purely delegates to
  hooks passed as props, no direct Firestore/API calls of its own.
- **LegalPage.jsx** — Static Privacy Policy / Terms of Service text.
- **MealPlanPage.jsx** — Weekly planner (List/Calendar views,
  Personal/Household tabs), embeds a recipe picker that can call
  `POST /api/recipes` for AI suggestions.
- **PantryPage.jsx** — Combined Pantry + Grocery UI with Personal/Household
  tabs; live household activity feed via `onSnapshot`; category-correction
  UI; embeds a full inline grocery flow including `ShopListSheet`.
- **RecipesPage.jsx** — 4-tab hub: My Recipes (saved, share toggle), My
  Creations (user-authored, comments), Meal Plan (embedded), Cook History.
- **ScanPage.jsx** — Text/Photo/Receipt ingestion modes; calls `/api/scan`,
  `/api/barcode-lookup`, `/api/scan-receipt`, `/api/scan-barcode`,
  `/api/scan-barcode/confirm`; editable preview before saving to
  pantry/grocery.
- **SettingsPage.jsx** — Account settings, dietary/cuisine prefs, household
  management, shopping-partner toggles, account deletion flow
  (`/api/delete-account`), "Redo Setup", embeds `LegalPage`.

### Components (`frontend/src/components/`)

- **AppTour.jsx** — 16-step guided product tour overlay.
- **BottomNav.jsx** — 4-tab bottom nav (Scan / My Pantry / My Recipes /
  Discover) — pure presentational.
- **BugReportButton.jsx** — Floating bug/feedback button; writes directly to
  `bug_reports` with device/app context.
- **CreateHouseholdSheet.jsx** — Household creation sheet, delegates to
  `useHousehold`.
- **CreateRecipeSheet.jsx** — 3-step recipe creation/edit wizard; calls an
  `onSave` prop, no direct Firestore access.
- **CustomizeRecipeSheet.jsx** — Fork/customize an AI or community recipe;
  writes a new `public_recipes` doc directly when sharing publicly.
- **JoinHouseholdSheet.jsx** — Join-by-code or invite-by-email sheet.
- **MadeItSheet.jsx** — Post-cook confirmation flow; decrements pantry
  quantities, logs cook + substitutions.
- **MigrationBanner.jsx** — One-time localStorage→Firestore migration banner
  for newly authenticated users.
- **OnboardingFlow.jsx** — 5-page first-run onboarding wizard.
- **PendingDeletionScreen.jsx** — Countdown UI for a scheduled account
  deletion; cancel/delete-now actions.
- **RateLimitModal.jsx** — Daily usage-limit-reached modal.
- **RecipeCard.jsx** — Core recipe/drink display card used across the app
  (scaling, ratings, save, shopping links, substitutions, nutrition,
  mocktail conversion, Made It/Customize/Share actions).
- **ShopListSheet.jsx** — "Shop your list" sheet building affiliate search
  URLs for checked grocery items.
- **Spinner.jsx** — Trivial CSS spinner, no logic.
- **SupportChatBubble.jsx** — Floating AI support chat widget, calls
  `/api/support/chat`, can escalate/auto-file bugs.
- **Toast.jsx** — Trivial toast/snackbar component, no logic.

---

## 5. Hooks Inventory (`frontend/src/hooks/`)

- **useCategoryLearning.js** — Not a stateful hook; exports
  `loadCategoryCorrections()`/`recordCategoryCorrection()` against Firestore
  `category_corrections`.
- **useCookHistory.js** — Manages `cook_history/{uid}/entries` and
  `substitutions/{uid}/entries` (onSnapshot + setDoc); localStorage fallback
  when signed out.
- **useGroceryList.js** — Manages `grocery/{uid}/items`; localStorage
  fallback when signed out.
- **useHousehold.js** — Manages `households` (query + CRUD),
  `household_invites` (write), `household_activity` (read/write).
- **useHouseholdMealPlan.js** — Manages `household_meal_plan/{id}/days`.
- **useHouseholdPantry.js** — Manages `household_pantry/{id}/items`.
- **useHouseholdRecipes.js** — Manages `household_recipes/{id}/recipes`.
- **useMealPlan.js** — Manages personal `meal_plan/{uid}/days`; localStorage
  fallback when signed out.
- **usePantry.js** — Manages `pantry/{uid}/items` with auto-categorization
  and learned-correction cache; also increments `users/{uid}.pantryCount`;
  localStorage fallback when signed out.
- **useRateLimit.js** — Pure client-side daily usage limiter, localStorage
  only, no backend/Firestore calls.
- **useSavedDrinks.js** — Manages `saved_drinks/{uid}/drinks`.
- **useSavedRecipes.js** — Manages `saved_recipes/{uid}/recipes` +
  `users/{uid}.recipesCount`; localStorage fallback when signed out.
- **useSeenDrinks.js** / **useSeenRecipes.js** — In-memory-only shuffle
  dedup trackers, no persistence, no backend calls.
- **useSettings.js** — Reads/writes `users/{uid}` for
  dietary/cuisine/display-name prefs; shopping partners and cuisine-view
  memory are localStorage-only.
- **useToast.js** — Trivial toast state manager, no backend calls.
- **useUserRecipes.js** — Manages `user_recipes` (query by `authorUid`),
  mirrors to `public_recipes` when `visibility === 'community'`, and manages
  `recipe_comments/{recipeId}/comments`.

---

## 6. Seed / Admin Scripts (`backend/scripts/`)

All `.js` scripts load the **repo-root** `.env` and init `firebase-admin`
from `backend/serviceAccount.json`; all are CLI-invoked (`node <script>.js`),
none are registered as npm scripts in `backend/package.json`.

| Script | Does | External API | Reads/writes | Admin UI trigger? |
|---|---|---|---|---|
| `buildCorrectionsPrompt.js` | Reads top-50 `category_corrections`, prints a formatted prompt-injection block to stdout | none | reads `category_corrections` | **CLI only** — no UI trigger |
| `flagBadBeverages.js` | Scans `beverage_catalog` for savory-keyword titles, prints a flagged report for manual review | none | reads `beverage_catalog` | **CLI only** — output tells operator to delete manually via admin |
| `seedBeverages.js` | Seeds `beverage_catalog` from Tasty tags (smoothie/shake/juice/beverage), content-safety filtered, falls back to Spoonacular | Tasty (RapidAPI), Spoonacular (fallback) | `beverage_catalog`, `recipe_catalog` (reroute), `backend/data/tastyUsage.json` | Effectively yes — `/api/admin/seed-beverages` reimplements this logic inline (not a literal call to the script) |
| `seedCatalog.js` | Seeds `recipe_catalog` from a hardcoded Spoonacular ingredient-query list; resumable via `seedProgress.json` | Spoonacular | `recipe_catalog`, `backend/scripts/seedProgress.json` | Effectively yes — `/api/admin/seed-catalog` reimplements this inline, but does **not** use/update `seedProgress.json` (that file only tracks the standalone CLI run) |
| `seedCocktails.js` | Iterates TheCocktailDB a–z, bulk-seeds `beverage_catalog` | TheCocktailDB (no key) | `beverage_catalog` | Effectively yes — `/api/admin/seed-cocktails` (and the near-duplicate `/api/drinks/seed-cocktails`) reimplement this inline |
| `seedFoodFromTasty.js` | Seeds `recipe_catalog` from Tasty food tags (dinner/lunch/etc.) | Tasty (RapidAPI) | `recipe_catalog`, `backend/data/tastyUsage.json` | Effectively yes — `/api/admin/seed-food-tasty` reimplements this inline |
| `seedProgress.json` | (data file, not a script) | — | — | — |
| `tastyQuota.js` | Shared quota/pagination-offset tracker module (not directly runnable) | none | `backend/data/tastyUsage.json` | N/A — this is the **one** script file actually `import`ed and reused live by `backend/index.js` |
| `weeklySync.js` | Weekly Spoonacular recipe top-up, rotating a 51-query offset stored in `config/catalog_sync` | Spoonacular | `recipe_catalog`, `config/catalog_sync`, `catalog_sync_logs` | **No UI trigger** — scheduled via PM2 cron (`backend/ecosystem.config.cjs`, app `catalog-weekly-sync`, `cron_restart: '0 3 * * 0'`, Sundays 3am) |

**Important nuance:** `index.js` contains no `child_process`/`spawn` calls and
does not `import` `seedCatalog.js`, `seedCocktails.js`, `seedBeverages.js`, or
`seedFoodFromTasty.js`. The admin "Run" buttons in `CatalogPage.jsx` trigger
backend routes whose logic is a **separately maintained, parallel
reimplementation** of what those script files do — not literal invocations of
the scripts. Only `tastyQuota.js` is genuinely shared code between the CLI
scripts and the live server.

| Admin UI element | Endpoint | Route in index.js |
|---|---|---|
| "Run Catalog Seed" (Recipes tab) | `POST /api/admin/seed-catalog` (+status/stop) | line 1913 |
| "Seed Smoothies/Juices/Milkshakes (Tasty API)" (Drinks tab) | `POST /api/admin/seed-beverages` (+status/stop) | line 2184 |
| "Seed Cocktails (TheCocktailDB)" (Drinks tab) | `POST /api/admin/seed-cocktails` (+status/stop) | line 2093 |
| Tasty food AutoSeedPanel (Recipes tab) | `POST /api/admin/seed-food-tasty` (+status/stop) | line 2401 |
| Tasty quota banner | `GET /api/admin/tasty-quota` | line 2393 |
| "→ Food" per drink row | `POST /api/admin/beverage-catalog/drinks/:id/move-to-food` | line 2525 |
| Drinks stats/browse/delete | `GET .../stats`, `GET .../drinks`, `DELETE .../drinks/:id` | lines 2564/2585/2606 |

---

## 7. Environment Variables Actually In Use

(Presence/absence only — no values shown.)

### Backend (`process.env.*`)

| Var | Used in | Present in root `.env`? |
|---|---|---|
| `ADMIN_UID` | `backend/index.js` | yes |
| `ANTHROPIC_API_KEY` | `backend/index.js` | yes |
| `EDAMAM_APP_ID` | `backend/index.js` | yes |
| `EDAMAM_APP_KEY` | `backend/index.js` | yes |
| `OPENAI_API_KEY` | `backend/index.js` | yes |
| `PORT` | `backend/index.js` (defaults to `3003`) | missing, but has a safe fallback |
| `RAPIDAPI_KEY` | `index.js`, `seedBeverages.js`, `seedFoodFromTasty.js` | yes |
| `SPOONACULAR_API_KEY` | `index.js`, `seedBeverages.js`, `seedCatalog.js`, `weeklySync.js` | yes |

### Frontend (`import.meta.env.*`)

| Var | Used in | Present in `frontend/.env`? |
|---|---|---|
| `VITE_API_URL` | 8 pages/components (PendingDeletionScreen, SupportChatBubble, RecipeCard, SettingsPage, RecipesPage, DrinkDiscoverPage, MealPlanPage, DiscoverPage, ScanPage) | yes |
| `PROD` (Vite built-in) | `main.jsx` | n/a (built-in) |

Note: `frontend/src/firebase.js` does **not** use any env vars — its Firebase
web config is hardcoded literals in source, unlike the admin app.

### Admin (`import.meta.env.*`)

| Var | Used in | Present in `admin/.env`? |
|---|---|---|
| `VITE_ADMIN_UID` | `AdminAuthContext.jsx` | yes |
| `VITE_API_URL` | `CatalogPage.jsx` | yes |
| `VITE_FIREBASE_API_KEY` | `admin/src/firebase.js` | **MISSING — see §10** |
| `VITE_FIREBASE_APP_ID` | `admin/src/firebase.js` | yes |
| `VITE_FIREBASE_AUTH_DOMAIN` | `admin/src/firebase.js` | yes |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | `admin/src/firebase.js` | yes |
| `VITE_FIREBASE_PROJECT_ID` | `admin/src/firebase.js` | yes |
| `VITE_FIREBASE_STORAGE_BUCKET` | `admin/src/firebase.js` | yes |

There is no separate `backend/.env` — the backend and all scripts load the
repo-root `.env` via a relative `dotenv.config({path: ...})` call.

---

## 8. Persisted Local State Files

| File | Shape | Purpose | Current contents |
|---|---|---|---|
| `backend/data/receiptScanLog.json` | Flat array of `{timestamp, detectedStore, rawItemCount, parsedItemCount}` | Append-only debug log of receipt-scan attempts | 4 entries, 2026-06-23 to 2026-07-04 |
| `backend/data/storeAbbreviations.json` | Object keyed by lowercase store name → `{abbrev: expansion}` map | Static dictionary normalizing receipt line-item abbreviations per store | 5 stores (walmart 44, kroger 13, target 5, publix 5, aldi 6 = 73 mappings) |
| `backend/data/tastyUsage.json` | `{monthKey, requestsUsed, lastUpdated, log:[{date,script,requests}], tagOffsets:{tag:offset}}` | Monthly Tasty/RapidAPI quota tracker + resumable per-tag pagination cursor | `monthKey: "2026-07"`, `requestsUsed: 68`/500 (450 safety cap), log capped at last ~50 entries (all tagged `"beverages"`), `tagOffsets` all reset to 0 |
| `backend/scripts/seedProgress.json` | `{lastIngredientIndex, totalSaved, resumeAt}` | Resumable pagination cursor for the **standalone CLI** `seedCatalog.js` only (not used by the admin-triggered route) | `lastIngredientIndex: 15`, `totalSaved: 40`, `resumeAt: 2026-07-04T16:29:44.802Z` — deleted entirely once the ~51-query list completes |

---

## 9. Dependencies

### `backend/package.json`
Dependencies: `cors`, `dotenv`, `express`, `firebase-admin`
devDependencies: none

### `frontend/package.json`
Dependencies: `firebase`, `react`, `react-dom`
devDependencies: `@vitejs/plugin-react`, `vite`

### `admin/package.json`
Dependencies: `date-fns`, `firebase`, `react`, `react-dom`, `recharts`
devDependencies: `@types/react`, `@types/react-dom`, `@vitejs/plugin-react`, `oxlint`, `vite`

---

## 10. Discrepancies / Things to Verify

Cross-checked against the repo's own `README.md` and `ROADMAP.md` (both at
repo root) as well as internal code-vs-code consistency.

### Config / build-breaking
- **`admin/.env` is missing `VITE_FIREBASE_API_KEY`**, even though
  `admin/src/firebase.js` reads `import.meta.env.VITE_FIREBASE_API_KEY` as
  the Firebase `apiKey` config field. Unless this is supplied through some
  other mechanism at build time (shell env, CI secret), the admin app's
  Firebase SDK initializes with `apiKey: undefined`. Verified directly:
  `admin/.env` has 7 keys, none of them `VITE_FIREBASE_API_KEY`.

### README.md is stale relative to the actual codebase
- README's "What It Does" section describes My Pantry as "Fully persistent
  via **localStorage**" — the actual code (`usePantry.js`) treats Firestore
  as primary for signed-in users, with localStorage only as a signed-out
  fallback. This README section predates Phase 2 (Firebase) shipping per
  `ROADMAP.md`'s own phase history.
- README's "Project Structure" diagram shows only `backend/index.js` and a
  handful of frontend folders — it has **no mention of the `admin/` app at
  all**, nor of `backend/scripts/`, `backend/data/`, or `backend/utils/`,
  all of which exist and are actively used.
- README's "Environment Variables" table lists only `ANTHROPIC_API_KEY`,
  `OPENAI_API_KEY`, `VITE_API_URL` — missing `ADMIN_UID`,
  `SPOONACULAR_API_KEY`, `EDAMAM_APP_ID`, `EDAMAM_APP_KEY`, `RAPIDAPI_KEY`,
  and all `admin/.env` vars.

### ROADMAP.md checkboxes vs. actual code
- **Phase 8 "Admin Dashboard"** is listed under `🔜` (not yet shipped) with
  every line item unchecked — but the admin app is fully built (8 pages,
  `verifyAdmin`-gated routes, catalog/analytics/support/bug-report/user
  management all present and wired to real Firestore/API calls). The
  roadmap item "Admin-only Firebase auth (custom claims — owner UID only)"
  is also technically inaccurate for what was actually built: it's a
  **hardcoded single-UID equality check** (`decoded.uid === ADMIN_UID`), not
  Firebase custom claims. Also, ROADMAP names the target domain
  `admin.pantry.doneitmobile.com`, but the actual CORS allowlist in
  `index.js` includes `admin.mypantryclub.com` instead — different domain
  than what was planned.
- **Phase 2** item "Star ratings saved to Firestore (persistent across
  devices)" is unchecked, but `useSavedRecipes.js` already writes
  `userRating` to Firestore `saved_recipes` for signed-in users — appears
  done.
- **Phase 2** item "Nutritional facts — integrate Edamam or Spoonacular API"
  is unchecked, but `recipe_catalog` docs already carry a
  `nutrition{calories,protein,carbs,fat,fiber}` field and both
  `EDAMAM_APP_ID`/`EDAMAM_APP_KEY` and `SPOONACULAR_API_KEY` are live env
  vars used in `index.js` — appears at least partially done.
- **Phase 8.5 "Scan Learning" Option A** (correction feedback loop) and
  **Option B** (community barcode dictionary) are both unchecked/under
  consideration, but the `category_corrections` collection (with voting via
  `recordCategoryCorrection`, injected into scan prompts via
  `refreshCorrectionsBlock`) and the `verified_products` confirm-count voting
  flow (`/api/scan-barcode/confirm`) are both fully implemented already.
- **"UI/QOL Review" item** "Bottom nav is overcrowded with 6 tabs —
  consolidate" — the actual `BottomNav.jsx` has only **4** tabs (Scan / My
  Pantry / My Recipes / Discover), verified directly in code. Either this was
  already fixed and the roadmap wasn't updated, or the roadmap is describing
  a much older state.
- **Icebox item** "Multi-household support — shared pantry for roommates or
  families" is listed as unscheduled/under consideration, but Phase 6
  ("Households," marked `✅ Complete`) already implements exactly this —
  create/join households, shared pantry/recipes/meal plan, roles, activity
  feed. This icebox entry looks like a stale leftover describing a feature
  that shipped under a different phase.

### Backend structure vs. task assumption
- The audit brief assumed a "Pantry" and "Grocery" route group in the
  backend. **No such routes exist.** Pantry and grocery CRUD happens
  entirely client-side against Firestore; the backend only touches those
  collections during account-deletion cleanup. Worth confirming this is the
  intended architecture (client writes directly to Firestore, governed by
  `firestore.rules`) rather than an oversight, especially since almost every
  *other* feature area (recipes, drinks, scan) does go through the Express
  backend.

### Duplicated / dead code
- **`POST /api/drinks/seed-cocktails`** and **`POST /api/admin/seed-cocktails`**
  do near-identical TheCocktailDB a–z bulk imports into `beverage_catalog`.
  Only the `/api/admin/...` version has matching `/status` and `/stop`
  endpoints and a persistent state object (`cocktailAdminState`); the
  `/api/drinks/...` version looks like earlier/abandoned code left in place.
  Verified both routes exist and both use `verifyAdmin`.
- **`buildCorrectionsPrompt.js`**, **`flagBadBeverages.js`**, and
  **`weeklySync.js`** have no admin UI trigger at all (the first two are
  pure CLI diagnostic/reporting tools; `weeklySync.js` is PM2-cron scheduled,
  invisible to any UI).
- The 4 "seed" scripts in `backend/scripts/` (`seedBeverages.js`,
  `seedCatalog.js`, `seedCocktails.js`, `seedFoodFromTasty.js`) are **not
  actually called** by the admin-triggered routes that appear to run them —
  the routes reimplement the same logic inline in `index.js` instead. This
  means the scripts and the live routes can silently drift out of sync with
  each other over time (e.g. `seedCatalog.js`'s resumable
  `seedProgress.json` behavior has no equivalent in the admin-triggered
  path).

### Orphaned Firestore collections/fields
- **`config/beverage_seed`** (`lastCocktailSeed`, `lastBeverageSeed` fields)
  is read by `backend/index.js` but **no code anywhere writes it** — either
  it was set manually via the Firestore console/import at some point, or the
  writer code was since removed.
- **`analytics_events`** is written by `frontend/src/utils/analytics.js` on
  every tracked event but **never read or queried anywhere**, including by
  the admin app (which instead reads a separate, hand-aggregated
  `analytics_daily` collection). Raw event data is accumulating with no
  consumer.
- **`catalog_sync_logs`** is written by `weeklySync.js` after every run but
  has **no viewer anywhere** — not surfaced in the admin app.
- **`household_invites`** is written by `useHousehold.js`'s `inviteByEmail`
  but **no accept-invite flow exists anywhere** to read/consume it — looks
  like an incomplete or abandoned feature (invite-by-code works fully;
  invite-by-email appears to dead-end).

### Naming inconsistencies (not bugs, but worth normalizing)
- "Times saved" is tracked under three different field names across related
  collections: `saveCount` (`public_recipes`), `savedCount` (`user_recipes`),
  and `recipesCount` (`users`, a per-user total rather than per-recipe).
- Admin's `UsersPage.jsx` defensively falls back to a `data.name` field on
  `users` docs that is never written by any code path — dead fallback logic,
  harmless but worth removing or investigating in case it was migrated from
  an older schema.

### Confidence caveats (things I could not fully verify from static reading)
- **`user_recipes`** collection shape is only partially confirmed — the base
  recipe fields come from a `recipeData` spread object passed in by calling
  components, which wasn't traced back to its exact source in this pass.
- Exact sub-account/edge-case behavior of Firestore security rules
  (`firestore.rules` at repo root) was **not** cross-checked against this
  audit's collection list — worth a follow-up pass to confirm every
  collection here has a matching rule and no collection is unintentionally
  world-readable/writable.
