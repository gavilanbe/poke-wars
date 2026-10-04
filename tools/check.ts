// Comprobaciones de sentido común sobre las reglas: que ningún Pokémon recién reclutado se quede clavado, etc.
//   pnpm check
import { COMMANDERS, KINDS, MAPS, rosterOf } from '../src/data'
import { createGame, reachable, stoppable } from '../src/game'

let problems = 0
for (const [m, map] of MAPS.entries()) {
  for (const co of Object.keys(COMMANDERS)) {
    const g = createGame([co, co], false, m)
    for (const b of g.buildings.filter((b) => b.type === 'center')) {
      for (const kind of rosterOf(co)) {
        const u = { id: 999, kind, team: 0 as const, x: b.x, y: b.y, hp: 10, moved: false, xp: 0, level: 1, status: null, statusTurns: 0 }
        const spots = stoppable(g, u, reachable(g, u)).length
        if (spots < 3) { problems++; console.log(`${map.name}: ${KINDS[kind].name} (${KINDS[kind].role}) casi no puede moverse desde el Centro de ${b.x},${b.y} (${spots} casillas)`) }
      }
    }
  }
}
for (const [id, k] of Object.entries(KINDS)) {
  if (k.evolves && !KINDS[k.evolves]) { problems++; console.log(`${id} evoluciona a ${k.evolves}, que no existe`) }
  if (k.moves.length !== 2 && k.types.length !== 1) { problems++; console.log(`${id} no tiene dos ataques`) }
}
console.log(problems ? `${problems} problemas` : 'todo en orden')
