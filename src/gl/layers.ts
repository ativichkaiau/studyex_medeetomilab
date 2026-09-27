import { run, program, uniforms, perspective, multiply, translation, rotationX, rotationY, project, orbit, rgb, type Scene } from './core'

/**
 * The knowledge graph, peeled into layers. Flat, it is the same picture as
 * the 2D graph seen from straight above; peeled, each kind of node rises to
 * its own plane — the evidence you've gathered on top, then genome,
 * regulation, cells and drugs, and the clinical phenotype at the bottom — so
 * edges that cross levels of the mechanism become visible as edges that
 * cross planes. Positions on each plane are the graph's own layout.
 *
 * Edges are real screen-space lines (a quad per edge, widened in the vertex
 * shader), nodes are lit spheres drawn back to front, and heights are a
 * uniform, so peeling apart moves nothing on the CPU.
 */

export interface LayerNode {
  id: string
  /** on its plane, roughly -1..1 */
  x: number
  z: number
  layer: number
  color: string
  /** 'dim' when something else is highlighted */
  tone: 'normal' | 'dim' | 'lit' | 'selected'
  label: string
}
export interface LayerEdge {
  a: number
  b: number
  color: string
  alpha: number
  /** stroke width in CSS pixels, as the flat graph draws it */
  width: number
}
export interface LayerModel {
  nodes: LayerNode[]
  edges: LayerEdge[]
  layers: string[]
  /** half-size of every plane */
  w: number
  d: number
}

export interface LayersApi {
  update(m: LayerModel): void
  /** peel apart (1) or fold flat (0); done fires on arrival */
  peel(to: 0 | 1, done?: () => void): void
  stop(): void
}

const GAP = 0.6
const FOV = (36 * Math.PI) / 180
const PEEL_S = 1.15

const HEIGHT_GLSL = `
uniform float uT, uMid, uGap;
vec4 place(mat4 m, vec3 p) { return m * vec4(p.x, uT * (uMid - p.y) * uGap, p.z, 1.0); }`

const PLANE_VS = `
attribute vec3 aP;
uniform mat4 uMvp;
${HEIGHT_GLSL}
void main() { gl_Position = place(uMvp, aP); }`
const PLANE_FS = `
precision mediump float;
uniform vec4 uColor;
void main() { gl_FragColor = uColor; }`

const EDGE_VS = `
attribute vec3 aA, aB;
attribute vec2 aS; // x: 0 at A, 1 at B; y: signed half-width in pixels
attribute vec4 aColor;
uniform mat4 uMvp;
uniform vec2 uHalf; // half the drawing buffer, in pixels
${HEIGHT_GLSL}
varying vec4 vColor;
void main() {
  vec4 a = place(uMvp, aA);
  vec4 b = place(uMvp, aB);
  vec2 sa = a.xy / a.w * uHalf;
  vec2 sb = b.xy / b.w * uHalf;
  vec2 dir = normalize(sb - sa + vec2(0.0001, 0.0));
  vec4 p = mix(a, b, aS.x);
  p.xy += vec2(-dir.y, dir.x) * aS.y / uHalf * p.w;
  vColor = aColor;
  gl_Position = p;
}`
const EDGE_FS = `
precision mediump float;
varying vec4 vColor;
void main() { gl_FragColor = vColor; }`

const NODE_VS = `
attribute vec3 aP;
attribute vec4 aColor;
attribute float aSize;
uniform mat4 uMvp;
${HEIGHT_GLSL}
varying vec4 vColor;
void main() { vColor = aColor; gl_PointSize = aSize; gl_Position = place(uMvp, aP); }`
const NODE_FS = `
precision mediump float;
varying vec4 vColor;
void main() {
  vec2 c = gl_PointCoord * 2.0 - 1.0;
  float r2 = dot(c, c);
  if (r2 > 1.0) discard;
  vec3 n = vec3(c.x, -c.y, sqrt(1.0 - r2));
  float diff = max(dot(n, normalize(vec3(-0.4, 0.6, 0.7))), 0.0);
  float spec = pow(max(dot(n, normalize(vec3(-0.25, 0.45, 1.0))), 0.0), 28.0);
  vec3 col = vColor.rgb * (0.42 + 0.66 * diff) + spec * 0.55;
  gl_FragColor = vec4(min(col, 1.0), 1.0) * vColor.a * smoothstep(1.0, 0.82, r2);
}`

const ease = (k: number) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2)
const mix = (a: number, b: number, t: number) => a + (b - a) * t

export function mountLayers(canvas: HTMLCanvasElement, overlay: HTMLElement, onPick: (id: string | null) => void): LayersApi {
  let model: LayerModel | null = null
  let dirty = true
  let t = 0
  let anim: { from: number; to: number; start: number | null; done?: () => void } | null = null
  let repaint = () => {}
  const still = window.matchMedia('(prefers-reduced-motion: reduce)')

  const build = (gl: WebGLRenderingContext, invalidate: () => void): Scene => {
    repaint = invalidate
    dirty = true
    const plane = program(gl, PLANE_VS, PLANE_FS)
    const pu = uniforms(gl, plane, ['uMvp', 'uColor', 'uT', 'uMid', 'uGap'] as const)
    const pa = gl.getAttribLocation(plane, 'aP')
    const edge = program(gl, EDGE_VS, EDGE_FS)
    const eu = uniforms(gl, edge, ['uMvp', 'uHalf', 'uT', 'uMid', 'uGap'] as const)
    const ea = { a: gl.getAttribLocation(edge, 'aA'), b: gl.getAttribLocation(edge, 'aB'), s: gl.getAttribLocation(edge, 'aS'), c: gl.getAttribLocation(edge, 'aColor') }
    const node = program(gl, NODE_VS, NODE_FS)
    const nu = uniforms(gl, node, ['uMvp', 'uT', 'uMid', 'uGap'] as const)
    const na = { p: gl.getAttribLocation(node, 'aP'), c: gl.getAttribLocation(node, 'aColor'), s: gl.getAttribLocation(node, 'aSize') }
    const bufs = { plane: gl.createBuffer()!, grid: gl.createBuffer()!, edge: gl.createBuffer()!, node: gl.createBuffer()! }
    const cam = orbit(canvas, invalidate, { yaw: -0.5, pitch: 0.46, minPitch: 0.12, maxPitch: Math.PI / 2 })
    let edgeCount = 0
    let rimCount = 0
    let gridCount = 0
    let dpr = 1
    let screen: { id: string; x: number; y: number }[] = []

    // a click that didn't turn the scene picks the nearest node
    let downAt: [number, number] | null = null
    const down = (e: PointerEvent) => {
      downAt = [e.clientX, e.clientY]
    }
    const click = (e: MouseEvent) => {
      if (!downAt || Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > 5) return
      const r = canvas.getBoundingClientRect()
      const x = e.clientX - r.left
      const y = e.clientY - r.top
      let best: string | null = null
      let bestD = 18
      for (const s of screen) {
        const dist = Math.hypot(s.x - x, s.y - y)
        if (dist < bestD) {
          bestD = dist
          best = s.id
        }
      }
      onPick(best)
    }
    canvas.addEventListener('pointerdown', down)
    canvas.addEventListener('click', click)

    const rebuild = (m: LayerModel, px: number) => {
      // planes: one quad each, sized to the graph
      const quad = (l: number) => [-m.w, l, m.d, m.w, l, m.d, -m.w, l, -m.d, m.w, l, -m.d]
      gl.bindBuffer(gl.ARRAY_BUFFER, bufs.plane)
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(m.layers.flatMap((_, i) => quad(i))), gl.STATIC_DRAW)
      // each plane's rim, then a faint inner grid
      const grid: number[] = []
      m.layers.forEach((_, l) => {
        grid.push(-m.w, l, -m.d, m.w, l, -m.d, m.w, l, -m.d, m.w, l, m.d, m.w, l, m.d, -m.w, l, m.d, -m.w, l, m.d, -m.w, l, -m.d)
      })
      rimCount = grid.length / 3
      m.layers.forEach((_, l) => {
        for (let k = 1; k < 4; k++) grid.push(-m.w + (k * m.w) / 2, l, -m.d, -m.w + (k * m.w) / 2, l, m.d)
        for (let k = 1; k < 3; k++) grid.push(-m.w, l, -m.d + (k * m.d * 2) / 3, m.w, l, -m.d + (k * m.d * 2) / 3)
      })
      gridCount = grid.length / 3
      gl.bindBuffer(gl.ARRAY_BUFFER, bufs.grid)
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(grid), gl.STATIC_DRAW)
      // edges: six vertices a quad, each carrying both ends
      const v: number[] = []
      for (const e of m.edges) {
        const A = m.nodes[e.a]
        const B = m.nodes[e.b]
        const [r, g, b] = rgb(e.color)
        const half = (e.width / 2) * px
        const c = [r * e.alpha, g * e.alpha, b * e.alpha, e.alpha]
        const corner = (s: number, side: number) => v.push(A.x, A.layer, A.z, B.x, B.layer, B.z, s, side * half, ...c)
        corner(0, -1); corner(0, 1); corner(1, -1)
        corner(1, -1); corner(0, 1); corner(1, 1)
      }
      edgeCount = v.length / 12
      gl.bindBuffer(gl.ARRAY_BUFFER, bufs.edge)
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(v), gl.STATIC_DRAW)
    }

    let nodeBuf = new Float32Array(0)
    const labels = () => Array.from(overlay.querySelectorAll<HTMLElement>('[data-node],[data-layer]'))

    return {
      draw(time, w, h, ratio) {
        if (!model) return
        if (dirty || ratio !== dpr) {
          dpr = ratio
          rebuild(model, ratio)
          dirty = false
        }
        // peel or fold
        if (anim) {
          if (still.matches) {
            t = anim.to
          } else {
            if (anim.start === null) anim.start = time
            t = mix(anim.from, anim.to, ease(Math.min(1, (time - anim.start) / PEEL_S)))
          }
          if (t === anim.to) {
            const done = anim.done
            anim = null
            done?.()
          }
        }
        cam.step()
        const breathe = cam.touched || still.matches ? 0 : Math.sin(time * 0.3) * 0.1 * t
        const pitch = mix(Math.PI / 2, cam.pitch, t)
        const yaw = mix(0, cam.yaw + breathe, t)
        const aspect = w / h
        const tan = Math.tan(FOV / 2)
        // far enough back to frame every plane from above, and the stack once peeled
        const fit = Math.max(model.w / (tan * aspect), model.d / tan, (model.layers.length * GAP * t) / tan * 0.6)
        const view = multiply(translation(0, 0, -Math.max(1.5, fit * 1.22)), multiply(rotationX(pitch), rotationY(yaw)))
        const mvp = multiply(perspective(FOV, aspect, 0.05, 40), view)
        const mid = (model.layers.length - 1) / 2
        const night = document.documentElement.dataset.theme === 'night'

        gl.clearColor(0, 0, 0, 0)
        gl.clear(gl.COLOR_BUFFER_BIT)
        gl.enable(gl.BLEND)
        gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA)

        // planes, back to front is not needed: they're faint glass
        gl.useProgram(plane)
        gl.uniformMatrix4fv(pu.uMvp, false, mvp)
        gl.uniform1f(pu.uT, t)
        gl.uniform1f(pu.uMid, mid)
        gl.uniform1f(pu.uGap, GAP)
        gl.enableVertexAttribArray(pa)
        gl.bindBuffer(gl.ARRAY_BUFFER, bufs.plane)
        gl.vertexAttribPointer(pa, 3, gl.FLOAT, false, 0, 0)
        const glass = night ? [0.18, 0.3, 0.7] : [0.06, 0.14, 0.45]
        const fillA = 0.07 * t
        gl.uniform4fv(pu.uColor, [...glass.map((c) => c * fillA), fillA])
        model.layers.forEach((_, i) => gl.drawArrays(gl.TRIANGLE_STRIP, i * 4, 4))
        const rimA = (night ? 0.5 : 0.34) * Math.max(t, 0.25)
        const gridA = (night ? 0.14 : 0.08) * Math.max(t, 0.25)
        gl.bindBuffer(gl.ARRAY_BUFFER, bufs.grid)
        gl.vertexAttribPointer(pa, 3, gl.FLOAT, false, 0, 0)
        gl.uniform4fv(pu.uColor, [...glass.map((c) => c * rimA), rimA])
        gl.drawArrays(gl.LINES, 0, rimCount)
        gl.uniform4fv(pu.uColor, [...glass.map((c) => c * gridA), gridA])
        gl.drawArrays(gl.LINES, rimCount, gridCount - rimCount)
        gl.disableVertexAttribArray(pa)

        // edges
        if (edgeCount) {
          gl.useProgram(edge)
          gl.uniformMatrix4fv(eu.uMvp, false, mvp)
          gl.uniform2f(eu.uHalf, w / 2, h / 2)
          gl.uniform1f(eu.uT, t)
          gl.uniform1f(eu.uMid, mid)
          gl.uniform1f(eu.uGap, GAP)
          gl.bindBuffer(gl.ARRAY_BUFFER, bufs.edge)
          const stride = 12 * 4
          ;[ea.a, ea.b, ea.s, ea.c].forEach((l) => gl.enableVertexAttribArray(l))
          gl.vertexAttribPointer(ea.a, 3, gl.FLOAT, false, stride, 0)
          gl.vertexAttribPointer(ea.b, 3, gl.FLOAT, false, stride, 12)
          gl.vertexAttribPointer(ea.s, 2, gl.FLOAT, false, stride, 24)
          gl.vertexAttribPointer(ea.c, 4, gl.FLOAT, false, stride, 32)
          gl.drawArrays(gl.TRIANGLES, 0, edgeCount)
          ;[ea.a, ea.b, ea.s, ea.c].forEach((l) => gl.disableVertexAttribArray(l))
        }

        // nodes, furthest first; remember where each landed for picking and labels
        const at = (n: LayerNode): [number, number, number] => [n.x, t * (mid - n.layer) * GAP, n.z]
        const depth = (n: LayerNode) => {
          const [x, y, z] = at(n)
          return mvp[3] * x + mvp[7] * y + mvp[11] * z + mvp[15]
        }
        const order = model.nodes.map((n, i) => ({ i, d: depth(n) })).sort((a, b) => b.d - a.d)
        if (nodeBuf.length !== model.nodes.length * 8) nodeBuf = new Float32Array(model.nodes.length * 8)
        order.forEach(({ i }, k) => {
          const n = model!.nodes[i]
          const [r, g, b] = rgb(n.color)
          const alpha = n.tone === 'dim' ? 0.28 : 1
          const size = (n.tone === 'selected' ? 26 : n.tone === 'lit' ? 21 : 17) * dpr
          nodeBuf.set([n.x, n.layer, n.z, r, g, b, alpha, size], k * 8)
        })
        if (model.nodes.length) {
          gl.useProgram(node)
          gl.uniformMatrix4fv(nu.uMvp, false, mvp)
          gl.uniform1f(nu.uT, t)
          gl.uniform1f(nu.uMid, mid)
          gl.uniform1f(nu.uGap, GAP)
          gl.bindBuffer(gl.ARRAY_BUFFER, bufs.node)
          gl.bufferData(gl.ARRAY_BUFFER, nodeBuf, gl.DYNAMIC_DRAW)
          ;[na.p, na.c, na.s].forEach((l) => gl.enableVertexAttribArray(l))
          gl.vertexAttribPointer(na.p, 3, gl.FLOAT, false, 32, 0)
          gl.vertexAttribPointer(na.c, 4, gl.FLOAT, false, 32, 12)
          gl.vertexAttribPointer(na.s, 1, gl.FLOAT, false, 32, 28)
          gl.drawArrays(gl.POINTS, 0, model.nodes.length)
          ;[na.p, na.c, na.s].forEach((l) => gl.disableVertexAttribArray(l))
        }

        // where every node landed, for picking; HTML labels ride along
        const cw = w / dpr
        const ch = h / dpr
        const landed = new Map<string, [number, number]>()
        screen = []
        for (const n of model.nodes) {
          const [x, y, z] = at(n)
          const p = project(mvp, x, y, z, cw, ch)
          if (!p) continue
          landed.set(n.id, p)
          screen.push({ id: n.id, x: p[0], y: p[1] })
        }
        for (const el of labels()) {
          let p: [number, number] | null = null
          if (el.dataset.node) {
            p = landed.get(el.dataset.node) ?? null
          } else {
            const l = Number(el.dataset.layer)
            p = project(mvp, -model.w, t * (mid - l) * GAP, model.d, cw, ch)
            el.style.opacity = String(Math.max(0, (t - 0.35) / 0.65))
          }
          if (!p) {
            el.style.visibility = 'hidden'
            continue
          }
          el.style.visibility = ''
          el.style.transform = `translate(${p[0].toFixed(1)}px, ${p[1].toFixed(1)}px)`
        }
      },
      dispose() {
        cam.dispose()
        canvas.removeEventListener('pointerdown', down)
        canvas.removeEventListener('click', click)
        Object.values(bufs).forEach((b) => gl.deleteBuffer(b))
        ;[plane, edge, node].forEach((p) => gl.deleteProgram(p))
      },
    }
  }

  const stop = run(canvas, build, { maxDpr: 2, fps: 60, stillAt: 0 })
  return {
    update(m) {
      model = m
      dirty = true
      repaint()
    },
    peel(to, done) {
      anim = { from: t, to, start: null, done }
      repaint()
    },
    stop,
  }
}
