import type { ProjectState } from '../types'

/** what kind of project this is, read from what it actually contains */
export function reviewType(s: ProjectState): string {
  const r = s.review
  const kinds = ['SR']
  if (r.studies.length > 0 || r.question.trim()) kinds.push((r.dxStudies?.length ?? 0) > 0 ? 'DTA-MA' : 'MA')
  const bench = s.assays.length > 0 || s.hypotheses.length > 0
  return kinds.join(' / ') + (bench ? ' + mechanistic' : '')
}

/** A planned registration is not a completed registration. */
export function isRegistered(s: ProjectState): boolean {
  const registration = s.review.registration?.trim() ?? ''
  return !!registration && !/\b(to register|pending|not registered)\b/i.test(registration)
}

/** milliseconds → "3m ago", for logs */
export function ago(ts: number, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - ts) / 1000))
  if (s < 45) return 'just now'
  const m = Math.round(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.round(h / 24)
  return d === 1 ? '1d ago' : `${d}d ago`
}

/** a timestamp as a log prints it: 2026-10-05 14:02 */
export function stamp(ts: number): string {
  const d = new Date(ts)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}
