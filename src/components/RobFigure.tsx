import type { RobLevel, Study } from '../types'
import { analysisIncluded } from '../lib/cohorts'
import { overallRob, robComplete } from '../lib/rob'

// legacy token names on purpose: figure export snapshots these (lib/figureExport.ts)
const FILL: Record<RobLevel, string> = { low: 'var(--green)', some: 'var(--amber)', high: 'var(--red)' }
const LABEL: Record<RobLevel, string> = { low: 'Low', some: 'Some concerns', high: 'High' }

/**
 * The risk-of-bias figure as SVG, so it exports like any other plot: a
 * traffic-light grid (study × domain, plus the overall judgement) and the
 * share of each judgement per domain. An unrated domain is drawn as
 * unrated — never as a guess.
 */
export function RobFigure({ studies, domains, tool }: { studies: Study[]; domains: string[]; tool?: string }) {
  const incl = studies.filter(analysisIncluded)
  const cols = [...domains.map((d, i) => ({ key: d, short: `D${i + 1}` })), { key: '__overall', short: 'Overall' }]
  const labelW = 160
  const cell = 26
  const top = 34
  const gridW = labelW + cols.length * cell + 10
  const rowsH = incl.length * cell
  const barX = gridW + 30
  const barW = 260
  const width = barX + barW + 150
  const legendY = Math.max(top + rowsH, top + cols.length * 24) + 22
  const height = legendY + 18 + domains.length * 15 + 10
  const value = (s: Study, key: string): RobLevel | undefined => (key === '__overall' ? robComplete(s, domains) ? overallRob(s, domains) : undefined : s.rob?.[key])
  const share = (key: string) => {
    const n = incl.length || 1
    const vals = incl.map((s) => value(s, key))
    return {
      low: vals.filter((v) => v === 'low').length / n,
      some: vals.filter((v) => v === 'some').length / n,
      high: vals.filter((v) => v === 'high').length / n,
      na: vals.filter((v) => !v).length / n,
    }
  }

  return (
    <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`Risk-of-bias summary${tool ? ` (${tool})` : ''}: ${incl.length} studies across ${domains.length} domains`} style={{ width: '100%', maxWidth: 860, height: 'auto', fontFamily: 'var(--font-ui)' }}>
      <title>Risk of bias{tool ? ` · ${tool}` : ''}</title>
      {/* traffic light */}
      <text x={0} y={14} fontSize={10} style={{ fill: 'var(--muted)', letterSpacing: '.06em' }}>TRAFFIC LIGHT</text>
      {cols.map((c, j) => (
        <text key={c.key} x={labelW + j * cell + cell / 2} y={top - 6} fontSize={9.5} textAnchor="middle" style={{ fill: 'var(--ink-2)', fontWeight: c.key === '__overall' ? 600 : 400 }}>{c.key === '__overall' ? 'All' : c.short}</text>
      ))}
      {incl.map((s, i) => (
        <g key={s.id}>
          <text x={0} y={top + i * cell + cell / 2 + 4} fontSize={11} style={{ fill: 'var(--ink)' }}>{`${s.author} ${s.year}`.slice(0, 24)}</text>
          {cols.map((c, j) => {
            const v = value(s, c.key)
            const cx = labelW + j * cell + cell / 2
            const cy = top + i * cell + cell / 2
            return v
              ? <circle key={c.key} cx={cx} cy={cy} r={8} style={{ fill: FILL[v] }}><title>{`${s.author} ${s.year} · ${c.key === '__overall' ? 'overall' : c.key}: ${LABEL[v]}`}</title></circle>
              : <circle key={c.key} cx={cx} cy={cy} r={7.5} style={{ fill: 'none', stroke: 'var(--muted)', strokeDasharray: '2 2' }}><title>{`${s.author} ${s.year} · ${c.key}: not assessed`}</title></circle>
          })}
        </g>
      ))}
      {/* share per domain */}
      <text x={barX} y={14} fontSize={10} style={{ fill: 'var(--muted)', letterSpacing: '.06em' }}>ACROSS STUDIES</text>
      {cols.map((c, j) => {
        const sh = share(c.key)
        const y = top + j * 24
        let x = barX
        const seg = (frac: number, fill: string, dash?: boolean) => {
          const w = frac * barW
          const el = w > 0 ? <rect key={fill} x={x} y={y} width={w} height={14} style={{ fill: dash ? 'none' : fill, stroke: dash ? 'var(--muted)' : 'none', strokeDasharray: dash ? '2 2' : undefined }} /> : null
          x += w
          return el
        }
        return (
          <g key={c.key}>
            {seg(sh.low, FILL.low)}{seg(sh.some, FILL.some)}{seg(sh.high, FILL.high)}{seg(sh.na, 'none', true)}
            <rect x={barX} y={y} width={barW} height={14} style={{ fill: 'none', stroke: 'var(--line)' }} />
            <text x={barX + barW + 8} y={y + 11} fontSize={10.5} style={{ fill: 'var(--ink-2)', fontWeight: c.key === '__overall' ? 600 : 400 }}>{c.key === '__overall' ? 'Overall' : `${c.short} ${c.key}`.slice(0, 26)}</text>
          </g>
        )
      })}
      {/* legend */}
      {(['low', 'some', 'high'] as RobLevel[]).map((l, i) => (
        <g key={l} transform={`translate(${i * 120}, ${legendY})`}>
          <circle cx={7} cy={-4} r={6} style={{ fill: FILL[l] }} />
          <text x={18} y={0} fontSize={10.5} style={{ fill: 'var(--ink-2)' }}>{LABEL[l]}</text>
        </g>
      ))}
      <g transform={`translate(360, ${legendY})`}>
        <circle cx={7} cy={-4} r={5.5} style={{ fill: 'none', stroke: 'var(--muted)', strokeDasharray: '2 2' }} />
        <text x={18} y={0} fontSize={10.5} style={{ fill: 'var(--ink-2)' }}>Not assessed</text>
      </g>
      {domains.map((d, i) => (
        <text key={d} x={0} y={legendY + 20 + i * 15} fontSize={10} style={{ fill: 'var(--muted)' }}>{`D${i + 1}  ${d}`}</text>
      ))}
    </svg>
  )
}
