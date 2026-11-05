import type { GameEvent, Player } from '../engine/types'

/** Info about a seated player, broadcast to everyone in the room. */
export interface PlayerInfo {
  seat: Player
  name: string
  connected: boolean
}

/** Messages the client sends to the room (after hello). */
export type ClientMessage =
  | { t: 'hello'; name: string; token: string }
  | { t: 'move'; pit: number }
  | { t: 'rematch' }
  | { t: 'leave' }

/** Messages the server sends to clients. `state` is a serialized GameState. */
export type ServerMessage =
  | {
      t: 'welcome'
      room: string
      seat: Player | null // null = spectator
      token: string
      state: string
      players: PlayerInfo[]
      spectators: number
    }
  | { t: 'lobby'; players: PlayerInfo[]; spectators: number }
  | {
      t: 'state'
      state: string
      events: GameEvent[]
      lastMove: { player: Player; pit: number } | null
      /** The recipient's own seat (null = spectator). Changes after a rematch swap. */
      you: Player | null
    }
  | { t: 'notice'; message: string }
  | { t: 'error'; message: string }

export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789' // no confusing chars
export const ROOM_CODE_LENGTH = 6

export function generateRoomCode(): string {
  let code = ''
  for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
    code += ROOM_CODE_ALPHABET[Math.floor(Math.random() * ROOM_CODE_ALPHABET.length)]
  }
  return code
}

export function newToken(): string {
  return crypto.randomUUID()
}
