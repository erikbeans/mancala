import { useEffect, useRef, useState } from 'react'
import { pitsOf } from '../../engine/rules'
import type { Controller } from '../hooks/useGame'

/**
 * Board geometry (SVG viewBox 0 0 1000 440).
 * South (player 0) pits 0-5 run left→right on the bottom row, store 6 on the
 * right, North (player 1) pits 7-12 run right→left on the top row, store 13
 * on the left — matching counter-clockwise sowing.
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
const STEP_MS = 170

interface BoardProps {
  ctl: Controller
  onPit: (pit: number) => void
}

export default function Board({ ctl, onPit }: BoardProps) {
  const { state, lastEvents, legalPits, pending } = ctl
  const [anim, setAnim] = useState<{ board: number[]; step: number; path: number[] } | null>(null)
  const ctlRef = useRef(ctl)
  ctlRef.current = ctl
  const [reduceMotion] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches)

  // Animate a staged move: empty the source pit, drop one stone per path pit,
  // then resolve capture / endgame sweep, then commit the real state.
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
    const board = [...pending.base.board]
    if (from >= 0) board[from] = 0
    setAnim({ board: [...board], step: -1, path })
    void (async () => {
      for (let i = 0; i < path.length; i++) {
        await sleep(STEP_MS)
        if (cancelled) return
        board[path[i]] += 1
        setAnim({ board: [...board], step: i, path })
      }
      const cap = pending.events.find((e) => e.type === 'capture')
      if (cap && cap.type === 'capture') {
        await sleep(STEP_MS * 1.5)
        if (cancelled) return
        board[cap.pit] = 0
        board[cap.opposite] = 0
        board[cap.store] += cap.count
        setAnim({ board: [...board], step: path.length, path })
      }
      const sweep = pending.events.find((e) => e.type === 'sweep')
      if (sweep && sweep.type === 'sweep') {
        await sleep(STEP_MS * 1.5)
        if (cancelled) return
        for (const pit of pitsOf(sweep.side)) board[pit] = 0
        board[sweep.store] += sweep.count
        setAnim({ board: [...board], step: path.length + 1, path })
      }
      await sleep(STEP_MS * 2.5)
      if (cancelled) return
      setAnim(null)
      ctlRef.current.commitMove()
    })()
    return () => {
      cancelled = true
    }
  }, [pending, reduceMotion])

  const board = anim ? anim.board : state.board

  const pendingCapture = pending?.events.find((e) => e.type === 'capture')
  const lastCapture = lastEvents.find((e) => e.type === 'capture')
  const cap = anim && pendingCapture ? pendingCapture : lastCapture
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
    const count = board[pit]
    const playable = legalPits.includes(pit)
    const isStore = pit === 6 || pit === 13
    const captured = capturedPits.has(pit)
    const cls = [
      'pit',
      playable ? 'playable' : '',
      isStore ? 'store' : '',
      captured ? 'captured' : '',
    ].join(' ')
    const label = isStore
      ? `Store for ${pit === 6 ? 'you' : 'opponent'}, ${count} stones`
      : `Pit ${pit + 1}, ${count} stones${playable ? ', playable' : ''}`
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
          <rect x={x - STORE_HALF_W} y={y - STORE_HALF_H} width={STORE_HALF_W * 2} height={STORE_HALF_H * 2} rx={40} className="pit-shape" />
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
              fill={STONE_COLORS[(pit * 7 + i * 3 + count) % STONE_COLORS.length]}
            />
          )
        })}
        {count > 12 && (
          <text x={x} y={y + 5} className="pit-count" textAnchor="middle">
            {count}
          </text>
        )}
        {!isStore && (
          <text x={x} y={y + PIT_RY + 18} className="pit-label" textAnchor="middle">
            {pit + 1}
          </text>
        )}
      </g>
    )
  }

  const pits = [...Array(14).keys()]
  const liveStone = anim && anim.step >= 0 && anim.step < anim.path.length ? anim.path[anim.step] : -1

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

      {/* The stone currently traveling during the sow animation. */}
      {liveStone >= 0 && (() => {
        const c = pitCenter(liveStone)
        return (
          <circle
            key={anim!.step}
            cx={c.x}
            cy={c.y}
            r={STONE_R}
            className="sow-dot-live"
            fill="#f4e3b2"
          />
        )
      })()}

      {extraTurn && (
        <text x={W / 2} y={H / 2 + 8} className="extra-turn-banner" textAnchor="middle">
          Extra turn!
        </text>
      )}

      {legalPits.length > 0 && (
        <text x={W / 2} y={H - 12} className="turn-hint" textAnchor="middle">
          Your move — pick a glowing pit (1–6, or use Tab + Enter)
        </text>
      )}
    </svg>
  )
}
