import { useEffect, useRef } from 'react'
import { useDim } from '../lib/dimension'

/**
 * The floor the 3D interface stands on: a perspective grid receding to a lit
 * horizon, with the livery's three stripes painted down it like a track, and
 * the livery again as ribbons of air streaming past the horizon (a WebGL
 * scene, gl/ribbons.ts, loaded only once 3D is on).
 * Scrolling drives forward over it; the pointer sways the vanishing point.
 *
 * Purely decorative — fixed behind everything (z-index -1, so it shows only
 * through the page's own gaps), aria-hidden, no pointer events. Motion is
 * skipped under reduced motion, and a hidden tab writes through directly rather
 * than waiting on animation frames that will never come.
 */
export default function DepthStage() {
  const dim = useDim()
  const ref = useRef<HTMLDivElement>(null)
  const gl = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    if (dim !== '3d') return
    let stop = () => {}
    let alive = true
    import('../gl/ribbons').then(({ mountRibbons }) => {
      if (alive && gl.current) stop = mountRibbons(gl.current)
    })
    return () => {
      alive = false
      stop()
    }
  }, [dim])

  useEffect(() => {
    const el = ref.current
    if (dim !== '3d' || !el) return
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)')
    let raf = 0
    let sway = 0
    let spot: [number, number] | null = null

    const frame = () => {
      raf = 0
      const still = reduce.matches
      el.style.setProperty('--floor-y', `${still ? 0 : (window.scrollY * 0.55).toFixed(1)}px`)
      el.style.setProperty('--sway', `${still ? 0 : sway.toFixed(1)}px`)
      // a work light that follows the pointer through the gaps between slabs
      if (spot) {
        el.style.setProperty('--spot-x', `${spot[0].toFixed(0)}px`)
        el.style.setProperty('--spot-y', `${spot[1].toFixed(0)}px`)
        el.style.setProperty('--spot-on', '1')
      }
    }
    const schedule = () => {
      if (document.hidden) frame()
      else if (!raf) raf = requestAnimationFrame(frame)
    }
    const onMove = (e: PointerEvent) => {
      sway = (e.clientX / (window.innerWidth || 1) - 0.5) * -70
      if (e.pointerType === 'mouse') spot = [e.clientX, e.clientY]
      schedule()
    }
    const onLeave = () => {
      spot = null
      el.style.setProperty('--spot-on', '0')
    }

    frame()
    window.addEventListener('scroll', schedule, { passive: true })
    window.addEventListener('pointermove', onMove, { passive: true })
    document.documentElement.addEventListener('pointerleave', onLeave)
    reduce.addEventListener('change', schedule)
    return () => {
      window.removeEventListener('scroll', schedule)
      window.removeEventListener('pointermove', onMove)
      document.documentElement.removeEventListener('pointerleave', onLeave)
      reduce.removeEventListener('change', schedule)
      if (raf) cancelAnimationFrame(raf)
    }
  }, [dim])

  if (dim !== '3d') return null
  return (
    <div ref={ref} className="depth-stage" aria-hidden="true">
      <div className="depth-floor" />
      <div className="depth-track" />
      <div className="depth-horizon" />
      <canvas ref={gl} className="depth-gl" />
      <div className="depth-spot" />
    </div>
  )
}
