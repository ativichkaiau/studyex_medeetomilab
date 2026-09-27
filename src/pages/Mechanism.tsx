import { useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { useStore } from '../lib/store'
import { type GraphHandle } from '../components/GraphView'
import GraphStage from '../components/GraphStage'
import { Kicker, Rule } from '../components/ui'
import { EVIDENCE_STYLE, nodeColor } from '../lib/palette'
import { suggestAssay } from '../lib/assayPlanner'
import type { GraphNode, Evidence, EdgeRel, NodeType } from '../types'

const MECH_RELS = new Set(['represses', 'reduces', 'associated_with', 'regulates', 'loops_to', 'deposited_on', 'modulates', 'unmasks'])
const EV_ORDER: Record<Evidence, number> = { none: 0, predicted: 1, correlational: 2, causal: 3, established: 4 }

// only auto-arrange the cascade the first time a project's map is opened this session
const autoLaidOut = new Set<string>()

export default function Mechanism() {
  const { state, updateNode, addAssay } = useStore()
  const [sel, setSel] = useState<GraphNode | null>(null)
  const [planned, setPlanned] = useState<Set<string>>(new Set())
  const graphRef = useRef<GraphHandle>(null)

  const edges = useMemo(() => state.edges.filter((e) => MECH_RELS.has(e.rel)), [state.edges])
  const nodeIds = useMemo(() => new Set(edges.flatMap((e) => [e.src, e.dst])), [edges])
  const nodes = useMemo(() => state.nodes.filter((n) => nodeIds.has(n.id)), [state.nodes, nodeIds])
  const typeOf = (id: string) => state.nodes.find((n) => n.id === id)?.type as NodeType | undefined
  const label = (id: string) => state.nodes.find((n) => n.id === id)?.label ?? id

  // soft + unbridged edges — the weak links worth an experiment
  const weakEdges = useMemo(
    () =>
      edges
        .filter((e) => (e.evidence === 'none' || e.evidence === 'predicted') && (!e.testedBy || e.testedBy.length === 0))
        .sort((a, b) => EV_ORDER[a.evidence ?? 'predicted'] - EV_ORDER[b.evidence ?? 'predicted'] || (a.strength ?? 0) - (b.strength ?? 0)),
    [edges],
  )

  // upstream path to the selected node (backward BFS over the mechanism edges)
  const highlight = useMemo(() => {
    if (!sel) return { nodes: undefined as Set<string> | undefined, edges: undefined as Set<string> | undefined }
    const hn = new Set<string>([sel.id])
    const he = new Set<string>()
    const stack = [sel.id]
    while (stack.length) {
      const cur = stack.pop()!
      for (const e of edges) {
        if (e.dst === cur) {
          he.add(e.id)
          if (!hn.has(e.src)) {
            hn.add(e.src)
            stack.push(e.src)
          }
        }
      }
    }
    return { nodes: hn, edges: he }
  }, [sel, edges])

  // first open → arrange as a top-down cascade
  useEffect(() => {
    if (!nodes.length || autoLaidOut.has(state.project.id)) return
    autoLaidOut.add(state.project.id)
    const t = setTimeout(() => graphRef.current?.layeredLayout(), 80)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.project.id, nodes.length])

  function planAssay(rel: EdgeRel, src: string, dst: string, edgeId: string) {
    const s = suggestAssay(rel, typeOf(src), typeOf(dst))
    addAssay({ method: s.method, measures: s.measures, cellType: s.cellType, status: 'design', phase: 1, effort: 'high', controls: '' })
    setPlanned((p) => new Set(p).add(edgeId))
  }

  return (
    <>
      <div className="page-head">
        <Rule />
        <Kicker>MECHANISM MAP · MOLECULE → PHENOTYPE</Kicker>
        <h1>Mechanism Map</h1>
        <p>The causal chain from molecule to phenotype as a top-down cascade, each edge coloured by how well-supported it is. Click a node to light up its full upstream path; bridge a weak link by planning the assay that would prove it.</p>
        <div className="head-actions">
          <button className="btn ghost sm" onClick={() => graphRef.current?.layeredLayout()} title="Top-down layered layout">⤓ Layered</button>
          <button className="btn ghost sm" onClick={() => graphRef.current?.tidy()}>Tidy</button>
          <button className="btn ghost sm" onClick={() => graphRef.current?.fit()}>Fit</button>
          {sel && <button className="btn ghost sm" onClick={() => setSel(null)}>Clear highlight</button>}
        </div>
      </div>

      <div className="graph-wrap">
        <div>
          <GraphStage ref={graphRef} nodes={nodes} edges={edges} selectedId={sel?.id} onSelect={setSel} onNodeMove={(id, x, y) => updateNode(id, { x, y })} highlightNodes={highlight.nodes} highlightEdges={highlight.edges} />
          <div className="card" style={{ marginTop: 12 }}>
            <div className="legend-row">
              {(Object.keys(EVIDENCE_STYLE) as Evidence[]).map((k) => (
                <span className="lg" key={k}>
                  <i style={{ background: EVIDENCE_STYLE[k].color }} />
                  {EVIDENCE_STYLE[k].label}
                </span>
              ))}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="card detail">
            <div className="card-h">{sel ? 'UPSTREAM PATH' : 'SELECTED NODE'}</div>
            {sel ? (
              <dl>
                <dt>Node</dt>
                <dd style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ width: 10, height: 10, borderRadius: '50%', background: nodeColor(sel.type) }} />
                  {sel.label} {sel.sublabel && <span className="small">· {sel.sublabel}</span>}
                </dd>
                <dt>Upstream nodes</dt>
                <dd>{(highlight.nodes?.size ?? 1) - 1} feeding into it</dd>
                <dt>Path edges</dt>
                <dd>
                  {[...(highlight.edges ?? [])].map((eid) => {
                    const e = edges.find((x) => x.id === eid)!
                    return (
                      <div key={eid} className="small" style={{ marginTop: 4 }}>
                        {label(e.src)} <span style={{ color: 'var(--red)' }}>{e.rel}</span> {label(e.dst)} · {e.evidence}
                      </div>
                    )
                  })}
                  {highlight.edges?.size === 0 && <span className="small empty">no upstream edges — this is a source node</span>}
                </dd>
              </dl>
            ) : (
              <p className="empty">Click a node to trace and light up everything upstream of it.</p>
            )}
          </div>

          <div className="card rail" style={{ ['--rail' as string]: 'var(--red)' } as CSSProperties}>
            <div className="card-h"><span className="sq" style={{ background: 'var(--red)' }} />BRIDGE THE WEAK LINKS</div>
            {weakEdges.length === 0 ? (
              <p className="empty">No unproven links — every mechanistic edge has support or an assay.</p>
            ) : (
              weakEdges.slice(0, 5).map((e) => {
                const s = suggestAssay(e.rel, typeOf(e.src), typeOf(e.dst))
                return (
                  <div key={e.id} className="weak-link">
                    <p style={{ fontSize: 13, fontWeight: 700, margin: 0 }}>
                      {label(e.src)} <span style={{ color: 'var(--red)' }}>{e.rel}</span> {label(e.dst)}
                    </p>
                    <p className="small" style={{ margin: '3px 0 7px' }}><b>{e.evidence}</b> · plan <b>{s.method}</b> ({s.cellType}) — {s.why}.</p>
                    <button className="btn ghost sm" onClick={() => planAssay(e.rel, e.src, e.dst, e.id)} disabled={planned.has(e.id)}>{planned.has(e.id) ? 'Planned ✓' : `+ Plan ${s.method}`}</button>
                  </div>
                )
              })
            )}
          </div>
        </div>
      </div>
    </>
  )
}
