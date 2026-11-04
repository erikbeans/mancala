import Board from './components/Board'
import MoveLog from './components/MoveLog'
import RulesModal from './components/RulesModal'
import ScoreBar from './components/ScoreBar'
import { useState } from 'react'
import { useGame, type Mode } from './hooks/useGame'
import type { Difficulty } from '../engine/ai'

interface GameScreenProps {
  mode: Mode
  difficulty: Difficulty
  stones: 4 | 6
  onExit: () => void
}

export default function GameScreen({ mode, difficulty, stones, onExit }: GameScreenProps) {
  // Remounting (via key in App) resets the game when the config changes.
  const ctl = useGame(mode, difficulty, stones)
  const onRestart = ctl.restart
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
                  : 'Player 1 wins! 🎉'
                : ctl.mode === 'ai'
                  ? 'The computer wins.'
                  : 'Player 2 wins! 🎉'}{' '}
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
