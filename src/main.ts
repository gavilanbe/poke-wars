// Pintado, entrada y flujo de la partida.
import { planRecruit, planUnit } from './ai'
import {
  ATTACK_NAME, BUILDING_INFO, CAPTURE_POINTS, MAPS, COMMANDERS, KINDS, MAX_UNITS, POWER_COST, PType, ROLES, TYPE_COLOR, TYPE_NAME, bestMove, moveMult, passiveText, rosterOf,
  effectiveness,
} from './data'
import * as fx from './fx'
import {
  Building, Game, Pos, Reach, Team, Unit, attack, buildingAt, canCapture, canCounter, canRecruit, canUsePower,
  capture, createGame, damage, endTurn, income, isRanged, key, moveRange, moveUnit, pathTo, reachable, recruit,
  PHASES, STATUS_NAME, Status, WEATHER_NAME, canSee, flankers, footprint, freezable, freeze, isRecovery, phaseOf, recruitCost, resolvePath,
  BERRY_HEAL, COIN_VALUE, catchable, weatherBonus, wildAt, stoppable, targetsFrom, terrainAt, unitAt, usePower, visibleCells,
  BELT_MAX, EVOLVE_HEAL, KO_XP, XP_LEVEL, canEvolve, edgeOver, evolve, release, releaseSpot, xpGoal,
} from './game'
import { Place, XpGain, initCutscenes, playBattle, playCapture, playCatch, playEvolve, sceneKey, setSceneLight } from './cutscenes'
import { Scene, loadFx, rnd } from './scene'
import { loadAudio, music, muted, sfx, toggleMute } from './sfx'
import { goalStatus } from './campaign'
import { finished as storyFinished, frame as storyFrame, story, turnStart as storyTurnStart } from './story'
import { Lesson, tutorial } from './tutorial'
import { initPwa } from './pwa'
import { buzz, initMobile, isTouch, onTouchChange, setTouch } from './mobile'
import { cover, fitOverlays, hideOverlay, powerCutin, setPowerColor, turnCard, uncover, versus, victory } from './ui'
import { Anim, DIR, animDuration, dirFrom, drawSprite, facePath, loadSpecies, loadSpeciesList, loadUnits } from './units'

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
initMobile() // antes de medir nada: en un móvil cambia el tamaño al que se pinta la página
const menuEl = $('#menu'), forecastEl = $('#forecast'), recruitEl = $('#recruit')
const sceneEl = $('#scene'), bannerEl = $('#banner'), talkEl = $('#talk'), cutinEl = $('#cutin'), selectEl = $('#select')
const dayEl = $('#clock'), cosEl = $('#cos'), infoEl = $('#info')
const endBtn = $<HTMLButtonElement>('#end'), aiBtn = $<HTMLButtonElement>('#ai'), muteBtn = $<HTMLButtonElement>('#mute')
const powerBtn = $<HTMLButtonElement>('#power'), fogBtn = $<HTMLButtonElement>('#fog')

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
let grayAtlas: HTMLCanvasElement // lo mismo en gris, para los edificios sin dueño
let at: Record<string, { x: number; w: number; h: number }> = {}
let water: HTMLImageElement
let forestCells: Pos[] = []
let terrainLayer: HTMLCanvasElement
let mapFx: Scene // efectos con sprites por encima del mapa

/**
 * Recolorea una pieza de interfaz cambiando el tono de verdad (en HSL), no con filtros: `hue` en grados, o null
 * para dejarla gris. El borde rojo de las piezas «seleccionadas» pasa a dorado.
 */
function recolor(img: HTMLImageElement, hue: number | null): string {
  const [c, cx] = makeCanvas(img.width, img.height)
  cx.drawImage(img, 0, 0)
  const data = cx.getImageData(0, 0, c.width, c.height)
  const d = data.data
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i] / 255, g = d[i + 1] / 255, b = d[i + 2] / 255
    const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2
    const delta = max - min
    let sat = delta === 0 ? 0 : delta / (1 - Math.abs(2 * l - 1))
    let h = 0
    if (delta) h = max === r ? ((g - b) / delta) % 6 : max === g ? (b - r) / delta + 2 : (r - g) / delta + 4
    h = (h * 60 + 360) % 360
    const border = sat > 0.5 && (h < 20 || h > 340) // el marco rojo de selección
    const target = border ? 46 : hue
    if (target === null) sat = 0
    const q = (1 - Math.abs(2 * l - 1)) * sat, hp = (target ?? 0) / 60, x = q * (1 - Math.abs((hp % 2) - 1)), m = l - q / 2
    const [r1, g1, b1] = hp < 1 ? [q, x, 0] : hp < 2 ? [x, q, 0] : hp < 3 ? [0, q, x] : hp < 4 ? [0, x, q] : hp < 5 ? [x, 0, q] : [q, 0, x]
    d[i] = (r1 + m) * 255
    d[i + 1] = (g1 + m) * 255
    d[i + 2] = (b1 + m) * 255
  }
  cx.putImageData(data, 0, 0)
  return `url(${c.toDataURL()})`
}

/** Prepara las piezas del HUD en los colores de cada equipo y las deja como variables de CSS. */
async function setupHud() {
  const [round, roundSel, rect, button] = await Promise.all(
    ['panel_round', 'panel_round_sel', 'panel_rect', 'button'].map((n) => loadImage(`assets/ui/${n}.png`)))
  const RED = 4, BLUE = 216
  const vars: Record<string, string> = {
    '--cop0': recolor(round, RED), '--cop0s': recolor(roundSel, RED), '--cop1': recolor(round, BLUE), '--cop1s': recolor(roundSel, BLUE),
    '--info0': recolor(rect, RED), '--info1': recolor(rect, BLUE), '--infoN': recolor(rect, null),
    '--btn-end': recolor(button, 132), '--btn-power': recolor(button, 40), '--btn-off': recolor(button, null),
  }
  for (const [name, value] of Object.entries(vars)) stage.style.setProperty(name, value)
}

// De noche se encienden las ventanas de los edificios con dueño: se localizan por el color del cristal en cada pieza
const GLASS: Record<string, number[][]> = { house: [[127, 160, 250]], center: [[123, 210, 230], [151, 229, 233]], gym: [[88, 104, 176], [104, 128, 192]] }
let windowGlow: HTMLCanvasElement // el atlas con solo los cristales, en amarillo cálido
function makeWindows(img: HTMLImageElement) {
  const [c, cx] = makeCanvas(img.width, img.height)
  cx.drawImage(img, 0, 0)
  const data = cx.getImageData(0, 0, c.width, c.height), d = data.data
  for (const [name, colors] of Object.entries(GLASS)) {
    const piece = at[name]
    for (let y = 0; y < piece.h; y++) for (let x = piece.x; x < piece.x + piece.w; x++) {
      const i = (y * c.width + x) * 4
      if (colors.some(([r, g2, b]) => d[i] === r && d[i + 1] === g2 && d[i + 2] === b)) d[i + 3] = 254 // marca: cristal
    }
  }
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] === 254) { d[i] = 255; d[i + 1] = 216; d[i + 2] = 112; d[i + 3] = 255 } else d[i + 3] = 0
  }
  cx.putImageData(data, 0, 0)
  return c
}

/** Copia en gris (algo aclarada) de una imagen: los edificios que aún no son de nadie. */
function makeGray(img: HTMLImageElement) {
  const [c, cx] = makeCanvas(img.width, img.height)
  cx.drawImage(img, 0, 0)
  const data = cx.getImageData(0, 0, c.width, c.height)
  const d = data.data
  for (let i = 0; i < d.length; i += 4) {
    const lum = 0.3 * d[i] + 0.59 * d[i + 1] + 0.11 * d[i + 2]
    for (let k = 0; k < 3; k++) d[i + k] = Math.min(255, (d[i + k] * 0.12 + lum * 0.88) * 0.92 + 26)
  }
  cx.putImageData(data, 0, 0)
  return c
}

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
  const isWater = (x: number, y: number) => '~si'.includes(cell(x, y) ?? '~')
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
      if (ch === 'i') { // placa de hielo sobre el agua
        ox.fillStyle = 'rgba(214, 240, 255, 0.86)'
        ox.fillRect(x * T + 1, y * T + 1, T - 2, T - 2)
        ox.fillStyle = '#ffffff'
        for (const [a, b, w] of [[5, 7, 9], [16, 13, 11], [8, 22, 7], [20, 25, 6]]) ox.fillRect(x * T + a, y * T + b, w, 2)
        ox.fillStyle = 'rgba(88, 152, 216, 0.5)'
        ox.fillRect(x * T + 1, y * T + T - 4, T - 2, 3)
      }
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
let threat = new Set<number>() // casillas que el Pokémon elegido puede atacar este turno (moviéndose, si es de cuerpo a cuerpo)
let danger: Set<number> | null = null // zona de peligro (tecla R): todo lo que los rivales a la vista pueden atacar en su turno
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
let weatherShown = 'clear'
let mapChoice = Number(localStorage.getItem('pokewars-map') ?? 0) % MAPS.length
let zoom = Number(localStorage.getItem('pokewars-zoom') ?? 0) // pasos de medio punto sobre la escala automática
let paintedVersion = 0, paintedGame: Game | null = null
let fogOn = true
const dayLight = [255, 255, 255, 0] // tinte actual del día (se acerca poco a poco al de la fase)

// Cámara: el mapa es más grande que la pantalla. `cam` es la esquina visible en píxeles del mundo.
const cam = { x: 0, y: 0, tx: 0, ty: 0 }
const mouse = { x: -1, y: -1, inside: false } // posición en la pantalla del mapa, de 0 a 1
const keysDown = new Set<string>()
const worldW = () => g.w * T, worldH = () => g.h * T
function panTo(x: number, y: number, snap = false) {
  if (viewFit) return // en el mapa del mundo la cámara no se mueve
  // Si la ventana es mayor que el mundo, se centra
  cam.tx = worldW() <= canvas.width ? (worldW() - canvas.width) / 2 : Math.max(0, Math.min(worldW() - canvas.width, x - canvas.width / 2))
  cam.ty = worldH() <= canvas.height ? (worldH() - canvas.height) / 2 : Math.max(0, Math.min(worldH() - canvas.height, y - canvas.height / 2))
  if (snap) (cam.x = cam.tx), (cam.y = cam.ty)
}
/** Lleva la cámara a una casilla si queda cerca del borde o fuera de pantalla. */
function follow(p: Pos, margin = 3) {
  const x = p.x * T + T / 2, y = p.y * T + T / 2, m = margin * T
  if (x < cam.tx + m || x > cam.tx + canvas.width - m || y < cam.ty + m || y > cam.ty + canvas.height - m) panTo(x, y)
}

// Niebla de guerra: se enseña lo que ve el jugador humano (o el que tiene el turno si juegan dos)
const viewer = (): Team | null => (!g.fog || (isAI[0] && isAI[1]) ? null : isAI[1] ? 0 : isAI[0] ? 1 : g.turn)
let sight = new Set<number>()
const shown = (u: Unit) => { const v = viewer(); return v === null || canSee(g, v, u, sight) }
const unitShownAt = (x: number, y: number) => { const u = unitAt(g, x, y); return u && shown(u) ? u : undefined }

/** Pone la música y el ambiente que tocan ahora: turno propio o rival, noche, lluvia. */
function themeNow() {
  if (AUTO || !g || g.winner !== null) return
  music.play('co_' + g.co[g.turn]) // cada comandante tiene su tema, como en Advance Wars
  music.ambience(g.weather === 'rain' ? 'rain' : phaseOf(g) === 3 ? 'night' : 'day')
}

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

/** El mapa ocupa toda la ventana: se elige la escala y el lienzo coge los píxeles que quepan. */
/** En el mapa del mundo de la historia: el rectángulo de la ventana en el que tiene que caber el mapa entero. */
let viewFit: { x: number; y: number; w: number; h: number } | null = null
function resize() {
  scale = Math.max(1.5, Math.min(4, Math.round((innerWidth / 640) * 2) / 2 + zoom * 0.5))
  if (viewFit && g) { // se aleja hasta que cabe entero (en pasos de cuarto de punto mientras se pueda, para que el píxel no baile)
    const fit = Math.min(viewFit.w / worldW(), viewFit.h / worldH())
    scale = fit >= 1 ? Math.floor(fit * 4) / 4 : fit
  }
  canvas.width = Math.ceil(innerWidth / scale)
  canvas.height = Math.ceil(innerHeight / scale)
  mapFx?.resize(canvas.width, canvas.height)
  for (const c of [canvas, mapFxCanvas]) {
    c.style.width = canvas.width * scale + 'px'
    c.style.height = canvas.height * scale + 'px'
  }
  fitOverlays(innerHeight)
  if (viewFit && g) { // el mapa, centrado en su rectángulo y quieto
    cam.x = cam.tx = -(viewFit.x + (viewFit.w - worldW() * scale) / 2) / scale
    cam.y = cam.ty = -(viewFit.y + (viewFit.h - worldH() * scale) / 2) / scale
  } else if (g) panTo(cam.tx + canvas.width / 2, cam.ty + canvas.height / 2, true)
}

/** Un Pokémon y lo que puede llegar a ser: sus hojas se piden juntas para que la evolución no aparezca a medias. */
const line = (kind: string): string[] => { const out: string[] = []; for (let k: string | undefined = kind; k && KINDS[k]; k = KINDS[k].evolves) out.push(KINDS[k].species); return out }
/** Las especies que hacen falta para jugar esa partida: los dos equipos enteros, lo que haya en el campo y los salvajes. */
const speciesOf = (game: Game) => [...game.co.flatMap((c) => rosterOf(c)), ...game.units.map((u) => u.kind), ...game.wild.map((w) => w.kind), ...game.belt.flat().map((b) => b.kind)].flatMap(line)

const SAVE_KEY = 'pokewars-save'
/** Guarda la partida (siempre en un momento en que le toca mover a una persona). */
function saveGame() {
  if (AUTO || titleOn || tutorial.isOpen) return
  try { localStorage.setItem(SAVE_KEY, JSON.stringify({ g, isAI, fogOn })) } catch { /* sin sitio: se juega sin guardar */ }
}
function loadSave(): { g: Game; isAI: [boolean, boolean]; fogOn: boolean } | null {
  try {
    const saved = JSON.parse(localStorage.getItem(SAVE_KEY) ?? 'null')
    if (saved?.g) saved.g.belt ??= [[], []] // partidas guardadas antes de que hubiera cinturón
    return saved && saved.g.items && saved.g.units.every((u: Unit) => KINDS[u.kind]) ? saved : null // por si cambian los equipos entre versiones
  } catch { return null }
}

function startGame(cos: [string, string], intro = 0, saved?: Game) {
  titleOn = false
  stage.classList.remove('titling')
  g = saved ?? createGame(cos, fogOn, mapChoice)
  void loadSpeciesList(speciesOf(g))
  terrainLayer = makeTerrainLayer(g)
  fx.clear()
  for (const m of [unitFx, unitDir, unitAnim, animPos]) m.clear()
  shownMeter[0] = shownMeter[1] = 0
  bannerEl.hidden = sceneEl.hidden = talkEl.hidden = selectEl.hidden = true
  reset()
  refreshPanel()
  const home = g.buildings.find((b) => b.type === 'gym' && b.owner === (viewer() ?? 0)) ?? g.units.find((u) => u.team === (viewer() ?? 0)) ?? { x: 0, y: 0 }
  panTo(home.x * T, home.y * T, true)
  if (!AUTO && !saved) {
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
  threat = new Set()
  if (danger) danger = dangerZone()
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
  // Los que aún pueden actuar miran hacia el cursor si lo tienen cerca
  const near = !moving && hover && u.team === g.turn && !u.moved && (hover.x !== u.x || hover.y !== u.y) && Math.abs(hover.x - u.x) + Math.abs(hover.y - u.y) <= 4
  drawSprite(ctx, spriteOf(u), name, unitDir.get(u.id) ?? (near ? dirFrom(hover!.x - u.x, hover!.y - u.y) : u.team === 0 ? DIR.right : DIR.left),
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

  if (!moving && (isRanged(u) || KINDS[u.kind].heals)) { // insignia: ataca a distancia (diana) o es de apoyo (cruz)
    const bx = x + 22, by = y + 1
    ctx.fillStyle = '#10141c'
    ctx.fillRect(bx, by, 9, 9)
    ctx.fillStyle = KINDS[u.kind].heals ? '#58e070' : '#ffd84a'
    if (KINDS[u.kind].heals) { ctx.fillRect(bx + 3, by + 1, 3, 7); ctx.fillRect(bx + 1, by + 3, 7, 3) }
    else { ctx.fillRect(bx + 1, by + 1, 7, 7); ctx.fillStyle = '#10141c'; ctx.fillRect(bx + 2, by + 2, 5, 5); ctx.fillStyle = '#ffd84a'; ctx.fillRect(bx + 3, by + 3, 3, 3) }
  }
  if (u.status && !moving) { // chapa del estado
    ctx.fillStyle = '#10141c'
    ctx.fillRect(x + 1, y + 1, 9, 9)
    ctx.fillStyle = STATUS_COLOR[u.status]
    ctx.fillRect(x + 2, y + 2, 7, 7)
    if (u.status === 'sleep' && Math.random() < 0.03) label(u, 'z', 'heal')
  }
  if (u.tag && !moving) { // en campaña: el mensajero lleva una estrella y el jefe, una corona
    const bob = Math.round(Math.sin(time / 220) * 2), mx = x + 16, my = y - 12 + bob
    ctx.fillStyle = '#10141c'
    ctx.fillRect(mx - 7, my - 1, 14, 11)
    ctx.fillStyle = u.tag === 'boss' ? '#ff5a48' : '#ffd84a'
    if (u.tag === 'boss') { ctx.fillRect(mx - 5, my + 5, 10, 3); for (const px of [-5, -1, 3]) ctx.fillRect(mx + px, my + 1, 2, 4) }
    else { ctx.fillRect(mx - 1, my + 1, 2, 7); ctx.fillRect(mx - 5, my + 3, 10, 2); ctx.fillRect(mx - 3, my + 5, 6, 2) }
  }
  if (!moving && canEvolve(u) && u.team === g.turn) { // listo para evolucionar: flecha dorada que bota y destellos
    const bob = Math.round(Math.sin(time / 180 + u.id) * 2), ax = x + T / 2, ay = y - 9 + bob
    ctx.fillStyle = '#10141c'
    ctx.fillRect(ax - 6, ay + 3, 12, 5); ctx.fillRect(ax - 4, ay + 1, 8, 3); ctx.fillRect(ax - 2, ay - 1, 4, 3); ctx.fillRect(ax - 3, ay + 7, 6, 5)
    ctx.fillStyle = Math.floor(time / 220) % 2 ? '#ffd84a' : '#fff'
    ctx.fillRect(ax - 5, ay + 4, 10, 3); ctx.fillRect(ax - 3, ay + 2, 6, 2); ctx.fillRect(ax - 1, ay, 2, 2); ctx.fillRect(ax - 2, ay + 7, 4, 4)
  }
  for (let i = 1; i < u.level && !moving; i++) { // galones de nivel
    ctx.fillStyle = '#10141c'
    ctx.fillRect(x + T - 2 - i * 6, y + 1, 6, 5)
    ctx.fillStyle = '#ffd84a'
    ctx.fillRect(x + T - 1 - i * 6, y + 2, 4, 3)
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
  if (!arrowLayers.length || arrowLayers[0][0].width !== worldW()) {
    arrowLayers = [0, 1, 2].map(() => makeCanvas(worldW(), worldH())) // del tamaño del mundo, no de la pantalla
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
  if (!hover || mode === 'select' || (mode === 'busy' && !isAI[g.turn])) return // en el turno rival, el cursor es el suyo
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
  ctx.drawImage(b.owner < 0 ? grayAtlas : atlas, r.piece.x, 0, r.w, r.h, r.x - grow / 2, r.y - grow, r.w + grow, r.h + grow)

  // Felpudo de la puerta del color del dueño: ahí es donde se captura y se recluta
  const dx = b.x * T, dy = b.y * T
  const beat = 0.5 + 0.5 * Math.sin(time / 300 + b.x)
  ctx.fillStyle = b.owner < 0 ? `rgba(255, 255, 255, ${0.2 + 0.15 * beat})` : `rgba(${TEAM_RGB[b.owner].join(',')}, ${0.35 + 0.2 * beat})`
  ctx.fillRect(dx + 4, dy + T - 7, T - 8, 5)
  ctx.fillStyle = b.owner < 0 ? '#fff' : TEAM_LIGHT[b.owner]
  ctx.fillRect(dx + 4, dy + T - 7, T - 8, 1)

  if (b.type === 'house' && b.owner >= 0) { // en las casas habitadas sale humo de la chimenea
    for (let i = 0; i < 3; i++) {
      const p = (time / 2800 + i / 3 + b.x * 0.37) % 1, size = 3 + p * 5
      ctx.fillStyle = `rgba(232, 236, 244, ${(1 - p) * 0.55})`
      ctx.fillRect(Math.round(r.x + 56 + Math.sin(p * 5 + b.x) * 3 + p * 7 - size / 2), Math.round(r.y + 2 - p * 26 - size / 2), Math.round(size), Math.round(size))
    }
  }
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

  // Cámara: bordes de la pantalla o WASD (las flechas mueven el cursor); sigue suave a su objetivo
  if (mode !== 'select' && mode !== 'recruit' && sceneEl.hidden) {
    const edge = 0.045, speed = dt * 0.55
    const dx = (keysDown.has('a') || (mouse.inside && mouse.x < edge) ? -1 : 0) + (keysDown.has('d') || (mouse.inside && mouse.x > 1 - edge) ? 1 : 0)
    const dy = (keysDown.has('w') || (mouse.inside && mouse.y < edge) ? -1 : 0) + (keysDown.has('s') || (mouse.inside && mouse.y > 1 - edge) ? 1 : 0)
    if ((dx || dy) && mode !== 'menu') panTo(cam.tx + canvas.width / 2 + dx * speed, cam.ty + canvas.height / 2 + dy * speed)
    if (fling.vx || fling.vy) { // el mapa sigue deslizándose un poco después de soltarlo
      panTo(cam.tx + canvas.width / 2 + fling.vx * dt, cam.ty + canvas.height / 2 + fling.vy * dt, true)
      const keep = Math.pow(0.994, dt)
      fling.vx *= keep; fling.vy *= keep
      if (Math.hypot(fling.vx, fling.vy) < 0.02) fling.vx = fling.vy = 0
    }
  }
  storyFrame(time, dt)
  if (titleOn) {
    g.day = 1 + (Math.floor(time / 9000) % 4) // amanece, anochece…
    panTo(worldW() / 2 + Math.cos(time / 11000) * (worldW() / 2 - canvas.width / 2), worldH() / 2 + Math.sin(time / 7000) * (worldH() / 2 - canvas.height / 2))
  }
  cam.x += (cam.tx - cam.x) * Math.min(1, dt * 0.012)
  cam.y += (cam.ty - cam.y) * Math.min(1, dt * 0.012)
  if (Math.abs(cam.tx - cam.x) < 0.5) cam.x = cam.tx
  if (Math.abs(cam.ty - cam.y) < 0.5) cam.y = cam.ty
  const cx0 = Math.round(cam.x), cy0 = Math.round(cam.y)
  mapFx.camera.x = cx0
  mapFx.camera.y = cy0
  const who = viewer()
  if (who !== null) sight = visibleCells(g, who)
  if (g.terrainVersion !== paintedVersion || paintedGame !== g) { // bosque quemado o río congelado: se repinta
    paintedVersion = g.terrainVersion
    paintedGame = g
    terrainLayer = makeTerrainLayer(g)
  }

  ctx.imageSmoothingEnabled = false
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.fillStyle = '#10141c'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.setTransform(1, 0, 0, 1, -cx0, -cy0)
  ctx.drawImage(terrainLayer, 0, 0)

  // Agua animada, y encima lo que sobresale (pinos, rocas)
  const wf = (Math.floor(time / 110) % WATER_FRAMES) * WATER_W
  for (const q of waterQuarters) {
    if (q.dx < cx0 - 8 || q.dy < cy0 - 8 || q.dx > cx0 + canvas.width || q.dy > cy0 + canvas.height) continue
    ctx.drawImage(water, wf + q.sx, q.sy, 8, 8, q.dx, q.dy, 8, 8)
  }
  // Flores que se mecen
  const sway = Math.floor(time / 220) % 4
  for (const f of flowerSpots) ctx.drawImage(atlas, at.flowers.x + sway * 16, f.color * 16, 16, 16, f.x, f.y, 16, 16)
  ctx.drawImage(overlayLayer, 0, 0)
  // Objetos: una baya o una moneda (los iconos de los juegos) que flotan sobre su sombra y sueltan un destello
  for (const it of g.items) {
    if (who !== null && !sight.has(key(it.x, it.y))) continue
    const bx = it.x * T + 16, by = it.y * T + 15 + Math.round(Math.sin(time / 300 + it.x) * 2)
    ctx.fillStyle = 'rgba(16, 40, 24, 0.3)'
    ctx.fillRect(bx - 6, it.y * T + 26, 12, 3)
    ctx.drawImage(ITEM_IMG[it.type], bx - 15, by - 17)
    if (Math.floor(time / 500 + it.x) % 4 === 0) { ctx.fillStyle = '#fff'; ctx.fillRect(bx + 5, by - 8, 2, 2) }
  }
  // Hierba que se agita: ahí se esconde un Pokémon salvaje
  for (const w of g.wild) {
    void loadSpecies(KINDS[w.kind].species) // por si luego se atrapa: que su hoja ya esté
    if (who !== null && !sight.has(key(w.x, w.y))) continue
    // De cerca se le ve asomar entre la hierba: así se sabe quién es antes de ir a por él
    if (knownWild(w)) drawSprite(ctx, KINDS[w.kind].species, 'Idle', DIR.down, time, w.x * T + 16, w.y * T + 13, { alpha: 0.92 })
    const jig = Math.floor(time / 130 + w.x) % 6
    const dx = jig === 0 ? -1 : jig === 2 ? 1 : 0
    for (const [ox, oy] of [[0, 0], [16, 0], [0, 16], [16, 16]]) ctx.drawImage(atlas, at.tall.x, 0, 16, 16, w.x * T + ox + dx, w.y * T + oy - (jig < 3 ? 1 : 0), 16, 16)
    if (Math.random() < 0.03) mapFx.fx('tall_grass', w.x * T + 16 + rnd(-6, 6), w.y * T + 16, { scale: 1, fps: 12 })
    if (w.weak && Math.floor(time / 300) % 2) { // debilitado: listo para atraparlo
      ctx.fillStyle = '#10141c'; ctx.fillRect(w.x * T + 12, w.y * T - 2, 8, 12)
      ctx.fillStyle = '#ffd84a'; ctx.fillRect(w.x * T + 14, w.y * T, 4, 5); ctx.fillRect(w.x * T + 14, w.y * T + 6, 4, 2)
    }
  }

  // Zona de peligro (R): rayado rojo fijo sobre todo lo que los rivales pueden atacar en su turno
  if (danger && mode !== 'busy') {
    ctx.fillStyle = 'rgba(232, 60, 48, 0.27)'
    for (const k of danger) ctx.fillRect((k % 100) * T, Math.floor(k / 100) * T, T, T)
    ctx.fillStyle = 'rgba(255, 90, 72, 0.6)'
    for (const k of danger) {
      const x = (k % 100) * T, y = Math.floor(k / 100) * T
      for (let i = 0; i < T; i += 8) for (let j = 0; j < 4; j++) ctx.fillRect(x + ((i + j * 2) % T), y + T - 2 - j * 8 - ((i / 8) % 4) * 2, 2, 2)
      if (!danger.has(k - 100)) ctx.fillRect(x, y, T, 2)
      if (!danger.has(k + 100)) ctx.fillRect(x, y + T - 2, T, 2)
      if (!danger.has(k - 1) || x === 0) ctx.fillRect(x, y, 2, T)
      if (!danger.has(k + 1) || x === (g.w - 1) * T) ctx.fillRect(x + T - 2, y, 2, T)
    }
  }
  // Alcance de ataque del elegido: en rojo, las casillas a las que puede pegar y a las que no llega andando
  if ((mode === 'move' || mode === 'inspect') && sel && threat.size) {
    const pulse = 0.5 + 0.5 * Math.sin(time / 260)
    for (const k of threat) {
      const tx = k % 100, ty = Math.floor(k / 100)
      const a = clamp01((time - selTime - (Math.abs(tx - sel.x) + Math.abs(ty - sel.y)) * 38) / 170)
      if (a <= 0) continue
      const x = tx * T, y = ty * T, inside = stops.has(k)
      if (!inside) { // fuera de donde llega: casilla roja entera
        ctx.fillStyle = `rgba(232, 60, 48, ${(0.42 + 0.1 * pulse) * a})`
        ctx.fillRect(x + 1, y + 1, T - 2, T - 2)
      }
      ctx.fillStyle = `rgba(255, 140, 120, ${(inside ? 0.5 : 0.9) * a})` // el borde solo donde acaba el alcance
      if (!threat.has(k - 100)) ctx.fillRect(x, y, T, 2)
      if (!threat.has(k + 100)) ctx.fillRect(x, y + T - 2, T, 2)
      if (!threat.has(k - 1) || tx === 0) ctx.fillRect(x, y, 2, T)
      if (!threat.has(k + 1) || tx === g.w - 1) ctx.fillRect(x + T - 2, y, 2, T)
    }
  }
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
    if (mode === 'move' && hover && stops.has(key(hover.x, hover.y))) {
      drawPathArrow(pathTo(reach, hover.x, hover.y), time)
      // Desde el destino señalado: las casillas a las que pegaría desde ahí, marcadas con esquinas
      const [min, max] = KINDS[sel.kind].range
      if (!KINDS[sel.kind].heals && (!isRanged(sel) || (hover.x === sel.x && hover.y === sel.y))) {
        ctx.fillStyle = Math.floor(time / 200) % 2 ? '#fff' : '#ff5a48'
        for (let dy = -max; dy <= max; dy++) for (let dx = -max; dx <= max; dx++) {
          const d = Math.abs(dx) + Math.abs(dy), x = (hover.x + dx) * T, y = (hover.y + dy) * T
          if (d < min || d > max) continue
          for (const [cx, cy] of [[x + 3, y + 3], [x + T - 9, y + 3], [x + 3, y + T - 9], [x + T - 9, y + T - 9]]) ctx.fillRect(cx, cy, 6, 6)
        }
      }
    }
  }

  // Edificios y unidades por filas, de arriba abajo: quien está detrás de un tejado queda tapado por él
  const row = (u: Unit) => (animPos.get(u.id)?.y ?? (u === sel && pending ? pending.y : u.y) * T) / T
  const things: [number, () => void][] = [
    ...g.buildings.map((b): [number, () => void] => [b.y - 0.01, () => drawBuilding(b, time)]),
    ...g.units.filter(shown).map((u): [number, () => void] => [row(u), () => drawUnit(u, time)]),
  ]
  things.sort((a, b) => a[0] - b[0])
  for (const [, paint] of things) paint()
  fx.draw(ctx)
  const goal = g.rules?.goal
  if (goal && (goal.type === 'capture' || goal.type === 'reach') && g.winner === null) { // en campaña: la casilla o el edificio objetivo
    const gx = goal.x * T, gy = goal.y * T, pulse = (time / 900) % 1, hop = Math.round(Math.abs(Math.sin(time / 260)) * 5)
    ctx.strokeStyle = `rgba(255, 216, 74, ${1 - pulse})`
    ctx.lineWidth = 2
    ctx.strokeRect(gx - pulse * 8, gy - pulse * 8, T + pulse * 16, T + pulse * 16)
    ctx.fillStyle = '#10141c'
    ctx.fillRect(gx + 9, gy - 22 - hop, 14, 12); ctx.fillRect(gx + 12, gy - 10 - hop, 8, 4); ctx.fillRect(gx + 14, gy - 6 - hop, 4, 3)
    ctx.fillStyle = '#ffd84a'
    ctx.fillRect(gx + 11, gy - 20 - hop, 10, 9); ctx.fillRect(gx + 13, gy - 11 - hop, 6, 3); ctx.fillRect(gx + 15, gy - 8 - hop, 2, 3)
  }
  if (mode === 'target') for (const t of targets) drawTarget(t, time)
  if (aiShow?.path) drawPathArrow(aiShow.path, time) // la IA anuncia su jugada
  if (aiShow?.target && g.units.includes(aiShow.target)) drawTarget(aiShow.target, time)

  // Niebla de guerra: se oscurece lo que no alcanza a ver tu equipo, con el borde deshilachado
  if (who !== null) {
    const x0 = Math.floor(cx0 / T), y0 = Math.floor(cy0 / T)
    for (let y = y0; y <= Math.min(g.h - 1, y0 + Math.ceil(canvas.height / T)); y++) {
      for (let x = x0; x <= Math.min(g.w - 1, x0 + Math.ceil(canvas.width / T)); x++) {
        if (sight.has(key(x, y))) continue
        ctx.fillStyle = 'rgba(12, 18, 40, 0.5)'
        ctx.fillRect(x * T, y * T, T, T)
        // puntitos claros que flotan, para que la niebla no sea un bloque plano
        ctx.fillStyle = 'rgba(200, 215, 255, 0.10)'
        const drift = Math.floor(time / 400 + x * 3 + y * 7) % 4
        ctx.fillRect(x * T + 4 + drift * 6, y * T + 6 + ((x + y) % 3) * 8, 6, 2)
        ctx.fillRect(x * T + 20 - drift * 4, y * T + 22 - ((x * y) % 3) * 6, 4, 2)
      }
    }
  }

  // Luz según el momento del día (cambia poco a poco) y tiempo: lluvia o sol abrasador
  const light = [[255, 214, 150, 0.1], [255, 255, 255, 0], [255, 120, 50, 0.17], [16, 26, 96, 0.4]][phaseOf(g)]
  for (let i = 0; i < 4; i++) dayLight[i] += (light[i] - dayLight[i]) * Math.min(1, dt * 0.002)
  ctx.fillStyle = `rgba(${dayLight[0] | 0}, ${dayLight[1] | 0}, ${dayLight[2] | 0}, ${dayLight[3]})`
  ctx.fillRect(cx0, cy0, canvas.width, canvas.height)
  const dusk = clamp01((dayLight[3] - 0.14) / 0.2) // al atardecer se van encendiendo las ventanas de los edificios con dueño
  if (dusk > 0) {
    for (const b of g.buildings) {
      if (b.owner < 0 || !GLASS[b.type]) continue
      const r = buildingRect(b)
      ctx.globalAlpha = dusk * (0.86 + 0.14 * Math.sin(time / 300 + b.x * 2.1)) // tiemblan un poco, como una lámpara
      ctx.drawImage(windowGlow, r.piece.x, 0, r.w, r.h, r.x, r.y, r.w, r.h)
      ctx.globalCompositeOperation = 'lighter'
      ctx.globalAlpha *= 0.35
      ctx.drawImage(windowGlow, r.piece.x, 0, r.w, r.h, r.x - 1, r.y - 1, r.w + 2, r.h + 2) // halo
      ctx.globalCompositeOperation = 'source-over'
    }
    ctx.globalAlpha = 1
  }
  if (g.weather === 'rain') {
    ctx.fillStyle = 'rgba(20, 40, 80, 0.16)'
    ctx.fillRect(cx0, cy0, canvas.width, canvas.height)
    ctx.fillStyle = 'rgba(200, 225, 255, 0.55)'
    for (let i = 0; i < 90; i++) { // gotas en diagonal que caen a saltos
      const x = (i * 97 + Math.floor(time / 40) * 9 * ((i % 3) + 2)) % (canvas.width + 60), y = (i * 53 + Math.floor(time / 40) * 17 * ((i % 3) + 2)) % (canvas.height + 40)
      ctx.fillRect(cx0 + canvas.width - x, cy0 + y - 20, 1, 5)
      ctx.fillRect(cx0 + canvas.width - x - 1, cy0 + y - 15, 1, 4)
    }
    if (Math.random() < 0.3) mapFx.add({ img: 'ripple', fps: 10, x: cx0 + Math.random() * canvas.width, y: cy0 + Math.random() * canvas.height, max: 500, scale: 1 })
  } else if (g.weather === 'sun') {
    ctx.fillStyle = 'rgba(255, 230, 140, 0.1)'
    ctx.fillRect(cx0, cy0, canvas.width, canvas.height)
    for (let i = 0; i < 5; i++) { // rayos de sol que barren despacio
      const x = cx0 + ((i * 190 + time * 0.01) % (canvas.width + 300)) - 150
      ctx.fillStyle = `rgba(255, 244, 190, ${0.07 + 0.03 * Math.sin(time / 900 + i)})`
      ctx.beginPath()
      ctx.moveTo(x, cy0)
      ctx.lineTo(x + 46, cy0)
      ctx.lineTo(x - 90, cy0 + canvas.height)
      ctx.lineTo(x - 150, cy0 + canvas.height)
      ctx.fill()
    }
  }

  // Sombras de nubes que cruzan el mapa despacio
  ctx.fillStyle = 'rgba(16, 40, 72, 0.09)'
  for (let i = 0; i < 6; i++) {
    const span = worldW() + 400
    const x = ((time * 0.012 + i * 310) % span) - 200, y = ((i * 137) % worldH()) + Math.sin(time / 9000 + i) * 20
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
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  if (Math.floor(time / 120) !== Math.floor((time - dt) / 120)) { drawMinimap(); refreshHints() }

  if (mode === 'over' && g.winner !== null && Math.random() < 0.5) {
    fx.burst(cam.x + Math.random() * canvas.width, cam.y - 4, { n: 2, colors: [TEAM_HEX[g.winner], TEAM_LIGHT[g.winner], '#ffd84a', '#fff'], speed: 0.8, life: 2600, gravity: 60, size: 5 })
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

/** Mueve y enseña lo que pase en la casilla: objeto recogido, salvaje debilitado, atrapado o escapado. */
function moveCatch(game: Game, u: Unit, x: number, y: number, outcome?: boolean) {
  const ev = moveUnit(game, u, x, y, outcome)
  if (!ev || titleOn || !shown(u)) return
  const at = { x, y }
  if (ev.item === 'coin') { label(at, `+${COIN_VALUE}₽`, 'gold'); sfx.coin(); sfx.coin(0.08) }
  if (ev.item === 'berry') {
    label(at, `+${BERRY_HEAL} PS`, 'heal')
    fx.burst(x * T + 16, y * T + 16, { n: 10, colors: ['#70f088', '#d0ffd8'], speed: 1, life: 700, size: 3, up: 1.2 })
    sfx.heal()
  }
  if (ev.wild === 'weak') { label(at, '¡Salvaje debilitado!', 'gold'); fx.addShake(3); sfx.hit() }
  if (ev.wild === 'escaped' && outcome === undefined) { label(at, '¡Se ha escapado de la Ball!', 'dmg'); sfx.error() }
  if (ev.wild === 'broke') { label(at, 'Sin dinero para una Ball', 'dmg'); sfx.error() }
  if (ev.stored) { // atrapado en el minijuego: la Ball va al cinturón, a la espera de que la suelten
    const [cx, cy] = center(u)
    for (let i = 0; i < 10; i++) mapFx.add({ img: 'gold_stars', x: cx, y: cy, vx: Math.cos(i) * 2.2, vy: Math.sin(i) * 2.2 - 1, drag: 0.94, max: 700, scale: 1 })
    label(u, `¡${KINDS[ev.stored].name} en el cinturón!`, 'gold')
    sfx.ball()
    refreshStatus()
  }
  const caught = ev.caught
  if (!caught) return
  // La Poké Ball cae sobre la hierba, se menea y se abre
  const ball = document.createElement('i')
  ball.className = 'ballfx'
  ball.style.left = (caught.x * T + T / 2 - cam.x) * scale + 'px'
  ball.style.top = (caught.y * T + T / 2 - cam.y) * scale + 'px'
  stage.append(ball)
  setTimeout(() => ball.remove(), 1000)
  sfx.ball()
  dropIn(caught, 900)
  setTimeout(() => {
    const [cx, cy] = center(caught)
    for (let i = 0; i < 10; i++) mapFx.add({ img: 'gold_stars', x: cx, y: cy, vx: Math.cos(i) * 2.2, vy: Math.sin(i) * 2.2 - 1, drag: 0.94, max: 700, scale: 1 })
    sfx.caught()
  }, 900)
  label(caught, `¡${KINDS[caught.kind].name} salvaje atrapado!`, 'gold', 950)
}

const STATUS_COLOR: Record<Status, string> = { burn: '#f0803c', poison: '#a040a0', para: '#f8d030', sleep: '#a8b4cc', freeze: '#7ccfd8' }

// ---------- Minimapa ----------

const miniEl = $<HTMLCanvasElement>('#minimap')
const ITEM_IMG = { berry: new Image(), coin: new Image() }
ITEM_IMG.berry.src = 'assets/ui/item_berry.png'
ITEM_IMG.coin.src = 'assets/ui/item_coin.png'
const MINI_COLOR: Record<string, string> = { '.': '#8fd880', '"': '#4aa860', T: '#2c7c50', M: '#8a7060', '~': '#3878d8', s: '#9ab0c0', '=': '#e0d0a0', i: '#d6f0ff' }
function drawMinimap() {
  const k = 6
  if (miniEl.width !== g.w * k) { miniEl.width = g.w * k; miniEl.height = g.h * k }
  const mx = miniEl.getContext('2d')!
  const who = viewer()
  for (let y = 0; y < g.h; y++) {
    for (let x = 0; x < g.w; x++) {
      mx.fillStyle = MINI_COLOR[g.tiles[y][x]] ?? '#8fd880'
      mx.fillRect(x * k, y * k, k, k)
    }
  }
  for (const b of g.buildings) {
    mx.fillStyle = '#10141c'
    for (const c of footprint(b)) mx.fillRect(c.x * k, c.y * k, k, k)
    mx.fillStyle = b.owner < 0 ? '#c8ccd4' : TEAM_HEX[b.owner]
    for (const c of footprint(b)) mx.fillRect(c.x * k + 1, c.y * k + 1, k - 1, k - 1)
  }
  if (who !== null) {
    mx.fillStyle = 'rgba(12, 18, 40, 0.5)'
    for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) if (!sight.has(key(x, y))) mx.fillRect(x * k, y * k, k, k)
  }
  for (const u of g.units) {
    if (!shown(u)) continue
    mx.fillStyle = '#fff'
    mx.fillRect(u.x * k, u.y * k, k, k)
    mx.fillStyle = TEAM_HEX[u.team]
    mx.fillRect(u.x * k + 1, u.y * k + 1, k - 2, k - 2)
  }
  mx.strokeStyle = '#fff'
  mx.lineWidth = 2
  mx.strokeRect((cam.x / T) * k + 1, (cam.y / T) * k + 1, (canvas.width / T) * k - 2, (canvas.height / T) * k - 2)
}
const miniPan = (e: PointerEvent) => {
  if (!g || !(e.buttons & 1)) return
  fling.vx = fling.vy = 0
  const r = miniEl.getBoundingClientRect()
  panTo(((e.clientX - r.left) / r.width) * worldW(), ((e.clientY - r.top) / r.height) * worldH())
}
miniEl.addEventListener('pointerdown', (e) => { miniEl.setPointerCapture(e.pointerId); miniPan(e) })
miniEl.addEventListener('pointermove', miniPan)

// ---------- Efectos ----------

/** Texto flotante sobre el mapa (daño, dinero, avisos). */
function label(p: Pos, text: string, cls = '', delay = 0) {
  if (AUTO) return
  setTimeout(() => {
    const el = document.createElement('div')
    el.className = 'pop ' + cls
    el.textContent = text
    el.style.left = (p.x * T + T / 2 - cam.x) * scale + 'px'
    el.style.top = (p.y * T + 6 - cam.y) * scale + 'px'
    stage.append(el)
    setTimeout(() => el.remove(), 1200)
  }, delay)
}

function dropIn(u: Unit, delay = 0) {
  setFx(u, { drop: performance.now() + delay })
  setTimeout(() => { sfx.recruit(); if (g.units.includes(u)) sfx.cry(spriteOf(u), 1, 0.4) }, delay)
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
    if (gained < 0 && shown(u)) { // quemadura o veneno
      label(u, `${gained} PS`, 'dmg', 300)
      hurt(u, 300)
    }
    if (u.team === g.turn && u.moved && u.status && shown(u)) label(u, STATUS_NAME[u.status], 'heal', 500)
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

let talkTimer = 0, talkTyping = 0
/** El comandante suelta una frase en un bocadillo sobre el mapa. */
function say(team: Team, text: string, expression = 'Normal', delay = 0) {
  if (AUTO) return
  const game = g
  setTimeout(() => {
    if (g !== game || !sceneEl.hidden) return
    setFace(team, expression, 2600)
    talkEl.className = `t${team}`
    talkEl.innerHTML = `<img src="${facePath(g.co[team], expression)}"><div class="box"><b class="t${team}">${co(team).name}</b><span></span></div>`
    const line = talkEl.querySelector('span')!
    let n = 0
    clearInterval(talkTyping)
    talkTyping = window.setInterval(() => {
      line.textContent = text.slice(0, ++n)
      if (n % 4 === 1) sfx.cursor()
      if (n >= text.length) clearInterval(talkTyping)
    }, 26)
    talkEl.hidden = false
    restart(talkEl, 'show')
    sfx.talk()
    clearTimeout(talkTimer)
    talkTimer = window.setTimeout(() => (talkEl.hidden = true), 1500 + text.length * 40)
  }, delay)
}

/** Espectáculo del poder sobre el mapa: cada comandante tiene el suyo. */
async function powerFx(team: Team, affected: { unit: Unit; hp: number }[]) {
  const c = co(team)
  const home = g.buildings.find((b) => b.type === 'gym' && b.owner === team) ?? affected[0]?.unit ?? { x: 0, y: 0 }
  const [hx, hy] = center(home)
  const hpLabel = (unit: Unit, hp: number, delay = 0) => { if (hp) label(unit, `${hp > 0 ? '+' : ''}${hp} PS`, hp > 0 ? 'heal' : 'dmg', delay) }
  fx.addShake(8)
  panTo(hx, hy)
  mapFx.add({ ring: 700, size: 10, color: c.color, x: hx, y: hy, max: 1100 })
  mapFx.add({ ring: 700, size: 4, color: '#fff', x: hx, y: hy, max: 1100, delay: 90 })

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
      const front = dir > 0 ? t * (worldW() + 60) - 30 : worldW() + 30 - t * (worldW() + 60)
      for (let i = 0; i < 4; i++) mapFx.add({ img: 'fire', fps: 16, loop: true, x: front + rnd(-14, 14), y: rnd(0, worldH()), vx: dir * 1.5, vy: -0.6, max: 380, scale: 1, grow: 2 })
      for (const { unit } of affected) {
        const [x, y] = center(unit)
        if (lit.has(unit) || (x - front) * dir > 0) continue
        lit.add(unit)
        mapFx.fx('explosion', x, y - 4, { scale: 1.5, fps: 12 })
        mapFx.fx('fire_plume', x, y - 12, { scale: 1.5, fps: 10, delay: 80 })
        setFx(unit, { pop: performance.now() })
        label(unit, `ATQ +${Math.round((c.atk[1] - 1) * 100)}%`, 'gold')
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
  } else if (g.co[team] === 'venusaur') {
    // Rayo Solar: el mapa se ilumina y una columna de luz baja sobre cada aliado, con hojas y brotes
    mapFx.flashScreen('#fff6b0', 0.6, 0.7)
    sfx.cast()
    for (const { unit, hp } of affected) {
      const [x, y] = center(unit)
      for (let yy = y - 6; yy > y - 260; yy -= 9) { // columna de luz que cae
        mapFx.add({ x: x + rnd(-2, 2), y: yy, max: 420, delay: (y - yy) * 0.25, size: 12, colors: ['#ffffff', '#fff6b0', '#ffe070'], add: true })
      }
      mapFx.add({ ring: 26, size: 5, color: '#fff6b0', x, y, max: 500, delay: 80 })
      mapFx.fx('sparkle_1', x, y - 8, { scale: 1, fps: 10, delay: 120 })
      for (let i = 0; i < 7; i++) {
        const ang = (i / 7) * Math.PI * 2
        mapFx.add({ img: 'leaf', fps: 16, loop: true, x, y, vx: Math.cos(ang) * 2.2, vy: Math.sin(ang) * 2.2 - 1, g: 0.06, drag: 0.96, max: 900, scale: 1, delay: 140 })
      }
      setFx(unit, { pop: performance.now() + 140 })
      hpLabel(unit, hp, 180)
      label(unit, 'ATQ +30%', 'gold', 520)
      sfx.heal()
      await sleep(130)
    }
  } else if (g.co[team] === 'tyranitar') {
    // Tormenta Arena: un muro de arena barre el mapa; golpea a los rivales y endurece a los suyos
    const dir = team === 0 ? 1 : -1
    const allies = g.units.filter((u) => u.team === team)
    const passed = new Set<Unit>()
    mapFx.flashScreen('#b89858', 0.55, 0.45)
    sfx.shoot()
    await mapFx.tween(1100, (t) => {
      const front = dir > 0 ? t * (worldW() + 80) - 40 : worldW() + 40 - t * (worldW() + 80)
      for (let i = 0; i < 7; i++) {
        mapFx.add({ x: front + rnd(-26, 26), y: rnd(0, worldH()), vx: dir * rnd(3, 6), vy: rnd(-0.6, 0.6), max: rnd(260, 480), size: rnd(3, 7), colors: ['#f0dca0', '#c8a860', '#8a6c38'] })
      }
      if (Math.random() < 0.5) mapFx.add({ img: 'gray_smoke', fps: 10, x: front, y: rnd(0, worldH()), vx: dir * 2, max: 500, scale: 1.5 })
      fx.addShake(2)
      for (const unit of [...affected.map((a) => a.unit), ...allies]) {
        const [x, y] = center(unit)
        if (passed.has(unit) || (x - front) * dir > 0) continue
        passed.add(unit)
        if (unit.team === team) { // los suyos se cubren de roca
          mapFx.add({ ring: 24, size: 6, color: '#c8a860', x, y, max: 500 })
          setFx(unit, { pop: performance.now() })
          label(unit, 'DEF +40%', 'gold')
        } else {
          mapFx.fx('hit', x, y, { scale: 1.2, fps: 20 })
          for (let i = 0; i < 5; i++) mapFx.add({ img: 'rocks', frame: 3 + (i % 3), x, y, vx: rnd(-2, 2) + dir * 2, vy: rnd(-3, -1), g: 0.25, vr: 0.3, max: 600, scale: 1 })
          if (g.units.includes(unit)) hurt(unit, 450)
          hpLabel(unit, affected.find((a) => a.unit === unit)!.hp)
          sfx.hit()
        }
      }
    })
  } else if (g.co[team] === 'gardevoir') {
    // Paz Mental: ondas rosas salen del gimnasio; cada aliado queda envuelto en anillos y levita
    mapFx.flashScreen('#f8a8c8', 0.5, 0.6)
    for (let i = 0; i < 4; i++) mapFx.add({ ring: 260 + i * 90, size: 6 - i, color: i % 2 ? '#ffd8e8' : '#f85888', x: hx, y: hy, max: 1200, delay: i * 140 })
    sfx.cast()
    await sleep(350)
    for (const { unit, hp } of affected) {
      const [x, y] = center(unit)
      for (let i = 0; i < 3; i++) mapFx.add({ ring: 14 + i * 9, size: 3, color: i % 2 ? '#ffffff' : '#f85888', x, y: y - 4, vy: -0.5, max: 700, delay: i * 90 })
      for (let i = 0; i < 5; i++) {
        const ang = (i / 5) * Math.PI * 2
        mapFx.fx('eye_sparkle', x + Math.cos(ang) * 16, y - 6 + Math.sin(ang) * 12, { scale: 1, fps: 10, delay: 100 + i * 60, vy: -0.4 })
      }
      setFx(unit, { pop: performance.now() })
      hpLabel(unit, hp)
      label(unit, 'MOV +2', 'gold', 400)
      sfx.heal()
      await sleep(110)
    }
  } else if (g.co[team] === 'lucario') {
    // Aura Esfera: una esfera azul sale del gimnasio hacia cada aliado y estalla en llamas de aura
    const AURA = ['#ffffff', '#a8d8ff', '#3c8cf0', '#1848b0']
    mapFx.flashScreen('#3c8cf0', 0.45, 0.6)
    for (const { unit } of affected) {
      const [x, y] = center(unit)
      const orb = mapFx.add({ x: hx, y: hy, max: 420, size: 9, color: '#a8d8ff', add: true, fade: false })
      sfx.cast()
      void mapFx.tween(400, (t) => {
        orb.x = hx + (x - hx) * t
        orb.y = hy + (y - hy) * t - Math.sin(t * Math.PI) * 46
        mapFx.add({ x: orb.x, y: orb.y, max: 260, size: 6, colors: AURA, add: true })
        mapFx.add({ ring: 7, size: 2, color: '#ffffff', x: orb.x, y: orb.y, max: 160 })
      }).then(() => {
        mapFx.add({ ring: 34, size: 6, color: '#3c8cf0', x, y, max: 450 })
        mapFx.add({ ring: 22, size: 3, color: '#ffffff', x, y, max: 380, delay: 60 })
        for (let i = 0; i < 16; i++) mapFx.add({ x: x + rnd(-9, 9), y: y + rnd(-2, 10), vy: -rnd(1, 2.6), vx: rnd(-0.3, 0.3), max: rnd(450, 800), size: rnd(3, 6), colors: AURA, add: true })
        mapFx.fx('blue_star', x, y - 6, { scale: 1, fps: 14 })
        setFx(unit, { pop: performance.now() })
        label(unit, 'ATQ +50%', 'gold')
        fx.addShake(3)
        sfx.hit()
      })
      await sleep(150)
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
    music.play('power')
    sfx.power()
    setTimeout(() => sfx.cry(g.co[team], 1, 0.8), 350)
    const cutin = powerCutin(team, g.co[team])
    await sleep(1000) // el nombre del poder cae a golpes
    fx.addShake(12)
    await cutin
  }
  const affected = usePower(g)
  if (!AUTO) { await powerFx(team, affected); themeNow() }
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

let lastTurnShown = -1
const goalEl = $('#goal')
function refreshStatus() {
  const turnKey = g.day * 2 + g.turn
  const phase = phaseOf(g)
  dayEl.innerHTML = `<i class="pb"></i><small>DÍA</small><b>${g.day}</b><span class="sky p${phase} w-${g.weather}" title="${g.weather === 'sun' ? 'Fuego +20%, Agua −20%' : g.weather === 'rain' ? 'Agua +20%, Fuego −20%, se ve una casilla menos' : ''}${phase === 3 ? ' De noche se ve una casilla menos' : ''}"><i></i>${PHASES[phase]}${g.weather !== 'clear' ? ' · ' + WEATHER_NAME[g.weather] : ''}</span><span class="turn t${g.turn}">${isAI[g.turn] ? 'Turno rival' : 'Tu turno'}</span>`
  if (turnKey !== lastTurnShown) { lastTurnShown = turnKey; restart(dayEl, 'tick') }
  const goalText = goalStatus(g) // en campaña, el objetivo y cómo va
  goalEl.hidden = !goalText
  if (goalText && goalEl.textContent !== goalText) { goalEl.innerHTML = `<b>OBJETIVO</b>${goalText}`; restart(goalEl, 'tick') }
  cosEl.innerHTML = [0, 1].map((t) => {
    const filled = (shownMeter[t] / POWER_COST) * 6
    const pips = Array.from({ length: 6 }, (_, i) => `<i style="--f:${g.power[t] ? 1 : clamp01(filled - i)}"></i>`).join('')
    const state = g.power[t] ? 'on' : g.meter[t] >= POWER_COST ? 'full' : ''
    // Una Poké Ball por Pokémon del equipo; apagada si ya ha actuado este turno
    const who = viewer()
    const team = g.units.filter((u) => u.team === t)
    const balls = who !== null && who !== t ? '' : team.slice(0, 10).map((u) => `<i class="${u.moved && t === g.turn ? 'done' : ''}"></i>`).join('')
    return `<div class="cop t${t} ${t === g.turn ? 'active' : 'idle'} ${state} ${shownFunds[t] !== g.funds[t] ? 'gain' : ''}">
      <div class="face"><img src="${facePath(g.co[t], faces[t].face)}"></div>
      <div class="txt"><b>${co(t).name}</b><em>${isAI[t] ? 'IA' : 'TÚ'}</em>
        <div class="money"><i class="coin"></i>${shownFunds[t]}<small>+${income(g, t as Team)}</small></div>
        <div class="charge" title="${co(t).power}: ${co(t).powerHelp}">${pips}<u>★</u></div>
        <div class="balls">${balls}</div>
      </div>${who !== null && who !== t ? '' : `<div class="belt" title="Cinturón: atrapados que un Capturador puede soltar">${g.belt[t].map((b) => `<i><img src="${facePath(KINDS[b.kind].species)}" alt=""></i>`).join('')}${'<i></i>'.repeat(Math.max(0, (g.belt[t].length ? BELT_MAX : 0) - g.belt[t].length))}</div>`}</div>`
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
  powerBtn.innerHTML = `★ ${powerBtn.disabled && !g.power[g.turn] ? `${charge}%` : co(g.turn).power} <kbd>P</kbd>`
  powerBtn.title = `${co(g.turn).power}: ${co(g.turn).powerHelp}`
  powerBtn.style.setProperty('--p', String(g.power[g.turn] ? 100 : charge))
  endBtn.innerHTML = `Fin del turno <kbd>E</kbd>`
  aiBtn.textContent = `Azul: ${isAI[1] ? 'IA' : 'humano'}`
  muteBtn.innerHTML = `Sonido: ${muted ? 'no' : 'sí'}`
  $('#new').textContent = g.rules ? 'Salir al mapa' : 'Salir al título'
  refreshInfo()
}

const TYPE_ICON: Record<PType, number> = {
  normal: 0, fighting: 1, flying: 2, poison: 3, ground: 4, rock: 5, bug: 6, ghost: 7, steel: 8, fire: 10, water: 11, grass: 12, electric: 13,
  psychic: 14, ice: 15, dragon: 16, dark: 17, fairy: 18,
}
const miniBar = (value: number, max: number) => {
  const n = Math.max(1, Math.round((value / max) * 6))
  return `<span class="pips">${'<i class="on"></i>'.repeat(n)}${'<i></i>'.repeat(6 - n)}</span>`
}

/** Tarjeta de lo que hay bajo el cursor: Pokémon (con su barra de PS), edificio o terreno. */
/** ¿Sabe quien mira qué salvaje es ese? Sí, si tiene a alguien a dos casillas o menos, o si ya lo han debilitado. */
const knownWild = (w: { x: number; y: number; weak?: boolean }) => {
  const who = viewer()
  return who === null || !!w.weak || g.units.some((u) => u.team === who && Math.abs(u.x - w.x) + Math.abs(u.y - w.y) <= 2)
}
/** Barra de experiencia del panel: cuánto lleva, a qué evoluciona y, si está llena, que ya puede hacerlo. */
function xpLine(u: Unit): string {
  const k = KINDS[u.kind], goal = xpGoal(u), bar = xpBar(u)
  if (goal === null || bar === null) return '<div class="xpline max"><i>EXP</i><span>Nivel máximo</span></div>'
  if (canEvolve(u)) return `<div class="xpline ready"><i>EXP</i><div class="xpbar"><u style="width:100%"></u></div><span>▲ ¡Puede evolucionar a ${KINDS[k.evolves!].name}!</span></div>`
  return `<div class="xpline"><i>EXP</i><div class="xpbar"><u style="width:${bar * 100}%"></u></div><span>${u.xp}/${goal}${k.evolves ? ` ▶ ${KINDS[k.evolves].name}` : ' ▶ veterano'}</span></div>`
}
function refreshInfo() {
  if (!hover || !g) {
    infoEl.className = 'empty'
    return
  }
  const { x, y } = hover
  const terrain = terrainAt(g, x, y), b = buildingOver(x, y), u = unitShownAt(x, y)
  const stars = `<span class="stars">${'★'.repeat(terrain.def)}${'☆'.repeat(4 - terrain.def)}</span>`
  const wild = !u && wildAt(g, x, y), seen = wild && (viewer() === null || sight.has(key(x, y)))
  if (wild && seen) { // un salvaje en la hierba: quién es (si se le ve de cerca), contra quién sirve y cómo está
    const k = KINDS[wild.kind], known = knownWild(wild), who = viewer() ?? g.turn, rival = g.co[1 - who]
    const edge = known ? edgeOver(wild.kind, rival) : 0
    infoEl.className = ''
    infoEl.innerHTML = known
      ? `<img class="mug" src="${facePath(k.species)}">
        <div class="who"><b>${k.name}</b>${k.types.map((t) => `<i class="ty" style="background-position:0 -${TYPE_ICON[t] * 19}px" title="${TYPE_NAME[t]}"></i>`).join('')}<small>salvaje</small></div>
        <div class="hpline wildline ${wild.weak ? 'weak' : ''}">${wild.weak ? 'Debilitado: empieza cansado' : 'En plena forma'}</div>
        <div class="line"><span>${ROLES[k.role].name}</span><span class="${edge >= 4 ? 'edge' : ''}">${edge >= 4 ? `▲ Fuerte contra ${COMMANDERS[rival].name}` : edge >= 2 ? `Algo útil contra ${COMMANDERS[rival].name}` : ''}</span></div>
        <div class="reach aid"><b>Capturador</b>◓ Ponte encima para intentar atraparlo</div>`
      : `<span class="big">¿Pokémon salvaje?</span>
        <div class="line two"><span>Algo se mueve en la hierba</span></div>
        <div class="line"><span>Acércate a 2 casillas para ver quién es</span></div>`
    infoEl.title = ''
  } else if (u) {
    const k = KINDS[u.kind]
    infoEl.className = `t${u.team}`
    infoEl.innerHTML = `<img class="mug" src="${facePath(k.species)}">
      <div class="who" title="${ROLES[k.role].name}: ${ROLES[k.role].help}"><b>${k.name}</b>${k.types.map((t) => `<i class="ty" style="background-position:0 -${TYPE_ICON[t] * 19}px" title="${TYPE_NAME[t]}"></i>`).join('')}<small>Nv.${u.level}${u.status ? ` · <em style="color:${STATUS_COLOR[u.status]}">${STATUS_NAME[u.status]}</em>` : ''}</small></div>
      <div class="hpline"><div class="hpbar"><i style="width:${u.hp * 9.6}px;background-position:0 -${u.hp > 5 ? 0 : u.hp > 2 ? 8 : 16}px"></i></div>${u.hp}/10</div>
      ${xpLine(u)}
      <div class="line"><span>ATQ ${miniBar(k.atk, 2)}</span><span>DEF ${miniBar(k.def, 2)}</span><span>MOV ${moveRange(g, u)}</span></div>
      <div class="reach ${k.heals ? 'aid' : isRanged(u) ? 'far' : 'melee'}"><b>${ROLES[k.role].name}</b>${k.heals ? `✚ Cura y duerme a ${k.range[0]}–${k.range[1]}` : isRanged(u) ? `◎ A distancia: ${k.range[0]}–${k.range[1]} casillas, sin moverse` : '⚔ Cuerpo a cuerpo: mueve y pega'}</div>`
    infoEl.title = [`Ataques: ${k.moves.map((m) => ATTACK_NAME[m]).join(' y ')}`, MOVE_LABEL[k.move], k.capture ? 'captura edificios' : '', k.evolves ? `con la barra de experiencia llena puede evolucionar a ${KINDS[k.evolves].name}` : '',
      isRanged(u) ? 'no puede moverse y atacar en el mismo turno' : ''].filter(Boolean).join(' · ')
  } else if (b) {
    const info = BUILDING_INFO[b.type]
    infoEl.className = b.owner < 0 ? '' : `t${b.owner}`
    infoEl.innerHTML = `<span class="big">${info.name}</span>
      <div class="line two"><span>${b.owner < 0 ? 'Sin dueño' : 'Equipo ' + TEAM_NAME[b.owner]}</span><span>${b.cap < CAPTURE_POINTS ? `Captura ${b.cap}/${CAPTURE_POINTS}` : ''}</span></div>
      <div class="line"><span>${info.help}</span></div>`
    infoEl.title = ''
  } else {
    infoEl.className = ''
    infoEl.innerHTML = `<span class="big">${terrain.name}</span>
      <div class="line two"><span>Defensa ${stars}</span></div>
      <div class="line"><span>${sight.size && viewer() !== null && !sight.has(key(x, y)) ? 'Oculto por la niebla' : terrain.cost.walk > 9 ? 'No se puede cruzar a pie' : `Cuesta ${terrain.cost.walk} de movimiento`}</span></div>`
    infoEl.title = ''
  }
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
  if (g.winner === null) return saveGame()
  localStorage.removeItem(SAVE_KEY)
  const winner = g.winner
  setFace(winner, 'Happy', 1e7)
  setFace((1 - winner) as Team, 'Pain', 1e7)
  if (AUTO || tutorial.isOpen) return
  talkEl.hidden = true
  if (g.rules) return void storyFinished(g) // en campaña, el final lo cuenta la historia
  setTimeout(() => {
    music.ambience('')
    // Si gana la IA contra un humano, suena el tema de derrota
    const lost = isAI[winner] && !isAI[1 - winner]
    music.play(lost ? 'defeat' : 'victory')
    if (!lost) sfx.win()
    sfx.cry(g.co[winner], 1, 0.8)
    victory(winner, g.co[winner], g.day, showTitle)
  }, 900)
}

/** Pantalla para elegir comandante; el rival se elige al azar si lo lleva la IA. */
/**
 * Elección de comandante: el plantel a la izquierda y, a la derecha, el escaparate del que está señalado, con su
 * retrato en grande, su estilo, su poder y su equipo animado. Todo se tiñe de su color y suena su tema.
 * Si el rival lo lleva la IA, se sortea a la vista con una ruleta.
 */
let selectBack: (() => void) | null = null // Esc en la elección de comandante
function chooseCommanders(): Promise<[string, string] | null> {
  const ids = Object.keys(COMMANDERS)
  if (AUTO) return Promise.resolve([pick(ids), pick(ids)])
  mode = 'select'
  return new Promise((resolve) => {
    const picks: string[] = []
    selectEl.innerHTML = `<div class="bg"><div class="rays"></div><div class="stripes"></div><div class="ghost"><div></div></div></div>
      <header><small></small><h2>ELIGE COMANDANTE</h2><span class="who"></span></header>
      <section class="show">
        <div class="pic"><img class="e2" alt=""><img class="e1" alt=""><img class="main" alt=""></div>
        <div class="txt"><h3></h3><p class="lema"></p>
          <div class="bocadillo"></div>
          <div class="ficha"><div class="stats"></div><div class="tipos"></div></div>
          <div class="poder"><b></b><span></span></div></div>
      </section>
      <div class="equipo"><canvas class="campo" width="528" height="52"></canvas><div class="roles"></div></div>
      <div class="plantel"></div>
      <footer><kbd>←</kbd><kbd>→</kbd> mirar · <kbd>Enter</kbd> elegir · <kbd>Esc</kbd> volver</footer>
      <nav class="dedo"><button data-a="back">↩ Volver</button><button data-a="go">¡Elegir!</button></nav>`
    const q = <E extends HTMLElement>(sel: string) => selectEl.querySelector(sel) as E
    const show = q('.show'), plantel = q('.plantel')
    let current = '', locked = false, team = 0, themeTimer = 0
    q('[data-a=back]').onclick = () => selectBack?.()
    q('[data-a=go]').onclick = () => { if (!locked && current) choose(current) }
    let squad: string[] = [], typing = 0
    const campo = q<HTMLCanvasElement>('.campo').getContext('2d')!
    const pips = (n: number) => `<span class="pips">${'<i class="on"></i>'.repeat(n)}${'<i></i>'.repeat(6 - n)}</span>`
    const level = (v: number, per: number) => Math.max(1, Math.min(6, 3 + Math.round((v - 1) / per)))

    const tiles = ids.map((id, i) => {
      const btn = document.createElement('button')
      btn.className = 'cotile'
      btn.style.setProperty('--c', COMMANDERS[id].color)
      btn.style.setProperty('--i', String(i))
      btn.innerHTML = `<img src="${facePath(id)}" alt=""><b>${COMMANDERS[id].name}</b>`
      btn.onmouseenter = btn.onfocus = () => { if (!locked) display(id) }
      // Con el dedo no hay «pasar por encima»: el primer toque lo enseña y el botón de abajo (u otro toque) lo elige
      let shown = false
      btn.onpointerdown = () => (shown = current === id)
      btn.onclick = () => { if (locked) return; if (isTouch() && !shown) { shown = true; return display(id) } choose(id) }
      plantel.append(btn)
      return btn
    })

    /** Enseña un comandante en el escaparate. */
    function display(id: string, expression = 'Normal') {
      if (id === current && expression === 'Normal') return
      const changed = id !== current
      current = id
      const c = COMMANDERS[id]
      selectEl.style.setProperty('--c', c.color)
      tiles.forEach((t, i) => t.classList.toggle('on', ids[i] === id))
      for (const img of show.querySelectorAll<HTMLImageElement>('.pic img')) img.src = facePath(id, expression)
      if (!changed) return
      q('h3').innerHTML = [...c.name].map((ch, i) => `<span style="--i:${i}">${ch}</span>`).join('')
      q('.lema').textContent = c.title
      q('.ghost div').textContent = `${c.name.toUpperCase()} · `.repeat(8)
      q('.poder b').textContent = `★ ${c.power}`
      q('.poder span').textContent = c.powerHelp
      // Lo que dice al verle: se escribe letra a letra
      const line = pick(c.quotes.start), bubble = q('.bocadillo')
      clearInterval(typing)
      let n = 0
      bubble.textContent = ''
      typing = window.setInterval(() => {
        bubble.textContent = '«' + line.slice(0, ++n) + (n >= line.length ? '»' : '')
        if (n >= line.length) clearInterval(typing)
      }, 22)
      q('.stats').innerHTML = `<div><span>Ataque</span>${pips(level(c.atk[0], 0.05))}</div><div><span>Defensa</span>${pips(level(c.def[0], 0.04))}</div>
        <div><span>Movimiento</span>${pips(3 + c.mv[0] * 2)}</div><div><span>Con poder</span>${pips(level((c.atk[1] + c.def[1]) / 2 + c.mv[1] * 0.1, 0.07))}</div>`
      squad = rosterOf(id)
      void loadSpeciesList(squad.map((k) => KINDS[k].species))
      const types = [...new Set(squad.flatMap((k) => KINDS[k].types))]
      q('.tipos').innerHTML = `<span>Tipos del equipo</span><div>${types.map((t) => `<i class="ty" style="background-position:0 -${TYPE_ICON[t] * 38}px" title="${TYPE_NAME[t]}"></i>`).join('')}</div>`
      q('.roles').innerHTML = squad.map((kind, i) => {
        const k = KINDS[kind]
        return `<div class="mon" style="--i:${i}" title="${k.name} · ${ROLES[k.role].help}"><b>${k.name}</b><span>${ROLES[k.role].name}</span>
          <em>${k.types.map((t) => `<i class="ty" style="background-position:0 -${TYPE_ICON[t] * 19}px"></i>`).join('')}</em></div>`
      }).join('')
      restart(show, 'swap')
      restart(q('.equipo'), 'swap')
      sfx.cursor()
      sfx.cry(id, 1, 0.3)
      clearTimeout(themeTimer) // si te quedas mirándolo, suena su tema
      themeTimer = window.setTimeout(() => { if (current === id && !selectEl.hidden) music.play('co_' + id) }, 550)
    }

    function ask(t: number) {
      team = t
      locked = false
      selectEl.dataset.team = String(t)
      q('header small').textContent = isAI[1] ? 'Un jugador' : `Jugador ${t + 1}`
      q('.who').textContent = `Equipo ${TEAM_NAME[t]}`
      q('.who').className = `who t${t}`
      for (const tile of tiles) tile.classList.remove('taken')
      if (t === 1) tiles[ids.indexOf(picks[0])].classList.add('rojo')
      restart(selectEl, 'open')
      current = ''
      const first = t === 1 ? ids.find((id) => id !== picks[0])! : ids[0]
      display(first)
      tiles[ids.indexOf(first)].focus()
    }

    /** Elegido: destello, cara de contento, sello y grito. */
    async function confirm(id: string, text: string) {
      display(id, 'Happy')
      tiles[ids.indexOf(id)].classList.add('taken')
      restart(show, 'chosen')
      const stampEl = document.createElement('div')
      stampEl.className = `listo t${team}`
      stampEl.textContent = text
      show.append(stampEl)
      sfx.confirm()
      sfx.cry(id, 1, 0.8)
      await sleep(950)
      stampEl.remove()
    }

    // Esc: el segundo jugador devuelve la elección al primero; el primero vuelve al título
    selectBack = () => {
      if (locked) return
      sfx.cancel()
      clearTimeout(themeTimer)
      if (team === 1 && picks.length) { tiles[ids.indexOf(picks.pop()!)].classList.remove('rojo'); return ask(0) }
      selectBack = null
      resolve(null)
    }

    async function choose(id: string) {
      locked = true
      clearTimeout(themeTimer)
      picks.push(id)
      await confirm(id, '¡LISTO!')
      if (team === 0 && !isAI[1]) return ask(1)
      if (picks.length < 2) { // ruleta para el comandante de la IA
        team = 1
        selectEl.dataset.team = '1'
        q('header small').textContent = 'IA'
        q('h2').textContent = 'SORTEO DEL RIVAL'
        q('footer').textContent = ''
        q('.who').textContent = 'Equipo Azul'
        q('.who').className = 'who t1'
        tiles[ids.indexOf(id)].classList.add('rojo')
        const rivals = ids.filter((other) => other !== id)
        const rival = pick(rivals)
        for (let i = 0; i < 12; i++) {
          current = ''
          display(i === 11 ? rival : rivals[(i * 3) % rivals.length])
          await sleep(70 + i * 14)
        }
        picks.push(rival)
        await confirm(rival, '¡RIVAL!')
      }
      selectBack = null
      resolve(picks as [string, string])
    }

    // El equipo desfila sobre un trozo de hierba del mapa, y el retrato va cambiando de cara
    let lastFace = ''
    const loop = (time: number) => {
      if (selectEl.hidden) return void clearInterval(typing)
      campo.imageSmoothingEnabled = false
      for (let x = 0; x < 528; x += 64) campo.drawImage(atlas, at.grass.x, 0, 64, 52, x, 0, 64, 52)
      squad.forEach((kind, i) => {
        const x = 24 + i * 48, hop = Math.abs(Math.sin(time / 260 + i * 0.9)) * 3
        campo.fillStyle = 'rgba(16, 40, 24, 0.3)'
        campo.beginPath()
        campo.ellipse(x, 40, 11 - hop, 4, 0, 0, Math.PI * 2)
        campo.fill()
        drawSprite(campo, KINDS[kind].species, 'Walk', DIR.down, time + i * 160, x, 24 - hop)
      })
      if (!locked && current) {
        const face = ['Normal', 'Normal', 'Determined', 'Normal', 'Happy'][Math.floor(time / 900) % 5]
        if (face !== lastFace) { lastFace = face; q<HTMLImageElement>('.pic .main').src = facePath(current, face) }
      }
      requestAnimationFrame(loop)
    }
    selectEl.hidden = false
    music.play('select')
    requestAnimationFrame(loop)
    ask(0)
  })
}

// ---------- Pantalla de título ----------

const titleEl = $('#title')
$('#helpbtn').onclick = () => void tutorial.open()
let titleOn = false
let titleIntro = true // la primera vez espera a que pulses algo (y así el navegador ya deja sonar la música)
let idleTimer = 0, duelTimer = 0, wokeAt = 0
let duel: string[] = []

/** Título: el mapa vivo de fondo (la cámara pasea, los Pokémon se mueven, pasa el día) y el menú encima. */
function showTitle() {
  hideOverlay()
  story.close()
  stage.classList.remove('storying')
  titleOn = true
  bannerEl.hidden = talkEl.hidden = sceneEl.hidden = selectEl.hidden = menuEl.hidden = recruitEl.hidden = true
  loadDemo()
  stage.classList.add('titling')
  stage.classList.remove('attract')
  titleEl.hidden = false
  titleEl.classList.toggle('intro', titleIntro)
  restart(titleEl, 'open')
  if (!titleIntro) restart(titleEl, 'enter')
  // El botón principal es el que más probablemente quieres: seguir tu partida o, si no hay, empezar una
  const saved = !!loadSave()
  titleEl.querySelector<HTMLElement>('[data-go=continue]')!.hidden = !saved
  for (const btn of titleEl.querySelectorAll<HTMLElement>('.menu > button')) btn.classList.toggle('main', btn.dataset.go === (saved ? 'continue' : 'story'))
  refreshTitle()
  music.play('title')
  music.ambience('')
  nextDuel()
  clearInterval(duelTimer)
  duelTimer = window.setInterval(nextDuel, 6500)
  titleWake()
  if (!titleIntro) titleEl.querySelector<HTMLElement>('.menu > .main')!.focus()
}

/** Un campo de batalla de exhibición en el mapa elegido, sin niebla y con Pokémon de todos los equipos paseando. */
function loadDemo() {
  const demo = createGame(['pikachu', 'charizard'], false, mapChoice)
  const cast = Object.keys(COMMANDERS).flatMap((id) => [pick(rosterOf(id)), pick(rosterOf(id))]).filter((k) => KINDS[k].move !== 'swim')
  cast.forEach((kind, i) => {
    for (let tries = 0; tries < 60; tries++) {
      const x = Math.floor(Math.random() * demo.w), y = Math.floor(Math.random() * demo.h)
      if (!'.="'.includes(demo.tiles[y][x]) || unitAt(demo, x, y)) continue
      demo.units.push({ id: demo.nextId++, kind, team: (i % 2) as Team, x, y, hp: 10, moved: false, xp: 0, level: 1, status: null, statusTurns: 0 })
      break
    }
  })
  void loadSpeciesList(cast.map((k) => KINDS[k].species))
  g = demo
  terrainLayer = makeTerrainLayer(g)
  fx.clear()
  for (const m of [unitFx, unitDir, unitAnim, animPos]) m.clear()
  reset()
  mode = 'select'
  void (async () => { // los Pokémon pasean por el mapa mientras estás en el menú
    while (titleOn && g === demo) {
      const u = pick(demo.units)
      const spots = stoppable(demo, u, reachable(demo, u, 3)).filter((r) => demo.tiles[r.y][r.x] !== 'B')
      if (spots.length > 1) {
        const to = pick(spots)
        await animateMove(u, pathTo(reachable(demo, u, 3), to.x, to.y))
        if (g !== demo) break
        moveCatch(demo, u, to.x, to.y)
        animPos.delete(u.id)
      }
      await sleep(500)
    }
  })()
}

/** Dos comandantes cara a cara a los lados del logo; cada pocos segundos entra otra pareja y uno de ellos suelta su frase. */
function nextDuel() {
  if (!titleOn) return void clearInterval(duelTimer)
  const fresh = Object.keys(COMMANDERS).filter((id) => !duel.includes(id))
  const a = pick(fresh)
  duel = [a, pick(fresh.filter((id) => id !== a))]
  const speaker = Math.random() < 0.5 ? 0 : 1
  titleEl.querySelectorAll<HTMLElement>('.rival').forEach((el, t) => {
    const c = COMMANDERS[duel[t]]
    el.style.setProperty('--c', c.color)
    for (const img of el.querySelectorAll('img')) img.src = facePath(duel[t], t === speaker ? 'Determined' : 'Normal')
    el.querySelector('b')!.textContent = c.name
    el.querySelector('span')!.textContent = c.title
    el.querySelector('.say')!.textContent = t === speaker ? `«${pick(c.quotes.start)}»` : ''
    restart(el, 'swap')
  })
}

/**
 * Cualquier tecla o clic: la primera vez abre el menú; después, lo despierta si se había retirado. Tras medio
 * minuto sin tocar nada el menú se aparta y deja ver el mapa (modo escaparate).
 */
function titleWake(e?: Event) {
  if (!titleOn || titleEl.hidden) return
  clearTimeout(idleTimer)
  idleTimer = window.setTimeout(() => { if (titleOn && !titleIntro && !titleEl.hidden) stage.classList.add('attract') }, 30000)
  const asleep = titleIntro || stage.classList.contains('attract')
  if (!e || !asleep) return
  stage.classList.remove('attract')
  if (e.type === 'mousemove') return
  e.stopPropagation() // esa pulsación solo despierta: no elige nada
  e.preventDefault()
  wokeAt = performance.now()
  if (titleIntro) {
    titleIntro = false
    titleEl.classList.remove('intro')
    restart(titleEl, 'enter')
    sfx.confirm()
    music.play('title')
  }
  titleEl.querySelector<HTMLElement>('.menu > .main')!.focus()
}
for (const type of ['keydown', 'pointerdown', 'mousemove']) addEventListener(type, titleWake, true)

function refreshTitle() {
  titleEl.querySelectorAll<HTMLElement>('.maps button').forEach((btn, i) => btn.classList.toggle('on', i === mapChoice))
  titleEl.querySelector('.blurb')!.textContent = MAPS[mapChoice].blurb
  const toggle = (opt: string, on: boolean, text: string) => {
    const btn = titleEl.querySelector<HTMLElement>(`[data-opt=${opt}]`)!
    btn.classList.toggle('on', on)
    btn.innerHTML = `<i></i>${text}`
  }
  toggle('fog', fogOn, 'Niebla de guerra')
  toggle('sound', !muted, 'Sonido')
}

// El logo se monta letra a letra para animarlas por separado; la O de POKÉ es una Poké Ball
titleEl.querySelector('.poke')!.innerHTML = ['P', '<i class="ball"></i>', 'K', 'É'].map((ch, i) => `<span style="--i:${i}"${ch.length === 1 ? ` data-ch="${ch}"` : ''}>${ch}</span>`).join('')
titleEl.querySelector('.wars')!.innerHTML = [...'WARS'].map((ch, i) => `<span style="--i:${i + 4}" data-ch="${ch}">${ch}</span>`).join('')
// El gavilán de la firma, píxel a píxel: alas arriba y alas abajo
const hawkPixels = (rows: string[]) => rows.flatMap((row, y) => [...row].map((ch, x) => (ch === 'X' ? `calc(var(--px, 0.36vh) * ${x}) calc(var(--px, 0.36vh) * ${y})` : ''))).filter(Boolean).join(',')
document.documentElement.style.setProperty('--hawk', hawkPixels(['X...........X', 'XX.........XX', '.XXX.....XXX.', '..XXXX.XXXX..', '...XXXXXXX...', '.....XXX.....', '......X......']))
document.documentElement.style.setProperty('--hawk2', hawkPixels(['.............', '.............', '..XXX...XXX..', '.XXXXX.XXXXX.', 'XX.XXXXXXX.XX', 'X....XXX....X', '......X......']))
// Un botón por mapa, con su miniatura
MAPS.forEach((map, i) => {
  const btn = document.createElement('button'), mini = document.createElement('canvas'), k = 3
  btn.dataset.map = String(i)
  mini.width = map.rows[0].length * k
  mini.height = map.rows.length * k
  const mx = mini.getContext('2d')!
  map.rows.forEach((row, y) => [...row].forEach((tile, x) => { mx.fillStyle = MINI_COLOR[tile] ?? '#8fd880'; mx.fillRect(x * k, y * k, k, k) }))
  for (const b of map.buildings) {
    mx.fillStyle = b.owner < 0 ? '#e8ecf4' : TEAM_HEX[b.owner]
    for (const c of footprint(b)) mx.fillRect(c.x * k, c.y * k, k, k)
  }
  btn.append(mini)
  btn.insertAdjacentHTML('beforeend', `<b>${map.name}</b>`)
  titleEl.querySelector('.maps')!.append(btn)
})
for (const btn of titleEl.querySelectorAll<HTMLButtonElement>('button')) {
  btn.onmouseenter = () => { sfx.cursor(); btn.focus() }
  btn.onclick = () => {
    if (performance.now() - wokeAt < 300) return // el clic que despertó el menú
    if (btn.dataset.map) { // cambia de mapa y lo enseña de fondo
      if (Number(btn.dataset.map) === mapChoice) return
      mapChoice = Number(btn.dataset.map)
      localStorage.setItem('pokewars-map', String(mapChoice))
      sfx.confirm()
      loadDemo()
      restart(stage, 'mapswap')
      return refreshTitle()
    }
    if (btn.dataset.opt === 'help') return void tutorial.open()
    if (btn.dataset.opt === 'fog') { fogOn = !fogOn; fogBtn.textContent = `Niebla: ${fogOn ? 'sí' : 'no'}`; sfx.confirm(); return refreshTitle() }
    if (btn.dataset.opt === 'sound') { toggleMute(); music.sync(); sfx.confirm(); return refreshTitle() }
    if (btn.dataset.go === 'story') { // modo historia: al mapa del mundo
      sfx.confirm()
      void (async () => {
        btn.classList.add('chosen')
        titleEl.classList.add('leaving')
        await sleep(420)
        await story.open()
        titleEl.classList.remove('leaving')
        btn.classList.remove('chosen')
      })()
      return
    }
    const saved = btn.dataset.go === 'continue' ? loadSave() : null
    if (saved) { isAI[0] = saved.isAI[0]; isAI[1] = saved.isAI[1]; fogOn = saved.fogOn }
    else isAI[1] = btn.dataset.go === 'solo' // contra la IA o dos personas por turnos
    sfx.confirm()
    void (async () => { // el botón destella, el logo sale volando y la cortinilla da paso a la selección
      if (!saved && !localStorage.getItem('pokewars-tutorial') && !navigator.webdriver) { // la primera partida empieza por el tutorial
        localStorage.setItem('pokewars-tutorial', '1')
        await tutorial.open()
      }
      btn.classList.add('chosen')
      titleEl.classList.add('leaving')
      await sleep(420)
      await cover()
      titleEl.hidden = true
      titleEl.classList.remove('leaving')
      btn.classList.remove('chosen')
      if (saved) { startGame(saved.g.co, 0, saved.g); if (saved.g.rules) story.resume(); themeNow() } else void newGame()
      await sleep(80)
      await uncover()
    })()
  }
}

// ---------- Modo historia: lo que story.ts necesita del juego ----------

story.init({
  world(game: Game) {
    titleOn = false
    clearInterval(duelTimer)
    clearTimeout(idleTimer)
    titleEl.hidden = talkEl.hidden = true
    stage.classList.remove('titling', 'attract')
    stage.classList.add('storying')
    isAI[0] = false; isAI[1] = true
    enterGame(game)
    mode = 'select'
    hover = null
  },
  mission(game: Game) {
    viewFit = null
    stage.classList.remove('storying')
    isAI[0] = false; isAI[1] = true
    void loadSpeciesList(speciesOf(game))
    enterGame(game)
    resize()
    shownFunds[0] = game.funds[0]; shownFunds[1] = game.funds[1]; shownMeter[0] = shownMeter[1] = 0
    weatherShown = game.weather
    const first = game.units.find((u) => u.team === 0) ?? { x: 0, y: 0 }
    hover = { x: first.x, y: first.y }
    cursor.x = hover.x * T; cursor.y = hover.y * T
    panTo(first.x * T + 3 * T, first.y * T, true)
    game.units.forEach((u, i) => dropIn(u, 500 + i * 90))
    themeNow()
  },
  title() { viewFit = null; showTitle(); resize() },
  fit(rect: { x: number; y: number; w: number; h: number } | null) { viewFit = rect; resize() },
  screen: (x: number, y: number) => [(x * T + T / 2 - cam.x) * scale, (y * T + T / 2 - cam.y) * scale],
  tile: () => T * scale,
  pan(x: number, y: number, snap?: boolean) { panTo(x * T + T / 2, y * T + T / 2, snap) },
  drop(units: Unit[]) {
    void loadSpeciesList(units.flatMap((u) => line(u.kind)))
    if (units[0]) panTo(units[0].x * T, units[0].y * T)
    units.forEach((u, i) => { dropIn(u, i * 130); label(u, '¡Refuerzos!', u.team === 0 ? 'heal' : 'dmg', 400 + i * 130) })
    sfx.recruit()
  },
  hold(on: boolean) {
    if (on) mode = 'busy'
    else { reset(); refreshPanel() }
  },
})

// ---------- Tutorial: lecciones sobre el juego de verdad ----------

let stash: { g: Game; isAI: [boolean, boolean]; cam: [number, number]; title: boolean } | null = null
tutorial.init({
  canOpen: () => !!g && (titleOn ? !titleEl.hidden : (mode === 'idle' || mode === 'inspect') && !isAI[g.turn]),
  enter() { // se aparta lo que hubiera (el título o la partida) hasta que se cierre
    stash = { g, isAI: [isAI[0], isAI[1]], cam: [cam.tx, cam.ty], title: titleOn }
    titleOn = false
    clearInterval(duelTimer)
    clearTimeout(idleTimer)
    titleEl.hidden = true
    stage.classList.remove('titling', 'attract')
    stage.classList.add('tutoring')
    talkEl.hidden = true
    reset()
    mode = 'idle' // en el título el modo es «select»: las lecciones necesitan el tablero libre
  },
  leave() {
    const back = stash!
    stash = null
    stage.classList.remove('tutoring')
    isAI[0] = back.isAI[0]; isAI[1] = back.isAI[1]
    talkEl.hidden = bannerEl.hidden = true
    if (back.title) return showTitle()
    enterGame(back.g)
    panTo(back.cam[0] + canvas.width / 2, back.cam[1] + canvas.height / 2, true)
    themeNow()
  },
  load(lesson: Lesson) {
    const game = createGame(['pikachu', 'charizard'], false, 0)
    for (const change of lesson.buildings ?? []) {
      const b = buildingAt(game, change.x, change.y)!
      if (change.owner !== undefined) b.owner = change.owner
      if (change.cap !== undefined) b.cap = change.cap
    }
    game.units = lesson.units.map((u, i) => ({ id: i + 1, kind: u.kind, team: u.team, x: u.x, y: u.y, hp: u.hp ?? 10, moved: false, xp: u.xp ?? 0, level: 1, status: u.status ?? null, statusTurns: u.status ? 6 : 0 }))
    game.nextId = game.units.length + 1
    game.wild = lesson.wild ?? []
    game.items = lesson.items ?? []
    game.funds = lesson.funds ?? [0, 0]
    game.meter = lesson.meter ?? [0, 0]
    isAI[0] = false; isAI[1] = true
    void loadSpeciesList(speciesOf(game))
    enterGame(game)
    shownFunds[0] = game.funds[0]; shownMeter[0] = game.meter[0]
    hover = { x: lesson.cursor[0], y: lesson.cursor[1] }
    cursor.x = hover.x * T; cursor.y = hover.y * T
    panTo(hover.x * T + 3 * T, hover.y * T, true)
    refreshInfo()
    themeNow()
  },
  idle: () => (mode === 'idle' || mode === 'inspect' || mode === 'move' || mode === 'menu' || mode === 'target' || mode === 'recruit') && sceneEl.hidden && overlayEl.hidden,
  key(key: string) {
    dispatchEvent(new KeyboardEvent('keydown', { key }))
    dispatchEvent(new KeyboardEvent('keyup', { key }))
  },
  look(x: number, y: number) {
    hover = { x, y }
    panTo(x * T, y * T)
    refreshInfo()
  },
  mode: () => mode,
  hover: () => hover,
})

/** Pone un estado de partida ya montado en pantalla (sin presentación): lo usan las lecciones y la vuelta del tutorial. */
function enterGame(game: Game) {
  g = game
  terrainLayer = makeTerrainLayer(g)
  fx.clear()
  for (const m of [unitFx, unitDir, unitAnim, animPos]) m.clear()
  bannerEl.hidden = sceneEl.hidden = selectEl.hidden = true
  reset()
  refreshPanel()
}

async function newGame() {
  hideOverlay()
  bannerEl.hidden = talkEl.hidden = true
  const cos = await chooseCommanders()
  if (!cos) { // se ha echado atrás: de vuelta al título
    await cover()
    showTitle()
    await uncover()
    return
  }
  if (AUTO) return startGame(cos)
  // Presentación: los comandantes frente a frente mientras se monta el mapa por debajo
  sfx.battle()
  const intro = versus(cos)
  setTimeout(() => sfx.cry(cos[0], 1, 0.7), 250)
  setTimeout(() => sfx.cry(cos[1], 1, 0.7), 900)
  const sprites = loadSpeciesList(cos.flatMap((c) => rosterOf(c)).flatMap(line)) // los dos equipos, mientras dura la presentación
  await sleep(600)
  await Promise.race([sprites, sleep(2500)])
  sfx.bigHit()
  startGame(cos, 1500)
  await intro
  themeNow()
}

// ---------- Animaciones ----------

async function animateMove(u: Unit, path: Pos[]) {
  const step = AUTO ? 12 : 105
  if (path.length > 1) playAnim(u, 'Walk', 1e9)
  for (let i = 1; i < path.length; i++) {
    const start = performance.now()
    unitDir.set(u.id, dirFrom(path[i].x - path[i - 1].x, path[i].y - path[i - 1].y))
    if (!AUTO && !titleOn && i % 2 === 1) sfx.step() // un paso sí y otro no, para que no machaque
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
  // Entrada de combate: tres destellos y la cámara se echa encima de donde va a ser, antes de la cortinilla
  const r = canvas.getBoundingClientRect(), [ax, ay] = center(att)
  stage.style.setProperty('--ex', `${(((x + ax) / 2 - cam.x) / canvas.width) * r.width}px`)
  stage.style.setProperty('--ey', `${(((y + ay) / 2 - cam.y) / canvas.height) * r.height}px`)
  restart(stage, 'encounter')
  await sleep(560)
}

/** Edificio que ocupa esa casilla, sea la puerta o el resto del dibujo. */
const buildingOver = (x: number, y: number) => g.buildings.find((b) => footprint(b).some((c) => c.x === x && c.y === y))

const placeOf = (p: Pos): Place => {
  const b = buildingAt(g, p.x, p.y)
  return { terrain: g.tiles[p.y][p.x], building: b && { type: b.type, owner: b.owner } }
}

/** Cuánto lleva de la barra de experiencia de su nivel, de 0 a 1 (null si ya no sube más). */
function xpBar(u: Unit): number | null {
  const goal = xpGoal(u)
  if (goal === null) return null
  const floor = XP_LEVEL[u.level - 1]
  return Math.max(0, Math.min(1, (u.xp - floor) / (goal - floor)))
}
const xpGain = (u: Unit, from: number | null, ready: boolean): XpGain | null => (from === null || !g.units.includes(u) ? null : { from, to: ready ? 1 : xpBar(u) ?? 1, ready })

/** La orden de soltar: la Ball sale volando del Capturador, cae al lado, se abre con un destello y aparece el Pokémon. */
async function doRelease(u: Unit) {
  const kind = g.belt[u.team][0]?.kind
  if (kind) await loadSpeciesList(line(kind))
  const fresh = release(g, u)
  if (!fresh || AUTO) return
  face(u, fresh)
  setFx(u, { pop: performance.now() })
  const hide = performance.now() + 620
  setFx(fresh, { drop: hide }) // no se le ve hasta que se abre la Ball
  const ball = document.createElement('i')
  ball.className = 'ballfx throw'
  const px = (p: Pos) => [(p.x * T + T / 2 - cam.x) * scale, (p.y * T + T / 2 - cam.y) * scale]
  const [x0, y0] = px(u), [x1, y1] = px(fresh)
  ball.style.left = x0 + 'px'; ball.style.top = y0 + 'px'
  ball.style.setProperty('--dx', x1 - x0 + 'px'); ball.style.setProperty('--dy', y1 - y0 + 'px')
  stage.append(ball)
  sfx.lunge()
  await sleep(520)
  ball.remove()
  const [cx, cy] = center(fresh)
  mapFx.add({ ring: 30, size: 5, color: '#fff', x: cx, y: cy, max: 360 })
  for (let i = 0; i < 14; i++) mapFx.add({ img: 'gold_stars', x: cx, y: cy, vx: Math.cos(i * 0.45) * 2.6, vy: Math.sin(i * 0.45) * 2.6 - 1, drag: 0.94, max: 700, scale: 1 })
  fx.addShake(4)
  sfx.ball()
  dropIn(fresh, 100)
  label(fresh, `¡Adelante, ${KINDS[fresh.kind].name}!`, 'gold', 150)
  await sleep(700)
  refreshStatus()
}

/** La orden de evolucionar, con su escena: al volver, el mapa enseña la forma nueva entre estrellas. */
async function doEvolve(u: Unit) {
  const from = u.kind
  const to = evolve(g, u)
  if (AUTO) return
  await loadSpeciesList(line(to))
  if (shown(u)) {
    talkEl.hidden = true
    await playEvolve({ from, to, team: u.team, heal: EVOLVE_HEAL })
    themeNow()
    setFx(u, { pop: performance.now() })
    const [x, y] = center(u)
    mapFx.add({ ring: 30, size: 4, color: '#ffd84a', x, y, max: 500 })
    for (let i = 0; i < 14; i++) mapFx.add({ img: 'gold_stars', x, y, vx: Math.cos(i) * 2.2, vy: Math.sin(i) * 2.2, drag: 0.94, max: 800, scale: 1 })
    label(u, `¡${KINDS[to].name}!`, 'gold')
    label(u, `+${EVOLVE_HEAL} PS`, 'heal', 350)
    sfx.levelup()
    await sleep(500)
  }
  refreshStatus()
}

/** Resuelve el ataque y lo enseña como escena de combate; al volver, el mapa refleja el resultado. */
async function battle(att: Unit, def: Unit) {
  const a = { kind: att.kind, hp: att.hp, team: att.team, x: att.x, y: att.y, place: placeOf(att) }
  const d = { kind: def.kind, hp: def.hp, team: def.team, x: def.x, y: def.y, place: placeOf(def) }
  await engage(att, def)
  const levels = [att.level, def.level]
  const xpBefore = [xpBar(att), xpBar(def)]
  const res = attack(g, att, def)
  if (AUTO) return
  if (KINDS[a.kind].heals) { // el de apoyo no pelea: duerme al rival, sin escena de combate
    if (res.status) {
      label(d, '¡Dormido!', 'heal')
      for (let i = 0; i < 3; i++) label(d, 'z', 'heal', 250 + i * 220)
      mapFx.add({ ring: 22, size: 4, color: '#c8d0f0', x: d.x * T + 16, y: d.y * T + 16, max: 500 })
      sfx.heal()
    } else label(d, 'No le afecta', 'dmg')
    await sleep(600)
    return
  }
  talkEl.hidden = true
  setSceneLight(g.weather === 'rain' ? 'rgba(20, 40, 90, 0.22)' : ['rgba(255, 214, 150, 0.08)', '', 'rgba(255, 120, 50, 0.16)', 'rgba(16, 26, 96, 0.36)'][phaseOf(g)])
  music.play('battle')
  await playBattle({
    a, d, dmg: res.dmg, counter: res.counter, crit: res.crit, co: g.co[a.team],
    dist: Math.abs(a.x - d.x) + Math.abs(a.y - d.y),
    status: res.status,
    front: isAI[a.team] && !isAI[d.team] ? 'd' : 'a', // tu Pokémon va siempre a la izquierda, también cuando te atacan
    xp: { a: xpGain(att, xpBefore[0], res.ready === att), d: xpGain(def, xpBefore[1], res.ready === def) },
  })
  stage.classList.remove('encounter')
  themeNow()

  label(d, `-${res.dmg}`, 'dmg')
  if (res.crit) label(d, '¡Crítico!', 'gold', 200)
  if (res.status && g.units.includes(def)) {
    label(d, `¡${STATUS_NAME[res.status]}!`, 'gold', 420)
    const [sx, sy] = center(d)
    setTimeout(() => {
      fx.burst(sx, sy, { n: 16, colors: [STATUS_COLOR[res.status!], '#fff'], speed: 1.8, life: 700, size: 4, up: 1 })
      sfx.status(res.status!)
    }, 420)
  }
  for (const [unit, before] of [[att, levels[0]], [def, levels[1]]] as const) {
    if (!g.units.includes(unit) || unit.level <= before) continue
    label(unit, `¡Nivel ${unit.level}!`, 'gold', 700)
    setTimeout(sfx.levelup, 700)
  }
  if (res.burned) { // el fuego se ha llevado el bosque o la hierba
    for (let i = 0; i < 4; i++) mapFx.fx('fire', d.x * T + 8 + (i % 2) * 16, d.y * T + 8 + (i >> 1) * 14, { scale: 1, fps: 12, delay: i * 70 })
    label(d, '¡Arde!', 'dmg', 600)
  }
  if (g.units.includes(def)) hurt(def)
  else koFx(d, d.team)
  if (res.counter !== null) {
    label(a, `-${res.counter}`, 'dmg', 120)
    if (g.units.includes(att)) hurt(att)
    else koFx(a, a.team)
  }
  if (res.ready && g.units.includes(res.ready)) { // ha llenado la barra: ya puede evolucionar cuando quiera su dueño
    setFx(res.ready, { pop: performance.now() })
    const [x, y] = center(res.ready)
    for (let i = 0; i < 12; i++) mapFx.add({ img: 'gold_stars', x, y, vx: Math.cos(i) * 2, vy: Math.sin(i) * 2, drag: 0.94, max: 700, scale: 1 })
    label(res.ready, '¡Puede evolucionar!', 'gold', 250)
    setTimeout(sfx.ready, 250)
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
  music.play('capture')
  await playCapture({
    kind: u.kind, team: u.team, building: { type: b.type, owner },
    capBefore: before, capAfter: done ? 0 : b.cap, done, total: CAPTURE_POINTS,
  })
  captureFx(u, b, done)
  themeNow()
  return done
}

// ---------- Turno del jugador ----------

/**
 * Casillas que ese Pokémon puede atacar en un turno, como el alcance de Advance Wars: los de cuerpo a cuerpo, las
 * que rodean cualquier casilla a la que lleguen; los de distancia no pueden mover y atacar, así que solo su anillo.
 */
function threatOf(u: Unit, stopsAt: Iterable<Pos>): Set<number> {
  const [min, max] = KINDS[u.kind].range, out = new Set<number>()
  for (const o of isRanged(u) ? [u] : [u, ...stopsAt]) {
    for (let dy = -max; dy <= max; dy++) for (let dx = -max; dx <= max; dx++) {
      const d = Math.abs(dx) + Math.abs(dy), x = o.x + dx, y = o.y + dy
      if (d >= min && d <= max && x >= 0 && y >= 0 && x < g.w && y < g.h) out.add(key(x, y))
    }
  }
  return out
}
/** Unión de lo que pueden atacar los rivales que se ven: dónde no conviene acabar el turno. */
function dangerZone(): Set<number> {
  const me = viewer() ?? g.turn, out = new Set<number>()
  for (const e of g.units) {
    if (e.team === me || !shown(e) || KINDS[e.kind].heals) continue
    for (const k of threatOf(e, stoppable(g, e, reachable(g, e)))) out.add(k)
  }
  return out
}

function select(u: Unit) {
  follow(u, 2)
  sel = u
  selTime = performance.now()
  reach = reachable(g, u)
  const where = stoppable(g, u, reach)
  stops = new Set(where.map((r) => key(r.x, r.y)))
  threat = KINDS[u.kind].heals ? new Set() : threatOf(u, u.moved && u.team === g.turn ? [] : where)
  mode = u.team === g.turn && !u.moved && !isAI[g.turn] ? 'move' : 'inspect'
  setFx(u, { pop: selTime })
  unitDir.set(u.id, DIR.down)
  sfx.cry(spriteOf(u), 1, 0.35) // el grito hace de sonido de selección
}

function placeNear(el: HTMLElement, p: Pos) {
  el.hidden = false
  const sx = p.x * T - cam.x, sy = p.y * T - cam.y // posición en pantalla
  const right = sx < canvas.width - 5 * T
  el.style.left = right ? (sx + T) * scale + 6 + 'px' : ''
  el.style.right = right ? '' : (canvas.width - sx) * scale + 6 + 'px'
  el.style.top = Math.max(4, Math.min(sy * scale, canvas.height * scale - el.offsetHeight - 8)) + 'px'
}

/**
 * Lleva al Pokémon a su destino y resuelve la casilla. Si es un Capturador de una persona y hay un salvaje, antes se
 * juega el lanzamiento de Ball: lo que gaste sale de su dinero y el resultado ya va decidido.
 */
async function arrive(u: Unit, x: number, y: number) {
  const wild = !isAI[u.team] && !AUTO ? catchable(g, u, x, y) : null
  if (!wild) return moveCatch(g, u, x, y)
  mode = 'busy'
  menuEl.hidden = forecastEl.hidden = true
  talkEl.hidden = true
  music.play('capture')
  const res = await playCatch({ kind: u.kind, team: u.team, hp: u.hp, wild: wild.kind, weak: !!wild.weak, funds: g.funds[u.team], sure: tutorial.isOpen && !!wild.weak })
  g.funds[u.team] -= res.spent
  u.hp = Math.max(1, u.hp - res.hurt) // lo que le haya pegado el salvaje se queda
  if (res.fled) g.wild = g.wild.filter((w) => w !== wild)
  moveCatch(g, u, x, y, res.caught)
  if (res.hurt) { label({ x, y }, `−${res.hurt} PS`, 'dmg', 300); hurt(u) }
  themeNow()
}

const ICON: Record<string, [string, string]> = { Soltar: ['◓', 'ball'], Evolucionar: ['▲', 'evo'], Atacar: ['⚔', 'atk'], Capturar: ['⚑', 'cap'], Congelar: ['❄', 'ice'], Atrapar: ['◓', 'ball'], Esperar: ['✔', 'ok'], Cancelar: ['✖', 'no'] }

/** Pasa a elegir objetivo con el cursor ya puesto en el rival al que más daño se le hace: Enter ataca sin más. */
function aim() {
  mode = 'target'
  selTime = performance.now()
  menuEl.hidden = true
  const here = { ...sel!, ...pending! }
  const best = [...targets].sort((p, q) => (damage(g, here, q) >= q.hp ? 100 : damage(g, here, q)) - (damage(g, here, p) >= p.hp ? 100 : damage(g, here, p)))[0]
  hover = { x: best.x, y: best.y }
  follow(best, 2)
  refreshInfo()
  showForecast()
  sfx.confirm()
}

/** Menú de órdenes: una fila por orden con su icono, lo que va a pasar si se elige y su número de atajo. */
function openMenu() {
  mode = 'menu'
  forecastEl.hidden = true
  const u = sel!, at = pending!, k = KINDS[u.kind]
  targets = targetsFrom(g, u, at)
  const items: [string, string, () => void][] = []
  if (targets.length) {
    const here = { ...u, ...at }, top = Math.max(...targets.map((t) => damage(g, here, t)))
    items.push(['Atacar', `${targets.length === 1 ? KINDS[targets[0].kind].name : targets.length + ' rivales a tiro'} · hasta −${top} PS`, aim])
  }
  if (canCapture(g, u, at)) {
    const b = buildingAt(g, at.x, at.y)!
    items.push(['Capturar', b.cap - u.hp <= 0 ? `¡${BUILDING_INFO[b.type].name} en este turno!` : `${BUILDING_INFO[b.type].name}: le quita ${u.hp} de ${b.cap}`, async () => {
      mode = 'busy'
      menuEl.hidden = true
      pending = null
      moveCatch(g, u, at.x, at.y)
      await doCapture(u, b)
      finish()
    }])
  }
  if (canEvolve(u)) { // la barra de experiencia está llena: crecer ahora cuesta el turno
    const next = KINDS[k.evolves!]
    items.push(['Evolucionar', `A ${next.name}: más ataque, defensa y movimiento · +${EVOLVE_HEAL} PS · gasta el turno`, async () => {
      mode = 'busy'
      menuEl.hidden = true
      await arrive(u, at.x, at.y)
      mode = 'busy'
      pending = null
      if (g.units.includes(u) && canEvolve(u)) await doEvolve(u)
      finish()
    }])
  }
  if (releaseSpot(g, u, at) && !wildAt(g, at.x, at.y)) { // lleva a alguien en el cinturón (y no está encima de otro salvaje): lo saca de su Ball a la casilla de al lado
    const next = g.belt[u.team][0], more = g.belt[u.team].length - 1
    items.push(['Soltar', `${KINDS[next.kind].name} (${next.hp} PS) sale de su Ball aquí al lado${more ? ` · quedan ${more} más` : ''} · gasta el turno`, async () => {
      mode = 'busy'
      menuEl.hidden = true
      await arrive(u, at.x, at.y)
      mode = 'busy'
      pending = null
      await doRelease(u)
      finish()
    }])
  }
  if (freezable(g, u, at).length) {
    items.push(['Congelar', 'Hiela el río de al lado para cruzarlo', async () => {
      await arrive(u, at.x, at.y)
      for (const p of freeze(g, u)) {
        mapFx.add({ ring: 20, size: 4, color: '#d6f0ff', x: p.x * T + 16, y: p.y * T + 16, max: 500 })
        fx.burst(p.x * T + 16, p.y * T + 16, { n: 12, colors: ['#fff', '#b8f0f8'], speed: 1.6, life: 600, size: 3 })
      }
      label(at, '¡Río congelado!', 'heal')
      sfx.status('freeze')
      finish()
    }])
  }
  // Quedarse ahí: según lo que haya en la casilla, es atrapar, debilitar, recoger o simplemente esperar
  const wild = wildAt(g, at.x, at.y), item = g.items.find((i) => i.x === at.x && i.y === at.y)
  const stay = async () => { sfx.confirm(); await arrive(u, at.x, at.y); u.moved = true; finish() }
  if (wild && catchable(g, u, at.x, at.y)) items.push(['Atrapar', wild.weak ? 'Salvaje debilitado: lanza una Ball' : 'Salvaje sano: difícil, mejor debilítalo antes', stay])
  else items.push(['Esperar', wild && !k.capture && !wild.weak ? 'Debilita al salvaje de la hierba' : item ? (item.type === 'berry' ? `Recoge la baya: +${BERRY_HEAL} PS` : `Recoge la moneda: +${COIN_VALUE}₽`) : 'Termina su jugada aquí', stay])
  items.push(['Cancelar', 'Vuelve a elegir destino', cancel])
  menuEl.replaceChildren(...items.map(([text, detail, fn], i) => {
    const btn = document.createElement('button')
    btn.className = ICON[text][1]
    btn.innerHTML = `<i class="ic ${ICON[text][1]}">${ICON[text][0]}</i><b>${text}</b><kbd>${text === 'Cancelar' ? 'Esc' : i + 1}</kbd><span>${detail}</span>`
    btn.style.animationDelay = i * 40 + 'ms'
    btn.onmouseenter = () => { sfx.cursor(); btn.focus() }
    btn.onfocus = sfx.cursor
    btn.onclick = fn
    return btn
  }))
  menuEl.insertAdjacentHTML('afterbegin', `<header><img src="${facePath(k.species)}" alt=""><b>${k.name}</b><span>${ROLES[k.role].name}</span></header>`)
  placeNear(menuEl, at)
  restart(menuEl, 'open')
  menuEl.querySelector('button')!.focus()
}

// Teclas de la caja de reclutar mientras está abierta (flechas, Enter)
let recruitKey: ((e: KeyboardEvent) => void) | null = null

/**
 * Caja del Centro Pokémon, hecha como el PC de almacenamiento: una cuadrícula de Pokémon animados sobre el fondo
 * de caja, la mano que señala, y a la izquierda el sprite grande con sus datos. Un solo cursor para ratón y teclado.
 */
function openRecruit(b: Building) {
  mode = 'recruit'
  sfx.select()
  const COLS = 6
  const k = Math.max(1, Math.min(2, Math.floor(Math.min((innerWidth - 40) / 512, (innerHeight - 40) / 384) * 2) / 2))
  recruitEl.innerHTML = `<div class="pc" style="transform:translate(-50%, -50%) scale(${k})">
      <div class="ttl"></div>
      <canvas class="spr" width="158" height="162"></canvas>
      <div class="row r1"></div><div class="row r2"></div><div class="row r3"></div><div class="row r4"></div>
      <div class="hdr">CENTRO POKÉMON</div>
      <div class="grid"></div>
      <i class="hand"></i>
      <button class="go"></button><button class="out">SALIR</button>
    </div>`
  const q = <E extends HTMLElement>(sel: string) => recruitEl.querySelector(sel) as E
  const grid = q('.grid'), hand = q('.hand'), go = q<HTMLButtonElement>('.go')
  const big = q<HTMLCanvasElement>('.spr').getContext('2d')!
  const funds = g.funds[g.turn]
  const RECRUITABLE = rosterOf(g.co[g.turn]) // el Pokémon de cada rol de tu comandante
  const full = g.units.filter((u) => u.team === g.turn).length >= MAX_UNITS
  const cost = (kind: string) => recruitCost(g, kind) // la mitad si es recuperar a un debilitado
  const cells = RECRUITABLE.map((kind: string) => {
    const cell = document.createElement('button')
    cell.className = 'cell' + (cost(kind) > funds ? ' locked' : '')
    cell.innerHTML = '<canvas width="50" height="44"></canvas>'
    grid.append(cell)
    return { kind, cell, cx: cell.querySelector('canvas')!.getContext('2d')! }
  })
  let current = -1
  const pickUp = (i: number) => {
    const kind = RECRUITABLE[i], k2 = KINDS[kind]
    if (cost(kind) > funds || full || unitAt(g, b.x, b.y)) { // no llega el dinero o el equipo está completo: la caja dice que no
      sfx.error()
      restart(recruitEl.firstElementChild!, 'nope')
      return
    }
    // La mano agarra al Pokémon y se lo lleva
    hand.className = 'hand grab'
    sfx.confirm()
    setTimeout(() => { dropIn(recruit(g, b, kind)); finish() }, 260)
  }
  const show = (i: number) => {
    if (i === current || i < 0 || i >= cells.length) return
    if (current >= 0) cells[current].cell.classList.remove('on')
    current = i
    const { kind, cell } = cells[i], k2 = KINDS[kind]
    cell.classList.add('on')
    hand.style.left = cell.offsetLeft + grid.offsetLeft + 14 + 'px'
    hand.style.top = cell.offsetTop + grid.offsetTop - 26 + 'px'
    sfx.cursor()
    const can = cost(kind) <= funds
    q('.ttl').textContent = `${k2.name} · ${ROLES[k2.role].name}`
    q('.r1').innerHTML = `<span>${isRecovery(g, kind) ? 'Recuperar' : 'Coste'}</span><b class="${can ? '' : 'bad'}">${cost(kind)}₽</b>`
    q('.r2').innerHTML = `<span class="tys">${k2.types.map((t) => `<i class="ty" style="background-position:0 -${TYPE_ICON[t] * 19}px" title="${TYPE_NAME[t]}"></i>`).join('')}</span><span>${k2.moves.map((m) => TYPE_NAME[m]).join(' + ')}</span>`
    q('.r3').innerHTML = `<span>ATQ ${miniBar(k2.atk, 2)}</span><span>DEF ${miniBar(k2.def, 2)}</span>`
    q('.r4').innerHTML = `<span>MOV ${k2.mv}</span><span>${k2.capture ? 'Captura' : k2.heals ? 'Cura' : k2.range[1] > 1 ? `Alcance ${k2.range.join('-')}` : k2.evolves ? `→ ${KINDS[k2.evolves].name}` : ''}</span>`
    q('.hdr').textContent = ROLES[k2.role].help
    go.innerHTML = full ? 'EQUIPO COMPLETO' : can ? `${isRecovery(g, kind) ? 'RECUPERAR' : 'RECLUTAR'} <b>${cost(kind)}₽</b>` : `FALTAN ${cost(kind) - funds}₽`
    go.classList.toggle('bad', !can || full)
    restart(q('.spr'), 'swap')
  }
  cells.forEach(({ cell }, i) => {
    cell.onmouseenter = () => show(i)
    cell.onclick = () => { show(i); pickUp(i) }
  })
  go.onclick = () => pickUp(current)
  q('.out').onclick = cancel
  recruitKey = (e) => {
    const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -COLS, ArrowDown: COLS }[e.key]
    if (step !== undefined) show(Math.max(0, Math.min(cells.length - 1, current + step)))
    else if (e.key === 'Enter' || e.key === ' ' || e.key.toLowerCase() === 'z') pickUp(current)
    else return
    e.preventDefault()
  }
  recruitEl.hidden = false
  restart(recruitEl, 'open')
  show(Math.max(0, cells.findIndex((c) => !c.cell.classList.contains('locked'))))

  const loop = (time: number) => {
    if (recruitEl.hidden || mode !== 'recruit') return void (recruitKey = null)
    for (const [i, { kind, cx }] of cells.entries()) { // cada casilla, su Pokémon en reposo (o dando saltitos si es el elegido)
      cx.imageSmoothingEnabled = false
      cx.clearRect(0, 0, 50, 44)
      const hop = i === current ? Math.abs(Math.sin(time / 170)) * 4 : 0
      drawSprite(cx, KINDS[kind].species, i === current ? 'Walk' : 'Idle', DIR.down, time + i * 190, 25, 20 - hop, { dim: KINDS[kind].cost > funds })
    }
    if (current >= 0) {
      big.imageSmoothingEnabled = false
      big.clearRect(0, 0, 158, 162)
      big.fillStyle = 'rgba(40, 48, 60, 0.16)'
      big.beginPath()
      big.ellipse(79, 122, 44, 12, 0, 0, Math.PI * 2)
      big.fill()
      drawSprite(big, KINDS[RECRUITABLE[current]].species, 'Walk', (Math.floor(time / 1100) * 2) % 8, time, 79, 84, { sx: 3, sy: 3 })
    }
    hand.dataset.f = String(Math.floor(time / 320) % 2)
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
  const u = unitShownAt(p.x, p.y)
  if (mode === 'idle') {
    const b = buildingOver(p.x, p.y)
    if (u) select(u)
    else if (b && b.type === 'center' && b.owner === g.turn && !unitAt(g, b.x, b.y)) openRecruit(b)
  } else if (mode === 'move') {
    if (!stops.has(key(p.x, p.y))) return cancel()
    const unit = sel!
    mode = 'busy'
    const { path, ambushed } = resolvePath(g, unit, pathTo(reach, p.x, p.y))
    await animateMove(unit, path)
    animPos.delete(unit.id)
    if (ambushed) { // había un rival escondido en la niebla: se queda ahí y pierde el turno
      const end = path[path.length - 1]
      moveCatch(g, unit, end.x, end.y)
      unit.moved = true
      label(end, '¡Emboscada!', 'dmg')
      sfx.ambush()
      fx.addShake(5)
      return finish()
    }
    pending = p
    openMenu()
  } else if (mode === 'target') {
    if (!u || !targets.includes(u)) return cancel()
    const unit = sel!
    mode = 'busy'
    forecastEl.hidden = true
    refreshPanel()
    await arrive(unit, pending!.x, pending!.y)
    mode = 'busy'
    pending = null
    await battle(unit, u)
    finish()
  }
}

/** Lo que suma de experiencia un golpe y si con eso llena la barra. */
function xpNote(u: Unit, gain: number): string {
  const goal = xpGoal(u)
  if (goal === null || canEvolve(u)) return ''
  const fills = u.xp + gain >= goal
  return `<div class="eff xp ${fills ? 'good' : ''}">+${gain} EXP${fills ? (KINDS[u.kind].evolves ? ' · ¡podrá evolucionar!' : ' · ¡sube de nivel!') : ` (${Math.min(goal, u.xp + gain)}/${goal})`}</div>`
}
function showForecast() {
  const t = hover && mode === 'target' ? targets.find((u) => u.x === hover!.x && u.y === hover!.y) : undefined
  if (!t) return void (forecastEl.hidden = true)
  const here = { ...sel!, ...pending! }
  const dmg = damage(g, here, t)
  const move = bestMove(here.kind, t.kind)
  const eff = moveMult(here.kind, move, t.kind)
  const back = dmg < t.hp && canCounter(here, t) ? damage(g, { ...t, hp: t.hp - dmg }, here) : null
  forecastEl.innerHTML = `<div class="row"><b class="out">−${dmg}</b><span>${KINDS[t.kind].name}${dmg >= t.hp ? ' · <em>¡K.O.!</em>' : ''}</span></div>
    ${back !== null ? `<div class="row"><b class="in">−${back}</b><span>contraataque</span></div>` : ''}
    <div class="eff ${eff > 1.05 ? 'good' : eff < 0.9 ? 'bad' : ''}">${ATTACK_NAME[move]} · ${eff > 1.05 ? '▲ súper eficaz' : eff < 0.4 ? '▼ casi no le afecta' : eff < 0.9 ? '▼ poco eficaz' : 'normal'}</div>
    ${flankers(g, here, t) ? `<div class="eff good">▲ Flanqueo +${flankers(g, here, t) * 10}%</div>` : ''}
    ${weatherBonus(g, move) !== 1 ? `<div class="eff ${weatherBonus(g, move) > 1 ? 'good' : 'bad'}">${WEATHER_NAME[g.weather]}</div>` : ''}
    ${xpNote(sel!, dmg + (dmg >= t.hp ? KO_XP : 0))}`
  placeNear(forecastEl, t)
}

/** Dos jugadores con niebla: se tapa el mapa hasta que el siguiente diga que está listo. */
function passScreen(): Promise<void> {
  return new Promise((resolve) => {
    const el = document.createElement('div')
    el.id = 'pass'
    el.className = `t${g.turn}`
    el.innerHTML = `<img src="${facePath(g.co[g.turn])}"><b>Turno del equipo ${TEAM_NAME[g.turn]}</b><span>Pasa el ordenador y pulsa para continuar</span>`
    stage.append(el)
    const go = () => { el.remove(); removeEventListener('keydown', go); sfx.confirm(); resolve() }
    el.onclick = go
    setTimeout(() => addEventListener('keydown', go), 300)
  })
}

/** Salta al siguiente Pokémon propio que aún no ha actuado. */
function nextUnit(step = 1) {
  if (!g || isAI[g.turn] || (mode !== 'idle' && mode !== 'inspect' && mode !== 'move') || pending) return
  const mine = g.units.filter((u) => u.team === g.turn && !u.moved)
  if (!mine.length) return
  const at = mine.indexOf(sel as Unit)
  const next = mine[at < 0 ? (step > 0 ? 0 : mine.length - 1) : (at + step + mine.length) % mine.length]
  if (hover === null) (cursor.x = next.x * T), (cursor.y = next.y * T)
  reset()
  select(next)
  hover = { x: next.x, y: next.y }
  refreshInfo()
}

async function nextTurn() {
  reset()
  mode = 'busy'
  const hpBefore = new Map(g.units.map((u) => [u.id, u.hp]))
  endTurn(g)
  if (!AUTO && g.fog && !isAI[0] && !isAI[1]) await passScreen()
  for (const u of g.units) unitDir.delete(u.id)
  refreshPanel()
  themeNow()
  await turnBanner()
  if (g.weather !== weatherShown) {
    weatherShown = g.weather
    if (!AUTO) say(g.turn, g.weather === 'rain' ? 'Empieza a llover: el agua pega más fuerte y se ve menos.' : g.weather === 'sun' ? '¡Qué solazo! El fuego pega más fuerte.' : 'Se despeja el cielo.')
  }
  const mine = g.units.find((u) => u.team === g.turn && shown(u)) ?? g.buildings.find((b) => b.owner === g.turn)
  if (mine && !isAI[g.turn]) panTo(mine.x * T, mine.y * T)
  turnStartFx(hpBefore)
  if (isAI[g.turn]) return runAI()
  if (g.rules && g.winner === null) await storyTurnStart(g) // refuerzos y frases del guion
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

/** Lo que la IA está a punto de hacer, para pintarlo un momento antes: el camino de su Pokémon y a quién apunta. */
let aiShow: { path?: Pos[]; target?: Unit } | null = null
/** Pausa del turno rival: mantener Espacio (o Enter) lo acelera. */
const beat = (ms: number) => sleep(keysDown.has(' ') || keysDown.has('enter') ? ms / 6 : ms)

async function runAI() {
  mode = 'busy'
  refreshPanel()
  await beat(600)
  if (canUsePower(g)) {
    await powerSequence()
    mode = 'busy'
    refreshPanel()
  }
  for (const u of g.units.filter((u) => u.team === g.turn)) {
    if (g.winner !== null) break
    if (!g.units.includes(u) || u.moved) continue // dormidos y congelados pierden el turno
    const plan = planUnit(g, u)
    const { path, ambushed } = resolvePath(g, u, pathTo(reachable(g, u), plan.to.x, plan.to.y))
    const end = path[path.length - 1]
    const who = viewer()
    if (who !== null) sight = visibleCells(g, who)
    // Con niebla solo se enseña el movimiento si lo ves salir o llegar
    const visible = shown(u) || who === null || sight.has(key(end.x, end.y))
    if (visible && !AUTO) {
      // Se ve venir: la cámara va a su Pokémon, este da un bote, se dibuja el camino que va a seguir y entonces anda
      panTo(u.x * T + 16, u.y * T + 16)
      await beat(380)
      hover = { x: u.x, y: u.y }
      refreshInfo()
      setFx(u, { pop: performance.now() })
      sfx.cursor()
      await beat(320)
      if (path.length > 1) {
        aiShow = { path }
        hover = { x: end.x, y: end.y }
        follow(end)
        await beat(420)
        aiShow = null
        await animateMove(u, path)
      }
    } else if (visible) await animateMove(u, path)
    moveCatch(g, u, end.x, end.y)
    animPos.delete(u.id)
    if (ambushed) {
      u.moved = true
      if (visible) label(end, '¡Emboscada!', 'dmg')
    } else if (plan.action === 'attack' && g.units.includes(plan.target!)) {
      const t = plan.target!
      if (!AUTO && (visible || shown(t))) { // la mira sobre su objetivo antes de pegar
        follow(t)
        aiShow = { target: t }
        hover = { x: t.x, y: t.y }
        refreshInfo()
        sfx.select()
        await beat(650)
        aiShow = null
      }
      await battle(u, t)
    } else {
      if (plan.action === 'evolve' && canEvolve(u)) {
        if (visible) { follow(u); await beat(300) }
        await doEvolve(u)
      }
      if (plan.action === 'freeze') {
        const cells = freeze(g, u)
        if (visible && cells.length) { label(end, '¡Río congelado!', 'heal'); sfx.status('freeze') }
      }
      if (plan.action === 'capture') {
        const b = buildingAt(g, u.x, u.y)!
        if (visible || b.owner === who) { follow(b); await beat(350); await doCapture(u, b); await beat(300) } else capture(g, u)
      }
      u.moved = true
    }
    if (visible && !AUTO) await beat(420)
    refreshStatus()
  }
  hover = null
  for (const b of g.buildings) {
    if (g.winner !== null || b.type !== 'center' || b.owner !== g.turn) continue
    const kind = planRecruit(g, b)
    if (!kind) continue
    const u = recruit(g, b, kind)
    if (!AUTO && shown(u)) {
      panTo(u.x * T + 16, u.y * T + 16)
      await beat(300)
      dropIn(u)
      label(u, `¡${KINDS[u.kind].name} se une al rival!`, 'dmg', 250)
      await beat(800)
    }
  }
  if (g.winner !== null) return finish()
  await nextTurn()
}

// ---------- Entrada ----------

function tileFromEvent(e: MouseEvent): Pos {
  const r = canvas.getBoundingClientRect()
  return {
    x: Math.max(0, Math.min(g.w - 1, Math.floor((((e.clientX - r.left) / r.width) * canvas.width + cam.x) / T))),
    y: Math.max(0, Math.min(g.h - 1, Math.floor((((e.clientY - r.top) / r.height) * canvas.height + cam.y) / T))),
  }
}
// Tras tocar con el dedo, el navegador inventa un clic y un movimiento de ratón: se ignoran un momento
let touchedAt = -1e9
const fromTouch = () => performance.now() - touchedAt < 800
function pointAt(p: Pos) {
  if (hover && hover.x === p.x && hover.y === p.y) return false
  if (!hover) (cursor.x = p.x * T), (cursor.y = p.y * T)
  hover = p
  greet()
  refreshInfo()
  showForecast()
  return true
}
canvas.addEventListener('mousemove', (e) => {
  if (!g || fromTouch()) return
  if (e.movementX || e.movementY) setKbd(false)
  pointAt(tileFromEvent(e))
})
canvas.addEventListener('click', (e) => g && !fromTouch() && click(tileFromEvent(e)))
stage.addEventListener('mousemove', (e) => {
  if (fromTouch()) return
  const r = canvas.getBoundingClientRect()
  mouse.x = (e.clientX - r.left) / r.width
  mouse.y = (e.clientY - r.top) / r.height
  mouse.inside = !tutorial.isOpen
})
stage.addEventListener('mouseleave', () => (mouse.inside = false))

// ---------- Dedos ----------
// Un toque elige (como el clic); arrastrar mueve la cámara, con algo de inercia al soltar; dos dedos acercan o
// alejan. Eligiendo a quién atacar, el primer toque sobre un rival enseña el pronóstico y el segundo confirma.
// Durante el turno rival, dejar el dedo puesto lo acelera (como Espacio).

const fingers = new Map<number, { x: number; y: number }>()
let drag: { x: number; y: number; cx: number; cy: number; moved: boolean; vx: number; vy: number; at: number } | null = null
let pinch = 0 // distancia entre los dos dedos la última vez que cambió el zoom
const fling = { vx: 0, vy: 0 }
const spread = () => { const [a, b] = [...fingers.values()]; return Math.hypot(a.x - b.x, a.y - b.y) }
const canPan = () => g && !titleOn && !viewFit && sceneEl.hidden && mode !== 'select'

canvas.addEventListener('pointerdown', (e) => {
  if (e.pointerType === 'mouse' || !g) return
  touchedAt = performance.now()
  setTouch(true)
  setKbd(false)
  mouse.inside = false
  canvas.setPointerCapture(e.pointerId)
  fingers.set(e.pointerId, { x: e.clientX, y: e.clientY })
  fling.vx = fling.vy = 0
  if (fingers.size === 1) {
    drag = { x: e.clientX, y: e.clientY, cx: cam.tx + canvas.width / 2, cy: cam.ty + canvas.height / 2, moved: false, vx: 0, vy: 0, at: performance.now() }
    if (isAI[g.turn]) keysDown.add(' ')
  } else if (fingers.size === 2) {
    pinch = spread()
    if (drag) drag.moved = true // con dos dedos ya no es un toque
  }
})
canvas.addEventListener('pointermove', (e) => {
  const finger = fingers.get(e.pointerId)
  if (!finger) return
  touchedAt = performance.now()
  finger.x = e.clientX
  finger.y = e.clientY
  if (fingers.size === 2 && canPan()) {
    const d = spread()
    if (d > pinch * 1.4 || d < pinch / 1.4) { setZoom(d > pinch ? 1 : -1); pinch = d; drag = null }
    return
  }
  if (!drag || fingers.size !== 1) return
  const dx = e.clientX - drag.x, dy = e.clientY - drag.y
  if (!drag.moved && Math.hypot(dx, dy) < 12) return // un dedo que tiembla sigue siendo un toque
  drag.moved = true
  if (!canPan()) return
  const now = performance.now(), before = [cam.tx, cam.ty]
  panTo(drag.cx - dx / scale, drag.cy - dy / scale, true)
  const dt = Math.max(1, now - drag.at)
  drag.vx = drag.vx * 0.5 + ((cam.tx - before[0]) / dt) * 0.5
  drag.vy = drag.vy * 0.5 + ((cam.ty - before[1]) / dt) * 0.5
  drag.at = now
})
const lift = (e: PointerEvent) => {
  if (!fingers.delete(e.pointerId)) return
  touchedAt = performance.now()
  keysDown.delete(' ')
  const was = drag
  if (fingers.size === 0) drag = null
  else if (fingers.size === 1) { // se levantó uno de los dos: el que queda sigue arrastrando desde donde está
    const [rest] = [...fingers.values()]
    drag = { x: rest.x, y: rest.y, cx: cam.tx + canvas.width / 2, cy: cam.ty + canvas.height / 2, moved: true, vx: 0, vy: 0, at: performance.now() }
  }
  if (!was || fingers.size || e.type !== 'pointerup') return
  if (was.moved) { if (performance.now() - was.at < 60) (fling.vx = was.vx), (fling.vy = was.vy); return }
  tap(tileFromEvent(e))
}
canvas.addEventListener('pointerup', lift)
canvas.addEventListener('pointercancel', lift)

function tap(p: Pos) {
  if (!g || isAI[g.turn]) return
  const fresh = pointAt(p)
  if (mode === 'target' && fresh && targets.some((t) => t.x === p.x && t.y === p.y)) return sfx.cursor() // primer toque: solo el pronóstico
  buzz(8)
  void click(p)
}
// El pronóstico de daño es, con el dedo, el botón de atacar
forecastEl.onclick = () => { if (hover && mode === 'target') { buzz(8); void click(hover) } }

addEventListener('keyup', (e) => keysDown.delete(e.key.toLowerCase()))
addEventListener('blur', () => keysDown.clear())
stage.addEventListener('contextmenu', (e) => { e.preventDefault(); if (g) cancel() })
// ---------- Teclado ----------
// Todo el juego se puede manejar sin ratón: las flechas mueven el cursor del mapa o el foco de los menús, Enter
// (o Espacio, o Z) confirma y Esc (o X) vuelve atrás. `kbd` dice si lo último que se usó fue el teclado: entonces
// se enseña la barra de teclas y el ratón parado en un borde no arrastra la cámara.

const hintsEl = $('#hints'), overlayEl = $('#overlay')
let hintsFor = ''
function setKbd(on: boolean) {
  if (on) mouse.inside = false
  stage.classList.toggle('kbd', on)
}
const HINTS: Partial<Record<Mode, string>> = {
  idle: '<kbd>←↑↓→</kbd> cursor · <kbd>Enter</kbd> elegir · <kbd>Tab</kbd> siguiente · <kbd>R</kbd> zona de peligro · <kbd>P</kbd> poder · <kbd>E</kbd> fin del turno',
  inspect: '<kbd>←↑↓→</kbd> cursor · <kbd>Enter</kbd> elegir · <kbd>Esc</kbd> soltar',
  move: '<kbd>←↑↓→</kbd> destino · <kbd>Enter</kbd> mover · <kbd>Tab</kbd> siguiente · <kbd>Esc</kbd> cancelar',
  menu: '<kbd>↑↓</kbd> orden · <kbd>Enter</kbd> aceptar · <kbd>Esc</kbd> atrás',
  target: '<kbd>←→</kbd> objetivo · <kbd>Enter</kbd> atacar · <kbd>Esc</kbd> atrás',
  recruit: '<kbd>←↑↓→</kbd> elegir · <kbd>Enter</kbd> reclutar · <kbd>Esc</kbd> salir',
}
// Con el dedo no hay teclas que enseñar: la barra dice qué tocar
const TOUCH_HINTS: Partial<Record<Mode, string>> = {
  idle: 'Toca un Pokémon para moverlo · arrastra para recorrer el mapa',
  inspect: 'Toca otro Pokémon, o el mapa para soltarlo',
  move: 'Toca una casilla iluminada para ir allí',
  target: 'Toca a un rival para ver el pronóstico · otra vez para atacar',
}
const touchbar = $('#touchbar')
/** Barra de teclas del momento (la llama el bucle de pintado; solo toca el DOM cuando cambia). */
function refreshHints() {
  const touch = isTouch()
  const html = titleOn ? '' : isAI[g.turn] ? (g.winner === null ? (touch ? 'Turno rival · deja el dedo sobre el mapa para acelerar' : 'Turno rival · mantén <kbd>Espacio</kbd> para acelerar') : '') : (touch ? TOUCH_HINTS : HINTS)[mode] ?? ''
  const state = titleOn || g.winner !== null ? 'off' : isAI[g.turn] ? 'ai' : mode
  if (touchbar.dataset.mode !== state) touchbar.dataset.mode = state
  touchbar.classList.toggle('danger', !!danger)
  if (html === hintsFor) return
  hintsFor = html
  hintsEl.innerHTML = html
  hintsEl.hidden = !html
}

const DIRS: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }
/** Lleva el foco al botón visible más cercano en esa dirección; si no hay ninguno, da la vuelta por el otro lado. */
function moveFocus(host: HTMLElement, [dx, dy]: [number, number]) {
  const buttons = [...host.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')].filter((b) => b.offsetParent)
  const from = document.activeElement as HTMLButtonElement
  if (!buttons.includes(from)) return buttons[0]?.focus()
  const centre = (el: Element) => { const r = el.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2] }
  const [fx0, fy0] = centre(from)
  let best: HTMLButtonElement | null = null, bestScore = Infinity, wrap: HTMLButtonElement | null = null, wrapScore = Infinity
  for (const b of buttons) {
    if (b === from) continue
    const [x, y] = centre(b)
    const along = (x - fx0) * dx + (y - fy0) * dy, across = Math.abs((x - fx0) * dy) + Math.abs((y - fy0) * dx)
    const cone = dy ? along * 2 : along * 0.6 + 20 // de lado solo vale lo que está en la misma fila; arriba y abajo, casi todo
    if (along > 8 && across <= cone && along + across * 3 < bestScore) { bestScore = along + across * 3; best = b }
    if (along < -8 && across <= -cone + 40 && along + across * 3 < wrapScore) { wrapScore = along + across * 3; wrap = b } // el más lejano hacia atrás
  }
  ;(best ?? wrap)?.focus()
}

/** Mueve el cursor del mapa una casilla (o, eligiendo objetivo, salta al siguiente rival a tiro). */
function moveCursor([dx, dy]: [number, number]) {
  if (!hover) {
    const p = sel ?? g.units.find((u) => u.team === g.turn && !u.moved) ?? { x: Math.floor((cam.x + canvas.width / 2) / T), y: Math.floor((cam.y + canvas.height / 2) / T) }
    hover = { x: p.x, y: p.y }
    cursor.x = hover.x * T
    cursor.y = hover.y * T
  } else if (mode === 'target' && targets.length) {
    const at = targets.findIndex((t) => t.x === hover!.x && t.y === hover!.y)
    const next = targets[(at + (dx + dy > 0 ? 1 : -1) + targets.length) % targets.length]
    hover = { x: next.x, y: next.y }
  } else hover = { x: Math.max(0, Math.min(g.w - 1, hover.x + dx)), y: Math.max(0, Math.min(g.h - 1, hover.y + dy)) }
  follow(hover, 3)
  sfx.cursor()
  greet()
  refreshInfo()
  showForecast()
}
/** El Pokémon sobre el que se posa el cursor da un saltito (solo mientras se elige, no en mitad de una orden). */
function greet() {
  const u = (mode === 'idle' || mode === 'inspect') && hover ? unitShownAt(hover.x, hover.y) : undefined
  if (u && u !== sel) setFx(u, { pop: performance.now() })
}

addEventListener('keydown', (e) => {
  if (!g || e.metaKey || e.ctrlKey || e.altKey) return
  const k = e.key.length === 1 ? e.key.toLowerCase() : e.key
  const dir = DIRS[k], confirm = k === 'Enter' || k === ' ' || k === 'z', back = k === 'Escape' || k === 'x' || k === 'Backspace'
  const focused = document.activeElement instanceof HTMLButtonElement ? document.activeElement : null
  if (e.repeat && !dir) return // una tecla mantenida solo repite el movimiento del cursor: así, acelerar el turno rival con Espacio no confirma nada al volver
  if (dir || confirm || back || k === 'Tab') setKbd(true)

  // Con el tutorial abierto, las teclas de la persona pasan sus páginas; las que pulsa él mismo sí llegan al juego
  if (tutorial.isOpen && e.isTrusted) { e.preventDefault(); return tutorial.key(k) }
  if (sceneKey(k)) return e.preventDefault() // lanzando una Ball: las teclas son de esa escena
  if (story.busy) { e.preventDefault(); story.key(k); return } // mapa del mundo, informe, resultado o conversación
  if (k === 'h' || k === '?') return void tutorial.open()
  if (k === 'm') return muteBtn.click()

  const pass = document.querySelector('#pass'), overlayBtn = overlayEl.hidden ? null : overlayEl.querySelector('button')
  if (pass) return // la pantalla de pasar el ordenador tiene su propia tecla
  if (overlayBtn) { if (confirm) { e.preventDefault(); overlayBtn.click() } return } // victoria: Enter juega otra vez

  // Menús hechos de botones: título, elección de comandante y órdenes del Pokémon
  const host = mode === 'menu' ? menuEl : mode !== 'select' ? null : titleOn && !titleEl.hidden ? titleEl : !selectEl.hidden ? selectEl : null
  if (host) {
    e.preventDefault()
    if (dir) return moveFocus(host, dir)
    if (confirm) return (focused && host.contains(focused) ? focused : host.querySelector<HTMLButtonElement>('button.main, button:not(:disabled)'))?.click()
    if (back) return host === selectEl ? selectBack?.() : host === menuEl ? cancel() : undefined
    if (host === menuEl && /^[1-9]$/.test(k)) return host.querySelectorAll<HTMLButtonElement>('button')[Number(k) - 1]?.click() // el número de la orden
    if (host === titleEl) {
      if (k === 'n') titleEl.querySelector<HTMLElement>('[data-opt=fog]')!.click()
      const map = titleEl.querySelectorAll<HTMLElement>('.maps button')[Number(k) - 1]
      if (map) { map.focus(); map.click() }
    }
    return
  }
  if (mode === 'recruit' && recruitKey) {
    if (back) return cancel()
    return recruitKey(e)
  }

  // En el mapa
  keysDown.add(k.toLowerCase())
  if (k === '+' || k === '=') return setZoom(1)
  if (k === '-') return setZoom(-1)
  if (k === 'Tab') { e.preventDefault(); return nextUnit(e.shiftKey ? -1 : 1) }
  if (back) { e.preventDefault(); return cancel() }
  if (k === 'e') return finishTurn()
  if (k === 'p') return firePower()
  if (k === 'r') { danger = danger ? null : dangerZone(); sfx.select(); return }
  const onMap = mode === 'idle' || mode === 'inspect' || mode === 'move' || mode === 'target'
  if (!onMap) return
  if (dir || confirm) {
    e.preventDefault()
    focused?.blur() // que Enter no vuelva a pulsar el último botón del HUD que se tocó con el ratón
  }
  if (dir) return moveCursor(dir)
  if (confirm && hover && !isAI[g.turn]) void click(hover)
})
addEventListener('resize', resize)
/** Acerca o aleja el mapa (teclas + y −, o la rueda con Ctrl). */
function setZoom(step: number) {
  const before = scale
  zoom = Math.max(-2, Math.min(4, zoom + step))
  const centre = [cam.tx + canvas.width / 2, cam.ty + canvas.height / 2]
  resize()
  if (scale === before) zoom -= step
  localStorage.setItem('pokewars-zoom', String(zoom))
  if (g) panTo(centre[0], centre[1], true)
}
stage.addEventListener('wheel', (e) => { if (e.ctrlKey || e.metaKey) { e.preventDefault(); setZoom(e.deltaY < 0 ? 1 : -1) } }, { passive: false })
endBtn.onclick = finishTurn
powerBtn.onclick = firePower
// Botones para lo que con teclado son Esc, Tab y R
touchbar.querySelector<HTMLElement>('[data-do=back]')!.onclick = () => { buzz(8); cancel() }
touchbar.querySelector<HTMLElement>('[data-do=next]')!.onclick = () => { buzz(8); nextUnit(1) }
touchbar.querySelector<HTMLElement>('[data-do=danger]')!.onclick = () => { danger = danger ? null : dangerZone(); sfx.select() }
$('#more').onclick = () => $('#mini').classList.toggle('open')
$('.sys').addEventListener('click', () => $('#mini').classList.remove('open'))
canvas.addEventListener('pointerdown', () => $('#mini').classList.remove('open'))
onTouchChange(() => { if (titleOn) refreshTitle() })
aiBtn.onclick = () => {
  isAI[1] = !isAI[1]
  if (!g) return void (aiBtn.textContent = `Azul: ${isAI[1] ? 'IA' : 'humano'}`)
  refreshPanel()
  if (isAI[g.turn] && mode === 'idle') runAI()
}
fogBtn.onclick = () => {
  fogOn = !fogOn
  if (g) g.fog = fogOn
  fogBtn.textContent = `Niebla: ${fogOn ? 'sí' : 'no'}`
}
muteBtn.onclick = () => { toggleMute(); music.sync(); muteBtn.innerHTML = `Sonido: ${muted ? 'no' : 'sí'}`; sfx.confirm(); if (titleOn) refreshTitle() }
$('#new').onclick = async () => {
  if (mode === 'busy') return
  if (g.rules) return void story.open() // de una misión se vuelve al mapa del mundo
  await cover()
  showTitle()
  await uncover()
}

// ---------- Pantalla de carga ----------
// La Poké Ball gigante de index.html: el botón del centro marca cuánto se ha cargado y debajo van pasando consejos.

const loadingEl = $('#loading')
const TIPS = [
  'R enseña la zona de peligro de los rivales',
  'Debilita a un salvaje antes de lanzarle la Ball',
  'Los que atacan a distancia no pueden mover y pegar',
  'El Fuego quema el bosque donde se esconde el rival',
  'Mantén Espacio para acelerar el turno rival',
  'Cada estrella de terreno quita un 10% de daño',
  'H abre el tutorial en cualquier momento',
  'Quien más vida tiene, más pega',
]
let loadTotal = 0, loadDone = 0, loadShown = 0
/** Cuenta una tarea de carga: el porcentaje es las que han acabado entre las apuntadas. */
function track<V>(job: Promise<V>): Promise<V> {
  loadTotal++
  void job.then(() => loadDone++, () => loadDone++)
  return job
}
/** Enseña el progreso (suavizado, y sin retroceder aunque se apunten tareas nuevas). Acaba cuando ya se puede abrir. */
async function loadingScreen(all: Promise<unknown>) {
  if (AUTO) return void (loadingEl.hidden = true)
  let tip = Math.floor(Math.random() * TIPS.length), finished = false
  const tipEl = loadingEl.querySelector<HTMLElement>('.ld-tip')!, num = loadingEl.querySelector('.ld-btn b')!, ring = loadingEl.querySelector<HTMLElement>('.ld-btn i')!
  const nextTip = () => { tipEl.textContent = TIPS[tip++ % TIPS.length]; tipEl.style.animation = 'none'; void tipEl.offsetWidth; tipEl.style.animation = '' }
  const tips = window.setInterval(nextTip, 2600)
  const started = performance.now()
  void all.then(() => (finished = true))
  await new Promise<void>((resolve) => {
    const paint = () => {
      const target = finished ? 100 : Math.min(96, (loadDone / Math.max(1, loadTotal)) * 100)
      loadShown = Math.max(loadShown, loadShown + (target - loadShown) * 0.18)
      num.textContent = String(Math.round(loadShown))
      ring.style.setProperty('--p', loadShown.toFixed(1))
      if (finished && loadShown > 99.5 && performance.now() - started > 800) return resolve()
      requestAnimationFrame(paint)
    }
    paint()
  })
  clearInterval(tips)
  num.textContent = '100'
  ring.style.setProperty('--p', '100')
}
/** La Ball se abre por la mitad y deja ver lo que haya detrás. */
function openLoading() {
  loadingEl.classList.add('done')
  setTimeout(() => (loadingEl.hidden = true), 800)
}

async function boot() {
  const assets = Promise.all([
    track(loadImage('assets/map/atlas.png')), track(loadImage('assets/map/water.png')),
    track(fetch('assets/map/atlas.json').then((r) => r.json())),
    track(fetch('assets/species.json').then((r) => r.json())), track(loadUnits()), loadFx(track),
  ])
  const hud = track(setupHud())
  const loaded = loadingScreen(Promise.all([assets, hud, document.fonts.ready]))
  const [atlasImg, waterImg, atlasMeta, names] = await assets
  species = names
  atlas = atlasImg
  at = atlasMeta
  water = waterImg
  resize()
  void loadAudio()
  await hud
  grayAtlas = makeGray(atlas)
  windowGlow = makeWindows(atlas)
  mapFx = new Scene(mapFxCanvas, canvas.width, canvas.height)
  mapFx.start()
  initCutscenes(sceneEl, atlas, at, water, grayAtlas)
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
      catch: playCatch,
      evolve: playEvolve,
      power: (id: string) => { g.co[g.turn] = id; g.meter[g.turn] = 99; firePower() },
      win: (team: Team) => { g.winner = team; finish() },
      state: () => ({ mode, sel: sel?.kind, cam: [cam.x, cam.y], stops: stops.size }),
      // Posición en la ventana de una casilla (mueve la cámara si hace falta): la usan tools/shots.mjs y film.mjs
      screen: (x: number, y: number) => {
        panTo(x * T, y * T, true)
        const r = canvas.getBoundingClientRect()
        return [r.left + ((x * T + T / 2 - cam.x) / canvas.width) * r.width, r.top + ((y * T + T / 2 - cam.y) / canvas.height) * r.height]
      },
    },
  })
  if (AUTO) newGame()
  else { await loaded; showTitle(); openLoading() }
  // Instalar, jugar sin conexión y cambiar de versión (src/pwa.ts y public/sw.js); en desarrollo no hay service worker
  initPwa(() => (titleOn && !titleEl.hidden && mode === 'select') || !loadingEl.hidden)
}
boot()
