// Datos del juego: terrenos, tipos, roles, comandantes y mapa.
import finals from './finals.json'
import rosters from './rosters.json'

export type MoveType = 'walk' | 'fly' | 'swim' | 'amph'
export type PType =
  | 'normal' | 'fire' | 'water' | 'electric' | 'grass' | 'ice' | 'fighting' | 'poison' | 'ground' | 'flying'
  | 'psychic' | 'bug' | 'rock' | 'ghost' | 'dragon' | 'dark' | 'steel' | 'fairy'

export interface Terrain {
  name: string
  def: number // estrellas de defensa (cada una resta un 10% de daño)
  cost: Record<MoveType, number>
}

const X = 99
export const TERRAIN: Record<string, Terrain> = {
  '.': { name: 'Pradera', def: 1, cost: { walk: 1, fly: 1, swim: 3, amph: 1 } },
  '"': { name: 'Hierba alta', def: 2, cost: { walk: 1, fly: 1, swim: 3, amph: 1 } },
  T: { name: 'Bosque', def: 3, cost: { walk: 2, fly: 1, swim: X, amph: 2 } },
  M: { name: 'Montaña', def: 4, cost: { walk: 3, fly: 1, swim: X, amph: 3 } },
  '~': { name: 'Agua', def: 0, cost: { walk: X, fly: 1, swim: 1, amph: 1 } },
  s: { name: 'Piedras del río', def: 0, cost: { walk: 1, fly: 1, swim: 2, amph: 1 } },
  i: { name: 'Hielo', def: 0, cost: { walk: 1, fly: 1, swim: 2, amph: 1 } }, // agua congelada por un Pokémon de hielo
  '=': { name: 'Camino', def: 0, cost: { walk: 1, fly: 1, swim: 2, amph: 1 } },
  B: { name: 'Puerta', def: 3, cost: { walk: 1, fly: 1, swim: 2, amph: 1 } },
  '#': { name: 'Edificio', def: 0, cost: { walk: X, fly: 1, swim: X, amph: X } }, // macizo: se sobrevuela, pero nadie se para
}

export type BuildingType = 'house' | 'center' | 'mart' | 'gym'
// Los edificios (estilo 4ª generación) van a tamaño real: ocupan `w` x 2 casillas y se usan desde la casilla
// de la puerta (fila de abajo, columna `door`). `dx` centra la puerta del dibujo en esa casilla.
export const BUILDING_INFO: Record<BuildingType, { name: string; w: number; door: number; dx: number; income: number; help: string }> = {
  house: { name: 'Casa', w: 2, door: 0, dx: 1, income: 1000, help: '+1000₽ por turno' },
  center: { name: 'Centro Pokémon', w: 3, door: 1, dx: 8, income: 1000, help: 'Recluta y cura. +1000₽' },
  mart: { name: 'Tienda', w: 2, door: 0, dx: -2, income: 2000, help: '+2000₽ por turno' },
  gym: { name: 'Gimnasio', w: 3, door: 1, dx: -8, income: 1000, help: 'Cuartel general: si lo capturan, pierdes' },
}

export const TYPE_NAME: Record<PType, string> = {
  normal: 'Normal', fire: 'Fuego', water: 'Agua', electric: 'Eléctrico', grass: 'Planta', ice: 'Hielo', fighting: 'Lucha',
  poison: 'Veneno', ground: 'Tierra', flying: 'Volador', psychic: 'Psíquico', bug: 'Bicho', rock: 'Roca', ghost: 'Fantasma',
  dragon: 'Dragón', dark: 'Siniestro', steel: 'Acero', fairy: 'Hada',
}
export const TYPE_COLOR: Record<PType, string> = {
  normal: '#a8a878', fire: '#f0803c', water: '#4a90e0', electric: '#f8d030', grass: '#5fbf4a', ice: '#7ccfd8', fighting: '#c03028',
  poison: '#a040a0', ground: '#d8b050', flying: '#9db7f5', psychic: '#f85888', bug: '#a8b820', rock: '#b8a038', ghost: '#705898',
  dragon: '#7038f8', dark: '#705848', steel: '#b8b8d0', fairy: '#ee99ac',
}

// Tabla de tipos: [fuerte contra, flojo contra]. Las inmunidades del juego original cuentan aquí como «flojo».
const CHART: Record<PType, [PType[], PType[]]> = {
  normal: [[], ['rock', 'steel', 'ghost']],
  fire: [['grass', 'ice', 'bug', 'steel'], ['fire', 'water', 'rock', 'dragon']],
  water: [['fire', 'ground', 'rock'], ['water', 'grass', 'dragon']],
  electric: [['water', 'flying'], ['electric', 'grass', 'dragon', 'ground']],
  grass: [['water', 'ground', 'rock'], ['fire', 'grass', 'poison', 'flying', 'bug', 'dragon', 'steel']],
  ice: [['grass', 'ground', 'flying', 'dragon'], ['fire', 'water', 'ice', 'steel']],
  fighting: [['normal', 'ice', 'rock', 'dark', 'steel'], ['poison', 'flying', 'psychic', 'bug', 'fairy', 'ghost']],
  poison: [['grass', 'fairy'], ['poison', 'ground', 'rock', 'ghost', 'steel']],
  ground: [['fire', 'electric', 'poison', 'rock', 'steel'], ['grass', 'bug', 'flying']],
  flying: [['grass', 'fighting', 'bug'], ['electric', 'rock', 'steel']],
  psychic: [['fighting', 'poison'], ['psychic', 'steel', 'dark']],
  bug: [['grass', 'psychic', 'dark'], ['fire', 'fighting', 'poison', 'flying', 'ghost', 'steel', 'fairy']],
  rock: [['fire', 'ice', 'flying', 'bug'], ['fighting', 'ground', 'steel']],
  ghost: [['psychic', 'ghost'], ['dark', 'normal']],
  dragon: [['dragon'], ['steel', 'fairy']],
  dark: [['psychic', 'ghost'], ['fighting', 'dark', 'fairy']],
  steel: [['ice', 'rock', 'fairy'], ['fire', 'water', 'electric', 'steel']],
  fairy: [['fighting', 'dragon', 'dark'], ['fire', 'poison', 'steel']],
}
// Los tipos pesan de verdad. Lo que evita que elegir comandante decida la partida es que casi todos los Pokémon
// tienen dos tipos y dos ataques (uno de cada tipo, o uno de cobertura si solo tienen un tipo).
export const STRONG = 1.5, WEAK = 0.6, IMMUNE = 0.25, COVERAGE = 0.85
const IMMUNITIES: Partial<Record<PType, PType[]>> = { // tipo del ataque -> tipos a los que apenas afecta
  electric: ['ground'], ground: ['flying'], normal: ['ghost'], fighting: ['ghost'], ghost: ['normal'], psychic: ['dark'], poison: ['steel'], dragon: ['fairy'],
}
export function effectiveness(att: PType, def: PType): number {
  if (IMMUNITIES[att]?.includes(def)) return IMMUNE
  const [strong, weak] = CHART[att]
  return strong.includes(def) ? STRONG : weak.includes(def) ? WEAK : 1
}
/** Multiplicador de un ataque contra un Pokémon: el producto contra cada uno de sus tipos. */
export const typeMult = (move: PType, defKind: string) => KINDS[defKind].types.reduce((m, t) => m * effectiveness(move, t), 1)
/** Potencia de un ataque de ese tipo usado por ese Pokémon: los de cobertura (de un tipo que no es el suyo) pegan algo menos. */
const movePower = (attKind: string, move: PType) => (KINDS[attKind].types.includes(move) ? 1 : COVERAGE)
export const moveMult = (attKind: string, move: PType, defKind: string) => movePower(attKind, move) * typeMult(move, defKind)
/** El ataque que más le conviene a ese Pokémon contra ese rival. */
export function bestMove(attKind: string, defKind: string): PType {
  const [a, b] = KINDS[attKind].moves
  return b && moveMult(attKind, b, defKind) > moveMult(attKind, a, defKind) ? b : a
}

// ---------- Roles ----------
// Como en Advance Wars, hay un conjunto fijo de tipos de unidad. Las estadísticas van en el rol; cada comandante
// pone sus propios Pokémon en cada rol (src/rosters.json), y lo que cambia entre ellos es el tipo.

export type RoleId =
  | 'capturador' | 'asaltante' | 'explorador' | 'luchador' | 'coloso' | 'tirador' | 'artillero' | 'volador' | 'bombardero'
  | 'nadador' | 'apoyo'

export interface Role {
  name: string
  help: string
  cost: number
  mv: number
  move: MoveType
  atk: number
  def: number
  range: [number, number]
  vision: number
  capture?: boolean
  heals?: boolean // cura a los aliados pegados al empezar el turno; su «ataque» no hace daño: duerme
}

export const ROLES: Record<RoleId, Role> = {
  capturador: { name: 'Capturador', help: 'Barato. Captura edificios.', cost: 1000, mv: 4, move: 'walk', atk: 0.65, def: 0.9, range: [1, 1], vision: 3, capture: true },
  asaltante: { name: 'Asaltante', help: 'Captura y pega fuerte, pero es lento.', cost: 2500, mv: 3, move: 'walk', atk: 1.35, def: 1.2, range: [1, 1], vision: 3, capture: true },
  explorador: { name: 'Explorador', help: 'Muy rápido y ve lejos. Frágil.', cost: 2000, mv: 7, move: 'walk', atk: 0.8, def: 0.85, range: [1, 1], vision: 5 },
  luchador: { name: 'Luchador', help: 'La línea de combate.', cost: 4000, mv: 5, move: 'walk', atk: 1.45, def: 1.3, range: [1, 1], vision: 3 },
  coloso: { name: 'Coloso', help: 'Caro y lento, pero lo aguanta todo.', cost: 8000, mv: 3, move: 'walk', atk: 1.8, def: 1.9, range: [1, 1], vision: 2 },
  tirador: { name: 'Tirador', help: 'Ataca a 2-3 casillas. No mueve y ataca.', cost: 4500, mv: 4, move: 'walk', atk: 1.5, def: 0.8, range: [2, 3], vision: 3 },
  artillero: { name: 'Artillero', help: 'Ataca a 3-5 casillas. Muy frágil.', cost: 7000, mv: 3, move: 'walk', atk: 1.65, def: 0.75, range: [3, 5], vision: 2 },
  volador: { name: 'Volador', help: 'Vuela sobre cualquier terreno.', cost: 4500, mv: 7, move: 'fly', atk: 1.3, def: 0.9, range: [1, 1], vision: 5 },
  bombardero: { name: 'Bombardero', help: 'Volador caro y demoledor.', cost: 8500, mv: 6, move: 'fly', atk: 2, def: 1.4, range: [1, 1], vision: 4 },
  nadador: { name: 'Nadador', help: 'Rapidísimo en el agua y torpe en tierra.', cost: 5000, mv: 6, move: 'swim', atk: 1.55, def: 1.4, range: [1, 1], vision: 3 },
  apoyo: { name: 'Apoyo', help: 'Cura 2 PS a los aliados pegados cada turno y duerme a un rival a 1-2 casillas.', cost: 3000, mv: 5, move: 'walk', atk: 0, def: 1.1, range: [1, 2], vision: 3, heals: true },
}
export const ROLE_ORDER = Object.keys(ROLES) as RoleId[]
// La segunda fase (se llega debilitando a un rival) mejora dentro del mismo rol
const VETERAN = { atk: 1.2, def: 1.15, mv: 1 }

export interface UnitKind {
  name: string
  species: string // nombre de los archivos de sprites y retrato
  type: PType // el primero de sus tipos (para colores e iconos)
  types: PType[] // uno o dos: deciden lo que recibe
  moves: PType[] // dos ataques: uno por tipo, o el suyo y uno de cobertura
  role: RoleId
  commander: string
  cost: number // 0 = no se puede reclutar (solo por evolución)
  mv: number
  move: MoveType
  atk: number
  def: number
  range: [number, number]
  vision: number
  capture?: boolean
  heals?: boolean
  evolves?: string
  final?: boolean // tercera fase
}

type Line = [base: string, evolved: string | null, types: string, coverage?: string]
const ROSTERS = rosters as unknown as Record<string, Record<RoleId, Line>>
const NAMES: Record<string, string> = { porygon2: 'Porygon2', porygon_z: 'Porygon-Z' }
const displayName = (species: string) => NAMES[species] ?? species[0].toUpperCase() + species.slice(1)

/** Todas las unidades del juego, generadas a partir de los roles y de los equipos de cada comandante. */
export const KINDS: Record<string, UnitKind> = {}
for (const [commander, roster] of Object.entries(ROSTERS)) {
  for (const role of ROLE_ORDER) {
    const [base, evolved, typeList, coverage] = roster[role]
    const types = typeList.split('/') as PType[]
    const moves = (coverage ? [types[0], coverage] : types) as PType[]
    const r = ROLES[role]
    const common = { type: types[0], types, moves, role, commander, move: r.move, range: r.range, vision: r.vision, capture: r.capture, heals: r.heals }
    KINDS[base] = { ...common, name: displayName(base), species: base, cost: r.cost, mv: r.mv, atk: r.atk, def: r.def, evolves: evolved ?? undefined }
    if (evolved) {
      KINDS[evolved] = {
        ...common, name: displayName(evolved), species: evolved, cost: 0, mv: r.mv + VETERAN.mv,
        atk: Math.round(r.atk * VETERAN.atk * 100) / 100, def: Math.round(r.def * VETERAN.def * 100) / 100,
      }
    }
  }
}
// Terceras fases (src/finals.json): se llega al nivel 3 y mejoran otro poco
for (const [from, to] of Object.entries(finals as Record<string, string>)) {
  const mid = KINDS[from]
  if (!mid) continue // esa línea ya no está en ningún equipo
  mid.evolves = to
  KINDS[to] = { ...mid, name: displayName(to), species: to, evolves: undefined, final: true, atk: Math.round(mid.atk * 110) / 100, def: Math.round(mid.def * 110) / 100 }
}

/** Lo que puede reclutar un comandante: su Pokémon de cada rol, por orden de rol. */
export const rosterOf = (commander: string): string[] => ROLE_ORDER.map((role) => ROSTERS[commander][role][0])
export const MAX_UNITS = 16 // tope de Pokémon en el campo por equipo

// Los mapas viven en src/maps.ts (generado por tools/make_maps.py)
export { MAPS } from './maps'
export type { MapDef } from './maps'

export const CAPTURE_POINTS = 20

// ---------- Comandantes ----------

export const ATTACK_NAME: Record<PType, string> = {
  grass: 'Hoja Afilada', fire: 'Lanzallamas', water: 'Pistola Agua', normal: 'Placaje', flying: 'Ataque Ala',
  rock: 'Lanzarrocas', fighting: 'Golpe Kárate', electric: 'Impactrueno', psychic: 'Confusión', dark: 'Mordisco',
  steel: 'Garra Metal', dragon: 'Dragoaliento', poison: 'Bomba Lodo', ground: 'Terremoto', bug: 'Tijera X',
  ghost: 'Bola Sombra', ice: 'Rayo Hielo', fairy: 'Brillo Mágico',
}

export interface Commander {
  name: string
  title: string
  power: string
  powerHelp: string
  color: string
  // Modificadores permanentes y con el poder activo
  atk: [number, number]
  def: [number, number]
  mv: [number, number]
  quotes: { start: string[]; ko: string[]; lost: string[]; capture: string[]; power: string; win: string }
}

export const COMMANDERS: Record<string, Commander> = {
  pikachu: {
    name: 'Pikachu', title: 'El alma del equipo', color: '#f8d030',
    power: 'Onda Vital', powerHelp: 'Cura 3 PS a todo tu equipo y le da +1 de movimiento y +20% de ataque.',
    atk: [1, 1.2], def: [1, 1], mv: [0, 1],
    quotes: {
      start: ['¡Pika! ¡Vamos, equipo!', '¡Nadie se queda atrás!', '¡Hoy ganamos seguro!'],
      ko: ['¡Pi-ka-CHU! ¡Toma ya!', '¡Bien hecho!', '¡Así se hace!'],
      lost: ['¡Nooo! ¡Aguantad!', 'Pika… eso ha dolido.'],
      capture: ['¡Esto ya es nuestro!', '¡Otra más para el equipo!'],
      power: '¡Arriba todo el mundo! ¡ONDA VITAL!', win: '¡Lo hemos conseguido juntos!',
    },
  },
  charizard: {
    name: 'Charizard', title: 'Puro fuego', color: '#f0803c',
    power: 'Sofoco', powerHelp: '+55% de ataque y +1 de movimiento hasta tu próximo turno.',
    atk: [1.15, 1.55], def: [0.97, 0.97], mv: [0, 1],
    quotes: {
      start: ['¡A quemarlo todo!', 'No pienso esperar. ¡Al ataque!', '¿Defender? Eso es de cobardes.'],
      ko: ['¡Reducido a cenizas!', '¡JA! ¿Eso era todo?', '¡Siguiente!'],
      lost: ['¡Grrr! ¡Me las vais a pagar!', 'Eso… no ha tenido gracia.'],
      capture: ['¡Mío!', 'Arde o ríndete. Ha elegido bien.'],
      power: '¡Vais a arder todos! ¡SOFOCO!', win: '¡Nadie apaga esta llama!',
    },
  },
  blastoise: {
    name: 'Blastoise', title: 'La muralla', color: '#4a90e0',
    power: 'Fortaleza', powerHelp: '+60% de defensa hasta tu próximo turno y cura 1 PS a todo tu equipo.',
    atk: [1, 1], def: [1.1, 1.6], mv: [0, 0],
    quotes: {
      start: ['Despacio y con buena letra.', 'Que vengan. Aquí los espero.', 'Paciencia. El agua siempre gana.'],
      ko: ['Te has estrellado contra un muro.', 'Uno menos.', 'Tranquilo, ya ha pasado.'],
      lost: ['Hm. Lo anoto.', 'Una grieta no hunde la presa.'],
      capture: ['Posición asegurada.', 'Ladrillo a ladrillo.'],
      power: 'De aquí no pasa nadie. ¡FORTALEZA!', win: 'El que resiste, gana.',
    },
  },
  gengar: {
    name: 'Gengar', title: 'El tramposo', color: '#8858c8',
    power: 'Bola Sombra', powerHelp: 'Todos los rivales pierden 1 PS (sin debilitarlos); tu equipo gana +25% de ataque y +1 de movimiento.',
    atk: [1, 1.25], def: [0.97, 0.97], mv: [0, 1],
    quotes: {
      start: ['Kekeke… ¿jugamos?', '¿Quién tiene miedo a la oscuridad?', 'No mires detrás de ti…'],
      ko: ['¡Bu! Kekeke.', '¿Ya te vas? Qué pena…', 'Ni lo ha visto venir.'],
      lost: ['¡Eh! ¡Eso es trampa! …Solo yo hago trampas.', 'Kek… ya verás, ya.'],
      capture: ['Esto ahora está encantado.', 'Kekeke, cambio de dueño.'],
      power: 'Que se apaguen las luces… ¡BOLA SOMBRA!', win: 'Kekekeke… dulces pesadillas.',
    },
  },
  venusaur: {
    name: 'Venusaur', title: 'El jardín que avanza', color: '#5fbf4a',
    power: 'Rayo Solar', powerHelp: 'Cura 2 PS a todo tu equipo y le da +30% de ataque.',
    atk: [1, 1.3], def: [1.05, 1.05], mv: [0, 0],
    quotes: {
      start: ['Sin prisa. Todo crece a su tiempo.', 'Echad raíces y aguantad.', 'Hoy hace un día precioso para ganar.'],
      ko: ['Abono para el jardín.', 'Se marchitó pronto.', 'Así se poda.'],
      lost: ['Una hoja que cae… ya saldrá otra.', 'Eso ha escocido.'],
      capture: ['Aquí planto yo.', 'Otro trocito de jardín.'],
      power: 'Que salga el sol… ¡RAYO SOLAR!', win: 'Todo florece cuando se cuida.',
    },
  },
  tyranitar: {
    name: 'Tyranitar', title: 'La montaña que anda', color: '#b8a038',
    power: 'Tormenta Arena', powerHelp: 'Todos los rivales pierden 1 PS y tu equipo gana +40% de defensa.',
    atk: [0.95, 1.05], def: [1.1, 1.45], mv: [0, 0],
    quotes: {
      start: ['Que tiemble el suelo.', 'Apartaos. Paso yo.', 'No pienso moverme de aquí.'],
      ko: ['Aplastado.', 'Polvo.', '¿Eso era un golpe?'],
      lost: ['Grrr… una piedra menos.', 'Me las pagaréis.'],
      capture: ['Esto ya es roca mía.', 'Mío.'],
      power: '¡Tragad arena! ¡TORMENTA ARENA!', win: 'Las montañas no pierden.',
    },
  },
  gardevoir: {
    name: 'Gardevoir', title: 'La que ve venir', color: '#f85888',
    power: 'Paz Mental', powerHelp: 'Cura 1 PS a tu equipo y le da +2 de movimiento y +25% de ataque.',
    atk: [1.05, 1.25], def: [1, 1], mv: [0, 2],
    quotes: {
      start: ['Ya sé cómo acaba esto.', 'Calma. Todo está previsto.', 'Un paso por delante, siempre.'],
      ko: ['Lo vi venir.', 'Tal como estaba escrito.', 'Elegante.'],
      lost: ['Eso… no lo esperaba.', 'Un pequeño desvío.'],
      capture: ['Justo donde debía.', 'Según lo previsto.'],
      power: 'Cerrad los ojos y sentid… ¡PAZ MENTAL!', win: 'El futuro ya estaba decidido.',
    },
  },
  lucario: {
    name: 'Lucario', title: 'El aura firme', color: '#4a78c8',
    power: 'Aura Esfera', powerHelp: '+50% de ataque, +15% de defensa y +1 de movimiento.',
    atk: [1.12, 1.5], def: [1, 1.15], mv: [0, 1],
    quotes: {
      start: ['Respira. Concéntrate. Golpea.', 'El aura está con nosotros.', 'Honor y disciplina.'],
      ko: ['Un golpe limpio.', 'Entrenamiento superado.', 'Bien luchado.'],
      lost: ['Ha caído con honor.', 'Aprenderemos de esto.'],
      capture: ['Posición tomada.', 'Paso a paso.'],
      power: 'Siento el aura de todos… ¡AURA ESFERA!', win: 'La disciplina vence a la fuerza.',
    },
  },
}
// Ajuste fino de equilibrio: multiplica el ataque y la defensa de todo el equipo de cada comandante. Lo calcula
// `pnpm tune` jugando la liga entera muchas veces hasta que todos rondan el 50% de victorias.
export const TUNE: Record<string, number> = {
  pikachu: 0.971, charizard: 1.031, blastoise: 1.013, gengar: 1.022, venusaur: 0.999, tyranitar: 0.942, gardevoir: 0.991, lucario: 1.021,
}
/** Estilo del comandante en una frase, sacado de sus números (sin contar el ajuste fino). */
export function passiveText(id: string): string {
  const c = COMMANDERS[id]
  const pct = (v: number) => `${v > 1 ? '+' : '−'}${Math.round(Math.abs(v - 1) * 100)}%`
  const parts = [c.atk[0] !== 1 ? `${pct(c.atk[0])} de ataque` : '', c.def[0] !== 1 ? `${pct(c.def[0])} de defensa` : '', c.mv[0] ? `+${c.mv[0]} de movimiento` : '']
  return parts.filter(Boolean).join(', ') || 'Equilibrado: sin puntos débiles'
}

export const POWER_COST = 24 // puntos de medidor (PS de daño repartido y recibido)
