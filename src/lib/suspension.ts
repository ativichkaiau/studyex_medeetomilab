import type { ProjectState, Instability, Severity } from '../types'
import { assayPowerReport, fmtAlpha } from './power'
import { computeMeta } from './metaAnalysis'
import { analysisIncluded } from './cohorts'
import { isRegistered } from './projectFacts'

// ============================================================
// Rigor Monitor — the study-design check engine.
// Pure functions over ProjectState → findings. Each finding
// carries a one-line signal, a substantive reviewer comment
// grounded in the actual project data, and a concrete fix.
// ============================================================

const HIGH_EFFORT_PER_PHASE = 2

export function computeInstabilities(s: ProjectState): Instability[] {
  const out: Instability[] = []
  const edgeById = new Map(s.edges.map((e) => [e.id, e]))
  const nodeLabel = (id: string) => s.nodes.find((n) => n.id === id)?.label ?? id

  // 1 · unclear hypothesis
  for (const h of s.hypotheses) {
    const noFalsify = !h.falsification
    const noDir = !h.prediction || h.prediction.direction === 'none'
    if (noFalsify || noDir) {
      out.push({
        id: `inst_unclear_${h.id}`,
        type: 'unclear_hypothesis',
        severity: 'high',
        target: h.id,
        targetLabel: h.label,
        signal: noFalsify ? 'No falsification criterion.' : 'No predicted direction.',
        comment: noFalsify
          ? `${h.label} states a mechanism but no criterion that would disprove it. As written it can be illustrated but not tested — any result can be read as consistent with it. Define the specific observation, effect threshold, and uncertainty that would force you to revise it.`
          : `${h.label} has no pre-specified direction or effect size, so it cannot be confirmed or refuted quantitatively. State whether the effect is positive or negative and how large you expect it to be.`,
        repair: 'Rewrite as if/then with a direction, an effect size, and the observation that would kill it.',
        status: 'open',
      })
    }
  }

  // 2 · weak mechanistic chain
  for (const h of s.hypotheses) {
    for (const eid of h.asserts ?? []) {
      const e = edgeById.get(eid)
      if (!e) continue
      const soft = e.evidence === 'none' || e.evidence === 'predicted'
      const unbridged = !e.testedBy || e.testedBy.length === 0
      if (soft && unbridged) {
        out.push({
          id: `inst_weak_${e.id}`,
          type: 'weak_mechanistic_chain',
          severity: 'high',
          target: e.id,
          targetLabel: `${nodeLabel(e.src)} → ${nodeLabel(e.dst)}`,
          signal: `"${e.evidence}" edge with no assay.`,
          comment: `The step ${nodeLabel(e.src)} —${e.rel}→ ${nodeLabel(e.dst)}, asserted by ${h.label}, currently rests on "${e.evidence}" evidence with no assay attached. This is the link that turns correlation into causation, so the entire causal claim inherits its uncertainty. Until an experiment bridges it, the chain is only as strong as this weakest edge.`,
          repair: 'Attach an assay that measures this step directly, or downgrade the edge to correlational until one exists.',
          status: 'open',
        })
      }
    }
  }

  // 3 · missing control
  for (const a of s.assays) {
    if (!a.controls || a.controls.trim() === '') {
      out.push({
        id: `inst_control_${a.id}`,
        type: 'missing_control',
        severity: 'high',
        target: a.id,
        targetLabel: a.method,
        signal: 'No control / input arm.',
        comment: `${a.method} (${a.measures}) has no comparator or control declared. Specify controls appropriate to this method so the measured signal can be distinguished from technical or baseline variation.`,
        repair: 'Specify the comparison group and technical controls appropriate to this assay.',
        status: 'open',
      })
    }
  }

  // 4 · assay mismatch (cardiomyocyte claim measured in blood)
  const cardiacHyp = new Set(s.hypotheses.filter((h) => /cardio|cardiac/i.test(h.requiresTissue ?? '')).map((h) => h.id))
  for (const a of s.assays) {
    const inBlood = /blood/i.test(a.cellType)
    const claimsCardiac = (a.claims ?? []).some((c) => cardiacHyp.has(c))
    if (inBlood && claimsCardiac) {
      out.push({
        id: `inst_mismatch_${a.id}`,
        type: 'assay_mismatch',
        severity: 'med',
        target: a.id,
        targetLabel: a.method,
        signal: 'Cardiac claim read in blood.',
        comment: `${a.method} is run in "${a.cellType}", but the hypotheses it addresses are about cardiomyocyte regulation. Blood methylation is a tissue-discordant proxy for cardiac chromatin state — concordance at these loci is not guaranteed and often poor. A cardiac claim built on a blood read-out is a predictable reviewer objection.`,
        repair: 'Move to iPSC-CM / cardiac tissue, or first demonstrate blood–heart concordance at these loci.',
        status: 'open',
      })
    }
  }

  // 5 · underpowered design (quantitative)
  for (const a of s.assays) {
    const rep = assayPowerReport(a)
    if (rep && !rep.adequate) {
      const severity: Severity = rep.power < 0.4 ? 'high' : 'med'
      const gw = a.genomeWide ? ` across ~${rep.tests.toLocaleString()} genome-wide tests` : ''
      out.push({
        id: `inst_power_${a.id}`,
        type: 'underpowered_design',
        severity,
        target: a.id,
        targetLabel: a.method,
        signal: `~${Math.round(rep.power * 100)}% power at n=${a.sampleN}.`,
        comment: `At n=${a.sampleN} (${rep.nPerGroup}/group) and an expected effect of d=${rep.d}, ${a.method} reaches only ~${Math.round(rep.power * 100)}% power against a per-test α of ${fmtAlpha(rep.alpha)}${gw}. Reaching 80% would need ≥${rep.requiredNPerGroup}/group (${rep.requiredTotalN} total). As specified, this arm can generate hypotheses but cannot support a confirmatory claim, and a null result would be uninformative.`,
        repair: `Specify a focused primary endpoint, revisit the detectable effect, or scale to ≥${rep.requiredTotalN} total.`,
        status: 'open',
      })
    }
  }

  // 6 · literature gap
  for (const h of s.hypotheses) {
    if (!h.supportingPapers || h.supportingPapers.length === 0) {
      out.push({
        id: `inst_litgap_${h.id}`,
        type: 'literature_gap',
        severity: 'med',
        target: h.id,
        targetLabel: h.label,
        signal: 'No literature attached.',
        comment: `${h.label} has no supporting or contradicting reference on record. Either the prior art is unverified — risking redundancy or an unnoticed refutation — or the novelty is simply unstated. An unsituated hypothesis is hard to fund and easy to scoop.`,
        repair: 'Run a Literature scan and attach support/contradiction; state the novelty explicitly.',
        status: 'open',
      })
    }
  }

  // 7 · statistical ambiguity
  if (!s.project.preRegistered || !s.project.primaryEndpoint) {
    out.push({
      id: 'inst_stats_project',
      type: 'statistical_ambiguity',
      severity: 'high',
      target: s.project.id,
      targetLabel: s.project.code,
      signal: !s.project.primaryEndpoint ? 'No primary endpoint set.' : 'Not pre-registered.',
      comment: `The project has ${!s.project.primaryEndpoint ? 'no pre-specified primary endpoint' : 'no pre-registered analysis plan'}. Define the outcome, relevant covariates, and handling of multiple comparisons before examining results to limit selective analysis.`,
      repair: 'Pre-register the primary and secondary endpoints, covariates, and analysis plan.',
      status: 'open',
    })
  }

  // 8 · infeasible protocol
  const phaseAssays = new Map<number, string[]>()
  for (const a of s.assays) {
    if (a.effort === 'high' && a.phase) {
      if (!phaseAssays.has(a.phase)) phaseAssays.set(a.phase, [])
      phaseAssays.get(a.phase)!.push(a.method)
    }
  }
  for (const [phase, methods] of phaseAssays) {
    if (methods.length > HIGH_EFFORT_PER_PHASE) {
      out.push({
        id: `inst_feasible_p${phase}`,
        type: 'infeasible_protocol',
        severity: 'med',
        target: `phase-${phase}`,
        targetLabel: `Phase ${phase}`,
        signal: `${methods.length} high-effort assays in phase ${phase}.`,
        comment: `Phase ${phase} stacks ${methods.length} high-effort assays (${methods.join(', ')}). Check whether the team, timeline, sample volume, and available equipment can support running them in parallel. Each method needs dedicated optimisation.`,
        repair: 'Sequence the heavy assays across phases, or bring in a core facility / collaborator for one of them.',
        status: 'open',
      })
    }
  }

  // 9 · manuscript-story weakness
  const phenotypeIds = new Set(s.nodes.filter((n) => n.type === 'ClinicalPhenotype').map((n) => n.id))
  const phenotypeEdges = s.edges.filter((e) => phenotypeIds.has(e.dst) && e.rel !== 'unmasks')
  const hasCausalToPhenotype = phenotypeEdges.some(
    (e) => e.evidence === 'causal' || e.evidence === 'established',
  )
  if (phenotypeEdges.length > 0 && !hasCausalToPhenotype) {
    out.push({
      id: 'inst_story_project',
      type: 'manuscript_story_weakness',
      severity: 'high',
      target: s.project.id,
      targetLabel: 'central hypothesis',
      signal: 'Association-only into the phenotype.',
      comment: `The recorded links to ${[...new Set(phenotypeEdges.map((e) => nodeLabel(e.dst)))].join(', ')} have no causal or established evidence. Frame the findings as associations unless the study design and evidence support a causal claim.`,
      repair: 'Qualify causal language or add evidence from a design that can test the proposed mechanism.',
      status: 'open',
    })
  }

  // 10 · systematic-review methodological gaps (only when a review is under way)
  const rv = s.review
  if (rv.studies.length > 0) {
    const incl = rv.studies.filter(analysisIncluded)
    const meta = incl.length >= 2 ? computeMeta(incl, rv.model, rv.effect) : null
    const dbs = new Set(rv.searches.map((x) => x.db).filter(Boolean))
    const srma = (key: string, severity: Severity, signal: string, comment: string, repair: string) =>
      out.push({ id: `inst_srma_${key}`, type: 'srma_gap', severity, target: s.project.id, targetLabel: 'systematic review', signal, comment, repair, status: 'open' })

    if (!isRegistered(s))
      srma('reg', 'high', 'Protocol not registered.', `This review reports no prospective registration. An unregistered protocol allows post-hoc changes to the question, eligibility or outcomes — a flaw AMSTAR-2 treats as critical because it enables selective reporting. Register before extraction so the plan is fixed and citable.`, 'Register the protocol on PROSPERO and cite the registration ID.')

    if (dbs.size < 2)
      srma('db', 'med', `Only ${dbs.size} database${dbs.size === 1 ? '' : 's'} searched.`, `A comprehensive search needs at least two bibliographic databases (e.g. MEDLINE + Embase), ideally with trial registers and reference-list checking. Searching ${dbs.size || 'none'} risks missing eligible studies and biasing the pooled estimate toward what's easy to find.`, 'Search ≥2 databases and record each query on the Protocol page.')

    if (rv.dualExtraction !== true)
      srma('dual', 'med', 'Single data extraction.', `Data extraction is not marked as performed in duplicate. Single-extractor coding of 2×2 counts is error-prone and a recognised source of meta-analytic mistakes; AMSTAR-2 expects duplicate, reconciled extraction.`, 'Extract data in duplicate with a second reviewer, reconcile discrepancies, and confirm below.')

    if (!rv.studies.some((st) => st.rob && Object.keys(st.rob).length > 0))
      srma('rob', 'med', 'Risk of bias not assessed.', `No included study carries a risk-of-bias judgement. Without RoB (RoB-2 for trials, ROBINS-I / Newcastle–Ottawa for observational studies) the pooled estimate can't be weighed for study quality and the certainty of evidence can't be graded.`, 'Assess and record risk of bias per study on the Studies page.')

    if (meta && meta.I2 >= 50 && rv.model === 'fixed')
      srma('het', 'high', `I²=${Math.round(meta.I2)}% under fixed-effect.`, `Substantial statistical heterogeneity (I²=${Math.round(meta.I2)}%) is being pooled under a fixed-effect model, which assumes a single common effect and understates the confidence interval. Reviewers will flag this immediately.`, 'Switch to random-effects and run subgroup / sensitivity analyses to explain the heterogeneity.')

    if (meta && meta.k >= 3 && meta.k < 10)
      srma('pubbias', 'low', `Only ${meta.k} studies — funnel unreliable.`, `With ${meta.k} included studies, funnel-plot asymmetry and Egger's test are underpowered and can mislead. Publication bias effectively cannot be assessed at this k, so any symmetry claim is weak.`, 'State that publication bias could not be reliably assessed (k<10) as an explicit limitation.')
  }

  return out.map((i) => {
    const ov = s.instabilityOverrides[i.id]
    return ov ? { ...i, status: ov } : i
  })
}

const SEV_WEIGHT: Record<Severity, number> = { high: 3, med: 2, low: 1 }

export function stabilityScore(instabilities: Instability[]): number {
  const open = instabilities.filter((i) => i.status === 'open')
  if (instabilities.length === 0) return 1
  const penalty = open.reduce((sum, i) => sum + SEV_WEIGHT[i.severity], 0)
  const worst = instabilities.reduce((sum, i) => sum + SEV_WEIGHT[i.severity], 0)
  return Math.max(0, Math.round((1 - penalty / (worst + 6)) * 100) / 100)
}
