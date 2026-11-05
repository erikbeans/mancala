/**
 * End-to-end test of the online room. Spawns its own `wrangler dev` with a
 * short forfeit grace, then drives two players + a spectator over WebSockets.
 *
 *   cd server && npm run e2e        (or: node scripts/e2e.mjs)
 *
 * Covers: seating, server-authoritative moves, illegal-move rejection,
 * spectators, reconnect, full game autoplay, rematch with seat swap,
 * and win-by-forfeit after the grace period.
 */
import { spawn } from 'node:child_process'
import { writeFileSync, rmSync } from 'node:fs'
import dns from 'node:dns'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import WebSocket from 'ws'

/**
 * DNS lookup that falls back to DNS-over-HTTPS (1.1.1.1) when the system
 * resolver has a stale negative cache — handy right after adding a record.
 */
function lookupWithDoH(hostname, options, callback) {
  if (typeof options === 'function') {
    callback = options
    options = {}
  }
  const wrap = (err, ip, family) => {
    if (err || !ip) return callback(err || new Error(`ENOTFOUND ${hostname}`))
    // Node's happy-eyeballs path expects an array when options.all is set.
    if (options.all) return callback(null, [{ address: ip, family }])
    callback(null, ip, family)
  }
  dns.lookup(hostname, options, (err, address, family) => {
    if (!err) {
      if (options.all && Array.isArray(address)) return callback(null, address)
      return wrap(null, address, family)
    }
    dohLookup(hostname).then(
      (ip) => wrap(null, ip, 4),
      () => wrap(err),
    )
  })
}

async function dohLookup(hostname) {
  try {
    const res = await fetch(`https://1.1.1.1/dns-query?name=${encodeURIComponent(hostname)}&type=A`, {
      headers: { accept: 'application/dns-json' },
    })
    const j = await res.json()
    return (j.Answer || []).find((a) => a.type === 1)?.data ?? null
  } catch {
    return null
  }
}

const SERVER_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
// Random port per run so a leftover dev server on a fixed port can't hijack the test.
const PORT = Number(process.env.E2E_PORT ?? 8800 + Math.floor(Math.random() * 100))
// Set E2E_WS to test a deployed worker instead of spawning local wrangler dev
// (forfeit grace then defaults to the production 60s).
const REMOTE = process.env.E2E_WS ?? null
const BASE = REMOTE ?? `ws://localhost:${PORT}`
const HTTP = REMOTE ? REMOTE.replace(/^ws/, 'http') : `http://localhost:${PORT}`
// Fresh room per run: DO storage persists between runs, so reuse would collide.
const ALPHA = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
const ROOM =
  'E2E' + Array.from({ length: 3 }, () => ALPHA[Math.floor(Math.random() * ALPHA.length)]).join('')
const GRACE_MS = Number(process.env.E2E_GRACE_MS ?? (REMOTE ? 60000 : 3000))

let failures = 0
const ok = (cond, label) => {
  console.log(`${cond ? '  PASS' : '  FAIL'}  ${label}`)
  if (!cond) failures++
}

const parseState = (s) => {
  const [board, currentPlayer, status, winner, moveCount] = s.split('|')
  return {
    board: board.split(',').map(Number),
    currentPlayer: Number(currentPlayer),
    status,
    winner: winner === '-' ? null : winner === 'draw' ? 'draw' : Number(winner),
    moveCount: Number(moveCount),
  }
}

class Client {
  constructor(name, token) {
    this.name = name
    this.token = token
    this.inbox = []
    this.waiters = []
    this.seat = undefined
    this.closed = false
  }

  connect() {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(`${BASE}/room/${ROOM}`, { lookup: lookupWithDoH })
      this.ws.on('open', () => {
        this.ws.send(JSON.stringify({ t: 'hello', name: this.name, token: this.token }))
      })
      this.ws.on('message', (data) => {
        const msg = JSON.parse(String(data))
        this.inbox.push(msg)
        if (msg.t === 'welcome') this.seat = msg.seat
        this.waiters = this.waiters.filter((w) => {
          if (w.pred(msg)) {
            w.resolve(msg)
            return false
          }
          return true
        })
        if (msg.t === 'welcome') resolve(msg)
      })
      this.ws.on('close', () => {
        this.closed = true
      })
      this.ws.on('error', reject)
    })
  }

  /** Wait for a message matching pred, checking the backlog first. */
  waitFor(pred, ms = 5000, label = 'message') {
    const hit = this.inbox.find(pred)
    if (hit) return Promise.resolve(hit)
    return new Promise((resolve, reject) => {
      const w = { pred, resolve }
      this.waiters.push(w)
      setTimeout(() => {
        this.waiters = this.waiters.filter((x) => x !== w)
        reject(new Error(`timeout waiting for ${label}`))
      }, ms)
    })
  }

  /** Assert that NO message matching pred arrives within ms. */
  expectSilence(pred, ms = 700, label = 'message') {
    return new Promise((resolve) => {
      const t = setTimeout(() => {
        this.waiters = this.waiters.filter((x) => x !== w)
        resolve(true)
      }, ms)
      const w = {
        pred: (m) => {
          if (pred(m)) {
            clearTimeout(t)
            this.waiters = this.waiters.filter((x) => x !== w)
            resolve(false)
          }
          return false
        },
        resolve: () => {},
      }
      this.waiters.push(w)
    })
  }

  send(msg) {
    this.ws.send(JSON.stringify(msg))
  }

  close() {
    this.ws.close()
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const legalPit = (state, seat) => {
  const pits = seat === 0 ? [0, 1, 2, 3, 4, 5] : [7, 8, 9, 10, 11, 12]
  return pits.find((p) => state.board[p] > 0)
}

// wrangler v4 doesn't reliably apply `--var` at runtime, so generate a temp
// config with a short grace (production uses the 60s default in wrangler.toml).
const E2E_CONFIG = path.join(SERVER_DIR, 'wrangler.e2e.toml')
const E2E_CONFIG_TEXT = `name = "mancala-server-e2e"
main = "src/index.ts"
compatibility_date = "2026-11-01"

[[durable_objects.bindings]]
name = "ROOM"
class_name = "MancalaRoom"

[[migrations]]
tag = "v1"
new_sqlite_classes = ["MancalaRoom"]

[vars]
FORFEIT_GRACE_MS = "${GRACE_MS}"
`

async function startServer() {
  writeFileSync(E2E_CONFIG, E2E_CONFIG_TEXT)
  const child = spawn('npx', ['wrangler', 'dev', '--port', String(PORT), '--config', 'wrangler.e2e.toml'], {
    cwd: SERVER_DIR,
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true, // own process group so we can kill wrangler + workerd reliably
  })
  child.stdout.on('data', (d) => process.stdout.write(`[wrangler] ${d}`))
  child.stderr.on('data', (d) => process.stderr.write(`[wrangler] ${d}`))
  const deadline = Date.now() + 60_000
  for (;;) {
    try {
      const res = await fetch(`${HTTP}/health`)
      if (res.ok) return child
    } catch {
      // not up yet
    }
    if (Date.now() > deadline) throw new Error('wrangler dev did not become ready')
    await sleep(500)
  }
}

async function main() {
  if (REMOTE) {
    console.log(`e2e against deployed worker ${REMOTE} (grace ${GRACE_MS}ms)…`)
    await runTests()
    return
  }
  console.log(`starting wrangler dev on port ${PORT} (grace ${GRACE_MS}ms)…`)
  const server = await startServer()
  try {
    await runTests()
  } finally {
    try {
      process.kill(-server.pid, 'SIGKILL')
    } catch {
      server.kill('SIGKILL')
    }
    rmSync(E2E_CONFIG, { force: true })
  }
}

async function runTests() {
  console.log(`e2e against ${BASE}/room/${ROOM}`)

  const A = new Client('Alice', 'tok-aaaa')
  const B = new Client('Bob', 'tok-bbbb')
  await A.connect()
  await B.connect()
  console.log('join + welcome')
  ok(A.seat === 0, 'first joiner gets seat 0')
  ok(B.seat === 1, 'second joiner gets seat 1')
  const lobbyB = await B.waitFor((m) => m.t === 'lobby' && m.players.length === 2, 3000, 'lobby with 2 players')
  ok(lobbyB.players.every((p) => p.connected), 'lobby shows both players connected')

  console.log('rename')
  A.send({ t: 'rename', name: 'Alicia' })
  const lobbyR = await B.waitFor(
    (m) => m.t === 'lobby' && m.players.find((p) => p.seat === 0)?.name === 'Alicia',
    3000,
    'lobby after rename',
  )
  ok(lobbyR.players.find((p) => p.seat === 0)?.name === 'Alicia', 'rename broadcast to the other player')
  A.inbox.length = 0 // only look at fresh messages below
  A.send({ t: 'rename', name: '   ' })
  const lobbyBlank = await A.waitFor((m) => m.t === 'lobby', 3000, 'lobby after blank rename')
  ok(lobbyBlank.players.find((p) => p.seat === 0)?.name === 'Alicia', 'blank rename keeps the old name')

  console.log('moves are server-authoritative')
  A.send({ t: 'move', pit: 0 })
  const st1a = await A.waitFor((m) => m.t === 'state', 3000, 'state after move')
  const st1b = await B.waitFor((m) => m.t === 'state', 3000, 'state broadcast to B')
  const s1 = parseState(st1a.state)
  ok(st1a.lastMove && st1a.lastMove.player === 0 && st1a.lastMove.pit === 0, 'lastMove = {player 0, pit 0}')
  ok(st1a.events.some((e) => e.type === 'sow'), 'sow events included for animation')
  ok(st1a.you === 0 && st1b.you === 1, 'per-socket seat in state (you: 0 / 1)')
  ok(s1.board[0] === 0 && s1.board[6] === 1, 'pit 0 emptied, stone landed in store 6')
  ok(s1.currentPlayer === 0, 'extra turn: still player 0 (6 stones from pit 0 lands in store)')

  B.send({ t: 'move', pit: 7 })
  const errB = await B.waitFor((m) => m.t === 'error', 3000, 'error for moving out of turn')
  ok(/Not your turn/.test(errB.message), 'out-of-turn move rejected')

  A.send({ t: 'move', pit: 9 })
  const errA = await A.waitFor((m) => m.t === 'error', 3000, 'error for illegal pit')
  ok(/Illegal move/.test(errA.message), 'opponent-pit move rejected')
  ok(await B.expectSilence((m) => m.t === 'state', 700), 'no state broadcast after illegal move')

  console.log('spectators')
  const C = new Client('Carol', 'tok-cccc')
  await C.connect()
  ok(C.seat === null, 'third joiner is a spectator (seat null)')
  C.send({ t: 'move', pit: 0 })
  const errC = await C.waitFor((m) => m.t === 'error', 3000, 'error for spectator move')
  ok(/Spectator/.test(errC.message), 'spectator move rejected')
  A.inbox.length = 0 // only look at fresh messages below
  C.send({ t: 'rename', name: 'Eve' })
  const lobbySpec = await A.waitFor((m) => m.t === 'lobby', 3000, 'lobby re-broadcast after spectator rename')
  ok(
    lobbySpec.players.every((p) => p.name !== 'Eve'),
    'spectator cannot rename a seat',
  )

  console.log('autoplay full game to completion')
  const players = [A, B]
  let lastState = s1
  for (let i = 0; i < 200; i++) {
    const seat = lastState.currentPlayer
    const client = players.find((c) => c.seat === seat)
    const pit = legalPit(lastState, seat)
    if (pit === undefined) break
    client.send({ t: 'move', pit })
    const st = await client.waitFor(
      (m) => m.t === 'state' && parseState(m.state).moveCount === lastState.moveCount + 1,
      3000,
      `move #${lastState.moveCount + 1}`,
    )
    lastState = parseState(st.state)
    if (lastState.status === 'finished') break
  }
  ok(lastState.status === 'finished', `game finished after ${lastState.moveCount} moves`)
  const total = lastState.board.reduce((a, b) => a + b, 0)
  ok(total === 72, `stone conservation: ${total} stones on board`)
  ok(lastState.board[6] + lastState.board[13] === 72, 'all stones in stores at the end')
  console.log(`  final: ${lastState.board[6]} - ${lastState.board[13]}, winner=${lastState.winner}`)
  await sleep(400) // let the final broadcast land in both inboxes before clearing

  console.log('rematch swaps seats and resets')
  A.inbox.length = 0
  B.inbox.length = 0
  A.send({ t: 'rematch' })
  await sleep(300)
  ok(A.inbox.every((m) => m.t !== 'state'), 'no reset after only one rematch request' + (A.inbox.some((m) => m.t === 'state') ? ` — got: ${JSON.stringify(A.inbox.filter((m) => m.t === 'state').map((m) => ({ ...m, state: m.state?.slice(0, 40) })))}` : ''))
  B.send({ t: 'rematch' })
  const rmA = await A.waitFor((m) => m.t === 'state', 3000, 'rematch state for A')
  const rmB = await B.waitFor((m) => m.t === 'state', 3000, 'rematch state for B')
  const fresh = parseState(rmA.state)
  ok(fresh.status === 'playing' && fresh.board.every((n, i) => n === (i === 6 || i === 13 ? 0 : 6)), 'fresh board after rematch')
  ok(rmA.you === 1 && rmB.you === 0, 'seats swapped: A is now seat 1, B is seat 0')
  A.seat = rmA.you
  B.seat = rmB.you

  console.log('reconnect with same token reclaims seat')
  A.close()
  await sleep(500)
  const A2 = new Client('Alice', 'tok-aaaa')
  await A2.connect()
  ok(A2.seat === 1, 'reconnect reclaims seat 1')
  A2.send({ t: 'move', pit: 7 }) // seat 1's pit; player 0 moves first, so expect not-your-turn
  const errR = await A2.waitFor((m) => m.t === 'error', 3000, 'error after reconnect move attempt')
  ok(/Not your turn/.test(errR.message), 'reconnected player is still seat 1 (not their turn)')

  console.log('forfeit after grace period')
  A2.close()
  await sleep(GRACE_MS + 800) // grace (3s) must have fully elapsed
  // Any room activity triggers the forfeit check (the DO alarm is the primary
  // trigger in production; in local dev we poke the room to wake it).
  B.send({ t: 'move', pit: 0 })
  const forfeitState = await B.waitFor(
    (m) => m.t === 'state' && parseState(m.state).status === 'finished',
    5000,
    'forfeit state',
  )
  const fs = parseState(forfeitState.state)
  ok(fs.status === 'finished' && fs.winner === 0, `B (seat 0) wins by forfeit, winner=${fs.winner}`)
  const notice = await B.waitFor((m) => m.t === 'notice' && /forfeit/.test(m.message), 3000, 'forfeit notice')
  ok(/Alice/.test(notice.message), 'notice names the forfeiting player')

  C.close()
  B.close()
  await sleep(300)

  console.log(failures === 0 ? '\nALL E2E CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`)
  process.exit(failures === 0 ? 0 : 1)
}

main().catch((e) => {
  console.error('E2E error:', e.message)
  process.exit(1)
})
