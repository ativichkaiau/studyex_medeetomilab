import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useStore } from '../lib/store'
import { Kicker, Rule, StatCard } from '../components/ui'
import { Modal } from '../components/Modal'
import { Sk } from '../components/Skeleton'
import { fetchByPmids, fetchAbstract } from '../lib/pubmed'
import { listSearches } from '../lib/savedSearches'
import { taStatus, cohenKappa, kappaLabel, advanced, derivePrisma, type TaStatus } from '../lib/screening'
import type { ScreenRecord, ScreenDecision } from '../types'

const uid = () => (crypto.randomUUID ? crypto.randomUUID() : `sr_${Date.now()}_${Math.random().toString(36).slice(2)}`)
const DEC_CLASS: Record<ScreenDecision, string> = { include: 'v-include', maybe: 'v-maybe', exclude: 'v-exclude' }
const STATUS_LABEL: Record<TaStatus, string> = { pending: 'pending', excluded: 'excluded', advance: 'to full-text', conflict: 'conflict' }
const firstAuthor = (authors?: string) => (authors ? authors.split(/[,;]/)[0].trim().split(/\s+/)[0] : 'Unknown')

const FILTERS: { id: string; label: string; test: (s: TaStatus, r: ScreenRecord) => boolean }[] = [
  { id: 'all', label: 'All', test: () => true },
  { id: 'pending', label: 'Pending', test: (s) => s === 'pending' },
  { id: 'conflict', label: 'Conflicts', test: (s) => s === 'conflict' },
  { id: 'advance', label: 'Full-text', test: (s) => s === 'advance' },
  { id: 'excluded', label: 'Excluded', test: (s) => s === 'excluded' },
]

export default function Screening() {
  const { state, updateReview, addStudies } = useStore()
  const r = state.review
  const recs = useMemo(() => r.screening ?? [], [r.screening])
  const [reviewer, setReviewer] = useState<'d1' | 'd2'>('d1')
  const [filter, setFilter] = useState('all')
  const [adding, setAdding] = useState<{ text: string; loading: boolean; error?: string } | null>(null)
  const [busyAbstract, setBusyAbstract] = useState<Set<string>>(new Set())
  const [note, setNote] = useState('')

  const setRecs = (next: ScreenRecord[]) => updateReview({ screening: next })
  const patch = (id: string, p: Partial<ScreenRecord>) => setRecs(recs.map((x) => (x.id === id ? { ...x, ...p } : x)))

  const kappa = useMemo(() => cohenKappa(recs), [recs])
  const adv = useMemo(() => advanced(recs), [recs])
  const includedN = adv.filter((x) => x.ft === 'include').length
  const filtered = recs.filter((x) => FILTERS.find((f) => f.id === filter)!.test(taStatus(x), x))

  async function addPmids(fromSaved = false) {
    if (!adding) return
    let pmids: string[]
    if (fromSaved) pmids = [...new Set(listSearches().flatMap((s) => s.seen))]
    else pmids = adding.text.split(/[\s,;]+/).filter((p) => /^\d+$/.test(p))
    if (!pmids.length) { setAdding({ ...adding, error: 'No PMIDs found — paste numeric PMIDs, or save a search on the Literature page first.' }); return }
    setAdding({ ...adding, loading: true, error: undefined })
    try {
      const hits = await fetchByPmids(pmids)
      const seen = new Set(recs.map((x) => x.pmid))
      const fresh = hits.filter((h) => !seen.has(h.pmid)).map((h): ScreenRecord => ({ id: uid(), pmid: h.pmid, title: h.title, journal: h.journal, year: h.year, authors: h.authors }))
      setRecs([...recs, ...fresh])
      setAdding(null)
    } catch {
      setAdding({ ...adding, loading: false, error: 'Could not reach PubMed — try again in a moment.' })
    }
  }

  async function loadAbstract(rec: ScreenRecord) {
    if (!rec.pmid || rec.abstract) return
    setBusyAbstract((b) => new Set(b).add(rec.id))
    try {
      const text = await fetchAbstract(rec.pmid)
      patch(rec.id, { abstract: text })
    } catch {
      patch(rec.id, { abstract: 'Could not load abstract.' })
    } finally {
      setBusyAbstract((b) => { const n = new Set(b); n.delete(rec.id); return n })
    }
  }

  function pushPrisma() {
    updateReview({ prisma: derivePrisma(recs, r.prisma) })
    setNote('PRISMA counts updated from the screening pipeline.')
  }
  function sendToStudies() {
    const existing = new Set(r.studies.map((s) => s.pmid).filter(Boolean))
    const toAdd = adv.filter((x) => x.ft === 'include' && x.pmid && !existing.has(x.pmid))
      .map((x) => ({ author: firstAuthor(x.authors), year: x.year ?? new Date().getFullYear(), pmid: x.pmid, include: false, note: x.title }))
    if (toAdd.length) addStudies(toAdd)
    setNote(toAdd.length ? `Sent ${toAdd.length} included record${toAdd.length === 1 ? '' : 's'} to the extraction table.` : 'No new full-text-included records to send.')
  }

  return (
    <>
      <div className="page-head">
        <Rule />
        <div className="flex" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <Kicker>SYSTEMATIC REVIEW · SCREENING</Kicker>
            <h1 style={{ marginTop: 12 }}>Screening</h1>
            <p>Dual-reviewer title/abstract then full-text screening, with live inter-rater agreement (Cohen's κ). Feeds the <Link to="/prisma">PRISMA flow</Link> and sends the included records straight to <Link to="/studies">Studies</Link>.</p>
          </div>
          <div className="row-actions" style={{ flex: 'none', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            <span className="seg">
              <button className={`seg-b${reviewer === 'd1' ? ' on' : ''}`} onClick={() => setReviewer('d1')}>Reviewer 1</button>
              <button className={`seg-b${reviewer === 'd2' ? ' on' : ''}`} onClick={() => setReviewer('d2')}>Reviewer 2</button>
            </span>
            <button className="btn primary sm" onClick={() => setAdding({ text: '', loading: false })}>＋ Add records</button>
          </div>
        </div>
      </div>

      {note && <p className="small" style={{ color: 'var(--accent)', marginBottom: 12 }}>{note}</p>}

      <div className="grid g4" style={{ marginBottom: 16 }}>
        <StatCard value={recs.length} label="Records screened" sub={`${recs.filter((x) => taStatus(x) === 'pending').length} pending`} tone="#1746d1" />
        <StatCard value={adv.length} label="To full-text" sub={`${recs.filter((x) => taStatus(x) === 'excluded').length} excluded at T/A`} tone="#7c3aed" />
        <StatCard value={includedN} label="Included" sub={`${adv.filter((x) => x.ft === 'exclude').length} full-text excluded`} tone="#12b981" />
        <StatCard value={kappa ? kappa.kappa.toFixed(2) : '—'} label="Cohen's κ" sub={kappa ? `${kappaLabel(kappa.kappa)} · ${kappa.conflicts} conflict${kappa.conflicts === 1 ? '' : 's'}` : 'needs dual ratings'} tone="#f59e0b" />
      </div>

      <div className="flex" style={{ gap: 8, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
        <div className="seg">
          {FILTERS.map((f) => <button key={f.id} className={`seg-b${filter === f.id ? ' on' : ''}`} onClick={() => setFilter(f.id)}>{f.label} ({recs.filter((x) => f.test(taStatus(x), x)).length})</button>)}
        </div>
        <span className="spacer" />
        <button className="btn ghost sm" onClick={pushPrisma} disabled={!recs.length}>⇉ Push to PRISMA</button>
        <button className="btn ghost sm" onClick={sendToStudies} disabled={!includedN}>→ Send included to Studies</button>
      </div>

      {recs.length === 0 ? (
        <div className="card lg"><p className="empty">No records yet. Hit <b>＋ Add records</b> and paste PMIDs (or pull the PMIDs from a saved Literature search).</p></div>
      ) : (
        <div className="screen-list">
          {filtered.map((rec) => {
            const st = taStatus(rec)
            const mine = rec[reviewer]
            const other = rec[reviewer === 'd1' ? 'd2' : 'd1']
            return (
              <div className={`screen-rec st-${st}`} key={rec.id}>
                <div className="sr-main">
                  <div className="sr-title">{rec.title}</div>
                  <div className="sr-meta">
                    {rec.authors || 'Unknown'} · {rec.journal ?? '—'} {rec.year ?? ''}
                    {rec.pmid && <> · <a href={`https://pubmed.ncbi.nlm.nih.gov/${rec.pmid}/`} target="_blank" rel="noreferrer">PMID {rec.pmid} ↗</a></>}
                    <span className={`sr-status s-${st}`}> · {STATUS_LABEL[st]}</span>
                  </div>
                  {rec.abstract ? (
                    <p className="sr-abstract">{rec.abstract}</p>
                  ) : rec.pmid && (busyAbstract.has(rec.id)
                    ? <Sk kind="abstract" />
                    : <button className="sr-loadabs" onClick={() => loadAbstract(rec)}>+ load abstract</button>
                  )}
                </div>
                <div className="sr-actions">
                  <div className="sr-decide">
                    {(['include', 'maybe', 'exclude'] as ScreenDecision[]).map((d) => (
                      <button key={d} className={`sr-d ${DEC_CLASS[d]}${mine === d ? ' on' : ''}`} onClick={() => patch(rec.id, { [reviewer]: mine === d ? undefined : d })}>{d}</button>
                    ))}
                  </div>
                  {other && <div className="sr-other">R{reviewer === 'd1' ? '2' : '1'}: <span className={`vbadge ${DEC_CLASS[other]}`}>{other}</span></div>}
                  {(mine === 'exclude' || rec.reason) && <input className="input sr-reason" placeholder="exclusion reason…" value={rec.reason ?? ''} onChange={(e) => patch(rec.id, { reason: e.target.value })} />}
                  {st === 'advance' && (
                    <div className="sr-ft">
                      <span className="sr-ft-l">Full-text:</span>
                      <button className={`sr-d v-include${rec.ft === 'include' ? ' on' : ''}`} onClick={() => patch(rec.id, { ft: rec.ft === 'include' ? undefined : 'include' })}>include</button>
                      <button className={`sr-d v-exclude${rec.ft === 'exclude' ? ' on' : ''}`} onClick={() => patch(rec.id, { ft: rec.ft === 'exclude' ? undefined : 'exclude' })}>exclude</button>
                      {rec.ft === 'exclude' && <input className="input sr-reason" placeholder="full-text exclusion reason…" value={rec.ftReason ?? ''} onChange={(e) => patch(rec.id, { ftReason: e.target.value })} />}
                    </div>
                  )}
                </div>
              </div>
            )
          })}
          {filtered.length === 0 && <div className="card"><p className="empty">No records in this filter.</p></div>}
        </div>
      )}

      {adding && (
        <Modal title="Add records to screen" onClose={() => setAdding(null)}>
          <p className="small" style={{ marginBottom: 12 }}>Paste PubMed IDs (one per line, or comma/space-separated). Titles and journals are fetched from PubMed; abstracts load on demand while you screen.</p>
          <textarea className="textarea" rows={7} style={{ width: '100%' }} placeholder={'29202755\n33910361\n22706305'} value={adding.text} onChange={(e) => setAdding({ ...adding, text: e.target.value })} />
          {adding.loading && <div style={{ marginTop: 12 }}><Sk kind="records" /></div>}
          {adding.error && <div className="err" style={{ marginTop: 12, marginBottom: 0 }}>{adding.error}</div>}
          <div className="form-actions">
            <button className="btn ghost" onClick={() => addPmids(true)} disabled={adding.loading}>Pull from saved searches</button>
            <span className="spacer" />
            <button className="btn ghost" onClick={() => setAdding(null)}>Cancel</button>
            <button className="btn primary" onClick={() => addPmids(false)} disabled={adding.loading || !adding.text.trim()}>{adding.loading ? 'Fetching…' : 'Add records'}</button>
          </div>
        </Modal>
      )}
    </>
  )
}
