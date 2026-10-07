import { Link, Outlet, useLocation } from 'react-router-dom'
import { Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useStore } from '../lib/store'
import AssistantDock from './AssistantDock'
import CommandPalette from './CommandPalette'
import Cloud from './Cloud'
import PipelineNav from './PipelineNav'
import ContextPanel from './ContextPanel'
import StatusBar from './StatusBar'
import { Tag } from './ui'
import { useLiveryMotion } from '../lib/motion'
import { useDim, toggleDim } from '../lib/dimension'
import { useTiltField } from '../lib/tilt'
import { setRouteOrder, useLinkSwap, useSwapNavigate } from '../lib/swap'
import DepthStage from './DepthStage'
import { Portal } from './Portal'
import { RouteSkeleton } from './Skeleton'
import { useTheme, type ThemePreference } from '../lib/theme'
import type { SyncStatus } from '../lib/cloudSync'
import { MODULES, moduleFor, projectPath } from '../lib/modules'
import { pipeline, projectState } from '../lib/pipeline'
import { analysisIncluded } from '../lib/cohorts'
import { hasKey } from '../lib/openai'
import { openTerra } from '../lib/terra'
import { BRAND, projectTitle } from '../lib/brand'
import { DexMark } from './Molecule'

// g-chord destinations (press "g" then the key)
const GNAV: Record<string, string> = {
  o: '/', l: '/radar', c: '/screening', e: '/studies', b: '/rob', s: '/meta', p: '/prisma', m: '/manuscript', q: '/suspension',
  a: '/artifacts', k: '/graph', t: '/theory', h: '/hypotheses', r: '/review', d: '/pit-wall',
}
const SHORTCUTS: { keys: string; label: string }[] = [
  { keys: '⌘K', label: 'command palette · search project' },
  { keys: 'g then o', label: 'overview' },
  { keys: 'g then l · c · e · b', label: 'literature · screening · extraction · risk of bias' },
  { keys: 'g then s · p · m', label: 'statistics · PRISMA · manuscript' },
  { keys: 'g then q · a', label: 'rigor · artifacts' },
  { keys: 'I · E · U', label: 'screening: include · exclude · uncertain' },
  { keys: 'J · K', label: 'screening: next · previous record' },
  { keys: '⌘Z · ⌘⇧Z', label: 'undo · redo' },
  { keys: '⇧T', label: 'open Terra' },
  { keys: '⇧D', label: 'flat ⇄ 3D view' },
  { keys: '?', label: 'this list' },
  { keys: 'Esc', label: 'close panels' },
]

// The 3D page swap turns in the direction of travel down (or up) this list.
setRouteOrder(MODULES.map((m) => m.to))

const CONTEXT_KEY = 'williamslab.context'
const readContext = () => {
  try {
    const v = localStorage.getItem(CONTEXT_KEY)
    if (v === 'on' || v === 'off') return v === 'on'
  } catch { /* fall through to the default */ }
  return window.innerWidth >= 1500
}

export default function Layout() {
  const store = useStore()
  const { state, stability, instabilities, projects, activeId, switchProject, createProject, undo, redo, canUndo, canRedo } = store
  const [projMenu, setProjMenu] = useState(false)
  const [help, setHelp] = useState(false)
  const [cloudOpen, setCloudOpen] = useState(false)
  const [cloudStatus, setCloudStatus] = useState<SyncStatus | null>(null)
  const [navOpen, setNavOpen] = useState(false)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [toolsOpen, setToolsOpen] = useState(false)
  const [contextOn, setContextOn] = useState(readContext)
  const loc = useLocation()
  const nav = useSwapNavigate()
  // close the mobile drawer whenever the route changes
  useEffect(() => { setNavOpen(false); setToolsOpen(false) }, [loc.pathname])
  const { preference, theme, setThemePreference } = useTheme()

  const stages = useMemo(() => pipeline(state), [state])
  const run = projectState(stages, instabilities)
  const mod = moduleFor(loc.pathname)
  const path = projectPath(state.project.code, loc.pathname)
  const terraReady = hasKey()
  const openFlags = instabilities.filter((i) => i.status === 'open').length

  const toggleContext = () =>
    setContextOn((v) => {
      try { localStorage.setItem(CONTEXT_KEY, v ? 'off' : 'on') } catch { /* this session only */ }
      return !v
    })

  // the document title follows the project and the module
  useEffect(() => {
    document.title = mod && mod.id !== 'overview' ? projectTitle(state.project.code, mod.id) : loc.pathname === '/' ? projectTitle(state.project.code) : BRAND.title
  }, [mod, state.project.code, loc.pathname])

  // keyboard shortcuts (undo/redo, help, g-chord navigation)
  const storeRef = useRef(store)
  storeRef.current = store
  const gPending = useRef(false)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      const typing = !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)
      const mod = e.metaKey || e.ctrlKey
      if (mod && (e.key === 'z' || e.key === 'Z')) {
        if (typing) return // leave native text undo alone
        e.preventDefault()
        if (e.shiftKey) storeRef.current.redo()
        else storeRef.current.undo()
        return
      }
      if (mod && (e.key === 'y' || e.key === 'Y')) {
        if (typing) return
        e.preventDefault()
        storeRef.current.redo()
        return
      }
      if (mod && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault()
        setPaletteOpen((v) => !v)
        return
      }
      if (typing || mod || e.altKey) return
      if (e.key === '?') {
        setHelp((h) => !h)
        return
      }
      if (e.key === 'D' && e.shiftKey) {
        e.preventDefault()
        toggleDim()
        return
      }
      if (e.key === 'T' && e.shiftKey) {
        e.preventDefault()
        openTerra()
        return
      }
      if (e.key === 'Escape') {
        setHelp(false)
        setProjMenu(false)
        setNavOpen(false)
        return
      }
      if (e.key === 'g') {
        gPending.current = true
        window.setTimeout(() => (gPending.current = false), 900)
        return
      }
      if (gPending.current) {
        gPending.current = false
        const to = GNAV[e.key.toLowerCase()]
        if (to) {
          e.preventDefault()
          nav(to)
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [nav])

  // A new page opens at its top. Layout effect, and ahead of the motion hook:
  // the page swap's snapshot and the entrance measurements both need the new
  // page already at the top.
  useLayoutEffect(() => {
    window.scrollTo(0, 0)
  }, [loc.pathname])
  useLiveryMotion(loc.pathname)
  useTiltField()
  useLinkSwap()
  const dim = useDim()

  const included = state.review.studies.filter(analysisIncluded).length

  return (
    <div className={`shell${contextOn ? ' ctx-on' : ''}`}>
      <DepthStage />
      <header className="topbar">
        <button className="hamburger" onClick={() => setNavOpen(true)} aria-label="Open navigator">☰</button>
        <Link className="brand" to="/" aria-label={`${BRAND.name} — project overview`}>
          <DexMark size={20} />
          <span className="brand-full">studyex_medeetomilab<b>_</b></span>
          <span className="brand-short">medeetomilab<b>_</b></span>
        </Link>
        <div className="tb-title">
          <span className="tb-path" title={mod?.title}>{path.root}<b>{path.code}</b>{path.module && <i>/{path.module}</i>}</span>
        </div>
        <button className="tb-search" onClick={() => setPaletteOpen(true)} aria-label="Search project (⌘K)">
          <span>search project…</span>
          <kbd>⌘K</kbd>
        </button>
        <div className="right">
          <span className="undo-group">
            <button className="icon-btn" onClick={undo} disabled={!canUndo} title="Undo (⌘Z)" aria-label="Undo">↶</button>
            <button className="icon-btn" onClick={redo} disabled={!canRedo} title="Redo (⌘⇧Z)" aria-label="Redo">↷</button>
          </span>
          <span className="tb-sep" />
          <div className="proj-switch">
            <button className="proj-chip" onClick={() => setProjMenu((v) => !v)} title={state.project.name} aria-haspopup="menu" aria-expanded={projMenu}>
              <small>project</small>{state.project.code} ▾
            </button>
            {projMenu && (
              <>
                <div className="proj-backdrop" onClick={() => setProjMenu(false)} />
                <div className="proj-menu" role="menu">
                  <div className="proj-menu-h">projects · {projects.length}</div>
                  {projects.map((p) => (
                    <button key={p.id} role="menuitem" className={`proj-item${p.id === activeId ? ' active' : ''}`} onClick={() => { switchProject(p.id); setProjMenu(false) }}>
                      <b>{p.code}</b><span>{p.name}</span><em>{p.id === activeId ? 'open' : (p.stage ?? '').toLowerCase()}</em>
                    </button>
                  ))}
                  <div className="proj-sep" />
                  <button className="proj-item new" role="menuitem" onClick={() => { const n = window.prompt('New project name'); if (n) createProject(n); setProjMenu(false) }}>＋ new project</button>
                </div>
              </>
            )}
          </div>
          <Tag tone={run.tone === 'idle' ? 'idle' : run.tone}>{run.label}</Tag>
          <span className="tb-sep" />
          <button className="icon-btn tb-tools-toggle" onClick={() => setToolsOpen((v) => !v)} aria-label="More workspace controls" aria-expanded={toolsOpen} aria-controls="workspace-controls">•••</button>
          <div id="workspace-controls" className={`tb-tools${toolsOpen ? ' open' : ''}`}>
          <button className="icon-btn terra-btn" onClick={() => { setToolsOpen(false); openTerra() }} title={terraReady ? 'Terra — the intelligence layer (⇧T)' : 'Terra is off — add an OpenAI key in Knowledge review → Settings'}>
            terra<i className={`st-dot ${terraReady ? 'is-ready' : 'is-empty'}`} aria-hidden="true" />
          </button>
          <button className="icon-btn cloud-trigger" onClick={() => { setToolsOpen(false); setCloudOpen(true) }} title="Cloud: project state and sync" aria-label={`Cloud sync: ${cloudStatus?.message || 'open settings'}`}>cloud{cloudStatus && cloudStatus.phase !== 'paused' && <i className={`cloud-dot ${cloudStatus.phase}`} aria-hidden="true" />}</button>
          <button className="icon-btn ctx-btn" onClick={toggleContext} aria-pressed={contextOn} title={contextOn ? 'Hide the context panel' : 'Show the context panel'}>ctx</button>
          <button type="button" className="icon-btn dim-toggle" onClick={toggleDim} aria-label="3D view" aria-pressed={dim === '3d'} title={dim === '3d' ? 'Flatten the interface (⇧D)' : 'Show the interface in 3D (⇧D)'}>
            <span className="dim-cube" aria-hidden="true"><i /><i /><i /><i /><i /><i /></span>
            <span className="dim-label">{dim}</span>
          </button>
          <select
            className="toggle theme-select"
            aria-label="Color theme"
            title={preference === 'auto' ? `auto · follows this device (currently ${theme === 'night' ? 'dark' : 'light'})` : `${theme === 'night' ? 'dark' : 'light'} theme`}
            value={preference}
            onChange={(event) => setThemePreference(event.target.value as ThemePreference)}
          >
            <option value="night">dark</option>
            <option value="day">light</option>
            <option value="auto">auto</option>
          </select>
          <button className="icon-btn kbd-btn" onClick={() => setHelp(true)} title="Keyboard shortcuts (?)" aria-label="Keyboard shortcuts">?</button>
          </div>
        </div>
        <i className="tb-progress" aria-hidden="true" />
      </header>

      {navOpen && <div className="sb-drawer-backdrop" onClick={() => setNavOpen(false)} />}
      <PipelineNav stages={stages} open={navOpen} openFlags={openFlags} onClose={() => setNavOpen(false)} />

      <main className="main" id="main">
        <div className="content">
          <Suspense fallback={<RouteSkeleton path={loc.pathname} />}>
            <Outlet />
          </Suspense>
        </div>
      </main>

      {contextOn && (
        <ContextPanel state={state} stages={stages} instabilities={instabilities} stability={stability} sync={cloudStatus} terraReady={terraReady} module={mod} />
      )}

      <StatusBar
        facts={{ code: state.project.code, records: state.review.screening?.length ?? 0, included, rigor: stability, openIssues: openFlags, terraReady, dim }}
        sync={cloudStatus}
        onCloud={() => setCloudOpen(true)}
        onTerra={() => openTerra()}
        onPalette={() => setPaletteOpen(true)}
        onDim={toggleDim}
      />

      <AssistantDock key={activeId} />
      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        onSetTheme={setThemePreference}
        onOpenCopilot={() => openTerra()}
        onOpenCloud={() => setCloudOpen(true)}
      />
      <Cloud open={cloudOpen} onClose={() => setCloudOpen(false)} onSyncStatus={setCloudStatus} />

      {help && (
        <Portal>
          <div className="kbd-overlay" onClick={() => setHelp(false)}>
            <div className="kbd-card" role="dialog" aria-label="Keyboard shortcuts" onClick={(e) => e.stopPropagation()}>
              <div className="kbd-head">
                <b>keyboard</b>
                <button className="modal-x" onClick={() => setHelp(false)} aria-label="Close">✕</button>
              </div>
              <div className="kbd-list">
                {SHORTCUTS.map((s) => (
                  <div className="kbd-row" key={s.label}>
                    <kbd>{s.keys}</kbd>
                    <span>{s.label}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Portal>
      )}
    </div>
  )
}
