import { useEffect, useMemo, useRef } from 'react'
import { useDim } from '../lib/dimension'
import type { Contact, RadarApi } from '../gl/radar'

// kept in step with RING_AGES in gl/radar.ts (not imported, so the page needn't load the renderer)
const RINGS = [5, 10, 20, 25]

export interface ScopeContact extends Omit<Contact, 'sector'> {
  source: string
}

/**
 * The Literature page's 3D signature: its searches on a radar scope
 * (gl/radar.ts). Sector = database, distance = age, pillar = triage verdict.
 * 3D only; every contact is also a row in the lists below.
 */
export default function RadarScope({ contacts, sources, onPick }: { contacts: ScopeContact[]; sources: string[]; onPick: (key: string) => void }) {
  const dim = useDim()
  const canvas = useRef<HTMLCanvasElement>(null)
  const overlay = useRef<HTMLDivElement>(null)
  const api = useRef<RadarApi | null>(null)
  const now = new Date().getFullYear()
  // sectors only for the databases that returned something (all four while empty)
  const sectors = useMemo(() => {
    const seen = sources.filter((s) => contacts.some((c) => c.source === s))
    return seen.length ? seen : sources
  }, [contacts, sources])
  const model = useMemo(() => ({
    now,
    sectors,
    contacts: contacts.map((c) => ({ key: c.key, title: c.title, year: c.year, verdict: c.verdict, fresh: c.fresh, sector: Math.max(0, sectors.indexOf(c.source)) })),
  }), [contacts, sectors, now])
  const pick = useRef(onPick)
  pick.current = onPick
  const latest = useRef(model)
  latest.current = model

  useEffect(() => {
    if (dim !== '3d') return
    let alive = true
    import('../gl/radar').then(({ mountRadar }) => {
      if (!alive || !canvas.current || !overlay.current) return
      api.current = mountRadar(canvas.current, overlay.current, (k) => pick.current(k))
      api.current.update(latest.current)
    })
    return () => {
      alive = false
      api.current?.stop()
      api.current = null
    }
  }, [dim])
  useEffect(() => {
    api.current?.update(model)
  }, [model])

  if (dim !== '3d') return null
  const by = (s: string) => contacts.filter((c) => c.source === s).length
  const judged = contacts.filter((c) => c.verdict).length
  const summary = contacts.length
    ? `Radar: ${contacts.length} results — ${sectors.map((s) => `${by(s)} from ${s}`).join(', ')}; newest nearest the centre${judged ? `; ${judged} triaged` : ''}. Choose one below to open it.`
    : 'Radar: no results yet. Run a search and the results appear as contacts.'
  return (
    <div className="card lg radar-card" data-no-tilt>
      <div className="card-h" style={{ justifyContent: 'space-between' }}>
        <span><span className="sq" style={{ background: '#12d68f' }} />RADAR · {contacts.length} CONTACT{contacts.length === 1 ? '' : 'S'}</span>
        <span className="rs-legend">
          <i className="lg-include" />include <i className="lg-maybe" />maybe <i className="lg-exclude" />exclude <i className="lg-none" />untriaged
        </span>
      </div>
      <div className="radar-scope">
        <canvas ref={canvas} tabIndex={0} role="img" aria-label={summary} />
        <div ref={overlay} className="rs-labels" aria-hidden="true">
          {sectors.map((s, i) => <span key={s} className="rs-sector" data-sector={i}>{s}<b>{by(s)}</b></span>)}
          {RINGS.map((age) => <span key={age} className="rs-ring" data-ring={age}>{age === RINGS[RINGS.length - 1] ? `≤${now - age}` : now - age}</span>)}
          <span className="rs-tip" />
        </div>
        {contacts.length === 0 && <p className="rs-empty">Run a search — every result lands here: sector by database, distance by age.</p>}
      </div>
    </div>
  )
}
