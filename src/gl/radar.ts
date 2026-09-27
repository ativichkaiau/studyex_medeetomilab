import { run, program, uniforms, perspective, multiply, translation, rotationX, rotationY, project, orbit, rgb, type Scene } from './core'

/**
 * The Literature Radar, as a radar: a scope lying in front of you with a beam
 * sweeping round it, and every result from your searches as a contact on it.
 * Where a contact sits means something — its sector is the database it came
 * from, its distance from the centre is its age (this year at the middle,
 * twenty-five years out at the rim) — and once AI triage has judged it, it
 * stands up as a pillar in the verdict's colour, taller the more it belongs.
 * Contacts flare as the beam passes. Hover for the title; click to find it
 * in the lists below.
 */

export interface Contact {
  key: string
  title: string
  year?: number
  sector: number
  verdict?: 'include' | 'maybe' | 'exclude'
  fresh?: boolean
}
export interface RadarModel {
  contacts: Contact[]
  sectors: string[]
  now: number
}
export interface RadarApi {
  update(m: RadarModel): void
  stop(): void
}

const FOV = (34 * Math.PI) / 180
const SWEEP = 0.9 // radians per second
const SPAN_YEARS = 25

/** how far out a contact sits: newest in the middle, 25+ years at the rim */
export const radiusFor = (year: number | undefined, now: number) =>
  year ? 0.12 + 0.84 * Math.pow(Math.min(1, Math.max(0, now - year) / SPAN_YEARS), 0.75) : 0.98
/** the range rings, as ages in years (the last is the rim) */
export const RING_AGES = [5, 10, 20, SPAN_YEARS]

function hash(s: string) {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return (h >>> 0) / 4294967296
}

const DISC_VS = `
attribute vec2 aP;
uniform mat4 uMvp;
varying vec2 vP;
void main() { vP = aP; gl_Position = uMvp * vec4(aP.x, 0.0, aP.y, 1.0); }`
// the sweep angle is wrapped on the CPU, so mediump is plenty here
const DISC_FS = `
precision mediump float;
uniform float uSweep, uSectors;
uniform vec4 uRings;
varying vec2 vP;
const float TAU = 6.2831853;
float line(float d, float w) { return 1.0 - smoothstep(0.0, w, abs(d)); }
void main() {
  float r = length(vP);
  if (r > 1.03) discard;
  float a = atan(vP.y, vP.x);
  if (a < 0.0) a += TAU;
  vec3 col = mix(vec3(0.05, 0.1, 0.27), vec3(0.016, 0.04, 0.11), smoothstep(0.0, 1.0, r));
  float rings = max(max(line(r - uRings.x, 0.005), line(r - uRings.y, 0.005)), line(r - uRings.z, 0.005));
  float spokes = 0.0;
  for (int i = 0; i < 4; i++) {
    float sa = float(i) * TAU / max(uSectors, 1.0);
    if (float(i) < uSectors) spokes = max(spokes, line(sin(a - sa) * r, 0.004) * step(0.0, cos(a - sa)));
  }
  float trail = mod(uSweep - a, TAU);
  float beam = exp(-trail * 2.6) * smoothstep(1.02, 0.9, r);
  float edge = line(trail, 0.035) * smoothstep(1.02, 0.95, r);
  float rim = line(r - uRings.w, 0.012);
  col += vec3(0.35, 0.5, 1.0) * rings * 0.35 + vec3(0.35, 0.5, 1.0) * spokes * 0.3;
  col += vec3(0.1, 0.9, 0.55) * beam * 0.34 + vec3(0.6, 1.0, 0.8) * edge * 0.6;
  col += vec3(1.0, 0.8, 0.0) * rim * 0.6;
  float alpha = smoothstep(1.03, 1.0, r);
  gl_FragColor = vec4(col * alpha, alpha);
}`
const LINE_VS = `
attribute vec3 aP;
attribute vec4 aC;
uniform mat4 uMvp;
varying vec4 vC;
void main() { vC = aC; gl_Position = uMvp * vec4(aP, 1.0); }`
const LINE_FS = `
precision mediump float;
varying vec4 vC;
void main() { gl_FragColor = vC; }`
const BLIP_VS = `
attribute vec3 aP;
attribute vec4 aC;
attribute float aSize;
uniform mat4 uMvp;
varying vec4 vC;
void main() { vC = aC; gl_PointSize = aSize; gl_Position = uMvp * vec4(aP, 1.0); }`
const BLIP_FS = `
precision mediump float;
varying vec4 vC;
void main() {
  float r = length(gl_PointCoord - 0.5) * 2.0;
  float core = smoothstep(0.55, 0.2, r);
  float halo = exp(-r * r * 3.0) * 0.7;
  float a = clamp(core + halo, 0.0, 1.0) * vC.a;
  vec3 c = mix(vC.rgb, vec3(1.0), core * 0.55);
  gl_FragColor = vec4(c * a, a);
}`

const VERDICT: Record<string, { color: string; height: number }> = {
  include: { color: '#12d68f', height: 0.3 },
  maybe: { color: '#ffb020', height: 0.19 },
  exclude: { color: '#ff3b52', height: 0.08 },
  none: { color: '#5ad1ff', height: 0.035 },
}

export function mountRadar(canvas: HTMLCanvasElement, overlay: HTMLElement, onPick: (key: string) => void): RadarApi {
  let model: RadarModel | null = null
  let dirty = true
  let repaint = () => {}
  const still = window.matchMedia('(prefers-reduced-motion: reduce)')

  const build = (gl: WebGLRenderingContext, invalidate: () => void): Scene => {
    repaint = invalidate
    dirty = true
    const disc = program(gl, DISC_VS, DISC_FS)
    const du = uniforms(gl, disc, ['uMvp', 'uSweep', 'uSectors', 'uRings'] as const)
    const da = gl.getAttribLocation(disc, 'aP')
    const line = program(gl, LINE_VS, LINE_FS)
    const lu = uniforms(gl, line, ['uMvp'] as const)
    const la = { p: gl.getAttribLocation(line, 'aP'), c: gl.getAttribLocation(line, 'aC') }
    const blip = program(gl, BLIP_VS, BLIP_FS)
    const bu = uniforms(gl, blip, ['uMvp'] as const)
    const ba = { p: gl.getAttribLocation(blip, 'aP'), c: gl.getAttribLocation(blip, 'aC'), s: gl.getAttribLocation(blip, 'aSize') }
    const bufs = { disc: gl.createBuffer()!, pillars: gl.createBuffer()!, blips: gl.createBuffer()! }
    gl.bindBuffer(gl.ARRAY_BUFFER, bufs.disc)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1.05, -1.05, 1.05, -1.05, -1.05, 1.05, 1.05, 1.05]), gl.STATIC_DRAW)
    const cam = orbit(canvas, invalidate, { yaw: 0, pitch: 0.95, minPitch: 0.35, maxPitch: 1.45 })
    let placed: { key: string; x: number; z: number; h: number; angle: number; color: number[]; fresh: boolean }[] = []
    let screen: { key: string; x: number; y: number }[] = []
    const tip = overlay.querySelector<HTMLElement>('.rs-tip')
    let hover: { x: number; y: number } | null = null

    const place = (m: RadarModel) => {
      const span = (Math.PI * 2) / Math.max(1, m.sectors.length)
      placed = m.contacts.map((c) => {
        const u = hash(c.key)
        const angle = c.sector * span + (0.1 + 0.8 * u) * span
        const r = radiusFor(c.year, m.now)
        const v = VERDICT[c.verdict ?? 'none']
        return { key: c.key, x: Math.cos(angle) * r, z: Math.sin(angle) * r, h: v.height, angle, color: rgb(v.color), fresh: !!c.fresh }
      })
      // pillars: a line from the scope up to each contact
      const p: number[] = []
      for (const c of placed) p.push(c.x, 0, c.z, ...c.color.map((x) => x * 0.55), 0.55, c.x, c.h, c.z, ...c.color.map((x) => x * 0.55), 0.55)
      gl.bindBuffer(gl.ARRAY_BUFFER, bufs.pillars)
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(p), gl.STATIC_DRAW)
    }

    let downAt: [number, number] | null = null
    const down = (e: PointerEvent) => {
      downAt = [e.clientX, e.clientY]
    }
    const nearest = (x: number, y: number) => {
      let best: string | null = null
      let bestD = 16
      for (const s of screen) {
        const d = Math.hypot(s.x - x, s.y - y)
        if (d < bestD) {
          bestD = d
          best = s.key
        }
      }
      return best
    }
    const click = (e: MouseEvent) => {
      if (!downAt || Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > 5) return
      const r = canvas.getBoundingClientRect()
      const k = nearest(e.clientX - r.left, e.clientY - r.top)
      if (k) onPick(k)
    }
    const move = (e: PointerEvent) => {
      if (e.buttons) return
      const r = canvas.getBoundingClientRect()
      hover = { x: e.clientX - r.left, y: e.clientY - r.top }
      invalidate()
    }
    const leave = () => {
      hover = null
      invalidate()
    }
    canvas.addEventListener('pointerdown', down)
    canvas.addEventListener('click', click)
    canvas.addEventListener('pointermove', move)
    canvas.addEventListener('pointerleave', leave)

    return {
      draw(time, w, h, dpr) {
        if (!model) return
        if (dirty) {
          place(model)
          dirty = false
        }
        cam.step()
        const sweep = still.matches ? 0.9 : (time * SWEEP) % (Math.PI * 2)
        const aspect = w / h
        // far enough back, and lifted, that the near rim and its labels stay on screen
        const dist = 3.35 + Math.max(0, 1.6 - aspect) * 1.8
        const view = multiply(translation(0, 0.14, -dist), multiply(rotationX(cam.pitch), rotationY(cam.yaw)))
        const mvp = multiply(perspective(FOV, aspect, 0.1, 20), view)

        gl.clearColor(0, 0, 0, 0)
        gl.clear(gl.COLOR_BUFFER_BIT)
        gl.enable(gl.BLEND)
        gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA)

        gl.useProgram(disc)
        gl.uniformMatrix4fv(du.uMvp, false, mvp)
        gl.uniform1f(du.uSweep, sweep)
        gl.uniform1f(du.uSectors, model.sectors.length)
        const now = model.now
        gl.uniform4fv(du.uRings, RING_AGES.map((age) => radiusFor(now - age, now)))
        gl.bindBuffer(gl.ARRAY_BUFFER, bufs.disc)
        gl.enableVertexAttribArray(da)
        gl.vertexAttribPointer(da, 2, gl.FLOAT, false, 0, 0)
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
        gl.disableVertexAttribArray(da)

        if (placed.length) {
          gl.useProgram(line)
          gl.uniformMatrix4fv(lu.uMvp, false, mvp)
          gl.bindBuffer(gl.ARRAY_BUFFER, bufs.pillars)
          gl.enableVertexAttribArray(la.p)
          gl.enableVertexAttribArray(la.c)
          gl.vertexAttribPointer(la.p, 3, gl.FLOAT, false, 28, 0)
          gl.vertexAttribPointer(la.c, 4, gl.FLOAT, false, 28, 12)
          gl.drawArrays(gl.LINES, 0, placed.length * 2)
          gl.disableVertexAttribArray(la.p)
          gl.disableVertexAttribArray(la.c)

          // blips flare as the beam crosses them, then fade like phosphor
          const data = new Float32Array(placed.length * 8)
          placed.forEach((c, i) => {
            const since = ((sweep - c.angle) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2)
            const flare = still.matches ? 0.5 : Math.exp(-since * 1.4)
            const pulse = c.fresh && !still.matches ? 0.5 + 0.5 * Math.sin(time * 5) : 0
            data.set([c.x, c.h, c.z, ...c.color, 0.55 + 0.45 * flare, (9 + 9 * flare + 5 * pulse) * dpr], i * 8)
          })
          gl.useProgram(blip)
          gl.uniformMatrix4fv(bu.uMvp, false, mvp)
          gl.bindBuffer(gl.ARRAY_BUFFER, bufs.blips)
          gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW)
          ;[ba.p, ba.c, ba.s].forEach((l) => gl.enableVertexAttribArray(l))
          gl.vertexAttribPointer(ba.p, 3, gl.FLOAT, false, 32, 0)
          gl.vertexAttribPointer(ba.c, 4, gl.FLOAT, false, 32, 12)
          gl.vertexAttribPointer(ba.s, 1, gl.FLOAT, false, 32, 28)
          gl.drawArrays(gl.POINTS, 0, placed.length)
          ;[ba.p, ba.c, ba.s].forEach((l) => gl.disableVertexAttribArray(l))
        }

        // labels and picking, in CSS pixels
        const cw = w / dpr
        const ch = h / dpr
        screen = []
        for (const c of placed) {
          const p = project(mvp, c.x, c.h, c.z, cw, ch)
          if (p) screen.push({ key: c.key, x: p[0], y: p[1] })
        }
        const span = (Math.PI * 2) / Math.max(1, model.sectors.length)
        for (const el of overlay.querySelectorAll<HTMLElement>('[data-sector]')) {
          const a = (Number(el.dataset.sector) + 0.5) * span
          const p = project(mvp, Math.cos(a) * 1.13, 0, Math.sin(a) * 1.13, cw, ch)
          if (p) el.style.transform = `translate(${p[0].toFixed(1)}px, ${p[1].toFixed(1)}px)`
        }
        overlay.querySelectorAll<HTMLElement>('[data-ring]').forEach((el, i) => {
          // each ring's year a little further round, so the outer two never collide
          const r = radiusFor(now - Number(el.dataset.ring), now)
          const a = -0.28 - i * 0.17
          const p = project(mvp, Math.cos(a) * r, 0, Math.sin(a) * r, cw, ch)
          if (p) el.style.transform = `translate(${p[0].toFixed(1)}px, ${p[1].toFixed(1)}px)`
        })
        if (tip) {
          const k = hover ? nearest(hover.x, hover.y) : null
          const c = k ? model.contacts.find((x) => x.key === k) : null
          const s = k ? screen.find((x) => x.key === k) : null
          canvas.style.cursor = c ? 'pointer' : ''
          if (c && s) {
            tip.textContent = `${c.title}${c.year ? ` · ${c.year}` : ''}`
            tip.style.transform = `translate(${s.x.toFixed(1)}px, ${s.y.toFixed(1)}px)`
            tip.style.opacity = '1'
          } else tip.style.opacity = '0'
        }
      },
      dispose() {
        cam.dispose()
        canvas.removeEventListener('pointerdown', down)
        canvas.removeEventListener('click', click)
        canvas.removeEventListener('pointermove', move)
        canvas.removeEventListener('pointerleave', leave)
        Object.values(bufs).forEach((b) => gl.deleteBuffer(b))
        ;[disc, line, blip].forEach((p) => gl.deleteProgram(p))
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
    stop,
  }
}
