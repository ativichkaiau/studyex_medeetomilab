import type { Review, Study } from '../types'
import { analysisIncluded } from './cohorts'
import { measureInfo, usable } from './metaAnalysis'

/**
 * Extraction as structured parsing: the schema each study is parsed into,
 * and validation against it. Flags are computed from the values as stored —
 * a field the schema needs and the study lacks, a value outside what's
 * possible, a record that appears twice.
 */
export type FlagKind = 'missing required' | 'invalid value' | 'inconsistent value' | 'duplicate record'
export interface ExtractionFlag {
  study: string // Study.id
  kind: FlagKind
  level: 'error' | 'warn'
  field: string
  msg: string
}

export const SCHEMA: { id: string; label: string; fields: string[] }[] = [
  { id: 'study_characteristics', label: 'study_characteristics', fields: ['author', 'year', 'pmid', 'doi', 'design', 'subgroup'] },
  { id: 'participants', label: 'participants', fields: ['registration', 'cohort', 'centers', 'recruitment', 'population'] },
  { id: 'outcomes', label: 'outcomes', fields: ['events / total per arm', 'or mean / SD / n per arm'] },
  { id: 'risk_of_bias', label: 'risk_of_bias', fields: ['one judgement per domain'] },
  { id: 'notes', label: 'notes', fields: ['free text'] },
]

const has = (v: unknown) => v !== undefined && v !== null && v !== ''

export function extractionFlags(review: Review): ExtractionFlag[] {
  const out: ExtractionFlag[] = []
  const binary = measureInfo(review.effect).binary
  for (const s of review.studies) {
    if (!analysisIncluded(s)) continue
    if (!s.year) out.push({ study: s.id, kind: 'missing required', level: 'warn', field: 'year', msg: 'publication year missing' })
    if (binary) {
      const cells = [s.expEvents, s.expTotal, s.ctrlEvents, s.ctrlTotal]
      if (cells.some((v) => !has(v))) out.push({ study: s.id, kind: 'missing required', level: 'warn', field: 'outcomes', msg: `incomplete 2×2 for ${review.effect} — events and total for both arms` })
      if (cells.some((v) => has(v) && (v as number) < 0)) out.push({ study: s.id, kind: 'invalid value', level: 'error', field: 'outcomes', msg: 'negative count' })
      if (has(s.expEvents) && has(s.expTotal) && s.expEvents! > s.expTotal!) out.push({ study: s.id, kind: 'invalid value', level: 'error', field: 'exp_events', msg: `events (${s.expEvents}) exceed the index-arm total (${s.expTotal})` })
      if (has(s.ctrlEvents) && has(s.ctrlTotal) && s.ctrlEvents! > s.ctrlTotal!) out.push({ study: s.id, kind: 'invalid value', level: 'error', field: 'ctrl_events', msg: `events (${s.ctrlEvents}) exceed the comparator total (${s.ctrlTotal})` })
      if (s.expEvents === 0 && s.ctrlEvents === 0) out.push({ study: s.id, kind: 'inconsistent value', level: 'warn', field: 'outcomes', msg: 'double-zero events — carries no information for OR/RR' })
    } else {
      const vals = [s.mean1, s.sd1, s.n1, s.mean2, s.sd2, s.n2]
      if (vals.some((v) => !has(v))) out.push({ study: s.id, kind: 'missing required', level: 'warn', field: 'outcomes', msg: 'incomplete mean / SD / n for SMD' })
      if ((has(s.sd1) && s.sd1! <= 0) || (has(s.sd2) && s.sd2! <= 0)) out.push({ study: s.id, kind: 'invalid value', level: 'error', field: 'sd', msg: 'SD must be positive' })
      if ((has(s.n1) && s.n1! < 2) || (has(s.n2) && s.n2! < 2)) out.push({ study: s.id, kind: 'invalid value', level: 'error', field: 'n', msg: 'group size below 2' })
    }
  }
  // the same report entered twice
  const seen = new Map<string, Study>()
  for (const s of review.studies) {
    for (const key of [s.pmid && `pmid:${s.pmid.trim()}`, s.doi && `doi:${s.doi.trim().toLowerCase()}`].filter(Boolean) as string[]) {
      const prev = seen.get(key)
      if (prev && prev.id !== s.id) out.push({ study: s.id, kind: 'duplicate record', level: 'warn', field: key.split(':')[0], msg: `same ${key.split(':')[0].toUpperCase()} as ${prev.author} ${prev.year}` })
      else seen.set(key, s)
    }
  }
  return out
}

/** how much of each schema section is filled across the included studies */
export function schemaCoverage(review: Review): Record<string, { done: number; of: number }> {
  const incl = review.studies.filter(analysisIncluded)
  const n = incl.length
  const domains = review.robDomains
  return {
    study_characteristics: { done: incl.filter((s) => s.author && s.year && s.design && (s.pmid || s.doi)).length, of: n },
    participants: { done: incl.filter((s) => s.cohort && (s.cohort.population || s.cohort.name || s.cohort.registration)).length, of: n },
    outcomes: { done: incl.filter((s) => usable(s, review.effect)).length, of: n },
    risk_of_bias: { done: domains.length ? incl.filter((s) => domains.every((d) => s.rob?.[d])).length : 0, of: domains.length ? n : 0 },
    notes: { done: incl.filter((s) => s.note?.trim()).length, of: n },
  }
}
