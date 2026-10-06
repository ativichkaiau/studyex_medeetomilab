import { useMemo, useState } from 'react'
import { useSwapNavigate } from '../lib/swap'
import { useStore } from '../lib/store'
import { Kicker, Rule, StatCard } from '../components/ui'
import { computeInstabilities, stabilityScore } from '../lib/suspension'
import { computeMeta, measureInfo, fmt } from '../lib/metaAnalysis'
import { planPhases } from '../lib/assayPlan'
import { STAGES } from '../types'
import type { ProjectState } from '../types'
import { analysisIncluded } from '../lib/cohorts'

function rigorColor(v: number) {
  return v >= 0.75 ? 'var(--green)' : v >= 0.5 ? 'var(--amber)' : 'var(--red)'
}

function metrics(p: ProjectState) {
  const inst = computeInstabilities(p)
  const rigor = stabilityScore(inst)
  const openFlags = inst.filter((i) => i.status === 'open').length
  const included = p.review.studies.filter(analysisIncluded)
  const meta = included.length >= 2 ? computeMeta(p.review.studies, p.review.model, p.review.effect) : null
  const plan = planPhases(p.assays)
  const stageIdx = Math.max(0, STAGES.indexOf((p.project.stage ?? 'Idea') as (typeof STAGES)[number]))
  return { rigor, openFlags, includedN: included.length, meta, plan, stageIdx }
}

const BLANK = { name: '', code: '', question: '' }

export default function Portfolio() {
  const { allProjects, activeId, switchProject, createProject, patchProjectById, deleteProject } = useStore()
  const nav = useSwapNavigate()
  const rows = useMemo(() => allProjects.map((p) => ({ p, m: metrics(p) })), [allProjects])
  const [editing, setEditing] = useState(false)
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState(BLANK)

  const totals = useMemo(() => ({
    studies: rows.reduce((a, x) => a + x.m.includedN, 0),
    hyps: rows.reduce((a, x) => a + x.p.hypotheses.length, 0),
    assays: rows.reduce((a, x) => a + x.p.assays.length, 0),
    cost: rows.reduce((a, x) => a + x.m.plan.totalCost, 0),
    avgRigor: rows.length ? rows.reduce((a, x) => a + x.m.rigor, 0) / rows.length : 0,
  }), [rows])

  const open = (id: string) => { switchProject(id); nav('/') }

  function create() {
    const name = draft.name.trim()
    if (!name) return
    createProject(name, draft.code.trim() || undefined, draft.question.trim() ? { question: draft.question.trim() } : undefined)
    setDraft(BLANK); setAdding(false)
    nav('/') // createProject switches to the new project
  }
  function remove(id: string, label: string) {
    if (rows.length <= 1) return
    if (confirm(`Delete “${label}” and everything in it (studies, hypotheses, assays)? This cannot be undone from here.`)) deleteProject(id)
  }

  return (
    <>
      <div className="page-head">
        <Rule />
        <div className="flex" style={{ justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
          <div>
            <Kicker>program / portfolio</Kicker>
            <h1>Portfolio</h1>
            <p>Every review and lab project at a glance — rigor, pooled effect, pipeline and budget side by side. Open one to switch to it.</p>
          </div>
          <div className="row-actions" style={{ flex: 'none', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            <button className={`btn sm ${editing ? 'primary' : 'ghost'}`} onClick={() => setEditing((v) => !v)}>{editing ? '✓ Done' : '✎ Edit'}</button>
            <button className="btn primary sm" onClick={() => setAdding((v) => !v)}>＋ New project</button>
          </div>
        </div>
      </div>

      {adding && (
        <div className="card lg rail" style={{ marginBottom: 16 }}>
          <div className="card-h"><span className="sq" style={{ background: 'var(--accent, var(--blue))' }} />NEW PROJECT</div>
          <div className="grid g2">
            <label className="fld"><span className="fld-l">Project name</span><input className="input" autoFocus value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && create()} placeholder="e.g. SCN5A variants and arrhythmic risk" /></label>
            <label className="fld"><span className="fld-l">Code <span className="muted">— optional, auto if blank</span></span><input className="input mono" value={draft.code} onChange={(e) => setDraft({ ...draft, code: e.target.value })} placeholder="BrS-RISK" /></label>
          </div>
          <label className="fld"><span className="fld-l">Review question <span className="muted">— optional, seeds the protocol</span></span><textarea className="textarea" rows={2} value={draft.question} onChange={(e) => setDraft({ ...draft, question: e.target.value })} placeholder="What this review asks…" /></label>
          <div className="wrap-gap">
            <button className="btn primary sm" onClick={create} disabled={!draft.name.trim()}>Create &amp; open</button>
            <button className="btn ghost sm" onClick={() => { setAdding(false); setDraft(BLANK) }}>Cancel</button>
          </div>
        </div>
      )}

      <div className="grid g4" style={{ marginBottom: 16 }}>
        <StatCard value={rows.length} label="Projects" sub={`avg rigor ${Math.round(totals.avgRigor * 100)}%`} tone="var(--accent)" />
        <StatCard value={totals.studies} label="Included studies" sub="across all reviews" tone="#6366f1" />
        <StatCard value={totals.hyps} label="Hypotheses" sub={`${totals.assays} assays`} tone="var(--violet)" />
        <StatCard value={`$${totals.cost.toLocaleString()}k`} label="Total planned budget" sub="all assays" tone="var(--success)" />
      </div>

      <div className="tbl-scroll">
        <table>
          <thead>
            <tr><th>Project</th><th>Stage</th><th>Rigor</th><th>Meta-analysis</th><th>Hyp</th><th>Assays</th><th>Budget</th><th>Flags</th><th></th></tr>
          </thead>
          <tbody>
            {rows.map(({ p, m }) => (
              <tr key={p.project.id} style={p.project.id === activeId ? { background: 'color-mix(in srgb, var(--blue) 6%, transparent)' } : undefined}>
                <td>
                  {editing ? (
                    <div style={{ display: 'grid', gap: 6, minWidth: 260 }}>
                      <input className="input mono" style={{ width: 130, padding: '4px 8px' }} value={p.project.code} onChange={(e) => patchProjectById(p.project.id, { code: e.target.value })} placeholder="CODE" />
                      <input className="input" style={{ padding: '4px 8px' }} value={p.project.name} onChange={(e) => patchProjectById(p.project.id, { name: e.target.value })} placeholder="Project name" />
                    </div>
                  ) : (
                    <>
                      <b>{p.project.code}</b>{p.project.id === activeId && <span className="chip" style={{ marginLeft: 8 }}>active</span>}
                      <div className="small" style={{ maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.project.name}</div>
                    </>
                  )}
                </td>
                <td>
                  <span className="mono small">{STAGES[m.stageIdx]}</span>
                  <span className="pf-bar"><i style={{ width: `${(m.stageIdx / (STAGES.length - 1)) * 100}%` }} /></span>
                </td>
                <td>
                  <div className="flex" style={{ gap: 8 }}>
                    <span className="pf-bar" style={{ width: 60 }}><i style={{ width: `${Math.round(m.rigor * 100)}%`, background: rigorColor(m.rigor) }} /></span>
                    <span className="mono" style={{ color: rigorColor(m.rigor), fontWeight: 700 }}>{Math.round(m.rigor * 100)}%</span>
                  </div>
                </td>
                <td className="mono">
                  {m.meta ? <>{measureInfo(p.review.effect).id} <b>{fmt(m.meta.pooledEst)}</b> [{fmt(m.meta.pooledLow)}, {fmt(m.meta.pooledHigh)}]<div className="small muted">{m.includedN} studies · I²={fmt(m.meta.I2, 0)}%</div></> : <span className="muted">{m.includedN} stud{m.includedN === 1 ? 'y' : 'ies'} · no pool</span>}
                </td>
                <td className="mono">{p.hypotheses.length}</td>
                <td className="mono">{p.assays.length}</td>
                <td className="mono">{m.plan.totalCost ? `$${m.plan.totalCost}k` : '—'}<div className="small muted">{m.plan.totalWeeks} wk</div></td>
                <td>{m.openFlags === 0 ? <span className="small" style={{ color: 'var(--green)' }}>clear</span> : <span className="badge b-block">{m.openFlags} open</span>}</td>
                <td>
                  <div className="flex" style={{ gap: 6, justifyContent: 'flex-end' }}>
                    <button className="icon-btn" onClick={() => open(p.project.id)}>Open →</button>
                    {editing && <button className="icon-btn danger" title={rows.length <= 1 ? 'Cannot delete the last project' : 'Delete project'} disabled={rows.length <= 1} onClick={() => remove(p.project.id, p.project.name)}>Del</button>}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="small" style={{ marginTop: 10 }}>Rigor and pooled estimates are recomputed live from each project's data. <b>✎ Edit</b> renames projects and codes in place, or deletes one; <b>＋ New project</b> starts a fresh review (you can also import a project from the Overview).</p>
    </>
  )
}
