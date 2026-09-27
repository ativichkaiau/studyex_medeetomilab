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
  /** the time a reduced-motion still is drawn at */
  stillAt?: number
  /** WebGL isn't available, or the scene couldn't be built */
  onFail?: () => void
}

type Build = (gl: WebGLRenderingContext, invalidate: () => void) => Scene

const REDUCED = '(prefers-reduced-motion: reduce)'

export function run(canvas: HTMLCanvasElement, build: Build, { maxDpr = 1.5, fps = 60, stillAt = 8, onFail }: RunOptions = {}): () => void {
  const gl = canvas.getContext('webgl', {
    alpha: true, premultipliedAlpha: true, antialias: true, depth: false, stencil: false, powerPreference: 'low-power',
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
