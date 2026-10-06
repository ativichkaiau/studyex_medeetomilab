/**
 * Terra — the intelligence layer of studyex_medeetomilab.
 *
 * Terra is the project-aware assistant (components/AssistantDock.tsx): it
 * reads the active project, the module you're in, and the theory chapter, and
 * can act on the project through tools. It runs on your own OpenAI key, from
 * the browser; with no key it is off and says so.
 *
 * Modules call openTerra() with a task phrased for where you are. The task
 * is placed in Terra's input for you to send. Nothing is sent on its own,
 * because every call is billed to your key.
 */
export const TERRA_OPEN = 'wl-open-copilot'

export interface TerraRequest {
  /** a task to place in Terra's input */
  prompt?: string
}

export function openTerra(req: TerraRequest = {}) {
  window.dispatchEvent(new CustomEvent<TerraRequest>(TERRA_OPEN, { detail: req }))
}

/** the tasks Terra offers in each module, phrased as instructions */
export const TERRA_TASKS: Record<string, { label: string; prompt: string }[]> = {
  overview: [
    { label: 'summarise project state', prompt: 'Summarise where this project stands: each pipeline stage, what blocks the next one, and the three highest-value next actions.' },
    { label: 'inspect rigor issues', prompt: 'Go through the open rigor issues on this project. For each, explain the risk to the review\'s conclusions and the concrete repair, highest severity first.' },
  ],
  literature: [
    { label: 'summarise evidence', prompt: 'Summarise the evidence base gathered so far for this review question: what is well covered, what is thin, and which search terms or sources may be missing.' },
  ],
  screening: [
    { label: 'inspect conflicts', prompt: 'Explain how to adjudicate the current title/abstract screening conflicts against this review\'s inclusion and exclusion criteria, and which criteria are most likely to be applied inconsistently.' },
  ],
  extraction: [
    { label: 'check extraction', prompt: 'Check the extraction table for problems: missing outcome data, implausible counts, inconsistent arms, or values that would distort pooling. List each with the study and the fix.' },
  ],
  risk_of_bias: [
    { label: 'review appraisal', prompt: 'Review the risk-of-bias appraisal for this review: is the tool appropriate for the included designs, and which domains most threaten the pooled estimate?' },
  ],
  statistics: [
    { label: 'suggest analysis', prompt: 'Given the current pooled analysis (effect measure, model, k, heterogeneity), suggest the sensitivity and subgroup analyses this review should report, and why.' },
    { label: 'interpret heterogeneity', prompt: 'Interpret the heterogeneity in the current meta-analysis (I², τ², prediction interval) and what it means for how strongly the pooled estimate can be stated.' },
  ],
  prisma: [
    { label: 'audit flow', prompt: 'Audit the PRISMA flow counts for internal consistency and against the screening log, and list anything a peer reviewer would query.' },
  ],
  manuscript: [
    { label: 'review manuscript', prompt: 'Review the compiled manuscript for unsupported claims, inconsistencies between the results and the abstract or discussion, and missing PRISMA 2020 items.' },
  ],
  rigor: [
    { label: 'inspect rigor issues', prompt: 'Go through the open rigor issues on this project. For each, explain the risk to the conclusions and the concrete repair, highest severity first.' },
  ],
}
