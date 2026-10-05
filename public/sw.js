// Service worker de Poké Wars: hace que el juego arranque sin conexión y que las versiones nuevas entren limpias.
//
// · La «carcasa» (HTML, código, estilos, fuentes, datos) se guarda entera al instalar, en una caché con el nombre de
//   la versión. Mientras esa versión manda, todo sale de ahí: nunca se mezclan trozos de dos versiones.
// · Imágenes y sonidos se guardan según se usan, cada uno con la huella de su contenido. Al cambiar de versión solo
//   se vuelven a bajar los que han cambiado de verdad.
// · Una versión nueva se instala por detrás y espera: la página decide cuándo darle paso (en el título, sola; en
//   mitad de una partida, cuando la persona quiera) y entonces se recarga.
// · «Descargar para jugar sin conexión» baja todo lo que falte y va contando el progreso.
//
// __VERSION__ lo rellena la compilación (vite.config.ts), que también escribe precache.json con la lista de archivos.
const VERSION = '__VERSION__'
const SHELL = 'pokewars-shell-' + VERSION, ASSETS = 'pokewars-assets-v2'
const BASE = new URL('./', self.location).href

let manifest = null // { version, shell: [ruta], assets: { ruta: [huella, bytes] } }
async function getManifest() {
  if (manifest) return manifest
  const hit = await (await caches.open(SHELL)).match(BASE + 'precache.json')
  manifest = await (hit ?? (await fetch(BASE + 'precache.json', { cache: 'no-store' }))).json()
  return manifest
}
const keyOf = (path, entry) => BASE + path + '?v=' + entry[0]

self.addEventListener('install', (e) => e.waitUntil((async () => {
  const res = await fetch(BASE + 'precache.json?v=' + VERSION, { cache: 'no-store' })
  const list = await res.clone().json()
  if (list.version !== VERSION) throw new Error('la lista de archivos es de otra versión: se reintentará') // despliegue a medias
  const cache = await caches.open(SHELL)
  await cache.put(BASE + 'precache.json', res)
  await cache.addAll(list.shell.map((path) => new Request(BASE + path, { cache: 'reload' })))
})()))

self.addEventListener('activate', (e) => e.waitUntil((async () => {
  for (const name of await caches.keys()) if ((name.startsWith('pokewars-shell-') && name !== SHELL) || name === 'pokewars-assets-v1') await caches.delete(name)
  // Fuera las imágenes y sonidos que esta versión ya no usa o que han cambiado
  const list = await getManifest(), cache = await caches.open(ASSETS)
  const good = new Set(Object.entries(list.assets).map(([path, entry]) => keyOf(path, entry)))
  for (const req of await cache.keys()) if (!good.has(req.url)) await cache.delete(req)
  await self.clients.claim()
})()))

const pending = new Map()
/** Trae un archivo entero y lo guarda (una sola vez aunque lo pidan varios a la vez). */
function store(key) {
  let job = pending.get(key)
  if (!job) {
    // Con mala cobertura una petición se pierde de vez en cuando: se reintenta un par de veces antes de darla por perdida
    const attempt = (left) => fetch(key).then((res) => (res.ok || left <= 1 ? res : Promise.reject(new Error('estado ' + res.status))))
      .catch((err) => (left > 1 ? new Promise((resolve) => setTimeout(resolve, 350 * (4 - left))).then(() => attempt(left - 1)) : Promise.reject(err)))
    job = attempt(3).then(async (res) => {
      if (res.ok) await (await caches.open(ASSETS)).put(key, res.clone())
      return res
    }).finally(() => pending.delete(key))
    pending.set(key, job)
  }
  return job.then((res) => res.clone())
}

/** La música se pide a trozos: si el archivo ya está guardado, el trozo sale de ahí. */
async function slice(res, range) {
  const data = await res.arrayBuffer(), m = /bytes=(\d+)-(\d*)/.exec(range)
  if (!m) return new Response(data, { headers: res.headers })
  const start = Number(m[1]), end = m[2] ? Math.min(Number(m[2]), data.byteLength - 1) : data.byteLength - 1
  return new Response(data.slice(start, end + 1), { status: 206, headers: {
    'Content-Type': res.headers.get('Content-Type') ?? 'audio/mpeg', 'Content-Range': `bytes ${start}-${end}/${data.byteLength}`, 'Content-Length': String(end - start + 1), 'Accept-Ranges': 'bytes' } })
}

async function respond(e, path) {
  const shell = await (await caches.open(SHELL)).match(BASE + path)
  if (shell) return shell
  const entry = (await getManifest()).assets[path]
  if (!entry) return fetch(e.request)
  const key = keyOf(path, entry), range = e.request.headers.get('range')
  const hit = await (await caches.open(ASSETS)).match(key)
  if (hit) return range ? slice(hit, range) : hit
  if (!range) return store(key)
  e.waitUntil(store(key).catch(() => {})) // suena ya desde la red y, por detrás, se guarda entero para la próxima
  return fetch(e.request)
}

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url)
  if (e.request.method !== 'GET' || !url.href.startsWith(BASE)) return
  if (e.request.mode === 'navigate') return e.respondWith(caches.open(SHELL).then((cache) => cache.match(BASE)).then((hit) => hit ?? fetch(e.request)))
  e.respondWith(respond(e, decodeURIComponent(url.pathname.slice(new URL(BASE).pathname.length))))
})

// ---------- Descarga completa para jugar sin conexión ----------

const tell = async (msg) => { for (const client of await self.clients.matchAll({ includeUncontrolled: true })) client.postMessage(msg) }
/** Cuánto hay guardado ya, en bytes, y cuánto es todo. */
async function status() {
  const list = await getManifest(), have = new Set((await (await caches.open(ASSETS)).keys()).map((req) => req.url))
  let done = 0, total = 0
  const missing = []
  for (const [path, entry] of Object.entries(list.assets)) {
    total += entry[1]
    if (have.has(keyOf(path, entry))) done += entry[1]
    else missing.push([keyOf(path, entry), entry[1]])
  }
  return { done, total, missing }
}
let downloading = null
function downloadAll() {
  downloading ??= (async () => {
    const { done: had, total, missing } = await status()
    let done = had, failed = 0, last = 0
    const worker = async () => {
      for (let job = missing.pop(); job; job = missing.pop()) {
        try { const res = await store(job[0]); if (res.ok) done += job[1]; else failed++ } catch { failed++ }
        if (Date.now() - last > 250) { last = Date.now(); void tell({ type: 'offline', done, total, state: 'loading' }) }
      }
    }
    await Promise.all(Array.from({ length: 6 }, worker))
    await tell({ type: 'offline', done, total, state: failed ? 'partial' : 'ready' })
  })().finally(() => (downloading = null))
  return downloading
}

self.addEventListener('message', (e) => {
  if (e.data === 'skip') return void self.skipWaiting()
  if (e.data === 'offline-start') return e.waitUntil(downloadAll())
  if (e.data === 'offline-status') return e.waitUntil(status().then(({ done, total, missing }) => tell({ type: 'offline', done, total, state: downloading ? 'loading' : missing.length ? 'idle' : 'ready' })))
})
