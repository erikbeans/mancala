import Board from './components/Board'
import MoveLog from './components/MoveLog'
import RulesModal from './components/RulesModal'
import ScoreBar from './components/ScoreBar'
import { useRef, useState } from 'react'
import { useGame, type Controller, type Mode } from './hooks/useGame'
import { useOnlineGame, type OnlineController } from './hooks/useOnlineGame'
import type { Difficulty } from '../engine/ai'

interface GameScreenProps {
  mode: Mode
  difficulty: Difficulty
  stones: 4 | 6
  room?: string
  onExit: () => void
}

export default function GameScreen({ mode, difficulty, stones, room, onExit }: GameScreenProps) {
  // Remounting (via key in App) resets the game when the config changes.
  if (mode === 'online' && room) {
    return <OnlineGameScreen key={room} room={room} stones={stones} onExit={onExit} />
  }
  return <LocalGameScreen key={`${mode}-${difficulty}-${stones}`} mode={mode} difficulty={difficulty} stones={stones} onExit={onExit} />
}

function LocalGameScreen({
  mode,
  difficulty,
  stones,
  onExit,
}: {
  mode: Mode
  difficulty: Difficulty
  stones: 4 | 6
  onExit: () => void
}) {
  const ctl = useGame(mode, difficulty, stones)
  return <GameView ctl={ctl} onExit={onExit} />
}

function OnlineGameScreen({ room, stones, onExit }: { room: string; stones: 4 | 6; onExit: () => void }) {
  const ctl = useOnlineGame(room, stones)
  return <GameView ctl={ctl} onExit={onExit} online={ctl} />
}

/** Inline name editor: commit on blur/Enter, revert on Escape. */
function EditableName({ name, onCommit }: { name: string; onCommit: (v: string) => void }) {
  const [draft, setDraft] = useState(name)
  const lastName = useRef(name)
  if (lastName.current !== name) {
    // Server-side name changed (rename echo) — resync the draft.
    lastName.current = name
    setDraft(name)
  }
  const commit = () => {
    const cleaned = draft.trim().slice(0, 24)
    if (cleaned && cleaned !== name) onCommit(cleaned)
    else setDraft(name)
  }
  return (
    <input
      className="name-input"
      value={draft}
      maxLength={24}
      aria-label="Your name (edit any time)"
      title="Click to edit your name"
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault()
          commit()
          ;(e.target as HTMLInputElement).blur()
        } else if (e.key === 'Escape') {
          setDraft(name)
          ;(e.target as HTMLInputElement).blur()
        }
      }}
    />
  )
}

function GameView({ ctl, onExit, online }: { ctl: Controller; onExit: () => void; online?: OnlineController }) {
  const [showRules, setShowRules] = useState(false)
  const [copied, setCopied] = useState(false)
  const { state } = ctl
  const isOnline = online !== undefined

  const copyInvite = async () => {
    try {
      await navigator.clipboard.writeText(online!.inviteUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      window.prompt('Copy this invite link:', online!.inviteUrl)
    }
  }

  const winnerText = () => {
    if (state.winner === 'draw') return "It's a draw!"
    if (state.winner === null) return ''
    if (isOnline) {
      const seat = online!.seat
      return state.winner === seat ? 'You win! 🎉' : `${online!.opponentName} wins.`
    }
    return state.winner === 0
      ? ctl.mode === 'ai'
        ? 'You win! 🎉'
        : 'Player 1 wins! 🎉'
      : ctl.mode === 'ai'
        ? 'The computer wins.'
        : 'Player 2 wins! 🎉'
  }

  return (
    <div className="game-screen">
      <header className="game-header">
        <button onClick={onExit}>← Menu</button>
        <h1>Mancala</h1>
        <div className="game-actions">
          {isOnline ? (
            <button onClick={online!.sendRematch} disabled={online!.rematchRequested}>
              {online!.rematchRequested ? 'Rematch requested…' : 'Rematch'}
            </button>
          ) : (
            <button onClick={ctl.restart}>New game</button>
          )}
          {!isOnline && (
            <button onClick={ctl.undo} disabled={!ctl.canUndo}>
              Undo
            </button>
          )}
          <button onClick={() => setShowRules(true)}>Rules</button>
        </div>
      </header>
      {isOnline && (
        <div className="online-bar">
          <span className={`conn-dot ${online!.connected ? 'on' : 'off'}`} aria-hidden="true" />
          <span className="online-status">{online!.connected ? 'Connected' : 'Reconnecting…'}</span>
          <span className="room-code" title="Room code">
            Room <strong>{online!.room}</strong>
          </span>
          <button onClick={copyInvite}>{copied ? 'Copied!' : 'Copy invite link'}</button>
          <span className="online-players">
            {online!.players.map((p) => (
              <span key={p.seat} className={`online-player ${p.connected ? '' : 'offline'}`}>
                {p.seat === online!.seat ? (
                  <EditableName name={p.name} onCommit={(v) => online!.rename(v)} />
                ) : (
                  p.name
                )}
                {p.seat === online!.seat ? ' (you)' : ''}
                {!p.connected ? ' — disconnected' : ''}
              </span>
            ))}
            {online!.seat === null && <span className="online-player">You are spectating</span>}
            {online!.spectators > 0 && <span className="muted">{online!.spectators} spectator(s)</span>}
          </span>
        </div>
      )}
      <ScoreBar ctl={ctl} />
      <div className="game-main">
        <Board ctl={ctl} onPit={ctl.playPit} />
        <MoveLog ctl={ctl} />
      </div>
      {state.status === 'finished' && (
        <div className="game-over-banner">
          <p>{winnerText()}</p>
          <div
            className="final-score"
            aria-label={`Final score: ${state.board[6]} to ${state.board[13]}`}
          >
            <span>{state.board[6]}</span>
            <span className="final-score-dash">–</span>
            <span>{state.board[13]}</span>
          </div>
          {isOnline ? (
            <button className="primary" onClick={online!.sendRematch} disabled={online!.rematchRequested}>
              {online!.rematchRequested ? 'Waiting for opponent to accept…' : 'Rematch (seats swap)'}
            </button>
          ) : (
            <button className="primary" onClick={ctl.restart}>
              Play again
            </button>
          )}
        </div>
      )}
      {isOnline && online!.notices.length > 0 && (
        <div className="notices" aria-live="polite">
          {online!.notices.map((n, i) => (
            <button key={i} className="notice" onClick={() => online!.dismissNotice(i)}>
              {n} ✕
            </button>
          ))}
        </div>
      )}
      {showRules && <RulesModal onClose={() => setShowRules(false)} />}
    </div>
  )
}
