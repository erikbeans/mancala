import { useMemo } from 'react'
import { legalMoves } from '../../engine/rules'
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
const SOUTH_Y = 330
const NORTH_Y = 110

export function pitCenter(index: number): { x: number; y: number } {
  if (index <= 5) return { x: 200 + index * 105, y: SOUTH_Y }
  if (index === 6) return { x: 912, y: 220 }
  if (index <= 12) return { x: 200 + (12 - index) * 105, y: NORTH_Y }
  return { x: 62, y: 220 } // 13
}

const STONE_COLORS = ['#e8c47a', '#d9a45b', '#c98a4b', '#b5763f', '#e5d3a1', '#cf9455']

function stoneOffset(n: number, i: number): { dx: number; dy: number } {
  // Deterministic pseudo-random scatter inside the pit.
  const cols = 4
  const col = i % cols
  const row = Math.floor(i / cols)
  const jitter = ((n * 31 + i * 17) % 13) - 6
  return { dx: (col - 1.5) * 26 + jitter * 0.6, dy: (row - 1) * 22 + jitter * 0.4 }
}

interface BoardProps {
  ctl: Controller
  onPit: (pit: number) => void
}

export default function Board({ ctl, onPit }: BoardProps) {
  const { state, lastEvents, legalPits, isHumanTurn } = ctl

  const sow = lastEvents.find((e) => e.type === 'sow')
  const capture = lastEvents.find((e) => e.type === 'capture')
  const extraTurn = lastEvents.some((e) => e.type === 'extra-turn')

  const sowPath = useMemo(() => {
    if (sow?.type !== 'sow') return []
    return sow.path.map((p) => ({ pit: p, ...pitCenter(p) }))
  }, [sow])

  const handleKey = (e: React.KeyboardEvent, pit: number) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onPit(pit)
    }
  }

  const renderPit = (pit: number) => {
    const { x, y } = pitCenter(pit)
    const count = state.board[pit]
    const playable = legalPits.includes(pit)
    const isStore = pit === 6 || pit === 13
    const captured = capture?.type === 'capture' && (capture.pit === pit || capture.opposite === pit)
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
          <rect x={x - 46} y={y - 135} width={92} height={270} rx={40} className="pit-shape" />
        ) : (
          <ellipse cx={x} cy={y} rx={PIT_RX} ry={PIT_RY} className="pit-shape" />
        )}
        {Array.from({ length: shown }, (_, i) => {
          const { dx, dy } = stoneOffset(count, i)
          return (
            <circle
              key={i}
              cx={x + dx}
              cy={y + dy}
              r={11}
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

      {/* Sow animation: a stone traveling along the path of the last move. */}
      {sowPath.map((p, i) => (
        <circle
          key={`${state.moveCount}-${p.pit}-${i}`}
          cx={p.x}
          cy={p.y}
          r={10}
          className="sow-dot"
          style={{ animationDelay: `${i * 110}ms` }}
          fill="#f4e3b2"
        />
      ))}

      {extraTurn && (
        <text x={W / 2} y={H / 2 + 8} className="extra-turn-banner" textAnchor="middle">
          Extra turn!
        </text>
      )}

      {isHumanTurn && legalMoves(state).length > 0 && (
        <text x={W / 2} y={H - 12} className="turn-hint" textAnchor="middle">
          Your move — pick a glowing pit (1–6, or use Tab + Enter)
        </text>
      )}
    </svg>
  )
}
