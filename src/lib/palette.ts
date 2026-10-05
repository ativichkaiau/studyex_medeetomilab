import type { NodeType, Evidence, InstabilityType, Severity } from '../types'

// Categorical colours for the knowledge graph's node types. Muted, mid-tone
// fills that carry white labels and read on both the graphite and the light
// theme. Literal hex, not tokens: the WebGL layers view parses them.
export const NODE_COLORS: Record<NodeType, string> = {
  Gene: '#3f63e0',
  Variant: '#5b6fb8',
  EpigeneticMark: '#7a64c4',
  RegulatoryRegion: '#8b5aa8',
  CellType: '#2b8a99',
  Assay: '#2f8a5c',
  ClinicalPhenotype: '#b4483f',
  Drug: '#a87a1e',
  Paper: '#5d6470',
  Hypothesis: '#4a5a8c',
  Figure: '#3b8f7c',
  ManuscriptSection: '#4d5563',
}

export const nodeColor = (t: NodeType): string => NODE_COLORS[t] ?? '#5d6470'

// Edge styling by evidence strength — how well supported the causal link is.
export const EVIDENCE_STYLE: Record<Evidence, { color: string; dash?: string; label: string }> = {
  none: { color: '#8a909a', dash: '5 5', label: 'no evidence' },
  predicted: { color: '#c9922e', dash: '6 5', label: 'predicted' },
  correlational: { color: '#c9922e', label: 'correlational' },
  causal: { color: '#3d9b6c', label: 'causal' },
  established: { color: '#5b7cf0', label: 'established' },
}

// Severity is printed in the theme's status tokens (index.css).
export const SEVERITY_COLOR: Record<Severity, string> = {
  low: 'var(--success)',
  med: 'var(--warning)',
  high: 'var(--danger)',
}

export const SEVERITY_LABEL: Record<Severity, string> = { high: 'high', med: 'medium', low: 'low' }

export const INSTABILITY_LABEL: Record<InstabilityType, string> = {
  unclear_hypothesis: 'Unclear hypothesis',
  weak_mechanistic_chain: 'Weak mechanistic chain',
  missing_control: 'Missing control group',
  assay_mismatch: 'Assay mismatch',
  underpowered_design: 'Underpowered design',
  literature_gap: 'Literature gap',
  statistical_ambiguity: 'Statistical ambiguity',
  infeasible_protocol: 'Infeasible protocol',
  manuscript_story_weakness: 'Manuscript-story weakness',
  srma_gap: 'Review rigor gap',
}

/** the rule family each finding comes from, as the QA module prints it */
export const INSTABILITY_TYPE: Record<InstabilityType, string> = {
  unclear_hypothesis: 'hypothesis definition',
  weak_mechanistic_chain: 'causal chain',
  missing_control: 'design control',
  assay_mismatch: 'model validity',
  underpowered_design: 'statistical power',
  literature_gap: 'evidence coverage',
  statistical_ambiguity: 'analysis plan',
  infeasible_protocol: 'feasibility',
  manuscript_story_weakness: 'reporting',
  srma_gap: 'review methods',
}

/** the module a finding is repaired in */
export const INSTABILITY_SOURCE: Record<InstabilityType, { label: string; to: string }> = {
  unclear_hypothesis: { label: 'hypotheses', to: '/hypotheses' },
  weak_mechanistic_chain: { label: 'mechanism', to: '/mechanism' },
  missing_control: { label: 'assays', to: '/assays' },
  assay_mismatch: { label: 'assays', to: '/assays' },
  underpowered_design: { label: 'power', to: '/power' },
  literature_gap: { label: 'literature', to: '/radar' },
  statistical_ambiguity: { label: 'protocol', to: '/protocol' },
  infeasible_protocol: { label: 'assays', to: '/assays' },
  manuscript_story_weakness: { label: 'hypotheses', to: '/hypotheses' },
  srma_gap: { label: 'protocol', to: '/protocol' },
}
