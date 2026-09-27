import { useEffect, useRef } from 'react'
import { useDim } from '../lib/dimension'
import type { PowerSurface as Api, SurfaceData } from '../gl/powerSurface'
import { HEIGHT, DEPTH, X, Z } from '../gl/powerAxes'

const nice = (v: number) => (v >= 100 ? Math.round(v / 10) * 10 : Math.round(v))

/**
 * The Power page's 3D signature: power over sample size × effect, drawn from
 * the calculator's own inputs (gl/powerSurface.ts). 3D only — the flat page
 * keeps its curves, which are slices of this.
 */
export default function PowerSurface({ data, unit, required, summary }: { data: SurfaceData; unit: string; required: number; summary: string }) {
  const dim = useDim()
  const canvas = useRef<HTMLCanvasElement>(null)
  const overlay = useRef<HTMLDivElement>(null)
  const api = useRef<Api | null>(null)
  const latest = useRef(data)
  latest.current = data

  useEffect(() => {
    if (dim !== '3d') return
    let alive = true
    import('../gl/powerSurface').then(({ mountPowerSurface }) => {
      if (!alive || !canvas.current || !overlay.current) return
      api.current = mountPowerSurface(canvas.current, overlay.current)
      api.current.update(latest.current)
    })
    return () => {
      alive = false
      api.current?.stop()
      api.current = null
    }
  }, [dim])
  useEffect(() => {
    api.current?.update(data)
  }, [data])

  if (dim !== '3d') return null
  const at = (x: number, y: number, z: number) => `${x.toFixed(4)},${y.toFixed(4)},${z.toFixed(4)}`
  const nTicks = [0, 0.25, 0.5, 0.75, 1].map((t) => nice(data.nMin + t * (data.nMax - data.nMin)))
  const mTicks = [data.multMin, 0.75, 1, 1.25, data.multMax]
  const pTicks = [0.25, 0.5, 0.75, 1]
  const c = data.current
  const inRange = c && c.n >= data.nMin && c.n <= data.nMax
  return (
    <div className="card lg power-surface-card" data-no-tilt>
      <div className="card-h"><span className="sq" style={{ background: 'var(--navy)' }} />POWER SURFACE · {unit.toUpperCase()} × EFFECT</div>
      <div className="power-surface">
        <canvas ref={canvas} tabIndex={0} role="img" aria-label={summary} />
        <div ref={overlay} className="ps-labels" aria-hidden="true">
          {nTicks.map((n, i) => <span key={`n${i}`} className="ps-tick x" data-at={at(X(data, n), 0, DEPTH + 0.06)}>{n}</span>)}
          <span className="ps-title" data-at={at(0, 0, DEPTH + 0.2)}>{unit} →</span>
          {mTicks.map((m) => <span key={`m${m}`} className={`ps-tick z${m === 1 ? ' planned' : ''}`} data-at={at(-1.06, 0, Z(data, m))}>{m}×</span>)}
          <span className="ps-title z" data-at={at(-1.06, 0, DEPTH + 0.16)}>effect ↗</span>
          {/* power reads up the back-right upright, clear of the effect axis */}
          {pTicks.filter((p) => Math.abs(p - data.target) > 0.06).map((p) => <span key={`p${p}`} className="ps-tick y" data-at={at(1.03, p * HEIGHT, -DEPTH)}>{p}</span>)}
          <span className="ps-tick y target" data-at={at(1.03, data.target * HEIGHT, -DEPTH)}>{Math.round(data.target * 100)}% target</span>
          <span className="ps-title y" data-at={at(1.03, HEIGHT + 0.12, -DEPTH)}>power ↑</span>
          {inRange && <span className="ps-point" data-at={at(X(data, c.n), c.power * HEIGHT, Z(data, 1))}>n = {c.n} · {Math.round(c.power * 100)}%</span>}
        </div>
      </div>
      <p className="small" style={{ marginTop: 8 }}>
        Drag, or focus it and use the arrow keys, to turn the surface. The chart's three curves are slices of it, in the same colours; the bright line where it breaks through the amber glass is every design that just reaches {Math.round(data.target * 100)}% power{Number.isFinite(required) ? ` — ${required} ${unit} at the assumed effect` : ''}.
      </p>
    </div>
  )
}
