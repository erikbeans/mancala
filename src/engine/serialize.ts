import { BOARD_SIZE, GameState, Winner } from './types'

/**
 * Compact string form of a game state, e.g. "6,6,6,6,6,6,0,6,6,6,6,6,6,0|0|playing|-|0".
 * Used for save games, share links, and online sync (the server sends these).
 */
export function serializeState(state: GameState): string {
  return [
    state.board.join(','),
    state.currentPlayer,
    state.status,
    state.winner === null ? '-' : state.winner,
    state.moveCount,
  ].join('|')
}

export function deserializeState(str: string): GameState {
  const parts = str.split('|')
  if (parts.length !== 5) throw new Error(`Bad serialized state: ${str}`)
  const board = parts[0].split(',').map(Number)
  if (board.length !== BOARD_SIZE || board.some((n) => !Number.isInteger(n) || n < 0)) {
    throw new Error(`Bad board in serialized state: ${str}`)
  }
  const currentPlayer = Number(parts[1])
  if (currentPlayer !== 0 && currentPlayer !== 1) throw new Error(`Bad player: ${str}`)
  const status = parts[2]
  if (status !== 'playing' && status !== 'finished') throw new Error(`Bad status: ${str}`)
  const w = parts[3]
  const winner: Winner = w === '-' ? null : w === 'draw' ? 'draw' : Number(w) === 1 ? 1 : 0
  const moveCount = Number(parts[4])
  if (!Number.isInteger(moveCount) || moveCount < 0) throw new Error(`Bad moveCount: ${str}`)
  return { board, currentPlayer: currentPlayer as 0 | 1, status, winner, moveCount }
}
