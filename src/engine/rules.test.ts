import { describe, expect, it } from 'vitest'
import { applyMove, createGame, isLegalMove, legalMoves, oppositePit, stonesOnSide } from './rules'
import { GameState, SOUTH_STORE } from './types'

describe('createGame', () => {
  it('creates a standard Kalah(6,6) board', () => {
    const s = createGame(6)
    expect(s.board).toHaveLength(14)
    expect(s.board.slice(0, 6)).toEqual([6, 6, 6, 6, 6, 6])
    expect(s.board[6]).toBe(0) // south store
    expect(s.board.slice(7, 13)).toEqual([6, 6, 6, 6, 6, 6])
    expect(s.board[13]).toBe(0) // north store
    expect(s.currentPlayer).toBe(0)
    expect(s.status).toBe('playing')
  })

  it('supports Kalah(6,4)', () => {
    const s = createGame(4)
    expect(s.board[0]).toBe(4)
    expect(stonesOnSide(s.board, 0)).toBe(24)
  })
})

describe('applyMove', () => {
  it('sows counter-clockwise and grants an extra turn when landing in own store', () => {
    const s = createGame(6)
    const { state, events } = applyMove(s, 0) // 6 stones: pits 1-5 then store
    expect(state.board[0]).toBe(0)
    expect(state.board.slice(1, 6)).toEqual([7, 7, 7, 7, 7])
    expect(state.board[SOUTH_STORE]).toBe(1)
    expect(state.currentPlayer).toBe(0) // extra turn
    expect(events.some((e) => e.type === 'extra-turn')).toBe(true)
    expect(events[0]).toMatchObject({ type: 'sow', from: 0, path: [1, 2, 3, 4, 5, 6] })
  })

  it('passes the turn when the last stone does not land in own store', () => {
    const s = createGame(6)
    const { state, events } = applyMove(s, 5) // lands in north pit 11
    expect(state.board[5]).toBe(0)
    expect(state.board[SOUTH_STORE]).toBe(1)
    expect(state.board[11]).toBe(7)
    expect(state.currentPlayer).toBe(1)
    expect(events.some((e) => e.type === 'extra-turn')).toBe(false)
  })

  it('skips the opponent store when sowing through it', () => {
    const s = createGame(6)
    s.board[5] = 9 // path: 6,7,8,9,10,11,12, skip 13 -> 0,1
    const { state } = applyMove(s, 5)
    expect(state.board[13]).toBe(0) // opponent store never receives stones
    expect(state.board[SOUTH_STORE]).toBe(1)
    expect(state.board[0]).toBe(7)
    expect(state.board[1]).toBe(7)
    expect(state.currentPlayer).toBe(1) // last stone in pit 1 (6+1=7, no capture)
  })

  it('captures when the last stone lands in an empty own pit opposite a non-empty pit', () => {
    const s = createGame(6)
    s.board[3] = 1 // south sows from pit 3
    s.board[4] = 0 // empty own pit — last stone lands here
    s.board[oppositePit(4)] = 3 // pit 8 has 3 stones
    const { state, events } = applyMove(s, 3)
    expect(state.board[4]).toBe(0)
    expect(state.board[8]).toBe(0)
    expect(state.board[SOUTH_STORE]).toBe(4) // last stone + opposite stones
    expect(events.find((e) => e.type === 'capture')).toMatchObject({
      pit: 4,
      opposite: 8,
      count: 4,
    })
    expect(state.currentPlayer).toBe(1)
  })

  it('does not capture when the opposite pit is empty', () => {
    const s = createGame(6)
    s.board[3] = 1
    s.board[4] = 0
    s.board[8] = 0
    const { state, events } = applyMove(s, 3)
    expect(state.board[4]).toBe(1)
    expect(state.board[SOUTH_STORE]).toBe(0)
    expect(events.some((e) => e.type === 'capture')).toBe(false)
  })

  it('does not capture when the last stone lands on the opponent side', () => {
    const s = createGame(6)
    s.board[5] = 8 // path: 6,7,8,9,10,11,12, skip 13 -> 0 ; last = 0 (south pit, 6+1=7, no capture anyway)
    const { state, events } = applyMove(s, 5)
    expect(state.board[0]).toBe(7)
    expect(events.some((e) => e.type === 'capture')).toBe(false)
  })

  it('handles multi-lap sowing (more stones than board cells)', () => {
    const s = createGame(6)
    s.board[0] = 16
    s.board[1] = 0
    const { state, events } = applyMove(s, 0)
    const sow = events[0]
    expect(sow.type === 'sow' && sow.path).toHaveLength(16)
    expect(state.board[1]).toBe(2) // received stones on steps 1 and 14
    expect(state.board[SOUTH_STORE]).toBe(1) // own store hit once (step 6)
    expect(state.board[13]).toBe(0) // opponent store skipped
    expect(state.currentPlayer).toBe(1) // last stone in pit 3 (6+2=8, not a capture)
  })

  it('throws on illegal moves', () => {
    const s = createGame(6)
    expect(() => applyMove(s, 7)).toThrow() // opponent pit
    s.board[2] = 0
    expect(() => applyMove(s, 2)).toThrow() // empty pit
    expect(isLegalMove(s, 2)).toBe(false)
    expect(isLegalMove(s, 0)).toBe(true)
  })

  it('ends the game and sweeps remaining stones when a side empties', () => {
    // South has a single stone in pit 5 -> lands in own store, south side empties.
    const s: GameState = {
      board: [0, 0, 0, 0, 0, 1, 20, 1, 1, 1, 1, 1, 1, 10],
      currentPlayer: 0,
      status: 'playing',
      winner: null,
      moveCount: 10,
    }
    const { state, events } = applyMove(s, 5)
    expect(state.status).toBe('finished')
    expect(state.board[SOUTH_STORE]).toBe(21)
    expect(state.board[13]).toBe(16) // north swept its 6 remaining stones
    expect(stonesOnSide(state.board, 1)).toBe(0)
    expect(state.winner).toBe(0) // 21 vs 16
    expect(events.some((e) => e.type === 'sweep' && e.side === 1 && e.count === 6)).toBe(true)
    expect(events.some((e) => e.type === 'game-over')).toBe(true)
  })

  it('detects a win for the sweeping side', () => {
    const s: GameState = {
      board: [0, 0, 0, 0, 0, 1, 20, 5, 0, 0, 0, 0, 0, 20],
      currentPlayer: 0,
      status: 'playing',
      winner: null,
      moveCount: 10,
    }
    const { state } = applyMove(s, 5)
    // south store 20+1=21, north sweeps 5 -> 25
    expect(state.status).toBe('finished')
    expect(state.winner).toBe(1)
  })

  it('detects a draw when final stores are equal', () => {
    const s: GameState = {
      board: [0, 0, 0, 0, 0, 1, 20, 1, 0, 0, 0, 0, 0, 20],
      currentPlayer: 0,
      status: 'playing',
      winner: null,
      moveCount: 10,
    }
    const { state } = applyMove(s, 5)
    // south store 20+1=21, north sweeps 1 -> 21
    expect(state.status).toBe('finished')
    expect(state.winner).toBe('draw')
  })
})

describe('legalMoves', () => {
  it('lists only own non-empty pits', () => {
    const s = createGame(6)
    s.board[2] = 0
    expect(legalMoves(s)).toEqual([0, 1, 3, 4, 5])
  })

  it('returns no moves when the game is finished', () => {
    const s = createGame(6)
    s.status = 'finished'
    expect(legalMoves(s)).toEqual([])
  })
})
