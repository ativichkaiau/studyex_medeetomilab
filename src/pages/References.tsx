import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useStore } from '../lib/store'
import { Kicker, Rule, StatCard } from '../components/ui'
import { collectReferences, toBibtex, toRis, vancouver } from '../lib/references'
import { Bookshelf } from '../components/Solids'

function download(content: string, name: string, type: string) {
  const blob = new Blob([content], { type })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  URL.revokeObjectURL(url)
}

export default function References() {
  const { state } = useStore()
  const refs = useMemo(() => collectReferences(state), [state])
  const [copied, setCopied] = useState<string | null>(null)
  const [q, setQ] = useState('')

  const slug = (state.project.code || 'references').toLowerCase()
  const shown = useMemo(() => {
    const t = q.trim().toLowerCase()
    if (!t) return refs
    return refs.filter((r) => `${r.author} ${r.title} ${r.journal} ${r.citeKey} ${r.year}`.toLowerCase().includes(t))
  }, [refs, q])

  function copy(text: string, tag: string) {
    navigator.clipboard?.writeText(text)
    setCopied(tag)
    setTimeout(() => setCopied((c) => (c === tag ? null : c)), 1400)
  }

  const withDoi = refs.filter((r) => r.doi).length
  const inBoth = refs.filter((r) => r.kind === 'both').length

  // the shelf's books point into the table: clear any filter, bring the row up, flash it
  const findRow = (id: string) => {
    setQ('')
    requestAnimationFrame(() => {
      const row = document.getElementById(`ref-${id}`)
      if (!row) return
      row.scrollIntoView({ block: 'center' })
      row.classList.remove('flash')
      void row.offsetWidth
      row.classList.add('flash')
    })
  }

  return (
    <>
      <div className="page-head">
        <Rule />
        <div className="flex" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <Kicker>SYSTEMATIC REVIEW · REFERENCE LIBRARY</Kicker>
            <h1 style={{ marginTop: 12 }}>Reference library</h1>
            <p>Every citeable work — graph references and included studies, merged by PMID/DOI — with stable citation keys. Export the whole library as BibTeX or RIS, or copy a single citation into the manuscript.</p>
          </div>
          <div className="row-actions" style={{ flex: 'none', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            <Link className="btn ghost sm" to="/evidence">Evidence library →</Link>
            <button className="btn primary sm" onClick={() => download(toBibtex(refs), `${slug}.bib`, 'application/x-bibtex')} disabled={!refs.length}>⤓ BibTeX</button>
            <button className="btn ghost sm" onClick={() => download(toRis(refs), `${slug}.ris`, 'application/x-research-info-systems')} disabled={!refs.length}>⤓ RIS</button>
            <button className="btn ghost sm" onClick={() => copy(refs.map((r, i) => vancouver(r, i + 1)).join('\n'), 'all')} disabled={!refs.length}>{copied === 'all' ? 'Copied ✓' : 'Copy list'}</button>
          </div>
        </div>
      </div>

      {refs.length === 0 ? (
        <div className="card note">
          <div className="card-h"><span className="sq" style={{ background: 'var(--amber)' }} />NO REFERENCES YET</div>
          <p className="small">Add references on the <b>Literature</b> page (→ Graph) or include studies on the <b>Studies</b> page — they appear here automatically, de-duplicated and cite-keyed.</p>
        </div>
      ) : (
        <>
          <div className="grid g4" style={{ marginBottom: 16 }}>
            <StatCard value={refs.length} label="References" sub="unique, de-duplicated" tone="#1746d1" />
            <StatCard value={refs.filter((r) => r.inStudies).length} label="In meta-analysis" sub="included studies" tone="#0d9488" />
            <StatCard value={refs.filter((r) => r.inGraph).length} label="On knowledge graph" sub={`${inBoth} in both`} tone="#7c3aed" />
            <StatCard value={withDoi} label="With DOI" sub={`${refs.filter((r) => r.pmid).length} with PMID`} tone="#ea580c" />
          </div>

          <Bookshelf refs={refs} onPick={findRow} />

          <div className="card lg">
            <div className="card-h" style={{ justifyContent: 'space-between' }}>
              <span><span className="sq" style={{ background: 'var(--blue)' }} />LIBRARY · {shown.length} of {refs.length}</span>
              <input className="input" style={{ maxWidth: 240 }} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter by author, title, key…" />
            </div>
            <div className="tbl-scroll" style={{ marginTop: 10 }}>
              <table>
                <thead>
                  <tr><th>Cite key</th><th>Reference</th><th>Where</th><th style={{ textAlign: 'right' }}>Actions</th></tr>
                </thead>
                <tbody>
                  {shown.map((r, i) => (
                    <tr key={r.id} id={`ref-${r.id}`}>
                      <td className="mono" style={{ whiteSpace: 'nowrap', color: 'var(--blue)' }}>@{r.citeKey}</td>
                      <td>
                        <div>{vancouver(r, refs.indexOf(r) + 1).replace(/^\d+\.\s/, '')}</div>
                        <div className="small mono muted">
                          {r.pmid && <a href={`https://pubmed.ncbi.nlm.nih.gov/${r.pmid}/`} target="_blank" rel="noreferrer">PMID {r.pmid} ↗</a>}
                          {r.pmid && r.doi ? ' · ' : ''}
                          {r.doi && <a href={`https://doi.org/${r.doi}`} target="_blank" rel="noreferrer">doi ↗</a>}
                        </div>
                      </td>
                      <td>
                        {r.inStudies && <span className="src-badge" style={{ background: '#0d9488' }} title="Included study">MA</span>}
                        {r.inGraph && <span className="src-badge" style={{ background: '#7c3aed' }} title="On knowledge graph">GRAPH</span>}
                      </td>
                      <td>
                        <div className="flex" style={{ gap: 6, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                          <Link className="btn ghost sm" to={`/evidence?reference=${encodeURIComponent(r.id)}`}>Add passage</Link>
                          <button className="btn ghost sm" title="Copy pandoc citation for the manuscript" onClick={() => copy(`[@${r.citeKey}]`, `cite-${r.id}`)}>{copied === `cite-${r.id}` ? '✓' : `[@${r.citeKey}]`}</button>
                          <button className="btn ghost sm" title="Copy the BibTeX entry" onClick={() => copy(toBibtex([r]), `bib-${r.id}`)}>{copied === `bib-${r.id}` ? 'Copied ✓' : 'BibTeX'}</button>
                          <button className="btn ghost sm" title="Copy the formatted reference" onClick={() => copy(vancouver(r, i + 1).replace(/^\d+\.\s/, ''), `van-${r.id}`)}>{copied === `van-${r.id}` ? 'Copied ✓' : 'Cite'}</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="small" style={{ marginTop: 8 }}>Cite keys are stable (<span className="mono">surnameYear</span>, disambiguated a/b/c). <b>[@key]</b> copies a Pandoc/Markdown citation; the Manuscript export renders the matching numbered reference list.</p>
          </div>
        </>
      )}
    </>
  )
}
