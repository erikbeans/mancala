import { applyMove, legalMoves, pitsOf, stonesOnSide, storeOf } from './rules'
import { GameState } from './types'

const WIN_SCORE = 100_000

export type Difficulty = 'easy' | 'medium' | 'hard'

const DEPTHS: Record<Difficulty, number> = {
  easy: 2,
  medium: 5,
  hard: 9,
}

/** Static evaluation from `player`'s perspective (higher = better for player). */
export function evaluate(state: GameState, player: 0 | 1, depth = 0): number {
  if (state.status === 'finished') {
    if (state.winner === 'draw') return 0
    // Prefer faster wins / slower losses via remaining-depth bonus.
    const sign = state.winner === player ? 1 : -1
    return sign * (WIN_SCORE + depth)
  }
  const opp = (1 - player) as 0 | 1
  const storeDiff = state.board[storeOf(player)] - state.board[storeOf(opp)]
  const sideDiff = stonesOnSide(state.board, player) - stonesOnSide(state.board, opp)
  const mobDiff =
    pitsOf(player).filter((p) => state.board[p] > 0).length -
    pitsOf(opp).filter((p) => state.board[p] > 0).length
  return storeDiff * 10 + sideDiff + mobDiff * 2
}

/** Order moves heuristically: extra-turn moves first (they keep the initiative). */
function orderMoves(state: GameState, moves: number[]): number[] {
  const ownStore = storeOf(state.currentPlayer)
  return [...moves].sort((a, b) => {
    const aExtra = a + state.board[a] === ownStore ? 1 : 0
    const bExtra = b + state.board[b] === ownStore ? 1 : 0
    return bExtra - aExtra
  })
}

/**
 * Negamax with alpha-beta pruning. The value is always from the perspective
 * of `state.currentPlayer` — extra turns keep the same player, which the
 * recursion handles naturally via the child state's currentPlayer.
 */
function negamax(state: GameState, depth: number, alpha: number, beta: number): number {
  const player = state.currentPlayer
  if (state.status === 'finished') return evaluate(state, player, depth)
  if (depth === 0) return evaluate(state, player, 0)
  const moves = orderMoves(state, legalMoves(state))
  if (moves.length === 0) return evaluate(state, player, depth)
  let best = -Infinity
  for (const move of moves) {
    const { state: next } = applyMove(state, move)
    // Extra turns keep the same player, so no sign flip in that case.
    const value =
      next.currentPlayer === player
        ? negamax(next, depth - 1, alpha, beta)
        : -negamax(next, depth - 1, -beta, -alpha)
    if (value > best) best = value
    if (best > alpha) alpha = best
    if (alpha >= beta) break
  }
  return best
}

/**
 * Pick the best move for the current player. `jitter` adds randomness among
 * near-equal moves (used on easy) so games vary.
 */
export function bestMove(state: GameState, difficulty: Difficulty = 'medium', jitter = 0): number {
  const moves = legalMoves(state)
  if (moves.length === 0) throw new Error('No legal moves')
  const depth = DEPTHS[difficulty]

  const player = state.currentPlayer
  let bestValue = -Infinity
  let best: number[] = []
  for (const move of orderMoves(state, moves)) {
    const { state: next } = applyMove(state, move)
    const value =
      next.currentPlayer === player
        ? negamax(next, depth - 1, -Infinity, Infinity)
        : -negamax(next, depth - 1, -Infinity, Infinity)
    const score = jitter > 0 ? value + Math.random() * jitter : value
    if (score > bestValue) {
      bestValue = score
      best = [move]
    } else if (score === bestValue) {
      best.push(move)
    }
  }
  return best[Math.floor(Math.random() * best.length)]
}
