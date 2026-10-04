// Efectos de sonido sintetizados (WebAudio), estilo chiptune. Sin archivos.

let ac: AudioContext | null = null
export let muted = localStorage.getItem('pokewars-muted') === '1'
export function toggleMute() {
  muted = !muted
  localStorage.setItem('pokewars-muted', muted ? '1' : '0')
}

function ctx(): AudioContext | null {
  if (muted) return null
  ac ??= new AudioContext()
  if (ac.state === 'suspended') ac.resume()
  return ac
}
// Los navegadores no dejan sonar nada hasta el primer gesto del usuario
addEventListener('pointerdown', () => ctx(), { once: true })

interface ToneOpts { type?: OscillatorType; vol?: number; to?: number; delay?: number }

function tone(freq: number, dur: number, { type = 'square', vol = 0.07, to, delay = 0 }: ToneOpts = {}) {
  const a = ctx()
  if (!a) return
  const t = a.currentTime + delay
  const osc = a.createOscillator(), gain = a.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(freq, t)
  if (to) osc.frequency.exponentialRampToValueAtTime(to, t + dur)
  gain.gain.setValueAtTime(vol, t)
  gain.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  osc.connect(gain).connect(a.destination)
  osc.start(t)
  osc.stop(t + dur + 0.02)
}

function noise(dur: number, vol = 0.2, delay = 0, cutoff = 1800) {
  const a = ctx()
  if (!a) return
  const t = a.currentTime + delay
  const buffer = a.createBuffer(1, Math.ceil(a.sampleRate * dur), a.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1
  const src = a.createBufferSource(), gain = a.createGain(), filter = a.createBiquadFilter()
  src.buffer = buffer
  filter.type = 'lowpass'
  filter.frequency.value = cutoff
  gain.gain.setValueAtTime(vol, t)
  gain.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  src.connect(filter).connect(gain).connect(a.destination)
  src.start(t)
}

const notes = (freqs: number[], step: number, dur: number, opts: ToneOpts = {}) =>
  freqs.forEach((f, i) => tone(f, dur, { ...opts, delay: (opts.delay ?? 0) + i * step }))

export const sfx = {
  cursor: () => tone(1250, 0.025, { vol: 0.015 }),
  select: () => notes([520, 780], 0.05, 0.07),
  step: () => tone(190, 0.04, { type: 'triangle', vol: 0.12, to: 120 }),
  confirm: () => notes([660, 990], 0.045, 0.06),
  cancel: () => tone(320, 0.1, { to: 170 }),
  error: () => tone(140, 0.12, { type: 'sawtooth', vol: 0.05 }),
  lunge: () => tone(300, 0.12, { to: 900, type: 'triangle', vol: 0.08 }),
  hit: () => { noise(0.16, 0.3); tone(170, 0.16, { to: 55, type: 'sawtooth', vol: 0.12 }) },
  bigHit: () => { noise(0.3, 0.4, 0, 3200); tone(240, 0.3, { to: 40, type: 'sawtooth', vol: 0.16 }); tone(1400, 0.08, { vol: 0.05 }) },
  weakHit: () => { noise(0.08, 0.15, 0, 900); tone(140, 0.1, { to: 90, type: 'triangle', vol: 0.1 }) },
  ko: () => { tone(520, 0.45, { to: 50, type: 'sawtooth', vol: 0.1 }); noise(0.35, 0.18, 0.08, 1200) },
  capture: () => { tone(260, 0.07, { type: 'triangle', vol: 0.14 }); noise(0.06, 0.12, 0, 700) },
  captured: () => notes([523, 659, 784, 1047, 1319], 0.08, 0.14),
  evolve: () => notes([392, 494, 587, 784, 988, 1175, 1568, 1976], 0.09, 0.16, { type: 'triangle', vol: 0.12 }),
  turn: () => notes([392, 587, 784], 0.09, 0.16, { vol: 0.06 }),
  coin: (delay = 0) => notes([988, 1319], 0.05, 0.1, { vol: 0.04, delay }),
  heal: () => notes([660, 880, 1100], 0.06, 0.1, { type: 'triangle', vol: 0.09 }),
  recruit: () => tone(180, 0.3, { to: 900, type: 'triangle', vol: 0.1 }),
  land: () => { noise(0.1, 0.25, 0, 600); tone(110, 0.1, { to: 60, type: 'triangle', vol: 0.15 }) },
  battle: () => { noise(0.25, 0.12, 0, 5000); notes([196, 262, 330, 392], 0.05, 0.08, { vol: 0.05 }) },
  cast: () => tone(500, 0.18, { to: 1400, type: 'triangle', vol: 0.07 }),
  shoot: () => { noise(0.3, 0.14, 0, 4000); tone(900, 0.3, { to: 200, type: 'sawtooth', vol: 0.05 }) },
  talk: () => notes([700, 620, 760], 0.045, 0.04, { vol: 0.03 }),
  power: () => {
    tone(110, 1.1, { to: 880, type: 'sawtooth', vol: 0.09 })
    noise(0.9, 0.1, 0, 2500)
    notes([523, 659, 784, 1047, 1319, 1568], 0.07, 0.3, { delay: 1.0, vol: 0.08 })
    noise(0.5, 0.35, 1.0, 5000)
  },
  ready: () => notes([784, 988, 1175, 1568], 0.06, 0.12, { type: 'triangle', vol: 0.1 }),
  win: () => notes([523, 523, 523, 659, 784, 659, 784, 1047], 0.13, 0.22, { vol: 0.08 }),
}
