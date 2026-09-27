import { useStore } from '../lib/store'
import { Link } from 'react-router-dom'
import { Kicker, Rule, AssayBadge, StatCard } from '../components/ui'
import { ProjectTabs } from '../components/ProjectTabs'
import { analysisIncluded } from '../lib/cohorts'
import { AxisColumns } from '../components/Solids'

function sevRank(s: 'low' | 'med' | 'high') {
  return s === 'high' ? 3 : s === 'med' ? 2 : 1
}

export default function PitWall() {
  const { state, instabilities, stability } = useStore()
  const open = instabilities.filter((i) => i.status === 'open')
  const bottlenecks = [...open].sort((a, b) => sevRank(b.severity) - sevRank(a.severity)).slice(0, 4)
  const actions = [...open].sort((a, b) => sevRank(b.severity) - sevRank(a.severity)).slice(0, 4)

  const axes = [...new Set(state.assays.map((a) => a.measures.trim() || a.method))].map((name) => {
    const assays = state.assays.filter((a) => (a.measures.trim() || a.method) === name)
    const done = assays.filter((a) => a.status === 'done').length
    return { name, total: assays.length, done, pct: Math.round(done / assays.length * 100) }
  })
  const pico = [
    { label: 'Population', value: state.review.pico.p },
    { label: 'Intervention / exposure', value: state.review.pico.i },
    { label: 'Comparator', value: state.review.pico.c },
    { label: 'Outcome', value: state.review.pico.o },
  ]
  const subgroups = [...new Set(state.review.studies.map((s) => s.subgroup?.trim()).filter((s): s is string => !!s))]
  const outputs = [...new Set([
    state.project.primaryEndpoint?.trim(),
    state.review.pico.o.trim(),
    ...state.assays.map((a) => a.measures.trim()),
  ].filter((s): s is string => !!s))]

  return (
    <>
      <div className="page-head">
        <Rule />
        <Kicker>PROJECT DASHBOARD</Kicker>
        <h1>Dashboard</h1>
        <p>{state.project.name}</p>
      </div>
      <ProjectTabs />
      <div className="project-caption"><b>{state.project.code}</b><span>{state.project.domain || 'Research project'}</span><span className="pill">{state.project.stage ?? 'Idea'}</span></div>
      <div className="grid g4 overview-stats" key={state.project.id}>
        <StatCard value={state.hypotheses.length} label="Hypotheses" sub="in this project" />
        <StatCard value={state.review.studies.filter(analysisIncluded).length} label="Included studies" sub={`${state.papers.length} saved references`} />
        <StatCard value={state.assays.length} label="Assays" sub={`${state.assays.filter((a) => a.status === 'done').length} completed`} />
        <StatCard value={`${Math.round(stability * 100)}%`} label="Project rigor" sub={`${open.length} open findings`} />
      </div>
      <div className="grid g2 project-dashboard">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="card">
            <div className="card-h"><span className="sq" style={{ background: 'var(--navy)' }} />CENTRAL HYPOTHESIS</div>
            {state.project.centralHypothesis ? <p className="hyp-quote">{state.project.centralHypothesis}</p> : <p className="empty">No central hypothesis yet. <Link to="/">Define it in Overview →</Link></p>}
          </div>

          <div className="card">
            <div className="card-h"><span className="sq" style={{ background: 'var(--blue)' }} />RESEARCH AXES · completed assays</div>
            {axes.length === 0 && <p className="empty">Add assays to track this project's research axes. <Link to="/assays">Plan an assay →</Link></p>}
            <AxisColumns axes={axes} />
            {axes.map((a) => (
              <div className="axis" key={a.name}>
                <span className="name">{a.name}</span>
                <span className="bar" role="progressbar" aria-label={a.name} aria-valuemin={0} aria-valuemax={a.total} aria-valuenow={a.done}><i style={{ width: `${a.pct}%`, background: 'var(--blue)' }} /></span>
                <span className="v">{a.done}/{a.total} done</span>
              </div>
            ))}
          </div>

          <div className="card">
            <div className="card-h"><span className="sq" style={{ background: 'var(--red)' }} />REVIEW QUESTION &amp; SCOPE</div>
            <p>{state.review.question || 'Define the review question in Protocol.'}</p>
            <dl className="dashboard-scope">{pico.map((item) => <div key={item.label}><dt>{item.label}</dt><dd>{item.value || 'Not defined'}</dd></div>)}</dl>
            {subgroups.length > 0 && <div className="wrap-gap">{subgroups.map((s) => <span className="pill" key={s}>{s}</span>)}</div>}
            <Link className="small" to="/protocol">Edit protocol →</Link>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="card">
            <div className="card-h"><span className="sq" style={{ background: 'var(--green)' }} />PLANNED ASSAYS</div>
            {state.assays.length === 0 && <p className="empty">No assays planned for this project.</p>}
            {state.assays.map((a) => (
              <div className="stint" key={a.id}>
                <div>
                  <div className="nm">{a.method}</div>
                  <div className="meta">{a.measures} · n={a.sampleN ?? '—'}</div>
                </div>
                <AssayBadge status={a.status} />
              </div>
            ))}
          </div>

          <div className="card">
            <div className="card-h"><span className="sq" style={{ background: 'var(--green)' }} />TARGET OUTCOMES &amp; MEASUREMENTS</div>
            {outputs.length === 0 && <p className="empty">Set a primary endpoint, PICO outcome, or assay measurement to define the outputs.</p>}
            {outputs.map((o) => (
              <div className="list-item" key={o}>
                <span className="ic" style={{ color: 'var(--green)' }}>○</span>
                <span>{o}</span>
              </div>
            ))}
          </div>

          <div className="card">
            <div className="card-h"><span className="sq" style={{ background: 'var(--amber)' }} />CURRENT BOTTLENECKS</div>
            {bottlenecks.length === 0 && <p className="empty">No open issues.</p>}
            {bottlenecks.map((b) => (
              <div className="list-item" key={b.id}>
                <span className="ic" style={{ color: 'var(--red)' }}>▲</span>
                <span>{b.signal} <span className="small">— {b.targetLabel}</span></span>
              </div>
            ))}
          </div>

          <div className="card">
            <div className="card-h"><span className="sq" style={{ background: 'var(--navy)' }} />RECOMMENDED NEXT STEPS</div>
            {actions.length === 0 && <p className="empty">No open repairs. <Link to="/theory">Explore this project's theory →</Link></p>}
            {actions.map((a, idx) => (
              <div className="action" key={a.id}>
                <div className="n">{idx + 1}</div>
                <div className="tx">
                  <b>{a.repair}</b>
                  <span>{a.targetLabel}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  )
}
