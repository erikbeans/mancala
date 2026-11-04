import { useState } from 'react'
import Menu from './ui/components/Menu'
import RulesModal from './ui/components/RulesModal'
import GameScreen from './ui/GameScreen'
import type { Mode } from './ui/hooks/useGame'
import type { Difficulty } from './engine/ai'

type Screen = 'menu' | 'game'

interface Config {
  mode: Mode
  difficulty: Difficulty
  stones: 4 | 6
}

export default function App() {
  const [screen, setScreen] = useState<Screen>('menu')
  const [showRules, setShowRules] = useState(false)
  const [config, setConfig] = useState<Config>({
    mode: 'ai',
    difficulty: 'medium',
    stones: 6,
  })

  return (
    <main className="app">
      {screen === 'menu' ? (
        <Menu
          onStart={(mode, difficulty, stones) => {
            setConfig({ mode, difficulty, stones })
            setScreen('game')
          }}
          onRules={() => setShowRules(true)}
        />
      ) : (
        <GameScreen
          key={`${config.mode}-${config.difficulty}-${config.stones}`}
          mode={config.mode}
          difficulty={config.difficulty}
          stones={config.stones}
          onExit={() => setScreen('menu')}
        />
      )}
      {showRules && <RulesModal onClose={() => setShowRules(false)} />}
    </main>
  )
}
