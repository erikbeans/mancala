/**
 * Core types for the Kalah engine.
 *
 * Board layout (14 cells, sowing counter-clockwise = index + 1 mod 14):
 *
 *            North (player 1)
 *        12  11  10   9   8   7
 *   13                            6
 *         0   1   2   3   4   5
 *            South (player 0)
 *
 * Player 0 (South) owns pits 0-5 and store 6.
 * Player 1 (North) owns pits 7-12 and store 13.
 */

export type Player = 0 | 1

export const PITS_PER_SIDE = 6
export const BOARD_SIZE = 14
export const SOUTH_STORE = 6
export const NORTH_STORE = 13

export type GameStatus = 'playing' | 'finished'
export type Winner = Player | 'draw' | null

export interface GameState {
  /** 14 cells: pits 0-5 (South), store 6, pits 7-12 (North), store 13. */
  board: number[]
  currentPlayer: Player
  status: GameStatus
  winner: Winner
  moveCount: number
}

/** Events produced by a move, used for animation and (later) online sync. */
export type GameEvent =
  | { type: 'sow'; from: number; path: number[] }
  | { type: 'capture'; pit: number; opposite: number; store: number; count: number }
  | { type: 'extra-turn'; store: number }
  | { type: 'sweep'; side: Player; store: number; count: number }
  | { type: 'game-over' }

export interface MoveResult {
  state: GameState
  events: GameEvent[]
}
