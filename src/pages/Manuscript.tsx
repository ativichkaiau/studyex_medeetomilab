import { useEffect, useMemo, useRef, useState } from 'react'
import { useStore } from '../lib/store'
import { Kicker, Rule } from '../components/ui'
import { Markdown } from '../components/Markdown'
import { Sk } from '../components/Skeleton'
import { ForestPlot, FunnelPlot, PrismaFlow, RobPlot } from '../components/srmaPlots'
import { computeMeta, eggersTest, leaveOneOut, computeGrade, trimAndFill } from '../lib/metaAnalysis'
import { buildMarkdown, EXPORT_CSS } from '../lib/manuscript'
import { collectReferences, referenceListMd, toBibtex, toRis } from '../lib/references'
import { streamChat, hasKey, getModel, type ChatMessage } from '../lib/openai'
import { TraceableText } from '../components/Evidence'
import { ProjectTabs } from '../components/ProjectTabs'
import { evidenceAppendix } from '../lib/evidence'

function download(content: string, name: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  URL.revokeObjectURL(url)
}

export default function Manuscript() {
  const { state } = useStore()
  return <ProjectManuscript key={state.project.id} />
}

function ProjectManuscript() {
  const { state } = useStore()
  const r = state.review
  const meta = useMemo(() => computeMeta(r.studies, r.model, r.effect), [r.studies, r.model, r.effect])
  const egger = useMemo(() => eggersTest(r.studies, r.effect), [r.studies, r.effect])
  const loo = useMemo(() => leaveOneOut(r.studies, r.model, r.effect), [r.studies, r.model, r.effect])
  const grade = useMemo(() => computeGrade(r, meta, egger), [r, meta, egger])
  const tf = useMemo(() => trimAndFill(r.studies, r.model, r.effect), [r.studies, r.model, r.effect])
  const md = useMemo(() => buildMarkdown(state, meta, egger, loo, grade, tf), [state, meta, egger, loo, grade, tf])
  const refs = useMemo(() => collectReferences(state), [state])
  const refsMd = refs.length ? `## References\n\n${referenceListMd(refs)}\n` : ''

  const splitIdx = md.indexOf('## PRISMA 2020 checklist')
  const narrative = (splitIdx >= 0 ? md.slice(0, splitIdx) : md).replace(/^#\s.*\n+/, '')
  const checklistMd = splitIdx >= 0 ? md.slice(splitIdx) : ''
  // References sit after the Discussion/figures, before the PRISMA-checklist appendix
  const traceMd = evidenceAppendix(state, 'manuscript', narrative)
  const exportMd = (splitIdx >= 0 ? `${md.slice(0, splitIdx)}${refsMd}\n${md.slice(splitIdx)}` : `${md}\n\n${refsMd}`) + traceMd
  const slug = r.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60)

  const previewRef = useRef<HTMLDivElement | null>(null)
  const [copied, setCopied] = useState(false)

  function downloadHtml() {
    const preview = previewRef.current?.cloneNode(true) as HTMLElement | undefined
    preview?.querySelectorAll('[data-evidence-ui],.modal-overlay').forEach((el) => el.remove())
    const inner = preview?.innerHTML ?? ''
    const title = r.title.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]!))
    const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><style>${EXPORT_CSS}</style></head><body>${inner}</body></html>`
    download(html, `${slug}.html`, 'text/html')
  }

  // AI polish
  const [aiText, setAiText] = useState('')
  const [aiOn, setAiOn] = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  useEffect(() => () => abortRef.current?.abort(), [])
  async function polish() {
    if (aiOn) return
    if (!hasKey()) { setAiText('_Set an OpenAI key in Knowledge Review → Settings._'); return }
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
        <Rule />
        <div className="flex" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <Kicker>SYSTEMATIC REVIEW · MANUSCRIPT</Kicker>
            <h1 style={{ marginTop: 12 }}>Manuscript &amp; PRISMA export</h1>
            <p>A submission-ready draft — Methods, Results, figures and the PRISMA 2020 checklist — assembled from your review. Verify every number and the narrative before submitting.</p>
          </div>
          <div className="row-actions" style={{ flex: 'none', flexWrap: 'wrap', gap: 8, justifyContent: 'flex-end' }}>
            <button className="btn primary sm" onClick={downloadHtml}>⤓ HTML (with figures)</button>
            <button className="btn ghost sm" onClick={() => download(exportMd, `${slug}.md`, 'text/markdown')}>⤓ Markdown</button>
            {refs.length > 0 && <button className="btn ghost sm" onClick={() => download(toBibtex(refs), `${slug}.bib`, 'application/x-bibtex')} title="Export the reference list as BibTeX">⤓ BibTeX</button>}
            {refs.length > 0 && <button className="btn ghost sm" onClick={() => download(toRis(refs), `${slug}.ris`, 'application/x-research-info-systems')} title="Export the reference list as RIS">⤓ RIS</button>}
            <button className="btn ghost sm" onClick={() => { navigator.clipboard?.writeText(exportMd); setCopied(true); setTimeout(() => setCopied(false), 1500) }}>{copied ? 'Copied ✓' : 'Copy'}</button>
            {aiOn ? <button className="btn ghost sm" onClick={() => abortRef.current?.abort()}>Stop</button> : <button className="btn ghost sm" onClick={polish}>✦ AI polish</button>}
          </div>
        </div>
      </div>

      <ProjectTabs />
      <p className="small muted">Click a claim or its ↗ marker to inspect and attach source passages. Evidence links are saved with this project.</p>
      {(aiText || aiOn) && (
        <div className="card lg rail" style={{ marginBottom: 16 }}>
          <div className="card-h"><span className="sq" style={{ background: 'var(--accent, var(--blue))' }} />AI-POLISHED ABSTRACT &amp; DISCUSSION</div>
          {aiText ? <TraceableText document="manuscript" sectionId="polished"><Markdown text={aiText} /></TraceableText> : <Sk kind="polish" />}
        </div>
      )}

      <div className="card lg">
        <div className="manuscript" ref={previewRef}>
          <h1>{r.title}</h1>
          <TraceableText document="manuscript" sectionId="narrative"><Markdown text={narrative} /></TraceableText>
          <div className="fig-cap">Figure 1. PRISMA 2020 flow diagram.</div>
          <figure><PrismaFlow prisma={r.prisma} /></figure>
          <div className="fig-cap">Figure 2. Forest plot of the pooled {r.effect}.</div>
          <figure><ForestPlot result={meta} index={r.indexLabel} comparator={r.comparatorLabel} measure={r.effect} /></figure>
          <div className="fig-cap">Figure 3. Contour-enhanced funnel plot with trim-and-fill.</div>
          <figure><FunnelPlot result={meta} imputed={tf.imputed} adjustedPool={tf.adjustedPool} /></figure>
          <div className="fig-cap">Figure 4. Risk-of-bias summary.</div>
          <figure><RobPlot studies={r.studies} domains={r.robDomains} /></figure>
          {refsMd && <Markdown text={refsMd} />}
          <Markdown text={checklistMd} />
          {traceMd && <Markdown text={traceMd} />}
        </div>
      </div>
    </>
  )
}
