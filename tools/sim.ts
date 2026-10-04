// IA contra IA sin gráficos, para comprobar que las reglas aguantan una partida entera.
//   pnpm sim
import { planRecruit, planUnit } from '../src/ai'
import { attack, canUsePower, capture, createGame, endTurn, moveUnit, pathTo, reachable, recruit, resolvePath, usePower } from '../src/game'

import { COMMANDERS } from '../src/data'

declare const process: { argv: string[] }

// Todos los comandantes contra todos, con cada uno jugando de rojo y de azul
const ids = Object.keys(COMMANDERS)
const wins: Record<string, number> = Object.fromEntries(ids.map((id) => [id, 0]))
const games: Record<string, number> = Object.fromEntries(ids.map((id) => [id, 0]))
let first = 0, total = 0, unfinished = 0
const ROUNDS = Number(process.argv[2] ?? 2)
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
  total++
  games[red]++
  games[blue]++
  if (g.winner === null) unfinished++
  else {
    wins[g.winner === 0 ? red : blue]++
    if (g.winner === 0) first++
  }
}
console.log(`${total} partidas · gana el rojo ${first} · sin terminar ${unfinished}`)
for (const id of ids.sort((a, b) => wins[b] / games[b] - wins[a] / games[a])) console.log(`gana ${id.padEnd(10)} ${Math.round((wins[id] / games[id]) * 100)}%`)
