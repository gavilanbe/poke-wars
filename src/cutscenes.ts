// Escenas a pantalla completa: combate y captura. Todo se dibuja en un lienzo de 256x176 (vista lateral,
// como las escenas de Advance Wars) con los sprites de Mundo Misterioso y los efectos de Esmeralda.
import { ATTACK_NAME, BUILDING_INFO, BuildingType, KINDS, PType, ROLES, TYPE_COLOR, TYPE_NAME, bestMove, moveMult } from './data'
import { BALLS } from './game'
import { Actor, Scene, easeBack, easeIn, easeOut, rnd } from './scene'
import { music, sfx } from './sfx'
import { cover, uncover } from './ui'
import { DIR, facePath, spriteHeight } from './units'

const W = 256, H = 176, HORIZON = 100, FEET = 142
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
const LOOK: Record<string, { sky: string[]; hill: string }> = {
  '.': { sky: SKY, hill: '#58b888' },
  '"': { sky: SKY, hill: '#58b888' },
  T: { sky: SKY, hill: '#3c9464' },
  M: { sky: SUNSET, hill: '#a87858' },
  '~': { sky: SKY, hill: '#4890d8' },
  s: { sky: SKY, hill: '#4890d8' },
  '=': { sky: SKY, hill: '#58b888' },
  B: { sky: SKY, hill: '#58b888' },
}

/** Un tile de suelo del mapa (16 px) pintado a doble tamaño, según el terreno. */
function groundTile(ctx: CanvasRenderingContext2D, terrain: string, x: number, y: number, time: number) {
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

function backdrop(ctx: CanvasRenderingContext2D, place: Place, x0: number, w: number, time: number) {
  const look = LOOK[place.terrain] ?? LOOK['.']
  look.sky.forEach((color, i) => { ctx.fillStyle = color; ctx.fillRect(x0, i * 20, w, 20) })
  ctx.fillStyle = '#ffffffd8'
  for (const [cx, cy, cw] of [[10, 20, 34], [80, 40, 26], [140, 14, 30]]) {
    const x = x0 + ((cx + time * 0.006) % (w + 40)) - 30
    ctx.fillRect(x, cy, cw, 6)
    ctx.fillRect(x + 6, cy - 4, cw - 14, 4)
    ctx.fillRect(x + 4, cy + 6, cw - 10, 2)
  }
  ctx.fillStyle = look.hill
  for (let x = 0; x < w; x += 2) {
    const h = 16 + Math.sin((x + x0) * 0.045) * 8 + Math.sin((x + x0) * 0.11) * 4
    ctx.fillRect(x0 + x, HORIZON - h, 2, h)
  }
  const first = Math.floor(x0 / 32) * 32
  for (let y = HORIZON; y < H; y += 32) for (let x = first; x < x0 + w; x += 32) groundTile(ctx, place.terrain, x, y, time)
  // Lo que hay detrás del Pokémon según el terreno
  const mid = x0 + w / 2
  if (place.terrain === 'T') {
    for (let x = first - 16; x < x0 + w + 32; x += 44) prop(ctx, (x / 44) % 2 < 1 ? 'oak' : 'tree', x, HORIZON + 14 + ((x / 44) % 3) * 4)
  }
  if (place.terrain === 'M') for (const x of [mid - 56, mid + 4, mid + 60]) prop(ctx, 'rock', x, HORIZON + 10)
  if (place.terrain === '"') for (let x = first; x < x0 + w; x += 32) tallGrass(ctx, x, HORIZON - 6)
  if (place.building) { // el edificio real, a tamaño doble, detrás del Pokémon
    const piece = pieceAt[place.building.type]
    ctx.drawImage(place.building.owner < 0 ? grayPieces : pieces, piece.x, 0, piece.w, piece.h, mid - piece.w, HORIZON + 30 - piece.h * 2, piece.w * 2, piece.h * 2)
  }
  const shade = ctx.createLinearGradient(0, HORIZON, 0, HORIZON + 44)
  shade.addColorStop(0, 'rgba(8, 24, 40, 0.3)')
  shade.addColorStop(1, 'rgba(8, 24, 40, 0)')
  ctx.fillStyle = shade
  ctx.fillRect(x0, HORIZON, w, 44)
  if (light) { // la hora del día y la lluvia tiñen la escena
    ctx.fillStyle = light
    ctx.fillRect(x0, -20, w, H + 40)
  }
}

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
}

function setPlate(el: HTMLElement, kind: string, team: number, hp: number) {
  const k = KINDS[kind]
  el.className = `plate ${el.classList.contains('left') ? 'left' : 'right'} t${team}`
  el.querySelector<HTMLImageElement>('img')!.src = facePath(k.species)
  el.querySelector('.name')!.textContent = k.name
  el.querySelector('.type')!.innerHTML = `<span class="pill" style="background:${TYPE_COLOR[k.type]}">${TYPE_NAME[k.type]}</span>`
  setHp(el, hp)
}

function setHp(el: HTMLElement, hp: number) {
  hp = Math.max(0, hp)
  el.querySelector<HTMLElement>('.hp i')!.style.width = el.querySelector<HTMLElement>('.hp u')!.style.width = hp * 10 + '%'
  el.querySelector<HTMLElement>('.hp i')!.style.background = hp > 5 ? '#58d058' : hp > 2 ? '#f0c030' : '#e84838'
  el.querySelector('.hpnum')!.textContent = `${hp}`
}

const say = (text: string) => { root.querySelector('.msg')!.textContent = text }

/** Entra con la cortinilla de barras: tapa el mapa, monta la escena y destapa. */
async function open(mode: string) {
  await cover()
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

interface Side { actor: Actor; kind: string; team: number; hp: number; plate: HTMLElement; sign: number }
type Move = (a: Side, d: Side) => Promise<void> // se resuelve en el momento del impacto

const body = (s: Side): [number, number] => [s.actor.x + s.actor.ox, s.actor.y - 10 * s.actor.scale]

/** Chorro continuo del atacante al objetivo (fuego, agua, aliento). */
async function stream(a: Side, d: Side, spawn: (x: number, y: number, vx: number, vy: number, ms: number) => void) {
  scene.play(a.actor, 'Shoot')
  await scene.wait(120)
  const [ax0, ay] = body(a), [dx, dy] = body(d)
  const ax = ax0 + a.sign * 16, travel = 250, frames = travel / 16.7
  const end = scene.time + 460
  void (async () => {
    while (scene.time < end) {
      for (let i = 0; i < 2; i++) spawn(ax, ay + rnd(-3, 3), ((dx - ax) / frames) * rnd(0.9, 1.1), (dy - ay) / frames + rnd(-0.6, 0.6), travel)
      await scene.wait(20)
    }
  })()
  sfx.shoot()
  await scene.wait(travel)
}

/** Embestida cuerpo a cuerpo: se encoge, cruza la pantalla dejando estela y luego vuelve a su sitio. */
async function dash(a: Side, d: Side, arc = 0) {
  const act = a.actor
  scene.play(act, 'Attack')
  await scene.tween(130, (t) => { act.ox = -a.sign * 10 * easeOut(t); act.sx = 1 + 0.15 * t; act.sy = 1 - 0.15 * t })
  const from = act.ox,
    to = d.actor.x - act.x - a.sign * 12 * act.scale
  sfx.lunge()
  let lastGhost = 0
  await scene.tween(120, (t) => {
    act.ox = from + (to - from) * easeIn(t)
    act.oy = -Math.sin(t * Math.PI) * arc
    act.sx = 1.25
    act.sy = 0.85
    if (scene.time - lastGhost > 18) {
      scene.ghost(act)
      lastGhost = scene.time
      scene.add({ x: act.x + act.ox - a.sign * 10, y: act.y - rnd(6, 40), line: [a.sign * 30, 0], size: 2, max: 160, color: '#fff' })
    }
  })
  act.sx = act.sy = 1
  void (async () => { // vuelta a casa con un saltito
    await scene.wait(330)
    scene.play(act, 'Hop')
    await scene.tween(280, (t) => { act.ox = to * (1 - easeOut(t)); act.oy = -Math.sin(t * Math.PI) * 16 })
    scene.play(act, 'Idle', true)
  })()
}

const FIRE = ['#fff8c0', '#ffd040', '#ff8020', '#d03010']
const BASE_MOVES: Partial<Record<PType, Move>> = {
  fire: async (a, d) => {
    await stream(a, d, (x, y, vx, vy, ms) => {
      scene.add({ img: 'fire', fps: 16, loop: true, x, y, vx, vy, max: ms + 70, scale: 0.8, grow: 2.6 })
      scene.add({ x, y, vx: vx * rnd(0.6, 1), vy: vy - rnd(0, 1.2), max: ms, size: 4, colors: FIRE })
    })
    const [dx] = body(d)
    scene.fx('p:fire', dx, d.actor.y - 34, { frame: 6, count: 8, fps: 13, scale: 1.1 }) // columna de fuego
    scene.fx('p:fire', dx, d.actor.y - 20, { frame: 40, count: 5, fps: 14, scale: 1.2, delay: 60 })
    scene.burst(dx, d.actor.y - 20, 18, { colors: FIRE, speed: 2.4, up: 2, g: 0.05, size: 4, max: 600 })
  },
  water: async (a, d) => {
    await stream(a, d, (x, y, vx, vy, ms) => {
      scene.add({ x, y, vx, vy, max: ms + 40, size: 6, colors: ['#f0faff', '#88c8ff', '#3880e8'] })
      if (Math.random() < 0.15) scene.add({ img: 'bubble', fps: 8, x, y, vx: vx * 0.9, vy: vy - 0.4, max: ms, scale: 2 })
    })
    const [dx, dy] = body(d)
    scene.fx('p:water', dx, dy - 12, { frame: 8, count: 11, fps: 17, scale: 1 }) // tromba
    scene.fx('p:water', dx, dy, { frame: 28, count: 13, fps: 22, scale: 1.3 })
    scene.fx('water_impact', dx, dy, { fps: 0, max: 260, grow: 1.6 })
    scene.burst(dx, dy, 22, { colors: ['#f0faff', '#88c8ff', '#3880e8'], speed: 3, up: 2.5, g: 0.22, size: 4, max: 700 })
  },
  dragon: async (a, d) => {
    await stream(a, d, (x, y, vx, vy, ms) => {
      scene.add({ img: 'purple_flame', fps: 14, loop: true, x, y, vx, vy, max: ms + 60, scale: 1, grow: 2.4, rot: a.sign * 1.57 })
      scene.add({ x, y, vx, vy, max: ms, size: 4, colors: ['#fff', '#b8a0ff', '#6038e0'], add: true })
    })
    const [dx, dy] = body(d)
    scene.fx('p:explosions', dx, dy, { frame: 0, count: 4, fps: 12, scale: 1.4 })
  },
  grass: async (a, d) => {
    scene.play(a.actor, 'Swing')
    await scene.wait(140)
    sfx.shoot()
    const [ax, ay] = body(a), [dx, dy] = body(d)
    for (let i = 0; i < 7; i++) {
      const p = scene.add({ img: 'leaf', fps: 24, loop: true, x: ax, y: ay, max: 320 + i * 35, delay: i * 35, scale: 2 })
      const bend = (i % 2 ? -1 : 1) * (10 + i * 4)
      void scene.wait(i * 35).then(() => scene.tween(280, (t) => {
        p.x = ax + (dx - ax) * t
        p.y = ay + (dy - ay) * t + Math.sin(t * Math.PI) * bend
        if (Math.random() < 0.5) scene.add({ x: p.x, y: p.y, max: 180, size: 2, colors: ['#c8f890', '#58c040'] })
      }))
    }
    await scene.wait(290)
    scene.fx('p:slash', dx, dy, { frame: 5, count: 4, fps: 14, scale: 1.3, flipX: a.sign < 0 })
    for (let i = 0; i < 8; i++) scene.add({ img: 'leaf', fps: 16, loop: true, x: dx, y: dy, vx: rnd(-2.5, 2.5), vy: rnd(-3.5, -1), g: 0.15, max: 700, scale: 1 })
  },
  electric: async (a, d) => {
    scene.play(a.actor, 'Charge')
    const [ax, ay] = body(a), [dx, dy] = body(d)
    scene.fx('electricity', ax, ay, { fps: 16, loop: true, max: 320 })
    sfx.cast()
    await scene.wait(300)
    const strike = () => {
      const x = dx + rnd(-5, 5)
      for (let y = dy - 8; y > -40; y -= 60) scene.add({ img: 'lightning', frame: Math.floor(rnd(0, 4)), x: x + rnd(-4, 4), y: y - 22, max: 80, scale: 2, fade: false, flipX: Math.random() < 0.5 })
      scene.flashScreen('#fff8a0', 0.75, 9)
      scene.addShake(3)
    }
    strike()
    void (async () => { for (let i = 0; i < 2; i++) { await scene.wait(110); strike() } })()
    scene.fx('p:thunder', dx, dy - 8, { frame: 20, count: 6, fps: 15, scale: 1.4 }) // estallido eléctrico
    scene.fx('shock', dx, dy, { fps: 16 })
    scene.burst(dx, dy, 14, { colors: ['#fff', '#f8e050'], speed: 3.5, size: 2, max: 320 })
  },
  psychic: async (a, d) => {
    scene.play(a.actor, 'Charge')
    scene.flashScreen('#a040e0', 0.4, 0.7)
    sfx.cast()
    const [ax, ay] = body(a), [dx, dy] = body(d)
    const frames = 300 / 16.7
    for (let i = 0; i < 4; i++) {
      for (const [color, size] of [['#f85888', 6], ['#ffd8e8', 2]] as const) {
        scene.add({ ring: 10 + i * 6, size, color, x: ax, y: ay - 6, vx: (dx - ax) / frames, vy: (dy - ay + 6) / frames, max: 300, delay: 120 + i * 80, fade: false })
      }
    }
    await scene.wait(420)
    void scene.tween(520, (t) => { d.actor.ox = Math.sin(t * Math.PI * 8) * 6 * (1 - t) })
    for (let i = 0; i < 6; i++) scene.fx('eye_sparkle', dx + Math.cos(i) * 22, dy + Math.sin(i) * 18, { delay: i * 50, fps: 12 })
  },
  rock: async (a, d) => {
    scene.play(a.actor, 'Swing')
    await scene.wait(140)
    sfx.shoot()
    const [ax, ay] = body(a), [dx, dy] = body(d)
    for (let i = 0; i < 4; i++) {
      const p = scene.add({ img: 'rocks', frame: i % 3, x: ax, y: ay, max: 380 + i * 60, delay: i * 60, scale: 2, vr: 0.3, fade: false })
      void scene.wait(i * 60).then(() => scene.tween(370, (t) => { p.x = ax + (dx - ax) * t; p.y = ay + (dy - ay) * t - Math.sin(t * Math.PI) * 56 }))
    }
    await scene.wait(370)
    for (let i = 0; i < 9; i++) scene.add({ img: 'rocks', frame: 3 + (i % 3), x: dx, y: dy, vx: rnd(-3, 3), vy: rnd(-4, -1), g: 0.25, vr: 0.3, max: 650, scale: 2 })
    scene.fx('p:rocksmash', dx, dy, { frame: 0, count: 6, fps: 14, scale: 1.2 })
    scene.fx('gray_smoke', dx, d.actor.y - 10, { fps: 10, scale: 2.5 })
  },
  normal: async (a, d) => {
    await dash(a, d)
    const [dx, dy] = body(d)
    scene.fx('slam_hit', dx - a.sign * 6, dy, { fps: 22, flipX: a.sign < 0, scale: 2.5 })
    scene.fx('p:punches', dx, dy, { frame: 7, count: 1, fps: 0, max: 280, scale: 0.4, grow: 2.6 })
  },
  flying: async (a, d) => {
    await dash(a, d, 30)
    const [dx, dy] = body(d)
    scene.fx('p:airslash', dx, dy, { frame: 0, count: 8, fps: 26, scale: 1.3, flipX: a.sign < 0 })
    scene.fx('p:slash', dx, dy, { frame: 5, count: 4, fps: 16, scale: 1.3, flipX: a.sign < 0 })
    for (let i = 0; i < 7; i++) scene.add({ img: 'white_feather', frame: i % 2, x: dx, y: dy, vx: rnd(-2.5, 2.5), vy: rnd(-3, -0.5), g: 0.07, vr: rnd(-0.1, 0.1), max: 900, scale: 1.5 })
  },
  fighting: async (a, d) => {
    await dash(a, d)
    const [dx, dy] = body(d)
    scene.add({ img: 'red_fist', x: dx - a.sign * 16, y: dy, max: 300, scale: 4, grow: 0.6, flipX: a.sign < 0, fade: false })
    scene.fx('p:punches', dx, dy, { frame: 7, count: 1, fps: 0, max: 300, scale: 0.4, grow: 3 })
    scene.hitStop(60)
  },
  dark: async (a, d) => {
    await dash(a, d)
    const [dx, dy] = body(d)
    scene.flashScreen('#3a1870', 0.45, 2)
    scene.fx('p:crunch', dx, dy, { frame: 0, count: 12, fps: 30, scale: 0.85 }) // mandíbulas que se cierran
    await scene.wait(230)
    scene.fx('purple_swipe', dx, dy, { fps: 9, scale: 1.6, flipX: a.sign < 0 })
  },
  steel: async (a, d) => {
    await dash(a, d)
    const [dx, dy] = body(d)
    for (let i = 0; i < 3; i++) scene.fx('claw_slash', dx - 12 + i * 12, dy - 8 + i * 8, { delay: i * 45, fps: 24, flipX: a.sign < 0, scale: 2.5 })
    scene.fx('p:ironhead', dx, dy, { frame: 0, count: 2, fps: 8, scale: 1.5, delay: 80 })
  },
}

/** Chorro de partículas de un color: sirve para veneno y hielo. */
const spray = (colors: string[], burst: string): Move => async (a, d) => {
  await stream(a, d, (x, y, vx, vy, ms) => {
    scene.add({ x, y, vx, vy, max: ms + 40, size: 6, colors })
    scene.add({ x, y, vx: vx * rnd(0.7, 1), vy: vy + rnd(-1, 1), max: ms, size: 4, colors, add: true })
  })
  const [dx, dy] = body(d)
  scene.fx(burst, dx, dy, { frame: 0, count: 4, fps: 12, scale: 1.3 })
  scene.burst(dx, dy, 22, { colors, speed: 3, up: 2, g: 0.15, size: 4, max: 700 })
}
// Los seis tipos nuevos reutilizan los gestos de los anteriores con sus propios colores y efectos
const MOVES = {
  ...BASE_MOVES,
  poison: spray(['#e8c0f0', '#a040a0', '#582870'], 'p:explosions'),
  ice: spray(['#ffffff', '#b8f0f8', '#58b8e0'], 'p:explosions'),
  ground: BASE_MOVES.rock,
  bug: BASE_MOVES.steel,
  ghost: async (a: Side, d: Side) => { // bola sombra: un proyectil lento con estela
    scene.play(a.actor, 'Shoot')
    const [ax, ay] = body(a), [dx, dy] = body(d)
    const ball = scene.add({ img: 'shadow_ball', x: ax, y: ay, max: 460, scale: 2, vr: 0.3, fade: false })
    scene.flashScreen('#3a1870', 0.4, 1.2)
    await scene.tween(440, (t) => {
      ball.x = ax + (dx - ax) * t
      ball.y = ay + (dy - ay) * t - Math.sin(t * Math.PI) * 14
      scene.add({ img: 'purple_flame', fps: 14, x: ball.x, y: ball.y, max: 240, scale: 1 })
    })
    scene.fx('p:explosions', dx, dy, { frame: 0, count: 4, fps: 12, scale: 1.4 })
  },
  fairy: BASE_MOVES.psychic,
} as Record<PType, Move>

async function strike(a: Side, d: Side, dmg: number, crit = false) {
  const type = bestMove(a.kind, d.kind) // usa el ataque que más le conviene
  const eff = moveMult(a.kind, type, d.kind)
  const big = eff > 1.05
  say(`¡${KINDS[a.kind].name} usó ${ATTACK_NAME[type]}!`)
  sfx.cry(KINDS[a.kind].species, 1, 0.6) // grita al atacar
  setTimeout(() => sfx.move(type), 260) // y luego el sonido propio del ataque
  await MOVES[type](a, d)

  // Impacto: parada, destello, retroceso y números
  const [dx, dy] = body(d)
  const hpAfter = Math.max(0, d.hp - dmg)
  scene.hitStop(big ? 170 : 100)
  scene.canvas.animate([{ transform: `scale(${big ? 1.12 : 1.06})` }, { transform: 'scale(1)' }], { duration: big ? 380 : 260, easing: 'cubic-bezier(0.2, 1.4, 0.4, 1)' })
  scene.addShake(big ? 10 : 5)
  if (big) scene.flashScreen('#fff', 0.85, 7)
  scene.fx('hit', dx, dy, { fps: 20, scale: big ? 3.5 : 2.5 })
  scene.add({ ring: big ? 60 : 40, size: 6, color: '#fff', x: dx, y: dy, max: 300 })
  for (let i = 0; i < (big ? 22 : 12); i++) {
    const ang = rnd(0, Math.PI * 2), v = rnd(2.5, big ? 6 : 4.5)
    scene.add({ x: dx, y: dy, vx: Math.cos(ang) * v, vy: Math.sin(ang) * v, drag: 0.9, line: [Math.cos(ang) * 10, Math.sin(ang) * 10], size: 2, max: 320, colors: ['#fff', TYPE_COLOR[type]] })
  }
  ;(big ? sfx.bigHit : eff < 0.9 ? sfx.weakHit : sfx.hit)()
  scene.play(d.actor, 'Hurt')
  d.actor.tint = ['#fff', 1]
  void scene.tween(300, (t) => { d.actor.tint[1] = Math.floor(t * 6) % 2 ? 0 : 1 - t })
  const base = d.actor.ox
  void scene.tween(420, (t) => {
    const k = t < 0.15 ? t / 0.15 : 1 - easeOut((t - 0.15) / 0.85)
    d.actor.ox = base + a.sign * (big ? 24 : 15) * k
    d.actor.sx = 1 - 0.2 * k
  })
  stamp(`-${dmg}`, dx - a.sign * 4, dy - 50, big ? 'dmg big' : 'dmg')
  if (crit) {
    stamp('¡CRÍTICO!', W / 2, 92, 'super')
    sfx.crit()
    scene.flashScreen('#ffd84a', 0.6, 5)
    scene.addShake(12)
    scene.hitStop(120)
  }
  if (big || eff < 0.9) stamp(big ? '¡SÚPER EFICAZ!' : eff < 0.4 ? 'Casi no le afecta…' : 'Poco eficaz…', d.sign < 0 ? 86 : 170, 52, big ? 'super' : 'weak')
  d.hp = hpAfter
  setHp(d.plate, hpAfter)
  restartClass(d.plate, 'hurt')
  say(`${KINDS[d.kind].name} pierde ${dmg} PS.`)
  await scene.wait(760)

  if (hpAfter > 0) return scene.play(d.actor, 'Idle', true)
  // K.O.: sale volando
  say(`¡${KINDS[d.kind].name} se ha debilitado!`)
  sfx.ko()
  sfx.cry(KINDS[d.kind].species, 0.7, 0.7) // el grito, más grave, al caer
  scene.fx('explosion', dx, dy, { fps: 12, scale: 3 })
  scene.addShake(8)
  stamp('K.O.', dx, dy - 30, 'ko')
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

async function evolve(s: Side, kind: string) {
  const act = s.actor, [x, y] = body(s)
  say(`¡Anda! ¡${KINDS[s.kind].name} está evolucionando!`)
  sfx.evolve()
  scene.play(act, 'Idle', true)
  let last = 0
  await scene.tween(1000, (t) => {
    act.tint = ['#fff', Math.min(1, t * 1.4 + 0.3 * Math.sin(t * 40))]
    act.sx = act.sy = 1 + 0.18 * Math.sin(t * Math.PI * 9) * t
    if (scene.time - last > 45) {
      last = scene.time
      const ang = rnd(0, Math.PI * 2), r = 60
      scene.add({ img: 'blue_star', frame: 1, x: x + Math.cos(ang) * r, y: y + Math.sin(ang) * r, vx: (-Math.cos(ang) * r) / 18, vy: (-Math.sin(ang) * r) / 18, max: 300, scale: 1.5 })
    }
  })
  scene.flashScreen('#fff', 1, 2.2)
  scene.addShake(6)
  s.kind = kind
  act.species = KINDS[kind].species
  act.scale = scaleOf(kind)
  act.sx = act.sy = 1
  setPlate(s.plate, kind, s.team, s.hp)
  scene.add({ ring: 90, size: 8, color: '#fff', x, y, max: 500 })
  for (let i = 0; i < 20; i++) {
    const ang = (i / 20) * Math.PI * 2
    scene.add({ img: 'gold_stars', x, y, vx: Math.cos(ang) * 3.5, vy: Math.sin(ang) * 3.5, drag: 0.95, max: 800, scale: 2 })
  }
  scene.play(act, 'Rotate')
  void scene.tween(500, (t) => { act.tint[1] = 1 - t; act.oy = -Math.sin(t * Math.PI) * 18 })
  sfx.evolved()
  sfx.cry(KINDS[kind].species, 1, 0.7)
  stamp('¡EVOLUCIÓN!', W / 2, 60, 'super')
  say(`¡Ha evolucionado a ${KINDS[kind].name}!`)
  await scene.wait(1300)
  scene.play(act, 'Idle', true)
}

const restartClass = (el: Element, cls: string) => {
  el.classList.remove(cls)
  void (el as HTMLElement).offsetWidth
  el.classList.add(cls)
}

export interface BattleData {
  a: { kind: string; hp: number; team: number; place: Place }
  d: { kind: string; hp: number; team: number; place: Place }
  dmg: number
  counter: number | null
  crit?: boolean // golpe crítico del atacante
  evolved: 'a' | 'd' | null
  evolvedKind: string
}

export async function playBattle(b: BattleData) {
  // A pantalla completa: el lienzo se ensancha hasta la proporción de la ventana y la escena de siempre queda centrada
  pad = Math.max(0, Math.round((H * Math.min(2.4, innerWidth / innerHeight) - W) / 4) * 2)
  scene.resize(W + pad * 2, H)
  scene.camera.x = -pad
  await open('battle')
  const plates = root.querySelectorAll<HTMLElement>('.plate')
  const apart = Math.round(pad * 0.45) // con más sitio, cada uno se va un poco hacia su lado
  const left: Side = { actor: scene.actor(KINDS[b.a.kind].species, 72 - apart, FEET, DIR.right, scaleOf(b.a.kind)), kind: b.a.kind, team: b.a.team, hp: b.a.hp, plate: plates[0], sign: 1 }
  const right: Side = { actor: scene.actor(KINDS[b.d.kind].species, 184 + apart, FEET, DIR.left, scaleOf(b.d.kind)), kind: b.d.kind, team: b.d.team, hp: b.d.hp, plate: plates[1], sign: -1 }
  setPlate(left.plate, left.kind, left.team, left.hp)
  setPlate(right.plate, right.kind, right.team, right.hp)
  say('')

  // Dos paneles en diagonal que entran chocando, cada uno con su terreno
  let slide = 1
  const wide = 148 + pad, away = 150 + pad
  const panel = (ctx: CanvasRenderingContext2D, offset: number, points: number[][], place: Place, x0: number, time: number, team: number) => {
    ctx.save()
    ctx.translate(offset, 0)
    ctx.beginPath()
    points.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)))
    ctx.closePath()
    ctx.clip()
    backdrop(ctx, place, x0, wide, time)
    ctx.fillStyle = TEAM_HEX[team]
    ctx.fillRect(x0, H - 4, wide, 4)
    ctx.restore()
  }
  scene.background = (ctx, time) => {
    ctx.fillStyle = '#10141c'
    ctx.fillRect(-20 - pad, -20, W + 40 + pad * 2, H + 40)
    panel(ctx, -slide * away, [[-20 - pad, -20], [140, -20], [116, H + 20], [-20 - pad, H + 20]], b.a.place, -20 - pad, time, b.a.team)
    panel(ctx, slide * away, [[140, -20], [W + 20 + pad, -20], [W + 20 + pad, H + 20], [116, H + 20]], b.d.place, 112, time, b.d.team)
    if (slide < 0.02) {
      for (const [color, w] of [['#10141c', 7], ['#fff', 3]] as const) {
        ctx.strokeStyle = color
        ctx.lineWidth = w
        ctx.beginPath()
        ctx.moveTo(141.5, -20)
        ctx.lineTo(114.5, H + 20)
        ctx.stroke()
      }
    }
  }
  scene.foreground = (ctx) => { // hierba alta por delante de los pies
    for (const [side, x0, x1] of [[b.a, -32 * Math.ceil(pad / 32), 128], [b.d, 128, W + pad]] as const) {
      if (side.place.terrain !== '"' || slide > 0.02) continue
      for (let x = x0; x < x1; x += 32) tallGrass(ctx, x, FEET - 18)
    }
  }
  left.actor.ox = -away
  right.actor.ox = away
  sfx.battle()
  await scene.tween(300, (t) => {
    slide = 1 - easeOut(t)
    left.actor.ox = -away * slide
    right.actor.ox = away * slide
  })
  slide = 0
  scene.addShake(6)
  scene.flashScreen('#fff', 0.7, 6)
  sfx.land()
  for (let i = 0; i < 16; i++) scene.add({ x: 128 + rnd(-8, 8), y: rnd(0, H), vx: rnd(-3, 3), vy: rnd(-1, 1), max: 350, size: 4, color: '#fff' })
  root.classList.add('ready')
  await scene.wait(520)

  await strike(left, right, b.dmg, b.crit)
  if (right.hp > 0 && b.counter !== null) {
    await scene.wait(200)
    await strike(right, left, b.counter)
  }
  if (b.evolved) await evolve(b.evolved === 'a' ? left : right, b.evolvedKind)
  else await scene.wait(380)
  await close()
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

export interface CatchData {
  kind: string; team: number // el Capturador
  wild: string; weak: boolean
  funds: number
  sure?: boolean // el tutorial no falla
}
export interface CatchResult { caught: boolean; spent: number; fled: boolean } // `fled`: el salvaje se ha ido del mapa

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
  await open('capture')
  const k = KINDS[c.kind], w = KINDS[c.wild], TEAM_NAME = ['Rojo', 'Azul']
  const base = CH - 62, horizon = base - 74, wx = Math.round(CW * 0.64), wy = base - 6, R = 30
  const period = c.weak ? 1700 : 1050
  let ring = true, held: { x: number; y: number; rot: number; ball: number; open?: number } | null = null, spin = 0
  const phaseAt = (time: number) => (time % period) / period // 0: aro abierto del todo · 1: cerrado sobre el salvaje
  const chanceAt = (phase: number, ball: number) => Math.min(1, (c.weak ? 0.5 : 0.08) + (c.weak ? 0.5 : 0.47) * phase + BALLS[ball].bonus)
  let ball = 0
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
    if (!ring) return
    // Diana fija y aro que se cierra: el color dice lo fácil que sería ahora mismo
    const phase = phaseAt(time), chance = chanceAt(phase, ball), cy = wy - 32
    spin = time / 900
    ctx.lineWidth = 3
    ctx.strokeStyle = '#10141c'
    ctx.beginPath(); ctx.arc(wx, cy, R + 2, 0, Math.PI * 2); ctx.stroke()
    ctx.strokeStyle = '#fff'
    ctx.beginPath(); ctx.arc(wx, cy, R, 0, Math.PI * 2); ctx.stroke()
    const r = R * (2.5 - 2.1 * phase)
    for (const [color, width] of [['#10141c', 7], [chance >= 0.8 ? '#58e070' : chance >= 0.5 ? '#ffd84a' : chance >= 0.3 ? '#ff9a3c' : '#ff5a48', 4]] as [string, number][]) {
      ctx.strokeStyle = color
      ctx.lineWidth = width
      for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.arc(wx, cy, r, spin + (i * Math.PI) / 2 + 0.12, spin + ((i + 1) * Math.PI) / 2 - 0.12); ctx.stroke() }
    }
  }

  const foe = scene.actor(w.species, wx, wy, DIR.left, scaleOf(c.wild))
  scene.play(foe, 'Idle', true)
  if (c.weak) foe.tint = ['#6878a0', 0.25]
  const me = scene.actor(k.species, Math.round(CW * 0.2), base + 30, DIR.right, scaleOf(c.kind))
  scene.play(me, 'Idle', true)
  me.ox = -CW * 0.4
  void scene.tween(420, (t) => { me.ox = -CW * 0.4 * (1 - easeOut(t)) })
  const dizzy = () => { if (c.weak && ring) for (let i = 0; i < 3; i++) scene.add({ img: 'gold_stars', x: wx + Math.cos(i * 2.1 + scene.time / 300) * 20, y: wy - 62 + Math.sin(i * 2.1 + scene.time / 300) * 5, max: 240, scale: 1 }) }
  const dizzyTimer = setInterval(dizzy, 240)

  const ui = document.createElement('div')
  ui.className = `capui catchui t${c.team}`
  ui.innerHTML = `<div class="capwho"><img src="${facePath(k.species)}" alt=""><div><b>${k.name}</b><span>${ROLES[k.role].name} · Equipo ${TEAM_NAME[c.team]}</span></div></div>
    <div class="capwhat o-1"><small>POKÉMON SALVAJE</small><b>${w.name}</b><span class="${c.weak ? 'easy' : 'hard'}">${c.weak ? 'Debilitado: fácil de atrapar' : 'En plena forma: difícil'}</span></div>
    <div class="catchbar">
      <div class="purse"><i class="coin"></i><b></b></div>
      <div class="balls">${BALLS.map((b, i) => `<button data-ball="${i}"><img src="${BALL_IMG[i].src}" alt=""><b>${b.name}</b><span>${b.cost}₽</span></button>`).join('')}</div>
      <button class="throw">¡LANZAR!</button>
      <div class="tries"></div>
      <p><kbd>←</kbd><kbd>→</kbd> elegir Ball · <kbd>Enter</kbd> lanzar cuando el aro esté <em>pequeño</em> · <kbd>Esc</kbd> dejarlo</p>
    </div>`
  root.append(ui)
  const q = <E extends HTMLElement>(sel: string) => ui.querySelector(sel) as E
  const buttons = [...ui.querySelectorAll<HTMLButtonElement>('.balls button')]
  let spent = 0, tries = 3
  const left = () => c.funds - spent
  const refresh = () => {
    q('.purse b').textContent = String(left())
    buttons.forEach((btn, i) => { btn.disabled = BALLS[i].cost > left(); btn.classList.toggle('on', i === ball) })
    q('.tries').innerHTML = `Intentos ${'<i class="on"></i>'.repeat(tries)}${'<i></i>'.repeat(3 - tries)}`
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
  void ui.offsetWidth
  ui.classList.add('in')
  sfx.cry(w.species, 1, 0.6)

  /** Espera a que la persona lance (devuelve en qué punto estaba el aro) o lo deje (null). */
  const input = () => new Promise<number | null>((resolve) => {
    const done = (value: number | null) => { catchInput = null; q<HTMLButtonElement>('.throw').onclick = null; resolve(value) }
    const fire = () => done(phaseAt(scene.time))
    catchInput = (key) => {
      if (key === 'ArrowLeft' || key === 'ArrowRight') { for (let i = ball + (key === 'ArrowRight' ? 1 : -1); i >= 0 && i < BALLS.length; i += key === 'ArrowRight' ? 1 : -1) if (BALLS[i].cost <= left()) return pickBall(i) }
      else if (key === 'Enter' || key === ' ' || key === 'z') fire()
      else if (key === 'Escape' || key === 'x') done(null)
    }
    q<HTMLButtonElement>('.throw').onclick = fire
    buttons.forEach((btn, i) => (btn.onclick = () => pickBall(i)))
  })

  let caught = false, fled = false
  while (tries > 0 && !caught) {
    if (BALLS[ball].cost > left()) ball = 0
    if (BALLS[0].cost > left()) { pop('¡Sin dinero!', CW / 2, CH * 0.45, 'dmg'); await scene.wait(900); break }
    refresh()
    ui.classList.remove('busy')
    ring = true
    const phase = await input()
    if (phase === null) break
    ring = false
    ui.classList.add('busy')
    spent += BALLS[ball].cost
    tries--
    refresh()
    const chance = chanceAt(phase, ball)
    pop(phase > 0.82 ? '¡EXCELENTE!' : phase > 0.58 ? '¡GENIAL!' : phase > 0.3 ? '¡BIEN!' : 'Flojo…', wx, wy - 96, phase > 0.3 ? 'good' : 'weak')
    // Lanzamiento en arco
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
      banner.innerHTML = `<b>${[...'¡ATRAPADO!'].map((ch, i) => `<span style="--i:${i}">${ch}</span>`).join('')}</b><span>${w.name} se une a tu equipo · gastado ${spent}₽ en Balls</span>`
      ui.classList.add('won')
      ui.append(banner)
      scene.play(me, 'Hop')
      await scene.tween(900, (t) => { me.oy = -Math.abs(Math.sin(t * Math.PI * 2)) * 16 })
      await scene.wait(900)
    } else {
      // Se abre la Ball y sale de un salto
      sfx.error()
      scene.flashScreen('#fff', 0.5, 7)
      scene.addShake(5)
      for (let i = 0; i < 12; i++) scene.add({ x: wx, y: wy - 8, vx: Math.cos(i * 0.52) * 3, vy: Math.sin(i * 0.52) * 3 - 1.5, max: 360, size: 4, colors: ['#fff', '#ff5a48'] })
      held = null
      foe.visible = true
      foe.tint = c.weak ? ['#6878a0', 0.25] : ['#fff', 0]
      scene.play(foe, 'Hop')
      void scene.tween(300, (t) => { foe.sx = foe.sy = easeBack(t); foe.oy = -34 * (1 - t) - Math.sin(t * Math.PI) * 18 })
      sfx.cry(w.species, 1.1, 0.5)
      pop('¡Se ha liberado!', wx, wy - 96, 'dmg')
      await scene.wait(900)
      scene.play(foe, 'Idle', true)
      if (tries === 0 || Math.random() < (c.weak ? 0.15 : 0.35)) { // huye entre la hierba
        pop('¡Ha huido!', wx, wy - 96, 'weak')
        foe.dir = DIR.right
        scene.play(foe, 'Walk', true)
        await scene.tween(520, (t) => { foe.ox = CW * 0.5 * easeIn(t); foe.alpha = 1 - t })
        fled = true
        break
      }
    }
  }
  clearInterval(dizzyTimer)
  catchInput = null
  await close()
  ui.remove()
  scene.resize(W, H)
  return { caught, spent, fled }
}
