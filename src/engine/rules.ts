import {
  BOARD_SIZE,
  NORTH_STORE,
  SOUTH_STORE,
  GameState,
  MoveResult,
  Player,
} from './types'

export function createGame(stonesPerPit = 6): GameState {
  const board = new Array<number>(BOARD_SIZE).fill(stonesPerPit)
  board[SOUTH_STORE] = 0
  board[NORTH_STORE] = 0
  return { board, currentPlayer: 0, status: 'playing', winner: null, moveCount: 0 }
}

export function storeOf(player: Player): number {
  return player === 0 ? SOUTH_STORE : NORTH_STORE
}

export function opponentOf(player: Player): Player {
  return (1 - player) as Player
}

export function pitsOf(player: Player): number[] {
  return player === 0 ? [0, 1, 2, 3, 4, 5] : [7, 8, 9, 10, 11, 12]
}

/** The pit directly across the board from a pit (stores have no opposite). */
export function oppositePit(pit: number): number {
  return 12 - pit
}

export function isPitOf(pit: number, player: Player): boolean {
  return pitsOf(player).includes(pit)
}

export function legalMoves(state: GameState): number[] {
  if (state.status !== 'playing') return []
  return pitsOf(state.currentPlayer).filter((pit) => state.board[pit] > 0)
}

export function isLegalMove(state: GameState, pit: number): boolean {
  return legalMoves(state).includes(pit)
}

export function stonesOnSide(board: number[], player: Player): number {
  return pitsOf(player).reduce((sum, pit) => sum + board[pit], 0)
}

/**
 * Apply a move for the current player. Throws on illegal moves.
 * Implements: sowing counter-clockwise (own store included, opponent's skipped),
 * extra turn when the last stone lands in the own store, capture when the last
 * stone lands in an empty own pit with a non-empty opposite pit, and the
 * end-of-game sweep when either side runs out of stones.
 */
export function applyMove(state: GameState, pit: number): MoveResult {
  if (!isLegalMove(state, pit)) {
    throw new Error(`Illegal move: pit ${pit} for player ${state.currentPlayer}`)
  }

  const board = [...state.board]
  const player = state.currentPlayer
  const ownStore = storeOf(player)
  const oppStore = storeOf(opponentOf(player))

  const stones = board[pit]
  board[pit] = 0

  const path: number[] = []
  let pos = pit
  for (let i = 0; i < stones; i++) {
    pos = (pos + 1) % BOARD_SIZE
    if (pos === oppStore) pos = (pos + 1) % BOARD_SIZE // skip opponent's store
    board[pos]++
    path.push(pos)
  }
  const last = pos

  const events: MoveResult['events'] = [{ type: 'sow', from: pit, path }]
  let nextPlayer = player

  if (last === ownStore) {
    // Extra turn: same player moves again (chains allowed).
    events.push({ type: 'extra-turn', store: ownStore })
  } else {
    // board[last] === 1 means the pit was empty just before the last stone
    // landed (correct even for multi-lap sows).
    if (isPitOf(last, player) && board[last] === 1) {
      const opp = oppositePit(last)
      if (board[opp] > 0) {
        const count = board[last] + board[opp]
        board[ownStore] += count
        board[last] = 0
        board[opp] = 0
        events.push({ type: 'capture', pit: last, opposite: opp, store: ownStore, count })
      }
    }
    nextPlayer = opponentOf(player)
  }

  let status = state.status
  let winner = state.winner

  const southEmpty = stonesOnSide(board, 0) === 0
  const northEmpty = stonesOnSide(board, 1) === 0
  if (southEmpty || northEmpty) {
    status = 'finished'
    // The player whose side is NOT empty sweeps their remaining stones.
    if (southEmpty && !northEmpty) {
      const count = stonesOnSide(board, 1)
      board[NORTH_STORE] += count
      for (const p of pitsOf(1)) board[p] = 0
      events.push({ type: 'sweep', side: 1, store: NORTH_STORE, count })
    } else if (northEmpty && !southEmpty) {
      const count = stonesOnSide(board, 0)
      board[SOUTH_STORE] += count
      for (const p of pitsOf(0)) board[p] = 0
      events.push({ type: 'sweep', side: 0, store: SOUTH_STORE, count })
    }
    const s = board[SOUTH_STORE]
    const n = board[NORTH_STORE]
    winner = s === n ? 'draw' : s > n ? 0 : 1
    events.push({ type: 'game-over' })
  }

  return {
    state: { board, currentPlayer: nextPlayer, status, winner, moveCount: state.moveCount + 1 },
    events,
  }
}
