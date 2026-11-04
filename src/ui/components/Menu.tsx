import type { Difficulty } from '../../engine/ai'
import type { Mode } from '../hooks/useGame'

interface MenuProps {
  onStart: (mode: Mode, difficulty: Difficulty, seeds: 4 | 6) => void
  onRules: () => void
}

export default function Menu({ onStart, onRules }: MenuProps) {
  return (
    <div className="menu">
      <h1 className="title">Mancala</h1>
      <p className="subtitle">The ancient game of count and capture — Kalah rules</p>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          const f = new FormData(e.currentTarget)
          onStart(
            f.get('mode') as Mode,
            f.get('difficulty') as Difficulty,
            Number(f.get('seeds')) as 4 | 6,
          )
        }}
      >
        <fieldset>
          <legend>Mode</legend>
          <label>
            <input type="radio" name="mode" value="ai" defaultChecked /> Play vs computer
          </label>
          <label>
            <input type="radio" name="mode" value="hotseat" /> Two players (same device)
          </label>
        </fieldset>
        <fieldset>
          <legend>Difficulty (vs computer)</legend>
          <label>
            <input type="radio" name="difficulty" value="easy" /> Easy
          </label>
          <label>
            <input type="radio" name="difficulty" value="medium" defaultChecked /> Medium
          </label>
          <label>
            <input type="radio" name="difficulty" value="hard" /> Hard
          </label>
        </fieldset>
        <fieldset>
          <legend>Variant</legend>
          <label>
            <input type="radio" name="seeds" value="6" defaultChecked /> Kalah(6,6) — 6 seeds
          </label>
          <label>
            <input type="radio" name="seeds" value="4" /> Kalah(6,4) — 4 seeds
          </label>
        </fieldset>
        <div className="menu-actions">
          <button type="submit" className="primary">
            Start game
          </button>
          <button type="button" onClick={onRules}>
            How to play
          </button>
        </div>
      </form>
    </div>
  )
}
