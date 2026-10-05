// Caché local de imágenes, sonidos y fuentes. GitHub Pages solo deja guardarlos 10 minutos, así que sin esto cada
// visita vuelve a preguntar por cientos de archivos. Aquí se sirven de la caché al momento y, si la copia tiene más
// de un día, se refresca por detrás para la próxima vez. El HTML, el código y los JSON van siempre por la red.
const CACHE = 'pokewars-assets-v1', DAY = 24 * 3600 * 1000

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()))
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url)
  if (e.request.method !== 'GET' || url.origin !== location.origin || e.request.headers.has('range')) return
  if (!/\.(png|mp3|woff2)$/.test(url.pathname) || url.pathname.includes('/audio/music_')) return // la música va en streaming
  e.respondWith(caches.open(CACHE).then(async (cache) => {
    const hit = await cache.match(e.request)
    const refresh = () => fetch(e.request).then((res) => { if (res.ok) cache.put(e.request, res.clone()); return res })
    if (!hit) return refresh()
    if (Date.now() - new Date(hit.headers.get('date') ?? 0).getTime() > DAY) e.waitUntil(refresh().catch(() => {}))
    return hit
  }))
})
