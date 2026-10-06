import type { Review, Study } from '../types'
import { studyId } from './ids'

/**
 * The extraction table as CSV. Column names are the ones the importer
 * (lib/importStudies.ts) reads back, so an exported table re-imports
 * cleanly, including inclusion, domain judgements and multiline notes.
 * A reimport receives fresh study IDs, so the CSV is a table export rather
 * than a replacement for the full project JSON backup.
 */
const esc = (v: unknown) => {
  if (v === undefined || v === null) return ''
  const s = String(v)
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function extractionCsv(review: Review): string {
  const domains = review.robDomains
  const head = [
    'study_id', 'author', 'year', 'pmid', 'doi', 'design', 'subgroup', 'include',
    'exp_events', 'exp_total', 'ctrl_events', 'ctrl_total',
    'mean1', 'sd1', 'index_n', 'mean2', 'sd2', 'control_n',
    'registration', 'cohort_name', 'centers', 'recruitment_start', 'recruitment_end', 'population',
    ...domains.map((d) => `rob:${d}`),
    'note',
  ]
  const row = (s: Study) => [
    studyId(s.id), s.author, s.year, s.pmid, s.doi, s.design, s.subgroup, s.include ? 'yes' : 'no',
    s.expEvents, s.expTotal, s.ctrlEvents, s.ctrlTotal,
    s.mean1, s.sd1, s.n1, s.mean2, s.sd2, s.n2,
    s.cohort?.registration, s.cohort?.name, s.cohort?.centers, s.cohort?.recruitmentStart, s.cohort?.recruitmentEnd, s.cohort?.population,
    ...domains.map((d) => s.rob?.[d]),
    s.note,
  ]
  return [head, ...review.studies.map(row)].map((r) => r.map(esc).join(',')).join('\n') + '\n'
}

export function downloadText(content: string, name: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  URL.revokeObjectURL(url)
}
