// Ventaja de tipos entre equipos, sin simular: para cada par de comandantes, la media del multiplicador del mejor
// ataque de cada Pokémon de uno contra cada Pokémon del otro, ponderada por lo que la IA compra de cada rol.
//   pnpm matchups   -> tabla (fila ataca a columna) y los pares más descompensados
import { COMMANDERS, KINDS, ROLES, RoleId, bestMove, moveMult, rosterOf } from '../src/data'

const WEIGHT: Record<RoleId, number> = { capturador: 3, asaltante: 1, explorador: 1, luchador: 3, coloso: 2, tirador: 2, artillero: 1, volador: 1.5, bombardero: 1.5, nadador: 1, apoyo: 0 }
const ids = Object.keys(COMMANDERS)
function power(a: string, b: string) {
  let sum = 0, weight = 0
  for (const x of rosterOf(a)) for (const y of rosterOf(b)) {
    const w = WEIGHT[KINDS[x].role] * WEIGHT[KINDS[y].role] * ROLES[KINDS[x].role].atk
    sum += w * moveMult(x, bestMove(x, y), y)
    weight += w
  }
  return sum / weight
}
export const edge = (a: string, b: string) => power(a, b) / power(b, a)
console.log(' '.repeat(11) + ids.map((id) => id.slice(0, 5).padStart(6)).join(''))
for (const a of ids) console.log(a.padEnd(11) + ids.map((b) => (a === b ? '     ·' : edge(a, b).toFixed(2).padStart(6))).join(''))
const pairs = ids.flatMap((a, i) => ids.slice(i + 1).map((b) => [a, b, edge(a, b)] as const)).sort((x, y) => Math.abs(Math.log(y[2])) - Math.abs(Math.log(x[2])))
console.log('\nMás descompensados: ' + pairs.slice(0, 8).map(([a, b, e]) => `${e > 1 ? a : b} > ${e > 1 ? b : a} x${(e > 1 ? e : 1 / e).toFixed(2)}`).join(' · '))
