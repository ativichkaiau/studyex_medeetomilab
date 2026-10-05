import type { StageId } from './pipeline'

/**
 * Every module in the runtime: its route, the id it prints as in paths and
 * the navigator (~/project/BRS-EPI/risk_of_bias), and a human title. The
 * navigator, the top bar, document titles, the command palette and Terra's
 * page context all read this list. Routes themselves are unchanged.
 */
export type ModuleGroup = 'project' | 'pipeline' | 'qa' | 'output' | 'knowledge' | 'bench' | 'program'

export interface ModuleDef {
  to: string
  id: string
  title: string
  group: ModuleGroup
  stage?: StageId
  /** nested under the stage above it in the navigator */
  child?: boolean
  /** a few words for tooltips and the command palette */
  hint: string
}

export const MODULES: ModuleDef[] = [
  { to: '/', id: 'overview', title: 'Project overview', group: 'project', hint: 'project state, pipeline, QA' },

  { to: '/protocol', id: 'protocol', title: 'Protocol', group: 'pipeline', stage: 'protocol', hint: 'question, PICO, criteria, search strategy' },
  { to: '/radar', id: 'literature', title: 'Literature', group: 'pipeline', stage: 'literature', hint: 'search, ingest, living review' },
  { to: '/screening', id: 'screening', title: 'Screening', group: 'pipeline', stage: 'screening', hint: 'title/abstract and full-text classification' },
  { to: '/studies', id: 'extraction', title: 'Extraction', group: 'pipeline', stage: 'extraction', hint: 'structured study data' },
  { to: '/rob', id: 'risk_of_bias', title: 'Risk of bias', group: 'pipeline', stage: 'risk_of_bias', hint: 'per-study, per-domain appraisal' },
  { to: '/meta', id: 'statistics', title: 'Statistics', group: 'pipeline', stage: 'statistics', hint: 'pooling, heterogeneity, bias, sensitivity' },
  { to: '/diagnostic', id: 'statistics/diagnostic', title: 'Diagnostic accuracy', group: 'pipeline', stage: 'statistics', child: true, hint: 'sensitivity, specificity, SROC' },
  { to: '/prisma', id: 'prisma', title: 'PRISMA', group: 'pipeline', stage: 'prisma', hint: 'selection trace and audit' },
  { to: '/manuscript', id: 'manuscript', title: 'Manuscript', group: 'pipeline', stage: 'manuscript', hint: 'compiled draft, PRISMA checklist, QA' },

  { to: '/suspension', id: 'rigor', title: 'Rigor monitor', group: 'qa', hint: 'design and methods QA' },

  { to: '/artifacts', id: 'artifacts', title: 'Artifacts', group: 'output', hint: 'figures, tables, exports' },
  { to: '/references', id: 'references', title: 'References', group: 'output', hint: 'citation library, BibTeX, RIS' },
  { to: '/poster', id: 'poster_slides', title: 'Poster & slides', group: 'output', hint: 'dissemination formats' },
  { to: '/reviewers', id: 'rebuttal', title: 'Response to reviewers', group: 'output', hint: 'revision letter' },

  { to: '/graph', id: 'knowledge_graph', title: 'Knowledge graph', group: 'knowledge', hint: 'typed nodes and edges' },
  { to: '/mechanism', id: 'mechanism', title: 'Mechanism map', group: 'knowledge', hint: 'causal chain and weak links' },
  { to: '/hypotheses', id: 'hypotheses', title: 'Hypotheses', group: 'knowledge', hint: 'falsifiable claims and evidence' },
  { to: '/theory', id: 'theory', title: 'Theory', group: 'knowledge', hint: 'project reference chapter' },
  { to: '/evidence', id: 'evidence', title: 'Evidence', group: 'knowledge', hint: 'source passages and claim links' },
  { to: '/review', id: 'knowledge_review', title: 'Knowledge review', group: 'knowledge', hint: 'questions over the project theory' },

  { to: '/assays', id: 'assays', title: 'Assays', group: 'bench', hint: 'claim ↔ assay matrix' },
  { to: '/power', id: 'power', title: 'Power & sample size', group: 'bench', hint: 'two-sample power calculator' },
  { to: '/aims', id: 'specific_aims', title: 'Specific aims', group: 'bench', hint: 'grant aims page' },

  { to: '/pit-wall', id: 'dashboard', title: 'Dashboard', group: 'program', hint: 'one project at a glance' },
  { to: '/portfolio', id: 'portfolio', title: 'Portfolio', group: 'program', hint: 'all projects' },
  { to: '/litlink', id: 'litlink', title: 'LitLink', group: 'program', hint: 'mentored literature review program' },
]

export const GROUP_LABEL: Record<ModuleGroup, string> = {
  project: 'project', pipeline: 'pipeline', qa: 'qa', output: 'output', knowledge: 'knowledge', bench: 'bench', program: 'program',
}

const byPath = new Map(MODULES.map((m) => [m.to, m]))

export function moduleFor(path: string): ModuleDef | null {
  if (path.startsWith('/shared/')) return { to: path, id: 'shared', title: 'Shared project', group: 'project', hint: 'import a shared project' }
  return byPath.get(path) ?? null
}

/** the architectural path a page lives at: ~/project/BRS-EPI/screening */
export function projectPath(code: string, path: string): { root: string; code: string; module: string } {
  const m = moduleFor(path)
  return { root: '~/project/', code, module: m && m.id !== 'overview' ? m.id : '' }
}
