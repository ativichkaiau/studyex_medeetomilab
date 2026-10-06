import { run, program, uniforms, perspective, type Scene } from './core'

/**
 * The Overview's monitor — a schematic lead V1 with the Brugada type 1
 * pattern: a high J-point take-off, a coved ST segment that bows down into a
 * negative T wave with no isoelectric gap between them. It is a drawn
 * illustration of the pattern's shape (hand-placed knots, smoothly
 * interpolated), not a recording and not anyone's data.
 *
 * Each trace is a 2.4 s strip, three beats. The newest strip is swept in
 * left to right with a phosphor head; as it completes, the whole stack is
 * pushed one step back, so earlier strips recede into a waterfall with the
 * three QRS complexes standing in ridges. On the newest strip the coved
 * ST–T is picked out in research teal.
 */

const RR = 0.8 // seconds per beat in the drawing
const BEATS = 3
const WINDOW = RR * BEATS
const PER_BEAT = 150
const S = PER_BEAT * BEATS

// one beat: [seconds, millivolts]
const KNOTS: [number, number][] = [
  [0, 0], [0.08, 0], [0.12, 0.1], [0.16, 0], // P
  [0.26, 0], [0.285, 0.2], [0.305, -0.62], [0.335, 0.3], [0.35, 0.38], // r, S, J-point high take-off
  [0.4, 0.34], [0.45, 0.24], [0.5, 0.09], [0.545, -0.08], // coved ST, bowing down…
  [0.6, -0.22], [0.66, -0.13], [0.72, 0], [0.8, 0], // …straight into an inverted T
]
// where the teaching highlight sits: J-point through the end of T
const ST_FROM = 0.335
const ST_TO = 0.72

/** monotone cubic (Fritsch–Carlson) through the knots: smooth, no overshoot */
function monotone(pts: [number, number][]) {
  const n = pts.length
  const xs = pts.map((p) => p[0])
  const ys = pts.map((p) => p[1])
  const h = xs.slice(1).map((x, i) => x - xs[i])
  const d = h.map((hi, i) => (ys[i + 1] - ys[i]) / hi)
  const m = xs.map((_, i) => {
    if (i === 0) return d[0]
    if (i === n - 1) return d[n - 2]
    if (d[i - 1] * d[i] <= 0) return 0
    const w1 = 2 * h[i] + h[i - 1]
    const w2 = h[i] + 2 * h[i - 1]
    return (w1 + w2) / (w1 / d[i - 1] + w2 / d[i])
  })
  return (x: number) => {
    let i = 0
    while (i < n - 2 && x > xs[i + 1]) i++
    const t = Math.min(1, Math.max(0, (x - xs[i]) / h[i]))
    const t2 = t * t
    const t3 = t2 * t
    return (2 * t3 - 3 * t2 + 1) * ys[i] + (t3 - 2 * t2 + t) * h[i] * m[i] + (-2 * t3 + 3 * t2) * ys[i + 1] + (t3 - t2) * h[i] * m[i + 1]
  }
}

const beat = monotone(KNOTS)
/** the strip: millivolts and ST weight at each of S samples across the window */
const STRIP = Array.from({ length: S }, (_, i) => {
  const t = (i / (S - 1)) * WINDOW
  const phase = t % RR
  const st = Math.min(1, Math.max(0, (phase - ST_FROM) / 0.015)) * Math.min(1, Math.max(0, (ST_TO - phase) / 0.02))
  return { mv: beat(phase), st }
})

const AMP = 0.3 // world units per millivolt
const LINES = 13
const FRONT_Z = -2.2
const FOV = (30 * Math.PI) / 180

const VS = `
attribute vec4 aP; // x, y in the strip's own plane; z: ST weight; w: how much of it to keep
uniform mat4 uProj;
uniform float uDepth;
varying float vSt, vKeep;
void main() {
  vSt = aP.z;
  vKeep = aP.w;
  gl_Position = uProj * vec4(aP.x, aP.y - 0.26 + uDepth * 0.088, ${FRONT_Z.toFixed(2)} - uDepth * 0.36, 1.0);
}`
const FS = `
precision mediump float;
uniform vec4 uColor, uSt; // premultiplied: the trace, and its ST–T segment
varying float vSt, vKeep;
void main() { gl_FragColor = mix(uColor, uSt, vSt) * vKeep; }`

const HEAD_VS = `
attribute vec2 aP;
uniform mat4 uProj;
uniform float uSize;
void main() { gl_PointSize = uSize; gl_Position = uProj * vec4(aP.x, aP.y - 0.26, ${FRONT_Z.toFixed(2)}, 1.0); }`
const HEAD_FS = `
precision mediump float;
void main() {
  float r = length(gl_PointCoord - 0.5) * 2.0;
  float a = exp(-r * r * 4.0);
  vec3 c = mix(vec3(0.34, 0.72, 0.69), vec3(1.0), exp(-r * r * 18.0));
  gl_FragColor = vec4(c * a, a);
}`

const BG = [0.039, 0.047, 0.063, 1] // the graphite monitor glass
const FRONT = [0.557, 0.651, 1]
const BACK = [0.231, 0.373, 0.941]
const ST = [0.341, 0.718, 0.69]

const ease = (x: number) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x))

/** strips for a given half-width: the line, its glow, and the fill below it */
function geometry(halfW: number) {
  const pts = STRIP.map((s, i) => {
    const u = i / (S - 1)
    // every strip fades in and out at its ends rather than stopping square
    return { x: (u * 2 - 1) * halfW, y: s.mv * AMP, st: s.st, keep: Math.min(1, u / 0.05, (1 - u) / 0.05) }
  })
  const out = new Float32Array(S * 2 * 3 * 4)
  const strip = (offset: number, width: number | null) => {
    pts.forEach((p, i) => {
      const a = pts[Math.max(0, i - 1)]
      const b = pts[Math.min(S - 1, i + 1)]
      let nx = -(b.y - a.y)
      let ny = b.x - a.x
      const len = Math.hypot(nx, ny) || 1
      nx /= len
      ny /= len
      const o = (offset + i * 2) * 4
      if (width === null) {
        // fill: from the trace down past its deepest S wave, in the screen's
        // colour, fading out below — each strip hides the ones behind it
        // without cutting a hard-edged block out of the glass
        out.set([p.x, p.y, 0, p.keep, p.x, -0.34, 0, 0], o)
      } else {
        out.set([p.x + nx * width, p.y + ny * width, p.st, p.keep, p.x - nx * width, p.y - ny * width, p.st, p.keep], o)
      }
    })
  }
  strip(0, 0.0075)
  strip(S * 2, 0.032)
  strip(S * 4, null)
  return out
}

function build(gl: WebGLRenderingContext): Scene {
  const prog = program(gl, VS, FS)
  const u = uniforms(gl, prog, ['uProj', 'uDepth', 'uColor', 'uSt'] as const)
  const aP = gl.getAttribLocation(prog, 'aP')
  const head = program(gl, HEAD_VS, HEAD_FS)
  const hu = uniforms(gl, head, ['uProj', 'uSize'] as const)
  const haP = gl.getAttribLocation(head, 'aP')
  const buf = gl.createBuffer()
  const headBuf = gl.createBuffer()
  const still = window.matchMedia('(prefers-reduced-motion: reduce)')
  let builtFor = 0

  const strip = (offset: number, count: number, depth: number, color: number[], st = color) => {
    gl.uniform1f(u.uDepth, depth)
    gl.uniform4fv(u.uColor, color)
    gl.uniform4fv(u.uSt, st)
    gl.drawArrays(gl.TRIANGLE_STRIP, offset, count)
  }
  const tint = (rgb: number[], a: number) => [...rgb.map((x) => x * a), a]

  return {
    draw(time, w, h, dpr) {
      const aspect = w / h
      const halfW = Math.tan(FOV / 2) * -FRONT_Z * aspect * 0.92
      gl.bindBuffer(gl.ARRAY_BUFFER, buf)
      if (Math.abs(halfW - builtFor) > 1e-4) {
        gl.bufferData(gl.ARRAY_BUFFER, geometry(halfW), gl.STATIC_DRAW)
        builtFor = halfW
      }
      const proj = perspective(FOV, aspect, 0.1, 30)
      const p = still.matches ? 1 : (time % WINDOW) / WINDOW
      const push = still.matches ? 0 : ease((p - 0.86) / 0.14)

      gl.clearColor(0, 0, 0, 0)
      gl.clear(gl.COLOR_BUFFER_BIT)
      gl.enable(gl.BLEND)
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA)
      gl.useProgram(prog)
      gl.enableVertexAttribArray(aP)
      gl.vertexAttribPointer(aP, 4, gl.FLOAT, false, 0, 0)
      gl.uniformMatrix4fv(u.uProj, false, proj)

      // back to front, each strip's fill hiding what's behind it
      for (let j = LINES - 1; j >= 0; j--) {
        const d = j + push
        const fade = Math.max(0, 1 - d / LINES) ** 1.3
        if (fade <= 0) continue
        const k = Math.min(1, d / 5)
        const c = FRONT.map((y, i) => y + (BACK[i] - y) * k)
        const a = 0.9 * fade
        const n = j === 0 ? Math.max(0, Math.floor(p * (S - 1))) * 2 : S * 2
        if (!n) continue
        // the newest strip's ST–T glows teal, fading back to the trace as it recedes
        const st = j === 0 ? c.map((x, i) => x + (ST[i] - x) * (1 - push)) : c
        strip(S * 4, n, d, BG)
        if (j === 0) strip(S * 2, n, d, tint(c, 0.16), tint(st, 0.16))
        strip(0, n, d, tint(c, a), tint(st, a))
      }

      // the phosphor head, riding the newest strip
      if (!still.matches && p < 1) {
        const i = Math.floor(p * (S - 1))
        const x = (i / (S - 1) * 2 - 1) * halfW
        gl.useProgram(head)
        gl.bindBuffer(gl.ARRAY_BUFFER, headBuf)
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([x, STRIP[i].mv * AMP]), gl.DYNAMIC_DRAW)
        gl.enableVertexAttribArray(haP)
        gl.vertexAttribPointer(haP, 2, gl.FLOAT, false, 0, 0)
        gl.uniformMatrix4fv(hu.uProj, false, proj)
        gl.uniform1f(hu.uSize, 22 * dpr)
        gl.drawArrays(gl.POINTS, 0, 1)
      }
    },
    dispose() {
      gl.deleteBuffer(buf)
      gl.deleteBuffer(headBuf)
      gl.deleteProgram(prog)
      gl.deleteProgram(head)
    },
  }
}

/** Without WebGL: the same strip, flat and still, on a 2D canvas. */
function drawFlat(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  const w = (canvas.width = Math.round(canvas.clientWidth * dpr))
  const h = (canvas.height = Math.round(canvas.clientHeight * dpr))
  const x = (i: number) => (0.04 + (i / (S - 1)) * 0.92) * w
  const y = (mv: number) => h * 0.62 - mv * h * 0.55
  ctx.lineWidth = 2 * dpr
  ctx.lineJoin = 'round'
  for (const [color, keep] of [['#8ea6ff', () => true], ['#57b7b0', (st: number) => st > 0.5]] as const) {
    ctx.strokeStyle = color
    ctx.beginPath()
    let pen = false
    STRIP.forEach((s, i) => {
      if (!keep(s.st)) { pen = false; return }
      if (pen) ctx.lineTo(x(i), y(s.mv))
      else ctx.moveTo(x(i), y(s.mv))
      pen = true
    })
    ctx.stroke()
  }
}

/** Mount the monitor on its canvas; returns the teardown. */
export function mountEcg(canvas: HTMLCanvasElement): () => void {
  let flat = false
  const stop = run(canvas, build, { maxDpr: 2, stillAt: 0, onFail: () => { flat = true } })
  if (!flat) return stop
  drawFlat(canvas)
  const redraw = () => drawFlat(canvas)
  window.addEventListener('resize', redraw)
  return () => {
    stop()
    window.removeEventListener('resize', redraw)
  }
}
