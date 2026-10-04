// Una tanda de liga en un proceso aparte, para tools/versus.mjs: imprime el resultado en JSON.
//   tsx tools/worker.ts <rondas> [equipos]
// Con el segundo argumento (JSON en línea; versus.mjs lo lee del archivo) se prueban otros tipos y ataques sin tocar
// src/rosters.json:   { comandante: { rol: [tipos 'a/b', cobertura?] } }
import { KINDS, PType, RoleId } from '../src/data'
import { league } from './league'

declare const process: { argv: string[] }
const [rounds, override] = process.argv.slice(2)
if (override) {
  const teams = JSON.parse(override) as Record<string, Partial<Record<RoleId, [string, string?]>>>
  for (const k of Object.values(KINDS)) {
    const line = teams[k.commander]?.[k.role]
    if (!line) continue
    k.types = line[0].split('/') as PType[]
    k.type = k.types[0]
    k.moves = (line[1] ? [k.types[0], line[1]] : k.types) as PType[]
  }
}
const r = league(Number(rounds))
console.log(JSON.stringify({ total: r.total, first: r.first, unfinished: r.unfinished, days: r.days, versus: r.versus, roleStats: r.roleStats }))
