import { run, program, uniforms, perspective, multiply, translation, rotationX, rotationY, project, orbit, rgb, type Mat4, type Scene } from './core'
import { HEIGHT, DEPTH, X, Z, type SurfaceRange } from './powerAxes'

/**
 * The Power page in three dimensions: power over sample size × effect size,
 * as a lit surface. The 2D chart's three curves (the planned effect, ±25%)
 * are slices of it and are drawn on it in the same colours; the target power
 * is a glass plane, and the line where the surface breaks through that plane
 * is every design that just reaches it. Everything is computed from the
 * calculator's own inputs — nothing here is invented.
 *
 * Drag, or use the arrow keys, to turn it. Axis labels are HTML laid over the
 * canvas, re-projected every frame so they stay crisp and selectable.
 */

export interface SurfaceData extends SurfaceRange {
  /** grid size: n across, effect multiplier deep */
  nx: number
  ny: number
  /** power at [j * nx + i]: i over n in [nMin, nMax], j over mult in [multMin, multMax] */
  power: Float32Array
  target: number
  /** the 2D chart's curves, as slices at fixed multipliers */
  slices: { mult: number; color: string; power: Float32Array }[]
  /** the design being planned, at the assumed effect */
  current: { n: number; power: number } | null
}

const FOV = (34 * Math.PI) / 180

const LIT_VS = `
attribute vec3 aPos, aNormal, aColor;
uniform mat4 uMvp;
varying vec3 vN, vC;
void main() { vN = aNormal; vC = aColor; gl_Position = uMvp * vec4(aPos, 1.0); }`
const LIT_FS = `
precision mediump float;
uniform vec3 uLight;
uniform float uAlpha;
varying vec3 vN, vC;
void main() {
  vec3 n = normalize(vN);
  float diff = abs(dot(n, uLight));
  vec3 c = vC * (0.42 + 0.62 * diff);
  gl_FragColor = vec4(c * uAlpha, uAlpha);
}`
const FLAT_VS = `
attribute vec3 aPos;
uniform mat4 uMvp;
void main() { gl_Position = uMvp * vec4(aPos, 1.0); }`
const FLAT_FS = `
precision mediump float;
uniform vec4 uColor;
void main() { gl_FragColor = uColor; }`
const DOT_VS = `
attribute vec3 aPos;
uniform mat4 uMvp;
uniform float uSize;
void main() { gl_PointSize = uSize; gl_Position = uMvp * vec4(aPos, 1.0); }`
const DOT_FS = `
precision mediump float;
uniform vec3 uColor;
void main() {
  float r = length(gl_PointCoord - 0.5) * 2.0;
  float a = smoothstep(1.0, 0.55, r);
  vec3 c = mix(uColor, vec3(1.0), smoothstep(0.5, 0.0, r) * 0.8);
  gl_FragColor = vec4(c * a, a);
}`

const RED = rgb('#e2001a')
const AMBER = rgb('#f59e0b')
const GREEN = rgb('#12b981')
const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}
const mix3 = (a: number[], b: number[], t: number) => a.map((v, i) => v + (b[i] - v) * t)
/** the chart's own colour logic: red below 50%, amber toward the target, green past it */
function powerColor(p: number, target: number) {
  const low = mix3(RED, AMBER, smooth(0.3, 0.55, p))
  return mix3(low, GREEN, smooth(target - 0.05, target + 0.02, p))
}

/** a flat ribbon through points, widened across the ground plane so it reads from above */
function ribbon(pts: [number, number, number][], w: number): number[] {
  const out: number[] = []
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, ay, az] = pts[i]
    const [bx, by, bz] = pts[i + 1]
    let px = -(bz - az)
    let pz = bx - ax
    const len = Math.hypot(px, pz) || 1
    px = (px / len) * w
    pz = (pz / len) * w
    out.push(ax + px, ay, az + pz, ax - px, ay, az - pz, bx + px, by, bz + pz, bx + px, by, bz + pz, ax - px, ay, az - pz, bx - px, by, bz - pz)
  }
  return out
}

interface Built {
  surface: { buf: WebGLBuffer; idx: WebGLBuffer; count: number }
  grid: { buf: WebGLBuffer; count: number }
  lines: { buf: WebGLBuffer; parts: { first: number; count: number; color: number[] }[] }
  plane: { buf: WebGLBuffer }
  frame: { buf: WebGLBuffer; count: number }
}

export interface PowerSurface {
  update(d: SurfaceData): void
  stop(): void
}

export function mountPowerSurface(canvas: HTMLCanvasElement, overlay: HTMLElement): PowerSurface {
  let data: SurfaceData | null = null
  let dirty = true
  let repaint = () => {}

  const build = (gl: WebGLRenderingContext, invalidate: () => void): Scene => {
    repaint = invalidate
    dirty = true
    const lit = program(gl, LIT_VS, LIT_FS)
    const lu = uniforms(gl, lit, ['uMvp', 'uLight', 'uAlpha'] as const)
    const la = { pos: gl.getAttribLocation(lit, 'aPos'), normal: gl.getAttribLocation(lit, 'aNormal'), color: gl.getAttribLocation(lit, 'aColor') }
    const flat = program(gl, FLAT_VS, FLAT_FS)
    const fu = uniforms(gl, flat, ['uMvp', 'uColor'] as const)
    const fa = gl.getAttribLocation(flat, 'aPos')
    const dot = program(gl, DOT_VS, DOT_FS)
    const du = uniforms(gl, dot, ['uMvp', 'uSize', 'uColor'] as const)
    const da = gl.getAttribLocation(dot, 'aPos')
    const cam = orbit(canvas, invalidate, { yaw: -0.62, pitch: 0.52 })
    const buffers: WebGLBuffer[] = []
    const buffer = () => {
      const b = gl.createBuffer()!
      buffers.push(b)
      return b
    }
    const bufs = { surface: buffer(), idx: buffer(), grid: buffer(), lines: buffer(), plane: buffer(), frame: buffer(), dot: buffer() }
    let built: Built | null = null

    const rebuild = (d: SurfaceData) => {
      const { nx, ny, power, target } = d
      const at = (i: number, j: number) => power[j * nx + i]
      const px = (i: number) => (i / (nx - 1)) * 2 - 1
      const pz = (j: number) => DEPTH - (j / (ny - 1)) * DEPTH * 2
      // surface: position, normal, colour
      const v = new Float32Array(nx * ny * 9)
      for (let j = 0; j < ny; j++) {
        for (let i = 0; i < nx; i++) {
          const y = at(i, j) * HEIGHT
          const dx = (at(Math.min(nx - 1, i + 1), j) - at(Math.max(0, i - 1), j)) * HEIGHT / (px(Math.min(nx - 1, i + 1)) - px(Math.max(0, i - 1)))
          const dz = (at(i, Math.min(ny - 1, j + 1)) - at(i, Math.max(0, j - 1))) * HEIGHT / (pz(Math.min(ny - 1, j + 1)) - pz(Math.max(0, j - 1)))
          const len = Math.hypot(dx, 1, dz)
          v.set([px(i), y, pz(j), -dx / len, 1 / len, -dz / len, ...powerColor(at(i, j), target)], (j * nx + i) * 9)
        }
      }
      const idx = new Uint16Array((nx - 1) * (ny - 1) * 6)
      let k = 0
      for (let j = 0; j < ny - 1; j++) {
        for (let i = 0; i < nx - 1; i++) {
          const a = j * nx + i
          idx.set([a, a + 1, a + nx, a + 1, a + nx + 1, a + nx], k)
          k += 6
        }
      }
      gl.bindBuffer(gl.ARRAY_BUFFER, bufs.surface)
      gl.bufferData(gl.ARRAY_BUFFER, v, gl.STATIC_DRAW)
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, bufs.idx)
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, gl.STATIC_DRAW)

      // a light wire grid over the surface, every few samples
      const grid: number[] = []
      const lift = 0.004
      for (let i = 0; i < nx; i += Math.max(1, Math.round((nx - 1) / 8))) {
        for (let j = 0; j < ny - 1; j++) grid.push(px(i), at(i, j) * HEIGHT + lift, pz(j), px(i), at(i, j + 1) * HEIGHT + lift, pz(j + 1))
      }
      for (let j = 0; j < ny; j += Math.max(1, Math.round((ny - 1) / 6))) {
        for (let i = 0; i < nx - 1; i++) grid.push(px(i), at(i, j) * HEIGHT + lift, pz(j), px(i + 1), at(i + 1, j) * HEIGHT + lift, pz(j))
      }
      gl.bindBuffer(gl.ARRAY_BUFFER, bufs.grid)
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(grid), gl.STATIC_DRAW)

      // ribbons: the three chart curves lying on the surface, then the target contour
      const tris: number[] = []
      const parts: Built['lines']['parts'] = []
      const push = (verts: number[], color: number[]) => {
        parts.push({ first: tris.length / 3, count: verts.length / 3, color })
        tris.push(...verts)
      }
      for (const s of d.slices) {
        const z = Z(d, s.mult)
        const pts = (lift: number) => Array.from(s.power, (p, i) => [px(i), p * HEIGHT + lift, z] as [number, number, number])
        // a dark keyline under each, so a red or green curve still reads on red or green ground
        push(ribbon(pts(0.008), 0.015), [0.02, 0.05, 0.16, 0.75])
        push(ribbon(pts(0.011), 0.008), [...rgb(s.color), 1])
      }
      // marching squares at the target: where the surface crosses the glass
      const seg: number[] = []
      const level = target
      for (let j = 0; j < ny - 1; j++) {
        for (let i = 0; i < nx - 1; i++) {
          const c = [at(i, j), at(i + 1, j), at(i + 1, j + 1), at(i, j + 1)]
          const corners: [number, number][] = [[px(i), pz(j)], [px(i + 1), pz(j)], [px(i + 1), pz(j + 1)], [px(i), pz(j + 1)]]
          const cuts: [number, number][] = []
          for (let e = 0; e < 4; e++) {
            const a = c[e]
            const b = c[(e + 1) % 4]
            if ((a < level) !== (b < level)) {
              const t = (level - a) / (b - a)
              const [ax, az] = corners[e]
              const [bx, bz] = corners[(e + 1) % 4]
              cuts.push([ax + (bx - ax) * t, az + (bz - az) * t])
            }
          }
          for (let q = 0; q + 1 < cuts.length; q += 2) seg.push(cuts[q][0], cuts[q][1], cuts[q + 1][0], cuts[q + 1][1])
        }
      }
      const y = level * HEIGHT + 0.006
      const contour = (w: number, lift: number) => {
        const out: number[] = []
        for (let q = 0; q < seg.length; q += 4) out.push(...ribbon([[seg[q], y + lift, seg[q + 1]], [seg[q + 2], y + lift, seg[q + 3]]], w))
        return out
      }
      // bright on a dark keyline: it has to read against amber glass and amber ground
      if (seg.length) {
        push(contour(0.014, 0), [0.02, 0.05, 0.16, 0.8])
        push(contour(0.007, 0.003), [1, 0.96, 0.8, 1])
      }
      gl.bindBuffer(gl.ARRAY_BUFFER, bufs.lines)
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(tris), gl.STATIC_DRAW)

      // the target plane, and the box the surface sits in
      gl.bindBuffer(gl.ARRAY_BUFFER, bufs.plane)
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, y, DEPTH, 1, y, DEPTH, -1, y, -DEPTH, 1, y, -DEPTH]), gl.STATIC_DRAW)
      const H = HEIGHT
      const frame = [
        -1, 0, DEPTH, 1, 0, DEPTH, 1, 0, DEPTH, 1, 0, -DEPTH, 1, 0, -DEPTH, -1, 0, -DEPTH, -1, 0, -DEPTH, -1, 0, DEPTH, // floor
        -1, 0, -DEPTH, -1, H, -DEPTH, 1, 0, -DEPTH, 1, H, -DEPTH, -1, 0, DEPTH, -1, H, DEPTH, // uprights at the back and left
        -1, H, -DEPTH, 1, H, -DEPTH, -1, H, -DEPTH, -1, H, DEPTH,
        -1, y, -DEPTH, 1, y, -DEPTH, -1, y, -DEPTH, -1, y, DEPTH, // the target, where it meets the walls
      ]
      for (const t of [0.25, 0.5, 0.75]) frame.push(-1, t * H, -DEPTH, 1, t * H, -DEPTH, -1, t * H, -DEPTH, -1, t * H, DEPTH)
      gl.bindBuffer(gl.ARRAY_BUFFER, bufs.frame)
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(frame), gl.STATIC_DRAW)

      built = {
        surface: { buf: bufs.surface, idx: bufs.idx, count: idx.length },
        grid: { buf: bufs.grid, count: grid.length / 3 },
        lines: { buf: bufs.lines, parts },
        plane: { buf: bufs.plane },
        frame: { buf: bufs.frame, count: frame.length / 3 },
      }
    }

    const labels = () => Array.from(overlay.querySelectorAll<HTMLElement>('[data-at]'))
    const place = (mvp: Mat4, w: number, h: number) => {
      for (const el of labels()) {
        const [x, y, z] = el.dataset.at!.split(',').map(Number)
        const p = project(mvp, x, y, z, w, h)
        if (!p) {
          el.style.visibility = 'hidden'
          continue
        }
        el.style.visibility = ''
        el.style.transform = `translate(${p[0].toFixed(1)}px, ${p[1].toFixed(1)}px)`
      }
    }

    return {
      draw(time, w, h, dpr) {
        if (!data) return
        if (dirty) {
          rebuild(data)
          dirty = false
        }
        if (!built) return
        const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches
        cam.step()
        // until someone takes hold, it breathes a few degrees either way
        const yaw = cam.yaw + (cam.touched || still ? 0 : Math.sin(time * 0.35) * 0.16)
        // stand far enough back that the whole box fits, further on narrow screens
        const aspect = w / h
        const dist = 4.1 + Math.max(0, 1.5 - aspect) * 2.4
        const view = multiply(translation(0, -0.16, -dist), multiply(rotationX(cam.pitch), rotationY(yaw)))
        const mvp = multiply(perspective(FOV, aspect, 0.1, 20), view)
        const night = document.documentElement.dataset.theme === 'night'

        gl.clearColor(0, 0, 0, 0)
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)
        gl.enable(gl.BLEND)
        gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA)
        gl.enable(gl.DEPTH_TEST)
        gl.depthFunc(gl.LEQUAL)

        // the box first, then the surface over it
        gl.useProgram(flat)
        gl.uniformMatrix4fv(fu.uMvp, false, mvp)
        gl.enableVertexAttribArray(fa)
        gl.bindBuffer(gl.ARRAY_BUFFER, built.frame.buf)
        gl.vertexAttribPointer(fa, 3, gl.FLOAT, false, 0, 0)
        gl.uniform4fv(fu.uColor, night ? [0.3, 0.42, 0.75, 0.55] : [0.1, 0.16, 0.36, 0.3])
        gl.drawArrays(gl.LINES, 0, built.frame.count)

        gl.useProgram(lit)
        gl.uniformMatrix4fv(lu.uMvp, false, mvp)
        gl.uniform3fv(lu.uLight, [-0.35, 0.85, 0.4].map((x) => x / Math.hypot(-0.35, 0.85, 0.4)))
        gl.uniform1f(lu.uAlpha, 0.95)
        gl.bindBuffer(gl.ARRAY_BUFFER, built.surface.buf)
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, built.surface.idx)
        gl.enableVertexAttribArray(la.pos)
        gl.enableVertexAttribArray(la.normal)
        gl.enableVertexAttribArray(la.color)
        gl.vertexAttribPointer(la.pos, 3, gl.FLOAT, false, 36, 0)
        gl.vertexAttribPointer(la.normal, 3, gl.FLOAT, false, 36, 12)
        gl.vertexAttribPointer(la.color, 3, gl.FLOAT, false, 36, 24)
        gl.drawElements(gl.TRIANGLES, built.surface.count, gl.UNSIGNED_SHORT, 0)
        gl.disableVertexAttribArray(la.normal)
        gl.disableVertexAttribArray(la.color)

        gl.useProgram(flat)
        gl.uniformMatrix4fv(fu.uMvp, false, mvp)
        gl.bindBuffer(gl.ARRAY_BUFFER, built.grid.buf)
        gl.vertexAttribPointer(fa, 3, gl.FLOAT, false, 0, 0)
        gl.uniform4fv(fu.uColor, [0.06, 0.08, 0.14, 0.2])
        gl.drawArrays(gl.LINES, 0, built.grid.count)
        gl.bindBuffer(gl.ARRAY_BUFFER, built.lines.buf)
        gl.vertexAttribPointer(fa, 3, gl.FLOAT, false, 0, 0)
        for (const p of built.lines.parts) {
          gl.uniform4fv(fu.uColor, p.color)
          gl.drawArrays(gl.TRIANGLES, p.first, p.count)
        }
        // the target: glass, drawn last and without writing depth, so what's
        // under it shows through and what's above it stays in front
        gl.depthMask(false)
        gl.bindBuffer(gl.ARRAY_BUFFER, built.plane.buf)
        gl.vertexAttribPointer(fa, 3, gl.FLOAT, false, 0, 0)
        gl.uniform4fv(fu.uColor, night ? [0.22, 0.15, 0.02, 0.22] : [0.16, 0.1, 0.01, 0.12])
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
        gl.depthMask(true)

        // the design being planned
        if (data.current) {
          const cx = X(data, data.current.n)
          const cy = data.current.power * HEIGHT
          const cz = Z(data, 1)
          if (cx >= -1.001 && cx <= 1.001) {
            gl.disable(gl.DEPTH_TEST)
            gl.bindBuffer(gl.ARRAY_BUFFER, bufs.dot)
            gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([cx, 0, cz, cx, cy, cz]), gl.DYNAMIC_DRAW)
            gl.vertexAttribPointer(fa, 3, gl.FLOAT, false, 0, 0)
            gl.uniform4fv(fu.uColor, night ? [0.85, 0.88, 1, 0.85] : [0.04, 0.12, 0.42, 0.85])
            gl.drawArrays(gl.LINES, 0, 2)
            gl.useProgram(dot)
            gl.uniformMatrix4fv(du.uMvp, false, mvp)
            gl.uniform1f(du.uSize, 15 * dpr)
            gl.uniform3fv(du.uColor, powerColor(data.current.power, data.target))
            gl.enableVertexAttribArray(da)
            gl.vertexAttribPointer(da, 3, gl.FLOAT, false, 0, 12)
            gl.drawArrays(gl.POINTS, 0, 1)
          }
        }
        gl.disable(gl.DEPTH_TEST)
        place(mvp, w / dpr, h / dpr)
      },
      dispose() {
        cam.dispose()
        buffers.forEach((b) => gl.deleteBuffer(b))
        ;[lit, flat, dot].forEach((p) => gl.deleteProgram(p))
      },
    }
  }

  const stop = run(canvas, build, { maxDpr: 2, depth: true, stillAt: 0 })
  return {
    update(d) {
      data = d
      dirty = true
      repaint()
    },
    stop,
  }
}
