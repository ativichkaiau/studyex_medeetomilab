import type { CSSProperties, ReactNode } from 'react'
import type { AssayStatus, HypothesisStatus, Severity } from '../types'
import { SEVERITY_COLOR } from '../lib/palette'
import { STATE_LABEL, type StageState } from '../lib/pipeline'

/** the module label above a workspace title: "pipeline / 03 screening" */
export function Kicker({ children }: { children: ReactNode }) {
  return <span className="kicker">{children}</span>
}

/** Retired with the livery: page heads no longer carry decorative stripes. */
export function Rule() {
  return null
}

export type Tone = 'ok' | 'warn' | 'bad' | 'info' | 'research' | 'idle'

/** a printed state: READY, 14 CONFLICTS, SOME_CONCERNS */
export function Tag({ tone = 'idle', children, title }: { tone?: Tone; children: ReactNode; title?: string }) {
  return <span className={`tag ${tone}`} title={title}>{children}</span>
}

const STATE_TONE: Record<StageState, Tone> = {
  empty: 'idle', pending: 'idle', active: 'info', ready: 'ok', done: 'ok', blocked: 'warn', draft: 'research', mismatch: 'bad',
}
export const stateTone = (s: StageState) => STATE_TONE[s]

export function StateTag({ state }: { state: StageState }) {
  return <Tag tone={STATE_TONE[state]}>{STATE_LABEL[state]}</Tag>
}

/** a stage's state as a dot — always paired with text for assistive tech */
export function StateDot({ state }: { state: StageState }) {
  return <i className={`st-dot is-${state}`} aria-hidden="true" />
}

/** key / value rows, the way an object prints */
export function MetaGrid({ rows, className }: { rows: [ReactNode, ReactNode][]; className?: string }) {
  return (
    <dl className={`meta-grid${className ? ` ${className}` : ''}`}>
      {rows.map(([k, v], i) => (
        <div className="mg-row" key={i}>
          <dt>{k}</dt>
          <dd>{v}</dd>
        </div>
      ))}
    </dl>
  )
}

/** an empty state as the system would print it: "literature/  0 records" */
export function Empty({ path, children }: { path: string; children: ReactNode }) {
  return (
    <div className="empty-state">
      <b>{path}</b>
      <span>{children}</span>
    </div>
  )
}

/** a thin completion bar with its value printed beside it */
export function Progress({ value, label }: { value: number; label?: string }) {
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100)
  return (
    <span className="progress" role="img" aria-label={`${label ?? 'completion'} ${pct}%`}>
      <span className="progress-track"><i style={{ width: `${pct}%` }} /></span>
      <span className="progress-v">{pct}%</span>
    </span>
  )
}

const ASSAY_CLASS: Record<AssayStatus, string> = {
  design: 'b-design',
  queued: 'b-queue',
  piloting: 'b-pilot',
  running: 'b-run',
  done: 'b-done',
  blocked: 'b-block',
}

export function AssayBadge({ status }: { status: AssayStatus }) {
  return <span className={`badge ${ASSAY_CLASS[status]}`}>{status}</span>
}

const HYP_CLASS: Record<HypothesisStatus, string> = {
  draft: 'b-draft',
  testing: 'b-testing',
  supported: 'b-supported',
  refuted: 'b-refuted',
}

export function HypBadge({ status }: { status: HypothesisStatus }) {
  return <span className={`badge ${HYP_CLASS[status]}`}>{status}</span>
}

const SEV_LABEL: Record<Severity, string> = { high: 'high', med: 'medium', low: 'low' }

export function SevDot({ severity, label }: { severity: Severity; label?: string }) {
  return (
    <span className="sev" style={{ color: SEVERITY_COLOR[severity] }}>
      <i style={{ background: SEVERITY_COLOR[severity] }} />
      {label ?? SEV_LABEL[severity]}
    </span>
  )
}

export function StatCard({ value, label, sub, tone }: { value: ReactNode; label: string; sub?: string; tone?: string }) {
  return (
    <div className="stat" style={tone ? { '--stat-tone': tone } as CSSProperties : undefined}>
      <b key={typeof value === 'string' || typeof value === 'number' ? value : undefined}>{value}</b>
      <span>{label}</span>
      {sub && <div className="sub">{sub}</div>}
    </div>
  )
}
