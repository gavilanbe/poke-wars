// Estado y reglas, sin nada de DOM (se puede simular desde node: tools/sim.ts).
import {
  BUILDINGS, BUILDING_INFO, BuildingType, CAPTURE_POINTS, COMMANDERS, KINDS, MAP, MAX_UNITS, POWER_COST, ROLE_ORDER, START_UNITS,
  TERRAIN, Terrain, rosterOf,
  effectiveness,
} from './data'

export type Team = 0 | 1
export interface Unit { id: number; kind: string; team: Team; x: number; y: number; hp: number; moved: boolean }
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
}

export type Weather = 'clear' | 'rain' | 'sun'
export const WEATHER_NAME: Record<Weather, string> = { clear: 'Despejado', rain: 'Lluvia', sun: 'Sol abrasador' }
export const PHASES = ['Mañana', 'Mediodía', 'Atardecer', 'Noche']
/** Momento del día: avanza una fase cada día de juego. De noche se ve una casilla menos. */
export const phaseOf = (g: Game) => (g.day - 1) % 4
const sightPenalty = (g: Game) => (phaseOf(g) === 3 ? 1 : 0) + (g.weather === 'rain' ? 1 : 0)
export interface Pos { x: number; y: number }

export function createGame(co: [string, string] = ['pikachu', 'charizard'], fog = true): Game {
  const g: Game = {
    w: MAP[0].length, h: MAP.length, tiles: [], units: [], buildings: [],
    turn: 0, day: 1, funds: [0, 0], winner: null, nextId: 1,
    co, meter: [0, 0], power: [false, false], fog, weather: 'clear',
  }
  g.tiles = MAP.map((row) => [...row])
  for (const def of BUILDINGS) {
    const building: Building = { ...def, cap: CAPTURE_POINTS }
    for (const cell of footprint(building)) g.tiles[cell.y][cell.x] = '#'
    g.tiles[def.y][def.x] = 'B'
    g.buildings.push(building)
  }
  for (const u of START_UNITS) addUnit(g, rosterOf(co[u.team])[ROLE_ORDER.indexOf(u.role)], u.team, u.x, u.y).moved = false
  g.funds[0] += income(g, 0)
  g.funds[1] += SECOND_PLAYER_BONUS // quien mueve segundo empieza con algo más de dinero para compensar
  return g
}

export const SECOND_PLAYER_BONUS = 3000
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
  const u: Unit = { id: g.nextId++, kind, team, x, y, hp: 10, moved: true }
  g.units.push(u)
  return u
}

/** Modificador del comandante: 0 ataque, 1 defensa, 2 movimiento. */
const coMod = (g: Game, team: Team, stat: 'atk' | 'def' | 'mv') => COMMANDERS[g.co[team]][stat][g.power[team] ? 1 : 0]
export const moveRange = (g: Game, u: Unit) => KINDS[u.kind].mv + coMod(g, u.team, 'mv')

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

/** El sol aviva el fuego y apaga el agua; la lluvia, al revés. */
export function weatherBonus(g: Game, type: string): number {
  if (g.weather === 'sun') return type === 'fire' ? 1.2 : type === 'water' ? 0.8 : 1
  if (g.weather === 'rain') return type === 'water' ? 1.2 : type === 'fire' ? 0.8 : 1
  return 1
}

export function damage(g: Game, att: Unit, def: Unit, attHp = att.hp, crit = false): number {
  const a = KINDS[att.kind], d = KINDS[def.kind]
  const stars = d.move === 'fly' ? 0 : terrainAt(g, def.x, def.y).def
  const co = coMod(g, att.team, 'atk') / coMod(g, def.team, 'def')
  const extra = (1 + 0.1 * flankers(g, att, def)) * weatherBonus(g, a.type) * (crit ? 1.5 : 1)
  const raw = co * extra * (a.atk / d.def) * 5 * effectiveness(a.type, d.type) * (attHp / 10) * (1 - 0.1 * stars)
  return Math.max(0, Math.min(def.hp, Math.round(raw)))
}

/** ¿Puede `def` contraatacar a `att`? Solo cuerpo a cuerpo contra cuerpo a cuerpo. */
export const canCounter = (att: Unit, def: Unit) => !isRanged(att) && !isRanged(def) && dist(att, def) === 1

export interface AttackResult { dmg: number; counter: number | null; evolved: Unit | null; crit: boolean }
export const CRIT_CHANCE = 0.12

export function attack(g: Game, att: Unit, def: Unit): AttackResult {
  const crit = Math.random() < CRIT_CHANCE // golpe crítico: daño x1,5
  const res: AttackResult = { dmg: damage(g, att, def, att.hp, crit), counter: null, evolved: null, crit }
  def.hp -= res.dmg
  charge(g, att.team, res.dmg * 0.5)
  charge(g, def.team, res.dmg)
  if (def.hp <= 0) {
    kill(g, def)
    res.evolved = evolve(att)
  } else if (canCounter(att, def)) {
    res.counter = damage(g, def, att)
    att.hp -= res.counter
    charge(g, def.team, res.counter * 0.5)
    charge(g, att.team, res.counter)
    if (att.hp <= 0) {
      kill(g, att)
      res.evolved = evolve(def)
    }
  }
  att.moved = true
  checkRout(g)
  return res
}

function evolve(u: Unit): Unit | null {
  const next = KINDS[u.kind].evolves
  if (!next) return null
  u.kind = next
  return u
}

function kill(g: Game, u: Unit) {
  g.units = g.units.filter((o) => o !== u)
  const b = buildingAt(g, u.x, u.y)
  if (b) b.cap = CAPTURE_POINTS
}

function checkRout(g: Game) {
  if (g.winner !== null) return
  for (const team of [0, 1] as Team[]) {
    if (!g.units.some((u) => u.team === team)) g.winner = (1 - team) as Team
  }
}

export function moveUnit(g: Game, u: Unit, x: number, y: number) {
  if (u.x === x && u.y === y) return
  const b = buildingAt(g, u.x, u.y)
  if (b) b.cap = CAPTURE_POINTS
  u.x = x
  u.y = y
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

/** Solo se reclutan los Pokémon del comandante propio, con dinero, la puerta libre y sin pasar del tope de unidades. */
export function canRecruit(g: Game, b: Building, kind: string): boolean {
  return b.type === 'center' && b.owner === g.turn && !unitAt(g, b.x, b.y) && g.funds[g.turn] >= KINDS[kind].cost &&
    KINDS[kind].commander === g.co[g.turn] && KINDS[kind].cost > 0 && g.units.filter((u) => u.team === g.turn).length < MAX_UNITS
}

export function recruit(g: Game, b: Building, kind: string): Unit {
  g.funds[g.turn] -= KINDS[kind].cost
  return addUnit(g, kind, g.turn, b.x, b.y)
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
    case 'gengar': return change(foes, -2)
    case 'venusaur': return change(mine, 2)
    case 'tyranitar': return change(foes, -1)
    case 'gardevoir': return change(mine, 1)
    default: return change(mine, 0)
  }
}

export function endTurn(g: Game) {
  g.turn = (1 - g.turn) as Team
  g.power[g.turn] = false
  // El tiempo cambia cada tres días
  if (g.turn === 0 && g.day % 3 === 0) g.weather = (['clear', 'rain', 'sun', 'clear'] as Weather[])[Math.floor(Math.random() * 4)]
  if (g.turn === 0) g.day++
  g.funds[g.turn] += income(g, g.turn)
  for (const u of g.units) {
    u.moved = false
    if (u.team === g.turn && buildingAt(g, u.x, u.y)?.owner === u.team) u.hp = Math.min(10, u.hp + 2)
  }
  // Los de apoyo curan 2 PS a cada aliado que tengan pegado (una vez por aliado)
  const healers = g.units.filter((u) => u.team === g.turn && KINDS[u.kind].heals)
  for (const u of g.units) {
    if (u.team === g.turn && !KINDS[u.kind].heals && healers.some((h) => dist(h, u) === 1)) u.hp = Math.min(10, u.hp + 2)
  }
}
