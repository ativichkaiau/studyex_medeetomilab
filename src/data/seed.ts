import type { ProjectState } from '../types'

// ============================================================
// Seed project — "Molecular Epigenetic Regulation of Sodium
// Channel Genes in Brugada Syndrome". Everything downstream
// (dashboard, sensors, graph) is derived from this one object.
// Paper identifiers are left blank on purpose — they are slots
// to fill from Literature Radar, not asserted citations.
// ============================================================

export const seed: ProjectState = {
  project: {
    id: 'brs-epi',
    theoryReference: 'brugada',
    name: 'Epigenetic and Non-coding Regulatory Mechanisms of SCN5A in Brugada Syndrome',
    code: 'BrS-EPI',
    domain: 'Cardiovascular genetics · epigenetics · systematic review (Phase 1)',
    centralHypothesis:
      'In Brugada syndrome, epigenetic and non-coding regulation of SCN5A — promoter and enhancer DNA methylation, repressive histone/chromatin remodeling, cis-regulatory variation at the SCN5A–SCN10A enhancer, and microRNA/lncRNA-mediated repression — lowers Nav1.5 expression, sodium current (I_Na) and conduction reserve, contributing to the type-1 ECG and arrhythmic risk beyond, and additively to, SCN5A coding mutations. Phase 1 systematically synthesizes this evidence to rank the best-supported mechanisms and biomarker candidates for Phase-2 mechanistic validation.',
    preRegistered: false,
    primaryEndpoint: undefined,
    stage: 'Protocol',
  },

  // ---- knowledge-graph nodes (x,y are layout hints in a 1000×640 space) ----
  nodes: [],

  // ---- edges (node→node). evidence grades how "planted" the link is ----
  edges: [],

  // ---- hypotheses ----
  hypotheses: [],

  // ---- assays ----
  assays: [],

  // ---- papers (real references pulled from PubMed) ----
  papers: [],

  // ---- systematic review & meta-analysis ----
  review: {
    title: '',
    question: '',
    pico: { p: '', i: '', c: '', o: '' },
    inclusion: [],
    exclusion: [],
    databases: [],
    searches: [],
    registration: undefined,
    screenerUrl: '',
    outcomeLabel: '',
    indexLabel: '',
    comparatorLabel: '',
    effect: 'OR',
    model: 'random',
    robTool: undefined,
    robDomains: [],
    prisma: {
      dbRecords: 0,
      otherRecords: 0,
      duplicates: 0,
      screened: 0,
      excludedScreen: 0,
      fullText: 0,
      fullTextExcluded: [],
      included: 0,
    },
    studies: [],
    dxStudies: [],
  },

  activity: [],
  instabilityOverrides: {},
}

// A minimal, valid project — the "New project / new review" template.
export function blankProject(id: string, name: string, code: string, opts?: { question?: string; index?: string; comparator?: string; outcome?: string }): ProjectState {
  return {
    project: { id, name, code, domain: 'Systematic review', centralHypothesis: '', preRegistered: false, primaryEndpoint: undefined, stage: 'Idea' },
    nodes: [],
    edges: [],
    hypotheses: [],
    assays: [],
    papers: [],
    review: {
      title: name,
      question: opts?.question ?? '',
      pico: { p: '', i: opts?.index ?? '', c: opts?.comparator ?? '', o: opts?.outcome ?? '' },
      inclusion: [],
      exclusion: [],
      databases: ['PubMed / MEDLINE', 'Embase', 'Cochrane CENTRAL'],
      searches: [],
      registration: undefined,
      screenerUrl: 'https://vestrippn-srma-telemetry.vercel.app',
      outcomeLabel: opts?.outcome ?? 'Outcome',
      indexLabel: opts?.index ?? 'Index',
      comparatorLabel: opts?.comparator ?? 'Comparator',
      effect: 'OR',
      model: 'random',
      robTool: 'Newcastle-Ottawa Scale',
      robDomains: ['Selection', 'Comparability', 'Outcome'],
      prisma: { dbRecords: 0, otherRecords: 0, duplicates: 0, screened: 0, excludedScreen: 0, fullText: 0, fullTextExcluded: [], included: 0 },
      studies: [],
    },
    activity: [],
    instabilityOverrides: {},
  }
}
