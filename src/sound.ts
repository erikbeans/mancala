/**
 * Tiny Web Audio synth for game feedback — no audio files needed.
 * Everything no-ops safely when sound is muted, when Web Audio is
 * unavailable (SSR/tests), or before the first user gesture (the
 * AudioContext is created lazily and resumed on the next call).
 */

const KEY = 'mancala:sound'

let enabled = true
try {
  if (typeof localStorage !== 'undefined' && localStorage.getItem(KEY) === 'off') enabled = false
} catch {
  // storage unavailable — default to on
}

let ctx: AudioContext | null = null

function ac(): AudioContext | null {
  if (!enabled) return null
  if (typeof window === 'undefined') return null
  const w = window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext }
  const Ctor = w.AudioContext ?? w.webkitAudioContext
  if (!Ctor) return null
  if (!ctx) ctx = new Ctor()
  if (ctx.state === 'suspended') void ctx.resume()
  return ctx
}

interface ToneOpts {
  freq: number
  dur: number
  at?: number
  type?: OscillatorType
  gain?: number
  slideTo?: number
}

function tone({ freq, dur, at = 0, type = 'sine', gain = 0.12, slideTo }: ToneOpts): void {
  const c = ac()
  if (!c) return
  const t0 = c.currentTime + at
  const osc = c.createOscillator()
  const g = c.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(freq, t0)
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(30, slideTo), t0 + dur)
  g.gain.setValueAtTime(0.0001, t0)
  g.gain.linearRampToValueAtTime(gain, t0 + 0.008)
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
  osc.connect(g)
  g.connect(c.destination)
  osc.start(t0)
  osc.stop(t0 + dur + 0.05)
}

/** Short filtered noise burst (clicks, sweeps). */
function noise({ dur, at = 0, gain = 0.08, from = 1200, to = 1200 }: { dur: number; at?: number; gain?: number; from?: number; to?: number }): void {
  const c = ac()
  if (!c) return
  const t0 = c.currentTime + at
  const len = Math.max(1, Math.floor(c.sampleRate * dur))
  const buf = c.createBuffer(1, len, c.sampleRate)
  const data = buf.getChannelData(0)
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1
  const src = c.createBufferSource()
  src.buffer = buf
  const filter = c.createBiquadFilter()
  filter.type = 'bandpass'
  filter.Q.value = 1.2
  filter.frequency.setValueAtTime(from, t0)
  filter.frequency.exponentialRampToValueAtTime(Math.max(40, to), t0 + dur)
  const g = c.createGain()
  g.gain.setValueAtTime(0.0001, t0)
  g.gain.linearRampToValueAtTime(gain, t0 + 0.01)
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
  src.connect(filter)
  filter.connect(g)
  g.connect(c.destination)
  src.start(t0)
  src.stop(t0 + dur + 0.05)
}

// Pentatonic-ish ladder so stones landing in different pits sound distinct.
const STONE_STEPS = [0, 3, 5, 7, 10, 12, 15, 17, 19, 22, 24, 27, 29, 31]

export const sfx = {
  isEnabled: () => enabled,
  setEnabled(on: boolean) {
    enabled = on
    try {
      if (typeof localStorage !== 'undefined') localStorage.setItem(KEY, on ? 'on' : 'off')
    } catch {
      // ignore
    }
  },
  toggle(): boolean {
    this.setEnabled(!enabled)
    return enabled
  },

  /** Pit selected — a short wooden "thock". */
  select() {
    tone({ freq: 220, dur: 0.08, type: 'triangle', gain: 0.18, slideTo: 160 })
    noise({ dur: 0.03, gain: 0.06, from: 2500, to: 1800 })
  },

  /** One stone landing in pit `pit` — a plink pitched by the pit. */
  stone(pit: number) {
    const step = STONE_STEPS[((pit % STONE_STEPS.length) + STONE_STEPS.length) % STONE_STEPS.length] ?? 0
    const freq = 440 * Math.pow(2, step / 12)
    tone({ freq, dur: 0.14, type: 'triangle', gain: 0.11 })
    tone({ freq: freq * 2, dur: 0.06, type: 'sine', gain: 0.04 })
  },

  /** Capture — two low notes. */
  capture() {
    tone({ freq: 196, dur: 0.22, type: 'triangle', gain: 0.16 })
    tone({ freq: 147, dur: 0.3, at: 0.05, type: 'triangle', gain: 0.14 })
  },

  /** Endgame sweep — a rising noise whoosh. */
  sweep() {
    noise({ dur: 0.5, gain: 0.09, from: 500, to: 2600 })
  },

  /** "Your turn" chime — two soft bell notes. */
  turn() {
    tone({ freq: 659.25, dur: 0.35, gain: 0.1 })
    tone({ freq: 880, dur: 0.45, at: 0.13, gain: 0.1 })
  },

  /** Win / lose stingers for the game-over banner. */
  win() {
    ;[523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone({ freq: f, dur: 0.3, at: i * 0.11, gain: 0.11 }))
  },
  lose() {
    ;[440, 349.23, 293.66].forEach((f, i) => tone({ freq: f, dur: 0.3, at: i * 0.13, gain: 0.1 }))
  },
}
