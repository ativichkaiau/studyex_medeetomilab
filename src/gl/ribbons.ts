import { run, program, uniforms, perspective, rgb, type Scene } from './core'

/**
 * Livery ribbons — the car's three colours as ribbons of air streaming past the
 * horizon, behind the whole 3D interface. Each ribbon twists along its length
 * so it catches the light, and a pulse runs down it like airflow over a wing.
 * Scrolling lifts them (you're driving forward over the floor, as the grid
 * does); the pointer turns the scene a few degrees.
 *
 * The geometry never changes: one strip of (t, edge) pairs, bent into shape
 * in the vertex shader, so a frame costs three draw calls and no uploads.
 */

const VS = `
attribute vec2 aP; // x: 0..1 along the ribbon, y: which edge (-1 or 1)
uniform mat4 uProj;
uniform float uTime, uPhase, uAmp, uY, uZ, uWidth, uHalfW, uLift, uTurn, uTwist;
varying float vT, vEdge, vDiff, vSpec, vRun;
vec3 path(float t) {
  float s = t * 6.2831853;
  float y = uY + uAmp * (sin(s * 0.8 + uTime * 0.21 + uPhase) + 0.35 * sin(s * 2.3 - uTime * 0.37 + uPhase * 1.7));
  float z = uZ + 0.9 * sin(s * 0.5 + uTime * 0.13 + uPhase * 0.6);
  return vec3(mix(-uHalfW, uHalfW, t), y + uLift, z);
}
void main() {
  vec3 p = path(aP.x);
  vec3 tangent = normalize(path(aP.x + 0.004) - p);
  vec3 side = normalize(cross(tangent, vec3(0.0, 0.0, 1.0)));
  vec3 fwd = cross(side, tangent);
  float a = aP.x * uTwist + uTime * 0.35 + uPhase;
  vec3 across = cos(a) * side + sin(a) * fwd;
  vec3 pos = p + across * (uWidth * aP.y);
  // turn the scene about its own centre, five units out
  float c = cos(uTurn), s = sin(uTurn);
  vec2 xz = vec2(pos.x, pos.z + 5.0);
  pos.xz = vec2(c * xz.x + s * xz.y, -s * xz.x + c * xz.y) - vec2(0.0, 5.0);
  vec3 n = normalize(cross(tangent, across));
  vec3 l = normalize(vec3(-0.3, 0.85, 0.45));
  vDiff = abs(dot(n, l));
  vSpec = pow(abs(dot(n, normalize(l + vec3(0.0, 0.0, 1.0)))), 48.0);
  vT = aP.x;
  vEdge = aP.y;
  // where the pulse is: time wrapped here, at full precision, so the fragment
  // shader only ever sees a small number
  vRun = aP.x * 0.8 + fract(uPhase - uTime * 0.06);
  gl_Position = uProj * vec4(pos, 1.0);
}`

// (no uniform is shared with the vertex shader: shared uniforms must match
// precision, and time needs more than mediump)
const FS = `
precision mediump float;
uniform vec3 uColor;
uniform float uAlpha, uH, uW, uGlow;
varying float vT, vEdge, vDiff, vSpec, vRun;
void main() {
  float ends = smoothstep(0.0, 0.14, vT) * smoothstep(1.0, 0.86, vT);
  float edge = 1.0 - smoothstep(0.6, 1.0, abs(vEdge));
  float pulse = exp(-pow((fract(vRun) - 0.5) * 10.0, 2.0));
  // thin out over the lower page, where the content is dense, and sweep in
  // from the right: page titles are set left, and the livery stays off them
  float low = smoothstep(0.05, 0.5, gl_FragCoord.y / uH) * smoothstep(0.3, 0.8, gl_FragCoord.x / uW);
  vec3 col = min(uColor * (0.55 + 0.5 * vDiff) + vec3(vSpec * 0.75 + pulse * uGlow), 1.0);
  float a = uAlpha * ends * edge * low * (0.7 + 0.3 * vDiff);
  gl_FragColor = vec4(col * a, a);
}`

interface Ribbon { y: number; amp: number; z: number; width: number; twist: number; phase: number; day: string; night: string; dayA: number; nightA: number }

// navy, Canon red, Camel yellow — furthest first, so they layer back to front
const RIBBONS: Ribbon[] = [
  { y: 0.95, amp: 0.2, z: -5.9, width: 0.07, twist: 6, phase: 4.2, day: '#e0a800', night: '#ffcc00', dayA: 0.5, nightA: 0.42 },
  { y: 0.74, amp: 0.16, z: -5.3, width: 0.085, twist: 7, phase: 0, day: '#0a1f6b', night: '#2f6bff', dayA: 0.36, nightA: 0.55 },
  { y: 0.56, amp: 0.12, z: -4.7, width: 0.05, twist: 9, phase: 2.1, day: '#e2001a', night: '#ff2846', dayA: 0.24, nightA: 0.5 },
]
const SEGMENTS = 180
const FOV = (38 * Math.PI) / 180

function build(gl: WebGLRenderingContext, invalidate: () => void): Scene {
  const prog = program(gl, VS, FS)
  const u = uniforms(gl, prog, ['uProj', 'uTime', 'uPhase', 'uAmp', 'uY', 'uZ', 'uWidth', 'uHalfW', 'uLift', 'uTurn', 'uTwist', 'uColor', 'uAlpha', 'uH', 'uW', 'uGlow'] as const)
  const verts = new Float32Array((SEGMENTS + 1) * 4)
  for (let i = 0; i <= SEGMENTS; i++) verts.set([i / SEGMENTS, -1, i / SEGMENTS, 1], i * 4)
  const buf = gl.createBuffer()
  gl.bindBuffer(gl.ARRAY_BUFFER, buf)
  gl.bufferData(gl.ARRAY_BUFFER, verts, gl.STATIC_DRAW)
  const aP = gl.getAttribLocation(prog, 'aP')

  // follow the pointer and the scroll, eased so neither ever jolts
  let pointer = 0
  let turn = 0
  let lift = 0
  const onMove = (e: PointerEvent) => {
    pointer = e.clientX / (window.innerWidth || 1) - 0.5
  }
  window.addEventListener('pointermove', onMove, { passive: true })
  const night = () => document.documentElement.dataset.theme === 'night'
  const still = window.matchMedia('(prefers-reduced-motion: reduce)')
  const themeWatch = new MutationObserver(invalidate)
  themeWatch.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })

  return {
    draw(time, w, h) {
      const aspect = w / h
      const vh = window.innerHeight || h
      // under reduced motion the one still frame neither follows nor drifts
      turn = still.matches ? 0 : turn + (pointer * 0.09 - turn) * 0.06
      lift = still.matches ? 0 : lift + (Math.min(window.scrollY / vh, 6) * 0.55 - lift) * 0.12
      gl.clearColor(0, 0, 0, 0)
      gl.clear(gl.COLOR_BUFFER_BIT)
      gl.enable(gl.BLEND)
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA)
      gl.useProgram(prog)
      gl.bindBuffer(gl.ARRAY_BUFFER, buf)
      gl.enableVertexAttribArray(aP)
      gl.vertexAttribPointer(aP, 2, gl.FLOAT, false, 0, 0)
      gl.uniformMatrix4fv(u.uProj, false, perspective(FOV, aspect, 0.1, 40))
      gl.uniform1f(u.uTime, time)
      gl.uniform1f(u.uHalfW, Math.tan(FOV / 2) * 5 * aspect * 1.35)
      gl.uniform1f(u.uLift, lift)
      gl.uniform1f(u.uTurn, turn)
      gl.uniform1f(u.uH, h)
      gl.uniform1f(u.uW, w)
      const dark = night()
      gl.uniform1f(u.uGlow, dark ? 0.55 : 0.35)
      for (const r of RIBBONS) {
        gl.uniform1f(u.uPhase, r.phase)
        gl.uniform1f(u.uAmp, r.amp)
        gl.uniform1f(u.uY, r.y)
        gl.uniform1f(u.uZ, r.z)
        gl.uniform1f(u.uWidth, r.width)
        gl.uniform1f(u.uTwist, r.twist)
        gl.uniform3fv(u.uColor, rgb(dark ? r.night : r.day))
        gl.uniform1f(u.uAlpha, dark ? r.nightA : r.dayA)
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, (SEGMENTS + 1) * 2)
      }
    },
    dispose() {
      window.removeEventListener('pointermove', onMove)
      themeWatch.disconnect()
      gl.deleteBuffer(buf)
      gl.deleteProgram(prog)
    },
  }
}

/** Mount the ribbons on a full-viewport canvas; returns the teardown. */
export function mountRibbons(canvas: HTMLCanvasElement): () => void {
  // a slow, soft background needs neither retina resolution nor 60fps
  return run(canvas, build, { maxDpr: 1.25, fps: 30, activeFps: 30, stillAt: 6 })
}
