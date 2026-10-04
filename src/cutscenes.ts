// Escenas a pantalla completa: combate y captura. Todo se dibuja en un lienzo de 256x176 (vista lateral,
// como las escenas de Advance Wars) con los sprites de Mundo Misterioso y los efectos de Esmeralda.
import { ATTACK_NAME, KINDS, PType, TYPE_COLOR, TYPE_NAME, effectiveness } from './data'
import { Actor, Scene, SpriteSheet, easeBack, easeIn, easeOut, registerSheet, rnd } from './scene'
import { sfx } from './sfx'
import { cover, uncover } from './ui'
import { DIR, facePath } from './units'

const W = 256, H = 176 // lienzo de la escena de captura
const TEAM_HEX = ['#e8483c', '#3c7ce8']

let scene: Scene
let root: HTMLElement
let tiles: HTMLImageElement
let pieces: HTMLImageElement
let pieceAt: Record<string, { x: number; w: number; h: number }>

export function initCutscenes(
  el: HTMLElement, tileImg: HTMLImageElement, pieceImg: HTMLImageElement, pieceMeta: Record<string, { x: number; w: number; h: number }>,
) {
  root = el
  tiles = tileImg
  pieces = pieceImg
  pieceAt = pieceMeta
  scene = new Scene(el.querySelector('canvas')!, W, H)
}

// ---------- Fondos ----------

export interface Place { terrain: string; building?: { type: string; owner: number } }

const SKY = ['#58a8f0', '#70b8f4', '#90ccf8', '#b0dcf8', '#d0ecfc']

// ---------- Interfaz sobre la escena ----------

const pct = (x: number, y: number) => `left:${(x / scene.w) * 100}%;top:${(y / scene.h) * 100}%`

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
async function open(mode: string, w = W, h = H) {
  await cover()
  scene.resize(w, h)
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

// ---------- Combate ----------
// Estilo Blanco/Negro: fondo y plataformas de la comunidad, el atacante de espaldas en primer plano y el rival
// de frente al fondo, con los sprites animados originales y efectos por tipo.

const BW = 512, BH = 332, BG_Y = 22
const ARENA: Record<string, string> = { '.': 'field', '"': 'field', '=': 'field', T: 'forest', '~': 'water', s: 'water', M: 'mountain', B: 'city', '#': 'city' }
const FX = (name: string) => 'b:' + name

interface Arena { bg: HTMLImageElement; player: HTMLImageElement; enemy: HTMLImageElement }
const arenas: Record<string, Arena> = {}
const battleSprites: Record<string, { front: SpriteSheet; back: SpriteSheet }> = {}
const moveBgs: Partial<Record<PType, HTMLImageElement>> = {}

export async function loadBattle() {
  const load = (src: string) => new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = '/assets/battle/' + src
  })
  const meta = await fetch('/assets/battle/battle.json').then((r) => r.json())
  const jobs: Promise<unknown>[] = []
  for (const [name, views] of Object.entries<Record<string, Omit<SpriteSheet, 'img'>>>(meta.sprites)) {
    jobs.push(Promise.all([load(`${name}-front.png`), load(`${name}-back.png`)]).then(([front, back]) => {
      battleSprites[name] = { front: { ...views.front, img: front }, back: { ...views.back, img: back } }
    }))
  }
  for (const [name, m] of Object.entries<{ w: number; h: number; cols: number; n: number }>(meta.sheets)) {
    jobs.push(load(`fx-${name}.png`).then((img) => registerSheet(FX(name), img, m)))
  }
  for (const arena of new Set(Object.values(ARENA))) {
    jobs.push(Promise.all([load(`${arena}-bg.png`), load(`${arena}-player.png`), load(`${arena}-enemy.png`)])
      .then(([bg, player, enemy]) => { arenas[arena] = { bg, player, enemy } }))
  }
  for (const type of ['fire', 'electric', 'psychic', 'water', 'dragon', 'steel', 'normal', 'fighting'] as PType[]) {
    jobs.push(load(`movebg-${type}.jpg`).then((img) => { moveBgs[type] = img }))
  }
  await Promise.all(jobs)
}

interface Side { actor: Actor; kind: string; team: number; hp: number; plate: HTMLElement; view: 'front' | 'back' }
type Move = (a: Side, d: Side) => Promise<void> // se resuelve en el momento del impacto

const body = (s: Side): [number, number] => [s.actor.x + s.actor.ox, s.actor.y + s.actor.oy - (s.actor.sheet!.h * s.actor.scale) / 2]
/** Sentido horizontal del golpe: +1 si va del primer plano al fondo. */
const dirOf = (a: Side) => (a.view === 'back' ? 1 : -1)

// Fondo especial de algunos ataques: entra fundiéndose y corre de lado
const moveBg = { img: null as HTMLImageElement | null, alpha: 0 }
function showMoveBg(type: PType) {
  const img = moveBgs[type]
  if (!img) return
  moveBg.img = img
  void scene.tween(180, (t) => { moveBg.alpha = 0.92 * t })
}
const hideMoveBg = () => { if (moveBg.alpha > 0) void scene.tween(260, (t) => { moveBg.alpha = Math.min(moveBg.alpha, 0.92 * (1 - t)) }) }

/** Gesto de lanzar un ataque a distancia: se encoge y da un respingo. */
async function cast(a: Side) {
  sfx.cast()
  await scene.tween(220, (t) => {
    const k = Math.sin(t * Math.PI)
    a.actor.sy = 1 + 0.12 * k
    a.actor.sx = 1 - 0.08 * k
    a.actor.oy = -8 * k
  })
}

/** Chorro continuo del atacante al objetivo (fuego, agua, aliento). */
async function stream(a: Side, d: Side, spawn: (x: number, y: number, vx: number, vy: number, ms: number) => void) {
  await cast(a)
  const [ax0, ay0] = body(a), [dx, dy] = body(d)
  const ax = ax0 + dirOf(a) * 30, ay = ay0 - 10, travel = 270, frames = travel / 16.7
  const end = scene.time + 520
  void (async () => {
    while (scene.time < end) {
      for (let i = 0; i < 2; i++) spawn(ax, ay + rnd(-5, 5), ((dx - ax) / frames) * rnd(0.9, 1.1), (dy - ay) / frames + rnd(-0.9, 0.9), travel)
      await scene.wait(20)
    }
  })()
  sfx.shoot()
  await scene.wait(travel)
}

/** Embestida: se encoge, cruza la pantalla dejando estela y luego vuelve a su sitio de un salto. */
async function dash(a: Side, d: Side, arc = 0) {
  const act = a.actor, dir = dirOf(a)
  await scene.tween(140, (t) => { act.ox = -dir * 16 * easeOut(t); act.oy = dir * 8 * easeOut(t); act.sx = 1 + 0.12 * t; act.sy = 1 - 0.12 * t })
  const [ax, ay] = body(a), [tx, ty] = body(d)
  const fromX = act.ox, fromY = act.oy, toX = fromX + (tx - ax) * 0.78, toY = fromY + (ty - ay) * 0.78
  sfx.lunge()
  let lastGhost = 0
  await scene.tween(130, (t) => {
    const k = easeIn(t)
    act.ox = fromX + (toX - fromX) * k
    act.oy = fromY + (toY - fromY) * k - Math.sin(t * Math.PI) * arc
    act.sx = 1.15
    act.sy = 0.9
    if (scene.time - lastGhost > 18) {
      scene.ghost(act)
      lastGhost = scene.time
      scene.add({ x: act.x + act.ox - dir * 20, y: act.y + act.oy - rnd(10, 90), line: [dir * 60, -dir * 28], size: 2, max: 170, color: '#fff' })
    }
  })
  act.sx = act.sy = 1
  void (async () => { // vuelta a casa con un saltito
    await scene.wait(340)
    await scene.tween(300, (t) => { act.ox = toX * (1 - easeOut(t)); act.oy = toY * (1 - easeOut(t)) - Math.sin(t * Math.PI) * 26 })
  })()
}

const FIRE = ['#fff8c0', '#ffd040', '#ff8020', '#d03010']
const WATER = ['#f0faff', '#88c8ff', '#3880e8']
const MOVES: Record<PType, Move> = {
  fire: async (a, d) => {
    await stream(a, d, (x, y, vx, vy, ms) => {
      scene.add({ img: FX('fire'), frame: 24, count: 8, fps: 18, loop: true, x, y, vx, vy, max: ms + 80, scale: 0.45, grow: 2.6 })
      scene.add({ x, y, vx: vx * rnd(0.6, 1), vy: vy - rnd(0, 2), max: ms, size: 6, colors: FIRE })
    })
    const [dx, dy] = body(d)
    scene.fx(FX('fire'), dx, dy - 36, { frame: 6, count: 8, fps: 13, scale: 2.2 })
    scene.fx(FX('fire'), dx, dy, { frame: 40, count: 5, fps: 14, scale: 2.4, delay: 60 })
    scene.burst(dx, dy, 26, { colors: FIRE, speed: 5, up: 4, g: 0.12, size: 6, max: 700 })
  },
  water: async (a, d) => {
    await stream(a, d, (x, y, vx, vy, ms) => {
      scene.add({ img: FX('water'), frame: 43, count: 4, fps: 14, loop: true, x, y, vx, vy, max: ms + 50, scale: 0.3, grow: 1.9 })
      scene.add({ x, y, vx: vx * rnd(0.8, 1), vy, max: ms, size: 6, colors: WATER })
    })
    const [dx, dy] = body(d)
    scene.fx(FX('water'), dx, dy - 20, { frame: 8, count: 11, fps: 17, scale: 1.8 })
    scene.fx(FX('water'), dx, dy, { frame: 28, count: 13, fps: 22, scale: 2.4 })
    scene.burst(dx, dy, 30, { colors: WATER, speed: 6, up: 5, g: 0.4, size: 6, max: 800 })
  },
  dragon: async (a, d) => {
    await stream(a, d, (x, y, vx, vy, ms) => {
      scene.add({ img: FX('dragonbreath'), frame: 0, count: 3, fps: 12, loop: true, x, y, vx, vy, max: ms + 70, scale: 0.7, grow: 2.2 })
      scene.add({ x, y, vx, vy, max: ms, size: 6, colors: ['#fff', '#d0a8ff', '#7038f8'], add: true })
    })
    const [dx, dy] = body(d)
    scene.fx(FX('dragonpulse'), dx, dy, { frame: 5, count: 4, fps: 12, scale: 2.4 })
    scene.fx(FX('explosions'), dx, dy, { frame: 0, count: 4, fps: 12, scale: 2.6 })
  },
  grass: async (a, d) => {
    await cast(a)
    sfx.shoot()
    const [ax, ay] = body(a), [dx, dy] = body(d)
    for (let i = 0; i < 9; i++) {
      const p = scene.add({ img: FX('grass'), frame: i % 3 ? 8 : 4, count: i % 3 ? 10 : 4, fps: 22, loop: true, x: ax, y: ay, max: 330 + i * 32, delay: i * 32, scale: i % 3 ? 2 : 1.5 })
      const bend = (i % 2 ? -1 : 1) * (22 + i * 7)
      void scene.wait(i * 32).then(() => scene.tween(290, (t) => {
        p.x = ax + (dx - ax) * t
        p.y = ay + (dy - ay) * t + Math.sin(t * Math.PI) * bend
        if (Math.random() < 0.6) scene.add({ x: p.x, y: p.y, max: 200, size: 4, colors: ['#c8f890', '#58c040'] })
      }))
    }
    await scene.wait(300)
    scene.fx(FX('slash'), dx, dy, { frame: 5, count: 4, fps: 14, scale: 2.6, flipX: dirOf(a) < 0 })
    scene.fx(FX('grass'), dx, dy, { frame: 37, count: 2, fps: 7, scale: 2.4 })
    for (let i = 0; i < 10; i++) scene.add({ img: FX('grass'), frame: 8, count: 10, fps: 16, loop: true, x: dx, y: dy, vx: rnd(-5, 5), vy: rnd(-7, -2), g: 0.3, max: 800, scale: 1.4 })
  },
  electric: async (a, d) => {
    const [ax, ay] = body(a), [dx, dy] = body(d)
    scene.fx(FX('electric'), ax, ay, { frame: 0, count: 9, fps: 20, scale: 2.4 })
    await cast(a)
    await scene.wait(220)
    const strike = () => {
      scene.fx(FX('thunder'), dx + rnd(-10, 10), dy - 16, { frame: 20, count: 6, fps: 16, scale: 2.8, flipX: Math.random() < 0.5 })
      for (let y = dy - 30; y > -60; y -= 62) scene.add({ img: 'lightning', frame: Math.floor(rnd(0, 4)), x: dx + rnd(-8, 8), y, max: 90, scale: 2.2, fade: false, flipX: Math.random() < 0.5 })
      scene.flashScreen('#fff8a0', 0.8, 9)
      scene.addShake(6)
    }
    strike()
    void (async () => { for (let i = 0; i < 2; i++) { await scene.wait(120); strike(); sfx.hit() } })()
    scene.burst(dx, dy, 20, { colors: ['#fff', '#f8e050'], speed: 7, size: 4, max: 340 })
  },
  psychic: async (a, d) => {
    await cast(a)
    const [ax, ay] = body(a), [dx, dy] = body(d)
    const frames = 300 / 16.7
    for (let i = 0; i < 5; i++) {
      for (const [color, size] of [['#f85888', 10], ['#ffd8e8', 4]] as const) {
        scene.add({ ring: 18 + i * 12, size, color, x: ax, y: ay - 12, vx: (dx - ax) / frames, vy: (dy - ay + 12) / frames, max: 300, delay: i * 70, fade: false })
      }
    }
    await scene.wait(380)
    void scene.tween(560, (t) => { d.actor.ox = Math.sin(t * Math.PI * 8) * 12 * (1 - t); d.actor.sx = 1 + 0.1 * Math.sin(t * Math.PI * 6) * (1 - t) })
    scene.fx(FX('ironhead'), dx, dy, { frame: 0, count: 2, fps: 7, scale: 2.6 })
    for (let i = 0; i < 6; i++) scene.fx('eye_sparkle', dx + Math.cos(i) * 44, dy + Math.sin(i) * 36, { delay: i * 50, fps: 12, scale: 2 })
  },
  rock: async (a, d) => {
    await cast(a)
    sfx.shoot()
    const [ax, ay] = body(a), [dx, dy] = body(d)
    for (let i = 0; i < 5; i++) {
      const p = scene.add({ img: FX('rock'), frame: i % 3, x: ax, y: ay, max: 380 + i * 55, delay: i * 55, scale: 1.7, vr: 0.3, fade: false })
      void scene.wait(i * 55).then(() => scene.tween(370, (t) => { p.x = ax + (dx - ax) * t; p.y = ay + (dy - ay) * t - Math.sin(t * Math.PI) * 110 }))
    }
    await scene.wait(370)
    scene.fx(FX('rocksmash'), dx, dy, { frame: 0, count: 6, fps: 14, scale: 2.4 })
    scene.fx(FX('explosions'), dx, dy + 14, { frame: 5, count: 3, fps: 9, scale: 2.4 })
    for (let i = 0; i < 10; i++) scene.add({ img: FX('rock'), frame: 3 + (i % 3), x: dx, y: dy, vx: rnd(-6, 6), vy: rnd(-8, -2), g: 0.5, vr: 0.3, max: 700, scale: 1.3 })
  },
  normal: async (a, d) => {
    await dash(a, d)
    const [dx, dy] = body(d)
    scene.fx(FX('punches'), dx, dy, { frame: 7, count: 1, fps: 0, max: 280, scale: 0.8, grow: 2.6 })
    scene.fx(FX('explosions'), dx, dy, { frame: 9, count: 1, fps: 0, max: 220, scale: 1.4, grow: 1.7 })
  },
  flying: async (a, d) => {
    await dash(a, d, 60)
    const [dx, dy] = body(d)
    scene.fx(FX('airslash'), dx, dy, { frame: 0, count: 8, fps: 26, scale: 2.6, flipX: dirOf(a) < 0 })
    scene.fx(FX('slash'), dx, dy, { frame: 5, count: 4, fps: 16, scale: 2.6, flipX: dirOf(a) < 0 })
    for (let i = 0; i < 8; i++) scene.add({ img: 'white_feather', frame: i % 2, x: dx, y: dy, vx: rnd(-5, 5), vy: rnd(-6, -1), g: 0.14, vr: rnd(-0.1, 0.1), max: 1000, scale: 2 })
  },
  fighting: async (a, d) => {
    await dash(a, d)
    const [dx, dy] = body(d)
    scene.add({ img: 'red_fist', x: dx - dirOf(a) * 26, y: dy, max: 320, scale: 6, grow: 0.6, flipX: dirOf(a) < 0, fade: false })
    scene.fx(FX('punches'), dx, dy, { frame: 7, count: 1, fps: 0, max: 300, scale: 0.8, grow: 3 })
    scene.hitStop(70)
  },
  dark: async (a, d) => {
    await dash(a, d)
    const [dx, dy] = body(d)
    scene.flashScreen('#3a1870', 0.5, 2)
    scene.fx(FX('crunch'), dx, dy, { frame: 0, count: 12, fps: 30, scale: 1.7 })
    await scene.wait(230)
  },
  steel: async (a, d) => {
    await dash(a, d)
    const [dx, dy] = body(d)
    for (let i = 0; i < 3; i++) scene.fx(FX('slash'), dx - 20 + i * 20, dy - 14 + i * 14, { frame: 40, count: 3, fps: 18, delay: i * 45, scale: 2.6, flipX: dirOf(a) < 0 })
    scene.fx(FX('ironhead'), dx, dy, { frame: 0, count: 2, fps: 8, scale: 3, delay: 80 })
  },
}

async function strike(a: Side, d: Side, dmg: number) {
  const type = KINDS[a.kind].type
  const eff = effectiveness(type, KINDS[d.kind].type)
  const big = eff > 1
  say(`¡${KINDS[a.kind].name} usó ${ATTACK_NAME[type]}!`)
  showMoveBg(type)
  await MOVES[type](a, d)

  // Impacto: parada, destello, retroceso y números
  const [dx, dy] = body(d), dir = dirOf(a)
  const hpAfter = Math.max(0, d.hp - dmg)
  scene.hitStop(big ? 180 : 110)
  scene.addShake(big ? 18 : 9)
  if (big) scene.flashScreen('#fff', 0.85, 7)
  scene.fx('hit', dx, dy, { fps: 20, scale: big ? 6 : 4 })
  scene.add({ ring: big ? 130 : 84, size: 10, color: '#fff', x: dx, y: dy, max: 320 })
  for (let i = 0; i < (big ? 26 : 14); i++) {
    const ang = rnd(0, Math.PI * 2), v = rnd(5, big ? 13 : 9)
    scene.add({ x: dx, y: dy, vx: Math.cos(ang) * v, vy: Math.sin(ang) * v, drag: 0.9, line: [Math.cos(ang) * 22, Math.sin(ang) * 22], size: 4, max: 340, colors: ['#fff', TYPE_COLOR[type]] })
  }
  ;(big ? sfx.bigHit : eff < 1 ? sfx.weakHit : sfx.hit)()
  d.actor.tint = ['#fff', 1]
  void scene.tween(320, (t) => { d.actor.tint[1] = Math.floor(t * 6) % 2 ? 0 : 1 - t })
  void scene.tween(460, (t) => {
    const k = t < 0.15 ? t / 0.15 : 1 - easeOut((t - 0.15) / 0.85)
    d.actor.ox = dir * (big ? 44 : 26) * k
    d.actor.oy = -dir * (big ? 20 : 12) * k
    d.actor.sx = 1 - 0.18 * k
  })
  stamp(`-${dmg}`, dx, dy - 70, big ? 'dmg big' : 'dmg')
  if (eff !== 1) stamp(big ? '¡SÚPER EFICAZ!' : 'Poco eficaz…', BW / 2, BG_Y + 96, big ? 'super' : 'weak')
  d.hp = hpAfter
  setHp(d.plate, hpAfter)
  restartClass(d.plate, 'hurt')
  say(`${KINDS[d.kind].name} pierde ${dmg} PS.`)
  await scene.wait(520)
  hideMoveBg()
  await scene.wait(300)

  if (hpAfter > 0) return
  // K.O.: sale volando
  say(`¡${KINDS[d.kind].name} se ha debilitado!`)
  sfx.ko()
  scene.fx(FX('explosions'), dx, dy, { frame: 0, count: 4, fps: 12, scale: 3 })
  scene.addShake(14)
  stamp('K.O.', dx, dy - 50, 'ko')
  let lastStar = 0
  await scene.tween(720, (t) => {
    d.actor.ox = dir * t * 360
    d.actor.oy = -Math.sin(t * Math.PI * 0.8) * 170
    d.actor.rot = dir * t * 14
    if (scene.time - lastStar > 40) {
      lastStar = scene.time
      scene.add({ img: 'gold_stars', x: d.actor.x + d.actor.ox, y: d.actor.y + d.actor.oy - 40, vy: 1, max: 420, scale: 3 })
    }
  })
  d.actor.visible = false
}

async function evolve(s: Side, kind: string) {
  const act = s.actor, [x, y] = body(s)
  say(`¡Anda! ¡${KINDS[s.kind].name} está evolucionando!`)
  sfx.evolve()
  let last = 0
  await scene.tween(1000, (t) => {
    act.tint = ['#fff', Math.min(1, t * 1.4 + 0.3 * Math.sin(t * 40))]
    act.sx = act.sy = 1 + 0.18 * Math.sin(t * Math.PI * 9) * t
    if (scene.time - last > 40) {
      last = scene.time
      const ang = rnd(0, Math.PI * 2), r = 130
      scene.add({ img: 'blue_star', frame: 1, x: x + Math.cos(ang) * r, y: y + Math.sin(ang) * r, vx: (-Math.cos(ang) * r) / 18, vy: (-Math.sin(ang) * r) / 18, max: 300, scale: 2.5 })
    }
  })
  scene.flashScreen('#fff', 1, 2.2)
  scene.addShake(12)
  s.kind = kind
  act.sheet = battleSprites[KINDS[kind].species][s.view]
  act.sx = act.sy = 1
  setPlate(s.plate, kind, s.team, s.hp)
  scene.add({ ring: 200, size: 14, color: '#fff', x, y, max: 520 })
  for (let i = 0; i < 22; i++) {
    const ang = (i / 22) * Math.PI * 2
    scene.add({ img: 'gold_stars', x, y, vx: Math.cos(ang) * 7, vy: Math.sin(ang) * 7, drag: 0.95, max: 800, scale: 3 })
  }
  void scene.tween(500, (t) => { act.tint[1] = 1 - t; act.oy = -Math.sin(t * Math.PI) * 30 })
  stamp('¡EVOLUCIÓN!', BW / 2, BG_Y + 90, 'super')
  say(`¡Ha evolucionado a ${KINDS[kind].name}!`)
  await scene.wait(1300)
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
  evolved: 'a' | 'd' | null
  evolvedKind: string
}

export async function playBattle(b: BattleData) {
  await open('battle', BW, BH)
  const plates = root.querySelectorAll<HTMLElement>('.plate')
  const arena = arenas[ARENA[b.d.place.terrain] ?? 'field']
  const actor = (kind: string, view: 'front' | 'back', x: number, y: number, scale: number) => {
    const act = scene.actor(KINDS[kind].species, x, y, 0, scale)
    act.sheet = battleSprites[KINDS[kind].species][view]
    act.animStart = -Math.random() * 2000
    return act
  }
  const player: Side = { actor: actor(b.a.kind, 'back', 134, BG_Y + 300, 3), kind: b.a.kind, team: b.a.team, hp: b.a.hp, plate: plates[0], view: 'back' }
  const foe: Side = { actor: actor(b.d.kind, 'front', 386, BG_Y + 206, 2), kind: b.d.kind, team: b.d.team, hp: b.d.hp, plate: plates[1], view: 'front' }
  setPlate(player.plate, player.kind, player.team, player.hp)
  setPlate(foe.plate, foe.kind, foe.team, foe.hp)
  say('')
  moveBg.alpha = 0

  let slide = 1
  scene.background = (ctx, time) => {
    ctx.fillStyle = '#10141c'
    ctx.fillRect(-40, -40, BW + 80, BH + 80)
    ctx.drawImage(arena.bg, 0, BG_Y)
    if (moveBg.img && moveBg.alpha > 0) { // fondo del ataque, corriendo de lado
      ctx.globalAlpha = moveBg.alpha
      const x = -((time * 0.9) % BW)
      ctx.drawImage(moveBg.img, x, BG_Y, BW, 288)
      ctx.drawImage(moveBg.img, x + BW, BG_Y, BW, 288)
      ctx.globalAlpha = 1
    }
    ctx.globalAlpha = moveBg.alpha > 0 ? 1 - moveBg.alpha * 0.6 : 1
    ctx.drawImage(arena.enemy, 250 - slide * 420, BG_Y + 110)
    ctx.drawImage(arena.player, -60 + slide * 420, BG_Y + 288 - arena.player.height)
    ctx.globalAlpha = 1
  }
  scene.foreground = (ctx) => { // franjas de cine arriba y abajo, con el color de cada equipo
    ctx.fillStyle = '#10141c'
    ctx.fillRect(-40, -40, BW + 80, BG_Y + 40)
    ctx.fillRect(-40, BG_Y + 288, BW + 80, 80)
    ctx.fillStyle = TEAM_HEX[b.a.team]
    ctx.fillRect(0, BG_Y - 3, BW / 2, 3)
    ctx.fillRect(0, BG_Y + 288, BW / 2, 3)
    ctx.fillStyle = TEAM_HEX[b.d.team]
    ctx.fillRect(BW / 2, BG_Y - 3, BW / 2, 3)
    ctx.fillRect(BW / 2, BG_Y + 288, BW / 2, 3)
  }
  // Entran deslizándose en sentidos opuestos, en silueta, y se revelan con un destello
  player.actor.tint = foe.actor.tint = ['#000', 1]
  player.actor.tint = ['#000', 1]
  foe.actor.tint = ['#000', 1]
  sfx.battle()
  await scene.tween(520, (t) => {
    slide = 1 - easeOut(t)
    player.actor.ox = 420 * slide
    foe.actor.ox = -420 * slide
  })
  slide = 0
  player.actor.ox = foe.actor.ox = 0
  scene.flashScreen('#fff', 0.6, 5)
  sfx.land()
  void scene.tween(260, (t) => { player.actor.tint[1] = foe.actor.tint[1] = 1 - t })
  root.classList.add('ready')
  await scene.wait(600)

  await strike(player, foe, b.dmg)
  if (foe.hp > 0 && b.counter !== null) {
    await scene.wait(200)
    await strike(foe, player, b.counter)
  }
  if (b.evolved) await evolve(b.evolved === 'a' ? player : foe, b.evolvedKind)
  else await scene.wait(380)
  await close()
}

// ---------- Captura ----------

export interface CaptureData {
  kind: string; team: number
  building: { type: string; owner: number }
  capBefore: number; capAfter: number; done: boolean; total: number
}

/** Captura: el Pokémon salta al tejado del edificio real y lo pisotea hasta rendirlo. Todo a escala 1. */
export async function playCapture(c: CaptureData) {
  await open('capture')
  const piece = pieceAt[c.building.type], tree = pieceAt.tree
  const bx = W / 2, base = 150, left = bx - piece.w / 2, roof = base - piece.h + (c.building.type === 'gym' ? 20 : 16)
  let squash = 0, glow = 0, flag = c.building.owner >= 0 ? 1 : 0, flagTeam = c.building.owner
  scene.background = (ctx, time) => {
    SKY.forEach((color, i) => { ctx.fillStyle = color; ctx.fillRect(-20, i * 22 - 10, W + 40, 22) })
    ctx.fillStyle = '#ffffffd8'
    for (const [cx, cy, cw] of [[20, 16, 30], [110, 30, 22], [190, 12, 26]]) {
      const x = ((cx + time * 0.004) % (W + 60)) - 30
      ctx.fillRect(x, cy, cw, 5)
      ctx.fillRect(x + 5, cy - 3, cw - 12, 3)
    }
    ctx.fillStyle = '#58b888'
    for (let x = -20; x < W + 20; x += 2) ctx.fillRect(x, 100 - 12 - Math.sin(x * 0.05) * 7 - Math.sin(x * 0.13) * 3, 2, 30)
    for (let y = 100; y < H + 16; y += 16) for (let x = -32; x < W + 32; x += 16) ctx.drawImage(tiles, 16, 0, 16, 16, x, y, 16, 16)
    for (let y = base; y < H + 16; y += 16) { // caminito de tierra hasta la puerta
      ctx.drawImage(tiles, (288 % 32) * 16, Math.floor(288 / 32) * 16, 16, 16, left + 8, y, 16, 16)
      ctx.drawImage(tiles, (290 % 32) * 16, Math.floor(290 / 32) * 16, 16, 16, left + 24, y, 16, 16)
    }
    for (const x of [-6, 26, 200, 232]) ctx.drawImage(pieces, tree.x, 0, tree.w, tree.h, x, 112 - tree.h + (x % 3) * 4, tree.w, tree.h)
    ctx.save()
    ctx.translate(bx, base)
    ctx.scale(1 + 0.08 * squash, 1 - 0.12 * squash)
    ctx.fillStyle = 'rgba(8, 24, 40, 0.28)'
    ctx.fillRect(-piece.w / 2 + 3, -3, piece.w - 2, 6)
    ctx.drawImage(pieces, piece.x, 0, piece.w, piece.h, -piece.w / 2, -piece.h, piece.w, piece.h)
    if (glow > 0) { // el edificio se ilumina al cambiar de dueño
      ctx.globalAlpha = glow
      ctx.globalCompositeOperation = 'lighter'
      ctx.drawImage(pieces, piece.x, 0, piece.w, piece.h, -piece.w / 2, -piece.h, piece.w, piece.h)
      ctx.globalCompositeOperation = 'source-over'
      ctx.globalAlpha = 1
    }
    // Mástil y bandera
    const fx0 = piece.w / 2 - 10, top = -piece.h - 16
    ctx.fillStyle = '#10141c'
    ctx.fillRect(fx0, top, 2, 26)
    if (flag > 0 && flagTeam >= 0) {
      const y = top + 1 + (1 - flag) * 16, wave = Math.floor(time / 160) % 3
      ctx.fillRect(fx0 - 17, y - 1, 18, 12)
      ctx.fillStyle = TEAM_HEX[flagTeam]
      ctx.fillRect(fx0 - 16, y, 16, 10)
      ctx.fillStyle = '#ffffff70'
      ctx.fillRect(fx0 - 16 + wave * 5, y, 4, 10)
    }
    ctx.restore()
  }
  scene.foreground = null
  const counter = root.querySelector<HTMLElement>('.counter')!
  const showCount = (n: number) => {
    counter.innerHTML = `<small>CAPTURA</small><b>${Math.max(0, n)}</b><div class="bar"><i style="width:${(Math.max(0, n) / c.total) * 100}%"></i></div>`
    restartClass(counter, 'tick')
  }
  showCount(c.capBefore)
  say(`¡${KINDS[c.kind].name} intenta capturar el edificio!`)

  const act = scene.actor(KINDS[c.kind].species, left - 22, base + 12, DIR.right, 1)
  scene.play(act, 'Walk', true)
  await scene.tween(260, (t) => { act.ox = 14 * t })
  // Salta al tejado
  scene.play(act, 'Hop')
  sfx.lunge()
  act.shadow = false
  const jumpX = bx - act.x, jumpY = roof - act.y
  await scene.tween(380, (t) => { act.ox = 14 + (jumpX - 14) * t; act.oy = jumpY * t - Math.sin(t * Math.PI) * 30 })
  act.x = bx; act.y = roof; act.ox = act.oy = 0
  act.dir = DIR.down

  const stomps = c.done ? 3 : 2
  for (let i = 1; i <= stomps; i++) {
    const last = i === stomps && c.done
    scene.play(act, 'Hop')
    await scene.tween(last ? 380 : 240, (t) => { act.oy = -Math.sin(t * Math.PI) * (last ? 34 : 18); act.sy = 1 + 0.15 * Math.sin(t * Math.PI) })
    act.oy = 0
    // Pisotón: el edificio se aplasta y rebota
    showCount(Math.round(c.capBefore + ((c.capAfter - c.capBefore) * i) / stomps))
    scene.addShake(last ? 6 : 3)
    scene.hitStop(last ? 90 : 40)
    ;(last ? sfx.bigHit : sfx.capture)()
    scene.add({ ring: last ? 40 : 22, size: 3, color: '#fff', x: bx, y: roof, max: 260 })
    for (const side of [-1, 1]) {
      scene.fx('gray_smoke', bx + side * (piece.w / 2 + 2), base - 6, { fps: 12, scale: 1, flipX: side < 0, vx: side * 0.5 })
      scene.burst(bx + side * piece.w / 2, base - 2, 5, { colors: ['#e8f0d8', '#c8d0b8'], speed: 1.4, up: 0.8, max: 350, size: 2 })
    }
    void scene.tween(320, (t) => { squash = (1 - t) * Math.cos(t * Math.PI * 3) * (last ? 1.6 : 1); act.oy = piece.h * 0.12 * squash })
    await scene.wait(last ? 260 : 170)
  }

  if (c.done) {
    scene.flashScreen('#fff', 0.9, 5)
    sfx.captured()
    say('¡Edificio capturado!')
    void scene.tween(700, (t) => { glow = Math.sin(t * Math.PI) })
    await scene.tween(300, (t) => { flag = flagTeam >= 0 ? 1 - t : 0 })
    flagTeam = c.team
    void scene.tween(420, (t) => { flag = easeBack(t) })
    scene.add({ ring: 120, size: 6, color: TEAM_HEX[c.team], x: bx, y: base - piece.h / 2, max: 600 })
    for (let i = 0; i < 46; i++) {
      scene.add({ img: 'confetti', frame: Math.floor(rnd(0, 12)), x: bx + rnd(-30, 30), y: base - piece.h, vx: rnd(-2.6, 2.6), vy: rnd(-4.5, -1.5), g: 0.12, drag: 0.98, max: rnd(900, 1500), scale: 1, vr: 0.2 })
    }
    for (let i = 0; i < 10; i++) scene.add({ img: 'gold_stars', x: bx, y: roof, vx: Math.cos(i) * 2.2, vy: Math.sin(i) * 2.2 - 1, drag: 0.94, max: 700, scale: 1 })
    stamp('¡CAPTURADO!', W / 2, 162, `super t${c.team}`)
    scene.play(act, 'Rotate')
    await scene.tween(520, (t) => { act.oy = -Math.sin(t * Math.PI) * 22 })
    scene.play(act, 'Hop')
    await scene.tween(360, (t) => { act.oy = -Math.sin(t * Math.PI) * 12 })
    scene.play(act, 'Idle', true)
    await scene.wait(500)
  } else {
    say(`¡Aguanta! Quedan ${c.capAfter} puntos.`)
    scene.play(act, 'Idle', true)
    await scene.wait(650)
  }
  await close()
}
