import { useEffect, useMemo, useRef, useState } from 'react'
import { useStore } from '../lib/store'
import { theoryChunks } from '../lib/theoryRag'
import type { ThemePreference } from '../lib/theme'
import { Portal } from './Portal'
import { setDim, useDim } from '../lib/dimension'
import { useSwapNavigate } from '../lib/swap'

interface Cmd {
  id: string
  group: string
  label: string
  sub?: string
  icon?: string
  kw?: string
  run: () => void
}

const PAGES: { to: string; label: string; icon: string }[] = [
  { to: '/', label: 'Overview', icon: '⌂' },
  { to: '/portfolio', label: 'Portfolio', icon: '▦' },
  { to: '/pit-wall', label: 'Dashboard', icon: '▤' },
  { to: '/radar', label: 'Literature', icon: '◎' },
  { to: '/protocol', label: 'Protocol', icon: '⊞' },
  { to: '/screening', label: 'Screening', icon: '☑' },
  { to: '/prisma', label: 'PRISMA Flow', icon: '⇉' },
  { to: '/studies', label: 'Studies', icon: '☰' },
  { to: '/meta', label: 'Meta-analysis', icon: '⬦' },
  { to: '/manuscript', label: 'Manuscript', icon: '¶' },
  { to: '/hypotheses', label: 'Hypotheses', icon: '◆' },
  { to: '/mechanism', label: 'Mechanism Map', icon: '⇄' },
  { to: '/assays', label: 'Assays', icon: '▣' },
  { to: '/power', label: 'Statistical Power', icon: '∑' },
  { to: '/suspension', label: 'Rigor Monitor', icon: '⚠' },
  { to: '/graph', label: 'Knowledge Graph', icon: '⬡' },
  { to: '/theory', label: 'Theory', icon: '§' },
  { to: '/review', label: 'Knowledge Review', icon: '✦' },
]

// subsequence match (fuzzy) → score, or -1 if no match
function score(hay: string, q: string): number {
  if (!q) return 0
  const h = hay.toLowerCase()
  const idx = h.indexOf(q)
  if (idx >= 0) return 1000 - idx // contiguous substring ranks best
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

export default function CommandPalette({ open, onClose, onSetTheme, onOpenCopilot }: { open: boolean; onClose: () => void; onSetTheme: (preference: ThemePreference) => void; onOpenCopilot: () => void }) {
  const { state, projects, switchProject, undo, redo, canUndo, canRedo, reset } = useStore()
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
    PAGES.forEach((p) => c.push({ id: `pg-${p.to}`, group: 'Go to', label: p.label, icon: p.icon, run: () => go(p.to) }))
    c.push({ id: 'act-ai', group: 'Actions', label: 'Ask the AI copilot', icon: '✦', kw: 'chat assistant', run: () => { onOpenCopilot(); onClose() } })
    c.push(dim === '3d'
      ? { id: 'act-dim', group: 'Actions', label: 'Flatten to 2D', icon: '▭', kw: 'flat 3d dimension depth mode interface', run: () => { onClose(); setDim('2d') } }
      : { id: 'act-dim', group: 'Actions', label: 'Stand up in 3D', icon: '⬚', kw: '3d dimension depth mode interface', run: () => { onClose(); setDim('3d') } })
    c.push({ id: 'act-theme-auto', group: 'Actions', label: 'Auto theme · follow device', icon: '◐', kw: 'system automatic dark light mode appearance', run: () => { onSetTheme('auto'); onClose() } })
    c.push({ id: 'act-theme-day', group: 'Actions', label: 'Use day theme', icon: '☀︎', kw: 'light mode appearance', run: () => { onSetTheme('day'); onClose() } })
    c.push({ id: 'act-theme-night', group: 'Actions', label: 'Use night theme', icon: '☾', kw: 'dark mode appearance', run: () => { onSetTheme('night'); onClose() } })
    if (canUndo) c.push({ id: 'act-undo', group: 'Actions', label: 'Undo last edit', icon: '↶', run: () => { undo(); onClose() } })
    if (canRedo) c.push({ id: 'act-redo', group: 'Actions', label: 'Redo', icon: '↷', run: () => { redo(); onClose() } })
    c.push({ id: 'act-reset', group: 'Actions', label: 'Reset project to seed data', icon: '⟲', kw: 'clear', run: () => { if (confirm('Reset all edits back to the seed project?')) reset(); onClose() } })
    projects.forEach((p) => c.push({ id: `proj-${p.id}`, group: 'Switch project', label: `${p.code}`, sub: p.name, icon: '◇', run: () => { switchProject(p.id); onClose() } }))
    state.review.studies.forEach((s) => c.push({ id: `st-${s.id}`, group: 'Studies', label: `${s.author} ${s.year}`, sub: s.pmid ? `PMID ${s.pmid}` : undefined, icon: '☰', run: () => go('/studies') }))
    state.hypotheses.forEach((h) => c.push({ id: `hy-${h.id}`, group: 'Hypotheses', label: h.label, sub: h.status, icon: '◆', run: () => go('/hypotheses') }))
    state.assays.forEach((a) => c.push({ id: `as-${a.id}`, group: 'Assays', label: a.method, sub: a.cellType, icon: '▣', run: () => go('/assays') }))
    ;(state.review.screening ?? []).forEach((rec) => c.push({ id: `sc-${rec.id}`, group: 'Screening', label: rec.title, sub: rec.pmid ? `PMID ${rec.pmid}` : undefined, icon: '☑', run: () => go('/screening') }))
    theoryChunks(state).forEach((sec) => c.push({ id: `th-${sec.id}`, group: 'Theory', label: sec.title, sub: sec.group, icon: '§', run: () => go('/theory', sec.id) }))
    return c
  }, [state, projects, canUndo, canRedo, onSetTheme, dim]) // eslint-disable-line react-hooks/exhaustive-deps

  const results = useMemo(() => {
    const query = q.trim().toLowerCase()
    if (!query) return commands.filter((x) => x.group === 'Go to' || x.group === 'Actions')
    return commands
      .map((cmd) => ({ cmd, s: score(`${cmd.label} ${cmd.sub ?? ''} ${cmd.group} ${cmd.kw ?? ''}`, query) }))
      .filter((x) => x.s >= 0)
      .sort((a, b) => b.s - a.s)
      .slice(0, 40)
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
        <div className="cmdk" onClick={(e) => e.stopPropagation()}>
          <input
            ref={inputRef}
            className="cmdk-input"
            placeholder="Search pages, studies, hypotheses, actions…"
            value={q}
            onChange={(e) => { setQ(e.target.value); setSel(0) }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') { e.preventDefault(); setSel((s) => Math.min(results.length - 1, s + 1)) }
              else if (e.key === 'ArrowUp') { e.preventDefault(); setSel((s) => Math.max(0, s - 1)) }
              else if (e.key === 'Enter') { e.preventDefault(); results[sel]?.run() }
              else if (e.key === 'Escape') { e.preventDefault(); onClose() }
            }}
          />
          <div className="cmdk-list" ref={listRef}>
            {results.length === 0 ? (
              <div className="cmdk-empty">No matches for “{q}”.</div>
            ) : (
              groups.map((g) => (
                <div key={g.group}>
                  <div className="cmdk-group">{g.group}</div>
                  {g.items.map(({ cmd, i }) => (
                    <button key={cmd.id} data-i={i} className={`cmdk-item${i === sel ? ' on' : ''}`} onClick={() => cmd.run()} onMouseMove={() => setSel(i)}>
                      <span className="cmdk-ic">{cmd.icon}</span>
                      <span className="cmdk-label">{cmd.label}</span>
                      {cmd.sub && <span className="cmdk-sub">{cmd.sub}</span>}
                    </button>
                  ))}
                </div>
              ))
            )}
          </div>
          <div className="cmdk-foot"><kbd>↑↓</kbd> navigate <kbd>↵</kbd> open <kbd>esc</kbd> close</div>
        </div>
      </div>
    </Portal>
  )
}
