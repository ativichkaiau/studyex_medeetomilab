import { forwardRef, useCallback, useEffect, useMemo, useRef, useState, type ComponentProps } from 'react'
import GraphView, { type GraphHandle } from './GraphView'
import { useDim } from '../lib/dimension'
import { nodeColor, EVIDENCE_STYLE } from '../lib/palette'
import type { GraphNode, NodeType, Evidence } from '../types'
import type { LayersApi, LayerModel } from '../gl/layers'

type Props = ComponentProps<typeof GraphView>

/** the planes, top to bottom: what you know about the mechanism, then the mechanism itself */
const LAYERS: { name: string; types: NodeType[] }[] = [
  { name: 'Evidence', types: ['Paper', 'Hypothesis', 'Assay', 'Figure', 'ManuscriptSection'] },
  { name: 'Genome', types: ['Gene', 'Variant'] },
  { name: 'Regulation', types: ['RegulatoryRegion', 'EpigeneticMark'] },
  { name: 'Cell & drug', types: ['CellType', 'Drug'] },
  { name: 'Phenotype', types: ['ClinicalPhenotype'] },
]
const layerOf = (t: NodeType) => Math.max(0, LAYERS.findIndex((l) => l.types.includes(t)))
const EDGE_ALPHA: Record<Evidence, number> = { none: 0.4, predicted: 0.6, correlational: 0.78, causal: 0.9, established: 0.95 }

/**
 * The graph, with a third dimension on request. In 3D a Flat ⇄ Layers switch
 * sits on the canvas: Layers peels the same picture apart, each kind of node
 * rising to its own plane (gl/layers.ts), and folds it back before handing
 * over to the flat graph — which stays mounted underneath throughout, so its
 * layout, zoom and editing are exactly where you left them.
 */
const GraphStage = forwardRef<GraphHandle, Props>(function GraphStage(props, ref) {
  const dim = useDim()
  const inner = useRef<GraphHandle | null>(null)
  const [mode, setMode] = useState<'flat' | 'layers' | 'folding'>('flat')
  const setRef = useCallback((h: GraphHandle | null) => {
    inner.current = h
    if (typeof ref === 'function') ref(h)
    else if (ref) ref.current = h
  }, [ref])
  // leaving 3D drops straight back to the flat graph
  useEffect(() => {
    if (dim !== '3d') setMode('flat')
  }, [dim])

  const layered = dim === '3d' && mode !== 'flat'
  return (
    <div className={`graph-stage${layered ? ' is-layered' : ''}`}>
      <GraphView ref={setRef} {...props} />
      {layered && (
        <GraphLayers
          {...props}
          positions={inner.current?.positions() ?? {}}
          folding={mode === 'folding'}
          onFolded={() => setMode('flat')}
        />
      )}
      {dim === '3d' && (
        <div className="seg layers-switch" role="group" aria-label="Graph view">
          <button className={`seg-b${mode === 'flat' ? ' on' : ''}`} aria-pressed={mode === 'flat'} onClick={() => mode === 'layers' && setMode('folding')}>Flat</button>
          <button className={`seg-b${mode !== 'flat' ? ' on' : ''}`} aria-pressed={mode !== 'flat'} onClick={() => setMode('layers')}>Layers</button>
        </div>
      )}
    </div>
  )
})
export default GraphStage

function GraphLayers({ nodes, edges, selectedId, onSelect, search = '', hiddenTypes, highlightNodes, highlightEdges, showLabels = true, positions, folding, onFolded }: Props & {
  positions: Record<string, { x: number; y: number }>
  folding: boolean
  onFolded: () => void
}) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const overlay = useRef<HTMLDivElement>(null)
  const api = useRef<LayersApi | null>(null)
  const night = document.documentElement.dataset.theme === 'night'

  const visible = useMemo(() => nodes.filter((n) => !hiddenTypes?.has(n.type)), [nodes, hiddenTypes])
  const model = useMemo<LayerModel>(() => {
    const at = (n: GraphNode) => positions[n.id] ?? { x: n.x ?? 700, y: n.y ?? 450 }
    const xs = visible.map((n) => at(n).x)
    const ys = visible.map((n) => at(n).y)
    const cx = xs.length ? (Math.min(...xs) + Math.max(...xs)) / 2 : 0
    const cy = ys.length ? (Math.min(...ys) + Math.max(...ys)) / 2 : 0
    const hx = xs.length ? Math.max(40, (Math.max(...xs) - Math.min(...xs)) / 2) : 1
    const hy = ys.length ? Math.max(40, (Math.max(...ys) - Math.min(...ys)) / 2) : 0.6
    const scale = Math.max(hx, hy)
    const q = search.trim().toLowerCase()
    const lit = highlightNodes && highlightNodes.size > 0 ? highlightNodes : q ? new Set(visible.filter((n) => `${n.label} ${n.sublabel ?? ''} ${n.type}`.toLowerCase().includes(q)).map((n) => n.id)) : null
    const index = new Map(visible.map((n, i) => [n.id, i]))
    const hlEdges = highlightEdges && highlightEdges.size > 0 ? highlightEdges : null
    return {
      layers: LAYERS.map((l) => l.name),
      w: hx / scale + 0.14,
      d: hy / scale + 0.14,
      nodes: visible.map((n) => ({
        id: n.id,
        x: (at(n).x - cx) / scale,
        z: (at(n).y - cy) / scale,
        layer: layerOf(n.type),
        color: nodeColor(n.type),
        label: n.label,
        tone: n.id === selectedId ? 'selected' : lit ? (lit.has(n.id) ? 'lit' : 'dim') : 'normal',
      })),
      edges: edges.flatMap((e) => {
        const a = index.get(e.src)
        const b = index.get(e.dst)
        if (a === undefined || b === undefined) return []
        const ev = e.evidence ?? 'predicted'
        const faded = hlEdges ? !hlEdges.has(e.id) : false
        const color = ev === 'established' && night ? '#7c9bff' : EVIDENCE_STYLE[ev].color
        return [{ a, b, color, alpha: faded ? 0.1 : EDGE_ALPHA[ev], width: 1 + (e.strength ?? 0.3) * 3.2 + (hlEdges && !faded ? 1 : 0) }]
      }),
    }
  }, [visible, edges, positions, selectedId, search, highlightNodes, highlightEdges, night])

  const pick = useRef(onSelect)
  pick.current = onSelect
  const folded = useRef(onFolded)
  folded.current = onFolded
  const latest = useRef(model)
  latest.current = model

  useEffect(() => {
    let alive = true
    import('../gl/layers').then(({ mountLayers }) => {
      if (!alive || !canvas.current || !overlay.current) return
      api.current = mountLayers(canvas.current, overlay.current, (id) => pick.current?.(id ? nodes.find((n) => n.id === id) ?? null : null))
      api.current.update(latest.current)
      api.current.peel(1)
    })
    return () => {
      alive = false
      api.current?.stop()
      api.current = null
    }
    // mounts once per peel; the model is pushed separately below
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  useEffect(() => {
    api.current?.update(model)
  }, [model])
  useEffect(() => {
    if (!folding) return
    if (api.current) api.current.peel(0, () => folded.current())
    else folded.current()
  }, [folding])

  const counts = LAYERS.map((l) => model.nodes.filter((n) => LAYERS[n.layer] === l).length)
  const summary = `${model.nodes.length} node${model.nodes.length === 1 ? '' : 's'} on layers — ${LAYERS.map((l, i) => `${l.name} ${counts[i]}`).join(', ')}. Drag or use the arrow keys to turn; choose Flat to edit.`
  const labelled = showLabels && model.nodes.length <= 60
  return (
    <div className="graph-layers">
      <canvas ref={canvas} tabIndex={0} role="img" aria-label={summary} />
      <div ref={overlay} className="gl-labels" aria-hidden="true">
        {LAYERS.map((l, i) => <span key={l.name} className="gl-layer" data-layer={i}>{l.name} <b>{counts[i]}</b></span>)}
        {model.nodes.filter((n) => labelled || n.tone === 'lit' || n.tone === 'selected').map((n) => (
          <span key={n.id} className={`gl-node ${n.tone}`} data-node={n.id}>{n.label}</span>
        ))}
      </div>
      {model.nodes.length === 0 && <p className="gl-empty">No nodes yet. Add some, and each takes its place on these layers.</p>}
    </div>
  )
}
