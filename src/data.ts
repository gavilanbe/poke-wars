// Datos del juego: terrenos, tipos, roles, comandantes y mapa.
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
  '.': { name: 'Pradera', def: 1, cost: { walk: 1, fly: 1, swim: X, amph: 1 } },
  '"': { name: 'Hierba alta', def: 2, cost: { walk: 1, fly: 1, swim: X, amph: 1 } },
  T: { name: 'Bosque', def: 3, cost: { walk: 2, fly: 1, swim: X, amph: 2 } },
  M: { name: 'Montaña', def: 4, cost: { walk: 3, fly: 1, swim: X, amph: 3 } },
  '~': { name: 'Agua', def: 0, cost: { walk: X, fly: 1, swim: 1, amph: 1 } },
  s: { name: 'Piedras del río', def: 0, cost: { walk: 1, fly: 1, swim: 2, amph: 1 } },
  '=': { name: 'Camino', def: 0, cost: { walk: 1, fly: 1, swim: X, amph: 1 } },
  B: { name: 'Puerta', def: 3, cost: { walk: 1, fly: 1, swim: X, amph: 1 } },
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
export function effectiveness(att: PType, def: PType): number {
  const [strong, weak] = CHART[att]
  return strong.includes(def) ? 1.5 : weak.includes(def) ? 0.67 : 1
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
  heals?: boolean // cura a los aliados pegados al empezar el turno; no ataca
}

export const ROLES: Record<RoleId, Role> = {
  capturador: { name: 'Capturador', help: 'Barato. Captura edificios.', cost: 1000, mv: 4, move: 'walk', atk: 1, def: 1, range: [1, 1], vision: 3, capture: true },
  asaltante: { name: 'Asaltante', help: 'Captura y pega fuerte, pero es lento.', cost: 2500, mv: 3, move: 'walk', atk: 1.35, def: 1.2, range: [1, 1], vision: 3, capture: true },
  explorador: { name: 'Explorador', help: 'Muy rápido y ve lejos. Frágil.', cost: 2000, mv: 7, move: 'walk', atk: 0.9, def: 0.85, range: [1, 1], vision: 5 },
  luchador: { name: 'Luchador', help: 'La línea de combate.', cost: 4000, mv: 5, move: 'walk', atk: 1.45, def: 1.3, range: [1, 1], vision: 3 },
  coloso: { name: 'Coloso', help: 'Caro y lento, pero lo aguanta todo.', cost: 8000, mv: 3, move: 'walk', atk: 1.8, def: 1.9, range: [1, 1], vision: 2 },
  tirador: { name: 'Tirador', help: 'Ataca a 2-3 casillas. No mueve y ataca.', cost: 4500, mv: 4, move: 'walk', atk: 1.3, def: 0.8, range: [2, 3], vision: 3 },
  artillero: { name: 'Artillero', help: 'Ataca a 3-5 casillas. Muy frágil.', cost: 7000, mv: 3, move: 'walk', atk: 1.5, def: 0.7, range: [3, 5], vision: 2 },
  volador: { name: 'Volador', help: 'Vuela sobre cualquier terreno.', cost: 4500, mv: 7, move: 'fly', atk: 1.2, def: 0.9, range: [1, 1], vision: 5 },
  bombardero: { name: 'Bombardero', help: 'Volador caro y demoledor.', cost: 9500, mv: 6, move: 'fly', atk: 1.9, def: 1.3, range: [1, 1], vision: 4 },
  nadador: { name: 'Nadador', help: 'Solo se mueve por el agua, y ahí manda.', cost: 5000, mv: 6, move: 'swim', atk: 1.55, def: 1.4, range: [1, 1], vision: 3 },
  apoyo: { name: 'Apoyo', help: 'No ataca. Cura 2 PS a los aliados pegados cada turno.', cost: 3000, mv: 5, move: 'walk', atk: 0, def: 1.1, range: [0, 0], vision: 3, heals: true },
}
export const ROLE_ORDER = Object.keys(ROLES) as RoleId[]
// La segunda fase (se llega debilitando a un rival) mejora dentro del mismo rol
const VETERAN = { atk: 1.2, def: 1.15, mv: 1 }

export interface UnitKind {
  name: string
  species: string // nombre de los archivos de sprites y retrato
  type: PType
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
}

type Line = [base: string, evolved: string | null, type: string]
const ROSTERS = rosters as unknown as Record<string, Record<RoleId, Line>>
const NAMES: Record<string, string> = { porygon2: 'Porygon2' }
const displayName = (species: string) => NAMES[species] ?? species[0].toUpperCase() + species.slice(1)

/** Todas las unidades del juego, generadas a partir de los roles y de los equipos de cada comandante. */
export const KINDS: Record<string, UnitKind> = {}
for (const [commander, roster] of Object.entries(ROSTERS)) {
  for (const role of ROLE_ORDER) {
    const [base, evolved, type] = roster[role]
    const r = ROLES[role]
    const common = { type: type as PType, role, commander, move: r.move, range: r.range, vision: r.vision, capture: r.capture, heals: r.heals }
    KINDS[base] = { ...common, name: displayName(base), species: base, cost: r.cost, mv: r.mv, atk: r.atk, def: r.def, evolves: evolved ?? undefined }
    if (evolved) {
      KINDS[evolved] = {
        ...common, name: displayName(evolved), species: evolved, cost: 0, mv: r.mv + VETERAN.mv,
        atk: Math.round(r.atk * VETERAN.atk * 100) / 100, def: Math.round(r.def * VETERAN.def * 100) / 100,
      }
    }
  }
}
/** Lo que puede reclutar un comandante: su Pokémon de cada rol, por orden de rol. */
export const rosterOf = (commander: string): string[] => ROLE_ORDER.map((role) => ROSTERS[commander][role][0])
export const MAX_UNITS = 16 // tope de Pokémon en el campo por equipo

// Mitad izquierda del terreno (30x20 casillas en total): la derecha es su espejo, así las puertas (que siempre
// miran abajo) quedan igual de accesibles para los dos equipos.
const LEFT = [
  'TTT..T....TT.~~',
  'TT....M...T..~~',
  'T.....M......~~',
  '............M.~',
  '....""".==..T.~',
  '..==.""..=....~',
  'T..=TT...=....s',
  'T..=T....=====s',
  '"".=..M..=""..~',
  '"..=.....=...~~',
  '...=.....=...~~',
  '..============~',
  '...=.........=~',
  '...=...TTM"".=s',
  '...=......""T.~',
  '.MM=.......TT.~',
  '.............~~',
  'T.....~~~..TT~~',
  'T.."".~~~..M.ss',
  'TTT.""~~~....~~',
]
export const MAP = LEFT.map((row) => row + [...row].reverse().join(''))

// Edificios por la casilla de su puerta. owner: -1 neutral.
export const BUILDINGS: { type: BuildingType; owner: -1 | 0 | 1; x: number; y: number }[] = [
  { type: 'gym', owner: 0, x: 3, y: 10 },
  { type: 'center', owner: 0, x: 7, y: 10 },
  { type: 'house', owner: 0, x: 1, y: 13 },
  { type: 'house', owner: 0, x: 5, y: 13 },
  { type: 'house', owner: -1, x: 2, y: 4 },
  { type: 'mart', owner: -1, x: 8, y: 3 },
  { type: 'center', owner: -1, x: 11, y: 6 },
  { type: 'house', owner: -1, x: 3, y: 17 },
  { type: 'mart', owner: -1, x: 9, y: 16 },
  { type: 'house', owner: -1, x: 11, y: 10 },
  { type: 'gym', owner: 1, x: 26, y: 10 },
  { type: 'center', owner: 1, x: 22, y: 10 },
  { type: 'house', owner: 1, x: 27, y: 13 },
  { type: 'house', owner: 1, x: 23, y: 13 },
  { type: 'house', owner: -1, x: 26, y: 4 },
  { type: 'mart', owner: -1, x: 20, y: 3 },
  { type: 'center', owner: -1, x: 18, y: 6 },
  { type: 'house', owner: -1, x: 25, y: 17 },
  { type: 'mart', owner: -1, x: 19, y: 16 },
  { type: 'house', owner: -1, x: 17, y: 10 },
]

// Cada equipo empieza con el capturador y el explorador de su comandante
export const START_UNITS: { role: RoleId; team: 0 | 1; x: number; y: number }[] = [
  { role: 'capturador', team: 0, x: 3, y: 11 },
  { role: 'explorador', team: 0, x: 4, y: 11 },
  { role: 'capturador', team: 1, x: 26, y: 11 },
  { role: 'explorador', team: 1, x: 25, y: 11 },
]

// Parte del mapa que cabe en pantalla (en casillas); el resto se recorre con la cámara
export const VIEW = { w: 20, h: 13 }

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
  passive: string
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
    passive: 'Equilibrado: sin puntos débiles.',
    power: 'Onda Vital', powerHelp: 'Cura 3 PS a todo tu equipo y le da +1 de movimiento y +10% de ataque.',
    atk: [1, 1.1], def: [1, 1], mv: [0, 1],
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
    passive: '+15% de ataque.',
    power: 'Sofoco', powerHelp: '+50% de ataque y +1 de movimiento hasta tu próximo turno.',
    atk: [1.15, 1.5], def: [1, 1], mv: [0, 1],
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
    passive: '+10% de defensa.',
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
    passive: '+1 de movimiento, −10% de defensa.',
    power: 'Bola Sombra', powerHelp: 'Todos los rivales pierden 2 PS (sin debilitarlos).',
    atk: [1, 1.1], def: [0.9, 0.9], mv: [1, 1],
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
    passive: '+5% de ataque y +10% de defensa.',
    power: 'Rayo Solar', powerHelp: 'Cura 2 PS a todo tu equipo y le da +30% de ataque.',
    atk: [1.05, 1.3], def: [1.1, 1.1], mv: [0, 0],
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
    passive: '+10% de defensa, −5% de ataque.',
    power: 'Tormenta Arena', powerHelp: 'Todos los rivales pierden 1 PS y tu equipo gana +50% de defensa.',
    atk: [0.95, 1.1], def: [1.1, 1.45], mv: [0, 0],
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
    passive: '+1 de movimiento.',
    power: 'Paz Mental', powerHelp: 'Cura 1 PS a tu equipo y le da +2 de movimiento y +20% de ataque.',
    atk: [1, 1.2], def: [1, 1], mv: [1, 3],
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
    passive: '+10% de ataque.',
    power: 'Aura Esfera', powerHelp: '+45% de ataque, +10% de defensa y +1 de movimiento.',
    atk: [1.1, 1.45], def: [1, 1.1], mv: [0, 1],
    quotes: {
      start: ['Respira. Concéntrate. Golpea.', 'El aura está con nosotros.', 'Honor y disciplina.'],
      ko: ['Un golpe limpio.', 'Entrenamiento superado.', 'Bien luchado.'],
      lost: ['Ha caído con honor.', 'Aprenderemos de esto.'],
      capture: ['Posición tomada.', 'Paso a paso.'],
      power: 'Siento el aura de todos… ¡AURA ESFERA!', win: 'La disciplina vence a la fuerza.',
    },
  },
}
export const POWER_COST = 24 // puntos de medidor (PS de daño repartido y recibido)
