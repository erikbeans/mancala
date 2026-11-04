import { useEffect, useRef } from 'react'
import type { Controller } from '../hooks/useGame'

export default function MoveLog({ ctl }: { ctl: Controller }) {
  const { moves, mode } = ctl
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    ref.current?.scrollTo({ top: ref.current.scrollHeight })
  }, [moves.length])

  return (
    <div className="movelog" ref={ref} aria-label="Move history">
      <h2>Moves</h2>
      {moves.length === 0 && <p className="muted">No moves yet.</p>}
      <ol>
        {moves.map((m, i) => (
          <li key={i}>
            {mode === 'ai'
              ? m.player === 0
                ? 'You'
                : 'AI'
              : m.player === 0
                ? 'Player 1'
                : 'Player 2'}
            {' → pit '}
            {m.pit + 1}
          </li>
        ))}
      </ol>
    </div>
  )
}
