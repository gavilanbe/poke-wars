// Modo historia: el mapa del mundo para elegir misión, las conversaciones con retratos, el informe previo, los
// sucesos durante la batalla y la pantalla de resultado. Los datos (misiones, guion, reglas) están en campaign.ts;
// lo que necesita del juego se lo da main.ts en `init`.
import { CAST, Line, MISSIONS, Mission, PROLOGUE, VERDICT, WORLD, defeatReason, happenings, missionGame, rank } from './campaign'
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
  /** Aleja la vista hasta que el mapa entero quepa en ese rectángulo de la ventana (null: vista normal). */
  fit(rect: { x: number; y: number; w: number; h: number } | null): void
  /** Deja caer en el campo los refuerzos recién llegados. */
  drop(units: Unit[]): void
  /** Bloquea o devuelve el manejo del mapa mientras alguien habla. */
  hold(on: boolean): void
}

interface Save { done: Record<string, { days: number; rank: string }>; hero: string; intro?: boolean } // `intro`: ya se ha visto el prólogo
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
/** Como restart, pero la clase se va sola cuando acaba su animación. */
const flash = (el: Element, cls: string) => { restart(el, cls); (el as HTMLElement).onanimationend = () => el.classList.remove(cls) }
const RANK_TEXT: Record<string, string> = { S: 'Impecable', A: 'Muy bien', B: 'Bien', C: 'Por los pelos' }

// ---------- Conversaciones ----------
// Como una escena de cine: bandas negras arriba y abajo, un personaje a cada lado (los nuestros a la izquierda) y el
// que habla iluminado y gesticulando según su cara. El narrador habla con la pantalla para él solo.

/** Nombre y color de quien habla, sea comandante o personaje de la historia. */
const cast = (who: string) => COMMANDERS[who] ?? CAST[who]
let talkNext: (() => void) | null = null, talkSkip: (() => void) | null = null
let busy = false // hay una transición en marcha: las pulsaciones repetidas no la lanzan dos veces

/** Espera a que se pulse Enter (o a que pasen `ms`, si se da). Esc cuenta igual. */
const pause = (ms?: number) => new Promise<void>((resolve) => {
  const done = () => { clearTimeout(timer); talkNext = talkSkip = null; resolve() }
  const timer = ms ? window.setTimeout(done, ms) : 0
  talkNext = talkSkip = done
})

/** Una conversación. Enter completa la frase y luego pasa a la siguiente; Esc la salta entera. */
export async function talk(lines: Line[]): Promise<void> {
  if (!lines.length) return
  const el = q('.st-talk'), ours = new Set(['pikachu', ...allies()])
  // El Maestro y Chatot van con los nuestros cuando hay un rival delante; si no, se ponen enfrente para hablar contigo
  if (lines.some(([who]) => who && !ours.has(who) && !CAST[who])) for (const id of Object.keys(CAST)) ours.add(id)
  const actor = { left: q('.st-actor.left'), right: q('.st-actor.right') }, on: Record<string, string> = { left: '', right: '' }
  let skipped = false
  for (const side of ['left', 'right'] as const) { actor[side].className = `st-actor ${side} out`; actor[side].querySelector('img')!.removeAttribute('src') }
  el.hidden = false
  restart(el, 'in')
  for (const [who, text, face = 'Normal'] of lines) {
    if (skipped) break
    const c = cast(who), side = !who ? '' : ours.has(who) ? 'left' : 'right'
    el.className = `st-talk in ${side ? 'from-' + side : 'narr'}`
    el.style.setProperty('--c', c?.color ?? '#ffd84a')
    for (const s of ['left', 'right'] as const) actor[s].classList.toggle('on', s === side)
    if (side) {
      const a = actor[side], fresh = on[side] !== who
      on[side] = who
      a.style.setProperty('--c', c.color)
      a.querySelector('img')!.src = facePath(who, face)
      a.querySelector('b')!.textContent = c.name
      a.className = `st-actor ${side} on`
      void a.offsetWidth
      a.classList.add(fresh ? 'enter' : 'fx-' + face) // entra en escena, o gesticula según su cara
      sfx.cry(who, 1, 0.22)
    }
    q('.st-talk .st-name').textContent = c?.name ?? ''
    const line = q('.st-talk .st-line')
    restart(q('.st-talk .st-box'), 'bump')
    let n = 0, done = false
    line.textContent = ''
    q('.st-talk .st-more').hidden = true
    const finish = () => { clearInterval(typing); line.textContent = text; done = true; q('.st-talk .st-more').hidden = false }
    const typing = window.setInterval(() => {
      line.textContent = text.slice(0, (n += 2))
      if (n % 6 === 2) sfx.cursor()
      if (n >= text.length) finish()
    }, 26)
    await new Promise<void>((resolve) => {
      talkNext = () => { if (!done) return finish(); sfx.confirm(); resolve() } // la primera pulsación completa la frase
      talkSkip = () => { skipped = true; clearInterval(typing); resolve() }
    })
  }
  talkNext = talkSkip = null
  el.hidden = true
}

/** Tarjeta de capítulo: el número, el título y el rival, a toda pantalla, antes de que nadie hable. */
async function chapterCard(i: number) {
  const m = MISSIONS[i], foe = COMMANDERS[m.foe], el = q('.st-chapter')
  el.style.setProperty('--c', foe.color)
  el.innerHTML = `<div class="st-stripes"></div>
    <div class="st-chap-text"><small>CAPÍTULO</small><b>${i + 1}</b><h2>${[...m.title].map((ch, k) => `<span style="--i:${k}">${ch === ' ' ? '&nbsp;' : ch}</span>`).join('')}</h2><p>${m.place}</p></div>
    <div class="st-chap-foe"><img src="${facePath(m.foe, 'Determined')}" alt=""><span>contra</span><b>${foe.name}</b></div>`
  el.hidden = false
  restart(el, 'go')
  sfx.fanfare(m.foe) // la fanfarria de ataque del rival de este capítulo
  setTimeout(() => sfx.cry(m.foe, 1, 0.5), 900)
  await pause(3200)
  el.hidden = true
}

/** Tras el prólogo: la credencial de comandante, con el sello de «reclutado». */
async function license() {
  const el = q('.st-license')
  el.innerHTML = `<div class="st-id"><header><b>LIGA DE LAS BANDERAS</b><span>Credencial de comandante</span></header>
      <img src="${facePath('pikachu', 'Happy')}" alt="">
      <dl><dt>Nombre</dt><dd>Pikachu</dd><dt>Destino</dt><dd>Villa Central</dd><dt>Le recluta</dt><dd>El Gran Maestro</dd><dt>Le examina</dt><dd>Chatot (muy exigente)</dd></dl>
      <i class="st-stamp">RECLUTADO</i></div>
    <p><span class="tecla"><kbd>Enter</kbd> para empezar</span><span class="dedo">Toca para empezar</span></p>`
  el.hidden = false
  restart(el, 'go')
  sfx.confirm()
  setTimeout(() => { sfx.bigHit(); sfx.cry('pikachu', 1, 0.6) }, 900)
  await sleep(1300)
  await pause()
  sfx.confirm()
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

/** Coloca el mapa: la región entera a la izquierda de la ficha de misión, con su marco, y el fondo recortado alrededor. */
function layout() {
  if (screen !== 'world' && screen !== 'brief') return
  const vh = innerHeight / 100, card = Math.min(50 * vh, innerWidth * 0.36) * (document.documentElement.classList.contains('touch') ? 1.2 : 1) // con el dedo la ficha va ampliada (hud.css)
  api.fit({ x: 4 * vh, y: 13 * vh, w: innerWidth - card - 12 * vh, h: innerHeight - 21 * vh })
  const [x0, y0] = api.screen(-0.5, -0.5), u = api.tile(), w = WORLD.rows[0].length * u, h = WORLD.rows.length * u
  const map = q('.st-frame')
  Object.assign(map.style, { left: x0 + 'px', top: y0 + 'px', width: w + 'px', height: h + 'px' })
  map.style.setProperty('--u', u + 'px')
  // El fondo tapa todo menos el hueco del mapa
  q('.st-backdrop').style.clipPath = `polygon(evenodd, 0 0, 100% 0, 100% 100%, 0 100%, 0 0, ${x0}px ${y0}px, ${x0}px ${y0 + h}px, ${x0 + w}px ${y0 + h}px, ${x0 + w}px ${y0}px, ${x0}px ${y0}px)`
}
addEventListener('resize', layout)
/** Posición dentro del marco, en porcentaje, de una casilla del mundo. */
const at = (x: number, y: number) => `left:${((x + 0.5) / WORLD.rows[0].length) * 100}%;top:${((y + 0.5) / WORLD.rows.length) * 100}%`

/** Lo que el mapa enseña como superado y como abierto: va por detrás del guardado mientras dura la celebración. */
let doneShown = 0, openShown = 0
const dotAt = new Map<string, HTMLElement>()
/** Suelta un efecto de usar y tirar sobre una casilla del mapa. */
function fx(cls: string, x: number, y: number, style = '') {
  const el = document.createElement('i')
  el.className = cls
  el.style.cssText = at(x, y) + ';' + style
  el.onanimationend = () => el.remove()
  q('.st-fx').append(el)
}
function burst(x: number, y: number, colors: string[], n = 14) {
  fx('st-wave', x, y)
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2 + Math.random() * 0.4, d = 1.2 + Math.random() * 1.6
    fx('st-bit', x, y, `--dx:${Math.cos(a) * d};--dy:${Math.sin(a) * d - 0.8};background:${colors[k % colors.length]};animation-delay:${Math.random() * 60}ms`)
  }
}

/** Tras ganar: se planta la bandera, la ruta se enciende punto a punto y el siguiente destino se abre de golpe. */
async function celebration(n: number) {
  const on = () => screen === 'world'
  await sleep(500)
  if (!on()) return
  const won = MISSIONS[n - 1]
  doneShown = n
  paintCard()
  burst(won.node[0], won.node[1] - 1.9, ['#ffd84a', '#fff', '#58d870', '#f4645a'], 18)
  const flag = host.querySelectorAll<HTMLElement>('.st-flags i')[n - 1]
  flag.classList.add('on'); restart(flag, 'new')
  q('.st-flags span').textContent = `${n} de ${MISSIONS.length} banderas`
  sfx.ready()
  if (n >= MISSIONS.length) return
  await sleep(650)
  for (const [k, el] of [...host.querySelectorAll<HTMLElement>(`.st-dot[data-leg="${n}"]`)].entries()) {
    if (!on()) return
    el.classList.add('open'); flash(el, 'hit')
    if (k % 2 === 0) sfx.coin()
    await sleep(55)
  }
  await sleep(200)
  if (!on()) return
  openShown = n
  paintCard()
  const next = MISSIONS[n]
  restart(host.querySelector(`.st-node[data-i="${n}"]`)!, 'unlock')
  burst(next.node[0], next.node[1] - 1.9, ['#f4645a', '#ffd84a', '#fff'])
  sfx.land()
  await sleep(600)
  if (on() && chosen === n - 1) select(n) // camina hasta la siguiente
}

/** Enseña el mapa del mundo, con la ficha en la misión que toca. */
async function showWorld(celebrate = false) {
  screen = 'world'
  buildWorld()
  host.hidden = false
  host.className = 'world'
  const n = cleared()
  // La ruta de la historia, punteada de misión en misión: dorada hasta donde se ha llegado
  let dots = ''
  celebrate &&= n > 0
  doneShown = celebrate ? n - 1 : n
  openShown = doneShown
  let k = 0
  for (let i = 1; i < MISSIONS.length; i++) for (const p of route(below(MISSIONS[i - 1]), below(MISSIONS[i])).slice(1, -1)) dots += `<i class="st-dot ${i <= openShown ? 'open' : ''}" data-leg="${i}" data-at="${p.x},${p.y}" style="${at(p.x, p.y)};--k:${k++}"></i>`
  // El cartel va bajo la puerta, salvo que ahí caiga el pin de otra misión: entonces, a un lado
  const label = (m: Mission) => MISSIONS.some((o) => o !== m && Math.abs(o.node[0] - m.node[0]) < 3 && Math.abs(o.node[1] - 1.9 - (m.node[1] + 1.15)) < 1.2)
    ? `${at(m.node[0] + 1.7, m.node[1] - 0.2)};translate:0 -50%` : at(m.node[0], m.node[1] + 1.15)
  q('.st-nodes').innerHTML = dots + MISSIONS.map((m, i) => `<button class="st-node" data-i="${i}" style="${at(m.node[0], m.node[1] - 1.9)};--k:${i}"><i></i><b>${i + 1}</b></button>
    <span class="st-place" data-i="${i}" style="${label(m)};--k:${i}">${m.place}</span>`).join('')
  dotAt.clear()
  host.querySelectorAll<HTMLElement>('.st-dot').forEach((el) => dotAt.set(el.dataset.at!, el))
  q('.st-fx').innerHTML = ''
  restart(q('.st-frame'), 'enter')
  setTimeout(() => q('.st-frame').classList.remove('enter'), 1800)
  host.querySelectorAll<HTMLButtonElement>('.st-node').forEach((btn, i) => (btn.onclick = () => { if (i <= cleared()) { if (i === chosen) void openBrief(); else select(i) } }))
  const start = Math.min(celebrate ? Math.max(0, n - 1) : n, MISSIONS.length - 1)
  chosen = start
  Object.assign(token, below(MISSIONS[start]), { path: [], moving: false })
  layout()
  void loadSpecies(save.hero)
  paintCard()
  q('.st-flags').innerHTML = MISSIONS.map((_, i) => `<i class="${i < doneShown ? 'on' : ''}" style="--k:${i}"></i>`).join('') + `<span>${doneShown} de ${MISSIONS.length} banderas</span>`
  music.play('select')
  if (celebrate) void celebration(n)
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
  host.querySelectorAll('.st-node').forEach((el, i) => { el.className = `st-node ${i < doneShown ? 'done' : i <= openShown ? 'next' : 'locked'} ${i === chosen ? 'sel' : ''}` })
  host.querySelectorAll('.st-place').forEach((el, i) => { el.className = `st-place ${i > openShown ? 'locked' : ''} ${i === chosen ? 'sel' : ''}` })
  const ring = q('.st-ring')
  ring.style.cssText = at(m.node[0], m.node[1] + 1)
  ring.style.setProperty('--c', foe.color)
}

/** Lo llama el bucle de pintado: mueve la ficha, lleva la cámara y recoloca los marcadores sobre el mapa. */
export function frame(time: number, dt: number) {
  if (screen !== 'world' && screen !== 'brief') return
  if (token.path.length) {
    const next = token.path[0], dx = next.x - token.x, dy = next.y - token.y, d = Math.hypot(dx, dy), step = dt * 0.009
    token.moving = true
    if (Math.abs(dx) + Math.abs(dy) > 0.01) token.dir = dirFrom(dx, dy)
    if (d <= step) {
      token.x = next.x; token.y = next.y; token.path.shift()
      if (token.path.length % 2 === 0) sfx.step()
      fx('st-dust', next.x, next.y + 0.3)
      const dot = dotAt.get(`${next.x},${next.y}`)
      if (dot) flash(dot, 'hit')
      if (!token.path.length) { // ha llegado: saltito, onda y el pin se asoma
        flash(q('.st-token'), 'land')
        fx('st-wave', next.x, next.y)
        const pin = host.querySelector(`.st-node[data-i="${chosen}"]`)
        if (pin) restart(pin, 'ping')
        sfx.select()
      }
    } else { token.x += (dx / d) * step; token.y += (dy / d) * step }
    api.pan(token.x, token.y)
  } else token.moving = false
  const el = q<HTMLCanvasElement>('.st-token')
  el.style.left = ((token.x + 0.5) / WORLD.rows[0].length) * 100 + '%'
  el.style.top = ((token.y + 0.5) / WORLD.rows.length) * 100 + '%'
  tokenCtx.imageSmoothingEnabled = false
  tokenCtx.clearRect(0, 0, 48, 48)
  tokenCtx.fillStyle = 'rgba(16, 40, 24, 0.35)'
  tokenCtx.beginPath(); tokenCtx.ellipse(24, 37, 10, 4, 0, 0, Math.PI * 2); tokenCtx.fill()
  drawSprite(tokenCtx, save.hero, token.moving ? 'Walk' : 'Idle', token.dir, time, 24, 24 - (token.moving ? 0 : Math.abs(Math.sin(time / 400)) * 2))
}

// ---------- Informe previo ----------

async function openBrief() {
  const m = MISSIONS[chosen]
  if (busy || screen !== 'world') return
  busy = true
  if (token.path.length) { Object.assign(token, below(m), { path: [], moving: false }); api.pan(token.x, token.y) } // si aún iba de camino, llega de un salto
  screen = 'brief'
  sfx.confirm()
  host.className = 'world talking'
  hero = m.hero ?? (allies().includes(save.hero) ? save.hero : 'pikachu')
  await chapterCard(chosen)
  await talk(m.intro)
  host.className = 'world brief'
  paintBrief()
  busy = false
}
function paintBrief() {
  const m = MISSIONS[chosen], team = m.hero ? [m.hero] : allies(), c = COMMANDERS[hero]
  const el = q('.st-brief')
  el.style.setProperty('--c', c.color)
  el.innerHTML = `<small>MISIÓN ${chosen + 1} · ${m.place.toUpperCase()}</small><h2>${m.title}</h2>
    <div class="st-goal"><b>OBJETIVO</b><p>${m.objective}</p></div>
    <div class="st-note"><img src="${facePath('chatot', 'Determined')}" alt=""><div><b>CONSEJO DE CHATOT</b><p>${m.also}</p></div></div>
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
  if (busy) return
  busy = true
  sfx.confirm()
  save.hero = hero
  store()
  await cover()
  screen = 'play'
  host.className = 'play'
  api.mission(missionGame(m, hero))
  const banner = q('.st-banner')
  banner.innerHTML = `<small>MISIÓN ${chosen + 1}</small><b>${[...m.title].map((ch, i) => `<span style="--i:${i}">${ch === ' ' ? '&nbsp;' : ch}</span>`).join('')}</b><p>${m.objective}</p><i><kbd>Enter</kbd> para empezar</i>`
  await uncover()
  banner.hidden = false
  restart(banner, 'go')
  api.hold(true)
  await pause(4000) // Enter lo quita antes
  banner.hidden = true
  api.hold(false)
  busy = false
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
      <div class="st-verdict"><img src="${facePath('chatot', VERDICT[grade][2])}" alt=""><p>«${VERDICT[grade][1]}»</p></div>
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
  q('.st-map').onclick = async () => {
    if (busy) return
    busy = true
    sfx.confirm()
    await cover()
    await showWorld(first)
    await uncover()
    busy = false
  }
  q<HTMLButtonElement>('.st-buttons .main').focus()
}

// ---------- Entrada y salida ----------

export const story = {
  /** ¿Hay una pantalla de la historia delante (mapa, informe, resultado o alguien hablando)? */
  get busy() { return screen === 'world' || screen === 'brief' || screen === 'result' || !!talkNext || busy },
  get progress() { return cleared() },
  init(deps: StoryApi) {
    api = deps
    host = document.querySelector('#story')!
    host.innerHTML = `<div class="st-world">
        <div class="st-backdrop"></div>
        <header><button class="st-exit">↩ Título</button><b>LA GUERRA DE LAS BANDERAS</b><div class="st-flags"></div></header>
        <div class="st-frame"><div class="st-nodes"></div><i class="st-ring"></i><div class="st-fx"></div><canvas class="st-token" width="48" height="48"></canvas><div class="st-sky"><i></i><i></i><i></i></div></div>
        <aside class="st-card"></aside>
        <footer><kbd>←</kbd><kbd>→</kbd> misión · <kbd>Enter</kbd> elegir · <kbd>Esc</kbd> salir al título</footer>
      </div>
      <div class="st-brief"></div>
      <div class="st-banner" hidden></div>
      <div class="st-result"></div>
      <div class="st-chapter" hidden></div>
      <div class="st-license" hidden></div>
      <div class="st-talk" hidden><div class="st-bar top"></div><div class="st-bar bot"></div>
        <div class="st-actor left"><div class="st-pic"><img alt=""></div><b></b></div><div class="st-actor right"><div class="st-pic"><img alt=""></div><b></b></div>
        <div class="st-box"><b class="st-name"></b><p class="st-line"></p><i class="st-more" hidden>▼</i></div><small><kbd>Enter</kbd> seguir · <kbd>Esc</kbd> saltar la escena</small><button class="st-skip">Saltar ⏭&#xFE0E;</button></div>`
    tokenCtx = q<HTMLCanvasElement>('.st-token').getContext('2d')!
    for (const sel of ['.st-talk', '.st-chapter', '.st-license', '.st-banner']) q(sel).onclick = () => talkNext?.()
    // Lo que con teclado es Esc, con botón: saltar la escena y salir al título
    q('.st-skip').onclick = (e) => { e.stopPropagation(); story.key('Escape') }
    q('.st-exit').onclick = () => story.key('Escape')
  },
  /** Desde el título: abre el mapa del mundo. */
  async open() {
    if (busy) return
    busy = true
    save = load()
    await cover()
    await showWorld()
    if (!save.intro) host.className = 'world talking'
    await uncover()
    if (!save.intro) { // la primera vez: de dónde viene todo esto y cómo te hacen comandante
      screen = 'brief'
      await sleep(400)
      await talk(PROLOGUE)
      await license()
      save.intro = true
      store()
      screen = 'world'
      host.className = 'world'
    }
    busy = false
  },
  /** Deja la historia (para volver al título o porque empieza otra cosa). */
  close() { screen = 'off'; host.hidden = true },
  /** Se reanuda una misión guardada: la historia sigue al tanto para cuando termine. */
  resume() { screen = 'play'; host.hidden = false; host.className = 'play' },
  /** Teclas mientras hay una pantalla de la historia delante. Devuelve si la tecla era suya. */
  key(k: string): boolean {
    const yes = k === 'Enter' || k === ' ' || k === 'z', no = k === 'Escape' || k === 'x'
    if (talkNext) { if (yes) talkNext(); else if (no) talkSkip?.(); return true }
    if (busy) return true // en mitad de una transición no se atiende nada más
    if (screen === 'world') {
      if (k === 'ArrowLeft' || k === 'ArrowUp') select(chosen - 1)
      else if (k === 'ArrowRight' || k === 'ArrowDown') select(chosen + 1)
      else if (yes) void openBrief()
      else if (no && !busy) { busy = true; sfx.cancel(); void (async () => { await cover(); story.close(); api.title(); await uncover(); busy = false })() }
      return true
    }
    if (screen === 'brief') {
      const m = MISSIONS[chosen], team = m.hero ? [m.hero] : allies(), at = team.indexOf(hero)
      if (k === 'ArrowLeft' || k === 'ArrowRight') { hero = team[(at + (k === 'ArrowRight' ? 1 : -1) + team.length) % team.length]; sfx.cursor(); if (team.length > 1) sfx.cry(hero, 1, 0.4); paintBrief() }
      else if (busy) return true
      else if (yes) void startMission()
      else if (no) backToWorld()
      return true
    }
    if (screen === 'result') {
      const buttons = [...host.querySelectorAll<HTMLButtonElement>('.st-result .st-buttons button')], at = buttons.indexOf(document.activeElement as HTMLButtonElement)
      if (k === 'ArrowLeft' || k === 'ArrowRight') { buttons[(at + 1) % buttons.length]?.focus(); sfx.cursor() }
      else if (yes) (buttons[at] ?? buttons[buttons.length - 1])?.click() // aún no hay botones mientras se cuenta el final
      return true
    }
    return false
  },
}
