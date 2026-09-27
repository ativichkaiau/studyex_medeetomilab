import { useEffect, useRef, useState } from 'react'
import { useStore } from '../lib/store'
import { collectReferences } from '../lib/references'
import { evidenceOf, normalizeDoi, validDoi } from '../lib/evidence'
import { checkPublicationNotices } from '../lib/publicationNotices'
import { Sk } from './Skeleton'

export function PublicationWatch() {
  const { state, updateResearch } = useStore()
  const e = evidenceOf(state)
  const refs = collectReferences(state)
  const dois = [...new Set([...refs.map((r) => normalizeDoi(r.doi)), ...e.passages.map((p) => normalizeDoi(p.doi))].filter(validDoi))].sort()
  const doiKey = dois.join('|')
  const [progress, setProgress] = useState('')
  const [error, setError] = useState('')
  const controller = useRef<AbortController | null>(null)
  const due = dois.filter((doi) => !e.notices.some((n) => n.doi === doi && Date.now() - n.checkedAt < 86400000))
  const alerts = e.notices.filter((n) => dois.includes(n.doi) && n.notices.length)
  const failures = e.notices.filter((n) => dois.includes(n.doi) && n.error)
  const checked = dois.filter((doi) => e.notices.some((n) => n.doi === doi && !n.error)).length
  async function check(list: string[]) {
    if (controller.current || !list.length) return
    const ctrl = new AbortController()
    controller.current = ctrl
    setError('')
    try {
      for (let i = 0; i < list.length; i++) {
        if (ctrl.signal.aborted) break
        setProgress(`Checking publication notices ${i + 1}/${list.length}…`)
        let check
        try { check = await checkPublicationNotices(list[i], ctrl.signal) }
        catch (err) {
          if (ctrl.signal.aborted) break
          check = { doi: list[i], checkedAt: Date.now(), notices: [], error: err instanceof Error ? err.message : 'Publication notice check failed.' }
        }
        if (ctrl.signal.aborted) break
        const result = check
        updateResearch(state.project.id, (p) => {
          const current = evidenceOf(p)
          const previous = current.notices.find((n) => n.doi === result.doi)
          const saved = result.error ? { ...result, notices: previous?.notices ?? [] } : result
          return { ...p, evidence: { ...current, notices: [...current.notices.filter((n) => n.doi !== result.doi), saved] } }
        }, `Checked publication notices for ${list[i]}`)
      }
    } catch (err) { if (!ctrl.signal.aborted) setError(err instanceof Error ? err.message : 'Could not save publication check.') }
    finally { if (controller.current === ctrl) { controller.current = null; setProgress('') } }
  }
  useEffect(() => {
    void check(due.slice(0, 20))
    return () => { controller.current?.abort(); controller.current = null }
    // A new DOI triggers a bounded check. Saving a result does not start another.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doiKey, state.project.id])
  return <div className="publication-watch">
    <div className="wrap-gap"><b>Publication watch</b><span className="small muted">{checked}/{dois.length} DOIs checked</span><button className="btn ghost sm" disabled={!!progress || !dois.length} onClick={() => void check(due.length ? due : dois)}>{progress || (due.length ? `Check ${due.length} pending` : 'Refresh notices')}</button>{progress && <button className="btn ghost sm" onClick={() => controller.current?.abort()}>Stop</button>}</div>
    <p className="small muted">Crossref / Retraction Watch. Checks when this view opens; up to 20 due DOIs automatically, cached for 24 hours. No result does not establish that a paper is reliable.{refs.some((r) => !validDoi(r.doi ?? '')) ? ' References without a valid DOI cannot be checked.' : ''}</p>
    {progress && <Sk kind="notices" label={progress} />}
    {alerts.map((a) => <div className="evidence-warning" key={a.doi}><b>{refs.find((r) => normalizeDoi(r.doi) === a.doi)?.title || e.passages.find((p) => p.doi === a.doi)?.title || a.doi}</b>{a.notices.map((n, i) => <p className="small" key={i}>{n.type} · {n.source}{n.date ? ` · ${n.date}` : ''} — {n.doi && validDoi(n.doi) ? <a href={`https://doi.org/${encodeURIComponent(n.doi)}`} target="_blank" rel="noreferrer">{n.title} ↗</a> : n.title}</p>)}<span className="small">Checked {new Date(a.checkedAt).toLocaleString()}</span></div>)}
    {!!failures.length && <details className="evidence-error"><summary>{failures.length} checks failed — status remains unknown</summary>{failures.map((n) => <p className="small" key={n.doi}>{n.doi}: {n.error} <button className="btn ghost sm" disabled={!!progress} onClick={() => void check([n.doi])}>Retry</button></p>)}</details>}
    {error && <p className="evidence-error" role="alert">{error}</p>}
    <a className="small" href="https://www.crossref.org/documentation/retrieve-metadata/retraction-watch/" target="_blank" rel="noreferrer">About this data ↗</a>
  </div>
}
