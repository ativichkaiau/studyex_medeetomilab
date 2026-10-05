import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { ProjectState, Project, ProjectTheory, Instability, GraphNode, GraphEdge, Hypothesis, Assay, Paper, Study, Review } from '../types'
import { seed, blankProject } from '../data/seed'
import { computeInstabilities, stabilityScore } from './suspension'
import { WORKSPACE_RESTORED, reportWorkspaceSave } from './cloudSync'
import { analysisIncluded, enforceCohorts } from './cohorts'

// localStorage-backed, multi-project store. No backend — data lives in the browser.
const KEY = 'williamslab.app.v2'
const OLD_KEY = 'williamslab.project.v1'
const RETIRED_SEED_PROJECT_IDS = new Set(['scn5a-risk'])

interface AppState {
  projects: ProjectState[]
  activeId: string
}

function uid(prefix: string): string {
  const rnd = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID().slice(0, 8) : Math.random().toString(36).slice(2, 10)
  return `${prefix}_${rnd}`
}

function normalize(p: ProjectState): ProjectState {
  const theoryReference = p.project.theoryReference ?? (p.project.id === 'brs-epi' || p.project.id.startsWith('brs-epi_') ? 'brugada' : undefined)
  let theoryRead = p.theoryRead ?? []
  // Migrate the former global reading progress only to the original BrS project.
  if (!p.theoryRead && p.project.id === 'brs-epi') {
    try {
      const old: unknown = JSON.parse(localStorage.getItem('williamslab.theory.read') || '[]')
      if (Array.isArray(old)) theoryRead = old.filter((id): id is string => typeof id === 'string')
    } catch { /* keep an empty reading list */ }
  }
  return { ...p, review: { ...p.review, studies: enforceCohorts(p.review.studies) }, theoryRead, activity: p.activity ?? [], project: { ...p.project, theoryReference, stage: p.project.stage ?? 'Protocol' } }
}

function pruneRetiredSeedProjects(projects: ProjectState[]): ProjectState[] {
  return projects.filter((p) => !RETIRED_SEED_PROJECT_IDS.has(p.project.id))
}

function load(): AppState {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      const a = JSON.parse(raw) as AppState
      if (a.projects?.length) {
        const projects = pruneRetiredSeedProjects(a.projects.map(normalize))
        if (projects.length) return { projects, activeId: projects.some((p) => p.project.id === a.activeId) ? a.activeId : projects[0].project.id }
      }
    }
    const old = localStorage.getItem(OLD_KEY)
    if (old) {
      const p = normalize({ ...seed, ...JSON.parse(old) })
      return { projects: [p], activeId: p.project.id } // preserve the user's existing single project
    }
  } catch {
    /* ignore corrupt state, fall back to seed */
  }
  return { projects: [normalize(seed)], activeId: seed.project.id }
}

interface StoreCtx {
  state: ProjectState
  instabilities: Instability[]
  stability: number
  // instability / project
  setInstabilityStatus: (id: string, status: 'open' | 'acknowledged' | 'resolved') => void
  setPreRegistered: (v: boolean) => void
  setPrimaryEndpoint: (v: string | undefined) => void
  // graph
  addNode: (n: Omit<GraphNode, 'id'> & { id?: string }) => string
  updateNode: (id: string, patch: Partial<GraphNode>) => void
  removeNode: (id: string) => void
  addEdge: (e: Omit<GraphEdge, 'id'> & { id?: string }) => string
  removeEdge: (id: string) => void
  importStudiesToGraph: () => number
  // hypotheses
  addHypothesis: (h: Omit<Hypothesis, 'id'> & { id?: string }) => string
  updateHypothesis: (id: string, patch: Partial<Hypothesis>) => void
  removeHypothesis: (id: string) => void
  // assays
  addAssay: (a: Omit<Assay, 'id'> & { id?: string }) => string
  updateAssay: (id: string, patch: Partial<Assay>) => void
  removeAssay: (id: string) => void
  // papers
  addPaper: (p: Omit<Paper, 'id'> & { id?: string }, linkHypothesisId?: string) => string
  removePaper: (id: string) => void
  updatePaper: (id: string, patch: Partial<Paper>) => void
  // systematic review
  /** patch the review; with `log`, the change is also written to the activity log (an audit line) */
  updateReview: (patch: Partial<Review>, log?: { kind: string; text: string }) => void
  updatePrisma: (patch: Partial<Review['prisma']>) => void
  addStudy: (s: Omit<Study, 'id'> & { id?: string }) => string
  addStudies: (list: (Omit<Study, 'id'> & { id?: string })[]) => void
  updateStudy: (id: string, patch: Partial<Study>) => void
  removeStudy: (id: string) => void
  // projects
  projects: { id: string; name: string; code: string; stage?: string }[]
  allProjects: ProjectState[] // full state of every project (for the portfolio)
  activeId: string
  switchProject: (id: string) => void
  createProject: (name: string, code?: string, opts?: { question?: string; index?: string; comparator?: string; outcome?: string }) => string
  patchProjectById: (id: string, patch: Partial<Project>) => void
  updateProject: (patch: Partial<Project>) => void
  saveTheory: (projectId: string, theory: ProjectTheory) => void
  setTheoryRead: (projectId: string, ids: string[]) => void
  updateResearch: (projectId: string, updater: (p: ProjectState) => ProjectState, activity: string) => void
  deleteProject: (id: string) => void
  setStage: (stage: string) => void
  exportActive: () => string
  importProject: (json: string) => boolean
  reset: () => void
  undo: () => void
  redo: () => void
  canUndo: boolean
  canRedo: boolean
}

const Ctx = createContext<StoreCtx | null>(null)

export function StoreProvider({ children }: { children: ReactNode }) {
  const [app, setApp] = useState<AppState>(load)

  // Undo/redo history. Kept in refs and driven by apply() OUTSIDE any functional
  // updater, so React 18 StrictMode's double-invocation can't double-record.
  const appRef = useRef(app)
  const past = useRef<AppState[]>([])
  const future = useRef<AppState[]>([])
  const persist = (next: AppState) => {
    try {
      localStorage.setItem(KEY, JSON.stringify(next))
      reportWorkspaceSave(KEY, true)
      return true
    } catch { reportWorkspaceSave(KEY, false); return false }
  }

  // The single mutation entry point. `history` pushes the previous state onto
  // the undo stack (and clears redo); pass false for pure view changes.
  const apply = (next: AppState, history = true, requireSave = false) => {
    next = { ...next, projects: next.projects.map((p) => ({ ...p, review: { ...p.review, studies: enforceCohorts(p.review.studies) } })) }
    if (requireSave && !persist(next)) throw new Error('Device storage is full or unavailable. This change was not saved. Export a backup or free storage, then retry.')
    if (history) {
      past.current.push(appRef.current)
      if (past.current.length > 60) past.current.shift()
      future.current = []
    }
    appRef.current = next
    setApp(next)
    if (!requireSave) persist(next)
  }

  useEffect(() => {
    // Store initialization/migrations are not user edits. Cloud must read its
    // existing copy before deciding whether this device has anything to upload.
    try { localStorage.setItem(KEY, JSON.stringify(appRef.current)); reportWorkspaceSave(KEY, true, false) }
    catch { reportWorkspaceSave(KEY, false, false) }
    const reload = () => {
      const next = load()
      appRef.current = next
      past.current = []
      future.current = []
      setApp(next)
    }
    const storage = (e: StorageEvent) => { if (e.key === KEY) reload() }
    window.addEventListener(WORKSPACE_RESTORED, reload)
    window.addEventListener('storage', storage)
    return () => {
      window.removeEventListener(WORKSPACE_RESTORED, reload)
      window.removeEventListener('storage', storage)
    }
  }, [])

  const state = app.projects.find((p) => p.project.id === app.activeId) ?? app.projects[0]
  // all existing actions operate on the active project via this shim; no-op
  // updates (updater returns the same ref) are skipped so undo stays meaningful
  const setState = (updater: (s: ProjectState) => ProjectState) => {
    const cur = appRef.current
    let changed = false
    const projects = cur.projects.map((p) => {
      if (p.project.id !== cur.activeId) return p
      const np = updater(p)
      if (np !== p) changed = true
      return np
    })
    if (!changed) return
    apply({ ...cur, projects })
  }

  const undo = () => {
    if (!past.current.length) return
    const prev = past.current.pop()!
    future.current.push(appRef.current)
    appRef.current = prev
    setApp(prev)
    persist(prev)
  }
  const redo = () => {
    if (!future.current.length) return
    const next = future.current.pop()!
    past.current.push(appRef.current)
    appRef.current = next
    setApp(next)
    persist(next)
  }
  // prepend an activity entry (capped) — bundle into the same state update
  const act = (s: ProjectState, kind: string, text: string) => [{ id: uid('a'), ts: Date.now(), kind, text }, ...s.activity].slice(0, 60)

  const instabilities = useMemo(() => computeInstabilities(state), [state])
  const stability = useMemo(() => stabilityScore(instabilities), [instabilities])

  const value: StoreCtx = {
    state,
    instabilities,
    stability,

    setInstabilityStatus: (id, status) =>
      setState((s) => {
        const overrides = { ...s.instabilityOverrides }
        if (status === 'open') delete overrides[id]
        else overrides[id] = status
        return { ...s, instabilityOverrides: overrides, activity: status === 'open' ? s.activity : act(s, 'rigor', `${status === 'resolved' ? 'Resolved' : 'Acknowledged'} a rigor finding`) }
      }),
    setPreRegistered: (v) => setState((s) => ({ ...s, project: { ...s.project, preRegistered: v } })),
    setPrimaryEndpoint: (v) => setState((s) => ({ ...s, project: { ...s.project, primaryEndpoint: v } })),

    addNode: (n) => {
      const id = n.id ?? uid('node')
      setState((s) => {
        const spot = findFreeSpot(s.nodes, n.x ?? 700, n.y ?? 450)
        return { ...s, nodes: [...s.nodes, { ...n, id, x: spot.x, y: spot.y }], activity: act(s, 'graph', `Added ${n.type} node "${n.label}"`) }
      })
      return id
    },
    updateNode: (id, patch) => setState((s) => ({ ...s, nodes: s.nodes.map((n) => (n.id === id ? { ...n, ...patch } : n)) })),
    removeNode: (id) =>
      setState((s) => ({
        ...s,
        nodes: s.nodes.filter((n) => n.id !== id),
        edges: s.edges.filter((e) => e.src !== id && e.dst !== id),
      })),

    addEdge: (e) => {
      const id = e.id ?? uid('edge')
      setState((s) => ({ ...s, edges: [...s.edges, { ...e, id }] }))
      return id
    },
    removeEdge: (id) => setState((s) => ({ ...s, edges: s.edges.filter((e) => e.id !== id) })),

    // materialise the included review studies as Paper nodes, each linked to a
    // shared outcome node — so the meta-analysis evidence lives on the graph too
    importStudiesToGraph: () => {
      const incl = state.review.studies.filter(analysisIncluded)
      if (!incl.length) return 0
      const outLabel = state.review.outcomeLabel || 'Outcome'
      const existingOutcome = state.nodes.find((n) => n.type === 'ClinicalPhenotype' && n.label === outLabel)
      const haveLabels = new Set(state.nodes.filter((n) => n.type === 'Paper').map((n) => n.label))
      const newNodes: GraphNode[] = []
      const newEdges: GraphEdge[] = []
      const outcomeId = existingOutcome?.id ?? uid('node')
      incl.forEach((st, i) => {
        const label = `${st.author} ${st.year}`
        if (haveLabels.has(label)) return
        haveLabels.add(label)
        const ang = (i / incl.length) * Math.PI * 2 - Math.PI / 2
        const pid = uid('node')
        newNodes.push({ id: pid, type: 'Paper', label, sublabel: st.pmid ? `PMID ${st.pmid}` : st.design || 'study', x: 700 + Math.cos(ang) * 320, y: 500 + Math.sin(ang) * 250 })
        newEdges.push({ id: uid('edge'), src: pid, dst: outcomeId, rel: 'associated_with', evidence: 'correlational', strength: 0.5 })
      })
      const added = newEdges.length
      if (!added) return 0
      if (!existingOutcome) newNodes.unshift({ id: outcomeId, type: 'ClinicalPhenotype', label: outLabel, sublabel: 'outcome', x: 700, y: 170 })
      setState((s) => ({ ...s, nodes: [...s.nodes, ...newNodes], edges: [...s.edges, ...newEdges], activity: act(s, 'graph', `Imported ${added} study node${added === 1 ? '' : 's'} from the review`) }))
      return added
    },

    addHypothesis: (h) => {
      const id = h.id ?? uid('hyp')
      setState((s) => {
        const spot = findFreeSpot(s.nodes, 700, 450)
        return {
          ...s,
          hypotheses: [...s.hypotheses, { ...h, id }],
          nodes: [...s.nodes, { id, type: 'Hypothesis', label: h.label.split('·')[0].trim() || 'Hypothesis', sublabel: 'hypothesis', x: spot.x, y: spot.y }],
          activity: act(s, 'hypothesis', `Added hypothesis ${h.label.split('·')[0].trim()}`),
        }
      })
      return id
    },
    updateHypothesis: (id, patch) =>
      setState((s) => ({
        ...s,
        hypotheses: s.hypotheses.map((h) => (h.id === id ? { ...h, ...patch } : h)),
        nodes: patch.label ? s.nodes.map((n) => (n.id === id ? { ...n, label: patch.label!.split('·')[0].trim() } : n)) : s.nodes,
      })),
    removeHypothesis: (id) =>
      setState((s) => ({
        ...s,
        hypotheses: s.hypotheses.filter((h) => h.id !== id),
        nodes: s.nodes.filter((n) => n.id !== id),
        edges: s.edges.filter((e) => e.src !== id && e.dst !== id),
        papers: s.papers.map((p) => ({ ...p, targets: (p.targets ?? []).filter((t) => t !== id) })),
        assays: s.assays.map((a) => ({ ...a, claims: (a.claims ?? []).filter((c) => c !== id) })),
      })),

    addAssay: (a) => {
      const id = a.id ?? uid('assay')
      setState((s) => ({ ...s, assays: [...s.assays, { ...a, id }], activity: act(s, 'assay', `Added assay ${a.method ?? ''}`.trim()) }))
      return id
    },
    updateAssay: (id, patch) => setState((s) => ({ ...s, assays: s.assays.map((a) => (a.id === id ? { ...a, ...patch } : a)) })),
    removeAssay: (id) => setState((s) => ({ ...s, assays: s.assays.filter((a) => a.id !== id) })),

    addPaper: (p, linkHypothesisId) => {
      const id = p.id ?? uid('paper')
      setState((s) => {
        if (s.papers.some((x) => x.id === id)) return s // dedupe
        const targets = linkHypothesisId ? Array.from(new Set([...(p.targets ?? []), linkHypothesisId])) : p.targets
        const nextPapers = [...s.papers, { ...p, id, targets }]
        const spot = findFreeSpot(s.nodes, 1050, 520)
        const nextNodes = s.nodes.some((n) => n.id === id)
          ? s.nodes
          : [...s.nodes, { id, type: 'Paper' as const, label: 'Paper', sublabel: p.year ? String(p.year) : 'ref', x: spot.x, y: spot.y }]
        let nextHyp = s.hypotheses
        let nextEdges = s.edges
        if (linkHypothesisId) {
          nextHyp = s.hypotheses.map((h) =>
            h.id === linkHypothesisId ? { ...h, supportingPapers: Array.from(new Set([...(h.supportingPapers ?? []), id])) } : h,
          )
          nextEdges = [...s.edges, { id: uid('edge'), src: id, dst: linkHypothesisId, rel: 'supports' as const, evidence: 'correlational' as const, strength: 0.4 }]
        }
        return { ...s, papers: nextPapers, nodes: nextNodes, hypotheses: nextHyp, edges: nextEdges, activity: act(s, 'literature', `Linked reference ${p.pmid ? 'PMID ' + p.pmid : ''}`.trim()) }
      })
      return id
    },
    removePaper: (id) =>
      setState((s) => ({
        ...s,
        papers: s.papers.filter((p) => p.id !== id),
        nodes: s.nodes.filter((n) => n.id !== id),
        edges: s.edges.filter((e) => e.src !== id && e.dst !== id),
        hypotheses: s.hypotheses.map((h) => ({ ...h, supportingPapers: (h.supportingPapers ?? []).filter((x) => x !== id) })),
      })),
    updatePaper: (id, patch) => setState((s) => ({ ...s, papers: s.papers.map((p) => (p.id === id ? { ...p, ...patch } : p)) })),

    updateReview: (patch, log) => setState((s) => ({ ...s, review: { ...s.review, ...patch }, ...(log ? { activity: act(s, log.kind, log.text) } : {}) })),
    updatePrisma: (patch) => setState((s) => ({ ...s, review: { ...s.review, prisma: { ...s.review.prisma, ...patch } } })),
    addStudy: (st) => {
      const id = st.id ?? uid('st')
      setState((s) => ({ ...s, review: { ...s.review, studies: [...s.review.studies, { ...st, id }] }, activity: act(s, 'study', `Added study ${st.author ?? ''} ${st.year ?? ''}`.trim()) }))
      return id
    },
    addStudies: (list) =>
      setState((s) => ({ ...s, review: { ...s.review, studies: [...s.review.studies, ...list.map((st) => ({ ...st, id: st.id ?? uid('st') }))] }, activity: act(s, 'import', `Imported ${list.length} stud${list.length === 1 ? 'y' : 'ies'}`) })),
    updateStudy: (id, patch) =>
      setState((s) => ({ ...s, review: { ...s.review, studies: s.review.studies.map((x) => (x.id === id ? { ...x, ...patch } : x)) } })),
    removeStudy: (id) => setState((s) => ({ ...s, review: { ...s.review, studies: s.review.studies.filter((x) => x.id !== id) } })),

    projects: app.projects.map((p) => ({ id: p.project.id, name: p.project.name, code: p.project.code, stage: p.project.stage })),
    allProjects: app.projects,
    activeId: app.activeId,
    switchProject: (id) => {
      const a = appRef.current
      if (a.projects.some((p) => p.project.id === id)) apply({ ...a, activeId: id }, false) // view change, not undoable
    },
    createProject: (name, code, opts) => {
      const id = uid('proj')
      const p = blankProject(id, name || 'New review', code || (name || 'NEW').slice(0, 10).toUpperCase().replace(/\s+/g, '-'), opts)
      const a = appRef.current
      apply({ ...a, projects: [...a.projects, p], activeId: id })
      return id
    },
    updateProject: (patch) => setState((s) => ({ ...s, project: { ...s.project, ...patch } })),
    updateResearch: (projectId, updater, description) => {
      const a = appRef.current
      const current = a.projects.find((p) => p.project.id === projectId)
      if (!current) throw new Error('This project is no longer available.')
      const updated = updater(current)
      if (updated === current) return
      const next = { ...updated, activity: act(current, 'evidence', description) }
      apply({ ...a, projects: a.projects.map((p) => p.project.id === projectId ? next : p) }, true, true)
    },
    // Bind asynchronous generation to its originating project, even after a switch.
    saveTheory: (projectId, theory) => {
      const a = appRef.current
      if (!a.projects.some((p) => p.project.id === projectId)) return
      apply({ ...a, projects: a.projects.map((p) => p.project.id === projectId
        ? { ...p, theory, theoryUpdates: {}, evidence: p.evidence ? { ...p.evidence, assessments: [] } : undefined, theoryRead: [], activity: act(p, 'theory', 'Generated project theory') }
        : p) })
    },
    setTheoryRead: (projectId, theoryRead) => {
      const a = appRef.current
      if (!a.projects.some((p) => p.project.id === projectId)) return
      apply({ ...a, projects: a.projects.map((p) => p.project.id === projectId ? { ...p, theoryRead } : p) })
    },
    patchProjectById: (id, patch) => {
      const a = appRef.current
      apply({ ...a, projects: a.projects.map((p) => (p.project.id === id ? { ...p, project: { ...p.project, ...patch } } : p)) })
    },
    deleteProject: (id) => {
      const a = appRef.current
      if (a.projects.length <= 1) return // never delete the last project
      const projects = a.projects.filter((p) => p.project.id !== id)
      apply({ projects, activeId: a.activeId === id ? projects[0].project.id : a.activeId })
    },
    setStage: (stage) => setState((s) => ({ ...s, project: { ...s.project, stage }, activity: act(s, 'stage', `Stage → ${stage}`) })),
    exportActive: () => JSON.stringify(state, null, 2),
    importProject: (json) => {
      try {
        const p = normalize(JSON.parse(json) as ProjectState)
        if (!p.project?.id) return false
        const id = p.project.id + '_' + uid('imp').slice(5)
        const imported = { ...p, project: { ...p.project, id, name: p.project.name + ' (imported)' } }
        const a = appRef.current
        apply({ ...a, projects: [...a.projects, imported], activeId: id })
        return true
      } catch {
        return false
      }
    },
    reset: () => apply({ projects: [seed], activeId: seed.project.id }),
    undo,
    redo,
    canUndo: past.current.length > 0,
    canRedo: future.current.length > 0,
  }

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

// Place a new node near a preferred point without overlapping existing nodes.
function findFreeSpot(nodes: GraphNode[], px: number, py: number): { x: number; y: number } {
  const MIN = 92
  const pts = nodes.map((n) => ({ x: n.x ?? 700, y: n.y ?? 450 }))
  const clampX = (v: number) => Math.max(60, Math.min(1340, v))
  const clampY = (v: number) => Math.max(60, Math.min(840, v))
  const free = (x: number, y: number) => pts.every((p) => Math.hypot(p.x - x, p.y - y) >= MIN)
  let x = clampX(px)
  let y = clampY(py)
  if (free(x, y)) return { x: Math.round(x), y: Math.round(y) }
  for (let r = MIN; r <= 1400; r += MIN * 0.75) {
    for (let a = 0; a < 360; a += 24) {
      const rad = (a * Math.PI) / 180
      x = clampX(px + r * Math.cos(rad))
      y = clampY(py + r * Math.sin(rad))
      if (free(x, y)) return { x: Math.round(x), y: Math.round(y) }
    }
  }
  return { x: Math.round(clampX(px)), y: Math.round(clampY(py)) }
}

export function useStore(): StoreCtx {
  const c = useContext(Ctx)
  if (!c) throw new Error('useStore must be used within StoreProvider')
  return c
}
