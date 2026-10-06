import { useEffect, useMemo, useRef, useState } from 'react'
import { useStore } from '../lib/store'
import { theoryChunks } from '../lib/theoryRag'
import type { ThemePreference } from '../lib/theme'
import { Portal } from './Portal'
import { setDim, useDim } from '../lib/dimension'
import { useSwapNavigate } from '../lib/swap'
import { MODULES } from '../lib/modules'
import { recId, studyId, rigorId, shortCode } from '../lib/ids'
import { runId } from '../lib/analysisRuns'
import { INSTABILITY_LABEL, SEVERITY_LABEL } from '../lib/palette'
import { SECTION_IDS } from '../lib/manuscriptQA'

interface Cmd {
  id: string
  group: string
  /** a printed identifier: STUDY_0A7XM, RIGOR_K2W1D, ~/screening */
  ident?: string
  label: string
  sub?: string
  kw?: string
  run: () => void
}

const ARTIFACTS = ['prisma_flow', 'forest_plot', 'funnel_plot', 'rob_figure', 'extraction_table', 'search_strategy', 'manuscript', 'references', 'project_state']

// contiguous match ranks best, then a subsequence (fuzzy) match; -1 = no match
function score(hay: string, q: string): number {
  if (!q) return 0
  const h = hay.toLowerCase()
  const idx = h.indexOf(q)
  if (idx >= 0) return 1000 - idx
  let hi = 0
  let gaps = 0
  for (let i = 0; i < q.length; i++) {
    const f = h.indexOf(q[i], hi)
    if (f < 0) return -1
    gaps += f - hi
    hi = f + 1
  }
  return 200 - gaps
}

/**
 * ⌘K — commands and global search in one. Empty, it lists the modules and
 * actions; typed, it searches the whole project: studies, screening records,
 * the evidence registry, DOIs and PMIDs, rigor issues, analysis runs,
 * artifacts, manuscript sections, hypotheses, assays and the theory.
 */
export default function CommandPalette({ open, onClose, onSetTheme, onOpenCopilot, onOpenCloud }: { open: boolean; onClose: () => void; onSetTheme: (preference: ThemePreference) => void; onOpenCopilot: () => void; onOpenCloud: () => void }) {
  const { state, projects, switchProject, undo, redo, canUndo, canRedo, instabilities } = useStore()
  const nav = useSwapNavigate()
  const dim = useDim()
  const [q, setQ] = useState('')
  const [sel, setSel] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (open) {
      setQ('')
      setSel(0)
      setTimeout(() => inputRef.current?.focus(), 20)
    }
  }, [open])

  const go = (to: string, afterId?: string) => {
    nav(to)
    onClose()
    if (afterId) setTimeout(() => document.getElementById(afterId)?.scrollIntoView(), 90)
  }

  const commands = useMemo<Cmd[]>(() => {
    const c: Cmd[] = []
    const r = state.review
    MODULES.forEach((m) => c.push({ id: `pg-${m.to}`, group: 'open', ident: m.id === 'overview' ? '~/' : `~/${m.id}`, label: `open ${m.id}`, sub: m.hint, kw: m.title, run: () => go(m.to) }))
    c.push({ id: 'act-terra', group: 'actions', ident: 'terra', label: 'open Terra', sub: 'the intelligence layer', kw: 'ai assistant copilot', run: () => { onOpenCopilot(); onClose() } })
    c.push({ id: 'act-cloud', group: 'actions', ident: 'cloud', label: 'open cloud', sub: 'project state & sync', kw: 'sync share supabase sign in', run: () => { onOpenCloud(); onClose() } })
    c.push(dim === '3d'
      ? { id: 'act-dim', group: 'actions', ident: 'view', label: 'flatten the interface (2D)', kw: 'flat 3d dimension depth', run: () => { onClose(); setDim('2d') } }
      : { id: 'act-dim', group: 'actions', ident: 'view', label: 'show the interface in 3D', kw: '3d dimension depth', run: () => { onClose(); setDim('3d') } })
    c.push({ id: 'act-theme-night', group: 'actions', ident: 'theme', label: 'dark theme', kw: 'night appearance', run: () => { onSetTheme('night'); onClose() } })
    c.push({ id: 'act-theme-day', group: 'actions', ident: 'theme', label: 'light theme', kw: 'day appearance', run: () => { onSetTheme('day'); onClose() } })
    c.push({ id: 'act-theme-auto', group: 'actions', ident: 'theme', label: 'theme follows device', kw: 'auto system', run: () => { onSetTheme('auto'); onClose() } })
    if (canUndo) c.push({ id: 'act-undo', group: 'actions', ident: '⌘Z', label: 'undo last edit', run: () => { undo(); onClose() } })
    if (canRedo) c.push({ id: 'act-redo', group: 'actions', ident: '⌘⇧Z', label: 'redo', run: () => { redo(); onClose() } })
    projects.forEach((p) => c.push({ id: `proj-${p.id}`, group: 'project', ident: p.code, label: `switch project · ${p.name}`, sub: p.stage?.toLowerCase(), run: () => { switchProject(p.id); onClose() } }))

    r.studies.forEach((s) => c.push({ id: `st-${s.id}`, group: 'study', ident: studyId(s.id), label: `${s.author} ${s.year}`, sub: s.doi ? `doi ${s.doi}` : s.pmid ? `pmid ${s.pmid}` : s.design, kw: `${s.pmid ?? ''} ${s.doi ?? ''} ${s.design ?? ''} ${s.note ?? ''}`, run: () => go(`/studies?study=${encodeURIComponent(s.id)}`) }))
    ;(r.screening ?? []).forEach((rec) => c.push({ id: `sc-${rec.id}`, group: 'record', ident: recId(rec.id), label: rec.title, sub: rec.pmid ? `pmid ${rec.pmid}` : undefined, kw: rec.authors, run: () => go(`/screening?rec=${encodeURIComponent(rec.id)}`) }))
    state.papers.forEach((p) => c.push({ id: `lit-${p.id}`, group: 'literature', ident: `LIT_${shortCode(p.id)}`, label: p.title, sub: p.doi ? `doi ${p.doi}` : p.pmid ? `pmid ${p.pmid}` : p.year ? String(p.year) : undefined, kw: `${p.authors ?? ''} ${p.journal ?? ''} ${(p.tags ?? []).join(' ')} ${p.pmid ?? ''} ${p.doi ?? ''}`, run: () => go(`/radar?lit=${encodeURIComponent(p.id)}`) }))
    instabilities.forEach((i) => c.push({ id: `rg-${i.id}`, group: 'rigor', ident: rigorId(i.id), label: INSTABILITY_LABEL[i.type], sub: `${i.status === 'open' ? SEVERITY_LABEL[i.severity] : i.status}${i.targetLabel ? ` · ${i.targetLabel}` : ''}`, kw: i.signal, run: () => go(`/suspension?issue=${encodeURIComponent(i.id)}`) }))
    ;(r.runs ?? []).forEach((run) => c.push({ id: `run-${run.id}`, group: 'analysis', ident: runId(run.n), label: `${run.outcome} · ${run.effect} · ${run.model}`, sub: run.status, kw: run.dataset, run: () => go('/meta') }))
    ARTIFACTS.forEach((a, i) => {
      const id = `ARTIFACT_${String(i + 1).padStart(2, '0')}`
      c.push({ id: `art-${a}`, group: 'artifact', ident: id, label: a, run: () => go(`/artifacts?a=${id}`) })
    })
    SECTION_IDS.forEach((sec) => c.push({ id: `ms-${sec}`, group: 'manuscript', ident: `sections/${sec}`, label: sec, run: () => go('/manuscript') }))
    state.hypotheses.forEach((h) => c.push({ id: `hy-${h.id}`, group: 'hypothesis', label: h.label, sub: h.status, kw: h.statement, run: () => go('/hypotheses') }))
    state.assays.forEach((a) => c.push({ id: `as-${a.id}`, group: 'assay', label: a.method, sub: a.cellType, kw: a.measures, run: () => go('/assays') }))
    theoryChunks(state).forEach((sec) => c.push({ id: `th-${sec.id}`, group: 'theory', label: sec.title, sub: sec.group, run: () => go('/theory', sec.id) }))
    return c
  }, [state, projects, canUndo, canRedo, onSetTheme, dim, instabilities]) // eslint-disable-line react-hooks/exhaustive-deps

  const results = useMemo(() => {
    const query = q.trim().toLowerCase()
    if (!query) return commands.filter((x) => x.group === 'open' || x.group === 'actions')
    return commands
      .map((cmd) => ({ cmd, s: score(`${cmd.ident ?? ''} ${cmd.label} ${cmd.sub ?? ''} ${cmd.group} ${cmd.kw ?? ''}`, query) }))
      .filter((x) => x.s >= 0)
      .sort((a, b) => b.s - a.s)
      .slice(0, 50)
      .map((x) => x.cmd)
  }, [q, commands])

  useEffect(() => { if (sel >= results.length) setSel(0) }, [results, sel])
  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-i="${sel}"]`)
    el?.scrollIntoView({ block: 'nearest' })
  }, [sel])

  if (!open) return null

  // group the (already-ranked) results, preserving rank order of first appearance
  const groups: { group: string; items: { cmd: Cmd; i: number }[] }[] = []
  results.forEach((cmd, i) => {
    let g = groups.find((x) => x.group === cmd.group)
    if (!g) { g = { group: cmd.group, items: [] }; groups.push(g) }
    g.items.push({ cmd, i })
  })

  return (
    <Portal>
      <div className="cmdk-overlay" onClick={onClose}>
        <div className="cmdk" role="dialog" aria-label="Command palette and project search" onClick={(e) => e.stopPropagation()}>
          <div className="cmdk-top">
            <span aria-hidden="true">›</span>
            <input
              ref={inputRef}
              className="cmdk-input"
              placeholder="search project… or type a command"
              value={q}
              role="combobox"
              aria-expanded="true"
              aria-controls="cmdk-list"
              aria-activedescendant={results[sel] ? `cmdk-${results[sel].id}` : undefined}
              onChange={(e) => { setQ(e.target.value); setSel(0) }}
              onKeyDown={(e) => {
                if (e.key === 'ArrowDown') { e.preventDefault(); setSel((s) => Math.min(results.length - 1, s + 1)) }
                else if (e.key === 'ArrowUp') { e.preventDefault(); setSel((s) => Math.max(0, s - 1)) }
                else if (e.key === 'Enter') { e.preventDefault(); results[sel]?.run() }
                else if (e.key === 'Escape') { e.preventDefault(); onClose() }
              }}
            />
          </div>
          <div className="cmdk-list" id="cmdk-list" role="listbox" ref={listRef}>
            {results.length === 0 ? (
              <div className="cmdk-empty">0 results for “{q}”</div>
            ) : (
              groups.map((g) => (
                <div key={g.group} role="group" aria-label={g.group}>
                  <div className="cmdk-group">{g.group}</div>
                  {g.items.map(({ cmd, i }) => (
                    <button key={cmd.id} id={`cmdk-${cmd.id}`} role="option" aria-selected={i === sel} data-i={i} className={`cmdk-item${i === sel ? ' on' : ''}`} onClick={() => cmd.run()} onMouseMove={() => setSel(i)}>
                      {cmd.ident && <span className="cmdk-id">{cmd.ident}</span>}
                      <span className="cmdk-label">{cmd.label}</span>
                      {cmd.sub && <span className="cmdk-sub">{cmd.sub}</span>}
                    </button>
                  ))}
                </div>
              ))
            )}
          </div>
          <div className="cmdk-foot"><span><kbd>↑↓</kbd> navigate</span><span><kbd>↵</kbd> open</span><span><kbd>esc</kbd> close</span><span className="spacer" /><span>{commands.length} indexed</span></div>
        </div>
      </div>
    </Portal>
  )
}
