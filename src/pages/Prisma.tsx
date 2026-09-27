import { useStore } from '../lib/store'
import { Kicker, Rule } from '../components/ui'
import { PrismaFlow } from '../components/srmaPlots'
import { PrismaTower } from '../components/Solids'

export default function Prisma() {
  const { state, updatePrisma } = useStore()
  const p = state.review.prisma
  const num = (k: keyof typeof p) => (
    <input
      className="input"
      type="number"
      min={0}
      style={{ width: 92 }}
      value={(p[k] as number) ?? 0}
      onChange={(e) => updatePrisma({ [k]: Math.max(0, Math.round(+e.target.value)) } as Partial<typeof p>)}
    />
  )
  const setExcl = (i: number, patch: { reason?: string; n?: number }) => {
    const next = p.fullTextExcluded.map((e, j) => (j === i ? { ...e, ...patch } : e))
    updatePrisma({ fullTextExcluded: next })
  }

  return (
    <>
      <div className="page-head">
        <Rule />
        <Kicker>SYSTEMATIC REVIEW · PRISMA 2020 FLOW</Kicker>
        <h1 style={{ marginTop: 12 }}>PRISMA flow</h1>
        <p>Study selection from identification to inclusion. Counts come from your screener — edit them below and the diagram redraws.</p>
      </div>

      <div className="grid g2" style={{ alignItems: 'start' }}>
        <div className="card lg">
          <div className="card-h"><span className="sq" style={{ background: 'var(--accent, var(--blue))' }} />FLOW DIAGRAM</div>
          <PrismaFlow prisma={p} />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="card lg">
            <div className="card-h"><span className="sq" style={{ background: 'var(--blue)' }} />COUNTS</div>
            <div className="kv" style={{ alignItems: 'center' }}><span className="k">DB records</span>{num('dbRecords')}</div>
            <div className="kv" style={{ alignItems: 'center' }}><span className="k">Other sources</span>{num('otherRecords')}</div>
            <div className="kv" style={{ alignItems: 'center' }}><span className="k">Duplicates</span>{num('duplicates')}</div>
            <div className="kv" style={{ alignItems: 'center' }}><span className="k">Screened</span>{num('screened')}</div>
            <div className="kv" style={{ alignItems: 'center' }}><span className="k">Excluded (screen)</span>{num('excludedScreen')}</div>
            <div className="kv" style={{ alignItems: 'center' }}><span className="k">Full-text assessed</span>{num('fullText')}</div>
            <div className="kv" style={{ alignItems: 'center' }}><span className="k">Included</span>{num('included')}</div>
          </div>

          <div className="card lg">
            <div className="card-h"><span className="sq" style={{ background: 'var(--red)' }} />FULL-TEXT EXCLUSIONS</div>
            {p.fullTextExcluded.map((e, i) => (
              <div className="kv" key={i} style={{ alignItems: 'center', gap: 8 }}>
                <input className="input" style={{ flex: 1 }} value={e.reason} onChange={(ev) => setExcl(i, { reason: ev.target.value })} />
                <input className="input" type="number" min={0} style={{ width: 72 }} value={e.n} onChange={(ev) => setExcl(i, { n: Math.max(0, Math.round(+ev.target.value)) })} />
              </div>
            ))}
          </div>

          <div className="card rail">
            <p className="small">Screening runs in your dedicated app.</p>
            <a className="btn ghost sm" href={state.review.screenerUrl} target="_blank" rel="noreferrer" style={{ marginTop: 8 }}>Open the SRMA screener ↗</a>
          </div>
        </div>
      </div>

      <PrismaTower p={p} />
    </>
  )
}
