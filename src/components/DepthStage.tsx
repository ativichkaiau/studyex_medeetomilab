import { useEffect, useRef } from 'react'
import { useDim } from '../lib/dimension'

/**
 * The floor the 3D interface stands on: a perspective grid receding to a lit
 * horizon, with the livery's three stripes painted down it like a track, and
 * the livery again as ribbons of air streaming past the horizon (a WebGL
 * scene, gl/ribbons.ts, loaded only once 3D is on).
 * Scrolling drives forward over it; a work light follows the mouse.
 *
 * Purely decorative — fixed behind everything (z-index -1, so it shows only
 * through the page's own gaps), aria-hidden, no pointer events. Motion is
 * skipped under reduced motion, and a hidden tab writes through directly rather
 * than waiting on animation frames that will never come.
 *
 * Every per-frame write here is a transform on one element (depth.css), so the
 * compositor moves layers it has already drawn: nothing is repainted, and no
 * other element restyles, on scroll or pointer move.
 */
export default function DepthStage() {
  const dim = useDim()
  const floorRef = useRef<HTMLDivElement>(null)
  const spotRef = useRef<HTMLDivElement>(null)
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
    const floor = floorRef.current
    const light = spotRef.current
    if (dim !== '3d' || !floor || !light) return
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)')
    let raf = 0
    let spot: [number, number] | null = null

    const frame = () => {
      raf = 0
      // wrapped at one 96px grid cell: the plane only ever slides a cell's
      // length, and the pattern it carries repeats exactly
      floor.style.setProperty('--floor-y', `${reduce.matches ? 0 : ((window.scrollY * 0.55) % 96).toFixed(1)}px`)
      // a work light that follows the pointer through the gaps between slabs
      if (spot) {
        light.style.setProperty('--spot-x', `${spot[0].toFixed(0)}px`)
        light.style.setProperty('--spot-y', `${spot[1].toFixed(0)}px`)
        light.style.setProperty('--spot-on', '1')
      }
    }
    const schedule = () => {
      if (document.hidden) frame()
      else if (!raf) raf = requestAnimationFrame(frame)
    }
    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return
      spot = [e.clientX, e.clientY]
      schedule()
    }
    const onLeave = () => {
      spot = null
      light.style.setProperty('--spot-on', '0')
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
    <div className="depth-stage" aria-hidden="true">
      <div ref={floorRef} className="depth-floor" />
      <div className="depth-track" />
      <div className="depth-horizon" />
      <canvas ref={gl} className="depth-gl" />
      <div ref={spotRef} className="depth-spot" />
    </div>
  )
}
