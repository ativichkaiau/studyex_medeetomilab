import { useMemo, useRef, useState } from 'react'
import { useStore } from '../lib/store'
import { Kicker, Rule } from '../components/ui'
import { ForestPlot, FunnelPlot, PrismaFlow } from '../components/srmaPlots'
import { computeMeta, eggersTest, computeGrade, trimAndFill, measureInfo, fmt } from '../lib/metaAnalysis'
import { collectReferences, vancouver } from '../lib/references'
import { POSTER_CSS, SLIDES_CSS, posterDoc, slidesDoc } from '../lib/dissemination'

function download(content: string, name: string, type: string) {
  const blob = new Blob([content], { type })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  URL.revokeObjectURL(url)
}
const CERT: Record<string, string> = { High: 'var(--success)', Moderate: 'var(--accent)', Low: 'var(--warning)', 'Very low': 'var(--danger)' }

export default function Poster() {
  const { state } = useStore()
  const r = state.review
  const meta = useMemo(() => computeMeta(r.studies, r.model, r.effect), [r.studies, r.model, r.effect])
  const egger = useMemo(() => eggersTest(r.studies, r.effect), [r.studies, r.effect])
  const tf = useMemo(() => trimAndFill(r.studies, r.model, r.effect), [r.studies, r.model, r.effect])
  const grade = useMemo(() => computeGrade(r, meta, egger), [r, meta, egger])
  const refs = useMemo(() => collectReferences(state).slice(0, 6), [state])
  const totalN = meta.rows.reduce((a, x) => a + x.expTotal + x.ctrlTotal, 0)
  const sig = meta.k > 0 && (meta.pooledLow > meta.refValue || meta.pooledHigh < meta.refValue)
  const binary = measureInfo(r.effect).binary

  const [mode, setMode] = useState<'poster' | 'slides'>('poster')
  const posterRef = useRef<HTMLDivElement>(null)
  const deckRef = useRef<HTMLDivElement>(null)
  const slug = (state.project.code || 'review').toLowerCase()
  const authors = `${state.project.name} · ${state.project.code}`

  const conclusion = meta.k === 0
    ? 'Add included studies to populate the pooled result.'
    : `${r.indexLabel} ${sig ? 'was significantly associated with' : 'was not significantly associated with'} ${r.outcomeLabel.toLowerCase()} (pooled ${r.effect} ${fmt(meta.pooledEst)}, 95% CI ${fmt(meta.pooledLow)}–${fmt(meta.pooledHigh)}; ${grade.certainty} certainty). ${meta.I2 >= 50 ? 'Substantial heterogeneity warrants cautious interpretation.' : 'Heterogeneity was low to moderate.'}`

  function exportPoster() {
    if (posterRef.current) download(posterDoc(r.title, posterRef.current.outerHTML), `${slug}-poster.html`, 'text/html')
  }
  function exportSlides() {
    if (deckRef.current) download(slidesDoc(r.title, deckRef.current.innerHTML), `${slug}-slides.html`, 'text/html')
  }

  const stat = (v: string | number, l: string) => (
    <div className="s"><b>{v}</b><span>{l}</span></div>
  )

  return (
    <>
      <style>{POSTER_CSS + SLIDES_CSS}</style>
      <div className="page-head">
        <Rule />
        <div className="flex" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <Kicker>output / poster_slides</Kicker>
            <h1 style={{ marginTop: 12 }}>Poster &amp; slides</h1>
            <p>Export the review as a conference poster or printable slide deck, with the pooled estimate, forest plot, PRISMA and GRADE. Save the HTML and print it to PDF.</p>
          </div>
          <div className="row-actions" style={{ flex: 'none', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            <div className="seg">
              <button className={`seg-b${mode === 'poster' ? ' on' : ''}`} onClick={() => setMode('poster')}>Poster</button>
              <button className={`seg-b${mode === 'slides' ? ' on' : ''}`} onClick={() => setMode('slides')}>Slides</button>
            </div>
            {mode === 'poster'
              ? <button className="btn primary sm" onClick={exportPoster}>⤓ Poster HTML</button>
              : <button className="btn primary sm" onClick={exportSlides}>⤓ Slides HTML</button>}
          </div>
        </div>
      </div>

      {meta.k === 0 && <div className="err" style={{ background: 'var(--warn)', color: 'var(--warn-ink)', border: '1px solid color-mix(in srgb,var(--amber) 30%,var(--line))', marginBottom: 16 }}>No pooled studies yet — the results panels will be empty. Add studies on the Studies page.</div>}

      <div className="card lg" style={{ overflowX: 'auto', background: 'var(--bg-inset)' }}>
        {mode === 'poster' ? (
          <div className="poster" ref={posterRef}>
            <div className="poster-head">
              <div className="livery"><i className="r" /><i className="y" /></div>
              <span className="badge">Systematic review &amp; meta-analysis</span>
              <h1>{r.title}</h1>
              <div className="auth">{authors}</div>
            </div>
            <div className="poster-cols">
              {/* Column 1 */}
              <div>
                <div className="pblock">
                  <h2><span className="sq" style={{ background: 'var(--blue)' }} />Background &amp; objective</h2>
                  <p>{r.question}</p>
                </div>
                <div className="pblock">
                  <h2><span className="sq" style={{ background: 'var(--violet)' }} />PICO</h2>
                  <ul>
                    <li><b>Population:</b> {r.pico.p}</li>
                    <li><b>Index:</b> {r.pico.i}</li>
                    <li><b>Comparator:</b> {r.pico.c}</li>
                    <li><b>Outcome:</b> {r.pico.o}</li>
                  </ul>
                </div>
                <div className="pblock">
                  <h2><span className="sq" style={{ background: 'var(--green)' }} />Methods</h2>
                  <p className="small">Databases: {(r.databases || []).join(', ') || '—'}. {r.model}-effects inverse-variance pooling of {measureInfo(r.effect).label}.</p>
                  <div className="pill-row">
                    <span className="pill">{r.prisma.dbRecords + r.prisma.otherRecords} identified</span>
                    <span className="pill">{r.prisma.screened} screened</span>
                    <span className="pill">{r.prisma.included} included</span>
                  </div>
                  <figure><PrismaFlow prisma={r.prisma} /></figure>
                </div>
              </div>
              {/* Column 2 */}
              <div>
                <div className="pblock">
                  <h2><span className="sq" style={{ background: 'var(--red)' }} />Results</h2>
                  <div className="bigstat">
                    {stat(`${fmt(meta.pooledEst)}`, `Pooled ${r.effect}`)}
                    {stat(`${fmt(meta.I2, 0)}%`, 'I²')}
                    {stat(meta.k, 'Studies')}
                    {stat(binary ? totalN : totalN || meta.k, binary ? 'Patients' : 'Participants')}
                  </div>
                  <p className="small">Pooled {r.effect} <b>{fmt(meta.pooledEst)}</b> (95% CI {fmt(meta.pooledLow)}–{fmt(meta.pooledHigh)}){r.model === 'random' && meta.k >= 3 ? `; 95% PI ${fmt(meta.predLow)}–${fmt(meta.predHigh)}` : ''}.</p>
                  <figure><ForestPlot result={meta} index={r.indexLabel} comparator={r.comparatorLabel} measure={r.effect} /></figure>
                </div>
              </div>
              {/* Column 3 */}
              <div>
                <div className="pblock">
                  <h2><span className="sq" style={{ background: 'var(--navy)' }} />Publication bias</h2>
                  <p className="small">{egger ? <>Egger p = {fmt(egger.p, 3)}{egger.p < 0.05 ? ' (asymmetry)' : ' (no asymmetry)'}.</> : 'Needs ≥3 studies.'} {tf.k0 > 0 ? `Trim-and-fill imputed ${tf.k0}; adjusted ${fmt(tf.adjustedEst)}.` : 'Trim-and-fill imputed none.'}</p>
                  <figure><FunnelPlot result={meta} imputed={tf.imputed} adjustedPool={tf.adjustedPool} /></figure>
                </div>
                <div className="pblock">
                  <h2><span className="sq" style={{ background: CERT[grade.certainty] }} />Certainty (GRADE)</h2>
                  <p><b style={{ color: CERT[grade.certainty], fontSize: 18 }}>{grade.certainty}</b> certainty of evidence.</p>
                </div>
                <div className="pblock">
                  <h2><span className="sq" style={{ background: 'var(--red)' }} />Conclusions</h2>
                  <p>{conclusion}</p>
                </div>
                {refs.length > 0 && (
                  <div className="pblock">
                    <h2><span className="sq" style={{ background: 'var(--muted)' }} />Key references</h2>
                    <ol className="reflist">{refs.map((x, i) => <li key={x.id}>{vancouver(x, i + 1).replace(/^\d+\.\s/, '')}</li>)}</ol>
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="deck" ref={deckRef}>
            <section className="slide title">
              <div className="livery"><i className="n" /><i className="r" /><i className="y" /></div>
              <div className="kick">Systematic review &amp; meta-analysis</div>
              <h2>{r.title}</h2>
              <div className="auth">{authors}</div>
            </section>
            <section className="slide">
              <div className="livery"><i className="n" /><i className="r" /><i className="y" /></div>
              <div className="kick">Background</div>
              <h2>Objective</h2>
              <p>{r.question}</p>
              <ul>
                <li><b>Population:</b> {r.pico.p}</li>
                <li><b>Index vs comparator:</b> {r.pico.i} vs {r.pico.c}</li>
                <li><b>Outcome:</b> {r.pico.o}</li>
              </ul>
              <div className="foot"><span>{authors}</span><span>2 / 6</span></div>
            </section>
            <section className="slide">
              <div className="livery"><i className="n" /><i className="r" /><i className="y" /></div>
              <div className="kick">Methods</div>
              <h2>Search &amp; synthesis</h2>
              <div className="grow" style={{ alignItems: 'flex-start' }}>
                <div style={{ flex: 1 }}>
                  <ul>
                    <li>{(r.databases || []).join(', ') || '—'}</li>
                    <li>{r.model}-effects, {measureInfo(r.effect).label}</li>
                    <li>{r.prisma.included} studies from {r.prisma.dbRecords + r.prisma.otherRecords} records</li>
                  </ul>
                </div>
                <figure><PrismaFlow prisma={r.prisma} /></figure>
              </div>
              <div className="foot"><span>{authors}</span><span>3 / 6</span></div>
            </section>
            <section className="slide">
              <div className="livery"><i className="n" /><i className="r" /><i className="y" /></div>
              <div className="kick">Results</div>
              <h2>Pooled effect</h2>
              <div className="grow">
                <figure><ForestPlot result={meta} index={r.indexLabel} comparator={r.comparatorLabel} measure={r.effect} /></figure>
              </div>
              <div className="foot"><span>Pooled {r.effect} {fmt(meta.pooledEst)} [{fmt(meta.pooledLow)}, {fmt(meta.pooledHigh)}] · I² {fmt(meta.I2, 0)}%</span><span>4 / 6</span></div>
            </section>
            <section className="slide">
              <div className="livery"><i className="n" /><i className="r" /><i className="y" /></div>
              <div className="kick">Certainty</div>
              <h2>Heterogeneity, bias &amp; GRADE</h2>
              <div className="stats">
                <div className="s"><b>{fmt(meta.I2, 0)}%</b><span>I² heterogeneity</span></div>
                <div className="s"><b>{egger ? fmt(egger.p, 2) : '—'}</b><span>Egger p</span></div>
                <div className="s"><b style={{ color: CERT[grade.certainty] }}>{grade.certainty}</b><span>GRADE certainty</span></div>
              </div>
              <div className="foot"><span>{authors}</span><span>5 / 6</span></div>
            </section>
            <section className="slide">
              <div className="livery"><i className="n" /><i className="r" /><i className="y" /></div>
              <div className="kick">Conclusions</div>
              <h2>Take-home</h2>
              <p>{conclusion}</p>
              <div className="foot"><span>{authors}</span><span>6 / 6</span></div>
            </section>
          </div>
        )}
      </div>
      <p className="small muted" style={{ marginTop: 10 }}>The exported HTML is self-contained (figures are inline SVG). Open it and print to PDF — the poster is sized for A1 landscape; slides print 960×540 (16:9), one per page.</p>
    </>
  )
}
