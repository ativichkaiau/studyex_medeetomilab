import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useStore } from '../lib/store'
import { Kicker, Tag, Empty, type Tone } from '../components/ui'
import { Markdown } from '../components/Markdown'
import { Sk } from '../components/Skeleton'
import { ForestPlot, FunnelPlot, PrismaFlow } from '../components/srmaPlots'
import { RobFigure } from '../components/RobFigure'
import { computeMeta, eggersTest, leaveOneOut, computeGrade, trimAndFill } from '../lib/metaAnalysis'
import { buildMarkdown, EXPORT_CSS } from '../lib/manuscript'
import { collectReferences, referenceListMd, toBibtex, toRis } from '../lib/references'
import { streamChat, hasKey, getModel, type ChatMessage } from '../lib/openai'
import { TraceableText } from '../components/Evidence'
import { evidenceAppendix } from '../lib/evidence'
import { manuscriptChecks, compiledSections, type SectionId, type SectionStatus } from '../lib/manuscriptQA'
import { downloadText } from '../lib/extractionExport'

const STATUS_TONE: Record<SectionStatus, Tone> = { empty: 'idle', draft: 'research', review: 'warn', final: 'ok' }

export default function Manuscript() {
  const { state } = useStore()
  return <ProjectManuscript key={state.project.id} />
}

/**
 * MANUSCRIPT — a compiled artifact. Methods, Results, figures and the PRISMA
 * 2020 checklist compile from the review's current data; each section carries
 * its size, a review status you set, and the QA issues the compile raises.
 * The text itself reads like a manuscript, not like code.
 */
function ProjectManuscript() {
  const { state, updateReview } = useStore()
  const r = state.review
  const meta = useMemo(() => computeMeta(r.studies, r.model, r.effect), [r.studies, r.model, r.effect])
  const egger = useMemo(() => eggersTest(r.studies, r.effect), [r.studies, r.effect])
  const loo = useMemo(() => leaveOneOut(r.studies, r.model, r.effect), [r.studies, r.model, r.effect])
  const grade = useMemo(() => computeGrade(r, meta, egger), [r, meta, egger])
  const tf = useMemo(() => trimAndFill(r.studies, r.model, r.effect), [r.studies, r.model, r.effect])
  const md = useMemo(() => buildMarkdown(state, meta, egger, loo, grade, tf), [state, meta, egger, loo, grade, tf])
  const refs = useMemo(() => collectReferences(state), [state])
  const refsMd = refs.length ? `## References\n\n${referenceListMd(refs)}\n` : ''
  const checks = useMemo(() => manuscriptChecks(state, meta, refs), [state, meta, refs])
  const sections = useMemo(() => compiledSections(md, refs.length), [md, refs.length])

  const splitIdx = md.indexOf('## PRISMA 2020 checklist')
  const narrative = (splitIdx >= 0 ? md.slice(0, splitIdx) : md).replace(/^#\s.*\n+/, '')
  const checklistMd = splitIdx >= 0 ? md.slice(splitIdx) : ''
  const traceMd = evidenceAppendix(state, 'manuscript', narrative)
  const exportMd = (splitIdx >= 0 ? `${md.slice(0, splitIdx)}${refsMd}\n${md.slice(splitIdx)}` : `${md}\n\n${refsMd}`) + traceMd
  const slug = (r.title || state.project.code).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'manuscript'
  const totalWords = sections.filter((s) => s.id !== 'references' && s.id !== 'checklist').reduce((a, s) => a + s.words, 0)

  const statusOf = (id: SectionId): SectionStatus => {
    const blankInputs = checks.some((c) => c.section === id && c.check === 'unfilled field')
    if (id === 'references') return refs.length ? r.manuscriptStatus?.[id] ?? 'draft' : 'empty'
    if (id === 'abstract' && !r.question.trim() && !r.title.trim()) return 'empty'
    if (blankInputs && !r.manuscriptStatus?.[id]) return 'draft'
    return r.manuscriptStatus?.[id] ?? 'draft'
  }
  const setStatus = (id: SectionId, v: SectionStatus) => updateReview({ manuscriptStatus: { ...(r.manuscriptStatus ?? {}), [id]: v as 'draft' | 'review' | 'final' } })

  const previewRef = useRef<HTMLDivElement | null>(null)
  const [copied, setCopied] = useState(false)
  function downloadHtml() {
    const preview = previewRef.current?.cloneNode(true) as HTMLElement | undefined
    preview?.querySelectorAll('[data-evidence-ui],.modal-overlay').forEach((el) => el.remove())
    const inner = preview?.innerHTML ?? ''
    const title = (r.title || state.project.name).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]!))
    const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><style>${EXPORT_CSS}</style></head><body>${inner}</body></html>`
    downloadText(html, `${slug}.html`, 'text/html')
  }

  // Terra polish
  const [aiText, setAiText] = useState('')
  const [aiOn, setAiOn] = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  useEffect(() => () => abortRef.current?.abort(), [])
  async function polish() {
    if (aiOn) return
    if (!hasKey()) { setAiText('_Terra is off — add an OpenAI key in Knowledge review → Settings._'); return }
    setAiText(''); setAiOn(true)
    const messages: ChatMessage[] = [
      { role: 'system', content: 'You are a medical editor. Expand and polish the Abstract and Discussion of this systematic review into publication-ready prose (accurate to the numbers given, cautious about causal language, past tense). Return markdown with ## Abstract and ## Discussion only.' },
      { role: 'user', content: md.slice(0, 3500) },
    ]
    const ctrl = new AbortController(); abortRef.current = ctrl
    try { await streamChat({ messages, model: getModel(), signal: ctrl.signal, onToken: (d) => setAiText((t) => t + d) }) }
    catch (e) { if (!(e instanceof DOMException && e.name === 'AbortError')) setAiText((t) => t + `\n\n_⚠ ${e instanceof Error ? e.message : 'failed'}_`) }
    finally { setAiOn(false); abortRef.current = null }
  }

  return (
    <>
      <div className="page-head">
        <div className="flex" style={{ justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
          <div style={{ minWidth: 0 }}>
            <Kicker>pipeline / 08 manuscript · compile</Kicker>
            <h1>Manuscript</h1>
            <p>Compiled from the review as it stands — Methods, Results, figures, references and the PRISMA 2020 checklist — and recompiled on every change. Verify every number and the narrative before submission.</p>
          </div>
          <div className="row-actions" style={{ flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            <button className="btn primary sm" onClick={downloadHtml}>export HTML</button>
            <button className="btn ghost sm" onClick={() => downloadText(exportMd, `${slug}.md`, 'text/markdown')}>markdown</button>
            {refs.length > 0 && <button className="btn ghost sm" onClick={() => downloadText(toBibtex(refs), `${slug}.bib`, 'application/x-bibtex')}>.bib</button>}
            {refs.length > 0 && <button className="btn ghost sm" onClick={() => downloadText(toRis(refs), `${slug}.ris`, 'application/x-research-info-systems')}>.ris</button>}
            <button className="btn ghost sm" onClick={() => { navigator.clipboard?.writeText(exportMd); setCopied(true); setTimeout(() => setCopied(false), 1500) }}>{copied ? 'copied ✓' : 'copy'}</button>
          </div>
        </div>
      </div>

      <div className="ms-grid">
        <div className="ms-side">
          <div className="card" style={{ padding: 0 }}>
            <div className="card-h" style={{ margin: 0, padding: '8px 14px' }}>sections/ <span className="spacer" /><span style={{ textTransform: 'none', letterSpacing: 0 }}>{totalWords.toLocaleString()} words</span></div>
            <table className="ms-sections">
              <thead><tr><th>section</th><th className="r">size</th><th>status</th></tr></thead>
              <tbody>
                {sections.map((s) => {
                  const st = statusOf(s.id)
                  const issues = checks.filter((c) => c.section === s.id).length
                  return (
                    <tr key={s.id}>
                      <td className="mono">{s.title}{issues > 0 && <span className="tone-warn"> · {issues}</span>}</td>
                      <td className="mono r muted">{s.id === 'references' ? `${s.words} refs` : `${s.words} w`}</td>
                      <td>
                        {st === 'empty' ? <Tag tone="idle">empty</Tag> : (
                          <select className={`ms-status st-${st}`} value={st} onChange={(e) => setStatus(s.id, e.target.value as SectionStatus)} aria-label={`${s.title} status`}>
                            <option value="draft">draft</option>
                            <option value="review">review</option>
                            <option value="final">final</option>
                          </select>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            <p className="small mono" style={{ padding: '8px 14px 10px' }}>figures 4 · compiled from current data</p>
          </div>

          <div className="card">
            <div className="card-h">manuscript qa <span className="spacer" /><Tag tone={checks.some((c) => c.level === 'error') ? 'bad' : checks.length ? 'warn' : 'ok'}>{checks.length} issue{checks.length === 1 ? '' : 's'}</Tag></div>
            {checks.length === 0 ? <Empty path="qa:">0 issues</Empty> : (
              <ul className="audit-list">
                {checks.map((c) => (
                  <li key={c.id}>
                    <div className="audit-top"><span className="mono">{c.check}</span><Tag tone={c.level === 'error' ? 'bad' : 'warn'}>{c.section}</Tag></div>
                    <p className="small" style={{ margin: '3px 0 5px', color: 'var(--text-secondary)' }}>{c.msg}</p>
                    <Link className="go" to={c.action.to}>{c.action.label} →</Link>
                  </li>
                ))}
              </ul>
            )}
            <p className="small" style={{ marginTop: 8 }}>Checks run on the compile itself. Abbreviation and figure-callout checks aren't computable here and aren't faked.</p>
          </div>

          <div className="card">
            <div className="card-h">terra</div>
            {aiOn ? <button className="btn ghost sm" onClick={() => abortRef.current?.abort()}>stop</button> : <button className="go" onClick={polish}>polish abstract &amp; discussion →</button>}
            <p className="small" style={{ marginTop: 6 }}>One call on your OpenAI key; the polished text appears above the compiled draft and never replaces it.</p>
          </div>
        </div>

        <div className="ms-main">
          <p className="small mono" style={{ marginBottom: 8 }}>select a claim (or its ↗ marker) to inspect and attach source passages · links are saved with the project</p>
          {(aiText || aiOn) && (
            <div className="card lg rail" style={{ marginBottom: 12 }}>
              <div className="card-h">terra · polished abstract &amp; discussion</div>
              {aiText ? <TraceableText document="manuscript" sectionId="polished"><Markdown text={aiText} /></TraceableText> : <Sk kind="polish" />}
            </div>
          )}
          <div className="card lg">
            <div className="manuscript" ref={previewRef}>
              <h1>{r.title || state.project.name}</h1>
              <TraceableText document="manuscript" sectionId="narrative"><Markdown text={narrative} /></TraceableText>
              <div className="fig-cap">Figure 1. PRISMA 2020 flow diagram.</div>
              <figure><PrismaFlow prisma={r.prisma} /></figure>
              <div className="fig-cap">Figure 2. Forest plot of the pooled {r.effect}.</div>
              <figure><ForestPlot result={meta} index={r.indexLabel} comparator={r.comparatorLabel} measure={r.effect} /></figure>
              <div className="fig-cap">Figure 3. Contour-enhanced funnel plot with trim-and-fill.</div>
              <figure><FunnelPlot result={meta} imputed={tf.imputed} adjustedPool={tf.adjustedPool} /></figure>
              <div className="fig-cap">Figure 4. Risk-of-bias summary{r.robTool ? ` (${r.robTool})` : ''}.</div>
              <figure><RobFigure studies={r.studies} domains={r.robDomains} tool={r.robTool} /></figure>
              {refsMd && <Markdown text={refsMd} />}
              <Markdown text={checklistMd} />
              {traceMd && <Markdown text={traceMd} />}
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
