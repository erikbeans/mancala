import { useRef, useState } from 'react'
import type { Difficulty } from '../../engine/ai'
import type { Config } from '../../App'
import { generateRoomCode } from '../../online/protocol'
import { savePlayerName, storedPlayerName } from '../../online/client'

const ROOM_RE = /^[A-Z2-9]{6}$/

interface MenuProps {
  onStart: (config: Config) => void
  onRules: () => void
}

export default function Menu({ onStart, onRules }: MenuProps) {
  const [mode, setMode] = useState<'ai' | 'hotseat' | 'online'>('ai')
  const [code, setCode] = useState('')
  const [name, setName] = useState(storedPlayerName())
  // FormData(form) doesn't include the submitter button, so track it via clicks.
  const actionRef = useRef<'start' | 'create' | 'join'>('start')

  const start = (form: FormData) => {
    const action = actionRef.current
    const difficulty = (form.get('difficulty') as Difficulty) ?? 'medium'
    const stones = Number(form.get('stones')) as 4 | 6
    if (mode === 'online') {
      if (action === 'create') {
        onStart({ mode: 'online', difficulty, stones, room: generateRoomCode() })
      } else {
        const room = code.toUpperCase().trim()
        if (!ROOM_RE.test(room)) return
        onStart({ mode: 'online', difficulty, stones, room })
      }
      return
    }
    onStart({ mode, difficulty, stones })
  }

  return (
    <div className="menu">
      <h1 className="title">Mancala</h1>
      <p className="subtitle">The ancient game of count and capture</p>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          start(new FormData(e.currentTarget))
        }}
      >
        <fieldset>
          <legend>Mode</legend>
          <label>
            <input type="radio" name="mode" value="ai" checked={mode === 'ai'} onChange={() => setMode('ai')} /> Play
            vs computer
          </label>
          <label>
            <input
              type="radio"
              name="mode"
              value="hotseat"
              checked={mode === 'hotseat'}
              onChange={() => setMode('hotseat')}
            />{' '}
            Two players (same device)
          </label>
          <label>
            <input
              type="radio"
              name="mode"
              value="online"
              checked={mode === 'online'}
              onChange={() => setMode('online')}
            />{' '}
            Play online (create or join a room)
          </label>
        </fieldset>
        {mode === 'online' && (
          <fieldset>
            <legend>Online</legend>
            <label>
              Your name{' '}
              <input
                name="name"
                maxLength={24}
                value={name}
                placeholder="Player"
                onChange={(e) => {
                  setName(e.target.value)
                  savePlayerName(e.target.value)
                }}
              />
            </label>
            <div className="menu-actions">
              <button
                type="submit"
                className="primary"
                onClick={() => {
                  actionRef.current = 'create'
                }}
              >
                Create room
              </button>
            </div>
            <div className="join-row">
              <input
                name="code"
                maxLength={6}
                placeholder="ROOM CODE"
                value={code}
                onFocus={() => {
                  actionRef.current = 'join'
                }}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                aria-label="Room code"
              />
              <button
                type="submit"
                disabled={!ROOM_RE.test(code.trim())}
                onClick={() => {
                  actionRef.current = 'join'
                }}
              >
                Join room
              </button>
            </div>
          </fieldset>
        )}
        {mode !== 'online' && (
          <>
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
          </>
        )}
        <fieldset>
          <legend>Stones per pit</legend>
          <label>
            <input type="radio" name="stones" value="6" defaultChecked /> 6 stones
          </label>
          <label>
            <input type="radio" name="stones" value="4" /> 4 stones
          </label>
        </fieldset>
        {mode !== 'online' && (
          <div className="menu-actions">
            <button
              type="submit"
              className="primary"
              onClick={() => {
                actionRef.current = 'start'
              }}
            >
              Start game
            </button>
            <button type="button" onClick={onRules}>
              How to play
            </button>
          </div>
        )}
        {mode === 'online' && (
          <div className="menu-actions">
            <button type="button" onClick={onRules}>
              How to play
            </button>
          </div>
        )}
      </form>
    </div>
  )
}
