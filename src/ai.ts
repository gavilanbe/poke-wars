// IA sencilla (voraz): cada unidad elige la mejor jugada inmediata.
import { KINDS, RoleId, bestMove, rosterOf } from './data'
import {
  Building, Game, Pos, Unit, buildingAt, canCapture, canCounter, canRecruit, damage, dist, key,
  freezable, reachable, stoppable, targetsFrom, unitAt, wildAt,
} from './game'

export interface Plan { to: Pos; action: 'attack' | 'capture' | 'freeze' | 'wait'; target?: Unit }

export function planUnit(g: Game, u: Unit): Plan {
  const reach = reachable(g, u)
  const spots = stoppable(g, u, reach)
  let best: Plan = { to: { x: u.x, y: u.y }, action: 'wait' }
  let bestScore = -Infinity

  // Distancias reales (sin límite de movimiento) para saber hacia dónde avanzar
  const far = reachable(g, u, 999, true)
  const goals = goalsFor(g, u)
  const goalDist = (p: Pos) => {
    let d = Infinity
    for (const goal of goals) {
      // Aproximación: coste hasta el objetivo menos coste hasta la casilla
      const toGoal = far.get(key(goal.x, goal.y))?.cost ?? 60 + dist(u, goal)
      d = Math.min(d, Math.max(0, toGoal - (far.get(key(p.x, p.y))?.cost ?? 0)) + dist(p, goal) * 0.5)
    }
    return d
  }

  // Los que atacan a distancia no buscan el cuerpo a cuerpo: se colocan a tiro, sin pegarse al rival
  const k = KINDS[u.kind]
  const foes = g.units.filter((e) => e.team !== u.team)
  const standoff = (p: Pos) => {
    if (k.range[1] < 2 || !foes.length) return 0
    const nearest = Math.min(...foes.map((e) => dist(p, e)))
    return -Math.abs(nearest - k.range[1]) * 1.5 - (nearest < k.range[0] ? 6 : 0)
  }

  // Con la caja llena, perder un Pokémon importa poco (se repone): se arriesga más y los frentes no se eternizan en los vados
  const caution = g.funds[u.team] >= 20000 ? 0.25 : 1
  for (const spot of spots) {
    // El mensajero no se la juega: evita las casillas a las que algún rival llega a pegarle este turno
    const exposed = u.tag === 'vip' ? foes.filter((e) => dist(spot, e) <= KINDS[e.kind].mv + KINDS[e.kind].range[1]).length * 40 : 0
    const base = (k.range[1] < 2 ? -goalDist(spot) : -goalDist(spot) * 0.25 + standoff(spot)) + (buildingAt(g, spot.x, spot.y)?.owner === u.team && u.hp < 6 ? 4 : 0) - exposed
    const consider = (score: number, plan: Plan) => {
      if (score > bestScore) { bestScore = score; best = plan }
    }
    // Un salvaje en la hierba: quien captura va a por él
    const wild = wildAt(g, spot.x, spot.y)
    const item = g.items.some((i) => i.x === spot.x && i.y === spot.y)
    // Salvajes: quien captura va a atraparlos y quien no, a debilitarlos; y nadie deja un objeto en el suelo
    consider(base + (wild ? (k.capture ? 30 : wild.weak ? 0 : 6) : 0) + (item ? 10 : 0), { to: spot, action: 'wait' })
    // Congelar el río cuando su objetivo está al otro lado y no hay nada mejor que hacer
    if (freezable(g, u, spot).length && goalDist(spot) > 6) consider(base + 5, { to: spot, action: 'freeze' })
    if (canCapture(g, u, spot)) {
      const b = buildingAt(g, spot.x, spot.y)!
      consider(base + 40 + (b.type === 'gym' ? 100 : 0) + (b.cap - u.hp <= 0 ? 30 : 0), { to: spot, action: 'capture' })
    }
    for (const target of targetsFrom(g, u, spot)) {
      const here = { ...u, x: spot.x, y: spot.y }
      const dmg = damage(g, here, target)
      const value = (KINDS[target.kind].cost || 6000) / 1000
      let score = base + dmg * value * 2 + (dmg >= target.hp ? 25 : 0)
      if (bestMove(u.kind, target.kind) === 'fire' && 'T"'.includes(g.tiles[target.y][target.x])) score += 6 // le quema la cobertura
      if (k.heals) score = target.status ? -Infinity : base + value * 3 // el de apoyo duerme al rival más valioso que esté despierto
      if (dmg < target.hp && canCounter(here, target)) {
        const back = damage(g, { ...target, hp: target.hp - dmg }, here)
        score -= back * ((KINDS[u.kind].cost || 6000) / 1000) * 1.5 * caution
      }
      if (canCapture(g, target)) score += buildingAt(g, target.x, target.y)!.cap < 20 ? 30 : 8 // primero, los que están capturando
      if (target.tag) score += 12 // en campaña: el mensajero o el jefe son la partida
      consider(score, { to: spot, action: 'attack', target })
    }
  }
  return best
}

function goalsFor(g: Game, u: Unit): Pos[] {
  const goals: Pos[] = []
  const goal = g.rules?.goal
  if (u.tag === 'vip' && goal?.type === 'reach') return [goal] // el mensajero va a lo suyo (cuando lo lleva la IA)
  if (KINDS[u.kind].heals) { // el de apoyo sigue a los suyos, primero a los heridos
    const allies = g.units.filter((o) => o.team === u.team && !KINDS[o.kind].heals)
    const hurt = allies.filter((o) => o.hp < 8)
    if (allies.length) return hurt.length ? hurt : allies
  }
  if (KINDS[u.kind].capture) {
    goals.push(...g.wild)
    for (const b of g.buildings) {
      const o = unitAt(g, b.x, b.y)
      if (b.owner !== u.team && (!o || o === u || o.team !== u.team)) goals.push(b)
    }
  }
  if (!goals.length) {
    // Defensa: si un rival que captura ronda el gimnasio propio, va a por él antes que a por nadie
    const foes = g.units.filter((e) => e.team !== u.team)
    const gym = g.buildings.find((b) => b.type === 'gym' && b.owner === u.team)
    const threats = gym ? foes.filter((e) => KINDS[e.kind].capture && dist(e, gym) <= 6) : []
    goals.push(...(threats.length && gym && dist(u, gym) <= 12 ? threats : foes))
  }
  return goals
}

// Composición que busca la IA: cuántos quiere de cada rol antes de repetir
const WANT: [RoleId, number][] = [
  ['capturador', 3], ['luchador', 3], ['explorador', 1], ['tirador', 2], ['asaltante', 1], ['volador', 1], ['apoyo', 1],
  ['coloso', 2], ['artillero', 1], ['bombardero', 1], ['nadador', 1],
]

/** Recluta por roles: primero capturadores, luego lo que le falte de su composición y pueda pagar. */
export function planRecruit(g: Game, b: Building): string | null {
  const mine = g.units.filter((u) => u.team === g.turn)
  const count = (role: RoleId) => mine.filter((u) => KINDS[u.kind].role === role).length
  const roster = rosterOf(g.co[g.turn])
  const affordable = (role: RoleId) => {
    const kind = roster.find((k) => KINDS[k].role === role)!
    return canRecruit(g, b, kind) ? kind : null
  }
  if (count('capturador') < 2) return affordable('capturador')
  const missing = WANT.filter(([role, n]) => count(role) < n).map(([role]) => affordable(role)).filter((k): k is string => !!k)
  if (!missing.length) return null
  // Entre lo que falta, prefiere lo más caro que pueda pagar, con algo de variedad
  missing.sort((a, c) => KINDS[c].cost - KINDS[a].cost)
  return missing[Math.floor(Math.random() * Math.min(2, missing.length))]
}
