// Sonido del juego. Los efectos y la música salen de public/audio (generados con ElevenLabs: tools/make_audio.mjs);
// si un archivo falta, el efecto cae a una versión sintetizada con WebAudio, así el juego nunca se queda mudo.

let ac: AudioContext | null = null
export let muted = localStorage.getItem('pokewars-muted') === '1'
export function toggleMute() {
  muted = !muted
  localStorage.setItem('pokewars-muted', muted ? '1' : '0')
  if (master) master.gain.value = muted ? 0 : 1
  if (!muted) ctx()
}

// ---------- Muestras grabadas ----------

let master: GainNode | null = null
const buffers = new Map<string, AudioBuffer>()
let available = new Set<string>()
let loops: Record<string, number> = {} // segundo al que vuelve cada tema al repetirse
// Los archivos ya vienen nivelados (interfaz bajita, golpes fuertes); esto solo afina
const VOLUME: Record<string, number> = { select: 0.5, confirm: 0.5, cancel: 0.5, step: 0.45, talk: 0.5, coin: 0.5, land: 0.6, lunge: 0.6, cast: 0.6 }

const fetching = new Map<string, Promise<void>>()
/** Trae y descodifica un archivo (una sola vez). */
function fetchSample(a: BaseAudioContext, name: string): Promise<void> {
  let job = fetching.get(name)
  if (!job) {
    job = fetch(`audio/${name}.mp3`).then((r) => r.arrayBuffer()).then((data) => a.decodeAudioData(data)).then((b) => void buffers.set(name, b)).catch(() => {})
    fetching.set(name, job)
  }
  return job
}

/** Carga el índice y va descodificando los archivos en segundo plano. */
export async function loadAudio() {
  try {
    const manifest = await fetch('audio/manifest.json').then((r) => (r.ok ? r.json() : { files: [] }))
    available = new Set(manifest.files)
    loops = manifest.loops ?? {}
  } catch {
    return
  }
  const a = new AudioContext()
  for (const name of available) {
    if (name.startsWith('music_') || name.startsWith('cry_')) continue // la música va en streaming y los gritos (más de doscientos) se traen al usarlos
    void fetchSample(a, name)
  }
}

function out(a: AudioContext): AudioNode {
  if (!master) {
    master = a.createGain()
    master.connect(a.destination)
  }
  return master
}

/** Reproduce una muestra si está cargada; devuelve false si hay que tirar del sintetizador. */
function sample(name: string, { vol = VOLUME[name] ?? 0.7, delay = 0, rate = 1 } = {}): boolean {
  const buffer = buffers.get(name)
  if (!buffer) {
    // Un grito que aún no se ha traído: se pide ahora y suena en cuanto llega, si no ha pasado ya el momento
    if (!name.startsWith('cry_') || !available.has(name)) return false
    const a = ctx(), asked = performance.now()
    if (a) void fetchSample(a, name).then(() => { if (performance.now() - asked < 600 && buffers.has(name)) sample(name, { vol, delay, rate }) })
    return true
  }
  const a = ctx()
  if (!a) return true
  const src = a.createBufferSource(), gain = a.createGain()
  src.buffer = buffer
  src.playbackRate.value = rate
  gain.gain.value = vol
  src.connect(gain).connect(out(a))
  src.start(a.currentTime + delay)
  return true
}

// ---------- Música y ambiente ----------

const tracks = new Map<string, HTMLAudioElement>()
let currentMusic = '', currentAmbience = ''
const MUSIC_VOLUME = 0.32

function fade(el: HTMLAudioElement, to: number, ms = 700) {
  const from = el.volume, start = performance.now()
  const step = () => {
    const t = Math.min(1, (performance.now() - start) / ms)
    el.volume = Math.max(0, Math.min(1, from + (to - from) * t))
    if (t < 1) requestAnimationFrame(step)
    else if (to === 0) el.pause()
  }
  step()
}

/**
 * Arranca un tema en bucle. Los temas tienen una entrada que solo suena la primera vez: poco antes del final se
 * funde con una segunda copia que empieza justo después de la entrada, así el bucle no se nota.
 */
function startLoop(name: string, volume: number, from = 0): HTMLAudioElement {
  const el = new Audio(`audio/${name}.mp3`)
  const loopStart = loops[name]
  el.loop = loopStart === undefined
  el.muted = muted
  el.volume = 0
  if (from) el.currentTime = from
  if (loopStart !== undefined) {
    el.ontimeupdate = () => {
      if (!el.duration || el.currentTime < el.duration - 1.8 || tracks.get(name) !== el) return
      el.ontimeupdate = null
      const next = startLoop(name, volume, loopStart)
      tracks.set(name, next)
      fade(el, 0, 1600)
    }
  }
  tracks.set(name, el)
  el.play().then(() => fade(el, volume, from ? 1600 : 700)).catch(() => {}) // sin gesto del usuario aún: se reintenta al primer clic
  return el
}

function loopTrack(name: string, volume: number, current: string): string {
  if (name === current) return current
  const old = tracks.get(current)
  if (old) { tracks.delete(current); fade(old, 0) }
  if (!name || !available.has(name)) return name
  startLoop(name, volume)
  return name
}

export const music = {
  /** Cambia de tema con fundido; '' para silencio. */
  play(name: string) { currentMusic = loopTrack(name ? 'music_' + name : '', MUSIC_VOLUME, currentMusic) },
  ambience(name: string) { currentAmbience = loopTrack(name ? 'amb_' + name : '', 0.3, currentAmbience) },
  /** Baja la música un momento (para un cartel o un efecto largo). */
  duck(ms: number) {
    const el = tracks.get(currentMusic)
    if (!el) return
    fade(el, MUSIC_VOLUME * 0.25, 200)
    setTimeout(() => fade(el, MUSIC_VOLUME, 600), ms)
  },
  sync() { for (const el of tracks.values()) el.muted = muted },
}
// Si el navegador bloqueó la música al cargar, arranca con el primer gesto
addEventListener('pointerdown', () => {
  const el = tracks.get(currentMusic)
  if (el && el.paused && !muted) { el.volume = 0; el.play().then(() => fade(el, MUSIC_VOLUME)).catch(() => {}) }
  else if (!el && currentMusic && available.has(currentMusic)) startLoop(currentMusic, MUSIC_VOLUME)
})

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

let lastTick = 0

export const sfx = {
  // Tic de menú: muy suave y sintetizado, y nunca más de uno cada 70 ms
  cursor: () => { const now = performance.now(); if (now - lastTick > 70) { lastTick = now; tone(1100, 0.02, { vol: 0.012, type: 'triangle' }) } },
  select: () => void (sample('select') || notes([520, 780], 0.05, 0.07)),
  step: () => void (sample('step') || tone(190, 0.04, { type: 'triangle', vol: 0.12, to: 120 })),
  confirm: () => void (sample('confirm') || notes([660, 990], 0.045, 0.06)),
  cancel: () => void (sample('cancel') || tone(320, 0.1, { to: 170 })),
  error: () => void (sample('error') || tone(140, 0.12, { type: 'sawtooth', vol: 0.05 })),
  lunge: () => void (sample('lunge') || tone(300, 0.12, { to: 900, type: 'triangle', vol: 0.08 })),
  hit: () => void (sample('hit') || (()=>{ noise(0.16, 0.3); tone(170, 0.16, { to: 55, type: 'sawtooth', vol: 0.12 }) })()),
  bigHit: () => void (sample('bigHit') || (()=>{ noise(0.3, 0.4, 0, 3200); tone(240, 0.3, { to: 40, type: 'sawtooth', vol: 0.16 }); tone(1400, 0.08, { vol: 0.05 }) })()),
  weakHit: () => void (sample('weakHit') || (()=>{ noise(0.08, 0.15, 0, 900); tone(140, 0.1, { to: 90, type: 'triangle', vol: 0.1 }) })()),
  ko: () => void (sample('ko') || (()=>{ tone(520, 0.45, { to: 50, type: 'sawtooth', vol: 0.1 }); noise(0.35, 0.18, 0.08, 1200) })()),
  // Pisotón de la captura: la muestra a todo volumen más un golpe grave sintetizado debajo, para que se note sobre la música
  capture: () => { tone(120, 0.14, { to: 50, type: 'triangle', vol: 0.22 }); if (!sample('capture', { vol: 1 })) noise(0.08, 0.2, 0, 700) },
  captured: () => void (sample('jingle_capture', { vol: 0.8 }) || sample('captured') || notes([523, 659, 784, 1047, 1319], 0.08, 0.14)),
  evolve: () => void (sample('evolve') || notes([392, 494, 587, 784, 988, 1175, 1568, 1976], 0.09, 0.16, { type: 'triangle', vol: 0.12 })),
  turn: () => void (sample('jingle_turn', { vol: 0.6 }) || sample('turn') || notes([392, 587, 784], 0.09, 0.16, { vol: 0.06 })),
  coin: (delay = 0) => void (sample('coin', { delay }) || notes([988, 1319], 0.05, 0.1, { vol: 0.04, delay })),
  heal: () => void (sample('jingle_heal', { vol: 0.6 }) || sample('heal') || notes([660, 880, 1100], 0.06, 0.1, { type: 'triangle', vol: 0.09 })),
  recruit: () => void (sample('recruit') || tone(180, 0.3, { to: 900, type: 'triangle', vol: 0.1 })),
  land: () => void (sample('land') || (()=>{ noise(0.1, 0.25, 0, 600); tone(110, 0.1, { to: 60, type: 'triangle', vol: 0.15 }) })()),
  /** Fanfarria de ataque propia de cada comandante: suena al empezar un combate cuando ataca su equipo. */
  fanfare: (commander?: string) => void ((commander && sample('jingle_atk_' + commander, { vol: 0.85 })) || sfx.battle()),
  battle: () => void (sample('battle') || (()=>{ noise(0.25, 0.12, 0, 5000); notes([196, 262, 330, 392], 0.05, 0.08, { vol: 0.05 }) })()),
  cast: () => void (sample('cast') || tone(500, 0.18, { to: 1400, type: 'triangle', vol: 0.07 })),
  shoot: () => void (sample('shoot') || (()=>{ noise(0.3, 0.14, 0, 4000); tone(900, 0.3, { to: 200, type: 'sawtooth', vol: 0.05 }) })()),
  talk: () => void (sample('talk') || notes([700, 620, 760], 0.045, 0.04, { vol: 0.03 })),
  power: () => {
    if (sample('power')) return
    tone(110, 1.1, { to: 880, type: 'sawtooth', vol: 0.09 })
    noise(0.9, 0.1, 0, 2500)
    notes([523, 659, 784, 1047, 1319, 1568], 0.07, 0.3, { delay: 1.0, vol: 0.08 })
    noise(0.5, 0.35, 1.0, 5000)
  },
  ready: () => void (sample('ready') || notes([784, 988, 1175, 1568], 0.06, 0.12, { type: 'triangle', vol: 0.1 })),
  ambush: () => void (sample('ambush') || tone(140, 0.12, { type: 'sawtooth', vol: 0.05 })),
  crit: () => void (sample('crit') || tone(1400, 0.1, { vol: 0.06 })),
  /** Fanfarria al terminar de evolucionar. */
  evolved: () => void (sample('jingle_evolve', { vol: 0.8 }) || sample('captured')),
  /** Grito original del Pokémon; `rate` más bajo lo hace más grave (para cuando cae). */
  cry: (species: string, rate = 1, vol = 0.55) => void sample('cry_' + species, { rate, vol }),
  /** Un estado recién puesto: quemado, envenenado, paralizado, dormido o congelado. */
  status: (name: string) => void (sample('st_' + name) || tone(name === 'freeze' ? 1600 : 300, 0.2, { to: name === 'freeze' ? 2400 : 120, type: 'triangle', vol: 0.08 })),
  levelup: () => void (sample('jingle_levelup', { vol: 0.7 }) || notes([659, 784, 988, 1319], 0.07, 0.14, { type: 'triangle', vol: 0.1 })),
  ball: () => void (sample('ball') || notes([400, 300, 400, 300], 0.16, 0.06, { vol: 0.05 })),
  caught: () => void (sample('jingle_catch', { vol: 0.8 }) || sample('jingle_capture', { vol: 0.7 }) || notes([523, 659, 784, 1047], 0.08, 0.14)),
  /** Sonido del ataque según el tipo del Pokémon (si no hay muestra, el disparo genérico). */
  move: (type: string) => void (sample('mv_' + type) || sample('shoot')),
  win: () => void (sample('win') || notes([523, 523, 523, 659, 784, 659, 784, 1047], 0.13, 0.22, { vol: 0.08 })),
}
