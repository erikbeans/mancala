# Mancala (Kalah) — Web Game Plan

Status: **Phases 1–5 done (2026-11-03), phase 7 online DONE (2026-11-05):** engine + AI + full UI verified in-browser; online multiplayer (Cloudflare Worker + Durable Object) implemented, unit-tested (31 tests), e2e-tested over WebSockets (24 checks incl. forfeit/rematch/spectators/reconnect), and verified in-browser with two tabs + a spectator. Next: phase 6 polish (theme toggle, sounds, PWA, deploy frontend + worker).

## Decisions (locked in)

- **Variant:** Kalah rules — default 6 stones per pit, with 4 stones as an option (UI labels: "6 stones" / "4 stones"; terminology everywhere is "stones", never "seeds").
- **Modes:** vs AI (multiple difficulties) + local hotseat 2-player at launch; **online multiplayer as a later phase** (needs a WebSocket backend — Supabase Realtime or a small Node ws server).
- **Stack:** Vite + React + TypeScript. Vitest for tests. Deploy statically (GitHub Pages / Vercel / Netlify).
- **Aesthetic:** polished wooden board, animated stone sowing, optional sound, light/dark theme, responsive + touch-friendly, ARIA accessible.

## Research findings (sources: Wikipedia — Mancala, Kalah, Oware)

### Kalah rules to implement
- Board: 2 rows × 6 pits + 1 store ("end zone") per side. 6 stones per pit at start (Kalah(6,6)); 4 stones for Kalah(6,4).
- Bin indexing convention (from Wikipedia analysis section): South pits 0–5, South store 6, North pits 7–12, North store 13. Sowing counter-clockwise: 0→1→…→6→7→…→13→0.
- A turn: pick up all stones from one of your own non-empty pits; sow one stone into each subsequent pit counter-clockwise, **including your own store, skipping the opponent's store**.
- **Extra turn:** if the last stone lands in your own store, you move again (chains allowed, no limit).
- **Capture:** if the last stone lands in an *empty* pit on your own side and the opposite pit has stones, you capture the last stone + all stones in the opposite pit into your store.
- **Game end:** when one player's pits are all empty, the other player sweeps all remaining stones on their side into their store. Most stones in store wins; 36–36 is a draw (72 stones total in Kalah(6,6)).
- Note: Kalah(6,4) is solved (first player wins by 8 with perfect play) — fine for casual play; the pie rule is unnecessary here since we have an AI to beat, not a solved-game problem.

### AI approach
- Minimax with alpha-beta pruning + iterative deepening; branching factor ≤ 6, so depth 6–10 is cheap.
- Evaluation: store difference, stones on own side, mobility (number of legal moves), capture/extra-turn potential. Difficulty = search depth (Easy ~2, Medium ~6, Hard ~10+).
- Run search in a **Web Worker** so the UI never blocks; show a "thinking" indicator.

## Architecture

```
mancala/
├── PLAN.md
├── package.json            (vite, react, typescript, vitest)
├── index.html
├── src/
│   ├── engine/             — pure game logic, no React/DOM, fully unit-tested
│   │   ├── types.ts        — Board = number[14], Player, GameState, MoveResult
│   │   ├── rules.ts        — createGame, legalMoves, applyMove (sow, capture, extra turn, endgame sweep), isGameOver, winner
│   │   ├── serialize.ts    — state <-> compact string (share/save/replay, used by multiplayer later)
│   │   └── ai.ts           — minimax + alpha-beta + eval + difficulty levels
│   ├── ai.worker.ts        — Web Worker wrapper around engine/ai
│   ├── online/             — phase 2: multiplayer client (WebSocket to Cloudflare Durable Object room), room codes, token-based reconnect
│   ├── ui/
│   │   ├── App.tsx         — screen routing: menu / game / rules
│   │   ├── components/
│   │   │   ├── Board.tsx       — SVG board: pits, stores, stones, highlights
│   │   │   ├── Pit.tsx         — single pit, click + keyboard focusable (ARIA button)
│   │   │   ├── Stone.tsx        — animated stone (FLIP-style animation via Web Animations API)
│   │   │   ├── ScoreBar.tsx    — stores/scores, turn indicator, "extra turn" badge
│   │   │   ├── MoveLog.tsx
│   │   │   ├── GameMenu.tsx    — mode select (vs AI / hotseat), difficulty, variant, new game, undo, rules
│   │   │   └── RulesModal.tsx
│   │   ├── hooks/
│   │   │   ├── useGame.ts      — game state reducer: applies moves, handles AI turn via worker, undo stack
│   │   │   └── usePrefersReducedMotion.ts
│   │   ├── styles/         — CSS modules or plain CSS; wooden texture via CSS gradients/SVG, theme variables
│   │   └── main.tsx
│   └── test/               — Vitest: engine rules (Wikipedia worked examples), AI sanity (takes winning move, avoids losing one)
└── public/                 — favicon, PWA manifest, stone/board SVG assets, sounds (optional)
```

Key design rule: **the engine never imports React or DOM** — the same engine runs in the main thread (hotseat), in the worker (AI), in tests, and later on the server for multiplayer validation.

## Phases

1. **Scaffold** — `npm create vite` (react-ts), add Vitest, ESLint/Prettier, git init, base CSS + theme variables.
2. **Engine** — types, rules (sow/capture/extra-turn/endgame/winner), serialize. Unit tests from the Wikipedia example turns + edge cases (multi-lap sowing, capture chains, endgame sweep, draw).
3. **AI** — minimax/alpha-beta + eval + difficulties + worker. Tests: picks proven winning first move in Kalah(6,4) (bin 3-6 continuation wins by 8), blocks obvious captures.
4. **UI core** — Board/Pit/Stone rendering, click + keyboard interaction, animated sowing & captures, score bar, turn indicator, move log, undo, new game.
5. **Menus & modes** — main menu, vs AI with difficulty select, hotseat, rules modal, Kalah(6,4)/(6,6) toggle.
6. **Polish** — wooden theme + light/dark, responsive/mobile touch, ARIA + keyboard nav, reduced-motion support, optional sounds, PWA manifest, deploy.
7. **Online multiplayer (phase 2)** — see "Online play" section below.

## Online play (phase 2) — decisions locked 2026-11-03

- **Backend: Cloudflare Workers + Durable Objects (free tier)** — one DO per room, in-memory state, global edge. P2P/Trystero is the zero-infrastructure fallback; Supabase only if accounts/match history are wanted later.
- **Sync model:** clients send move intent (`{type:"move",pit}`), never state. The DO runs the shared `engine/rules.ts` to validate + apply, then broadcasts serialized state + animation events. Server-authoritative = no cheating; resend state on reconnect.
- **Rooms:** 6-char codes; anyone with the code can join as player (if <2 players) or spectate (read-only broadcast).
- **Disconnects:** player token in `sessionStorage` (per-tab, so a second tab = a new identity while a reload reclaims the seat), 60s grace to rejoin (DO alarm + lazy check on any room activity), then opponent wins by forfeit. Token is stored per-socket via `ws.serializeAttachment` so it survives DO hibernation.
- **Protocol:** `hello/move/rematch/leave` client→server; `welcome/lobby/state/notice/error` server→client (JSON over WebSocket). `state` messages carry `events` + `lastMove` for animation and a per-socket `you` field (seat changes after a rematch swap). Rematch requires both players; seats swap each game.
- **No undo online** (hotseat keeps local undo). UI waits for the server broadcast, then plays the sow animation from `events` (queued so back-to-back moves animate in order).

## Milestones / definition of done

- MVP: local game vs AI and hotseat, playable end-to-end, all engine tests green.
- v1: polished UI, accessible, deployable URL.
- v2: online multiplayer — **done 2026-11-05** (see README "Online multiplayer").
