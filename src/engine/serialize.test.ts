import { describe, expect, it } from 'vitest'
import { applyMove, createGame } from './rules'
import { deserializeState, serializeState } from './serialize'

describe('serialize/deserialize', () => {
  it('round-trips the initial state', () => {
    const s = createGame(6)
    expect(deserializeState(serializeState(s))).toEqual(s)
  })

  it('round-trips a mid-game state after moves', () => {
    let { state } = applyMove(createGame(6), 0)
    ;({ state } = applyMove(state, 1))
    ;({ state } = applyMove(state, 8))
    const str = serializeState(state)
    expect(deserializeState(str)).toEqual(state)
  })

  it('rejects malformed input', () => {
    expect(() => deserializeState('1,2,3|0|playing|-|0')).toThrow()
    expect(() => deserializeState('a,b|0|playing|-|0')).toThrow()
  })
})
