// Escenas a pantalla completa: combate y captura. Todo se dibuja en un lienzo de 256x176 (vista lateral,
// como las escenas de Advance Wars) con los sprites de Mundo Misterioso y los efectos de Esmeralda.
import { ATTACK_NAME, BUILDING_INFO, BuildingType, KINDS, PType, ROLES, TYPE_COLOR, TYPE_NAME, bestMove, moveMult } from './data'
import { BALLS } from './game'
import { Actor, Part, Scene, easeBack, easeIn, easeOut, rnd } from './scene'
import { music, sfx } from './sfx'
import { cover, uncover } from './ui'
import { DIR, facePath, spriteHeight } from './units'

const W = 256, H = 176
const TEAM_HEX = ['#e8483c', '#3c7ce8']

let scene: Scene
let root: HTMLElement
let water: HTMLImageElement // autotile animado del mapa
let grayPieces: HTMLCanvasElement // edificios sin dueño
let pieces: HTMLImageElement
let pieceAt: Record<string, { x: number; w: number; h: number }>

export function initCutscenes(
  el: HTMLElement, pieceImg: HTMLImageElement, pieceMeta: Record<string, { x: number; w: number; h: number }>, waterImg: HTMLImageElement, grayImg: HTMLCanvasElement,
) {
  grayPieces = grayImg
  root = el
  pieces = pieceImg
  pieceAt = pieceMeta
  water = waterImg
  scene = new Scene(el.querySelector('canvas')!, W, H)
}

// ---------- Fondos ----------

export interface Place { terrain: string; building?: { type: string; owner: number } }

const SKY = ['#58a8f0', '#70b8f4', '#90ccf8', '#b0dcf8', '#d0ecfc']
const SUNSET = ['#e88858', '#f0a068', '#f4b880', '#f8d0a0', '#fce4c4']
const LOOK: Record<string, { sky: string[]; hill: string; far: string }> = {
  '.': { sky: SKY, hill: '#58b888', far: '#88c8c8' },
  '"': { sky: SKY, hill: '#58b888', far: '#88c8c8' },
  T: { sky: SKY, hill: '#3c9464', far: '#6cb098' },
  M: { sky: SUNSET, hill: '#a87858', far: '#d8a888' },
  '~': { sky: SKY, hill: '#4890d8', far: '#90c8f0' },
  s: { sky: SKY, hill: '#4890d8', far: '#90c8f0' },
  '=': { sky: SKY, hill: '#58b888', far: '#88c8c8' },
  B: { sky: SKY, hill: '#58b888', far: '#88c8c8' },
}

// El mapa pinta la montaña como peñas sobre hierba, así que no hay baldosa de roca que reutilizar: se hace una aquí,
// de 64 px (para que no se note la repetición) y que encaja consigo misma, con tierra parda, vetas, grietas y guijarros a píxel gordo (2 px, como el resto).
let rocky: HTMLCanvasElement | null = null
function rockyGround(): HTMLCanvasElement {
  if (rocky) return rocky
  rocky = document.createElement('canvas')
  rocky.width = rocky.height = 64
  const c = rocky.getContext('2d')!
  let seed = 7
  const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647
  const dot = (x: number, y: number, w: number, h: number, color: string) => { // en una rejilla de 2 px y dando la vuelta por los bordes
    c.fillStyle = color
    for (const ox of [0, -64]) for (const oy of [0, -64]) c.fillRect(((x * 2) % 64) + ox, ((y * 2) % 64) + oy, w * 2, h * 2)
  }
  c.fillStyle = '#c8a070'
  c.fillRect(0, 0, 64, 64)
  for (let i = 0; i < 26; i++) dot(Math.floor(rand() * 32), Math.floor(rand() * 32), 3 + Math.floor(rand() * 4), 1, '#d4b080') // vetas claras
  for (let i = 0; i < 20; i++) dot(Math.floor(rand() * 32), Math.floor(rand() * 32), 2 + Math.floor(rand() * 3), 1, '#b88c60') // y oscuras
  for (let i = 0; i < 5; i++) { // grietas en escalera
    let x = Math.floor(rand() * 32), y = Math.floor(rand() * 32)
    for (let k = 0; k < 4; k++) { dot(x, y, 1, 1, '#8c6444'); x += rand() < 0.5 ? 1 : 0; y += 1 }
  }
  for (let i = 0; i < 9; i++) { // guijarros con su sombra y su brillo
    const x = Math.floor(rand() * 32), y = Math.floor(rand() * 32)
    dot(x, y + 1, 2, 1, '#8c6444')
    dot(x, y, 2, 1, '#a89888')
    dot(x, y, 1, 1, '#e4dcd0')
  }
  // Se guarda repetida con margen (96 px): así cualquier recorte de 32 px, empiece donde empiece, cae dentro
  const wide = document.createElement('canvas')
  wide.width = wide.height = 96
  for (const ox of [0, 64]) for (const oy of [0, 64]) wide.getContext('2d')!.drawImage(rocky, ox, oy)
  return (rocky = wide)
}

/** Un tile de suelo del mapa (16 px) pintado a doble tamaño, según el terreno. */
function groundTile(ctx: CanvasRenderingContext2D, terrain: string, x: number, y: number, time: number) {
  if (terrain === 'M') return void ctx.drawImage(rockyGround(), ((x % 64) + 64) % 64, ((y % 64) + 64) % 64, 32, 32, x, y, 32, 32)
  if (terrain === '~' || terrain === 's') {
    ctx.drawImage(water, (Math.floor(time / 110) % 32) * 48 + 16, 32, 16, 16, x, y, 32, 32)
  } else if (terrain === '=' || terrain === 'B') {
    ctx.drawImage(pieces, pieceAt.path.x + 16, 16, 16, 16, x, y, 32, 32)
  } else {
    ctx.drawImage(pieces, pieceAt.grass.x + (((x >> 5) % 4 + 4) % 4) * 16, ((y >> 5) % 4) * 16, 16, 16, x, y, 32, 32)
  }
}
/** Una pieza del mapa (pino, roca…) a doble tamaño, apoyada en `baseY`. */
function prop(ctx: CanvasRenderingContext2D, name: string, cx: number, baseY: number) {
  const p = pieceAt[name]
  ctx.drawImage(pieces, p.x, 0, p.w, p.h, Math.round(cx - p.w), baseY - p.h * 2, p.w * 2, p.h * 2)
}
const tallGrass = (ctx: CanvasRenderingContext2D, x: number, y: number) => ctx.drawImage(pieces, pieceAt.tall.x, 0, 16, 16, x, y, 32, 32)

let light = ''
/** Tinte de la escena según la hora y el tiempo del mapa ('' para ninguno). */
export const setSceneLight = (rgba: string) => { light = rgba }

// ---------- Interfaz sobre la escena ----------

// El combate se dibuja en un lienzo tan ancho como la ventana: `pad` es lo que sobra a cada lado de los 256 px de siempre
let pad = 0
const pct = (x: number, y: number) => `left:${((x + pad) / (W + pad * 2)) * 100}%;top:${(y / H) * 100}%`

function stamp(text: string, x: number, y: number, cls = '') {
  const el = document.createElement('div')
  el.className = 'stamp ' + cls
  el.style.cssText = pct(x, y)
  el.textContent = text
  root.append(el)
  setTimeout(() => el.remove(), 1500)
  return el
}

function setPlate(el: HTMLElement, kind: string, team: number, hp: number, xp: number | null = null) {
  const k = KINDS[kind]
  el.className = `plate ${el.classList.contains('left') ? 'left' : 'right'} t${team}`
  el.querySelector<HTMLImageElement>('img')!.src = facePath(k.species)
  el.querySelector('.name')!.textContent = k.name
  el.querySelector('.type')!.innerHTML = `<span class="pill" style="background:${TYPE_COLOR[k.type]}">${TYPE_NAME[k.type]}</span>`
  if (!el.querySelector('.xp')) el.querySelector('.hp')!.insertAdjacentHTML('afterend', '<div class="xp"><i></i></div>')
  el.querySelector<HTMLElement>('.xp')!.hidden = xp === null
  el.querySelector<HTMLElement>('.xp i')!.style.width = Math.min(1, xp ?? 0) * 100 + '%'
  el.classList.remove('low', 'evo')
  setHp(el, hp)
}

function setHp(el: HTMLElement, hp: number) {
  hp = Math.max(0, hp)
  el.querySelector<HTMLElement>('.hp i')!.style.width = el.querySelector<HTMLElement>('.hp u')!.style.width = hp * 10 + '%'
  el.querySelector<HTMLElement>('.hp i')!.style.background = hp > 5 ? '#58d058' : hp > 2 ? '#f0c030' : '#e84838'
  el.querySelector('.hpnum')!.textContent = `${hp}`
}

/** Los PS bajan con espectáculo: la barra cae dejando un tramo blanco detrás y el número va contando hacia abajo. */
function dropHp(el: HTMLElement, from: number, to: number) {
  const num = el.querySelector<HTMLElement>('.hpnum')!
  setHp(el, to)
  num.textContent = `${from}`
  let n = from
  const tick = setInterval(() => {
    n--
    num.textContent = `${Math.max(to, n)}`
    restartClass(num, 'tick')
    if (n <= to) clearInterval(tick)
  }, Math.max(40, 420 / Math.max(1, from - to)))
}

const say = (text: string) => { root.querySelector('.msg')!.textContent = text }

/** Entra con la cortinilla de barras: tapa el mapa, monta la escena y destapa. */
async function open(mode: string, wipe: number | 'wild' = -1) {
  await cover(wipe)
  root.className = mode
  root.hidden = false
  root.querySelectorAll('.stamp').forEach((el) => el.remove())
  scene.start()
  void uncover()
}

async function close() {
  await cover()
  scene.stop()
  root.hidden = true
  void uncover()
}

// Los Pokémon pequeños se ven a 3x y los grandes a 2x para que quepan
const scaleOf = (kind: string) => (spriteHeight(KINDS[kind].species) > 48 ? 2 : 3)

// ---------- Combate ----------
// Como en Advance Wars: la pantalla partida en dos paneles en diagonal, cada uno con el paisaje de su casilla, y los
// dos Pokémon de perfil, frente a frente. El ataque depende de quién lo hace: cuerpo a cuerpo cruza la costura y
// golpea; un Tirador dispara de panel a panel; un Artillero lanza por arriba y cae sobre la marca.

interface Side {
  actor: Actor; kind: string; team: number; hp: number; plate: HTMLElement; place: Place
  sign: number // hacia dónde mira: 1 el de la izquierda, -1 el de la derecha
  depth: number // (siempre 1: los dos están a la misma distancia de la cámara)
  home: [number, number]
  panel: number // 0 el izquierdo, 1 el derecho
  busy?: boolean // está atacando: que no le pise el jadeo
}
type Move = (a: Side, d: Side) => Promise<void> // se resuelve en el momento del impacto

const HORIZON = 100, FEET = 142
const body = (s: Side): [number, number] => [s.actor.x + s.actor.ox, s.actor.y + s.actor.oy - 10 * s.actor.scale]
/** Tamaño de los efectos sobre alguien, según lo cerca que esté de la cámara. */
const size = (_s: Side) => 1

// Lo que vuela de uno a otro crece o encoge por el camino (se acerca o se aleja de la cámara)
let aim = 1
const shoot = (p: Part) => scene.add(aim === 1 ? p : { ...p, scale: (p.scale ?? 1) * (aim < 1 ? 1.2 : 0.75), grow: (p.grow ?? 1) * (aim < 1 ? 0.62 : 1.6) })
/** Efecto animado sobre el objetivo, a su tamaño. */
const hitFx = (d: Side, img: string, opts: Partial<Part> = {}, ox = 0, oy = 0) => {
  const [dx, dy] = body(d), k = size(d)
  return scene.fx(img, dx + ox * k, dy + oy * k, { ...opts, scale: (opts.scale ?? 2) * k })
}
let gap = 1 // casillas entre los dos en el mapa
let mark: { x: number; y: number; at: number; k: number } | null = null // mira del Artillero sobre el objetivo

/** Chorro continuo del atacante al objetivo (fuego, agua, aliento). */
async function stream(a: Side, d: Side, spawn: (x: number, y: number, vx: number, vy: number, ms: number) => void) {
  scene.play(a.actor, 'Shoot')
  await scene.wait(120)
  const [ax0, ay] = body(a), [dx, dy] = body(d)
  const ax = ax0 + a.sign * 6 * a.actor.scale, travel = 270, frames = travel / 16.7
  const end = scene.time + 480
  void (async () => {
    while (scene.time < end) {
      for (let i = 0; i < 2; i++) spawn(ax, ay + rnd(-3, 3), ((dx - ax) / frames) * rnd(0.92, 1.08), ((dy - ay) / frames) * rnd(0.92, 1.08) + rnd(-0.4, 0.4), travel)
      await scene.wait(20)
    }
  })()
  sfx.shoot()
  await scene.wait(travel)
}

/** Varios proyectiles seguidos que van del atacante al objetivo, cada uno con un poco de curva. */
async function volley(a: Side, d: Side, n: number, make: (i: number) => Part, { ms = 300, every = 55, bend = 14, trail = ['#fff'] }: { ms?: number; every?: number; bend?: number; trail?: string[] } = {}) {
  scene.play(a.actor, 'Shoot')
  await scene.wait(130)
  sfx.shoot()
  const [ax0, ay] = body(a), [dx, dy] = body(d), ax = ax0 + a.sign * 6 * a.actor.scale
  for (let i = 0; i < n; i++) {
    const p = shoot({ ...make(i), x: ax, y: ay, max: ms + 30, delay: i * every, fade: false })
    const curve = (i % 2 ? -1 : 1) * bend * (0.4 + i / n)
    void scene.wait(i * every).then(() => scene.tween(ms, (t) => {
      p.x = ax + (dx - ax) * t
      p.y = ay + (dy - ay) * t - Math.sin(t * Math.PI) * curve
      if (Math.random() < 0.6) scene.add({ x: p.x, y: p.y, max: 180, size: 2, colors: trail })
    }))
  }
  await scene.wait(ms)
}

/** Embestida cuerpo a cuerpo: se encoge, cruza el campo dejando estela del color del ataque y luego vuelve a su sitio. */
async function dash(a: Side, d: Side, type: PType, arc = 0) {
  const act = a.actor, k = d.depth / a.depth, color = TYPE_COLOR[type]
  scene.play(act, 'Attack')
  panels[a.panel].streak = 1.6 // su panel se llena de rayas de velocidad
  await scene.tween(140, (t) => { act.ox = -a.sign * 10 * easeOut(t); act.sx = 1 + 0.15 * t; act.sy = 1 - 0.15 * t })
  const [hx, hy] = a.home
  const tx = d.actor.x - a.sign * 11 * d.actor.scale, ty = d.actor.y + (a.depth === d.depth ? 0 : a.depth > d.depth ? 5 : -3)
  sfx.lunge()
  let lastGhost = 0
  await scene.tween(180, (t) => {
    const e = easeIn(t), s = 1 + (k - 1) * e
    act.x = hx + (tx - hx) * e
    act.y = hy + (ty - hy) * e
    act.ox = -a.sign * 10 * (1 - e)
    act.oy = -Math.sin(t * Math.PI) * (arc + 6)
    act.sx = s * 1.2
    act.sy = s * 0.88
    if (scene.time - lastGhost > 18) {
      scene.ghost(act)
      lastGhost = scene.time
      scene.add({ x: act.x - a.sign * 10, y: act.y - rnd(6, 14 * act.scale * s), line: [a.sign * 26, (hy - ty) / 5], size: 2, max: 170, colors: ['#fff', color] })
      scene.add({ x: act.x, y: act.y - rnd(4, 10 * act.scale * s), vx: -a.sign * rnd(0.5, 2), vy: rnd(-1, 0.4), size: 4, max: 260, colors: ['#fff', color], add: true })
    }
  })
  act.ox = act.oy = 0
  act.sx = act.sy = k
  void (async () => { // vuelta a casa con un saltito
    await scene.wait(340)
    scene.play(act, 'Hop')
    await scene.tween(300, (t) => {
      const e = easeOut(t)
      act.x = tx + (hx - tx) * e
      act.y = ty + (hy - ty) * e
      act.oy = -Math.sin(t * Math.PI) * 18
      act.sx = act.sy = k + (1 - k) * e
    })
    scene.play(act, 'Idle', true)
  })()
}

/** Disparo de Artillero: sale por arriba de la pantalla, la mira se cierra sobre el objetivo y cae encima. */
async function lob(a: Side, d: Side, type: PType, shells = 1) {
  const colors = ['#fff', TYPE_COLOR[type], '#10141c']
  scene.play(a.actor, 'Shoot')
  await scene.wait(140)
  sfx.shoot()
  const [ax, ay] = body(a), [dx, dy] = body(d), ka = size(a), kd = size(d)
  const comet = (x: number, y: number, k: number) => {
    scene.add({ x, y, size: 10 * k, color: '#fff', max: 60, fade: false })
    scene.add({ x: x + rnd(-2, 2), y: y + rnd(-2, 2), vx: rnd(-0.5, 0.5), vy: rnd(-0.5, 0.5), size: 6 * k, max: 320, colors, add: true })
  }
  scene.addShake(3)
  scene.burst(ax, ay, 10, { colors, speed: 2.5, size: 4, max: 300 })
  await scene.tween(330, (t) => comet(ax + a.sign * 46 * t, ay - (ay + 40) * easeIn(t), ka))
  mark = { x: dx, y: d.actor.y, at: scene.time, k: kd }
  sfx.select()
  await scene.wait(460)
  for (let i = 1; i < shells; i++) { // la andanada: las primeras caen alrededor, levantando polvo
    const off = (i % 2 ? -1 : 1) * rnd(18, 30)
    sfx.lunge()
    await scene.tween(190, (t) => comet(dx + off - a.sign * 30 * (1 - t), -40 + (d.actor.y + 40) * easeIn(t), kd * 0.8))
    scene.addShake(4)
    panels[d.panel].shake = 4
    scene.fx('ground_impact_dust', dx + off, d.actor.y - 4, { fps: 16, scale: 1.8 })
    scene.burst(dx + off, d.actor.y - 2, 8, { colors, speed: 2.6, up: 1.8, g: 0.2, size: 4, max: 500 })
    sfx.weakHit()
    await scene.wait(60)
  }
  sfx.lunge()
  await scene.tween(240, (t) => comet(dx - a.sign * 38 * (1 - t), -40 + (dy + 40) * easeIn(t), kd))
  mark = null
  // Cae con todo: onda en el suelo, polvo y sacudida de más
  scene.addShake(6)
  scene.add({ ring: 46 * kd, size: 5, color: '#fff', x: dx, y: d.actor.y, max: 360 })
  scene.fx('ground_impact_dust', dx, d.actor.y - 6 * kd, { fps: 14, scale: 2.4 * kd })
  scene.burst(dx, d.actor.y - 4, 16, { colors, speed: 3.4, up: 2.2, g: 0.2, size: 4, max: 600 })
}

const FIRE = ['#fff8c0', '#ffd040', '#ff8020', '#d03010'], AQUA = ['#f0faff', '#88c8ff', '#3880e8']
const VENOM = ['#e8c0f0', '#a040a0', '#582870'], FROST = ['#ffffff', '#b8f0f8', '#58b8e0']

/** Cada tipo de ataque: `shot` es cómo viaja cuando se dispara de lejos e `impact`, lo que estalla sobre el objetivo. */
interface Tech { shot: Move; impact: (a: Side, d: Side) => void }
/** Chorro de partículas de un color: sirve para veneno y hielo. */
const spray = (colors: string[]): Move => (a, d) => stream(a, d, (x, y, vx, vy, ms) => {
  shoot({ x, y, vx, vy, max: ms + 40, size: 6, colors })
  shoot({ x, y, vx: vx * rnd(0.7, 1), vy: vy + rnd(-1, 1), max: ms, size: 4, colors, add: true })
})
const splash = (colors: string[]) => (_a: Side, d: Side) => {
  const [dx, dy] = body(d)
  hitFx(d, 'p:explosions', { frame: 0, count: 4, fps: 12, scale: 1.3 })
  scene.burst(dx, dy, 22, { colors, speed: 3, up: 2, g: 0.15, size: 4, max: 700 })
}
/** Ondas que cruzan el campo: psíquico, hada y siniestro, cada uno con sus colores. */
const waves = (outer: string, inner: string, flash: string): Move => async (a, d) => {
  scene.play(a.actor, 'Charge')
  scene.flashScreen(flash, 0.4, 0.7)
  sfx.cast()
  const [ax, ay] = body(a), [dx, dy] = body(d), frames = 300 / 16.7
  for (let i = 0; i < 4; i++) {
    for (const [color, w] of [[outer, 6], [inner, 2]] as const) {
      scene.add({ ring: (10 + i * 6) * size(d), size: w, color, x: ax, y: ay - 6, vx: (dx - ax) / frames, vy: (dy - ay + 6) / frames, max: 300, delay: 120 + i * 80, fade: false })
    }
  }
  await scene.wait(420)
}
const rocks: Tech = {
  shot: async (a, d) => {
    scene.play(a.actor, 'Swing')
    await scene.wait(140)
    sfx.shoot()
    const [ax, ay] = body(a), [dx, dy] = body(d)
    for (let i = 0; i < 4; i++) {
      const p = shoot({ img: 'rocks', frame: i % 3, x: ax, y: ay, max: 380 + i * 60, delay: i * 60, scale: 2, vr: 0.3, fade: false })
      void scene.wait(i * 60).then(() => scene.tween(370, (t) => { p.x = ax + (dx - ax) * t; p.y = ay + (dy - ay) * t - Math.sin(t * Math.PI) * 50 }))
    }
    await scene.wait(370)
  },
  impact: (_a, d) => {
    const [dx, dy] = body(d), k = size(d)
    for (let i = 0; i < 9; i++) scene.add({ img: 'rocks', frame: 3 + (i % 3), x: dx, y: dy, vx: rnd(-3, 3), vy: rnd(-4, -1), g: 0.25, vr: 0.3, max: 650, scale: 2 * k })
    hitFx(d, 'p:rocksmash', { frame: 0, count: 6, fps: 14, scale: 1.2 })
    scene.fx('gray_smoke', dx, d.actor.y - 10 * k, { fps: 10, scale: 2.5 * k })
  },
}
const spikes = (colors: string[]): Tech => ({
  shot: (a, d) => volley(a, d, 5, () => ({ x: 0, y: 0, max: 0, line: [-a.sign * 16, 0], size: 3, color: colors[0] }), { ms: 220, every: 60, bend: 10, trail: colors }),
  impact: (a, d) => {
    for (let i = 0; i < 3; i++) hitFx(d, 'claw_slash', { delay: i * 45, fps: 24, flipX: a.sign < 0, scale: 2.5 }, -12 + i * 12, -8 + i * 8)
    hitFx(d, 'p:ironhead', { frame: 0, count: 2, fps: 8, scale: 1.5, delay: 80 })
  },
})
const TECH: Record<PType, Tech> = {
  fire: {
    shot: (a, d) => stream(a, d, (x, y, vx, vy, ms) => {
      shoot({ img: 'fire', fps: 16, loop: true, x, y, vx, vy, max: ms + 70, scale: 0.8, grow: 2.6 })
      shoot({ x, y, vx: vx * rnd(0.6, 1), vy: vy - rnd(0, 1.2), max: ms, size: 4, colors: FIRE })
    }),
    impact: (_a, d) => {
      const [dx] = body(d), k = size(d)
      scene.fx('p:fire', dx, d.actor.y - 34 * k, { frame: 6, count: 8, fps: 13, scale: 1.1 * k }) // columna de fuego
      scene.fx('p:fire', dx, d.actor.y - 20 * k, { frame: 40, count: 5, fps: 14, scale: 1.2 * k, delay: 60 })
      scene.burst(dx, d.actor.y - 20 * k, 18, { colors: FIRE, speed: 2.4, up: 2, g: 0.05, size: 4, max: 600 })
    },
  },
  water: {
    shot: (a, d) => stream(a, d, (x, y, vx, vy, ms) => {
      shoot({ x, y, vx, vy, max: ms + 40, size: 6, colors: AQUA })
      if (Math.random() < 0.15) shoot({ img: 'bubble', fps: 8, x, y, vx: vx * 0.9, vy: vy - 0.4, max: ms, scale: 2 })
    }),
    impact: (_a, d) => {
      const [dx, dy] = body(d)
      hitFx(d, 'p:water', { frame: 8, count: 11, fps: 17, scale: 1 }, 0, -12) // tromba
      hitFx(d, 'p:water', { frame: 28, count: 13, fps: 22, scale: 1.3 })
      hitFx(d, 'water_impact', { fps: 0, max: 260, grow: 1.6 })
      scene.burst(dx, dy, 22, { colors: AQUA, speed: 3, up: 2.5, g: 0.22, size: 4, max: 700 })
    },
  },
  dragon: {
    shot: (a, d) => stream(a, d, (x, y, vx, vy, ms) => {
      shoot({ img: 'purple_flame', fps: 14, loop: true, x, y, vx, vy, max: ms + 60, scale: 1, grow: 2.4, rot: a.sign * 1.57 })
      shoot({ x, y, vx, vy, max: ms, size: 4, colors: ['#fff', '#b8a0ff', '#6038e0'], add: true })
    }),
    impact: (_a, d) => {
      const [dx, dy] = body(d)
      hitFx(d, 'p:explosions', { frame: 0, count: 4, fps: 12, scale: 1.4 })
      scene.burst(dx, dy, 16, { colors: ['#fff', '#b8a0ff', '#6038e0'], speed: 3, size: 4, max: 500 })
    },
  },
  grass: {
    shot: (a, d) => volley(a, d, 7, () => ({ x: 0, y: 0, max: 0, img: 'leaf', fps: 24, loop: true, scale: 2 }), { ms: 280, every: 35, bend: 22, trail: ['#c8f890', '#58c040'] }),
    impact: (a, d) => {
      const [dx, dy] = body(d), k = size(d)
      hitFx(d, 'p:slash', { frame: 5, count: 4, fps: 14, scale: 1.3, flipX: a.sign < 0 })
      for (let i = 0; i < 8; i++) scene.add({ img: 'leaf', fps: 16, loop: true, x: dx, y: dy, vx: rnd(-2.5, 2.5), vy: rnd(-3.5, -1), g: 0.15, max: 700, scale: k })
    },
  },
  electric: {
    shot: async (a) => {
      scene.play(a.actor, 'Charge')
      const [ax, ay] = body(a)
      scene.fx('electricity', ax, ay, { fps: 16, loop: true, max: 320, scale: 2 * size(a) })
      sfx.cast()
      await scene.wait(300)
    },
    impact: (_a, d) => {
      const [dx, dy] = body(d), k = size(d)
      const bolt = () => { // el rayo cae del cielo
        const x = dx + rnd(-5, 5)
        for (let y = dy - 8; y > -40; y -= 60 * k) scene.add({ img: 'lightning', frame: Math.floor(rnd(0, 4)), x: x + rnd(-4, 4), y: y - 22 * k, max: 80, scale: 2 * k, fade: false, flipX: Math.random() < 0.5 })
        scene.flashScreen('#fff8a0', 0.75, 9)
        scene.addShake(3)
      }
      bolt()
      void (async () => { for (let i = 0; i < 2; i++) { await scene.wait(110); bolt() } })()
      hitFx(d, 'p:thunder', { frame: 20, count: 6, fps: 15, scale: 1.4 }, 0, -8) // estallido eléctrico
      hitFx(d, 'shock', { fps: 16 })
      scene.burst(dx, dy, 14, { colors: ['#fff', '#f8e050'], speed: 3.5, size: 2, max: 320 })
    },
  },
  psychic: {
    shot: waves('#f85888', '#ffd8e8', '#a040e0'),
    impact: (_a, d) => {
      const k = size(d)
      void scene.tween(520, (t) => { d.actor.oy = Math.sin(t * Math.PI * 8) * 4 * (1 - t) })
      for (let i = 0; i < 6; i++) hitFx(d, 'eye_sparkle', { delay: i * 50, fps: 12 }, (Math.cos(i) * 22) / k, (Math.sin(i) * 18) / k)
    },
  },
  fairy: {
    shot: waves('#f8a8d0', '#fff', '#f070b0'),
    impact: (_a, d) => {
      const [dx, dy] = body(d), k = size(d)
      for (let i = 0; i < 10; i++) scene.add({ img: 'gold_stars', x: dx, y: dy, vx: rnd(-3, 3), vy: rnd(-3.5, -0.5), g: 0.08, max: 700, scale: 2 * k })
      for (let i = 0; i < 5; i++) hitFx(d, 'eye_sparkle', { delay: i * 50, fps: 12 }, (Math.cos(i * 1.3) * 20) / k, (Math.sin(i * 1.3) * 16) / k)
    },
  },
  dark: {
    shot: waves('#583878', '#b890e0', '#3a1870'),
    impact: (a, d) => {
      scene.flashScreen('#3a1870', 0.45, 2)
      hitFx(d, 'p:crunch', { frame: 0, count: 12, fps: 30, scale: 0.85 }) // mandíbulas que se cierran
      hitFx(d, 'purple_swipe', { fps: 9, scale: 1.6, flipX: a.sign < 0, delay: 230 })
    },
  },
  rock: rocks,
  ground: rocks,
  normal: {
    shot: (a, d) => volley(a, d, 6, () => ({ x: 0, y: 0, max: 0, img: 'gold_stars', scale: 2.5, vr: 0.4 }), { ms: 260, every: 50, bend: 18, trail: ['#fff', '#ffd84a'] }), // Rapidez
    impact: (a, d) => {
      hitFx(d, 'slam_hit', { fps: 22, flipX: a.sign < 0, scale: 2.5 }, -a.sign * 6)
      hitFx(d, 'p:punches', { frame: 7, count: 1, fps: 0, max: 280, scale: 0.4, grow: 2.6 })
    },
  },
  flying: {
    shot: (a, d) => volley(a, d, 3, () => ({ x: 0, y: 0, max: 0, img: 'p:airslash', frame: 2, count: 1, fps: 0, scale: 1, flipX: a.sign < 0 }), { ms: 240, every: 90, bend: 8, trail: ['#fff', '#c8e8ff'] }), // Tajo aéreo
    impact: (a, d) => {
      const [dx, dy] = body(d), k = size(d)
      hitFx(d, 'p:airslash', { frame: 0, count: 8, fps: 26, scale: 1.3, flipX: a.sign < 0 })
      hitFx(d, 'p:slash', { frame: 5, count: 4, fps: 16, scale: 1.3, flipX: a.sign < 0 })
      for (let i = 0; i < 7; i++) scene.add({ img: 'white_feather', frame: i % 2, x: dx, y: dy, vx: rnd(-2.5, 2.5), vy: rnd(-3, -0.5), g: 0.07, vr: rnd(-0.1, 0.1), max: 900, scale: 1.5 * k })
    },
  },
  fighting: {
    shot: async (a, d) => { // Esfera aural: se concentra y sale disparada
      scene.play(a.actor, 'Charge')
      sfx.cast()
      const [ax0, ay] = body(a), [dx, dy] = body(d), ax = ax0 + a.sign * 6 * a.actor.scale
      const orb = shoot({ x: ax, y: ay, ring: 9, size: 9, color: '#a8d8ff', max: 620, fade: false })
      for (let i = 0; i < 10; i++) { const ang = rnd(0, 6.3); scene.add({ x: ax + Math.cos(ang) * 26, y: ay + Math.sin(ang) * 26, vx: -Math.cos(ang) * 1.6, vy: -Math.sin(ang) * 1.6, size: 2, max: 260, delay: i * 22, colors: ['#fff', '#58a8f8'] }) }
      await scene.wait(300)
      sfx.shoot()
      await scene.tween(280, (t) => {
        orb.x = ax + (dx - ax) * easeIn(t)
        orb.y = ay + (dy - ay) * easeIn(t)
        scene.add({ x: orb.x, y: orb.y, size: 6, max: 200, colors: ['#fff', '#58a8f8', '#2850c0'], add: true })
      })
    },
    impact: (a, d) => {
      const [dx, dy] = body(d), k = size(d)
      scene.add({ img: 'red_fist', x: dx - a.sign * 16 * k, y: dy, max: 300, scale: 4 * k, grow: 0.6, flipX: a.sign < 0, fade: false })
      hitFx(d, 'p:punches', { frame: 7, count: 1, fps: 0, max: 300, scale: 0.4, grow: 3 })
      scene.hitStop(60)
    },
  },
  steel: spikes(['#e8f0f8', '#90a0b8']),
  bug: spikes(['#d8f060', '#78a020']),
  poison: { shot: spray(VENOM), impact: splash(VENOM) },
  ice: { shot: spray(FROST), impact: splash(FROST) },
  ghost: {
    shot: async (a, d) => { // bola sombra: un proyectil lento con estela
      scene.play(a.actor, 'Shoot')
      const [ax, ay] = body(a), [dx, dy] = body(d)
      const ball = shoot({ img: 'shadow_ball', x: ax, y: ay, max: 460, scale: 2, vr: 0.3, fade: false })
      scene.flashScreen('#3a1870', 0.4, 1.2)
      await scene.tween(440, (t) => {
        ball.x = ax + (dx - ax) * t
        ball.y = ay + (dy - ay) * t - Math.sin(t * Math.PI) * 14
        scene.add({ img: 'purple_flame', fps: 14, x: ball.x, y: ball.y, max: 240, scale: 1 })
      })
    },
    impact: (_a, d) => {
      const [dx, dy] = body(d)
      hitFx(d, 'p:explosions', { frame: 0, count: 4, fps: 12, scale: 1.4 })
      scene.burst(dx, dy, 14, { colors: ['#fff', '#b070e0', '#402068'], speed: 3, size: 4, max: 500 })
    },
  },
}

/** El nombre del ataque, en un rótulo del color de su tipo que sale del lado de quien ataca. */
function callout(a: Side, type: PType) {
  const el = document.createElement('div')
  el.className = `callout ${a.panel ? 'far' : 'near'}`
  el.style.setProperty('--c', TYPE_COLOR[type])
  el.innerHTML = `<small>${TYPE_NAME[type]}</small>${ATTACK_NAME[type]}`
  root.append(el)
  setTimeout(() => el.remove(), 1300)
}

// ---------- El golpe ----------
// Cada ataque tiene tres tiempos: se prepara (carga, brillo y la cámara se le acerca), viaja (según quién sea: cruza
// el campo, dispara o lanza por arriba, con alguna variante al azar) y pega. Y el golpe pesa lo que quita: de la
// parada de impacto al tamaño del número, todo crece con el daño.

const STATUS_LOOK: Record<string, [string, string]> = { burn: ['¡QUEMADO!', '#f0803c'], poison: ['¡ENVENENADO!', '#c060d0'], para: ['¡PARALIZADO!', '#f8d030'], freeze: ['¡CONGELADO!', '#7ccfd8'], sleep: ['¡DORMIDO!', '#a8b4cc'] }
let battleId = 0
let zoomIn: Animation | null = null
/** La cámara hace sus acercamientos hacia este punto de la escena. */
const focusOn = (x: number, y: number) => { scene.canvas.style.transformOrigin = `${((x + pad) / (W + pad * 2)) * 100}% ${(y / H) * 100}%` }

/** Antes de atacar: se agacha, brilla del color del ataque, le llegan chispas y la cámara se le acerca. El otro se prepara. */
async function windUp(a: Side, d: Side, type: PType, strong: boolean) {
  const act = a.actor, [ax, ay] = body(a), color = TYPE_COLOR[type], ms = strong ? 430 : 290
  focusOn(ax, ay)
  zoomIn?.cancel()
  zoomIn = scene.canvas.animate([{ transform: 'scale(1)' }, { transform: `scale(${strong ? 1.1 : 1.05})` }], { duration: ms, fill: 'forwards', easing: 'ease-out' })
  sfx.charge(strong)
  if (strong) music.duck(ms + 600) // un respiro de silencio antes de lo gordo
  scene.play(act, 'Charge')
  panels[a.panel].streak = 0.5
  for (let i = 0; i < (strong ? 18 : 10); i++) {
    const ang = rnd(0, Math.PI * 2), r = rnd(34, 56)
    scene.add({ x: ax + Math.cos(ang) * r, y: ay + Math.sin(ang) * r, vx: (-Math.cos(ang) * r) / 14, vy: (-Math.sin(ang) * r) / 14, size: 4, max: 230, delay: i * (ms / 26), colors: ['#fff', color], add: true })
  }
  await scene.tween(ms, (t) => {
    act.tint = [color, 0.35 * t + 0.25 * t * Math.abs(Math.sin(t * 16))]
    act.ox = -a.sign * 7 * easeOut(t)
    act.sx = 1 + 0.1 * t
    act.sy = 1 - 0.12 * t
    d.actor.ox = a.sign * 3 * t // el otro se echa un poco atrás, esperándolo
    d.actor.sy = 1 - 0.04 * t
  })
  scene.add({ ring: 24, size: 4, color, x: ax, y: ay, max: 200 })
  act.tint = [color, 0]
  act.sx = act.sy = d.actor.sy = 1
}

/** Dos toques rápidos antes del golpe de verdad (variante del cuerpo a cuerpo). */
async function flurry(a: Side, d: Side) {
  for (let i = 0; i < 2; i++) {
    hitFx(d, 'hit', { fps: 26, scale: 1.6 }, rnd(-10, 10), rnd(-12, 8))
    scene.hitStop(34)
    scene.addShake(2)
    sfx.weakHit()
    d.actor.ox = a.sign * (4 + i * 2)
    await scene.wait(95)
  }
}
/** Ráfaga corta de perdigones del color del ataque antes del disparo (variante del Tirador). */
const pellets = (a: Side, d: Side, type: PType) => volley(a, d, 4, () => ({ x: 0, y: 0, max: 0, size: 5, color: TYPE_COLOR[type] }), { ms: 190, every: 45, bend: 6, trail: ['#fff', TYPE_COLOR[type]] })

interface Scar { kind: string; x: number; at: number }
const SCAR: Partial<Record<PType, string>> = { fire: 'burn', electric: 'burn', dragon: 'burn', water: 'puddle', ice: 'frost', poison: 'ooze', rock: 'crater', ground: 'crater', grass: 'leaves', bug: 'leaves' }
/** La huella que deja un ataque en el suelo del panel de quien lo recibe. */
function drawScars(ctx: CanvasRenderingContext2D, scars: Scar[], time: number) {
  const y = FEET + 6
  for (const s of scars) {
    const a = Math.min(1, (time - s.at) / 220)
    const oval = (rx: number, ry: number, color: string, dy = 0, dx = 0) => { ctx.fillStyle = color; ctx.beginPath(); ctx.ellipse(s.x + dx, y + dy, rx * a, ry * a, 0, 0, Math.PI * 2); ctx.fill() }
    if (s.kind === 'burn') {
      oval(30, 8, 'rgba(40, 26, 14, 0.5)'); oval(20, 5, 'rgba(20, 12, 8, 0.6)')
      for (let i = 0; i < 4; i++) { ctx.fillStyle = i % 2 ? '#ff8020' : '#ffd040'; ctx.fillRect(Math.round(s.x - 18 + i * 12 + Math.sin(time / 300 + i) * 2), Math.round(y - 2 - ((time / 40 + i * 9) % 14)), 2, 2) }
    } else if (s.kind === 'puddle' || s.kind === 'frost') {
      const ice = s.kind === 'frost'
      oval(30, 7, ice ? 'rgba(216, 244, 252, 0.85)' : 'rgba(72, 148, 232, 0.7)'); oval(18, 3, ice ? '#ffffffc0' : 'rgba(184, 224, 255, 0.8)', -1, -4)
      if (ice) for (let i = 0; i < 4; i++) { if (Math.floor(time / 180 + i) % 3 === 0) { ctx.fillStyle = '#fff'; ctx.fillRect(Math.round(s.x - 20 + i * 13), y - 4 + (i % 2) * 4, 2, 2) } }
    } else if (s.kind === 'ooze') {
      oval(28, 7, 'rgba(136, 56, 152, 0.75)'); oval(12, 3, 'rgba(216, 152, 232, 0.8)', -1, -6)
      for (let i = 0; i < 3; i++) { const r = ((time / 220 + i * 1.3) % 3) + 1; ctx.strokeStyle = '#e8c0f0'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(s.x - 14 + i * 14, y - 2 - r, r, 0, Math.PI * 2); ctx.stroke() }
    } else if (s.kind === 'crater') {
      oval(32, 8, 'rgba(24, 18, 12, 0.6)'); oval(24, 5, 'rgba(12, 8, 6, 0.65)', 1)
      ctx.strokeStyle = `rgba(255, 240, 210, ${0.5 * a})`; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(s.x, y, 32 * a, 8 * a, 0, Math.PI, Math.PI * 2); ctx.stroke()
      ctx.fillStyle = 'rgba(24, 18, 12, 0.6)'
      for (const [cx, cw] of [[-44, 10], [36, 12], [-30, 6]]) ctx.fillRect(Math.round(s.x + cx * a), y + 2 + (cx % 3), cw, 1)
    } else if (s.kind === 'leaves') {
      for (let i = 0; i < 9; i++) { ctx.fillStyle = i % 2 ? '#58c040' : '#c8f890'; ctx.fillRect(Math.round(s.x - 30 + ((i * 37) % 60)), y - 3 + ((i * 5) % 8), 4, 2) }
    } else { oval(26, 5, 'rgba(255, 255, 255, 0.28)'); oval(14, 3, 'rgba(8, 24, 40, 0.2)') }
  }
}
/** Lo que salta del suelo con el golpe: hierba, tierra o agua, según dónde esté. */
function debris(d: Side, power: number) {
  const t = d.place.terrain
  const colors = t === '~' || t === 's' ? ['#f0faff', '#88c8ff'] : t === 'M' || t === '=' || t === 'B' ? ['#e0c890', '#a88850'] : ['#a8e870', '#4ea83c']
  for (let i = 0; i < 5 + power * 12; i++) scene.add({ x: d.actor.x + rnd(-20, 20), y: FEET + rnd(0, 6), vx: rnd(-2.6, 2.6), vy: rnd(-4.2, -1.2) * (0.6 + power), g: 0.24, size: i % 3 ? 2 : 4, max: rnd(420, 760), colors, fade: false })
  if (t === 'T' || t === '"') for (let i = 0; i < 3 + power * 5; i++) scene.add({ img: 'leaf', fps: 16, loop: true, x: d.actor.x + rnd(-24, 24), y: FEET - rnd(0, 30), vx: rnd(-2, 2), vy: rnd(-3, -1), g: 0.1, max: 800, scale: 1 })
}

/** El estado que deja el ataque se ve sobre quien lo recibe, y se apunta en su ficha. */
function afflict(d: Side, status: string) {
  const [text, color] = STATUS_LOOK[status] ?? ['', '#fff'], [dx, dy] = body(d)
  const el = stamp(text, dx, dy - 66, 'status slam')
  el.style.color = color
  d.plate.querySelector('.type')!.insertAdjacentHTML('beforeend', ` <span class="pill st" style="background:${color}">${text.replace(/[¡!]/g, '')}</span>`)
  sfx.status(status)
  if (status === 'burn') {
    for (let i = 0; i < 6; i++) scene.fx('fire', dx + rnd(-14, 14), dy + rnd(-12, 10), { delay: i * 90, scale: 1.4, fps: 14 })
    void scene.tween(700, (t) => { d.actor.tint = [color, 0.5 * Math.abs(Math.sin(t * 9)) * (1 - t)] })
  } else if (status === 'poison') {
    for (let i = 0; i < 10; i++) scene.add({ x: dx + rnd(-14, 14), y: dy + rnd(-4, 12), vy: rnd(-1.4, -0.5), vx: rnd(-0.3, 0.3), ring: rnd(2, 5), size: 2, color: i % 2 ? '#e8c0f0' : color, max: 600, delay: i * 60 })
    void scene.tween(700, (t) => { d.actor.tint = [color, 0.55 * (1 - t)] })
  } else if (status === 'para') {
    for (let i = 0; i < 3; i++) scene.fx('shock', dx + rnd(-8, 8), dy + rnd(-8, 8), { delay: i * 130, fps: 18 })
    void scene.tween(600, (t) => { d.actor.ox = Math.sin(t * 60) * 3 * (1 - t); d.actor.tint = [color, 0.4 * Math.abs(Math.sin(t * 24)) * (1 - t)] })
  } else if (status === 'freeze') {
    d.actor.tint = ['#c8f4fc', 0.6]
    scene.add({ ring: 36, size: 5, color: '#fff', x: dx, y: dy, max: 320 })
    scene.burst(dx, dy, 18, { colors: FROST, speed: 2.6, size: 4, max: 600 })
  }
}

/** Con 3 PS o menos se queda jadeando: sube y baja, y le caen gotas. */
function pant(s: Side) {
  const id = battleId
  s.plate.classList.add('low')
  void (async () => {
    while (id === battleId && s.hp > 0 && s.hp <= 3 && s.actor.visible) {
      if (!s.busy) {
        const [x, y] = body(s)
        scene.add({ x: x - s.sign * 8, y: y - 12, vx: -s.sign * 0.7, vy: -0.7, g: 0.09, size: 2, color: '#bfe8ff', max: 460 })
        await scene.tween(460, (t) => { if (!s.busy) { s.actor.sy = 1 - 0.07 * Math.sin(t * Math.PI); s.actor.sx = 1 + 0.05 * Math.sin(t * Math.PI) } })
      }
      await scene.wait(240)
    }
  })()
}

async function strike(a: Side, d: Side, dmg: number, crit = false, status: string | null = null) {
  const type = bestMove(a.kind, d.kind) // usa el ataque que más le conviene
  const eff = moveMult(a.kind, type, d.kind)
  const big = eff > 1.05, kill = dmg >= d.hp, soft = dmg <= 2
  const power = Math.min(1, dmg / 9) // de 0 a 1: cuánto pesa el golpe
  const reach = KINDS[a.kind].range[1], far = reach > 1 && gap > 1
  const variant = Math.floor(Math.random() * 3) // el mismo ataque no sale siempre igual
  aim = 1
  a.busy = true
  callout(a, type)
  say(`¡${KINDS[a.kind].name} usó ${ATTACK_NAME[type]}!`)
  sfx.cry(KINDS[a.kind].species, 1, 0.6) // grita al atacar
  await windUp(a, d, type, big || crit || kill)
  setTimeout(() => sfx.move(type), 80) // el sonido propio del ataque
  if (!far) {
    await dash(a, d, type, type === 'flying' || variant === 1 ? 30 : 0) // de frente o, a veces, saltándole encima
    if (variant === 2 && !soft) await flurry(a, d)
  } else if (reach >= 4) await lob(a, d, type, variant === 2 ? 3 : 1) // una, o una andanada de tres
  else {
    if (variant === 1) await pellets(a, d, type)
    await TECH[type].shot(a, d)
  }
  TECH[type].impact(a, d)

  // Impacto: la cámara salta al punto del golpe; parada, sacudida, retroceso y número, todo a la medida del daño
  const [dx, dy] = body(d), before = d.hp
  const hpAfter = Math.max(0, d.hp - dmg)
  focusOn(dx, dy)
  zoomIn?.cancel()
  scene.hitStop(soft ? 30 : 50 + dmg * 13 + (big ? 50 : 0) + (kill ? 60 : 0))
  scene.canvas.animate([{ transform: `scale(${1.04 + power * 0.12 + (big ? 0.04 : 0)})` }, { transform: 'scale(1)' }], { duration: 240 + power * 300, easing: 'cubic-bezier(0.2, 1.4, 0.4, 1)' })
  scene.addShake(soft ? 2 : 2 + dmg * 0.9 + (big ? 3 : 0))
  if (kill || crit) scene.slowMo(520, 0.3) // el remate y el crítico, a cámara lenta
  if (big) { // súper eficaz: un fotograma en negativo, destello y líneas de impacto
    scene.canvas.animate([{ filter: 'invert(1)' }, { filter: 'invert(1)', offset: 0.6 }, { filter: 'none' }], { duration: 130 })
    scene.flashScreen('#fff', 0.85, 7)
  }
  if (big || crit) {
    for (let i = 0; i < 26; i++) {
      const ang = (i / 26) * Math.PI * 2 + rnd(-0.1, 0.1), v = rnd(7, 11)
      scene.add({ x: dx + Math.cos(ang) * 14, y: dy + Math.sin(ang) * 14, vx: Math.cos(ang) * v, vy: Math.sin(ang) * v, drag: 0.94, line: [Math.cos(ang) * 26, Math.sin(ang) * 26], size: 2, max: 300, colors: [crit ? '#ffd84a' : '#fff', '#fff'] })
    }
  }
  scene.fx('hit', dx, dy, { fps: 20, scale: 1.6 + power * 2.2 })
  scene.add({ ring: 26 + power * 40, size: 6, color: '#fff', x: dx, y: dy, max: 300 })
  for (let i = 0; i < 6 + dmg * 2; i++) {
    const ang = rnd(0, Math.PI * 2), v = rnd(2, 2.5 + power * 4)
    scene.add({ x: dx, y: dy, vx: Math.cos(ang) * v, vy: Math.sin(ang) * v, drag: 0.9, line: [Math.cos(ang) * 10, Math.sin(ang) * 10], size: 2, max: 320, colors: ['#fff', TYPE_COLOR[type]] })
  }
  panels[d.panel].shake = 2 + dmg * 0.8
  panels[d.panel].flash = 0.3 + power * 0.7
  panels[d.panel].color = big ? '#fff' : TYPE_COLOR[type]
  debris(d, power)
  if (!soft) { // la huella en el suelo: la del tipo del ataque o, si cayó del cielo, un cráter
    const scars = panels[d.panel].scars
    scars.push({ kind: far && reach >= 4 ? 'crater' : SCAR[type] ?? 'scuff', x: d.home[0], at: scene.time })
    if (scars.length > 2) scars.shift()
  }
  sfx.thump(power)
  ;(soft || eff < 0.9 ? sfx.weakHit : big ? sfx.bigHit : sfx.hit)()
  scene.play(d.actor, 'Hurt')
  d.actor.tint = ['#fff', 1]
  void scene.tween(300, (t) => { d.actor.tint[1] = Math.floor(t * 6) % 2 ? 0 : 1 - t })
  const push = soft ? 5 : 6 + dmg * 2.2 + (big ? 6 : 0)
  void scene.tween(340 + power * 200, (t) => {
    const p = t < 0.15 ? t / 0.15 : 1 - easeOut((t - 0.15) / 0.85)
    d.actor.ox = a.sign * push * p
    d.actor.sx = 1 - (0.08 + 0.16 * power) * p
  })
  stamp(`-${dmg}`, dx - a.sign * 4, dy - 50, big ? 'dmg big' : 'dmg').style.fontSize = `${62 + dmg * 12 + (big ? 16 : 0)}px`
  if (crit) {
    stamp('¡CRÍTICO!', W / 2, 92, 'super slam')
    sfx.crit()
    scene.flashScreen('#ffd84a', 0.6, 5)
    scene.addShake(12)
    scene.hitStop(120)
    for (let i = 0; i < 10; i++) scene.add({ img: 'gold_stars', x: dx, y: dy, vx: rnd(-4, 4), vy: rnd(-5, -1), g: 0.16, max: 800, scale: 2 })
  }
  if (big || eff < 0.9) stamp(big ? '¡SÚPER EFICAZ!' : eff < 0.4 ? 'Casi no le afecta…' : 'Poco eficaz…', d.sign < 0 ? 86 : 170, crit ? 74 : 52, big ? 'super slam' : 'weak')
  d.hp = hpAfter
  dropHp(d.plate, before, hpAfter)
  restartClass(d.plate, 'hurt')
  say(`${KINDS[d.kind].name} pierde ${dmg} PS.`)
  if (status && hpAfter > 0) setTimeout(() => afflict(d, status), 320)
  await scene.wait(status && hpAfter > 0 ? 1050 : 760)
  a.busy = false

  if (hpAfter > 0) {
    scene.play(d.actor, 'Idle', true)
    if (hpAfter <= 3) pant(d)
    return
  }
  // K.O.: sale volando
  say(`¡${KINDS[d.kind].name} se ha debilitado!`)
  sfx.ko()
  sfx.cry(KINDS[d.kind].species, 0.7, 0.7) // el grito, más grave, al caer
  scene.fx('explosion', dx, dy, { fps: 12, scale: 3 })
  scene.addShake(8)
  stamp('K.O.', dx, dy - 30, 'ko slam')
  d.plate.classList.remove('low')
  d.actor.shadow = false
  let lastStar = 0
  await scene.tween(700, (t) => {
    d.actor.ox = a.sign * t * 170
    d.actor.oy = -Math.sin(t * Math.PI * 0.8) * 90
    d.actor.rot = a.sign * t * 14
    if (scene.time - lastStar > 40) {
      lastStar = scene.time
      scene.add({ img: 'gold_stars', x: d.actor.x + d.actor.ox, y: d.actor.y + d.actor.oy - 20, vy: 0.5, max: 400, scale: 2 })
    }
  })
  d.actor.visible = false
}

const restartClass = (el: Element, cls: string) => {
  el.classList.remove(cls)
  void (el as HTMLElement).offsetWidth
  el.classList.add(cls)
}

// Fondo de cada panel: cielo, sol, nubes, dos sierras, lo que haya en el horizonte y el suelo del mapa a doble tamaño
function panorama(ctx: CanvasRenderingContext2D, place: Place, mid: number, time: number, drift: number) {
  const look = LOOK[place.terrain] ?? LOOK['.'], x0 = -pad - 20, w = W + pad * 2 + 40, sea = place.terrain === '~' || place.terrain === 's'
  look.sky.forEach((color, i) => { ctx.fillStyle = color; ctx.fillRect(x0, i ? i * 20 : -20, w, i ? 20 : 40) })
  const sx = mid - 40 - drift * 0.1
  for (const [r, color] of [[26, '#ffffff20'], [19, '#ffffff38'], [13, '#fff8d8']] as const) { ctx.fillStyle = color; ctx.beginPath(); ctx.arc(sx, 30, r, 0, Math.PI * 2); ctx.fill() }
  ctx.fillStyle = '#ffffffe0'
  for (const [cx, cy, cw] of [[10, 20, 40], [96, 44, 28], [170, 14, 34], [250, 36, 44], [340, 24, 30]]) { // nubes que pasan
    const x = x0 + ((((cx + time * 0.006 + drift * 0.3) % (w + 60)) + w + 60) % (w + 60)) - 50
    ctx.fillRect(x, cy, cw, 6)
    ctx.fillRect(x + 6, cy - 4, cw - 14, 4)
    ctx.fillRect(x + 4, cy + 6, cw - 10, 2)
  }
  // Dos sierras (la lejana, casi del color del cielo); en la montaña, con picos
  for (const [color, base, amp, f1, f2, par] of [[look.far, 30, 12, 0.021, 0.057, 0.15], [look.hill, 15, 8, 0.045, 0.11, 0.35]] as const) {
    ctx.fillStyle = color
    for (let x = 0; x < w; x += 2) {
      const u = x + x0 + drift * par
      const h = sea ? 0 : base + Math.sin(u * f1) * amp + Math.sin(u * f2) * amp * 0.5 + (place.terrain === 'M' ? Math.abs(((u * 0.05) % 2) - 1) * 14 : 0)
      ctx.fillRect(x0 + x, HORIZON - h, 2, h)
    }
  }
  const first = Math.floor(x0 / 32) * 32
  for (let y = HORIZON; y < H + 20; y += 32) for (let x = first; x < x0 + w; x += 32) groundTile(ctx, place.terrain, x, y, time)
  if (sea) { // destellos sobre el agua
    ctx.fillStyle = '#ffffff90'
    for (let i = 0; i < 20; i++) ctx.fillRect(x0 + ((((i * 97 + Math.sin(time / 600 + i) * 6) % w) + w) % w), HORIZON + 4 + ((i * 37) % (H - HORIZON)), 6 + (i % 4) * 5, 2)
  }
  // Lo que hay detrás del Pokémon según el terreno
  if (place.terrain === 'T') for (let x = first - 16; x < x0 + w + 32; x += 44) prop(ctx, (x / 44) % 2 < 1 ? 'oak' : 'tree', x - drift * 0.6, HORIZON + 14 + (Math.abs(x / 44) % 3) * 4)
  if (place.terrain === 'M') for (const x of [mid - 70, mid - 6, mid + 64]) prop(ctx, 'rock', x - drift * 0.6, HORIZON + 10)
  if (place.terrain === '"') for (let x = first; x < x0 + w; x += 32) tallGrass(ctx, x, HORIZON - 6)
  if (place.building) { // el edificio real, a tamaño doble, detrás del Pokémon
    const piece = pieceAt[place.building.type]
    ctx.drawImage(place.building.owner < 0 ? grayPieces : pieces, piece.x, 0, piece.w, piece.h, Math.round(mid - piece.w - drift * 0.6), HORIZON + 30 - piece.h * 2, piece.w * 2, piece.h * 2)
  }
  const haze = ctx.createLinearGradient(0, HORIZON - 14, 0, HORIZON + 40) // bruma en el horizonte y sombra al pie
  haze.addColorStop(0, 'rgba(255, 255, 255, 0)'); haze.addColorStop(0.3, 'rgba(255, 255, 255, 0.3)'); haze.addColorStop(0.36, 'rgba(8, 24, 40, 0.28)'); haze.addColorStop(1, 'rgba(8, 24, 40, 0)')
  ctx.fillStyle = haze
  ctx.fillRect(x0, HORIZON - 14, w, 54)
  const low = ctx.createLinearGradient(0, H - 40, 0, H + 10) // el primer plano, algo más oscuro
  low.addColorStop(0, 'rgba(8, 24, 40, 0)'); low.addColorStop(1, 'rgba(8, 24, 40, 0.3)')
  ctx.fillStyle = low
  ctx.fillRect(x0, H - 40, w, 60)
  if (light) { // la hora del día y la lluvia tiñen la escena
    ctx.fillStyle = light
    ctx.fillRect(x0, -20, w, H + 40)
  }
}

/** Barra de experiencia de 0 a 1, antes y después del combate; `ready`, si con eso queda listo para evolucionar. */
export interface XpGain { from: number; to: number; ready: boolean }

export interface BattleData {
  a: { kind: string; hp: number; team: number; place: Place }
  d: { kind: string; hp: number; team: number; place: Place }
  dmg: number
  counter: number | null
  crit?: boolean // golpe crítico del atacante
  xp?: { a: XpGain | null; d: XpGain | null } // lo que sube la barra de experiencia de cada uno al acabar
  co?: string // comandante de quien ataca: su fanfarria abre el combate
  dist?: number // casillas entre los dos: de lejos, el ataque se dispara en vez de cruzar el campo
  status?: string | null // estado que el ataque deja en quien lo recibe: se ve en la escena
  front?: 'a' | 'd' // quién va a la izquierda (el de quien mira la pantalla); por defecto, quien ataca
}

// Lo que le pasa a cada panel (0 el izquierdo, 1 el derecho): sacudida, destello del golpe y rayas de velocidad
const panels = [{ shake: 0, flash: 0, streak: 0, color: '#fff', scars: [] as Scar[] }, { shake: 0, flash: 0, streak: 0, color: '#fff', scars: [] as Scar[] }]

export async function playBattle(b: BattleData) {
  // A pantalla completa: el lienzo se ensancha hasta la proporción de la ventana y la escena de siempre queda centrada
  pad = Math.max(0, Math.round((H * Math.min(2.4, innerWidth / innerHeight) - W) / 4) * 2)
  scene.resize(W + pad * 2, H)
  scene.camera.x = -pad
  gap = b.dist ?? 1
  mark = null
  for (const p of panels) { p.shake = p.flash = p.streak = 0; p.scars = [] }
  battleId++
  await open('battle')
  const plates = root.querySelectorAll<HTMLElement>('.plate')
  const apart = Math.round(pad * 0.45) // con más sitio, cada uno se va un poco hacia su lado
  const side = (who: BattleData['a'], left: boolean): Side => {
    const home: [number, number] = [left ? 72 - apart : 184 + apart, FEET]
    return {
      actor: scene.actor(KINDS[who.kind].species, home[0], home[1], left ? DIR.right : DIR.left, scaleOf(who.kind)),
      kind: who.kind, team: who.team, hp: who.hp, plate: plates[left ? 0 : 1], place: who.place, sign: left ? 1 : -1, depth: 1, home, panel: left ? 0 : 1,
    }
  }
  const aLeft = b.front !== 'd'
  const left = side(aLeft ? b.a : b.d, true), right = side(aLeft ? b.d : b.a, false)
  const att = aLeft ? left : right, def = aLeft ? right : left
  const xpOf = (s: Side) => (s === att ? b.xp?.a : b.xp?.d)?.from ?? null
  setPlate(left.plate, left.kind, left.team, left.hp, xpOf(left))
  setPlate(right.plate, right.kind, right.team, right.hp, xpOf(right))
  say('')

  // Dos paneles en diagonal, cada uno con el paisaje de su casilla, que entran chocando. Entre los dos, la costura:
  // pegada si pelean cuerpo a cuerpo y una franja con flechas si el ataque es de lejos.
  let slide = 1, seam = 0, lastTime = 0
  const away = 150 + pad, band = gap > 1 ? 9 : 0, full = W + pad * 2 + 60
  const edge = (y: number) => 140 + seam - (24 * (y + 20)) / (H + 40) // por dónde pasa la costura a esa altura
  const drawPanel = (ctx: CanvasRenderingContext2D, i: number, s: Side, time: number) => {
    const p = panels[i], dir = i ? 1 : -1
    ctx.save()
    ctx.translate(dir * slide * away + rnd(-1, 1) * p.shake, rnd(-1, 1) * p.shake)
    ctx.beginPath()
    if (i === 0) { ctx.moveTo(-full, -30); ctx.lineTo(edge(-30) - band, -30); ctx.lineTo(edge(H + 30) - band, H + 30); ctx.lineTo(-full, H + 30) }
    else { ctx.moveTo(edge(-30) + band, -30); ctx.lineTo(full + W, -30); ctx.lineTo(full + W, H + 30); ctx.lineTo(edge(H + 30) + band, H + 30) }
    ctx.closePath()
    ctx.clip()
    panorama(ctx, s.place, s.home[0], time, dir * slide * 80 + (p.streak > 0 ? -s.sign * p.streak * 10 : 0))
    drawScars(ctx, p.scars, time)
    if (p.streak > 0) { // rayas de velocidad mientras carga contra el otro
      ctx.fillStyle = `rgba(255, 255, 255, ${0.55 * p.streak})`
      for (let k = 0; k < 16; k++) {
        const len = 30 + ((k * 53) % 60), y = 8 + ((k * 37) % (H - 30))
        ctx.fillRect(-pad - 20 + ((((k * 97 - s.sign * time * 1.4) % (full + W)) + full + W) % (full + W)) - 40, y, len, 1 + (k % 3 === 0 ? 1 : 0))
      }
    }
    if (p.flash > 0) { // el golpe ilumina el panel de quien lo recibe
      ctx.fillStyle = p.color
      ctx.globalAlpha = Math.min(0.85, p.flash)
      ctx.fillRect(-full, -30, full * 2 + W, H + 60)
      ctx.globalAlpha = 1
    }
    ctx.fillStyle = TEAM_HEX[s.team] // el color de su equipo, abajo y en el borde de la costura
    ctx.fillRect(-full, H - 4, full * 2 + W, 6)
    ctx.restore()
  }
  scene.background = (ctx, time) => {
    const dt = Math.min(50, time - lastTime)
    lastTime = time
    for (const p of panels) {
      p.shake = p.shake < 0.4 ? 0 : p.shake * Math.pow(0.86, dt / 16.7)
      p.flash = Math.max(0, p.flash - dt / 260)
      p.streak = Math.max(0, p.streak - dt / 420)
    }
    ctx.fillStyle = '#10141c'
    ctx.fillRect(-20 - pad, -20, W + 40 + pad * 2, H + 40)
    drawPanel(ctx, 0, left, time)
    drawPanel(ctx, 1, right, time)
    if (slide > 0.02) return
    // La costura: borde oscuro, filo blanco que late y, de lejos, flechas que corren del que dispara al que recibe
    const pulse = 0.6 + 0.4 * Math.sin(time / 130)
    for (const off of band ? [-band, band] : [0]) {
      for (const [color, w] of [['#10141c', 7], [`rgba(255, 255, 255, ${pulse})`, 3]] as const) {
        ctx.strokeStyle = color
        ctx.lineWidth = w
        ctx.beginPath(); ctx.moveTo(edge(-30) + off, -30); ctx.lineTo(edge(H + 30) + off, H + 30); ctx.stroke()
      }
    }
    if (band) {
      ctx.fillStyle = '#ffd84a'
      for (let y = -6 + ((time / 40) % 22); y < H + 10; y += 22) {
        const x = edge(y), d = att.sign
        ctx.beginPath(); ctx.moveTo(x - d * 4, y - 5); ctx.lineTo(x + d * 4, y); ctx.lineTo(x - d * 4, y + 5); ctx.fill()
      }
    }
  }
  scene.foreground = (ctx, time) => { // hierba alta por delante de los pies, y la mira del Artillero
    for (const s of [left, right]) {
      if (s.place.terrain !== '"' || slide > 0.02) continue
      const from = s.panel ? Math.ceil(edge(FEET) / 32) * 32 : -32 * Math.ceil((pad + 20) / 32), to = s.panel ? W + pad : edge(FEET) - 20
      for (let x = from; x < to; x += 32) tallGrass(ctx, x, FEET - 18)
    }
    if (mark) {
      const t = Math.min(1, (time - mark.at) / 380), r = 34 - 20 * easeOut(t), blink = Math.floor(time / 70) % 2
      ctx.strokeStyle = ctx.fillStyle = blink ? '#fff' : '#ff5040'
      ctx.lineWidth = 2
      ctx.beginPath(); ctx.ellipse(mark.x, mark.y, r, r * 0.42, 0, 0, Math.PI * 2); ctx.stroke()
      for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) ctx.fillRect(Math.round(mark.x + dx * (r + 5) - (dx ? 4 : 1)), Math.round(mark.y + dy * (r * 0.42 + 4) - (dy ? 3 : 1)), dx ? 8 : 2, dy ? 6 : 2)
    }
  }

  // Entrada: los paneles llegan de lado a lado con rayas de velocidad y chocan en el centro
  left.actor.x = left.home[0] - away
  right.actor.x = right.home[0] + away
  panels[0].streak = panels[1].streak = 1
  music.duck(2600) // la música de combate baja mientras suena la fanfarria del comandante que ataca
  sfx.fanfare(b.co)
  await scene.tween(300, (t) => {
    slide = 1 - easeOut(t)
    left.actor.x = left.home[0] - away * slide
    right.actor.x = right.home[0] + away * slide
  })
  slide = 0
  left.actor.x = left.home[0]
  right.actor.x = right.home[0]
  // El choque: destello, chispas a lo largo de la costura, los dos paneles tiemblan y cada Pokémon se planta con un saltito
  scene.addShake(7)
  scene.flashScreen('#fff', 0.75, 6)
  sfx.land()
  panels[0].shake = panels[1].shake = 5
  for (let i = 0; i < 26; i++) {
    const y = rnd(0, H), d = i % 2 ? 1 : -1
    scene.add({ x: edge(y) + d * band, y, vx: d * rnd(1.5, 5), vy: rnd(-1.5, 1.5), drag: 0.92, line: [-d * 8, 0], size: 2, max: 380, colors: ['#fff', '#ffd84a', TEAM_HEX[d > 0 ? right.team : left.team]] })
  }
  scene.add({ ring: 46, size: 5, color: '#fff', x: edge(H / 2), y: H / 2, max: 320 })
  for (const s of [left, right]) {
    void scene.tween(280, (t) => { s.actor.oy = -Math.sin(t * Math.PI) * 12; s.actor.sy = 1 + 0.12 * Math.sin(t * Math.PI * 2); s.actor.sx = 1 - 0.1 * Math.sin(t * Math.PI * 2) })
    scene.fx('ground_impact_dust', s.home[0], FEET - 4, { fps: 16, scale: 2, delay: 240 })
    for (let i = 0; i < 6; i++) scene.add({ x: s.home[0] + rnd(-14, 14), y: FEET + 2, vx: rnd(-1.6, 1.6), vy: rnd(-1.4, -0.3), size: 4, max: 360, delay: 260, colors: ['#fff', '#d8d0c0'], behind: true })
  }
  root.classList.add('ready')
  scene.canvas.animate([{ scale: 1 }, { scale: 1.05 }], { duration: 7000, fill: 'forwards', easing: 'ease-out' }) // la cámara se va acercando, despacio
  if (gap > 1) stamp(`A ${gap} casillas`, edge(40), 40, 'weak')
  await scene.wait(520)

  await strike(att, def, b.dmg, b.crit, b.status)
  if (def.hp > 0 && b.counter !== null) {
    await scene.wait(200)
    await strike(def, att, b.counter)
  }
  // Si uno cae, el panel del que queda en pie se come la pantalla y él lo celebra
  const winner = def.hp <= 0 ? att : att.hp <= 0 ? def : null
  if (winner) {
    const to = winner.panel ? -(W + pad + 80) : W + pad + 80, [wx, wy] = body(winner)
    sfx.lunge()
    await scene.tween(320, (t) => { seam = to * easeIn(t) })
    winner.actor.dir = DIR.down // se gira hacia ti
    sfx.sting()
    void scene.tween(520, (t) => { winner.actor.oy = -Math.abs(Math.sin(t * Math.PI * 2)) * 16 * (1 - t * 0.5) })
    for (let i = 0; i < 16; i++) { const ang = (i / 16) * Math.PI * 2; scene.add({ img: 'gold_stars', x: wx, y: wy, vx: Math.cos(ang) * 3, vy: Math.sin(ang) * 3, drag: 0.95, max: 700, scale: 2 }) }
    sfx.cry(KINDS[winner.kind].species, 1, 0.5)
    await scene.wait(420)
  }
  // Al acabar, la experiencia: la barra de cada ficha se llena y, si llega al tope, avisa de que ya puede evolucionar
  let waitXp = 380
  for (const [s, gain] of [[att, b.xp?.a], [def, b.xp?.d]] as const) {
    if (!gain || s.hp <= 0 || gain.to <= gain.from) continue
    const bar = s.plate.querySelector<HTMLElement>('.xp i')!
    bar.style.width = Math.min(1, gain.to) * 100 + '%'
    restartClass(s.plate, 'gain')
    sfx.coin()
    waitXp = 900
    if (!gain.ready) continue
    waitXp = 1700
    setTimeout(() => {
      const [x, y] = body(s)
      s.plate.classList.add('evo')
      sfx.ready()
      stamp('¡PUEDE EVOLUCIONAR!', x, y - 44, 'super')
      scene.add({ ring: 50, size: 5, color: '#ffd84a', x, y, max: 500 })
      for (let i = 0; i < 14; i++) { const ang = (i / 14) * Math.PI * 2; scene.add({ img: 'gold_stars', x, y, vx: Math.cos(ang) * 2.6, vy: Math.sin(ang) * 2.6, drag: 0.95, max: 700, scale: 2 }) }
      say(`¡${KINDS[s.kind].name} ya puede evolucionar!`)
    }, 450)
  }
  await scene.wait(waitXp)
  await close()
  for (const s of [left, right]) s.plate.classList.remove('evo', 'low')
  for (const anim of scene.canvas.getAnimations()) anim.cancel()
  zoomIn = null
  scene.canvas.style.transformOrigin = ''
  battleId++
  scene.camera.x = pad = 0
  scene.resize(W, H)
}

// ---------- Evolución ----------

export interface EvolveData { from: string; to: string; team: number; heal: number }

/**
 * La evolución, con su escena propia: a oscuras, bajo un foco, la silueta blanca va y viene entre las dos formas cada
 * vez más deprisa hasta que estalla en la nueva. Al final, una ficha con lo que ha ganado.
 */
export async function playEvolve(e: EvolveData) {
  pad = Math.max(0, Math.round((H * Math.min(2.4, innerWidth / innerHeight) - W) / 4) * 2)
  scene.resize(W + pad * 2, H)
  scene.camera.x = -pad
  await open('evolve')
  const old = KINDS[e.from], next = KINDS[e.to], cx = W / 2, feet = 128
  const act = scene.actor(old.species, cx, feet + (scaleOf(e.from) + 1) * 4, DIR.down, scaleOf(e.from) + 1) // el dibujo lleva aire bajo los pies
  act.shadow = false
  let glow = 0, done = 0
  scene.background = (ctx, time) => {
    const x0 = -pad - 20, w = W + pad * 2 + 40
    const sky = ctx.createLinearGradient(0, 0, 0, H)
    sky.addColorStop(0, '#0c1020'); sky.addColorStop(0.6, '#1c2858'); sky.addColorStop(1, '#3c2870')
    ctx.fillStyle = sky
    ctx.fillRect(x0, -20, w, H + 40)
    // Rayos que giran detrás y columnas de luz que suben
    ctx.save()
    ctx.translate(cx, feet - 30)
    ctx.rotate(time / 2400)
    for (let i = 0; i < 12; i++) {
      ctx.rotate(Math.PI / 6)
      ctx.fillStyle = `rgba(255, 232, 140, ${0.05 + 0.12 * glow + 0.2 * done})`
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-16, -260); ctx.lineTo(16, -260); ctx.fill()
    }
    ctx.restore()
    for (let i = 0; i < 18; i++) {
      const x = x0 + ((i * 53) % w), h = 20 + ((i * 37) % 50), y = H + 20 - ((time * (0.03 + (i % 5) * 0.012) + i * 40) % (H + 80))
      ctx.fillStyle = `rgba(160, 200, 255, ${0.1 + 0.25 * glow})`
      ctx.fillRect(x, y, 2, h)
    }
    // Foco en el suelo, del color del equipo
    for (const [r, alpha] of [[84, 0.16], [62, 0.22], [40, 0.3]] as const) {
      ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`
      ctx.beginPath(); ctx.ellipse(cx, feet + 4, r, r * 0.26, 0, 0, Math.PI * 2); ctx.fill()
    }
    ctx.strokeStyle = TEAM_HEX[e.team]
    ctx.lineWidth = 2
    ctx.beginPath(); ctx.ellipse(cx, feet + 4, 84, 22, 0, 0, Math.PI * 2); ctx.stroke()
  }
  scene.foreground = null
  music.duck(4200)
  say(`¡Anda! ¡${old.name} está evolucionando!`)
  sfx.cry(old.species, 1, 0.6)
  await scene.wait(650)
  sfx.evolve()
  // Se vuelve silueta blanca y las dos formas se alternan, cada vez más rápido
  const [x, y] = [cx, feet - 12 * act.scale]
  let last = 0, swapAt = 0, showNew = false
  await scene.tween(2300, (t) => {
    glow = t
    act.tint = ['#fff', Math.min(1, t * 5)]
    const every = 340 - 300 * easeOut(t)
    if (t > 0.18 && scene.time - swapAt > every) {
      swapAt = scene.time
      showNew = !showNew
      act.species = (showNew ? next : old).species
      act.scale = scaleOf(showNew ? e.to : e.from) + 1
      act.sx = act.sy = 1.12
    }
    act.sx = act.sy = Math.max(1, act.sx - 0.01)
    if (scene.time - last > 40) {
      last = scene.time
      const ang = rnd(0, Math.PI * 2), r = 80
      scene.add({ img: 'blue_star', frame: 1, x: x + Math.cos(ang) * r, y: y + Math.sin(ang) * r * 0.7, vx: (-Math.cos(ang) * r) / 20, vy: (-Math.sin(ang) * r * 0.7) / 20, max: 330, scale: 2 })
    }
  })
  // Estalla en la forma nueva
  act.species = next.species
  act.scale = scaleOf(e.to) + 1
  act.sx = act.sy = 1
  done = 1
  scene.flashScreen('#fff', 1, 1.6)
  scene.addShake(8)
  scene.hitStop(120)
  scene.add({ ring: 120, size: 8, color: '#fff', x, y, max: 600 })
  scene.add({ ring: 80, size: 6, color: '#ffd84a', x, y, max: 500, delay: 120 })
  for (let i = 0; i < 28; i++) {
    const ang = (i / 28) * Math.PI * 2
    scene.add({ img: 'gold_stars', x, y, vx: Math.cos(ang) * rnd(2.5, 5), vy: Math.sin(ang) * rnd(2.5, 5), drag: 0.95, max: 900, scale: 2 })
  }
  for (let i = 0; i < 24; i++) scene.add({ img: 'confetti', frame: i % 4, x: cx + rnd(-140, 140), y: -10, vx: rnd(-0.6, 0.6), vy: rnd(1, 2.6), vr: rnd(-0.2, 0.2), max: 2600, delay: i * 40, scale: 2 })
  scene.play(act, 'Rotate')
  void scene.tween(520, (t) => { act.tint[1] = 1 - t; act.oy = -Math.sin(t * Math.PI) * 22 })
  sfx.evolved()
  sfx.cry(next.species, 1, 0.8)
  stamp('¡EVOLUCIÓN!', cx, 34, 'super')
  say(`¡Enhorabuena! ¡${old.name} ha evolucionado a ${next.name}!`)
  // La ficha: de quién a quién y lo que gana
  const up = (label: string, a: number, c: number, unit = '') => `<div><span>${label}</span><b>${a}${unit}</b><i>▶</i><b class="new">${c}${unit}</b><em>${c > a ? '▲' : ''}</em></div>`
  const card = document.createElement('div')
  card.className = `evocard t${e.team}`
  card.innerHTML = `<header><img src="${facePath(old.species)}" alt=""><i>▶</i><img src="${facePath(next.species, 'Happy')}" alt=""><div><small>${ROLES[next.role].name}</small><b>${next.name}</b></div></header>
    ${up('Ataque', Math.round(old.atk * 100), Math.round(next.atk * 100))}${up('Defensa', Math.round(old.def * 100), Math.round(next.def * 100))}${up('Movimiento', old.mv, next.mv)}
    <p>✚ Recupera ${e.heal} PS y se le pasa cualquier estado</p>`
  root.append(card)
  await scene.wait(600)
  scene.play(act, 'Idle', true)
  await scene.wait(2100)
  await close()
  card.remove()
  scene.camera.x = pad = 0
  scene.resize(W, H)
}

// ---------- Captura ----------

export interface CaptureData {
  kind: string; team: number
  building: { type: string; owner: number }
  capBefore: number; capAfter: number; done: boolean; total: number
}

/**
 * Captura a pantalla completa: el edificio real al doble de tamaño, el Pokémon salta al tejado y lo pisotea. Cada
 * pisotón vacía un tramo de la barra de resistencia y arría un poco la bandera; al rendirlo, sube la del nuevo dueño.
 * El lienzo se ensancha hasta la proporción de la ventana (y vuelve a su tamaño al salir, para el combate).
 */
export async function playCapture(c: CaptureData) {
  const piece = pieceAt[c.building.type], tree = pieceAt.tree, info = BUILDING_INFO[c.building.type as BuildingType]
  const S = 2, CH = piece.h * S + 196, CW = Math.round((CH * Math.max(1.25, Math.min(2.4, innerWidth / innerHeight))) / 2) * 2
  scene.resize(CW, CH)
  await open('capture')
  const bx = CW / 2, base = CH - 46, horizon = base - 56, roof = base - piece.h * S + (c.building.type === 'gym' ? 20 : 16) * S
  const k = KINDS[c.kind], scale = scaleOf(c.kind)
  let squash = 0, glow = 0, color = c.building.owner >= 0 ? 1 : 0, flagTeam = c.building.owner
  let flag = c.capBefore / c.total // la bandera está tan alta como resistencia le queda al edificio
  scene.background = (ctx, time) => {
    SKY.forEach((band, i) => { ctx.fillStyle = band; ctx.fillRect(-16, Math.round((i * horizon) / 5) - (i ? 0 : 16), CW + 32, Math.ceil(horizon / 5) + (i ? 1 : 17)) })
    ctx.fillStyle = '#ffffffd8'
    for (const [cx, cy, cw] of [[30, 26, 54], [190, 52, 38], [330, 20, 46], [470, 44, 40]]) { // nubes que pasan despacio
      const x = ((cx + time * 0.006) % (CW + 80)) - 60
      ctx.fillRect(x, cy, cw, 8)
      ctx.fillRect(x + 8, cy - 5, cw - 20, 5)
    }
    for (const [fill, lift, f1, f2] of [['#7cc8a0', 30, 0.021, 0.05], ['#58b888', 14, 0.034, 0.09]] as [string, number, number, number][]) { // dos filas de colinas
      ctx.fillStyle = fill
      for (let x = -16; x < CW + 16; x += 2) ctx.fillRect(x, horizon - lift - Math.sin(x * f1) * 12 - Math.sin(x * f2) * 5, 2, 60)
    }
    for (let y = horizon; y < CH + 16; y += 32) {
      for (let x = -32; x < CW + 32; x += 32) ctx.drawImage(pieces, pieceAt.grass.x + (((x + 32) >> 5) % 4) * 16, ((y >> 5) % 4) * 16, 16, 16, x, y, 32, 32)
    }
    for (let y = base - 2; y < CH + 16; y += 32) { // camino de tierra hasta la puerta
      ctx.drawImage(pieces, pieceAt.path.x, 16, 16, 16, bx - 32, y, 32, 32)
      ctx.drawImage(pieces, pieceAt.path.x + 32, 16, 16, 16, bx, y, 32, 32)
    }
    for (let x = -10; x < CW; x += 58) { // pinos al fondo, menos detrás del edificio
      if (Math.abs(x + tree.w - bx) < piece.w + 34) continue
      ctx.drawImage(pieces, tree.x, 0, tree.w, tree.h, x, horizon + 22 + ((x * 7) % 3) * 6 - tree.h * S, tree.w * S, tree.h * S)
    }
    ctx.save()
    ctx.translate(bx, base)
    ctx.scale(S * (1 + 0.08 * squash), S * (1 - 0.12 * squash))
    ctx.fillStyle = 'rgba(8, 24, 40, 0.28)'
    ctx.fillRect(-piece.w / 2 + 3, -3, piece.w - 2, 6)
    // Sin dueño está en gris; al capturarlo el color baja como una cortina
    ctx.drawImage(grayPieces, piece.x, 0, piece.w, piece.h, -piece.w / 2, -piece.h, piece.w, piece.h)
    if (color > 0) ctx.drawImage(pieces, piece.x, 0, piece.w, piece.h * color, -piece.w / 2, -piece.h, piece.w, piece.h * color)
    if (glow > 0) { // el edificio se ilumina al cambiar de dueño
      ctx.globalAlpha = glow
      ctx.globalCompositeOperation = 'lighter'
      ctx.drawImage(pieces, piece.x, 0, piece.w, piece.h, -piece.w / 2, -piece.h, piece.w, piece.h)
      ctx.globalCompositeOperation = 'source-over'
      ctx.globalAlpha = 1
    }
    // Mástil y bandera
    const fx0 = piece.w / 2 - 8, top = -piece.h - 22
    ctx.fillStyle = '#10141c'
    ctx.fillRect(fx0, top, 2, 34)
    ctx.fillRect(fx0 - 1, top - 2, 4, 3)
    if (flagTeam >= 0) {
      const y = top + 1 + (1 - Math.max(0, Math.min(1, flag))) * 21, wave = Math.floor(time / 160) % 3
      ctx.fillRect(fx0 - 19, y - 1, 20, 13)
      ctx.fillStyle = TEAM_HEX[flagTeam]
      ctx.fillRect(fx0 - 18, y, 18, 11)
      ctx.fillStyle = '#ffffff70'
      ctx.fillRect(fx0 - 18 + wave * 6, y, 4, 11)
    }
    ctx.restore()
  }
  scene.foreground = (ctx) => { // hierba alta en primer plano, para dar profundidad
    for (const x of [0, 32, CW - 64, CW - 32]) ctx.drawImage(pieces, pieceAt.tall.x, 0, 16, 16, x, CH - 26, 32, 32)
  }

  // Interfaz: quién captura, qué captura y la barra de resistencia del edificio
  const TEAM_NAME = ['Rojo', 'Azul'], owner = c.building.owner
  const ui = document.createElement('div')
  ui.className = `capui t${c.team}`
  ui.innerHTML = `<div class="capwho"><img src="${facePath(k.species)}" alt=""><div><b>${k.name}</b><span>${ROLES[k.role].name} · Equipo ${TEAM_NAME[c.team]}</span></div></div>
    <div class="capwhat o${owner}"><small>CAPTURANDO</small><b>${info.name}</b><span>${owner < 0 ? 'Sin dueño' : 'Del Equipo ' + TEAM_NAME[owner]}</span></div>
    <div class="capgauge o${owner}"><div class="num"><b></b><small>/ ${c.total}</small></div>
      <div class="segs">${'<i></i>'.repeat(c.total)}</div><span>RESISTENCIA DEL EDIFICIO</span></div>`
  root.append(ui)
  const segs = [...ui.querySelectorAll<HTMLElement>('.segs i')], num = ui.querySelector<HTMLElement>('.num b')!, gauge = ui.querySelector<HTMLElement>('.capgauge')!
  const at = (x: number, y: number) => `left:${(x / CW) * 100}%;top:${(y / CH) * 100}%`
  const pop = (text: string, x: number, y: number, cls: string) => {
    const el = document.createElement('div')
    el.className = 'cappop ' + cls
    el.style.cssText = at(x, y)
    el.textContent = text
    ui.append(el)
    setTimeout(() => el.remove(), 1100)
  }
  let shown = c.capBefore
  const showCount = (n: number, quiet = false) => {
    n = Math.max(0, n)
    segs.forEach((seg, i) => seg.classList.toggle('off', i >= n))
    num.textContent = String(n)
    if (!quiet) { restartClass(gauge, 'tick'); if (n < shown) pop('−' + (shown - n), bx - piece.w * S * 0.5 - 26, roof + 6, 'dmg') }
    shown = n
  }
  showCount(c.capBefore, true)
  void ui.offsetWidth
  ui.classList.add('in')
  sfx.cry(k.species, 1, 0.6)

  // Entra andando desde la izquierda y salta al tejado
  const startX = bx - piece.w * S / 2 - 40
  const act = scene.actor(k.species, -30, base + 18, DIR.right, scale)
  scene.play(act, 'Walk', true)
  await scene.tween(520, (t) => { act.ox = (startX + 30) * easeOut(t) })
  act.x = startX; act.ox = 0
  scene.play(act, 'Hop')
  sfx.lunge()
  act.shadow = false
  const jumpX = bx - act.x, jumpY = roof - act.y
  await scene.tween(420, (t) => { act.ox = jumpX * t; act.oy = jumpY * t - Math.sin(t * Math.PI) * 46 })
  act.x = bx; act.y = roof; act.ox = act.oy = 0
  act.dir = DIR.down

  const stomps = c.done ? 3 : 2
  for (let i = 1; i <= stomps; i++) {
    const last = i === stomps && c.done
    scene.play(act, 'Hop')
    await scene.tween(last ? 420 : 260, (t) => { act.oy = -Math.sin(t * Math.PI) * (last ? 56 : 32); act.sy = 1 + 0.15 * Math.sin(t * Math.PI) })
    act.oy = 0
    // Pisotón: el edificio se aplasta y rebota, la barra se vacía y la bandera baja
    const now = Math.round(c.capBefore + ((c.capAfter - c.capBefore) * i) / stomps)
    showCount(now)
    void scene.tween(240, (t) => { flag += (now / c.total - flag) * t })
    scene.addShake(last ? 9 : 5)
    scene.hitStop(last ? 110 : 50)
    sfx.capture() // el pisotón contra el tejado, siempre
    if (last) sfx.bigHit()
    scene.add({ ring: last ? 90 : 50, size: 5, color: '#fff', x: bx, y: roof, max: 280 })
    for (const side of [-1, 1]) {
      scene.fx('gray_smoke', bx + side * (piece.w * S / 2 + 4), base - 12, { fps: 12, scale: 2, flipX: side < 0, vx: side * 0.9 })
      scene.burst(bx + side * piece.w * S / 2, base - 4, 8, { colors: ['#e8f0d8', '#c8d0b8'], speed: 2.4, up: 1.4, max: 420, size: 4 })
    }
    void scene.tween(340, (t) => { squash = (1 - t) * Math.cos(t * Math.PI * 3) * (last ? 1.6 : 1); act.oy = piece.h * S * 0.12 * squash })
    await scene.wait(last ? 300 : 210)
  }

  const banner = document.createElement('div')
  if (c.done) {
    scene.flashScreen('#fff', 0.9, 5)
    music.play('') // se corta la tensión y entra la fanfarria
    sfx.captured()
    void scene.tween(700, (t) => { glow = Math.sin(t * Math.PI) })
    if (color < 1) void scene.tween(520, (t) => { color = easeOut(t) })
    await scene.tween(260, (t) => { flag = Math.min(flag, 1 - t) })
    flagTeam = c.team
    void scene.tween(460, (t) => { flag = easeBack(t) })
    // La barra se vuelve a llenar, ya del color del nuevo dueño
    gauge.className = `capgauge o${c.team} won`
    const what = ui.querySelector<HTMLElement>('.capwhat')!
    what.className = `capwhat o${c.team}`
    what.querySelector('small')!.textContent = 'CAPTURADO'
    what.querySelector('span')!.textContent = 'Ahora del Equipo ' + TEAM_NAME[c.team]
    setTimeout(() => gauge.classList.add('out'), 700) // deja sitio al cartel
    segs.forEach((seg, i) => { seg.style.transitionDelay = i * 18 + 'ms'; seg.classList.remove('off') })
    num.textContent = String(c.total)
    scene.add({ ring: 260, size: 8, color: TEAM_HEX[c.team], x: bx, y: base - piece.h * S / 2, max: 650 })
    for (let i = 0; i < 70; i++) {
      scene.add({ img: 'confetti', frame: Math.floor(rnd(0, 12)), x: bx + rnd(-60, 60), y: base - piece.h * S, vx: rnd(-4.4, 4.4), vy: rnd(-7, -2.5), g: 0.16, drag: 0.98, max: rnd(1000, 1700), scale: 2, vr: 0.2 })
    }
    for (let i = 0; i < 12; i++) scene.add({ img: 'gold_stars', x: bx, y: roof, vx: Math.cos(i) * 3.6, vy: Math.sin(i) * 3.6 - 1.5, drag: 0.94, max: 800, scale: 2 })
    await scene.wait(380)
    banner.className = `capbanner t${c.team}`
    banner.innerHTML = `<b>${[...'¡CAPTURADO!'].map((ch, i) => `<span style="--i:${i}">${ch}</span>`).join('')}</b>
      <span>${c.building.type === 'gym' ? '¡El gimnasio rival ha caído!' : `${info.name} · ${info.help}`}</span>`
    ui.append(banner)
    sfx.cry(k.species, 1.1, 0.7)
    scene.play(act, 'Rotate')
    await scene.tween(520, (t) => { act.oy = -Math.sin(t * Math.PI) * 40 })
    scene.play(act, 'Hop')
    await scene.tween(360, (t) => { act.oy = -Math.sin(t * Math.PI) * 22 })
    scene.play(act, 'Idle', true)
    await scene.wait(900)
  } else {
    banner.className = 'capbanner hold'
    banner.innerHTML = `<b>¡AGUANTA!</b><span>Le quedan ${c.capAfter} puntos: sigue encima el próximo turno</span>`
    ui.append(banner)
    scene.play(act, 'Idle', true)
    await scene.wait(1100)
  }
  await close()
  ui.remove()
  scene.resize(W, H)
}

// ---------- Atrapar a un salvaje: el lanzamiento de Ball ----------

// «El cerco». Alrededor del salvaje gira un cursor sobre un dial con tres clases de zona, y un solo botón decide:
//   · verde: tu Capturador se lanza y lo golpea. Le quita aguante: cada golpe agranda la zona dorada… y añade rojo.
//   · dorada: lanzas la Ball. Cuanto más cansado esté, más fácil que la retenga; agotado, no falla.
//   · roja: te ve venir y te pega él. Tu Capturador pierde PS de verdad, los que luego tiene en el mapa.
// Pulsar fuera de zona, dejar pasar una vuelta entera o fallar una Ball le gasta la paciencia: a cero, huye. Así que
// hay que decidir cuánto arriesgar: lanzar ya con poca probabilidad o seguir cansándolo con más rojo y más prisa.
// Y cada tipo de Pokémon retuerce el dial a su manera (ver traitOf).

export interface CatchData {
  kind: string; team: number; hp: number // el Capturador y los PS con los que llega
  wild: string
  funds: number
  sure?: boolean // el tutorial no falla
}
/** `fled`: el salvaje se ha ido del mapa. `hurt`: los PS que ha perdido el Capturador. */
export interface CatchResult { caught: boolean; spent: number; fled: boolean; hurt: number }
interface Press { kind: 'hit' | 'ball' | 'foe' | 'miss' | 'lap' | 'quit'; exact: number }
const ZONE: Record<string, string> = { hit: '#58e070', ball: '#ffd84a', foe: '#ff5040' }
/** Cómo se comporta cada salvaje en el cerco, según su tipo. */
function traitOf(type: PType): { id: 'fast' | 'sly' | 'tough' | 'restless' | 'fierce' | 'calm'; name: string; help: string } {
  if (type === 'electric' || type === 'flying' || type === 'fighting') return { id: 'fast', name: 'Veloz', help: 'el cursor corre más' }
  if (type === 'ghost' || type === 'dark' || type === 'psychic') return { id: 'sly', name: 'Escurridizo', help: 'las zonas se esconden a ratos' }
  if (type === 'rock' || type === 'steel' || type === 'ground') return { id: 'tough', name: 'Duro', help: 'aguanta un golpe más, pero va lento' }
  if (type === 'grass' || type === 'bug' || type === 'poison') return { id: 'restless', name: 'Inquieto', help: 'las zonas no paran quietas' }
  if (type === 'fire' || type === 'dragon') return { id: 'fierce', name: 'Feroz', help: 'si te pega, quita 3 PS' }
  return { id: 'calm', name: 'Tranquilo', help: 'sin trucos' }
}

const BALL_IMG = BALLS.map((b) => { const img = new Image(); img.src = `assets/ui/${b.id === 'poke' ? 'ball' : 'ball_' + b.id}.png`; return img })
let catchInput: ((key: string) => void) | null = null
/** Teclas mientras se está lanzando (las reparte main.ts). Devuelve si la escena las quería. */
export function sceneKey(key: string): boolean {
  if (!catchInput) return false
  catchInput(key)
  return true
}

/**
 * Minijuego de captura. Alrededor del salvaje se cierra un aro una y otra vez: cuanto más pequeño esté al lanzar,
 * más fácil es que la Ball lo retenga. Debilitado, el aro va despacio y casi cualquier lanzamiento vale; en plena
 * forma va rápido y hay que afinar. Cada lanzamiento gasta una Ball (las mejores cuestan más y ayudan más), hay
 * tres intentos y el salvaje puede huir si se libera.
 */
export async function playCatch(c: CatchData): Promise<CatchResult> {
  const CH = 232, CW = Math.round((CH * Math.max(1.25, Math.min(2.4, innerWidth / innerHeight))) / 2) * 2
  scene.resize(CW, CH)
  await open('capture', 'wild')
  const k = KINDS[c.kind], w = KINDS[c.wild]
  const base = CH - 62, horizon = base - 74, wx = Math.round(CW * 0.64), wy = base - 6, R = 50
  const cy = wy - 34, trait = traitOf(w.type)
  let held: { x: number; y: number; rot: number; ball: number } | null = null
  // El cerco. Aguante: los golpes que le quedan por recibir hasta agotarse. Paciencia: lo que tarda en hartarse y huir.
  const maxStamina = trait.id === 'tough' ? 4 : 3
  let stamina = maxStamina, patience = 5, rage = 0, hp = c.hp, hurt = 0, spent = 0, ball = 0
  let arcs: { from: number; w: number; kind: 'hit' | 'ball' | 'foe' }[] = [], angle = -Math.PI / 2, dir = 1, speed = 0, drift = 0, lap = 0
  let live = false, dial = false, lastTime = 0
  let settle: ((p: Press) => void) | null = null
  const tired = () => maxStamina - stamina
  /** Probabilidad de que la Ball elegida lo retenga ahora mismo: sube con cada golpe; agotado, no falla. */
  const chanceNow = () => (c.sure || stamina <= 0 ? 1 : Math.min(0.97, [0.3, 0.5, 0.72, 0.88][Math.min(3, tired())] + BALLS[ball].bonus))
  /** Reparte las zonas por el dial: cuanto más cansado, más dorado… y más rojo, y más deprisa gira. */
  const layout = () => {
    if (c.sure) { arcs = [{ from: 0, w: Math.PI * 2, kind: 'ball' }]; speed = (Math.PI * 2) / 2600; return }
    const parts: { w: number; kind: 'hit' | 'ball' | 'foe' }[] = [{ w: stamina <= 0 ? 2.2 : Math.min(1, 0.3 + 0.2 * tired()), kind: 'ball' }]
    if (stamina > 0) parts.push({ w: Math.max(0.42, 0.85 - 0.14 * tired()), kind: 'hit' })
    for (let n = Math.min(4, 1 + tired() + rage); n > 0; n--) parts.push({ w: trait.id === 'tough' ? 0.6 : 0.44, kind: 'foe' })
    parts.sort(() => Math.random() - 0.5)
    const free = Math.PI * 2 - parts.reduce((sum, p) => sum + p.w, 0), cuts = parts.map(() => 0.3 + Math.random())
    const total = cuts.reduce((sum, v) => sum + v, 0)
    let at = Math.random() * Math.PI * 2
    arcs = parts.map((p, n) => { const arc = { from: at, w: p.w, kind: p.kind }; at += p.w + (free * cuts[n]) / total; return arc })
    drift = 0
    if (trait.id === 'calm' || Math.random() < 0.5) dir = -dir
    speed = ((Math.PI * 2) / 2100) * (1 + 0.14 * tired() + 0.1 * rage) * (trait.id === 'fast' ? 1.3 : trait.id === 'tough' ? 0.82 : 1)
  }
  /** La zona que hay bajo ese ángulo, y lo centrado que cae en ella (0 en el borde, 1 en el medio). */
  const zoneAt = (a: number): Press | null => {
    const full = Math.PI * 2
    for (const arc of arcs) {
      const rel = ((((a - arc.from - drift) % full) + full) % full)
      if (rel <= arc.w) return { kind: arc.kind, exact: 1 - Math.abs(rel / arc.w - 0.5) * 2 }
    }
    return null
  }
  scene.background = (ctx, time) => {
    SKY.forEach((band, i) => { ctx.fillStyle = band; ctx.fillRect(-16, Math.round((i * horizon) / 5) - (i ? 0 : 16), CW + 32, Math.ceil(horizon / 5) + (i ? 1 : 17)) })
    ctx.fillStyle = '#ffffffd8'
    for (const [cx, cy, cw] of [[40, 22, 50], [220, 44, 36], [380, 16, 44]]) {
      const x = ((cx + time * 0.006) % (CW + 80)) - 60
      ctx.fillRect(x, cy, cw, 8)
      ctx.fillRect(x + 8, cy - 5, cw - 20, 5)
    }
    for (const [fill, lift, f1, f2] of [['#7cc8a0', 28, 0.021, 0.05], ['#58b888', 12, 0.034, 0.09]] as [string, number, number, number][]) {
      ctx.fillStyle = fill
      for (let x = -16; x < CW + 16; x += 2) ctx.fillRect(x, horizon - lift - Math.sin(x * f1) * 12 - Math.sin(x * f2) * 5, 2, 60)
    }
    for (let y = horizon; y < CH + 16; y += 32) for (let x = -32; x < CW + 32; x += 32) ctx.drawImage(pieces, pieceAt.grass.x + (((x + 32) >> 5) % 4) * 16, ((y >> 5) % 4) * 16, 16, 16, x, y, 32, 32)
    for (let x = -10; x < CW; x += 64) ctx.drawImage(pieces, pieceAt.tree.x, 0, pieceAt.tree.w, pieceAt.tree.h, x, horizon + 18 + ((x * 7) % 3) * 6 - pieceAt.tree.h * 2, pieceAt.tree.w * 2, pieceAt.tree.h * 2)
    // El claro de hierba alta donde estaba escondido: se mece
    const sway = Math.floor(time / 260) % 2
    for (let row = 0; row < 2; row++) for (let x = wx - 96; x < wx + 96; x += 32) tallGrass(ctx, x + (row ? 16 : 0) + (sway ? 1 : -1) * (row ? 1 : -1), wy - 34 + row * 14)
  }
  scene.foreground = (ctx, time) => {
    for (let x = wx - 112; x < wx + 112; x += 32) tallGrass(ctx, x, wy - 8) // la hierba le tapa las patas
    for (const x of [0, 32, CW - 64, CW - 32]) tallGrass(ctx, x, CH - 26)
    if (held) { // la Ball en vuelo o en el suelo
      ctx.save()
      ctx.translate(Math.round(held.x), Math.round(held.y))
      ctx.rotate(held.rot)
      ctx.drawImage(BALL_IMG[held.ball], -15, -15)
      ctx.restore()
    }
    // El cerco: el dial alrededor del salvaje. Mientras está vivo, el cursor gira; si da una vuelta entera sin que pulses, se impacienta.
    const dt = Math.min(50, time - lastTime)
    lastTime = time
    if (live) {
      const step = speed * dt
      angle += dir * step
      if (trait.id === 'restless') drift -= dir * step * 0.35 // las zonas tampoco paran quietas
      if ((lap += step) >= Math.PI * 2 && !c.sure) settle?.({ kind: 'lap', exact: 0 })
    }
    if (!dial) return
    const hidden = trait.id === 'sly' && live && Math.floor(time / 620) % 3 === 2 // escurridizo: las zonas desaparecen a ratos
    const under = live ? zoneAt(angle) : null
    ctx.lineCap = 'butt'
    ctx.strokeStyle = 'rgba(16, 20, 28, 0.6)'
    ctx.lineWidth = 12
    ctx.beginPath(); ctx.arc(wx, cy, R, 0, Math.PI * 2); ctx.stroke()
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)'
    ctx.lineWidth = 2
    ctx.beginPath(); ctx.arc(wx, cy, R, 0, Math.PI * 2); ctx.stroke()
    if (!hidden) {
      for (const arc of arcs) {
        const on = under?.kind === arc.kind && live, pulse = arc.kind === 'ball' ? 0.75 + 0.25 * Math.sin(time / 110) : 1
        for (const [color, width] of [['#10141c', on ? 13 : 11], [ZONE[arc.kind], on ? 9 : 7]] as const) {
          ctx.strokeStyle = color
          ctx.globalAlpha = width > 10 ? 1 : pulse
          ctx.lineWidth = width
          ctx.beginPath(); ctx.arc(wx, cy, R, arc.from + drift + (width > 10 ? -0.03 : 0), arc.from + arc.w + drift + (width > 10 ? 0.03 : 0)); ctx.stroke()
        }
        ctx.globalAlpha = 1
      }
    }
    // El cursor: una punta blanca con su estela
    for (let i = 4; i >= 0; i--) {
      const a = angle - dir * i * 0.07, x = wx + Math.cos(a) * R, y = cy + Math.sin(a) * R
      ctx.fillStyle = i ? `rgba(255, 255, 255, ${0.5 - i * 0.1})` : '#10141c'
      ctx.beginPath(); ctx.arc(x, y, i ? 5 - i * 0.6 : 8, 0, Math.PI * 2); ctx.fill()
      if (!i) { ctx.fillStyle = under ? ZONE[under.kind] : '#fff'; ctx.beginPath(); ctx.arc(x, y, 5.5, 0, Math.PI * 2); ctx.fill() }
    }
  }

  const foe = scene.actor(w.species, wx, wy, DIR.left, scaleOf(c.wild))
  scene.play(foe, 'Idle', true)
  foe.visible = false // aún está escondido: saldrá de un salto
  const me = scene.actor(k.species, Math.round(CW * 0.2), base + 30, DIR.right, scaleOf(c.kind))
  scene.play(me, 'Walk', true)
  me.ox = -CW * 0.4
  void scene.tween(520, (t) => { me.ox = -CW * 0.4 * (1 - easeOut(t)) }).then(() => scene.play(me, 'Idle', true))
  const dizzyTimer = setInterval(() => { // cansado: le dan vueltas las estrellas
    if (stamina > 1 || !foe.visible) return
    for (let i = 0; i < 3; i++) scene.add({ img: 'gold_stars', x: wx + Math.cos(i * 2.1 + scene.time / 300) * 20, y: wy - 62 + Math.sin(i * 2.1 + scene.time / 300) * 5, max: 240, scale: 1 })
  }, 240)

  const ui = document.createElement('div')
  ui.className = `capui catchui t${c.team}`
  ui.innerHTML = `<div class="capwho"><img src="${facePath(k.species)}" alt=""><div><b>${k.name}</b><span class="myhp"><u><i></i></u><em></em></span></div></div>
    <div class="capwhat o-1"><small>POKÉMON SALVAJE · ${TYPE_NAME[w.type].toUpperCase()}</small><b>${w.name}</b><span class="trait"><em>${trait.name}</em> ${trait.help}</span>
      <div class="gauges"><span>Aguante<i class="stam"></i></span><span>Paciencia<i class="pat"></i></span></div></div>
    <div class="catchbar">
      <div class="purse"><i class="coin"></i><b></b></div>
      <div class="balls">${BALLS.map((b, i) => `<button data-ball="${i}"><img src="${BALL_IMG[i].src}" alt=""><b>${b.name}</b><span>${b.cost}₽</span></button>`).join('')}</div>
      <button class="throw">¡YA!</button>
      <div class="odds"></div>
      <p><i class="z hit"></i>golpéalo para cansarlo · <i class="z ball"></i>lanza la Ball · <i class="z foe"></i>te pega y pierdes PS<span class="tecla"> · <kbd>←</kbd><kbd>→</kbd> Ball · <kbd>Enter</kbd> ¡ya! · <kbd>Esc</kbd> dejarlo</span></p>
      <button class="quit dedo">Dejarlo</button>
    </div>`
  root.append(ui)
  const q = <E extends HTMLElement>(sel: string) => ui.querySelector(sel) as E
  const buttons = [...ui.querySelectorAll<HTMLButtonElement>('.balls button')]
  const left = () => c.funds - spent
  const pips = (n: number, of: number) => '<b class="on"></b>'.repeat(Math.max(0, n)) + '<b></b>'.repeat(Math.max(0, of - n))
  const refresh = () => {
    q('.purse b').textContent = String(left())
    buttons.forEach((btn, i) => { btn.disabled = BALLS[i].cost > left(); btn.classList.toggle('on', i === ball) })
    q('.stam').innerHTML = pips(stamina, maxStamina)
    q('.pat').innerHTML = pips(patience, 5)
    q('.myhp i').style.width = hp * 10 + '%'
    q('.myhp i').style.background = hp > 5 ? '#58d058' : hp > 2 ? '#f0c030' : '#e84838'
    q('.myhp em').textContent = `${hp}/10 PS`
    q('.odds').innerHTML = left() < BALLS[0].cost ? 'Sin dinero para una Ball' : `Si lanzas ahora: <b>${Math.round(chanceNow() * 100)}%</b>`
  }
  const pickBall = (i: number) => { if (BALLS[i].cost <= left() && i !== ball) { ball = i; sfx.cursor(); refresh() } }
  const pop = (text: string, x: number, y: number, cls: string) => {
    const el = document.createElement('div')
    el.className = 'cappop ' + cls
    el.style.cssText = `left:${(x / CW) * 100}%;top:${(y / CH) * 100}%`
    el.textContent = text
    ui.append(el)
    setTimeout(() => el.remove(), 1100)
  }
  refresh()
  // La aparición: la hierba se agita cada vez más, sale de un salto entre hojas, tu Pokémon se sobresalta y entra su nombre
  for (let i = 0; i < 3; i++) {
    scene.fx('jump_tall_grass', wx + rnd(-26, 26), wy - 6, { fps: 14, scale: 2 })
    for (let n = 0; n < 4; n++) scene.add({ img: 'leaf', fps: 16, loop: true, x: wx + rnd(-30, 30), y: wy - 10, vx: rnd(-1.5, 1.5), vy: rnd(-2.5, -1), g: 0.12, max: 600, scale: 1 })
    sfx.step()
    scene.addShake(1 + i)
    await scene.wait(230 - i * 40)
  }
  foe.visible = true
  foe.sy = foe.sx = 0.4
  scene.play(foe, 'Hop')
  sfx.cry(w.species, 1, 0.7)
  scene.flashScreen('#fff', 0.55, 6)
  scene.addShake(6)
  scene.add({ ring: 54, size: 6, color: '#fff', x: wx, y: wy - 30, max: 340 })
  for (let n = 0; n < 16; n++) scene.add({ img: 'leaf', fps: 18, loop: true, x: wx + rnd(-10, 10), y: wy - 20, vx: rnd(-4, 4), vy: rnd(-5, -1.5), g: 0.14, max: 900, scale: n % 3 ? 1 : 2 })
  void scene.tween(420, (t) => { foe.oy = -Math.sin(t * Math.PI) * 46; foe.sx = foe.sy = 0.4 + 0.6 * easeBack(Math.min(1, t * 1.6)) }).then(() => { foe.oy = 0; scene.play(foe, 'Idle', true) })
  scene.play(me, 'Hurt') // el susto
  void scene.tween(260, (t) => { me.oy = -Math.sin(t * Math.PI) * 10; me.ox = -6 * Math.sin(t * Math.PI) }).then(() => scene.play(me, 'Idle', true))
  pop('!', me.x + 4, me.y - 74, 'alert')
  const hello = document.createElement('div')
  hello.className = 'wildhello'
  hello.innerHTML = `<small>¡UN POKÉMON SALVAJE!</small><b>${[...w.name.toUpperCase()].map((ch, i) => `<span style="--i:${i}">${ch}</span>`).join('')}</b>`
  ui.append(hello)
  setTimeout(() => hello.remove(), 1500)
  await scene.wait(1250)
  void ui.offsetWidth
  ui.classList.add('in')

  /** Espera a que se pulse (devuelve en qué zona estaba el cursor), a que dé la vuelta entera o a que se deje. */
  const turn = () => new Promise<Press>((resolve) => {
    lap = 0
    live = true
    settle = (value) => {
      settle = catchInput = null
      live = false
      q<HTMLButtonElement>('.throw').onclick = q<HTMLButtonElement>('.quit').onclick = scene.canvas.onpointerdown = null
      resolve(value)
    }
    const fire = () => settle?.(zoneAt(angle) ?? { kind: 'miss', exact: 0 })
    catchInput = (key) => {
      if (key === 'ArrowLeft' || key === 'ArrowRight') { for (let i = ball + (key === 'ArrowRight' ? 1 : -1); i >= 0 && i < BALLS.length; i += key === 'ArrowRight' ? 1 : -1) if (BALLS[i].cost <= left()) return pickBall(i) }
      else if (key === 'Enter' || key === ' ' || key === 'z') fire()
      else if (key === 'Escape' || key === 'x') settle?.({ kind: 'quit', exact: 0 })
    }
    q<HTMLButtonElement>('.throw').onclick = fire
    q<HTMLButtonElement>('.quit').onclick = () => settle?.({ kind: 'quit', exact: 0 })
    scene.canvas.onpointerdown = fire // tocar la escena también vale
    buttons.forEach((btn, i) => (btn.onclick = () => pickBall(i)))
  })

  let caught = false, fled = false
  await scene.wait(350)
  while (!caught && !fled) {
    if (BALLS[ball].cost > left()) ball = 0
    layout()
    refresh()
    ui.classList.remove('busy')
    dial = true
    const press = await turn()
    ui.classList.add('busy')
    if (press.kind === 'quit') break

    if (press.kind === 'hit') { // en verde: tu Pokémon se lanza y lo cansa
      scene.play(me, 'Attack')
      sfx.lunge()
      const reachX = wx - me.x - 26 * foe.scale * 0.5, reachY = wy - me.y
      await scene.tween(150, (t) => { me.ox = reachX * easeIn(t); me.oy = reachY * easeIn(t) - Math.sin(t * Math.PI) * 14; if (Math.random() < 0.5) scene.ghost(me) })
      stamina--
      scene.hitStop(90)
      scene.addShake(5)
      scene.canvas.animate([{ transform: 'scale(1.06)' }, { transform: 'scale(1)' }], { duration: 260, easing: 'cubic-bezier(0.2, 1.4, 0.4, 1)' })
      scene.fx('hit', wx, cy, { fps: 20, scale: 2.6 })
      scene.add({ ring: 40, size: 6, color: '#58e070', x: wx, y: cy, max: 300 })
      scene.burst(wx, cy, 12, { colors: ['#fff', '#58e070'], speed: 3.5, size: 3, max: 360 })
      sfx.thump(0.5); sfx.hit()
      scene.play(foe, 'Hurt')
      foe.tint = ['#fff', 1]
      void scene.tween(300, (t) => { foe.tint[1] = Math.floor(t * 6) % 2 ? 0 : 1 - t; foe.ox = 10 * (1 - t) })
      pop(stamina <= 0 ? '¡AGOTADO!' : press.exact > 0.6 ? '¡En el punto!' : '¡Golpe!', wx, wy - 100, 'good')
      if (stamina <= 0) { foe.tint = ['#6878a0', 0.3]; sfx.ready() }
      refresh()
      void scene.tween(300, (t) => { me.ox = reachX * (1 - easeOut(t)); me.oy = reachY * (1 - easeOut(t)) - Math.sin(t * Math.PI) * 12 }).then(() => scene.play(me, 'Idle', true))
      await scene.wait(520)
      scene.play(foe, 'Idle', true)
      continue
    }

    if (press.kind === 'foe') { // en rojo: te ve venir y te pega él
      const dmg = trait.id === 'fierce' ? 3 : 2
      scene.play(foe, 'Attack')
      sfx.cry(w.species, 1.1, 0.5)
      const reachX = me.x - wx + 22, reachY = me.y - wy
      await scene.tween(170, (t) => { foe.ox = reachX * easeIn(t); foe.oy = reachY * easeIn(t) - Math.sin(t * Math.PI) * 18; if (Math.random() < 0.5) scene.ghost(foe) })
      hp = Math.max(1, hp - dmg)
      hurt += dmg
      scene.hitStop(130)
      scene.addShake(9)
      scene.flashScreen('#ff3020', 0.45, 5)
      scene.canvas.animate([{ transform: 'scale(1.1)' }, { transform: 'scale(1)' }], { duration: 320, easing: 'cubic-bezier(0.2, 1.4, 0.4, 1)' })
      scene.fx('hit', me.x, me.y - 30, { fps: 20, scale: 3 })
      scene.burst(me.x, me.y - 30, 16, { colors: ['#fff', '#ff5040'], speed: 4, size: 3, max: 380 })
      sfx.thump(0.8); sfx.bigHit()
      scene.play(me, 'Hurt')
      me.tint = ['#ff5040', 0.8]
      void scene.tween(360, (t) => { me.tint[1] = 0.8 * (1 - t); me.ox = -14 * (1 - t) })
      pop(`−${dmg} PS`, me.x, me.y - 80, 'dmg')
      pop('¡Te ha visto venir!', wx, wy - 100, 'weak')
      restartClass(q('.capwho'), 'hurt')
      refresh()
      void scene.tween(320, (t) => { foe.ox = reachX * (1 - easeOut(t)); foe.oy = reachY * (1 - easeOut(t)) - Math.sin(t * Math.PI) * 14 }).then(() => scene.play(foe, 'Idle', true))
      await scene.wait(640)
      scene.play(me, 'Idle', true)
      if (hp <= 1) { // no puede seguir: se retira y el salvaje se queda donde estaba
        pop('¡No puede más! Se retira…', CW / 2, CH * 0.42, 'dmg')
        sfx.error()
        await scene.wait(1100)
        break
      }
      continue
    }

    if (press.kind === 'miss' || press.kind === 'lap' || (press.kind === 'ball' && left() < BALLS[ball].cost)) { // al aire, o se te pasó la vuelta
      patience--
      pop(press.kind === 'lap' ? 'Se impacienta…' : press.kind === 'ball' ? '¡Sin dinero para una Ball!' : '¡Al aire!', wx, wy - 100, 'weak')
      sfx.error()
      scene.play(foe, 'Hop')
      void scene.tween(300, (t) => { foe.oy = -Math.sin(t * Math.PI) * 10 }).then(() => scene.play(foe, 'Idle', true))
      refresh()
      await scene.wait(press.kind === 'lap' ? 380 : 560)
    } else { // en dorado: va la Ball
      dial = false
      const chance = chanceNow() + (press.exact > 0.6 ? 0.1 : 0)
      spent += BALLS[ball].cost
      refresh()
      pop(press.exact > 0.6 ? '¡EXCELENTE!' : '¡Ball va!', wx, wy - 100, 'good')
      scene.play(me, 'Attack')
      sfx.lunge()
      const from = { x: me.x + 14, y: me.y - 30 }
      held = { x: from.x, y: from.y, rot: 0, ball }
      await scene.tween(460, (t) => {
        held!.x = from.x + (wx - from.x) * t
        held!.y = from.y + (wy - 34 - from.y) * t - Math.sin(t * Math.PI) * 70
        held!.rot = t * 14
        if (Math.random() < 0.6) scene.add({ x: held!.x, y: held!.y, max: 260, size: 3, color: '#fff', behind: true })
      })
      scene.play(me, 'Idle', true)
      // Lo absorbe: destello y el Pokémon se encoge hacia la Ball
      scene.flashScreen('#fff', 0.7, 6)
      scene.addShake(4)
      sfx.hit()
      scene.add({ ring: 46, size: 5, color: '#fff', x: wx, y: wy - 34, max: 300 })
      foe.tint = ['#fff', 1]
      await scene.tween(260, (t) => { foe.sx = foe.sy = 1 - t; foe.oy = -34 * t })
      foe.visible = false
      await scene.tween(320, (t) => { held!.y = wy - 34 + (34 - 6) * easeIn(t); held!.rot = 14 + t * 6 })
      sfx.land()
      scene.burst(wx, wy - 4, 8, { colors: ['#e8f0d8', '#c8d0b8'], speed: 1.8, up: 1, max: 380, size: 3 })
      await scene.tween(220, (t) => { held!.y = wy - 6 - Math.sin(t * Math.PI) * 12 })
      held.rot = 0
      // Se menea: uno, dos, tres… o se abre antes
      caught = !!c.sure || Math.random() < chance
      const shakes = caught ? 3 : Math.random() < chance ? 2 : Math.random() < 0.6 ? 1 : 0
      await scene.wait(260)
      for (let i = 0; i < shakes; i++) {
        sfx.ball()
        await scene.tween(440, (t) => { held!.rot = Math.sin(t * Math.PI * 2) * 0.5 * (1 - t * 0.3); held!.x = wx + Math.sin(t * Math.PI * 2) * 4 })
        held.rot = 0; held.x = wx
        await scene.wait(380)
      }
      if (caught) {
        sfx.confirm()
        scene.add({ ring: 40, size: 4, color: '#ffd84a', x: wx, y: wy - 6, max: 400 })
        for (let i = 0; i < 14; i++) scene.add({ img: 'gold_stars', x: wx, y: wy - 8, vx: Math.cos(i * 0.45) * 3.2, vy: Math.sin(i * 0.45) * 3.2 - 2, g: 0.08, drag: 0.95, max: 800, scale: 2 })
        await scene.wait(420)
        music.play('')
        sfx.caught()
        scene.flashScreen('#fff', 0.6, 5)
        for (let i = 0; i < 60; i++) scene.add({ img: 'confetti', frame: Math.floor(rnd(0, 12)), x: wx + rnd(-50, 50), y: wy - 60, vx: rnd(-4, 4), vy: rnd(-6.5, -2), g: 0.16, drag: 0.98, max: rnd(1000, 1600), scale: 2, vr: 0.2 })
        const banner = document.createElement('div')
        banner.className = `capbanner t${c.team}`
        banner.innerHTML = `<b>${[...'¡ATRAPADO!'].map((ch, i) => `<span style="--i:${i}">${ch}</span>`).join('')}</b><span>${w.name} va a la caja de tu Centro Pokémon · ${spent}₽ en Balls${hurt ? ` · −${hurt} PS` : ''}</span>`
        ui.classList.add('won')
        ui.append(banner)
        scene.play(me, 'Hop')
        await scene.tween(900, (t) => { me.oy = -Math.abs(Math.sin(t * Math.PI * 2)) * 16 })
        await scene.wait(1000)
        break
      }
      // Se abre la Ball y sale de un salto, más enfadado
      sfx.error()
      scene.flashScreen('#fff', 0.5, 7)
      scene.addShake(5)
      for (let i = 0; i < 12; i++) scene.add({ x: wx, y: wy - 8, vx: Math.cos(i * 0.52) * 3, vy: Math.sin(i * 0.52) * 3 - 1.5, max: 360, size: 4, colors: ['#fff', '#ff5a48'] })
      held = null
      foe.visible = true
      foe.tint = stamina <= 0 ? ['#6878a0', 0.3] : ['#fff', 0]
      scene.play(foe, 'Hop')
      void scene.tween(300, (t) => { foe.sx = foe.sy = easeBack(t); foe.oy = -34 * (1 - t) - Math.sin(t * Math.PI) * 18 })
      sfx.cry(w.species, 1.1, 0.5)
      pop('¡Se ha liberado! Está furioso', wx, wy - 100, 'dmg')
      rage++
      patience--
      refresh()
      await scene.wait(900)
      scene.play(foe, 'Idle', true)
    }
    if (patience <= 0) { // se harta y huye entre la hierba
      dial = false
      pop('¡Ha huido!', wx, wy - 100, 'weak')
      foe.dir = DIR.right
      scene.play(foe, 'Walk', true)
      await scene.tween(600, (t) => { foe.ox = t * (CW - wx + 40) })
      fled = true
    }
  }
  clearInterval(dizzyTimer)
  catchInput = settle = null
  scene.canvas.onpointerdown = null
  live = dial = false
  await close()
  ui.remove()
  scene.resize(W, H)
  return { caught, spent, fled, hurt }
}
