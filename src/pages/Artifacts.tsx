import { useMemo, useRef, useState, type ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useStore } from '../lib/store'
import { Kicker, MetaGrid, Tag, Empty, type Tone } from '../components/ui'
import { ForestPlot, FunnelPlot, PrismaFlow } from '../components/srmaPlots'
import { RobFigure } from '../components/RobFigure'
import { computeMeta, eggersTest, leaveOneOut, computeGrade, trimAndFill } from '../lib/metaAnalysis'
import { buildMarkdown } from '../lib/manuscript'
import { collectReferences, toBibtex, toRis } from '../lib/references'
import { extractionCsv, downloadText } from '../lib/extractionExport'
import { exportPngFile, exportSvgFile, exportPdfFile } from '../lib/figureExport'
import { datasetFingerprint, runId } from '../lib/analysisRuns'
import { analysisIncluded } from '../lib/cohorts'
import { exportName } from '../lib/brand'

type State = 'ready' | 'blocked' | 'empty'
const STATE_TONE: Record<State, Tone> = { ready: 'ok', blocked: 'warn', empty: 'idle' }

interface Artifact {
  id: string
  type: string
  source: { label: string; to: string }
  formats: string[]
  state: State
  note: string
  /** a figure: the preview, which is also what gets exported */
  figure?: ReactNode
  /** a document: downloads produced from the data */
  files?: { label: string; run: () => void }[]
}

/**
 * ARTIFACTS — the research outputs, as files. Each is generated from the
 * project's current data at the moment you export it; the registry says
 * where it comes from and whether it can be produced yet. Figures preview
 * here exactly as they export.
 */
export default function Artifacts() {
  const { state, exportActive } = useStore()
  const r = state.review
  const code = state.project.code.toLowerCase()
  const meta = useMemo(() => computeMeta(r.studies, r.model, r.effect), [r.studies, r.model, r.effect])
  const tf = useMemo(() => trimAndFill(r.studies, r.model, r.effect), [r.studies, r.model, r.effect])
  const refs = useMemo(() => collectReferences(state), [state])
  const fingerprint = useMemo(() => datasetFingerprint(r), [r])
  const lastRun = r.runs?.[0]
  const analysisSource = lastRun && lastRun.dataset === fingerprint ? runId(lastRun.n) : 'live analysis'
  const incl = r.studies.filter(analysisIncluded)
  const assessed = incl.some((s) => r.robDomains.some((d) => s.rob?.[d]))
  const identified = r.prisma.dbRecords + r.prisma.otherRecords

  const compileMd = () => {
    const egger = eggersTest(r.studies, r.effect)
    const md = buildMarkdown(state, meta, egger, leaveOneOut(r.studies, r.model, r.effect), computeGrade(r, meta, egger), tf)
    downloadText(md, `${code}-manuscript.md`, 'text/markdown')
  }

  const artifacts: Artifact[] = [
    { id: 'ARTIFACT_01', type: 'prisma_flow', source: { label: 'prisma', to: '/prisma' }, formats: ['SVG', 'PNG', 'PDF'],
      state: identified + r.prisma.screened > 0 ? 'ready' : 'empty', note: identified + r.prisma.screened > 0 ? `${identified} identified → ${r.prisma.included} included` : 'no PRISMA counts yet',
      figure: <PrismaFlow prisma={r.prisma} /> },
    { id: 'ARTIFACT_02', type: 'forest_plot', source: { label: analysisSource, to: '/meta' }, formats: ['SVG', 'PNG', 'PDF'],
      state: meta.k >= 2 ? 'ready' : 'blocked', note: meta.k >= 2 ? `${r.effect}, k = ${meta.k}, ${r.model}-effects` : `needs ≥ 2 studies with outcome data (k = ${meta.k})`,
      figure: meta.k >= 2 ? <ForestPlot result={meta} index={r.indexLabel} comparator={r.comparatorLabel} measure={r.effect} /> : undefined },
    { id: 'ARTIFACT_03', type: 'funnel_plot', source: { label: analysisSource, to: '/meta' }, formats: ['SVG', 'PNG', 'PDF'],
      state: meta.k >= 3 ? 'ready' : 'blocked', note: meta.k >= 3 ? `contour-enhanced, trim-and-fill (k₀ = ${tf.k0})` : `needs ≥ 3 pooled studies (k = ${meta.k})`,
      figure: meta.k >= 3 ? <FunnelPlot result={meta} imputed={tf.imputed} adjustedPool={tf.adjustedPool} /> : undefined },
    { id: 'ARTIFACT_04', type: 'rob_figure', source: { label: 'risk_of_bias', to: '/rob' }, formats: ['SVG', 'PNG', 'PDF'],
      state: r.robDomains.length && assessed ? 'ready' : r.robDomains.length ? 'empty' : 'blocked', note: !r.robDomains.length ? 'no appraisal domains defined' : assessed ? `${r.robTool || 'custom tool'} · ${incl.length} studies` : 'no judgements yet',
      figure: r.robDomains.length && assessed ? <RobFigure studies={r.studies} domains={r.robDomains} tool={r.robTool} /> : undefined },
    { id: 'ARTIFACT_05', type: 'extraction_table', source: { label: 'extraction', to: '/studies' }, formats: ['CSV'],
      state: r.studies.length ? 'ready' : 'empty', note: r.studies.length ? `${r.studies.length} studies · re-imports as-is` : '0 studies',
      files: [{ label: 'export CSV', run: () => downloadText(extractionCsv(r), `${code}-extraction.csv`, 'text/csv') }] },
    { id: 'ARTIFACT_06', type: 'search_strategy', source: { label: 'protocol', to: '/protocol' }, formats: ['TXT'],
      state: r.searches.length ? 'ready' : 'empty', note: r.searches.length ? `${r.searches.length} database string${r.searches.length === 1 ? '' : 's'}` : 'no search strings recorded',
      files: [{ label: 'export TXT', run: () => downloadText(r.searches.map((s) => `# ${s.db}\n${s.query}\n`).join('\n'), `${code}-search-strategy.txt`, 'text/plain') }] },
    { id: 'ARTIFACT_07', type: 'manuscript', source: { label: 'manuscript', to: '/manuscript' }, formats: ['MD', 'HTML'],
      state: r.question.trim() || r.title.trim() ? 'ready' : 'empty', note: 'compiled from current data · HTML with figures exports from the manuscript module',
      files: [{ label: 'export MD', run: compileMd }] },
    { id: 'ARTIFACT_08', type: 'references', source: { label: 'references', to: '/references' }, formats: ['BIB', 'RIS'],
      state: refs.length ? 'ready' : 'empty', note: refs.length ? `${refs.length} references, merged by PMID / DOI` : '0 references',
      files: [
        { label: 'export .bib', run: () => downloadText(toBibtex(refs), `${code}.bib`, 'application/x-bibtex') },
        { label: 'export .ris', run: () => downloadText(toRis(refs), `${code}.ris`, 'application/x-research-info-systems') },
      ] },
    { id: 'ARTIFACT_09', type: 'project_state', source: { label: 'project', to: '/' }, formats: ['JSON'],
      state: 'ready', note: 'the whole project — re-imports on the overview',
      files: [{ label: 'export JSON', run: () => downloadText(exportActive(), exportName(state.project.code), 'application/json') }] },
  ]

  const [params] = useSearchParams()
  const [selId, setSelId] = useState(() => params.get('a') ?? artifacts[0].id)
  const sel = artifacts.find((a) => a.id === selId) ?? artifacts[0]
  const figRef = useRef<HTMLDivElement>(null)
  const svg = () => figRef.current?.querySelector('svg') as SVGSVGElement | null
  const fileStem = `${code}-${sel.type.replace(/_/g, '-')}`

  return (
    <>
      <div className="page-head">
        <Kicker>output / artifacts</Kicker>
        <h1>Artifacts</h1>
        <p>The project's outputs as files. Each is generated from the current data when you export it; the registry says where it comes from and whether it can be produced yet.</p>
      </div>

      <div className="art-grid">
        <div className="tbl-scroll">
          <table aria-label="Artifacts">
            <thead><tr><th>id</th><th>type</th><th>source</th><th>format</th><th>state</th></tr></thead>
            <tbody>
              {artifacts.map((a) => (
                <tr key={a.id} className={a.id === sel.id ? 'sel' : ''} tabIndex={0} aria-selected={a.id === sel.id} style={{ cursor: 'pointer' }}
                  onClick={() => setSelId(a.id)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelId(a.id) } }}>
                  <td className="mono muted">{a.id}</td>
                  <td className="mono">{a.type}</td>
                  <td className="mono muted">{a.source.label}</td>
                  <td className="mono muted">{a.formats.join(' · ')}</td>
                  <td><Tag tone={STATE_TONE[a.state]}>{a.state}</Tag></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="card art-inspector">
          <div className="card-h">{sel.id} <span className="spacer" /><Tag tone={STATE_TONE[sel.state]}>{sel.state}</Tag></div>
          <MetaGrid className="wide" rows={[
            ['type', <span className="mono">{sel.type}</span>],
            ['source', <Link className="mono" to={sel.source.to}>{sel.source.label}</Link>],
            ['format', <span className="mono">{sel.formats.join(' · ')}</span>],
            ['generated', <span className="mono">on export, from current data</span>],
            ['note', sel.note],
          ]} />
          {sel.figure ? (
            <>
              <div className="insp-sec">preview</div>
              <div className="art-preview theme-light" ref={figRef}>{sel.figure}</div>
              <div className="wrap-gap" style={{ marginTop: 10 }}>
                <button className="btn primary sm" onClick={() => { const s = svg(); if (s) exportSvgFile(s, fileStem) }}>export SVG</button>
                <button className="btn ghost sm" onClick={() => { const s = svg(); if (s) exportPngFile(s, fileStem) }}>PNG</button>
                <button className="btn ghost sm" onClick={() => { const s = svg(); if (s) exportPdfFile(s, fileStem) }}>PDF</button>
              </div>
            </>
          ) : sel.files ? (
            <div className="wrap-gap" style={{ marginTop: 12 }}>
              {sel.files.map((f, i) => <button key={f.label} className={`btn sm ${i === 0 ? 'primary' : 'ghost'}`} onClick={f.run} disabled={sel.state !== 'ready'}>{f.label}</button>)}
            </div>
          ) : (
            <div style={{ marginTop: 12 }}><Empty path={`${sel.type}:`}>{sel.note}</Empty><Link className="go" to={sel.source.to}>open {sel.source.label} →</Link></div>
          )}
        </div>
      </div>
    </>
  )
}
