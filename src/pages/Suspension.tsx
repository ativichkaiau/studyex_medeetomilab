import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Sk } from '../components/Skeleton'
import { useStore } from '../lib/store'
import { Kicker, MetaGrid, Tag, Empty, type Tone } from '../components/ui'
import { Markdown } from '../components/Markdown'
import { INSTABILITY_LABEL, INSTABILITY_TYPE, INSTABILITY_SOURCE, SEVERITY_LABEL } from '../lib/palette'
import { streamChat, hasKey, getModel, type ChatMessage } from '../lib/openai'
import { AMSTAR_ITEMS, amstarRating, type AmstarAnswer } from '../lib/amstar'
import { appendAudit, getAudit, recordScore, getTrend } from '../lib/rigorLog'
import { rigorId } from '../lib/ids'
import { stamp } from '../lib/projectFacts'
import type { Instability, Severity } from '../types'
import { cardSwap } from '../lib/swap'

const SEV_RANK: Record<Severity, number> = { high: 3, med: 2, low: 1 }
const SEV_TONE: Record<Severity, Tone> = { high: 'bad', med: 'warn', low: 'idle' }
const AMSTAR_TONE: Record<string, Tone> = { High: 'ok', Moderate: 'info', Low: 'warn', 'Critically low': 'bad' }

// review-methods findings are repaired where their input lives
function sourceOf(i: Instability): { label: string; to: string } {
  if (i.type !== 'srma_gap') return INSTABILITY_SOURCE[i.type]
  const key = i.id.replace(/^inst_srma_/, '')
  if (/rob/.test(key)) return { label: 'risk_of_bias', to: '/rob' }
  if (/prisma|flow/.test(key)) return { label: 'prisma', to: '/prisma' }
  if (/screen|dual|kappa/.test(key)) return { label: 'screening', to: '/screening' }
  if (/extract|data|studies|pool|k\b/.test(key)) return { label: 'extraction', to: '/studies' }
  if (/grade|hetero|bias|egger/.test(key)) return { label: 'statistics', to: '/meta' }
  return { label: 'protocol', to: '/protocol' }
}

/**
 * RIGOR — QA over the project. Each rule family reads the project (design and
 * the systematic review) and raises an issue with a specific message and a
 * repair. Inspect an issue, repair it at its source, or acknowledge / resolve
 * it with a note; every action is logged. No scores-as-prizes: this is QA.
 */
export default function Suspension() {
  const { state, instabilities, stability, setInstabilityStatus, setPreRegistered, setPrimaryEndpoint, updateReview } = useStore()
  const pid = state.project.id
  const [params, setParams] = useSearchParams()
  const [filter, setFilter] = useState<'open' | 'handled' | 'all'>('open')
  const sorted = useMemo(() => [...instabilities].sort((a, b) => {
    if (a.status !== b.status) return a.status === 'open' ? -1 : 1
    return SEV_RANK[b.severity] - SEV_RANK[a.severity]
  }), [instabilities])
  const open = instabilities.filter((i) => i.status === 'open')
  const sev = (s: Severity) => open.filter((i) => i.severity === s).length
  const listed = sorted.filter((i) => (filter === 'all' ? true : filter === 'open' ? i.status === 'open' : i.status !== 'open'))
  const selId = params.get('issue')
  const sel = listed.find((i) => i.id === selId) ?? (selId ? sorted.find((i) => i.id === selId) : undefined) ?? listed[0]
  const select = (id: string) => setParams({ issue: id }, { replace: true })

  // resolve-with-note + audit trail
  const [resolving, setResolving] = useState<'acknowledged' | 'resolved' | null>(null)
  const [note, setNote] = useState('')
  const [bump, setBump] = useState(0)
  const audit = useMemo(() => getAudit(pid), [pid, bump]) // eslint-disable-line react-hooks/exhaustive-deps

  // score trend (one point per day; accumulates across sessions)
  const [trend, setTrend] = useState(() => getTrend(pid))
  useEffect(() => {
    setTrend(recordScore(pid, stability, Date.now()))
  }, [pid, stability])

  function applyStatus(i: Instability, action: 'acknowledged' | 'resolved' | 'open', noteText?: string) {
    const label = `${rigorId(i.id)} ${INSTABILITY_LABEL[i.type]}`
    cardSwap(document.querySelector('.rg-inspector'), 'flip', () => {
      setInstabilityStatus(i.id, action)
      if (action !== 'open') appendAudit(pid, { ts: Date.now(), findingId: i.id, label, action, note: noteText?.trim() || undefined })
      else appendAudit(pid, { ts: Date.now(), findingId: i.id, label, action: 'reopened' })
      setBump((b) => b + 1)
      setResolving(null)
      setNote('')
    })
  }

  const amstar = state.review.amstar ?? {}
  const rating = amstarRating(amstar)
  const setAmstar = (id: string, val: AmstarAnswer) => updateReview({ amstar: { ...amstar, [id]: amstar[id] === val ? undefined as unknown as AmstarAnswer : val } })

  // ---- Terra review ----
  const [aiText, setAiText] = useState('')
  const [aiStreaming, setAiStreaming] = useState(false)
  const [aiError, setAiError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  useEffect(() => () => abortRef.current?.abort(), [])

  async function aiReview() {
    if (aiStreaming) return
    if (!hasKey()) {
      setAiError('Terra is off — add an OpenAI key in Knowledge review → Settings.')
      return
    }
    setAiError(null)
    setAiText('')
    setAiStreaming(true)
    const findings = open.map((i) => `- [${i.severity}] ${rigorId(i.id)} ${INSTABILITY_LABEL[i.type]} (${i.targetLabel}): ${i.comment}`).join('\n')
    const assays = state.assays.map((a) => `${a.method} · n=${a.sampleN ?? '?'} · ${a.controls || 'no controls'} · ${a.status}`).join('; ')
    const messages: ChatMessage[] = [
      {
        role: 'system',
        content:
          'You are a rigorous methods reviewer for a research project that also runs a systematic review. Give specific, constructive review comments — like a study-section critique. Use markdown: a short overall read, then the 3 highest-priority issues with concrete fixes, then anything the automated checks missed. Be blunt but useful; no filler.',
      },
      {
        role: 'user',
        content: `Project: ${state.project.name}\nCentral hypothesis: ${state.project.centralHypothesis}\n\nHypotheses:\n${state.hypotheses.map((h) => `- ${h.label}: ${h.statement}`).join('\n')}\n\nAssays: ${assays}\n\nPre-registered: ${state.project.preRegistered}; primary endpoint: ${state.project.primaryEndpoint ?? 'none'}\n\nAutomated rigor findings:\n${findings || 'none'}\n\nReview the design.`,
      },
    ]
    const ctrl = new AbortController()
    abortRef.current = ctrl
    try {
      await streamChat({ messages, model: getModel(), signal: ctrl.signal, onToken: (d) => setAiText((t) => t + d) })
    } catch (e) {
      if (!(e instanceof DOMException && e.name === 'AbortError')) setAiError(e instanceof Error ? e.message : 'Request failed')
    } finally {
      setAiStreaming(false)
      abortRef.current = null
    }
  }

  // trend sparkline geometry
  const TW = 220
  const TH = 34
  const tx = (i: number) => (trend.length <= 1 ? TW : (i / (trend.length - 1)) * TW)
  const ty = (s: number) => TH - 3 - s * (TH - 6)
  const trendPath = trend.map((p, i) => `${i === 0 ? 'M' : 'L'}${tx(i).toFixed(1)},${ty(p.score).toFixed(1)}`).join(' ')
  const tone = stability >= 0.75 ? 'tone-ok' : stability >= 0.5 ? 'tone-warn' : 'tone-bad'
  const src = sel ? sourceOf(sel) : null

  return (
    <>
      <div className="page-head">
        <div className="flex" style={{ justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
          <div style={{ minWidth: 0 }}>
            <Kicker>qa / rigor</Kicker>
            <h1>Rigor monitor</h1>
            <p>QA over the whole project — study design and the systematic review. Each rule family reads the project and raises an issue with a specific message and a repair. Repair it at its source, or acknowledge / resolve it with a note; every action is logged.</p>
          </div>
          <div className="row-actions">
            <button className="btn ghost sm" onClick={aiReview} disabled={aiStreaming}>{aiStreaming ? 'checking rigor…' : 'terra · review design'}</button>
          </div>
        </div>
      </div>

      <div className="readouts" style={{ marginBottom: 12 }}>
        <div className="readout">
          <span>score</span><b className={tone}>{Math.round(stability * 100)}%</b>
          {trend.length > 1
            ? <svg viewBox={`0 0 ${TW} ${TH}`} width="100%" height="22" style={{ display: 'block', marginTop: 2 }} role="img" aria-label="Rigor score trend">
                <line x1={0} y1={ty(0.75)} x2={TW} y2={ty(0.75)} stroke="var(--line)" strokeWidth={1} strokeDasharray="3 3" />
                <path d={trendPath} fill="none" stroke="var(--accent)" strokeWidth={1.5} />
              </svg>
            : <small>{trend.length ? 'trend from today' : 'no trend yet'}</small>}
        </div>
        <div className="readout"><span>open</span><b>{open.length}</b><small>{instabilities.length - open.length} handled</small></div>
        <div className="readout"><span>high</span><b className={sev('high') ? 'tone-bad' : ''}>{sev('high')}</b><small>severity</small></div>
        <div className="readout"><span>medium</span><b className={sev('med') ? 'tone-warn' : ''}>{sev('med')}</b><small>severity</small></div>
        <div className="readout"><span>low</span><b>{sev('low')}</b><small>severity</small></div>
      </div>

      <div className="rg-grid">
        <div className="rg-list card" style={{ padding: 0 }}>
          <div className="card-h" style={{ margin: 0, padding: '6px 10px 6px 14px' }}>
            issues
            <span className="spacer" />
            <span className="seg" role="group" aria-label="Filter issues" style={{ textTransform: 'none', letterSpacing: 0 }}>
              {(['open', 'handled', 'all'] as const).map((f) => <button key={f} className={`seg-b${filter === f ? ' on' : ''}`} aria-pressed={filter === f} onClick={() => setFilter(f)}>{f}</button>)}
            </span>
          </div>
          {listed.length === 0 ? <div style={{ padding: '10px 14px' }}><Empty path="rigor:">{filter === 'open' ? '0 open issues' : '0 issues'}</Empty></div> : (
            <ul className="rg-rows" role="listbox" aria-label="Rigor issues">
              {listed.map((i) => (
                <li key={i.id}>
                  <button className={`rg-row${sel?.id === i.id ? ' sel' : ''}${i.status !== 'open' ? ' handled' : ''}`} role="option" aria-selected={sel?.id === i.id} onClick={() => select(i.id)}>
                    <span className="mono rg-id">{rigorId(i.id)}</span>
                    <span className="rg-t">{INSTABILITY_LABEL[i.type]}{i.targetLabel ? <span className="muted"> · {i.targetLabel}</span> : null}</span>
                    {i.status === 'open' ? <Tag tone={SEV_TONE[i.severity]}>{SEVERITY_LABEL[i.severity]}</Tag> : <Tag tone="ok">{i.status}</Tag>}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="card rg-inspector" aria-live="polite">
          {!sel ? <Empty path="inspector/">no issue selected</Empty> : (
            <>
              <div className="card-h">{rigorId(sel.id)} <span className="spacer" />{sel.status === 'open' ? <Tag tone={SEV_TONE[sel.severity]}>{SEVERITY_LABEL[sel.severity]}</Tag> : <Tag tone="ok">{sel.status}</Tag>}</div>
              <div className="rg-title">{INSTABILITY_LABEL[sel.type]}</div>
              <MetaGrid className="wide" rows={[
                ['type', INSTABILITY_TYPE[sel.type]],
                ['severity', <span className={`mono sev-${sel.severity}`}>{SEVERITY_LABEL[sel.severity]}</span>],
                ['source', <Link className="mono" to={src!.to}>{src!.label}</Link>],
                ['status', <span className="mono">{sel.status}</span>],
                ['message', sel.signal],
                ['affected', <span className="mono">{sel.targetLabel ?? sel.target}</span>],
              ]} />
              <div className="insp-sec">detail</div>
              <p className="finding-comment">{sel.comment}</p>
              <div className="insp-sec">recommended action</div>
              <p className="finding-comment">{sel.repair}</p>
              <div className="wrap-gap" style={{ marginTop: 12 }}>
                <Link className="btn primary sm" to={src!.to}>repair in {src!.label} →</Link>
                {sel.status === 'open' ? (
                  <>
                    <button className="btn ghost sm" onClick={() => { setResolving('acknowledged'); setNote('') }}>acknowledge</button>
                    <button className="btn ghost sm" onClick={() => { setResolving('resolved'); setNote('') }}>mark resolved</button>
                  </>
                ) : <button className="btn ghost sm" onClick={() => applyStatus(sel, 'open')}>reopen</button>}
              </div>
              {resolving && sel.status === 'open' && (
                <div className="resolve-note">
                  <input className="input" autoFocus placeholder={`note — why this is ${resolving}…`} value={note} onChange={(e) => setNote(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && applyStatus(sel, resolving, note)} aria-label="Resolution note" />
                  <button className="btn primary sm" onClick={() => applyStatus(sel, resolving, note)}>confirm</button>
                  <button className="btn ghost sm" onClick={() => { setResolving(null); setNote('') }}>cancel</button>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {(aiText || aiStreaming || aiError) && (
        <div className="card lg rail" style={{ marginTop: 12 }}>
          <div className="card-h" style={{ justifyContent: 'space-between' }}>
            <span>terra · design review · {getModel()}</span>
            {aiStreaming ? <button className="icon-btn" onClick={() => abortRef.current?.abort()}>stop</button> : <button className="icon-btn" onClick={() => setAiText('')}>dismiss</button>}
          </div>
          {aiError && <div className="err">{aiError}</div>}
          {aiText ? <Markdown text={aiText} /> : aiStreaming && <Sk kind="audit" />}
        </div>
      )}

      <div className="grid g2" style={{ marginTop: 12, alignItems: 'start' }}>
        <div className="card">
          <div className="card-h">project controls</div>
          <label className="check" style={{ marginBottom: 6 }}>
            <input type="checkbox" checked={state.project.preRegistered} onChange={(e) => setPreRegistered(e.target.checked)} /> analysis plan pre-registered
          </label>
          <label className="check" style={{ marginBottom: 8 }}>
            <input type="checkbox" checked={state.review.dualExtraction ?? false} onChange={(e) => updateReview({ dualExtraction: e.target.checked })} /> data extracted in duplicate
          </label>
          <label className="field" style={{ marginBottom: 6 }}>
            <span className="field-l">primary endpoint</span>
            <input className="input" placeholder="the single pre-specified endpoint" value={state.project.primaryEndpoint ?? ''} onChange={(e) => setPrimaryEndpoint(e.target.value || undefined)} />
          </label>
          <p className="small">These read project state directly — set them and the matching analysis-plan and review-methods issues clear.</p>
        </div>

        <div className="card">
          <div className="card-h">audit trail <span className="spacer" /><span style={{ textTransform: 'none', letterSpacing: 0 }}>{audit.length} entries</span></div>
          {audit.length === 0 ? <Empty path="audit/">no actions logged</Empty> : (
            <div className="log">
              {audit.slice(0, 14).map((a, i) => (
                <div className="log-row" key={i}>
                  <time dateTime={new Date(a.ts).toISOString()}>{stamp(a.ts)}</time>
                  <span className="lk">{a.action}</span>
                  <span className="lt" title={a.note}>{a.label}{a.note ? ` — “${a.note}”` : ''}</span>
                </div>
              ))}
            </div>
          )}
          <p className="small" style={{ marginTop: 8 }}>The audit trail and score trend persist in this browser.</p>
        </div>
      </div>

      <div className="card lg" style={{ marginTop: 12 }}>
        <div className="card-h" style={{ justifyContent: 'space-between' }}>
          <span>amstar-2 · review quality</span>
          {rating.answered === 0 ? <Tag tone="idle">not appraised</Tag> : <Tag tone={AMSTAR_TONE[rating.rating] ?? 'idle'}>{rating.rating}</Tag>}
        </div>
        <p className="small" style={{ marginBottom: 10 }}>
          {rating.answered === 0
            ? 'No items appraised yet — rate the 16 domains below to compute an AMSTAR-2 confidence rating.'
            : <>{rating.critical} critical + {rating.nonCritical} non-critical weakness{rating.nonCritical === 1 ? '' : 'es'} · {rating.answered}/16 answered. Critical domains (★) drive the overall confidence rating.</>}
        </p>
        <div className="amstar-grid">
          {AMSTAR_ITEMS.map((it) => (
            <div className="amstar-row" key={it.id}>
              <span className="am-n">{it.n}{it.critical && <span className="am-star" title="Critical domain">★</span>}</span>
              <span className="am-text">{it.text}</span>
              <span className="seg am-seg" role="group" aria-label={`AMSTAR item ${it.n}`}>
                {(['yes', 'partial', 'no'] as AmstarAnswer[]).map((v) => (
                  <button key={v} className={`seg-b am-b am-${v}${amstar[it.id] === v ? ' on' : ''}`} aria-pressed={amstar[it.id] === v} onClick={() => setAmstar(it.id, v)}>{v === 'yes' ? 'Y' : v === 'partial' ? 'P' : 'N'}</button>
                ))}
              </span>
            </div>
          ))}
        </div>
      </div>
    </>
  )
}
