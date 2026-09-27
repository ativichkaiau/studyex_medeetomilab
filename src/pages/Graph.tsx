import { useMemo, useRef, useState, type CSSProperties } from 'react'
import { useStore } from '../lib/store'
import { type GraphHandle } from '../components/GraphView'
import GraphStage from '../components/GraphStage'
import { Kicker, Rule } from '../components/ui'
import { Modal, Field } from '../components/Modal'
import { NODE_COLORS, nodeColor } from '../lib/palette'
import type { GraphNode, NodeType, EdgeRel, Evidence } from '../types'
import { analysisIncluded } from '../lib/cohorts'

const NODE_TYPES = Object.keys(NODE_COLORS) as NodeType[]
const RELS: EdgeRel[] = ['encodes', 'regulates', 'loops_to', 'deposited_on', 'represses', 'reduces', 'measured_by', 'performed_in', 'modulates', 'unmasks', 'associated_with', 'predicts', 'tested_by', 'supports', 'refutes', 'visualizes', 'argues']
const EVIDENCES: Evidence[] = ['none', 'predicted', 'correlational', 'causal', 'established']

export default function Graph() {
  const { state, addNode, addEdge, removeNode, removeEdge, updateNode, importStudiesToGraph } = useStore()
  const graphRef = useRef<GraphHandle>(null)
  const [sel, setSel] = useState<GraphNode | null>(null)
  const [labels, setLabels] = useState(true)
  const [modal, setModal] = useState<null | 'node' | 'edge'>(null)
  const [q, setQ] = useState('')
  const [hidden, setHidden] = useState<Set<NodeType>>(new Set())
  const [note, setNote] = useState('')

  const inclCount = state.review.studies.filter(analysisIncluded).length
  const matchN = useMemo(() => {
    const t = q.trim().toLowerCase()
    if (!t) return 0
    return state.nodes.filter((n) => !hidden.has(n.type) && `${n.label} ${n.sublabel ?? ''} ${n.type}`.toLowerCase().includes(t)).length
  }, [q, hidden, state.nodes])

  const toggleType = (t: NodeType) =>
    setHidden((prev) => {
      const next = new Set(prev)
      next.has(t) ? next.delete(t) : next.add(t)
      return next
    })
  const doImport = () => {
    const n = importStudiesToGraph()
    setNote(n > 0 ? `Added ${n} study node${n === 1 ? '' : 's'} linked to the outcome.` : 'All included studies are already on the graph.')
    if (n > 0) requestAnimationFrame(() => graphRef.current?.fit())
  }

  const [nodeDraft, setNodeDraft] = useState<{ type: NodeType; label: string; sublabel: string }>({ type: 'EpigeneticMark', label: '', sublabel: '' })
  const [edgeDraft, setEdgeDraft] = useState<{ src: string; dst: string; rel: EdgeRel; evidence: Evidence; strength: string }>({ src: '', dst: '', rel: 'regulates', evidence: 'predicted', strength: '0.4' })

  const usedTypes = useMemo(() => {
    const s = new Set<NodeType>(state.nodes.map((n) => n.type))
    return NODE_TYPES.filter((t) => s.has(t))
  }, [state.nodes])

  const label = (id: string) => state.nodes.find((n) => n.id === id)?.label ?? id

  function saveNode() {
    if (!nodeDraft.label.trim()) return
    const id = addNode({ type: nodeDraft.type, label: nodeDraft.label.trim(), sublabel: nodeDraft.sublabel.trim() || undefined })
    setModal(null)
    setNodeDraft({ type: 'EpigeneticMark', label: '', sublabel: '' })
    const created = { id, type: nodeDraft.type, label: nodeDraft.label.trim() }
    setSel(created as GraphNode)
  }

  function saveEdge() {
    if (!edgeDraft.src || !edgeDraft.dst || edgeDraft.src === edgeDraft.dst) return
    addEdge({ src: edgeDraft.src, dst: edgeDraft.dst, rel: edgeDraft.rel, evidence: edgeDraft.evidence, strength: Math.max(0, Math.min(1, +edgeDraft.strength || 0.3)) })
    setModal(null)
  }

  const connected = sel ? state.edges.filter((e) => e.src === sel.id || e.dst === sel.id) : []

  return (
    <>
      <div className="page-head">
        <Rule />
        <Kicker>RESEARCH KNOWLEDGE GRAPH · GROW IT FROM HERE</Kicker>
        <h1>Knowledge Graph</h1>
        <p>Genes, marks, regions, cell types, assays, phenotypes, drugs, papers and hypotheses on one typed graph. Drag to rearrange, click for detail, add nodes and edges without touching code.</p>
        <div className="head-actions">
          <button className="btn primary sm" onClick={() => setModal('node')}>＋ Node</button>
          <button className="btn ghost sm" onClick={() => setModal('edge')}>＋ Edge</button>
        </div>
      </div>

      <div className="graph-controls">
        <div className="gc-search">
          <input className="input" placeholder="Search nodes…" value={q} onChange={(e) => setQ(e.target.value)} />
          {q && <span className="small mono">{matchN} match{matchN === 1 ? '' : 'es'}</span>}
        </div>
        {usedTypes.length > 0 && (
          <div className="gc-filters">
            {usedTypes.map((t) => (
              <button
                key={t}
                className={`type-chip${hidden.has(t) ? ' off' : ''}`}
                style={{ ['--tc' as string]: NODE_COLORS[t] } as CSSProperties}
                onClick={() => toggleType(t)}
                title={hidden.has(t) ? `Show ${t}` : `Hide ${t}`}
              >
                <i />{t}
              </button>
            ))}
          </div>
        )}
        <div className="gc-actions">
          <span className="gc-group">
            <button className="btn ghost sm" onClick={() => graphRef.current?.forceLayout()} title="Force-directed layout">Force</button>
            <button className="btn ghost sm" onClick={() => graphRef.current?.clusterLayout()} title="Cluster by node type">Cluster</button>
            <button className="btn ghost sm" onClick={() => graphRef.current?.tidy()} title="Spread overlapping nodes">Tidy</button>
          </span>
          <span className="gc-group">
            <button className="btn ghost sm" onClick={() => graphRef.current?.exportPng()} title="Export PNG">⤓ PNG</button>
            <button className="btn ghost sm" onClick={() => graphRef.current?.exportSvg()} title="Export SVG">⤓ SVG</button>
          </span>
          <button className="btn primary sm" onClick={doImport} disabled={inclCount === 0} title="Add included review studies as linked nodes">⇪ Import studies ({inclCount})</button>
        </div>
      </div>
      {note && <p className="small" style={{ margin: '-4px 0 10px', color: 'var(--accent)' }}>{note}</p>}

      <div className="graph-wrap">
        <div>
          <GraphStage ref={graphRef} nodes={state.nodes} edges={state.edges} selectedId={sel?.id} onSelect={setSel} onNodeMove={(id, x, y) => updateNode(id, { x, y })} showLabels={labels} search={q} hiddenTypes={hidden} />
          <div className="card" style={{ marginTop: 12 }}>
            <div className="flex" style={{ justifyContent: 'space-between', marginBottom: 10 }}>
              <div className="card-h" style={{ margin: 0 }}>NODE TYPES · {state.nodes.length} nodes · {state.edges.length} edges</div>
              <label className="flex small" style={{ cursor: 'pointer', gap: 6 }}>
                <input type="checkbox" checked={labels} onChange={(e) => setLabels(e.target.checked)} /> edge labels
              </label>
            </div>
            <div className="legend-row">
              {usedTypes.map((t) => <span className="lg" key={t}><i style={{ background: NODE_COLORS[t] }} />{t}</span>)}
            </div>
          </div>
        </div>

        <div className="card detail">
          <div className="card-h">SELECTED NODE</div>
          {sel ? (
            <>
              <dl>
                <dt>Label</dt>
                <dd style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ width: 10, height: 10, borderRadius: '50%', background: nodeColor(sel.type) }} />
                  {sel.label} {sel.sublabel && <span className="small">· {sel.sublabel}</span>}
                </dd>
                <dt>Type</dt><dd>{sel.type}</dd>
                <dt>Connected edges</dt>
                <dd>
                  {connected.length === 0 && <span className="small empty">none</span>}
                  {connected.map((e) => (
                    <div key={e.id} className="flex small" style={{ marginTop: 5, gap: 6 }}>
                      <span style={{ flex: 1 }}>{label(e.src)} <span style={{ color: 'var(--red)' }}>{e.rel}</span> {label(e.dst)}</span>
                      <button className="icon-btn danger" onClick={() => removeEdge(e.id)}>✕</button>
                    </div>
                  ))}
                </dd>
              </dl>
              <div className="divider" />
              <button className="icon-btn danger" onClick={() => { removeNode(sel.id); setSel(null) }}>Delete node &amp; its edges</button>
            </>
          ) : (
            <p className="empty">Click a node to inspect it, or add one above.</p>
          )}
        </div>
      </div>

      {modal === 'node' && (
        <Modal title="Add node" onClose={() => setModal(null)}>
          <Field label="Type">
            <select className="select" value={nodeDraft.type} onChange={(e) => setNodeDraft({ ...nodeDraft, type: e.target.value as NodeType })}>
              {NODE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </Field>
          <Field label="Label"><input className="input" value={nodeDraft.label} onChange={(e) => setNodeDraft({ ...nodeDraft, label: e.target.value })} placeholder="e.g. GATA4" autoFocus /></Field>
          <Field label="Sublabel"><input className="input" value={nodeDraft.sublabel} onChange={(e) => setNodeDraft({ ...nodeDraft, sublabel: e.target.value })} placeholder="e.g. TF" /></Field>
          <div className="form-actions">
            <button className="btn ghost" onClick={() => setModal(null)}>Cancel</button>
            <button className="btn primary" onClick={saveNode}>Add node</button>
          </div>
        </Modal>
      )}

      {modal === 'edge' && (
        <Modal title="Add edge" onClose={() => setModal(null)} wide>
          <div className="form-row">
            <Field label="From">
              <select className="select" value={edgeDraft.src} onChange={(e) => setEdgeDraft({ ...edgeDraft, src: e.target.value })}>
                <option value="">select…</option>
                {state.nodes.map((n) => <option key={n.id} value={n.id}>{n.label}{n.sublabel ? ` (${n.sublabel})` : ''}</option>)}
              </select>
            </Field>
            <Field label="To">
              <select className="select" value={edgeDraft.dst} onChange={(e) => setEdgeDraft({ ...edgeDraft, dst: e.target.value })}>
                <option value="">select…</option>
                {state.nodes.map((n) => <option key={n.id} value={n.id}>{n.label}{n.sublabel ? ` (${n.sublabel})` : ''}</option>)}
              </select>
            </Field>
          </div>
          <div className="form-row three">
            <Field label="Relation">
              <select className="select" value={edgeDraft.rel} onChange={(e) => setEdgeDraft({ ...edgeDraft, rel: e.target.value as EdgeRel })}>
                {RELS.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </Field>
            <Field label="Evidence">
              <select className="select" value={edgeDraft.evidence} onChange={(e) => setEdgeDraft({ ...edgeDraft, evidence: e.target.value as Evidence })}>
                {EVIDENCES.map((ev) => <option key={ev} value={ev}>{ev}</option>)}
              </select>
            </Field>
            <Field label="Strength (0–1)"><input className="input" type="number" step="0.1" min="0" max="1" value={edgeDraft.strength} onChange={(e) => setEdgeDraft({ ...edgeDraft, strength: e.target.value })} /></Field>
          </div>
          <div className="form-actions">
            <button className="btn ghost" onClick={() => setModal(null)}>Cancel</button>
            <button className="btn primary" onClick={saveEdge} disabled={!edgeDraft.src || !edgeDraft.dst || edgeDraft.src === edgeDraft.dst}>Add edge</button>
          </div>
        </Modal>
      )}
    </>
  )
}
