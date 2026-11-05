/**
 * Pure room logic for online play — no Cloudflare APIs here, so it's fully
 * unit-testable. The Durable Object (room.ts) is a thin wrapper around this.
 */
import { applyMove, createGame, isLegalMove } from '../../src/engine/rules'
import { deserializeState, serializeState } from '../../src/engine/serialize'
import type { GameEvent, Player } from '../../src/engine/types'
import type { PlayerInfo } from '../../src/online/protocol'

export const FORFEIT_GRACE_MS = 60_000

export interface PlayerSlot {
  token: string
  name: string
  connected: boolean
  disconnectedAt: number | null
}

export interface RoomState {
  /** Serialized GameState. */
  game: string
  players: [PlayerSlot | null, PlayerSlot | null]
  spectatorTokens: string[]
  rematchTokens: string[]
  stones: 4 | 6
}

export function createRoom(stones: 4 | 6 = 6): RoomState {
  return {
    game: serializeState(createGame(stones)),
    players: [null, null],
    spectatorTokens: [],
    rematchTokens: [],
    stones,
  }
}

export function seatOf(room: RoomState, token: string): Player | null {
  for (const seat of [0, 1] as const) {
    if (room.players[seat]?.token === token) return seat
  }
  return null
}

export function isSpectator(room: RoomState, token: string): boolean {
  return room.spectatorTokens.includes(token)
}

/** Join (or rejoin) a room. Returns the seat, or null for spectators. */
export function joinRoom(room: RoomState, token: string, name: string): Player | null {
  const existing = seatOf(room, token)
  if (existing !== null) {
    const p = room.players[existing]!
    room.players[existing] = { ...p, name, connected: true, disconnectedAt: null }
    return existing
  }
  if (isSpectator(room, token)) return null
  const free: Player | null = room.players[0] === null ? 0 : room.players[1] === null ? 1 : null
  if (free !== null) {
    room.players[free] = { token, name, connected: true, disconnectedAt: null }
    return free
  }
  if (!room.spectatorTokens.includes(token)) room.spectatorTokens.push(token)
  return null
}

/** Mark a token as disconnected (socket closed). */
export function disconnectToken(room: RoomState, token: string, now: number): void {
  const seat = seatOf(room, token)
  if (seat !== null) {
    const p = room.players[seat]!
    room.players[seat] = { ...p, connected: false, disconnectedAt: now }
  } else {
    room.spectatorTokens = room.spectatorTokens.filter((t) => t !== token)
  }
}

export interface MoveOutcome {
  events: GameEvent[]
  lastMove: { player: Player; pit: number } | null
  error?: string
}

/** Validate + apply a move. The room state is mutated only on success. */
export function applyClientMove(room: RoomState, token: string, pit: number): MoveOutcome {
  const seat = seatOf(room, token)
  if (seat === null) return { events: [], lastMove: null, error: 'Spectators cannot move' }
  const game = deserializeState(room.game)
  if (game.status !== 'playing') return { events: [], lastMove: null, error: 'The game is over' }
  if (game.currentPlayer !== seat) return { events: [], lastMove: null, error: 'Not your turn' }
  if (!isLegalMove(game, pit)) return { events: [], lastMove: null, error: `Illegal move: pit ${pit}` }
  const { state, events } = applyMove(game, pit)
  room.game = serializeState(state)
  room.rematchTokens = []
  return { events, lastMove: { player: seat, pit } }
}

/** A disconnected player forfeits if the game is still running after the grace period. */
export function forfeitIfExpired(
  room: RoomState,
  now: number,
  graceMs: number,
): { forfeitedSeat: Player | null } {
  for (const seat of [0, 1] as const) {
    const p = room.players[seat]
    if (!p || p.connected || p.disconnectedAt === null) continue
    if (now - p.disconnectedAt < graceMs) continue
    const game = deserializeState(room.game)
    if (game.status !== 'playing') continue
    const winner = (1 - seat) as Player
    room.game = serializeState({ ...game, status: 'finished', winner })
    room.players[seat] = { ...p, disconnectedAt: null }
    return { forfeitedSeat: seat }
  }
  return { forfeitedSeat: null }
}

/** Update a seated player's display name (no-op for spectators). */
export function renamePlayer(room: RoomState, token: string, name: string): boolean {
  const seat = seatOf(room, token)
  if (seat === null) return false
  const p = room.players[seat]!
  const cleaned = name.slice(0, 24).trim()
  if (cleaned) room.players[seat] = { ...p, name: cleaned }
  return true
}

/** Both players must accept a rematch; seats swap and the board resets. */
export function requestRematch(room: RoomState, token: string): { reset: boolean } {
  if (seatOf(room, token) === null) return { reset: false }
  if (!room.rematchTokens.includes(token)) room.rematchTokens.push(token)
  const [a, b] = room.players
  const bothAccepted = !!a && !!b && room.rematchTokens.includes(a.token) && room.rematchTokens.includes(b.token)
  const game = deserializeState(room.game)
  if (bothAccepted && game.status === 'finished') {
    room.players = [b, a] // swap seats
    room.game = serializeState(createGame(room.stones))
    room.rematchTokens = []
    return { reset: true }
  }
  return { reset: false }
}

export function playersInfo(room: RoomState): PlayerInfo[] {
  const out: PlayerInfo[] = []
  for (const seat of [0, 1] as const) {
    const p = room.players[seat]
    if (p) out.push({ seat, name: p.name, connected: p.connected })
  }
  return out
}

/** Serializable form for Durable Object storage (Sets → arrays). */
export function roomToJSON(room: RoomState): string {
  return JSON.stringify(room)
}

export function roomFromJSON(json: string): RoomState {
  return JSON.parse(json) as RoomState
}
