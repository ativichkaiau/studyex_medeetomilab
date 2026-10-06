import { useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { useStore } from '../lib/store'
import { Kicker, Rule, StatCard, HypBadge } from '../components/ui'
import { Markdown } from '../components/Markdown'
import { Sk } from '../components/Skeleton'
import { buildAimsPlan, aimsScaffoldMd, aimsContext } from '../lib/grantAims'
import { computeMeta, fmt } from '../lib/metaAnalysis'
import { streamChat, hasKey, getModel, type ChatMessage } from '../lib/openai'

function download(content: string, name: string, type: string) {
  const blob = new Blob([content], { type })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  URL.revokeObjectURL(url)
}
const powerColor = (p: number) => (p >= 0.8 ? 'var(--success)' : p >= 0.6 ? 'var(--warning)' : 'var(--danger)')

export default function GrantAims() {
  const { state } = useStore()
  const r = state.review
  const plan = useMemo(() => buildAimsPlan(state), [state])
  const meta = useMemo(() => computeMeta(r.studies, r.model, r.effect), [r.studies, r.model, r.effect])

  const premise = useMemo(() => {
    if (meta.k === 0) return undefined
    const sig = meta.pooledLow > meta.refValue || meta.pooledHigh < meta.refValue
    return `${r.indexLabel} ${sig ? 'is associated with' : 'has been proposed to alter'} ${r.outcomeLabel.toLowerCase()} (pooled ${r.effect} ${fmt(meta.pooledEst)}, 95% CI ${fmt(meta.pooledLow)}–${fmt(meta.pooledHigh)}; ${meta.k} studies), underscoring the clinical importance of the mechanism.`
  }, [meta, r])

  const months = Math.round(plan.totalWeeks / 4.345)
  const scaffold = useMemo(() => aimsScaffoldMd(plan, { title: state.project.name, premise, months }), [plan, premise, months, state.project.name])
  const slug = (state.project.code || 'specific-aims').toLowerCase()

  const [copied, setCopied] = useState(false)
  const [aiText, setAiText] = useState('')
  const [aiOn, setAiOn] = useState(false)
  const abortRef = useRef<AbortController | null>(null)

  async function polish() {
    if (aiOn) return
    if (!hasKey()) { setAiText('_Set an OpenAI key in Knowledge Review → Settings to generate the polished page._'); return }
    setAiText(''); setAiOn(true)
    const messages: ChatMessage[] = [
      { role: 'system', content: 'You are a grant-writing specialist drafting an NIH-style one-page Specific Aims. Write persuasive, precise prose: an opening hook on the problem and gap, the long-term goal and central hypothesis, then each Specific Aim as a bold header + 2–3 sentences (objective, approach, expected outcome), closing with an Impact paragraph. Keep it to one page. Preserve the power and budget figures given. Return markdown only, starting with "# Specific Aims".' },
      { role: 'user', content: `Project: ${state.project.name}\n${premise ? `Clinical premise: ${premise}\n` : ''}\n${aimsContext(plan)}` },
    ]
    const ctrl = new AbortController(); abortRef.current = ctrl
    try { await streamChat({ messages, model: getModel(), signal: ctrl.signal, onToken: (d) => setAiText((t) => t + d) }) }
    catch (e) { if (!(e instanceof DOMException && e.name === 'AbortError')) setAiText((t) => t + `\n\n_⚠ ${e instanceof Error ? e.message : 'failed'}_`) }
    finally { setAiOn(false); abortRef.current = null }
  }

  const exportMd = aiText && !aiOn ? aiText : scaffold
  const poweredAims = plan.aims.filter((a) => a.approaches.some((x) => x.adequate)).length

  return (
    <>
      <div className="page-head">
        <Rule />
        <div className="flex" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <Kicker>bench / specific_aims</Kicker>
            <h1 style={{ marginTop: 12 }}>Specific Aims generator</h1>
            <p>Your hypotheses, the assays that test them (with power and budget), and the review's clinical premise, assembled into an NIH-style one-page Specific Aims. Draft deterministically, then polish with Terra.</p>
          </div>
          <div className="row-actions" style={{ flex: 'none', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            <button className="btn ghost sm" onClick={() => download(exportMd, `${slug}-specific-aims.md`, 'text/markdown')}>⤓ Markdown</button>
            <button className="btn ghost sm" onClick={() => { navigator.clipboard?.writeText(exportMd); setCopied(true); setTimeout(() => setCopied(false), 1500) }}>{copied ? 'Copied ✓' : 'Copy'}</button>
            {aiOn ? <button className="btn ghost sm" onClick={() => abortRef.current?.abort()}>Stop</button> : <button className="btn primary sm" onClick={polish}>terra · polish</button>}
          </div>
        </div>
      </div>

      {plan.aims.length === 0 ? (
        <div className="card note">
          <div className="card-h"><span className="sq" style={{ background: 'var(--amber)' }} />NO AIMS YET</div>
          <p className="small">A Specific Aim is built from a <b>hypothesis</b> plus the <b>assays</b> that test it. Add hypotheses on the Hypotheses page and link assays to them (an assay's “claims”), then they appear here as aims with power and budget.{plan.orphanHyps.length ? ` You have ${plan.orphanHyps.length} hypothesis/-es but none has a linked assay yet.` : ''}</p>
        </div>
      ) : (
        <>
          <div className="grid g4" style={{ marginBottom: 16 }}>
            <StatCard value={plan.aims.length} label="Specific Aims" sub={`${state.hypotheses.length} hypotheses`} tone="var(--violet)" />
            <StatCard value={`${poweredAims}/${plan.aims.length}`} label="Aims ≥ 80% power" sub="adequately powered" tone="var(--success)" />
            <StatCard value={plan.totalCost >= 1000 ? `$${(plan.totalCost / 1000).toFixed(1)}M` : `$${Math.round(plan.totalCost)}k`} label="Total budget" sub={`${plan.aims.reduce((a, x) => a + x.approaches.length, 0)} assays`} tone="var(--accent)" />
            <StatCard value={`${months} mo`} label="Timeline" sub={`${plan.totalWeeks} weeks`} tone="var(--warning)" />
          </div>

          {(aiText || aiOn) && (
            <div className="card lg rail" style={{ marginBottom: 16, ['--rail' as string]: 'var(--violet, var(--violet))' } as CSSProperties}>
              <div className="card-h"><span className="sq" style={{ background: 'var(--violet, var(--violet))' }} />terra · polished specific aims{aiOn ? ' · streaming…' : ''}</div>
              {aiText ? <Markdown text={aiText} /> : <Sk kind="aims" parts={plan.aims.map((_, i) => `Aim ${i + 1}`)} />}
            </div>
          )}

          <div className="grid g2" style={{ marginBottom: 16 }}>
            <div className="card lg">
              <div className="card-h"><span className="sq" style={{ background: 'var(--blue)' }} />ONE-PAGE SCAFFOLD</div>
              <div className="manuscript" style={{ fontSize: 13.5 }}><Markdown text={scaffold} /></div>
            </div>
            <div className="card lg">
              <div className="card-h"><span className="sq" style={{ background: 'var(--violet, var(--violet))' }} />AIMS · POWER &amp; BUDGET</div>
              {plan.aims.map((a) => (
                <div key={a.hypId} className="aim-row" style={{ padding: '10px 0', borderBottom: '1px solid var(--line)' }}>
                  <div className="flex" style={{ justifyContent: 'space-between', gap: 8 }}>
                    <b style={{ fontSize: 13 }}>Aim {a.n}. {a.title}</b>
                    <HypBadge status={a.status} />
                  </div>
                  {a.approaches.map((x, i) => (
                    <div key={i} className="flex" style={{ gap: 8, alignItems: 'center', marginTop: 6, fontSize: 12 }}>
                      <span className="mono muted" style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{x.method}{x.cellType ? ` · ${x.cellType}` : ''}</span>
                      <span className="bar" style={{ width: 70, height: 7, background: 'var(--line)', borderRadius: 4, overflow: 'hidden', flex: 'none' }}><i style={{ display: 'block', height: '100%', width: `${Math.round(x.power * 100)}%`, background: powerColor(x.power) }} /></span>
                      <span className="mono" style={{ color: powerColor(x.power), fontWeight: 700, width: 34, textAlign: 'right', flex: 'none' }}>{Math.round(x.power * 100)}%</span>
                      <span className="mono muted" style={{ width: 46, textAlign: 'right', flex: 'none' }}>{x.costK ? `$${x.costK}k` : '—'}</span>
                    </div>
                  ))}
                </div>
              ))}
              {plan.orphanHyps.length > 0 && <p className="small" style={{ marginTop: 10, color: 'var(--amber)' }}>⚠ {plan.orphanHyps.length} hypothesis/-es without a linked assay — no aim generated: {plan.orphanHyps.join('; ')}.</p>}
            </div>
          </div>

          <p className="small muted">Power uses the two-sample model (targeted d = 1.0, genome-wide d = 0.8 with Bonferroni), matching the Power page. Budget/timeline from the assay phase plan. The scaffold is deterministic; AI polish rewrites it into persuasive prose without inventing figures — verify before submission.</p>
        </>
      )}
    </>
  )
}
