// Modo historia: el mapa del mundo para elegir misión, las conversaciones con retratos, el informe previo, los
// sucesos durante la batalla y la pantalla de resultado. Los datos (misiones, guion, reglas) están en campaign.ts;
// lo que necesita del juego se lo da main.ts en `init`.
import { Line, MISSIONS, Mission, WORLD, defeatReason, happenings, missionGame, rank } from './campaign'
import { COMMANDERS, TERRAIN } from './data'
import { Game, Unit, createGame } from './game'
import { music, sfx } from './sfx'
import { cover, uncover } from './ui'
import { DIR, dirFrom, drawSprite, facePath, loadSpecies } from './units'

export interface StoryApi {
  /** Pone una partida como fondo, sin HUD (el mapa del mundo). */
  world(game: Game): void
  /** Arranca una partida de misión: el jugador contra la IA. */
  mission(game: Game): void
  title(): void
  /** Píxeles, dentro del escenario, del centro de una casilla (puede llevar decimales). */
  screen(x: number, y: number): [number, number]
  /** Tamaño en pantalla de una casilla. */
  tile(): number
  pan(x: number, y: number, snap?: boolean): void
  /** Deja caer en el campo los refuerzos recién llegados. */
  drop(units: Unit[]): void
  /** Bloquea o devuelve el manejo del mapa mientras alguien habla. */
  hold(on: boolean): void
}

interface Save { done: Record<string, { days: number; rank: string }>; hero: string }
const KEY = 'pokewars-story'
const load = (): Save => { try { return { done: {}, hero: 'pikachu', ...JSON.parse(localStorage.getItem(KEY) ?? '{}') } } catch { return { done: {}, hero: 'pikachu' } } }
let save = load()
const store = () => { try { localStorage.setItem(KEY, JSON.stringify(save)) } catch { /* sin sitio: no se guarda el progreso */ } }
/** Cuántas misiones seguidas se han ganado: la siguiente es la que toca. */
const cleared = () => { const i = MISSIONS.findIndex((m) => !save.done[m.id]); return i < 0 ? MISSIONS.length : i }
/** Comandantes que ya van contigo. */
export const allies = () => ['pikachu', ...MISSIONS.filter((m) => save.done[m.id] && m.joins).map((m) => m.joins!)]

let api: StoryApi
let host: HTMLElement
let screen: 'off' | 'world' | 'brief' | 'result' | 'play' = 'off'
let chosen = 0 // misión señalada en el mapa
let hero = 'pikachu' // comandante elegido para la misión
const q = <E extends HTMLElement>(sel: string) => host.querySelector(sel) as E
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))
const restart = (el: Element, cls: string) => { el.classList.remove(cls); void (el as HTMLElement).offsetWidth; el.classList.add(cls) }
const RANK_TEXT: Record<string, string> = { S: 'Impecable', A: 'Muy bien', B: 'Bien', C: 'Por los pelos' }

// ---------- Conversaciones ----------

let talkNext: (() => void) | null = null, talkSkip: (() => void) | null = null
/** Una conversación: retrato grande, nombre y texto que se escribe solo. Enter pasa; Esc la salta entera. */
export async function talk(lines: Line[]): Promise<void> {
  if (!lines.length) return
  const el = q('.st-talk')
  let skipped = false
  el.hidden = false
  restart(el, 'in')
  for (const [who, text, face = 'Normal'] of lines) {
    if (skipped) break
    const c = COMMANDERS[who]
    el.className = `st-talk in ${who ? (who === hero || who === 'pikachu' ? 'left' : 'right') : 'narr'}`
    el.style.setProperty('--c', c?.color ?? '#ffd84a')
    q('.st-talk .st-face').innerHTML = who ? `<img src="${facePath(who, face)}" alt="">` : ''
    q('.st-talk .st-name').textContent = c?.name ?? ''
    const line = q('.st-talk .st-line')
    restart(q('.st-talk .st-box'), 'bump')
    if (who) sfx.cry(who, 1, 0.25)
    let n = 0, done = false
    line.textContent = ''
    q('.st-talk .st-more').hidden = true
    const typing = window.setInterval(() => {
      line.textContent = text.slice(0, ++n)
      if (n % 3 === 1) sfx.cursor()
      if (n >= text.length) finish()
    }, 22)
    const finish = () => { clearInterval(typing); line.textContent = text; done = true; q('.st-talk .st-more').hidden = false }
    await new Promise<void>((resolve) => {
      talkNext = () => { if (!done) return finish(); sfx.confirm(); resolve() } // la primera pulsación completa la frase
      talkSkip = () => { skipped = true; clearInterval(typing); resolve() }
    })
  }
  talkNext = talkSkip = null
  el.hidden = true
}

// ---------- Mapa del mundo ----------

interface P { x: number; y: number }
const below = (m: Mission): P => ({ x: m.node[0], y: m.node[1] + 1 }) // la casilla de delante de la puerta
/** Camino por el mundo entre dos casillas, prefiriendo los senderos (los = cuestan menos). */
function route(from: P, to: P): P[] {
  const w = WORLD.rows[0].length, h = WORLD.rows.length, id = (p: P) => p.y * w + p.x
  const blocked = new Set<number>()
  for (const b of world.buildings) for (let dy = -1; dy <= 0; dy++) for (let dx = -1; dx <= 1; dx++) if (world.tiles[b.y + dy]?.[b.x + dx] === '#' || world.tiles[b.y + dy]?.[b.x + dx] === 'B') blocked.add((b.y + dy) * w + b.x + dx)
  const cost = new Map<number, number>([[id(from), 0]]), prev = new Map<number, P>(), open: P[] = [from]
  while (open.length) {
    open.sort((a, b) => cost.get(id(a))! - cost.get(id(b))!)
    const at = open.shift()!
    if (at.x === to.x && at.y === to.y) break
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const n = { x: at.x + dx, y: at.y + dy }
      if (n.x < 0 || n.y < 0 || n.x >= w || n.y >= h || blocked.has(id(n))) continue
      const ch = WORLD.rows[n.y][n.x], step = ch === '=' ? 1 : TERRAIN[ch].cost.walk > 9 ? 99 : 4
      const c = cost.get(id(at))! + step
      if (step < 99 && c < (cost.get(id(n)) ?? Infinity)) { cost.set(id(n), c); prev.set(id(n), at); open.push(n) }
    }
  }
  const path: P[] = []
  for (let at: P | undefined = to; at; at = prev.get(id(at))) path.unshift(at)
  return path[0]?.x === from.x && path[0]?.y === from.y ? path : [from, to]
}

let world: Game
const token = { x: 0, y: 0, dir: DIR.down, path: [] as P[], moving: false }
let tokenCtx: CanvasRenderingContext2D

function buildWorld() {
  const n = cleared()
  world = createGame(['pikachu', MISSIONS[Math.min(n, MISSIONS.length - 1)].foe], false, WORLD, true)
  for (const [i, m] of MISSIONS.entries()) {
    const b = world.buildings.find((it) => it.x === m.node[0] && it.y === m.node[1])!
    b.owner = i < n ? 0 : i === n ? 1 : -1 // liberado, el que toca, o aún cerrado
  }
  api.world(world)
}

/** Enseña el mapa del mundo, con la ficha en la misión que toca. */
async function showWorld(celebrate = false) {
  screen = 'world'
  buildWorld()
  host.hidden = false
  host.className = 'world'
  q('.st-nodes').innerHTML = MISSIONS.map((m, i) => `<button class="st-node" data-i="${i}"><i></i><b>${i + 1}</b></button>`).join('')
  host.querySelectorAll<HTMLButtonElement>('.st-node').forEach((btn, i) => (btn.onclick = () => { if (i <= cleared()) { if (i === chosen) openBrief(); else select(i) } }))
  const n = cleared(), at = Math.min(celebrate ? Math.max(0, n - 1) : n, MISSIONS.length - 1)
  chosen = at
  Object.assign(token, below(MISSIONS[at]), { path: [], moving: false })
  api.pan(token.x, token.y, true)
  void loadSpecies(save.hero)
  paintCard()
  q('.st-flags').innerHTML = MISSIONS.map((_, i) => `<i class="${i < n ? 'on' : ''}"></i>`).join('') + `<span>${n} de ${MISSIONS.length} banderas</span>`
  music.play('select')
  if (celebrate && n < MISSIONS.length) { await sleep(900); select(n) } // camina hasta la siguiente
}

function select(i: number) {
  if (i < 0 || i > Math.min(cleared(), MISSIONS.length - 1) || i === chosen) return
  // Recorre el camino de la historia, de misión en misión, hasta la elegida
  const step = i > chosen ? 1 : -1
  let from: P = { x: Math.round(token.x), y: Math.round(token.y) }
  const path: P[] = []
  for (let k = chosen + step; k !== i + step; k += step) { const leg = route(from, below(MISSIONS[k])); path.push(...leg.slice(1)); from = below(MISSIONS[k]) }
  token.path = path
  chosen = i
  sfx.cursor()
  paintCard()
}

function paintCard() {
  const m = MISSIONS[chosen], best = save.done[m.id], foe = COMMANDERS[m.foe]
  const card = q('.st-card')
  card.style.setProperty('--c', foe.color)
  card.innerHTML = `<small>MISIÓN ${chosen + 1} · ${m.place.toUpperCase()}</small><h3>${m.title}</h3>
    <div class="st-foe"><img src="${facePath(m.foe, 'Determined')}" alt=""><div><span>Rival</span><b>${foe.name}</b><i>${foe.title}</i></div></div>
    <p><b>Objetivo</b>${m.objective}</p>
    ${best ? `<div class="st-best rank-${best.rank}"><b>${best.rank}</b><span>Superada en ${best.days} días</span></div>` : '<div class="st-best new"><span>Sin superar</span></div>'}
    <button class="st-go">¡A LA BATALLA! <kbd>Enter</kbd></button>`
  q('.st-go').onclick = () => openBrief()
  restart(card, 'swap')
  host.querySelectorAll('.st-node').forEach((el, i) => { el.className = `st-node ${i < cleared() ? 'done' : i === cleared() ? 'next' : 'locked'} ${i === chosen ? 'sel' : ''}` })
}

/** Lo llama el bucle de pintado: mueve la ficha, lleva la cámara y recoloca los marcadores sobre el mapa. */
export function frame(time: number, dt: number) {
  if (screen !== 'world' && screen !== 'brief') return
  if (token.path.length) {
    const next = token.path[0], dx = next.x - token.x, dy = next.y - token.y, d = Math.hypot(dx, dy), step = dt * 0.009
    token.moving = true
    if (Math.abs(dx) + Math.abs(dy) > 0.01) token.dir = dirFrom(dx, dy)
    if (d <= step) { token.x = next.x; token.y = next.y; token.path.shift(); if (token.path.length % 2 === 0) sfx.step() } else { token.x += (dx / d) * step; token.y += (dy / d) * step }
    api.pan(token.x, token.y)
  } else token.moving = false
  const size = api.tile()
  host.querySelectorAll<HTMLElement>('.st-node').forEach((el, i) => {
    const [x, y] = api.screen(MISSIONS[i].node[0], MISSIONS[i].node[1] - 2.6)
    el.style.transform = `translate(${x}px, ${y}px)`
  })
  const [tx, ty] = api.screen(token.x, token.y), el = q<HTMLCanvasElement>('.st-token')
  el.style.width = el.style.height = size * 1.5 + 'px'
  el.style.transform = `translate(${tx - size * 0.75}px, ${ty - size * 1.05}px)`
  tokenCtx.imageSmoothingEnabled = false
  tokenCtx.clearRect(0, 0, 48, 48)
  tokenCtx.fillStyle = 'rgba(16, 40, 24, 0.35)'
  tokenCtx.beginPath(); tokenCtx.ellipse(24, 37, 10, 4, 0, 0, Math.PI * 2); tokenCtx.fill()
  drawSprite(tokenCtx, save.hero, token.moving ? 'Walk' : 'Idle', token.dir, time, 24, 24 - (token.moving ? 0 : Math.abs(Math.sin(time / 400)) * 2))
}

// ---------- Informe previo ----------

async function openBrief() {
  const m = MISSIONS[chosen]
  if (token.path.length) return // aún va de camino
  screen = 'brief'
  sfx.confirm()
  host.className = 'world talking'
  hero = m.hero ?? (allies().includes(save.hero) ? save.hero : 'pikachu')
  await talk(m.intro)
  host.className = 'world brief'
  paintBrief()
}
function paintBrief() {
  const m = MISSIONS[chosen], team = m.hero ? [m.hero] : allies(), c = COMMANDERS[hero]
  const el = q('.st-brief')
  el.style.setProperty('--c', c.color)
  el.innerHTML = `<small>MISIÓN ${chosen + 1} · ${m.place.toUpperCase()}</small><h2>${m.title}</h2>
    <div class="st-goal"><b>OBJETIVO</b><p>${m.objective}</p></div>
    <div class="st-note"><b>A TENER EN CUENTA</b><p>${m.also}</p></div>
    <div class="st-pick"><b>${m.hero ? 'TU COMANDANTE' : 'ELIGE COMANDANTE'}</b>
      <div class="st-heroes">${team.map((id) => `<button data-id="${id}" class="${id === hero ? 'on' : ''}" style="--c:${COMMANDERS[id].color}"><img src="${facePath(id, id === hero ? 'Determined' : 'Normal')}" alt=""><span>${COMMANDERS[id].name}</span></button>`).join('')}</div>
      <p><em>${c.power}</em> · ${c.powerHelp}</p></div>
    <div class="st-buttons"><button class="st-back">Volver <kbd>Esc</kbd></button><button class="st-start">¡EMPEZAR! <kbd>Enter</kbd></button></div>`
  host.querySelectorAll<HTMLButtonElement>('.st-heroes button').forEach((btn) => (btn.onclick = () => { hero = btn.dataset.id!; sfx.cursor(); sfx.cry(hero, 1, 0.4); paintBrief() }))
  q('.st-back').onclick = () => backToWorld()
  q('.st-start').onclick = () => void startMission()
}
function backToWorld() { sfx.cancel(); screen = 'world'; host.className = 'world' }

async function startMission() {
  const m = MISSIONS[chosen]
  sfx.confirm()
  save.hero = hero
  store()
  await cover()
  screen = 'play'
  host.className = 'play'
  api.mission(missionGame(m, hero))
  const banner = q('.st-banner')
  banner.innerHTML = `<small>MISIÓN ${chosen + 1}</small><b>${[...m.title].map((ch, i) => `<span style="--i:${i}">${ch === ' ' ? '&nbsp;' : ch}</span>`).join('')}</b><p>${m.objective}</p>`
  await uncover()
  banner.hidden = false
  restart(banner, 'go')
  api.hold(true)
  await sleep(2600)
  banner.hidden = true
  api.hold(false)
}

// ---------- Durante la misión ----------

/** Al empezar el turno del jugador: refuerzos y frases de ese día. */
export async function turnStart(g: Game) {
  for (const ev of happenings(g)) {
    const before = g.units.length
    api.hold(true)
    if (ev.spawn) {
      const fresh = g.units.slice(before - ev.spawn.length)
      api.drop(fresh)
      await sleep(900)
    }
    if (ev.lines) { host.className = 'play talking'; await talk(ev.lines); host.className = 'play' }
    api.hold(false)
  }
}

/** La misión ha terminado: se cuenta el final, se apunta el progreso y se enseña el resultado. */
export async function finished(g: Game) {
  const m = MISSIONS.find((it) => it.id === g.rules!.mission)!, i = MISSIONS.indexOf(m), won = g.winner === 0
  screen = 'result'
  chosen = i
  hero = g.co[0]
  host.hidden = false
  host.className = 'play talking'
  music.play(won ? 'victory' : 'defeat')
  await sleep(700)
  await talk(won ? m.outro : m.lost)
  const first = won && !save.done[m.id], grade = rank(m, g.day), old = save.done[m.id]
  if (won && (!old || g.day < old.days)) { save.done[m.id] = { days: g.day, rank: grade }; store() }
  const el = q('.st-result'), last = i === MISSIONS.length - 1
  host.className = `play result ${won ? 'won' : 'lost'}`
  el.style.setProperty('--c', COMMANDERS[won ? g.co[0] : m.foe].color)
  el.innerHTML = won
    ? `<h2>${[...'¡MISIÓN CUMPLIDA!'].map((ch, k) => `<span style="--i:${k}">${ch === ' ' ? '&nbsp;' : ch}</span>`).join('')}</h2>
      <div class="st-rank rank-${grade}"><b>${grade}</b><span>${RANK_TEXT[grade]}</span></div>
      <p class="st-days">En <b>${g.day}</b> días (la mejor nota, en ${m.par} o menos)</p>
      ${first && m.joins ? `<div class="st-join" style="--c:${COMMANDERS[m.joins].color}"><img src="${facePath(m.joins, 'Happy')}" alt=""><div><span>Se une a ti</span><b>${COMMANDERS[m.joins].name}</b><i>${COMMANDERS[m.joins].power}: ${COMMANDERS[m.joins].powerHelp}</i></div></div>` : ''}
      <div class="st-flags">${MISSIONS.map((_, k) => `<i class="${k < cleared() ? 'on' : ''}"></i>`).join('')}<span>${cleared()} de ${MISSIONS.length} banderas</span></div>
      <div class="st-buttons"><button class="st-retry">Repetir</button><button class="st-map main">${last ? 'Al mapa' : 'Continuar'} <kbd>Enter</kbd></button></div>`
    : `<h2>${[...'MISIÓN FALLIDA'].map((ch, k) => `<span style="--i:${k}">${ch === ' ' ? '&nbsp;' : ch}</span>`).join('')}</h2>
      <p class="st-days">${defeatReason(g)}</p>
      <p class="st-tip"><b>Recuerda</b> ${m.also}</p>
      <div class="st-buttons"><button class="st-map">Al mapa</button><button class="st-retry main">Reintentar <kbd>Enter</kbd></button></div>`
  restart(el, 'in')
  if (won) sfx.captured()
  q('.st-retry').onclick = () => void startMission()
  q('.st-map').onclick = async () => { sfx.confirm(); await cover(); await showWorld(first); await uncover() }
  q<HTMLButtonElement>('.st-buttons .main').focus()
}

// ---------- Entrada y salida ----------

export const story = {
  /** ¿Hay una pantalla de la historia delante (mapa, informe, resultado o alguien hablando)? */
  get busy() { return screen === 'world' || screen === 'brief' || screen === 'result' || !!talkNext },
  get progress() { return cleared() },
  init(deps: StoryApi) {
    api = deps
    host = document.querySelector('#story')!
    host.innerHTML = `<div class="st-world">
        <header><b>LA GUERRA DE LAS BANDERAS</b><div class="st-flags"></div></header>
        <div class="st-nodes"></div><canvas class="st-token" width="48" height="48"></canvas>
        <aside class="st-card"></aside>
        <footer><kbd>←</kbd><kbd>→</kbd> misión · <kbd>Enter</kbd> elegir · <kbd>Esc</kbd> salir al título</footer>
      </div>
      <div class="st-brief"></div>
      <div class="st-banner" hidden></div>
      <div class="st-result"></div>
      <div class="st-talk" hidden><div class="st-face"></div><div class="st-box"><b class="st-name"></b><p class="st-line"></p><i class="st-more" hidden>▼</i></div><small><kbd>Enter</kbd> seguir · <kbd>Esc</kbd> saltar</small></div>`
    tokenCtx = q<HTMLCanvasElement>('.st-token').getContext('2d')!
    q('.st-talk').onclick = () => talkNext?.()
  },
  /** Desde el título: abre el mapa del mundo. */
  async open() {
    save = load()
    await cover()
    await showWorld()
    await uncover()
  },
  /** Deja la historia (para volver al título o porque empieza otra cosa). */
  close() { screen = 'off'; host.hidden = true },
  /** Se reanuda una misión guardada: la historia sigue al tanto para cuando termine. */
  resume() { screen = 'play'; host.hidden = false; host.className = 'play' },
  /** Teclas mientras hay una pantalla de la historia delante. Devuelve si la tecla era suya. */
  key(k: string): boolean {
    const yes = k === 'Enter' || k === ' ' || k === 'z', no = k === 'Escape' || k === 'x'
    if (talkNext) { if (yes) talkNext(); else if (no) talkSkip?.(); return true }
    if (screen === 'world') {
      if (k === 'ArrowLeft' || k === 'ArrowUp') select(chosen - 1)
      else if (k === 'ArrowRight' || k === 'ArrowDown') select(chosen + 1)
      else if (yes) void openBrief()
      else if (no) { sfx.cancel(); void (async () => { await cover(); story.close(); api.title(); await uncover() })() }
      return true
    }
    if (screen === 'brief') {
      const m = MISSIONS[chosen], team = m.hero ? [m.hero] : allies(), at = team.indexOf(hero)
      if (k === 'ArrowLeft' || k === 'ArrowRight') { hero = team[(at + (k === 'ArrowRight' ? 1 : -1) + team.length) % team.length]; sfx.cursor(); if (team.length > 1) sfx.cry(hero, 1, 0.4); paintBrief() }
      else if (yes) void startMission()
      else if (no) backToWorld()
      return true
    }
    if (screen === 'result') {
      const buttons = [...host.querySelectorAll<HTMLButtonElement>('.st-result .st-buttons button')], at = buttons.indexOf(document.activeElement as HTMLButtonElement)
      if (k === 'ArrowLeft' || k === 'ArrowRight') { buttons[(at + 1) % buttons.length]?.focus(); sfx.cursor() }
      else if (yes) (buttons[at] ?? buttons[buttons.length - 1]).click()
      return true
    }
    return false
  },
}
