import type { Player } from '../../engine/types'
import type { Controller } from '../hooks/useGame'
import { pitLabel } from '../labels'

export default function ScoreBar({ ctl }: { ctl: Controller }) {
  const { state, thinking, mode, difficulty, pending, legalPits } = ctl
  const name = (p: Player): string =>
    ctl.nameOf?.(p) ?? (mode === 'ai' ? (p === 0 ? 'You' : 'Computer') : `Player ${p + 1}`)
  const possessive = (p: Player): string => {
    const n = name(p)
    return n === 'You' ? 'Your' : `${n}'s`
  }

  let turnName: string
  if (pending) {
    turnName = `${name(pending.base.currentPlayer)} chose pit ${pitLabel(pending.pit)}…`
  } else if (state.status === 'finished') {
    turnName =
      state.winner === 'draw'
        ? "It's a draw!"
        : state.winner !== null
          ? `${name(state.winner)} wins! 🎉`
          : ''
  } else if (mode === 'ai') {
    turnName = state.currentPlayer === 0 ? 'Your turn' : 'Computer is thinking…'
  } else if (mode === 'online') {
    // legalPits is non-empty only on my own turn (spectators never have any).
    turnName = legalPits.length > 0 ? 'Your turn' : `${name(state.currentPlayer)}'s turn`
  } else {
    turnName = `${name(state.currentPlayer)}'s turn`
  }

  return (
    <div className="scorebar">
      <div className={`score ${state.currentPlayer === 0 && state.status === 'playing' && !pending ? 'active' : ''}`}>
        <span className="score-name">{name(0)}</span>
        <span
          className="score-value"
          title="Score — stones in this store"
          aria-label={`${possessive(0)} score: ${state.board[6]} stones in store`}
        >
          {state.board[6]}
        </span>
      </div>
      <div className="turn-indicator">
        <span className={thinking ? 'thinking' : ''}>{turnName}</span>
        {mode === 'ai' && <span className="difficulty-badge">{difficulty}</span>}
      </div>
      <div className={`score ${state.currentPlayer === 1 && state.status === 'playing' && !pending ? 'active' : ''}`}>
        <span className="score-name">{name(1)}</span>
        <span
          className="score-value"
          title="Score — stones in this store"
          aria-label={`${possessive(1)} score: ${state.board[13]} stones in store`}
        >
          {state.board[13]}
        </span>
      </div>
    </div>
  )
}
