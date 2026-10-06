import { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useStore } from '../lib/store'
import { collectReferences } from '../lib/references'
import { evidenceOf, newEvidenceId, savePassage } from '../lib/evidence'
import type { EvidencePassage } from '../types'
import { Field } from '../components/Modal'
import { Kicker, Rule } from '../components/ui'
import { ProjectTabs } from '../components/ProjectTabs'
import { PassageCard, ClaimModal } from '../components/Evidence'
import { PublicationWatch } from '../components/PublicationWatch'
import { Sk } from '../components/Skeleton'

export default function EvidenceLibrary() {
  const { state } = useStore()
  return <ProjectEvidenceLibrary key={state.project.id} />
}

function ProjectEvidenceLibrary() {
  const { state, updateResearch } = useStore()
  const [params] = useSearchParams()
  const refs = collectReferences(state)
  const initial = refs.find((r) => r.id === params.get('reference'))
  const [refId, setRefId] = useState(initial?.id ?? '')
  const [title, setTitle] = useState(initial?.title ?? '')
  const [doi, setDoi] = useState(initial?.doi ?? '')
  const [pmid, setPmid] = useState(initial?.pmid ?? '')
  const [text, setText] = useState('')
  const [locator, setLocator] = useState('')
  const [design, setDesign] = useState('')
  const [limitations, setLimitations] = useState('')
  const [pdf, setPdf] = useState<{ name: string; pages: string[]; page: number } | null>(null)
  const [reading, setReading] = useState('')
  const [error, setError] = useState('')
  const [saved, setSaved] = useState('')
  const [query, setQuery] = useState('')
  const [selectedClaim, setSelectedClaim] = useState<string | null>(null)
  const alive = useRef(true)
  const fileRef = useRef<HTMLInputElement>(null)
  const pageRef = useRef<HTMLTextAreaElement>(null)
  const e = evidenceOf(state)
  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])
  function chooseReference(id: string) {
    const ref = refs.find((r) => r.id === id)
    setRefId(id); setTitle(ref?.title ?? ''); setDoi(ref?.doi ?? ''); setPmid(ref?.pmid ?? '')
    setText(''); setLocator(''); setPdf(null); setDesign(''); setLimitations(''); setSaved('')
  }
  async function readPdf(file?: File) {
    if (!file) return
    if (file.size > 25 * 1024 * 1024) { setError('Choose a PDF under 25 MB.'); return }
    setError(''); setReading('Reading PDF…'); setPdf(null); setText('')
    try {
      const { extractPdfText } = await import('../lib/pdfText')
      const result = await extractPdfText(file, (p, n) => { if (alive.current) setReading(`Reading page ${p}/${n}…`) })
      if (!alive.current) return
      if (!result.text.trim()) throw new Error('This PDF has no selectable text. Paste a passage from your source instead.')
      setPdf({ name: file.name, pages: result.pageTexts, page: 1 }); setLocator('PDF page 1')
    } catch (err) { if (alive.current) setError(err instanceof Error ? err.message : 'Could not read this PDF.') }
    finally { if (alive.current) setReading('') }
  }
  function save() {
    setError(''); setSaved('')
    try {
      const id = refId || newEvidenceId('paper')
      const passage: EvidencePassage = { id: newEvidenceId('passage'), referenceId: id, title: title.trim(), doi: doi.trim() || undefined, pmid: pmid.trim() || undefined, text, locator: locator.trim(), design: design.trim(), limitations: limitations.trim(), origin: pdf ? 'pdf' : 'paste', fileName: pdf?.name, page: pdf?.page, createdAt: Date.now() }
      if (pdf && !pdf.pages[pdf.page - 1].includes(text)) throw new Error('Select a passage from the displayed PDF page.')
      updateResearch(state.project.id, (p) => {
        let next = savePassage(p, passage)
        if (!refId) next = { ...next, papers: [...next.papers, { id, title: passage.title, doi: passage.doi, pmid: passage.pmid }] }
        return next
      }, `Added source passage: ${passage.title}`)
      setRefId(id); setText(''); setSaved('Passage saved. Living Theory will review it when you open Theory.')
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not save the passage.') }
  }
  const shown = e.passages.filter((p) => `${p.title} ${p.text} ${p.design} ${p.locator}`.toLowerCase().includes(query.toLowerCase()))
  const claim = e.claims.find((c) => c.id === selectedClaim)
  return <>
    <div className="page-head"><Rule /><Kicker>knowledge / evidence</Kicker><h1>Evidence</h1><p>Keep the passage, its context, and your interpretation together. Link evidence from any claim in Theory or the manuscript.</p><div className="head-actions"><Link className="btn ghost sm" to="/theory">Living Theory →</Link><Link className="btn ghost sm" to="/studies">Cohort review →</Link></div></div>
    <ProjectTabs />
    <PublicationWatch />
    <div className="evidence-layout">
      <section className="card evidence-capture"><div className="card-h">ADD A SOURCE PASSAGE</div>
        <Field label="Reference"><select className="select" value={refId} disabled={!!reading} onChange={(ev) => chooseReference(ev.target.value)}><option value="">New reference…</option>{refs.map((r) => <option value={r.id} key={r.id}>{r.title || `${r.author} ${r.year}`}</option>)}</select></Field>
        <Field label="Source title"><input className="input" value={title} onChange={(ev) => setTitle(ev.target.value)} /></Field>
        <div className="form-row"><Field label="DOI · optional"><input className="input" value={doi} onChange={(ev) => setDoi(ev.target.value)} placeholder="10.1234/example" /></Field><Field label="PMID · optional"><input className="input" value={pmid} onChange={(ev) => setPmid(ev.target.value)} /></Field></div>
        <div className="wrap-gap"><button className="btn ghost sm" disabled={!!reading} onClick={() => fileRef.current?.click()}>Select passage from PDF</button>{pdf && <button className="btn ghost sm" onClick={() => { setPdf(null); setText(''); setLocator('') }}>Use pasted text</button>}</div>
        {reading && <Sk kind="pages" label={reading} />}
        <input ref={fileRef} type="file" hidden accept="application/pdf,.pdf" onChange={(ev) => { void readPdf(ev.target.files?.[0]); ev.target.value = '' }} />
        {pdf && <div className="pdf-passage-picker"><Field label={`PDF page · ${pdf.name}`}><select className="select" value={pdf.page} onChange={(ev) => { const page = +ev.target.value; setPdf({ ...pdf, page }); setText(''); setLocator(`PDF page ${page}`) }}>{pdf.pages.map((_, i) => <option key={i} value={i + 1}>Page {i + 1}</option>)}</select></Field><textarea className="textarea" ref={pageRef} aria-label="PDF page text" readOnly rows={9} value={pdf.pages[pdf.page - 1]} /><button className="btn ghost sm" onClick={() => { const el = pageRef.current; if (el) { const selection = el.value.slice(el.selectionStart, el.selectionEnd); if (selection.trim()) setText(selection); else setError('Highlight the exact passage in the PDF text first.') } }}>Use highlighted text</button><p className="small muted">Check extracted text against the PDF. Only the selected passage is saved.</p></div>}
        <Field label="Exact source passage"><textarea className="textarea" rows={6} maxLength={12000} readOnly={!!pdf} value={text} onChange={(ev) => setText(ev.target.value)} placeholder="Paste the exact passage, including relevant qualifications." /></Field>
        <Field label="Location in source"><input className="input" value={locator} onChange={(ev) => setLocator(ev.target.value)} placeholder="e.g. Page 6, Results, paragraph 2" /></Field>
        <Field label="Study design"><input className="input" value={design} onChange={(ev) => setDesign(ev.target.value)} placeholder="e.g. Prospective multicenter cohort; or not reported" /></Field>
        <Field label="Limitations / applicability"><textarea className="textarea" rows={2} value={limitations} onChange={(ev) => setLimitations(ev.target.value)} placeholder="Population, confounding, precision, follow-up, or not assessed yet" /></Field>
        <button className="btn primary" disabled={!!reading || !title.trim() || !text.trim() || !locator.trim()} onClick={save}>Save passage</button>
        {error && <p className="evidence-error" role="alert">{error}</p>}{saved && <p className="small" role="status">{saved} <Link to="/theory">Open Theory →</Link></p>}
      </section>
      <section><div className="evidence-library-head"><h2>Source passages <span className="small muted">{e.passages.length}</span></h2><input className="input" aria-label="Filter passages" placeholder="Find a passage…" value={query} onChange={(ev) => setQuery(ev.target.value)} /></div>
        {!shown.length && <div className="card empty">{query ? 'No passages match your search.' : 'Add your first source passage to begin tracing evidence.'}</div>}
        {shown.map((p) => <div key={p.id} className="evidence-library-item"><PassageCard passage={p} /><div className="wrap-gap"><span className="small muted">{e.claims.filter((c) => c.links.some((l) => l.passageId === p.id)).length} linked claims</span><button className="btn ghost sm" onClick={() => { if (confirm('Remove this passage? Linked claims will show a missing source, and pending revisions will need a new review. Undo can restore it.')) updateResearch(state.project.id, (current) => ({ ...current, evidence: { ...evidenceOf(current), passages: evidenceOf(current).passages.filter((x) => x.id !== p.id) } }), 'Removed a source passage') }}>Remove</button></div></div>)}
        {!!e.claims.length && <details className="card"><summary>Saved claim traces · {e.claims.length}</summary><p className="small muted">Includes historical claims. Evidence markers appear only where the exact claim text still matches.</p>{e.claims.map((c) => <button className="evidence-claim-row" key={c.id} onClick={() => setSelectedClaim(c.id)}><span className="small muted">{c.document} · {c.links.length} passages</span><span>{c.text}</span></button>)}</details>}
      </section>
    </div>
    {claim && <ClaimModal key={claim.id} document={claim.document} sectionId={claim.sectionId} text={claim.text} onClose={() => setSelectedClaim(null)} />}
  </>
}
