import { useMemo } from 'react'
import { useStore } from '../lib/store'
import { Kicker, Rule, StatCard } from '../components/ui'
import { FigureFrame } from '../components/FigureFrame'
import { diagnosticMeta, dxUsable, type DxRow } from '../lib/diagnosticMeta'
import { fmt } from '../lib/metaAnalysis'
import type { DiagnosticStudy } from '../types'

const newId = () => `dx_${Math.random().toString(36).slice(2, 9)}`
const pct = (p: number) => `${(p * 100).toFixed(0)}%`

export default function DiagnosticMA() {
  const { state, updateReview } = useStore()
  const r = state.review
  const dx = useMemo(() => r.dxStudies ?? [], [r.dxStudies])
  const res = useMemo(() => diagnosticMeta(dx), [dx])

  const setDx = (list: DiagnosticStudy[]) => updateReview({ dxStudies: list })
  const patchDx = (id: string, patch: Partial<DiagnosticStudy>) => setDx(dx.map((s) => (s.id === id ? { ...s, ...patch } : s)))
  const addDx = () => setDx([...dx, { id: newId(), author: '', year: new Date().getFullYear(), test: '', include: false }])
  const removeDx = (id: string) => setDx(dx.filter((s) => s.id !== id))
  const num = (v: string) => (v === '' ? undefined : Math.max(0, Math.round(+v)))

  return (
    <>
      <div className="page-head">
        <Rule />
        <div className="flex" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <Kicker>pipeline / 06 statistics / diagnostic · compute</Kicker>
            <h1 style={{ marginTop: 12 }}>Diagnostic meta-analysis</h1>
            <p>Pooled sensitivity and specificity of an index test against a reference standard, with a Moses–Littenberg summary ROC.</p>
          </div>
          <div className="row-actions" style={{ flex: 'none' }}>
            <button className="btn primary sm" onClick={addDx}>＋ Add 2×2</button>
          </div>
        </div>
      </div>

      {!res ? (
        <div className="card note">
          <div className="card-h"><span className="sq" style={{ background: 'var(--amber)' }} />NEEDS ≥ 2 STUDIES</div>
            <p className="small">Add at least two diagnostic accuracy 2×2 tables (true/false positives and negatives), then include completed rows. A new row starts blank and excluded from pooling.</p>
          <button className="btn primary sm" style={{ marginTop: 10 }} onClick={addDx}>＋ Add the first 2×2</button>
          {dx.length > 0 && <DxTable dx={dx} res={null} patchDx={patchDx} removeDx={removeDx} num={num} />}
        </div>
      ) : (
        <>
          <div className="grid g4" style={{ marginBottom: 16 }}>
            <StatCard value={pct(res.sens)} label="Pooled sensitivity" sub={`[${pct(res.sensLow)}, ${pct(res.sensHigh)}]`} tone="var(--research)" />
            <StatCard value={pct(res.spec)} label="Pooled specificity" sub={`[${pct(res.specLow)}, ${pct(res.specHigh)}]`} tone="var(--accent)" />
            <StatCard value={fmt(res.dor, 1)} label="Diagnostic OR" sub={`LR+ ${fmt(res.lrPos, 1)} · LR− ${fmt(res.lrNeg, 2)}`} tone="var(--violet)" />
            <StatCard value={res.sroc ? fmt(res.sroc.auc, 3) : '—'} label="SROC area (AUC)" sub={`${res.k} studies pooled`} tone="var(--danger)" />
          </div>

          <div className="grid g2">
            <div className="card lg">
              <div className="card-h"><span className="sq" style={{ background: 'var(--red)' }} />SUMMARY ROC · Moses–Littenberg</div>
              <FigureFrame name="sroc-plot">
                <SrocPlot res={res} />
              </FigureFrame>
              <p className="small" style={{ marginTop: 8 }}>
                Each hollow point is a study (area ∝ n); the <b style={{ color: 'var(--red)' }}>◆</b> is the pooled operating point with 95% CI cross-hairs. The curve is the fitted SROC{res.sroc ? <> (AUC <b>{fmt(res.sroc.auc, 3)}</b>)</> : null}. Top-left is a better test.
              </p>
            </div>
            <div className="card lg">
              <div className="card-h"><span className="sq" style={{ background: 'var(--teal, var(--research))' }} />COUPLED FOREST · sensitivity &amp; specificity</div>
              <FigureFrame name="sens-spec-forest">
                <CoupledForest res={res} />
              </FigureFrame>
              <p className="small" style={{ marginTop: 8 }}>Per-study sensitivity (left) and specificity (right) with 95% CIs; the diamond is the random-effects pooled estimate. Heterogeneity: I²<sub>sens</sub> {fmt(res.I2Sens, 0)}%, I²<sub>spec</sub> {fmt(res.I2Spec, 0)}%.</p>
            </div>
          </div>

          <div className="card lg" style={{ marginTop: 16 }}>
            <div className="card-h"><span className="sq" style={{ background: 'var(--navy)' }} />INTERPRETATION</div>
            <div className="kv"><span className="k">Pooled sensitivity</span><span className="val"><b>{pct(res.sens)}</b> [{pct(res.sensLow)}, {pct(res.sensHigh)}] — misses {pct(1 - res.sens)} of true cases</span></div>
            <div className="kv"><span className="k">Pooled specificity</span><span className="val"><b>{pct(res.spec)}</b> [{pct(res.specLow)}, {pct(res.specHigh)}] — {pct(1 - res.spec)} false-positive rate</span></div>
            <div className="kv"><span className="k">Likelihood ratios</span><span className="val">LR+ <b>{fmt(res.lrPos, 1)}</b> ({res.lrPos >= 10 ? 'rules in' : res.lrPos >= 5 ? 'moderate' : 'weak'}) · LR− <b>{fmt(res.lrNeg, 2)}</b> ({res.lrNeg <= 0.1 ? 'rules out' : res.lrNeg <= 0.2 ? 'moderate' : 'weak'})</span></div>
            <div className="divider" />
            <p className="small">A positive test multiplies the pre-test odds by <b>{fmt(res.lrPos, 1)}</b>; a negative test multiplies them by <b>{fmt(res.lrNeg, 2)}</b>. {res.sensLow > 0.8 ? <>Sensitivity is high across studies — a negative result meaningfully lowers the probability of disease.</> : res.specLow > 0.9 ? <>Specificity is high — a positive result strongly raises the probability of disease.</> : <>Both accuracy dimensions carry residual uncertainty; read alongside the SROC spread.</>} {res.sroc && Math.abs(res.sroc.b) > 0.5 ? <>The sloped SROC suggests a threshold effect across studies — pooled point estimates should be read with care.</> : null}</p>
          </div>

          <div className="card lg" style={{ marginTop: 16 }}>
            <div className="card-h"><span className="sq" style={{ background: 'var(--violet, var(--violet))' }} />STUDIES · 2×2 DATA</div>
            <DxTable dx={dx} res={res} patchDx={patchDx} removeDx={removeDx} num={num} />
            <p className="small" style={{ marginTop: 8 }}>TP / FP / FN / TN against the reference standard. Untick <b>include</b> to hold a study out. Empty cells get a 0.5 continuity correction for the rate calculations.</p>
          </div>
        </>
      )}
    </>
  )
}

// ---- editable 2×2 table ----
function DxTable({ dx, res, patchDx, removeDx, num }: {
  dx: DiagnosticStudy[]
  res: ReturnType<typeof diagnosticMeta>
  patchDx: (id: string, patch: Partial<DiagnosticStudy>) => void
  removeDx: (id: string) => void
  num: (v: string) => number | undefined
}) {
  const rowFor = (id: string): DxRow | undefined => res?.rows.find((x) => x.id === id)
  const cell = (s: DiagnosticStudy, key: 'tp' | 'fp' | 'fn' | 'tn') => (
    <td><input className="input mono" aria-label={`${key.toUpperCase()} for ${s.author || 'untitled study'}`} style={{ width: 58, padding: '4px 6px' }} type="number" min="0" value={s[key] ?? ''} onChange={(e) => patchDx(s.id, { [key]: num(e.target.value) })} /></td>
  )
  return (
    <div className="tbl-scroll" style={{ marginTop: 10 }}>
      <table>
        <thead>
          <tr>
            <th></th><th>Study</th><th>Test</th><th>TP</th><th>FP</th><th>FN</th><th>TN</th><th>Sens</th><th>Spec</th><th></th>
          </tr>
        </thead>
        <tbody>
          {dx.map((s) => {
            const row = rowFor(s.id)
            const bad = s.include && !dxUsable(s)
            return (
              <tr key={s.id} style={s.include ? undefined : { background: 'var(--bg-inset)' }}>
                <td><input type="checkbox" aria-label={`Include ${s.author || 'untitled study'} in diagnostic meta-analysis`} checked={s.include} onChange={(e) => patchDx(s.id, { include: e.target.checked })} /></td>
                <td><input className="input" aria-label="Diagnostic study author" style={{ width: 118, padding: '4px 6px' }} value={s.author} onChange={(e) => patchDx(s.id, { author: e.target.value })} /> <input className="input mono" aria-label={`Year for ${s.author || 'untitled study'}`} style={{ width: 56, padding: '4px 6px' }} type="number" value={s.year} onChange={(e) => patchDx(s.id, { year: +e.target.value || s.year })} /></td>
                <td><input className="input" aria-label={`Index test for ${s.author || 'untitled study'}`} style={{ width: 130, padding: '4px 6px' }} value={s.test ?? ''} onChange={(e) => patchDx(s.id, { test: e.target.value })} /></td>
                {cell(s, 'tp')}{cell(s, 'fp')}{cell(s, 'fn')}{cell(s, 'tn')}
                <td className="mono">{row ? pct(row.sens) : bad ? <span style={{ color: 'var(--red)' }}>?</span> : '—'}</td>
                <td className="mono">{row ? pct(row.spec) : bad ? <span style={{ color: 'var(--red)' }}>?</span> : '—'}</td>
                <td><button className="icon-btn danger" onClick={() => { if (confirm(`Remove ${s.author} ${s.year}?`)) removeDx(s.id) }}>Del</button></td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ---- summary ROC plot ----
function SrocPlot({ res }: { res: NonNullable<ReturnType<typeof diagnosticMeta>> }) {
  const W = 460, H = 380, x0 = 46, x1 = W - 16, y0 = 16, y1 = H - 34
  const X = (fpr: number) => x0 + fpr * (x1 - x0)
  const Y = (sens: number) => y1 - sens * (y1 - y0)
  const ticks = [0, 0.25, 0.5, 0.75, 1]
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block' }}>
      {/* grid + axes */}
      {ticks.map((t) => (
        <g key={t}>
          <line x1={X(t)} y1={y0} x2={X(t)} y2={y1} stroke="var(--line)" strokeWidth={t === 0 ? 1 : 0.5} opacity={t === 0 ? 1 : 0.5} />
          <line x1={x0} y1={Y(t)} x2={x1} y2={Y(t)} stroke="var(--line)" strokeWidth={t === 0 ? 1 : 0.5} opacity={t === 0 ? 1 : 0.5} />
          <text x={X(t)} y={y1 + 14} textAnchor="middle" fontSize="8.5" fill="var(--muted)" fontFamily="var(--mono)">{t}</text>
          <text x={x0 - 6} y={Y(t) + 3} textAnchor="end" fontSize="8.5" fill="var(--muted)" fontFamily="var(--mono)">{t}</text>
        </g>
      ))}
      {/* chance diagonal */}
      <line x1={X(0)} y1={Y(0)} x2={X(1)} y2={Y(1)} stroke="var(--muted)" strokeWidth={0.8} strokeDasharray="3 3" opacity={0.6} />
      {/* SROC curve */}
      {res.sroc && <polyline points={res.sroc.curve.map((p) => `${X(p.fpr)},${Y(p.tpr)}`).join(' ')} fill="none" stroke="var(--red)" strokeWidth={1.8} opacity={0.85} />}
      {/* study points */}
      {res.rows.map((s) => (
        <circle key={s.id} cx={X(1 - s.spec)} cy={Y(s.sens)} r={Math.max(3, Math.min(11, Math.sqrt(s.n) * 0.7))} fill="none" stroke="var(--navy)" strokeWidth={1.4} opacity={0.75} />
      ))}
      {/* pooled operating point with CI cross-hairs */}
      <line x1={X(1 - res.specHigh)} y1={Y(res.sens)} x2={X(1 - res.specLow)} y2={Y(res.sens)} stroke="var(--red)" strokeWidth={1.5} />
      <line x1={X(1 - res.spec)} y1={Y(res.sensLow)} x2={X(1 - res.spec)} y2={Y(res.sensHigh)} stroke="var(--red)" strokeWidth={1.5} />
      <path d={diamond(X(1 - res.spec), Y(res.sens), 6)} fill="var(--red)" stroke="#fff" strokeWidth={1} />
      {/* axis labels */}
      <text x={(x0 + x1) / 2} y={H - 4} textAnchor="middle" fontSize="9.5" fill="var(--ink)" fontFamily="var(--mono)">1 − specificity (false-positive rate)</text>
      <text transform={`translate(12 ${(y0 + y1) / 2}) rotate(-90)`} textAnchor="middle" fontSize="9.5" fill="var(--ink)" fontFamily="var(--mono)">sensitivity (true-positive rate)</text>
    </svg>
  )
}

const diamond = (cx: number, cy: number, r: number) => `M${cx} ${cy - r}L${cx + r} ${cy}L${cx} ${cy + r}L${cx - r} ${cy}Z`

// ---- coupled sensitivity / specificity forest ----
function CoupledForest({ res }: { res: NonNullable<ReturnType<typeof diagnosticMeta>> }) {
  const rows = res.rows
  const rowH = 20, top = 30, W = 640, H = top + rows.length * rowH + 40
  const labX = 6, labW = 118
  const p1x0 = labX + labW + 8, p1x1 = p1x0 + 190 // sensitivity panel
  const p2x0 = p1x1 + 30, p2x1 = p2x0 + 190 // specificity panel
  const AX = (v: number, a: number, b: number) => a + v * (b - a)
  const panel = (x0: number, x1: number, title: string, get: (r: DxRow) => [number, number, number], pooled: [number, number, number], color: string) => (
    <g>
      <text x={(x0 + x1) / 2} y={16} textAnchor="middle" fontSize="9.5" fill="var(--ink)" fontFamily="var(--mono)" fontWeight={700}>{title}</text>
      {[0, 0.5, 1].map((t) => (
        <g key={t}>
          <line x1={AX(t, x0, x1)} y1={top - 6} x2={AX(t, x0, x1)} y2={top + rows.length * rowH + 4} stroke="var(--line)" strokeWidth={0.5} opacity={0.6} />
          <text x={AX(t, x0, x1)} y={top + rows.length * rowH + 16} textAnchor="middle" fontSize="8" fill="var(--muted)" fontFamily="var(--mono)">{t}</text>
        </g>
      ))}
      {rows.map((r, i) => {
        const [est, lo, hi] = get(r)
        const cy = top + i * rowH + rowH / 2
        return (
          <g key={r.id}>
            <line x1={AX(lo, x0, x1)} y1={cy} x2={AX(hi, x0, x1)} y2={cy} stroke={color} strokeWidth={1.3} opacity={0.85} />
            <rect x={AX(est, x0, x1) - 2.5} y={cy - 2.5} width={5} height={5} fill={color} />
          </g>
        )
      })}
      {/* pooled diamond */}
      {(() => {
        const [est, lo, hi] = pooled
        const cy = top + rows.length * rowH + 12
        return <path d={`M${AX(lo, x0, x1)} ${cy}L${AX(est, x0, x1)} ${cy - 5}L${AX(hi, x0, x1)} ${cy}L${AX(est, x0, x1)} ${cy + 5}Z`} fill={color} stroke="#fff" strokeWidth={0.8} />
      })()}
    </g>
  )
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block' }}>
      {rows.map((r, i) => (
        <text key={r.id} x={labX} y={top + i * rowH + rowH / 2 + 3} fontSize="9" fill="var(--ink)" fontFamily="var(--mono)">{r.label.length > 18 ? r.label.slice(0, 17) + '…' : r.label}</text>
      ))}
      <text x={labX} y={top + rows.length * rowH + 15} fontSize="9" fill="var(--ink)" fontFamily="var(--mono)" fontWeight={700}>Pooled (RE)</text>
      {panel(p1x0, p1x1, 'Sensitivity', (r) => [r.sens, r.sensLow, r.sensHigh], [res.sens, res.sensLow, res.sensHigh], 'var(--research)')}
      {panel(p2x0, p2x1, 'Specificity', (r) => [r.spec, r.specLow, r.specHigh], [res.spec, res.specLow, res.specHigh], 'var(--accent)')}
    </svg>
  )
}
