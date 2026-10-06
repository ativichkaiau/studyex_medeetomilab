import type { MetaResult } from '../lib/metaAnalysis'
import { fmt } from '../lib/metaAnalysis'
import type { Review } from '../types'

const sans = { fontFamily: 'var(--sans)' } as const
const mono = { fontFamily: 'var(--mono)' } as const
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

function niceTicks(lo: number, hi: number, n = 5): number[] {
  const span = hi - lo || 1
  const step0 = span / n
  const mag = Math.pow(10, Math.floor(Math.log10(step0)))
  const norm = step0 / mag
  const step = (norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10) * mag
  const start = Math.ceil(lo / step) * step
  const out: number[] = []
  for (let v = start; v <= hi + 1e-9; v += step) out.push(+v.toFixed(6))
  return out
}

// ---------------- Forest plot (log or linear scale) ----------------
export function ForestPlot({ result, index, measure }: { result: MetaResult; index: string; comparator?: string; measure: string }) {
  const { rows, pooledEst, pooledLow, pooledHigh, predLow, predHigh, k, scale, refValue } = result
  if (!k) return <p className="empty">No studies with usable data for this measure yet — add data on the Studies page.</p>
  const isLog = scale === 'log'
  const showPI = result.model === 'random' && k >= 3 && (predLow < pooledLow - 1e-9 || predHigh > pooledHigh + 1e-9)
  const tx = (v: number) => (isLog ? Math.log(Math.max(v, 1e-6)) : v)
  const vals = [...rows.flatMap((r) => [r.low, r.high]), pooledLow, pooledHigh, refValue, ...(showPI ? [predLow, predHigh] : [])].filter((v) => Number.isFinite(v))
  let lo = Math.min(...vals.map(tx))
  let hi = Math.max(...vals.map(tx))
  const pad = (hi - lo) * 0.08 || 0.3
  lo -= pad
  hi += pad
  const W = 720, x0 = 190, x1 = 520, top = 26, rowH = 30
  const H = top + rows.length * rowH + 96
  const X = (v: number) => x0 + ((clamp(tx(v), lo, hi) - lo) / (hi - lo)) * (x1 - x0)
  const ticks = isLog
    ? [0.1, 0.25, 0.5, 1, 2, 4, 8, 16, 32].filter((t) => tx(t) >= lo && tx(t) <= hi)
    : niceTicks(lo, hi, 6)
  const axisY = top + rows.length * rowH + 10

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={sans}>
      <text x={8} y={16} fontSize="10.5" fontWeight={700} fill="var(--muted)" style={mono}>STUDY</text>
      <text x={x1 + 8} y={16} fontSize="10.5" fontWeight={700} fill="var(--muted)" style={mono}>{measure} [95% CI]</text>
      <text x={W - 6} y={16} fontSize="10.5" fontWeight={700} fill="var(--muted)" textAnchor="end" style={mono}>WT%</text>
      <line className="fp-ref" x1={X(refValue)} y1={top} x2={X(refValue)} y2={axisY} stroke="var(--muted)" strokeWidth={1} strokeDasharray="4 4" />
      {rows.map((r, i) => {
        const y = top + i * rowH + rowH / 2
        const side = clamp(4 + Math.sqrt(r.weight) * 2.2, 5, 17)
        return (
          <g key={r.id} className="fp-row" style={{ animationDelay: `${Math.min(i, 14) * 0.045}s` }}>
            <text x={8} y={y + 4} fontSize="12" fill="var(--ink)" style={sans}>{r.label}</text>
            <line x1={X(r.low)} y1={y} x2={X(r.high)} y2={y} stroke="var(--blue)" strokeWidth={1.6} />
            <line x1={X(r.low)} y1={y - 4} x2={X(r.low)} y2={y + 4} stroke="var(--blue)" strokeWidth={1.6} />
            <line x1={X(r.high)} y1={y - 4} x2={X(r.high)} y2={y + 4} stroke="var(--blue)" strokeWidth={1.6} />
            <rect x={X(r.est) - side / 2} y={y - side / 2} width={side} height={side} fill="var(--navy)" />
            <text x={x1 + 8} y={y + 4} fontSize="11" fill="var(--ink-2)" style={mono}>{fmt(r.est)} [{fmt(r.low)}, {fmt(r.high)}]</text>
            <text x={W - 6} y={y + 4} fontSize="10.5" fill="var(--muted)" textAnchor="end" style={mono}>{fmt(r.weight, 1)}</text>
          </g>
        )
      })}
      {(() => {
        const y = axisY - 2
        const poolDelay = `${0.12 + Math.min(rows.length, 15) * 0.045}s`
        return (
          <g className="fp-pool" style={{ animationDelay: poolDelay }}>
            {showPI && (
              <g>
                <line x1={X(predLow)} y1={y} x2={X(predHigh)} y2={y} stroke="var(--red)" strokeWidth={1.4} strokeDasharray="3 3" opacity={0.75} />
                <line x1={X(predLow)} y1={y - 5} x2={X(predLow)} y2={y + 5} stroke="var(--red)" strokeWidth={1.4} opacity={0.75} />
                <line x1={X(predHigh)} y1={y - 5} x2={X(predHigh)} y2={y + 5} stroke="var(--red)" strokeWidth={1.4} opacity={0.75} />
              </g>
            )}
            <polygon className="fp-diamond" points={`${X(pooledLow)},${y} ${X(pooledEst)},${y - 8} ${X(pooledHigh)},${y} ${X(pooledEst)},${y + 8}`} fill="var(--red)" stroke="var(--red)" />
            <text x={8} y={y + 4} fontSize="12" fontWeight={800} fill="var(--red)" style={sans}>Pooled ({result.model})</text>
            <text x={x1 + 8} y={y + 4} fontSize="11" fontWeight={800} fill="var(--red)" style={mono}>{fmt(pooledEst)} [{fmt(pooledLow)}, {fmt(pooledHigh)}]</text>
            {showPI && <text x={8} y={axisY + 30} fontSize="9.5" fill="var(--red)" opacity={0.85} style={mono}>95% PI [{fmt(predLow)}, {fmt(predHigh)}]</text>}
          </g>
        )
      })()}
      <line className="fp-axis" x1={x0} y1={axisY + 12} x2={x1} y2={axisY + 12} stroke="var(--line)" strokeWidth={1.5} />
      {ticks.map((t) => (
        <g key={t} className="fp-axis">
          <line x1={X(t)} y1={axisY + 12} x2={X(t)} y2={axisY + 17} stroke="var(--muted)" strokeWidth={1} />
          <text x={X(t)} y={axisY + 30} textAnchor="middle" fontSize="9.5" fill="var(--muted)" style={mono}>{t}</text>
        </g>
      ))}
      <text x={X(refValue) - 6} y={axisY + 46} textAnchor="end" fontSize="9.5" fill="var(--muted)" style={sans}>← lower in {index}</text>
      <text x={X(refValue) + 6} y={axisY + 46} fontSize="9.5" fill="var(--muted)" style={sans}>higher in {index} →</text>
    </svg>
  )
}

// ---------------- Contour-enhanced funnel plot (+ trim-and-fill overlay) ----------------
export function FunnelPlot({ result, imputed = [], adjustedPool }: { result: MetaResult; imputed?: { pool: number; se: number }[]; adjustedPool?: number }) {
  const { rows, pooledPool, k } = result
  if (k < 3) return <p className="empty">Funnel plot needs ≥3 studies.</p>
  const allSE = [...rows.map((r) => r.se), ...imputed.map((p) => p.se)]
  const maxSE = Math.max(...allSE) * 1.15
  const allPools = [...rows.map((r) => r.pool), ...imputed.map((p) => p.pool), pooledPool, adjustedPool ?? pooledPool]
  const xExtent = Math.max(...allPools.map((p) => Math.abs(p)), 2.576 * maxSE) * 1.06
  const W = 480, Hh = 320, x0 = 46, x1 = W - 16, y0 = 28, y1 = Hh - 46
  const midX = (x0 + x1) / 2
  const X = (v: number) => midX + (v / xExtent) * ((x1 - x0) / 2)
  const Y = (se: number) => y0 + (se / maxSE) * (y1 - y0)
  // significance contour bands (centred on the null = 0 on the pooling scale)
  const bands: [number, number, string][] = [
    [1.645, 1.96, 'rgba(120,132,170,0.12)'],
    [1.96, 2.576, 'rgba(120,132,170,0.22)'],
    [2.576, xExtent / maxSE, 'rgba(120,132,170,0.34)'],
  ]
  const tri = (zLo: number, zHi: number, sign: number) => `${midX},${y0} ${X(sign * zLo * maxSE)},${y1} ${X(sign * zHi * maxSE)},${y1}`
  return (
    <svg viewBox={`0 0 ${W} ${Hh}`} width="100%" style={sans}>
      {bands.map(([lo, hi, fill], i) => (
        <g key={i}>
          <polygon points={tri(lo, hi, 1)} fill={fill} />
          <polygon points={tri(lo, hi, -1)} fill={fill} />
        </g>
      ))}
      {/* null + estimate lines */}
      <line x1={X(0)} y1={y0} x2={X(0)} y2={y1} stroke="var(--muted)" strokeWidth={1} />
      <line x1={X(pooledPool)} y1={y0} x2={X(pooledPool)} y2={y1} stroke="var(--red)" strokeWidth={1.4} strokeDasharray="4 4" />
      {adjustedPool !== undefined && imputed.length > 0 && <line x1={X(adjustedPool)} y1={y0} x2={X(adjustedPool)} y2={y1} stroke="var(--green)" strokeWidth={1.4} strokeDasharray="4 4" />}
      {rows.map((r) => <circle key={r.id} cx={X(r.pool)} cy={Y(r.se)} r={5} fill="var(--navy)" stroke="#fff" strokeWidth={1.3} />)}
      {imputed.map((p, i) => <circle key={`imp-${i}`} cx={X(p.pool)} cy={Y(p.se)} r={5} fill="none" stroke="var(--red)" strokeWidth={1.8} />)}
      {/* axes */}
      <line x1={x0} y1={y0} x2={x0} y2={y1} stroke="var(--line)" strokeWidth={1.5} />
      <line x1={x0} y1={y1} x2={x1} y2={y1} stroke="var(--line)" strokeWidth={1.5} />
      <text x={midX} y={Hh - 26} textAnchor="middle" fontSize="9.5" fill="var(--muted)" style={mono}>effect ({result.scale === 'log' ? 'log' : 'linear'} scale)</text>
      <text x={12} y={(y0 + y1) / 2} fontSize="9.5" fill="var(--muted)" style={mono} transform={`rotate(-90 12 ${(y0 + y1) / 2})`}>standard error</text>
      {/* legend */}
      <g transform={`translate(${x0},${Hh - 12})`} style={mono}>
        <rect x={0} y={-8} width={10} height={8} fill="rgba(120,132,170,0.12)" /><text x={13} y={-1} fontSize="8" fill="var(--muted)">p&gt;.05</text>
        <rect x={54} y={-8} width={10} height={8} fill="rgba(120,132,170,0.22)" /><text x={67} y={-1} fontSize="8" fill="var(--muted)">.01–.05</text>
        <rect x={116} y={-8} width={10} height={8} fill="rgba(120,132,170,0.34)" /><text x={129} y={-1} fontSize="8" fill="var(--muted)">p&lt;.01</text>
        <circle cx={175} cy={-4} r={4} fill="var(--navy)" /><text x={183} y={-1} fontSize="8" fill="var(--muted)">observed</text>
        {imputed.length > 0 && <><circle cx={238} cy={-4} r={4} fill="none" stroke="var(--red)" strokeWidth={1.6} /><text x={246} y={-1} fontSize="8" fill="var(--muted)">imputed</text></>}
      </g>
    </svg>
  )
}

// ---------------- PRISMA 2020 flow ----------------
export function PrismaFlow({ prisma }: { prisma: Review['prisma'] }) {
  const p = prisma
  // boxes and arrows animate in call order, which is the order the flow reads
  let step = 0
  const stagger = () => ({ animationDelay: `${step++ * 0.07}s` })
  const box = (x: number, y: number, w: number, h: number, lines: string[], accent?: boolean) => (
    <g className="pf-step" style={stagger()}>
      <rect x={x} y={y} width={w} height={h} rx={8} fill={accent ? 'var(--good)' : 'var(--card)'} stroke={accent ? 'var(--green)' : 'var(--line)'} strokeWidth={accent ? 1.8 : 1.3} />
      {lines.map((l, i) => (
        <text key={i} x={x + 12} y={y + 20 + i * 15} fontSize={i === 0 ? '11.5' : '10.5'} fontWeight={i === 0 ? 700 : 400} fill={i === 0 ? 'var(--ink)' : 'var(--ink-2)'} style={i === 0 ? sans : mono}>{l}</text>
      ))}
    </g>
  )
  const arrow = (x1: number, y1: number, x2: number, y2: number) => <path className="pf-step" style={stagger()} d={`M${x1},${y1} L${x2},${y2}`} fill="none" stroke="var(--muted)" strokeWidth={1.6} markerEnd="url(#pa)" />
  const mainX = 40, mainW = 300, sideX = 400, sideW = 300
  return (
    <svg viewBox="0 0 720 560" width="100%" style={sans}>
      <defs><marker id="pa" markerWidth="9" markerHeight="9" refX="7" refY="3" orient="auto"><path d="M0,0 L7,3 L0,6 Z" fill="var(--muted)" /></marker></defs>
      {box(mainX, 20, mainW, 66, ['Records identified', `Databases (n = ${p.dbRecords})`, `Other sources (n = ${p.otherRecords})`])}
      {arrow(mainX + mainW / 2, 86, mainX + mainW / 2, 118)}
      {box(mainX, 118, mainW, 50, ['Records screened', `(n = ${p.screened})`])}
      {box(sideX, 24, sideW, 50, ['Duplicates removed', `(n = ${p.duplicates})`])}
      {arrow(mainX + mainW, 132, sideX, 132)}
      {box(sideX, 118, sideW, 50, ['Records excluded', `(n = ${p.excludedScreen})`])}
      {arrow(mainX + mainW / 2, 168, mainX + mainW / 2, 200)}
      {box(mainX, 200, mainW, 50, ['Reports assessed for eligibility', `(n = ${p.fullText})`])}
      {arrow(mainX + mainW, 225, sideX, 225)}
      {box(sideX, 200, sideW, 40 + p.fullTextExcluded.length * 15, ['Reports excluded:', ...p.fullTextExcluded.map((e) => `${e.reason} (n = ${e.n})`)])}
      {arrow(mainX + mainW / 2, 250, mainX + mainW / 2, 300)}
      {box(mainX, 300, mainW, 50, ['Studies included in synthesis', `(n = ${p.included})`], true)}
    </svg>
  )
}
