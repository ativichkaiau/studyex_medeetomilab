// studyex_medeetomilab — the research project schema.
// Everything in the app is a typed node, a typed edge, or a view over them.

export type NodeType =
  | 'Gene'
  | 'Variant'
  | 'EpigeneticMark'
  | 'RegulatoryRegion'
  | 'CellType'
  | 'Assay'
  | 'ClinicalPhenotype'
  | 'Drug'
  | 'Paper'
  | 'Hypothesis'
  | 'Figure'
  | 'ManuscriptSection'

export type EdgeRel =
  | 'encodes'
  | 'regulates'
  | 'loops_to'
  | 'deposited_on'
  | 'represses'
  | 'reduces'
  | 'measured_by'
  | 'performed_in'
  | 'modulates'
  | 'unmasks'
  | 'associated_with'
  | 'predicts'
  | 'tested_by'
  | 'supports'
  | 'refutes'
  | 'visualizes'
  | 'argues'

// How much do we believe a causal edge? Drives the "weak mechanistic chain" sensor.
export type Evidence = 'none' | 'predicted' | 'correlational' | 'causal' | 'established'

export interface GraphNode {
  id: string
  type: NodeType
  label: string
  sublabel?: string
  x?: number // layout hint (0..1000) for graph views
  y?: number // layout hint (0..640)
  props?: Record<string, unknown>
}

export interface GraphEdge {
  id: string
  src: string
  dst: string
  rel: EdgeRel
  evidence?: Evidence
  strength?: number // 0..1 confidence
  testedBy?: string[] // assay node ids that would bridge this edge
}

export type HypothesisStatus = 'draft' | 'testing' | 'supported' | 'refuted'

// A piece of review evidence bearing on a hypothesis (an included study or the
// pooled meta-analysis estimate), tagged with whether it supports or refutes.
export interface HypEvidence {
  kind: 'study' | 'pooled'
  id: string // Study id, or 'pooled'
  stance: 'supports' | 'refutes'
}

export interface Hypothesis {
  id: string // also a GraphNode id (type Hypothesis)
  label: string
  statement: string
  prediction?: { direction: 'positive' | 'negative' | 'none'; effect?: string }
  falsification?: string
  status: HypothesisStatus
  supportingPapers?: string[] // Paper ids
  evidence?: HypEvidence[] // links to review studies / the pooled estimate
  asserts?: string[] // GraphEdge ids this hypothesis claims
  requiresTissue?: string // e.g. "cardiomyocyte" — used by the assay-mismatch sensor
}

export type AssayStatus = 'design' | 'queued' | 'piloting' | 'running' | 'done' | 'blocked'

export interface Assay {
  id: string // also a GraphNode id (type Assay)
  method: string
  measures: string
  cellType: string
  controls?: string
  sampleN?: number
  phase?: 1 | 2 | 3
  effort?: 'low' | 'med' | 'high'
  genomeWide?: boolean // targeted vs genome-wide — drives the power sensor
  expectedEffect?: number // Cohen's d you expect to detect (default 0.8)
  genomeWideTests?: number // approx # of simultaneous tests for multiple-testing correction
  costK?: number // estimated cost, thousands of USD
  weeks?: number // estimated bench duration, weeks
  status: AssayStatus
  claims?: string[] // Hypothesis ids this assay addresses
}

export interface Paper {
  id: string // also a GraphNode id (type Paper)
  pmid?: string
  doi?: string
  title: string
  authors?: string // author string as reported by the source (for citations)
  journal?: string // source journal (for citations)
  year?: number
  stance?: 'supports' | 'refutes' | 'background'
  targets?: string[] // Hypothesis ids
  tags?: string[]
}

export type InstabilityType =
  | 'unclear_hypothesis'
  | 'weak_mechanistic_chain'
  | 'missing_control'
  | 'assay_mismatch'
  | 'underpowered_design'
  | 'literature_gap'
  | 'statistical_ambiguity'
  | 'infeasible_protocol'
  | 'manuscript_story_weakness'
  | 'srma_gap'

export type Severity = 'low' | 'med' | 'high'

export interface Instability {
  id: string
  type: InstabilityType
  severity: Severity
  target: string // node/edge id
  targetLabel?: string
  signal: string // one-line warning sign
  comment: string // substantive reviewer comment — the specific problem, in context
  repair: string // the concrete fix
  status: 'open' | 'acknowledged' | 'resolved'
}

export interface Project {
  id: string
  name: string
  code: string
  domain: string
  centralHypothesis: string
  preRegistered: boolean
  primaryEndpoint?: string
  stage?: string // current lifecycle step (see STAGES)
  theoryReference?: 'brugada' // curated reference attached to the original project
}

export interface TheorySection {
  id: string
  title: string
  group: string
  body: string // Markdown; generated content is never rendered as raw HTML
}

export interface ProjectTheory {
  title: string
  summary: string
  sections: TheorySection[]
  generatedAt: number
  model: string
  sources: Pick<Paper, 'id' | 'title' | 'pmid' | 'doi' | 'authors' | 'year' | 'journal'>[]
}

export interface ActivityEntry {
  id: string
  ts: number
  kind: string
  text: string
}

export const STAGES = ['Idea', 'Concept', 'Lit review', 'Protocol', 'Ethics', 'Data', 'Analysis', 'Synthesis', 'Manuscript', 'Submitted'] as const

// ---- systematic review & meta-analysis (SRMA) ----
export type RobLevel = 'low' | 'some' | 'high'

export interface Study {
  id: string
  author: string
  year: number
  pmid?: string
  doi?: string
  cohort?: CohortProfile
  // A secondary report remains in the library but cannot enter the current pool.
  cohortPrimaryId?: string
  design?: string
  // 2×2 for a binary outcome (OR / RR / RD): exposed = index, ctrl = comparator
  expEvents?: number
  expTotal?: number
  ctrlEvents?: number
  ctrlTotal?: number
  // continuous outcome (SMD): mean / SD / n per group
  mean1?: number
  sd1?: number
  n1?: number
  mean2?: number
  sd2?: number
  n2?: number
  rob?: Record<string, RobLevel>
  subgroup?: string // free-text subgroup label for subgroup analysis
  include: boolean // counts toward the pooled estimate
  note?: string
}

export type EffectMeasure = 'OR' | 'RR' | 'RD' | 'SMD'

// A diagnostic-accuracy study: one 2×2 of an index test against a reference
// standard (e.g. ajmaline challenge / type-1 ECG vs clinical-genetic Brugada).
export interface DiagnosticStudy {
  id: string
  author: string
  year: number
  pmid?: string
  test?: string // the index test (e.g. "Ajmaline challenge")
  tp?: number // true positives
  fp?: number // false positives
  fn?: number // false negatives
  tn?: number // true negatives
  include: boolean // counts toward the pooled sensitivity / specificity
  note?: string
}

// A candidate reference moving through title/abstract → full-text screening.
export type ScreenDecision = 'include' | 'exclude' | 'maybe'
export interface ScreenRecord {
  id: string
  pmid?: string
  title: string
  abstract?: string
  journal?: string
  year?: number
  authors?: string
  d1?: ScreenDecision // reviewer 1, title/abstract
  d2?: ScreenDecision // reviewer 2, title/abstract
  // A third-reviewer resolution of a reviewer conflict. Both original votes
  // stay as they were (Cohen's κ is computed from them); the record's status
  // follows this. Who resolved it, and when, goes to the activity log.
  adjudicated?: ScreenDecision
  reason?: string // title/abstract exclusion reason
  ft?: 'include' | 'exclude' // full-text decision
  ftReason?: string // full-text exclusion reason
}

export type GradeJudgment = 'not serious' | 'serious' | 'very serious'
export interface GradeState {
  design: 'observational' | 'rct'
  rob?: GradeJudgment
  inconsistency?: GradeJudgment
  indirectness?: GradeJudgment
  imprecision?: GradeJudgment
  pubBias?: 'undetected' | 'serious'
  largeEffect?: 'none' | 'large' | 'very large'
}

// One logged analysis: what was pooled, how, and what came out — so a result
// in the manuscript can be traced to the exact dataset that produced it.
export interface AnalysisRun {
  id: string
  n: number // sequence within the project → RUN_0007
  ts: number
  outcome: string
  effect: EffectMeasure
  model: 'random' | 'fixed'
  k: number
  dataset: string // fingerprint of the pooled inputs
  studies: string[] // Study ids pooled
  pooled?: { est: number; low: number; high: number }
  het?: { I2: number; tau2: number; Q: number; df: number; p: number }
  status: 'success' | 'failed'
  reason?: string
}

export interface Review {
  runs?: AnalysisRun[] // the analysis log
  // a section's review state, set by the authors (empty is computed, never stored)
  manuscriptStatus?: Record<string, 'draft' | 'review' | 'final'>
  title: string
  question: string
  pico: { p: string; i: string; c: string; o: string }
  inclusion: string[]
  exclusion: string[]
  databases: string[]
  searches: { db: string; query: string }[]
  registration?: string
  screenerUrl: string
  outcomeLabel: string
  indexLabel: string // the exposed/index group
  comparatorLabel: string
  effect: EffectMeasure
  model: 'random' | 'fixed'
  robDomains: string[]
  robTool?: string // the appraisal instrument the domains come from (e.g. QUIPS, ROBINS-I, Newcastle-Ottawa)
  grade?: GradeState
  screening?: ScreenRecord[] // title/abstract + full-text screening pipeline
  dualExtraction?: boolean // data extracted in duplicate (AMSTAR-2 item 6)
  amstar?: Record<string, 'yes' | 'partial' | 'no'> // AMSTAR-2 self-assessment
  prisma: {
    dbRecords: number
    otherRecords: number
    duplicates: number
    screened: number
    excludedScreen: number
    fullText: number
    fullTextExcluded: { reason: string; n: number }[]
    included: number
  }
  studies: Study[]
  dxStudies?: DiagnosticStudy[] // diagnostic-accuracy 2×2s (SROC meta-analysis)
}

export interface ProjectState {
  project: Project
  theory?: ProjectTheory
  theoryRead?: string[]
  evidence?: EvidenceWorkspace
  theoryUpdates?: Record<string, string>
  cohortReviews?: CohortReview[]
  nodes: GraphNode[]
  edges: GraphEdge[]
  hypotheses: Hypothesis[]
  assays: Assay[]
  papers: Paper[]
  review: Review
  activity: ActivityEntry[]
  // manually-acknowledged/resolved instabilities keyed by id (rules recompute the rest)
  instabilityOverrides: Record<string, 'acknowledged' | 'resolved'>
}

export interface EvidencePassage {
  id: string
  referenceId: string
  title: string
  doi?: string
  pmid?: string
  text: string // verbatim user-supplied text or a selection from extracted PDF text
  locator: string // page, section, paragraph, table, etc.
  origin: 'paste' | 'pdf'
  fileName?: string
  page?: number
  design: string
  limitations: string
  createdAt: number
}

export type EvidenceStance = 'supports' | 'conflicts' | 'context'
export interface EvidenceLink {
  passageId: string
  stance: EvidenceStance
  reason: string
}
export interface EvidenceClaim {
  id: string
  document: 'theory' | 'manuscript'
  sectionId: string
  text: string // exact displayed text; changed prose does not inherit an old link
  links: EvidenceLink[]
  updatedAt: number
}
export interface PublicationNotice {
  doi?: string // notice DOI, distinct from the affected paper's DOI
  type: string
  title: string
  date?: string
  source: string
}
export interface NoticeCheck {
  doi: string // affected paper
  checkedAt: number
  notices: PublicationNotice[]
  error?: string
}
export interface TheoryRevision {
  id: string
  sectionId: string
  sectionTitle: string
  baseline: string
  before: string
  paragraphs: { text: string; links: EvidenceLink[] }[]
  reason: string
  sourceVersions: Record<string, string>
  status: 'pending' | 'approved' | 'rejected'
  createdAt: number
  reviewedAt?: number
  model: string
}
export interface TheoryAssessment {
  id: string
  sourceVersions: Record<string, string>
  summary: string
  createdAt: number
}
export interface EvidenceWorkspace {
  passages: EvidencePassage[]
  claims: EvidenceClaim[]
  revisions: TheoryRevision[]
  assessments: TheoryAssessment[]
  notices: NoticeCheck[]
  autoDraft: boolean
}
export interface CohortProfile {
  registration?: string
  name?: string
  centers?: string
  recruitmentStart?: string
  recruitmentEnd?: string
  population?: string
}
export interface CohortReview {
  id: string
  studyIds: string[]
  primaryId?: string
  decision: 'linked' | 'distinct' | 'reopened'
  reason: string
  fingerprint: string
  createdAt: number
}
