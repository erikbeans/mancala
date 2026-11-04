# Mancala (Kalah) — web game

A browser implementation of Kalah, the most popular Western mancala variant, built with Vite + React + TypeScript.

## Features

- Play vs the computer (easy / medium / hard — alpha-beta minimax in a Web Worker) or hotseat two-player
- 6-stone and 4-stone variants (Kalah(6,6) / Kalah(6,4))
- Animated stone sowing, captures, extra turns; wooden board theme; keyboard + screen-reader accessible
- Pure, framework-agnostic game engine in `src/engine/` (also used for tests and, later, server-side validation for online play)
- Online multiplayer via Cloudflare Durable Objects — planned (see `PLAN.md`)

## Rules implemented

6 pits + a store per side. Sow counter-clockwise, including your own store but skipping the opponent's. Last stone in your store → extra turn. Last stone in an empty pit on your side → capture it plus the opposite pit. When one side is empty, the other side sweeps its remaining stones into its store. Most stones wins; equal is a draw.

## Develop

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # vitest engine tests
npm run build      # typecheck + production build
```

See `PLAN.md` for architecture and roadmap.
