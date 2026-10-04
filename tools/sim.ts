// Informe de equilibrio: tasa de victorias por comandante, emparejamientos y rendimiento de cada rol.
//   pnpm sim [rondas]
import { COMMANDERS, ROLES } from '../src/data'
import { league } from './league'

declare const process: { argv: string[] }
const ROUNDS = Number(process.argv[2] ?? 2)
const { total, first, unfinished, days, wins, games, versus, roleStats } = league(ROUNDS)
const ids = Object.keys(COMMANDERS)
const pct = (n: number, d: number) => String(Math.round((n / Math.max(1, d)) * 100)).padStart(3) + '%'
console.log(`${total} partidas · gana el rojo ${pct(first, total)} · sin terminar ${unfinished} · duración media ${Math.round(days / total)} días`)
const order = [...ids].sort((a, b) => wins[b] / games[b] - wins[a] / games[a])
console.log('\nVictorias (fila gana a columna, sobre ' + ROUNDS * 2 + ')')
console.log(' '.repeat(18) + order.map((id) => id.slice(0, 5).padStart(6)).join(''))
for (const id of order) console.log(`${id.padEnd(10)} ${pct(wins[id], games[id])}   ` + order.map((o) => (o === id ? '     ·' : String(versus[id][o]).padStart(6))).join(''))
console.log('\nRoles: comprados · bajas causadas/sufridas · valor destruido por cada 1000 gastados')
for (const [name, r] of Object.entries(roleStats).sort((a, b) => b[1].bought - a[1].bought)) {
  const spent = (r.bought * ROLES[name as keyof typeof ROLES].cost) / 1000
  console.log(`${name.padEnd(11)} ${String(r.bought).padStart(5)} · ${String(r.kills).padStart(4)}/${String(r.deaths).padEnd(4)} · ${(r.dealt / Math.max(1, spent)).toFixed(2)} (recibe ${(r.taken / Math.max(1, spent)).toFixed(2)})`)
}
