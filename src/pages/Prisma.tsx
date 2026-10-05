import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useStore } from '../lib/store'
import { Kicker, Tag, Empty } from '../components/ui'
import { PrismaFlow } from '../components/srmaPlots'
import { PrismaTower } from '../components/Solids'
import { FigureFrame } from '../components/FigureFrame'
import { prismaAudit, unexplainedExclusions } from '../lib/prismaAudit'
import { derivePrisma } from '../lib/screening'
import { analysisIncluded } from '../lib/cohorts'
import { openTerra, TERRA_TASKS } from '../lib/terra'

type Counts = ReturnType<typeof useStore>['state']['review']['prisma']

/**
 * PRISMA — the selection trace. Each count is a step in the flow; the audit
 * checks the flow's own arithmetic and the stored counts against the in-app
 * screening log and the extraction table, and says what to repair.
 */
export default function Prisma() {
  const { state, updatePrisma, updateReview } = useStore()
  const r = state.review
  const p = r.prisma
  const included = r.studies.filter(analysisIncluded).length
  const checks = useMemo(() => prismaAudit(r, included), [r, included])
  const unexplained = unexplainedExclusions(r)
  const recs = r.screening ?? []
  const ftOut = p.fullTextExcluded.reduce((s, e) => s + (e.n || 0), 0)

  const num = (k: keyof Counts, label: string) => (
    <input className="input mono pr-num" type="number" min={0} aria-label={label} value={(p[k] as number) ?? 0}
      onChange={(e) => updatePrisma({ [k]: Math.max(0, Math.round(+e.target.value)) } as Partial<Counts>)} />
  )
  const setExcl = (i: number, patch: { reason?: string; n?: number }) => updatePrisma({ fullTextExcluded: p.fullTextExcluded.map((e, j) => (j === i ? { ...e, ...patch } : e)) })
  const addExcl = () => updatePrisma({ fullTextExcluded: [...p.fullTextExcluded, { reason: '', n: 0 }] })
  const delExcl = (i: number) => updatePrisma({ fullTextExcluded: p.fullTextExcluded.filter((_, j) => j !== i) })
  const compile = () => updateReview({ prisma: derivePrisma(recs, p) }, { kind: 'prisma', text: 'PRISMA screening counts compiled from the screening log' })

  const row = (k: keyof Counts | null, label: string, value: React.ReactNode, derived?: string) => (
    <tr>
      <td className="pr-l">{label}</td>
      <td className="r">{k ? num(k, label) : <span className="mono pr-derived">{value}</span>}</td>
      <td className="pr-note mono">{derived ?? ''}</td>
    </tr>
  )

  return (
    <>
      <div className="page-head">
        <div className="flex" style={{ justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
          <div style={{ minWidth: 0 }}>
            <Kicker>pipeline / 07 prisma · trace</Kicker>
            <h1>PRISMA</h1>
            <p>Study selection from identification to inclusion (PRISMA 2020). The counts are traced against the flow's own arithmetic, the <Link to="/screening">screening</Link> log and the <Link to="/studies">extraction</Link> table; each mismatch below says what to repair.</p>
          </div>
          <div className="row-actions" style={{ flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            <button className="btn primary sm" onClick={compile} disabled={!recs.length} title={recs.length ? 'Replace the screening counts with those derived from the screening log (search counts are kept)' : 'No in-app screening log to compile from'}>compile from screening →</button>
            <button className="btn ghost sm" onClick={() => openTerra({ prompt: TERRA_TASKS.prisma[0].prompt })}>terra · audit flow</button>
          </div>
        </div>
      </div>

      <div className={`audit-bar ${checks.length ? 'bad' : 'ok'}`} role="status">
        <span className="mono">{checks.length ? `${checks.length} inconsistenc${checks.length === 1 ? 'y' : 'ies'}` : '0 inconsistencies'}</span>
        <span>{checks.length ? 'the flow does not trace end to end — see the audit' : p.dbRecords + p.otherRecords + p.screened === 0 ? 'no counts recorded yet' : 'every step follows from the one before it'}</span>
        {unexplained > 0 && <Tag tone="warn">{unexplained} full-text exclusions without a reason</Tag>}
      </div>

      <div className="pr-grid">
        <div className="pr-col">
          <div className="card" style={{ padding: 0 }}>
            <div className="card-h" style={{ margin: 0, padding: '8px 16px' }}>trace</div>
            <table className="pr-trace">
              <tbody>
                <tr className="pr-sec"><td colSpan={3}>identification</td></tr>
                {row('dbRecords', 'database records', null)}
                {row('otherRecords', 'other sources', null)}
                {row('duplicates', 'duplicates removed', null)}
                {row(null, 'after deduplication', p.dbRecords + p.otherRecords - p.duplicates, 'identified − duplicates')}
                <tr className="pr-sec"><td colSpan={3}>screening</td></tr>
                {row('screened', 'records screened', null, recs.length ? `log: ${recs.length}` : '')}
                {row('excludedScreen', 'excluded at title/abstract', null)}
                <tr className="pr-sec"><td colSpan={3}>eligibility</td></tr>
                {row('fullText', 'full texts assessed', null)}
                {row(null, 'excluded at full text', ftOut, `${p.fullTextExcluded.length} reason${p.fullTextExcluded.length === 1 ? '' : 's'}`)}
                <tr className="pr-sec"><td colSpan={3}>included</td></tr>
                {row('included', 'studies included', null, `extraction: ${included}`)}
              </tbody>
            </table>
          </div>

          <div className="card">
            <div className="card-h">full-text exclusions <span className="spacer" /><button className="go" style={{ textTransform: 'none', letterSpacing: 0 }} onClick={addExcl}>＋ reason</button></div>
            {p.fullTextExcluded.length === 0 ? <Empty path="exclusions/">0 reasons logged</Empty> : p.fullTextExcluded.map((e, i) => (
              <div className="pr-excl" key={i}>
                <input className="input" value={e.reason} placeholder="reason (e.g. wrong population)" onChange={(ev) => setExcl(i, { reason: ev.target.value })} aria-label={`Exclusion reason ${i + 1}`} />
                <input className="input mono" type="number" min={0} value={e.n} onChange={(ev) => setExcl(i, { n: Math.max(0, Math.round(+ev.target.value)) })} aria-label={`Exclusion count ${i + 1}`} />
                <button className="icon-btn danger" onClick={() => delExcl(i)} aria-label={`Remove reason ${i + 1}`}>✕</button>
              </div>
            ))}
          </div>

          <div className="card">
            <div className="card-h">audit</div>
            {checks.length === 0 ? <Empty path="prisma_audit:">0 issues</Empty> : (
              <ul className="audit-list">
                {checks.map((c) => (
                  <li key={c.id}>
                    <div className="audit-top">
                      <span className="mono">{c.label}</span>
                      <Tag tone={c.level === 'error' ? 'bad' : 'warn'}>{c.level === 'error' ? 'arithmetic' : 'trace'}</Tag>
                    </div>
                    <div className="audit-cmp mono">
                      <span>{c.a.k} <b>{c.a.v}</b></span>
                      <span>{c.b.k} <b>{c.b.v}</b></span>
                      <span>difference <b className="tone-bad">{Math.abs(c.a.v - c.b.v)}</b></span>
                    </div>
                    {c.action.to === '/screening' && recs.length
                      ? <button className="go" onClick={compile}>{c.action.label} →</button>
                      : <Link className="go" to={c.action.to}>{c.action.label} →</Link>}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {r.screenerUrl && (
            <div className="card">
              <div className="card-h">external screener</div>
              <a className="mono small" href={r.screenerUrl} target="_blank" rel="noreferrer" style={{ wordBreak: 'break-all' }}>{r.screenerUrl} ↗</a>
            </div>
          )}
        </div>

        <div className="card lg pr-figure">
          <div className="card-h">artifact · prisma 2020 flow <span className="spacer" /><span style={{ textTransform: 'none', letterSpacing: 0 }}>hover to export</span></div>
          <FigureFrame name={`${state.project.code.toLowerCase()}-prisma-flow`}>
            <PrismaFlow prisma={p} />
          </FigureFrame>
        </div>
      </div>

      <PrismaTower p={p} />
    </>
  )
}
