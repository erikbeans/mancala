# Mancala (Kalah) — web game

A browser implementation of Kalah, the most popular Western mancala variant, built with Vite + React + TypeScript.

## Features

- Play vs the computer (easy / medium / hard — alpha-beta minimax in a Web Worker) or hotseat two-player
- 6-stone and 4-stone variants (Kalah(6,6) / Kalah(6,4))
- Animated stone sowing, captures, extra turns; wooden board theme; keyboard + screen-reader accessible
- Pure, framework-agnostic game engine in `src/engine/` (also used for tests and for server-side move validation in online play)
- Online multiplayer: 6-char room codes, invite links (`?room=CODE`), spectators, reconnect with a 60s grace period, then win-by-forfeit; rematch swaps seats. Server is a Cloudflare Worker + Durable Object (`server/`), fully authoritative — it validates every move with the shared engine. No undo online.

## Rules implemented

6 pits + a store per side. Sow counter-clockwise, including your own store but skipping the opponent's. Last stone in your store → extra turn. Last stone in an empty pit on your side → capture it plus the opposite pit. When one side is empty, the other side sweeps its remaining stones into its store. Most stones wins; equal is a draw.

## Develop

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # vitest engine + room-logic tests
npm run build      # typecheck + production build
```

### Online multiplayer (local)

```bash
cd server
npm install
npm run dev        # wrangler dev on http://localhost:8787
npm run e2e        # spawns its own wrangler dev and runs the full WS e2e suite
```

Then in the app menu choose **Play online** → **Create room** (or open the copied
invite link in another browser/tab to join). The frontend talks to
`ws://localhost:8787` automatically in local dev.

### Deploy the server

```bash
cd server
npx wrangler deploy          # deploys to <name>.workers.dev
```

Then set the frontend's server URL at build time, e.g. in `.env`:

```
VITE_ONLINE_WS_URL=wss://mancala-server.<your-subdomain>.workers.dev
```

(`src/online/client.ts` falls back to `ws://localhost:8787` on localhost and to
`wss://mancala-server.erikbeans.workers.dev` otherwise — update that constant
after deploying.)

See `PLAN.md` for architecture and roadmap.
