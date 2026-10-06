import { useMemo, useState } from 'react'
import { useStore } from '../lib/store'
import { Kicker, Rule } from '../components/ui'
import { Markdown } from '../components/Markdown'
import { Sk } from '../components/Skeleton'
import { parseComments, reviewContext, buildLetter } from '../lib/reviewers'
import { computeMeta, computeGrade, eggersTest, fmt } from '../lib/metaAnalysis'
import { complete, parseJsonLoose, hasKey, getModel } from '../lib/openai'

function download(content: string, name: string, type: string) {
  const blob = new Blob([content], { type })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  URL.revokeObjectURL(url)
}

const SAMPLE = `Reviewer 1
1. The number of included studies is small, which limits the strength of the pooled estimate. Please comment on statistical power.
2. Heterogeneity should be explored further — consider a subgroup or sensitivity analysis.

Reviewer 2
1. How was publication bias assessed with fewer than 10 studies?
2. The certainty of evidence is not clearly justified.`

export default function Reviewers() {
  const { state } = useStore()
  const r = state.review
  const meta = useMemo(() => computeMeta(r.studies, r.model, r.effect), [r.studies, r.model, r.effect])
  const egger = useMemo(() => eggersTest(r.studies, r.effect), [r.studies, r.effect])
  const grade = useMemo(() => computeGrade(r, meta, egger), [r, meta, egger])

  const [raw, setRaw] = useState('')
  const comments = useMemo(() => parseComments(raw), [raw])
  const [responses, setResponses] = useState<Record<string, string>>({})
  const [aiOn, setAiOn] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const pooled = meta.k > 0 ? `${r.effect} ${fmt(meta.pooledEst)} (95% CI ${fmt(meta.pooledLow)}–${fmt(meta.pooledHigh)}), ${meta.k} studies` : undefined
  const letter = buildLetter({ title: r.title, comments, responses })
  const slug = (state.project.code || 'response').toLowerCase()
  const drafted = comments.filter((c) => responses[c.id]?.trim()).length

  async function draftAll() {
    if (aiOn) return
    if (!hasKey()) { setError('Add an OpenAI key in Knowledge Review → Settings to draft responses.'); return }
    if (!comments.length) { setError('Paste the reviewer comments first.'); return }
    setAiOn(true); setError(null)
    try {
      const ctx = reviewContext(state, { pooled, certainty: grade.certainty, i2: `${fmt(meta.I2, 0)}%` })
      const list = comments.map((c, i) => `${i + 1}. ${c.comment.replace(/\n/g, ' ')}`).join('\n')
      const out = await complete(
        [
          { role: 'system', content: 'You are a methodologist drafting a point-by-point response-to-reviewers for a systematic review & meta-analysis. For each comment, write a courteous, specific 2–4 sentence response that engages the concern and cites only methods/results explicitly present in context. Never invent data, analyses, manuscript edits, or completed revisions. Where a change is warranted, propose a revision for the author to make and verify. Output ONLY a JSON array: [{"n":1,"response":"…"}].' },
          { role: 'user', content: `Review context:\n${ctx}\n\nReviewer comments:\n${list}` },
        ],
        getModel(),
      )
      const arr = parseJsonLoose<{ n: number; response: string }[]>(out)
      const next: Record<string, string> = {}
      for (const item of arr) {
        const c = comments[(item?.n ?? 0) - 1]
        if (c && item?.response) next[c.id] = item.response
      }
      setResponses((prev) => ({ ...prev, ...next }))
      if (Object.keys(next).length === 0) setError('The model returned an unexpected format — try again.')
    } catch {
      setError('Drafting failed — the model may have returned invalid JSON. Try again.')
    } finally {
      setAiOn(false)
    }
  }

  return (
    <>
      <div className="page-head">
        <Rule />
        <div className="flex" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <Kicker>output / rebuttal</Kicker>
            <h1 style={{ marginTop: 12 }}>Response to reviewers</h1>
            <p>Paste the reviewers' report to split it into individual points. Draft responses from project context, verify every claim and proposed revision, then export the letter.</p>
          </div>
          <div className="row-actions" style={{ flex: 'none', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            <button className="btn ghost sm" onClick={() => download(letter, `${slug}-response-to-reviewers.md`, 'text/markdown')} disabled={!comments.length}>⤓ Markdown</button>
            <button className="btn ghost sm" onClick={() => { navigator.clipboard?.writeText(letter); setCopied(true); setTimeout(() => setCopied(false), 1500) }} disabled={!comments.length}>{copied ? 'Copied ✓' : 'Copy letter'}</button>
            <button className="btn primary sm" onClick={draftAll} disabled={aiOn || !comments.length}>{aiOn ? 'Drafting…' : 'terra · draft all responses'}</button>
          </div>
        </div>
      </div>

      {error && <div className="err" style={{ marginBottom: 16 }}>{error}</div>}

      <div className="grid g2">
        <div className="card lg">
          <div className="card-h" style={{ justifyContent: 'space-between' }}>
            <span><span className="sq" style={{ background: 'var(--blue)' }} />REVIEWERS' REPORT</span>
            <span className="small mono muted">{comments.length} point{comments.length === 1 ? '' : 's'}{drafted > 0 ? ` · ${drafted} drafted` : ''}</span>
          </div>
          <textarea className="textarea" aria-label="Reviewer comments" rows={12} style={{ width: '100%' }} placeholder="Paste the reviewers' comments here…" value={raw} onChange={(e) => setRaw(e.target.value)} />
          {!raw && <button className="btn ghost sm" style={{ marginTop: 8 }} onClick={() => setRaw(SAMPLE)}>Load a sample report</button>}

          {comments.length > 0 && (
            <div style={{ marginTop: 14 }}>
              {comments.map((c) => (
                <div key={c.id} className="pblock" style={{ border: '1px solid var(--line)', borderRadius: 10, padding: 12, marginBottom: 12 }}>
                  <div className="small mono" style={{ color: 'var(--blue)', fontWeight: 700, marginBottom: 4 }}>{c.label}</div>
                  <div className="small" style={{ fontStyle: 'italic', marginBottom: 8, whiteSpace: 'pre-wrap' }}>{c.comment}</div>
                  <textarea className="textarea" rows={3} style={{ width: '100%', fontSize: 13 }} placeholder="Response… (or use terra · draft all)" value={responses[c.id] ?? ''} onChange={(e) => setResponses((p) => ({ ...p, [c.id]: e.target.value }))} />
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card lg">
          <div className="card-h"><span className="sq" style={{ background: 'var(--green)' }} />RESPONSE LETTER</div>
          {aiOn && <div style={{ marginBottom: 14 }}><Sk kind="letter" label={`Drafting ${comments.length} response${comments.length === 1 ? '' : 's'}`} parts={comments.map((c) => c.label)} /></div>}
          {comments.length === 0 ? (
            <p className="empty">Paste the reviewers' report on the left to build the letter. Responses are grounded in this review: {pooled ? <>pooled <b>{pooled}</b>, <b>{grade.certainty}</b> certainty.</> : 'add studies for the pooled estimate to be cited.'}</p>
          ) : (
            <div className="manuscript" style={{ fontSize: 13.5 }}><Markdown text={letter} /></div>
          )}
        </div>
      </div>
      <p className="small muted" style={{ marginTop: 10 }}>Terra receives this review's methods and results as context. Check each response against the manuscript and confirm any proposed revision before sending.</p>
    </>
  )
}
