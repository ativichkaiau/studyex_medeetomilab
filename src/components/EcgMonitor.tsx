import { useEffect, useRef } from 'react'
import { useDim } from '../lib/dimension'

/**
 * A pit-wall monitor on the Overview of a Brugada project: a schematic lead V1
 * showing the type 1 pattern, swept live and receding into a waterfall
 * (gl/ecg.ts). An illustration of the pattern's shape, labelled as one — it
 * carries no measurements. Part of the 3D interface only; flat 2D is the
 * original design.
 */
export default function EcgMonitor() {
  const dim = useDim()
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    if (dim !== '3d') return
    let stop = () => {}
    let alive = true
    import('../gl/ecg').then(({ mountEcg }) => {
      if (alive && ref.current) stop = mountEcg(ref.current)
    })
    return () => {
      alive = false
      stop()
    }
  }, [dim])

  if (dim !== '3d') return null
  return (
    <div className="ecg-monitor" role="img" aria-label="Schematic ECG, lead V1: the Brugada type 1 pattern — a coved ST-segment elevation descending into a negative T wave. An illustration, not patient data.">
      <canvas ref={ref} aria-hidden="true" />
      <div className="ecg-hud" aria-hidden="true">
        <span><b>V1</b> · schematic</span>
        <span>Brugada type 1 · <i>coved ST</i> → negative T</span>
      </div>
      <div className="ecg-note" aria-hidden="true">Illustrative waveform · not patient data</div>
    </div>
  )
}
