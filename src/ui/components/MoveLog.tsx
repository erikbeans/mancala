import { useEffect, useRef } from 'react'
import type { Controller } from '../hooks/useGame'
import { pitLabel } from '../labels'

export default function MoveLog({ ctl }: { ctl: Controller }) {
  const { moves, mode } = ctl
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    ref.current?.scrollTo({ top: ref.current.scrollHeight })
  }, [moves.length])

  const name = (p: 0 | 1): string =>
    ctl.nameOf?.(p) ?? (mode === 'ai' ? (p === 0 ? 'You' : 'AI') : `Player ${p + 1}`)

  return (
    <div className="movelog" ref={ref} aria-label="Move history">
      <h2>Moves</h2>
      {moves.length === 0 && <p className="muted">No moves yet.</p>}
      <ol>
        {moves.map((m, i) => (
          <li key={i}>
            {name(m.player)}
            {' → pit '}
            {pitLabel(m.pit)}
          </li>
        ))}
      </ol>
    </div>
  )
}
