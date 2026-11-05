import { useState } from 'react'
import Menu from './ui/components/Menu'
import RulesModal from './ui/components/RulesModal'
import GameScreen from './ui/GameScreen'
import type { Mode } from './ui/hooks/useGame'
import type { Difficulty } from './engine/ai'

type Screen = 'menu' | 'game'

export interface Config {
  mode: Mode
  difficulty: Difficulty
  stones: 4 | 6
  /** Online mode only: the 6-char room code. */
  room?: string
}

const ROOM_RE = /^[A-Z2-9]{6}$/

/** Invite links look like /?room=ABC123 — they pre-fill the online join form. */
function roomFromLocation(): string | null {
  const raw = new URLSearchParams(window.location.search).get('room')?.toUpperCase() ?? ''
  return ROOM_RE.test(raw) ? raw : null
}

export default function App() {
  // An invite link opens the menu with online mode + room code pre-filled, so
  // the invited player can set their name before joining.
  const inviteCode = roomFromLocation()
  const [screen, setScreen] = useState<Screen>('menu')
  const [showRules, setShowRules] = useState(false)
  const [config, setConfig] = useState<Config>(() => ({
    mode: 'ai',
    difficulty: 'medium',
    stones: 6,
  }))

  return (
    <main className="app">
      {screen === 'menu' ? (
        <Menu
          initialMode={inviteCode ? 'online' : 'ai'}
          initialCode={inviteCode ?? ''}
          onStart={(cfg) => {
            setConfig(cfg)
            setScreen('game')
          }}
          onRules={() => setShowRules(true)}
        />
      ) : (
        <GameScreen
          key={`${config.mode}-${config.difficulty}-${config.stones}-${config.room ?? ''}`}
          mode={config.mode}
          difficulty={config.difficulty}
          stones={config.stones}
          room={config.room}
          onExit={() => setScreen('menu')}
        />
      )}
      {showRules && <RulesModal onClose={() => setShowRules(false)} />}
    </main>
  )
}
