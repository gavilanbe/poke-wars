// El juego como aplicación: instalarlo, jugar sin conexión y pasar de una versión a otra sin sustos. El trabajo de
// guardar archivos lo hace public/sw.js; aquí está lo que se ve: los botones del título y los avisos.
import { canFullscreen, goFullscreen, handheld, installed, isFullscreen } from './mobile'

declare const __APP_VERSION__: string
export const VERSION = __APP_VERSION__

const toastEl = document.querySelector<HTMLElement>('#toast')!
let toastTimer = 0
/** Aviso arriba de la pantalla; con `action`, lleva un botón y no se va solo. */
export function toast(text: string, action?: { label: string; run: () => void }) {
  clearTimeout(toastTimer)
  toastEl.innerHTML = `<span>${text}</span>`
  if (action) {
    const btn = document.createElement('button')
    btn.textContent = action.label
    btn.onclick = () => { toastEl.hidden = true; action.run() }
    toastEl.append(btn)
  } else toastTimer = window.setTimeout(() => (toastEl.hidden = true), 5000)
  toastEl.hidden = false
}

interface InstallPrompt extends Event { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> }
const mb = (bytes: number) => `${Math.round(bytes / 1e6)} MB`

/** `canReload` dice si ahora mismo se puede recargar sin fastidiar a nadie (en el título, sin partida en marcha). */
export function initPwa(canReload: () => boolean) {
  const q = (name: string) => document.querySelector<HTMLButtonElement>(`[data-app=${name}]`)!
  const fullBtn = q('full'), installBtn = q('install'), offlineBtn = q('offline')
  for (const el of document.querySelectorAll('.ver')) el.textContent = VERSION === 'dev' ? 'versión de desarrollo' : `v${VERSION}`

  // Pantalla completa (y, en Android, girada a horizontal)
  if (handheld && canFullscreen) {
    const paint = () => { fullBtn.classList.toggle('on', isFullscreen()); fullBtn.innerHTML = '<i></i>Pantalla completa' }
    fullBtn.hidden = false
    fullBtn.onclick = () => void goFullscreen(!isFullscreen())
    document.addEventListener('fullscreenchange', paint)
    paint()
  }

  // Instalar: Android y escritorio lo ofrecen ellos; en iPhone hay que explicarlo
  let prompt: InstallPrompt | null = null
  addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); prompt = e as InstallPrompt; installBtn.hidden = false })
  addEventListener('appinstalled', () => { installBtn.hidden = true; toast('¡Instalado! Búscalo en tu pantalla de inicio.') })
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  if (ios && !installed) installBtn.hidden = false
  installBtn.innerHTML = '⬇&#xFE0E; Instalar el juego'
  installBtn.onclick = async () => {
    if (!prompt) return toast('Para instalarlo: pulsa <b>Compartir</b> y luego <b>«Añadir a pantalla de inicio»</b>.')
    await prompt.prompt()
    if ((await prompt.userChoice).outcome === 'accepted') installBtn.hidden = true
    prompt = null
  }

  addEventListener('offline', () => toast('Sin conexión: puedes seguir jugando con lo que ya está guardado.'))
  addEventListener('online', () => toast('Conexión recuperada.'))

  if (!('serviceWorker' in navigator) || VERSION === 'dev') return
  const sw = navigator.serviceWorker

  // ---------- Versiones ----------
  let reloading = false, asked = false
  const hadController = !!sw.controller // la primera instalación toma el control sin que haya nada que recargar
  sw.addEventListener('controllerchange', () => { if (hadController && !reloading) { reloading = true; location.reload() } })
  const offer = (worker: ServiceWorker) => {
    const apply = () => worker.postMessage('skip')
    if (canReload()) return apply()
    if (asked) return
    asked = true
    toast('Hay una versión nueva del juego.', { label: 'Actualizar', run: apply })
  }
  void sw.register('sw.js').then((reg) => {
    if (reg.waiting && sw.controller) offer(reg.waiting)
    reg.addEventListener('updatefound', () => {
      const fresh = reg.installing
      fresh?.addEventListener('statechange', () => { if (fresh.state === 'installed' && sw.controller) offer(fresh) })
    })
    // Se mira si hay versión nueva al volver a la aplicación y, si se queda abierta, cada media hora
    const check = () => { if (!document.hidden && navigator.onLine) void reg.update().catch(() => {}) }
    document.addEventListener('visibilitychange', check)
    setInterval(check, 30 * 60 * 1000)
    // Una versión que se quedó esperando entra sola en cuanto se vuelve al título
    setInterval(() => { if (reg.waiting && sw.controller && canReload()) reg.waiting.postMessage('skip') }, 4000)
  }).catch(() => {})

  // ---------- Todo el juego guardado, para jugar sin conexión ----------
  const WANT = 'pokewars-offline'
  let state = 'idle'
  const paint = (done: number, total: number) => {
    offlineBtn.hidden = false
    offlineBtn.className = state
    offlineBtn.style.setProperty('--p', String(total ? done / total : 0))
    offlineBtn.innerHTML = state === 'ready' ? '✔&#xFE0E; Listo para jugar sin conexión'
      : state === 'loading' ? `Guardando el juego… ${Math.floor((done / total) * 100)}%`
      : state === 'partial' ? 'Descarga a medias · reintentar'
      : `⬇&#xFE0E; Jugar sin conexión (${mb(total - done)})`
  }
  const start = () => {
    localStorage.setItem(WANT, '1')
    void navigator.storage?.persist?.() // que el sistema no lo borre para hacer sitio
    void sw.ready.then((reg) => reg.active?.postMessage('offline-start'))
  }
  offlineBtn.onclick = () => {
    if (state === 'ready') return toast('Todo el juego está guardado en este aparato: funciona sin conexión.')
    if (state === 'loading') return
    if (!navigator.onLine) return toast('Ahora no hay conexión: inténtalo cuando vuelva.')
    start()
  }
  sw.addEventListener('message', (e) => {
    if (e.data?.type !== 'offline') return
    const was = state
    state = e.data.state
    paint(e.data.done, e.data.total)
    if (state === 'ready' && was === 'loading') toast('¡Listo! Ya puedes jugar sin conexión.')
    // Lo pidió antes (o lo tiene instalado) y ha salido una versión con archivos nuevos: se completa solo
    if (state === 'idle' && was === 'idle' && navigator.onLine && (localStorage.getItem(WANT) || installed)) start()
  })
  void sw.ready.then((reg) => reg.active?.postMessage('offline-status'))
}
