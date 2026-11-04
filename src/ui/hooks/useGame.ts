import { useCallback, useEffect, useRef, useState } from 'react'
import type { Difficulty } from '../../engine/ai'
import { applyMove, createGame, legalMoves } from '../../engine/rules'
import { serializeState } from '../../engine/serialize'
import type { GameEvent, GameState, Player } from '../../engine/types'

export type Mode = 'ai' | 'hotseat'

export interface MoveEntry {
  player: Player
  pit: number
}

/** A move that has been computed but is still being animated on the board. */
export interface PendingMove {
  base: GameState
  next: GameState
  events: GameEvent[]
  pit: number
}

export interface Controller {
  state: GameState
  lastEvents: GameEvent[]
  moves: MoveEntry[]
  thinking: boolean
  /** Non-null while a move is being animated; input is locked then. */
  pending: PendingMove | null
  mode: Mode
  difficulty: Difficulty
  /** In 'ai' mode the human always plays South (0). */
  humanPlayer: Player
  isHumanTurn: boolean
  legalPits: number[]
  playPit: (pit: number) => void
  /** Called by the board when the sowing animation has finished. */
  commitMove: () => void
  undo: () => void
  canUndo: boolean
  restart: () => void
}

export function useGame(mode: Mode, difficulty: Difficulty, stones: 4 | 6): Controller {
  const [state, setState] = useState<GameState>(() => createGame(stones))
  const [lastEvents, setLastEvents] = useState<GameEvent[]>([])
  const [moves, setMoves] = useState<MoveEntry[]>([])
  const [history, setHistory] = useState<GameState[]>([])
  const [thinking, setThinking] = useState(false)
  const [pending, setPending] = useState<PendingMove | null>(null)

  const stateRef = useRef(state)
  stateRef.current = state
  const pendingRef = useRef(pending)
  pendingRef.current = pending
  const workerRef = useRef<Worker | null>(null)

  const humanPlayer: Player = 0

  /** Compute a move and hold it for animation; the board commits it later. */
  const stage = useCallback((pit: number): boolean => {
    const cur = stateRef.current
    if (cur.status !== 'playing' || pendingRef.current) return false
    if (!legalMoves(cur).includes(pit)) return false
    const { state: next, events } = applyMove(cur, pit)
    setPending({ base: cur, next, events, pit })
    return true
  }, [])

  const commitMove = useCallback(() => {
    const p = pendingRef.current
    if (!p) return
    setPending(null)
    setHistory((h) => [...h, p.base])
    setMoves((m) => [...m, { player: p.base.currentPlayer, pit: p.pit }])
    setLastEvents(p.events)
    setState(p.next)
  }, [])

  useEffect(() => {
    const worker = new Worker(new URL('../../ai.worker.ts', import.meta.url), { type: 'module' })
    workerRef.current = worker
    worker.onmessage = (e: MessageEvent<{ move: number }>) => {
      setThinking(false)
      stage(e.data.move)
    }
    return () => worker.terminate()
  }, [stage])

  // Trigger the AI whenever it's its turn and no animation is running.
  useEffect(() => {
    if (mode !== 'ai' || state.status !== 'playing') return
    if (state.currentPlayer === humanPlayer) return
    if (pending) return
    setThinking(true)
    workerRef.current?.postMessage({
      state: serializeState(state),
      difficulty,
      jitter: difficulty === 'easy' ? 2 : 0,
    })
  }, [state, pending, mode, difficulty, humanPlayer])

  const playPit = useCallback(
    (pit: number) => {
      if (mode === 'ai' && stateRef.current.currentPlayer !== humanPlayer) return
      stage(pit)
    },
    [mode, humanPlayer, stage],
  )

  const undo = useCallback(() => {
    setPending(null)
    setThinking(false)
    setHistory((h) => {
      if (h.length === 0) return h
      // In AI mode, keep undoing until it's the human's turn again.
      let next = h[h.length - 1]
      let rest = h.slice(0, -1)
      if (mode === 'ai') {
        while (rest.length > 0 && next.currentPlayer !== humanPlayer && next.status === 'playing') {
          next = rest[rest.length - 1]
          rest = rest.slice(0, -1)
        }
      }
      setMoves((m) => m.slice(0, h.length - rest.length))
      setLastEvents([])
      setState(next)
      return rest
    })
  }, [mode, humanPlayer])

  const restart = useCallback(() => {
    setState(createGame(stones))
    setHistory([])
    setMoves([])
    setLastEvents([])
    setThinking(false)
    setPending(null)
  }, [stones])

  const isHumanTurn =
    state.status === 'playing' && !pending && (mode === 'hotseat' || state.currentPlayer === humanPlayer)
  const legalPits = isHumanTurn ? legalMoves(state) : []

  return {
    state,
    lastEvents,
    moves,
    thinking,
    pending,
    mode,
    difficulty,
    humanPlayer,
    isHumanTurn,
    legalPits,
    playPit,
    commitMove,
    undo,
    canUndo: history.length > 0,
    restart,
  }
}
