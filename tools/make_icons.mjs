// Dibuja el icono de la aplicación con Chrome (misma fuente y mismos colores que el logo del título) y lo guarda en
// public/icons en todos los tamaños que piden Android, iOS y el navegador. Uso: node tools/make_icons.mjs
import puppeteer from 'puppeteer-core'
import { readFileSync } from 'node:fs'

const font = readFileSync('public/fonts/jersey25.woff2').toString('base64')
/** `safe`: cuánto del lienzo ocupa el dibujo (los iconos «maskable» de Android se recortan en círculo). */
const html = (safe) => `<!doctype html><style>
  @font-face { font-family: J; src: url(data:font/woff2;base64,${font}); }
  html, body { margin: 0; width: 100vw; height: 100vw; overflow: hidden; }
  body { position: relative; font-family: J; background: #10141c; }
  .bg { position: absolute; inset: 0; background: linear-gradient(115deg, #f4645a 0 20%, #d8362a 49.6%, #10141c 49.6% 50.4%, #2a5caa 50.4%, #1b3f7a 100%); }
  .rays { position: absolute; inset: -30%; background: repeating-conic-gradient(#ffffff1c 0 9deg, transparent 9deg 18deg); }
  .art { position: absolute; inset: ${(1 - safe) * 50}%; }
  .ball { position: absolute; left: 50%; top: 41%; width: 60%; aspect-ratio: 1; translate: -50% -50%; box-sizing: border-box; border-radius: 50%; border: ${safe * 3.4}vw solid #10141c;
    background: radial-gradient(circle at 30% 20%, #ffffff90 0 9%, transparent 10%), linear-gradient(#ff6a5c 0 20%, #e8382c 42%, #10141c 42% 58%, #ffffff 58% 80%, #c8d0e0 100%);
    box-shadow: 0 0 0 ${safe * 2}vw #fff, 0 0 0 ${safe * 3.2}vw #10141c, 0 ${safe * 3.4}vw 0 ${safe * 3.2}vw #0c1018a0; }
  .ball::after { content: ''; position: absolute; left: 50%; top: 50%; width: 30%; aspect-ratio: 1; translate: -50% -50%; box-sizing: border-box; border-radius: 50%; background: radial-gradient(circle, #fff 0 38%, #10141c 39% 50%, #fff 51%); border: ${safe * 3}vw solid #10141c; }
  .wars { position: absolute; left: 50%; bottom: 7%; translate: -50% 0; padding: 0 0.22em 0.03em 0.34em; font-size: ${safe * 27}vw; line-height: 1; letter-spacing: 0.12em; color: #fff; transform: skewX(-10deg); white-space: nowrap;
    background: linear-gradient(#f4645a 0 50%, #d8362a 50%); border: 0.06em solid #fff; box-shadow: 0 0 0 0.05em #10141c, 0 0 0 0.1em #ffd84a, 0 0 0 0.15em #10141c, 0 0.14em 0 0.15em #0c1018b0;
    text-shadow: 0.05em 0 #10141c, -0.05em 0 #10141c, 0 0.05em #10141c, 0 -0.05em #10141c, 0.04em 0.04em #10141c, -0.04em -0.04em #10141c, 0.04em -0.04em #10141c, -0.04em 0.04em #10141c, 0.07em 0.09em #5c0c08; }
</style><div class="bg"></div><div class="rays"></div><div class="art"><div class="ball"></div><div class="wars">WARS</div></div>`

const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true })
const page = await browser.newPage()
for (const [name, size, safe] of [['icon-512', 512, 0.92], ['icon-192', 192, 0.92], ['maskable-512', 512, 0.7], ['maskable-192', 192, 0.7], ['apple-touch-icon', 180, 0.88], ['favicon-32', 32, 1]]) {
  await page.setViewport({ width: size, height: size })
  await page.setContent(html(safe))
  await page.evaluate(() => document.fonts.ready)
  await page.screenshot({ path: `public/icons/${name}.png` })
}
await browser.close()
console.log('iconos en public/icons')
