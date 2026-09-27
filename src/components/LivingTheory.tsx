import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useStore } from '../lib/store'
import { evidenceOf, sourceVersion, unreviewedPassages } from '../lib/evidence'
import { baseTheoryChunks } from '../lib/theoryRag'
import { decideRevision, draftRevisions, revisionBody, revisionProblem, saveRevisionBatch } from '../lib/livingTheory'
import { collectReferences } from '../lib/references'
import { hasKey } from '../lib/openai'
import { EvidenceLinks } from './Evidence'
import { PublicationWatch } from './PublicationWatch'
import { Sk } from './Skeleton'

export function LivingTheory() {
  const { state, updateResearch } = useStore()
  const e = evidenceOf(state)
  const incoming = unreviewedPassages(state)
  const pending = e.revisions.filter((r) => r.status === 'pending')
  const awaiting = collectReferences(state).filter((r) => !e.passages.some((p) => p.referenceId === r.id || (r.doi && p.doi === r.doi) || (r.pmid && p.pmid === r.pmid)))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const abortRef = useRef<AbortController | null>(null)
  const attempted = useRef(new Set<string>())
  const ready = baseTheoryChunks(state).length > 0
  const signature = JSON.stringify(incoming.slice(0, 8).map((p) => sourceVersion(state, p)))
  async function draft() {
    if (abortRef.current) return
    if (!hasKey()) { setError('Add your OpenAI key in Knowledge Review → Settings to draft revisions.'); return }
    const ctrl = new AbortController()
    abortRef.current = ctrl
    attempted.current.add(signature)
    setBusy(true); setError('')
    try {
      const batch = await draftRevisions(state, ctrl.signal)
      if (!ctrl.signal.aborted) updateResearch(state.project.id, (p) => saveRevisionBatch(p, batch), 'Drafted Living Theory proposals for review')
    } catch (err) { if (!ctrl.signal.aborted) setError(err instanceof Error ? err.message : 'Could not draft revisions. Try again.') }
    finally { if (abortRef.current === ctrl) { abortRef.current = null; setBusy(false) } }
  }
  useEffect(() => () => { abortRef.current?.abort(); abortRef.current = null }, [])
  useEffect(() => {
    if (!e.autoDraft || !hasKey() || !ready || !incoming.length || busy || attempted.current.has(signature)) return
    const timer = setTimeout(() => void draft(), 250)
    return () => clearTimeout(timer)
    // The source signature prevents re-drafting after unrelated project edits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, e.autoDraft, ready, busy])
  function decide(id: string, decision: 'approved' | 'rejected') {
    try { updateResearch(state.project.id, (p) => decideRevision(p, id, decision), `${decision === 'approved' ? 'Approved' : 'Rejected'} a Theory revision`); setError('') }
    catch (err) { setError(err instanceof Error ? err.message : 'The revision could not be saved.') }
  }
  return <section className="living-theory card">
    <div className="wrap-gap"><h2>Living Theory</h2><span className="pill">{pending.length} for review</span><Link className="btn ghost sm" to="/evidence">Add evidence →</Link></div>
    <p className="small">New source passages trigger proposed chapter updates while Theory is open. Each update includes evidence links and becomes part of the chapter after you approve it.</p>
    <div className="wrap-gap"><label className="check"><input type="checkbox" checked={e.autoDraft} onChange={(ev) => { const autoDraft = ev.target.checked; updateResearch(state.project.id, (p) => ({ ...p, evidence: { ...evidenceOf(p), autoDraft } }), `${autoDraft ? 'Enabled' : 'Paused'} automatic Theory drafts`); if (!autoDraft) abortRef.current?.abort() }} />Draft automatically</label><button className="btn primary sm" disabled={busy || !ready || !incoming.length} onClick={() => void draft()}>{busy ? 'Reviewing new evidence…' : `Draft revisions${incoming.length ? ` · ${incoming.length} new passages` : ''}`}</button>{busy && <button className="btn ghost sm" onClick={() => abortRef.current?.abort()}>Cancel</button>}{!busy && !!e.passages.length && !pending.length && !incoming.length && <button className="btn ghost sm" onClick={() => { attempted.current.clear(); updateResearch(state.project.id, (p) => ({ ...p, evidence: { ...evidenceOf(p), assessments: [] } }), 'Queued evidence for reassessment') }}>Reassess evidence</button>}</div>
    {!ready && <p className="small muted">Generate this project’s Theory first to enable chapter revisions.</p>}
    {!hasKey() && <p className="small"><Link to="/review?settings=1">Add an API key</Link> to generate proposed revisions.</p>}
    {!!awaiting.length && <details className="living-awaiting"><summary>{awaiting.length} references awaiting source passages</summary><p className="small muted">A title alone cannot establish a finding. Add the relevant passage to make the paper available for revision review.</p>{awaiting.map((r) => <div className="evidence-pending-paper" key={r.id}><span>{r.title || `${r.author} ${r.year}`}</span><Link className="btn ghost sm" to={`/evidence?reference=${encodeURIComponent(r.id)}`}>Add passage</Link></div>)}</details>}
    {busy && <Sk kind="revision" />}
    {error && <p className="evidence-error" role="alert">{error} <button className="btn ghost sm" disabled={busy || !incoming.length} onClick={() => void draft()}>Retry</button></p>}
    {!pending.length && !!e.assessments.length && <p className="small muted" role="status">Latest review: {e.assessments[e.assessments.length - 1].summary}</p>}
    {pending.map((r) => {
      const problem = revisionProblem(state, r)
      return <article key={r.id} className="theory-proposal"><div className="wrap-gap"><h3>{r.sectionTitle}</h3><span className="small muted">Proposed · {new Date(r.createdAt).toLocaleDateString()}</span></div><p><b>Why:</b> {r.reason}</p>
        <div className="revision-comparison"><div><div className="small mono muted">CURRENT EVIDENCE UPDATE</div>{r.before ? <p>{r.before}</p> : <p className="muted">No reviewed update yet.</p>}</div><div><div className="small mono muted">PROPOSED EVIDENCE UPDATE</div>{r.paragraphs.map((p, i) => <p key={i}>{p.text}</p>)}</div></div>
        <details><summary>Inspect source passages and relationships</summary>{r.paragraphs.map((p, i) => <div key={i}><blockquote className="claim-quote">{p.text}</blockquote><EvidenceLinks links={p.links} /></div>)}</details>
        {problem && <p className="evidence-warning">{problem}</p>}
        <div className="form-actions"><span className="small muted">{r.model} · original chapter retained</span><button className="btn ghost sm" onClick={() => decide(r.id, 'rejected')}>Reject</button>{problem ? <button className="btn primary sm" disabled={busy} onClick={() => { attempted.current.clear(); updateResearch(state.project.id, (p) => { const next = decideRevision(p, r.id, 'rejected'); return { ...next, evidence: { ...evidenceOf(next), assessments: [] } } }, 'Queued a fresh Theory review') }}>Draft again</button> : <button className="btn primary sm" disabled={busy} onClick={() => decide(r.id, 'approved')}>Approve update</button>}</div>
      </article>
    })}
    {e.revisions.some((r) => r.status !== 'pending') && <details className="revision-history"><summary>Revision history</summary>{[...e.revisions].reverse().filter((r) => r.status !== 'pending').map((r) => <details key={r.id}><summary>{r.sectionTitle} · {r.status} · {new Date(r.reviewedAt ?? r.createdAt).toLocaleDateString()}</summary><p className="small">{r.reason}</p><div className="revision-comparison"><p>{r.before || 'No previous evidence update.'}</p><p>{revisionBody(r)}</p></div><EvidenceLinks links={r.paragraphs.flatMap((p) => p.links)} /></details>)}</details>}
    <PublicationWatch />
  </section>
}
