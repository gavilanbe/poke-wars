// Modo historia: «La Guerra de las Banderas». Ocho misiones, cada una con su mapa, su objetivo y su trozo de guion.
// Aquí solo hay datos y reglas (sin DOM): lo pinta main.ts y lo puede simular tools/missions.ts.
import { KINDS, MapDef, ROLE_ORDER, RoleId, rosterOf } from './data'
import type { BuildingType } from './data'
import { Game, Rules, Team, createGame, spawn } from './game'
import type { ItemType } from './game'

/** Una frase del guion: quién la dice ('' es el narrador), qué dice y con qué cara. */
export type Line = [who: string, text: string, face?: 'Normal' | 'Happy' | 'Pain' | 'Determined' | 'Angry']
/** Un Pokémon colocado al empezar: por el rol del equipo de su comandante (o del de `of`, si lo presta un aliado). */
export interface Piece { team: Team; role: RoleId; x: number; y: number; hp?: number; stage?: 1 | 2 | 3; tag?: 'vip' | 'boss'; of?: string }
/** Algo que pasa al amanecer de un día: llegan refuerzos, alguien habla. */
export interface Happening { day: number; lines?: Line[]; spawn?: Piece[] }
export interface Mission {
  id: string
  title: string
  place: string
  foe: string // el comandante rival
  hero?: string // comandante obligado; si no, se elige entre los que ya se han unido
  joins?: string // quién se une al ganarla
  objective: string // el objetivo, en una frase
  also: string // lo que conviene saber: cómo se pierde, qué tiene de especial
  rules: Omit<Rules, 'mission' | 'fired'>
  map: MapDef
  pieces: Piece[]
  wild?: { x: number; y: number; kind: string; weak?: boolean }[]
  items?: { x: number; y: number; type: ItemType }[]
  funds: [number, number]
  fog: boolean
  par: number // días para la mejor nota
  intro: Line[]
  outro: Line[]
  lost: Line[]
  events?: Happening[]
  node: [number, number] // su edificio en el mapa del mundo (casilla de la puerta)
}

// ---------- Mapas ----------
// Se escriben como texto: el terreno de siempre (. hierba, " hierba alta, T bosque, M montaña, ~ agua, s vado,
// = camino) y, en la casilla de la puerta de cada edificio, su tipo y dueño:
//   gimnasio 1 rojo · 2 azul · 3 sin dueño      Centro 4 rojo · 5 azul · 6 sin dueño
//   casa     7 roja · 8 azul · 9 sin dueño      tienda x roja · y azul · z sin dueño
const DOOR: Record<string, [BuildingType, -1 | 0 | 1]> = {
  1: ['gym', 0], 2: ['gym', 1], 3: ['gym', -1], 4: ['center', 0], 5: ['center', 1], 6: ['center', -1],
  7: ['house', 0], 8: ['house', 1], 9: ['house', -1], x: ['mart', 0], y: ['mart', 1], z: ['mart', -1],
}
export function parseMap(name: string, blurb: string, text: string[]): MapDef {
  const buildings: MapDef['buildings'] = []
  const rows = text.map((row, y) => [...row].map((ch, x) => {
    if (!DOOR[ch]) return ch
    buildings.push({ type: DOOR[ch][0], owner: DOOR[ch][1], x, y })
    return '.'
  }).join(''))
  return { name, blurb, rows, buildings, starts: [] }
}

/** El Pokémon que le toca a ese rol en el equipo de un comandante, en su primera, segunda o tercera fase. */
export function kindFor(commander: string, role: RoleId, stage = 1): string {
  let kind = rosterOf(commander)[ROLE_ORDER.indexOf(role)]
  for (let s = 1; s < stage && KINDS[kind].evolves; s++) kind = KINDS[kind].evolves!
  return kind
}
function place(g: Game, p: Piece) {
  const u = spawn(g, kindFor(p.of ?? g.co[p.team], p.role, p.stage), p.team, p.x, p.y)
  u.hp = p.hp ?? 10
  u.level = p.stage ?? 1
  if (p.tag) u.tag = p.tag
  return u
}

/** Monta la partida de una misión con el comandante elegido. */
export function missionGame(m: Mission, hero: string): Game {
  const g = createGame([m.hero ?? hero, m.foe], m.fog, m.map, true)
  for (const p of m.pieces) place(g, p).moved = false
  g.wild = (m.wild ?? []).map((w) => ({ ...w, kind: w.kind || kindFor(m.foe, 'capturador') }))
  g.items = (m.items ?? []).map((i) => ({ ...i }))
  g.funds = [...m.funds]
  g.rules = { mission: m.id, ...m.rules, fired: [] }
  if (m.rules.weather) g.weather = m.rules.weather
  return g
}

/** Al empezar el turno del jugador: lo que toca ese día. Coloca los refuerzos y devuelve los sucesos, por si hay que contarlos. */
export function happenings(g: Game): Happening[] {
  const m = MISSIONS.find((it) => it.id === g.rules?.mission)
  if (!m || g.turn !== 0) return []
  const out: Happening[] = []
  m.events?.forEach((ev, i) => {
    if (ev.day !== g.day || g.rules!.fired!.includes(i)) return
    g.rules!.fired!.push(i)
    for (const p of ev.spawn ?? []) place(g, p)
    out.push(ev)
  })
  return out
}

/** El objetivo de la misión en curso con su marcador, para el HUD: «Aguanta: día 3 de 7», «Edificios: 5/8 · rival 4/8»… */
export function goalStatus(g: Game): string {
  const r = g.rules
  if (!r) return ''
  const owned = (team: Team) => g.buildings.filter((b) => b.owner === team).length, left = r.limit ? ` · día ${g.day} de ${r.limit}` : ''
  switch (r.goal.type) {
    case 'capture': return 'Captura el edificio marcado' + left
    case 'reach': return 'Lleva al mensajero ★ a la casilla marcada' + left
    case 'survive': return `Aguanta: día ${Math.min(g.day, r.goal.days)} de ${r.goal.days}`
    case 'defeat': { const boss = g.units.find((u) => u.tag === 'boss'); return `Derrota al jefe ♛${boss ? ` · le quedan ${boss.hp} PS` : ''}${left}` }
    case 'own': return `Edificios: tú ${owned(0)}/${r.goal.count} · rival ${owned(1)}/${r.rivalOwn ?? r.goal.count}`
    default: return (r.noRecruit ? 'Vence sin refuerzos' : 'Captura el gimnasio rival') + left
  }
}
/** Por qué se ha perdido, en una frase. */
export function defeatReason(g: Game): string {
  const r = g.rules!
  if (r.vip && !g.units.some((u) => u.tag === 'vip')) return 'Ha caído el mensajero y la carta se ha perdido.'
  if (r.rivalOwn && g.buildings.filter((b) => b.owner === 1).length >= r.rivalOwn) return 'El rival ha llegado antes a los edificios que hacían falta.'
  if (r.limit && g.day > r.limit) return 'Se ha acabado el tiempo.'
  if (!g.units.some((u) => u.team === 0)) return 'Te has quedado sin Pokémon.'
  return 'Han capturado tu gimnasio.'
}

/** Nota de una victoria: por los días que ha llevado frente a los previstos. */
export const rank = (m: Mission, days: number) => (days <= m.par ? 'S' : days <= m.par + 2 ? 'A' : days <= m.par + 5 ? 'B' : 'C')

// ---------- El mapa del mundo ----------
// La región entera, de Villa Central (abajo a la izquierda) a la Torre de la Noche (arriba a la derecha). Cada
// edificio es una misión; el camino las une en orden.
export const WORLD = parseMap('La región', '', [
  'TTTT....MMMM........TT~~~~~~TT',
  'TT......MMM....9=====.~~~~~TTT',
  'T..""....M.....=....=..~~~..3.',
  '...""......3...=.TT.=====s====',
  '....=======.=..=.TT.....~~~.TT',
  '....=.TT..=.=..=.......~~~~..T',
  '.3..=.TT..=.====...MM..~~~~...',
  '.=..=.....=........MMM.~~~....',
  '.====.""..=..3.......M..~~....',
  '.....""..========.........~~..',
  'T..........=....=..""......~~.',
  'T.9........=....=..""..TT...~~',
  '.=..........TT..=......TT....~',
  '.=======..TTTT..===9..........',
  '.......=...TT......=.......TTT',
  '.6.....=...........=.....TTTTT',
  '.=======.....~~~...........TTT',
  'TT.........~~~~~~~.......TTTTT',
])

// ---------- Las misiones ----------

export const MISSIONS: Mission[] = [
  {
    id: 'chispas', title: 'Chispas en la frontera', place: 'Villa Central', foe: 'charizard', hero: 'pikachu',
    objective: 'Captura el gimnasio de Charizard o déjale sin Pokémon.',
    also: 'Tus Capturadores toman edificios desde la puerta; cada uno te da dinero para reclutar en tu Centro.',
    rules: { goal: { type: 'gym' } }, funds: [4000, 0], fog: false, par: 9, node: [1, 15],
    map: parseMap('Villa Central', '', [
      'TT..""..........""..TT',
      'T....................T',
      '......................',
      '..1...7........9...2..',
      '.====================.',
      '.....=....TT....=.....',
      '.....=...TTTT...=.....',
      '.....=....TT....=.....',
      '..4..=..9....9..=..5..',
      '.====================.',
      '......""......""......',
      'T.........z..........T',
      'TT..................TT',
    ]),
    pieces: [
      { team: 0, role: 'capturador', x: 2, y: 4 }, { team: 0, role: 'luchador', x: 4, y: 5 }, { team: 0, role: 'luchador', x: 6, y: 5 }, { team: 0, role: 'explorador', x: 6, y: 4 },
      { team: 1, role: 'capturador', x: 19, y: 4 }, { team: 1, role: 'luchador', x: 17, y: 5 },
    ],
    intro: [
      ['', 'Cada gimnasio de la región guarda una Bandera de la Liga. Mientras las ocho ondean, hay tregua.'],
      ['', 'Esta mañana, la de Charizard ha amanecido arrancada. En el mástil, enganchado, un mechón de pelo amarillo.'],
      ['charizard', '¡PIKACHU! ¡Devuélveme mi bandera o reduzco tu villa a cenizas!', 'Angry'],
      ['pikachu', '¿¡Pika!? ¡Yo no he tocado nada! Anoche estaba durmiendo…', 'Pain'],
      ['charizard', '¡Excusas! ¡Las pruebas no mienten! ¡A POR ELLOS!', 'Angry'],
      ['pikachu', 'No me va a escuchar hasta que se le pase el calentón. ¡Equipo, a defender Villa Central!', 'Determined'],
    ],
    outro: [
      ['charizard', 'Grrr… ¡Esto no se acaba aquí! ¡Me repliego al vado!', 'Pain'],
      ['pikachu', '¡Espera! ¡Mira el mechón: está teñido! …Ya se ha ido.', 'Normal'],
      ['pikachu', 'Si le quito su Centro Pokémon no podrá reponer tropas. Entonces tendrá que escucharme.', 'Determined'],
    ],
    lost: [['charizard', '¡JA! Y ahora, mi bandera. Registrad cada casa.', 'Happy']],
  },
  {
    id: 'vado', title: 'El vado de las brasas', place: 'Río Brasas', foe: 'charizard', hero: 'pikachu', joins: 'charizard',
    objective: 'Captura el Centro Pokémon de Charizard, al otro lado del río.',
    also: 'El río solo se cruza a pie por los vados de piedra. Sin su Centro, Charizard no puede reclutar.',
    rules: { goal: { type: 'capture', x: 20, y: 9 } }, funds: [4000, 3000], fog: false, par: 10, node: [2, 11],
    map: parseMap('Río Brasas', '', [
      'T..........~~..........T',
      '...M.......~~......M....',
      '.......9...~~...........',
      '..1....=...~~.......2...',
      '.=======...ss..========.',
      '.=.....=...ss..=......=.',
      '.=.TT..=...~~..=..TT..=.',
      '.=.TT..=...~~..=..TT..=.',
      '.=.....=..~~~~.=......=.',
      '.=..4..=..~~~~.=....5.=.',
      '.=======..~~~~.========.',
      '....=......ss......=....',
      '.7..=..""..ss..""..=..8.',
      '.====..""..~~..""..====.',
      'T..........~~..........T',
    ]),
    pieces: [
      { team: 0, role: 'capturador', x: 2, y: 4 }, { team: 0, role: 'capturador', x: 4, y: 10 }, { team: 0, role: 'luchador', x: 6, y: 5 },
      { team: 0, role: 'tirador', x: 5, y: 4 }, { team: 0, role: 'explorador', x: 7, y: 8 }, { team: 0, role: 'luchador', x: 6, y: 9 },
      { team: 1, role: 'capturador', x: 20, y: 4 }, { team: 1, role: 'luchador', x: 16, y: 5 }, { team: 1, role: 'luchador', x: 16, y: 10 },
      { team: 1, role: 'tirador', x: 17, y: 4 }, { team: 1, role: 'explorador', x: 18, y: 11 },
    ],
    intro: [
      ['', 'Charizard se ha hecho fuerte al otro lado del Río Brasas. Dos vados de piedra son el único paso.'],
      ['charizard', '¡Aquí no cruza ni una chispa! ¡Y cuando acabe contigo, registro tu gimnasio!', 'Angry'],
      ['pikachu', 'Un Tirador pega desde lejos, pero no puede moverse y atacar a la vez. Lo dejaré cubriendo el vado.', 'Normal'],
      ['pikachu', 'El objetivo es su Centro Pokémon. ¡Capturadores, conmigo!', 'Determined'],
    ],
    outro: [
      ['charizard', '…Sin refuerzos. Me has ganado de frente, dos veces.', 'Pain'],
      ['pikachu', '¡Porque no soy un ladrón! Mira el mechón: es pelusa teñida. Y huele a… ¿sal?', 'Normal'],
      ['charizard', 'Grr. El ladrón vino de noche y por el agua. Y yo, quemando al vecino equivocado.', 'Normal'],
      ['charizard', 'Agua y sal… Eso es la costa de Blastoise. ¡Voy contigo, y que nadie me diga que no!', 'Determined'],
      ['', 'CHARIZARD se une a ti. Desde ahora puedes elegirlo como comandante.'],
    ],
    lost: [['charizard', '¡Nadie cruza mi río! Vuelve cuando tengas la bandera.', 'Happy']],
  },
  {
    id: 'muralla', title: 'La muralla', place: 'Costa de Blastoise', foe: 'blastoise', joins: 'blastoise',
    objective: 'Aguanta el asedio: llega al amanecer del día 8.',
    also: 'Blastoise viene con todo y tú apenas puedes reclutar. Si capturan tu gimnasio, se acabó.',
    rules: { goal: { type: 'survive', days: 7 } }, funds: [3000, 5000], fog: false, par: 7, node: [13, 8],
    map: parseMap('Costa de Blastoise', '', [
      '~~~~~~~~~~~~~~~~~~~~~~~~',
      '~~~..........TT.....~~~~',
      '~~....M..............~~~',
      '~.........TT......2...~~',
      '~...1....TTTT..=======.~',
      '~.=====...TT...=......~~',
      '..=...=........=..5..~~~',
      '..=.7.=..MM....=======~~',
      '..=====..MM....=......~~',
      '....=..........=..8..~~~',
      '.4..=..""..""..=......~~',
      '.====..""..""..=...y..~~',
      '~...............TT..~~~~',
      '~~~~~.....~~~~~~~~~~~~~~',
    ]),
    pieces: [
      { team: 0, role: 'capturador', x: 4, y: 5 }, { team: 0, role: 'luchador', x: 7, y: 6 }, { team: 0, role: 'luchador', x: 7, y: 9 },
      { team: 0, role: 'tirador', x: 6, y: 5 }, { team: 0, role: 'coloso', x: 8, y: 7 }, { team: 0, role: 'apoyo', x: 3, y: 6 }, { team: 0, role: 'tirador', x: 6, y: 9 }, { team: 0, role: 'luchador', x: 8, y: 5 },
      { team: 1, role: 'luchador', x: 14, y: 5 }, { team: 1, role: 'luchador', x: 14, y: 9 }, { team: 1, role: 'coloso', x: 15, y: 7 },
      { team: 1, role: 'asaltante', x: 16, y: 6 }, { team: 1, role: 'asaltante', x: 16, y: 9 }, { team: 1, role: 'tirador', x: 17, y: 7 },
      { team: 1, role: 'volador', x: 20, y: 5 }, { team: 1, role: 'capturador', x: 17, y: 9 },
    ],
    events: [
      { day: 4, lines: [['blastoise', 'Cuatro días y seguís en pie. Muy bien… ¡Segunda oleada, al agua!', 'Determined']],
        spawn: [{ team: 1, role: 'nadador', x: 20, y: 6 }, { team: 1, role: 'bombardero', x: 20, y: 9 }] },
      { day: 6, lines: [['pikachu', '¡Ya casi! ¡Dos amaneceres más y se cansará de empujar!', 'Determined']] },
    ],
    intro: [
      ['', 'La pista de la sal lleva a la costa. Pero alguien ha llegado antes con un rumor.'],
      ['blastoise', 'Me han avisado: un ratón amarillo y un lagarto vienen a por mi bandera. Pues aquí está mi muralla.', 'Determined'],
      ['charizard', '¿¡Lagarto!? ¡Te voy a…!', 'Angry'],
      ['pikachu', '¡Quieto! Blastoise no ataca a lo loco: avanza, aprieta y no suelta. No podemos ganarle hoy.', 'Normal'],
      ['pikachu', 'Pero un saqueador huye cuando la cosa se pone fea. Si aguantamos siete días sin movernos, verá que no lo somos.', 'Determined'],
    ],
    outro: [
      ['blastoise', 'Siete días. Ni un paso atrás… y ni un intento de colaros en mi gimnasio.', 'Normal'],
      ['blastoise', 'Los ladrones no aguantan asedios. Me han mentido. Y mientras os empujaba… mi bandera ha volado.', 'Pain'],
      ['pikachu', '¡Entonces el ladrón nos usa para distraeros! ¿Dejó algo?', 'Normal'],
      ['blastoise', 'Hojas. Hojas húmedas de un bosque muy viejo. Mi muralla camina con vosotros.', 'Determined'],
      ['', 'BLASTOISE se une a ti.'],
    ],
    lost: [['blastoise', 'La muralla siempre llega. Devolved lo que no es vuestro.', 'Normal']],
  },
  {
    id: 'bosque', title: 'Niebla en el Bosque Viejo', place: 'Bosque Viejo', foe: 'venusaur', joins: 'venusaur',
    objective: 'Lleva al mensajero (★) hasta la puerta del gimnasio de Venusaur.',
    also: 'Hay niebla: solo ves cerca de los tuyos, y el bosque esconde. Si el mensajero cae, se pierde la carta.',
    rules: { goal: { type: 'reach', x: 21, y: 4 }, vip: true }, funds: [5000, 4000], fog: true, par: 11, node: [1, 6],
    map: parseMap('Bosque Viejo', '', [
      'TTTTTTTTTTTTTTTTTTTTTTTTTT',
      'T...TT....""..TT....TTT..T',
      'T.1..T..TT""..T..TT......T',
      'T.=..TT.TT....T..TT..2...T',
      'T.=....""..TT....""..=.TTT',
      'T.===..""..TT.TT.""..=...T',
      'T...=......T..TT.....=.5.T',
      'T.4.=.TT......T..=====.=.T',
      'T.=.=.TT.""..TT..=..TT.=.T',
      'T.===....""..T...=..TT===T',
      'TT...TT...TT...TT=.......T',
      'T..7.TT...TT...TT=..""...T',
      'T..=....9......===..""..TT',
      'T..========....=.....TTTTT',
      'TTTTTTTTTTTTTTTTTTTTTTTTTT',
    ]),
    pieces: [
      { team: 0, role: 'explorador', x: 2, y: 4, tag: 'vip' }, { team: 0, role: 'luchador', x: 3, y: 5 }, { team: 0, role: 'luchador', x: 4, y: 6 },
      { team: 0, role: 'capturador', x: 2, y: 8 }, { team: 0, role: 'volador', x: 4, y: 4 }, { team: 0, role: 'apoyo', x: 3, y: 9 },
      { team: 1, role: 'luchador', x: 12, y: 3 }, { team: 1, role: 'tirador', x: 13, y: 9 }, { team: 1, role: 'luchador', x: 16, y: 6 },
      { team: 1, role: 'coloso', x: 20, y: 5 }, { team: 1, role: 'capturador', x: 21, y: 8 }, { team: 1, role: 'explorador', x: 9, y: 6 },
    ],
    wild: [{ x: 9, y: 9, kind: '' }, { x: 18, y: 5, kind: '' }],
    intro: [
      ['', 'El Bosque Viejo lleva días cerrado. Venusaur no deja pasar a nadie desde que desapareció su bandera.'],
      ['blastoise', 'Con la Liga rota nadie se fía de nadie. Hace falta algo oficial: una carta con los tres sellos.', 'Normal'],
      ['pikachu', 'La llevará mi Explorador, que es el más rápido. Pero es frágil: hay que abrirle camino.', 'Normal'],
      ['venusaur', '…Oigo pasos en mi jardín. Sin prisa, hijos. Que el bosque se ocupe.', 'Normal'],
      ['pikachu', 'Niebla y árboles: no veremos a nadie hasta tenerlo encima. ¡Con cuidado, y el mensajero siempre detrás!', 'Determined'],
    ],
    outro: [
      ['venusaur', 'Tres sellos… y la letra torpe de Charizard. Esto no lo falsifica nadie.', 'Happy'],
      ['venusaur', 'También se llevaron la mía, una noche sin luna. Las raíces me dijeron algo raro: había arena. Arena de cantera.', 'Normal'],
      ['charizard', '¡Tyranitar! ¡Lo sabía! Bueno, no lo sabía, pero ahora sí.', 'Determined'],
      ['venusaur', 'Sin prisa, dragón. Voy con vosotros: mi jardín también camina.', 'Normal'],
      ['', 'VENUSAUR se une a ti.'],
    ],
    lost: [['venusaur', 'Todo lo que entra en mi bosque acaba siendo abono. Volved con mejores modales.', 'Normal']],
  },
  {
    id: 'cantera', title: 'El coloso de la cantera', place: 'Cantera de Tyranitar', foe: 'tyranitar', joins: 'tyranitar',
    objective: 'Derrota al Coloso desbocado (♛) antes de que acabe el día 14.',
    also: 'Es un jefe: pega más y aguanta más. Rodéalo, usa los tipos y no dejes de reclutar.',
    rules: { goal: { type: 'defeat' }, limit: 14, weather: 'sun' }, funds: [6000, 3000], fog: false, par: 9, node: [11, 3],
    map: parseMap('Cantera de Tyranitar', '', [
      'MMMMMMMMMMMMMMMMMMMMMMMM',
      'M....MM........MM......M',
      'M.1...M..MM.........2..M',
      'M.=......MM...MM....=..M',
      'M.=====.......MM..===..M',
      'M.....=..M.z......=....M',
      'MM.4..=..MMM..M...=.5.MM',
      'M..=..=...M...MM..=.=..M',
      'M..====.......M...===..M',
      'M.....=..MM......=.....M',
      'M..7..=..MM..M...=..8..M',
      'M..=..====...MM.==..=..M',
      'M..=.....=.......=..=..M',
      'M..===============..=..M',
      'MMMMMMMMMMMMMMMMMMMMMMMM',
    ]),
    pieces: [
      { team: 0, role: 'capturador', x: 2, y: 4 }, { team: 0, role: 'luchador', x: 5, y: 5 }, { team: 0, role: 'luchador', x: 5, y: 8 },
      { team: 0, role: 'tirador', x: 1, y: 5 }, { team: 0, role: 'volador', x: 5, y: 3 }, { team: 0, role: 'asaltante', x: 5, y: 9 },
      { team: 1, role: 'coloso', x: 12, y: 7, stage: 3, tag: 'boss' }, { team: 1, role: 'luchador', x: 15, y: 6 }, { team: 1, role: 'luchador', x: 15, y: 9 },
      { team: 1, role: 'tirador', x: 17, y: 5 }, { team: 1, role: 'capturador', x: 20, y: 4 }, { team: 1, role: 'asaltante', x: 16, y: 11 },
    ],
    intro: [
      ['', 'En la cantera no hay ladrón que valga: hay un problema más grande. Mucho más grande.'],
      ['tyranitar', '¡Atrás! Mi Coloso lleva tres noches sin obedecer. Arrasa lo que ve. Hasta a los míos.', 'Pain'],
      ['venusaur', 'Tiene la mirada turbia. Eso no es rabia: alguien le ha nublado la cabeza.', 'Normal'],
      ['tyranitar', 'Mis tropas están hechizadas con él y os atacarán. No tengo cómo pararlo… Paradlo vosotros.', 'Normal'],
      ['pikachu', 'Con este sol el Fuego pega más. Y antes de catorce días, o no quedará cantera. ¡A por el grande!', 'Determined'],
    ],
    outro: [
      ['tyranitar', 'Ha caído… y ha despertado. Dice que una voz le susurraba desde lo oscuro.', 'Normal'],
      ['tyranitar', 'Mi bandera tampoco está. La arena del bosque era mía, sí: se la llevó quien robó aquí primero.', 'Pain'],
      ['blastoise', 'Susurros que nublan la mente. Eso lo sabe hacer alguien que yo me sé.', 'Normal'],
      ['charizard', '¡Gardevoir! ¡La de los poderes raros! ¡Esta vez sí que sí!', 'Angry'],
      ['tyranitar', 'La montaña anda con vosotros. Y pisa fuerte.', 'Determined'],
      ['', 'TYRANITAR se une a ti.'],
    ],
    lost: [['tyranitar', 'Demasiado tarde. La cantera… Sacad a los vuestros de aquí.', 'Pain']],
  },
  {
    id: 'espejismo', title: 'El espejismo', place: 'Valle del Espejo', foe: 'gardevoir', joins: 'gardevoir',
    objective: 'Hazte con 8 edificios del valle antes que Gardevoir.',
    also: 'Es una carrera: si ella llega antes a 8, pierdes. Corre con Capturadores y Asaltantes, y estórbale los suyos.',
    rules: { goal: { type: 'own', count: 8 }, rivalOwn: 8 }, funds: [5000, 5000], fog: false, par: 9, node: [15, 1],
    map: parseMap('Valle del Espejo', '', [
      'TT......................TT',
      'T........................T',
      '..1...9....z....9..9...2..',
      '.========================.',
      '.=..........~~..........=.',
      '.=.........~~~~.........=.',
      '.=.4...9...~~~~...9...5.=.',
      '.========================.',
      '.=..........~~..........=.',
      '.=......................=.',
      '.=..9....9...z....9..9..=.',
      '.========================.',
      'T........................T',
      'TT......................TT',
    ]),
    pieces: [
      { team: 0, role: 'capturador', x: 2, y: 3 }, { team: 0, role: 'capturador', x: 3, y: 7 }, { team: 0, role: 'explorador', x: 4, y: 3 }, { team: 0, role: 'luchador', x: 2, y: 8 }, { team: 0, role: 'asaltante', x: 5, y: 7 },
      { team: 1, role: 'capturador', x: 23, y: 3 }, { team: 1, role: 'capturador', x: 22, y: 7 }, { team: 1, role: 'explorador', x: 21, y: 3 }, { team: 1, role: 'luchador', x: 23, y: 8 },
    ],
    items: [{ x: 9, y: 9, type: 'coin' }, { x: 16, y: 9, type: 'coin' }],
    intro: [
      ['', 'El Valle del Espejo está lleno de casas vacías. Gardevoir las está ocupando una a una, a toda prisa.'],
      ['charizard', '¡Ajá! ¡Se queda con todo! ¡La pillamos con las manos en la masa!', 'Angry'],
      ['gardevoir', 'No tengo tiempo de explicaros. Algo viene a por este valle y debo tenerlo antes que él.', 'Normal'],
      ['gardevoir', 'Ya sé cómo acaba esto: vosotros no os fiáis, y yo no puedo parar. Lo siento.', 'Pain'],
      ['pikachu', '¡Pues corremos más que ella! ¡Ocho edificios, y que nadie se pare a pelear si puede capturar!', 'Determined'],
    ],
    outro: [
      ['gardevoir', 'Me habéis ganado la carrera… y aun así no notáis nada raro en vuestra cabeza. No sois de los suyos.', 'Normal'],
      ['pikachu', '¿De los suyos? ¿De quién?', 'Normal'],
      ['gardevoir', 'No soy yo quien nubla mentes. Yo lo sentí: una risa en lo oscuro, detrás de cada bandera robada. «Keke…»', 'Pain'],
      ['blastoise', 'Esa risa. Gengar.', 'Determined'],
      ['gardevoir', 'Su torre está tras el Paso del Aura, donde siempre es de noche. Voy un paso por delante… y esta vez, con vosotros.', 'Happy'],
      ['', 'GARDEVOIR se une a ti.'],
    ],
    lost: [['gardevoir', 'El valle es mío. Ojalá hubierais confiado; yo tampoco supe hacerlo.', 'Pain']],
  },
  {
    id: 'aura', title: 'La prueba del aura', place: 'Paso del Aura', foe: 'lucario', joins: 'lucario',
    objective: 'Vence a la guardia de Lucario. No hay refuerzos para nadie.',
    also: 'Aquí no se recluta ni hay edificios que capturar: solo lo que traes. Cuida cada Pokémon y pega donde duele.',
    rules: { goal: { type: 'gym' }, noRecruit: true }, funds: [0, 0], fog: false, par: 7, node: [19, 13],
    map: parseMap('Paso del Aura', '', [
      'MMMMMMMMMMMMMMMMMMMMMM',
      'MMM......MMMM......MMM',
      'MM...TT........TT...MM',
      'M....TT...MM...TT....M',
      'M.........MM.........M',
      'M..""..............""M',
      'M..""....~~~~....""..M',
      'M.......~~~~~~.......M',
      'M..""....~~~~....""..M',
      'M..""..............""M',
      'M.........MM.........M',
      'M....TT...MM...TT....M',
      'MM...TT........TT...MM',
      'MMMMMMMMMMMMMMMMMMMMMM',
    ]),
    pieces: [
      { team: 0, role: 'luchador', x: 3, y: 5 }, { team: 0, role: 'luchador', x: 3, y: 8 }, { team: 0, role: 'coloso', x: 2, y: 7 }, { team: 0, role: 'tirador', x: 2, y: 4 },
      { team: 0, role: 'bombardero', x: 3, y: 10 }, { team: 0, role: 'apoyo', x: 1, y: 6 }, { team: 0, role: 'artillero', x: 1, y: 8 }, { team: 0, role: 'explorador', x: 4, y: 3 }, { team: 0, role: 'asaltante', x: 2, y: 9 },
      { team: 1, role: 'luchador', x: 18, y: 5 }, { team: 1, role: 'luchador', x: 18, y: 8 }, { team: 1, role: 'coloso', x: 19, y: 7 }, { team: 1, role: 'tirador', x: 19, y: 4 },
      { team: 1, role: 'bombardero', x: 18, y: 10 }, { team: 1, role: 'apoyo', x: 20, y: 6 }, { team: 1, role: 'explorador', x: 17, y: 3 }, { team: 1, role: 'asaltante', x: 19, y: 9 },
    ],
    items: [{ x: 10, y: 2, type: 'berry' }, { x: 11, y: 11, type: 'berry' }],
    intro: [
      ['', 'El único camino a la torre de Gengar cruza el Paso del Aura. Y en el paso espera Lucario, de brazos cruzados.'],
      ['lucario', 'Siento seis auras. Cinco dudan. Quien dude, no cruza: más allá, la duda es el arma del enemigo.', 'Determined'],
      ['pikachu', '¡No tenemos tiempo para pruebas! ¡Gengar tiene siete banderas!', 'Angry'],
      ['lucario', 'Tiene la mía también, y no fui tras él: me quedé a guardar el paso. Así que, sí: tenéis tiempo.', 'Normal'],
      ['lucario', 'Ocho contra ocho. Sin Centros, sin dinero, sin refuerzos. Lo que traes es lo que eres.', 'Determined'],
    ],
    outro: [
      ['lucario', 'Respira. Ya está. Ni un paso en falso cuando no había red.', 'Normal'],
      ['lucario', 'Ahora sé que no os romperéis ahí dentro. Y que yo tampoco, si voy con vosotros.', 'Happy'],
      ['gardevoir', 'Siete comandantes. Solo falta uno… y nos está esperando.', 'Determined'],
      ['', 'LUCARIO se une a ti.'],
    ],
    lost: [['lucario', 'La duda pesa. Vuelve cuando no te tiemble el pulso.', 'Normal']],
  },
  {
    id: 'noche', title: 'La noche más larga', place: 'Torre de la Noche', foe: 'gengar', joins: 'gengar',
    objective: 'Captura la Torre de Gengar. Tus aliados llegarán por el camino.',
    also: 'Siempre es de noche y hay niebla: se ve una casilla menos. Gengar empieza con ventaja; resiste hasta que lleguen refuerzos.',
    rules: { goal: { type: 'gym' }, night: true }, funds: [9000, 4000], fog: true, par: 16, node: [28, 2],
    map: parseMap('Torre de la Noche', '', [
      'TTTTT.....MMM.........TTTTTT',
      'TT.......MMMM....9.......TTT',
      'T..1......MM.....=....2....T',
      'T..=..7...........=...=....T',
      'T..=..=...""..TT..=====.5..T',
      'T..====...""..TT..=...=.=..T',
      'T.....=.......~~..=.y.===..T',
      '..4...=..TT..~~~~.=.=.....TT',
      '..=...=..TT..~~~~.===..""..T',
      '..=====.......ss......."".TT',
      '..=...=..9...~~~~..8.......T',
      'T.=...=..=...~~~~..=..TT...T',
      'T.=.x.====....~~...====TT..T',
      'T.=.=....=....ss......=....T',
      'T.===....=..TT~~TT....=.5..T',
      'T........====.~~.======.=..T',
      'TT...""......~~~~.......=.TT',
      'TTTT.""....~~~~~~~~...TTTTTT',
    ]),
    pieces: [
      { team: 0, role: 'capturador', x: 3, y: 4 }, { team: 0, role: 'capturador', x: 2, y: 9 }, { team: 0, role: 'luchador', x: 5, y: 5 }, { team: 0, role: 'luchador', x: 5, y: 9 },
      { team: 0, role: 'tirador', x: 4, y: 5 }, { team: 0, role: 'explorador', x: 6, y: 8 }, { team: 0, role: 'coloso', x: 5, y: 6 }, { team: 0, role: 'volador', x: 4, y: 8 },
      { team: 1, role: 'capturador', x: 22, y: 4 }, { team: 1, role: 'capturador', x: 21, y: 9 }, { team: 1, role: 'luchador', x: 18, y: 6 }, { team: 1, role: 'luchador', x: 19, y: 11 },
      { team: 1, role: 'coloso', x: 19, y: 5 }, { team: 1, role: 'tirador', x: 20, y: 3 }, { team: 1, role: 'volador', x: 17, y: 9 },
    ],
    events: [
      { day: 3, lines: [['charizard', '¡Llego tarde y de mal humor! ¡Fuego y dragones por el camino del sur!', 'Angry'], ['blastoise', 'Y la muralla, por el del norte. Aguanta, Pikachu.', 'Determined']],
        spawn: [{ team: 0, role: 'bombardero', x: 1, y: 12, of: 'charizard' }, { team: 0, role: 'luchador', x: 2, y: 13, of: 'charizard' }, { team: 0, role: 'coloso', x: 6, y: 1, of: 'blastoise' }, { team: 0, role: 'nadador', x: 5, y: 2, of: 'blastoise' }] },
      { day: 6, lines: [['venusaur', 'Sin prisa, pero ya estamos.', 'Happy'], ['tyranitar', 'La montaña ha llegado andando.', 'Determined']],
        spawn: [{ team: 0, role: 'tirador', x: 7, y: 15, of: 'venusaur' }, { team: 0, role: 'apoyo', x: 6, y: 15, of: 'venusaur' }, { team: 0, role: 'coloso', x: 8, y: 1, of: 'tyranitar', stage: 2 }, { team: 0, role: 'asaltante', x: 8, y: 2, of: 'tyranitar' }] },
      { day: 9, lines: [['gardevoir', 'Un paso por delante: sé dónde va a mirar.', 'Determined'], ['lucario', 'Y yo, dónde va a pegar. ¡Ahora!', 'Angry'], ['gengar', 'Keke… ¿siete contra uno? Qué poco deportivo. Me gusta.', 'Happy']],
        spawn: [{ team: 0, role: 'volador', x: 10, y: 6, of: 'gardevoir' }, { team: 0, role: 'bombardero', x: 10, y: 11, of: 'gardevoir' }, { team: 0, role: 'luchador', x: 8, y: 9, of: 'lucario', stage: 2 }, { team: 0, role: 'asaltante', x: 8, y: 8, of: 'lucario' }] },
    ],
    intro: [
      ['', 'Más allá del paso no amanece. En lo alto de la torre ondean siete banderas que no son suyas.'],
      ['gengar', 'Keke… ¡Por fin! Empezaba a aburrirme. ¿Os ha gustado mi jueguecito?', 'Happy'],
      ['pikachu', '¡Nos has enfrentado a todos! ¿¡Para qué quieres las banderas!?', 'Angry'],
      ['gengar', 'Con ocho banderas hay tregua. Con ninguna, cada uno desconfía del vecino. Y en un mundo que desconfía… mando yo, que soy el que mejor hace trampas.', 'Determined'],
      ['gengar', 'Solo me falta la tuya, ratoncito. Y has tenido el detalle de traérmela a casa.', 'Happy'],
      ['pikachu', 'No he venido solo. Los demás vienen por el camino… ¡y tú no sabes lo que es pelear juntos! ¡A por la torre!', 'Determined'],
    ],
    outro: [
      ['gengar', 'Keke… ke. Vale. Vale. Era broma. ¿No? ¿Nadie se ríe?', 'Pain'],
      ['lucario', 'Las banderas, Gengar.', 'Determined'],
      ['gengar', 'Toda vuestras. Total, lo divertido era veros pelear… y reconozco que juntos peleáis mejor. Qué fastidio.', 'Normal'],
      ['', 'Las ocho banderas vuelven a sus mástiles. Charizard jura que nunca dudó de Pikachu. Nadie le cree.'],
      ['pikachu', '¡Pika! Ocho banderas, ocho gimnasios… y ahora, ocho amigos. Bueno, siete y medio.', 'Happy'],
      ['gengar', '¡Oye! …Keke. Me vale.', 'Happy'],
      ['', 'FIN. Has completado la campaña. GENGAR ya puede ser tu comandante… si te fías.'],
    ],
    lost: [['gengar', 'Keke… ocho de ocho. Buenas noches a todos.', 'Happy']],
  },
]
