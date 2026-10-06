import type { ProjectState } from '../types'
import { fmt, measureInfo, type MetaResult, type EggerResult, type LooRow, type GradeResult, type TrimFillResult } from './metaAnalysis'
import { isRegistered } from './projectFacts'

// ---- PRISMA 2020 checklist (abbreviated item text) ----
export const PRISMA_CHECKLIST: { section: string; items: { n: string; item: string }[] }[] = [
  { section: 'Title', items: [{ n: '1', item: 'Identify the report as a systematic review.' }] },
  { section: 'Abstract', items: [{ n: '2', item: 'Structured summary (background, methods, results, conclusions).' }] },
  {
    section: 'Introduction',
    items: [
      { n: '3', item: 'Rationale for the review.' },
      { n: '4', item: 'Objectives / review question (PICO).' },
    ],
  },
  {
    section: 'Methods',
    items: [
      { n: '5', item: 'Eligibility criteria.' },
      { n: '6', item: 'Information sources (databases, dates).' },
      { n: '7', item: 'Full search strategies.' },
      { n: '8', item: 'Selection process.' },
      { n: '9', item: 'Data collection process.' },
      { n: '10', item: 'Data items (outcomes, other variables).' },
      { n: '11', item: 'Risk-of-bias assessment.' },
      { n: '12', item: 'Effect measures.' },
      { n: '13', item: 'Synthesis methods.' },
      { n: '14', item: 'Reporting-bias assessment.' },
      { n: '15', item: 'Certainty assessment.' },
    ],
  },
  {
    section: 'Results',
    items: [
      { n: '16', item: 'Study selection (flow diagram).' },
      { n: '17', item: 'Study characteristics.' },
      { n: '18', item: 'Risk of bias in studies.' },
      { n: '19', item: 'Results of individual studies.' },
      { n: '20', item: 'Results of syntheses (pooled effect, heterogeneity).' },
      { n: '21', item: 'Reporting biases.' },
      { n: '22', item: 'Certainty of evidence.' },
    ],
  },
  {
    section: 'Discussion',
    items: [
      { n: '23', item: 'Interpretation, limitations, implications.' },
    ],
  },
  {
    section: 'Other',
    items: [
      { n: '24', item: 'Registration and protocol.' },
      { n: '25', item: 'Support / funding.' },
      { n: '26', item: 'Competing interests.' },
      { n: '27', item: 'Availability of data / code.' },
    ],
  },
]

function hetWord(i2: number) {
  return i2 < 25 ? 'low' : i2 < 60 ? 'moderate' : 'substantial'
}

export function buildMarkdown(state: ProjectState, meta: MetaResult, egger: EggerResult | null, loo: LooRow[], grade: GradeResult, tf: TrimFillResult): string {
  const r = state.review
  const registration = isRegistered(state) ? r.registration!.trim() : 'Not registered'
  const p = r.prisma
  const binary = measureInfo(r.effect).binary
  const looRange = loo.length ? `${fmt(Math.min(...loo.map((x) => x.est)))}–${fmt(Math.max(...loo.map((x) => x.est)))}` : 'n/a'
  const sig = meta.k > 0 && (meta.pooledLow > meta.refValue || meta.pooledHigh < meta.refValue)
  const pooled = `${r.effect} ${fmt(meta.pooledEst)} (95% CI ${fmt(meta.pooledLow)}–${fmt(meta.pooledHigh)})`

  // prose that adapts to the chosen effect measure (binary 2×2 vs continuous SMD)
  const dataPhrase = binary
    ? 'Two-by-two outcome data were extracted'
    : 'Continuous outcome data (group means, standard deviations and sample sizes) were extracted'
  const extractPhrase = binary
    ? `a 2×2 table of ${r.outcomeLabel} by ${r.indexLabel} vs ${r.comparatorLabel}`
    : `group means, standard deviations and sample sizes for ${r.outcomeLabel} in ${r.indexLabel} vs ${r.comparatorLabel}`
  const poolTerm = r.effect === 'OR' ? 'Odds ratios' : r.effect === 'RR' ? 'Risk ratios' : r.effect === 'RD' ? 'Risk differences' : 'Standardised mean differences (Hedges’ g)'
  const looRobust = loo.length > 0 && Math.min(...loo.map((x) => x.est)) > meta.refValue === (Math.max(...loo.map((x) => x.est)) > meta.refValue)
  const sensitivityText = loo.length
    ? `Leave-one-out pooling gave ${r.effect} between ${looRange}; the direction of effect was ${looRobust ? 'robust' : 'sensitive'} to omission of any single study.`
    : 'Leave-one-out sensitivity analysis requires at least three pooled studies and was not performed.'

  const col = binary ? 'events/n' : 'n'
  const charTable = [
    `| Study | ${r.indexLabel} (${col}) | ${r.comparatorLabel} (${col}) | ${r.effect} [95% CI] | Weight |`,
    '| --- | --- | --- | --- | --- |',
    ...meta.rows.map((x) => `| ${x.label} | ${binary ? `${x.expEvents}/${x.expTotal}` : x.expTotal} | ${binary ? `${x.ctrlEvents}/${x.ctrlTotal}` : x.ctrlTotal} | ${fmt(x.est)} [${fmt(x.low)}, ${fmt(x.high)}] | ${fmt(x.weight, 1)}% |`),
  ].join('\n')
  const gradeDrops = grade.domains.filter((d) => d.drop > 0).map((d) => `${d.label.toLowerCase()} (${d.judgment})`)
  const linkedGroups = [...new Set(r.studies.map((s) => s.cohortPrimaryId).filter(Boolean))]
  const secondaryReports = r.studies.filter((s) => s.cohortPrimaryId && s.cohortPrimaryId !== s.id)
  const cohortMethod = linkedGroups.length ? `\n\n**Multiple reports.** ${linkedGroups.length} group(s) of potentially overlapping reports were reviewed and linked. One report per group was selected for this outcome; ${secondaryReports.length} secondary report(s) were retained in the library and excluded from pooling to avoid counting participants more than once. Selection decisions are recorded in the cohort review history. PRISMA counts require separate reconciliation at the study level.` : ''

  const checklist = PRISMA_CHECKLIST.map((s) => `**${s.section}**\n${s.items.map((it) => `- [x] ${it.n}. ${it.item}`).join('\n')}`).join('\n\n')

  return `# ${r.title}

## Abstract

**Background.** ${r.question}

**Methods.** We systematically searched ${r.databases.join(', ')} and screened records against pre-specified eligibility criteria. ${dataPhrase} and pooled using an inverse-variance ${r.model}-effects model; heterogeneity was quantified with I² and τ². Risk of bias was assessed${r.robTool ? ` using ${r.robTool}` : ''} across ${r.robDomains.join(', ')}. ${isRegistered(state) ? `Registration: ${registration}.` : ''}

**Results.** ${p.included} studies (from ${p.dbRecords + p.otherRecords} records identified) were included. The pooled estimate was ${pooled}, with ${hetWord(meta.I2)} heterogeneity (I² = ${fmt(meta.I2, 0)}%). ${egger ? `Egger's test p = ${fmt(egger.p, 3)}.` : ''} Certainty of evidence (GRADE): **${grade.certainty}**.

**Conclusions.** ${r.indexLabel} was ${sig ? 'significantly associated with' : 'not significantly associated with'} ${r.outcomeLabel} versus ${r.comparatorLabel}.

## 1. Introduction

${r.question || state.project.centralHypothesis} This review synthesises the available evidence for ${state.project.name}.

**Objective (PICO).** Population: ${r.pico.p}. Intervention/exposure: ${r.pico.i}. Comparator: ${r.pico.c}. Outcome: ${r.pico.o}.

## 2. Methods

**Protocol and registration.** ${registration}. Reported per PRISMA 2020.

**Eligibility criteria.** Inclusion: ${r.inclusion.join('; ')}. Exclusion: ${r.exclusion.join('; ')}.

**Information sources and search.** ${r.databases.join(', ')}. Example strategy (${r.searches[0]?.db}): \`${r.searches[0]?.query ?? ''}\`

**Selection process.** Title/abstract and full-text screening were performed ${(r.screening?.length ?? 0) > 0 ? 'in the review\'s screening workspace' : 'in a dedicated screener'}. ${p.dbRecords + p.otherRecords} records were identified; ${p.duplicates} duplicates were removed; ${p.screened} were screened; ${p.fullText} full texts were assessed; ${p.included} met inclusion (Figure 1).

**Data items and extraction.** For each study we extracted ${extractPhrase}.${cohortMethod}

**Risk of bias.** Assessed${r.robTool ? ` with ${r.robTool}` : ''} across ${r.robDomains.join(', ')} (low / some / high).

**Synthesis.** ${poolTerm} were pooled by inverse-variance ${r.model}-effects (DerSimonian–Laird τ²). Heterogeneity: Cochran's Q and I². Robustness: leave-one-out sensitivity analysis and subgroup analysis. Small-study effects: funnel plot and Egger's regression test.

## 3. Results

**Study selection.** See the PRISMA flow diagram (Figure 1): ${p.included} studies were included.

**Study characteristics.**

${charTable}

**Risk of bias.** Risk of bias${r.robTool ? ` (${r.robTool})` : ''} across ${r.robDomains.join(', ')} is summarised in Figure 4.

**Synthesis of results.** Pooling ${meta.k} studies (${meta.rows.reduce((a, x) => a + x.expTotal + x.ctrlTotal, 0)} patients), the ${r.model}-effects estimate was **${pooled}** (Figure 2). Heterogeneity was ${hetWord(meta.I2)} (Q = ${fmt(meta.Q)}, df = ${meta.df}, p = ${fmt(meta.pValue, 3)}; I² = ${fmt(meta.I2, 0)}%; τ² = ${fmt(meta.tau2, 3)}).

**Sensitivity analysis.** ${sensitivityText}

**Publication bias.** ${egger ? `Egger's regression intercept ${fmt(egger.intercept)} (SE ${fmt(egger.se)}), p = ${fmt(egger.p, 3)}${egger.p < 0.05 ? ' — evidence of funnel asymmetry' : ' — no significant asymmetry'}. ` : ''}A contour-enhanced funnel plot (Figure 3) was inspected. ${tf.k0 > 0 ? `Duval–Tweedie trim-and-fill imputed ${tf.k0} potentially missing stud${tf.k0 > 1 ? 'ies' : 'y'} on the ${tf.fillSide}, yielding an adjusted ${r.effect} of ${fmt(tf.adjustedEst)} (95% CI ${fmt(tf.adjustedLow)}–${fmt(tf.adjustedHigh)}) versus ${fmt(tf.origEst)} observed.` : 'Trim-and-fill imputed no missing studies.'} These methods are underpowered with fewer than 10 studies.

**Certainty of evidence (GRADE).** The overall certainty for ${r.outcomeLabel} was rated **${grade.certainty}** (${grade.startLabel}${gradeDrops.length ? `; downgraded for ${gradeDrops.join(', ')}` : ''}${grade.upgrade ? `; upgraded for a large effect (+${grade.upgrade})` : ''}).

## 4. Discussion

The pooled analysis suggests that ${r.indexLabel} ${sig ? 'is associated with a higher risk of' : 'is not clearly associated with'} ${r.outcomeLabel}. **Limitations** include the observational nature of included studies, ${hetWord(meta.I2)} statistical heterogeneity, and limited power for publication-bias testing. **Conclusions** should be interpreted in light of risk-of-bias ratings and the sensitivity analysis.

## PRISMA 2020 checklist

${checklist}

---
*Compiled by studyex_medeetomilab from the review's data. Verify all numbers and narrative before submission.*
`
}

// standalone-HTML export styles (day-theme tokens so inline SVG var() colours resolve)
export const EXPORT_CSS = `
:root{--navy:#171a1e;--blue:#3b5ff0;--blue-2:#2a49cc;--red:#b23b3b;--yellow:#94650f;--green:#2e7d4f;--amber:#94650f;--violet:#5f54b8;--research:#23766f;
--card:#fff;--card-2:#f7f8f9;--ink:#121417;--ink-2:#454b54;--muted:#5f6670;--line:#e1e4e8;--good:#eaf5ee;--good-ink:#2e7d4f;
--sans:'Geist',system-ui,-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;--mono:'Geist Mono',ui-monospace,Menlo,Consolas,monospace}
*{box-sizing:border-box}body{font-family:var(--sans);color:var(--ink);max-width:820px;margin:40px auto;padding:0 24px;line-height:1.6}
h1{font-size:26px;margin:0 0 8px}h2{font-size:19px;margin:28px 0 8px;border-bottom:2px solid var(--line);padding-bottom:6px}
h3{font-size:15px;margin:18px 0 6px}p{margin:10px 0}ul{margin:8px 0;padding-left:22px}
table{border-collapse:collapse;width:100%;font-size:13px;margin:12px 0}th,td{border:1px solid var(--line);padding:7px 10px;text-align:left}
th{background:var(--card-2);font-family:var(--mono);font-size:11px;text-transform:uppercase;letter-spacing:.05em}
figure{margin:8px 0 18px;background:var(--card-2);border:1px solid var(--line);border-radius:12px;padding:16px}
figure svg{width:100%;height:auto}figcaption{font-size:12px;color:var(--muted);margin-top:8px;text-align:center}
.fig-cap{font-weight:700;font-size:13px;margin:16px 0 4px}code,.md-code{font-family:var(--mono);font-size:12px;background:var(--card-2);padding:1px 5px;border-radius:5px}
.muted{color:var(--muted)}.small{font-size:12px;color:var(--muted)}.mono{font-family:var(--mono)}
.md-h{font-size:18px;font-weight:800;margin:24px 0 6px;border-bottom:1px solid var(--line);padding-bottom:5px}
.md-p{margin:10px 0}.md-ul,.md-ol{margin:8px 0;padding-left:22px}
.md-table{border-collapse:collapse;width:100%;font-size:12.5px;margin:12px 0}.md-table th,.md-table td{border:1px solid var(--line);padding:6px 9px;text-align:left}
.md-table th{background:var(--card-2)}.md-table-wrap{overflow-x:auto}
`
