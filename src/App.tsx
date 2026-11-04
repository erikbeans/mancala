import { useState } from 'react'
import Menu from './ui/components/Menu'
import RulesModal from './ui/components/RulesModal'
import GameScreen from './ui/GameScreen'
import { useGame, type Mode } from './ui/hooks/useGame'
import type { Difficulty } from './engine/ai'

type Screen = 'menu' | 'game'

export default function App() {
  const [screen, setScreen] = useState<Screen>('menu')
  const [showRules, setShowRules] = useState(false)
  const [config, setConfig] = useState<{ mode: Mode; difficulty: Difficulty; seeds: 4 | 6 }>({
    mode: 'ai',
    difficulty: 'medium',
    seeds: 6,
  })
  const ctl = useGame(config.mode, config.difficulty, config.seeds)

  return (
    <main className="app">
      {screen === 'menu' ? (
        <Menu
          onStart={(mode, difficulty, seeds) => {
            setConfig({ mode, difficulty, seeds })
            setScreen('game')
            ctl.restart()
          }}
          onRules={() => setShowRules(true)}
        />
      ) : (
        <GameScreen
          ctl={ctl}
          onExit={() => setScreen('menu')}
          onRestart={() => ctl.restart()}
        />
      )}
      {showRules && <RulesModal onClose={() => setShowRules(false)} />}
    </main>
  )
}
