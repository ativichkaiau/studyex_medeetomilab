import { useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useStore } from '../lib/store'
import { Kicker, MetaGrid, Tag, Empty } from '../components/ui'
import { analysisIncluded } from '../lib/cohorts'
import { studyId } from '../lib/ids'
import { datasetFingerprint, makeRun, runId } from '../lib/analysisRuns'
import { stamp } from '../lib/projectFacts'
import { openTerra, TERRA_TASKS } from '../lib/terra'
import { Markdown } from '../components/Markdown'
import { Sk } from '../components/Skeleton'
import { ForestPlot, FunnelPlot } from '../components/srmaPlots'
import { FigureFrame } from '../components/FigureFrame'
import { computeMeta, leaveOneOut, subgroupAnalysis, eggersTest, computeGrade, trimAndFill, cumulativeMeta, metaRegression, dataIntegrity, influenceDiagnostics, petPeese, beggsTest, absoluteEffect, measureInfo, MEASURES, fmt } from '../lib/metaAnalysis'
import { streamChat, hasKey, getModel, type ChatMessage } from '../lib/openai'
import type { Study, EffectMeasure } from '../types'

const GROUPINGS: Record<string, { label: string; key: (s: Study) => string }> = {
  period: { label: 'Publication period', key: (s) => (s.year < 2018 ? 'Before 2018' : '2018 onwards') },
  design: { label: 'Study design', key: (s) => s.design ?? '—' },
  robSel: { label: 'Selection risk of bias', key: (s) => (s.rob?.Selection === 'low' ? 'Low RoB' : 'Some / high RoB') },
  custom: { label: 'Custom subgroup', key: (s) => s.subgroup ?? '—' },
}
const MODERATORS: Record<string, { label: string; fn: (s: Study) => number | null }> = {
  year: { label: 'Publication year', fn: (s) => s.year || null },
  n: { label: 'Total sample size', fn: (s) => { const t = (s.expTotal ?? 0) + (s.ctrlTotal ?? 0) + (s.n1 ?? 0) + (s.n2 ?? 0); return t || null } },
  ctrlRate: { label: 'Control event rate', fn: (s) => (s.ctrlTotal ? (s.ctrlEvents ?? 0) / s.ctrlTotal : null) },
}
// carry white text in both themes
const CERT: Record<string, string> = { High: '#2f8a5c', Moderate: '#3b5ff0', Low: '#94650f', 'Very low': '#b23b3b' }

export default function MetaAnalysis() {
  const { state, updateReview } = useStore()
  const r = state.review
  const meta = useMemo(() => computeMeta(r.studies, r.model, r.effect), [r.studies, r.model, r.effect])
  const [groupBy, setGroupBy] = useState<keyof typeof GROUPINGS>('period')
  const sub = useMemo(() => subgroupAnalysis(r.studies, r.model, r.effect, GROUPINGS[groupBy].key), [r.studies, r.model, r.effect, groupBy])
  const loo = useMemo(() => leaveOneOut(r.studies, r.model, r.effect), [r.studies, r.model, r.effect])
  const egger = useMemo(() => eggersTest(r.studies, r.effect), [r.studies, r.effect])
  const influence = useMemo(() => influenceDiagnostics(r.studies, r.model, r.effect), [r.studies, r.model, r.effect])
  const pp = useMemo(() => petPeese(r.studies, r.effect), [r.studies, r.effect])
  const begg = useMemo(() => beggsTest(r.studies, r.effect), [r.studies, r.effect])
  const tf = useMemo(() => trimAndFill(r.studies, r.model, r.effect), [r.studies, r.model, r.effect])
  const grade = useMemo(() => computeGrade(r, meta, egger), [r, meta, egger])
  const cum = useMemo(() => cumulativeMeta(r.studies, r.model, r.effect), [r.studies, r.model, r.effect])
  const integrity = useMemo(() => dataIntegrity(r.studies, r.effect), [r.studies, r.effect])
  const [moderator, setModerator] = useState<keyof typeof MODERATORS>('year')
  const reg = useMemo(() => metaRegression(r.studies, r.model, r.effect, MODERATORS[moderator].fn), [r.studies, r.model, r.effect, moderator])
  const looRange = loo.length ? { min: Math.min(...loo.map((x) => x.est)), max: Math.max(...loo.map((x) => x.est)) } : null

  const binary = measureInfo(r.effect).binary
  const totalEvents = meta.rows.reduce((a, x) => a + x.expEvents + x.ctrlEvents, 0)
  const totalN = meta.rows.reduce((a, x) => a + x.expTotal + x.ctrlTotal, 0)
  const defaultCer = useMemo(() => {
    const e = meta.rows.reduce((a, x) => a + x.ctrlEvents, 0)
    const t = meta.rows.reduce((a, x) => a + x.ctrlTotal, 0)
    return t > 0 ? e / t : 0.2
  }, [meta])
  const [cer, setCer] = useState<number | null>(null)
  const cerVal = cer ?? defaultCer
  const abs = meta.k > 0 ? absoluteEffect(r.effect, meta.pooledEst, cerVal) : null
  const sig = meta.k > 0 && (meta.pooledLow > meta.refValue || meta.pooledHigh < meta.refValue)
  const setGrade = (patch: Record<string, string>) => updateReview({ grade: { design: r.grade?.design ?? 'observational', ...(r.grade || {}), ...patch } as typeof r.grade })

  const runs = r.runs ?? []
  const lastRun = runs[0]
  const fingerprint = useMemo(() => datasetFingerprint(r), [r])
  const unparsed = r.studies.filter(analysisIncluded).filter((x) => !meta.rows.some((row) => row.id === x.id))
  function logRun() {
    const run = makeRun(r)
    updateReview({ runs: [run, ...runs].slice(0, 50) }, { kind: 'analysis', text: `${runId(run.n)} ${run.status}: ${run.status === 'success' && run.pooled ? `${run.effect} ${fmt(run.pooled.est)} [${fmt(run.pooled.low)}, ${fmt(run.pooled.high)}], k = ${run.k}` : run.reason}` })
  }

  const [aiText, setAiText] = useState('')
  const [aiOn, setAiOn] = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  async function draft() {
    if (aiOn) return
    if (!hasKey()) { setAiText('_Terra is off — add an OpenAI key in Knowledge review → Settings._'); return }
    setAiText(''); setAiOn(true)
    const studies = meta.rows.map((x) => `${x.label}: ${r.effect} ${fmt(x.est)} [${fmt(x.low)}, ${fmt(x.high)}], weight ${fmt(x.weight, 1)}%`).join('; ')
    const messages: ChatMessage[] = [
      { role: 'system', content: 'You are a medical writer drafting the Results section of a systematic review & meta-analysis. Write one tight, publication-style paragraph in past tense with the pooled estimate, CI, heterogeneity (I², τ²), and a one-line interpretation. Use markdown. No preamble.' },
      { role: 'user', content: `Question: ${r.question}\nModel: ${r.model}-effects, ${r.effect}, ${r.indexLabel} vs ${r.comparatorLabel}, outcome ${r.outcomeLabel}.\nStudies (k=${meta.k}): ${studies}\nPooled ${r.effect} ${fmt(meta.pooledEst)} [${fmt(meta.pooledLow)}, ${fmt(meta.pooledHigh)}]${r.model === 'random' && meta.k >= 3 ? `; 95% prediction interval [${fmt(meta.predLow)}, ${fmt(meta.predHigh)}]` : ''}; Q=${fmt(meta.Q)}, df=${meta.df}, I²=${fmt(meta.I2, 0)}%, τ²=${fmt(meta.tau2, 3)}, p(het)=${fmt(meta.pValue, 3)}. GRADE certainty: ${grade.certainty}.` },
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
            <Kicker>pipeline / 06 statistics · compute</Kicker>
            <h1>Statistics</h1>
            <p><span className="mono">{r.indexLabel || 'index'} vs {r.comparatorLabel || 'comparator'} → {r.outcomeLabel || 'outcome'}</span>. Inverse-variance pooling with heterogeneity, subgroup, sensitivity, publication-bias and GRADE; computed live from <Link to="/studies">extraction</Link>, logged on demand.</p>
          </div>
          <div className="row-actions" style={{ flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            <select className="select" style={{ width: 175 }} value={r.effect} onChange={(e) => updateReview({ effect: e.target.value as EffectMeasure })} aria-label="Effect measure">
              {MEASURES.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
            </select>
            <div className="seg" role="group" aria-label="Model">
              <button className={`seg-b${r.model === 'random' ? ' on' : ''}`} aria-pressed={r.model === 'random'} onClick={() => updateReview({ model: 'random' })}>random</button>
              <button className={`seg-b${r.model === 'fixed' ? ' on' : ''}`} aria-pressed={r.model === 'fixed'} onClick={() => updateReview({ model: 'fixed' })}>fixed</button>
            </div>
            <button className="btn primary sm" onClick={logRun}>log run</button>
          </div>
        </div>
      </div>

      {meta.k < 2 && (
        <div className="fail-panel">
          <div className="fail-h mono">ANALYSIS_BLOCKED</div>
          <MetaGrid className="wide" rows={[
            ['reason', `insufficient studies with ${binary ? '2×2 event counts' : 'mean / SD / n'} for ${measureInfo(r.effect).label} (k = ${meta.k}, needs ≥ 2)`],
            ['affected studies', unparsed.length ? <span className="mono">{unparsed.map((x) => studyId(x.id)).join(' · ')}</span> : <span className="muted">no included studies yet</span>],
            ['action', 'inspect extraction'],
          ]} />
          <Link className="btn sm" to="/studies" style={{ marginTop: 10 }}>inspect extraction →</Link>
        </div>
      )}

      {integrity.length > 0 && (
        <div className="card" style={{ marginBottom: 12, borderLeft: `2px solid ${integrity.some((i) => i.level === 'error') ? 'var(--danger)' : 'var(--warning)'}` }}>
          <div className="card-h">data checks · {integrity.length} flag{integrity.length === 1 ? '' : 's'}</div>
          {integrity.slice(0, 8).map((i, idx) => (
            <div className="he-row" key={idx}>
              <Tag tone={i.level === 'error' ? 'bad' : 'warn'}>{i.level}</Tag>
              <span className="he-lab"><b>{i.study}</b> — {i.msg}</span>
            </div>
          ))}
          <p className="small" style={{ marginTop: 8 }}>Errors block a study from pooling correctly; warnings (zero cells, double-zeros) are handled automatically but worth reporting.</p>
        </div>
      )}

      <div className="stat-grid">
        <div className="card">
          <div className="card-h">analysis · {r.outcomeLabel || 'outcome'} <span className="spacer" />{meta.k >= 2 ? <Tag tone="ok">computed</Tag> : <Tag tone="warn">blocked</Tag>}</div>
          <MetaGrid className="wide" rows={[
            ['outcome', r.outcomeLabel || <span className="muted">—</span>],
            ['effect', <span className="mono">{r.effect} · {measureInfo(r.effect).label}</span>],
            ['model', <span className="mono">{r.model === 'random' ? 'random-effects (DerSimonian–Laird)' : 'fixed-effect (inverse variance)'}</span>],
            ['k', <span className="mono">{meta.k}{r.studies.length - meta.k > 0 ? <span className="muted"> · {r.studies.length - meta.k} not pooled</span> : null}</span>],
            ['pooled', <span className="mono"><b>{fmt(meta.pooledEst)}</b>{sig && meta.k >= 2 ? <span className="tone-info"> · significant</span> : null}</span>],
            ['95% CI', <span className="mono">[{fmt(meta.pooledLow)}, {fmt(meta.pooledHigh)}]</span>],
            ['prediction', r.model === 'random' && meta.k >= 3 ? <span className="mono">[{fmt(meta.predLow)}, {fmt(meta.predHigh)}]</span> : <span className="muted mono">—</span>],
            ['I²', <span className="mono">{fmt(meta.I2, 0)}%</span>],
            ['τ²', <span className="mono">{fmt(meta.tau2, 3)}</span>],
            ['Q', <span className="mono">{fmt(meta.Q)} · df {meta.df} · p {fmt(meta.pValue, 3)}</span>],
            [binary ? 'events' : 'participants', <span className="mono">{binary ? `${totalEvents} / ${totalN}` : totalN}</span>],
            ['dataset', <span className="mono">{fingerprint}{lastRun ? (lastRun.dataset === fingerprint ? <span className="tone-ok"> · matches {runId(lastRun.n)}</span> : <span className="tone-warn"> · changed since {runId(lastRun.n)}</span>) : <span className="muted"> · no run logged</span>}</span>],
          ]} />
          <div className="wrap-gap" style={{ marginTop: 10 }}>
            {TERRA_TASKS.statistics.map((t) => <button key={t.label} className="go" onClick={() => openTerra({ prompt: t.prompt })}>terra · {t.label} →</button>)}
          </div>
        </div>
        <div className="card">
          <div className="card-h">analysis log <span className="spacer" /><span style={{ textTransform: 'none', letterSpacing: 0 }}>{runs.length} run{runs.length === 1 ? '' : 's'}</span></div>
          {runs.length === 0 ? <Empty path="analysis:">no runs — <button className="go" onClick={logRun}>log the current analysis →</button></Empty> : (
            <div className="run-list">
              {runs.slice(0, 8).map((run) => (
                <details key={run.id} className="run">
                  <summary>
                    <span className="mono">{runId(run.n)}</span>
                    <span className="mono muted">{stamp(run.ts)}</span>
                    <span className="mono run-res">{run.status === 'success' && run.pooled ? `${run.effect} ${fmt(run.pooled.est)} [${fmt(run.pooled.low)}, ${fmt(run.pooled.high)}]` : run.reason}</span>
                    <Tag tone={run.status === 'success' ? 'ok' : 'bad'}>{run.status}</Tag>
                  </summary>
                  <MetaGrid rows={[
                    ['outcome', run.outcome],
                    ['dataset', <span className="mono">{run.dataset}{run.dataset === fingerprint ? ' · current' : ''}</span>],
                    ['model', <span className="mono">{run.model}-effect{run.model === 'random' ? 's' : ''} · {run.effect}</span>],
                    ['k', <span className="mono">{run.k}</span>],
                    ...(run.het ? [['heterogeneity', <span className="mono">I² {fmt(run.het.I2, 0)}% · τ² {fmt(run.het.tau2, 3)} · Q {fmt(run.het.Q)} (df {run.het.df}, p {fmt(run.het.p, 3)})</span>] as [string, JSX.Element]] : []),
                    ['studies', <span className="mono">{run.studies.map(studyId).join(' · ') || '—'}</span>],
                  ]} />
                </details>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="card lg" style={{ marginBottom: 16 }}>
        <div className="card-h"><span className="sq" style={{ background: 'var(--accent, var(--blue))' }} />FOREST PLOT · {measureInfo(r.effect).label}</div>
        <FigureFrame name="forest-plot">
          <ForestPlot result={meta} index={r.indexLabel} comparator={r.comparatorLabel} measure={r.effect} />
        </FigureFrame>
      </div>

      <div className="grid g2">
        <div className="card lg">
          <div className="card-h"><span className="sq" style={{ background: 'var(--amber)' }} />HETEROGENEITY</div>
          <div className="kv"><span className="k">Pooled {r.effect}</span><span className="val"><b>{fmt(meta.pooledEst)}</b> [{fmt(meta.pooledLow)}, {fmt(meta.pooledHigh)}] · {r.model}-effects</span></div>
          {r.model === 'random' && meta.k >= 3 && <div className="kv"><span className="k">95% prediction</span><span className="val">[<b>{fmt(meta.predLow)}</b>, <b>{fmt(meta.predHigh)}</b>] — where a future study's true effect is expected</span></div>}
          <div className="kv"><span className="k">Cochran's Q</span><span className="val">{fmt(meta.Q)} (df = {meta.df}), p = {fmt(meta.pValue, 3)}</span></div>
          <div className="kv"><span className="k">I²</span><span className="val">{fmt(meta.I2, 0)}% — {meta.I2 < 25 ? 'low' : meta.I2 < 60 ? 'moderate' : 'substantial'} heterogeneity</span></div>
          <div className="kv"><span className="k">τ²</span><span className="val">{fmt(meta.tau2, 3)}</span></div>
          <div className="divider" />
          <p className="small">{sig ? <>The effect is <b style={{ color: 'var(--red)' }}>statistically significant</b> (CI excludes {meta.refValue}).</> : <>The pooled estimate is <b>not significant</b> (CI crosses {meta.refValue}).</>}</p>
        </div>
        <div className="card lg">
          <div className="card-h"><span className="sq" style={{ background: 'var(--navy)' }} />FUNNEL PLOT · contour-enhanced + trim-and-fill</div>
          <FigureFrame name="funnel-plot">
            <FunnelPlot result={meta} imputed={tf.imputed} adjustedPool={tf.adjustedPool} />
          </FigureFrame>
          <p className="small" style={{ marginTop: 8 }}>
            {tf.k0 > 0 ? <>Trim-and-fill imputed <b>{tf.k0}</b> potentially missing stud{tf.k0 > 1 ? 'ies' : 'y'} on the <b>{tf.fillSide}</b>; adjusted {r.effect} <b style={{ color: 'var(--green)' }}>{fmt(tf.adjustedEst)}</b> [{fmt(tf.adjustedLow)}, {fmt(tf.adjustedHigh)}] vs observed {fmt(tf.origEst)}. Studies in the shaded bands are statistically significant.</> : <>Trim-and-fill imputed <b>no</b> missing studies — the funnel is symmetric. Studies in the shaded bands are statistically significant.</>}
          </p>
        </div>
      </div>

      <div className="card lg" style={{ marginTop: 16 }}>
        <div className="card-h" style={{ justifyContent: 'space-between' }}>
          <span><span className="sq" style={{ background: 'var(--violet)' }} />SUBGROUP ANALYSIS</span>
          <select className="select" style={{ width: 210 }} value={groupBy} onChange={(e) => setGroupBy(e.target.value as keyof typeof GROUPINGS)}>
            {Object.entries(GROUPINGS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </div>
        <div className="tbl-scroll" style={{ border: 'none' }}>
          <table>
            <thead><tr><th>Subgroup</th><th>k</th><th>Pooled {r.effect} [95% CI]</th><th>I²</th></tr></thead>
            <tbody>{sub.groups.map((g) => <tr key={g.name}><td><b>{g.name}</b></td><td className="mono">{g.k}</td><td className="mono">{fmt(g.est)} [{fmt(g.low)}, {fmt(g.high)}]</td><td className="mono">{fmt(g.I2, 0)}%</td></tr>)}</tbody>
          </table>
        </div>
        <p className="small" style={{ marginTop: 10 }}>Test for subgroup differences: Q<sub>between</sub> = {fmt(sub.Qbetween)} (df = {sub.dfBetween}), <b>p = {fmt(sub.pBetween, 3)}</b> — {sub.pBetween < 0.05 ? 'subgroups differ significantly' : 'no significant difference between subgroups'}.</p>
      </div>

      <div className="grid g2" style={{ marginTop: 16 }}>
        <div className="card lg">
          <div className="card-h"><span className="sq" style={{ background: 'var(--amber)' }} />SENSITIVITY · LEAVE-ONE-OUT</div>
          {loo.length === 0 ? <p className="empty">Needs ≥3 pooled studies.</p> : (
            <>
              <div className="tbl-scroll" style={{ border: 'none' }}>
                <table><thead><tr><th>Omitting</th><th>Pooled {r.effect} [95% CI]</th></tr></thead><tbody>{loo.map((x) => <tr key={x.excluded}><td>{x.excluded}</td><td className="mono">{fmt(x.est)} [{fmt(x.low)}, {fmt(x.high)}]</td></tr>)}</tbody></table>
              </div>
              {looRange && <p className="small" style={{ marginTop: 10 }}>Pooled {r.effect} ranges <b>{fmt(looRange.min)}–{fmt(looRange.max)}</b> across omissions — {(looRange.min > meta.refValue) === (looRange.max > meta.refValue) ? 'the direction is robust to any single study' : 'the conclusion is sensitive to individual studies'}.</p>}
            </>
          )}
        </div>
        <div className="card lg">
          <div className="card-h"><span className="sq" style={{ background: 'var(--navy)' }} />PUBLICATION BIAS · SMALL-STUDY EFFECTS</div>
          {!egger ? <p className="empty">Needs ≥3 pooled studies.</p> : (
            <>
              <div className="kv"><span className="k">Egger's test</span><span className="val">intercept {fmt(egger.intercept)}, t = {fmt(egger.t)}, <b style={{ color: egger.p < 0.05 ? 'var(--red)' : 'var(--ink)' }}>p = {fmt(egger.p, 3)}</b></span></div>
              {begg && <div className="kv"><span className="k">Begg's rank test</span><span className="val">τ = {fmt(begg.tau, 3)}, z = {fmt(begg.z)}, <b style={{ color: begg.p < 0.05 ? 'var(--red)' : 'var(--ink)' }}>p = {fmt(begg.p, 3)}</b></span></div>}
              {pp && <div className="kv"><span className="k">PET-PEESE ({pp.method})</span><span className="val">bias-adjusted {r.effect} <b style={{ color: 'var(--green)' }}>{fmt(pp.corrected)}</b> [{fmt(pp.correctedLow)}, {fmt(pp.correctedHigh)}]</span></div>}
              <div className="divider" />
              <p className="small">{egger.p < 0.05 || (begg && begg.p < 0.05) ? <>Evidence of <b>small-study effects</b>{pp && <> — PET-PEESE re-estimates the effect at <b>{fmt(pp.corrected)}</b> vs observed {fmt(meta.pooledEst)}</>}.</> : <>No significant funnel asymmetry.</>} All underpowered with &lt; 10 studies — read with the funnel plot.</p>
            </>
          )}
        </div>
      </div>

      {influence.length >= 3 && (() => {
        const maxQ = Math.max(...influence.map((x) => x.qContrib)) || 1
        const maxI = Math.max(...influence.map((x) => x.influence)) || 1
        const topInf = [...influence].sort((a, b) => b.influence - a.influence)[0]
        const topQ = [...influence].sort((a, b) => b.qContrib - a.qContrib)[0]
        const BW = 460, BH = 240, bx0 = 44, bx1 = BW - 14, by0 = 14, by1 = BH - 30
        const BX = (q: number) => bx0 + (q / maxQ) * (bx1 - bx0)
        const BY = (inf: number) => by1 - (inf / maxI) * (by1 - by0)
        return (
          <div className="card lg" style={{ marginTop: 16 }}>
            <div className="card-h"><span className="sq" style={{ background: 'var(--red)' }} />INFLUENCE · BAUJAT PLOT</div>
            <div className="grid g2" style={{ alignItems: 'start' }}>
              <svg viewBox={`0 0 ${BW} ${BH}`} width="100%" style={{ display: 'block' }}>
                <line x1={bx0} y1={by1} x2={bx1} y2={by1} stroke="var(--line)" strokeWidth={1} />
                <line x1={bx0} y1={by0} x2={bx0} y2={by1} stroke="var(--line)" strokeWidth={1} />
                {influence.map((x) => {
                  const hot = x.id === topInf.id || x.id === topQ.id
                  return (
                    <g key={x.id}>
                      <circle cx={BX(x.qContrib)} cy={BY(x.influence)} r={hot ? 5.5 : 4} fill={hot ? 'var(--red)' : 'var(--navy)'} opacity={0.75} />
                      {hot && <text x={BX(x.qContrib)} y={BY(x.influence) - 8} textAnchor="middle" fontSize="9" fill="var(--red)" fontFamily="var(--mono)">{x.label}</text>}
                    </g>
                  )
                })}
                <text x={4} y={by0 + 4} fontSize="8.5" fill="var(--muted)" fontFamily="var(--mono)">influence ↑</text>
                <text x={BW / 2} y={BH - 4} textAnchor="middle" fontSize="9" fill="var(--muted)" fontFamily="var(--mono)">contribution to heterogeneity (Q) →</text>
              </svg>
              <div className="tbl-scroll" style={{ border: 'none' }}>
                <table>
                  <thead><tr><th>Study</th><th>Q contrib.</th><th>Influence</th><th>{r.effect} omitting</th></tr></thead>
                  <tbody>
                    {[...influence].sort((a, b) => b.influence - a.influence).map((x) => (
                      <tr key={x.id}><td>{x.label}</td><td className="mono">{fmt(x.qContrib)}</td><td className="mono" style={x.id === topInf.id ? { color: 'var(--red)', fontWeight: 700 } : undefined}>{fmt(x.influence)}</td><td className="mono">{fmt(x.estOmit)}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <p className="small" style={{ marginTop: 10 }}><b style={{ color: 'var(--red)' }}>{topInf.label}</b> most influences the pooled estimate (omitting it → {r.effect} {fmt(topInf.estOmit)} vs {fmt(meta.pooledEst)}); <b>{topQ.label}</b> contributes most to heterogeneity. Points to the top-right drive both — worth a sensitivity check.</p>
          </div>
        )
      })()}

      <div className="grid g2" style={{ marginTop: 16 }}>
        <div className="card lg">
          <div className="card-h"><span className="sq" style={{ background: 'var(--violet)' }} />CUMULATIVE · CHRONOLOGICAL</div>
          {cum.length < 2 ? <p className="empty">Needs ≥2 pooled studies with years.</p> : (
            <>
              <div className="tbl-scroll" style={{ border: 'none' }}>
                <table><thead><tr><th>Through</th><th>k</th><th>Pooled {r.effect} [95% CI]</th></tr></thead>
                  <tbody>{cum.map((x, i) => <tr key={i}><td>{x.label}</td><td className="mono">{x.k}</td><td className="mono">{fmt(x.est)} [{fmt(x.low)}, {fmt(x.high)}]</td></tr>)}</tbody>
                </table>
              </div>
              {(() => {
                const first = cum.findIndex((x) => (x.low > meta.refValue) === (meta.pooledEst > meta.refValue) && (x.low > meta.refValue || x.high < meta.refValue))
                return <p className="small" style={{ marginTop: 10 }}>{first >= 0 ? <>The evidence first reached significance in the current direction at <b>{cum[first].label.replace('+ ', '')}</b> and has held since.</> : <>The pooled estimate has not yet reached significance as studies accumulate.</>}</p>
              })()}
            </>
          )}
        </div>
        <div className="card lg">
          <div className="card-h" style={{ justifyContent: 'space-between' }}>
            <span><span className="sq" style={{ background: 'var(--navy)' }} />META-REGRESSION</span>
            <select className="select" style={{ width: 190 }} value={moderator} onChange={(e) => setModerator(e.target.value as keyof typeof MODERATORS)}>
              {Object.entries(MODERATORS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </div>
          {!reg ? <p className="empty">Needs ≥3 pooled studies with a value for this moderator.</p> : (() => {
            const RW = 320, RH = 200, px0 = 42, px1 = RW - 12, py0 = 12, py1 = RH - 30
            const line = [reg.xMin, reg.xMax].map((x) => ({ x, y: reg.intercept + reg.slope * x }))
            const ys = [...reg.points.map((p) => p.y), ...line.map((l) => l.y)]
            let yLo = Math.min(...ys), yHi = Math.max(...ys)
            const yp = (yHi - yLo) * 0.12 || 0.3; yLo -= yp; yHi += yp
            const xp = (reg.xMax - reg.xMin) * 0.06 || 1
            const X = (x: number) => px0 + ((x - (reg.xMin - xp)) / ((reg.xMax + xp) - (reg.xMin - xp))) * (px1 - px0)
            const Y = (y: number) => py1 - ((y - yLo) / (yHi - yLo)) * (py1 - py0)
            const isLog = reg.scale === 'log'
            const yref = isLog ? 0 : meta.refValue
            return (
              <>
                <svg viewBox={`0 0 ${RW} ${RH}`} width="100%" style={{ display: 'block' }}>
                  {yref >= yLo && yref <= yHi && <line x1={px0} y1={Y(yref)} x2={px1} y2={Y(yref)} stroke="var(--muted)" strokeWidth={1} strokeDasharray="4 4" />}
                  <line x1={X(line[0].x)} y1={Y(line[0].y)} x2={X(line[1].x)} y2={Y(line[1].y)} stroke="var(--red)" strokeWidth={2} />
                  {reg.points.map((p, i) => <circle key={i} cx={X(p.x)} cy={Y(p.y)} r={Math.max(3, Math.min(8, 3 + 1.6 / (p.se + 0.25)))} fill="var(--navy)" opacity={0.62} />)}
                  <text x={4} y={py0 + 4} fontSize="8.5" fill="var(--muted)" fontFamily="var(--mono)">{isLog ? `log(${r.effect})` : r.effect}</text>
                  <text x={RW / 2} y={RH - 4} textAnchor="middle" fontSize="9" fill="var(--muted)" fontFamily="var(--mono)">{MODERATORS[moderator].label} →</text>
                </svg>
                <p className="small" style={{ marginTop: 6 }}>
                  Slope <b>{fmt(reg.slope, 4)}</b> per unit (SE {fmt(reg.seSlope, 4)}), <b style={{ color: reg.p < 0.05 ? 'var(--red)' : 'var(--ink)' }}>p = {fmt(reg.p, 3)}</b>{isLog && (() => { const m = Math.exp(reg.slope); return <> → ×{m < 0.001 || m > 1000 ? m.toExponential(1) : fmt(m, 3)} on {r.effect} per unit</> })()}. {reg.p < 0.05 ? <>The moderator <b>significantly</b> explains part of the between-study variation.</> : <>No significant moderation — the effect looks stable across this moderator.</>}
                </p>
              </>
            )
          })()}
        </div>
      </div>

      <div className="card lg" style={{ marginTop: 16, borderLeft: `4px solid ${CERT[grade.certainty]}` }}>
        <div className="card-h" style={{ justifyContent: 'space-between' }}>
          <span><span className="sq" style={{ background: CERT[grade.certainty] }} />GRADE · CERTAINTY OF EVIDENCE</span>
          <select className="select" style={{ width: 200 }} value={r.grade?.design ?? 'observational'} onChange={(e) => setGrade({ design: e.target.value })}>
            <option value="observational">Observational studies</option>
            <option value="rct">Randomised trials</option>
          </select>
        </div>
        <div className="flex" style={{ gap: 14, alignItems: 'center', margin: '4px 0 12px' }}>
          <span className="grade-badge" style={{ background: CERT[grade.certainty] }}>⊕ {grade.certainty}</span>
          <span className="small">Outcome: <b>{r.outcomeLabel}</b> · {grade.startLabel}</span>
        </div>
        <div className="tbl-scroll" style={{ border: 'none' }}>
          <table>
            <thead><tr><th>Domain</th><th>Judgment</th><th>Δ certainty</th></tr></thead>
            <tbody>
              {grade.domains.map((d) => {
                const opts = d.key === 'pubBias' ? ['undetected', 'serious'] : ['not serious', 'serious', 'very serious']
                return (
                  <tr key={d.key}>
                    <td><b>{d.label}</b></td>
                    <td><select className="select" style={{ minWidth: 150 }} value={d.judgment} onChange={(e) => setGrade({ [d.key]: e.target.value })}>{opts.map((o) => <option key={o} value={o}>{o}</option>)}</select> {d.judgment !== d.auto && <span className="small">(auto: {d.auto})</span>}</td>
                    <td className="mono">{d.drop ? `−${d.drop}` : '0'}</td>
                  </tr>
                )
              })}
              {(r.grade?.design ?? 'observational') !== 'rct' && (
                <tr>
                  <td><b>Large effect (upgrade)</b></td>
                  <td><select className="select" style={{ minWidth: 150 }} value={grade.upgradeLabel} onChange={(e) => setGrade({ largeEffect: e.target.value })}><option value="none">none</option><option value="large">large</option><option value="very large">very large</option></select></td>
                  <td className="mono">{grade.upgrade ? `+${grade.upgrade}` : '0'}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {abs && (
          <>
            <div className="divider" />
            <div className="card-h" style={{ fontSize: 10 }}>ABSOLUTE EFFECTS (per 1000)</div>
            <div className="kv" style={{ alignItems: 'center' }}>
              <span className="k">Assumed risk</span>
              <span className="val">
                <input className="input" style={{ width: 66, display: 'inline-block', padding: '4px 8px' }} type="number" min="0" max="99" value={Math.round(cerVal * 100)} onChange={(e) => setCer(Math.min(0.99, Math.max(0.01, +e.target.value / 100)))} />% in <b>{r.comparatorLabel}</b> <span className="small muted">(default = pooled comparator rate)</span>
              </span>
            </div>
            <div className="kv"><span className="k">Corresponding risk</span><span className="val"><b>{Math.round(abs.eer * 1000)}</b> per 1000 in {r.indexLabel} vs {Math.round(abs.cer * 1000)} per 1000 in {r.comparatorLabel}</span></div>
            <div className="kv"><span className="k">Risk difference</span><span className="val"><b style={{ color: abs.ard > 0 ? 'var(--red)' : 'var(--green)' }}>{abs.per1000 > 0 ? '+' : ''}{abs.per1000} per 1000</b> · NNT{abs.ard > 0 ? 'H' : 'B'} = <b>{Number.isFinite(abs.nnt) ? Math.ceil(abs.nnt) : '∞'}</b></span></div>
          </>
        )}
        <p className="small" style={{ marginTop: 10 }}>Summary of findings: {meta.k} studies, {binary ? `${totalEvents} events / ` : ''}{totalN} participants; pooled {r.effect} {fmt(meta.pooledEst)} [{fmt(meta.pooledLow)}, {fmt(meta.pooledHigh)}]{abs ? `; NNT ${Number.isFinite(abs.nnt) ? Math.ceil(abs.nnt) : '∞'} at ${Math.round(cerVal * 100)}% baseline risk` : ''}; <b style={{ color: CERT[grade.certainty] }}>{grade.certainty}</b> certainty of evidence.</p>
      </div>

      <div className="card lg rail" style={{ marginTop: 16 }}>
        <div className="card-h" style={{ justifyContent: 'space-between' }}>
          <span>results paragraph · terra draft</span>
          {aiOn ? <button className="icon-btn" onClick={() => abortRef.current?.abort()}>stop</button> : <button className="btn primary sm" onClick={draft}>draft →</button>}
        </div>
        {aiText ? <Markdown text={aiText} /> : aiOn ? <Sk kind="results" /> : <p className="small">Terra drafts a publication-style results paragraph from the pooled estimate, heterogeneity and GRADE — one call on your OpenAI key; verify every number against the analysis above.</p>}
      </div>
    </>
  )
}
