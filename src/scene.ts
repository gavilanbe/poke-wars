// Motor de las escenas animadas (combate, captura, efectos sobre el mapa): un lienzo de píxel gordo con
// actores (sprites de Mundo Misterioso), partículas (sprites de efectos de Esmeralda) y parada de impacto.
import { Anim, drawSprite } from './units'

interface FxMeta { w: number; h: number; n: number; cols?: number } // sin `cols`, los fotogramas van apilados en vertical
let fxMeta: Record<string, FxMeta> = {}
const fxImages = new Map<string, HTMLImageElement>()

/** `track` deja contar cada hoja para la barra de carga. */
export async function loadFx(track = <V>(job: Promise<V>) => job) {
  const load = (name: string, file: string) => track(new Promise<void>((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve()
    img.onerror = reject
    img.src = `assets/fx/${file}`
    fxImages.set(name, img)
  }))
  // Efectos de Esmeralda (fotogramas apilados) y hojas de la comunidad (en rejilla)
  const [emerald, sheets] = await Promise.all(['fx.json', 'sheets.json'].map((f) => fetch('assets/fx/' + f).then((r) => r.json())))
  fxMeta = { ...emerald, ...sheets }
  await Promise.all([...Object.keys(emerald).map((n) => load(n, n + '.png')), ...Object.keys(sheets).map((n) => load(n, sheets[n].file))])
}

/** Añade una hoja de efectos ya cargada (las de la comunidad van en rejilla). */
export function registerSheet(name: string, img: HTMLImageElement, meta: FxMeta) {
  fxMeta[name] = meta
  fxImages.set(name, img)
}

// Hoja de un sprite de combate animado (GIF pasado a rejilla): si el actor la lleva, se pinta en vez del de Mundo Misterioso
export interface SpriteSheet { img: HTMLImageElement; w: number; h: number; cols: number; d: number[] }

const scratch = document.createElement('canvas')
scratch.width = scratch.height = 160
const scratchCtx = scratch.getContext('2d')!

export interface Actor {
  sheet?: SpriteSheet
  species: string; anim: Anim; animStart: number; loop: boolean; dir: number
  x: number; y: number // pies
  ox: number; oy: number; sx: number; sy: number; rot: number; alpha: number; scale: number
  tint: [string, number]; shadow: boolean; visible: boolean
}

export interface Part {
  x: number; y: number; vx?: number; vy?: number; g?: number; drag?: number
  life?: number; max: number; delay?: number
  img?: string // sprite de efecto; si no hay, cuadrado de color
  frame?: number; fps?: number; loop?: boolean; count?: number // animación del sprite: desde `frame`, `count` fotogramas
  color?: string; colors?: string[] // rampa de colores a lo largo de la vida
  size?: number; scale?: number; grow?: number // escala final relativa
  rot?: number; vr?: number; flipX?: boolean; fade?: boolean; add?: boolean; behind?: boolean
  ring?: number // en vez de sprite: anillo que crece hasta este radio
  line?: [number, number] // estela: vector hacia atrás
}

interface Ghost { actor: Actor; frameTime: number; life: number }

export const easeOut = (t: number) => 1 - Math.pow(1 - t, 3)
export const easeIn = (t: number) => t * t * t
export const easeBack = (t: number) => 1 + 2.7 * Math.pow(t - 1, 3) + 1.7 * Math.pow(t - 1, 2)
export const rnd = (a: number, b: number) => a + Math.random() * (b - a)

export class Scene {
  ctx: CanvasRenderingContext2D
  time = 0 // tiempo de la escena en ms (se para durante la parada de impacto)
  actors: Actor[] = []
  parts: Part[] = []
  ghosts: Ghost[] = []
  background: ((ctx: CanvasRenderingContext2D, time: number) => void) | null = null
  foreground: ((ctx: CanvasRenderingContext2D, time: number) => void) | null = null
  flash: [string, number, number] = ['#fff', 0, 1] // color, opacidad actual, caída por segundo
  camera = { x: 0, y: 0 } // desplazamiento del mundo (para la capa de efectos del mapa)
  private freeze = 0
  private shake = 0
  private last = 0
  private running = false
  private waiters: { at: number; resolve: () => void }[] = []
  private tweens: { start: number; ms: number; fn: (t: number) => void; resolve: () => void }[] = []

  constructor(public canvas: HTMLCanvasElement, public w: number, public h: number) {
    this.ctx = canvas.getContext('2d')!
    this.resize(w, h)
  }

  resize(w: number, h: number) {
    this.w = this.canvas.width = w
    this.h = this.canvas.height = h
  }

  start() {
    this.time = 0
    this.actors = []
    this.parts = []
    this.ghosts = []
    this.waiters = []
    this.tweens = []
    this.flash[1] = 0
    this.freeze = this.shake = 0
    this.slow = [0, 1]
    if (this.running) return
    this.running = true
    this.last = performance.now()
    requestAnimationFrame(this.loop)
  }

  stop() {
    this.running = false
    this.ctx.clearRect(0, 0, this.w, this.h)
    this.canvas.style.transform = ''
  }

  actor(species: string, x: number, y: number, dir: number, scale = 2): Actor {
    const a: Actor = {
      species, anim: 'Idle', animStart: this.time, loop: true, dir, x, y, ox: 0, oy: 0, sx: 1, sy: 1, rot: 0, alpha: 1,
      scale, tint: ['#fff', 0], shadow: true, visible: true,
    }
    this.actors.push(a)
    return a
  }

  play(a: Actor, anim: Anim, loop = false) {
    a.anim = anim
    a.animStart = this.time
    a.loop = loop
  }

  add(p: Part) {
    p.life = -(p.delay ?? 0)
    this.parts.push(p)
    return p
  }

  /** Sprite de efecto animado una vez (dura lo que su animación salvo que se indique `max`). */
  fx(img: string, x: number, y: number, opts: Partial<Part> = {}) {
    const fps = opts.fps ?? 14
    const count = opts.count ?? fxMeta[img].n - (opts.frame ?? 0)
    return this.add({ img, x, y, fps, max: (count / fps) * 1000, scale: 2, ...opts })
  }

  burst(x: number, y: number, n: number, opts: Partial<Part> & { speed?: number; colors?: string[]; up?: number } = {}) {
    const { speed = 2, up = 0 } = opts
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, v = speed * rnd(0.4, 1)
      this.add({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - up, max: rnd(250, 500), size: 2, fade: false, ...opts })
    }
  }

  ghost(a: Actor) {
    this.ghosts.push({ actor: { ...a, tint: [...a.tint] as [string, number] }, frameTime: this.time - a.animStart, life: 0 })
  }

  wait(ms: number) {
    return new Promise<void>((resolve) => this.waiters.push({ at: this.time + ms, resolve }))
  }

  tween(ms: number, fn: (t: number) => void) {
    return new Promise<void>((resolve) => this.tweens.push({ start: this.time, ms, fn, resolve }))
  }

  hitStop(ms: number) { this.freeze = Math.max(this.freeze, ms) }
  /** Cámara lenta durante `ms` (de reloj): el tiempo de la escena corre a `k` veces lo normal. */
  slowMo(ms: number, k = 0.3) { this.slow = [ms, k] }
  private slow: [number, number] = [0, 1]
  addShake(amount: number) { this.shake = Math.max(this.shake, amount) }
  flashScreen(color: string, alpha = 0.9, decay = 6) { this.flash = [color, alpha, decay] }

  private loop = (now: number) => {
    if (!this.running) return
    requestAnimationFrame(this.loop)
    const real = Math.min(50, now - this.last)
    this.last = now
    let dt = real
    if (this.freeze > 0) {
      this.freeze -= real
      dt = 0
    }
    else if (this.slow[0] > 0) {
      this.slow[0] -= real
      dt = real * this.slow[1]
    }
    this.time += dt
    this.update(dt, real)
    this.draw()
  }

  private update(dt: number, real: number) {
    for (const t of [...this.tweens]) {
      const k = Math.min(1, (this.time - t.start) / t.ms)
      t.fn(k)
      if (k >= 1) {
        this.tweens.splice(this.tweens.indexOf(t), 1)
        t.resolve()
      }
    }
    for (const w of [...this.waiters]) {
      if (this.time < w.at) continue
      this.waiters.splice(this.waiters.indexOf(w), 1)
      w.resolve()
    }
    const f = dt / 16.7
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i]
      p.life! += dt
      if (p.life! < 0) continue
      if (p.life! >= p.max) { this.parts.splice(i, 1); continue }
      p.vy = (p.vy ?? 0) + (p.g ?? 0) * f
      if (p.drag) { p.vx = (p.vx ?? 0) * Math.pow(p.drag, f); p.vy *= Math.pow(p.drag, f) }
      p.x += (p.vx ?? 0) * f
      p.y += p.vy * f
      if (p.vr) p.rot = (p.rot ?? 0) + p.vr * f
    }
    for (let i = this.ghosts.length - 1; i >= 0; i--) if ((this.ghosts[i].life += dt) > 160) this.ghosts.splice(i, 1)
    this.shake *= Math.pow(0.85, real / 16.7)
    if (this.shake < 0.4) this.shake = 0
    this.flash[1] = Math.max(0, this.flash[1] - (this.flash[2] * real) / 1000)
  }

  private drawActor(a: Actor, frameTime: number, alpha: number) {
    if (!a.visible) return
    const { ctx } = this
    const x = a.x + a.ox, y = a.y + a.oy
    if (!a.sheet) {
      drawSprite(ctx, a.species, a.anim, a.dir, frameTime, x, y - 10, {
        sx: a.sx * a.scale, sy: a.sy * a.scale, loop: a.loop, tint: a.tint, rot: a.rot, alpha: a.alpha * alpha,
      })
      return
    }
    // Sprite de combate: anclado por los pies (centro del borde inferior)
    const sh = a.sheet
    const total = sh.d.reduce((sum, d) => sum + d, 0)
    let t = Math.max(0, frameTime) % total, frame = 0
    while (t >= sh.d[frame]) t -= sh.d[frame++]
    const sx = (frame % sh.cols) * sh.w, sy = Math.floor(frame / sh.cols) * sh.h
    ctx.save()
    ctx.translate(Math.round(x), Math.round(y))
    ctx.scale(a.sx * a.scale, a.sy * a.scale)
    if (a.rot) { ctx.translate(0, -sh.h / 2); ctx.rotate(a.rot); ctx.translate(0, sh.h / 2) }
    ctx.globalAlpha = a.alpha * alpha
    if (a.tint[1] > 0) {
      scratchCtx.globalCompositeOperation = 'source-over'
      scratchCtx.clearRect(0, 0, 160, 160)
      scratchCtx.drawImage(sh.img, sx, sy, sh.w, sh.h, 0, 0, sh.w, sh.h)
      scratchCtx.globalCompositeOperation = 'source-atop'
      scratchCtx.globalAlpha = a.tint[1]
      scratchCtx.fillStyle = a.tint[0]
      scratchCtx.fillRect(0, 0, sh.w, sh.h)
      scratchCtx.globalAlpha = 1
      ctx.drawImage(scratch, 0, 0, sh.w, sh.h, -sh.w / 2, -sh.h, sh.w, sh.h)
    } else ctx.drawImage(sh.img, sx, sy, sh.w, sh.h, -sh.w / 2, -sh.h, sh.w, sh.h)
    ctx.restore()
  }

  private drawPart(p: Part) {
    if (p.life! < 0) return
    const { ctx } = this
    const k = p.life! / p.max
    const alpha = p.fade === false ? 1 : k < 0.7 ? 1 : (1 - k) / 0.3
    ctx.globalAlpha = alpha
    if (p.add) ctx.globalCompositeOperation = 'lighter'
    const color = p.colors ? p.colors[Math.min(p.colors.length - 1, Math.floor(k * p.colors.length))] : p.color ?? '#fff'
    const snap = (v: number) => Math.round(v / 2) * 2 // rejilla de píxel gordo
    if (p.ring) {
      ctx.strokeStyle = color
      ctx.lineWidth = Math.max(1, (p.size ?? 4) * (1 - k))
      ctx.beginPath()
      ctx.arc(snap(p.x), snap(p.y), Math.max(1, p.ring * easeOut(k)), 0, Math.PI * 2)
      ctx.stroke()
    } else if (p.line) {
      ctx.strokeStyle = color
      ctx.lineWidth = p.size ?? 2
      ctx.beginPath()
      ctx.moveTo(snap(p.x), snap(p.y))
      ctx.lineTo(snap(p.x - p.line[0] * (1 - k)), snap(p.y - p.line[1] * (1 - k)))
      ctx.stroke()
    } else if (p.img) {
      const m = fxMeta[p.img]
      let frame = p.frame ?? 0
      if (p.fps) {
        const n = Math.floor((p.life! / 1000) * p.fps), count = p.count ?? m.n - (p.frame ?? 0)
        frame += p.loop ? n % count : Math.min(count - 1, n)
      }
      const fx0 = m.cols ? (frame % m.cols) * m.w : 0, fy0 = m.cols ? Math.floor(frame / m.cols) * m.h : frame * m.h
      const s = (p.scale ?? 2) * (p.grow ? 1 + (p.grow - 1) * k : 1)
      ctx.save()
      ctx.translate(snap(p.x), snap(p.y))
      if (p.rot) ctx.rotate(p.rot)
      ctx.scale(p.flipX ? -s : s, s)
      ctx.drawImage(fxImages.get(p.img)!, fx0, fy0, m.w, m.h, -m.w / 2, -m.h / 2, m.w, m.h)
      ctx.restore()
    } else {
      const s = Math.max(2, snap((p.size ?? 2) * (p.grow ? 1 + (p.grow - 1) * k : 1)))
      ctx.fillStyle = color
      ctx.fillRect(snap(p.x) - s / 2, snap(p.y) - s / 2, s, s)
    }
    ctx.globalAlpha = 1
    ctx.globalCompositeOperation = 'source-over'
  }

  private draw() {
    const { ctx } = this
    ctx.imageSmoothingEnabled = false
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, this.w, this.h)
    if (this.shake) ctx.translate(Math.round(rnd(-1, 1) * this.shake), Math.round(rnd(-1, 1) * this.shake))
    ctx.translate(-Math.round(this.camera.x), -Math.round(this.camera.y))
    this.background?.(ctx, this.time)
    for (const p of this.parts) if (p.behind) this.drawPart(p)
    for (const a of this.actors) {
      if (!a.shadow || !a.visible || a.sheet) continue
      ctx.fillStyle = 'rgba(0, 0, 0, 0.25)'
      ctx.beginPath()
      ctx.ellipse(a.x + a.ox, a.y + 2, 9 * a.scale * Math.max(0.3, 1 + a.oy / 120), 3 * a.scale * Math.max(0.3, 1 + a.oy / 120), 0, 0, Math.PI * 2)
      ctx.fill()
    }
    for (const gh of this.ghosts) this.drawActor(gh.actor, gh.frameTime, 0.5 * (1 - gh.life / 160))
    for (const a of this.actors) this.drawActor(a, this.time - a.animStart, 1)
    for (const p of this.parts) if (!p.behind) this.drawPart(p)
    this.foreground?.(ctx, this.time)
    if (this.flash[1] > 0) {
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.globalAlpha = Math.min(1, this.flash[1])
      ctx.fillStyle = this.flash[0]
      ctx.fillRect(0, 0, this.w, this.h)
      ctx.globalAlpha = 1
    }
  }
}
