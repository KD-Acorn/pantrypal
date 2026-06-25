# PantryPal — Roadmap

This document tracks every planned, in-progress, and completed feature for PantryPal across all phases.
---

## 🐛 Known Bugs

- [x ] Photo upload on Scan page — clicking "Upload Photo" does nothing on some devices/browsers
      (camera capture works, text mode works, receipt mode affected too)

- [ ] Grocery list items not displaying after being added — 
      items save (Firestore confirmed) but UI does not render them

## 💬 Feedback & Reporting

- [ ] "Report a Bug / Give Feedback" button on home screen or in nav
      Captures: description, scan mode active, browser/device info
      Stores to localStorage log, future: sends to Firebase or email

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

- [x] Firebase Authentication (email/password + Google sign-in)
- [x] Firestore database — replace localStorage with cloud sync
- [x] Pantry syncs across devices when logged in
- [x] User profiles and preferences
- [x] Recipe save/favorites collection per user
- [ ] Star ratings saved to Firestore (persistent across devices)
- [ ] Nutritional facts — integrate Edamam or Spoonacular API
- [ ] Nutritional facts scale with portion size

---

## ✅ Phase 3 — Community Features (Complete)

- [x] Customize Recipe with editable ingredients and steps
- [x] "Just Me" vs "Share with Community" visibility choice
- [x] public_recipes Firestore collection
- [x] Share/unshare toggle on saved recipes
- [x] Community feed tab on Discover page
- [x] Pantry-matching recipes prioritized in community feed
- [x] Community recipe rating with running average
- [x] Save community recipes to personal collection
- [x] Pagination — 20 recipes per page with Load More
- [x] Author attribution on community cards

---

## ✅ Phase 4 — Smart Scanning (Complete)

- [x] Receipt scanner with store abbreviation directory
- [x] Barcode scanner via GPT-4o + Open Food Facts
- [x] Food Photo / Barcode toggle in Camera mode
- [x] Expiry date tracking with Expiring Soon section
- [x] Low stock alerts (expiry warnings at 7 days)
- [x] Grocery list with category grouping
- [x] Auto-populate from saved recipe missing ingredients
- [x] Manual grocery list add
- [x] Add checked items directly to pantry
- [x] Firestore sync for grocery list
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

## 🔜 Phase 6 — Households

- [ ] Create a household (name, invite members)
- [ ] Household shared pantry (all members read/write)
- [ ] Private pantry per member alongside shared pantry
- [ ] 🔒 Private | 🏠 Household toggle on pantry items
- [ ] Real-time sync — ingredient changes reflect for all members instantly
- [ ] Shared recipe collection within household
- [ ] Private recipes per member
- [ ] Household member management (invite, remove)
- [ ] Activity feed — "User B used the last 2 eggs"

---

## 🔜 Phase 7 — Mobile App (React Native)

- [ ] Scaffold React Native app with Expo
- [ ] Port all three screens — Scan, My Pantry, Discover
- [ ] Native camera integration (smoother than mobile browser)
- [ ] Push notifications for expiry alerts and meal plan reminders
- [ ] Offline mode — pantry readable without internet
- [ ] iOS App Store submission
- [ ] Android Google Play submission
- [ ] Shared backend with web version (same API endpoints)

---

## 🔜 Phase 8 — Admin Dashboard

- [ ] Separate subdomain: admin.pantry.doneitmobile.com
- [ ] New Cloudflare tunnel route + PM2 process
- [ ] Admin-only Firebase auth (custom claims — owner UID only)
- [ ] Analytics dashboard: DAU/MAU, session time, feature usage
- [ ] User map — geographic distribution (city/country level, no PII)
- [ ] Traffic sources — referrer tracking
- [ ] Bug report inbox with built-in ticketing system
  - [ ] Open / In Progress / Resolved status
  - [ ] Wired to "Report a Bug" button in main app
- [ ] Recipe analytics — most saved, most cooked, highest rated
- [ ] User management — view accounts, disable if needed

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
