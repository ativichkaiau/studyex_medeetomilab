import { Link, useNavigate } from 'react-router-dom'
import { useMemo, useRef, useState } from 'react'
import { useStore } from '../lib/store'
import { MetaGrid, Tag, StateTag, Progress, Empty } from '../components/ui'
import { INSTABILITY_LABEL, SEVERITY_LABEL } from '../lib/palette'
import { STAGES } from '../types'
import { analysisIncluded } from '../lib/cohorts'
import { hasCuratedTheory } from '../lib/projectTheory'
import { pipeline } from '../lib/pipeline'
import { rigorId } from '../lib/ids'
import { reviewType, stamp } from '../lib/projectFacts'
import { exportName, BRAND } from '../lib/brand'
import { openTerra, TERRA_TASKS } from '../lib/terra'
import EcgMonitor from '../components/EcgMonitor'

const SEV_ORDER = { high: 0, med: 1, low: 2 } as const

/**
 * The project root: the project as a structured object, the pipeline's
 * state stage by stage, QA, and the log — so a glance says where the
 * project stands. Every value is read from the project.
 */
export default function Garage() {
  const { state, instabilities, stability, reset, setStage, updateProject, exportActive, importProject } = useStore()
  const navigate = useNavigate()
  const fileRef = useRef<HTMLInputElement>(null)
  const [editing, setEditing] = useState(false)

  const stages = useMemo(() => pipeline(state), [state])
  const open = instabilities.filter((i) => i.status === 'open').sort((a, b) => SEV_ORDER[a.severity] - SEV_ORDER[b.severity])
  const sev = (s: 'high' | 'med' | 'low') => open.filter((i) => i.severity === s).length
  const resolved = instabilities.filter((i) => i.status !== 'open').length
  const highs = sev('high')

  const stage = state.project.stage ?? 'Protocol'
  const stageIdx = Math.max(0, STAGES.indexOf(stage as (typeof STAGES)[number]))
  const rv = state.review
  const incl = rv.studies.filter(analysisIncluded)
  const registered = !!rv.registration?.trim() || state.project.preRegistered

  // milestones, each read from the project
  const signals: { label: string; done: boolean }[] = [
    { label: 'central hypothesis defined', done: state.project.centralHypothesis.trim().length > 20 },
    { label: 'hypotheses on the graph', done: state.hypotheses.length > 0 },
    { label: 'review question & PICO', done: !!rv.question && !!rv.pico.i && !!rv.pico.o },
    { label: 'search strategy recorded', done: rv.searches.length > 0 },
    { label: 'studies extracted', done: rv.studies.length > 0 },
    { label: 'pooled estimate possible (k ≥ 2)', done: incl.length >= 2 },
    { label: 'assays planned', done: state.assays.length > 0 },
    { label: 'risk of bias / GRADE assessed', done: !!rv.grade || rv.studies.some((s) => s.rob && Object.keys(s.rob).length > 0) },
    { label: 'no open high-severity issues', done: highs === 0 },
  ]
  const doneN = signals.filter((s) => s.done).length

  function doExport() {
    const blob = new Blob([exportActive()], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = exportName(state.project.code)
    a.click()
    URL.revokeObjectURL(url)
  }
  function onImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) return
    f.text().then((t) => {
      if (!importProject(t)) alert(`Could not import — the file is not a valid ${BRAND.name} project export.`)
    })
    e.target.value = ''
  }

  return (
    <>
      <div className="ov-head">
        <div style={{ minWidth: 0 }}>
          <div className="ov-runtime">studyex_medeetomilab<b>_</b><small>research runtime</small></div>
          {editing ? (
            <textarea className="textarea" style={{ width: '100%', maxWidth: 860, fontSize: 17, fontWeight: 600, marginTop: 12 }} rows={2} value={state.project.name} onChange={(e) => updateProject({ name: e.target.value })} placeholder="Project title" aria-label="Project title" />
          ) : (
            <h1 className="ov-title">{state.project.name}</h1>
          )}
        </div>
        <div className="ov-actions">
          <button className={`btn sm ${editing ? 'primary' : 'ghost'}`} onClick={() => setEditing((v) => !v)}>{editing ? 'done' : 'edit project'}</button>
        </div>
      </div>

      {hasCuratedTheory(state.project) && <EcgMonitor />}

      <div className="ov-grid">
        <div className="ov-col">
          <div className="card lg">
            <div className="card-h">project</div>
            <MetaGrid className="wide" rows={[
              ['project_id', editing
                ? <input className="input mono" style={{ maxWidth: 180 }} value={state.project.code} onChange={(e) => updateProject({ code: e.target.value })} aria-label="Project ID" />
                : <span className="mono">{state.project.code}</span>],
              ['type', reviewType(state)],
              ['domain', editing
                ? <input className="input" value={state.project.domain} onChange={(e) => updateProject({ domain: e.target.value })} aria-label="Domain" />
                : state.project.domain || <span className="muted">—</span>],
              ['state', <span className="mono">{stage.toLowerCase()} <span className="muted">· stage {String(stageIdx + 1).padStart(2, '0')} of {STAGES.length}</span></span>],
              ['protocol', registered ? <Tag tone="ok">registered{rv.registration ? ` · ${rv.registration}` : ''}</Tag> : <Tag tone="warn">not registered</Tag>],
              ['question', rv.question || <span className="muted">— <Link to="/protocol">define in protocol →</Link></span>],
              ['databases', rv.databases.length ? <span className="mono">{rv.databases.join(' · ')}</span> : <span className="muted">—</span>],
              ['outcome', rv.outcomeLabel ? <span>{rv.outcomeLabel} <span className="muted mono">· {rv.effect} · {rv.model === 'random' ? 'random-effects' : 'fixed-effect'}</span></span> : <span className="muted">—</span>],
              ['records', <span className="mono">{rv.screening?.length ?? 0} screened · {incl.length} included</span>],
            ]} />
          </div>

          <div className="card lg" style={{ padding: 0 }}>
            <div className="card-h" style={{ margin: 0, padding: '8px 18px' }}>pipeline <span className="spacer" /><span style={{ textTransform: 'none', letterSpacing: 0 }}>{stages.filter((s) => s.state === 'done' || s.state === 'ready').length}/{stages.length} ready</span></div>
            <table className="pipe">
              <tbody>
                {stages.map((s, i) => (
                  <tr key={s.id} onClick={() => navigate(s.to)}>
                    <td className="p-n">{String(i + 1).padStart(2, '0')}</td>
                    <td className="p-name"><Link to={s.to} onClick={(e) => e.stopPropagation()}>{s.label}</Link><small>{s.verb}</small></td>
                    <td className="p-state"><StateTag state={s.state} /></td>
                    <td className="p-metrics">{s.metrics.map((m) => <span key={m.k}>{m.k} <b>{m.v}</b></span>)}</td>
                    <td className="p-note">{s.note}</td>
                    <td className="p-prog">{s.progress !== undefined && <Progress value={s.progress} label={`${s.label} completion`} />}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="card lg">
            <div className="card-h">activity log <span className="spacer" /><span style={{ textTransform: 'none', letterSpacing: 0 }}>{state.activity.length} entries</span></div>
            {state.activity.length === 0
              ? <Empty path="activity/">no entries · edits to studies, hypotheses, assays and stages are logged here</Empty>
              : (
                <div className="log">
                  {state.activity.slice(0, 14).map((a) => (
                    <div className="log-row" key={a.id}>
                      <time dateTime={new Date(a.ts).toISOString()}>{stamp(a.ts)}</time>
                      <span className="lk">{a.kind}</span>
                      <span className="lt" title={a.text}>{a.text}</span>
                    </div>
                  ))}
                </div>
              )}
          </div>
        </div>

        <div className="ov-col">
          <div className="card">
            <div className="card-h">rigor <span className="spacer" /><Link to="/suspension" style={{ textTransform: 'none', letterSpacing: 0 }}>inspect →</Link></div>
            <div className="ov-score">
              <b className={`mono ${stability >= 0.75 ? 'tone-ok' : stability >= 0.5 ? 'tone-warn' : 'tone-bad'}`}>{Math.round(stability * 100)}%</b>
              <span className="mono">{open.length} open · {resolved} resolved</span>
            </div>
            <MetaGrid rows={[
              ['high', <span className={`mono${sev('high') ? ' tone-bad' : ''}`}>{sev('high')}</span>],
              ['medium', <span className={`mono${sev('med') ? ' tone-warn' : ''}`}>{sev('med')}</span>],
              ['low', <span className="mono">{sev('low')}</span>],
            ]} />
            <div className="divider" style={{ margin: '10px 0' }} />
            {open.length === 0 ? <Empty path="rigor/">0 open issues</Empty> : open.slice(0, 5).map((i) => (
              <Link key={i.id} className="ctx-issue" to={`/suspension?issue=${encodeURIComponent(i.id)}`}>
                <span className="mono">{rigorId(i.id)}</span>
                <span className="ctx-issue-t">{INSTABILITY_LABEL[i.type]}{i.targetLabel ? ` · ${i.targetLabel}` : ''}</span>
                <span className={`mono sev-${i.severity}`}>{SEVERITY_LABEL[i.severity]}</span>
              </Link>
            ))}
            {open.length > 0 && <div style={{ marginTop: 10 }}><Link className="go" to="/suspension">repair rigor →</Link></div>}
          </div>

          <div className="card">
            <div className="card-h">lifecycle</div>
            <div className="ov-stages" role="list">
              {STAGES.map((s, idx) => (
                <button key={s} role="listitem" className={`ov-stage${idx === stageIdx ? ' now' : idx < stageIdx ? ' past' : ''}`} onClick={() => setStage(s)} aria-current={idx === stageIdx ? 'step' : undefined} title={idx === stageIdx ? 'current stage' : `set stage to ${s}`}>
                  <span className="mono">{String(idx + 1).padStart(2, '0')}</span>{s.toLowerCase()}
                </button>
              ))}
            </div>
            <div className="divider" style={{ margin: '10px 0' }} />
            <div className="sec-label" style={{ margin: '0 0 6px' }}>milestones · {doneN}/{signals.length}</div>
            {signals.map((s) => (
              <div key={s.label} className="sig-row">
                <span className={`sig-dot${s.done ? ' on' : ''}`} aria-hidden="true">{s.done ? '✓' : ''}</span>
                <span style={{ color: s.done ? 'var(--text-primary)' : 'var(--text-muted)' }}>{s.label}<span className="sr-only">{s.done ? ' — met' : ' — not met'}</span></span>
              </div>
            ))}
          </div>

          <div className="card">
            <div className="card-h">central hypothesis</div>
            {editing
              ? <textarea className="textarea" style={{ width: '100%' }} rows={8} value={state.project.centralHypothesis} onChange={(e) => updateProject({ centralHypothesis: e.target.value })} placeholder="The project's central hypothesis" aria-label="Central hypothesis" />
              : state.project.centralHypothesis.trim()
                ? <p className="hyp-quote" style={{ fontSize: 13, lineHeight: 1.6 }}>{state.project.centralHypothesis}</p>
                : <Empty path="hypothesis/">not stated</Empty>}
            <div className="wrap-gap" style={{ marginTop: 10 }}>
              <Link className="go" to="/hypotheses">hypotheses →</Link>
              <Link className="go" to="/mechanism">mechanism →</Link>
              <Link className="go" to="/graph">knowledge_graph →</Link>
            </div>
          </div>

          <div className="card">
            <div className="card-h">terra</div>
            <div className="ctx-actions" style={{ marginTop: 0 }}>
              {TERRA_TASKS.overview.map((t) => <button key={t.label} className="go" onClick={() => openTerra({ prompt: t.prompt })}>{t.label} →</button>)}
            </div>
          </div>

          <div className="card">
            <div className="card-h">project file</div>
            <div className="wrap-gap">
              <button className="btn ghost sm" onClick={doExport}>export {exportName(state.project.code)}</button>
              <button className="btn ghost sm" onClick={() => fileRef.current?.click()}>import project…</button>
              <input ref={fileRef} type="file" accept="application/json,.json" style={{ display: 'none' }} onChange={onImportFile} />
            </div>
            <div className="divider" style={{ margin: '10px 0' }} />
            <button className="btn sm danger" onClick={() => { if (confirm('Reset everything to the latest seed? This replaces the current projects and clears all edits, studies and stage changes.')) reset() }}>reset to seed data</button>
          </div>
        </div>
      </div>
    </>
  )
}
