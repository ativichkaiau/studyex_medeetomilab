import { NavLink } from 'react-router-dom'
import { useState } from 'react'
import { MODULES, GROUP_LABEL, type ModuleGroup } from '../lib/modules'
import { STATE_LABEL, type Stage } from '../lib/pipeline'
import { StateDot } from './ui'
import { BRAND } from '../lib/brand'

const GROUPS: ModuleGroup[] = ['project', 'pipeline', 'qa', 'output', 'knowledge', 'bench', 'program']
const COLLAPSED_KEY = 'williamslab.nav.collapsed'

/** the short figure printed beside a stage: what you'd want to know at a glance */
function stageHint(st: Stage): string {
  const m = (k: string) => st.metrics.find((x) => x.k === k)?.v
  switch (st.id) {
    case 'literature': return Number(m('identified')) > 0 ? String(m('identified')) : Number(m('papers')) > 0 ? String(m('papers')) : ''
    case 'screening': return st.issues > 0 ? `${st.issues}!` : Number(m('records')) > 0 ? String(m('records')) : ''
    case 'extraction': return Number(m('studies')) > 0 ? String(m('included')) : ''
    case 'risk_of_bias': return st.state === 'blocked' ? '' : String(m('assessed') ?? '')
    case 'statistics': return `k=${m('k')}`
    case 'prisma': return st.issues > 0 ? `${st.issues}!` : ''
    default: return ''
  }
}

export default function PipelineNav({ stages, open, openFlags, onClose }: { stages: Stage[]; open: boolean; openFlags: number; onClose: () => void }) {
  const [collapsed, setCollapsed] = useState<Set<string>>(() => {
    try {
      return new Set<string>(JSON.parse(localStorage.getItem(COLLAPSED_KEY) || '[]'))
    } catch {
      return new Set<string>()
    }
  })
  const toggleGroup = (g: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(g)) next.delete(g)
      else next.add(g)
      try { localStorage.setItem(COLLAPSED_KEY, JSON.stringify([...next])) } catch { /* the choice holds for this session */ }
      return next
    })
  const stageById = new Map(stages.map((s) => [s.id, s]))
  let n = 0

  return (
    <aside className={`sidebar${open ? ' open' : ''}`} aria-label="Navigator">
      <div className="sb-brand">
        <span>studyex_medeetomilab<b>_</b></span>
        <button className="sb-close" onClick={onClose} aria-label="Close navigator">✕</button>
      </div>
      <nav className="sb-nav" aria-label="Modules">
        {GROUPS.map((g) => {
          const items = MODULES.filter((m) => m.group === g)
          const isCollapsed = collapsed.has(g)
          const pipelineIssues = g === 'pipeline' ? stages.reduce((s, x) => s + x.issues, 0) : 0
          return (
            <div className={`sb-sec${isCollapsed ? ' collapsed' : ''}`} key={g}>
              <button className="h" onClick={() => toggleGroup(g)} aria-expanded={!isCollapsed}>
                <span className="chev" aria-hidden="true">▾</span>
                {GROUP_LABEL[g]}
                {g === 'pipeline' && <small>{stages.filter((s) => s.state === 'done' || s.state === 'ready').length}/{stages.length} ready{pipelineIssues ? ` · ${pipelineIssues} issues` : ''}</small>}
              </button>
              {!isCollapsed && items.map((it) => {
                const st = it.stage && !it.child ? stageById.get(it.stage) : undefined
                if (st) n += 1
                const hint = st ? stageHint(st) : ''
                return (
                  <NavLink
                    key={it.to}
                    to={it.to}
                    end={it.to === '/'}
                    onClick={onClose}
                    title={`${it.title} — ${it.hint}`}
                    className={({ isActive }) => `sb-link${isActive ? ' active' : ''}`}
                  >
                    <span className="ic" aria-hidden="true">{st ? String(n).padStart(2, '0') : it.child ? '└' : ''}</span>
                    <span className="lbl">{it.child ? it.id.split('/')[1] : it.id}</span>
                    {st && (
                      <span className="st">
                        {hint && <span aria-hidden="true">{hint}</span>}
                        <StateDot state={st.state} />
                        <span className="sr-only">{STATE_LABEL[st.state]}{st.issues ? `, ${st.issues} issues` : ''}</span>
                      </span>
                    )}
                    {it.to === '/suspension' && openFlags > 0 && (
                      <span className="st"><span>{openFlags}</span><i className="st-dot is-blocked" aria-hidden="true" /><span className="sr-only">{openFlags} open issues</span></span>
                    )}
                  </NavLink>
                )
              })}
            </div>
          )
        })}
      </nav>
      <div className="sb-foot">
        <div>{BRAND.namespace.toLowerCase()} / <b>{BRAND.name}</b></div>
        <div>runtime {BRAND.runtime.split(' ')[0]} · v{BRAND.version}</div>
      </div>
    </aside>
  )
}
