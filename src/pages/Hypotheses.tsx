import { useMemo, useRef, useState } from 'react'
import { Sk } from '../components/Skeleton'
import { useStore } from '../lib/store'
import { Kicker, Rule, HypBadge, SevDot } from '../components/ui'
import { Modal, Field } from '../components/Modal'
import { Markdown } from '../components/Markdown'
import { INSTABILITY_LABEL } from '../lib/palette'
import { computeMeta, fmt } from '../lib/metaAnalysis'
import { streamChat, hasKey, getModel } from '../lib/openai'
import type { Hypothesis, HypothesisStatus, HypEvidence } from '../types'
import { analysisIncluded } from '../lib/cohorts'

type Draft = {
  label: string
  statement: string
  direction: 'positive' | 'negative' | 'none'
  effect: string
  falsification: string
  requiresTissue: string
  status: HypothesisStatus
}

const blank: Draft = { label: '', statement: '', direction: 'negative', effect: '', falsification: '', requiresTissue: '', status: 'draft' }

function toDraft(h: Hypothesis): Draft {
  return {
    label: h.label,
    statement: h.statement,
    direction: h.prediction?.direction ?? 'none',
    effect: h.prediction?.effect ?? '',
    falsification: h.falsification ?? '',
    requiresTissue: h.requiresTissue ?? '',
    status: h.status,
  }
}

function suggestStatus(supports: number, refutes: number, current: HypothesisStatus): HypothesisStatus {
  if (supports + refutes === 0) return current
  if (refutes > supports) return 'refuted'
  if (supports >= 2 && refutes === 0) return 'supported'
  return 'testing'
}

export default function Hypotheses() {
  const { state, instabilities, addHypothesis, updateHypothesis, removeHypothesis } = useStore()
  const [editing, setEditing] = useState<{ id: string | null; draft: Draft } | null>(null)
  const [crit, setCrit] = useState<Record<string, { text: string; streaming: boolean; error?: string }>>({})
  const abortRef = useRef<Record<string, AbortController>>({})
  const paperTitle = (id: string) => state.papers.find((p) => p.id === id)?.title ?? id

  const r = state.review
  const meta = useMemo(() => computeMeta(r.studies, r.model, r.effect), [r])
  const inclStudies = useMemo(() => r.studies.filter(analysisIncluded), [r.studies])
  const studyLabel = (id: string) => {
    const s = r.studies.find((x) => x.id === id)
    return s ? `${s.author} ${s.year}` : 'study'
  }
  const evLabel = (e: HypEvidence) => (e.kind === 'pooled' ? `Pooled ${r.effect} ${fmt(meta.pooledEst)}` : studyLabel(e.id))

  function setEv(h: Hypothesis, ev: HypEvidence[]) {
    updateHypothesis(h.id, { evidence: ev })
  }
  function addEv(h: Hypothesis, kind: HypEvidence['kind'], id: string, stance: HypEvidence['stance']) {
    setEv(h, [...(h.evidence ?? []).filter((e) => !(e.kind === kind && e.id === id)), { kind, id, stance }])
  }
  function removeEv(h: Hypothesis, kind: HypEvidence['kind'], id: string) {
    setEv(h, (h.evidence ?? []).filter((e) => !(e.kind === kind && e.id === id)))
  }
  function flipEv(h: Hypothesis, kind: HypEvidence['kind'], id: string) {
    setEv(h, (h.evidence ?? []).map((e) => (e.kind === kind && e.id === id ? { ...e, stance: e.stance === 'supports' ? 'refutes' : 'supports' } : e)))
  }

  async function critique(h: Hypothesis) {
    if (!hasKey()) {
      setCrit((c) => ({ ...c, [h.id]: { text: '', streaming: false, error: 'Add an OpenAI key in Knowledge Review → Settings to critique.' } }))
      return
    }
    setCrit((c) => ({ ...c, [h.id]: { text: '', streaming: true } }))
    const ctrl = new AbortController()
    abortRef.current[h.id] = ctrl
    try {
      await streamChat({
        model: getModel(),
        signal: ctrl.signal,
        onToken: (d) => setCrit((c) => ({ ...c, [h.id]: { ...c[h.id], text: (c[h.id]?.text ?? '') + d } })),
        messages: [
          { role: 'system', content: 'You are a sharp study-section reviewer. Pressure-test this ONE hypothesis in ≤130 words of markdown: (1) is it genuinely falsifiable as written? (2) its weakest assumption or most likely confounder; (3) name the single most informative experiment that would most change your belief. Blunt, specific, no filler.' },
          { role: 'user', content: `Hypothesis "${h.label}": ${h.statement}\nPrediction: ${h.prediction?.direction ?? 'none'} ${h.prediction?.effect ?? ''}\nFalsified if: ${h.falsification ?? '(none stated)'}\nRequires tissue: ${h.requiresTissue ?? 'any'}\nProject: ${state.project.name} — ${state.project.centralHypothesis}` },
        ],
      })
    } catch (e) {
      if (!(e instanceof DOMException && e.name === 'AbortError')) setCrit((c) => ({ ...c, [h.id]: { ...c[h.id], streaming: false, error: e instanceof Error ? e.message : 'Request failed' } }))
    } finally {
      setCrit((c) => ({ ...c, [h.id]: { ...c[h.id], streaming: false } }))
      delete abortRef.current[h.id]
    }
  }

  function save() {
    if (!editing) return
    const d = editing.draft
    const patch: Partial<Hypothesis> = {
      label: d.label || 'Untitled hypothesis',
      statement: d.statement,
      prediction: { direction: d.direction, effect: d.effect || undefined },
      falsification: d.falsification || undefined,
      requiresTissue: d.requiresTissue || undefined,
      status: d.status,
    }
    if (editing.id) updateHypothesis(editing.id, patch)
    else addHypothesis(patch as Omit<Hypothesis, 'id'>)
    setEditing(null)
  }

  return (
    <>
      <div className="page-head">
        <Rule />
        <Kicker>HYPOTHESIS GRAPH · FALSIFIABLE CLAIMS</Kicker>
        <h1>Hypotheses</h1>
        <p>Every claim carries a predicted direction, an effect size, and the observation that would kill it. Cite the review's studies and pooled estimate as evidence, tally support vs refutation, and pressure-test each with AI.</p>
        <div className="head-actions">
          <button className="btn primary sm" onClick={() => setEditing({ id: null, draft: { ...blank } })}>＋ New hypothesis</button>
        </div>
      </div>

      <div className="grid" style={{ gap: 16 }}>
        {state.hypotheses.map((h) => {
          const flags = instabilities.filter((i) => i.target === h.id && i.status === 'open')
          const ev = h.evidence ?? []
          const supports = ev.filter((e) => e.stance === 'supports').length + (h.supportingPapers?.length ?? 0)
          const refutes = ev.filter((e) => e.stance === 'refutes').length
          const total = supports + refutes
          const suggested = suggestStatus(supports, refutes, h.status)
          const c = crit[h.id]
          return (
            <div className="card lg hcard" key={h.id}>
              <div className="flex">
                <h3 style={{ fontSize: 17 }}>{h.label}</h3>
                <span className="spacer" />
                <HypBadge status={h.status} />
                <div className="row-actions" style={{ marginLeft: 10 }}>
                  <button className="icon-btn" onClick={() => critique(h)} disabled={c?.streaming} title="AI pressure-test">✦ Critique</button>
                  <button className="icon-btn" onClick={() => setEditing({ id: h.id, draft: toDraft(h) })}>Edit</button>
                  <button className="icon-btn danger" onClick={() => { if (confirm(`Delete ${h.label}?`)) removeHypothesis(h.id) }}>Delete</button>
                </div>
              </div>
              <p className="st">{h.statement}</p>

              <div className="kv"><span className="k">Prediction</span><span className="val">{h.prediction ? `${h.prediction.direction} · ${h.prediction.effect ?? '—'}` : '— none set —'}</span></div>
              <div className="kv"><span className="k">Falsified if</span><span className="val">{h.falsification ?? <em style={{ color: 'var(--red)' }}>no criterion set</em>}</span></div>
              <div className="kv"><span className="k">Requires</span><span className="val">{h.requiresTissue ?? 'any tissue'}</span></div>
              <div className="kv">
                <span className="k">Literature</span>
                <span className="val">
                  {h.supportingPapers && h.supportingPapers.length > 0
                    ? h.supportingPapers.map(paperTitle).join('; ')
                    : <em style={{ color: 'var(--amber)' }}>no literature linked</em>}
                </span>
              </div>

              {/* review evidence + tally */}
              <div className="divider" />
              <div className="he-head">
                <span className="mono small" style={{ letterSpacing: '.12em', color: 'var(--muted)' }}>EVIDENCE TALLY</span>
                {total > 0 && (
                  <span className="he-tally">
                    <span className="he-bar">
                      <i style={{ width: `${(supports / total) * 100}%`, background: 'var(--green)' }} />
                      <i style={{ width: `${(refutes / total) * 100}%`, background: 'var(--red)' }} />
                    </span>
                    <b style={{ color: 'var(--good-ink)' }}>▲ {supports}</b>
                    <b style={{ color: 'var(--bad-ink)' }}>▼ {refutes}</b>
                  </span>
                )}
                {suggested !== h.status && (
                  <button className="chip-btn suggest" onClick={() => updateHypothesis(h.id, { status: suggested })} title="Apply the status the evidence suggests">Suggest: <b>{suggested}</b> ↦</button>
                )}
              </div>

              {meta.k >= 2 && !ev.some((e) => e.kind === 'pooled') && (
                <div className="he-row">
                  <span className="he-lab">Pooled {r.effect} <b>{fmt(meta.pooledEst)}</b> [{fmt(meta.pooledLow)}–{fmt(meta.pooledHigh)}] · {meta.k} studies</span>
                  <button className="he-mini sup" onClick={() => addEv(h, 'pooled', 'pooled', 'supports')}>+ support</button>
                  <button className="he-mini ref" onClick={() => addEv(h, 'pooled', 'pooled', 'refutes')}>+ refute</button>
                </div>
              )}
              {ev.map((e) => (
                <div className="he-row cited" key={e.kind + e.id}>
                  <button className={`he-stance ${e.stance}`} onClick={() => flipEv(h, e.kind, e.id)} title="Flip stance">{e.stance === 'supports' ? '▲ supports' : '▼ refutes'}</button>
                  <span className="he-lab">{evLabel(e)}</span>
                  <button className="he-x" onClick={() => removeEv(h, e.kind, e.id)} title="Remove">✕</button>
                </div>
              ))}
              {inclStudies.some((s) => !ev.some((e) => e.kind === 'study' && e.id === s.id)) && (
                <select className="select he-add" value="" onChange={(sel) => { if (sel.target.value) addEv(h, 'study', sel.target.value, 'supports') }}>
                  <option value="">+ cite an included study…</option>
                  {inclStudies.filter((s) => !ev.some((e) => e.kind === 'study' && e.id === s.id)).map((s) => <option key={s.id} value={s.id}>{s.author} {s.year}</option>)}
                </select>
              )}

              {(c?.text || c?.streaming || c?.error) && (
                <div className="hyp-critique">
                  <div className="hc-head"><span className="mono small">✦ AI CRITIQUE</span>{!c.streaming && <button className="he-x" onClick={() => setCrit((cc) => ({ ...cc, [h.id]: { text: '', streaming: false } }))}>✕</button>}</div>
                  {c.error && <div className="err">{c.error}</div>}
                  {c.text ? <Markdown text={c.text} /> : c.streaming && <Sk kind="critique" />}
                </div>
              )}

              {flags.length > 0 && (
                <>
                  <div className="divider" />
                  <div className="wrap-gap">
                    {flags.map((f) => <SevDot key={f.id} severity={f.severity} label={INSTABILITY_LABEL[f.type]} />)}
                  </div>
                </>
              )}
            </div>
          )
        })}
      </div>

      {editing && (
        <Modal title={editing.id ? 'Edit hypothesis' : 'New hypothesis'} onClose={() => setEditing(null)} wide>
          <Field label="Label"><input className="input" value={editing.draft.label} onChange={(e) => setEditing({ ...editing, draft: { ...editing.draft, label: e.target.value } })} placeholder="H4 · short name" /></Field>
          <Field label="Statement"><textarea className="textarea" value={editing.draft.statement} onChange={(e) => setEditing({ ...editing, draft: { ...editing.draft, statement: e.target.value } })} placeholder="If … then … in whom, measured how." /></Field>
          <div className="form-row three">
            <Field label="Direction">
              <select className="select" value={editing.draft.direction} onChange={(e) => setEditing({ ...editing, draft: { ...editing.draft, direction: e.target.value as Draft['direction'] } })}>
                <option value="negative">negative</option>
                <option value="positive">positive</option>
                <option value="none">none</option>
              </select>
            </Field>
            <Field label="Effect size"><input className="input" value={editing.draft.effect} onChange={(e) => setEditing({ ...editing, draft: { ...editing.draft, effect: e.target.value } })} placeholder="≥25% ↓ mRNA" /></Field>
            <Field label="Status">
              <select className="select" value={editing.draft.status} onChange={(e) => setEditing({ ...editing, draft: { ...editing.draft, status: e.target.value as HypothesisStatus } })}>
                <option value="draft">draft</option>
                <option value="testing">testing</option>
                <option value="supported">supported</option>
                <option value="refuted">refuted</option>
              </select>
            </Field>
          </div>
          <Field label="Falsified if" hint="Leave blank and the unclear-hypothesis sensor will flag it."><input className="input" value={editing.draft.falsification} onChange={(e) => setEditing({ ...editing, draft: { ...editing.draft, falsification: e.target.value } })} placeholder="No correlation at FDR < 0.05" /></Field>
          <Field label="Requires tissue" hint="e.g. cardiomyocyte — used by the assay-mismatch sensor."><input className="input" value={editing.draft.requiresTissue} onChange={(e) => setEditing({ ...editing, draft: { ...editing.draft, requiresTissue: e.target.value } })} placeholder="cardiomyocyte" /></Field>
          <div className="form-actions">
            <button className="btn ghost" onClick={() => setEditing(null)}>Cancel</button>
            <button className="btn primary" onClick={save}>{editing.id ? 'Save changes' : 'Add hypothesis'}</button>
          </div>
        </Modal>
      )}
    </>
  )
}
