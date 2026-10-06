import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useStore } from '../lib/store'
import { Kicker, Tag, Empty } from '../components/ui'
import { Modal, Field } from '../components/Modal'
import { studyEffect, measureInfo, fmt } from '../lib/metaAnalysis'
import { parseStudies, CSV_TEMPLATE, type ImportResult } from '../lib/importStudies'
import { complete, parseJsonLoose, hasKey, getModel } from '../lib/openai'
import type { Study, RobLevel, CohortProfile } from '../types'
import { CohortFields, CohortReviewPanel } from '../components/CohortReview'
import { analysisIncluded } from '../lib/cohorts'
import { Sk } from '../components/Skeleton'
import { studyId } from '../lib/ids'
import { extractionFlags, schemaCoverage, SCHEMA } from '../lib/extractionQA'
import { extractionCsv, downloadText } from '../lib/extractionExport'
import { overallRob, ROB_LABEL, ROB_TONE } from '../lib/rob'
import { openTerra, TERRA_TASKS } from '../lib/terra'

const numStr = (v: unknown) => (v === null || v === undefined || v === '' || Number.isNaN(Number(v)) ? '' : String(v))
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
  rob: Record<string, RobLevel | ''>
  note: string
}

const str = (v: number | undefined) => (v === undefined ? '' : String(v))
function toDraft(s: Study, domains: string[]): Draft {
  return {
    author: s.author, year: String(s.year), pmid: s.pmid ?? '', design: s.design ?? '', subgroup: s.subgroup ?? '',
    doi: s.doi ?? '', cohort: s.cohort ?? {},
    expEvents: str(s.expEvents), expTotal: str(s.expTotal), ctrlEvents: str(s.ctrlEvents), ctrlTotal: str(s.ctrlTotal),
    mean1: str(s.mean1), sd1: str(s.sd1), n1: str(s.n1), mean2: str(s.mean2), sd2: str(s.sd2), n2: str(s.n2),
    include: s.include, rob: Object.fromEntries(domains.map((d) => [d, s.rob?.[d] ?? ''])), note: s.note ?? '',
  }
}

export default function Studies() {
  const { state } = useStore()
  return <ProjectStudies key={state.project.id} />
}

/**
 * EXTRACTION — structured parsing. Each study is parsed into a schema
 * (study characteristics, participants, outcomes, risk of bias, notes) and
 * validated against it; the grid prints what was parsed, the flags say what
 * the schema still needs.
 */
function ProjectStudies() {
  const { state, addStudy, addStudies, updateStudy, removeStudy } = useStore()
  const r = state.review
  const [editing, setEditing] = useState<{ id: string | null; draft: Draft } | null>(null)
  const [imp, setImp] = useState<{ text: string; result: ImportResult | null } | null>(null)
  const [extract, setExtract] = useState<{ text: string; loading: boolean; error?: string; source?: string; reading?: string } | null>(null)
  const [onlyFlagged, setOnlyFlagged] = useState(false)
  // a deep link (?study=<id>) opens that study's extraction form
  const [params, setParams] = useSearchParams()
  useEffect(() => {
    const id = params.get('study')
    const s = id ? r.studies.find((x) => x.id === id) : undefined
    if (s) {
      setEditing({ id: s.id, draft: toDraft(s, r.robDomains) })
      setParams({}, { replace: true })
    }
  }, [params]) // eslint-disable-line react-hooks/exhaustive-deps
  const pdfRef = useRef<HTMLInputElement>(null)

  const flags = useMemo(() => extractionFlags(r), [r])
  const coverage = useMemo(() => schemaCoverage(r), [r])
  const flagsBy = useMemo(() => {
    const m = new Map<string, number>()
    flags.forEach((f) => m.set(f.study, (m.get(f.study) ?? 0) + 1))
    return m
  }, [flags])
  const included = r.studies.filter(analysisIncluded)
  const binary = measureInfo(r.effect).binary
  const withData = included.filter((s) => studyEffect(s, r.effect)).length
  const rows = onlyFlagged ? r.studies.filter((s) => flagsBy.has(s.id)) : r.studies

  function onFile(file: File) {
    const reader = new FileReader()
    reader.onload = () => {
      const text = String(reader.result || '')
      setImp({ text, result: text.trim() ? parseStudies(text) : null })
    }
    reader.readAsText(file)
  }
  function confirmImport() {
    if (imp?.result?.studies.length) addStudies(imp.result.studies)
    setImp(null)
  }
  const blank: Draft = { author: '', year: String(new Date().getFullYear()), pmid: '', doi: '', cohort: {}, design: '', subgroup: '', expEvents: '', expTotal: '', ctrlEvents: '', ctrlTotal: '', mean1: '', sd1: '', n1: '', mean2: '', sd2: '', n2: '', include: true, rob: Object.fromEntries(r.robDomains.map((d) => [d, ''])), note: '' }

  function save() {
    if (!editing) return
    const d = editing.draft
    // only judged domains are stored: an unrated domain stays unrated
    const rob = Object.fromEntries(Object.entries(d.rob).filter(([, v]) => v)) as Record<string, RobLevel>
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
      include: d.include, rob: Object.keys(rob).length ? rob : undefined, note: d.note || undefined,
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
    setExtract((e) => (e ? { ...e, error: undefined, reading: 'loading PDF…' } : e))
    try {
      const { extractPdfText } = await import('../lib/pdfText')
      const res = await extractPdfText(file, (p, n) => setExtract((e) => (e ? { ...e, reading: `reading page ${p} of ${n}…` } : e)))
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
    if (!hasKey()) { setExtract({ ...extract, error: 'Terra is off: add an OpenAI key in Knowledge review → Settings.' }); return }
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
        note: [j.note as string, j.confidence ? `terra-extracted · confidence ${j.confidence}` : ''].filter(Boolean).join(' — '),
      }
      setExtract(null)
      setEditing({ id: null, draft })
    } catch {
      setExtract({ ...extract, loading: false, error: 'Could not parse a clean result — paste a tidier abstract, or add the study manually.' })
    }
  }

  const editingStudy = editing?.id ? r.studies.find((s) => s.id === editing.id) : undefined

  return (
    <>
      <div className="page-head">
        <div className="flex" style={{ justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
          <div style={{ minWidth: 0 }}>
            <Kicker>pipeline / 04 extraction · parse</Kicker>
            <h1>Extraction</h1>
            <p><span className="mono">{r.indexLabel || 'index'} vs {r.comparatorLabel || 'comparator'} → {r.outcomeLabel || 'outcome'}</span> · effect <span className="mono">{r.effect}</span>. Each study is parsed into the schema below and validated as you edit.</p>
          </div>
          <div className="row-actions" style={{ flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            <button className="btn primary sm" onClick={() => setEditing({ id: null, draft: { ...blank } })}>＋ add study</button>
            <button className="btn ghost sm" onClick={() => setExtract({ text: '', loading: false })}>terra · parse abstract / PDF</button>
            <button className="btn ghost sm" onClick={() => setImp({ text: '', result: null })}>import CSV / RIS</button>
            <button className="btn ghost sm" onClick={() => downloadText(extractionCsv(r), `${state.project.code.toLowerCase()}-extraction.csv`, 'text/csv')} disabled={!r.studies.length}>export CSV</button>
          </div>
        </div>
      </div>

      <div className="readouts" style={{ marginBottom: 12 }}>
        <div className="readout"><span>studies</span><b>{r.studies.length}</b><small>{r.studies.length - included.length} not pooled</small></div>
        <div className="readout"><span>included</span><b>{included.length}</b><small>count toward pooling</small></div>
        <div className="readout"><span>with {binary ? '2×2' : 'mean/SD'}</span><b>{withData}</b><small>{included.length - withData} still to parse</small></div>
        <div className="readout"><span>flags</span><b className={flags.some((f) => f.level === 'error') ? 'tone-bad' : flags.length ? 'tone-warn' : ''}>{flags.length}</b><small>{flags.filter((f) => f.level === 'error').length} invalid · {flags.filter((f) => f.level === 'warn').length} warnings</small></div>
      </div>

      <div className="ext-grid">
        <div className="ext-side">
          <div className="card">
            <div className="card-h">schema/</div>
            <ul className="tree">
              {SCHEMA.map((sec) => {
                const c = coverage[sec.id]
                return (
                  <li key={sec.id}>
                    <span className="tree-k">{sec.label}</span>
                    <span className="tree-v mono">{c.of ? `${c.done}/${c.of}` : '—'}</span>
                    <small>{sec.fields.join(' · ')}</small>
                  </li>
                )
              })}
            </ul>
            {r.robDomains.length === 0 && <p className="small" style={{ marginTop: 8 }}>risk_of_bias has no domains — <Link to="/protocol">define the appraisal tool →</Link></p>}
          </div>
          <div className="card">
            <div className="card-h">validation <span className="spacer" />{flags.length > 0 && <button className="go" onClick={() => setOnlyFlagged((v) => !v)} style={{ textTransform: 'none', letterSpacing: 0 }}>{onlyFlagged ? 'show all' : 'only flagged'}</button>}</div>
            {flags.length === 0 ? <Empty path="flags:">0 · every included study parses</Empty> : (
              <ul className="flag-list">
                {flags.map((f, i) => {
                  const s = r.studies.find((x) => x.id === f.study)!
                  return (
                    <li key={i} className={`flag-${f.level}`}>
                      <button className="flag-btn" onClick={() => setEditing({ id: s.id, draft: toDraft(s, r.robDomains) })}>
                        <span className="mono">{studyId(s.id)}</span>
                        <Tag tone={f.level === 'error' ? 'bad' : 'warn'}>{f.kind}</Tag>
                        <span className="flag-msg">{s.author} {s.year} · {f.msg}</span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
            <div style={{ marginTop: 10 }}><button className="go" onClick={() => openTerra({ prompt: TERRA_TASKS.extraction[0].prompt })}>terra · check extraction →</button></div>
          </div>
        </div>

        <div className="ext-main">
          {r.studies.length === 0 ? (
            <div className="card"><Empty path="extraction/">0 studies — send full-text inclusions from screening, import a CSV/RIS, or add a study.</Empty></div>
          ) : (
            <div className="tbl-scroll">
              <table aria-label="Extraction table">
                <thead>
                  <tr><th>in</th><th>id</th><th>study</th><th>design</th><th className="r">{r.indexLabel || 'index'}</th><th className="r">{r.comparatorLabel || 'comparator'}</th><th className="r">{r.effect} [95% CI]</th><th>rob</th><th>flags</th><th /></tr>
                </thead>
                <tbody>
                  {rows.map((s) => {
                    const eff = studyEffect(s, r.effect)
                    const secondary = !!s.cohortPrimaryId && s.cohortPrimaryId !== s.id
                    const ov = overallRob(s, r.robDomains)
                    const nf = flagsBy.get(s.id) ?? 0
                    return (
                      <tr key={s.id} className={s.include ? '' : 'row-off'}>
                        <td><input type="checkbox" aria-label={`Include ${s.author} ${s.year}`} checked={s.include} disabled={secondary} title={secondary ? 'Secondary report — change the cohort selection to include it.' : 'Include in the pooled analysis'} onChange={(e) => updateStudy(s.id, { include: e.target.checked })} /></td>
                        <td className="mono muted">{studyId(s.id)}</td>
                        <td>
                          <b>{s.author} {s.year}</b>
                          {s.cohortPrimaryId && <div className="small">{s.cohortPrimaryId === s.id ? 'selected cohort report' : 'linked secondary report'}</div>}
                          {s.pmid && <div className="small mono"><a href={`https://pubmed.ncbi.nlm.nih.gov/${s.pmid}/`} target="_blank" rel="noreferrer">pmid {s.pmid} ↗</a></div>}
                        </td>
                        <td className="muted">{s.design ?? '—'}</td>
                        <td className="mono r">{binary ? `${s.expEvents ?? '—'}/${s.expTotal ?? '—'}` : (s.mean1 !== undefined ? `${s.mean1} ± ${s.sd1} (${s.n1})` : '—')}</td>
                        <td className="mono r">{binary ? `${s.ctrlEvents ?? '—'}/${s.ctrlTotal ?? '—'}` : (s.mean2 !== undefined ? `${s.mean2} ± ${s.sd2} (${s.n2})` : '—')}</td>
                        <td className="mono r">{eff ? `${fmt(eff.est)} [${fmt(eff.low)}, ${fmt(eff.high)}]` : <span className="muted">no data</span>}</td>
                        <td>{ov ? <Tag tone={ROB_TONE[ov]}>{ROB_LABEL[ov]}</Tag> : <span className="muted mono">—</span>}</td>
                        <td>{nf ? <Tag tone="warn">{nf}</Tag> : <span className="muted mono">0</span>}</td>
                        <td>
                          <div className="row-actions">
                            <button className="icon-btn" onClick={() => setEditing({ id: s.id, draft: toDraft(s, r.robDomains) })}>edit</button>
                            <button className="icon-btn danger" onClick={() => { if (confirm(`Remove ${s.author} ${s.year}?`)) removeStudy(s.id) }} aria-label={`Remove ${s.author} ${s.year}`}>✕</button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
          <p className="small mono" style={{ margin: '8px 0 12px' }}>{included.length} of {r.studies.length} included · risk of bias in detail: <Link to="/rob">risk_of_bias →</Link></p>
          <CohortReviewPanel onEdit={(s) => setEditing({ id: s.id, draft: toDraft(s, r.robDomains) })} />
        </div>
      </div>

      {editing && (
        <Modal title={editing.id ? `extraction / ${studyId(editing.id)}` : 'extraction / new study'} onClose={() => setEditing(null)} wide>
          <div className="schema-sec">study_characteristics</div>
          <div className="form-row three">
            <Field label="author"><input className="input" value={editing.draft.author} onChange={(e) => set({ author: e.target.value })} placeholder="first-author surname" /></Field>
            <Field label="year"><input className="input mono" type="number" value={editing.draft.year} onChange={(e) => set({ year: e.target.value })} /></Field>
            <Field label="pmid"><input className="input mono" value={editing.draft.pmid} onChange={(e) => set({ pmid: e.target.value })} /></Field>
          </div>
          <div className="form-row">
            <Field label="design"><input className="input" value={editing.draft.design} onChange={(e) => set({ design: e.target.value })} placeholder="prospective cohort" /></Field>
            <Field label="subgroup" hint="for a custom subgroup analysis"><input className="input" value={editing.draft.subgroup} onChange={(e) => set({ subgroup: e.target.value })} /></Field>
          </div>
          <Field label="doi"><input className="input mono" value={editing.draft.doi} onChange={(e) => set({ doi: e.target.value })} /></Field>

          <div className="schema-sec">participants</div>
          <CohortFields value={editing.draft.cohort} onChange={(cohort) => set({ cohort })} />

          <div className="schema-sec">outcomes · {r.effect}{r.outcomeLabel ? ` · ${r.outcomeLabel}` : ''}</div>
          {binary ? (
            <div className="schema-table">
              <div /><div className="mono small">events</div><div className="mono small">total</div>
              <div className="mono small">{r.indexLabel || 'index'}</div>
              <input className="input mono" type="number" aria-label="index events" value={editing.draft.expEvents} onChange={(e) => set({ expEvents: e.target.value })} />
              <input className="input mono" type="number" aria-label="index total" value={editing.draft.expTotal} onChange={(e) => set({ expTotal: e.target.value })} />
              <div className="mono small">{r.comparatorLabel || 'comparator'}</div>
              <input className="input mono" type="number" aria-label="comparator events" value={editing.draft.ctrlEvents} onChange={(e) => set({ ctrlEvents: e.target.value })} />
              <input className="input mono" type="number" aria-label="comparator total" value={editing.draft.ctrlTotal} onChange={(e) => set({ ctrlTotal: e.target.value })} />
            </div>
          ) : (
            <div className="schema-table four">
              <div /><div className="mono small">mean</div><div className="mono small">sd</div><div className="mono small">n</div>
              <div className="mono small">{r.indexLabel || 'index'}</div>
              <input className="input mono" type="number" step="any" aria-label="index mean" value={editing.draft.mean1} onChange={(e) => set({ mean1: e.target.value })} />
              <input className="input mono" type="number" step="any" aria-label="index SD" value={editing.draft.sd1} onChange={(e) => set({ sd1: e.target.value })} />
              <input className="input mono" type="number" aria-label="index n" value={editing.draft.n1} onChange={(e) => set({ n1: e.target.value })} />
              <div className="mono small">{r.comparatorLabel || 'comparator'}</div>
              <input className="input mono" type="number" step="any" aria-label="comparator mean" value={editing.draft.mean2} onChange={(e) => set({ mean2: e.target.value })} />
              <input className="input mono" type="number" step="any" aria-label="comparator SD" value={editing.draft.sd2} onChange={(e) => set({ sd2: e.target.value })} />
              <input className="input mono" type="number" aria-label="comparator n" value={editing.draft.n2} onChange={(e) => set({ n2: e.target.value })} />
            </div>
          )}

          <div className="schema-sec">risk_of_bias{r.robTool ? ` · ${r.robTool}` : ''}</div>
          {r.robDomains.length === 0 ? <p className="small">No appraisal domains defined for this review — set the tool and domains in <Link to="/protocol" onClick={() => setEditing(null)}>protocol</Link>.</p> : (
            <div className="form-row three">
              {r.robDomains.map((d) => (
                <label key={d} className="field" style={{ margin: 0 }}>
                  <span className="field-l">{d}</span>
                  <select className="select" value={editing.draft.rob[d] ?? ''} onChange={(e) => set({ rob: { ...editing.draft.rob, [d]: e.target.value as RobLevel | '' } })}>
                    <option value="">not assessed</option>
                    {LEVELS.map((l) => <option key={l} value={l}>{ROB_LABEL[l].toLowerCase()}</option>)}
                  </select>
                </label>
              ))}
            </div>
          )}

          <div className="schema-sec">notes</div>
          <textarea className="textarea" rows={2} style={{ width: '100%' }} value={editing.draft.note} onChange={(e) => set({ note: e.target.value })} aria-label="Notes" />
          <label className={`check${editing.draft.include ? ' on' : ''}`} style={{ margin: '12px 0' }}>
            <input type="checkbox" checked={editing.draft.include} disabled={!!editingStudy?.cohortPrimaryId && editingStudy.cohortPrimaryId !== editingStudy.id} onChange={(e) => set({ include: e.target.checked })} /> include in the pooled analysis
          </label>
          <div className="form-actions">
            <button className="btn ghost" onClick={() => setEditing(null)}>cancel</button>
            <button className="btn primary" onClick={save}>{editing.id ? 'save' : 'add study'}</button>
          </div>
        </Modal>
      )}

      {extract && (
        <Modal title="terra / parse an abstract or PDF" onClose={() => setExtract(null)} wide>
          <p className="small" style={{ marginBottom: 12 }}>Drop a <b>full-text PDF</b> or paste an abstract / results paragraph. Terra reads the author, year, design and the outcome data for <b>{r.indexLabel || 'the index arm'}</b> vs <b>{r.comparatorLabel || 'the comparator'}</b>, then opens the extraction form pre-filled for you to check before saving. Anything not reported is left blank. The text is read in your browser; parsing is one call on your own OpenAI key.</p>
          <input ref={pdfRef} type="file" accept="application/pdf,.pdf" style={{ display: 'none' }} onChange={(e) => { onPdf(e.target.files?.[0]); e.target.value = '' }} />
          <div className="pdf-drop" role="button" tabIndex={0} onClick={() => pdfRef.current?.click()} onKeyDown={(e) => { if (e.key === 'Enter') pdfRef.current?.click() }}
            onDragOver={(e) => { e.preventDefault() }} onDrop={(e) => { e.preventDefault(); onPdf(e.dataTransfer.files?.[0]) }}>
            {extract.reading ? <Sk kind="pages" label={extract.reading} />
              : extract.source ? <span className="small">✓ <b>{extract.source}</b> — text below. Click to replace.</span>
              : <span className="small mono">drop a PDF here, or click to choose</span>}
          </div>
          <textarea className="textarea" rows={9} style={{ width: '100%' }} placeholder="…or paste the abstract / full-text excerpt here" value={extract.text} onChange={(e) => setExtract({ ...extract, text: e.target.value, source: undefined })} />
          {extract.loading && <div style={{ marginTop: 12 }}><Sk kind="extraction" parts={[r.indexLabel, r.comparatorLabel]} /></div>}
          {extract.error && <div className="err" style={{ marginTop: 12, marginBottom: 0 }}>{extract.error}</div>}
          <div className="form-actions">
            <button className="btn ghost" onClick={() => setExtract(null)}>cancel</button>
            <button className="btn primary" onClick={runExtract} disabled={extract.loading || !!extract.reading || !extract.text.trim()}>{extract.loading ? 'parsing…' : 'parse & review →'}</button>
          </div>
        </Modal>
      )}

      {imp && (
        <Modal title="import studies" onClose={() => setImp(null)} wide>
          <p className="small" style={{ marginBottom: 12 }}>Paste or upload a <b>CSV</b> (with optional 2×2 counts) or an <b>RIS</b> export from your screener or reference manager. Columns are matched automatically; this page's CSV export re-imports as-is.</p>
          <div className="flex" style={{ gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
            <label className="btn ghost sm" style={{ cursor: 'pointer' }}>
              choose file
              <input type="file" accept=".csv,.ris,.txt,.tsv,.nbib" style={{ display: 'none' }} onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f) }} />
            </label>
            <button className="btn ghost sm" onClick={() => downloadText(CSV_TEMPLATE, 'studies-template.csv', 'text/csv')}>CSV template</button>
          </div>
          <textarea className="textarea mono" rows={7} style={{ width: '100%' }} placeholder="…or paste CSV / RIS here" value={imp.text} onChange={(e) => setImp({ text: e.target.value, result: e.target.value.trim() ? parseStudies(e.target.value) : null })} />
          {imp.result && (
            <div className="card" style={{ marginTop: 12, background: 'var(--bg-raised)' }}>
              <div className="flex mono small"><b>{imp.result.studies.length}</b> studies detected · <Tag tone="info">{imp.result.format}</Tag></div>
              {imp.result.warnings.map((w, i) => <p key={i} className="small" style={{ color: 'var(--warning)', marginTop: 6 }}>⚠ {w}</p>)}
              <div className="wrap-gap" style={{ marginTop: 8 }}>
                {imp.result.studies.slice(0, 8).map((s, i) => <span key={i} className="pill">{s.author} {s.year || ''}{s.expTotal ? ` · ${s.expEvents}/${s.expTotal} vs ${s.ctrlEvents}/${s.ctrlTotal}` : ''}</span>)}
                {imp.result.studies.length > 8 && <span className="pill">+{imp.result.studies.length - 8} more</span>}
              </div>
            </div>
          )}
          <div className="form-actions">
            <button className="btn ghost" onClick={() => setImp(null)}>cancel</button>
            <button className="btn primary" onClick={confirmImport} disabled={!imp.result?.studies.length}>add {imp.result?.studies.length || 0} studies</button>
          </div>
        </Modal>
      )}
    </>
  )
}
