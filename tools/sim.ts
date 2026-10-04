// IA contra IA sin gráficos, para comprobar que las reglas aguantan una partida entera.
//   pnpm sim
import { planRecruit, planUnit } from '../src/ai'
import { KINDS } from '../src/data'
import { attack, canUsePower, capture, createGame, endTurn, moveUnit, pathTo, reachable, recruit, resolvePath, usePower } from '../src/game'

for (let n = 0; n < 20; n++) {
  const cos = ['pikachu', 'charizard', 'blastoise', 'gengar']
  const g = createGame([cos[n % 4], cos[(n >> 2) % 4]])
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
      else if (plan.action === 'attack' && g.units.includes(plan.target!)) attack(g, u, plan.target!)
      else if (plan.action === 'capture') capture(g, u)
      else u.moved = true
    }
    for (const b of g.buildings) {
      if (g.winner !== null || b.type !== 'center' || b.owner !== g.turn) continue
      const kind = planRecruit(g, b)
      if (kind) recruit(g, b, kind)
    }
    if (g.winner === null) endTurn(g)
    turns++
  }
  const army = (t: number) => g.units.filter((u) => u.team === t).map((u) => KINDS[u.kind].name).join(',')
  console.log(`partida ${n} (${g.co.join(' vs ')}): gana ${g.winner === null ? 'nadie' : 'J' + (g.winner + 1)} en el día ${g.day} | J1: ${army(0)} | J2: ${army(1)}`)
}
