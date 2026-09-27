import { useEffect, useMemo, useRef, useState } from 'react'
import { Sk } from '../components/Skeleton'
import type { CSSProperties } from 'react'
import { Link } from 'react-router-dom'
import { useStore } from '../lib/store'
import { Kicker, Rule, SevDot } from '../components/ui'
import { Markdown } from '../components/Markdown'
import { INSTABILITY_LABEL, SEVERITY_COLOR } from '../lib/palette'
import { streamChat, hasKey, getModel, type ChatMessage } from '../lib/openai'
import { AMSTAR_ITEMS, amstarRating, AMSTAR_COLOR, type AmstarAnswer } from '../lib/amstar'
import { appendAudit, getAudit, recordScore, getTrend } from '../lib/rigorLog'
import type { Severity } from '../types'

function sevRank(s: Severity) {
  return s === 'high' ? 3 : s === 'med' ? 2 : 1
}
const relTime = (ts: number, now: number) => {
  const m = Math.round((now - ts) / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.round(h / 24)}d ago`
}

export default function Suspension() {
  const { state, instabilities, stability, setInstabilityStatus, setPreRegistered, setPrimaryEndpoint, updateReview } = useStore()
  const pid = state.project.id
  const sorted = [...instabilities].sort((a, b) => {
    if (a.status !== b.status) return a.status === 'open' ? -1 : 1
    return sevRank(b.severity) - sevRank(a.severity)
  })
  const open = instabilities.filter((i) => i.status === 'open').length
  const gaugeCol = stability >= 0.75 ? SEVERITY_COLOR.low : stability >= 0.5 ? SEVERITY_COLOR.med : SEVERITY_COLOR.high

  // resolve-with-note + audit trail
  const [resolving, setResolving] = useState<{ id: string; action: 'acknowledged' | 'resolved' } | null>(null)
  const [note, setNote] = useState('')
  const [bump, setBump] = useState(0)
  const now = Date.now()
  const audit = useMemo(() => getAudit(pid), [pid, bump])

  // score trend (one point per day; accumulates across sessions)
  const [trend, setTrend] = useState(() => getTrend(pid))
  useEffect(() => {
    setTrend(recordScore(pid, stability, Date.now()))
  }, [pid, stability])

  function applyStatus(id: string, action: 'acknowledged' | 'resolved' | 'open', label: string, noteText?: string) {
    setInstabilityStatus(id, action)
    if (action !== 'open') appendAudit(pid, { ts: Date.now(), findingId: id, label, action, note: noteText?.trim() || undefined })
    else appendAudit(pid, { ts: Date.now(), findingId: id, label, action: 'reopened' })
    setBump((b) => b + 1)
    setResolving(null)
    setNote('')
  }

  const amstar = state.review.amstar ?? {}
  const rating = amstarRating(amstar)
  const setAmstar = (id: string, val: AmstarAnswer) => updateReview({ amstar: { ...amstar, [id]: amstar[id] === val ? undefined as unknown as AmstarAnswer : val } })

  // ---- AI reviewer ----
  const [aiText, setAiText] = useState('')
  const [aiStreaming, setAiStreaming] = useState(false)
  const [aiError, setAiError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  async function aiReview() {
    if (aiStreaming) return
    if (!hasKey()) {
      setAiError('No OpenAI key set — add one in Knowledge Review → Settings.')
      return
    }
    setAiError(null)
    setAiText('')
    setAiStreaming(true)
    const findings = instabilities
      .filter((i) => i.status === 'open')
      .map((i) => `- [${i.severity}] ${INSTABILITY_LABEL[i.type]} (${i.targetLabel}): ${i.comment}`)
      .join('\n')
    const assays = state.assays.map((a) => `${a.method} · n=${a.sampleN ?? '?'} · ${a.controls || 'no controls'} · ${a.status}`).join('; ')
    const messages: ChatMessage[] = [
      {
        role: 'system',
        content:
          'You are a rigorous methods reviewer for a translational cardiac-EP / epigenetics study that also runs a systematic review. Give actual, specific, constructive review comments — like a study-section critique. Use markdown: a short overall read, then the 3 highest-priority issues with concrete fixes, then anything the automated checks missed. Be blunt but useful; no filler.',
      },
      {
        role: 'user',
        content: `Project: ${state.project.name}\nCentral hypothesis: ${state.project.centralHypothesis}\n\nHypotheses:\n${state.hypotheses
          .map((h) => `- ${h.label}: ${h.statement}`)
          .join('\n')}\n\nAssays: ${assays}\n\nPre-registered: ${state.project.preRegistered}; primary endpoint: ${state.project.primaryEndpoint ?? 'none'}\n\nAutomated rigor findings:\n${findings || 'none'}\n\nReview the design.`,
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
  const TH = 40
  const tx = (i: number) => (trend.length <= 1 ? TW : (i / (trend.length - 1)) * TW)
  const ty = (s: number) => TH - 3 - s * (TH - 6)
  const trendPath = trend.map((p, i) => `${i === 0 ? 'M' : 'L'}${tx(i).toFixed(1)},${ty(p.score).toFixed(1)}`).join(' ')

  return (
    <>
      <div className="page-head">
        <Rule />
        <div className="flex" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <Kicker>RIGOR MONITOR · STUDY-DESIGN INTEGRITY</Kicker>
            <h1 style={{ marginTop: 12 }}>Rigor Monitor</h1>
            <p>Automated checks read the actual project — including the systematic review — and write a specific comment on each weakness. Resolve one with a note (it's logged), and the rigor score recovers. Appraise the review itself with AMSTAR-2, or run a holistic AI review.</p>
          </div>
          <div className="row-actions" style={{ flex: 'none' }}>
            <button className="btn primary sm" onClick={aiReview} disabled={aiStreaming}>{aiStreaming ? 'Reviewing…' : '✦ AI review'}</button>
          </div>
        </div>
      </div>

      <div className="grid g3" style={{ marginBottom: 16 }}>
        <div className="stat">
          <b style={{ color: gaugeCol }}>{Math.round(stability * 100)}%</b>
          <span>Rigor score</span>
          <div className="sub">{open} open · {instabilities.length - open} handled</div>
          {trend.length > 0 && (
            <svg viewBox={`0 0 ${TW} ${TH}`} width="100%" height="34" style={{ marginTop: 8, display: 'block' }}>
              <line x1={0} y1={ty(0.75)} x2={TW} y2={ty(0.75)} stroke="var(--line)" strokeWidth={1} strokeDasharray="3 3" />
              <path d={trendPath} fill="none" stroke={gaugeCol} strokeWidth={2} />
              {trend.map((p, i) => <circle key={i} cx={tx(i)} cy={ty(p.score)} r={2.4} fill={gaugeCol} />)}
            </svg>
          )}
        </div>
        <div className="card" style={{ gridColumn: 'span 2' }}>
          <div className="card-h"><span className="sq" style={{ background: 'var(--blue)' }} />QUICK FIXES · STRATEGY &amp; REVIEW</div>
          <label className="flex" style={{ cursor: 'pointer', marginBottom: 8 }}>
            <input type="checkbox" checked={state.project.preRegistered} onChange={(e) => setPreRegistered(e.target.checked)} />
            <span style={{ fontSize: 13, fontWeight: 600 }}>Pre-register the analysis plan</span>
          </label>
          <label className="flex" style={{ cursor: 'pointer', marginBottom: 8 }}>
            <input type="checkbox" checked={state.review.dualExtraction ?? false} onChange={(e) => updateReview({ dualExtraction: e.target.checked })} />
            <span style={{ fontSize: 13, fontWeight: 600 }}>Data extracted in duplicate (dual extraction)</span>
          </label>
          <div className="kv" style={{ alignItems: 'center' }}>
            <span className="k">Primary EP</span>
            <input className="input" style={{ minWidth: 240, flex: 1 }} placeholder="e.g. SCN5A-promoter methylation index (pyroseq)" value={state.project.primaryEndpoint ?? ''} onChange={(e) => setPrimaryEndpoint(e.target.value || undefined)} />
          </div>
          <p className="small" style={{ marginTop: 8 }}>These read real project state — set them and the matching <b>statistical-ambiguity</b> and <b>review rigor</b> findings clear themselves.</p>
        </div>
      </div>

      {/* AMSTAR-2 appraisal of the review */}
      <div className="card lg" style={{ marginBottom: 16 }}>
        <div className="card-h" style={{ justifyContent: 'space-between' }}>
          <span><span className="sq" style={{ background: 'var(--violet)' }} />AMSTAR-2 · REVIEW QUALITY</span>
          {rating.answered === 0 ? (
            <span className="amstar-rating" style={{ background: 'var(--card-2)', color: 'var(--muted)', borderColor: 'var(--line)' }}>Not appraised</span>
          ) : (
            <span className="amstar-rating" style={{ background: `color-mix(in srgb, ${AMSTAR_COLOR[rating.rating]} 14%, var(--card))`, color: AMSTAR_COLOR[rating.rating], borderColor: AMSTAR_COLOR[rating.rating] }}>
              {rating.rating}
            </span>
          )}
        </div>
        <p className="small" style={{ marginBottom: 12 }}>
          {rating.answered === 0
            ? 'No items appraised yet — rate the 16 domains below to compute an AMSTAR-2 confidence rating.'
            : <>{rating.critical} critical + {rating.nonCritical} non-critical weakness{rating.nonCritical === 1 ? '' : 'es'} · {rating.answered}/16 answered. Critical domains (★) drive the overall confidence rating.</>}
        </p>
        <div className="amstar-grid">
          {AMSTAR_ITEMS.map((it) => (
            <div className="amstar-row" key={it.id}>
              <span className="am-n">{it.n}{it.critical && <span className="am-star" title="Critical domain">★</span>}</span>
              <span className="am-text">{it.text}</span>
              <span className="seg am-seg">
                {(['yes', 'partial', 'no'] as AmstarAnswer[]).map((v) => (
                  <button key={v} className={`seg-b am-b am-${v}${amstar[it.id] === v ? ' on' : ''}`} onClick={() => setAmstar(it.id, v)}>{v === 'yes' ? 'Y' : v === 'partial' ? 'P' : 'N'}</button>
                ))}
              </span>
            </div>
          ))}
        </div>
      </div>

      {(aiText || aiStreaming || aiError) && (
        <div className="card lg rail" style={{ marginBottom: 16, ['--rail' as string]: 'var(--blue)' } as CSSProperties}>
          <div className="card-h" style={{ justifyContent: 'space-between' }}>
            <span><span className="sq" style={{ background: 'var(--blue)' }} />AI REVIEW · {getModel()}</span>
            {aiStreaming ? <button className="icon-btn" onClick={() => abortRef.current?.abort()}>Stop</button> : <button className="icon-btn" onClick={() => setAiText('')}>Dismiss</button>}
          </div>
          {aiError && <div className="err">{aiError}</div>}
          {aiText ? <Markdown text={aiText} /> : aiStreaming && <Sk kind="audit" />}
        </div>
      )}

      <div className="findings">
        {sorted.map((i) => (
          <div className="finding" key={i.id} style={{ borderLeftColor: SEVERITY_COLOR[i.severity], opacity: i.status !== 'open' ? 0.5 : 1 }}>
            <div className="finding-top">
              <SevDot severity={i.severity} label={INSTABILITY_LABEL[i.type]} />
              <span className="finding-target mono">{i.targetLabel ?? i.target}</span>
              <span className="spacer" />
              {i.status === 'open' ? (
                <div className="row-actions">
                  <button className="icon-btn" onClick={() => { setResolving({ id: i.id, action: 'acknowledged' }); setNote('') }}>Ack</button>
                  <button className="icon-btn" onClick={() => { setResolving({ id: i.id, action: 'resolved' }); setNote('') }}>Resolve</button>
                </div>
              ) : (
                <div className="row-actions">
                  <span className="badge b-done">{i.status}</span>
                  <button className="icon-btn" onClick={() => applyStatus(i.id, 'open', INSTABILITY_LABEL[i.type])}>Reopen</button>
                </div>
              )}
            </div>
            <p className="finding-comment">{i.comment}</p>
            <p className="finding-fix"><span className="fix-l">Fix</span> {i.repair}</p>
            {resolving?.id === i.id && (
              <div className="resolve-note">
                <input className="input" autoFocus placeholder={`Note (optional) — why you're marking this ${resolving.action}…`} value={note} onChange={(e) => setNote(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && applyStatus(i.id, resolving.action, INSTABILITY_LABEL[i.type], note)} />
                <button className="btn primary sm" onClick={() => applyStatus(i.id, resolving.action, INSTABILITY_LABEL[i.type], note)}>Confirm {resolving.action}</button>
                <button className="btn ghost sm" onClick={() => { setResolving(null); setNote('') }}>Cancel</button>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* audit trail */}
      <div className="card lg" style={{ marginTop: 16 }}>
        <div className="card-h"><span className="sq" style={{ background: 'var(--navy)' }} />AUDIT TRAIL</div>
        {audit.length === 0 ? (
          <p className="empty">No actions logged yet. Resolve or acknowledge a finding and it's recorded here with your note.</p>
        ) : (
          audit.slice(0, 14).map((a, i) => (
            <div className="audit-row" key={i}>
              <span className={`audit-act audit-${a.action}`}>{a.action}</span>
              <span className="audit-label">{a.label}</span>
              {a.note && <span className="audit-note">“{a.note}”</span>}
              <span className="audit-time">{relTime(a.ts, now)}</span>
            </div>
          ))
        )}
        <div className="divider" />
        <p className="small">The audit trail and score trend persist in this browser. For the review's methodological quality, keep the <Link to="/studies">RoB judgements</Link> and AMSTAR-2 items current.</p>
      </div>
    </>
  )
}
