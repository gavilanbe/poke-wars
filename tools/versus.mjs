// Liga en paralelo: reparte las rondas entre varios procesos y junta los emparejamientos.
//   pnpm versus [rondas] [equipos.json]   -> porcentaje de victorias de la fila contra la columna
// Cada ronda son 2 partidas por cruce (una de rojo y otra de azul). Con 100 rondas, el margen por cruce es de ±7 puntos.
import { execFile } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'

const ROUNDS = Number(process.argv[2] ?? 40), JSON_OUT = process.argv.includes('--json')
const file = process.argv.slice(3).find((a) => a !== '--json'), OVERRIDE = file ? fs.readFileSync(file, 'utf8') : null
const workers = Math.max(1, Math.min(os.cpus().length - 2, ROUNDS))
const share = Array.from({ length: workers }, (_, i) => Math.floor(ROUNDS / workers) + (i < ROUNDS % workers ? 1 : 0))
const run = (n) => new Promise((resolve, reject) =>
  execFile('node_modules/.bin/tsx', ['tools/worker.ts', String(n), ...(OVERRIDE ? [OVERRIDE] : [])], { maxBuffer: 1 << 26 }, (err, out) => (err ? reject(err) : resolve(JSON.parse(out)))))
const parts = await Promise.all(share.filter(Boolean).map(run))
const ids = Object.keys(parts[0].versus)
const V = Object.fromEntries(ids.map((a) => [a, Object.fromEntries(ids.map((b) => [b, parts.reduce((s, p) => s + p.versus[a][b], 0)]))]))
const sum = (key) => parts.reduce((s, p) => s + p[key], 0)
const total = sum('total')
if (JSON_OUT) { console.log(JSON.stringify({ total, unfinished: sum('unfinished'), versus: V })); process.exit(0) }
const rate = (a, b) => V[a][b] / Math.max(1, V[a][b] + V[b][a])
const overall = (a) => ids.reduce((s, b) => s + V[a][b], 0) / Math.max(1, ids.reduce((s, b) => s + V[a][b] + V[b][a], 0))
const pct = (v) => (Math.round(v * 100) + '%').padStart(6)
console.log(`${total} partidas · gana el rojo ${Math.round((sum('first') / total) * 100)}% · sin terminar ${sum('unfinished')} · duración media ${Math.round(sum('days') / total)} días\n`)
console.log(' '.repeat(11) + ids.map((id) => id.slice(0, 5).padStart(6)).join('') + '   total')
for (const a of ids) console.log(a.padEnd(11) + ids.map((b) => (a === b ? '     ·' : pct(rate(a, b)))).join('') + '  ' + pct(overall(a)))
const pairs = ids.flatMap((a, i) => ids.slice(i + 1).map((b) => [a, b, rate(a, b)])).sort((x, y) => Math.abs(y[2] - 0.5) - Math.abs(x[2] - 0.5))
console.log('\nMás decantados: ' + pairs.slice(0, 8).map(([a, b, r]) => `${r > 0.5 ? a : b} > ${r > 0.5 ? b : a} ${Math.round(Math.max(r, 1 - r) * 100)}%`).join(' · '))
const rms = Math.sqrt(pairs.reduce((s, p) => s + (p[2] - 0.5) ** 2, 0) / pairs.length)
console.log(`Desviación típica de los cruces: ${(rms * 100).toFixed(1)} puntos`)
