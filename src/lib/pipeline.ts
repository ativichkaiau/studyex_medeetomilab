import type { ProjectState, Instability } from '../types'
import { taStatus, advanced } from './screening'
import { analysisIncluded } from './cohorts'
import { usable, dataIntegrity, measureInfo } from './metaAnalysis'
import { prismaAudit } from './prismaAudit'

/**
 * The research pipeline: search → screen → extract → assess bias → analyse →
 * trace → write. Every stage's state here is computed from the project as it
 * stands — nothing is stored, nothing is estimated. The navigator, the
 * overview, the context panel and the status bar all read this one model.
 */

export type StageId = 'protocol' | 'literature' | 'screening' | 'extraction' | 'risk_of_bias' | 'statistics' | 'prisma' | 'manuscript'
export type StageState = 'empty' | 'pending' | 'active' | 'ready' | 'done' | 'blocked' | 'draft' | 'mismatch'

export interface Stage {
  id: StageId
  /** the label as the system writes it: screening, risk_of_bias */
  label: string
  /** what the stage does to the evidence, in the pipeline metaphor */
  verb: string
  to: string
  state: StageState
  metrics: { k: string; v: string | number }[]
  /** 0..1 where the stage has a meaningful completion */
  progress?: number
  issues: number
  /** one line: what stands in the way, or what was last true */
  note: string
  deps: StageId[]
}

export const STAGE_ORDER: StageId[] = ['protocol', 'literature', 'screening', 'extraction', 'risk_of_bias', 'statistics', 'prisma', 'manuscript']

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

export function pipeline(s: ProjectState): Stage[] {
  const r = s.review
  const recs = r.screening ?? []
  const included = r.studies.filter(analysisIncluded)

  // ---- protocol · DEFINE ----
  const pico = [r.pico.p, r.pico.i, r.pico.c, r.pico.o].filter((x) => x.trim()).length
  const registered = !!r.registration?.trim() || s.project.preRegistered
  const protoChecks = [!!r.question.trim(), pico === 4, r.inclusion.length > 0, r.databases.length > 0, r.searches.length > 0, registered]
  const protoDone = protoChecks.filter(Boolean).length
  const protocol: Stage = {
    id: 'protocol', label: 'protocol', verb: 'define', to: '/protocol', deps: [],
    state: protoDone === 0 ? 'empty' : protoDone === protoChecks.length ? 'done' : protoDone >= 5 ? 'ready' : 'active',
    progress: protoDone / protoChecks.length,
    issues: 0,
    metrics: [{ k: 'question', v: r.question.trim() ? 'set' : '—' }, { k: 'pico', v: `${pico}/4` }, { k: 'databases', v: r.databases.length }, { k: 'registered', v: registered ? 'yes' : 'no' }],
    note: protoDone === 0 ? 'no question or PICO yet' : !registered ? 'not registered' : protoDone === protoChecks.length ? 'specification complete' : `${protoChecks.length - protoDone} of ${protoChecks.length} fields open`,
  }

  // ---- literature · INGEST ----
  const identified = r.prisma.dbRecords + r.prisma.otherRecords
  const literature: Stage = {
    id: 'literature', label: 'literature', verb: 'ingest', to: '/radar', deps: ['protocol'],
    state: s.papers.length === 0 && identified === 0 && r.searches.length === 0 ? 'empty' : 'active',
    issues: 0,
    metrics: [{ k: 'papers', v: s.papers.length }, { k: 'identified', v: identified }, { k: 'search strings', v: r.searches.length }],
    note: identified > 0 ? `${identified.toLocaleString()} records identified` : s.papers.length > 0 ? plural(s.papers.length, 'paper') + ' on the project' : 'no records ingested',
  }

  // ---- screening · FILTER ----
  const status = recs.map(taStatus)
  const pending = status.filter((x) => x === 'pending').length
  const conflicts = status.filter((x) => x === 'conflict').length
  const adv = advanced(recs)
  const ftPending = adv.filter((x) => !x.ft).length
  const inclN = adv.filter((x) => x.ft === 'include').length
  const decided = recs.length - pending - conflicts - ftPending
  const screening: Stage = {
    id: 'screening', label: 'screening', verb: 'filter', to: '/screening', deps: ['literature'],
    state: recs.length === 0 ? 'empty' : pending + conflicts + ftPending > 0 ? 'active' : 'done',
    progress: recs.length ? decided / recs.length : undefined,
    issues: conflicts,
    metrics: [{ k: 'records', v: recs.length }, { k: 'completed', v: decided }, { k: 'conflicts', v: conflicts }, { k: 'included', v: inclN }],
    note: recs.length === 0 ? 'screening_queue: empty' : conflicts ? `${plural(conflicts, 'conflict')} to resolve` : pending ? `${pending} awaiting title/abstract` : ftPending ? `${ftPending} awaiting full text` : 'all records decided',
  }

  // ---- extraction · PARSE ----
  const withData = included.filter((x) => usable(x, r.effect)).length
  const integrity = dataIntegrity(r.studies, r.effect)
  const errors = integrity.filter((x) => x.level === 'error').length
  const extraction: Stage = {
    id: 'extraction', label: 'extraction', verb: 'parse', to: '/studies', deps: ['screening'],
    state: r.studies.length === 0 ? 'empty' : withData === 0 ? 'pending' : withData === included.length && errors === 0 ? 'ready' : 'active',
    progress: included.length ? withData / included.length : undefined,
    issues: integrity.length,
    metrics: [{ k: 'studies', v: r.studies.length }, { k: 'included', v: included.length }, { k: `with ${measureInfo(r.effect).binary ? '2×2' : 'mean/SD'}`, v: withData }, { k: 'flags', v: integrity.length }],
    note: r.studies.length === 0 ? '0 studies' : errors ? `${plural(errors, 'invalid value')}` : withData < included.length ? `${included.length - withData} included without outcome data` : `${withData} studies parsed`,
  }

  // ---- risk of bias · VALIDATE ----
  const domains = r.robDomains
  const assessed = included.filter((x) => domains.length > 0 && domains.every((d) => x.rob?.[d])).length
  const riskOfBias: Stage = {
    id: 'risk_of_bias', label: 'risk_of_bias', verb: 'validate', to: '/rob', deps: ['extraction'],
    state: domains.length === 0 ? 'blocked' : included.length === 0 ? 'pending' : assessed === included.length ? 'done' : 'active',
    progress: included.length && domains.length ? assessed / included.length : undefined,
    issues: 0,
    metrics: [{ k: 'tool', v: r.robTool || '—' }, { k: 'domains', v: domains.length }, { k: 'assessed', v: `${assessed}/${included.length}` }],
    note: domains.length === 0 ? 'no appraisal domains defined' : included.length === 0 ? 'no included studies yet' : assessed === included.length ? 'every included study assessed' : `${included.length - assessed} awaiting assessment`,
  }

  // ---- statistics · COMPUTE ----
  const k = withData
  const statistics: Stage = {
    id: 'statistics', label: 'statistics', verb: 'compute', to: '/meta', deps: ['extraction'],
    state: k >= 2 ? 'ready' : 'blocked',
    issues: 0,
    metrics: [{ k: 'k', v: k }, { k: 'effect', v: r.effect }, { k: 'model', v: r.model === 'random' ? 'random-effects' : 'fixed-effect' }],
    note: k >= 2 ? `pooling ${k} studies` : `needs ≥2 studies with outcome data (k = ${k})`,
  }

  // ---- PRISMA · TRACE ----
  const checks = prismaAudit(r, included.length)
  const prisma: Stage = {
    id: 'prisma', label: 'prisma', verb: 'trace', to: '/prisma', deps: ['screening'],
    state: identified === 0 && r.prisma.screened === 0 ? 'empty' : checks.length ? 'mismatch' : 'ready',
    issues: checks.length,
    metrics: [{ k: 'identified', v: identified }, { k: 'screened', v: r.prisma.screened }, { k: 'included', v: r.prisma.included }],
    note: checks.length ? `${plural(checks.length, 'inconsistency', 'inconsistencies')}` : identified === 0 && r.prisma.screened === 0 ? 'no counts yet' : 'counts consistent',
  }

  // ---- manuscript · COMPILE ----
  const manuscript: Stage = {
    id: 'manuscript', label: 'manuscript', verb: 'compile', to: '/manuscript', deps: ['statistics', 'prisma'],
    state: !r.question.trim() && !r.title.trim() ? 'empty' : 'draft',
    issues: 0,
    metrics: [{ k: 'status', v: !r.question.trim() && !r.title.trim() ? 'empty' : 'draft' }, { k: 'pooled', v: k >= 2 ? 'yes' : 'no' }],
    note: !r.question.trim() && !r.title.trim() ? 'nothing to compile yet' : k >= 2 ? 'compiles from current data' : 'compiles without results',
  }

  return [protocol, literature, screening, extraction, riskOfBias, statistics, prisma, manuscript]
}

/** the state words as the system prints them */
export const STATE_LABEL: Record<StageState, string> = {
  empty: 'EMPTY', pending: 'PENDING', active: 'ACTIVE', ready: 'READY', done: 'DONE', blocked: 'BLOCKED', draft: 'DRAFT', mismatch: 'MISMATCH',
}

/** the project's overall run state, for the top bar */
export function projectState(stages: Stage[], instabilities: Instability[]): { label: string; tone: 'ok' | 'warn' | 'bad' | 'idle' } {
  const highs = instabilities.filter((i) => i.status === 'open' && i.severity === 'high').length
  if (stages.every((st) => st.state === 'empty')) return { label: 'IDLE', tone: 'idle' }
  if (stages.some((st) => st.state === 'mismatch') || highs > 0) return { label: 'ATTENTION', tone: 'warn' }
  return { label: 'READY', tone: 'ok' }
}

/** the stage a route belongs to, if any */
export function stageForPath(path: string): StageId | null {
  const map: Record<string, StageId> = {
    '/protocol': 'protocol', '/radar': 'literature', '/screening': 'screening', '/studies': 'extraction', '/rob': 'risk_of_bias',
    '/meta': 'statistics', '/diagnostic': 'statistics', '/prisma': 'prisma', '/manuscript': 'manuscript', '/references': 'manuscript',
  }
  return map[path] ?? null
}
