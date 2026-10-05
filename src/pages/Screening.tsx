import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useStore } from '../lib/store'
import { Kicker, MetaGrid, Tag, Empty, type Tone } from '../components/ui'
import { Modal } from '../components/Modal'
import { Sk } from '../components/Skeleton'
import { cardSwap } from '../lib/swap'
import { fetchByPmids, fetchAbstract } from '../lib/pubmed'
import { listSearches } from '../lib/savedSearches'
import { taStatus, cohenKappa, kappaLabel, advanced, derivePrisma, type TaStatus } from '../lib/screening'
import { recId } from '../lib/ids'
import { openTerra, TERRA_TASKS } from '../lib/terra'
import type { ScreenRecord, ScreenDecision } from '../types'

const uid = () => (crypto.randomUUID ? crypto.randomUUID() : `sr_${Date.now()}_${Math.random().toString(36).slice(2)}`)
const firstAuthor = (authors?: string) => (authors ? authors.split(/[,;]/)[0].trim().split(/\s+/)[0] : 'Unknown')

// the decision words as the classifier prints them ('maybe' is stored, 'uncertain' is shown)
const DEC_LABEL: Record<ScreenDecision, string> = { include: 'include', exclude: 'exclude', maybe: 'uncertain' }
const DEC_TONE: Record<ScreenDecision, Tone> = { include: 'ok', exclude: 'bad', maybe: 'warn' }
const DEC_KEY: Record<string, ScreenDecision> = { i: 'include', e: 'exclude', u: 'maybe' }
const STATUS: Record<TaStatus, { label: string; tone: Tone }> = {
  pending: { label: 'pending', tone: 'idle' },
  excluded: { label: 'excluded', tone: 'bad' },
  advance: { label: 'full text', tone: 'info' },
  conflict: { label: 'conflict', tone: 'warn' },
}
const REASONS = ['population', 'exposure', 'comparator', 'outcome', 'design', 'duplicate', 'language', 'other']

const FILTERS: { id: string; label: string; test: (s: TaStatus, r: ScreenRecord) => boolean }[] = [
  { id: 'all', label: 'all', test: () => true },
  { id: 'pending', label: 'pending', test: (s) => s === 'pending' },
  { id: 'conflict', label: 'conflicts', test: (s) => s === 'conflict' },
  { id: 'advance', label: 'full text', test: (s) => s === 'advance' },
  { id: 'excluded', label: 'excluded', test: (s) => s === 'excluded' },
]

/**
 * SCREENING — a classification environment. The queue on the left, the
 * selected record in the inspector on the right; I / E / U decide for the
 * active reviewer and move to the next record, J / K step through the queue.
 * Reviewer conflicts get a resolver whose adjudications are written to the
 * project log; both original votes stay as they were.
 */
export default function Screening() {
  const { state, updateReview, addStudies } = useStore()
  const r = state.review
  const recs = useMemo(() => r.screening ?? [], [r.screening])
  const [reviewer, setReviewer] = useState<'d1' | 'd2'>('d1')
  const [filter, setFilter] = useState('all')
  const [query, setQuery] = useState('')
  const [params] = useSearchParams()
  // a deep link (?rec=<id>) opens that record in the inspector
  const [selId, setSelId] = useState<string | null>(() => params.get('rec'))
  const [adding, setAdding] = useState<{ text: string; loading: boolean; error?: string } | null>(null)
  const [busyAbstract, setBusyAbstract] = useState<Set<string>>(new Set())
  const [failedAbstract, setFailedAbstract] = useState<Set<string>>(new Set())
  const [note, setNote] = useState('')
  const inspectorRef = useRef<HTMLDivElement>(null)

  const setRecs = (next: ScreenRecord[], log?: { kind: string; text: string }) => updateReview({ screening: next }, log)
  const patch = (id: string, p: Partial<ScreenRecord>, log?: { kind: string; text: string }) => setRecs(recs.map((x) => (x.id === id ? { ...x, ...p } : x)), log)

  const kappa = useMemo(() => cohenKappa(recs), [recs])
  const adv = useMemo(() => advanced(recs), [recs])
  const status = useMemo(() => new Map(recs.map((x) => [x.id, taStatus(x)])), [recs])
  const count = (id: string) => recs.filter((x) => FILTERS.find((f) => f.id === id)!.test(status.get(x.id)!, x)).length
  const includedN = adv.filter((x) => x.ft === 'include').length

  const q = query.trim().toLowerCase()
  const filtered = recs.filter((x) => FILTERS.find((f) => f.id === filter)!.test(status.get(x.id)!, x)
    && (!q || `${x.title} ${x.authors ?? ''} ${x.pmid ?? ''} ${recId(x.id)}`.toLowerCase().includes(q)))
  const sel = filtered.find((x) => x.id === selId) ?? filtered[0] ?? null
  const selIndex = sel ? filtered.indexOf(sel) : -1

  // the abstract is what a decision rests on: fetch it when a record is opened
  useEffect(() => {
    if (!sel?.pmid || sel.abstract || busyAbstract.has(sel.id) || failedAbstract.has(sel.id)) return
    const t = window.setTimeout(() => loadAbstract(sel), 350)
    return () => window.clearTimeout(t)
  }, [sel?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  async function loadAbstract(rec: ScreenRecord) {
    if (!rec.pmid || rec.abstract) return
    setBusyAbstract((b) => new Set(b).add(rec.id))
    try {
      const text = await fetchAbstract(rec.pmid)
      // a response this short is an empty record, not an abstract
      if (text && text.trim().length > 40) patch(rec.id, { abstract: text })
      else setFailedAbstract((f) => new Set(f).add(rec.id))
    } catch {
      // a failed fetch is not an abstract: nothing is written, and it can be retried
      setFailedAbstract((f) => new Set(f).add(rec.id))
    } finally {
      setBusyAbstract((b) => { const n = new Set(b); n.delete(rec.id); return n })
    }
  }

  const step = useCallback((delta: number) => {
    if (!filtered.length) return
    const i = Math.max(0, Math.min(filtered.length - 1, (selIndex < 0 ? 0 : selIndex) + delta))
    setSelId(filtered[i].id)
    document.getElementById(`rec-${filtered[i].id}`)?.scrollIntoView({ block: 'nearest' })
  }, [filtered, selIndex])

  function decide(rec: ScreenRecord, d: ScreenDecision, advanceAfter: boolean) {
    const mine = rec[reviewer]
    const next = mine === d ? undefined : d
    // the record after this one, so a decision moves the classifier along
    const after = advanceAfter && next ? filtered[selIndex + 1]?.id ?? filtered[selIndex - 1]?.id ?? null : rec.id
    cardSwap(inspectorRef.current, next ? (d === 'maybe' ? 'maybe' : d) : 'clear', () => {
      patch(rec.id, { [reviewer]: next })
      if (after) setSelId(after)
    })
  }

  function adjudicate(rec: ScreenRecord, d: ScreenDecision | undefined) {
    const id = recId(rec.id)
    patch(rec.id, { adjudicated: d }, d
      ? { kind: 'screening', text: `CONFLICT ${id} resolved → ${DEC_LABEL[d]} (R1 ${rec.d1 ? DEC_LABEL[rec.d1] : '—'} · R2 ${rec.d2 ? DEC_LABEL[rec.d2] : '—'})` }
      : { kind: 'screening', text: `CONFLICT ${id} reopened` })
  }

  // I / E / U decide · J / K step — unless you're typing or a dialog is open
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      if (e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return
      if (document.querySelector('.modal-overlay,.cmdk-overlay,.kbd-overlay')) return
      const k = e.key.toLowerCase()
      if (k === 'j' || k === 'arrowdown') { e.preventDefault(); step(1) }
      else if (k === 'k' || k === 'arrowup') { e.preventDefault(); step(-1) }
      else if (sel && DEC_KEY[k] && status.get(sel.id) !== 'advance') { e.preventDefault(); decide(sel, DEC_KEY[k], true) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  async function addPmids(fromSaved = false) {
    if (!adding) return
    let pmids: string[]
    if (fromSaved) pmids = [...new Set(listSearches().flatMap((s) => s.seen))]
    else pmids = adding.text.split(/[\s,;]+/).filter((p) => /^\d+$/.test(p))
    if (!pmids.length) { setAdding({ ...adding, error: 'No PMIDs found — paste numeric PMIDs, or save a search in literature first.' }); return }
    setAdding({ ...adding, loading: true, error: undefined })
    try {
      const hits = await fetchByPmids(pmids)
      const seen = new Set(recs.map((x) => x.pmid))
      const fresh = hits.filter((h) => !seen.has(h.pmid)).map((h): ScreenRecord => ({ id: uid(), pmid: h.pmid, title: h.title, journal: h.journal, year: h.year, authors: h.authors }))
      setRecs([...recs, ...fresh], { kind: 'screening', text: `Ingested ${fresh.length} record${fresh.length === 1 ? '' : 's'} into the screening queue` })
      setAdding(null)
    } catch {
      setAdding({ ...adding, loading: false, error: 'Could not reach PubMed — try again in a moment.' })
    }
  }

  function pushPrisma() {
    updateReview({ prisma: derivePrisma(recs, r.prisma) }, { kind: 'prisma', text: 'PRISMA screening counts compiled from the screening log' })
    setNote('PRISMA counts compiled from the screening log.')
  }
  function sendToStudies() {
    const existing = new Set(r.studies.map((s) => s.pmid).filter(Boolean))
    const toAdd = adv.filter((x) => x.ft === 'include' && x.pmid && !existing.has(x.pmid))
      .map((x) => ({ author: firstAuthor(x.authors), year: x.year ?? new Date().getFullYear(), pmid: x.pmid, include: false, note: x.title }))
    if (toAdd.length) addStudies(toAdd)
    setNote(toAdd.length ? `${toAdd.length} included record${toAdd.length === 1 ? '' : 's'} sent to extraction.` : 'No new full-text-included records to send.')
  }

  const st = sel ? status.get(sel.id)! : null
  const conflictOpen = !!sel && !!sel.d1 && !!sel.d2 && sel.d1 !== sel.d2 && (sel.d1 === 'exclude' || sel.d2 === 'exclude')
  const mine = sel ? sel[reviewer] : undefined

  return (
    <>
      <div className="page-head">
        <div className="flex" style={{ justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
          <div style={{ minWidth: 0 }}>
            <Kicker>pipeline / 03 screening · filter</Kicker>
            <h1>Screening</h1>
            <p>Dual-reviewer title/abstract, then full text. Inter-rater agreement is live (Cohen's κ); counts compile into <Link to="/prisma">prisma</Link> and full-text inclusions go to <Link to="/studies">extraction</Link>.</p>
          </div>
          <div className="row-actions" style={{ flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            <span className="seg" role="group" aria-label="Active reviewer">
              <button className={`seg-b${reviewer === 'd1' ? ' on' : ''}`} aria-pressed={reviewer === 'd1'} onClick={() => setReviewer('d1')}>reviewer_1</button>
              <button className={`seg-b${reviewer === 'd2' ? ' on' : ''}`} aria-pressed={reviewer === 'd2'} onClick={() => setReviewer('d2')}>reviewer_2</button>
            </span>
            <button className="btn primary sm" onClick={() => setAdding({ text: '', loading: false })}>＋ ingest records</button>
          </div>
        </div>
      </div>

      <div className="readouts" style={{ marginBottom: 12 }}>
        <div className="readout"><span>records</span><b>{recs.length}</b><small>in the queue</small></div>
        <div className="readout"><span>pending</span><b>{count('pending')}</b><small>title/abstract</small></div>
        <div className="readout"><span>conflicts</span><b className={count('conflict') ? 'tone-warn' : ''}>{count('conflict')}</b><small>{recs.filter((x) => x.adjudicated).length} adjudicated</small></div>
        <div className="readout"><span>full text</span><b>{adv.length}</b><small>{adv.filter((x) => !x.ft).length} awaiting decision</small></div>
        <div className="readout"><span>included</span><b>{includedN}</b><small>{adv.filter((x) => x.ft === 'exclude').length} excluded at full text</small></div>
        <div className="readout"><span>cohen's κ</span><b>{kappa ? kappa.kappa.toFixed(2) : '—'}</b><small>{kappa ? `${kappaLabel(kappa.kappa)} · n=${kappa.n}` : 'needs dual ratings'}</small></div>
      </div>

      <div className="scr-toolbar">
        <div className="seg" role="group" aria-label="Filter the queue">
          {FILTERS.map((f) => <button key={f.id} className={`seg-b${filter === f.id ? ' on' : ''}`} aria-pressed={filter === f.id} onClick={() => setFilter(f.id)}>{f.label} <span className="muted">{count(f.id)}</span></button>)}
        </div>
        <input className="input mono scr-search" placeholder="filter: title, author, PMID, REC_…" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Filter records" />
        <span className="spacer" />
        <button className="btn ghost sm" onClick={pushPrisma} disabled={!recs.length}>compile counts → prisma</button>
        <button className="btn ghost sm" onClick={sendToStudies} disabled={!includedN}>send included → extraction</button>
      </div>
      {note && <p className="small mono" role="status" style={{ margin: '0 0 10px' }}>› {note}</p>}

      {recs.length === 0 ? (
        <div className="card"><Empty path="screening_queue:">empty — ingest records by PMID, or pull them from a saved literature search.</Empty></div>
      ) : (
        <div className="scr-workspace">
          <div className="tbl-scroll scr-queue">
            <table aria-label="Screening queue">
              <thead><tr><th>id</th><th>record</th><th>r1</th><th>r2</th><th>status</th></tr></thead>
              <tbody>
                {filtered.map((rec) => {
                  const s = status.get(rec.id)!
                  return (
                    <tr key={rec.id} id={`rec-${rec.id}`} className={sel?.id === rec.id ? 'sel' : ''} aria-selected={sel?.id === rec.id}
                      tabIndex={0} onClick={() => setSelId(rec.id)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelId(rec.id) } }}>
                      <td className="mono muted">{recId(rec.id)}</td>
                      <td>
                        <div className="scr-title">{rec.title}</div>
                        <div className="scr-meta mono">{firstAuthor(rec.authors)} · {rec.year ?? '—'}{rec.pmid ? ` · ${rec.pmid}` : ''}</div>
                      </td>
                      <td>{rec.d1 ? <span className={`vbadge v-${rec.d1}`}>{DEC_LABEL[rec.d1].slice(0, 3)}</span> : <span className="muted mono">—</span>}</td>
                      <td>{rec.d2 ? <span className={`vbadge v-${rec.d2}`}>{DEC_LABEL[rec.d2].slice(0, 3)}</span> : <span className="muted mono">—</span>}</td>
                      <td><Tag tone={STATUS[s].tone}>{rec.adjudicated ? 'adjudicated' : STATUS[s].label}</Tag></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            {filtered.length === 0 && <div style={{ padding: '10px 12px' }}><Empty path={`${filter}/`}>0 records</Empty></div>}
          </div>

          <div className="scr-inspector card" ref={inspectorRef} aria-live="polite">
            {!sel ? <Empty path="inspector/">no record selected</Empty> : (
              <>
                <div className="card-h">{recId(sel.id)} <span className="spacer" /><Tag tone={STATUS[st!].tone}>{sel.adjudicated ? `adjudicated · ${DEC_LABEL[sel.adjudicated]}` : STATUS[st!].label}</Tag></div>
                <div className="insp-sec">citation</div>
                <div className="scr-ititle">{sel.title}</div>
                <MetaGrid rows={[
                  ['authors', sel.authors || '—'],
                  ['journal', <span>{sel.journal ?? '—'} <span className="mono muted">{sel.year ?? ''}</span></span>],
                  ['pmid', sel.pmid ? <a className="mono" href={`https://pubmed.ncbi.nlm.nih.gov/${sel.pmid}/`} target="_blank" rel="noreferrer">{sel.pmid} ↗</a> : '—'],
                ]} />

                <div className="insp-sec">abstract</div>
                {sel.abstract ? <p className="scr-abstract">{sel.abstract}</p>
                  : busyAbstract.has(sel.id) ? <Sk kind="abstract" />
                  : sel.pmid ? (
                    <p className="mono small">{failedAbstract.has(sel.id) ? 'abstract: unavailable · ' : ''}
                      <button className="go" onClick={() => { setFailedAbstract((f) => { const n = new Set(f); n.delete(sel.id); return n }); loadAbstract(sel) }}>{failedAbstract.has(sel.id) ? 'retry' : 'load abstract'} →</button>
                    </p>
                  ) : <p className="mono small">no PMID · no abstract source</p>}

                <div className="insp-sec">decision · {reviewer === 'd1' ? 'reviewer_1' : 'reviewer_2'}</div>
                <div className="scr-decide" role="group" aria-label="Title/abstract decision">
                  {(['include', 'exclude', 'maybe'] as ScreenDecision[]).map((d) => (
                    <button key={d} className={`sr-d v-${d}${mine === d ? ' on' : ''}`} aria-pressed={mine === d} onClick={() => decide(sel, d, false)}>
                      <kbd>{d === 'maybe' ? 'U' : d[0].toUpperCase()}</kbd>{DEC_LABEL[d]}
                    </button>
                  ))}
                </div>
                {(mine === 'exclude' || sel.reason) && (
                  <div className="scr-reasons">
                    <span className="mono small">reason</span>
                    {REASONS.map((x) => <button key={x} className={`chip-btn${sel.reason === x ? ' on' : ''}`} onClick={() => patch(sel.id, { reason: sel.reason === x ? undefined : x })}>{x}</button>)}
                    <input className="input sr-reason" placeholder="or describe the exclusion reason…" value={sel.reason && !REASONS.includes(sel.reason) ? sel.reason : ''} onChange={(e) => patch(sel.id, { reason: e.target.value || undefined })} aria-label="Exclusion reason" />
                  </div>
                )}

                <div className="insp-sec">screening</div>
                <MetaGrid rows={[
                  ['reviewer_1', sel.d1 ? <Tag tone={DEC_TONE[sel.d1]}>{DEC_LABEL[sel.d1]}</Tag> : <span className="mono muted">—</span>],
                  ['reviewer_2', sel.d2 ? <Tag tone={DEC_TONE[sel.d2]}>{DEC_LABEL[sel.d2]}</Tag> : <span className="mono muted">—</span>],
                  ['conflict', <span className="mono">{conflictOpen ? (sel.adjudicated ? 'resolved' : 'true') : 'false'}</span>],
                ]} />

                {conflictOpen && (
                  <div className="resolver">
                    <div className="resolver-h mono">CONFLICT · {recId(sel.id)}</div>
                    {sel.adjudicated ? (
                      <div className="flex" style={{ flexWrap: 'wrap', gap: 8 }}>
                        <span className="small">adjudicated <b>{DEC_LABEL[sel.adjudicated]}</b> — logged to the project activity</span>
                        <button className="btn ghost sm" onClick={() => adjudicate(sel, undefined)}>reopen</button>
                      </div>
                    ) : (
                      <div className="wrap-gap">
                        <button className="btn sm" onClick={() => adjudicate(sel, 'include')}>resolve include</button>
                        <button className="btn sm" onClick={() => adjudicate(sel, 'exclude')}>resolve exclude</button>
                        <button className="btn ghost sm" onClick={() => adjudicate(sel, 'maybe')}>resolve uncertain</button>
                      </div>
                    )}
                  </div>
                )}

                {st === 'advance' && (
                  <>
                    <div className="insp-sec">full text</div>
                    <div className="scr-decide" role="group" aria-label="Full-text decision">
                      <button className={`sr-d v-include${sel.ft === 'include' ? ' on' : ''}`} aria-pressed={sel.ft === 'include'} onClick={() => patch(sel.id, { ft: sel.ft === 'include' ? undefined : 'include' })}>include</button>
                      <button className={`sr-d v-exclude${sel.ft === 'exclude' ? ' on' : ''}`} aria-pressed={sel.ft === 'exclude'} onClick={() => patch(sel.id, { ft: sel.ft === 'exclude' ? undefined : 'exclude' })}>exclude</button>
                    </div>
                    {sel.ft === 'exclude' && (
                      <div className="scr-reasons">
                        <span className="mono small">reason</span>
                        {REASONS.map((x) => <button key={x} className={`chip-btn${sel.ftReason === x ? ' on' : ''}`} onClick={() => patch(sel.id, { ftReason: sel.ftReason === x ? undefined : x })}>{x}</button>)}
                        <input className="input sr-reason" placeholder="or describe the full-text exclusion…" value={sel.ftReason && !REASONS.includes(sel.ftReason) ? sel.ftReason : ''} onChange={(e) => patch(sel.id, { ftReason: e.target.value || undefined })} aria-label="Full-text exclusion reason" />
                      </div>
                    )}
                  </>
                )}

                <div className="insp-foot mono">
                  <span><kbd>I</kbd><kbd>E</kbd><kbd>U</kbd> decide</span>
                  <span><kbd>J</kbd><kbd>K</kbd> step</span>
                  <span className="spacer" />
                  <span>{selIndex + 1}/{filtered.length}</span>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {count('conflict') > 0 && (
        <p className="small mono" style={{ marginTop: 10 }}>
          terra · <button className="go" onClick={() => openTerra({ prompt: TERRA_TASKS.screening[0].prompt })}>inspect conflicts →</button>
        </p>
      )}

      {adding && (
        <Modal title="ingest records" onClose={() => setAdding(null)}>
          <p className="small" style={{ marginBottom: 12 }}>Paste PubMed IDs (one per line, or comma/space-separated). Titles and journals are fetched from PubMed; abstracts load as you open each record.</p>
          <textarea className="textarea mono" rows={7} style={{ width: '100%' }} placeholder={'29202755\n33910361\n22706305'} value={adding.text} onChange={(e) => setAdding({ ...adding, text: e.target.value })} aria-label="PubMed IDs" />
          {adding.loading && <div style={{ marginTop: 12 }}><Sk kind="records" /></div>}
          {adding.error && <div className="err" style={{ marginTop: 12, marginBottom: 0 }}>{adding.error}</div>}
          <div className="form-actions">
            <button className="btn ghost" onClick={() => addPmids(true)} disabled={adding.loading}>pull from saved searches</button>
            <span className="spacer" />
            <button className="btn ghost" onClick={() => setAdding(null)}>cancel</button>
            <button className="btn primary" onClick={() => addPmids(false)} disabled={adding.loading || !adding.text.trim()}>{adding.loading ? 'indexing records…' : 'ingest'}</button>
          </div>
        </Modal>
      )}
    </>
  )
}
