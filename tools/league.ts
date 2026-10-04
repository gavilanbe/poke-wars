// Liga de IA contra IA sin gráficos: la usan tools/sim.ts (informe) y tools/tune.ts (afinador).
import { planRecruit, planUnit } from '../src/ai'
import { attack, canUsePower, capture, createGame, endTurn, moveUnit, pathTo, reachable, recruit, resolvePath, usePower } from '../src/game'

import { COMMANDERS, KINDS, ROLES } from '../src/data'


export interface LeagueResult {
  total: number; first: number; unfinished: number; days: number
  wins: Record<string, number>; games: Record<string, number>; versus: Record<string, Record<string, number>>
  roleStats: Record<string, { bought: number; kills: number; deaths: number; dealt: number; taken: number }>
}

/** Juega todos contra todos (cada pareja, de rojo y de azul) las rondas que se pidan. */
export function league(ROUNDS: number): LeagueResult {
  const ids = Object.keys(COMMANDERS)
  const zero = () => Object.fromEntries(ids.map((id) => [id, 0])) as Record<string, number>
  const wins = zero(), games = zero()
  const versus: Record<string, Record<string, number>> = Object.fromEntries(ids.map((id) => [id, zero()]))
  const roleStats: Record<string, { bought: number; kills: number; deaths: number; dealt: number; taken: number }> = {}
  const role = (kind: string) => (roleStats[KINDS[kind].role] ??= { bought: 0, kills: 0, deaths: 0, dealt: 0, taken: 0 })
  let first = 0, total = 0, unfinished = 0, days = 0
  for (let round = 0; round < ROUNDS; round++) for (const red of ids) for (const blue of ids) {
    if (red === blue) continue
    const g = createGame([red, blue])
    let turns = 0
    while (g.winner === null && turns < 400) {
      if (canUsePower(g)) usePower(g)
      for (const u of g.units.filter((u) => u.team === g.turn)) {
        if (g.winner !== null || !g.units.includes(u)) continue
        const plan = planUnit(g, u)
        const { path, ambushed } = resolvePath(g, u, pathTo(reachable(g, u), plan.to.x, plan.to.y))
        const end = path[path.length - 1]
        moveUnit(g, u, end.x, end.y)
        if (ambushed) u.moved = true
        else if (plan.action === 'attack' && g.units.includes(plan.target!)) {
          const t = plan.target!, attKind = u.kind, defKind = t.kind
          const res = attack(g, u, t)
          // Daño ponderado por el coste de quien lo recibe: mide cuánto valor destruye cada rol
          const value = (kind: string) => (ROLES[KINDS[kind].role].cost / 1000) / 10
          role(attKind).dealt += res.dmg * value(defKind)
          role(defKind).taken += res.dmg * value(defKind)
          if (res.counter) { role(defKind).dealt += res.counter * value(attKind); role(attKind).taken += res.counter * value(attKind) }
          if (!g.units.includes(t)) { role(attKind).kills++; role(defKind).deaths++ }
          if (!g.units.includes(u)) { role(defKind).kills++; role(attKind).deaths++ }
        } else if (plan.action === 'capture') capture(g, u)
        else u.moved = true
      }
      for (const b of g.buildings) {
        if (g.winner !== null || b.type !== 'center' || b.owner !== g.turn) continue
        const kind = planRecruit(g, b)
        if (kind) { recruit(g, b, kind); role(kind).bought++ }
      }
      if (g.winner === null) endTurn(g)
      turns++
    }
    total++
    days += g.day
    games[red]++
    games[blue]++
    if (g.winner === null) unfinished++
    else {
      const [w, l] = g.winner === 0 ? [red, blue] : [blue, red]
      wins[w]++
      versus[w][l]++
      if (g.winner === 0) first++
    }
  }
  return { total, first, unfinished, days, wins, games, versus, roleStats }
}
