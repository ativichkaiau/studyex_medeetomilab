import type { ProjectState } from '../types'
import type { MetaResult } from './metaAnalysis'
import type { Reference } from './references'
import { prismaAudit } from './prismaAudit'
import { analysisIncluded } from './cohorts'

/**
 * The manuscript as a compiled artifact: its sections, and QA over the
 * compile. Only checks the system can compute from the project are run —
 * an input that leaves a gap in the compiled text, PRISMA counts that don't
 * trace, an outcome with no estimate to report, a reference listed twice, an
 * evidence-linked claim with no supporting source.
 */

export type SectionStatus = 'empty' | 'draft' | 'review' | 'final'
export const SECTION_IDS = ['abstract', 'introduction', 'methods', 'results', 'discussion', 'references', 'checklist'] as const
export type SectionId = (typeof SECTION_IDS)[number]

export interface MsCheck {
  id: string
  check: 'unfilled field' | 'PRISMA inconsistency' | 'unreported outcome' | 'duplicate reference' | 'unsupported claim'
  section: SectionId | 'evidence'
  level: 'error' | 'warn'
  msg: string
  action: { label: string; to: string }
}

export function manuscriptChecks(s: ProjectState, meta: MetaResult, refs: Reference[]): MsCheck[] {
  const r = s.review
  const out: MsCheck[] = []
  const blank = (id: string, section: SectionId, field: string, to = '/protocol') =>
    out.push({ id, check: 'unfilled field', section, level: 'warn', msg: `${field} is empty — the compiled text has a gap here`, action: { label: 'fill in', to } })

  if (!r.question.trim()) blank('question', 'abstract', 'review question')
  if (!r.title.trim()) blank('title', 'abstract', 'review title')
  const missingPico = (['p', 'i', 'c', 'o'] as const).filter((k) => !r.pico[k].trim())
  if (missingPico.length) blank('pico', 'introduction', `PICO (${missingPico.map((k) => k.toUpperCase()).join(', ')})`)
  if (!r.inclusion.length || !r.exclusion.length) blank('criteria', 'methods', `${!r.inclusion.length ? 'inclusion' : 'exclusion'} criteria`)
  if (!r.databases.length) blank('databases', 'methods', 'information sources')
  if (!r.searches.length) blank('search', 'methods', 'search strategy')
  if (!r.robDomains.length) blank('rob', 'methods', 'risk-of-bias domains', '/rob')
  if (!r.outcomeLabel.trim() || !r.indexLabel.trim() || !r.comparatorLabel.trim()) blank('labels', 'results', 'outcome / index / comparator labels')

  const prisma = prismaAudit(r, r.studies.filter(analysisIncluded).length)
  if (prisma.length) out.push({ id: 'prisma', check: 'PRISMA inconsistency', section: 'methods', level: 'error', msg: `${prisma.length} PRISMA count${prisma.length === 1 ? '' : 's'} do not trace — the selection paragraph and Figure 1 report them as stored`, action: { label: 'inspect prisma', to: '/prisma' } })

  if (meta.k < 2) out.push({ id: 'outcome', check: 'unreported outcome', section: 'results', level: 'error', msg: `no pooled estimate for ${r.outcomeLabel || 'the outcome'} (k = ${meta.k}) — Results and Abstract print placeholders`, action: { label: 'inspect extraction', to: '/studies' } })

  const seen = new Map<string, Reference>()
  for (const ref of refs) {
    const key = ref.title.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
    if (key.length < 12) continue
    const prev = seen.get(key)
    if (prev) out.push({ id: `dup-${ref.id}`, check: 'duplicate reference', section: 'references', level: 'warn', msg: `"${ref.title.slice(0, 70)}" is listed twice (${prev.citeKey || prev.author} and ${ref.citeKey || ref.author})`, action: { label: 'open references', to: '/references' } })
    else seen.set(key, ref)
  }

  for (const c of s.evidence?.claims ?? []) {
    if (c.document !== 'manuscript') continue
    if (!c.links.some((l) => l.stance === 'supports')) {
      out.push({ id: `claim-${c.id}`, check: 'unsupported claim', section: 'evidence', level: 'warn', msg: `"${c.text.slice(0, 80)}${c.text.length > 80 ? '…' : ''}" has ${c.links.length ? 'only conflicting or contextual' : 'no'} linked evidence`, action: { label: 'open evidence', to: '/evidence' } })
    }
  }
  return out
}

/** split the compiled markdown into its sections, with word counts */
export function compiledSections(md: string, refs: number): { id: SectionId; title: string; words: number }[] {
  const parts = md.split(/^## /m).slice(1)
  const words = (t: string) => t.replace(/[#*|`>-]/g, ' ').split(/\s+/).filter((w) => /[A-Za-z0-9]/.test(w)).length
  const pick = (re: RegExp) => parts.find((p) => re.test(p.split('\n')[0])) ?? ''
  return [
    { id: 'abstract', title: 'abstract', words: words(pick(/^Abstract/).split('\n').slice(1).join(' ')) },
    { id: 'introduction', title: 'introduction', words: words(pick(/Introduction/).split('\n').slice(1).join(' ')) },
    { id: 'methods', title: 'methods', words: words(pick(/Methods/).split('\n').slice(1).join(' ')) },
    { id: 'results', title: 'results', words: words(pick(/Results/).split('\n').slice(1).join(' ')) },
    { id: 'discussion', title: 'discussion', words: words(pick(/Discussion/).split('\n').slice(1).join(' ')) },
    { id: 'references', title: 'references', words: refs },
    { id: 'checklist', title: 'prisma_checklist', words: words(pick(/PRISMA 2020 checklist/).split('\n').slice(1).join(' ')) },
  ]
}
