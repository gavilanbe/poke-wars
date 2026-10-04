// Genera la música y los efectos del juego con ElevenLabs y los deja en public/audio.
//   node tools/make_audio.mjs               -> genera lo que falte
//   node tools/make_audio.mjs hit win       -> solo esos (regenerándolos)
//   node tools/make_audio.mjs --list        -> lista lo que hay definido
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

const RETRO = 'retro 16-bit handheld console game sound effect, clean, no voice, no music'
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

const STYLE = 'Instrumental. Original retro video game soundtrack in the style of a 16-bit handheld turn-based strategy game: chiptune lead melodies layered with warm orchestral pads, punchy drums and bass. Catchy, memorable, seamless loop, no vocals.'
// nombre -> [descripción, milisegundos]
const MUSIC = {
  title: [`${STYLE} Title and commander-select theme: confident, adventurous, mid-tempo march with a hopeful melody.`, 60000],
  map: [`${STYLE} Daytime battlefield map theme for the player's turn: upbeat, bouncy, optimistic and determined, 120 bpm, bright lead with marching snare.`, 90000],
  enemy: [`${STYLE} Enemy turn theme: sneaky and tense but still playful, minor key, staccato bass and mischievous lead, 110 bpm.`, 75000],
  night: [`${STYLE} Night-time battlefield map theme: calmer and mysterious, slower tempo, soft arpeggios and gentle bells, still hopeful.`, 75000],
  battle: [`${STYLE} Fast energetic battle theme: driving drums, urgent heroic melody, 160 bpm, intense and exciting.`, 45000],
  power: [`${STYLE} Short heroic power-up theme for a commander's super ability: triumphant, soaring melody over fast arpeggios, building energy.`, 30000],
  victory: [`${STYLE} Victory celebration theme: joyful fanfare that settles into a happy, relaxed loop.`, 40000],
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
const music = (name) => {
  const [prompt, music_length_ms] = MUSIC[name]
  return request(`${API}/music?output_format=mp3_44100_128`, { prompt, music_length_ms, model_id: 'music_v1' })
}

const credits = async () => {
  const res = await fetch(`${API}/user/subscription`, { headers: { 'xi-api-key': KEY } })
  const d = await res.json()
  return d.character_limit - d.character_count
}

const args = process.argv.slice(2)
if (args.includes('--list')) {
  console.log('Efectos:', Object.keys(SFX).join(', '))
  console.log('Música:', Object.keys(MUSIC).join(', '))
  process.exit(0)
}
if (!KEY) {
  console.error('Falta ELEVENLABS_API_KEY (variable de entorno o archivo .env.audio)')
  process.exit(1)
}
fs.mkdirSync(OUT, { recursive: true })
const wanted = args.filter((a) => !a.startsWith('--'))
const jobs = [...Object.keys(SFX).map((n) => [n, sfx]), ...Object.keys(MUSIC).map((n) => ['music_' + n, () => music(n)])]
  .filter(([n]) => (wanted.length ? wanted.includes(n) : !fs.existsSync(path.join(OUT, n + '.mp3'))))

const before = await credits()
for (const [name, make] of jobs) {
  try {
    const data = await make(name)
    fs.writeFileSync(path.join(OUT, name + '.mp3'), data)
    console.log(`${name}: ${(data.length / 1024).toFixed(0)} KB`)
  } catch (e) {
    console.error(`${name}: FALLA ${e.message}`)
  }
}
// El juego carga solo lo que aparece en este índice
const files = fs.readdirSync(OUT).filter((f) => f.endsWith('.mp3')).map((f) => f.slice(0, -4)).sort()
fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(files))
console.log(`${files.length} archivos en public/audio. Créditos gastados: ${before - (await credits())}`)
