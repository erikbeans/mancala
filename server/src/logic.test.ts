import { describe, expect, it } from 'vitest'
import { deserializeState, serializeState } from '../../src/engine/serialize'
import { createGame } from '../../src/engine/rules'
import {
  applyClientMove,
  createRoom,
  disconnectToken,
  forfeitIfExpired,
  FORFEIT_GRACE_MS,
  joinRoom,
  playersInfo,
  renamePlayer,
  requestRematch,
  roomFromJSON,
  roomToJSON,
  seatOf,
} from './logic'

const A = 'token-a'
const B = 'token-b'

function twoPlayerRoom() {
  const room = createRoom(6)
  joinRoom(room, A, 'Alice')
  joinRoom(room, B, 'Bob')
  return room
}

describe('room logic', () => {
  it('seats the first two joiners as players, the rest as spectators', () => {
    const room = twoPlayerRoom()
    joinRoom(room, 'token-c', 'Carol')
    expect(seatOf(room, A)).toBe(0)
    expect(seatOf(room, B)).toBe(1)
    expect(seatOf(room, 'token-c')).toBe(null)
    expect(room.spectatorTokens).toContain('token-c')
    expect(playersInfo(room)).toHaveLength(2)
  })

  it('rejoining with the same token reclaims the seat and marks connected', () => {
    const room = twoPlayerRoom()
    disconnectToken(room, A, 1000)
    expect(room.players[0]!.connected).toBe(false)
    expect(seatOf(room, A)).toBe(0)
    joinRoom(room, A, 'Alice')
    expect(room.players[0]!.connected).toBe(true)
    expect(room.players[0]!.disconnectedAt).toBe(null)
  })

  it('applies a legal move only for the player whose turn it is', () => {
    const room = twoPlayerRoom()
    const bad = applyClientMove(room, B, 7) // not B's turn
    expect(bad.error).toBe('Not your turn')
    const illegal = applyClientMove(room, A, 9) // not A's pit
    expect(illegal.error).toMatch(/Illegal move/)
    const ok = applyClientMove(room, A, 0)
    expect(ok.error).toBeUndefined()
    expect(ok.lastMove).toEqual({ player: 0, pit: 0 })
    expect(ok.events.length).toBeGreaterThan(0)
    // pit 0 with 6 stones lands in the store -> extra turn, still player 0
    expect(deserializeState(room.game).currentPlayer).toBe(0)
  })

  it('rejects moves from spectators', () => {
    const room = twoPlayerRoom()
    joinRoom(room, 'token-c', 'Carol')
    expect(applyClientMove(room, 'token-c', 0).error).toMatch(/Spectator/)
  })

  it('forfeits after the grace period, not before', () => {
    const room = twoPlayerRoom()
    disconnectToken(room, A, 1000)
    expect(forfeitIfExpired(room, 1000 + FORFEIT_GRACE_MS - 1, FORFEIT_GRACE_MS).forfeitedSeat).toBe(null)
    expect(deserializeState(room.game).status).toBe('playing')
    const r = forfeitIfExpired(room, 1000 + FORFEIT_GRACE_MS + 1, FORFEIT_GRACE_MS)
    expect(r.forfeitedSeat).toBe(0)
    const g = deserializeState(room.game)
    expect(g.status).toBe('finished')
    expect(g.winner).toBe(1)
  })

  it('rematch requires both players and swaps seats + resets the board', () => {
    const room = twoPlayerRoom()
    // finish the game artificially
    const g = deserializeState(room.game)
    room.game = serializeState({ ...g, status: 'finished', winner: 0 })
    expect(requestRematch(room, A).reset).toBe(false)
    expect(requestRematch(room, B).reset).toBe(true)
    expect(seatOf(room, A)).toBe(1) // swapped
    expect(seatOf(room, B)).toBe(0)
    expect(deserializeState(room.game)).toEqual(createGame(6))
  })

  it('renames a seated player and broadcasts via lobby', () => {
    const room = twoPlayerRoom()
    expect(renamePlayer(room, A, 'Alicia')).toBe(true)
    expect(room.players[0]!.name).toBe('Alicia')
    expect(playersInfo(room).find((p) => p.seat === 0)!.name).toBe('Alicia')
    // spectators cannot rename
    joinRoom(room, 'token-c', 'Carol')
    expect(renamePlayer(room, 'token-c', ' Eve ')).toBe(false)
    // empty name keeps the old one
    renamePlayer(room, A, '   ')
    expect(room.players[0]!.name).toBe('Alicia')
  })

  it('round-trips through JSON for DO storage', () => {
    const room = twoPlayerRoom()
    applyClientMove(room, A, 0)
    const restored = roomFromJSON(roomToJSON(room))
    expect(restored).toEqual(room)
  })
})
