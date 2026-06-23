# PantryPal

Kitchen inventory & recipe discovery web app. Scan ingredients, manage your pantry, and discover recipes powered by AI.

## Stack

- **Frontend**: React + Vite (port 3004)
- **Backend**: Express API proxy (port 3003)
- **AI**: OpenAI GPT-4o (image scanning), Anthropic Claude (recipe generation)
- **Storage**: localStorage (MVP — no database)

## Local Development

```bash
# 1. Set up environment
cp .env.example .env
# Fill in ANTHROPIC_API_KEY, OPENAI_API_KEY

# 2. Install dependencies
cd backend && npm install && cd ..
cd frontend && npm install && cd ..

# 3. Start dev servers
cd backend && npm run dev &
cd frontend && npm run dev &
```

Frontend: http://localhost:3004
Backend: http://localhost:3003

## Production (PM2)

```bash
# Build frontend
cd frontend && npm run build && cd ..

# Start with PM2
pm2 start ecosystem.config.cjs
pm2 save
```

## Environment Variables

| Variable | Description |
|---|---|
| `ANTHROPIC_API_KEY` | Anthropic API key for recipe generation |
| `OPENAI_API_KEY` | OpenAI API key for ingredient scanning |
| `VITE_API_URL` | Backend URL (default: http://localhost:3003) |

## Hosting

- Frontend: `pantry.doneitmobile.com` → localhost:3004
- Backend: `pantryapi.doneitmobile.com` → localhost:3003
- Served via existing Cloudflare Tunnel on the host machine
