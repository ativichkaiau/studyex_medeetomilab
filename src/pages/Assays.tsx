import { useMemo, useRef, useState } from 'react'
import { Sk } from '../components/Skeleton'
import { useStore } from '../lib/store'
import { Kicker, Rule, AssayBadge, SevDot } from '../components/ui'
import { Modal, Field } from '../components/Modal'
import { Markdown } from '../components/Markdown'
import { INSTABILITY_LABEL } from '../lib/palette'
import { assayPowerReport } from '../lib/power'
import { planPhases, DEFAULT_WEEKS } from '../lib/assayPlan'
import { streamChat, hasKey, getModel } from '../lib/openai'
import type { Assay, AssayStatus } from '../types'

type Draft = {
  method: string
  measures: string
  cellType: string
  controls: string
  sampleN: string
  phase: string
  effort: 'low' | 'med' | 'high'
  status: AssayStatus
  genomeWide: boolean
  expectedEffect: string
  genomeWideTests: string
  costK: string
  weeks: string
  claims: string[]
}

const blank: Draft = { method: '', measures: '', cellType: 'iPSC-CM', controls: '', sampleN: '', phase: '1', effort: 'med', status: 'design', genomeWide: false, expectedEffect: '', genomeWideTests: '', costK: '', weeks: '', claims: [] }

function toDraft(a: Assay): Draft {
  return {
    method: a.method, measures: a.measures, cellType: a.cellType, controls: a.controls ?? '',
    sampleN: a.sampleN?.toString() ?? '', phase: a.phase?.toString() ?? '', effort: a.effort ?? 'med',
    status: a.status, genomeWide: !!a.genomeWide, expectedEffect: a.expectedEffect?.toString() ?? '',
    genomeWideTests: a.genomeWideTests?.toString() ?? '', costK: a.costK?.toString() ?? '', weeks: a.weeks?.toString() ?? '', claims: a.claims ?? [],
  }
}

const STATUSES: AssayStatus[] = ['design', 'queued', 'piloting', 'running', 'done', 'blocked']
const STATUS_COLOR: Record<AssayStatus, string> = { design: 'var(--muted)', queued: 'var(--blue)', piloting: 'var(--amber)', running: 'var(--violet)', done: 'var(--green)', blocked: 'var(--red)' }

export default function Assays() {
  const { state, instabilities, addAssay, updateAssay, removeAssay } = useStore()
  const [editing, setEditing] = useState<{ id: string | null; draft: Draft } | null>(null)
  const [sop, setSop] = useState<{ method: string; text: string; streaming: boolean; error?: string } | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const hypLabel = (id: string) => state.hypotheses.find((h) => h.id === id)?.label.split('·')[0].trim() ?? id
  const flagsFor = (id: string) => instabilities.filter((i) => i.target === id && i.status === 'open')

  const plan = useMemo(() => planPhases(state.assays), [state.assays])

  function save() {
    if (!editing) return
    const d = editing.draft
    const patch: Partial<Assay> = {
      method: d.method || 'New assay', measures: d.measures, cellType: d.cellType, controls: d.controls,
      sampleN: d.sampleN ? Math.round(+d.sampleN) : undefined,
      phase: d.phase ? (Math.min(3, Math.max(1, +d.phase)) as 1 | 2 | 3) : undefined,
      effort: d.effort, status: d.status, genomeWide: d.genomeWide,
      expectedEffect: d.expectedEffect && +d.expectedEffect > 0 ? +d.expectedEffect : undefined,
      genomeWideTests: d.genomeWideTests ? Math.round(+d.genomeWideTests) : undefined,
      costK: d.costK ? +d.costK : undefined,
      weeks: d.weeks ? Math.round(+d.weeks) : undefined,
      claims: d.claims,
    }
    if (editing.id) updateAssay(editing.id, patch)
    else addAssay(patch as Omit<Assay, 'id'>)
    setEditing(null)
  }

  const set = (patch: Partial<Draft>) => editing && setEditing({ ...editing, draft: { ...editing.draft, ...patch } })

  async function genSop(a: Assay) {
    if (!hasKey()) {
      setSop({ method: a.method, text: '', streaming: false, error: 'Add an OpenAI key in Knowledge Review → Settings to generate SOPs.' })
      return
    }
    setSop({ method: a.method, text: '', streaming: true })
    const ctrl = new AbortController()
    abortRef.current = ctrl
    try {
      await streamChat({
        model: getModel(),
        signal: ctrl.signal,
        onToken: (d) => setSop((s) => (s ? { ...s, text: s.text + d } : s)),
        messages: [
          { role: 'system', content: 'You are a senior lab manager writing a concise, benchable Standard Operating Procedure for a molecular / cardiac-EP assay. Use markdown with ## sections: Objective, Reagents & materials, Equipment, Step-by-step protocol (numbered), QC gates (explicit pass/fail criteria), Timeline (per day/week), and Safety/notes. Be specific and realistic for the cell type; keep it tight.' },
          { role: 'user', content: `Write the SOP for: ${a.method}. Measures: ${a.measures || 'n/a'}. Cell type: ${a.cellType}. Controls: ${a.controls || 'define appropriate controls'}. Sample n: ${a.sampleN ?? 'n/a'}. Genome-wide: ${a.genomeWide ? 'yes' : 'no'}. Context: Brugada Syndrome sodium-channel epigenetics.` },
        ],
      })
    } catch (e) {
      if (!(e instanceof DOMException && e.name === 'AbortError')) setSop((s) => (s ? { ...s, error: e instanceof Error ? e.message : 'Request failed' } : s))
    } finally {
      setSop((s) => (s ? { ...s, streaming: false } : s))
      abortRef.current = null
    }
  }

  // Gantt geometry
  const GW = 620
  const weeks = Math.max(1, plan.totalWeeks)
  const wx = (w: number) => (w / weeks) * GW
  const ganttRows = plan.phases.flatMap((p) => p.assays.map((a) => ({ ...a, phaseStart: p.startWeek, label: p.label })))

  return (
    <>
      <div className="page-head">
        <Rule />
        <Kicker>ASSAY PLANNER · CLAIM ↔ ASSAY MATRIX</Kicker>
        <h1>Assays</h1>
        <p>Each assay is bound to the hypotheses it addresses and the cell type it runs in. Generate a benchable SOP, watch current-vs-required n live, and roll cost + timeline into a budget and Gantt.</p>
        <div className="head-actions">
          <button className="btn primary sm" onClick={() => setEditing({ id: null, draft: { ...blank } })}>＋ New assay</button>
        </div>
      </div>

      <div className="tbl-scroll">
        <table>
          <thead>
            <tr>
              <th>Assay</th><th>Measures</th><th>Cell type</th><th>Controls</th><th>n vs need</th><th>Phase</th><th>Status</th><th>Claims</th><th>Flags</th><th></th>
            </tr>
          </thead>
          <tbody>
            {state.assays.map((a) => {
              const flags = flagsFor(a.id)
              const rep = assayPowerReport(a)
              return (
                <tr key={a.id}>
                  <td><b>{a.method}</b>{a.genomeWide && <div className="small">genome-wide</div>}</td>
                  <td className="muted">{a.measures}</td>
                  <td className="muted">{a.cellType}</td>
                  <td style={a.controls ? undefined : { color: 'var(--red)', fontWeight: 700 }}>{a.controls || 'none'}</td>
                  <td>
                    {rep ? (
                      <div className="nvn">
                        <span className="nvn-bar"><i style={{ width: `${Math.min(100, Math.round(((a.sampleN ?? 0) / rep.requiredTotalN) * 100))}%`, background: rep.adequate ? 'var(--green)' : 'var(--red)' }} /></span>
                        <span className="mono" style={{ color: rep.adequate ? 'var(--good-ink)' : 'var(--bad-ink)' }}>{a.sampleN}/{rep.requiredTotalN}</span>
                      </div>
                    ) : <span className="mono muted">— / —</span>}
                  </td>
                  <td className="mono">{a.phase ?? '—'}</td>
                  <td><AssayBadge status={a.status} /></td>
                  <td className="wrap-gap">{(a.claims ?? []).map((c) => <span className="chip" key={c}>{hypLabel(c)}</span>)}</td>
                  <td>{flags.length === 0 ? <span className="small" style={{ color: 'var(--green)' }}>clear</span> : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>{flags.map((f) => <SevDot key={f.id} severity={f.severity} label={INSTABILITY_LABEL[f.type]} />)}</div>
                  )}</td>
                  <td>
                    <div className="row-actions">
                      <button className="icon-btn" onClick={() => genSop(a)} title="Generate a benchable SOP">SOP</button>
                      <button className="icon-btn" onClick={() => setEditing({ id: a.id, draft: toDraft(a) })}>Edit</button>
                      <button className="icon-btn danger" onClick={() => { if (confirm(`Delete ${a.method}?`)) removeAssay(a.id) }}>Del</button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* budget + Gantt */}
      <div className="card lg" style={{ marginTop: 16 }}>
        <div className="card-h" style={{ justifyContent: 'space-between' }}>
          <span><span className="sq" style={{ background: 'var(--violet)' }} />BUDGET &amp; TIMELINE</span>
          <span className="wrap-gap">
            <span className="pill">${plan.totalCost.toLocaleString()}k total</span>
            <span className="pill">{plan.totalWeeks} wk (~{Math.round((plan.totalWeeks / 52) * 10) / 10} yr)</span>
          </span>
        </div>
        {ganttRows.length === 0 ? (
          <p className="empty">Add assays with a phase, cost and duration to see the plan.</p>
        ) : (
          <>
            <svg viewBox={`0 0 ${GW + 160} ${ganttRows.length * 26 + 30}`} width="100%" style={{ display: 'block' }}>
              {Array.from({ length: Math.min(12, weeks) + 1 }, (_, i) => Math.round((i / Math.min(12, weeks)) * weeks)).map((w, i) => (
                <g key={i}>
                  <line x1={150 + wx(w)} y1={16} x2={150 + wx(w)} y2={ganttRows.length * 26 + 16} stroke="var(--line)" strokeWidth={1} />
                  <text x={150 + wx(w)} y={12} textAnchor="middle" fontSize="8.5" fill="var(--muted)" fontFamily="var(--mono)">w{w}</text>
                </g>
              ))}
              {ganttRows.map((r, i) => {
                const y = 24 + i * 26
                return (
                  <g key={r.id}>
                    <text x={144} y={y + 11} textAnchor="end" fontSize="10.5" fill="var(--ink-2)" fontWeight={600}>{r.method.length > 20 ? r.method.slice(0, 19) + '…' : r.method}</text>
                    <rect x={150 + wx(r.phaseStart)} y={y} width={Math.max(4, wx(r.weeks))} height={15} rx={4} fill={STATUS_COLOR[r.status]} opacity={0.9} />
                    {r.costK ? <text x={150 + wx(r.phaseStart) + Math.max(4, wx(r.weeks)) + 5} y={y + 11} fontSize="9" fill="var(--muted)" fontFamily="var(--mono)">${r.costK}k</text> : null}
                  </g>
                )
              })}
            </svg>
            <div className="curve-legend" style={{ marginTop: 6 }}>
              {plan.phases.map((p) => <span key={p.phase} className="cl"><b>{p.label}</b>: {p.assays.length} assay{p.assays.length === 1 ? '' : 's'}, {p.endWeek - p.startWeek} wk</span>)}
            </div>
            <p className="small" style={{ marginTop: 6 }}>Phases run sequentially; assays within a phase run in parallel (phase length = its longest assay). Unset durations default to {DEFAULT_WEEKS} wk.</p>
          </>
        )}
      </div>

      {/* SOP modal */}
      {sop && (
        <Modal title={`SOP · ${sop.method}`} onClose={() => { abortRef.current?.abort(); setSop(null) }} wide>
          {sop.error && <div className="err">{sop.error}</div>}
          {sop.text ? <div className="prose"><Markdown text={sop.text} /></div> : sop.streaming ? <Sk kind="protocol" /> : !sop.error && <p className="empty">No content.</p>}
          <div className="form-actions">
            {sop.streaming ? (
              <button className="btn ghost" onClick={() => abortRef.current?.abort()}>Stop</button>
            ) : (
              sop.text && <button className="btn ghost" onClick={() => navigator.clipboard?.writeText(sop.text)}>Copy markdown</button>
            )}
            <span className="spacer" />
            <button className="btn primary" onClick={() => { abortRef.current?.abort(); setSop(null) }}>Close</button>
          </div>
        </Modal>
      )}

      {editing && (
        <Modal title={editing.id ? 'Edit assay' : 'New assay'} onClose={() => setEditing(null)} wide>
          <div className="form-row">
            <Field label="Method"><input className="input" value={editing.draft.method} onChange={(e) => set({ method: e.target.value })} placeholder="CUT&Tag" /></Field>
            <Field label="Measures"><input className="input" value={editing.draft.measures} onChange={(e) => set({ measures: e.target.value })} placeholder="H3K27me3 occupancy" /></Field>
          </div>
          <div className="form-row">
            <Field label="Cell type"><input className="input" value={editing.draft.cellType} onChange={(e) => set({ cellType: e.target.value })} placeholder="iPSC-CM" /></Field>
            <Field label="Controls" hint="Blank → missing-control flag."><input className="input" value={editing.draft.controls} onChange={(e) => set({ controls: e.target.value })} placeholder="isogenic corrected" /></Field>
          </div>
          <div className="form-row three">
            <Field label="Sample n (total)"><input className="input" type="number" min="0" value={editing.draft.sampleN} onChange={(e) => set({ sampleN: e.target.value })} /></Field>
            <Field label="Phase">
              <select className="select" value={editing.draft.phase} onChange={(e) => set({ phase: e.target.value })}>
                <option value="">—</option><option value="1">1</option><option value="2">2</option><option value="3">3</option>
              </select>
            </Field>
            <Field label="Effort">
              <select className="select" value={editing.draft.effort} onChange={(e) => set({ effort: e.target.value as Draft['effort'] })}>
                <option value="low">low</option><option value="med">med</option><option value="high">high</option>
              </select>
            </Field>
          </div>
          <div className="form-row three">
            <Field label="Status">
              <select className="select" value={editing.draft.status} onChange={(e) => set({ status: e.target.value as AssayStatus })}>
                {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </Field>
            <Field label="Cost ($k)"><input className="input" type="number" min="0" value={editing.draft.costK} onChange={(e) => set({ costK: e.target.value })} /></Field>
            <Field label="Duration (weeks)"><input className="input" type="number" min="0" value={editing.draft.weeks} onChange={(e) => set({ weeks: e.target.value })} /></Field>
          </div>
          <div className="form-row three">
            <Field label="Expected effect (d)" hint="blank → 1.0 / 0.8 gw"><input className="input" type="number" step="0.1" min="0.1" value={editing.draft.expectedEffect} onChange={(e) => set({ expectedEffect: e.target.value })} /></Field>
            <Field label="Genome-wide tests" hint="blank → 100,000"><input className="input" type="number" value={editing.draft.genomeWideTests} onChange={(e) => set({ genomeWideTests: e.target.value })} /></Field>
            <label className={`check${editing.draft.genomeWide ? ' on' : ''}`} style={{ alignSelf: 'end', marginBottom: 2 }}>
              <input type="checkbox" checked={editing.draft.genomeWide} onChange={(e) => set({ genomeWide: e.target.checked })} /> Genome-wide
            </label>
          </div>
          <Field label="Addresses hypotheses">
            <div className="checks">
              {state.hypotheses.map((h) => {
                const on = editing.draft.claims.includes(h.id)
                return (
                  <label key={h.id} className={`check${on ? ' on' : ''}`}>
                    <input type="checkbox" checked={on} onChange={(e) => set({ claims: e.target.checked ? [...editing.draft.claims, h.id] : editing.draft.claims.filter((c) => c !== h.id) })} />
                    {hypLabel(h.id)}
                  </label>
                )
              })}
            </div>
          </Field>
          <div className="form-actions">
            <button className="btn ghost" onClick={() => setEditing(null)}>Cancel</button>
            <button className="btn primary" onClick={save}>{editing.id ? 'Save changes' : 'Add assay'}</button>
          </div>
        </Modal>
      )}
    </>
  )
}
