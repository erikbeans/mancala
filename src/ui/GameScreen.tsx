import Board from './components/Board'
import MoveLog from './components/MoveLog'
import RulesModal from './components/RulesModal'
import ScoreBar from './components/ScoreBar'
import { useState } from 'react'
import type { Controller } from './hooks/useGame'

interface GameScreenProps {
  ctl: Controller
  onExit: () => void
  onRestart: () => void
}

export default function GameScreen({ ctl, onExit, onRestart }: GameScreenProps) {
  const [showRules, setShowRules] = useState(false)
  const { state } = ctl

  return (
    <div className="game-screen">
      <header className="game-header">
        <button onClick={onExit}>← Menu</button>
        <h1>Mancala</h1>
        <div className="game-actions">
          <button onClick={onRestart}>New game</button>
          <button onClick={ctl.undo} disabled={!ctl.canUndo}>
            Undo
          </button>
          <button onClick={() => setShowRules(true)}>Rules</button>
        </div>
      </header>
      <ScoreBar ctl={ctl} />
      <div className="game-main">
        <Board ctl={ctl} onPit={ctl.playPit} />
        <MoveLog ctl={ctl} />
      </div>
      {state.status === 'finished' && (
        <div className="game-over-banner">
          <p>
            {state.winner === 'draw'
              ? "It's a draw!"
              : state.winner === 0
                ? ctl.mode === 'ai'
                  ? 'You win! 🎉'
                  : 'South wins! 🎉'
                : ctl.mode === 'ai'
                  ? 'The computer wins.'
                  : 'North wins! 🎉'}{' '}
            Final score: {state.board[6]} – {state.board[13]}
          </p>
          <button className="primary" onClick={onRestart}>
            Play again
          </button>
        </div>
      )}
      {showRules && <RulesModal onClose={() => setShowRules(false)} />}
    </div>
  )
}
