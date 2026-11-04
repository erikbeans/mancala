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

export interface Controller {
  state: GameState
  lastEvents: GameEvent[]
  moves: MoveEntry[]
  thinking: boolean
  mode: Mode
  difficulty: Difficulty
  /** In 'ai' mode the human always plays South (0). */
  humanPlayer: Player
  isHumanTurn: boolean
  legalPits: number[]
  playPit: (pit: number) => void
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

  const stateRef = useRef(state)
  stateRef.current = state
  const workerRef = useRef<Worker | null>(null)

  const humanPlayer: Player = 0

  useEffect(() => {
    const worker = new Worker(new URL('../../ai.worker.ts', import.meta.url), { type: 'module' })
    workerRef.current = worker
    worker.onmessage = (e: MessageEvent<{ move: number }>) => {
      setThinking(false)
      const cur = stateRef.current
      if (cur.status !== 'playing' || !legalMoves(cur).includes(e.data.move)) return
      const { state: next, events } = applyMove(cur, e.data.move)
      setHistory((h) => [...h, cur])
      setMoves((m) => [...m, { player: cur.currentPlayer, pit: e.data.move }])
      setLastEvents(events)
      setState(next)
    }
    return () => worker.terminate()
  }, [])

  // Trigger the AI whenever it's its turn.
  useEffect(() => {
    if (mode !== 'ai' || state.status !== 'playing') return
    if (state.currentPlayer === humanPlayer) return
    setThinking(true)
    workerRef.current?.postMessage({
      state: serializeState(state),
      difficulty,
      jitter: difficulty === 'easy' ? 2 : 0,
    })
  }, [state, mode, difficulty, humanPlayer])

  const playPit = useCallback(
    (pit: number) => {
      const cur = stateRef.current
      if (cur.status !== 'playing') return
      if (mode === 'ai' && cur.currentPlayer !== humanPlayer) return
      if (!legalMoves(cur).includes(pit)) return
      const { state: next, events } = applyMove(cur, pit)
      setHistory((h) => [...h, cur])
      setMoves((m) => [...m, { player: cur.currentPlayer, pit }])
      setLastEvents(events)
      setState(next)
    },
    [mode, humanPlayer],
  )

  const undo = useCallback(() => {
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
      setThinking(false)
      return rest
    })
  }, [mode, humanPlayer])

  const restart = useCallback(() => {
    setState(createGame(stones))
    setHistory([])
    setMoves([])
    setLastEvents([])
    setThinking(false)
  }, [stones])

  const isHumanTurn =
    state.status === 'playing' && (mode === 'hotseat' || state.currentPlayer === humanPlayer)
  const legalPits = isHumanTurn ? legalMoves(state) : []

  return {
    state,
    lastEvents,
    moves,
    thinking,
    mode,
    difficulty,
    humanPlayer,
    isHumanTurn,
    legalPits,
    playPit,
    undo,
    canUndo: history.length > 0,
    restart,
  }
}
