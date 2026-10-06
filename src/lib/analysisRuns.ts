import type { AnalysisRun, Review } from '../types'
import { computeMeta, usable } from './metaAnalysis'

/**
 * The analysis log. The pooled analysis is always computed live from the
 * extraction table; logging a run freezes what it was computed from (a
 * fingerprint of every pooled input) and what it produced, so a reported
 * number can be traced to its dataset, and drift from it is visible.
 */

function fnv(s: string): string {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return (h >>> 0).toString(36).padStart(7, '0')
}

/** a fingerprint of exactly what the pooled analysis reads */
export function datasetFingerprint(review: Review): string {
  const pooled = review.studies.filter((s) => usable(s, review.effect)).map((s) => [
    s.id, s.expEvents, s.expTotal, s.ctrlEvents, s.ctrlTotal, s.mean1, s.sd1, s.n1, s.mean2, s.sd2, s.n2,
  ])
  return `ds_${fnv(JSON.stringify([review.effect, review.model, pooled]))}`
}

export const runId = (n: number) => `RUN_${String(n).padStart(4, '0')}`

export function makeRun(review: Review): AnalysisRun {
  const meta = computeMeta(review.studies, review.model, review.effect)
  const runs = review.runs ?? []
  const n = (runs[0]?.n ?? 0) + 1
  const base = {
    id: `run_${Date.now().toString(36)}`,
    n,
    ts: Date.now(),
    outcome: review.outcomeLabel || 'outcome',
    effect: review.effect,
    model: review.model,
    k: meta.k,
    dataset: datasetFingerprint(review),
    studies: review.studies.filter((s) => usable(s, review.effect)).map((s) => s.id),
  }
  if (meta.k < 2) return { ...base, status: 'failed', reason: `insufficient studies with outcome data (k = ${meta.k})` }
  return {
    ...base,
    status: 'success',
    pooled: { est: meta.pooledEst, low: meta.pooledLow, high: meta.pooledHigh },
    het: { I2: meta.I2, tau2: meta.tau2, Q: meta.Q, df: meta.df, p: meta.pValue },
  }
}
