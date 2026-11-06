import { describe, expect, it } from 'vitest'
import { sfx } from './sound'

describe('sound module', () => {
  it('no-ops safely without Web Audio / DOM (node env)', () => {
    expect(() => {
      sfx.select()
      sfx.stone(0)
      sfx.stone(13)
      sfx.capture()
      sfx.sweep()
      sfx.turn()
      sfx.win()
      sfx.lose()
    }).not.toThrow()
  })

  it('toggles and reports the enabled state', () => {
    const before = sfx.isEnabled()
    expect(sfx.toggle()).toBe(!before)
    expect(sfx.isEnabled()).toBe(!before)
    sfx.setEnabled(before)
    expect(sfx.isEnabled()).toBe(before)
  })
})
