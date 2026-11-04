import { bestMove, type Difficulty } from './engine/ai'
import { deserializeState } from './engine/serialize'

interface AiRequest {
  state: string // serialized GameState
  difficulty: Difficulty
  jitter?: number
}

self.addEventListener('message', (e: MessageEvent<AiRequest>) => {
  const { state, difficulty, jitter } = e.data
  const move = bestMove(deserializeState(state), difficulty, jitter)
  ;(self as unknown as Worker).postMessage({ move })
})
