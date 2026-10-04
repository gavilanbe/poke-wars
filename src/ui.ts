// Carteles a pantalla completa y transiciones: cortinilla, cambio de turno, súper poder, presentación y victoria.
// Todo se mide en `em`, y 1em es el 1% del alto del mapa, así que escala con la ventana.
import { COMMANDERS } from './data'
import { facePath } from './units'

const host = document.querySelector('#overlay') as HTMLElement
const wipe = document.querySelector('#wipe') as HTMLElement
const TEAM = ['ROJO', 'AZUL']
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

export function fitOverlays(stageHeight: number) {
  host.style.fontSize = wipe.style.fontSize = stageHeight / 100 + 'px'
}

wipe.innerHTML = '<i></i>'.repeat(10)

/** Cortinilla de barras que tapa la pantalla (como al empezar un combate en Pokémon). */
export async function cover(team = -1) {
  wipe.className = team < 0 ? 'in' : `in t${team}`
  wipe.hidden = false
  await sleep(330)
}

export async function uncover() {
  wipe.classList.replace('in', 'out')
  await sleep(330)
  wipe.hidden = true
}

const ticker = (text: string, cls = '') => `<div class="ticker ${cls}"><div>${`<span>${text}</span>`.repeat(10)}</div></div>`
const letters = (text: string) =>
  [...text].map((ch, i) => `<span style="--i:${i}">${ch === ' ' ? '&nbsp;' : ch}</span>`).join('')
const portrait = (co: string, expression: string, cls = '') =>
  `<div class="portrait ${cls}">${['e3', 'e2', 'e1', 'main'].map((c) => `<img class="${c}" src="${facePath(co, expression)}">`).join('')}</div>`

async function play(cls: string, html: string, ms: number) {
  host.className = cls
  host.innerHTML = html
  host.hidden = false
  void host.offsetWidth
  host.classList.add('go')
  await sleep(ms)
  host.hidden = true
  host.innerHTML = ''
}

export const hideOverlay = () => { host.hidden = true; host.innerHTML = '' }

/** Cambio de turno: barrido del color del equipo con el día en grande y el comandante. */
export function turnCard(day: number, team: number, co: string) {
  const c = COMMANDERS[co]
  return play(`turn t${team}`, `
    <div class="sweep s1"></div><div class="sweep s2"></div>
    ${ticker(`TURNO DEL EQUIPO ${TEAM[team]} ✦`, 'top')}${ticker(`TURNO DEL EQUIPO ${TEAM[team]} ✦`, 'bottom')}
    ${portrait(co, 'Normal')}
    <div class="words"><small>DÍA</small><b>${letters(String(day))}</b><i>Turno de ${c.name}</i></div>`, 1500)
}

/** Súper poder: rayos, rótulos corriendo, el comandante entrando con estela y el nombre a golpes. */
export function powerCutin(team: number, co: string) {
  const c = COMMANDERS[co]
  // Una palabra por línea, con las letras numeradas de corrido para que caigan en orden
  const words = c.power.toUpperCase().split(' ')
  let n = 0
  const title = words.map((w) => `<div>${[...w].map((ch) => `<span style="--i:${n++}">${ch}</span>`).join('')}</div>`).join('')
  return play(`power t${team}`, `
    <div class="dim"></div><div class="rays"></div>
    ${ticker(`★ PODER DE COMANDANTE ★ ${c.name.toUpperCase()}`, 'top')}${ticker(`★ PODER DE COMANDANTE ★ ${c.name.toUpperCase()}`, 'bottom')}
    <div class="band"><div class="stripes"></div></div>
    ${portrait(co, 'Determined')}
    <div class="words"><small>«${c.quotes.power}»</small><b style="font-size:${Math.min(18, 118 / Math.max(...words.map((w) => w.length)))}em">${title}</b><i>${c.powerHelp}</i></div>
    <div class="shock"></div><div class="flash"></div>`, 2900)
    .then(() => host.style.removeProperty('--c'))
}
export const setPowerColor = (co: string) => host.style.setProperty('--c', COMMANDERS[co].color)

/** Presentación de la partida: los dos comandantes frente a frente. */
export function versus(cos: [string, string]) {
  const side = (t: number) => `<div class="half h${t} t${t}">${portrait(cos[t], 'Determined')}
    <div class="who"><small>EQUIPO ${TEAM[t]}</small><b>${COMMANDERS[cos[t]].name}</b><i>${COMMANDERS[cos[t]].title}</i></div></div>`
  return play('versus', `${side(0)}${side(1)}<div class="vs">${letters('VS')}</div><div class="flash"></div>`, 2300)
}

/** Pantalla de victoria; se queda hasta que se pulse el botón. */
export function victory(team: number, co: string, day: number, onAgain: () => void) {
  const c = COMMANDERS[co]
  host.className = `victory t${team}`
  host.style.setProperty('--c', c.color)
  host.innerHTML = `<div class="dim"></div><div class="rays"></div>
    ${ticker(`VICTORIA DEL EQUIPO ${TEAM[team]} ✦`, 'top')}${ticker(`VICTORIA DEL EQUIPO ${TEAM[team]} ✦`, 'bottom')}
    ${portrait(co, 'Happy')}
    <div class="words"><b>${letters('¡VICTORIA!')}</b><small>${c.name} gana en el día ${day}</small><i>«${c.quotes.win}»</i>
      <button>Jugar otra vez</button></div>`
  host.hidden = false
  void host.offsetWidth
  host.classList.add('go')
  host.querySelector('button')!.onclick = onAgain
}
