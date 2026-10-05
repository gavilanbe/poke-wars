// Sonido del juego. Los efectos y la música salen de public/audio (generados con ElevenLabs: tools/make_audio.mjs);
// si un archivo falta, el efecto cae a una versión sintetizada con WebAudio, así el juego nunca se queda mudo.

import { buzz } from './mobile'

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
  const a = audio() // el mismo contexto que luego suena: los móviles dan muy pocos
  for (const name of available) {
    if (name.startsWith('music_') || name.startsWith('cry_')) continue // la música va en streaming y los gritos (más de doscientos) se traen al usarlos
    void fetchSample(a, name)
  }
}

function out(a: AudioContext): AudioNode {
  if (!master) {
    master = a.createGain()
    master.gain.value = muted ? 0 : 1 // la música también pasa por aquí
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
// La música suena por WebAudio, igual que los efectos: cada tema se descodifica una vez y se reproduce desde memoria.
// Antes era un <audio> por tema, con otro nuevo en cada vuelta del bucle, y en el móvil eso fallaba por tres sitios:
// el iPhone no deja arrancar un <audio> nuevo sin un toque (la música se callaba al acabar la primera vuelta), no
// deja cambiarle el volumen (sonaba al triple y tapaba los efectos) y lo corta al cambiar de aplicación.

interface Voice { name: string; volume: number; gain: GainNode; src: AudioBufferSourceNode; startedAt: number; offset: number }
const voices = new Map<string, Voice>() // por canal: 'music' y 'ambience'
const wanted: Record<string, [string, number]> = { music: ['', 0], ambience: ['', 0] } // lo que debería estar sonando en cada canal
const songs = new Map<string, AudioBuffer>() // temas descodificados (los últimos; cada uno son unos 15 MB)
const MUSIC_VOLUME = 0.32, CROSS = 1.6

/** El contexto de audio, exista o no sonido activado (el silencio lo pone `master`). */
function audio(): AudioContext {
  ac ??= new AudioContext()
  return ac
}
async function song(name: string): Promise<AudioBuffer | null> {
  const hit = songs.get(name)
  if (hit) return hit
  try {
    const data = await fetch(`audio/${name}.mp3`).then((r) => r.arrayBuffer())
    const buffer = await audio().decodeAudioData(data)
    songs.set(name, buffer)
    for (const old of songs.keys()) { if (songs.size <= 4) break; if (![...voices.values()].some((v) => v.name === old)) songs.delete(old) }
    return buffer
  } catch { return null } // sin red y sin copia: ese tema no suena, y ya está
}
/** Arranca una voz: el tema desde `offset`, entrando con un fundido. */
function voice(a: AudioContext, name: string, buffer: AudioBuffer, volume: number, offset: number, fadeIn: number): Voice {
  const src = a.createBufferSource(), gain = a.createGain()
  src.buffer = buffer
  gain.gain.setValueAtTime(0, a.currentTime)
  gain.gain.linearRampToValueAtTime(volume, a.currentTime + fadeIn)
  src.connect(gain).connect(out(a))
  src.start(0, offset)
  return { name, volume, gain, src, startedAt: a.currentTime, offset }
}
function hush(a: AudioContext, v: Voice, seconds: number) {
  v.gain.gain.cancelScheduledValues(a.currentTime)
  v.gain.gain.setValueAtTime(v.gain.gain.value, a.currentTime)
  v.gain.gain.linearRampToValueAtTime(0, a.currentTime + seconds)
  try { v.src.stop(a.currentTime + seconds + 0.05) } catch { /* ya estaba parada */ }
}
/** Pone en un canal el tema que toca (o lo calla): funde el que hubiera y arranca el nuevo cuando esté descodificado. */
async function tune(channel: string, name: string, volume: number) {
  if (wanted[channel][0] === name) return
  wanted[channel] = [name, volume]
  const a = audio(), old = voices.get(channel)
  if (old) { voices.delete(channel); hush(a, old, 0.7) }
  if (!name || !available.has(name)) return
  const buffer = await song(name)
  if (!buffer || wanted[channel][0] !== name || voices.has(channel)) return // mientras se descodificaba ya se pidió otro
  voices.set(channel, voice(a, name, buffer, volume, 0, 0.7))
}
// El bucle: poco antes del final entra una segunda copia que empieza justo después de la entrada del tema, y se funden.
// Se mira con el reloj del propio audio, que se para cuando el navegador lo suspende: así no se desfasa al volver.
setInterval(() => {
  if (!ac || ac.state !== 'running') return
  for (const [channel, v] of voices) {
    const buffer = v.src.buffer!, at = ac.currentTime - v.startedAt + v.offset
    if (at < buffer.duration - CROSS - 0.2) continue
    hush(ac, v, CROSS)
    voices.set(channel, voice(ac, v.name, buffer, v.volume, loops[v.name] ?? 0, CROSS))
  }
}, 200)

export const music = {
  /** Cambia de tema con fundido; '' para silencio. */
  play(name: string) { void tune('music', name ? 'music_' + name : '', MUSIC_VOLUME) },
  ambience(name: string) { void tune('ambience', name ? 'amb_' + name : '', 0.3) },
  /** Baja la música un momento (para un cartel o un efecto largo). */
  duck(ms: number) {
    const v = voices.get('music')
    if (!v || !ac) return
    const g = v.gain.gain, now = ac.currentTime
    g.cancelScheduledValues(now)
    g.setValueAtTime(g.value, now)
    g.linearRampToValueAtTime(v.volume * 0.25, now + 0.2)
    g.setValueAtTime(v.volume * 0.25, now + ms / 1000)
    g.linearRampToValueAtTime(v.volume, now + ms / 1000 + 0.6)
  },
  sync() { if (master) master.gain.value = muted ? 0 : 1 },
}

// En el iPhone, el interruptor de silencio corta los efectos (WebAudio) pero no la música: se pide el modo de
// reproducción normal, el de un juego, para que suene todo o nada.
try { (navigator as unknown as { audioSession?: { type: string } }).audioSession && ((navigator as unknown as { audioSession: { type: string } }).audioSession.type = 'playback') } catch { /* navegador sin esa API */ }

/** Despierta el audio: los navegadores lo dejan dormido hasta el primer gesto, y el móvil lo vuelve a dormir cada vez que se sale de la aplicación. */
function wake() {
  if (!ac) { if (muted) return; audio() }
  if (ac!.state !== 'running') void ac!.resume().catch(() => {})
  for (const [channel, [name, volume]] of Object.entries(wanted)) { // un tema que no pudo arrancar en su momento
    if (name && !voices.has(channel) && available.has(name)) { wanted[channel] = ['', 0]; void tune(channel, name, volume) }
  }
}
for (const type of ['pointerdown', 'pointerup', 'touchend', 'keydown']) addEventListener(type, wake, true)
// Al cambiar de aplicación o apagar la pantalla el juego se calla; al volver, sigue donde estaba
document.addEventListener('visibilitychange', () => {
  if (!ac) return
  if (document.hidden) void ac.suspend().catch(() => {})
  else void ac.resume().catch(() => {}) // si el sistema no deja sin un toque, lo hará `wake` en el siguiente
})

function ctx(): AudioContext | null {
  if (muted) return null
  const a = audio()
  if (a.state !== 'running') void a.resume().catch(() => {})
  return a
}

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
  hit: () => { buzz(18); void (sample('hit') || (()=>{ noise(0.16, 0.3); tone(170, 0.16, { to: 55, type: 'sawtooth', vol: 0.12 }) })()) },
  bigHit: () => { buzz([30, 40, 60]); void (sample('bigHit') || (()=>{ noise(0.3, 0.4, 0, 3200); tone(240, 0.3, { to: 40, type: 'sawtooth', vol: 0.16 }); tone(1400, 0.08, { vol: 0.05 }) })()) },
  weakHit: () => { buzz(10); void (sample('weakHit') || (()=>{ noise(0.08, 0.15, 0, 900); tone(140, 0.1, { to: 90, type: 'triangle', vol: 0.1 }) })()) },
  ko: () => { buzz([20, 30, 20, 30, 90]); void (sample('ko') || (()=>{ tone(520, 0.45, { to: 50, type: 'sawtooth', vol: 0.1 }); noise(0.35, 0.18, 0.08, 1200) })()) },
  // Pisotón de la captura: la muestra a todo volumen más un golpe grave sintetizado debajo, para que se note sobre la música
  capture: () => { buzz(25); tone(120, 0.14, { to: 50, type: 'triangle', vol: 0.22 }); if (!sample('capture', { vol: 1 })) noise(0.08, 0.2, 0, 700) },
  captured: () => void (sample('jingle_capture', { vol: 0.8 }) || sample('captured') || notes([523, 659, 784, 1047, 1319], 0.08, 0.14)),
  evolve: () => void (sample('evolve') || notes([392, 494, 587, 784, 988, 1175, 1568, 1976], 0.09, 0.16, { type: 'triangle', vol: 0.12 })),
  turn: () => void (sample('jingle_turn', { vol: 0.6 }) || sample('turn') || notes([392, 587, 784], 0.09, 0.16, { vol: 0.06 })),
  coin: (delay = 0) => void (sample('coin', { delay }) || notes([988, 1319], 0.05, 0.1, { vol: 0.04, delay })),
  heal: () => void (sample('jingle_heal', { vol: 0.6 }) || sample('heal') || notes([660, 880, 1100], 0.06, 0.1, { type: 'triangle', vol: 0.09 })),
  recruit: () => void (sample('recruit') || tone(180, 0.3, { to: 900, type: 'triangle', vol: 0.1 })),
  land: () => { buzz(14); void (sample('land') || (()=>{ noise(0.1, 0.25, 0, 600); tone(110, 0.1, { to: 60, type: 'triangle', vol: 0.15 }) })()) },
  /** Algo salta de la hierba: el aviso del encuentro con un salvaje. */
  encounter: () => void (sample('jingle_wild', { vol: 0.8 }) || notes([880, 660, 880, 1320], 0.06, 0.1, { type: 'square', vol: 0.07 })),
  /** El atacante coge impulso: un tono que sube (más largo antes de un golpe gordo). */
  charge: (strong = false) => { tone(180, strong ? 0.42 : 0.28, { to: strong ? 1100 : 760, type: 'triangle', vol: strong ? 0.08 : 0.05 }); noise(strong ? 0.4 : 0.26, 0.05, 0, 3000) },
  /** El grave que va debajo de cada impacto; pesa lo que pese el golpe (0 a 1). */
  thump: (power: number) => { tone(110 - power * 30, 0.16 + power * 0.2, { to: 38, type: 'sine', vol: 0.1 + power * 0.22 }); if (power > 0.6) noise(0.22, 0.12, 0.02, 400) },
  /** Remate corto al debilitar a un rival. */
  sting: () => notes([523, 784, 1047, 1568], 0.07, 0.16, { type: 'square', vol: 0.06 }),
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
