import { useMemo, useState } from 'react'
import { useStore } from '../lib/store'
import { Kicker, Rule, AssayBadge } from '../components/ui'
import { Field } from '../components/Modal'
import {
  twoSampleTPower, requiredNPerGroup, pairedPower, requiredNPaired, anovaPower, requiredNAnova,
  logRankPower, requiredEvents, fdrAlpha, dFromMeta, assayPowerReport, fmtAlpha,
} from '../lib/power'
import { computeMeta, measureInfo } from '../lib/metaAnalysis'
import PowerSurface from '../components/PowerSurface'
import type { SurfaceData } from '../gl/powerSurface'

type Design = 'two' | 'paired' | 'anova' | 'survival'
const DESIGNS: { id: Design; label: string; unit: string }[] = [
  { id: 'two', label: 'Two-sample', unit: 'n per group' },
  { id: 'paired', label: 'Paired', unit: 'n pairs' },
  { id: 'anova', label: 'ANOVA (k-arm)', unit: 'n per group' },
  { id: 'survival', label: 'Survival (log-rank)', unit: 'events' },
]

function powerColor(p: number) {
  if (p >= 0.8) return 'var(--green)'
  if (p >= 0.5) return 'var(--amber)'
  return 'var(--red)'
}

export default function Power() {
  const { state } = useStore()
  const [design, setDesign] = useState<Design>('two')
  const [d, setD] = useState(0.8)
  const [f, setF] = useState(0.25)
  const [k, setK] = useState(3)
  const [hr, setHr] = useState(0.6)
  const [n, setN] = useState(12) // n/group, pairs, or events depending on design
  const [baseAlpha, setBaseAlpha] = useState(0.05)
  const [target, setTarget] = useState(0.8)
  const [correction, setCorrection] = useState<'none' | 'bonferroni' | 'fdr'>('none')
  const [tests, setTests] = useState(100000)
  const [m1, setM1] = useState(100)
  const [q, setQ] = useState(0.05)
  const [dropout, setDropout] = useState(0)
  const [alloc, setAlloc] = useState(1)

  const unit = DESIGNS.find((x) => x.id === design)!.unit
  const alpha =
    correction === 'none' ? baseAlpha : correction === 'bonferroni' ? baseAlpha / tests : fdrAlpha({ m: tests, m1, q, power: target })

  // one power function over the active design (mult scales the effect for the overlay)
  function powerAtN(nn: number, mult = 1): number {
    if (design === 'two') return twoSampleTPower({ nPerGroup: nn, d: d * mult, alpha, alloc })
    if (design === 'paired') return pairedPower({ nPairs: nn, d: d * mult, alpha })
    if (design === 'anova') return anovaPower({ k, nPerGroup: nn, f: f * mult, alpha })
    return logRankPower({ events: nn, hr: Math.exp(Math.log(hr) * mult), alpha })
  }
  const power = powerAtN(n)
  const req =
    design === 'two' ? requiredNPerGroup({ d, alpha, power: target, alloc })
      : design === 'paired' ? requiredNPaired({ d, alpha, power: target })
        : design === 'anova' ? requiredNAnova({ k, f, alpha, power: target })
          : requiredEvents({ hr, alpha, power: target })
  const reqDrop = Number.isFinite(req) && dropout > 0 && dropout < 1 ? Math.ceil(req / (1 - dropout)) : req
  // total across arms — unequal allocation makes group 2 = alloc × group 1
  const reqTotal = !Number.isFinite(req) ? req : design === 'anova' ? req * k : req + Math.ceil(req * alloc)

  const meta = useMemo(() => computeMeta(state.review.studies, state.review.model, state.review.effect), [state.review])
  const metaD = meta.k >= 2 ? dFromMeta(state.review.effect, meta.pooledEst) : null

  // power-vs-n overlay: three effect assumptions
  const maxN = Math.max(30, Math.ceil((Number.isFinite(req) ? req : n) * 1.4))
  const step = Math.max(1, Math.round(maxN / 60))
  const mults = [
    { mult: 1.25, color: 'var(--green)', label: '+25%' },
    { mult: 1, color: 'var(--blue)', label: 'planned' },
    { mult: 0.75, color: 'var(--red)', label: '−25%' },
  ]
  const curves = useMemo(() => mults.map((m) => {
    const pts: { n: number; p: number }[] = []
    for (let x = 2; x <= maxN; x += step) pts.push({ n: x, p: powerAtN(x, m.mult) })
    return { ...m, pts }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [design, d, f, k, hr, alpha, alloc, maxN, step])

  // in 3D: the whole surface these curves are slices of — n across, the
  // effect from half to one-and-a-half times the assumption, deep
  const surface = useMemo<SurfaceData>(() => {
    const nx = 44
    const ny = 26
    const nMin = 2
    const multMin = 0.5
    const multMax = 1.5
    const nAt = (i: number) => nMin + (i / (nx - 1)) * (maxN - nMin)
    const grid = new Float32Array(nx * ny)
    for (let j = 0; j < ny; j++) {
      const m = multMin + (j / (ny - 1)) * (multMax - multMin)
      for (let i = 0; i < nx; i++) grid[j * nx + i] = powerAtN(nAt(i), m)
    }
    const SLICE: Record<string, string> = { '+25%': '#12b981', planned: '#2f6bff', '−25%': '#e2001a' }
    return {
      nx, ny, power: grid, nMin, nMax: maxN, multMin, multMax, target,
      slices: mults.map((m) => ({ mult: m.mult, color: SLICE[m.label], power: Float32Array.from({ length: nx }, (_, i) => powerAtN(nAt(i), m.mult)) })),
      current: { n, power },
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [design, d, f, k, hr, alpha, alloc, maxN, target, n])
  const surfaceSummary = `Power surface for the ${DESIGNS.find((x) => x.id === design)!.label.toLowerCase()} design: power rises with ${unit} and with effect size. At the assumed effect, ${n} ${unit} gives ${Math.round(power * 100)}% power${Number.isFinite(req) ? `; ${Math.round(target * 100)}% power needs ${req}` : ''}.`

  const W = 460
  const H = 200
  const px = (nn: number) => 34 + (nn / maxN) * (W - 46)
  const py = (p: number) => H - 26 - p * (H - 44)
  const toPath = (pts: { n: number; p: number }[]) => pts.map((pt, i) => `${i === 0 ? 'M' : 'L'}${px(pt.n).toFixed(1)},${py(pt.p).toFixed(1)}`).join(' ')

  return (
    <>
      <div className="page-head">
        <Rule />
        <Kicker>STATISTICAL POWER · SAMPLE SIZE</Kicker>
        <h1>Power &amp; sample size</h1>
        <p>Plan the confirmatory study: two-sample, paired, k-arm ANOVA, or survival (log-rank). Genome-wide readouts pay a multiple-testing tax — Bonferroni for FWER or Benjamini–Hochberg for FDR. Pull the plausible effect straight from your meta-analysis.</p>
      </div>

      <div className="seg" style={{ marginBottom: 16 }}>
        {DESIGNS.map((dz) => (
          <button key={dz.id} className={`seg-b${design === dz.id ? ' on' : ''}`} onClick={() => setDesign(dz.id)}>{dz.label}</button>
        ))}
      </div>

      <div className="grid g2" style={{ marginBottom: 16 }}>
        <div className="card lg">
          <div className="card-h"><span className="sq" style={{ background: 'var(--blue)' }} />CALCULATOR</div>

          {/* effect + sample inputs per design */}
          {design === 'two' && (
            <div className="form-row">
              <Field label="Effect size (Cohen's d)"><input className="input" type="number" step="0.1" min="0.1" value={d} onChange={(e) => setD(Math.max(0.1, +e.target.value))} /></Field>
              <Field label="n per group"><input className="input" type="number" min="2" value={n} onChange={(e) => setN(Math.max(2, Math.round(+e.target.value)))} /></Field>
            </div>
          )}
          {design === 'paired' && (
            <div className="form-row">
              <Field label="Effect size (dz, paired)"><input className="input" type="number" step="0.1" min="0.1" value={d} onChange={(e) => setD(Math.max(0.1, +e.target.value))} /></Field>
              <Field label="n pairs"><input className="input" type="number" min="2" value={n} onChange={(e) => setN(Math.max(2, Math.round(+e.target.value)))} /></Field>
            </div>
          )}
          {design === 'anova' && (
            <>
              <div className="form-row">
                <Field label="Effect size (Cohen's f)"><input className="input" type="number" step="0.05" min="0.05" value={f} onChange={(e) => setF(Math.max(0.05, +e.target.value))} /></Field>
                <Field label="Groups (k)"><input className="input" type="number" min="2" max="12" value={k} onChange={(e) => setK(Math.max(2, Math.round(+e.target.value)))} /></Field>
              </div>
              <Field label="n per group"><input className="input" type="number" min="2" value={n} onChange={(e) => setN(Math.max(2, Math.round(+e.target.value)))} /></Field>
            </>
          )}
          {design === 'survival' && (
            <div className="form-row">
              <Field label="Hazard ratio" hint="protective <1, harmful >1"><input className="input" type="number" step="0.05" min="0.05" value={hr} onChange={(e) => setHr(Math.max(0.05, +e.target.value))} /></Field>
              <Field label="Observed events"><input className="input" type="number" min="2" value={n} onChange={(e) => setN(Math.max(2, Math.round(+e.target.value)))} /></Field>
            </div>
          )}

          <div className="form-row">
            <Field label="Base α"><input className="input" type="number" step="0.01" min="0.0001" value={baseAlpha} onChange={(e) => setBaseAlpha(+e.target.value)} /></Field>
            <Field label="Target power"><input className="input" type="number" step="0.05" min="0.5" max="0.99" value={target} onChange={(e) => setTarget(+e.target.value)} /></Field>
          </div>

          {(design === 'two' || design === 'paired') && metaD !== null && (
            <div className="meta-pull">
              <span>Meta-analysis: {measureInfo(state.review.effect).label} <b>{meta.pooledEst.toFixed(2)}</b> ({meta.k} studies) → d ≈ <b>{metaD.toFixed(2)}</b></span>
              <button className="btn ghost sm" onClick={() => setD(+metaD.toFixed(2))}>Use this effect</button>
            </div>
          )}

          {/* multiple-testing correction */}
          <div className="divider" />
          <div className="card-h" style={{ fontSize: 10, marginBottom: 8 }}>MULTIPLE-TESTING CORRECTION</div>
          <div className="seg" style={{ marginBottom: 10 }}>
            {(['none', 'bonferroni', 'fdr'] as const).map((c) => (
              <button key={c} className={`seg-b${correction === c ? ' on' : ''}`} onClick={() => setCorrection(c)}>{c === 'none' ? 'None' : c === 'bonferroni' ? 'Bonferroni' : 'FDR (BH)'}</button>
            ))}
          </div>
          {correction !== 'none' && (
            <div className="form-row">
              <Field label="Tests (m)"><input className="input" type="number" min="1" value={tests} onChange={(e) => setTests(Math.max(1, Math.round(+e.target.value)))} /></Field>
              {correction === 'bonferroni' ? (
                <Field label="per-test α"><input className="input" value={fmtAlpha(alpha)} readOnly /></Field>
              ) : (
                <Field label="True alt. (m₁)"><input className="input" type="number" min="1" value={m1} onChange={(e) => setM1(Math.max(1, Math.round(+e.target.value)))} /></Field>
              )}
            </div>
          )}
          {correction === 'fdr' && (
            <Field label="Target FDR (q)" hint={`per-test α ≈ ${fmtAlpha(alpha)} (Jung 2005)`}><input className="input" type="number" step="0.01" min="0.001" max="0.5" value={q} onChange={(e) => setQ(+e.target.value)} /></Field>
          )}

          {/* real-world adjustments */}
          {(design === 'two' || design === 'paired') && (
            <>
              <div className="divider" />
              <div className="form-row">
                <Field label="Dropout %" hint="inflates enrolment"><input className="input" type="number" step="1" min="0" max="90" value={Math.round(dropout * 100)} onChange={(e) => setDropout(Math.min(0.9, Math.max(0, +e.target.value / 100)))} /></Field>
                {design === 'two' && <Field label="Allocation (ctrl:trt)" hint={`${alloc}:1`}><input className="input" type="number" step="0.5" min="0.25" max="5" value={alloc} onChange={(e) => setAlloc(Math.max(0.25, +e.target.value))} /></Field>}
              </div>
            </>
          )}

          <div className="divider" />
          <div className="grid g2">
            <div className="stat"><b style={{ color: powerColor(power) }}>{Math.round(power * 100)}%</b><span>Power at {unit === 'events' ? `${n} events` : `${n} ${unit}`}</span></div>
            <div className="stat">
              <b>{Number.isFinite(req) ? req : '∞'}</b>
              <span>{unit} for {Math.round(target * 100)}% power</span>
              {(design === 'two' || design === 'paired') && dropout > 0 && Number.isFinite(reqDrop) && <div className="sub">{reqDrop} enrolled (dropout {Math.round(dropout * 100)}%)</div>}
              {design !== 'survival' && design !== 'paired' && Number.isFinite(req) && <div className="sub">{reqTotal} total{design === 'two' && alloc !== 1 ? ` (${req}:${Math.ceil(req * alloc)})` : ''}</div>}
            </div>
          </div>
        </div>

        <div className="card lg">
          <div className="card-h"><span className="sq" style={{ background: 'var(--navy)' }} />POWER CURVES · EFFECT SENSITIVITY</div>
          <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block' }}>
            {[0, 0.25, 0.5, 0.8, 1].map((g) => (
              <g key={g}>
                <line x1={34} y1={py(g)} x2={W - 12} y2={py(g)} stroke="var(--line)" strokeWidth={1} strokeDasharray={g === 0.8 ? '4 4' : undefined} />
                <text x={26} y={py(g) + 3} textAnchor="end" fontSize="9" fill="var(--muted)" fontFamily="var(--mono)">{g}</text>
              </g>
            ))}
            <text x={W - 14} y={py(0.8) - 4} textAnchor="end" fontSize="8.5" fill="var(--amber)" fontFamily="var(--mono)">0.8 target</text>
            {curves.map((c) => <path key={c.label} d={toPath(c.pts)} fill="none" stroke={c.color} strokeWidth={c.mult === 1 ? 2.6 : 1.6} opacity={c.mult === 1 ? 1 : 0.6} strokeDasharray={c.mult === 1 ? undefined : '4 3'} />)}
            {n <= maxN && <circle cx={px(n)} cy={py(power)} r={4.5} fill={powerColor(power)} stroke="#fff" strokeWidth={1.5} />}
            <text x={W / 2} y={H - 5} textAnchor="middle" fontSize="9" fill="var(--muted)" fontFamily="var(--mono)">{unit} →</text>
          </svg>
          <div className="curve-legend">
            {mults.map((m) => <span key={m.label} className="cl"><i style={{ background: m.color }} />{m.label} effect</span>)}
          </div>
          <p className="small" style={{ marginTop: 6 }}>α={fmtAlpha(alpha)}{correction !== 'none' ? ` (${correction === 'fdr' ? 'FDR' : 'Bonferroni'}, ${tests.toLocaleString()} tests)` : ''}. Dashed = ±25% on the assumed effect — how fragile the plan is to your effect guess.</p>
        </div>
      </div>

      <PowerSurface data={surface} unit={unit} required={req} summary={surfaceSummary} />

      <div className="card" style={{ padding: 0 }}>
        <div className="tbl-scroll" style={{ border: 'none' }}>
          <table>
            <thead>
              <tr>
                <th>Assay</th>
                <th>n total → /group</th>
                <th>d</th>
                <th>per-test α</th>
                <th>Power</th>
                <th>Need /group</th>
                <th>Status</th>
                <th>Verdict</th>
              </tr>
            </thead>
            <tbody>
              {state.assays.map((a) => {
                const rep = assayPowerReport(a)
                if (!rep) return (
                  <tr key={a.id}><td><b>{a.method}</b></td><td colSpan={7} className="muted">no sample size set</td></tr>
                )
                return (
                  <tr key={a.id}>
                    <td><b>{a.method}</b>{a.genomeWide && <div className="small">genome-wide · ~{rep.tests.toLocaleString()} tests</div>}</td>
                    <td className="mono">{a.sampleN} → {rep.nPerGroup}</td>
                    <td className="mono">{rep.d}</td>
                    <td className="mono">{fmtAlpha(rep.alpha)}</td>
                    <td>
                      <div className="flex" style={{ gap: 8 }}>
                        <span className="bar" style={{ width: 70, height: 8, borderRadius: 4, background: 'var(--card-2)', border: '1px solid var(--line)', overflow: 'hidden', display: 'inline-block' }}>
                          <i style={{ display: 'block', height: '100%', width: `${Math.round(rep.power * 100)}%`, background: powerColor(rep.power) }} />
                        </span>
                        <span className="mono" style={{ color: powerColor(rep.power), fontWeight: 700 }}>{Math.round(rep.power * 100)}%</span>
                      </div>
                    </td>
                    <td className="mono">{rep.requiredNPerGroup}</td>
                    <td><AssayBadge status={a.status} /></td>
                    <td style={{ color: rep.adequate ? 'var(--good-ink)' : 'var(--bad-ink)', fontWeight: 700, fontSize: 12 }}>{rep.adequate ? 'powered' : 'underpowered'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
      <p className="small" style={{ marginTop: 10 }}>The per-assay table uses the two-sample model (targeted d=1.0, genome-wide d=0.8 with Bonferroni). ANOVA power uses a Patnaik χ² approximation; survival uses Schoenfeld. Planning figures — confirm in your analysis software.</p>
    </>
  )
}
