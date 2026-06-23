# PantryPal — Roadmap

This document tracks every planned, in-progress, and completed feature for PantryPal across all phases.

---

## ✅ Phase 1 — Web MVP (Shipped)

### Pantry Manager
- [x] Add ingredients manually (single or comma-separated)
- [x] Ingredient stored as object with name, quantity, and unit
- [x] Edit ingredients inline (name, quantity, unit)
- [x] Delete individual ingredients
- [x] Clear all with confirmation
- [x] localStorage persistence
- [x] Auto-migration from legacy string format

### Ingredient Scanner
- [x] Text input mode — type or paste ingredients
- [x] Camera/photo scan mode — upload or capture image
- [x] GPT-4o vision identifies ingredients from photo
- [x] Editable preview checklist before confirming to pantry
- [x] Quantity and unit fields on each preview item
- [x] Duplicate detection — Replace / Add / Skip per item
- [x] Error handling with fallback to text mode

### Recipe Discovery
- [x] Generate 3 recipe suggestions from current pantry
- [x] Recipe cards: title, cuisine, cook time, difficulty, match score, missing ingredients
- [x] Shuffle button cycles through 6 cuisine focuses (Any, Italian, Asian, Mexican, Quick & Easy, Mediterranean)
- [x] Expand recipe card inline for full step-by-step instructions
- [x] Structured ingredient list with amounts and units
- [x] Portion size scaler — `+ [ input ] -` scales all ingredient amounts live
- [x] Pantry ingredient highlight (green = have it, grey = missing)
- [x] Star ratings (1–5) persisted to localStorage
- [x] Nutrition toggle placeholder (Coming Soon label)

### Infrastructure
- [x] Vite + React frontend
- [x] Express API proxy backend
- [x] PM2 process management
- [x] Cloudflare Tunnel — pantry.doneitmobile.com
- [x] GitHub repository — KD-Acorn/pantrypal

---

## 🔜 Phase 2 — Backend & Accounts

- [ ] Firebase Authentication (email/password + Google sign-in)
- [ ] Firestore database — replace localStorage with cloud sync
- [ ] Pantry syncs across devices when logged in
- [ ] User profiles and preferences
- [ ] Recipe save/favorites collection per user
- [ ] Star ratings saved to Firestore (persistent across devices)
- [ ] Nutritional facts — integrate Edamam or Spoonacular API
- [ ] Nutritional facts scale with portion size

---

## 🔜 Phase 3 — Community Features

- [ ] "Share to Public" toggle on any recipe
- [ ] Global `public_recipes` Firestore collection
- [ ] Community recipe feed on Discover page
- [ ] AI prioritizes community recipes for users with matching ingredients
- [ ] User-submitted "Final Dish" photo replaces stock placeholder in feed
- [ ] Report / flag system for inappropriate community recipes
- [ ] Recipe comments (basic)

---

## 🔜 Phase 4 — Smart Scanning

- [ ] Receipt scanner — upload grocery receipt, parse line items into pantry
- [ ] Barcode scanner — scan product barcode, auto-identify ingredient
- [ ] Expiry date tracking — add best-by dates to pantry items
- [ ] Low stock alerts — flag items below a set quantity threshold
- [ ] Grocery list generator — compile missing ingredients across saved recipes

---

## 🔜 Phase 5 — Recipe Intelligence

- [ ] Dietary filter — vegetarian, vegan, gluten-free, dairy-free
- [ ] Cuisine preference memory — learns what the user shuffles toward
- [ ] Recipe difficulty filter
- [ ] Cook time filter (under 30 min, under 1 hour, etc.)
- [ ] "Use it before it expires" mode — prioritizes ingredients close to expiry
- [ ] Meal planner — assign recipes to days of the week
- [ ] Ingredient substitution suggestions ("out of X? try Y")

---

## 🔜 Phase 6 — Mobile App (React Native)

- [ ] Scaffold React Native app with Expo
- [ ] Port all three screens — Scan, My Pantry, Discover
- [ ] Native camera integration (smoother than mobile browser)
- [ ] Push notifications for expiry alerts and meal plan reminders
- [ ] Offline mode — pantry readable without internet
- [ ] iOS App Store submission
- [ ] Android Google Play submission
- [ ] Shared backend with web version (same API endpoints)

---

## 💡 Icebox (Considered, Not Scheduled)

- [ ] Voice input — "add 2 cups of flour" via speech-to-text
- [ ] Smart home integration — sync with smart fridge APIs
- [ ] Multi-household support — shared pantry for roommates or families
- [ ] Wine/beverage pairing suggestions per recipe
- [ ] Cost estimator — estimate meal cost based on ingredient prices
- [ ] Social sharing — share a recipe card as an image to Instagram/TikTok
- [ ] Cooking mode — fullscreen step-by-step with screen-stay-awake lock
- [ ] Video recipe links — attach a YouTube link to any recipe card
