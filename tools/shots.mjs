// Capturas con Chrome headless para revisar la interfaz (con `pnpm dev --port 5199` en marcha).
//   node tools/shots.mjs
import puppeteer from 'puppeteer-core'

const URL = process.env.URL ?? 'http://localhost:5199/'
const OUT = 'tools/preview/'
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
})
const page = await browser.newPage()
await page.setViewport({ width: 1400, height: 800 })
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const shot = (name) => page.screenshot({ path: OUT + name + '.png' })
const tile = (x, y) => page.evaluate(([tx, ty]) => lab.screen(tx, ty), [x, y])
const click = async (x, y) => page.mouse.click(...(await tile(x, y)))
const button = async (label) => {
  await page.evaluate((label) => [...document.querySelectorAll('#menu button, #recruit button, .cocard')].find((b) => b.textContent.includes(label)).click(), label)
}

const enter = () => page.evaluate(() => document.querySelector('#title [data-go=solo]').click())

await page.goto(URL)
await sleep(2600)
await shot('00-titulo')
await enter()
await sleep(700)
await shot('0-comandantes')
await button('Pikachu')
await sleep(4200)
await shot('1-inicio')

// Mover a Zigzagoon y abrir el menú
await click(3, 11)
await sleep(500)
await page.mouse.move(...(await tile(4, 13)))
await sleep(300)
await shot('2-mover')
await click(4, 13)
await sleep(1000)
await shot('3-menu')
await button('Esperar')
await click(8, 9)
await sleep(400)
await shot('4-reclutar')
await page.keyboard.press('ArrowRight')
await page.keyboard.press('ArrowDown')
await sleep(300)
await shot('4b-reclutar-teclado')
await page.evaluate(() => document.querySelector('.pc .cell').click())
await sleep(700)

// Partida IA contra IA un rato, para ver un mapa avanzado
await page.goto(URL + '?auto')
await sleep(2500)
await shot('5-auto')

// Combate: se fuerza un duelo desde la consola
await page.goto(URL)
await sleep(900)
await enter()
await sleep(500)
await button('Pikachu')
await sleep(4500)
await page.evaluate(() => {
  const g = window.game()
  const foe = g.units.find((u) => u.team === 1 && u.kind === 'poochyena')
  foe.x = 6
  foe.y = 11
  g.units.find((u) => u.team === 0 && u.kind === 'poochyena').kind = 'treecko'
})
await click(4, 11)
await click(5, 11)
await sleep(1000)
await button('Atacar')
await page.mouse.move(...(await tile(6, 11)))
await sleep(200)
await shot('6-objetivo')
await click(6, 11)
await sleep(2300)
await shot('7-ataque')
await sleep(6500)
await shot('9-vuelta')

// Súper poder con el medidor lleno
await page.evaluate(() => (window.game().meter[0] = 99))
await page.keyboard.press('p')
await sleep(1250)
await shot('10-poder')
await sleep(1300)
await shot('11-efecto')

console.log(errors.length ? 'ERRORES:\n' + errors.join('\n') : 'sin errores')
await browser.close()
