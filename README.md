# My Pantry Club 🥘

Kitchen inventory & recipe discovery web app. Scan your pantry with AI, manage your ingredients, and discover recipes based on what you already have.

**Live:** https://mypantryclub.com
Also available at https://pantry.doneitmobile.com

---

## What It Does

- **Scan** — Take a photo of your fridge or pantry. GPT-4o identifies every ingredient and returns an editable checklist before anything gets saved.
- **My Pantry** — Manage your ingredient inventory with quantities and units. Edit, delete, or clear at any time. Fully persistent via localStorage.
- **Discover** — Generate recipe suggestions based on your current pantry. Shuffle through cuisine styles, expand any recipe for full step-by-step instructions, and scale portions on the fly.

---

## Stack

| Layer | Tech |
|---|---|
| Frontend | React + Vite |
| Backend | Node.js + Express (API proxy) |
| AI — Scanning | OpenAI GPT-4o (image recognition) |
| AI — Recipes | Anthropic Claude (recipe generation) |
| Storage | Firebase Firestore + localStorage fallback |
| Hosting | Self-hosted, PM2, Cloudflare Tunnel |

---

## Local Development

```bash
# 1. Clone the repo
git clone https://github.com/KD-Acorn/pantrypal.git
cd pantrypal

# 2. Set up environment
cp .env.example .env
# Fill in ANTHROPIC_API_KEY and OPENAI_API_KEY

# 3. Install dependencies
cd backend && npm install && cd ..
cd frontend && npm install && cd ..

# 4. Start dev servers
cd backend && npm run dev &
cd frontend && npm run dev
```

Frontend runs at `http://localhost:3004`
Backend runs at `http://localhost:3003`

---

## Production Deploy (PM2)

```bash
# Build frontend
cd frontend && npm run build && cd ..

# Start all processes
pm2 start ecosystem.config.cjs
pm2 save
```

---

## Environment Variables

| Variable | Description |
|---|---|
| `ANTHROPIC_API_KEY` | Anthropic API key for recipe generation |
| `OPENAI_API_KEY` | OpenAI API key for ingredient scanning |
| `VITE_API_URL` | Backend URL (set to your production domain in deploy) |

---

## Deployment

Self-hosted on a home Linux server (Ubuntu), managed with PM2, and exposed publicly via Cloudflare Tunnel. No cloud provider required.

---

## Project Structure

```
pantrypal/
├── backend/
│   └── index.js          # Express proxy — /api/scan, /api/recipes
├── frontend/
│   └── src/
│       ├── App.jsx               # Tab router, shared state
│       ├── components/           # BottomNav, Toast, Spinner, RecipeCard
│       ├── hooks/                # usePantry, useSavedRecipes, useGroceryList, etc.
│       └── pages/                # ScanPage, PantryPage, DiscoverPage, etc.
├── ecosystem.config.cjs          # PM2 process config
├── .env.example
├── README.md
└── ROADMAP.md
```

---

## Roadmap

See [ROADMAP.md](./ROADMAP.md) for the full feature roadmap.

---

## Author

<<<<<<< HEAD
Kennedy Durham — [GitHub](https://github.com/KD-Acorn)  
Part of the [WorkRecord](https://workrecord.app) project portfolio.
=======
Kennedy Durham — [GitHub](https://github.com/KD-Acorn)
Part of the DoneIt Technologies project portfolio.
>>>>>>> a00783d (rebrand: PantryPal → My Pantry Club, DoneIt Technologies attribution)
