// Tutorial: el juego de verdad jugándose solo dentro de un marco, con la explicación debajo. Cada lección monta una
// situación en el primer mapa y la resuelve pulsando las mismas teclas que usaría una persona, contando cada paso
// mientras lo da; así, todo lo que se ve —mapa, cursor, menús, previsión, escenas de combate y de captura— es
// exactamente lo del juego. La lección se repite hasta que se pasa a la siguiente.
import { KINDS, POWER_COST, PType, ROLE_ORDER, RoleId, bestMove, moveMult, rosterOf } from './data'
import type { ItemType, Status } from './game'
import { sfx } from './sfx'

export interface DemoUnit { kind: string; team: 0 | 1; x: number; y: number; hp?: number; xp?: number; status?: Status }
/** Una situación sobre el primer mapa del juego: se cambian las unidades y, si hace falta, algún edificio. */
export interface Lesson {
  buildings?: { x: number; y: number; owner?: -1 | 0 | 1; cap?: number }[] // por la casilla de su puerta
  units: DemoUnit[]
  wild?: { x: number; y: number; kind: string; weak?: boolean }[]
  items?: { x: number; y: number; type: ItemType }[]
  funds?: [number, number]
  meter?: [number, number]
  cursor: [number, number]
}
/** Lo que el tutorial necesita del juego (lo pone main.ts). */
export interface DemoApi {
  canOpen(): boolean
  enter(): void // aparta la partida o el título y deja el tablero para las lecciones
  leave(): void // lo devuelve todo a como estaba
  load(lesson: Lesson): void
  idle(): boolean // el juego no está en mitad de una animación o una escena
  key(key: string): void // pulsa una tecla, como si lo hiciera el jugador
  look(x: number, y: number): void // lleva el cursor y la cámara a una casilla
  mode(): string
  hover(): { x: number; y: number } | null
}

// ---------- El escenario ----------
// Todo pasa en Río Central, alrededor de la base roja: gimnasio (3,10) y Centro (7,10) rojos, una casa sin dueño en
// (11,10), el prado de las filas 14 y 15, el bosque de (7,13)-(8,13), la hierba alta de (10,13)-(11,14) y el río.

const role = (co: string, r: RoleId) => rosterOf(co)[ROLE_ORDER.indexOf(r)]
const RED = (r: RoleId) => role('pikachu', r), BLUE = (r: RoleId) => role('charizard', r)
// Los equipos cambian: los Pokémon de ejemplo se buscan por tipo, no por nombre
const walkers = () => Object.keys(KINDS).filter((k) => KINDS[k].cost > 0 && KINDS[k].move === 'walk' && !KINDS[k].heals && KINDS[k].range[1] === 1)
const typed = (t: PType) => walkers().find((k) => KINDS[k].types[0] === t && KINDS[k].role === 'luchador') ?? walkers().find((k) => KINDS[k].types[0] === t) ?? RED('luchador')
/** El rival al que ese atacante pega más (o menos). */
const foeFor = (att: string, best: boolean) => {
  const mult = (k: string) => moveMult(att, bestMove(att, k), k)
  return walkers().filter((k) => k !== att && KINDS[k].role !== 'coloso').sort((a, b) => (best ? mult(b) - mult(a) : mult(a) - mult(b)))[0]
}
const far: DemoUnit = { kind: BLUE('luchador'), team: 1, x: 26, y: 11 } // el rival siempre tiene a alguien: sin Pokémon se acabaría la partida

// ---------- Las lecciones ----------

interface Driver {
  wait(ms: number): Promise<void>
  /** Cuenta el paso que viene y deja tiempo para leerlo. */
  say(text: string): Promise<void>
  /** Pulsa una tecla (se enseña junto al paso) y deja un respiro. */
  press(key: string, pause?: number): Promise<void>
  /** Lleva el cursor hasta una casilla a golpe de flecha. */
  to(x: number, y: number): Promise<void>
  until(test: () => boolean): Promise<void>
  /** Espera a que acabe lo que esté pasando (animación, escena, turno rival). */
  idle(): Promise<void>
  look(x: number, y: number): void
}
interface Page { title: string; text: string; lesson: () => Lesson; play: (d: Driver) => Promise<void> }

/** Espera a que salga el menú de órdenes (sin quedarse colgado si la jugada no era posible). */
const menu = async (d: Driver) => {
  for (let i = 0; i < 80 && api.mode() !== 'menu'; i++) await d.wait(60)
  await d.wait(500)
}

const PAGES: Page[] = [
  {
    title: 'EL OBJETIVO',
    text: 'Ganas si capturas el <b>gimnasio rival</b> o si dejas al otro equipo <b>sin Pokémon</b>.',
    lesson: () => ({ cursor: [3, 10], units: [{ kind: RED('capturador'), team: 0, x: 3, y: 11 }, { kind: RED('explorador'), team: 0, x: 4, y: 11 }, { kind: BLUE('capturador'), team: 1, x: 26, y: 11 }, { kind: BLUE('explorador'), team: 1, x: 25, y: 11 }] }),
    async play(d) {
      await d.say('Este es tu gimnasio, el de la bandera roja. Si el rival lo captura, pierdes.')
      d.look(26, 10)
      await d.say('Y este es el suyo, al otro lado del río. Llegar hasta su puerta y capturarlo es tu meta.')
      d.look(11, 6)
      await d.say('Por el camino hay casas, tiendas y Centros sin dueño. Quien los capture cobrará más cada turno.')
      d.look(3, 10)
      await d.say('Tú eres el equipo Rojo, arriba a la izquierda. El rival, el Azul, arriba a la derecha.')
    },
  },
  {
    title: 'MUEVE Y ORDENA',
    text: 'Cada Pokémon se mueve y actúa <b>una vez por turno</b>. Cuando acaben todos, pasas el turno.',
    lesson: () => ({ cursor: [4, 15], units: [{ kind: RED('luchador'), team: 0, x: 4, y: 14 }, { kind: RED('explorador'), team: 0, x: 5, y: 15 }, far] }),
    async play(d) {
      await d.say('Lleva el cursor a uno de tus Pokémon con las flechas.')
      await d.to(4, 14)
      await d.say('Enter lo elige. Las casillas azules son todas a las que puede llegar.')
      await d.press('Enter', 1300)
      await d.say('Marca el destino. La flecha roja te enseña el camino que seguirá.')
      await d.to(8, 14)
      await d.say('Enter confirma y sale el menú de órdenes. «Esperar» termina su jugada ahí.')
      await d.press('Enter')
      await menu(d)
      await d.wait(900)
      await d.press('Enter', 1000)
      await d.say('Se queda gris: ya ha actuado. Tab salta al siguiente que aún puede moverse.')
      await d.press('Tab', 1200)
      await d.to(8, 15)
      await d.press('Enter')
      await menu(d)
      await d.press('Enter', 900)
      await d.say('Cuando ya no quieras hacer nada más, E pasa el turno al rival.')
    },
  },
  {
    title: 'ATACA',
    text: 'Para atacar cuerpo a cuerpo hay que estar <b>pegado</b> al rival. Quien más vida tiene, más pega.',
    lesson: () => ({ cursor: [5, 14], units: [{ kind: RED('luchador'), team: 0, x: 5, y: 14 }, { kind: BLUE('luchador'), team: 1, x: 9, y: 14 }, far] }),
    async play(d) {
      await d.say('Elige a tu Pokémon y llévalo a la casilla de al lado del rival.')
      await d.press('Enter', 800)
      await d.to(8, 14)
      await d.press('Enter')
      await menu(d)
      await d.say('Ahora el menú ofrece «Atacar», porque hay un rival a tiro.')
      await d.press('Enter', 900) // la mira se pone sola en el rival y sale la previsión
      await d.say('La mira va sola al rival. Antes de confirmar, la previsión te dice el daño que harás y el que te devolverá.')
      await d.wait(900)
      await d.say('Enter: ¡al combate! Si el rival sobrevive, contraataca.')
      await d.press('Enter')
      await d.idle()
      await d.say('Los dos han perdido vida. Cuanta menos les quede, menos pegarán la próxima vez.')
    },
  },
  {
    title: 'LOS TIPOS MANDAN',
    text: 'Cada ataque tiene un tipo. <b>Súper eficaz</b> hace ×1,5 de daño; <b>poco eficaz</b>, solo ×0,6.',
    lesson: () => {
      const fire = typed('fire')
      return { cursor: [5, 15], units: [{ kind: fire, team: 0, x: 5, y: 15 }, { kind: foeFor(fire, false), team: 1, x: 8, y: 14 }, { kind: foeFor(fire, true), team: 1, x: 8, y: 16 }, far] }
    },
    async play(d) {
      await d.say('Tu Pokémon de Fuego puede colocarse entre dos rivales. ¿A cuál conviene pegar?')
      await d.press('Enter', 800)
      await d.to(8, 15)
      await d.press('Enter')
      await menu(d)
      await d.press('Enter', 600)
      await d.press('ArrowRight', 500)
      await d.say('Al de arriba: «poco eficaz». Resiste el Fuego y apenas le harías daño.')
      await d.wait(700)
      await d.press('ArrowRight', 500)
      await d.say('Al de abajo: «súper eficaz». Es débil al Fuego: ese es el objetivo.')
      await d.wait(700)
      await d.press('Enter')
      await d.idle()
      await d.say('Cada Pokémon tiene dos ataques y usa solo el mejor contra cada rival: la previsión ya lo cuenta.')
    },
  },
  {
    title: 'CAPTURA EDIFICIOS',
    text: 'Los edificios dan dinero. Solo los capturan los <b>Capturadores</b> y los <b>Asaltantes</b>.',
    lesson: () => ({ buildings: [{ x: 11, y: 10, cap: 10 }], cursor: [8, 11], units: [{ kind: RED('capturador'), team: 0, x: 8, y: 11 }, far] }),
    async play(d) {
      await d.say('Lleva a tu Capturador hasta la puerta de la casa gris, que no es de nadie.')
      await d.press('Enter', 800)
      await d.to(11, 10)
      await d.press('Enter')
      await menu(d)
      await d.say('En la puerta, el menú ofrece «Capturar».')
      await d.press('Enter')
      await d.wait(1500)
      await d.say('Cada turno le quita tanta resistencia como PS tenga él. A esta casa le quedaban 10 de 20: cae de una vez.')
      await d.idle()
      await d.say('¡Tuya! La bandera es roja y desde ahora te da dinero cada turno.')
    },
  },
  {
    title: 'COBRA Y RECLUTA',
    text: 'El dinero llega <b>al empezar tu turno</b>: 1000 por casa, Centro o gimnasio y 2000 por tienda.',
    lesson: () => ({ cursor: [7, 10], funds: [0, 0], units: [{ kind: RED('capturador'), team: 0, x: 4, y: 11 }, far] }),
    async play(d) {
      await d.say('Ahora mismo no tienes dinero (arriba a la izquierda). Pasa el turno con E.')
      await d.press('e')
      await d.wait(900)
      await d.say('Juega el rival… y vuelve tu turno: cobras por cada edificio tuyo.')
      await d.idle()
      await d.wait(1400)
      d.look(7, 10)
      await d.say('Pon el cursor en la puerta de tu Centro Pokémon y pulsa Enter.')
      await d.press('Enter')
      await d.until(() => api.mode() === 'recruit')
      await d.say('Cada rol hace una cosa y cuesta distinto. Muévete para mirarlos y Enter para reclutar.')
      for (let i = 0; i < 3; i++) await d.press('ArrowRight', 800)
      await d.press('Enter')
      await d.idle()
      await d.say('El recién llegado aparece en la puerta y podrá actuar desde tu siguiente turno.')
    },
  },
  {
    title: 'EL TERRENO',
    text: 'El terreno protege: cada estrella de defensa quita un <b>10% del daño</b> que recibe quien está encima.',
    lesson: () => {
      const ice = walkers().find((k) => KINDS[k].moves.includes('ice'))
      return { cursor: [5, 14], units: [{ kind: RED('luchador'), team: 0, x: 5, y: 14 }, { kind: BLUE('luchador'), team: 1, x: 8, y: 15 }, { kind: BLUE('luchador'), team: 1, x: 8, y: 13 }, ...(ice ? [{ kind: ice, team: 0 as const, x: 10, y: 11 }] : []), far] }
    },
    async play(d) {
      await d.say('Dos rivales iguales: uno en la pradera y otro metido en el bosque.')
      await d.press('Enter', 800)
      await d.to(8, 14)
      await d.press('Enter')
      await menu(d)
      await d.press('Enter', 900) // Atacar: la mira va sola al rival al que más daño se le hace
      await d.say('Al de la pradera (una estrella) le harías este daño.')
      await d.wait(600)
      await d.press('ArrowRight', 500)
      await d.say('Al del bosque (tres estrellas), bastante menos. Deja a los tuyos a cubierto y pega al que esté al descubierto.')
      await d.wait(600)
      await d.press('Escape', 500)
      await d.press('Escape', 700)
      await d.say('Además, un Pokémon con ataque de Hielo puede congelar el río si está en la orilla.')
      await d.to(10, 11)
      await d.press('Enter', 800)
      if (api.mode() !== 'move') return
      await d.to(13, 11)
      await d.press('Enter')
      await menu(d)
      await d.press('Enter') // Congelar
      await d.idle()
      await d.say('Ahora se cruza a pie… hasta que salga el sol. Y ojo: el Fuego quema el bosque y la hierba donde se esconde el rival.')
    },
  },
  {
    title: 'EXPERIENCIA Y EVOLUCIÓN',
    text: 'Hacer daño da <b>experiencia</b>. Con la barra llena, <b>Evolucionar</b> es una orden: gasta el turno, pero cura y hace más fuerte.',
    lesson: () => ({ cursor: [5, 14], units: [{ kind: RED('luchador'), team: 0, x: 5, y: 14, xp: 10, hp: 6 }, far] }),
    async play(d) {
      await d.say('La barra azul del panel es la experiencia: sube con cada PS que quita, y debilitar o capturar da un extra.')
      await d.say('Este la tiene llena: lleva una flecha dorada encima. Pero evolucionar no pasa solo: es una orden suya.')
      await d.press('Enter', 800)
      await d.press('Enter')
      await menu(d)
      await d.say('Ahí está, en dorado. Gasta su turno, pero le cura 3 PS y le sube ataque, defensa y movimiento.')
      await d.press('Enter') // Evolucionar
      await d.idle()
      await d.say('Tú eliges el momento: pegar ahora o crecer. Si tiene una tercera forma, al volver a llenar la barra, otra vez.')
    },
  },
  {
    title: 'ESTADOS Y APOYO',
    text: 'Algunos ataques dejan un <b>estado</b> además del daño. Lo ves junto al nombre al poner el cursor encima.',
    lesson: () => ({
      cursor: [4, 14],
      units: [{ kind: RED('luchador'), team: 0, x: 5, y: 14, hp: 7, status: 'burn' }, { kind: RED('explorador'), team: 0, x: 7, y: 14, hp: 6, status: 'poison' },
        { kind: RED('apoyo'), team: 0, x: 6, y: 15 }, { kind: RED('coloso'), team: 0, x: 7, y: 15, hp: 4 }, { kind: BLUE('luchador'), team: 1, x: 9, y: 15, status: 'sleep' }],
    }),
    async play(d) {
      await d.to(5, 14)
      await d.say('Quemado (por ataques de Fuego): pierde 1 PS cada turno.')
      await d.to(7, 14)
      await d.say('Envenenado: lo mismo, 1 PS por turno.')
      await d.to(9, 15)
      await d.say('Dormido o congelado: pierde su turno entero. Paralizado, se mueve la mitad.')
      await d.to(6, 15)
      await d.say('Este es tu Apoyo: no hace daño, pero duerme a un rival y cura a los aliados que tiene pegados.')
      await d.say('Pasa el turno y fíjate en los números que saltan al volver.')
      await d.press('e')
      await d.wait(900)
      await d.idle()
      await d.say('−1 a los que tienen estado y +2 al que está junto al Apoyo. Pisar un edificio tuyo quita el estado.')
    },
  },
  {
    title: 'EL PODER DEL COMANDANTE',
    text: 'El medidor de tu comandante se llena al <b>dar y recibir golpes</b>. Lleno, puedes soltar su poder.',
    lesson: () => ({
      cursor: [5, 14], meter: [POWER_COST, 0],
      units: [{ kind: RED('luchador'), team: 0, x: 5, y: 14, hp: 6 }, { kind: RED('capturador'), team: 0, x: 4, y: 15, hp: 5 }, { kind: RED('tirador'), team: 0, x: 6, y: 15, hp: 7 }, { kind: BLUE('luchador'), team: 1, x: 9, y: 14 }],
    }),
    async play(d) {
      await d.say('Arriba a la izquierda, bajo tu dinero: las barras están llenas y la estrella encendida.')
      await d.say('Pulsa P (o el botón de abajo a la derecha).')
      await d.press('p')
      await d.wait(900)
      await d.idle()
      await d.say('Cada comandante tiene el suyo: este cura a todo el equipo y le da ataque y movimiento. Dura hasta tu siguiente turno.')
    },
  },
  {
    title: 'SALVAJES Y OBJETOS',
    text: 'En la hierba alta se esconden <b>Pokémon salvajes</b>. Atraparlos cuesta <b>Balls</b> y algo de riesgo, pero salen mucho más baratos que reclutar.',
    lesson: () => ({
      cursor: [7, 14], funds: [1500, 0], items: [{ x: 5, y: 15, type: 'berry' }, { x: 8, y: 16, type: 'coin' }],
      wild: [{ x: 10, y: 14, kind: typed('grass') }, { x: 11, y: 13, kind: typed('normal'), weak: true }],
      units: [{ kind: RED('luchador'), team: 0, x: 7, y: 14 }, { kind: RED('capturador'), team: 0, x: 12, y: 12 }, { kind: RED('explorador'), team: 0, x: 4, y: 15, hp: 5 }, far],
    }),
    async play(d) {
      await d.say('La hierba que se agita esconde un salvaje; de cerca se ve quién es. Písala con cualquier Pokémon para debilitarlo.')
      await d.press('Enter', 800)
      await d.to(10, 14)
      await d.press('Enter')
      await menu(d)
      await d.press('Enter') // Esperar: al pisar la hierba, debilita al salvaje
      await d.idle()
      await d.say('Ahora lleva a un Capturador a un salvaje debilitado: así es mucho más fácil.')
      await d.to(12, 12)
      await d.press('Enter', 800)
      await d.to(11, 13)
      await d.press('Enter')
      await menu(d)
      await d.press('Enter') // el Capturador se planta encima: empieza el lanzamiento
      await d.wait(1800)
      await d.say('El cerco: pulsa en verde para golpearlo, en dorado para lanzar la Ball… y nunca en rojo, que te pega él. Aquí es todo dorado.')
      await d.press('Enter')
      await d.idle()
      await d.say('¡Atrapado! Espera en su Ball, en tu cinturón: un Capturador lo suelta donde quieras con la orden «Soltar».')
      await d.to(4, 15)
      await d.press('Enter', 800)
      await d.to(5, 15)
      await d.press('Enter')
      await menu(d)
      await d.press('Enter') // recoge la baya
      await d.idle()
      await d.say('La baya cura 4 PS y quita el estado; la moneda da dinero.')
    },
  },
]

// ---------- La ventana y el director ----------

let api: DemoApi
let host: HTMLElement
let page = 0, running = false, token = 0, steps = 0, onClose: (() => void) | null = null
const CANCEL = Symbol('cancel')
const KEY_LABEL: Record<string, string> = { ArrowLeft: '←', ArrowRight: '→', ArrowUp: '↑', ArrowDown: '↓', Escape: 'Esc', e: 'E', p: 'P', ' ': 'Espacio' }
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))
const q = <E extends HTMLElement>(sel: string) => host.querySelector(sel) as E
const restart = (el: HTMLElement, cls: string) => { el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls) }

function showKey(key: string) {
  const el = q('.pressed')
  el.textContent = KEY_LABEL[key] ?? key
  restart(el, 'hit')
}

function driver(my: number): Driver {
  const check = () => { if (my !== token) throw CANCEL }
  const d: Driver = {
    async wait(ms) { await sleep(ms); check() },
    async until(test) { while (!test()) { await sleep(60); check() } },
    async idle() { await d.wait(250); await d.until(api.idle); await d.wait(300) },
    async say(text) {
      check()
      q('.step b').textContent = String(++steps)
      q('.step span').textContent = text
      restart(q('.step'), 'new')
      await d.wait(Math.max(1700, text.length * 42)) // tiempo para leerlo
    },
    async press(key, pause = 260) { check(); showKey(key); api.key(key); await d.wait(pause) },
    async to(x, y) {
      for (let guard = 0; guard < 60; guard++) {
        const h = api.hover()
        if (!h || (h.x === x && h.y === y)) break
        await d.press(h.x < x ? 'ArrowRight' : h.x > x ? 'ArrowLeft' : h.y < y ? 'ArrowDown' : 'ArrowUp', 170)
      }
      await d.wait(300)
    },
    look(x, y) { check(); api.look(x, y) },
  }
  return d
}

/** Pone el texto de esa página y representa su lección en bucle hasta que se cambie o se cierre. */
async function show(next: number, dir = 1) {
  page = Math.max(0, Math.min(PAGES.length - 1, next))
  const my = ++token, p = PAGES[page]
  q('.count').textContent = `${page + 1} / ${PAGES.length}`
  q('h3').innerHTML = [...p.title].map((ch, i) => `<span style="--i:${i}">${ch === ' ' ? '&nbsp;' : ch}</span>`).join('')
  q('.lead').innerHTML = p.text
  q('.pressed').textContent = ''
  q('.step b').textContent = ''
  q('.step span').textContent = ''
  host.querySelectorAll('.dots i').forEach((dot, i) => dot.classList.toggle('on', i === page))
  q<HTMLButtonElement>('.prev').disabled = page === 0
  q('.next').textContent = page === PAGES.length - 1 ? '¡A JUGAR!' : '▶'
  q('.next').classList.toggle('go', page === PAGES.length - 1)
  host.style.setProperty('--dir', String(dir))
  restart(q('.copy'), 'swap')
  host.classList.add('waiting') // la lección anterior aún puede estar acabando una escena
  while (!api.idle()) await sleep(60)
  while (running && my === token) {
    api.load(p.lesson())
    host.classList.remove('waiting')
    steps = 0
    try {
      const d = driver(my)
      await d.wait(500)
      await p.play(d)
      await d.wait(1600)
    } catch (err) {
      if (err !== CANCEL) throw err
    }
    while (!api.idle()) await sleep(60)
  }
}

export const tutorial = {
  get isOpen() { return running },
  init(demo: DemoApi) {
    api = demo
    host = document.querySelector('#help')!
    host.innerHTML = `<div class="frame"><i>Un momento…</i></div>
      <header><b>CÓMO SE JUEGA</b><span class="count"></span><button class="x" title="Cerrar (Esc)">✖</button></header>
      <button class="prev" title="Anterior (←)">◀</button><button class="next" title="Siguiente (→)">▶</button>
      <div class="copy"><h3></h3><p class="lead"></p>
        <div class="step"><b></b><span></span><kbd class="pressed"></kbd></div></div>
      <nav class="dots">${PAGES.map(() => '<i></i>').join('')}</nav>
      <footer><kbd>←</kbd><kbd>→</kbd> pasar página · <kbd>Esc</kbd> cerrar · lo de la pantalla es el juego de verdad, jugando solo</footer>`
    q('.x').onclick = () => tutorial.close()
    q('.prev').onclick = () => tutorial.turn(-1)
    q('.next').onclick = () => tutorial.turn(1)
    host.querySelectorAll<HTMLElement>('.dots i').forEach((dot, i) => (dot.onclick = () => { sfx.cursor(); void show(i, i > page ? 1 : -1) }))
  },
  /** Abre el tutorial por la primera lección; la promesa se resuelve al cerrarlo. */
  open(): Promise<void> {
    if (running || !api.canOpen()) return Promise.resolve()
    running = true
    api.enter()
    host.hidden = false
    restart(host, 'open')
    sfx.confirm()
    void show(0)
    return new Promise((resolve) => (onClose = resolve))
  },
  async close() {
    if (!running) return
    token++
    host.classList.add('waiting')
    sfx.cancel()
    while (!api.idle()) await sleep(60) // deja que termine la escena en curso antes de devolver la partida
    running = false
    host.hidden = true
    api.leave()
    onClose?.()
    onClose = null
  },
  /** Pasa página; en la última, «siguiente» cierra. */
  turn(step: number) {
    if (step > 0 && page === PAGES.length - 1) return void tutorial.close()
    if (step < 0 && page === 0) return
    sfx.cursor()
    void show(page + step, step)
  },
  /** Teclas de la persona mientras está abierto (las del juego las pulsa el propio tutorial). */
  key(k: string) {
    if (k === 'ArrowRight' || k === 'Enter' || k === ' ' || k === 'ArrowDown') tutorial.turn(1)
    else if (k === 'ArrowLeft' || k === 'ArrowUp' || k === 'Backspace') tutorial.turn(-1)
    else if (k === 'Escape' || k === 'x' || k === 'h') void tutorial.close()
    else if (/^[1-9]$/.test(k) && Number(k) <= PAGES.length) void show(Number(k) - 1)
  },
}
