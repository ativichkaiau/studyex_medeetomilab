import { Link } from 'react-router-dom'
import type { Instability, ProjectState } from '../types'
import type { Stage } from '../lib/pipeline'
import type { SyncStatus } from '../lib/cloudSync'
import type { ModuleDef } from '../lib/modules'
import { MetaGrid, Tag, StateTag } from './ui'
import { INSTABILITY_LABEL, SEVERITY_LABEL } from '../lib/palette'
import { rigorId } from '../lib/ids'
import { openTerra, TERRA_TASKS } from '../lib/terra'
import { getModel } from '../lib/openai'
import { listSearches } from '../lib/savedSearches'
import { syncWord } from './StatusBar'
import { isRegistered, reviewType } from '../lib/projectFacts'

const SEV_ORDER = { high: 0, med: 1, low: 2 } as const

/**
 * The context column: the project as an object, its dataset, QA, the
 * processes running over it, and Terra — for whatever module is open.
 */
export default function ContextPanel({ state, stages, instabilities, stability, sync, terraReady, module }: {
  state: ProjectState
  stages: Stage[]
  instabilities: Instability[]
  stability: number
  sync: SyncStatus | null
  terraReady: boolean
  module: ModuleDef | null
}) {
  const r = state.review
  const open = instabilities.filter((i) => i.status === 'open').sort((a, b) => SEV_ORDER[a.severity] - SEV_ORDER[b.severity])
  const sev = (s: 'high' | 'med' | 'low') => open.filter((i) => i.severity === s).length
  const st = (id: string) => stages.find((x) => x.id === id)!
  const scr = st('screening')
  const ext = st('extraction')
  const searches = listSearches()
  const lastSearch = searches[0]?.lastRun
  const notices = state.evidence?.notices ?? []
  const flagged = notices.filter((n) => n.notices.length > 0).length
  const s = syncWord(sync)
  const tasks = TERRA_TASKS[module?.stage ?? module?.id ?? 'overview'] ?? TERRA_TASKS.overview
  const m = (stage: Stage, k: string) => stage.metrics.find((x) => x.k === k)?.v ?? '—'

  return (
    <aside className="context" aria-label="Project context">
      <section className="ctx-sec">
        <div className="ctx-h">project <Link to="/">open →</Link></div>
        <div className="ctx-title">{state.project.name}</div>
        <MetaGrid rows={[
          ['id', <span className="mono">{state.project.code}</span>],
          ['type', reviewType(state)],
          ['stage', <span className="mono">{(state.project.stage ?? '—').toLowerCase()}</span>],
          ['protocol', isRegistered(state) ? <Tag tone="ok">registered</Tag> : <Tag tone="warn">not registered</Tag>],
        ]} />
      </section>

      <section className="ctx-sec">
        <div className="ctx-h">dataset</div>
        <MetaGrid rows={[
          ['records', <span className="mono">{m(scr, 'records')}</span>],
          ['completed', <span className="mono">{m(scr, 'completed')}</span>],
          ['conflicts', <span className={`mono${scr.issues ? ' tone-warn' : ''}`}>{scr.issues}</span>],
          ['studies', <span className="mono">{m(ext, 'studies')} · {m(ext, 'included')} incl.</span>],
          ['effect', <span className="mono">{r.effect} · {r.model}</span>],
          ['k', <span className="mono">{m(st('statistics'), 'k')}</span>],
        ]} />
      </section>

      <section className="ctx-sec">
        <div className="ctx-h">rigor <Link to="/suspension">inspect →</Link></div>
        <div className="ctx-rigor">
          <b className={`mono ${stability >= 0.75 ? 'tone-ok' : stability >= 0.5 ? 'tone-warn' : 'tone-bad'}`}>{Math.round(stability * 100)}%</b>
          <span className="mono">{open.length} open · {sev('high')} high · {sev('med')} medium · {sev('low')} low</span>
        </div>
        {open.slice(0, 3).map((i) => (
          <Link key={i.id} className="ctx-issue" to={`/suspension?issue=${encodeURIComponent(i.id)}`}>
            <span className="mono">{rigorId(i.id)}</span>
            <span className="ctx-issue-t">{INSTABILITY_LABEL[i.type]}</span>
            <span className={`mono sev-${i.severity}`}>{SEVERITY_LABEL[i.severity]}</span>
          </Link>
        ))}
        {open.length === 0 && <p className="ctx-empty mono">0 open issues</p>}
      </section>

      <section className="ctx-sec">
        <div className="ctx-h">processes</div>
        <ul className="proc-list">
          <li><span className="mono">rigor.checks</span><Tag tone="ok">complete</Tag><small>10 rule families · re-run on every edit</small></li>
          <li><span className="mono">cloud.sync</span><Tag tone={s.tone}>{s.word}</Tag><small>{sync?.message || 'not connected · saved in this browser'}</small></li>
          <li><span className="mono">literature.watch</span><Tag tone={searches.length ? 'info' : 'idle'}>{searches.length ? 'idle' : 'off'}</Tag><small>{searches.length ? `${searches.length} saved ${searches.length === 1 ? 'query' : 'queries'} · last run ${lastSearch ? new Date(lastSearch).toLocaleDateString() : '—'}` : 'no saved queries'}</small></li>
          <li><span className="mono">notices.watch</span><Tag tone={flagged ? 'warn' : notices.length ? 'ok' : 'idle'}>{notices.length ? `${flagged} flagged` : 'off'}</Tag><small>{notices.length ? `${notices.length} DOIs checked against Crossref` : 'no DOIs checked yet'}</small></li>
        </ul>
      </section>

      <section className="ctx-sec">
        <div className="ctx-h">terra</div>
        <MetaGrid rows={[
          ['state', terraReady ? <Tag tone="ok">ready</Tag> : <Tag tone="idle">off · no key</Tag>],
          ['context', <span className="mono">{module?.id ?? 'project'}</span>],
          ['scope', <span className="mono">{state.project.code}</span>],
          ['model', <span className="mono">{getModel()}</span>],
        ]} />
        <div className="ctx-actions">
          {tasks.map((t) => <button key={t.label} className="go" onClick={() => openTerra({ prompt: t.prompt })}>{t.label} →</button>)}
        </div>
      </section>

      <section className="ctx-sec">
        <div className="ctx-h">pipeline</div>
        {stages.map((x) => (
          <Link key={x.id} className="ctx-stage" to={x.to}>
            <span className="mono">{x.label}</span>
            <StateTag state={x.state} />
          </Link>
        ))}
      </section>
    </aside>
  )
}
