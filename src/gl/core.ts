/**
 * The smallest WebGL runtime the 3D scenes need — no library.
 *
 * run() owns everything that isn't drawing: the context, sizing the drawing
 * buffer to the element (with a device-pixel-ratio cap), a frame loop that
 * only runs while the canvas can actually be seen (not in a hidden tab, not
 * scrolled off screen), one still frame instead of motion under reduced
 * motion, and rebuilding after the GPU drops the context.
 */

export interface Scene {
  /** time in seconds; w/h in device pixels */
  draw(time: number, w: number, h: number, dpr: number): void
  dispose?(): void
}

export interface RunOptions {
  maxDpr?: number
  fps?: number
  /** a depth buffer, for scenes whose surfaces hide one another */
  depth?: boolean
  /** the time a reduced-motion still is drawn at */
  stillAt?: number
  /** WebGL isn't available, or the scene couldn't be built */
  onFail?: () => void
}

type Build = (gl: WebGLRenderingContext, invalidate: () => void) => Scene

const REDUCED = '(prefers-reduced-motion: reduce)'

export function run(canvas: HTMLCanvasElement, build: Build, { maxDpr = 1.5, fps = 60, stillAt = 8, depth = false, onFail }: RunOptions = {}): () => void {
  const gl = canvas.getContext('webgl', {
    alpha: true, premultipliedAlpha: true, antialias: true, depth, stencil: false, powerPreference: 'low-power',
  })
  if (!gl) {
    onFail?.()
    return () => {}
  }
  const reduced = window.matchMedia(REDUCED)
  const born = performance.now()
  let scene: Scene | null = null
  let raf = 0
  let last = -Infinity
  let onScreen = true

  const paint = (now: number) => {
    if (!scene) return
    const dpr = Math.min(window.devicePixelRatio || 1, maxDpr)
    const w = Math.max(1, Math.round(canvas.clientWidth * dpr))
    const h = Math.max(1, Math.round(canvas.clientHeight * dpr))
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w
      canvas.height = h
    }
    gl.viewport(0, 0, w, h)
    // a frame's timestamp can precede the moment we started, so clamp at zero
    scene.draw(reduced.matches ? stillAt : Math.max(0, now - born) / 1000, w, h, dpr)
  }
  const live = () => !!scene && onScreen && !document.hidden && !gl.isContextLost()
  const tick = (now: number) => {
    raf = 0
    if (!live()) return
    // motion was just turned off: settle on the still frame, not wherever we were
    if (reduced.matches) {
      paint(now)
      return
    }
    if (now - last >= 1000 / fps - 1) {
      last = now
      paint(now)
    }
    raf = requestAnimationFrame(tick)
  }
  /** start the loop, or under reduced motion paint the one still frame */
  const wake = () => {
    if (!live()) return
    if (reduced.matches) paint(performance.now())
    else if (!raf) raf = requestAnimationFrame(tick)
  }
  // a still frame is only repainted when something changes (a resize, the theme)
  const invalidate = () => {
    if (reduced.matches) wake()
  }
  const make = () => {
    try {
      scene = build(gl, invalidate)
    } catch (e) {
      scene = null
      console.warn('WebGL scene unavailable:', e)
      onFail?.()
    }
  }

  const io = new IntersectionObserver(([e]) => {
    onScreen = e.isIntersecting
    wake()
  })
  const lost = (e: Event) => {
    e.preventDefault() // ask for the context back
    scene = null
    if (raf) cancelAnimationFrame(raf)
    raf = 0
  }
  const restored = () => {
    make()
    wake()
  }
  const resize = () => invalidate()

  make()
  io.observe(canvas)
  document.addEventListener('visibilitychange', wake)
  reduced.addEventListener('change', wake)
  window.addEventListener('resize', resize)
  canvas.addEventListener('webglcontextlost', lost)
  canvas.addEventListener('webglcontextrestored', restored)
  wake()

  return () => {
    if (raf) cancelAnimationFrame(raf)
    io.disconnect()
    document.removeEventListener('visibilitychange', wake)
    reduced.removeEventListener('change', wake)
    window.removeEventListener('resize', resize)
    canvas.removeEventListener('webglcontextlost', lost)
    canvas.removeEventListener('webglcontextrestored', restored)
    scene?.dispose?.()
    scene = null
    // hand the GPU memory back now rather than whenever the canvas is collected
    gl.getExtension('WEBGL_lose_context')?.loseContext()
  }
}

export function program(gl: WebGLRenderingContext, vs: string, fs: string): WebGLProgram {
  const shader = (type: number, src: string) => {
    const s = gl.createShader(type)!
    gl.shaderSource(s, src)
    gl.compileShader(s)
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS) && !gl.isContextLost()) throw new Error(gl.getShaderInfoLog(s) ?? 'shader')
    return s
  }
  const p = gl.createProgram()!
  gl.attachShader(p, shader(gl.VERTEX_SHADER, vs))
  gl.attachShader(p, shader(gl.FRAGMENT_SHADER, fs))
  gl.linkProgram(p)
  if (!gl.getProgramParameter(p, gl.LINK_STATUS) && !gl.isContextLost()) throw new Error(gl.getProgramInfoLog(p) ?? 'link')
  return p
}

/** uniform locations by name */
export function uniforms<K extends string>(gl: WebGLRenderingContext, p: WebGLProgram, names: readonly K[]): Record<K, WebGLUniformLocation | null> {
  return Object.fromEntries(names.map((n) => [n, gl.getUniformLocation(p, n)])) as Record<K, WebGLUniformLocation | null>
}

// ---------- matrices: column-major, as WebGL wants them ----------

export type Mat4 = Float32Array

export function multiply(a: Mat4, b: Mat4): Mat4 {
  const o = new Float32Array(16)
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) {
      let sum = 0
      for (let k = 0; k < 4; k++) sum += a[k * 4 + r] * b[c * 4 + k]
      o[c * 4 + r] = sum
    }
  }
  return o
}
export const translation = (x: number, y: number, z: number): Mat4 => new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1])
export function rotationX(a: number): Mat4 {
  const c = Math.cos(a)
  const s = Math.sin(a)
  return new Float32Array([1, 0, 0, 0, 0, c, s, 0, 0, -s, c, 0, 0, 0, 0, 1])
}
export function rotationY(a: number): Mat4 {
  const c = Math.cos(a)
  const s = Math.sin(a)
  return new Float32Array([c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, 0, 1])
}
/** where a world point lands on a w×h canvas, in CSS pixels; null if behind the eye */
export function project(m: Mat4, x: number, y: number, z: number, w: number, h: number): [number, number] | null {
  const cx = m[0] * x + m[4] * y + m[8] * z + m[12]
  const cy = m[1] * x + m[5] * y + m[9] * z + m[13]
  const cw = m[3] * x + m[7] * y + m[11] * z + m[15]
  if (cw <= 1e-6) return null
  return [(cx / cw * 0.5 + 0.5) * w, (0.5 - cy / cw * 0.5) * h]
}

/** a column-major perspective matrix (fovy in radians) */
export function perspective(fovy: number, aspect: number, near: number, far: number): Float32Array {
  const f = 1 / Math.tan(fovy / 2)
  const nf = 1 / (near - far)
  return new Float32Array([f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) * nf, -1, 0, 0, 2 * far * near * nf, 0])
}

/** '#rrggbb' → [r, g, b] in 0..1 */
export function rgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16)
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]
}

// ---------- orbit: drag (or arrow keys) to turn a scene ----------

export interface Orbit {
  yaw: number
  pitch: number
  /** the viewer has taken hold; idle drift stops for good */
  touched: boolean
  /** carry any fling on; call once per frame */
  step(): void
  dispose(): void
}

export function orbit(el: HTMLElement, onChange: () => void, { yaw = -0.55, pitch = 0.5, minPitch = 0.08, maxPitch = 1.35 } = {}): Orbit {
  const clampPitch = (p: number) => Math.min(maxPitch, Math.max(minPitch, p))
  let vx = 0
  let vy = 0
  let drag: { id: number; x: number; y: number } | null = null
  const o: Orbit = {
    yaw,
    pitch,
    touched: false,
    step() {
      if (drag || (Math.abs(vx) < 1e-4 && Math.abs(vy) < 1e-4)) return
      o.yaw += vx
      o.pitch = clampPitch(o.pitch + vy)
      vx *= 0.9
      vy *= 0.9
    },
    dispose() {
      el.removeEventListener('pointerdown', down)
      el.removeEventListener('pointermove', move)
      el.removeEventListener('pointerup', up)
      el.removeEventListener('pointercancel', up)
      el.removeEventListener('keydown', key)
    },
  }
  const down = (e: PointerEvent) => {
    if (e.button !== 0) return
    drag = { id: e.pointerId, x: e.clientX, y: e.clientY }
    o.touched = true
    vx = vy = 0
    el.setPointerCapture(e.pointerId)
  }
  const move = (e: PointerEvent) => {
    if (!drag || e.pointerId !== drag.id) return
    const dx = e.clientX - drag.x
    const dy = e.clientY - drag.y
    drag.x = e.clientX
    drag.y = e.clientY
    vx = dx * 0.008
    vy = e.pointerType === 'touch' ? 0 : dy * 0.006 // a finger's vertical drag scrolls the page
    o.yaw += vx
    o.pitch = clampPitch(o.pitch + vy)
    onChange()
  }
  const up = () => {
    drag = null
    onChange()
  }
  const key = (e: KeyboardEvent) => {
    const turn: Record<string, [number, number]> = { ArrowLeft: [-0.12, 0], ArrowRight: [0.12, 0], ArrowUp: [0, -0.08], ArrowDown: [0, 0.08] }
    const t = turn[e.key]
    if (!t) return
    e.preventDefault()
    o.touched = true
    o.yaw += t[0]
    o.pitch = clampPitch(o.pitch + t[1])
    onChange()
  }
  el.addEventListener('pointerdown', down)
  el.addEventListener('pointermove', move)
  el.addEventListener('pointerup', up)
  el.addEventListener('pointercancel', up)
  el.addEventListener('keydown', key)
  return o
}
