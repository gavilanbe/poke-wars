// Afinador de equilibrio: juega la liga, sube a los comandantes que pierden y baja a los que ganan, y repite.
//   pnpm tune [iteraciones] [rondas por iteración]   -> imprime la tabla TUNE para pegar en src/data.ts
// Ojo con el ruido: con 6 rondas cada comandante juega 84 partidas y su porcentaje baila unos ±11 puntos solo por
// azar. Para afinar de verdad hacen falta 30 rondas o más por iteración; con menos, se persigue el ruido.
import { COMMANDERS, TUNE } from '../src/data'
import { league } from './league'

declare const process: { argv: string[] }
const ITERATIONS = Number(process.argv[2] ?? 6), ROUNDS = Number(process.argv[3] ?? 6)
const ids = Object.keys(COMMANDERS)
for (let i = 0; i < ITERATIONS; i++) {
  const { wins, games, first, total } = league(ROUNDS)
  const rate = (id: string) => wins[id] / games[id]
  const spread = Math.max(...ids.map(rate)) - Math.min(...ids.map(rate))
  console.log(`iteración ${i + 1}: abanico ${Math.round(spread * 100)} puntos · rojo ${Math.round((first / total) * 100)}% · ` + ids.map((id) => `${id.slice(0, 4)} ${Math.round(rate(id) * 100)}`).join(' '))
  // Paso amortiguado y cada vez más corto, para que no oscile
  const step = 0.22 / (1 + i * 0.35)
  for (const id of ids) TUNE[id] = Math.round(TUNE[id] * (1 - step * (rate(id) - 0.5)) * 1000) / 1000
}
console.log('TUNE = ' + JSON.stringify(TUNE))
