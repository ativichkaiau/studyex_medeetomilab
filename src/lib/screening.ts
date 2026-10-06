import type { ScreenRecord, ScreenDecision, Review } from '../types'

// Title/abstract outcome for one record, supporting solo or dual screening.
export type TaStatus = 'pending' | 'excluded' | 'advance' | 'conflict'
export function taStatus(rec: ScreenRecord): TaStatus {
  // an adjudicated conflict follows the adjudication
  if (rec.adjudicated) return rec.adjudicated === 'exclude' ? 'excluded' : 'advance'
  const ds = [rec.d1, rec.d2].filter(Boolean) as ScreenDecision[]
  if (ds.length === 0) return 'pending'
  if (rec.d1 && rec.d2 && rec.d1 !== rec.d2) {
    const oneExcludes = rec.d1 === 'exclude' || rec.d2 === 'exclude'
    const oneKeeps = rec.d1 !== 'exclude' || rec.d2 !== 'exclude'
    return oneExcludes && oneKeeps ? 'conflict' : 'advance' // include-vs-maybe → advance
  }
  const d = rec.d1 && rec.d2 ? rec.d1 : ds[0]
  return d === 'exclude' ? 'excluded' : 'advance'
}

export interface Kappa { kappa: number; po: number; n: number; conflicts: number }
export function cohenKappa(recs: ScreenRecord[]): Kappa | null {
  const rated = recs.filter((r) => r.d1 && r.d2)
  const n = rated.length
  if (n < 2) return null
  const cats: ScreenDecision[] = ['include', 'exclude', 'maybe']
  const c1: Record<string, number> = { include: 0, exclude: 0, maybe: 0 }
  const c2: Record<string, number> = { include: 0, exclude: 0, maybe: 0 }
  let agree = 0
  rated.forEach((r) => {
    if (r.d1 === r.d2) agree++
    c1[r.d1!]++
    c2[r.d2!]++
  })
  const po = agree / n
  const pe = cats.reduce((s, c) => s + (c1[c] / n) * (c2[c] / n), 0)
  const kappa = pe >= 1 ? 1 : (po - pe) / (1 - pe)
  return { kappa, po, n, conflicts: rated.filter((r) => r.d1 !== r.d2).length }
}

export const kappaLabel = (k: number) =>
  k < 0 ? 'poor' : k < 0.2 ? 'slight' : k < 0.4 ? 'fair' : k < 0.6 ? 'moderate' : k < 0.8 ? 'substantial' : 'almost perfect'

// Records that clear title/abstract and go to full-text assessment.
export const advanced = (recs: ScreenRecord[]) => recs.filter((r) => taStatus(r) === 'advance')

// Derive the PRISMA screening counts from the pipeline (search-yield fields kept).
export function derivePrisma(recs: ScreenRecord[], existing: Review['prisma']): Review['prisma'] {
  const adv = advanced(recs)
  const ftExcluded = adv.filter((r) => r.ft === 'exclude')
  const byReason = new Map<string, number>()
  ftExcluded.forEach((r) => {
    const key = (r.ftReason || 'Not specified').trim() || 'Not specified'
    byReason.set(key, (byReason.get(key) || 0) + 1)
  })
  return {
    ...existing,
    screened: recs.length,
    excludedScreen: recs.filter((r) => taStatus(r) === 'excluded').length,
    fullText: adv.length,
    fullTextExcluded: [...byReason.entries()].map(([reason, n]) => ({ reason, n })),
    included: adv.filter((r) => r.ft === 'include').length,
  }
}
