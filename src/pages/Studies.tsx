import { useRef, useState } from 'react'
import { useStore } from '../lib/store'
import { Kicker, Rule } from '../components/ui'
import { Modal, Field } from '../components/Modal'
import { studyEffect, measureInfo, fmt } from '../lib/metaAnalysis'
import { RobPlot } from '../components/srmaPlots'
import { parseStudies, CSV_TEMPLATE, type ImportResult } from '../lib/importStudies'
import { complete, parseJsonLoose, hasKey, getModel } from '../lib/openai'
import type { Study, RobLevel, CohortProfile } from '../types'
import { CohortFields, CohortReviewPanel } from '../components/CohortReview'
import { ProjectTabs } from '../components/ProjectTabs'
import { analysisIncluded } from '../lib/cohorts'
import { Sk } from '../components/Skeleton'

const numStr = (v: unknown) => (v === null || v === undefined || v === '' || Number.isNaN(Number(v)) ? '' : String(v))

const ROB_COLOR: Record<RobLevel, string> = { low: 'var(--green)', some: 'var(--amber)', high: 'var(--red)' }
const LEVELS: RobLevel[] = ['low', 'some', 'high']

type Draft = {
  author: string
  year: string
  pmid: string
  doi: string
  cohort: CohortProfile
  design: string
  subgroup: string
  expEvents: string
  expTotal: string
  ctrlEvents: string
  ctrlTotal: string
  mean1: string
  sd1: string
  n1: string
  mean2: string
  sd2: string
  n2: string
  include: boolean
  rob: Record<string, RobLevel>
  note: string
}

const str = (v: number | undefined) => (v === undefined ? '' : String(v))
function toDraft(s: Study, domains: string[]): Draft {
  return {
    author: s.author, year: String(s.year), pmid: s.pmid ?? '', design: s.design ?? '', subgroup: s.subgroup ?? '',
    doi: s.doi ?? '', cohort: s.cohort ?? {},
    expEvents: str(s.expEvents), expTotal: str(s.expTotal), ctrlEvents: str(s.ctrlEvents), ctrlTotal: str(s.ctrlTotal),
    mean1: str(s.mean1), sd1: str(s.sd1), n1: str(s.n1), mean2: str(s.mean2), sd2: str(s.sd2), n2: str(s.n2),
    include: s.include, rob: Object.fromEntries(domains.map((d) => [d, s.rob?.[d] ?? 'some'])), note: s.note ?? '',
  }
}

export default function Studies() {
  const { state } = useStore()
  return <ProjectStudies key={state.project.id} />
}

function ProjectStudies() {
  const { state, addStudy, addStudies, updateStudy, removeStudy } = useStore()
  const r = state.review
  const [editing, setEditing] = useState<{ id: string | null; draft: Draft } | null>(null)
  const [imp, setImp] = useState<{ text: string; result: ImportResult | null } | null>(null)
  const [extract, setExtract] = useState<{ text: string; loading: boolean; error?: string; source?: string; reading?: string } | null>(null)
  const pdfRef = useRef<HTMLInputElement>(null)

  function onFile(file: File) {
    const reader = new FileReader()
    reader.onload = () => {
      const text = String(reader.result || '')
      setImp({ text, result: text.trim() ? parseStudies(text) : null })
    }
    reader.readAsText(file)
  }
  function downloadTemplate() {
    const url = URL.createObjectURL(new Blob([CSV_TEMPLATE], { type: 'text/csv' }))
    const a = document.createElement('a')
    a.href = url
    a.download = 'studies-template.csv'
    a.click()
    URL.revokeObjectURL(url)
  }
  function confirmImport() {
    if (imp?.result?.studies.length) addStudies(imp.result.studies)
    setImp(null)
  }
  const binary = measureInfo(r.effect).binary
  const blank: Draft = { author: '', year: String(new Date().getFullYear()), pmid: '', doi: '', cohort: {}, design: 'cohort', subgroup: '', expEvents: '', expTotal: '', ctrlEvents: '', ctrlTotal: '', mean1: '', sd1: '', n1: '', mean2: '', sd2: '', n2: '', include: true, rob: Object.fromEntries(r.robDomains.map((d) => [d, 'some'])), note: '' }

  function save() {
    if (!editing) return
    const d = editing.draft
    const patch: Partial<Study> = {
      author: d.author || 'Unknown', year: +d.year || new Date().getFullYear(), pmid: d.pmid || undefined, design: d.design || undefined, subgroup: d.subgroup.trim() || undefined,
      doi: d.doi.trim() || undefined, cohort: d.cohort,
      expEvents: d.expEvents === '' ? undefined : Math.max(0, Math.round(+d.expEvents)),
      expTotal: d.expTotal === '' ? undefined : Math.max(0, Math.round(+d.expTotal)),
      ctrlEvents: d.ctrlEvents === '' ? undefined : Math.max(0, Math.round(+d.ctrlEvents)),
      ctrlTotal: d.ctrlTotal === '' ? undefined : Math.max(0, Math.round(+d.ctrlTotal)),
      mean1: d.mean1 === '' ? undefined : +d.mean1,
      sd1: d.sd1 === '' ? undefined : +d.sd1,
      n1: d.n1 === '' ? undefined : Math.max(0, Math.round(+d.n1)),
      mean2: d.mean2 === '' ? undefined : +d.mean2,
      sd2: d.sd2 === '' ? undefined : +d.sd2,
      n2: d.n2 === '' ? undefined : Math.max(0, Math.round(+d.n2)),
      include: d.include, rob: d.rob, note: d.note || undefined,
    }
    if (editing.id) updateStudy(editing.id, patch)
    else addStudy(patch as Omit<Study, 'id'>)
    setEditing(null)
  }
  const set = (patch: Partial<Draft>) => editing && setEditing({ ...editing, draft: { ...editing.draft, ...patch } })

  async function onPdf(file: File | undefined) {
    if (!file) return
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      setExtract((e) => (e ? { ...e, error: 'That file is not a PDF.' } : e)); return
    }
    setExtract((e) => (e ? { ...e, error: undefined, reading: 'Loading PDF…' } : e))
    try {
      const { extractPdfText } = await import('../lib/pdfText')
      const res = await extractPdfText(file, (p, n) => setExtract((e) => (e ? { ...e, reading: `Reading page ${p} of ${n}…` } : e)))
      if (!res.text.trim()) {
        setExtract((e) => (e ? { ...e, reading: undefined, error: 'No selectable text — this looks like a scanned/image PDF. Paste the text manually.' } : e)); return
      }
      setExtract((e) => (e ? { ...e, text: res.text, reading: undefined, source: `${file.name} · ${res.pages} page${res.pages === 1 ? '' : 's'} · ${res.chars.toLocaleString()} chars` } : e))
    } catch (err) {
      setExtract((e) => (e ? { ...e, reading: undefined, error: `Could not read the PDF${err instanceof Error ? `: ${err.message}` : ''}.` } : e))
    }
  }

  async function runExtract() {
    if (!extract || !extract.text.trim()) return
    if (!hasKey()) { setExtract({ ...extract, error: 'Add an OpenAI key in Knowledge Review → Settings to use extraction.' }); return }
    setExtract({ ...extract, loading: true, error: undefined })
    const fullText = !!extract.source
    const cap = fullText ? 16000 : 6000
    try {
      const out = await complete(
        [
          { role: 'system', content: 'You extract structured data from a study abstract or full-text article for a systematic review. Output ONLY valid JSON, no prose. Use null for any field not explicitly reported or directly computable — never guess counts.' },
          {
            role: 'user',
            content: `Review context — index/exposed group: "${r.indexLabel}"; comparator: "${r.comparatorLabel}"; outcome: "${r.outcomeLabel}". Effect type: ${binary ? 'binary 2×2 event counts' : 'continuous mean/SD/n'}.\n\nReturn this JSON shape:\n{"author":"first-author surname","year":2020,"pmid":"","design":"e.g. prospective cohort","expEvents":null,"expTotal":null,"ctrlEvents":null,"ctrlTotal":null,"mean1":null,"sd1":null,"n1":null,"mean2":null,"sd2":null,"n2":null,"note":"one-line summary","confidence":"high|medium|low"}\nexpEvents/expTotal = outcome events and group size in the "${r.indexLabel}" arm; ctrlEvents/ctrlTotal = the "${r.comparatorLabel}" arm. mean1/sd1/n1 = "${r.indexLabel}"; mean2/sd2/n2 = "${r.comparatorLabel}".${fullText ? ' This is full article text — the outcome counts are usually in the Results paragraphs or a table; prefer per-arm numbers reported there over the abstract if they differ.' : ''}\n\n${fullText ? 'Full-text article' : 'Abstract / text'}:\n${extract.text.slice(0, cap)}`,
          },
        ],
        getModel(),
      )
      const j = parseJsonLoose<Record<string, unknown>>(out)
      const draft: Draft = {
        ...blank,
        author: (j.author as string) || '',
        year: j.year ? String(j.year) : '',
        pmid: (j.pmid as string) || '',
        design: (j.design as string) || '',
        expEvents: numStr(j.expEvents), expTotal: numStr(j.expTotal), ctrlEvents: numStr(j.ctrlEvents), ctrlTotal: numStr(j.ctrlTotal),
        mean1: numStr(j.mean1), sd1: numStr(j.sd1), n1: numStr(j.n1), mean2: numStr(j.mean2), sd2: numStr(j.sd2), n2: numStr(j.n2),
        note: [j.note as string, j.confidence ? `AI-extracted · confidence ${j.confidence}` : ''].filter(Boolean).join(' — '),
      }
      setExtract(null)
      setEditing({ id: null, draft })
    } catch {
      setExtract({ ...extract, loading: false, error: 'Could not read a clean result — paste a tidier abstract, or add the study manually.' })
    }
  }

  return (
    <>
      <div className="page-head">
        <Rule />
        <Kicker>SYSTEMATIC REVIEW · DATA EXTRACTION</Kicker>
        <h1 style={{ marginTop: 12 }}>Included studies</h1>
        <p>{r.indexLabel} vs {r.comparatorLabel} → {r.outcomeLabel}. Toggle inclusion, edit the extracted 2×2 counts, and rate risk of bias.</p>
        <div className="head-actions">
          <button className="btn primary sm" onClick={() => setEditing({ id: null, draft: { ...blank } })}>＋ Add study</button>
          <button className="btn ghost sm" onClick={() => setExtract({ text: '', loading: false })}>✦ Extract from abstract / PDF</button>
          <button className="btn ghost sm" onClick={() => setImp({ text: '', result: null })}>⤓ Import CSV / RIS</button>
        </div>
      </div>

      {r.studies.length > 0 && !r.studies.some((s) => (s.expTotal ?? 0) > 0 || (s.ctrlTotal ?? 0) > 0 || (s.n1 ?? 0) > 0 || (s.n2 ?? 0) > 0) && (
        <div className="err" style={{ background: 'var(--warn)', color: 'var(--warn-ink)', border: '1px solid color-mix(in srgb,var(--amber) 30%,var(--line))', marginBottom: 16 }}>
          ⚠ Study identities are from PubMed, but <b>no outcome data has been extracted yet</b> — add the counts per study (or use ✦ Extract from abstract / PDF) to enable pooling.
        </div>
      )}

      <ProjectTabs />
      <CohortReviewPanel onEdit={(s) => setEditing({ id: s.id, draft: toDraft(s, r.robDomains) })} />
      <div className="tbl-scroll">
        <table>
          <thead>
            <tr><th>In</th><th>Study</th><th>Design</th><th>{r.indexLabel}</th><th>{r.comparatorLabel}</th><th>{r.effect} [95% CI]</th>{r.robDomains.map((d) => <th key={d}>{d.slice(0, 4)}</th>)}<th></th></tr>
          </thead>
          <tbody>
            {r.studies.map((s) => {
              const eff = studyEffect(s, r.effect)
              return (
                <tr key={s.id} style={s.include ? undefined : { opacity: 0.5 }}>
                  <td><input type="checkbox" aria-label={`Include ${s.author} ${s.year}`} checked={s.include} disabled={!!s.cohortPrimaryId && s.cohortPrimaryId !== s.id} title={s.cohortPrimaryId && s.cohortPrimaryId !== s.id ? 'Secondary report — change the cohort selection above to include it.' : 'Include in pooled analysis'} onChange={(e) => updateStudy(s.id, { include: e.target.checked })} /></td>
                  <td>
                    <b>{s.author} {s.year}</b>
                    {s.cohortPrimaryId && <div className="small muted">{s.cohortPrimaryId === s.id ? 'Selected cohort report' : 'Linked secondary report'}</div>}
                    {s.pmid && <div className="small mono"><a href={`https://pubmed.ncbi.nlm.nih.gov/${s.pmid}/`} target="_blank" rel="noreferrer">PMID {s.pmid} ↗</a></div>}
                  </td>
                  <td className="muted">{s.design ?? '—'}</td>
                  <td className="mono">{binary ? `${s.expEvents ?? '—'}/${s.expTotal ?? '—'}` : (s.mean1 !== undefined ? `${s.mean1}±${s.sd1} (${s.n1})` : '—')}</td>
                  <td className="mono">{binary ? `${s.ctrlEvents ?? '—'}/${s.ctrlTotal ?? '—'}` : (s.mean2 !== undefined ? `${s.mean2}±${s.sd2} (${s.n2})` : '—')}</td>
                  <td className="mono">{eff ? `${fmt(eff.est)} [${fmt(eff.low)}, ${fmt(eff.high)}]` : <span className="muted">no data</span>}</td>
                  {r.robDomains.map((d) => (
                    <td key={d}><span className="rob-dot" style={{ background: ROB_COLOR[s.rob?.[d] ?? 'some'] }} title={`${d}: ${s.rob?.[d] ?? 'some'}`} /></td>
                  ))}
                  <td>
                    <div className="row-actions">
                      <button className="icon-btn" onClick={() => setEditing({ id: s.id, draft: toDraft(s, r.robDomains) })}>Edit</button>
                      <button className="icon-btn danger" onClick={() => { if (confirm(`Remove ${s.author} ${s.year}?`)) removeStudy(s.id) }}>Del</button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div className="flex" style={{ gap: 16, marginTop: 12, flexWrap: 'wrap' }}>
        <span className="small">Risk of bias:</span>
        {LEVELS.map((l) => <span key={l} className="flex small" style={{ gap: 6 }}><span className="rob-dot" style={{ background: ROB_COLOR[l] }} />{l}</span>)}
        <span className="spacer" />
        <span className="small">{r.studies.filter(analysisIncluded).length} of {r.studies.length} included</span>
      </div>

      <div className="card lg" style={{ marginTop: 16 }}>
        <div className="card-h"><span className="sq" style={{ background: 'var(--accent, var(--blue))' }} />RISK-OF-BIAS SUMMARY</div>
        <RobPlot studies={r.studies} domains={r.robDomains} />
      </div>

      {editing && (
        <Modal title={editing.id ? 'Edit study' : 'Add study'} onClose={() => setEditing(null)} wide>
          <div className="form-row three">
            <Field label="Author"><input className="input" value={editing.draft.author} onChange={(e) => set({ author: e.target.value })} placeholder="Priori" /></Field>
            <Field label="Year"><input className="input" type="number" value={editing.draft.year} onChange={(e) => set({ year: e.target.value })} /></Field>
            <Field label="PMID"><input className="input" value={editing.draft.pmid} onChange={(e) => set({ pmid: e.target.value })} /></Field>
          </div>
          <div className="form-row">
            <Field label="Design"><input className="input" value={editing.draft.design} onChange={(e) => set({ design: e.target.value })} placeholder="prospective cohort" /></Field>
            <Field label="Subgroup" hint="for “Custom subgroup” meta-analysis"><input className="input" value={editing.draft.subgroup} onChange={(e) => set({ subgroup: e.target.value })} placeholder="e.g. SCN5A+ / pediatric" /></Field>
          </div>
          <Field label="DOI"><input className="input" value={editing.draft.doi} onChange={(e) => set({ doi: e.target.value })} /></Field>
          <CohortFields value={editing.draft.cohort} onChange={(cohort) => set({ cohort })} />
          {binary ? (
            <>
              <div className="form-row">
                <Field label={`${r.indexLabel} — events`}><input className="input" type="number" value={editing.draft.expEvents} onChange={(e) => set({ expEvents: e.target.value })} /></Field>
                <Field label={`${r.indexLabel} — total`}><input className="input" type="number" value={editing.draft.expTotal} onChange={(e) => set({ expTotal: e.target.value })} /></Field>
              </div>
              <div className="form-row">
                <Field label={`${r.comparatorLabel} — events`}><input className="input" type="number" value={editing.draft.ctrlEvents} onChange={(e) => set({ ctrlEvents: e.target.value })} /></Field>
                <Field label={`${r.comparatorLabel} — total`}><input className="input" type="number" value={editing.draft.ctrlTotal} onChange={(e) => set({ ctrlTotal: e.target.value })} /></Field>
              </div>
            </>
          ) : (
            <>
              <div className="form-row three">
                <Field label={`${r.indexLabel} — mean`}><input className="input" type="number" step="any" value={editing.draft.mean1} onChange={(e) => set({ mean1: e.target.value })} /></Field>
                <Field label="SD"><input className="input" type="number" step="any" value={editing.draft.sd1} onChange={(e) => set({ sd1: e.target.value })} /></Field>
                <Field label="n"><input className="input" type="number" value={editing.draft.n1} onChange={(e) => set({ n1: e.target.value })} /></Field>
              </div>
              <div className="form-row three">
                <Field label={`${r.comparatorLabel} — mean`}><input className="input" type="number" step="any" value={editing.draft.mean2} onChange={(e) => set({ mean2: e.target.value })} /></Field>
                <Field label="SD"><input className="input" type="number" step="any" value={editing.draft.sd2} onChange={(e) => set({ sd2: e.target.value })} /></Field>
                <Field label="n"><input className="input" type="number" value={editing.draft.n2} onChange={(e) => set({ n2: e.target.value })} /></Field>
              </div>
            </>
          )}
          <Field label="Risk of bias">
            <div className="form-row three">
              {r.robDomains.map((d) => (
                <label key={d} className="field" style={{ margin: 0 }}>
                  <span className="field-l">{d}</span>
                  <select className="select" value={editing.draft.rob[d]} onChange={(e) => set({ rob: { ...editing.draft.rob, [d]: e.target.value as RobLevel } })}>
                    {LEVELS.map((l) => <option key={l} value={l}>{l}</option>)}
                  </select>
                </label>
              ))}
            </div>
          </Field>
          <label className={`check${editing.draft.include ? ' on' : ''}`} style={{ marginBottom: 12 }}>
            <input type="checkbox" checked={editing.draft.include} disabled={!!r.studies.find((s) => s.id === editing.id && s.cohortPrimaryId && s.cohortPrimaryId !== s.id)} onChange={(e) => set({ include: e.target.checked })} /> Include in meta-analysis
          </label>
          <div className="form-actions">
            <button className="btn ghost" onClick={() => setEditing(null)}>Cancel</button>
            <button className="btn primary" onClick={save}>{editing.id ? 'Save' : 'Add study'}</button>
          </div>
        </Modal>
      )}

      {extract && (
        <Modal title="✦ Extract study data from an abstract or PDF" onClose={() => setExtract(null)} wide>
          <p className="small" style={{ marginBottom: 12 }}>Drop a <b>full-text PDF</b> or paste an abstract / results paragraph. The AI pulls the author, year, design and the 2×2 counts for <b>{r.indexLabel}</b> vs <b>{r.comparatorLabel}</b>, then opens the study editor pre-filled for you to check before saving. It never invents numbers — anything not reported is left blank.</p>
          <input ref={pdfRef} type="file" accept="application/pdf,.pdf" style={{ display: 'none' }} onChange={(e) => { onPdf(e.target.files?.[0]); e.target.value = '' }} />
          <div
            className="pdf-drop"
            onClick={() => pdfRef.current?.click()}
            onDragOver={(e) => { e.preventDefault() }}
            onDrop={(e) => { e.preventDefault(); onPdf(e.dataTransfer.files?.[0]) }}
            style={{ border: '1.5px dashed color-mix(in srgb, var(--accent, var(--blue)) 45%, var(--line))', borderRadius: 10, padding: '14px 16px', textAlign: 'center', cursor: 'pointer', marginBottom: 12, background: 'color-mix(in srgb, var(--accent, var(--blue)) 5%, transparent)' }}
          >
            {extract.reading ? (
              <Sk kind="pages" label={extract.reading} />
            ) : extract.source ? (
              <span className="small">✓ <b>{extract.source}</b> — text below. Click to replace, or edit before extracting.</span>
            ) : (
              <span className="small">⬆ <b>Drop a PDF here</b> or click to choose — the text is read in your browser (nothing is uploaded to a server).</span>
            )}
          </div>
          <textarea className="textarea" rows={9} style={{ width: '100%' }} placeholder="…or paste the abstract / full-text excerpt here" value={extract.text} onChange={(e) => setExtract({ ...extract, text: e.target.value, source: undefined })} />
          {extract.loading && <div style={{ marginTop: 12 }}><Sk kind="extraction" parts={[r.indexLabel, r.comparatorLabel]} /></div>}
          {extract.error && <div className="err" style={{ marginTop: 12, marginBottom: 0 }}>{extract.error}</div>}
          <div className="form-actions">
            <button className="btn ghost" onClick={() => setExtract(null)}>Cancel</button>
            <button className="btn primary" onClick={runExtract} disabled={extract.loading || !!extract.reading || !extract.text.trim()}>{extract.loading ? 'Extracting…' : '✦ Extract & review'}</button>
          </div>
        </Modal>
      )}

      {imp && (
        <Modal title="Import studies" onClose={() => setImp(null)} wide>
          <p className="small" style={{ marginBottom: 12 }}>Paste or upload a <b>CSV</b> (with optional 2×2 counts) or an <b>RIS</b> export from your screener / reference manager. Columns are matched automatically.</p>
          <div className="flex" style={{ gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
            <label className="btn ghost sm" style={{ cursor: 'pointer' }}>
              Choose file
              <input type="file" accept=".csv,.ris,.txt,.tsv,.nbib" style={{ display: 'none' }} onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f) }} />
            </label>
            <button className="btn ghost sm" onClick={downloadTemplate}>Download CSV template</button>
          </div>
          <textarea className="textarea" rows={7} style={{ width: '100%' }} placeholder="…or paste CSV / RIS here" value={imp.text} onChange={(e) => setImp({ text: e.target.value, result: e.target.value.trim() ? parseStudies(e.target.value) : null })} />
          {imp.result && (
            <div className="card" style={{ marginTop: 12, background: 'var(--card-2)' }}>
              <div className="flex"><b>{imp.result.studies.length}</b>&nbsp;studies detected · <span className="chip" style={{ marginLeft: 6 }}>{imp.result.format.toUpperCase()}</span></div>
              {imp.result.warnings.map((w, i) => <p key={i} className="small" style={{ color: 'var(--warn-ink)', marginTop: 6 }}>⚠ {w}</p>)}
              <div className="wrap-gap" style={{ marginTop: 8 }}>
                {imp.result.studies.slice(0, 8).map((s, i) => <span key={i} className="pill">{s.author} {s.year || ''}{s.expTotal ? ` · ${s.expEvents}/${s.expTotal} vs ${s.ctrlEvents}/${s.ctrlTotal}` : ''}</span>)}
                {imp.result.studies.length > 8 && <span className="pill">+{imp.result.studies.length - 8} more</span>}
              </div>
            </div>
          )}
          <div className="form-actions">
            <button className="btn ghost" onClick={() => setImp(null)}>Cancel</button>
            <button className="btn primary" onClick={confirmImport} disabled={!imp.result?.studies.length}>Add {imp.result?.studies.length || 0} studies</button>
          </div>
        </Modal>
      )}
    </>
  )
}
