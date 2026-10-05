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

function setPlate(el: HTMLElement, kind: string, team: number, hp: number, xp: number | null = null) {
  const k = KINDS[kind]
  el.className = `plate ${el.classList.contains('left') ? 'left' : 'right'} t${team}`
  el.querySelector<HTMLImageElement>('img')!.src = facePath(k.species)
  el.querySelector('.name')!.textContent = k.name
  el.querySelector('.type')!.innerHTML = `<span class="pill" style="background:${TYPE_COLOR[k.type]}">${TYPE_NAME[k.type]}</span>`
  if (!el.querySelector('.xp')) el.querySelector('.hp')!.insertAdjacentHTML('afterend', '<div class="xp"><i></i></div>')
  el.querySelector<HTMLElement>('.xp')!.hidden = xp === null
  el.querySelector<HTMLElement>('.xp i')!.style.width = Math.min(1, xp ?? 0) * 100 + '%'
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
// El plano es el de los combates de Pokémon: el de quien mira, de espaldas y grande, abajo a la izquierda; el otro,
// de frente y más pequeño, arriba a la derecha, cada uno en una plataforma del terreno que pisa. El ataque depende
// de quién lo hace: cuerpo a cuerpo cruza el campo y golpea; un Tirador dispara de lado a lado; un Artillero lanza
// por encima, fuera de la pantalla, y cae sobre la marca.

interface Side {
  actor: Actor; kind: string; team: number; hp: number; plate: HTMLElement; place: Place
  sign: number // hacia dónde mira en horizontal: 1 el de cerca, -1 el del fondo
  depth: number // tamaño relativo por la distancia: 1 el de cerca, 0.5 el del fondo
  home: [number, number]
}
type Move = (a: Side, d: Side) => Promise<void> // se resuelve en el momento del impacto

const NEAR_Y = 150, FAR_Y = 96, SKYLINE = 70
const body = (s: Side): [number, number] => [s.actor.x + s.actor.ox, s.actor.y + s.actor.oy - 10 * s.actor.scale]
/** Tamaño de los efectos sobre alguien, según lo cerca que esté de la cámara. */
const size = (s: Side) => (s.depth < 1 ? 0.75 : 1.2)

// Lo que vuela de uno a otro crece o encoge por el camino (se acerca o se aleja de la cámara)
let aim = 1
const shoot = (p: Part) => scene.add({ ...p, scale: (p.scale ?? 1) * (aim < 1 ? 1.2 : 0.75), grow: (p.grow ?? 1) * (aim < 1 ? 0.62 : 1.6) })
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
  await scene.tween(140, (t) => { act.ox = -a.sign * 10 * easeOut(t); act.sx = 1 + 0.15 * t; act.sy = 1 - 0.15 * t })
  const [hx, hy] = a.home
  const tx = d.actor.x - a.sign * 11 * d.actor.scale, ty = d.actor.y + (a.depth > d.depth ? 5 : -3)
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
async function lob(a: Side, d: Side, type: PType) {
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
  mark = { x: dx, y: d.actor.y - d.actor.scale * 4, at: scene.time, k: kd }
  sfx.select()
  await scene.wait(460)
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
  shot: (a, d) => volley(a, d, 5, () => ({ x: 0, y: 0, max: 0, line: [-a.sign * 16, a.depth > d.depth ? 7 : -7], size: 3, color: colors[0] }), { ms: 220, every: 60, bend: 10, trail: colors }),
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
  el.className = `callout ${a.depth < 1 ? 'far' : 'near'}`
  el.style.setProperty('--c', TYPE_COLOR[type])
  el.innerHTML = `<small>${TYPE_NAME[type]}</small>${ATTACK_NAME[type]}`
  root.append(el)
  setTimeout(() => el.remove(), 1300)
}

async function strike(a: Side, d: Side, dmg: number, crit = false) {
  const type = bestMove(a.kind, d.kind) // usa el ataque que más le conviene
  const eff = moveMult(a.kind, type, d.kind)
  const big = eff > 1.05
  const reach = KINDS[a.kind].range[1], far = reach > 1 && gap > 1
  aim = d.depth / a.depth
  callout(a, type)
  say(`¡${KINDS[a.kind].name} usó ${ATTACK_NAME[type]}!`)
  sfx.cry(KINDS[a.kind].species, 1, 0.6) // grita al atacar
  setTimeout(() => sfx.move(type), 260) // y luego el sonido propio del ataque
  if (!far) await dash(a, d, type, type === 'flying' ? 26 : 0)
  else if (reach >= 4) await lob(a, d, type)
  else await TECH[type].shot(a, d)
  TECH[type].impact(a, d)

  // Impacto: parada, destello, retroceso y números
  const [dx, dy] = body(d), k = size(d)
  const hpAfter = Math.max(0, d.hp - dmg)
  scene.hitStop(big ? 170 : 100)
  scene.canvas.animate([{ transform: `scale(${big ? 1.12 : 1.06})` }, { transform: 'scale(1)' }], { duration: big ? 380 : 260, easing: 'cubic-bezier(0.2, 1.4, 0.4, 1)' })
  scene.addShake(big ? 10 : 5)
  if (big) scene.flashScreen('#fff', 0.85, 7)
  scene.fx('hit', dx, dy, { fps: 20, scale: (big ? 3.5 : 2.5) * k })
  scene.add({ ring: (big ? 60 : 40) * k, size: 6, color: '#fff', x: dx, y: dy, max: 300 })
  for (let i = 0; i < (big ? 22 : 12); i++) {
    const ang = rnd(0, Math.PI * 2), v = rnd(2.5, big ? 6 : 4.5)
    scene.add({ x: dx, y: dy, vx: Math.cos(ang) * v, vy: Math.sin(ang) * v, drag: 0.9, line: [Math.cos(ang) * 10, Math.sin(ang) * 10], size: 2, max: 320, colors: ['#fff', TYPE_COLOR[type]] })
  }
  ;(big ? sfx.bigHit : eff < 0.9 ? sfx.weakHit : sfx.hit)()
  scene.play(d.actor, 'Hurt')
  d.actor.tint = ['#fff', 1]
  void scene.tween(300, (t) => { d.actor.tint[1] = Math.floor(t * 6) % 2 ? 0 : 1 - t })
  void scene.tween(420, (t) => {
    const p = t < 0.15 ? t / 0.15 : 1 - easeOut((t - 0.15) / 0.85)
    d.actor.ox = a.sign * (big ? 24 : 15) * k * p
    d.actor.sx = 1 - 0.2 * p
  })
  stamp(`-${dmg}`, dx - a.sign * 4, dy - 34 * k, big ? 'dmg big' : 'dmg')
  if (crit) {
    stamp('¡CRÍTICO!', W / 2, 78, 'super')
    sfx.crit()
    scene.flashScreen('#ffd84a', 0.6, 5)
    scene.addShake(12)
    scene.hitStop(120)
  }
  if (big || eff < 0.9) stamp(big ? '¡SÚPER EFICAZ!' : eff < 0.4 ? 'Casi no le afecta…' : 'Poco eficaz…', W / 2, crit ? 100 : 84, big ? 'super' : 'weak')
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
  scene.fx('explosion', dx, dy, { fps: 12, scale: 3 * k })
  scene.addShake(8)
  stamp('K.O.', dx, dy - 24 * k, 'ko')
  d.actor.shadow = false
  let lastStar = 0
  await scene.tween(700, (t) => {
    d.actor.ox = a.sign * t * 170
    d.actor.oy = -Math.sin(t * Math.PI * 0.8) * 90 * k
    d.actor.rot = a.sign * t * 14
    if (scene.time - lastStar > 40) {
      lastStar = scene.time
      scene.add({ img: 'gold_stars', x: d.actor.x + d.actor.ox, y: d.actor.y + d.actor.oy - 20 * k, vy: 0.5, max: 400, scale: 2 * k })
    }
  })
  d.actor.visible = false
}

const restartClass = (el: Element, cls: string) => {
  el.classList.remove(cls)
  void (el as HTMLElement).offsetWidth
  el.classList.add(cls)
}

/** El de cerca se ve grande, de espaldas; el del fondo, a la mitad. */
const scaleFor = (kind: string, depth: number) => (depth < 1 ? scaleOf(kind) - 1 + (scaleOf(kind) === 2 ? 0.5 : 0) : scaleOf(kind) + 1)

// Suelo de cada terreno: dos tonos que se alternan en franjas cada vez más anchas hacia la cámara (eso da la profundidad)
const GROUND: Record<string, [string, string, string]> = { // claro, oscuro, borde de la plataforma
  '.': ['#84d058', '#70c04c', '#3c8838'], '"': ['#78c850', '#62b444', '#34803a'], T: ['#5cae4c', '#4c9c44', '#2c6c38'],
  M: ['#d0a878', '#bc9466', '#80583c'], '~': ['#58a4f0', '#4890e4', '#2858b0'], s: ['#70b8f4', '#5ca8ec', '#3068b8'],
  '=': ['#e8d098', '#dcc084', '#a88850'], B: ['#d8b888', '#c8a472', '#906c44'],
}

/** Plataforma ovalada bajo un Pokémon: el terreno que pisa, con su reborde y un aro del color de su equipo. */
function platform(ctx: CanvasRenderingContext2D, cx: number, cy: number, rx: number, ry: number, place: Place, team: number, time: number) {
  const tones = GROUND[place.terrain] ?? GROUND['.']
  ctx.fillStyle = 'rgba(8, 24, 40, 0.25)'
  ctx.beginPath(); ctx.ellipse(cx, cy + ry * 0.5, rx + 3, ry + 2, 0, 0, Math.PI * 2); ctx.fill()
  ctx.fillStyle = tones[2]
  ctx.beginPath(); ctx.ellipse(cx, cy + ry * 0.28, rx, ry, 0, 0, Math.PI * 2); ctx.fill()
  ctx.save()
  ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); ctx.clip()
  if (place.terrain === 'M') { // la montaña no tiene baldosa propia: roca lisa con algunas piedras
    ctx.fillStyle = tones[0]
    ctx.fillRect(cx - rx, cy - ry, rx * 2, ry * 2)
    ctx.fillStyle = tones[1]
    for (let i = 0; i < 9; i++) ctx.fillRect(Math.round(cx - rx + ((i * 37) % (rx * 2))), Math.round(cy - ry + ((i * 23) % (ry * 2))), 5, 2)
  } else {
    const x0 = Math.floor((cx - rx) / 32) * 32
    for (let y = Math.floor((cy - ry) / 32) * 32; y < cy + ry; y += 32) for (let x = x0; x < cx + rx; x += 32) groundTile(ctx, place.terrain, x, y, time)
  }
  ctx.fillStyle = 'rgba(255, 255, 255, 0.16)' // luz en el borde de atrás
  ctx.beginPath(); ctx.ellipse(cx, cy - ry * 0.55, rx * 0.86, ry * 0.5, 0, 0, Math.PI * 2); ctx.fill()
  ctx.restore()
  ctx.fillStyle = 'rgba(8, 24, 40, 0.3)'
  ctx.beginPath(); ctx.ellipse(cx, cy + ry * 0.1, rx * 0.42, ry * 0.42, 0, 0, Math.PI * 2); ctx.fill()
  ctx.strokeStyle = TEAM_HEX[team]
  ctx.lineWidth = 2
  ctx.beginPath(); ctx.ellipse(cx, cy, rx - 1, ry - 1, 0, 0, Math.PI * 2); ctx.stroke()
  ctx.strokeStyle = '#10141c'
  ctx.lineWidth = 1
  ctx.beginPath(); ctx.ellipse(cx, cy, rx + 0.5, ry + 0.5, 0, 0, Math.PI * 2); ctx.stroke()
}

/** El paisaje del combate: cielo, sol, nubes, sierras y el suelo en perspectiva, según el terreno donde cae el golpe. */
function battlefield(ctx: CanvasRenderingContext2D, place: Place, time: number, scroll: number) {
  const look = LOOK[place.terrain] ?? LOOK['.'], tones = GROUND[place.terrain] ?? GROUND['.']
  const x0 = -pad - 20, w = W + pad * 2 + 40, sea = place.terrain === '~' || place.terrain === 's'
  look.sky.forEach((color, i) => { ctx.fillStyle = color; ctx.fillRect(x0, i ? i * 14 : -20, w, i ? 14 : 34) })
  // Sol con su halo
  const sx = 46 - pad * 0.5 - scroll * 0.1
  for (const [r, color] of [[22, '#ffffff22'], [16, '#ffffff38'], [11, '#fff8d8']] as const) { ctx.fillStyle = color; ctx.beginPath(); ctx.arc(sx, 24, r, 0, Math.PI * 2); ctx.fill() }
  ctx.fillStyle = '#ffffffe0'
  for (const [cx, cy, cw] of [[10, 16, 40], [96, 34, 28], [170, 12, 34], [250, 30, 44], [340, 20, 30]]) { // nubes que pasan
    const x = x0 + ((cx + time * 0.006 + scroll * 0.3) % (w + 60)) - 50
    ctx.fillRect(x, cy, cw, 6)
    ctx.fillRect(x + 6, cy - 4, cw - 14, 4)
    ctx.fillRect(x + 4, cy + 6, cw - 10, 2)
  }
  // Dos sierras al fondo (la lejana, casi del color del cielo) y, según el sitio, árboles o peñas en la línea del horizonte
  for (const [color, base, amp, f1, f2, drift] of [[look.far, 20, 10, 0.021, 0.057, 0.15], [look.hill, 9, 6, 0.045, 0.11, 0.3]] as const) {
    ctx.fillStyle = color
    for (let x = 0; x < w; x += 2) {
      const u = x + x0 + scroll * drift
      const h = sea ? 0 : base + Math.sin(u * f1) * amp + Math.sin(u * f2) * amp * 0.5 + (place.terrain === 'M' ? Math.abs(((u * 0.05) % 2) - 1) * 12 : 0)
      ctx.fillRect(x0 + x, SKYLINE - h, 2, h)
    }
  }
  if (place.terrain === 'T') for (let x = x0 - ((scroll * 0.5) % 22); x < x0 + w + 20; x += 22) small(ctx, Math.floor((x - x0) / 22) % 3 ? 'tree' : 'oak', x, SKYLINE + 5 + (Math.floor((x - x0) / 22) % 2) * 3)
  if (place.terrain === 'M') for (let x = x0 - ((scroll * 0.5) % 46); x < x0 + w + 20; x += 46) small(ctx, 'rock', x + 10, SKYLINE + 6)
  // Suelo: franjas de dos tonos, cada una más ancha que la anterior
  for (let y = SKYLINE, band = 0, h = 3; y < H + 20; y += h, band++, h = 3 + band * 2.4) {
    ctx.fillStyle = tones[band % 2]
    ctx.fillRect(x0, Math.round(y), w, Math.ceil(h) + 1)
  }
  if (sea) { // destellos que se mecen sobre el agua
    ctx.fillStyle = '#ffffff90'
    for (let i = 0; i < 26; i++) {
      const d = (i * 37) % 100 / 100, y = SKYLINE + 3 + d * d * (H - SKYLINE), len = 4 + d * 22
      ctx.fillRect(x0 + ((i * 97 + Math.sin(time / 600 + i) * 6 + scroll) % w + w) % w, Math.round(y), len, 1 + Math.round(d * 2))
    }
  } else { // matas y piedrecillas, más grandes cuanto más cerca
    for (let i = 0; i < 30; i++) {
      const d = ((i * 53) % 100) / 100, y = SKYLINE + 4 + d * d * (H - SKYLINE), s = 1 + Math.round(d * 3)
      const x = x0 + (((i * 89 + scroll * (0.4 + d)) % w) + w) % w
      ctx.fillStyle = i % 3 ? tones[2] : '#ffffff50'
      ctx.fillRect(Math.round(x), Math.round(y), s * 2, s)
      if (i % 3) ctx.fillRect(Math.round(x) + s, Math.round(y) - s, s, s)
    }
  }
  const haze = ctx.createLinearGradient(0, SKYLINE, 0, SKYLINE + 30) // bruma en el horizonte
  haze.addColorStop(0, 'rgba(255, 255, 255, 0.38)')
  haze.addColorStop(1, 'rgba(255, 255, 255, 0)')
  ctx.fillStyle = haze
  ctx.fillRect(x0, SKYLINE, w, 30)
}
/** Una pieza del mapa a su tamaño (para el horizonte), apoyada en `baseY`. */
function small(ctx: CanvasRenderingContext2D, name: string, cx: number, baseY: number) {
  const p = pieceAt[name]
  ctx.drawImage(pieces, p.x, 0, p.w, p.h, Math.round(cx - p.w / 2), baseY - p.h, p.w, p.h)
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
  front?: 'a' | 'd' // a quién se ve de espaldas, en primer plano (quien mira la pantalla); por defecto, quien ataca
}

export async function playBattle(b: BattleData) {
  // A pantalla completa: el lienzo se ensancha hasta la proporción de la ventana y la escena de siempre queda centrada
  pad = Math.max(0, Math.round((H * Math.min(2.4, innerWidth / innerHeight) - W) / 4) * 2)
  scene.resize(W + pad * 2, H)
  scene.camera.x = -pad
  gap = b.dist ?? 1
  mark = null
  await open('battle')
  const plates = root.querySelectorAll<HTMLElement>('.plate')
  const apart = Math.round(pad * 0.5) // con más sitio, cada uno se va un poco hacia su lado
  const away = gap > 1 ? Math.min(3, gap - 1) : 0 // de lejos, el del fondo queda más arriba y más pequeña su plataforma
  // El del fondo se crea antes: así se pinta detrás
  const side = (who: BattleData['a'], near: boolean): Side => {
    const depth = near ? 1 : 0.5, scale = scaleFor(who.kind, depth)
    // El dibujo lleva aire bajo los pies (más cuanto más grande se pinta): se baja para que pise su plataforma
    const home: [number, number] = near ? [66 - apart, NEAR_Y + scale * 4] : [190 + apart + away * 5, FAR_Y - away * 4 + scale * 4]
    return {
      actor: scene.actor(KINDS[who.kind].species, home[0], home[1], near ? 3 : 7, scale),
      kind: who.kind, team: who.team, hp: who.hp, plate: plates[near ? 1 : 0], place: who.place, sign: near ? 1 : -1, depth, home,
    }
  }
  const aNear = b.front !== 'd'
  const farSide = side(aNear ? b.d : b.a, false), nearSide = side(aNear ? b.a : b.d, true)
  const att = aNear ? nearSide : farSide, def = aNear ? farSide : nearSide
  farSide.actor.shadow = nearSide.actor.shadow = false // la sombra va pintada en la plataforma
  const xpOf = (s: Side) => (s === att ? b.xp?.a : b.xp?.d)?.from ?? null
  setPlate(nearSide.plate, nearSide.kind, nearSide.team, nearSide.hp, xpOf(nearSide))
  setPlate(farSide.plate, farSide.kind, farSide.team, farSide.hp, xpOf(farSide))
  say('')

  // Entrada: se abren dos barras negras como párpados, el paisaje entra deslizándose y cada plataforma llega por su lado
  let slide = 1, lids = 1
  const span = W + pad * 2
  const rest = (s: Side) => s.home[0] - s.sign * slide * span // el del fondo viene desde la izquierda; el de cerca, desde la derecha
  scene.background = (ctx, time) => {
    battlefield(ctx, b.d.place, time, slide * 90)
    for (const s of [farSide, nearSide]) {
      const near = s.depth === 1, rx = near ? 74 : 44 - away * 3, ry = near ? 17 : 10 - away
      const cx = rest(s), cy = s.home[1] - s.actor.scale * 4 + (near ? 3 : 1)
      const piece = s.place.building && pieceAt[s.place.building.type]
      if (piece) { // el edificio que defiende (o desde el que ataca), detrás de él
        const z = near ? 2 : 1, bx = cx + s.sign * -1 * (near ? 62 : 40)
        ctx.drawImage(s.place.building!.owner < 0 ? grayPieces : pieces, piece.x, 0, piece.w, piece.h, Math.round(bx - (piece.w * z) / 2), Math.round(cy - (near ? 8 : 4) - piece.h * z), piece.w * z, piece.h * z)
      }
      platform(ctx, cx, cy, rx, ry, s.place, s.team, time)
      if (s.place.terrain === 'T') for (const dx of [-rx - 4, rx + 6]) (near ? prop : small)(ctx, 'tree', cx + dx, cy - (near ? 2 : 1))
      if (s.place.terrain === 'M') (near ? prop : small)(ctx, 'rock', cx - s.sign * (rx + 2), cy + 2)
    }
    if (gap > 1 && slide < 0.02) { // de lejos: una marca en el suelo por cada casilla que los separa
      for (let i = 1; i < gap; i++) {
        const t = i / gap, x = nearSide.home[0] + 50 + (farSide.home[0] - 36 - nearSide.home[0] - 50) * t, y = NEAR_Y - 14 + (farSide.home[1] + 6 - NEAR_Y + 14) * t, r = 5 - t * 3
        ctx.fillStyle = '#10141c50'
        ctx.beginPath(); ctx.ellipse(x, y + 1, r + 1, r * 0.45 + 1, 0, 0, Math.PI * 2); ctx.fill()
        ctx.fillStyle = '#ffffffc0'
        ctx.beginPath(); ctx.ellipse(x, y, r, r * 0.45, 0, 0, Math.PI * 2); ctx.fill()
      }
    }
    if (light) { // la hora del día y la lluvia tiñen la escena
      ctx.fillStyle = light
      ctx.fillRect(-pad - 20, -20, W + pad * 2 + 40, H + 40)
    }
  }
  scene.foreground = (ctx, time) => {
    for (const s of [farSide, nearSide]) { // hierba alta por delante de los pies
      if (s.place.terrain !== '"' || !s.actor.visible) continue
      const near = s.depth === 1, cx = rest(s)
      if (near) for (let x = cx - 64; x < cx + 48; x += 32) tallGrass(ctx, x, s.home[1] - 14)
      else for (let x = cx - 36; x < cx + 24; x += 16) ctx.drawImage(pieces, pieceAt.tall.x, 0, 16, 16, x, s.home[1] - 9, 16, 16)
    }
    if (mark) { // la mira se cierra sobre el objetivo
      const t = Math.min(1, (time - mark.at) / 380), r = (34 - 20 * easeOut(t)) * mark.k, blink = Math.floor(time / 70) % 2
      ctx.strokeStyle = blink ? '#fff' : '#ff5040'
      ctx.lineWidth = 2
      ctx.beginPath(); ctx.ellipse(mark.x, mark.y, r, r * 0.42, 0, 0, Math.PI * 2); ctx.stroke()
      ctx.fillStyle = ctx.strokeStyle
      for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) ctx.fillRect(Math.round(mark.x + dx * (r + 5) - (dx ? 4 : 1)), Math.round(mark.y + dy * (r * 0.42 + 4) - (dy ? 3 : 1)), dx ? 8 : 2, dy ? 6 : 2)
    }
    if (lids > 0) {
      ctx.fillStyle = '#10141c'
      ctx.fillRect(-pad - 20, -20, W + pad * 2 + 40, 20 + (H / 2) * lids)
      ctx.fillRect(-pad - 20, H - (H / 2) * lids, W + pad * 2 + 40, 20 + (H / 2) * lids)
    }
  }
  farSide.actor.x = rest(farSide)
  nearSide.actor.x = rest(nearSide)
  music.duck(2600) // la música de combate baja mientras suena la fanfarria del comandante que ataca
  sfx.fanfare(b.co)
  void scene.tween(300, (t) => { lids = 1 - easeOut(t) })
  await scene.tween(560, (t) => {
    slide = 1 - easeOut(t)
    farSide.actor.x = rest(farSide)
    nearSide.actor.x = rest(nearSide)
  })
  slide = lids = 0
  // Frenazo: polvo bajo cada plataforma y un saltito de los dos al plantarse
  sfx.land()
  scene.addShake(4)
  for (const s of [farSide, nearSide]) {
    const k = size(s)
    for (let i = 0; i < 8; i++) scene.add({ x: s.home[0] + rnd(-30, 30) * k, y: s.home[1] + 4, vx: s.sign * rnd(0.5, 2.5), vy: rnd(-1.2, -0.2), size: 4 * k, max: 380, colors: ['#fff', '#d8d0c0'], behind: true })
    void scene.tween(260, (t) => { s.actor.oy = -Math.sin(t * Math.PI) * 8 * k })
  }
  root.classList.add('ready')
  if (gap > 1) stamp(`A ${gap} casillas`, W / 2, 62, 'weak')
  await scene.wait(480)

  await strike(att, def, b.dmg, b.crit)
  if (def.hp > 0 && b.counter !== null) {
    await scene.wait(200)
    await strike(def, att, b.counter)
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
    const [x, y] = body(s), k = size(s)
    setTimeout(() => {
      s.plate.classList.add('evo')
      sfx.ready()
      stamp('¡PUEDE EVOLUCIONAR!', x, y - 34 * k, 'super')
      scene.add({ ring: 50 * k, size: 5, color: '#ffd84a', x, y, max: 500 })
      for (let i = 0; i < 14; i++) { const ang = (i / 14) * Math.PI * 2; scene.add({ img: 'gold_stars', x, y, vx: Math.cos(ang) * 2.6, vy: Math.sin(ang) * 2.6, drag: 0.95, max: 700, scale: 2 * k }) }
      say(`¡${KINDS[s.kind].name} ya puede evolucionar!`)
    }, 450)
  }
  await scene.wait(waitXp)
  await close()
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
