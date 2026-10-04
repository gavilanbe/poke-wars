// IA sencilla (voraz): cada unidad elige la mejor jugada inmediata.
import { KINDS, RECRUITABLE } from './data'
import {
  Building, Game, Pos, Unit, buildingAt, canCapture, canCounter, canRecruit, damage, dist, key,
  reachable, stoppable, targetsFrom, unitAt,
} from './game'

export interface Plan { to: Pos; action: 'attack' | 'capture' | 'wait'; target?: Unit }

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

  for (const spot of spots) {
    const base = -goalDist(spot) + (buildingAt(g, spot.x, spot.y)?.owner === u.team && u.hp < 6 ? 4 : 0)
    const consider = (score: number, plan: Plan) => {
      if (score > bestScore) { bestScore = score; best = plan }
    }
    consider(base, { to: spot, action: 'wait' })
    if (canCapture(g, u, spot)) {
      const b = buildingAt(g, spot.x, spot.y)!
      consider(base + 40 + (b.type === 'gym' ? 100 : 0) + (b.cap - u.hp <= 0 ? 30 : 0), { to: spot, action: 'capture' })
    }
    for (const target of targetsFrom(g, u, spot)) {
      const here = { ...u, x: spot.x, y: spot.y }
      const dmg = damage(g, here, target)
      const value = (KINDS[target.kind].cost || 6000) / 1000
      let score = base + dmg * value * 2 + (dmg >= target.hp ? 25 : 0)
      if (dmg < target.hp && canCounter(here, target)) {
        const back = damage(g, { ...target, hp: target.hp - dmg }, here)
        score -= back * ((KINDS[u.kind].cost || 6000) / 1000) * 1.5
      }
      if (canCapture(g, target) && buildingAt(g, target.x, target.y)!.cap < 20) score += 20
      consider(score, { to: spot, action: 'attack', target })
    }
  }
  return best
}

function goalsFor(g: Game, u: Unit): Pos[] {
  const goals: Pos[] = []
  if (KINDS[u.kind].capture) {
    for (const b of g.buildings) {
      const o = unitAt(g, b.x, b.y)
      if (b.owner !== u.team && (!o || o === u || o.team !== u.team)) goals.push(b)
    }
  }
  if (!goals.length) goals.push(...g.units.filter((e) => e.team !== u.team))
  return goals
}

export function planRecruit(g: Game, b: Building): string | null {
  const mine = g.units.filter((u) => u.team === g.turn)
  const capturers = mine.filter((u) => KINDS[u.kind].capture).length
  const options = RECRUITABLE.filter((k) => canRecruit(g, b, k) && KINDS[k].move !== 'swim')
  if (!options.length) return null
  if (capturers < 3) {
    const cheap = options.filter((k) => KINDS[k].capture)
    if (cheap.length) return cheap[Math.floor(Math.random() * cheap.length)]
  }
  // Prefiere lo más caro que pueda pagar, con algo de variedad
  options.sort((a, c) => KINDS[c].cost - KINDS[a].cost)
  return options[Math.floor(Math.random() * Math.min(3, options.length))]
}
