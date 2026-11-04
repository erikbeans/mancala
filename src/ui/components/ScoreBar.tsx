import type { Controller } from '../hooks/useGame'

export default function ScoreBar({ ctl }: { ctl: Controller }) {
  const { state, thinking, mode, difficulty } = ctl
  const you = state.board[6]
  const opp = state.board[13]
  const turnName =
    state.status === 'finished'
      ? state.winner === 'draw'
        ? "It's a draw!"
        : state.winner === 0
          ? mode === 'ai'
            ? 'You win! 🎉'
            : 'South wins! 🎉'
          : mode === 'ai'
            ? 'Computer wins'
            : 'North wins! 🎉'
      : mode === 'ai'
        ? state.currentPlayer === 0
          ? 'Your turn'
          : 'Computer is thinking…'
        : state.currentPlayer === 0
          ? "South's turn"
          : "North's turn"

  return (
    <div className="scorebar">
      <div className={`score ${state.currentPlayer === 0 && state.status === 'playing' ? 'active' : ''}`}>
        <span className="score-name">{mode === 'ai' ? 'You (South)' : 'South'}</span>
        <span className="score-value">{you}</span>
      </div>
      <div className="turn-indicator">
        <span className={thinking ? 'thinking' : ''}>{turnName}</span>
        {mode === 'ai' && <span className="difficulty-badge">{difficulty}</span>}
      </div>
      <div className={`score ${state.currentPlayer === 1 && state.status === 'playing' ? 'active' : ''}`}>
        <span className="score-name">{mode === 'ai' ? 'Computer (North)' : 'North'}</span>
        <span className="score-value">{opp}</span>
      </div>
    </div>
  )
}
