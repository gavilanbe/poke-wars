// Datos del juego: terrenos, tipos, unidades y mapa.

export type MoveType = 'walk' | 'fly' | 'swim' | 'amph'
export type PType =
  | 'grass' | 'fire' | 'water' | 'normal' | 'flying' | 'rock'
  | 'fighting' | 'electric' | 'psychic' | 'dark' | 'steel' | 'dragon'

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
  grass: 'Planta', fire: 'Fuego', water: 'Agua', normal: 'Normal', flying: 'Volador', rock: 'Roca',
  fighting: 'Lucha', electric: 'Eléctrico', psychic: 'Psíquico', dark: 'Siniestro', steel: 'Acero', dragon: 'Dragón',
}
export const TYPE_COLOR: Record<PType, string> = {
  grass: '#5fbf4a', fire: '#f0803c', water: '#4a90e0', normal: '#a8a878', flying: '#9db7f5', rock: '#b8a038',
  fighting: '#c03028', electric: '#f8d030', psychic: '#f85888', dark: '#705848', steel: '#b8b8d0', dragon: '#7038f8',
}

// Tabla de tipos reducida: [fuerte contra, débil contra]
const CHART: Record<PType, [PType[], PType[]]> = {
  grass: [['water', 'rock'], ['fire', 'flying', 'grass', 'steel', 'dragon']],
  fire: [['grass', 'steel'], ['water', 'rock', 'fire', 'dragon']],
  water: [['fire', 'rock'], ['grass', 'water', 'dragon']],
  normal: [[], ['rock', 'steel']],
  flying: [['grass', 'fighting'], ['rock', 'steel', 'electric']],
  rock: [['fire', 'flying'], ['fighting', 'steel']],
  fighting: [['normal', 'rock', 'steel', 'dark'], ['flying', 'psychic']],
  electric: [['water', 'flying'], ['grass', 'electric', 'dragon']],
  psychic: [['fighting'], ['psychic', 'steel', 'dark']],
  dark: [['psychic'], ['fighting', 'dark']],
  steel: [['rock'], ['fire', 'water', 'electric', 'steel']],
  dragon: [['dragon'], ['steel']],
}
export function effectiveness(att: PType, def: PType): number {
  const [strong, weak] = CHART[att]
  return strong.includes(def) ? 1.5 : weak.includes(def) ? 0.67 : 1
}

export interface UnitKind {
  name: string
  species: string // carpeta en graphics/pokemon (ver tools/extract.py)
  type: PType
  cost: number // 0 = no se puede reclutar (solo por evolución)
  mv: number
  move: MoveType
  atk: number
  def: number
  range: [number, number]
  capture?: boolean
  evolves?: string
}

const melee: [number, number] = [1, 1]
export const KINDS: Record<string, UnitKind> = {
  treecko: { name: 'Treecko', species: 'treecko', type: 'grass', cost: 1000, mv: 4, move: 'walk', atk: 1, def: 1, range: melee, capture: true, evolves: 'sceptile' },
  torchic: { name: 'Torchic', species: 'torchic', type: 'fire', cost: 1000, mv: 4, move: 'walk', atk: 1, def: 1, range: melee, capture: true, evolves: 'blaziken' },
  mudkip: { name: 'Mudkip', species: 'mudkip', type: 'water', cost: 1000, mv: 3, move: 'amph', atk: 1, def: 1, range: melee, capture: true, evolves: 'swampert' },
  zigzagoon: { name: 'Zigzagoon', species: 'zigzagoon', type: 'normal', cost: 1500, mv: 6, move: 'walk', atk: 0.8, def: 0.9, range: melee, capture: true },
  poochyena: { name: 'Poochyena', species: 'poochyena', type: 'dark', cost: 2000, mv: 5, move: 'walk', atk: 1.15, def: 1, range: melee },
  machop: { name: 'Machop', species: 'machop', type: 'fighting', cost: 3000, mv: 4, move: 'walk', atk: 1.4, def: 1.1, range: melee },
  geodude: { name: 'Geodude', species: 'geodude', type: 'rock', cost: 3500, mv: 3, move: 'walk', atk: 1.2, def: 1.6, range: melee },
  taillow: { name: 'Taillow', species: 'taillow', type: 'flying', cost: 3500, mv: 6, move: 'fly', atk: 1.1, def: 0.9, range: melee, evolves: 'swellow' },
  pikachu: { name: 'Pikachu', species: 'pikachu', type: 'electric', cost: 4000, mv: 4, move: 'walk', atk: 1.3, def: 0.8, range: [2, 3] },
  ralts: { name: 'Ralts', species: 'ralts', type: 'psychic', cost: 4000, mv: 3, move: 'walk', atk: 1.2, def: 0.8, range: [2, 3], evolves: 'gardevoir' },
  wailmer: { name: 'Wailmer', species: 'wailmer', type: 'water', cost: 5000, mv: 5, move: 'swim', atk: 1.4, def: 1.5, range: melee },
  snorlax: { name: 'Snorlax', species: 'snorlax', type: 'normal', cost: 7000, mv: 3, move: 'walk', atk: 1.6, def: 1.9, range: melee },
  metagross: { name: 'Metagross', species: 'metagross', type: 'steel', cost: 9000, mv: 4, move: 'walk', atk: 1.8, def: 1.8, range: melee },
  salamence: { name: 'Salamence', species: 'salamence', type: 'dragon', cost: 10000, mv: 7, move: 'fly', atk: 1.9, def: 1.4, range: melee },
  sceptile: { name: 'Sceptile', species: 'sceptile', type: 'grass', cost: 0, mv: 5, move: 'walk', atk: 1.5, def: 1.3, range: melee, capture: true },
  blaziken: { name: 'Blaziken', species: 'blaziken', type: 'fire', cost: 0, mv: 5, move: 'walk', atk: 1.5, def: 1.3, range: melee, capture: true },
  swampert: { name: 'Swampert', species: 'swampert', type: 'water', cost: 0, mv: 4, move: 'amph', atk: 1.5, def: 1.4, range: melee, capture: true },
  swellow: { name: 'Swellow', species: 'swellow', type: 'flying', cost: 0, mv: 8, move: 'fly', atk: 1.5, def: 1.1, range: melee },
  gardevoir: { name: 'Gardevoir', species: 'gardevoir', type: 'psychic', cost: 0, mv: 4, move: 'walk', atk: 1.5, def: 1, range: [2, 4] },
}
export const RECRUITABLE = Object.keys(KINDS).filter((k) => KINDS[k].cost > 0)

// Mitad izquierda del terreno (20x13): la derecha es su espejo, así las puertas (que siempre miran abajo)
// quedan igual de accesibles para los dos equipos.
const LEFT = [
  'TT.....T.~',
  'T.......T~',
  '.........s',
  '...=====.s',
  '...=..""~~',
  '...=."""~~',
  'T..=====ss',
  '...=..M.~~',
  '.."=....T~',
  '...=.....~',
  '...=====.s',
  'T.......Ms',
  'TT.""...T~',
]
export const MAP = LEFT.map((row) => row + [...row].reverse().join(''))

// Edificios por la casilla de su puerta. owner: -1 neutral.
export const BUILDINGS: { type: BuildingType; owner: -1 | 0 | 1; x: number; y: number }[] = [
  { type: 'gym', owner: 0, x: 3, y: 3 }, { type: 'center', owner: 0, x: 6, y: 3 }, { type: 'house', owner: 0, x: 1, y: 5 },
  { type: 'mart', owner: -1, x: 1, y: 8 }, { type: 'center', owner: -1, x: 6, y: 11 }, { type: 'house', owner: -1, x: 1, y: 11 },
  { type: 'gym', owner: 1, x: 16, y: 3 }, { type: 'center', owner: 1, x: 13, y: 3 }, { type: 'house', owner: 1, x: 17, y: 5 },
  { type: 'mart', owner: -1, x: 17, y: 8 }, { type: 'center', owner: -1, x: 13, y: 11 }, { type: 'house', owner: -1, x: 17, y: 11 },
]

export const START_UNITS: { kind: string; team: 0 | 1; x: number; y: number }[] = [
  { kind: 'zigzagoon', team: 0, x: 3, y: 4 },
  { kind: 'poochyena', team: 0, x: 4, y: 4 },
  { kind: 'zigzagoon', team: 1, x: 16, y: 4 },
  { kind: 'poochyena', team: 1, x: 15, y: 4 },
]

export const CAPTURE_POINTS = 20

// ---------- Comandantes ----------

export const ATTACK_NAME: Record<PType, string> = {
  grass: 'Hoja Afilada', fire: 'Lanzallamas', water: 'Pistola Agua', normal: 'Placaje', flying: 'Ataque Ala',
  rock: 'Lanzarrocas', fighting: 'Golpe Kárate', electric: 'Impactrueno', psychic: 'Confusión', dark: 'Mordisco',
  steel: 'Garra Metal', dragon: 'Dragoaliento',
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
    passive: '+10% de ataque, −5% de defensa.',
    power: 'Sofoco', powerHelp: '+50% de ataque y +1 de movimiento hasta tu próximo turno.',
    atk: [1.1, 1.5], def: [0.95, 0.95], mv: [0, 1],
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
}
export const POWER_COST = 24 // puntos de medidor (PS de daño repartido y recibido)
