import { describe, expect, it } from 'vitest'
import { bestMove, evaluate } from './ai'
import { applyMove, createGame, legalMoves, oppositePit } from './rules'

describe('ai', () => {
  it('returns a legal move from the initial position', () => {
    const s = createGame(6)
    const move = bestMove(s, 'medium')
    expect(legalMoves(s)).toContain(move)
  })

  it('takes an immediate capture when available', () => {
    const s = createGame(6)
    s.board[3] = 1
    s.board[4] = 0
    s.board[oppositePit(4)] = 3 // capture worth 4 stones
    const move = bestMove(s, 'medium')
    expect(move).toBe(3)
  })

  it('plays the proven winning first move in solved Kalah(6,4) (pit 5 = bin 6, win by 4)', () => {
    // Source: Wikipedia Kalah analysis — in standard Kalah(6,4) the first player
    // wins by 4 with a bin-6 opening (our pit index 5).
    expect(bestMove(createGame(4), 'hard')).toBe(5)
  })

  it('prefers the extra-turn store move (pit 0) from the initial Kalah(6,6) position', () => {
    expect(bestMove(createGame(6), 'easy')).toBe(0)
    expect(bestMove(createGame(6), 'medium')).toBe(0)
  })

  it('evaluate is symmetric-ish and favors more stones in store', () => {
    const s = createGame(6)
    s.board[6] = 5
    expect(evaluate(s, 0)).toBeGreaterThan(evaluate(s, 1))
  })

  it('plays a full game against itself without crashing and ends finished', () => {
    let state = createGame(4)
    let guard = 0
    while (state.status === 'playing' && guard < 500) {
      const move = bestMove(state, 'easy', 0.5)
      state = applyMove(state, move).state
      guard++
    }
    expect(state.status).toBe('finished')
    expect(guard).toBeLessThan(500)
    const total = state.board.reduce((a, b) => a + b, 0)
    expect(total).toBe(48) // all stones end up in stores
  })
})
