// Partículas y sacudida de pantalla sobre el mapa.

interface Particle { x: number; y: number; vx: number; vy: number; life: number; max: number; size: number; color: string; gravity: number }
const particles: Particle[] = []
let shake = 0

export interface BurstOpts { n?: number; colors?: string[]; speed?: number; life?: number; gravity?: number; size?: number; up?: number }

export function burst(x: number, y: number, o: BurstOpts = {}) {
  const { n = 12, colors = ['#fff'], speed = 1.6, life = 420, gravity = 0, size = 3, up = 0 } = o
  for (let i = 0; i < n; i++) {
    const angle = Math.random() * Math.PI * 2, v = speed * (0.4 + Math.random() * 0.6)
    particles.push({
      x, y, vx: Math.cos(angle) * v, vy: Math.sin(angle) * v - up,
      life: 0, max: life * (0.6 + Math.random() * 0.4), size: size * (0.6 + Math.random() * 0.7),
      color: colors[Math.floor(Math.random() * colors.length)], gravity,
    })
  }
}

export const addShake = (amount: number) => { shake = Math.max(shake, amount) }

/** Avanza la simulación y devuelve el desplazamiento de la sacudida. */
export function update(dt: number): [number, number] {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i]
    p.life += dt
    if (p.life >= p.max) { particles.splice(i, 1); continue }
    p.vy += p.gravity * dt * 0.001
    p.x += p.vx * dt * 0.06
    p.y += p.vy * dt * 0.06
  }
  shake *= Math.pow(0.86, dt / 16)
  if (shake < 0.3) shake = 0
  return [(Math.random() * 2 - 1) * shake, (Math.random() * 2 - 1) * shake]
}

export function draw(ctx: CanvasRenderingContext2D) {
  for (const p of particles) {
    const s = Math.max(1, Math.round(p.size * (1 - p.life / p.max)))
    ctx.fillStyle = p.color
    ctx.fillRect(Math.round(p.x - s / 2), Math.round(p.y - s / 2), s, s)
  }
}

export const clear = () => { particles.length = 0; shake = 0 }
