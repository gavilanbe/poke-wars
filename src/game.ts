// Estado y reglas, sin nada de DOM (se puede simular desde node: tools/sim.ts).
import {
  BUILDING_INFO, BuildingType, CAPTURE_POINTS, COMMANDERS, KINDS, MAPS, MAX_UNITS, POWER_COST, ROLE_ORDER, TUNE,
  PType, ROLES, TERRAIN, Terrain, bestMove, moveMult, rosterOf,
} from './data'

export type Team = 0 | 1
export type Status = 'burn' | 'poison' | 'para' | 'sleep' | 'freeze'
export const STATUS_NAME: Record<Status, string> = { burn: 'Quemado', poison: 'Envenenado', para: 'Paralizado', sleep: 'Dormido', freeze: 'Congelado' }
export interface Unit {
  id: number; kind: string; team: Team; x: number; y: number; hp: number; moved: boolean
  xp: number; level: number // nivel 1 a 3: al 2 evoluciona, al 3 es veterano
  status: Status | null; statusTurns: number
}
/** Un Pokémon debilitado no desaparece: vuelve al Centro y se puede recuperar a mitad de precio, con su nivel. */
export interface Fainted { kind: string; xp: number; level: number }
export interface Building { x: number; y: number; type: BuildingType; owner: -1 | Team; cap: number }
export interface Game {
  w: number
  h: number
  tiles: string[][]
  units: Unit[]
  buildings: Building[]
  turn: Team
  day: number
  funds: [number, number]
  winner: Team | null
  nextId: number
  co: [string, string] // comandante de cada equipo
  meter: [number, number]
  power: [boolean, boolean] // poder activo hasta el siguiente turno propio
  fog: boolean // niebla de guerra: solo se ve lo que queda cerca de tus Pokémon y edificios
  weather: Weather
  fainted: [Fainted[], Fainted[]]
  wild: { x: number; y: number; kind: string; weak?: boolean }[] // salvajes escondidos en la hierba alta; debilitados se atrapan seguro
  items: { x: number; y: number; type: ItemType }[] // bayas y monedas por el mapa
  map: number
  terrainVersion: number // sube cuando cambia el terreno (bosque quemado, río congelado) para repintar el mapa
}

export type ItemType = 'berry' | 'coin'
export const COIN_VALUE = 1500, BERRY_HEAL = 4, CATCH_CHANCE = 0.5
export type Weather = 'clear' | 'rain' | 'sun'
export const WEATHER_NAME: Record<Weather, string> = { clear: 'Despejado', rain: 'Lluvia', sun: 'Sol abrasador' }
export const PHASES = ['Mañana', 'Mediodía', 'Atardecer', 'Noche']
/** Momento del día: avanza una fase cada día de juego. De noche se ve una casilla menos. */
export const phaseOf = (g: Game) => (g.day - 1) % 4
const sightPenalty = (g: Game) => (phaseOf(g) === 3 ? 1 : 0) + (g.weather === 'rain' ? 1 : 0)
export interface Pos { x: number; y: number }

export function createGame(co: [string, string] = ['pikachu', 'charizard'], fog = true, map = 0): Game {
  const def = MAPS[map], MAP = def.rows
  const g: Game = {
    w: MAP[0].length, h: MAP.length, tiles: [], units: [], buildings: [], items: [], map,
    turn: 0, day: 1, funds: [0, 0], winner: null, nextId: 1,
    co, meter: [0, 0], power: [false, false], fog, weather: 'clear', fainted: [[], []], wild: [], terrainVersion: 0,
  }
  g.tiles = MAP.map((row) => [...row])
  for (const b of def.buildings) {
    const building: Building = { ...b, cap: CAPTURE_POINTS }
    for (const cell of footprint(building)) g.tiles[cell.y][cell.x] = '#'
    g.tiles[b.y][b.x] = 'B'
    g.buildings.push(building)
  }
  for (const u of def.starts) addUnit(g, rosterOf(co[u.team])[ROLE_ORDER.indexOf(u.role)], u.team, u.x, u.y).moved = false
  // Salvajes: tres en la mitad izquierda y sus espejos en la derecha
  const grass: Pos[] = []
  for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w / 2; x++) if (g.tiles[y][x] === '"') grass.push({ x, y })
  for (let i = 0; i < 3 && grass.length; i++) {
    const [p] = grass.splice(Math.floor(Math.random() * grass.length), 1)
    g.wild.push({ ...p, kind: randomWild() }, { x: g.w - 1 - p.x, y: p.y, kind: randomWild() })
  }
  // Objetos: tres en la mitad izquierda y sus espejos
  const open: Pos[] = []
  for (let y = 0; y < g.h; y++) for (let x = 2; x < g.w / 2 - 1; x++) if (g.tiles[y][x] === '.' && !unitAt(g, x, y)) open.push({ x, y })
  for (let i = 0; i < 3 && open.length; i++) {
    const [p] = open.splice(Math.floor(Math.random() * open.length), 1)
    const type: ItemType = i === 0 ? 'coin' : 'berry'
    g.items.push({ ...p, type }, { x: g.w - 1 - p.x, y: p.y, type })
  }
  g.funds[0] += income(g, 0)
  g.funds[1] += SECOND_PLAYER_BONUS // quien mueve segundo empieza con algo más de dinero para compensar
  return g
}

// Los salvajes son formas base baratas de cualquier equipo que anden por tierra
const WILD_KINDS = Object.keys(KINDS).filter((k) => KINDS[k].cost > 0 && KINDS[k].cost <= 4500 && KINDS[k].move === 'walk' && !KINDS[k].heals)
const randomWild = () => WILD_KINDS[Math.floor(Math.random() * WILD_KINDS.length)]
export const wildAt = (g: Game, x: number, y: number) => g.wild.find((w) => w.x === x && w.y === y)

export const SECOND_PLAYER_BONUS = 4500
export const key = (x: number, y: number) => y * 100 + x
export const terrainAt = (g: Game, x: number, y: number): Terrain => TERRAIN[g.tiles[y][x]]
export const unitAt = (g: Game, x: number, y: number) => g.units.find((u) => u.x === x && u.y === y)
export const buildingAt = (g: Game, x: number, y: number) => g.buildings.find((b) => b.x === x && b.y === y)
export const income = (g: Game, team: Team) =>
  g.buildings.filter((b) => b.owner === team).reduce((sum, b) => sum + BUILDING_INFO[b.type].income, 0)

/** Casillas que ocupa el edificio (dos filas); la de la puerta es `b.x, b.y`. */
export function footprint(b: { type: BuildingType; x: number; y: number }): Pos[] {
  const info = BUILDING_INFO[b.type]
  const cells: Pos[] = []
  for (let dy = -1; dy <= 0; dy++) for (let i = 0; i < info.w; i++) cells.push({ x: b.x - info.door + i, y: b.y + dy })
  return cells
}
export const dist = (a: Pos, b: Pos) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y)

function addUnit(g: Game, kind: string, team: Team, x: number, y: number): Unit {
  const u: Unit = { id: g.nextId++, kind, team, x, y, hp: 10, moved: true, xp: 0, level: KINDS[kind].cost ? 1 : 2, status: null, statusTurns: 0 }
  g.units.push(u)
  return u
}

/** Modificador del comandante: 0 ataque, 1 defensa, 2 movimiento. */
const coMod = (g: Game, team: Team, stat: 'atk' | 'def' | 'mv') =>
  COMMANDERS[g.co[team]][stat][g.power[team] ? 1 : 0] * (stat === 'mv' ? 1 : TUNE[g.co[team]])
export const moveRange = (g: Game, u: Unit) => {
  const mv = KINDS[u.kind].mv + coMod(g, u.team, 'mv')
  return u.status === 'para' ? Math.ceil(mv / 2) : mv // paralizado: la mitad
}

// ---------- Niebla de guerra ----------

const COVER = 'T"' // en bosque y hierba alta solo te ven si están pegados a ti
const BUILDING_SIGHT = 2

/** Casillas que ve un equipo: alrededor de sus Pokémon (según su vista) y de sus edificios. */
export function visibleCells(g: Game, team: Team): Set<number> {
  const seen = new Set<number>()
  const look = (cx: number, cy: number, range: number) => {
    for (let dy = -range; dy <= range; dy++) {
      for (let dx = -(range - Math.abs(dy)); dx <= range - Math.abs(dy); dx++) {
        const x = cx + dx, y = cy + dy
        if (x >= 0 && y >= 0 && x < g.w && y < g.h) seen.add(key(x, y))
      }
    }
  }
  const penalty = sightPenalty(g)
  for (const u of g.units) if (u.team === team) look(u.x, u.y, Math.max(1, KINDS[u.kind].vision - penalty))
  for (const b of g.buildings) if (b.owner === team) look(b.x, b.y, BUILDING_SIGHT)
  return seen
}

/** ¿Ve ese equipo a la unidad? Sin niebla, siempre. */
export function canSee(g: Game, team: Team, u: Unit, cells = visibleCells(g, team)): boolean {
  if (!g.fog || u.team === team) return true
  if (!cells.has(key(u.x, u.y))) return false
  if (!COVER.includes(g.tiles[u.y][u.x])) return true
  return g.units.some((o) => o.team === team && dist(o, u) <= 1)
}

/**
 * Recorre la ruta casilla a casilla: si aparece un rival que no se veía, la unidad se queda en la última casilla
 * libre y pierde el turno (emboscada).
 */
export function resolvePath(g: Game, u: Unit, path: Pos[]): { path: Pos[]; ambushed: boolean } {
  for (let i = 1; i < path.length; i++) {
    const other = unitAt(g, path[i].x, path[i].y)
    if (!other || other.team === u.team) continue
    let end = i - 1
    while (end > 0 && unitAt(g, path[end].x, path[end].y)) end--
    return { path: path.slice(0, end + 1), ambushed: true }
  }
  return { path, ambushed: false }
}

export interface Reach { cost: number; prev: number | null; x: number; y: number }

/** Casillas alcanzables por la unidad (Dijkstra). `budget` permite calcular rutas largas para la IA. */
export function reachable(g: Game, u: Unit, budget = moveRange(g, u), ignoreUnits = false): Map<number, Reach> {
  const move = KINDS[u.kind].move
  const cells = g.fog ? visibleCells(g, u.team) : undefined
  const out = new Map<number, Reach>([[key(u.x, u.y), { cost: 0, prev: null, x: u.x, y: u.y }]])
  const open: Reach[] = [out.get(key(u.x, u.y))!]
  while (open.length) {
    open.sort((a, b) => a.cost - b.cost)
    const cur = open.shift()!
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const x = cur.x + dx, y = cur.y + dy
      if (x < 0 || y < 0 || x >= g.w || y >= g.h) continue
      const cost = cur.cost + terrainAt(g, x, y).cost[move]
      if (cost > budget) continue
      const other = ignoreUnits ? undefined : unitAt(g, x, y)
      if (other && other.team !== u.team && canSee(g, u.team, other, cells)) continue // a los que no ves no los esquivas
      const k = key(x, y)
      const seen = out.get(k)
      if (seen && seen.cost <= cost) continue
      const node: Reach = { cost, prev: key(cur.x, cur.y), x, y }
      out.set(k, node)
      open.push(node)
    }
  }
  return out
}

/** Quita las casillas donde no se puede parar (ocupadas por un aliado). */
export function stoppable(g: Game, u: Unit, reach: Map<number, Reach>): Reach[] {
  return [...reach.values()].filter((r) => {
    const o = unitAt(g, r.x, r.y)
    return g.tiles[r.y][r.x] !== '#' && (!o || o === u || !canSee(g, u.team, o))
  })
}

export function pathTo(reach: Map<number, Reach>, x: number, y: number): Pos[] {
  const path: Pos[] = []
  let node = reach.get(key(x, y))
  while (node) {
    path.unshift({ x: node.x, y: node.y })
    node = node.prev === null ? undefined : reach.get(node.prev)
  }
  return path
}

export const isRanged = (u: Unit) => KINDS[u.kind].range[0] > 1

/** Enemigos a los que la unidad puede atacar desde `from`. Los de ataque a distancia no pueden mover y atacar. */
export function targetsFrom(g: Game, u: Unit, from: Pos): Unit[] {
  if (isRanged(u) && (from.x !== u.x || from.y !== u.y)) return []
  const [min, max] = KINDS[u.kind].range
  const cells = g.fog ? visibleCells(g, u.team) : undefined
  return g.units.filter((e) => e.team !== u.team && dist(from, e) >= min && dist(from, e) <= max && canSee(g, u.team, e, cells))
}

/** Aliados del atacante pegados al objetivo (sin contarle a él): cada uno suma un 10% de daño, hasta dos. */
export const flankers = (g: Game, att: Unit, def: Unit) =>
  Math.min(2, g.units.filter((o) => o.team === att.team && o.id !== att.id && dist(o, def) === 1).length)

/** El sol aviva el fuego y apaga el agua; la lluvia, al revés, y además carga los ataques eléctricos. */
export function weatherBonus(g: Game, type: string): number {
  if (g.weather === 'sun') return type === 'fire' ? 1.2 : type === 'water' ? 0.8 : 1
  if (g.weather === 'rain') return type === 'water' || type === 'electric' ? 1.2 : type === 'fire' ? 0.8 : 1
  return 1
}

/** Veteranía: el nivel 3 da un 10%; un nivel 2 sin evolución, un 15% (lo que ganaría evolucionando). */
const levelBonus = (u: Unit) => (u.level >= 3 && !KINDS[u.kind].final ? 1.1 : 1) * (u.level >= 2 && KINDS[u.kind].evolves === undefined && KINDS[u.kind].cost > 0 ? 1.15 : 1)

export function damage(g: Game, att: Unit, def: Unit, attHp = att.hp, crit = false): number {
  const a = KINDS[att.kind], d = KINDS[def.kind]
  if (a.heals) return 0 // el de apoyo no hace daño: duerme
  const move = bestMove(att.kind, def.kind)
  const stars = d.move === 'fly' ? 0 : terrainAt(g, def.x, def.y).def
  const co = (coMod(g, att.team, 'atk') * levelBonus(att)) / (coMod(g, def.team, 'def') * levelBonus(def))
  const extra = (1 + 0.1 * flankers(g, att, def)) * weatherBonus(g, move) * (crit ? 1.5 : 1)
  const raw = co * extra * (a.atk / d.def) * 5 * moveMult(att.kind, move, def.kind) * (attHp / 10) * (1 - 0.1 * stars)
  return Math.max(0, Math.min(def.hp, Math.round(raw)))
}

/** ¿Puede `def` contraatacar a `att`? Solo cuerpo a cuerpo contra cuerpo a cuerpo, y despierto. */
export const canCounter = (att: Unit, def: Unit) =>
  !isRanged(att) && !isRanged(def) && dist(att, def) === 1 && !KINDS[def.kind].heals && !KINDS[att.kind].heals && def.status !== 'sleep' && def.status !== 'freeze'

export interface AttackResult {
  dmg: number; counter: number | null; evolved: Unit | null; crit: boolean
  move: PType // el ataque que ha usado
  status: Status | null // estado que le deja al defensor
  burned: boolean // el fuego ha quemado el bosque o la hierba donde estaba el defensor
}
export const CRIT_CHANCE = 0.12
// Probabilidad de dejar un estado según el tipo del ataque, y cuántos turnos dura
const INFLICT: Partial<Record<PType, [Status, number, number]>> = {
  fire: ['burn', 0.25, 3], poison: ['poison', 0.35, 3], electric: ['para', 0.25, 2], ice: ['freeze', 0.15, 1],
}

export function attack(g: Game, att: Unit, def: Unit): AttackResult {
  const crit = Math.random() < CRIT_CHANCE // golpe crítico: daño x1,5
  const move = bestMove(att.kind, def.kind)
  const res: AttackResult = { dmg: damage(g, att, def, att.hp, crit), counter: null, evolved: null, crit, move, status: null, burned: false }
  def.hp -= res.dmg
  charge(g, att.team, res.dmg * 0.5)
  charge(g, def.team, res.dmg)
  // El fuego arrasa el bosque o la hierba alta donde está el rival
  if (move === 'fire' && !KINDS[att.kind].heals && 'T"'.includes(g.tiles[def.y][def.x])) {
    g.tiles[def.y][def.x] = '.'
    g.wild = g.wild.filter((w) => w.x !== def.x || w.y !== def.y)
    g.terrainVersion++
    res.burned = true
  }
  if (def.hp <= 0) {
    kill(g, def)
    res.evolved = gainXp(att, res.dmg + 5)
  } else {
    // Estados: el de apoyo duerme siempre; los ataques de fuego, veneno, eléctricos y de hielo, a veces
    const inflict: [Status, number, number] | undefined = KINDS[att.kind].heals ? ['sleep', 1, 1] : INFLICT[move]
    if (inflict && !def.status && Math.random() < inflict[1]) {
      def.status = res.status = inflict[0]
      def.statusTurns = inflict[2]
    }
    res.evolved = gainXp(att, res.dmg)
    if (canCounter(att, def)) {
      res.counter = damage(g, def, att)
      att.hp -= res.counter
      charge(g, def.team, res.counter * 0.5)
      charge(g, att.team, res.counter)
      if (att.hp <= 0) kill(g, att)
      res.evolved = gainXp(def, res.counter + (att.hp <= 0 ? 5 : 0)) ?? (att.hp > 0 ? res.evolved : null)
    }
  }
  att.moved = true
  checkRout(g)
  return res
}

export const XP_LEVEL = [0, 10, 26] // experiencia para nivel 2 y nivel 3

/** Suma experiencia (PS de daño hechos, +5 por debilitar). Devuelve la unidad si evoluciona. */
function gainXp(u: Unit, amount: number): Unit | null {
  u.xp += amount
  let evolved: Unit | null = null
  while (u.level < 3 && u.xp >= XP_LEVEL[u.level]) {
    u.level++
    const next = KINDS[u.kind].evolves
    if (next) { u.kind = next; evolved = u } // al 2 evoluciona y, si tiene tercera fase, al 3 otra vez
  }
  return evolved
}

function kill(g: Game, u: Unit) {
  g.units = g.units.filter((o) => o !== u)
  g.fainted[u.team].push({ kind: u.kind, xp: u.xp, level: u.level })
  const b = buildingAt(g, u.x, u.y)
  if (b) b.cap = CAPTURE_POINTS
}

function checkRout(g: Game) {
  if (g.winner !== null) return
  for (const team of [0, 1] as Team[]) {
    if (!g.units.some((u) => u.team === team)) g.winner = (1 - team) as Team
  }
}

export interface MoveEvent {
  caught?: Unit // salvaje atrapado
  wild?: 'weak' | 'escaped' // debilitado por un Pokémon que no captura, o se escapó de la Ball
  item?: ItemType // objeto recogido
}

/**
 * Mueve la unidad y resuelve lo que encuentre en la casilla:
 * - un objeto: la baya cura y quita el estado; la moneda da dinero;
 * - un salvaje en la hierba: quien no captura lo debilita; quien captura lo atrapa (seguro si está debilitado, a
 *   cara o cruz si no) y el salvaje se une al equipo en una casilla de al lado.
 */
export function moveUnit(g: Game, u: Unit, x: number, y: number): MoveEvent | null {
  if (u.x === x && u.y === y) return null
  const b = buildingAt(g, u.x, u.y)
  if (b) b.cap = CAPTURE_POINTS
  u.x = x
  u.y = y
  const ev: MoveEvent = {}
  const item = g.items.find((i) => i.x === x && i.y === y)
  if (item) {
    g.items = g.items.filter((i) => i !== item)
    if (item.type === 'coin') g.funds[u.team] += COIN_VALUE
    else { u.hp = Math.min(10, u.hp + BERRY_HEAL); u.status = null }
    ev.item = item.type
  }
  const wild = wildAt(g, x, y)
  if (wild) {
    if (!KINDS[u.kind].capture) {
      if (!wild.weak) { wild.weak = true; ev.wild = 'weak' }
    } else if (g.units.filter((o) => o.team === u.team).length < MAX_UNITS) {
      const spot = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dy]) => ({ x: x + dx, y: y + dy }))
        .find((p) => p.x >= 0 && p.y >= 0 && p.x < g.w && p.y < g.h && TERRAIN[g.tiles[p.y][p.x]].cost.walk < 9 && !unitAt(g, p.x, p.y))
      if (spot && (wild.weak || Math.random() < CATCH_CHANCE)) {
        g.wild = g.wild.filter((w) => w !== wild)
        ev.caught = addUnit(g, wild.kind, u.team, spot.x, spot.y)
        ev.caught.hp = wild.weak ? 5 : 8
      } else if (spot) ev.wild = 'escaped'
    }
  }
  return ev.caught || ev.wild || ev.item ? ev : null
}

/** ¿Puede congelar el agua de alrededor? Solo quien tenga un ataque de hielo, y si hay agua libre al lado. */
export function freezable(g: Game, u: Unit, at: Pos = u): Pos[] {
  if (!KINDS[u.kind].moves.includes('ice')) return []
  return [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dy]) => ({ x: at.x + dx, y: at.y + dy }))
    .filter((p) => g.tiles[p.y]?.[p.x] === '~' && !unitAt(g, p.x, p.y))
}

/** Congela el agua de alrededor: se puede cruzar a pie hasta que salga el sol. Gasta el turno. */
export function freeze(g: Game, u: Unit): Pos[] {
  const cells = freezable(g, u)
  for (const p of cells) g.tiles[p.y][p.x] = 'i'
  if (cells.length) g.terrainVersion++
  u.moved = true
  return cells
}

export function canCapture(g: Game, u: Unit, at: Pos = u): boolean {
  const b = buildingAt(g, at.x, at.y)
  return !!KINDS[u.kind].capture && !!b && b.owner !== u.team
}

/** Devuelve true si el edificio cambia de dueño. */
export function capture(g: Game, u: Unit): boolean {
  const b = buildingAt(g, u.x, u.y)!
  u.moved = true
  b.cap -= u.hp
  if (b.cap > 0) return false
  b.owner = u.team
  b.cap = CAPTURE_POINTS
  if (b.type === 'gym') g.winner = u.team
  return true
}

/** Un debilitado del mismo rol esperando en el Centro, si lo hay. */
const benched = (g: Game, kind: string) => g.fainted[g.turn].find((f) => KINDS[f.kind].role === KINDS[kind].role && KINDS[f.kind].commander === KINDS[kind].commander)
/** Lo que cuesta traer ese Pokémon: la mitad si es recuperar a uno debilitado. */
export const recruitCost = (g: Game, kind: string) => (benched(g, kind) ? KINDS[kind].cost / 2 : KINDS[kind].cost)
export const isRecovery = (g: Game, kind: string) => !!benched(g, kind)

/** Solo se reclutan los Pokémon del comandante propio, con dinero, la puerta libre y sin pasar del tope de unidades. */
export function canRecruit(g: Game, b: Building, kind: string): boolean {
  return b.type === 'center' && b.owner === g.turn && !unitAt(g, b.x, b.y) && g.funds[g.turn] >= recruitCost(g, kind) &&
    KINDS[kind].commander === g.co[g.turn] && KINDS[kind].cost > 0 && g.units.filter((u) => u.team === g.turn).length < MAX_UNITS
}

export function recruit(g: Game, b: Building, kind: string): Unit {
  g.funds[g.turn] -= recruitCost(g, kind)
  const back = benched(g, kind)
  if (!back) return addUnit(g, kind, g.turn, b.x, b.y)
  g.fainted[g.turn].splice(g.fainted[g.turn].indexOf(back), 1)
  const u = addUnit(g, back.kind, g.turn, b.x, b.y) // vuelve con su evolución y su experiencia
  u.xp = back.xp
  u.level = back.level
  return u
}

function charge(g: Game, team: Team, amount: number) {
  if (!g.power[team]) g.meter[team] = Math.min(POWER_COST, g.meter[team] + amount)
}

export const canUsePower = (g: Game, team: Team = g.turn) => g.meter[team] >= POWER_COST && !g.power[team]

/** Activa el súper poder del comandante. Devuelve las unidades afectadas y cuánto cambia su vida. */
export function usePower(g: Game): { unit: Unit; hp: number }[] {
  const team = g.turn
  g.meter[team] = 0
  g.power[team] = true
  const mine = g.units.filter((u) => u.team === team), foes = g.units.filter((u) => u.team !== team)
  const change = (units: Unit[], amount: number) => units.map((unit) => {
    const hp = Math.max(1, Math.min(10, unit.hp + amount)) - unit.hp
    unit.hp += hp
    return { unit, hp }
  })
  switch (g.co[team]) {
    case 'pikachu': return change(mine, 3)
    case 'blastoise': return change(mine, 1)
    case 'gengar': return change(foes, -1)
    case 'venusaur': return change(mine, 2)
    case 'tyranitar': return change(foes, -1)
    case 'gardevoir': return change(mine, 1)
    default: return change(mine, 0)
  }
}

export function endTurn(g: Game) {
  for (const u of g.units) if (u.team === g.turn && (u.status === 'sleep' || u.status === 'freeze') && u.statusTurns <= 0) u.status = null
  g.turn = (1 - g.turn) as Team
  g.power[g.turn] = false
  // El tiempo cambia cada tres días
  if (g.turn === 0 && g.day % 3 === 0) g.weather = (['clear', 'rain', 'sun', 'clear'] as Weather[])[Math.floor(Math.random() * 4)]
  if (g.turn === 0) g.day++
  if (g.turn === 0 && g.weather === 'sun') { // el sol derrite el hielo
    let melted = false
    for (const row of g.tiles) for (let x = 0; x < row.length; x++) if (row[x] === 'i' && !g.units.some((u) => u.x === x && g.tiles[u.y] === row)) { row[x] = '~'; melted = true }
    if (melted) g.terrainVersion++
  }
  if (g.turn === 0 && g.day % 3 === 0 && g.items.length < 8) { // cada tres días aparece un objeto
    const spots: Pos[] = []
    for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) if (g.tiles[y][x] === '.' && !unitAt(g, x, y) && !g.items.some((i) => i.x === x && i.y === y)) spots.push({ x, y })
    if (spots.length) g.items.push({ ...spots[Math.floor(Math.random() * spots.length)], type: Math.random() < 0.35 ? 'coin' : 'berry' })
  }
  if (g.turn === 0 && g.day % 4 === 0) { // cada cuatro días aparece otro salvaje en la hierba alta
    const free: Pos[] = []
    for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) if (g.tiles[y][x] === '"' && !unitAt(g, x, y) && !wildAt(g, x, y)) free.push({ x, y })
    if (free.length && g.wild.length < 8) g.wild.push({ ...free[Math.floor(Math.random() * free.length)], kind: randomWild() })
  }
  g.funds[g.turn] += income(g, g.turn)
  for (const u of g.units) {
    u.moved = false
    if (u.team !== g.turn) continue
    const tile = g.tiles[u.y][u.x], k = KINDS[u.kind]
    if (buildingAt(g, u.x, u.y)?.owner === u.team) { // en un edificio propio: cura y quita estados
      u.hp = Math.min(10, u.hp + 2)
      u.status = null
    }
    // Cada tipo en su terreno: los de agua se curan en el agua y los de planta, en la hierba y el bosque
    if ((k.types.includes('water') && '~s'.includes(tile)) || (k.types.includes('grass') && 'T"'.includes(tile))) u.hp = Math.min(10, u.hp + 1)
    // Estados
    if (u.status === 'burn' || u.status === 'poison') u.hp = Math.max(1, u.hp - 1)
    if (u.status === 'sleep' || u.status === 'freeze') u.moved = true // pierde este turno
    if (u.status && --u.statusTurns <= 0 && u.status !== 'sleep' && u.status !== 'freeze') u.status = null
  }
  // Los de apoyo curan 2 PS a cada aliado que tengan pegado (una vez por aliado)
  const healers = g.units.filter((u) => u.team === g.turn && KINDS[u.kind].heals)
  for (const u of g.units) {
    if (u.team === g.turn && !KINDS[u.kind].heals && healers.some((h) => dist(h, u) === 1)) u.hp = Math.min(10, u.hp + 2)
  }
}
