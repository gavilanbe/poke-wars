// Genera la música y los efectos del juego con ElevenLabs y los deja en public/audio.
//   node tools/make_audio.mjs               -> genera lo que falte
//   node tools/make_audio.mjs hit win       -> solo esos (regenerándolos)
//   node tools/make_audio.mjs --list        -> lista lo que hay definido
//   node tools/make_audio.mjs --polish      -> vuelve a recortar y nivelar lo ya generado (no gasta créditos)
// La clave se lee de ELEVENLABS_API_KEY o de .env.audio (ignorado por git).
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const OUT = path.join(ROOT, 'public', 'audio')
const envFile = path.join(ROOT, '.env.audio')
if (!process.env.ELEVENLABS_API_KEY && fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf8').split('\n')) {
    const m = line.match(/^(\w+)=(.*)$/)
    if (m) process.env[m[1]] ??= m[2].trim()
  }
}
const KEY = process.env.ELEVENLABS_API_KEY
const API = 'https://api.elevenlabs.io/v1'

const RETRO = 'early 2000s handheld console sound chip, square wave and noise channel, short retro handheld RPG sound, dry, no voice, no music'
// nombre -> [descripción, segundos, influencia del texto (0-1)]
const SFX = {
  cursor: [`tiny soft menu cursor tick, ${RETRO}`, 0.5, 0.6],
  select: [`short bright two-note menu select blip, ${RETRO}`, 0.5, 0.6],
  confirm: [`cheerful short confirm chime, rising two notes, ${RETRO}`, 0.6, 0.6],
  cancel: [`short soft descending cancel blip, ${RETRO}`, 0.5, 0.6],
  error: [`low short buzzer denied sound, ${RETRO}`, 0.5, 0.6],
  step: [`single light cartoon footstep hop on grass, very short, ${RETRO}`, 0.5, 0.5],
  lunge: [`fast whoosh dash swish, cartoon attack lunge, ${RETRO}`, 0.6, 0.5],
  hit: [`punchy impact hit, cartoon fighting game thwack, ${RETRO}`, 0.6, 0.5],
  bigHit: [`huge powerful critical impact with deep boom and sparkle, ${RETRO}`, 1.2, 0.5],
  weakHit: [`weak dull thud, soft bump, ${RETRO}`, 0.5, 0.5],
  ko: [`creature faints: descending pitch whistle then soft thud, ${RETRO}`, 1.5, 0.5],
  capture: [`heavy cartoon stomp thud on a wooden roof, ${RETRO}`, 0.6, 0.5],
  captured: [`short triumphant capture jingle, bright brass and chimes, four notes rising, retro 16-bit game`, 2.5, 0.5],
  evolve: [`magical evolution: shimmering rising sparkles building to a bright burst, retro 16-bit game`, 3.5, 0.5],
  turn: [`short heroic two-note fanfare sting announcing a new turn, retro 16-bit strategy game`, 1.5, 0.5],
  coin: [`single coin pickup ding, bright, ${RETRO}`, 0.5, 0.6],
  heal: [`gentle healing sparkle chime, rising, soothing, ${RETRO}`, 1.2, 0.5],
  recruit: [`creature popping out of a capsule: quick whoosh and pop, ${RETRO}`, 0.8, 0.5],
  land: [`small creature landing on the ground, soft thump with dust, ${RETRO}`, 0.5, 0.5],
  battle: [`battle start sting: fast swoosh then sharp cymbal hit, retro 16-bit game`, 1.2, 0.5],
  cast: [`energy charging up, rising electric hum, ${RETRO}`, 0.9, 0.5],
  shoot: [`energy projectile launched, quick blast whoosh, ${RETRO}`, 0.8, 0.5],
  talk: [`three quick cute speech blips, dialogue text sound, ${RETRO}`, 0.5, 0.6],
  power: [`epic super move activation: deep riser building for two seconds, then a massive impact with bright choir-like shimmer, retro game`, 3.5, 0.5],
  ready: [`special ability ready: sparkling ascending arpeggio chime, ${RETRO}`, 1.2, 0.5],
  win: [`victory fanfare: triumphant bright brass melody with final chord, retro 16-bit game`, 5, 0.5],
  ambush: [`surprise ambush alert: sharp alarm stab, two fast notes, ${RETRO}`, 0.8, 0.5],
  crit: [`critical hit: sharp metallic slash with bright sparkle ring, ${RETRO}`, 0.9, 0.5],
  // Ataques por tipo
  mv_fire: [`roaring flamethrower burst of fire, whoosh of flames, game sound effect, no music`, 1.4, 0.5],
  mv_water: [`powerful water jet splash, gushing spray, game sound effect, no music`, 1.3, 0.5],
  mv_grass: [`sharp leaves slicing through the air, fast rustling swishes, game sound effect, no music`, 1.1, 0.5],
  mv_electric: [`thunderbolt strike: electric crackle and sharp thunder crack, game sound effect, no music`, 1.4, 0.5],
  mv_psychic: [`psychic wave: eerie warbling pulse with shimmer, game sound effect, no music`, 1.4, 0.5],
  mv_rock: [`boulders crashing and smashing, heavy rock impact with debris, game sound effect, no music`, 1.3, 0.5],
  mv_dark: [`monster bite: quick snarl and sharp jaw crunch, game sound effect, no music`, 0.9, 0.5],
  mv_steel: [`metal claws slashing: three fast metallic scrapes with ringing, game sound effect, no music`, 1, 0.5],
  mv_dragon: [`dragon breath: deep roar with rushing energy, game sound effect, no music`, 1.5, 0.5],
  mv_flying: [`big wing flap gust then fast air slash, game sound effect, no music`, 1, 0.5],
  mv_fighting: [`martial arts punch: quick whoosh and hard smack, game sound effect, no music`, 0.7, 0.5],
  mv_normal: [`body tackle: fast rush and solid bump, game sound effect, no music`, 0.7, 0.5],
  // Ambiente (en bucle)
  amb_rain: [`steady rain falling on grass and leaves, calm ambient loop, no thunder, no music`, 10, 0.5, true],
  amb_night: [`quiet night ambience with soft crickets, calm ambient loop, no music`, 10, 0.5, true],
}

// ---------- Música: planes de composición para music_v2_5 ----------
// Cada tema se describe como lo haría un compositor: época de producción, instrumentos, tempo, tonalidad y secciones.
// El sonido buscado es el de las bandas sonoras de Pokémon de Game Boy Advance: MIDI secuenciado con muestras de
// baja resolución, trompetas brillantes llevando la melodía, trompas, cuerdas en pizzicato, bajo slap y timbales.
// (La API rechaza los nombres de marca, así que se describe el sonido sin nombrarlos.)
const GBA = [
  'early 2000s 32-bit handheld JRPG soundtrack',
  'monster-collecting adventure RPG music',
  'sequenced MIDI with crunchy low-bit sampled instruments',
  'bright blaring sampled trumpet section carrying the melody',
  'french horn countermelody',
  'staccato and pizzicato strings',
  'slap bass',
  'tight punchy drum kit with fast snare fills',
  'timpani hits',
  'square wave lead doubling the melody',
  'dry mix with no reverb tail, small handheld speaker sound',
  'catchy singable melody',
  'instrumental only',
]
const NEG = ['vocals', 'singing', 'lyrics', 'choir', 'modern EDM', 'trap hi-hats', 'cinematic trailer drums', 'ambient pads', 'lo-fi hip hop', 'long reverb', 'live orchestra recording']
/** Sección de un tema: [nombre con indicaciones, segundos, estilos propios]. */
const plan = (base, sections) => ({
  chunks: sections.map(([text, seconds, styles = []], i) => ({
    text, duration_ms: seconds * 1000, positive_styles: i === 0 ? [...GBA, ...base, ...styles] : [...base, ...styles], negative_styles: NEG, context_adherence: 'high',
  })),
})
// nombre -> { plan, loop: segundo al que vuelve el bucle (lo que hay antes es la entrada) }
const MUSIC = {
  title: { loop: 8, plan: plan(['140 BPM', 'D major', 'grand, hopeful, adventurous opening theme'], [
    ['[Intro] {timpani roll and rising brass fanfare}', 8, ['title screen fanfare, building anticipation']],
    ['[Main Theme] {heroic trumpet melody over marching snare}', 24, ['full band, proud march']],
    ['[Bridge] {strings and flute carry a softer answer}', 16, ['lighter texture, wistful']],
    ['[Main Theme] {trumpet melody returns with horn countermelody}', 20, ['full band, triumphant']],
  ]) },
  co_pikachu: { loop: 5, plan: plan(['152 BPM', 'C major', 'cheerful, bouncy, optimistic route theme', 'sunny first-adventure feeling'], [
    ['[Intro] {snare pickup into the theme}', 5, ['short pickup']],
    ['[Theme A] {bright trumpet melody, bouncing slap bass}', 22, ['playful and energetic']],
    ['[Theme B] {flute and glockenspiel answer, pizzicato strings}', 20, ['lighter, skipping rhythm']],
    ['[Theme A] {trumpet melody with square wave harmony}', 22, ['fuller arrangement, joyful']],
  ]) },
  co_charizard: { loop: 5, plan: plan(['176 BPM', 'E minor', 'fierce, aggressive, relentless rival battle march', 'burning intensity'], [
    ['[Intro] {descending chromatic brass riff, drum fill}', 5, ['dramatic stab']],
    ['[Theme A] {driving sixteenth-note bass ostinato, trumpet melody}', 22, ['overdriven square lead, pounding drums']],
    ['[Theme B] {horns answer in a heroic major lift}', 20, ['brief hopeful lift then tension returns']],
    ['[Theme A] {trumpet melody an octave higher, timpani}', 22, ['maximum energy']],
  ]) },
  co_blastoise: { loop: 6, plan: plan(['112 BPM', 'D major', 'noble, steady, majestic ocean voyage theme', 'calm confidence'], [
    ['[Intro] {harp arpeggio and soft horn swell}', 6, ['gentle opening']],
    ['[Theme A] {broad french horn melody over rolling string arpeggios}', 24, ['stately march snare, warm']],
    ['[Theme B] {oboe and flute melody, harp}', 20, ['flowing like waves, serene']],
    ['[Theme A] {full brass melody with timpani}', 22, ['grand and resolute']],
  ]) },
  co_gengar: { loop: 5, plan: plan(['124 BPM', 'G minor', 'spooky, mischievous, playful haunted-house theme', 'creeping but fun'], [
    ['[Intro] {detuned music box and eerie theremin-like square wave}', 5, ['unsettling opening']],
    ['[Theme A] {tiptoeing pizzicato bass, chromatic clarinet melody}', 22, ['sneaky, staccato']],
    ['[Theme B] {organ chords, wobbling theremin-like lead}', 20, ['ghostly waltz feeling']],
    ['[Theme A] {melody returns with xylophone bones and brass stabs}', 22, ['mischievous, fuller']],
  ]) },
  battle: { loop: 6, plan: plan(['178 BPM', 'A minor', 'intense fast-paced duel music', 'urgent, heroic, relentless'], [
    ['[Intro] {fast descending chromatic riff, cymbal crash}', 6, ['dramatic opening sting']],
    ['[Theme A] {racing bass ostinato, urgent trumpet melody, sixteenth-note hi-hats}', 20, ['driving drums']],
    ['[Theme B] {key lifts to C major, soaring heroic melody}', 16, ['hopeful lift']],
    ['[Theme A] {melody returns with brass stabs and timpani}', 16, ['maximum intensity']],
  ]) },
  capture: { loop: 0, plan: plan(['138 BPM', 'B minor', 'tense suspense loop', 'holding breath, will it work'], [
    ['[Loop] {ticking staccato strings, pulsing bass, snare rolls building}', 20, ['no melody resolution, rising tension, timpani heartbeat']],
  ]) },
  power: { loop: 4, plan: plan(['164 BPM', 'E major', 'triumphant super-move theme', 'soaring, unstoppable, heroic'], [
    ['[Intro] {rising brass glissando and cymbal swell}', 4, ['explosive entrance']],
    ['[Theme] {soaring trumpet melody over galloping drums and fast arpeggios}', 22, ['full band at maximum energy']],
  ]) },
  victory: { loop: 7, plan: plan(['148 BPM', 'F major', 'joyful victory celebration', 'proud, happy, relieved'], [
    ['[Fanfare] {triumphant brass fanfare with final cymbal}', 7, ['short winning fanfare']],
    ['[Theme] {bouncy happy melody on trumpet and flute, clapping snare}', 30, ['relaxed celebration loop']],
  ]) },
  defeat: { loop: 0, plan: plan(['84 BPM', 'D minor', 'gentle bittersweet defeat theme', 'sad but encouraging'], [
    ['[Theme] {slow oboe melody over soft strings and harp}', 20, ['melancholy, simple']],
  ]) },
  // Fanfarrias cortas
  jingle_capture: { plan: plan(['150 BPM', 'C major', 'short success fanfare'], [['[Fanfare] {bright brass and strings rising arpeggio ending on a held major chord with cymbal}', 5, ['got-it jingle, celebratory, ends cleanly']]]) },
  jingle_heal: { plan: plan(['120 BPM', 'G major', 'short healing jingle'], [['[Jingle] {five gentle ascending chime and square-wave notes, soft final chord}', 4, ['warm, reassuring, ends cleanly']]]) },
  jingle_evolve: { plan: plan(['140 BPM', 'A major', 'short evolution-complete fanfare'], [['[Fanfare] {shimmering rising arpeggios burst into a triumphant brass phrase}', 6, ['magical then triumphant, ends cleanly']]]) },
  jingle_turn: { plan: plan(['140 BPM', 'D major', 'very short turn-start sting'], [['[Sting] {two-bar trumpet call with snare}', 3, ['ready-set-go, ends cleanly']]]) },
}

async function request(url, body) {
  const res = await fetch(url, { method: 'POST', headers: { 'xi-api-key': KEY, 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  if (!res.ok) throw new Error(`${res.status} ${(await res.text()).slice(0, 300)}`)
  return Buffer.from(await res.arrayBuffer())
}

const sfx = (name) => {
  const [text, duration_seconds, prompt_influence, loop] = SFX[name]
  return request(`${API}/sound-generation?output_format=mp3_44100_128`, { text, duration_seconds, prompt_influence, ...(loop ? { loop: true } : {}) })
}
const BRANDS = /pok[eé]mon|nintendo|game boy/i
async function music(name) {
  const { plan: composition_plan } = MUSIC[name]
  const send = (p) => request(`${API}/music`, { composition_plan: p, model_id: 'music_v2_5' })
  try {
    return await send(composition_plan)
  } catch (e) {
    // Si rechaza la petición por nombrar una marca, se repite describiendo solo el sonido
    if (!/prompt|terms|copyright|brand/i.test(e.message)) throw e
    console.error(`  (${name}: petición rechazada, se reintenta sin nombres de marca)`)
    const clean = { chunks: composition_plan.chunks.map((c) => ({ ...c, positive_styles: c.positive_styles.map((t) => (BRANDS.test(t) ? t.replace(/in the style of Pok[eé]mon Ruby and Sapphire/i, 'early 2000s handheld').replace(/Game Boy Advance era/i, 'early 2000s 32-bit handheld') : t)) })) }
    return send(clean)
  }
}

// Gritos originales de cada Pokémon (PokeAPI/cries, versión clásica), pasados a mp3
const CRIES = {
  treecko: 252, torchic: 255, mudkip: 258, zigzagoon: 263, poochyena: 261, machop: 66, geodude: 74, taillow: 276, pikachu: 25,
  ralts: 280, wailmer: 320, snorlax: 143, metagross: 376, salamence: 373, sceptile: 254, blaziken: 257, swampert: 260, swellow: 277,
  gardevoir: 282, wingull: 278, electrike: 309, manectric: 310, shroomish: 285, breloom: 286, numel: 322, camerupt: 323, aron: 304,
  aggron: 306, carvanha: 318, sharpedo: 319, bagon: 371, beldum: 374, gyarados: 130, tyranitar: 248, absol: 359, lucario: 448,
  charizard: 6, blastoise: 9, gengar: 94,
}
async function cry(name) {
  const res = await fetch(`https://raw.githubusercontent.com/PokeAPI/cries/main/cries/pokemon/legacy/${CRIES[name]}.ogg`)
  if (!res.ok) throw new Error(String(res.status))
  const ogg = path.join(OUT, `cry_${name}.ogg`)
  fs.writeFileSync(ogg, Buffer.from(await res.arrayBuffer()))
  const { execFileSync } = await import('node:child_process')
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', ogg, '-b:a', '128k', path.join(OUT, `cry_${name}.mp3`)])
  fs.unlinkSync(ogg)
  return fs.readFileSync(path.join(OUT, `cry_${name}.mp3`))
}

// ---------- Acabado: quitar el silencio del principio y nivelar el volumen ----------
// Pico objetivo en dB: los sonidos de interfaz, bajitos; los golpes y fanfarrias, fuertes; el ambiente, de fondo.
const QUIET = ['cursor', 'select', 'confirm', 'cancel', 'error', 'step', 'talk', 'coin', 'land']
const peakFor = (name) => (QUIET.includes(name) ? -14 : name.startsWith('amb_') ? -12 : name.startsWith('cry_') ? -6 : -2)
async function polish(name) {
  if (name.startsWith('music_')) return // los temas se dejan como salen
  const { execFileSync, spawnSync } = await import('node:child_process')
  const file = path.join(OUT, name + '.mp3'), tmp = path.join(OUT, name + '.tmp.mp3')
  const trim = name.startsWith('amb_') ? [] : ['silenceremove=start_periods=1:start_threshold=-48dB:start_silence=0.01']
  const measured = spawnSync('ffmpeg', ['-i', file, '-af', [...trim, 'volumedetect'].join(','), '-f', 'null', '-']).stderr.toString() // ffmpeg informa por stderr
  const max = Number(measured.match(/max_volume: ([-0-9.]+) dB/)?.[1] ?? 0)
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', file, '-af', [...trim, `volume=${(peakFor(name) - max).toFixed(1)}dB`].join(','), '-b:a', '128k', tmp])
  fs.renameSync(tmp, file)
}

const credits = async () => {
  const res = await fetch(`${API}/user/subscription`, { headers: { 'xi-api-key': KEY } })
  const d = await res.json()
  return d.character_limit - d.character_count
}

const musicFile = (n) => (n.startsWith('jingle_') ? n : 'music_' + n)
const args = process.argv.slice(2)
if (args.includes('--list')) {
  console.log('Efectos:', Object.keys(SFX).join(', '))
  console.log('Música:', Object.keys(MUSIC).map(musicFile).join(', '))
  console.log('Gritos:', Object.keys(CRIES).length)
  process.exit(0)
}
if (args.includes('--polish')) {
  const names = fs.readdirSync(OUT).filter((f) => f.endsWith('.mp3')).map((f) => f.slice(0, -4))
  for (const n of names) await polish(n)
  console.log(`${names.length} archivos nivelados`)
  process.exit(0)
}
if (!KEY) {
  console.error('Falta ELEVENLABS_API_KEY (variable de entorno o archivo .env.audio)')
  process.exit(1)
}
fs.mkdirSync(OUT, { recursive: true })
const wanted = args.filter((a) => !a.startsWith('--'))
const jobs = [
  ...Object.keys(SFX).map((n) => [n, sfx]),
  ...Object.keys(MUSIC).map((n) => [musicFile(n), () => music(n)]),
  ...Object.keys(CRIES).map((n) => ['cry_' + n, () => cry(n)]),
]
  .filter(([n]) => (wanted.length ? wanted.includes(n) : !fs.existsSync(path.join(OUT, n + '.mp3'))))

const before = await credits()
for (const [name, make] of jobs) {
  try {
    const data = await make(name)
    fs.writeFileSync(path.join(OUT, name + '.mp3'), data)
    await polish(name)
    console.log(`${name}: ${(data.length / 1024).toFixed(0)} KB`)
  } catch (e) {
    console.error(`${name}: FALLA ${e.message}`)
  }
}
// El juego carga solo lo que aparece en este índice
const files = fs.readdirSync(OUT).filter((f) => f.endsWith('.mp3')).map((f) => f.slice(0, -4)).sort()
// `loops`: segundo al que vuelve cada tema al repetirse (se salta la entrada)
const loops = Object.fromEntries(Object.entries(MUSIC).filter(([, m]) => m.loop !== undefined).map(([n, m]) => ['music_' + n, m.loop]))
fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify({ files, loops }))
console.log(`${files.length} archivos en public/audio. Créditos gastados: ${before - (await credits())}`)
