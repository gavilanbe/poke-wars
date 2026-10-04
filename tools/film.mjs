// Tiras de fotogramas de las animaciones, para revisarlas sin verlas en movimiento.
//   node tools/film.mjs [nombre...]   ->  tools/preview/film-<nombre>.png
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import puppeteer from 'puppeteer-core'

const URL = process.env.URL ?? 'http://localhost:5199/'
const place = (terrain, building) => ({ terrain, building })
const fight = (a, d, extra = {}, terrain = '.') => ({
  a: { kind: a, hp: 10, team: 0, place: place('.') }, d: { kind: d, hp: 10, team: 1, place: place(terrain) },
  dmg: 4, counter: 2, evolved: null, evolvedKind: '', ...extra,
})
// nombre -> [código que arranca la escena, milisegundos a grabar]
const SCENES = {
  fuego: [`lab.battle(${JSON.stringify(fight('torchic', 'treecko', { dmg: 8, counter: 1 }, 'T'))})`, 5200],
  planta: [`lab.battle(${JSON.stringify(fight('treecko', 'mudkip', { dmg: 7, counter: 2 }))})`, 3200],
  agua: [`lab.battle(${JSON.stringify(fight('mudkip', 'geodude', { dmg: 10, counter: null }, '~'))})`, 4200],
  rayo: [`lab.battle(${JSON.stringify(fight('mareep', 'taillow', { dmg: 9, counter: null }, 'M'))})`, 3200],
  psiquico: [`lab.battle(${JSON.stringify(fight('ralts', 'machop', { dmg: 6, counter: null }))})`, 3200],
  roca: [`lab.battle(${JSON.stringify(fight('geodude', 'torchic', { dmg: 6, counter: 1 }))})`, 3400],
  placaje: [`lab.battle(${JSON.stringify(fight('zigzagoon', 'poochyena', { dmg: 4, counter: 5 }))})`, 5200],
  mordisco: [`lab.battle(${JSON.stringify(fight('poochyena', 'ralts', { dmg: 7, counter: null }, 'T'))})`, 3200],
  lucha: [`lab.battle(${JSON.stringify(fight('machop', 'munchlax', { dmg: 6, counter: 3 }))})`, 3200],
  ala: [`lab.battle(${JSON.stringify(fight('taillow', 'treecko', { dmg: 6, counter: 2 }))})`, 3200],
  acero: [`lab.battle(${JSON.stringify(fight('aron', 'geodude', { dmg: 9, counter: 1 }))})`, 3200],
  dragon: [`lab.battle(${JSON.stringify(fight('bagon', 'munchlax', { dmg: 5, counter: 3 }))})`, 3200],
  hielo: [`lab.battle(${JSON.stringify(fight('spheal', 'bagon', { dmg: 8, counter: 1 }))})`, 4200],
  fantasma: [`lab.battle(${JSON.stringify(fight('gastly', 'abra', { dmg: 7, counter: null }))})`, 3200],
  veneno: [`lab.battle(${JSON.stringify(fight('koffing', 'clefairy', { dmg: 7, counter: null }))})`, 3200],
  evolucion: [`lab.battle(${JSON.stringify(fight('treecko', 'mudkip', { dmg: 10, counter: null, evolved: 'a', evolvedKind: 'grovyle' }))})`, 6500],
  captura: [`lab.capture({ kind: 'zigzagoon', team: 0, building: { type: 'center', owner: 1 }, capBefore: 9, capAfter: 0, done: true, total: 20 })`, 5200],
  captura2: [`lab.capture({ kind: 'treecko', team: 1, building: { type: 'gym', owner: -1 }, capBefore: 20, capAfter: 10, done: false, total: 20 })`, 3200],
  pikachu: [`lab.power('pikachu')`, 4200],
  charizard: [`lab.power('charizard')`, 4200],
  blastoise: [`lab.power('blastoise')`, 4200],
  gengar: [`lab.power('gengar')`, 4600],
  turno: [`document.querySelector('#end').click()`, 2200],
  victoria: [`lab.win(0)`, 2800],
  inicio: [`document.querySelector('#title [data-go=solo]').click(); setTimeout(() => [...document.querySelectorAll('.cocard')][1].click(), 600)`, 4800, 'early'],
  titulo: [`0`, 2600, 'early'],
}

const names = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(SCENES)
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true })
const page = await browser.newPage()
await page.setViewport({ width: 1400, height: 800 })
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

for (const name of names) {
  await page.goto(URL)
  await sleep(name === 'titulo' ? 60 : 900)
  if (SCENES[name][2] !== 'early') {
    await page.evaluate(() => document.querySelector('#title [data-go=solo]').click())
    await sleep(500)
    await page.evaluate(() => [...document.querySelectorAll('.cocard')][0].click())
    await sleep(6500) // deja pasar la presentación y los saludos
  }
  const dir = `tools/preview/film/${name}`
  fs.rmSync(dir, { recursive: true, force: true })
  fs.mkdirSync(dir, { recursive: true })
  const box = await (await page.$('#stage')).boundingBox()
  const [code, ms] = SCENES[name]
  page.evaluate(code).catch(() => {}) // la promesa se corta al navegar a la siguiente escena
  const start = Date.now()
  let i = 0
  while (Date.now() - start < ms) {
    await page.screenshot({ path: `${dir}/${String(i++).padStart(3, '0')}.jpg`, type: 'jpeg', quality: 70, clip: box })
  }
  execFileSync('.venv/bin/python', ['tools/filmstrip.py', dir, `tools/preview/film-${name}.png`, String(ms)])
  console.log(name, i, 'fotogramas')
}
console.log(errors.length ? 'ERRORES:\n' + [...new Set(errors)].join('\n') : 'sin errores')
await browser.close()
