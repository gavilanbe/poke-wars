// Pintado, entrada y flujo de la partida.
import { planRecruit, planUnit } from './ai'
import {
  BUILDING_INFO, CAPTURE_POINTS, COMMANDERS, KINDS, MAP, POWER_COST, PType, RECRUITABLE, TYPE_COLOR, TYPE_NAME,
  effectiveness,
} from './data'
import * as fx from './fx'
import {
  Building, Game, Pos, Reach, Team, Unit, attack, buildingAt, canCapture, canCounter, canRecruit, canUsePower,
  capture, createGame, damage, endTurn, income, isRanged, key, moveRange, moveUnit, pathTo, reachable, recruit,
  footprint, stoppable, targetsFrom, terrainAt, unitAt, usePower,
} from './game'
import { Place, initCutscenes, playBattle, playCapture } from './cutscenes'
import { Scene, loadFx, rnd } from './scene'
import { muted, sfx, toggleMute } from './sfx'
import { fitOverlays, hideOverlay, powerCutin, setPowerColor, turnCard, versus, victory } from './ui'
import { Anim, DIR, animDuration, dirFrom, drawSprite, facePath, loadUnits } from './units'

const T = 32 // píxeles por casilla: 2x2 metatiles de Esmeralda
const TEAM_NAME = ['Rojo', 'Azul']
const TEAM_RGB: [number, number, number][] = [[232, 72, 60], [60, 124, 232]]
const TEAM_HEX = ['#e8483c', '#3c7ce8']
const TEAM_LIGHT = ['#ffb0a0', '#a8d0ff']
const TEAM_DARK = ['#a82c24', '#2452b0']
const AUTO = new URLSearchParams(location.search).has('auto') // IA contra IA, para probar

const $ = <E extends HTMLElement>(sel: string) => document.querySelector(sel) as E
const canvas = $<HTMLCanvasElement>('#map')
const ctx = canvas.getContext('2d')!
const mapFxCanvas = $<HTMLCanvasElement>('#mapfx')
const stage = $('#stage')
const menuEl = $('#menu'), forecastEl = $('#forecast'), recruitEl = $('#recruit')
const sceneEl = $('#scene'), bannerEl = $('#banner'), talkEl = $('#talk'), cutinEl = $('#cutin'), selectEl = $('#select')
const dayEl = $('#day'), cosEl = $('#cos'), infoEl = $('#info')
const endBtn = $<HTMLButtonElement>('#end'), aiBtn = $<HTMLButtonElement>('#ai'), muteBtn = $<HTMLButtonElement>('#mute')
const powerBtn = $<HTMLButtonElement>('#power')

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, AUTO ? Math.min(ms, 8) : ms))
const nextFrame = () => new Promise<number>(requestAnimationFrame)
const clamp01 = (v: number) => Math.max(0, Math.min(1, v))
const easeOutBack = (t: number) => 1 + 2.7 * Math.pow(t - 1, 3) + 1.7 * Math.pow(t - 1, 2)
const pick = <V>(list: V[]) => list[Math.floor(Math.random() * list.length)]
const loadImage = (src: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = src
  })
const restart = (el: Element, cls: string) => {
  el.classList.remove(cls)
  void (el as HTMLElement).offsetWidth
  el.classList.add(cls)
}

// ---------- Sprites del mapa ----------

let species: string[] = [] // orden de las hojas de Esmeralda (iconos, frente y espalda)
let atlas: HTMLImageElement // edificios, árbol, rocas y tiles de suelo
let at: Record<string, { x: number; w: number; h: number }> = {}
let water: HTMLImageElement
let forestCells: Pos[] = []
let terrainLayer: HTMLCanvasElement
let mapFx: Scene // efectos con sprites por encima del mapa

function makeCanvas(w: number, h: number) {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const cx = c.getContext('2d')!
  cx.imageSmoothingEnabled = false
  return [c, cx] as const
}

// El mapa usa un tileset de la comunidad con estilo de 4ª generación (ver tools/extract_map.py): `atlas` lleva
// edificios, pino, rocas y los tiles de suelo; `water` es un autotile animado de 32 fotogramas.
const hash = (x: number, y: number) => (((x * 73856093) ^ (y * 19349663)) >>> 0) / 4294967296
const WATER_FRAMES = 32, WATER_W = 48

interface Flower { x: number; y: number; color: number }
interface WaterQuarter { dx: number; dy: number; sx: number; sy: number }
let flowerSpots: Flower[] = []
let waterQuarters: WaterQuarter[] = []
let overlayLayer: HTMLCanvasElement // árboles y rocas: van por encima del agua animada

/**
 * El suelo se pinta una vez: cada casilla son 2x2 tiles de 16 px. Los caminos y el agua eligen sus piezas
 * según las casillas vecinas; el agua se guarda como lista de cuartos de tile para animarla en cada fotograma.
 */
function makeTerrainLayer(g: Game) {
  const [c, cx] = makeCanvas(g.w * T, g.h * T)
  const [over, ox] = makeCanvas(g.w * T, g.h * T)
  const cell = (sx: number, sy: number) => g.tiles[sy >> 1]?.[sx >> 1]
  const put = (name: string, tx: number, ty: number, sx: number, sy: number) =>
    cx.drawImage(atlas, at[name].x + tx * 16, ty * 16, 16, 16, sx * 16, sy * 16, 16, 16)
  const isWater = (x: number, y: number) => '~s'.includes(cell(x, y) ?? '~')
  const isPath = (x: number, y: number) => '=B'.includes(cell(x, y) ?? '=')
  const open = (sx: number, sy: number) => {
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (cell(sx + dx, sy + dy) !== '.') return false
    return true
  }
  flowerSpots = []
  waterQuarters = []
  forestCells = []
  for (let sy = 0; sy < g.h * 2; sy++) {
    for (let sx = 0; sx < g.w * 2; sx++) {
      const ch = cell(sx, sy)
      put('grass', sx % 4, sy % 4, sx, sy)
      if (ch === '.') {
        // Flores en grupitos de un color, y alguna mata suelta para que el césped no quede liso
        const zone = hash(Math.floor(sx / 3), Math.floor(sy / 3))
        if (open(sx, sy) && zone < 0.2 && hash(sx, sy) < 0.6) flowerSpots.push({ x: sx * 16, y: sy * 16, color: Math.floor(zone * 15) % 3 })
        else if (hash(sx + 7, sy + 3) < 0.12) put('tufts', hash(sy, sx) < 0.5 ? 0 : 1, 0, sx, sy)
      } else if (ch === '"') put('tall', 0, 0, sx, sy)
      else if (isPath(sx, sy)) {
        const up = isPath(sx, sy - 1), down = isPath(sx, sy + 1), left = isPath(sx - 1, sy), right = isPath(sx + 1, sy)
        if (up && down && left && right) { // esquinas hacia dentro
          if (!isPath(sx - 1, sy - 1)) put('pathInner', 0, 0, sx, sy)
          else if (!isPath(sx + 1, sy - 1)) put('pathInner', 1, 0, sx, sy)
          else if (!isPath(sx - 1, sy + 1)) put('pathInner', 0, 1, sx, sy)
          else if (!isPath(sx + 1, sy + 1)) put('pathInner', 1, 1, sx, sy)
          else put('path', 1, 1, sx, sy)
        } else put('path', !left ? 0 : !right ? 2 : 1, !up ? 0 : !down ? 2 : 1, sx, sy)
      } else if (isWater(sx, sy)) {
        // Autotile de RPG Maker: cada tile son cuatro cuartos de 8 px que se eligen por separado
        for (const qy of [0, 1]) {
          for (const qx of [0, 1]) {
            const hx = qx ? 1 : -1, vy = qy ? 1 : -1
            const h = isWater(sx + hx, sy), v = isWater(sx, sy + vy), d = isWater(sx + hx, sy + vy)
            let tx = 1, ty = 1, inner = false
            if (h && v && !d) inner = true
            else if (!h && !v) (tx = qx * 2), (ty = qy * 2)
            else if (!h) tx = qx * 2
            else if (!v) ty = qy * 2
            waterQuarters.push({
              dx: sx * 16 + qx * 8, dy: sy * 16 + qy * 8,
              sx: (inner ? 32 : tx * 16) + qx * 8, sy: (inner ? 0 : 16 + ty * 16) + qy * 8,
            })
          }
        }
      }
    }
  }
  // Pinos, rocas y piedras del vado: la copa del pino tapa un poco la casilla de arriba
  const piece = (name: string, x: number, y: number) => {
    const p = at[name]
    ox.drawImage(atlas, p.x, 0, p.w, p.h, x * T + Math.floor((T - p.w) / 2), y * T + T - p.h, p.w, p.h)
  }
  for (let y = 0; y < g.h; y++) {
    for (let x = 0; x < g.w; x++) {
      const ch = g.tiles[y][x]
      if (ch === 'T') { forestCells.push({ x, y }); piece(hash(x * 3 + 1, y * 5 + 2) < 0.5 ? 'oak' : 'tree', x, y) }
      if (ch === 'M') piece('rock', x, y)
      if (ch === 's') piece('stone', x, y)
    }
  }
  overlayLayer = over
  return c
}

// ---------- Estado de la interfaz ----------

type Mode = 'select' | 'idle' | 'inspect' | 'move' | 'menu' | 'target' | 'recruit' | 'busy' | 'over'
interface UnitFx { pop?: number; flash?: number; drop?: number }
let g: Game
let mode: Mode = 'select'
let sel: Unit | null = null
let selTime = 0
let reach = new Map<number, Reach>()
let stops = new Set<number>()
let pending: Pos | null = null // destino elegido, aún sin confirmar
let targets: Unit[] = []
let hover: Pos | null = null
let scale = 2
let lastTime = 0
const cursor = { x: 0, y: 0 }
const shownFunds = [0, 0]
const shownMeter = [0, 0]
const animPos = new Map<number, Pos & { z?: number }>() // píxeles de las unidades que se están moviendo
const unitFx = new Map<number, UnitFx>()
const unitDir = new Map<number, number>()
const unitAnim = new Map<number, { name: Anim; start: number; until: number }>()
const buildingFlash = new Map<Building, number>()
const faces: { face: string; timer: number }[] = [{ face: 'Normal', timer: 0 }, { face: 'Normal', timer: 0 }]
const isAI: [boolean, boolean] = AUTO ? [true, true] : [false, true]

const center = (p: Pos) => [p.x * T + T / 2, p.y * T + T / 2] as const
const setFx = (u: Unit, patch: UnitFx) => unitFx.set(u.id, { ...unitFx.get(u.id), ...patch })
const co = (team: number) => COMMANDERS[g.co[team]]
const spriteOf = (u: Unit) => KINDS[u.kind].species

function playAnim(u: Unit, name: Anim, ms = animDuration(spriteOf(u), name)) {
  const now = performance.now()
  unitAnim.set(u.id, { name, start: now, until: now + ms })
  return ms
}
const face = (u: Unit, to: Pos) => { if (to.x !== u.x || to.y !== u.y) unitDir.set(u.id, dirFrom(to.x - u.x, to.y - u.y)) }
function hurt(u: Unit, ms = 380) {
  setFx(u, { flash: performance.now() + ms })
  playAnim(u, 'Hurt', ms)
}

function resize() {
  const fit = Math.min((innerWidth - 350) / canvas.width, (innerHeight - 30) / canvas.height)
  scale = Math.max(1, Math.min(3, Math.floor(fit * 2) / 2))
  for (const c of [canvas, mapFxCanvas]) {
    c.style.width = canvas.width * scale + 'px'
    c.style.height = canvas.height * scale + 'px'
  }
  fitOverlays(canvas.height * scale)
}

function startGame(cos: [string, string], intro = 0) {
  g = createGame(cos)
  terrainLayer = makeTerrainLayer(g)
  fx.clear()
  for (const m of [unitFx, unitDir, unitAnim, animPos]) m.clear()
  shownMeter[0] = shownMeter[1] = 0
  bannerEl.hidden = sceneEl.hidden = talkEl.hidden = selectEl.hidden = true
  reset()
  refreshPanel()
  if (!AUTO) {
    g.units.forEach((u, i) => dropIn(u, intro + 200 + i * 130))
    say(0, pick(co(0).quotes.start), 'Happy', intro + 900)
    say(1, pick(co(1).quotes.start), 'Determined', intro + 3400)
  }
  if (isAI[g.turn]) runAI()
}

function reset() {
  mode = g.winner !== null ? 'over' : 'idle'
  sel = null
  pending = null
  targets = []
  reach = new Map()
  stops = new Set()
  menuEl.hidden = true
  recruitEl.hidden = true
  forecastEl.hidden = true
}

// ---------- Pintado ----------

function drawUnit(u: Unit, time: number) {
  let x = u.x * T, y = u.y * T, lift = 0, sx = 1, sy = 1
  const moving = animPos.get(u.id)
  if (moving) (x = moving.x), (y = moving.y), (lift = moving.z ?? 0)
  else if (u === sel && pending) (x = pending.x * T), (y = pending.y * T)

  const f = unitFx.get(u.id)
  if (f?.pop) {
    const t = (time - f.pop) / 300
    if (t < 1) {
      const k = Math.sin(t * Math.PI * 2) * (1 - t)
      sy = 1 + 0.4 * k
      sx = 1 - 0.25 * k
      lift += Math.sin(t * Math.PI) * 5
    }
  }
  if (f?.drop) {
    const t = (time - f.drop) / 320
    if (t < 0) return
    if (t < 1) (lift += (1 - t * t) * 80), (sy = 1.25), (sx = 0.8)
    else if (t < 1.6) {
      const k = Math.sin(((t - 1) / 0.6) * Math.PI)
      sy = 1 - 0.3 * k
      sx = 1 + 0.25 * k
    }
  }
  const waiting = u === sel && mode === 'move' && !moving
  if (waiting) lift += Math.abs(Math.sin((time - selTime) / 160)) * 4

  const done = u.moved && u.team === g.turn && mode !== 'over'
  const powered = g.power[u.team]
  // Peana del color del equipo
  ctx.beginPath()
  ctx.ellipse(x + 16, y + 25, 12, 5.5, 0, 0, Math.PI * 2)
  ctx.fillStyle = `rgba(${TEAM_RGB[u.team].join(',')}, ${done ? 0.25 : 0.55})`
  ctx.fill()
  ctx.lineWidth = powered ? 2 : 1
  ctx.strokeStyle = powered && Math.floor(time / 120) % 2 ? '#fff' : done ? '#40485c' : TEAM_HEX[u.team]
  ctx.stroke()
  if (powered && Math.random() < 0.12) {
    fx.burst(x + 6 + Math.random() * 20, y + 24, { n: 1, colors: [co(u.team).color, '#fff'], speed: 0.2, life: 600, size: 3, up: 0.9 })
  }

  const anim = unitAnim.get(u.id)
  const live = anim && time < anim.until ? anim : undefined
  const name: Anim = live?.name ?? (waiting ? 'Walk' : 'Idle')
  const flashing = !!f?.flash && time < f.flash && Math.floor(time / 50) % 2 === 0
  drawSprite(ctx, spriteOf(u), name, unitDir.get(u.id) ?? (u.team === 0 ? DIR.right : DIR.left),
    live ? time - live.start : time + u.id * 137, x + 16, y + 13 - lift,
    { dim: done && name === 'Idle', white: flashing, sx, sy, loop: name === 'Idle' || name === 'Walk' })

  const cx = Math.round((x + 16) / T - 0.5), cy = Math.round((y + 16) / T - 0.5)
  const under = g.tiles[cy]?.[cx]
  if (under === '"' && KINDS[u.kind].move !== 'fly') { // la hierba alta le tapa las patas
    for (const ox of [0, 16]) ctx.drawImage(atlas, at.tall.x, 7, 16, 9, cx * T + ox, cy * T + 23, 16, 9)
  }
  if ((under === '~' || under === 's') && KINDS[u.kind].move !== 'fly' && Math.random() < 0.03) {
    mapFx.add({ img: 'ripple', fps: 7, x: x + 16, y: y + 24, max: 700, scale: 1, behind: true })
  }

  if (u.hp < 10 && !moving) {
    ctx.fillStyle = '#10141c'
    ctx.fillRect(x + 3, y + T - 3, T - 6, 4)
    ctx.fillStyle = u.hp > 5 ? '#58e058' : u.hp > 2 ? '#f8d030' : '#f04838'
    ctx.fillRect(x + 4, y + T - 2, ((T - 8) * u.hp) / 10, 2)
  }
}

// Lienzos de trabajo de la flecha de ruta (del tamaño del mapa)
let arrowLayers: (readonly [HTMLCanvasElement, CanvasRenderingContext2D])[] = []

/**
 * Flecha de ruta. Se pinta la silueta (cuerpo fino con esquinas redondeadas y punta en triángulo) y de ella
 * salen, por composición, el contorno, el relieve claro arriba, la sombra abajo y unos galones que avanzan.
 */
function drawPathArrow(path: Pos[], time: number) {
  if (path.length < 2) return
  if (!arrowLayers.length || arrowLayers[0][0].width !== canvas.width) {
    arrowLayers = [0, 1, 2].map(() => makeCanvas(canvas.width, canvas.height))
  }
  const [[shape, sx], [work, wx], [body, bx]] = arrowLayers
  const pts = path.map((p) => center(p))
  const n = pts.length
  const tip = pts[n - 1], before = pts[n - 2]
  const dx = Math.sign(tip[0] - before[0]), dy = Math.sign(tip[1] - before[1])
  const bob = Math.floor(time / 260) % 2 // la punta respira un píxel
  const half = 4
  pts[n - 1] = [tip[0] - dx * 5, tip[1] - dy * 5] // el cuerpo acaba donde empieza la punta

  // 1. Silueta
  sx.clearRect(0, 0, shape.width, shape.height)
  sx.fillStyle = '#fff'
  for (let i = 1; i < n; i++) {
    const [x0, y0] = pts[i - 1], [x1, y1] = pts[i]
    sx.fillRect(Math.min(x0, x1) - half, Math.min(y0, y1) - half, Math.abs(x1 - x0) + half * 2, Math.abs(y1 - y0) + half * 2)
  }
  const notch = (x: number, y: number, ox: number, oy: number) => { // redondea una esquina quitando 3 píxeles
    const cx = x + ox * half - (ox > 0 ? 1 : 0), cy = y + oy * half - (oy > 0 ? 1 : 0)
    sx.clearRect(cx, cy, 1, 1)
    sx.clearRect(cx - ox, cy, 1, 1)
    sx.clearRect(cx, cy - oy, 1, 1)
  }
  for (let i = 0; i < n - 1; i++) {
    const [x, y] = pts[i]
    const ox = Math.sign(pts[i + 1][0] - x), oy = Math.sign(pts[i + 1][1] - y)
    if (i === 0) { // arranque redondeado
      if (ox) (notch(x, y, -ox, -1), notch(x, y, -ox, 1))
      else (notch(x, y, -1, -oy), notch(x, y, 1, -oy))
    } else {
      const ix = Math.sign(x - pts[i - 1][0]), iy = Math.sign(y - pts[i - 1][1])
      if (ix !== ox || iy !== oy) notch(x, y, ix - ox, iy - oy) // esquina exterior del giro
    }
  }
  for (let i = 0; i < 11; i++) { // punta: triángulo de filas cada vez más cortas
    const w = Math.max(1, 10 - i), along = i - 5 + bob
    if (dx) sx.fillRect(tip[0] + (dx > 0 ? along : -along - 1), tip[1] - w, 1, w * 2)
    else sx.fillRect(tip[0] - w, tip[1] + (dy > 0 ? along : -along - 1), w * 2, 1)
  }

  const tinted = (color: string, build: () => void) => {
    wx.globalCompositeOperation = 'source-over'
    wx.clearRect(0, 0, work.width, work.height)
    build()
    wx.globalCompositeOperation = 'source-in'
    wx.fillStyle = color
    wx.fillRect(0, 0, work.width, work.height)
    wx.globalCompositeOperation = 'source-over'
  }
  // 2. Sombra en el suelo y contorno oscuro (la silueta desplazada en las 8 direcciones)
  tinted('#10141c', () => { for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) wx.drawImage(shape, ox, oy) })
  ctx.globalAlpha = 0.3
  ctx.drawImage(work, 1, 3)
  ctx.globalAlpha = 1
  ctx.drawImage(work, 0, 0)
  // 3. Cuerpo del color del equipo con galones claros que avanzan hacia la punta
  bx.globalCompositeOperation = 'source-over'
  bx.clearRect(0, 0, body.width, body.height)
  bx.drawImage(shape, 0, 0)
  bx.globalCompositeOperation = 'source-in'
  bx.fillStyle = TEAM_HEX[g.turn]
  bx.fillRect(0, 0, body.width, body.height)
  bx.globalCompositeOperation = 'source-atop'
  bx.fillStyle = TEAM_LIGHT[g.turn]
  let walked = 0
  const offset = Math.floor(time / 55)
  for (let i = 1; i < n; i++) {
    const [x0, y0] = pts[i - 1], [x1, y1] = pts[i]
    const len = Math.abs(x1 - x0) + Math.abs(y1 - y0), ux = Math.sign(x1 - x0), uy = Math.sign(y1 - y0)
    for (let d = 0; d < len; d++) {
      if ((walked + d - offset + 6000) % 14 !== 0) continue
      for (let k = 0; k < 4; k++) { // galón «>» de 2 px de grueso
        const px = x0 + ux * (d - k), py = y0 + uy * (d - k)
        bx.fillRect(px - uy * k - (ux < 0 ? 1 : 0) - (uy ? 1 : 0), py - ux * k - (uy < 0 ? 1 : 0) - (ux ? 1 : 0), ux ? 2 : 1, uy ? 2 : 1)
        bx.fillRect(px + uy * k - (ux < 0 ? 1 : 0), py + ux * k - (uy < 0 ? 1 : 0), ux ? 2 : 1, uy ? 2 : 1)
      }
    }
    walked += len
  }
  bx.globalCompositeOperation = 'source-over'
  ctx.drawImage(body, 0, 0)
  // 4. Relieve: filo claro arriba e izquierda, sombra abajo y derecha
  tinted('#ffffff', () => { wx.drawImage(shape, 0, 0); wx.globalCompositeOperation = 'destination-out'; wx.drawImage(shape, 1, 1) })
  ctx.globalAlpha = 0.75
  ctx.drawImage(work, 0, 0)
  tinted(TEAM_DARK[g.turn], () => { wx.drawImage(shape, 0, 0); wx.globalCompositeOperation = 'destination-out'; wx.drawImage(shape, -2, -2) })
  ctx.globalAlpha = 1
  ctx.drawImage(work, 0, 0)
}

/** Selector: cuatro esquinas gruesas con relieve que laten a saltos, y un velo claro sobre la casilla. */
function drawCursor(time: number) {
  if (!hover || mode === 'busy' || mode === 'select') return
  cursor.x += (hover.x * T - cursor.x) * 0.45
  cursor.y += (hover.y * T - cursor.y) * 0.45
  const beat = Math.floor(time / 240) % 2 ? 2 : 0 // dos fotogramas, como un sprite
  const x = Math.round(cursor.x) - 3 - beat, y = Math.round(cursor.y) - 3 - beat, s = T + 6 + beat * 2
  const color = mode === 'over' ? '#ffd84a' : TEAM_HEX[g.turn], light = mode === 'over' ? '#fff' : TEAM_LIGHT[g.turn]
  ctx.fillStyle = `rgba(255, 255, 255, ${beat ? 0.1 : 0.2})`
  ctx.fillRect(Math.round(cursor.x), Math.round(cursor.y), T, T)
  const arm = 11, thick = 5
  // Cada esquina es una L: se pinta en capas de fuera adentro
  const corner = (cx: number, cy: number, hx: number, vy: number) => {
    const layer = (inset: number, fill: string) => {
      ctx.fillStyle = fill
      const w = thick - inset * 2, len = arm - inset
      const ox = hx > 0 ? cx + inset : cx - inset - len, oy = vy > 0 ? cy + inset : cy - inset - w
      ctx.fillRect(ox, oy, len, w)
      const ox2 = hx > 0 ? cx + inset : cx - inset - w, oy2 = vy > 0 ? cy + inset : cy - inset - len
      ctx.fillRect(ox2, oy2, w, len)
    }
    layer(0, '#10141c')
    layer(1, '#fff')
    ctx.fillStyle = color // relleno interior
    ctx.fillRect(hx > 0 ? cx + 2 : cx - arm + 1, vy > 0 ? cy + 2 : cy - 3, arm - 3, 1)
    ctx.fillRect(hx > 0 ? cx + 2 : cx - 3, vy > 0 ? cy + 2 : cy - arm + 1, 1, arm - 3)
    ctx.fillStyle = light
    ctx.fillRect(hx > 0 ? cx + 1 : cx - 2, vy > 0 ? cy + 1 : cy - 2, 1, 1)
  }
  corner(x, y, 1, 1)
  corner(x + s, y, -1, 1)
  corner(x, y + s, 1, -1)
  corner(x + s, y + s, -1, -1)
}

/** Retícula de objetivo: se dibuja una vez en un lienzo pequeño, a píxel, y luego se estampa. */
let reticle: HTMLCanvasElement | null = null
function makeReticle() {
  const [c, cx] = makeCanvas(96, 48) // dos fotogramas de 48x48: rojo y amarillo
  for (let f = 0; f < 2; f++) {
    const put = (x: number, y: number, color: string) => { cx.fillStyle = color; cx.fillRect(f * 48 + x, y, 1, 1) }
    const main = f ? '#ffd84a' : '#f04838', dark = '#10141c'
    for (let y = 0; y < 48; y++) {
      for (let x = 0; x < 48; x++) {
        const d = Math.hypot(x - 23.5, y - 23.5)
        const tick = (Math.abs(x - 23.5) < 2 && Math.abs(y - 23.5) > 12) || (Math.abs(y - 23.5) < 2 && Math.abs(x - 23.5) > 12)
        const tickEdge = (Math.abs(x - 23.5) < 3 && Math.abs(y - 23.5) > 11) || (Math.abs(y - 23.5) < 3 && Math.abs(x - 23.5) > 11)
        if (d < 24 && (tick || (d > 14.5 && d < 18.5))) put(x, y, d > 15.5 && d < 16.6 && !tick ? '#fff' : main)
        else if (d < 24.5 && (tickEdge || (d > 13.5 && d < 19.5))) put(x, y, dark)
        else if (d < 3.2) put(x, y, d < 2.2 ? '#fff' : dark)
      }
    }
  }
  return c
}

function drawTarget(t: Unit, time: number) {
  reticle ??= makeReticle()
  const [cx, cy] = center(t)
  const age = time - selTime
  const hot = hover && hover.x === t.x && hover.y === t.y
  ctx.fillStyle = `rgba(240, 50, 40, ${Math.floor(time / 200) % 2 ? 0.42 : 0.28})`
  ctx.fillRect(t.x * T, t.y * T, T, T)
  // Cae desde grande y se queda latiendo; si el ratón está encima, se cierra sobre el objetivo
  const size = age < 90 ? 96 : age < 180 ? 64 : hot ? 40 + (Math.floor(time / 110) % 2) * 4 : 48
  const frame = hot ? Math.floor(time / 110) % 2 : 0
  ctx.drawImage(reticle, frame * 48, 0, 48, 48, cx - size / 2, cy - size / 2 - 2, size, size)
  // Cuatro flechitas que empujan hacia dentro
  const push = 20 + (Math.floor(time / 160) % 3) * 2
  ctx.fillStyle = '#10141c'
  for (const [ax, ay] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
    for (let i = 0; i < 5; i++) {
      const w = 5 - i, px = cx + ax * (push - i), py = cy - 2 + ay * (push - i)
      ctx.fillStyle = i === 0 || i === 4 ? '#10141c' : '#fff'
      if (ax) ctx.fillRect(px - (ax > 0 ? 0 : 1), py - w, 1, w * 2)
      else ctx.fillRect(px - w, py - (ay > 0 ? 0 : 1), w * 2, 1)
    }
  }
}

/** Rectángulo en píxeles del dibujo de un edificio (más ancho y alto que sus casillas). */
function buildingRect(b: Building) {
  const info = BUILDING_INFO[b.type], piece = at[b.type]
  return { x: (b.x - info.door) * T + info.dx, y: (b.y + 1) * T - piece.h, w: piece.w, h: piece.h, piece }
}

function drawBuilding(b: Building, time: number) {
  const r = buildingRect(b)
  const flash = buildingFlash.get(b)
  const t = flash ? (time - flash) / 500 : 1
  const grow = t < 1 ? Math.sin(t * Math.PI) * 6 : 0
  ctx.fillStyle = 'rgba(16, 40, 32, 0.25)' // sombra en el suelo
  ctx.fillRect(r.x + 4, r.y + r.h - 3, r.w - 4, 5)
  ctx.drawImage(atlas, r.piece.x, 0, r.w, r.h, r.x - grow / 2, r.y - grow, r.w + grow, r.h + grow)

  // Felpudo de la puerta del color del dueño: ahí es donde se captura y se recluta
  const dx = b.x * T, dy = b.y * T
  const beat = 0.5 + 0.5 * Math.sin(time / 300 + b.x)
  ctx.fillStyle = b.owner < 0 ? `rgba(255, 255, 255, ${0.2 + 0.15 * beat})` : `rgba(${TEAM_RGB[b.owner].join(',')}, ${0.35 + 0.2 * beat})`
  ctx.fillRect(dx + 4, dy + T - 7, T - 8, 5)
  ctx.fillStyle = b.owner < 0 ? '#fff' : TEAM_LIGHT[b.owner]
  ctx.fillRect(dx + 4, dy + T - 7, T - 8, 1)

  if (b.owner >= 0) { // bandera en el tejado
    const fx0 = r.x + r.w - 16, top = r.y - 12
    const wave = Math.floor(time / 180 + b.x) % 3
    ctx.fillStyle = '#10141c'
    ctx.fillRect(fx0, top, 2, 20)
    ctx.fillRect(fx0 - 14, top - 1, 15, 11)
    ctx.fillStyle = TEAM_HEX[b.owner]
    ctx.fillRect(fx0 - 13, top, 13, 9)
    ctx.fillStyle = TEAM_LIGHT[b.owner]
    ctx.fillRect(fx0 - 13 + wave * 4, top, 3, 9) // el brillo recorre la tela
    ctx.fillStyle = '#10141c'
    ctx.fillRect(fx0 - 14, top + 8 + (wave === 1 ? 1 : 0), 4, 2)
  }
  if (t < 1) {
    ctx.globalAlpha = 0.8 * (1 - t)
    ctx.fillStyle = '#fff'
    ctx.fillRect(r.x, r.y, r.w, r.h)
    ctx.globalAlpha = 1
  }
  if (b.cap < CAPTURE_POINTS) {
    ctx.fillStyle = '#10141c'
    ctx.fillRect(dx + 2, dy - 2, T - 4, 6)
    ctx.fillStyle = Math.floor(time / 200) % 2 ? '#ffd84a' : '#fff0a0'
    ctx.fillRect(dx + 3, dy - 1, ((T - 6) * b.cap) / CAPTURE_POINTS, 4)
  }
}

function draw(time: number) {
  requestAnimationFrame(draw)
  const dt = Math.min(50, time - lastTime)
  lastTime = time
  if (!g) return
  const [shakeX, shakeY] = fx.update(dt)
  canvas.style.transform = shakeX || shakeY ? `translate(${shakeX * scale}px, ${shakeY * scale}px)` : ''

  ctx.imageSmoothingEnabled = false
  ctx.drawImage(terrainLayer, 0, 0)

  // Agua animada, y encima lo que sobresale (pinos, rocas)
  const wf = (Math.floor(time / 110) % WATER_FRAMES) * WATER_W
  for (const q of waterQuarters) ctx.drawImage(water, wf + q.sx, q.sy, 8, 8, q.dx, q.dy, 8, 8)
  // Flores que se mecen
  const sway = Math.floor(time / 220) % 4
  for (const f of flowerSpots) ctx.drawImage(atlas, at.flowers.x + sway * 16, f.color * 16, 16, 16, f.x, f.y, 16, 16)
  ctx.drawImage(overlayLayer, 0, 0)

  // Casillas alcanzables: se abren como una onda desde la unidad y las recorre un brillo en diagonal
  if ((mode === 'move' || mode === 'inspect') && sel) {
    const enemy = sel.team !== g.turn
    const [fill, edge] = enemy ? ['240, 70, 50', '255, 200, 180'] : ['50, 120, 255', '200, 230, 255']
    for (const k of stops) {
      const r = reach.get(k)!
      const a = clamp01((time - selTime - r.cost * 38) / 170)
      if (a <= 0) continue
      const s = Math.round((T - 2) * easeOutBack(a) / 2) * 2
      const x = r.x * T + (T - s) / 2, y = r.y * T + (T - s) / 2
      const shine = ((r.x + r.y) * 90 - time * 0.5 + 100000) % 1300 < 180
      ctx.fillStyle = `rgba(${fill}, ${shine ? 0.62 : 0.42})`
      ctx.fillRect(x, y, s, s)
      ctx.fillStyle = `rgba(${edge}, ${shine ? 0.95 : 0.6})` // bisel claro arriba e izquierda
      ctx.fillRect(x, y, s, 2)
      ctx.fillRect(x, y, 2, s)
      ctx.fillStyle = `rgba(16, 24, 60, 0.35)` // y oscuro abajo y derecha
      ctx.fillRect(x, y + s - 2, s, 2)
      ctx.fillRect(x + s - 2, y, 2, s)
    }
    if (mode === 'move' && hover && stops.has(key(hover.x, hover.y))) drawPathArrow(pathTo(reach, hover.x, hover.y), time)
  }

  // Edificios y unidades por filas, de arriba abajo: quien está detrás de un tejado queda tapado por él
  const row = (u: Unit) => (animPos.get(u.id)?.y ?? (u === sel && pending ? pending.y : u.y) * T) / T
  const things: [number, () => void][] = [
    ...g.buildings.map((b): [number, () => void] => [b.y - 0.01, () => drawBuilding(b, time)]),
    ...g.units.map((u): [number, () => void] => [row(u), () => drawUnit(u, time)]),
  ]
  things.sort((a, b) => a[0] - b[0])
  for (const [, paint] of things) paint()
  fx.draw(ctx)
  if (mode === 'target') for (const t of targets) drawTarget(t, time)

  // Sombras de nubes que cruzan el mapa despacio
  ctx.fillStyle = 'rgba(16, 40, 72, 0.09)'
  for (let i = 0; i < 4; i++) {
    const span = canvas.width + 400
    const x = ((time * 0.012 + i * 310) % span) - 200, y = ((i * 137) % canvas.height) + Math.sin(time / 9000 + i) * 20
    ctx.beginPath()
    ctx.ellipse(x, y, 110 + i * 18, 44 + i * 6, 0, 0, Math.PI * 2)
    ctx.ellipse(x + 70, y + 22, 80, 34, 0, 0, Math.PI * 2)
    ctx.fill()
  }
  // De vez en cuando cae una hoja de algún árbol
  if (forestCells.length && Math.random() < 0.02) {
    const tree = forestCells[Math.floor(Math.random() * forestCells.length)]
    mapFx.add({ img: 'leaf', fps: 7, loop: true, x: tree.x * T + rnd(4, 28), y: tree.y * T - 6, vx: rnd(-0.5, -0.15), vy: rnd(0.25, 0.5), max: rnd(1400, 2200), scale: 0.5 })
  }
  drawCursor(time)

  if (mode === 'over' && g.winner !== null && Math.random() < 0.5) {
    fx.burst(Math.random() * canvas.width, -4, { n: 2, colors: [TEAM_HEX[g.winner], TEAM_LIGHT[g.winner], '#ffd84a', '#fff'], speed: 0.8, life: 2600, gravity: 60, size: 5 })
  }
  // El dinero y el medidor suben contando
  let counting = false
  for (const t of [0, 1]) {
    for (const [shown, real] of [[shownFunds, g.funds], [shownMeter, g.meter]]) {
      if (shown[t] === real[t]) continue
      const step = (real[t] - shown[t]) * 0.15
      shown[t] = Math.abs(step) < (shown === shownFunds ? 1 : 0.02) ? real[t] : shown === shownFunds ? Math.round(shown[t] + step) : shown[t] + step
      counting = true
    }
  }
  if (counting) refreshStatus()
}

// ---------- Efectos ----------

/** Texto flotante sobre el mapa (daño, dinero, avisos). */
function label(p: Pos, text: string, cls = '', delay = 0) {
  if (AUTO) return
  setTimeout(() => {
    const el = document.createElement('div')
    el.className = 'pop ' + cls
    el.textContent = text
    el.style.left = (p.x * T + T / 2) * scale + 'px'
    el.style.top = (p.y * T + 6) * scale + 'px'
    stage.append(el)
    setTimeout(() => el.remove(), 1200)
  }, delay)
}

function dropIn(u: Unit, delay = 0) {
  setFx(u, { drop: performance.now() + delay })
  setTimeout(sfx.recruit, delay)
  setTimeout(() => {
    if (!g.units.includes(u)) return
    const [x, y] = center(u)
    for (const side of [-1, 1]) mapFx.fx('gray_smoke', x + side * 10, y + 8, { scale: 1, fps: 14, flipX: side < 0, vx: side * 0.5 })
    fx.addShake(2)
    sfx.land()
  }, delay + 320)
}

function koFx(p: Pos, team: Team) {
  const [x, y] = center(p)
  fx.burst(x, y, { n: 26, colors: ['#fff', '#d8dce8', TEAM_LIGHT[team]], speed: 2.4, life: 600, size: 6 })
  mapFx.fx('explosion', x, y, { scale: 1.5, fps: 12 })
  mapFx.fx('gray_smoke', x, y - 6, { scale: 1.5, fps: 10, delay: 120 })
  fx.addShake(7)
  label(p, 'K.O.', 'ko', 150)
  sfx.ko()
  const winner = (1 - team) as Team
  say(winner, pick(co(winner).quotes.ko), 'Happy')
  setFace(team, 'Pain', 2600)
}

function captureFx(u: Unit, b: Building, done: boolean) {
  const [x, y] = center(b)
  setFx(u, { pop: performance.now() })
  if (done) {
    buildingFlash.set(b, performance.now())
    fx.burst(x, y - 6, { n: 40, colors: [TEAM_HEX[u.team], TEAM_LIGHT[u.team], '#ffd84a', '#fff'], speed: 3, life: 1100, gravity: 90, size: 5, up: 2.5 })
    fx.addShake(4)
    label(b, b.type === 'gym' ? '¡Gimnasio tomado!' : '¡Capturado!', 't' + u.team)
    if (b.type !== 'house' || Math.random() < 0.4) say(u.team, pick(co(u.team).quotes.capture), 'Happy')
  } else label(b, `${b.cap}/${CAPTURE_POINTS}`, 'gold')
}

/** Ingresos y curas al empezar el turno. */
function turnStartFx(hpBefore: Map<number, number>) {
  let n = 0
  for (const b of g.buildings) {
    if (b.owner !== g.turn) continue
    label(b, '+1000', 'gold', n * 70)
    if (!AUTO) sfx.coin(n * 0.07)
    n++
  }
  for (const u of g.units) {
    const gained = u.hp - (hpBefore.get(u.id) ?? u.hp)
    if (gained <= 0) continue
    label(u, `+${gained} PS`, 'heal', 300)
    fx.burst(...center(u), { n: 10, colors: ['#70f088', '#d0ffd8'], speed: 1, life: 700, size: 3, up: 1.2 })
    setTimeout(sfx.heal, 300)
  }
  if (g.day > 1 && Math.random() < 0.3) say(g.turn, pick(co(g.turn).quotes.start))
  if (canUsePower(g) && !isAI[g.turn]) setTimeout(sfx.ready, 500)
}

// ---------- Comandantes ----------

function setFace(team: Team, expression: string, ms = 2200) {
  const f = faces[team]
  f.face = expression
  clearTimeout(f.timer)
  f.timer = window.setTimeout(() => { f.face = 'Normal'; refreshStatus() }, ms)
  if (g) refreshStatus()
}

let talkTimer = 0
/** El comandante suelta una frase en un bocadillo sobre el mapa. */
function say(team: Team, text: string, expression = 'Normal', delay = 0) {
  if (AUTO) return
  const game = g
  setTimeout(() => {
    if (g !== game || !sceneEl.hidden) return
    setFace(team, expression, 2600)
    talkEl.className = `t${team}`
    talkEl.innerHTML = `<img src="${facePath(g.co[team], expression)}"><div class="box"><b class="t${team}">${co(team).name}</b>${text}</div>`
    talkEl.hidden = false
    restart(talkEl, 'show')
    sfx.talk()
    clearTimeout(talkTimer)
    talkTimer = window.setTimeout(() => (talkEl.hidden = true), 2400)
  }, delay)
}

/** Espectáculo del poder sobre el mapa: cada comandante tiene el suyo. */
async function powerFx(team: Team, affected: { unit: Unit; hp: number }[]) {
  const c = co(team)
  const home = g.buildings.find((b) => b.type === 'gym' && b.owner === team) ?? affected[0]?.unit ?? { x: 0, y: 0 }
  const [hx, hy] = center(home)
  const hpLabel = (unit: Unit, hp: number, delay = 0) => { if (hp) label(unit, `${hp > 0 ? '+' : ''}${hp} PS`, hp > 0 ? 'heal' : 'dmg', delay) }
  fx.addShake(8)
  mapFx.add({ ring: 420, size: 10, color: c.color, x: hx, y: hy, max: 900 })
  mapFx.add({ ring: 420, size: 4, color: '#fff', x: hx, y: hy, max: 900, delay: 90 })

  if (g.co[team] === 'pikachu') {
    for (const { unit, hp } of affected) {
      const [x, y] = center(unit)
      for (let flick = 0; flick < 2; flick++) {
        for (let yy = y - 14; yy > -32; yy -= 30) mapFx.add({ img: 'lightning', frame: Math.floor(rnd(0, 4)), x: x + rnd(-3, 3), y: yy, max: 80, delay: flick * 100, scale: 1, fade: false, flipX: Math.random() < 0.5 })
      }
      mapFx.flashScreen('#fff8a0', 0.45, 6)
      mapFx.fx('shock', x, y - 4, { scale: 1, fps: 16 })
      mapFx.fx('sparkle_1', x, y - 8, { scale: 1, fps: 10, delay: 150 })
      fx.addShake(4)
      sfx.bigHit()
      setFx(unit, { pop: performance.now(), flash: performance.now() + 200 })
      hpLabel(unit, hp, 150)
      await sleep(170)
    }
    setTimeout(sfx.heal, 100)
  } else if (g.co[team] === 'charizard') {
    const dir = team === 0 ? 1 : -1
    const lit = new Set<Unit>()
    sfx.shoot()
    await mapFx.tween(950, (t) => {
      const front = dir > 0 ? t * (canvas.width + 60) - 30 : canvas.width + 30 - t * (canvas.width + 60)
      for (let i = 0; i < 4; i++) mapFx.add({ img: 'fire', fps: 16, loop: true, x: front + rnd(-14, 14), y: rnd(0, canvas.height), vx: dir * 1.5, vy: -0.6, max: 380, scale: 1, grow: 2 })
      for (const { unit } of affected) {
        const [x, y] = center(unit)
        if (lit.has(unit) || (x - front) * dir > 0) continue
        lit.add(unit)
        mapFx.fx('explosion', x, y - 4, { scale: 1.5, fps: 12 })
        mapFx.fx('fire_plume', x, y - 12, { scale: 1.5, fps: 10, delay: 80 })
        setFx(unit, { pop: performance.now() })
        label(unit, 'ATQ +50%', 'gold')
        fx.addShake(4)
        sfx.hit()
      }
    })
  } else if (g.co[team] === 'blastoise') {
    sfx.cast()
    for (const { unit, hp } of affected) {
      const [x, y] = center(unit)
      mapFx.add({ img: 'protect', x, y: y - 4, max: 800, scale: 0.2, grow: 4.5 })
      mapFx.add({ ring: 26, size: 4, color: '#88d0ff', x, y: y - 4, max: 500 })
      for (let i = 0; i < 6; i++) mapFx.add({ img: 'bubble', fps: 6, x: x + rnd(-12, 12), y: y + rnd(-4, 10), vy: -rnd(0.6, 1.4), max: rnd(500, 900), scale: 1, delay: i * 60 })
      setFx(unit, { pop: performance.now() })
      label(unit, 'DEF +60%', 'gold')
      hpLabel(unit, hp, 350)
      sfx.heal()
      await sleep(150)
    }
  } else if (g.co[team] === 'gengar') {
    mapFx.flashScreen('#4018a0', 0.65, 0.45)
    for (const { unit, hp } of affected) {
      const [x, y] = center(unit)
      const ball = mapFx.add({ img: 'shadow_ball', x: hx, y: hy, max: 430, scale: 1, vr: 0.3, fade: false })
      sfx.cast()
      void mapFx.tween(420, (t) => {
        ball.x = hx + (x - hx) * t
        ball.y = hy + (y - hy) * t - Math.sin(t * Math.PI) * 60
        mapFx.add({ img: 'purple_flame', fps: 14, x: ball.x, y: ball.y, max: 260, scale: 0.8 })
      }).then(() => {
        mapFx.fx('explosion', x, y - 4, { scale: 1.6, fps: 12 })
        mapFx.add({ ring: 30, size: 5, color: '#a060f0', x, y, max: 350 })
        fx.addShake(5)
        sfx.bigHit()
        if (g.units.includes(unit)) hurt(unit, 500)
        hpLabel(unit, hp)
      })
      await sleep(170)
    }
    await sleep(450)
  }
  await sleep(650)
}

/** Secuencia del súper poder: entrada a pantalla completa y efecto sobre las unidades. */
async function powerSequence() {
  const team = g.turn
  mode = 'busy'
  refreshPanel()
  if (!AUTO) {
    talkEl.hidden = true
    setFace(team, 'Determined', 6000)
    setPowerColor(g.co[team])
    sfx.power()
    const cutin = powerCutin(team, g.co[team])
    await sleep(1000) // el nombre del poder cae a golpes
    fx.addShake(12)
    await cutin
  }
  const affected = usePower(g)
  if (!AUTO) await powerFx(team, affected)
  finish()
}

// ---------- Panel lateral ----------

const typePill = (kind: string) =>
  `<span class="pill" style="background:${TYPE_COLOR[KINDS[kind].type]}">${TYPE_NAME[KINDS[kind].type]}</span>`
const MOVE_LABEL = { walk: 'a pie', fly: 'vuela', swim: 'nada', amph: 'anfibio' }
const TYPES = Object.keys(TYPE_NAME) as PType[]
const pill = (t: PType) => `<span class="pill" style="background:${TYPE_COLOR[t]}">${TYPE_NAME[t]}</span>`
const matchups = (type: PType, strong: boolean) =>
  TYPES.filter((t) => (strong ? effectiveness(type, t) > 1 : effectiveness(type, t) < 1)).map(pill).join(' ') || '—'
function statBar(name: string, value: number, max: number) {
  const n = Math.max(1, Math.round((value / max) * 8))
  return `<div class="stat"><span>${name}</span><div class="pips">${'<i class="on"></i>'.repeat(n)}${'<i></i>'.repeat(8 - n)}</div></div>`
}

function refreshStatus() {
  dayEl.innerHTML = `<small>DÍA</small><b>${g.day}</b>`
  stage.dataset.turn = String(g.turn)
  cosEl.innerHTML = [0, 1].map((t) => {
    const filled = (shownMeter[t] / POWER_COST) * 6
    const pips = Array.from({ length: 6 }, (_, i) => `<i style="--f:${g.power[t] ? 1 : clamp01(filled - i)}"></i>`).join('')
    const state = g.power[t] ? 'on' : g.meter[t] >= POWER_COST ? 'full' : ''
    return `<div class="co t${t} ${t === g.turn ? 'active' : ''} ${state}">
      <div class="pic"><img src="${facePath(g.co[t], faces[t].face)}"></div>
      <div class="body"><div class="nm">${co(t).name}<em>${isAI[t] ? 'IA' : 'TÚ'}</em></div>
        <div class="money"><i class="coin"></i>${shownFunds[t]}<small>+${income(g, t as Team)}</small></div>
        <div class="charge" title="${co(t).power}: ${co(t).powerHelp}">${pips}<b>★</b></div>
      </div></div>`
  }).join('')
}

function refreshPanel() {
  refreshStatus()
  const mine = mode === 'idle' && !isAI[g.turn]
  endBtn.disabled = mode !== 'idle' && mode !== 'inspect'
  endBtn.classList.toggle('ready', mine && !g.units.some((u) => u.team === g.turn && !u.moved))
  powerBtn.disabled = !(mine && canUsePower(g))
  powerBtn.classList.toggle('ready', !powerBtn.disabled)
  const charge = Math.floor((g.meter[g.turn] / POWER_COST) * 100)
  powerBtn.innerHTML = `<b>★ ${co(g.turn).power}</b> <kbd>P</kbd><small>${powerBtn.disabled ? (g.power[g.turn] ? 'Poder activo' : `Cargando… ${charge}%`) : co(g.turn).powerHelp}</small>`
  const idle = g.units.filter((u) => u.team === g.turn && !u.moved).length
  endBtn.innerHTML = `Fin del turno <kbd>Enter</kbd><small>${idle ? `${idle} sin mover` : 'Todos han actuado'}</small>`
  aiBtn.textContent = `Azul: ${isAI[1] ? 'IA' : 'humano'}`
  muteBtn.innerHTML = `Sonido: ${muted ? 'no' : 'sí'}`
  refreshInfo()
}

function refreshInfo() {
  if (!hover || !g) {
    infoEl.innerHTML = '<span class="muted">Pasa el ratón por el mapa para ver información.</span>'
    return
  }
  const { x, y } = hover
  const terrain = terrainAt(g, x, y), b = buildingOver(x, y), u = unitAt(g, x, y)
  let html = ''
  if (u) {
    const k = KINDS[u.kind]
    html += `<img class="mug t${u.team}" src="${facePath(k.species)}"><h3 class="t${u.team}">${k.name}</h3>${typePill(u.kind)} PS ${u.hp}/10
      ${statBar('Ataque', k.atk, 2)}${statBar('Defensa', k.def, 2)}${statBar('Movim.', moveRange(g, u), 8)}
      <div>${MOVE_LABEL[k.move]} · alcance ${k.range[0] === k.range[1] ? k.range[0] : k.range.join('-')}</div>
      <div class="muted">${[k.capture ? 'Captura edificios' : '', k.evolves ? `Evoluciona a ${KINDS[k.evolves].name} al debilitar a un rival` : '',
        isRanged(u) ? 'No puede moverse y atacar en el mismo turno' : ''].filter(Boolean).join('. ')}</div><hr>`
  }
  if (b) {
    const info = BUILDING_INFO[b.type]
    html += `<h3>${info.name}</h3><div class="${b.owner < 0 ? 'muted' : 't' + b.owner}">${b.owner < 0 ? 'Neutral' : 'Equipo ' + TEAM_NAME[b.owner]}</div>
      <div>${info.help}</div>${b.cap < CAPTURE_POINTS ? `<div>Captura: quedan ${b.cap}/${CAPTURE_POINTS}</div>` : ''}`
  } else html += `<h3>${terrain.name}</h3>`
  html += `<div class="muted">Defensa ${'★'.repeat(terrain.def)}${'☆'.repeat(4 - terrain.def)}</div>`
  infoEl.innerHTML = html
}

function showBanner(html: string, cls: string) {
  bannerEl.className = cls
  bannerEl.innerHTML = html
  bannerEl.hidden = false
}

async function turnBanner() {
  if (AUTO) return
  sfx.turn()
  await turnCard(g.day, g.turn, g.co[g.turn])
}

function finish() {
  reset()
  refreshPanel()
  if (g.winner === null) return
  const winner = g.winner
  setFace(winner, 'Happy', 1e7)
  setFace((1 - winner) as Team, 'Pain', 1e7)
  if (AUTO) return
  talkEl.hidden = true
  setTimeout(() => {
    sfx.win()
    victory(winner, g.co[winner], g.day, newGame)
  }, 900)
}

/** Pantalla para elegir comandante; el rival se elige al azar si lo lleva la IA. */
function chooseCommanders(): Promise<[string, string]> {
  const ids = Object.keys(COMMANDERS)
  if (AUTO) return Promise.resolve([pick(ids), pick(ids)])
  mode = 'select'
  return new Promise((resolve) => {
    const picks: string[] = []
    const ask = (team: number) => {
      const title = document.createElement('h2')
      title.innerHTML = `Elige comandante <span class="t${team}">del equipo ${TEAM_NAME[team]}</span>`
      const cards = ids.map((id, i) => {
        const c = COMMANDERS[id]
        const btn = document.createElement('button')
        btn.className = 'cocard'
        btn.style.setProperty('--c', c.color)
        btn.style.animationDelay = i * 70 + 'ms'
        btn.innerHTML = `<img src="${facePath(id)}"><b>${c.name}</b><i>${c.title}</i>
          <p>${c.passive}</p><p><strong>★ ${c.power}</strong><br>${c.powerHelp}</p>`
        btn.onmouseenter = () => { sfx.cursor(); btn.querySelector('img')!.src = facePath(id, 'Happy') }
        btn.onmouseleave = () => (btn.querySelector('img')!.src = facePath(id))
        btn.onclick = () => {
          sfx.confirm()
          picks.push(id)
          if (team === 0 && !isAI[1]) return ask(1)
          if (picks.length < 2) picks.push(pick(ids.filter((other) => other !== id)))
          resolve(picks as [string, string])
        }
        return btn
      })
      const row = document.createElement('div')
      row.className = 'cards'
      row.append(...cards)
      selectEl.replaceChildren(title, row)
      selectEl.hidden = false
      restart(selectEl, 'open')
    }
    ask(0)
  })
}

async function newGame() {
  hideOverlay()
  bannerEl.hidden = talkEl.hidden = true
  const cos = await chooseCommanders()
  if (AUTO) return startGame(cos)
  // Presentación: los comandantes frente a frente mientras se monta el mapa por debajo
  sfx.battle()
  const intro = versus(cos)
  await sleep(600)
  sfx.bigHit()
  startGame(cos, 1500)
  await intro
}

// ---------- Animaciones ----------

async function animateMove(u: Unit, path: Pos[]) {
  const step = AUTO ? 12 : 105
  if (path.length > 1) playAnim(u, 'Walk', 1e9)
  for (let i = 1; i < path.length; i++) {
    const start = performance.now()
    unitDir.set(u.id, dirFrom(path[i].x - path[i - 1].x, path[i].y - path[i - 1].y))
    if (!AUTO) sfx.step()
    for (;;) {
      const t = Math.min(1, (performance.now() - start) / step)
      animPos.set(u.id, {
        x: (path[i - 1].x + (path[i].x - path[i - 1].x) * t) * T,
        y: (path[i - 1].y + (path[i].y - path[i - 1].y) * t) * T,
        z: Math.sin(t * Math.PI) * 3,
      })
      if (t >= 1) break
      await nextFrame()
    }
    if (!AUTO && KINDS[u.kind].move !== 'fly') {
      const ground = g.tiles[path[i].y][path[i].x], px = path[i].x * T + 16, py = path[i].y * T
      if (ground === '"') for (const ox of [-8, 8]) mapFx.fx('tall_grass', px + ox, py + 22, { scale: 1, fps: 12 })
      else if (ground === '~' || ground === 's') mapFx.fx('ripple', px, py + 24, { scale: 1, fps: 9 })
      else mapFx.fx('ground_impact_dust', px, py + 28, { scale: 1, fps: 12 })
    }
  }
  unitAnim.delete(u.id)
}

/** Los dos se encaran en el mapa y el atacante da un respingo antes de cortar a la escena de combate. */
async function engage(att: Unit, def: Unit) {
  if (AUTO) return
  face(att, def)
  face(def, att)
  setFx(att, { pop: performance.now() })
  const [x, y] = center(def)
  mapFx.add({ ring: 22, size: 3, color: '#fff', x, y, max: 260 })
  setFx(def, { flash: performance.now() + 200 })
  sfx.lunge()
  restart(stage, 'blink')
  await sleep(330)
}

/** Edificio que ocupa esa casilla, sea la puerta o el resto del dibujo. */
const buildingOver = (x: number, y: number) => g.buildings.find((b) => footprint(b).some((c) => c.x === x && c.y === y))

const placeOf = (p: Pos): Place => {
  const b = buildingAt(g, p.x, p.y)
  return { terrain: g.tiles[p.y][p.x], building: b && { type: b.type, owner: b.owner } }
}

/** Resuelve el ataque y lo enseña como escena de combate; al volver, el mapa refleja el resultado. */
async function battle(att: Unit, def: Unit) {
  const a = { kind: att.kind, hp: att.hp, team: att.team, x: att.x, y: att.y, place: placeOf(att) }
  const d = { kind: def.kind, hp: def.hp, team: def.team, x: def.x, y: def.y, place: placeOf(def) }
  await engage(att, def)
  const res = attack(g, att, def)
  if (AUTO) return
  talkEl.hidden = true
  await playBattle({
    a, d, dmg: res.dmg, counter: res.counter,
    evolved: res.evolved ? (res.evolved === att ? 'a' : 'd') : null, evolvedKind: res.evolved?.kind ?? '',
  })

  label(d, `-${res.dmg}`, 'dmg')
  if (g.units.includes(def)) hurt(def)
  else koFx(d, d.team)
  if (res.counter !== null) {
    label(a, `-${res.counter}`, 'dmg', 120)
    if (g.units.includes(att)) hurt(att)
    else koFx(a, a.team)
  }
  if (res.evolved) {
    setFx(res.evolved, { pop: performance.now() })
    const [x, y] = center(res.evolved)
    for (let i = 0; i < 12; i++) mapFx.add({ img: 'gold_stars', x, y, vx: Math.cos(i) * 2, vy: Math.sin(i) * 2, drag: 0.94, max: 700, scale: 1 })
    label(res.evolved, '¡Evolución!', 'gold', 250)
  }
  fx.addShake(4)
  await sleep(350)
}

/** Captura con su escena; devuelve si el edificio cambia de dueño. */
async function doCapture(u: Unit, b: Building) {
  const before = b.cap, owner = b.owner
  const done = capture(g, u)
  if (AUTO) return done
  talkEl.hidden = true
  await playCapture({
    kind: u.kind, team: u.team, building: { type: b.type, owner },
    capBefore: before, capAfter: done ? 0 : b.cap, done, total: CAPTURE_POINTS,
  })
  captureFx(u, b, done)
  return done
}

// ---------- Turno del jugador ----------

function select(u: Unit) {
  sel = u
  selTime = performance.now()
  reach = reachable(g, u)
  stops = new Set(stoppable(g, u, reach).map((r) => key(r.x, r.y)))
  mode = u.team === g.turn && !u.moved && !isAI[g.turn] ? 'move' : 'inspect'
  setFx(u, { pop: selTime })
  unitDir.set(u.id, DIR.down)
  sfx.select()
}

function placeNear(el: HTMLElement, p: Pos) {
  el.hidden = false
  const right = p.x < g.w - 5
  el.style.left = right ? (p.x + 1) * T * scale + 6 + 'px' : ''
  el.style.right = right ? '' : (g.w - p.x) * T * scale + 6 + 'px'
  el.style.top = Math.min(p.y * T * scale, canvas.height * scale - el.offsetHeight - 8) + 'px'
}

const ICON: Record<string, [string, string]> = { Atacar: ['⚔', 'atk'], Capturar: ['⚑', 'cap'], Esperar: ['✔', 'ok'], Cancelar: ['✖', 'no'] }

function openMenu() {
  mode = 'menu'
  forecastEl.hidden = true
  const u = sel!, at = pending!
  targets = targetsFrom(g, u, at)
  const items: [string, () => void][] = []
  if (targets.length) items.push(['Atacar', () => { mode = 'target'; selTime = performance.now(); menuEl.hidden = true; sfx.confirm() }])
  if (canCapture(g, u, at)) {
    items.push(['Capturar', async () => {
      mode = 'busy'
      menuEl.hidden = true
      pending = null
      moveUnit(g, u, at.x, at.y)
      await doCapture(u, buildingAt(g, at.x, at.y)!)
      finish()
    }])
  }
  items.push(['Esperar', () => { moveUnit(g, u, at.x, at.y); u.moved = true; sfx.confirm(); finish() }])
  items.push(['Cancelar', cancel])
  menuEl.replaceChildren(...items.map(([text, fn], i) => {
    const btn = document.createElement('button')
    btn.innerHTML = `<i class="ic ${ICON[text][1]}">${ICON[text][0]}</i>${text}`
    btn.style.animationDelay = i * 40 + 'ms'
    btn.onmouseenter = btn.onfocus = sfx.cursor
    btn.onclick = fn
    return btn
  }))
  placeNear(menuEl, at)
  restart(menuEl, 'open')
  menuEl.querySelector('button')!.focus()
}

/** Tienda del Centro Pokémon: lista a la izquierda y ficha animada del Pokémon a la derecha. */
function openRecruit(b: Building) {
  mode = 'recruit'
  sfx.select()
  recruitEl.innerHTML = `<h3>Centro Pokémon <span>${g.funds[g.turn]}₽</span></h3>
    <div class="list"></div>
    <div class="detail"><canvas width="96" height="72"></canvas><div class="text"></div></div>`
  const text = recruitEl.querySelector<HTMLElement>('.text')!
  const preview = recruitEl.querySelector('canvas')!.getContext('2d')!
  let shown = ''
  const show = (kind: string) => {
    if (shown === kind) return
    shown = kind
    const k = KINDS[kind]
    const tags = [MOVE_LABEL[k.move], k.capture ? 'captura edificios' : '', k.range[1] > 1 ? `ataca a distancia (${k.range.join('-')})` : '',
      k.evolves ? `evoluciona a ${KINDS[k.evolves].name}` : ''].filter(Boolean).join(' · ')
    text.innerHTML = `<h4>${k.name} ${pill(k.type)}</h4>
      ${statBar('Ataque', k.atk, 2)}${statBar('Defensa', k.def, 2)}${statBar('Movim.', k.mv, 8)}
      <p>${tags}</p><p>Fuerte contra ${matchups(k.type, true)}</p><p>Flojo contra ${matchups(k.type, false)}</p>`
    restart(text, 'swap')
  }
  const rows = RECRUITABLE.map((kind, i) => {
    const k = KINDS[kind]
    const btn = document.createElement('button')
    btn.disabled = !canRecruit(g, b, kind)
    btn.style.animationDelay = i * 18 + 'ms'
    btn.innerHTML = `<img class="mug" src="${facePath(k.species)}"><b>${k.name}</b><span>${k.cost}₽</span>`
    btn.onmouseenter = btn.onfocus = () => { if (shown !== kind) sfx.cursor(); show(kind) }
    btn.onclick = () => { dropIn(recruit(g, b, kind)); finish() }
    return btn
  })
  recruitEl.querySelector('.list')!.append(...rows)
  recruitEl.hidden = false
  restart(recruitEl, 'open')
  show(RECRUITABLE[0])
  rows.find((r) => !r.disabled)?.focus()
  const loop = (time: number) => {
    if (recruitEl.hidden || !shown) return
    preview.imageSmoothingEnabled = false
    preview.clearRect(0, 0, 96, 72)
    preview.fillStyle = 'rgba(40, 48, 60, 0.18)'
    preview.beginPath()
    preview.ellipse(48, 56, 26, 8, 0, 0, Math.PI * 2)
    preview.fill()
    drawSprite(preview, KINDS[shown].species, 'Walk', (Math.floor(time / 900) * 2) % 8, time, 48, 38, { sx: 2, sy: 2 })
    requestAnimationFrame(loop)
  }
  requestAnimationFrame(loop)
}

function cancel() {
  if (mode === 'busy' || mode === 'over' || mode === 'select') return
  if (mode !== 'idle') sfx.cancel()
  if (mode === 'target') return openMenu()
  if (sel) unitDir.delete(sel.id)
  reset()
}

async function click(p: Pos) {
  if (mode === 'busy' || mode === 'over' || mode === 'menu' || mode === 'select') return
  if (mode === 'recruit') return cancel()
  if (mode === 'inspect') reset()
  const u = unitAt(g, p.x, p.y)
  if (mode === 'idle') {
    const b = buildingOver(p.x, p.y)
    if (u) select(u)
    else if (b && b.type === 'center' && b.owner === g.turn && !unitAt(g, b.x, b.y)) openRecruit(b)
  } else if (mode === 'move') {
    if (!stops.has(key(p.x, p.y))) return cancel()
    const unit = sel!
    mode = 'busy'
    await animateMove(unit, pathTo(reach, p.x, p.y))
    pending = p
    animPos.delete(unit.id)
    openMenu()
  } else if (mode === 'target') {
    if (!u || !targets.includes(u)) return cancel()
    const unit = sel!
    mode = 'busy'
    forecastEl.hidden = true
    refreshPanel()
    moveUnit(g, unit, pending!.x, pending!.y)
    pending = null
    await battle(unit, u)
    finish()
  }
}

function showForecast() {
  const t = hover && mode === 'target' ? targets.find((u) => u.x === hover!.x && u.y === hover!.y) : undefined
  if (!t) return void (forecastEl.hidden = true)
  const here = { ...sel!, ...pending! }
  const dmg = damage(g, here, t)
  const eff = effectiveness(KINDS[here.kind].type, KINDS[t.kind].type)
  const back = dmg < t.hp && canCounter(here, t) ? damage(g, { ...t, hp: t.hp - dmg }, here) : null
  forecastEl.innerHTML = `<div class="row"><b class="out">−${dmg}</b><span>${KINDS[t.kind].name}${dmg >= t.hp ? ' · <em>¡K.O.!</em>' : ''}</span></div>
    ${back !== null ? `<div class="row"><b class="in">−${back}</b><span>contraataque</span></div>` : ''}
    ${eff !== 1 ? `<div class="eff ${eff > 1 ? 'good' : 'bad'}">${eff > 1 ? '▲ Súper eficaz' : '▼ Poco eficaz'}</div>` : ''}`
  placeNear(forecastEl, t)
}

async function nextTurn() {
  reset()
  mode = 'busy'
  const hpBefore = new Map(g.units.map((u) => [u.id, u.hp]))
  endTurn(g)
  for (const u of g.units) unitDir.delete(u.id)
  refreshPanel()
  await turnBanner()
  turnStartFx(hpBefore)
  if (isAI[g.turn]) return runAI()
  finish()
}

function finishTurn() {
  if (mode !== 'idle' && mode !== 'inspect') return
  sfx.confirm()
  nextTurn()
}

function firePower() {
  if (mode !== 'idle' || isAI[g.turn] || !canUsePower(g)) return
  powerSequence()
}

// ---------- Turno de la IA ----------

async function runAI() {
  mode = 'busy'
  refreshPanel()
  await sleep(500)
  if (canUsePower(g)) {
    await powerSequence()
    mode = 'busy'
    refreshPanel()
  }
  for (const u of g.units.filter((u) => u.team === g.turn)) {
    if (g.winner !== null) break
    if (!g.units.includes(u)) continue
    const plan = planUnit(g, u)
    await animateMove(u, pathTo(reachable(g, u), plan.to.x, plan.to.y))
    moveUnit(g, u, plan.to.x, plan.to.y)
    animPos.delete(u.id)
    if (plan.action === 'attack') await battle(u, plan.target!)
    else {
      if (plan.action === 'capture') {
        await doCapture(u, buildingAt(g, u.x, u.y)!)
        await sleep(300)
      }
      u.moved = true
      await sleep(140)
    }
    refreshStatus()
  }
  for (const b of g.buildings) {
    if (g.winner !== null || b.type !== 'center' || b.owner !== g.turn) continue
    const kind = planRecruit(g, b)
    if (!kind) continue
    const u = recruit(g, b, kind)
    if (!AUTO) dropIn(u)
    await sleep(380)
  }
  if (g.winner !== null) return finish()
  await nextTurn()
}

// ---------- Entrada ----------

function tileFromEvent(e: MouseEvent): Pos {
  const r = canvas.getBoundingClientRect()
  return {
    x: Math.max(0, Math.min(g.w - 1, Math.floor(((e.clientX - r.left) / r.width) * g.w))),
    y: Math.max(0, Math.min(g.h - 1, Math.floor(((e.clientY - r.top) / r.height) * g.h))),
  }
}
canvas.addEventListener('mousemove', (e) => {
  if (!g) return
  const p = tileFromEvent(e)
  if (hover && hover.x === p.x && hover.y === p.y) return
  if (!hover) (cursor.x = p.x * T), (cursor.y = p.y * T)
  hover = p
  if (mode === 'move' || mode === 'target') sfx.cursor()
  refreshInfo()
  showForecast()
})
canvas.addEventListener('click', (e) => g && click(tileFromEvent(e)))
stage.addEventListener('contextmenu', (e) => { e.preventDefault(); if (g) cancel() })
addEventListener('keydown', (e) => {
  if (!g) return
  if (e.key.startsWith('Arrow') && (mode === 'menu' || mode === 'recruit' || mode === 'select')) {
    const host = mode === 'menu' ? menuEl : mode === 'recruit' ? recruitEl : selectEl
    const buttons = [...host.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')]
    const step = e.key === 'ArrowDown' || e.key === 'ArrowRight' ? 1 : -1
    const at = buttons.indexOf(document.activeElement as HTMLButtonElement)
    buttons[(at + step + buttons.length) % buttons.length]?.focus()
    e.preventDefault()
    return
  }
  if (e.key === 'Escape') cancel()
  if (e.key === 'Enter' && !(document.activeElement instanceof HTMLButtonElement)) finishTurn()
  if (e.key === 'p') firePower()
  if (e.key === 'm') muteBtn.click()
})
addEventListener('resize', resize)
endBtn.onclick = finishTurn
powerBtn.onclick = firePower
aiBtn.onclick = () => {
  isAI[1] = !isAI[1]
  if (!g) return void (aiBtn.textContent = `Azul: ${isAI[1] ? 'IA' : 'humano'}`)
  refreshPanel()
  if (isAI[g.turn] && mode === 'idle') runAI()
}
muteBtn.onclick = () => { toggleMute(); muteBtn.innerHTML = `Sonido: ${muted ? 'no' : 'sí'}`; sfx.confirm() }
$('#new').onclick = () => { if (mode !== 'busy') newGame() }

async function boot() {
  const [atlasImg, waterImg, atlasMeta, names] = await Promise.all([
    loadImage('/assets/map/atlas.png'), loadImage('/assets/map/water.png'),
    fetch('/assets/map/atlas.json').then((r) => r.json()),
    fetch('/assets/species.json').then((r) => r.json()), loadUnits(), loadFx(),
  ])
  species = names
  atlas = atlasImg
  at = atlasMeta
  water = waterImg
  canvas.width = MAP[0].length * T
  canvas.height = MAP.length * T
  mapFx = new Scene(mapFxCanvas, canvas.width, canvas.height)
  mapFx.start()
  initCutscenes(sceneEl, atlas, at, water)
  resize()
  aiBtn.textContent = 'Azul: IA'
  powerBtn.textContent = '★ Poder del comandante'
  powerBtn.disabled = endBtn.disabled = true
  muteBtn.innerHTML = `Sonido: ${muted ? 'no' : 'sí'}`
  requestAnimationFrame(draw)
  // Para trastear desde la consola y para tools/film.mjs: lanzar escenas sueltas
  Object.assign(window, {
    game: () => g,
    lab: {
      battle: playBattle,
      capture: playCapture,
      power: (id: string) => { g.co[g.turn] = id; g.meter[g.turn] = 99; firePower() },
      win: (team: Team) => { g.winner = team; finish() },
    },
  })
  newGame()
}
boot()
