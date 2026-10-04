// Un emparejamiento concreto, a fondo, mapa por mapa.
//   pnpm duel venusaur charizard [partidas por mapa]
import { MAPS } from '../src/data'
import { league } from './league'

declare const process: { argv: string[] }
const [a, b] = process.argv.slice(2), n = Number(process.argv[4] ?? 60)
let wa = 0, total = 0
for (const [m, map] of MAPS.entries()) {
  const r = league(n / 2, [a, b], m)
  wa += r.wins[a]
  total += r.total
  console.log(`${map.name.padEnd(14)} ${a} ${r.wins[a]} · ${b} ${r.wins[b]} · sin terminar ${r.unfinished}`)
}
console.log(`${a} gana el ${Math.round((wa / total) * 100)}% de ${total}`)
