import { useCallback, useEffect, useRef, useState } from 'react'
import { createGame, legalMoves } from '../../engine/rules'
import { deserializeState } from '../../engine/serialize'
import type { GameEvent, GameState, Player } from '../../engine/types'
import { defaultPlayerName, OnlineClient } from '../../online/client'
import type { PlayerInfo, ServerMessage } from '../../online/protocol'
import type { Controller, MoveEntry, PendingMove } from './useGame'

export interface OnlineController extends Controller {
  room: string
  /** My seat (0 or 1), or null when spectating. */
  seat: Player | null
  players: PlayerInfo[]
  spectators: number
  connected: boolean
  notices: string[]
  rematchRequested: boolean
  sendRematch: () => void
  dismissNotice: (index: number) => void
  inviteUrl: string
  opponentName: string
}

interface QueuedMove {
  base: GameState
  next: GameState
  events: GameEvent[]
  pit: number
}

/**
 * Online game controller. The server is authoritative: local clicks only send
 * `move` requests; incoming `state` messages are queued and staged as
 * PendingMoves so the Board animates them exactly like local games.
 */
export function useOnlineGame(room: string, stones: 4 | 6): OnlineController {
  const [state, setState] = useState<GameState>(() => createGame(stones))
  const [lastEvents, setLastEvents] = useState<GameEvent[]>([])
  const [moves, setMoves] = useState<MoveEntry[]>([])
  const [pending, setPending] = useState<PendingMove | null>(null)
  const [seat, setSeat] = useState<Player | null>(null)
  const [players, setPlayers] = useState<PlayerInfo[]>([])
  const [spectators, setSpectators] = useState(0)
  const [connected, setConnected] = useState(false)
  const [notices, setNotices] = useState<string[]>([])
  const [rematchRequested, setRematchRequested] = useState(false)

  const stateRef = useRef(state)
  stateRef.current = state
  const pendingRef = useRef(pending)
  pendingRef.current = pending
  const seatRef = useRef(seat)
  seatRef.current = seat
  const clientRef = useRef<OnlineClient | null>(null)
  const queueRef = useRef<QueuedMove[]>([])

  const pump = useCallback(() => {
    if (pendingRef.current) return
    const q = queueRef.current
    if (q.length > 0) setPending(q.shift()!)
  }, [])

  // After a commit clears `pending`, start the next queued animation.
  useEffect(() => {
    pump()
  }, [pending, pump])

  useEffect(() => {
    const client = new OnlineClient(room, defaultPlayerName(), {
      onOpen: () => setConnected(true),
      onClose: () => setConnected(false),
      onMessage: (msg: ServerMessage) => {
        switch (msg.t) {
          case 'welcome': {
            setSeat(msg.seat)
            setPlayers(msg.players)
            setSpectators(msg.spectators)
            queueRef.current = []
            setPending(null)
            setMoves([])
            setLastEvents([])
            setRematchRequested(false)
            setState(deserializeState(msg.state))
            break
          }
          case 'lobby': {
            setPlayers(msg.players)
            setSpectators(msg.spectators)
            break
          }
          case 'state': {
            const next = deserializeState(msg.state)
            setSeat(msg.you)
            if (msg.events.length > 0 && msg.lastMove) {
              // A move happened: animate it from the current board.
              queueRef.current.push({
                base: stateRef.current,
                next,
                events: msg.events,
                pit: msg.lastMove.pit,
              })
              pump()
            } else {
              // Rematch reset or forfeit: apply immediately.
              queueRef.current = []
              setPending(null)
              setState(next)
              setLastEvents([])
              if (next.moveCount === 0) {
                setMoves([])
                setRematchRequested(false)
              }
            }
            break
          }
          case 'notice':
          case 'error':
            setNotices((n) => [...n.slice(-3), msg.message])
            break
        }
      },
    })
    client.connect()
    clientRef.current = client
    return () => {
      client.close()
      clientRef.current = null
    }
  }, [room, pump])

  const commitMove = useCallback(() => {
    const p = pendingRef.current
    if (!p) return
    setPending(null)
    setMoves((m) => [...m, { player: p.base.currentPlayer, pit: p.pit }])
    setLastEvents(p.events)
    setState(p.next)
  }, [])

  const playPit = useCallback((pit: number) => {
    const cur = stateRef.current
    if (cur.status !== 'playing' || pendingRef.current) return
    const mySeat = seatRef.current
    if (mySeat === null || cur.currentPlayer !== mySeat) return
    if (!legalMoves(cur).includes(pit)) return
    // Server-authoritative: we just ask; the broadcast animates the result.
    clientRef.current?.send({ t: 'move', pit })
  }, [])

  const sendRematch = useCallback(() => {
    setRematchRequested(true)
    clientRef.current?.send({ t: 'rematch' })
  }, [])

  const dismissNotice = useCallback((index: number) => {
    setNotices((n) => n.filter((_, i) => i !== index))
  }, [])

  const legalPits =
    state.status === 'playing' && !pending && seat !== null && state.currentPlayer === seat
      ? legalMoves(state)
      : []

  const nameOf = useCallback(
    (p: Player): string => {
      if (p === seat) return 'You'
      const info = players.find((pl) => pl.seat === p)
      return info?.name ?? `Player ${p + 1}`
    },
    [players, seat],
  )

  const opponentName = players.find((pl) => pl.seat !== seat)?.name ?? 'Opponent'
  const inviteUrl =
    typeof location !== 'undefined' ? `${location.origin}${location.pathname}?room=${room}` : `?room=${room}`

  return {
    state,
    lastEvents,
    moves,
    thinking: false,
    pending,
    mode: 'online',
    difficulty: 'medium',
    humanPlayer: seat ?? 0,
    isHumanTurn: legalPits.length > 0,
    legalPits,
    playPit,
    commitMove,
    undo: () => {}, // no undo online
    canUndo: false,
    restart: sendRematch,
    nameOf,
    room,
    seat,
    players,
    spectators,
    connected,
    notices,
    rematchRequested,
    sendRematch,
    dismissNotice,
    inviteUrl,
    opponentName,
  }
}
