import { useEffect, useRef, useState } from 'react'
import { pitsOf } from '../../engine/rules'
import type { GameEvent } from '../../engine/types'
import type { Controller } from '../hooks/useGame'
import { pitLabel } from '../labels'

/**
 * Board geometry (SVG viewBox 0 0 1000 440).
 * Bottom row (player 0) pits 0-5 run left→right, store 6 on the right,
 * top row (player 1) pits 7-12 run right→left, store 13 on the left —
 * matching counter-clockwise sowing.
 */
export const W = 1000
export const H = 440
const PIT_RX = 56
const PIT_RY = 50
const STONE_R = 11
const STORE_HALF_W = 46
const STORE_HALF_H = 135
const SOUTH_Y = 330
const NORTH_Y = 110

export function pitCenter(index: number): { x: number; y: number } {
  if (index <= 5) return { x: 200 + index * 105, y: SOUTH_Y }
  if (index === 6) return { x: 912, y: 220 }
  if (index <= 12) return { x: 200 + (12 - index) * 105, y: NORTH_Y }
  return { x: 62, y: 220 } // 13
}

const STONE_COLORS = ['#e8c47a', '#d9a45b', '#c98a4b', '#b5763f', '#e5d3a1', '#cf9455']

/**
 * Offset of stone i within its pit. The result is normalized so the whole
 * stone (center + radius) stays fully inside the pit shape.
 */
function stoneOffset(i: number, isStore: boolean): { dx: number; dy: number } {
  let dx: number
  let dy: number
  if (isStore) {
    const col = i % 3
    const row = Math.floor(i / 3)
    dx = (col - 1) * 26
    dy = (row - 1.5) * 34
  } else {
    const col = i % 4
    const row = Math.floor(i / 4)
    dx = (col - 1.5) * 26
    dy = (row - 1) * 22
  }
  // Deterministic jitter so pits don't look like a perfect grid.
  dx += (((i * 37) % 11) - 5) * 1.2
  dy += (((i * 53) % 11) - 5) * 1.0
  const limX = (isStore ? STORE_HALF_W : PIT_RX) - STONE_R - 3
  const limY = (isStore ? STORE_HALF_H : PIT_RY) - STONE_R - 3
  const q = (dx / limX) ** 2 + (dy / limY) ** 2
  if (q > 1) {
    const s = 1 / Math.sqrt(q)
    dx *= s
    dy *= s
  }
  return { dx, dy }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

type Phase = 'chosen' | 'sow' | 'capture' | 'sweep'

interface Anim {
  phase: Phase
  from: number
  path: number[]
  stepMs: number
  /** Board exactly as the move started (source pit still full). */
  origBase: number[]
  /** Board after the source pit is emptied, before any sowing lands. */
  base: number[]
  /** Board after all sow stones have landed (pre-capture). */
  sowBoard: number[]
  /** How many sow stones target each pit (rendered as flying stones). */
  arrivals: Map<number, number>
  /** Board after the capture is applied. */
  captureBoard: number[]
  /** Stones flying to the store during the sweep phase. */
  sweepFlying: { from: number; storeIdx: number }[]
  cap?: Extract<GameEvent, { type: 'capture' }>
  sweep?: Extract<GameEvent, { type: 'sweep' }>
}

interface BoardProps {
  ctl: Controller
  onPit: (pit: number) => void
}

export default function Board({ ctl, onPit }: BoardProps) {
  const { state, lastEvents, legalPits, pending } = ctl
  const [anim, setAnim] = useState<Anim | null>(null)
  const ctlRef = useRef(ctl)
  ctlRef.current = ctl
  const [reduceMotion] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches)

  // Animate a staged move: highlight the chosen pit, fly every stone
  // individually to its target, play out capture / sweep, then commit.
  useEffect(() => {
    if (!pending) {
      setAnim(null)
      return
    }
    if (reduceMotion) {
      ctlRef.current.commitMove()
      return
    }
    let cancelled = false
    const sow = pending.events.find((e) => e.type === 'sow')
    const path = sow && sow.type === 'sow' ? sow.path : []
    const from = sow && sow.type === 'sow' ? sow.from : -1
    const capEv = pending.events.find((e) => e.type === 'capture')
    const sweepEv = pending.events.find((e) => e.type === 'sweep')
    const cap = capEv && capEv.type === 'capture' ? capEv : undefined
    const sweep = sweepEv && sweepEv.type === 'sweep' ? sweepEv : undefined

    const origBase = [...pending.base.board]
    const base = [...origBase]
    if (from >= 0) base[from] = 0
    const sowBoard = [...base]
    const arrivals = new Map<number, number>()
    for (const p of path) {
      sowBoard[p]++
      arrivals.set(p, (arrivals.get(p) ?? 0) + 1)
    }
    let captureBoard = sowBoard
    if (cap) {
      captureBoard = [...sowBoard]
      captureBoard[cap.pit] = 0
      captureBoard[cap.opposite] = 0
      captureBoard[cap.store] += cap.count
    }
    // Stones that will visibly fly into the store during the sweep (cap at 12).
    const sweepFlying: { from: number; storeIdx: number }[] = []
    if (sweep) {
      let storeIdx = captureBoard[sweep.store]
      for (const p of pitsOf(sweep.side)) {
        for (let i = 0; i < captureBoard[p] && sweepFlying.length < 12; i++) {
          sweepFlying.push({ from: p, storeIdx: storeIdx++ })
        }
      }
    }
    // Slow enough to track each stone, but cap the total time for big sows.
    const stepMs = Math.max(150, Math.min(320, Math.floor(3600 / Math.max(1, path.length))))
    const chosenMs = 900

    setAnim({
      phase: 'chosen',
      from,
      path,
      stepMs,
      origBase,
      base,
      sowBoard,
      arrivals,
      captureBoard,
      sweepFlying,
      cap,
      sweep,
    })

    void (async () => {
      // Beat 1: show which pit was chosen before any stone moves.
      await sleep(chosenMs)
      if (cancelled) return
      setAnim((a) => (a ? { ...a, phase: 'sow' } : a))
      // Beat 2: stones fly one by one.
      await sleep(path.length * stepMs + stepMs)
      if (cancelled) return
      if (cap) {
        setAnim((a) => (a ? { ...a, phase: 'capture' } : a))
        await sleep(Math.min(cap.count, 12) * 90 + 600)
        if (cancelled) return
      }
      if (sweep) {
        setAnim((a) => (a ? { ...a, phase: 'sweep' } : a))
        await sleep(900)
        if (cancelled) return
      }
      await sleep(stepMs * 2)
      if (cancelled) return
      setAnim(null)
      ctlRef.current.commitMove()
    })()
    return () => {
      cancelled = true
    }
  }, [pending, reduceMotion])

  /** Stones shown inside a pit right now (flying stones are rendered separately). */
  const displayCount = (pit: number): number => {
    if (!anim) return state.board[pit]
    switch (anim.phase) {
      case 'chosen':
        return anim.origBase[pit]
      case 'sow':
        return anim.sowBoard[pit] - (anim.arrivals.get(pit) ?? 0)
      case 'capture': {
        if (anim.cap && (pit === anim.cap.pit || pit === anim.cap.opposite)) return 0
        // Captured stones are still flying to the store during this phase.
        if (anim.cap && pit === anim.cap.store) return anim.sowBoard[pit]
        return anim.sowBoard[pit]
      }
      case 'sweep': {
        if (anim.sweep && pitsOf(anim.sweep.side).includes(pit)) {
          const flying = anim.sweepFlying.filter((f) => f.from === pit).length
          return anim.captureBoard[pit] - flying
        }
        if (anim.sweep && pit === anim.sweep.store) {
          return anim.captureBoard[pit] - anim.sweepFlying.length
        }
        return anim.captureBoard[pit]
      }
    }
  }

  const lastCapture = lastEvents.find((e) => e.type === 'capture')
  const cap = anim && anim.phase !== 'chosen' && anim.phase !== 'sow' && anim.cap ? anim.cap : lastCapture
  const capturedPits = new Set<number>()
  if (cap && cap.type === 'capture') {
    capturedPits.add(cap.pit)
    capturedPits.add(cap.opposite)
  }
  const extraTurn =
    lastEvents.some((e) => e.type === 'extra-turn') ||
    (pending?.events.some((e) => e.type === 'extra-turn') ?? false)

  const handleKey = (e: React.KeyboardEvent, pit: number) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onPit(pit)
    }
  }

  const renderPit = (pit: number) => {
    const { x, y } = pitCenter(pit)
    const count = displayCount(pit)
    const playable = legalPits.includes(pit)
    const isStore = pit === 6 || pit === 13
    const captured = capturedPits.has(pit)
    const chosen = !isStore && anim?.phase === 'chosen' && pit === anim.from
    const cls = [
      'pit',
      playable ? 'playable' : '',
      isStore ? 'store' : '',
      captured ? 'captured' : '',
      chosen ? 'chosen' : '',
    ].join(' ')
    const label = isStore
      ? `Store for ${pit === 6 ? 'you' : 'opponent'}, ${count} stones`
      : `Pit ${pitLabel(pit)}, ${count} stones${playable ? ', playable' : ''}`
    const shown = Math.min(count, 12)
    return (
      <g
        key={pit}
        className={cls}
        onClick={() => playable && onPit(pit)}
        onKeyDown={(e) => playable && handleKey(e, pit)}
        tabIndex={playable ? 0 : -1}
        role="button"
        aria-label={label}
        aria-disabled={!playable}
      >
        {isStore ? (
          <rect
            x={x - STORE_HALF_W}
            y={y - STORE_HALF_H}
            width={STORE_HALF_W * 2}
            height={STORE_HALF_H * 2}
            rx={40}
            className="pit-shape"
          />
        ) : (
          <ellipse cx={x} cy={y} rx={PIT_RX} ry={PIT_RY} className="pit-shape" />
        )}
        {Array.from({ length: shown }, (_, i) => {
          const { dx, dy } = stoneOffset(i, isStore)
          return (
            <circle
              key={i}
              cx={x + dx}
              cy={y + dy}
              r={STONE_R}
              className="stone"
              fill={STONE_COLORS[(pit * 7 + i * 3) % STONE_COLORS.length]}
            />
          )
        })}
        {isStore && (
          <text x={x} y={y - STORE_HALF_H + 28} className="store-count" textAnchor="middle">
            {count}
          </text>
        )}
        {count > 12 && (
          <text x={x} y={y + 5} className="pit-count" textAnchor="middle">
            {count}
          </text>
        )}
        {!isStore && (
          <text x={x} y={y + PIT_RY + 18} className="pit-label" textAnchor="middle">
            {pitLabel(pit)}
          </text>
        )}
        {chosen && (
          <text x={x} y={y - PIT_RY - 12} className="chosen-marker" textAnchor="middle">
            ▼
          </text>
        )}
      </g>
    )
  }

  const flyStyle = (tx: number, ty: number, delayMs: number, durMs: number): React.CSSProperties =>
    ({
      '--tx': `${tx}px`,
      '--ty': `${ty}px`,
      '--dur': `${durMs}ms`,
      animationDelay: `${delayMs}ms`,
    }) as React.CSSProperties

  // Individual stones flying from the source pit to their target pits.
  const renderSowStones = () => {
    if (!anim || anim.phase !== 'sow' || anim.from < 0) return null
    const src = pitCenter(anim.from)
    const seen = new Map<number, number>()
    const flyMs = Math.round(anim.stepMs * 0.85)
    return anim.path.map((p, i) => {
      const isStore = p === 6 || p === 13
      const idx = anim.base[p] + (seen.get(p) ?? 0)
      seen.set(p, (seen.get(p) ?? 0) + 1)
      const c = pitCenter(p)
      const off = stoneOffset(idx, isStore)
      return (
        <circle
          key={i}
          cx={src.x}
          cy={src.y}
          r={STONE_R}
          className="flying-stone"
          fill={STONE_COLORS[(p * 7 + idx * 3) % STONE_COLORS.length]}
          style={flyStyle(c.x + off.dx - src.x, c.y + off.dy - src.y, i * anim.stepMs, flyMs)}
        />
      )
    })
  }

  // Captured stones flying into the store.
  const renderCaptureStones = () => {
    if (!anim || anim.phase !== 'capture' || !anim.cap) return null
    const capEv = anim.cap
    const storeC = pitCenter(capEv.store)
    const out: React.ReactNode[] = []
    const mk = (fromPit: number, n: number, startIdx: number) => {
      const c = pitCenter(fromPit)
      for (let i = 0; i < n; i++) {
        const idx = startIdx + i
        const off = stoneOffset(idx, true)
        out.push(
          <circle
            key={`${fromPit}-${i}`}
            cx={c.x}
            cy={c.y}
            r={STONE_R}
            className="flying-stone"
            fill={STONE_COLORS[(capEv.store * 7 + idx * 3) % STONE_COLORS.length]}
            style={flyStyle(storeC.x + off.dx - c.x, storeC.y + off.dy - c.y, out.length * 90, 500)}
          />,
        )
      }
    }
    mk(capEv.pit, 1, anim.sowBoard[capEv.store])
    mk(capEv.opposite, Math.min(capEv.count - 1, 11), anim.sowBoard[capEv.store] + 1)
    return out
  }

  // Stones swept into the store at the end of the game.
  const renderSweepStones = () => {
    if (!anim || anim.phase !== 'sweep' || !anim.sweep) return null
    const sw = anim.sweep
    const storeC = pitCenter(sw.store)
    return anim.sweepFlying.map((f, i) => {
      const c = pitCenter(f.from)
      const off = stoneOffset(f.storeIdx, true)
      return (
        <circle
          key={i}
          cx={c.x}
          cy={c.y}
          r={STONE_R}
          className="flying-stone"
          fill={STONE_COLORS[(sw.store * 7 + f.storeIdx * 3) % STONE_COLORS.length]}
          style={flyStyle(storeC.x + off.dx - c.x, storeC.y + off.dy - c.y, i * 90, 500)}
        />
      )
    })
  }

  const pits = [...Array(14).keys()]

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="board"
      role="group"
      aria-label="Mancala board"
      data-turn={state.currentPlayer}
    >
      <defs>
        <linearGradient id="wood" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#8a5a33" />
          <stop offset="0.5" stopColor="#75491f" />
          <stop offset="1" stopColor="#5f3a17" />
        </linearGradient>
        <radialGradient id="pitHole" cx="0.5" cy="0.4" r="0.75">
          <stop offset="0" stopColor="#3a2410" />
          <stop offset="0.8" stopColor="#4a2f16" />
          <stop offset="1" stopColor="#5d3d1d" />
        </radialGradient>
      </defs>

      <rect x={8} y={8} width={W - 16} height={H - 16} rx={36} fill="url(#wood)" className="board-bg" />

      {pits.map(renderPit)}

      {renderSowStones()}
      {renderCaptureStones()}
      {renderSweepStones()}

      {extraTurn && (
        <text x={W / 2} y={H / 2 + 8} className="extra-turn-banner" textAnchor="middle">
          Extra turn!
        </text>
      )}

      {legalPits.length > 0 && (
        <text x={W / 2} y={H - 12} className="turn-hint" textAnchor="middle">
          {ctl.mode === 'ai'
            ? 'Your move — pick a glowing pit (1–6, or use Tab + Enter)'
            : `Player ${state.currentPlayer + 1}'s move — pick a glowing pit (Tab + Enter)`}
        </text>
      )}
    </svg>
  )
}
