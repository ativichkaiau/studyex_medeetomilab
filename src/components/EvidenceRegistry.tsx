import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useStore } from '../lib/store'
import { MetaGrid, Tag, Empty, type Tone } from './ui'
import { shortCode } from '../lib/ids'
import type { Paper, ScreenRecord } from '../types'

const litId = (id: string) => `LIT_${shortCode(id)}`
type Stance = NonNullable<Paper['stance']> | 'unlinked'
const STANCE_TONE: Record<Stance, Tone> = { supports: 'ok', refutes: 'bad', background: 'info', unlinked: 'idle' }
const source = (p: Paper) => (p.pmid ? 'PubMed' : p.doi ? 'DOI' : 'manual')
const stanceOf = (p: Paper): Stance => p.stance ?? 'unlinked'

/**
 * The project's evidence registry: every paper the project holds, as rows
 * with an inspector — not as cards. Search runs over title, authors,
 * journal, identifiers and tags; filters narrow by source, status, year and
 * tag. Searching for new literature (below) feeds this registry.
 */
export default function EvidenceRegistry() {
  const { state, updatePaper, removePaper, updateReview } = useStore()
  const papers = state.papers
  const [q, setQ] = useState('')
  const [src, setSrc] = useState('all')
  const [stance, setStance] = useState('all')
  const [tag, setTag] = useState('all')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [params] = useSearchParams()
  const [selId, setSelId] = useState<string | null>(() => params.get('lit'))
  const [tagDraft, setTagDraft] = useState('')

  const tags = useMemo(() => [...new Set(papers.flatMap((p) => p.tags ?? []))].sort(), [papers])
  const query = q.trim().toLowerCase()
  const rows = papers.filter((p) => {
    if (query && !`${p.title} ${p.authors ?? ''} ${p.journal ?? ''} ${p.pmid ?? ''} ${p.doi ?? ''} ${(p.tags ?? []).join(' ')} ${litId(p.id)}`.toLowerCase().includes(query)) return false
    if (src !== 'all' && source(p) !== src) return false
    if (stance !== 'all' && stanceOf(p) !== stance) return false
    if (tag !== 'all' && !(p.tags ?? []).includes(tag)) return false
    if (from && (!p.year || p.year < +from)) return false
    if (to && (!p.year || p.year > +to)) return false
    return true
  })
  const sel = rows.find((p) => p.id === selId) ?? rows[0] ?? null
  const hyps = sel ? state.hypotheses.filter((h) => sel.targets?.includes(h.id)) : []
  const screening = state.review.screening ?? []
  const inScreening = !!sel?.pmid && screening.some((r) => r.pmid === sel.pmid)

  function sendToScreening(p: Paper) {
    if (!p.pmid || inScreening) return
    const rec: ScreenRecord = { id: crypto.randomUUID ? crypto.randomUUID() : `sr_${Date.now()}`, pmid: p.pmid, title: p.title, journal: p.journal, year: p.year, authors: p.authors }
    updateReview({ screening: [...screening, rec] }, { kind: 'screening', text: `${litId(p.id)} queued for screening (PMID ${p.pmid})` })
  }
  function addTag(p: Paper) {
    const t = tagDraft.trim().toLowerCase()
    if (!t) return
    updatePaper(p.id, { tags: [...new Set([...(p.tags ?? []), t])] })
    setTagDraft('')
  }

  return (
    <div className="card lit-registry" style={{ padding: 0, marginBottom: 12 }}>
      <div className="card-h" style={{ margin: 0, padding: '8px 14px' }}>evidence registry <span className="spacer" /><span style={{ textTransform: 'none', letterSpacing: 0 }}>{rows.length} of {papers.length}</span></div>
      {papers.length === 0 ? (
        <div style={{ padding: '10px 14px' }}><Empty path="literature/">0 records — search below and link a hit to the project to register it</Empty></div>
      ) : (
        <>
          <div className="lit-filters">
            <input className="input mono" placeholder="search: title, author, journal, PMID, DOI, tag…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search the registry" />
            <select className="select" value={src} onChange={(e) => setSrc(e.target.value)} aria-label="Source">
              <option value="all">source: all</option><option value="PubMed">PubMed</option><option value="DOI">DOI</option><option value="manual">manual</option>
            </select>
            <select className="select" value={stance} onChange={(e) => setStance(e.target.value)} aria-label="Status">
              <option value="all">status: all</option><option value="supports">supports</option><option value="refutes">refutes</option><option value="background">background</option><option value="unlinked">unlinked</option>
            </select>
            <select className="select" value={tag} onChange={(e) => setTag(e.target.value)} aria-label="Tag" disabled={!tags.length}>
              <option value="all">tag: all</option>{tags.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
            <span className="lit-years">
              <input className="input mono" inputMode="numeric" placeholder="from" value={from} onChange={(e) => setFrom(e.target.value.replace(/\D/g, '').slice(0, 4))} aria-label="Year from" />
              <span className="muted">–</span>
              <input className="input mono" inputMode="numeric" placeholder="to" value={to} onChange={(e) => setTo(e.target.value.replace(/\D/g, '').slice(0, 4))} aria-label="Year to" />
            </span>
          </div>
          <div className="lit-body">
            <div className="lit-table">
              <table aria-label="Evidence registry">
                <thead><tr><th>id</th><th>title</th><th className="r">year</th><th>source</th><th>identifier</th><th>status</th></tr></thead>
                <tbody>
                  {rows.map((p) => (
                    <tr key={p.id} className={sel?.id === p.id ? 'sel' : ''} tabIndex={0} aria-selected={sel?.id === p.id} style={{ cursor: 'pointer' }}
                      onClick={() => setSelId(p.id)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelId(p.id) } }}>
                      <td className="mono muted">{litId(p.id)}</td>
                      <td><div className="scr-title">{p.title}</div>{(p.tags ?? []).length > 0 && <div className="scr-meta mono">{(p.tags ?? []).map((t) => `#${t}`).join(' ')}</div>}</td>
                      <td className="mono r">{p.year ?? '—'}</td>
                      <td className="mono muted">{source(p)}</td>
                      <td className="mono muted lit-ident">{p.pmid ? p.pmid : p.doi ?? '—'}</td>
                      <td><Tag tone={STANCE_TONE[stanceOf(p)]}>{stanceOf(p)}</Tag></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {rows.length === 0 && <div style={{ padding: '10px 14px' }}><Empty path="filter:">0 records match</Empty></div>}
            </div>
            {sel && (
              <div className="lit-inspector">
                <div className="insp-sec" style={{ marginTop: 0 }}>{litId(sel.id)} · citation</div>
                <div className="scr-ititle">{sel.title}</div>
                <MetaGrid rows={[
                  ['authors', sel.authors || '—'],
                  ['journal', <span>{sel.journal || '—'} <span className="mono muted">{sel.year ?? ''}</span></span>],
                  ['doi', sel.doi ? <a className="mono" href={`https://doi.org/${sel.doi}`} target="_blank" rel="noreferrer">{sel.doi} ↗</a> : '—'],
                  ['pmid', sel.pmid ? <a className="mono" href={`https://pubmed.ncbi.nlm.nih.gov/${sel.pmid}/`} target="_blank" rel="noreferrer">{sel.pmid} ↗</a> : '—'],
                ]} />
                <div className="insp-sec">evidence</div>
                <MetaGrid rows={[
                  ['status', <select className="select lit-stance" value={sel.stance ?? ''} onChange={(e) => updatePaper(sel.id, { stance: (e.target.value || undefined) as Paper['stance'] })} aria-label="Evidence status">
                    <option value="">unlinked</option><option value="supports">supports</option><option value="refutes">refutes</option><option value="background">background</option>
                  </select>],
                  ['hypotheses', hyps.length ? hyps.map((h) => h.label).join(' · ') : <span className="muted">none</span>],
                  ['screening', sel.pmid ? (inScreening ? <span className="mono">in queue</span> : <span className="muted mono">not queued</span>) : <span className="muted mono">no PMID</span>],
                ]} />
                <div className="insp-sec">tags</div>
                <div className="wrap-gap">
                  {(sel.tags ?? []).map((t) => <button key={t} className="chip-btn" onClick={() => updatePaper(sel.id, { tags: (sel.tags ?? []).filter((x) => x !== t) })} aria-label={`Remove tag ${t}`}>#{t} ✕</button>)}
                  <input className="input mono lit-tag" placeholder="add tag" value={tagDraft} onChange={(e) => setTagDraft(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') addTag(sel) }} aria-label="Add tag" />
                </div>
                <div className="wrap-gap" style={{ marginTop: 12 }}>
                  {sel.pmid && !inScreening && <button className="btn primary sm" onClick={() => sendToScreening(sel)}>queue for screening →</button>}
                  {inScreening && <Link className="btn ghost sm" to="/screening">open screening →</Link>}
                  <button className="btn ghost sm danger" onClick={() => { if (confirm(`Remove ${litId(sel.id)} from the project?`)) removePaper(sel.id) }}>remove</button>
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
