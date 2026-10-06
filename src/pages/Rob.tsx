import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useStore } from '../lib/store'
import { Kicker, Tag, Empty } from '../components/ui'
import { FigureFrame } from '../components/FigureFrame'
import { RobFigure } from '../components/RobFigure'
import { analysisIncluded } from '../lib/cohorts'
import { overallRob, robComplete, ROB_LABEL, ROB_TONE, ROB_LEVELS } from '../lib/rob'
import { studyId } from '../lib/ids'
import { openTerra, TERRA_TASKS } from '../lib/terra'
import type { RobLevel } from '../types'

// the standard instruments and their published domains
const TOOLS: { id: string; label: string; for: string; domains: string[] }[] = [
  { id: 'RoB 2', label: 'RoB 2', for: 'randomised trials', domains: ['Randomisation process', 'Deviations from intended interventions', 'Missing outcome data', 'Measurement of the outcome', 'Selection of the reported result'] },
  { id: 'ROBINS-I', label: 'ROBINS-I', for: 'non-randomised studies of interventions', domains: ['Confounding', 'Selection of participants', 'Classification of interventions', 'Deviations from intended interventions', 'Missing data', 'Measurement of outcomes', 'Selection of the reported result'] },
  { id: 'Newcastle–Ottawa', label: 'Newcastle–Ottawa', for: 'cohort / case-control studies', domains: ['Selection', 'Comparability', 'Outcome / exposure'] },
  { id: 'QUIPS', label: 'QUIPS', for: 'prognostic factor studies', domains: ['Study participation', 'Study attrition', 'Prognostic factor measurement', 'Outcome measurement', 'Study confounding', 'Statistical analysis and reporting'] },
  { id: 'QUADAS-2', label: 'QUADAS-2', for: 'diagnostic accuracy studies', domains: ['Patient selection', 'Index test', 'Reference standard', 'Flow and timing'] },
]

/**
 * RISK_OF_BIAS — appraisal as validation. One judgement per study per domain
 * of the review's appraisal tool; the overall judgement is the worst rated
 * domain. Unrated stays unrated. The figure exports for the manuscript.
 */
export default function Rob() {
  const { state, updateStudy, updateReview } = useStore()
  const r = state.review
  const domains = r.robDomains
  const incl = r.studies.filter(analysisIncluded)
  const [editingTool, setEditingTool] = useState(domains.length === 0)
  const [draft, setDraft] = useState<{ tool: string; domains: string }>({ tool: r.robTool ?? '', domains: domains.join('\n') })

  const assessed = incl.filter((s) => robComplete(s, domains)).length
  const overall = incl.map((s) => overallRob(s, domains))
  const nOf = (l: RobLevel) => overall.filter((v) => v === l).length

  function setCell(sid: string, domain: string, v: RobLevel | '') {
    const s = r.studies.find((x) => x.id === sid)!
    const next = { ...(s.rob ?? {}) }
    if (v) next[domain] = v
    else delete next[domain]
    updateStudy(sid, { rob: Object.keys(next).length ? next : undefined })
  }
  function applyTool() {
    const list = draft.domains.split('\n').map((x) => x.trim()).filter(Boolean)
    updateReview({ robTool: draft.tool.trim() || undefined, robDomains: list }, { kind: 'rob', text: `Appraisal tool set: ${draft.tool.trim() || 'custom'} · ${list.length} domains` })
    setEditingTool(false)
  }

  return (
    <>
      <div className="page-head">
        <div className="flex" style={{ justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
          <div style={{ minWidth: 0 }}>
            <Kicker>pipeline / 05 risk_of_bias · validate</Kicker>
            <h1>Risk of bias</h1>
            <p>One judgement per study and domain of the appraisal tool. A study's overall judgement is its worst rated domain; domains not yet rated are shown as not assessed. Judgements feed GRADE certainty in <Link to="/meta">statistics</Link>.</p>
          </div>
          <div className="row-actions">
            <button className="btn ghost sm" onClick={() => openTerra({ prompt: TERRA_TASKS.risk_of_bias[0].prompt })}>terra · review appraisal</button>
          </div>
        </div>
      </div>

      <div className="readouts" style={{ marginBottom: 12 }}>
        <div className="readout"><span>tool</span><b style={{ fontSize: 15, marginTop: 6 }}>{r.robTool || '—'}</b><small>{domains.length} domains</small></div>
        <div className="readout"><span>assessed</span><b>{assessed}/{incl.length}</b><small>every domain rated</small></div>
        <div className="readout"><span>low</span><b className="tone-ok">{nOf('low')}</b><small>overall</small></div>
        <div className="readout"><span>some_concerns</span><b className="tone-warn">{nOf('some')}</b><small>overall</small></div>
        <div className="readout"><span>high</span><b className="tone-bad">{nOf('high')}</b><small>overall</small></div>
      </div>

      <div className="card" style={{ marginBottom: 12 }}>
        <div className="card-h">tool &amp; domains <span className="spacer" />{!editingTool && <button className="go" style={{ textTransform: 'none', letterSpacing: 0 }} onClick={() => { setDraft({ tool: r.robTool ?? '', domains: domains.join('\n') }); setEditingTool(true) }}>edit</button>}</div>
        {editingTool ? (
          <div className="rob-config">
            <div>
              <div className="field-l" style={{ marginBottom: 6 }}>presets</div>
              <div className="wrap-gap">
                {TOOLS.map((t) => (
                  <button key={t.id} className={`chip-btn${draft.tool === t.id ? ' on' : ''}`} onClick={() => setDraft({ tool: t.id, domains: t.domains.join('\n') })} title={t.for}>{t.label}</button>
                ))}
              </div>
              <p className="small" style={{ marginTop: 8 }}>{TOOLS.find((t) => t.id === draft.tool)?.for ?? 'or name your own tool and list its domains'}</p>
            </div>
            <label className="field"><span className="field-l">tool</span><input className="input" value={draft.tool} onChange={(e) => setDraft({ ...draft, tool: e.target.value })} placeholder="e.g. ROBINS-E" /></label>
            <label className="field"><span className="field-l">domains · one per line</span><textarea className="textarea" rows={6} value={draft.domains} onChange={(e) => setDraft({ ...draft, domains: e.target.value })} /></label>
            {domains.length > 0 && <p className="small">Existing judgements stay attached to their domain names; a domain you remove stops counting toward the overall judgement.</p>}
            <div className="form-actions" style={{ marginTop: 0 }}>
              {domains.length > 0 && <button className="btn ghost sm" onClick={() => setEditingTool(false)}>cancel</button>}
              <button className="btn primary sm" onClick={applyTool} disabled={!draft.domains.trim()}>apply tool</button>
            </div>
          </div>
        ) : (
          <ol className="rob-domains">
            {domains.map((d, i) => <li key={d}><span className="mono">D{i + 1}</span>{d}</li>)}
          </ol>
        )}
      </div>

      {domains.length === 0 ? null : incl.length === 0 ? (
        <div className="card"><Empty path="risk_of_bias/">no included studies — include studies in <Link to="/studies">extraction</Link> to appraise them</Empty></div>
      ) : (
        <>
          <div className="tbl-scroll" style={{ marginBottom: 12 }}>
            <table aria-label="Risk-of-bias judgements">
              <thead>
                <tr>
                  <th>id</th><th>study</th>
                  {domains.map((d, i) => <th key={d} title={d}>D{i + 1}</th>)}
                  <th>overall</th>
                </tr>
              </thead>
              <tbody>
                {incl.map((s) => {
                  const ov = overallRob(s, domains)
                  return (
                    <tr key={s.id}>
                      <td className="mono muted">{studyId(s.id)}</td>
                      <td><b>{s.author} {s.year}</b><div className="small">{s.design ?? '—'}</div></td>
                      {domains.map((d) => {
                        const v = s.rob?.[d] ?? ''
                        return (
                          <td key={d}>
                            <select className={`rob-sel lv-${v || 'na'}`} value={v} onChange={(e) => setCell(s.id, d, e.target.value as RobLevel | '')} aria-label={`${s.author} ${s.year} · ${d}`}>
                              <option value="">—</option>
                              {ROB_LEVELS.map((l) => <option key={l} value={l}>{ROB_LABEL[l].toLowerCase()}</option>)}
                            </select>
                          </td>
                        )
                      })}
                      <td>{ov ? <Tag tone={ROB_TONE[ov]}>{ROB_LABEL[ov]}{robComplete(s, domains) ? '' : '*'}</Tag> : <span className="mono muted">not assessed</span>}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <p className="small mono" style={{ margin: '-4px 0 12px' }}>* partial — some domains not yet rated</p>

          <div className="card lg">
            <div className="card-h">artifact · risk-of-bias figure <span className="spacer" /><span style={{ textTransform: 'none', letterSpacing: 0 }}>hover to export PNG · SVG · PDF</span></div>
            <FigureFrame name={`${state.project.code.toLowerCase()}-risk-of-bias`}>
              <RobFigure studies={r.studies} domains={domains} tool={r.robTool} />
            </FigureFrame>
          </div>
        </>
      )}
    </>
  )
}
