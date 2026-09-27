import { useMemo, useRef, useState, useEffect, forwardRef, useImperativeHandle } from 'react'
import type { GraphNode, GraphEdge, NodeType } from '../types'
import { nodeColor, EVIDENCE_STYLE } from '../lib/palette'

// Large logical canvas; pan/zoom give effectively unbounded working space.
const VBW = 1400
const VBH = 900
const R = 34

export interface GraphHandle {
  forceLayout: () => void
  clusterLayout: () => void
  layeredLayout: () => void
  tidy: () => void
  fit: () => void
  exportSvg: () => void
  exportPng: () => void
  /** where every node sits right now (the layered 3D view starts from here) */
  positions: () => Record<string, { x: number; y: number }>
}

interface Props {
  nodes: GraphNode[]
  edges: GraphEdge[]
  selectedId?: string | null
  onSelect?: (n: GraphNode | null) => void
  onNodeMove?: (id: string, x: number, y: number) => void
  showLabels?: boolean
  search?: string
  hiddenTypes?: Set<NodeType>
  highlightNodes?: Set<string>
  highlightEdges?: Set<string>
}

type P = Record<string, { x: number; y: number }>
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))
const MIN_SEP = 82 // node non-overlap distance

// push apart any pair closer than MIN_SEP (in place)
function relax(P: P, ids: string[]) {
  for (let iter = 0; iter < 120; iter++) {
    let moved = false
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const a = P[ids[i]]
        const b = P[ids[j]]
        const dx = b.x - a.x
        const dy = b.y - a.y
        const d = Math.hypot(dx, dy) || 0.01
        if (d < MIN_SEP) {
          const push = (MIN_SEP - d) / 2 + 0.5
          const ux = dx / d
          const uy = dy / d
          a.x -= ux * push
          a.y -= uy * push
          b.x += ux * push
          b.y += uy * push
          moved = true
        }
      }
    }
    if (!moved) break
  }
}

const GraphView = forwardRef<GraphHandle, Props>(function GraphView(
  { nodes, edges, selectedId, onSelect, onNodeMove, showLabels = true, search = '', hiddenTypes, highlightNodes, highlightEdges },
  ref,
) {
  const hlActive = !!highlightNodes && highlightNodes.size > 0
  const svgRef = useRef<SVGSVGElement | null>(null)
  const worldRef = useRef<SVGGElement | null>(null)
  const [pos, setPos] = useState<P>(() =>
    Object.fromEntries(nodes.map((n) => [n.id, { x: n.x ?? VBW / 2, y: n.y ?? VBH / 2 }])),
  )
  const [view, setView] = useState({ k: 1, tx: 0, ty: 0 })
  const [drag, setDrag] = useState<string | null>(null)
  const [pan, setPan] = useState<{ x: number; y: number } | null>(null)
  const byId = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes])

  const visibleNodes = useMemo(() => nodes.filter((n) => !hiddenTypes?.has(n.type)), [nodes, hiddenTypes])
  const visIds = useMemo(() => new Set(visibleNodes.map((n) => n.id)), [visibleNodes])
  const visibleEdges = useMemo(() => edges.filter((e) => visIds.has(e.src) && visIds.has(e.dst)), [edges, visIds])

  const q = search.trim().toLowerCase()
  const matched = (n: GraphNode) => !q || `${n.label} ${n.sublabel ?? ''} ${n.type}`.toLowerCase().includes(q)

  const posOf = (id: string): { x: number; y: number } | null => {
    if (pos[id]) return pos[id]
    const n = byId.get(id)
    return n ? { x: n.x ?? VBW / 2, y: n.y ?? VBH / 2 } : null
  }

  const toSvg = (clientX: number, clientY: number) => {
    const svg = svgRef.current
    if (!svg) return { x: 0, y: 0 }
    const rect = svg.getBoundingClientRect()
    return { x: ((clientX - rect.left) / rect.width) * VBW, y: ((clientY - rect.top) / rect.height) * VBH }
  }
  const toWorld = (s: { x: number; y: number }) => ({ x: (s.x - view.tx) / view.k, y: (s.y - view.ty) / view.k })

  const zoomAround = (cx: number, cy: number, factor: number) => {
    setView((v) => {
      const k = clamp(v.k * factor, 0.3, 2.6)
      const wx = (cx - v.tx) / v.k
      const wy = (cy - v.ty) / v.k
      return { k, tx: cx - wx * k, ty: cy - wy * k }
    })
  }

  // wheel zoom (attached non-passively so we can preventDefault)
  useEffect(() => {
    const svg = svgRef.current
    if (!svg) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const s = toSvg(e.clientX, e.clientY)
      zoomAround(s.x, s.y, e.deltaY < 0 ? 1.12 : 0.89)
    }
    svg.addEventListener('wheel', onWheel, { passive: false })
    return () => svg.removeEventListener('wheel', onWheel)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view.k, view.tx, view.ty])

  const onMove = (e: React.PointerEvent) => {
    if (drag) {
      const w = toWorld(toSvg(e.clientX, e.clientY))
      setPos((p) => ({ ...p, [drag]: { x: clamp(w.x, -300, VBW + 300), y: clamp(w.y, -300, VBH + 300) } }))
    } else if (pan) {
      const s = toSvg(e.clientX, e.clientY)
      setView((v) => ({ ...v, tx: v.tx + (s.x - pan.x), ty: v.ty + (s.y - pan.y) }))
      setPan(s)
    }
  }
  const endPointer = () => {
    if (drag && onNodeMove) {
      const p = pos[drag] ?? posOf(drag)
      if (p) onNodeMove(drag, Math.round(p.x), Math.round(p.y))
    }
    setDrag(null)
    setPan(null)
  }

  // frame all visible nodes; optional override map (used right after a layout)
  const fit = (override?: P) => {
    const getP = (id: string) => override?.[id] ?? posOf(id)
    const src = visibleNodes.length ? visibleNodes : nodes
    if (!src.length) return
    const ps = src.map((n) => getP(n.id)!).filter(Boolean)
    const minX = Math.min(...ps.map((p) => p.x)) - R
    const maxX = Math.max(...ps.map((p) => p.x)) + R
    const minY = Math.min(...ps.map((p) => p.y)) - R
    const maxY = Math.max(...ps.map((p) => p.y)) + R
    const pad = 70
    const k = clamp(Math.min((VBW - 2 * pad) / (maxX - minX || 1), (VBH - 2 * pad) / (maxY - minY || 1)), 0.3, 2)
    setView({ k, tx: pad - minX * k + (VBW - 2 * pad - (maxX - minX) * k) / 2, ty: pad - minY * k + (VBH - 2 * pad - (maxY - minY) * k) / 2 })
  }

  // commit computed positions: update local state, persist, and reframe
  const commit = (next: P) => {
    setPos((prev) => ({ ...prev, ...next }))
    if (onNodeMove) for (const id in next) onNodeMove(id, Math.round(next[id].x), Math.round(next[id].y))
    fit(next)
  }

  // relax overlaps only
  const tidy = () => {
    const P0: P = Object.fromEntries(visibleNodes.map((n) => [n.id, { ...posOf(n.id)! }]))
    relax(P0, visibleNodes.map((n) => n.id))
    commit(P0)
  }

  // spring-embedder: edge attraction + node repulsion + mild center gravity, with cooling
  const forceLayout = () => {
    const V = visibleNodes
    if (!V.length) return
    const ids = V.map((n) => n.id)
    const Pf: P = Object.fromEntries(ids.map((id) => [id, { ...posOf(id)! }]))
    const E = visibleEdges
    const cx = VBW / 2
    const cy = VBH / 2
    const K_REP = 46000
    const K_SPRING = 0.02
    const REST = 155
    const ITERS = 320
    for (let it = 0; it < ITERS; it++) {
      const disp: P = Object.fromEntries(ids.map((id) => [id, { x: 0, y: 0 }]))
      for (let i = 0; i < ids.length; i++) {
        for (let j = i + 1; j < ids.length; j++) {
          const a = Pf[ids[i]]
          const b = Pf[ids[j]]
          let dx = a.x - b.x
          let dy = a.y - b.y
          let d2 = dx * dx + dy * dy || 0.01
          const d = Math.sqrt(d2)
          const f = K_REP / d2
          dx /= d
          dy /= d
          disp[ids[i]].x += dx * f
          disp[ids[i]].y += dy * f
          disp[ids[j]].x -= dx * f
          disp[ids[j]].y -= dy * f
        }
      }
      for (const e of E) {
        const a = Pf[e.src]
        const b = Pf[e.dst]
        if (!a || !b) continue
        let dx = b.x - a.x
        let dy = b.y - a.y
        const d = Math.hypot(dx, dy) || 0.01
        const f = K_SPRING * (d - REST)
        dx = (dx / d) * f
        dy = (dy / d) * f
        disp[e.src].x += dx
        disp[e.src].y += dy
        disp[e.dst].x -= dx
        disp[e.dst].y -= dy
      }
      const cool = 1 - it / ITERS
      for (const id of ids) {
        disp[id].x += (cx - Pf[id].x) * 0.009
        disp[id].y += (cy - Pf[id].y) * 0.009
        const dd = Math.hypot(disp[id].x, disp[id].y) || 0.01
        const step = Math.min(dd, 34 * cool + 2)
        Pf[id].x = clamp(Pf[id].x + (disp[id].x / dd) * step, 60, VBW - 60)
        Pf[id].y = clamp(Pf[id].y + (disp[id].y / dd) * step, 60, VBH - 60)
      }
    }
    relax(Pf, ids)
    commit(Pf)
  }

  // group nodes into per-type clusters arranged around a ring
  const clusterLayout = () => {
    const V = visibleNodes
    if (!V.length) return
    const types = [...new Set(V.map((n) => n.type))]
    const cx = VBW / 2
    const cy = VBH / 2
    const ring = Math.min(VBW, VBH) * (types.length > 1 ? 0.34 : 0)
    const Pc: P = {}
    types.forEach((t, ti) => {
      const ang = (ti / types.length) * Math.PI * 2 - Math.PI / 2
      const gx = cx + Math.cos(ang) * ring
      const gy = cy + Math.sin(ang) * ring
      const members = V.filter((n) => n.type === t)
      const rr = Math.max(0, members.length === 1 ? 0 : 30 + members.length * 9)
      members.forEach((n, mi) => {
        const a = (mi / members.length) * Math.PI * 2 - Math.PI / 2
        Pc[n.id] = { x: gx + Math.cos(a) * rr, y: gy + Math.sin(a) * rr }
      })
    })
    relax(Pc, V.map((n) => n.id))
    commit(Pc)
  }

  // top-down layered DAG (Sugiyama-ish): longest-path layering from the roots
  const layeredLayout = () => {
    const V = visibleNodes
    if (!V.length) return
    const ids = V.map((n) => n.id)
    const idset = new Set(ids)
    const E = visibleEdges.filter((e) => idset.has(e.src) && idset.has(e.dst))
    const layer = new Map(ids.map((id) => [id, 0]))
    for (let it = 0; it < ids.length; it++) {
      let changed = false
      for (const e of E) {
        const nl = (layer.get(e.src) ?? 0) + 1
        if (nl > (layer.get(e.dst) ?? 0)) {
          layer.set(e.dst, nl)
          changed = true
        }
      }
      if (!changed) break
    }
    const byLayer = new Map<number, string[]>()
    ids.forEach((id) => {
      const l = layer.get(id) ?? 0
      if (!byLayer.has(l)) byLayer.set(l, [])
      byLayer.get(l)!.push(id)
    })
    const layers = [...byLayer.keys()].sort((a, b) => a - b)
    const topPad = 90
    const vGap = Math.min(210, (VBH - 2 * topPad) / Math.max(1, layers.length - 1))
    const Pl: P = {}
    layers.forEach((l, li) => {
      const row = byLayer.get(l)!
      const hGap = Math.min(210, (VBW - 160) / Math.max(1, row.length))
      const startX = VBW / 2 - ((row.length - 1) * hGap) / 2
      const y = topPad + li * (Number.isFinite(vGap) ? vGap : 160)
      row.forEach((id, xi) => {
        Pl[id] = { x: startX + xi * hGap, y }
      })
    })
    relax(Pl, ids)
    commit(Pl)
  }

  // ---- export ----
  const buildSvgString = (): string => {
    const g = worldRef.current
    if (!g || !visibleNodes.length) return ''
    const clone = g.cloneNode(true) as SVGGElement
    clone.removeAttribute('transform')
    const ps = visibleNodes.map((n) => posOf(n.id)!).filter(Boolean)
    const pad = 64
    const minX = Math.min(...ps.map((p) => p.x)) - R - pad
    const minY = Math.min(...ps.map((p) => p.y)) - R - pad
    const w = Math.round(Math.max(...ps.map((p) => p.x)) + R + pad - minX)
    const h = Math.round(Math.max(...ps.map((p) => p.y)) + R + pad - minY)
    const defs = svgRef.current?.querySelector('defs')?.outerHTML ?? ''
    const style =
      '<style>text{font-family:ui-monospace,SFMono-Regular,Menlo,monospace}.graph-node text{font-weight:700;fill:#fff}.edge-label{fill:#8a94b8}</style>'
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${Math.round(minX)} ${Math.round(minY)} ${w} ${h}" width="${w}" height="${h}">${style}<rect x="${Math.round(minX)}" y="${Math.round(minY)}" width="${w}" height="${h}" fill="#ffffff"/>${defs}${clone.outerHTML}</svg>`
  }

  const triggerDownload = (url: string, name: string) => {
    const a = document.createElement('a')
    a.href = url
    a.download = name
    a.click()
  }

  const exportSvg = () => {
    const s = buildSvgString()
    if (!s) return
    const url = URL.createObjectURL(new Blob([s], { type: 'image/svg+xml' }))
    triggerDownload(url, 'knowledge-graph.svg')
    URL.revokeObjectURL(url)
  }

  const exportPng = () => {
    const s = buildSvgString()
    if (!s) return
    const img = new Image()
    img.onload = () => {
      const scale = 2
      const canvas = document.createElement('canvas')
      canvas.width = img.width * scale
      canvas.height = img.height * scale
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      ctx.scale(scale, scale)
      ctx.drawImage(img, 0, 0)
      canvas.toBlob((b) => {
        if (!b) return
        const url = URL.createObjectURL(b)
        triggerDownload(url, 'knowledge-graph.png')
        URL.revokeObjectURL(url)
      }, 'image/png')
    }
    img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(s)))
  }

  useImperativeHandle(ref, () => ({ forceLayout, clusterLayout, layeredLayout, tidy, fit: () => fit(), exportSvg, exportPng, positions: () => ({ ...pos }) }))

  // frame all nodes on first mount
  useEffect(() => {
    fit()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="graph-canvas">
      <div className="graph-toolbar">
        <button className="icon-btn" onClick={() => zoomAround(VBW / 2, VBH / 2, 0.83)} title="Zoom out">−</button>
        <span className="zoom-lvl mono">{Math.round(view.k * 100)}%</span>
        <button className="icon-btn" onClick={() => zoomAround(VBW / 2, VBH / 2, 1.2)} title="Zoom in">+</button>
        <button className="icon-btn" onClick={() => fit()} title="Fit all nodes">Fit</button>
        <button className="icon-btn" onClick={() => setView({ k: 1, tx: 0, ty: 0 })} title="Reset view">Reset</button>
      </div>
      <svg
        ref={svgRef}
        className="graph-svg"
        viewBox={`0 0 ${VBW} ${VBH}`}
        preserveAspectRatio="xMidYMid meet"
        onPointerMove={onMove}
        onPointerUp={endPointer}
        onPointerLeave={endPointer}
        style={{ cursor: pan ? 'grabbing' : 'grab' }}
      >
        <defs>
          {Object.entries(EVIDENCE_STYLE).map(([k, v]) => (
            <marker key={k} id={`arw-${k}`} markerWidth="9" markerHeight="9" refX="7.5" refY="3" orient="auto">
              <path d="M0,0 L7,3 L0,6 Z" fill={v.color} />
            </marker>
          ))}
        </defs>

        {/* background — pan surface + deselect */}
        <rect
          x={0}
          y={0}
          width={VBW}
          height={VBH}
          fill="transparent"
          onPointerDown={(e) => setPan(toSvg(e.clientX, e.clientY))}
          onClick={() => onSelect?.(null)}
        />

        <g ref={worldRef} transform={`translate(${view.tx} ${view.ty}) scale(${view.k})`}>
          {visibleEdges.map((e) => {
            const a = posOf(e.src)
            const b = posOf(e.dst)
            if (!a || !b) return null
            const dx = b.x - a.x
            const dy = b.y - a.y
            const len = Math.hypot(dx, dy) || 1
            const ux = dx / len
            const uy = dy / len
            const x1 = a.x + ux * R
            const y1 = a.y + uy * R
            const x2 = b.x - ux * (R + 4)
            const y2 = b.y - uy * (R + 4)
            const st = EVIDENCE_STYLE[e.evidence ?? 'predicted']
            const w = 1 + (e.strength ?? 0.3) * 3.2
            const faded = hlActive && !highlightEdges?.has(e.id)
            return (
              <g className="graph-edge" key={e.id} opacity={faded ? 0.1 : 1}>
                <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={st.color} strokeWidth={hlActive && !faded ? w + 1 : w} strokeDasharray={st.dash} markerEnd={`url(#arw-${e.evidence ?? 'predicted'})`} />
                {showLabels && (
                  <text className="edge-label" x={(x1 + x2) / 2} y={(y1 + y2) / 2 - 4} textAnchor="middle" fontSize="10.5">
                    {e.rel}
                  </text>
                )}
              </g>
            )
          })}

          {visibleNodes.map((n) => {
            const p = posOf(n.id)
            if (!p) return null
            const c = nodeColor(n.type)
            const selected = selectedId === n.id
            const dim = (q !== '' && !matched(n)) || (hlActive && !highlightNodes?.has(n.id))
            const onPath = hlActive && highlightNodes?.has(n.id)
            return (
              <g
                key={n.id}
                className={`graph-node${dim ? ' dim' : ''}`}
                onPointerDown={(e) => {
                  e.stopPropagation()
                  setDrag(n.id)
                }}
                onClick={(e) => {
                  e.stopPropagation()
                  onSelect?.(byId.get(n.id) ?? null)
                }}
              >
                {selected && <circle cx={p.x} cy={p.y} r={R + 6} fill="none" stroke={c} strokeWidth={2.5} opacity={0.5} />}
                {onPath && !selected && <circle cx={p.x} cy={p.y} r={R + 4} fill="none" stroke={c} strokeWidth={2} opacity={0.6} />}
                <circle cx={p.x} cy={p.y} r={R} fill={c} stroke="#fff" strokeWidth={2} />
                <text x={p.x} y={p.y - 2} textAnchor="middle" fontSize="12.5">{n.label}</text>
                {n.sublabel && (
                  <text x={p.x} y={p.y + 12} textAnchor="middle" fontSize="8.5" opacity={0.85}>{n.sublabel}</text>
                )}
              </g>
            )
          })}
        </g>
      </svg>
    </div>
  )
})

export default GraphView
