// Campaña: comprueba cada misión (mapa, edificios, piezas, objetivo) y la juega IA contra IA para ver si se puede
// ganar y cuánto dura.   pnpm missions [partidas por misión] [id]
import { planRecruit, planUnit } from '../src/ai'
import { MISSIONS, WORLD, happenings, missionGame } from '../src/campaign'
import { BUILDING_INFO, KINDS, TERRAIN } from '../src/data'
import { Game, attack, canUsePower, capture, endTurn, footprint, freeze, moveUnit, pathTo, reachable, recruit, resolvePath, usePower } from '../src/game'

declare const process: { argv: string[] }
const N = Number(process.argv[2] ?? 20), only = process.argv[3]

function check(m: (typeof MISSIONS)[number]): string[] {
  const out: string[] = [], rows = m.map.rows, w = rows[0].length, h = rows.length
  rows.forEach((r, y) => { if (r.length !== w) out.push(`fila ${y}: ${r.length} casillas en vez de ${w}`) })
  const used = new Map<string, string>()
  for (const b of m.map.buildings) {
    for (const c of footprint(b)) {
      const id = `${c.x},${c.y}`
      if (c.x < 0 || c.y < 0 || c.x >= w || c.y >= h) { out.push(`${b.type} en ${b.x},${b.y} se sale del mapa`); continue }
      if (used.has(id)) out.push(`${b.type} en ${b.x},${b.y} pisa a ${used.get(id)}`)
      used.set(id, `${b.type} ${b.x},${b.y}`)
      if (!'.'.includes(rows[c.y][c.x])) out.push(`${b.type} en ${b.x},${b.y} tapa «${rows[c.y][c.x]}» en ${id}`)
    }
    if (TERRAIN[rows[b.y + 1]?.[b.x] ?? '#'].cost.walk > 9 || used.has(`${b.x},${b.y + 1}`)) out.push(`${b.type} en ${b.x},${b.y}: no se llega a la puerta desde abajo`)
  }
  const g = missionGame(m, m.hero ?? 'pikachu')
  for (const p of m.pieces) {
    const u = g.units.find((it) => it.x === p.x && it.y === p.y)
    if (!u) out.push(`pieza ${p.role} del equipo ${p.team} no ha quedado en ${p.x},${p.y}`)
  }
  // Se llega andando desde la primera pieza roja a todas las puertas y al objetivo
  const seen = new Set<string>(), queue = [[m.pieces[0].x, m.pieces[0].y]]
  while (queue.length) {
    const [x, y] = queue.pop()!
    if (seen.has(`${x},${y}`) || x < 0 || y < 0 || x >= w || y >= h || TERRAIN[g.tiles[y][x]].cost.walk > 9) continue
    seen.add(`${x},${y}`)
    queue.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1])
  }
  for (const b of m.map.buildings) if (!seen.has(`${b.x},${b.y}`)) out.push(`no se llega andando a ${b.type} ${b.x},${b.y}`)
  const goal = m.rules.goal
  if (goal.type === 'capture' && !m.map.buildings.some((b) => b.x === goal.x && b.y === goal.y && b.owner === 1)) out.push('el edificio a capturar no existe o no es del rival')
  if (goal.type === 'reach' && !seen.has(`${goal.x},${goal.y}`)) out.push('no se llega andando a la casilla objetivo')
  if (goal.type === 'defeat' && !m.pieces.some((p) => p.tag === 'boss')) out.push('no hay jefe')
  if (m.rules.vip && !m.pieces.some((p) => p.tag === 'vip')) out.push('no hay mensajero')
  if (!WORLD.buildings.some((b) => b.x === m.node[0] && b.y === m.node[1])) out.push(`su casilla del mapa del mundo (${m.node}) no es un edificio`)
  for (const ev of m.events ?? []) for (const p of ev.spawn ?? []) if (TERRAIN[g.tiles[p.y]?.[p.x] ?? '#'].cost.walk > 9) out.push(`refuerzo del día ${ev.day} en ${p.x},${p.y}: casilla que no se pisa`)
  return out
}

function draw(g: Game) {
  const rows = g.tiles.map((r) => [...r])
  for (const u of g.units) rows[u.y][u.x] = u.tag === 'boss' ? '♛' : u.tag === 'vip' ? '★' : u.team === 0 ? (KINDS[u.kind].capture ? 'r' : 'R') : KINDS[u.kind].capture ? 'a' : 'A'
  return '    ' + [...Array(g.w).keys()].map((i) => i % 10).join('') + '\n' + rows.map((r, y) => String(y).padStart(3) + ' ' + r.join('')).join('\n')
}

/** Una partida entera con la IA en los dos bandos (la roja no sabe de objetivos especiales: juega a lo de siempre). */
function play(m: (typeof MISSIONS)[number], hero: string) {
  const g = missionGame(m, hero)
  let turns = 0
  while (g.winner === null && turns < 240) {
    happenings(g)
    if (canUsePower(g)) usePower(g)
    for (const u of g.units.filter((u) => u.team === g.turn)) {
      if (g.winner !== null || !g.units.includes(u) || u.moved) continue
      const plan = planUnit(g, u)
      const { path, ambushed } = resolvePath(g, u, pathTo(reachable(g, u), plan.to.x, plan.to.y))
      const end = path[path.length - 1]
      moveUnit(g, u, end.x, end.y)
      if (g.winner !== null) break
      if (ambushed) u.moved = true
      else if (plan.action === 'attack' && g.units.includes(plan.target!)) attack(g, u, plan.target!)
      else if (plan.action === 'capture') capture(g, u)
      else if (plan.action === 'freeze') freeze(g, u)
      else u.moved = true
    }
    for (const b of g.buildings) { if (g.winner !== null || b.type !== 'center' || b.owner !== g.turn) continue; const kind = planRecruit(g, b); if (kind) recruit(g, b, kind) }
    if (g.winner === null) endTurn(g)
    turns++
  }
  return g
}

const worldBad = WORLD.rows.some((r) => r.length !== WORLD.rows[0].length)
console.log(`Mapa del mundo: ${WORLD.rows[0].length}×${WORLD.rows.length}, ${WORLD.buildings.length} edificios${worldBad ? ' · FILAS DESIGUALES' : ''}`)
for (const [i, m] of MISSIONS.entries()) {
  if (only && m.id !== only) continue
  const problems = check(m)
  const income = [0, 1].map((t) => m.map.buildings.filter((b) => b.owner === t).reduce((s, b) => s + BUILDING_INFO[b.type].income, 0))
  console.log(`\n${i + 1}. ${m.title} (${m.id}) · ${m.map.rows[0].length}×${m.map.rows.length} · ingresos ${income.join('/')} · dinero ${m.funds.join('/')}`)
  if (problems.length) console.log(problems.map((p) => '   ✗ ' + p).join('\n'))
  if (only) console.log(draw(missionGame(m, m.hero ?? 'pikachu')))
  if (problems.some((p) => p.includes('fila'))) continue
  let wins = 0, days = 0, open = 0
  const heroes = m.hero ? [m.hero] : ['pikachu', 'charizard', 'blastoise']
  for (let n = 0; n < N; n++) {
    const g = play(m, heroes[n % heroes.length])
    if (g.winner === 0) wins++
    if (g.winner === null) open++
    days += g.day
  }
  console.log(`   IA contra IA: gana el jugador ${Math.round((wins / N) * 100)}% · ${Math.round(days / N)} días de media · sin terminar ${open}/${N}`)
}
