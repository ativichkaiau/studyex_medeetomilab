import type { Review } from '../types'
import { taStatus, advanced } from './screening'

/**
 * PRISMA as a trace: the flow's own arithmetic, and the stored counts against
 * the in-app screening log. Every check compares two numbers the project
 * already holds; none fires on an empty review.
 */
export interface PrismaCheck {
  id: string
  level: 'error' | 'warn'
  label: string
  /** the two sides being compared */
  a: { k: string; v: number }
  b: { k: string; v: number }
  action: { label: string; to: string }
}

export function prismaAudit(review: Review, includedStudies: number): PrismaCheck[] {
  const p = review.prisma
  const out: PrismaCheck[] = []
  const identified = p.dbRecords + p.otherRecords
  const ftOut = p.fullTextExcluded.reduce((s, e) => s + (e.n || 0), 0)
  const push = (c: PrismaCheck) => {
    if (c.a.v !== c.b.v) out.push(c)
  }

  // the flow's arithmetic: each box follows from the one above it
  if (identified > 0 && p.screened > 0) {
    push({ id: 'dedup', level: 'error', label: 'records after deduplication ≠ records screened',
      a: { k: 'identified − duplicates', v: identified - p.duplicates }, b: { k: 'screened', v: p.screened },
      action: { label: 'edit counts', to: '/prisma' } })
  }
  if (p.screened > 0 && (p.fullText > 0 || p.excludedScreen > 0)) {
    push({ id: 'screen', level: 'error', label: 'screened − excluded ≠ full texts assessed',
      a: { k: 'screened − excluded', v: p.screened - p.excludedScreen }, b: { k: 'full texts assessed', v: p.fullText },
      action: { label: 'edit counts', to: '/prisma' } })
  }
  if (p.fullText > 0) {
    push({ id: 'eligibility', level: 'error', label: 'full texts − exclusions ≠ studies included',
      a: { k: 'full texts − excluded', v: p.fullText - ftOut }, b: { k: 'included', v: p.included },
      action: { label: 'edit counts', to: '/prisma' } })
  }

  // stored counts against the screening log, when screening happens here
  const recs = review.screening ?? []
  if (recs.length > 0) {
    const adv = advanced(recs)
    push({ id: 'log-screened', level: 'warn', label: 'PRISMA_MISMATCH · records screened',
      a: { k: 'PRISMA', v: p.screened }, b: { k: 'screening log', v: recs.length },
      action: { label: 'push from screening', to: '/screening' } })
    push({ id: 'log-excluded', level: 'warn', label: 'PRISMA_MISMATCH · excluded at title/abstract',
      a: { k: 'PRISMA', v: p.excludedScreen }, b: { k: 'logged decisions', v: recs.filter((r) => taStatus(r) === 'excluded').length },
      action: { label: 'push from screening', to: '/screening' } })
    push({ id: 'log-fulltext', level: 'warn', label: 'PRISMA_MISMATCH · full texts assessed',
      a: { k: 'PRISMA', v: p.fullText }, b: { k: 'screening log', v: adv.length },
      action: { label: 'push from screening', to: '/screening' } })
    push({ id: 'log-included', level: 'warn', label: 'PRISMA_MISMATCH · included',
      a: { k: 'PRISMA', v: p.included }, b: { k: 'screening log', v: adv.filter((r) => r.ft === 'include').length },
      action: { label: 'push from screening', to: '/screening' } })
  }

  // the flow's endpoint against the extraction table
  if (p.included > 0 && review.studies.length > 0) {
    push({ id: 'studies', level: 'warn', label: 'PRISMA included ≠ studies in extraction',
      a: { k: 'PRISMA included', v: p.included }, b: { k: 'included in extraction', v: includedStudies },
      action: { label: 'open extraction', to: '/studies' } })
  }
  return out
}

/** full-text exclusions logged without a reason */
export const unexplainedExclusions = (review: Review) =>
  review.prisma.fullTextExcluded.filter((e) => e.n > 0 && (!e.reason.trim() || /^not specified$/i.test(e.reason.trim()))).reduce((s, e) => s + e.n, 0)
