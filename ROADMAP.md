# PantryPal Roadmap

## Phase 1 — MVP Web App (Complete)
- [x] Pantry manager with localStorage persistence
- [x] Ingredient scanner (text input + photo via OpenAI GPT-4o vision)
- [x] Recipe discovery with Anthropic Claude (3 recipes, shuffle by cuisine)
- [x] Star ratings saved to localStorage
- [x] Mobile-first responsive UI with bottom tab navigation
- [x] PM2 deployment config
- [x] Cloudflare Tunnel routing (pantry.doneitmobile.com)

## Phase 2 — Firebase Auth + Firestore Sync
- [ ] Firebase Authentication (email/password + Google sign-in)
- [ ] Migrate pantry data from localStorage to Firestore
- [ ] Sync ratings and saved recipes to Firestore
- [ ] User profile page
- [ ] Multi-device sync

## Phase 3 — React Native Mobile App
- [ ] Expo-based iOS/Android app
- [ ] Native camera integration for ingredient scanning
- [ ] Push notifications for recipe suggestions
- [ ] Offline pantry access

## Phase 4 — Community Recipes & Public Feed
- [ ] Share recipes to a public feed
- [ ] Like / comment on community recipes
- [ ] Follow other users
- [ ] Recipe collections / cookbooks

## Phase 5 — Barcode Scanning + Grocery Lists
- [ ] Barcode scanning via device camera
- [ ] Auto-lookup ingredient from UPC database
- [ ] Grocery list generation from recipe missing ingredients
- [ ] Integration with grocery delivery APIs
