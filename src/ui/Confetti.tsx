import { useEffect, useRef } from 'react'

const COLORS = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6', '#a855f7', '#ec4899']
const COUNT = 90
const DURATION = 3.5

/** Falling confetti on a canvas. The caller must not render it under prefers-reduced-motion. */
export function Confetti() {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const canvas = ref.current
    const ctx = canvas?.getContext?.('2d')
    if (!canvas || !ctx) return
    const dpr = window.devicePixelRatio || 1
    const resize = () => {
      canvas.width = canvas.clientWidth * dpr
      canvas.height = canvas.clientHeight * dpr
    }
    resize()
    const pieces = Array.from({ length: COUNT }, (_, i) => ({
      x: Math.random(), delay: Math.random() * 0.6, vx: (Math.random() - 0.5) * 120, vy: 80 + Math.random() * 200,
      rot: Math.random() * 6.28, spin: 2 + Math.random() * 6, color: COLORS[i % COLORS.length],
    }))
    const start = performance.now()
    let raf = 0
    const frame = (now: number) => {
      const t = (now - start) / 1000
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight)
      if (t > DURATION) return
      for (const p of pieces) {
        const tt = Math.max(0, t - p.delay)
        ctx.save()
        ctx.globalAlpha = Math.max(0, Math.min(1, (DURATION - t) / 0.8))
        ctx.translate(p.x * canvas.clientWidth + p.vx * tt, -20 + p.vy * tt + 150 * tt * tt)
        ctx.rotate(p.rot + tt * p.spin)
        ctx.fillStyle = p.color
        ctx.fillRect(-4, -6, 8, 12)
        ctx.restore()
      }
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [])
  return <canvas ref={ref} className="confetti" aria-hidden="true" />
}
