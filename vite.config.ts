import { createHash } from 'node:crypto'
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import type { Plugin } from 'vite'

// Cada compilación es una versión: la fecha y la hora, que es lo que se enseña en el título y lo que decide cuándo
// un móvil con el juego instalado tiene que actualizarse.
const now = new Date(), two = (n: number) => String(n).padStart(2, '0')
const VERSION = `${now.getUTCFullYear()}.${two(now.getUTCMonth() + 1)}.${two(now.getUTCDate())}.${two(now.getUTCHours())}${two(now.getUTCMinutes())}`

/**
 * Al acabar de compilar, apunta en precache.json todo lo que hay en dist: la «carcasa» (lo que hace falta para
 * arrancar) y los recursos (imágenes y sonidos, cada uno con la huella de su contenido y su peso), y graba la
 * versión dentro del service worker. Con eso sw.js sabe qué guardar y qué ha cambiado de una versión a otra.
 */
function pwa(): Plugin {
  return {
    name: 'poke-wars-pwa',
    apply: 'build',
    closeBundle() {
      const dist = 'dist', shell: string[] = [''], assets: Record<string, [string, number]> = {}
      const walk = (dir: string) => {
        for (const name of readdirSync(dir)) {
          const file = join(dir, name), path = relative(dist, file).split('\\').join('/')
          if (statSync(file).isDirectory()) { walk(file); continue }
          if (path === 'sw.js' || path === 'precache.json' || path === 'index.html' || name.startsWith('.')) continue
          if (/\.(png|mp3|jpg|webp)$/.test(name) && !path.startsWith('icons/')) assets[path] = [createHash('md5').update(readFileSync(file)).digest('hex').slice(0, 10), statSync(file).size]
          else shell.push(path)
        }
      }
      walk(dist)
      writeFileSync(join(dist, 'precache.json'), JSON.stringify({ version: VERSION, shell, assets }))
      writeFileSync(join(dist, 'sw.js'), readFileSync(join(dist, 'sw.js'), 'utf8').replace("'__VERSION__'", JSON.stringify(VERSION)))
      const bytes = Object.values(assets).reduce((sum, [, size]) => sum + size, 0)
      console.log(`\npwa: versión ${VERSION} · carcasa ${shell.length} archivos · recursos ${Object.keys(assets).length} (${(bytes / 1e6).toFixed(1)} MB)`)
    },
  }
}

// Rutas relativas: el juego se sirve igual en la raíz (pnpm dev) que en una subcarpeta (GitHub Pages)
export default { base: './', define: { __APP_VERSION__: JSON.stringify(process.env.NODE_ENV === 'production' || process.argv.includes('build') ? VERSION : 'dev') }, plugins: [pwa()] }
