import { useEffect } from 'react'
import { useDim } from './dimension'

/**
 * Tilt field — in 3D, the surface under the pointer behaves like a physical
 * slab: it lifts, leans toward the cursor, and catches the light where the
 * cursor is. One delegated listener covers every page; nothing is wired per
 * component, so new pages get it for free.
 *
 * Just as deliberate about when NOT to move things:
 * - mouse only — a touch has no hover to follow;
 * - never while a button is held — moving what you're selecting or dragging
 *   out from under the cursor is hostile;
 * - never the surface you're typing in;
 * - never the knowledge graph: GraphView maps pointer → SVG space with
 *   getScreenCTM(), which ignores 3D perspective, so a tilted ancestor would
 *   skew its drags and zoom-to-cursor;
 * - never a slab taller than the screen — tipping a surface whose edges you
 *   can't see just reads as the page wobbling, and lifting one costs a full
 *   re-render of it; the smaller surfaces inside it tilt on their own instead;
 * - never while the page scrolls under a still pointer.
 */

// Surfaces that behave as slabs. The outermost one under the pointer tilts; a
// smaller surface nested inside it lifts off the slab instead.
const SURFACES = [
  '.card', '.stat', '.overview-stats', '.preset', '.screen-rec', '.finding',
  '.tbl-scroll', '.theory-sec', '.project-tab', '.quiz-panel', '.quiz-opt',
  '.pico-cell', '.session-item', '.publication-watch', '.evidence-passage',
  '.ecg-monitor',
].join(',')
const HANDS_OFF = '[data-no-tilt],.graph-canvas,.graph-svg'
const EDITABLE = 'input,textarea,select,[contenteditable="true"],[contenteditable=""]'
const VARS = ['--rx', '--ry', '--mx', '--my', '--tp']

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

export function useTiltField() {
  const dim = useDim()
  useEffect(() => {
    if (dim !== '3d') return
    const fine = window.matchMedia('(hover: hover) and (pointer: fine)')
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)')

    let active: HTMLElement | null = null
    let lifted: HTMLElement | null = null
    let raf = 0
    let px = 0
    let py = 0
    let held = false
    // what the active slab was last given, so a frame that changes nothing
    // writes nothing (and so restyles and repaints nothing)
    const written = new Map<string, string>()

    const release = () => {
      if (active) {
        active.classList.remove('tilting')
        for (const v of VARS) active.style.removeProperty(v)
      }
      lifted?.classList.remove('lifted')
      active = null
      lifted = null
      written.clear()
    }

    const write = (el: HTMLElement, name: string, value: string) => {
      if (written.get(name) === value) return
      written.set(name, value)
      el.style.setProperty(name, value)
    }

    const frame = () => {
      raf = 0
      if (!active) return
      if (!active.isConnected) {
        release()
        return
      }
      const r = active.getBoundingClientRect()
      if (!r.width || !r.height) return
      const nx = clamp(((px - r.left) / r.width) * 2 - 1, -1, 1)
      const ny = clamp(((py - r.top) / r.height) * 2 - 1, -1, 1)
      const size = Math.max(r.width, r.height)
      // heavier slabs lean less: ~10° for a stat tile, ~3° for a full-width
      // card; one taller than the screen only lifts, and its light stays put
      const tall = r.height > (window.innerHeight || 800) * 1.1
      const lean = tall ? 0 : clamp(3400 / size, 1.5, 10)
      write(active, '--ry', `${(nx * lean).toFixed(1)}deg`)
      write(active, '--rx', `${(-ny * lean).toFixed(1)}deg`)
      // The lean is a transform, which the compositor applies to the slab as
      // already drawn. The light is painted into the slab, so every move of it
      // repaints the whole slab: it moves in 4% steps, finer than the soft
      // pool of light could show.
      write(active, '--mx', `${tall ? 50 : Math.round((nx + 1) * 12.5) * 4}%`)
      write(active, '--my', `${tall ? 20 : Math.round((ny + 1) * 12.5) * 4}%`)
      // pull the camera back from big slabs so their near edge doesn't balloon
      write(active, '--tp', `${Math.round(Math.max(800, size * 1.8) / 50) * 50}px`)
    }
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(frame)
    }

    // The outermost surface that fits on screen tilts. One taller than that
    // never visibly leans, and making it a 3D layer only to lift it means the
    // browser re-renders all of it on the way in and again on the way out;
    // inside one, the smaller surfaces tilt on their own instead.
    let lastInner: HTMLElement | null = null
    let lastPair: [HTMLElement | null, HTMLElement | null] = [null, null]
    const surfacesAt = (t: Element): [HTMLElement | null, HTMLElement | null] => {
      const inner = t.closest<HTMLElement>(SURFACES)
      if (!inner || !inner.closest('.content')) return [null, null]
      // measured once per surface entered, not on every pointer move
      if (inner === lastInner && lastPair[0]?.isConnected) return lastPair
      const fits = (window.innerHeight || 800) * 0.9
      let outer: HTMLElement | null = null
      for (let s: HTMLElement | null = inner; s; s = s.parentElement?.closest<HTMLElement>(SURFACES) ?? null) {
        if (s.getBoundingClientRect().height <= fits) outer = s
        else break
      }
      lastInner = inner
      lastPair = [outer, outer ? inner : null]
      return lastPair
    }

    const track = (t: Element | null) => {
      if (held || !t || !fine.matches || reduce.matches || t.closest(HANDS_OFF)) {
        release()
        return
      }
      const [outer, inner] = surfacesAt(t)
      const focus = document.activeElement
      if (!outer || (focus && focus.matches(EDITABLE) && outer.contains(focus))) {
        release()
        return
      }
      if (outer !== active) {
        release()
        active = outer
        active.classList.add('tilting')
      }
      const next = inner && inner !== outer ? inner : null
      if (next !== lifted) {
        lifted?.classList.remove('lifted')
        lifted = next
        lifted?.classList.add('lifted')
      }
      schedule()
    }

    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return
      px = e.clientX
      py = e.clientY
      track(e.target as Element | null)
    }
    // Scrolling slides the page under a still pointer: the slab settles, and
    // nothing new tilts until the pointer itself moves again. Picking up each
    // card as it passes would mean re-rendering it into a layer of its own
    // and back, mid-scroll.
    const onScroll = () => {
      lastInner = null
      release()
    }
    const onDown = () => {
      held = true
      release()
    }
    const onUp = (e: PointerEvent) => {
      held = false
      if (e.pointerType === 'mouse') track(document.elementFromPoint(e.clientX, e.clientY))
    }
    // focus can move into an editable field without the pointer moving at all
    const retrack = () => {
      if (active || lifted) track(document.elementFromPoint(px, py))
    }

    const de = document.documentElement
    window.addEventListener('pointermove', onMove, { passive: true })
    window.addEventListener('pointerdown', onDown, { passive: true })
    window.addEventListener('pointerup', onUp, { passive: true })
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('blur', release)
    de.addEventListener('pointerleave', release)
    document.addEventListener('focusin', retrack)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerdown', onDown)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('blur', release)
      de.removeEventListener('pointerleave', release)
      document.removeEventListener('focusin', retrack)
      if (raf) cancelAnimationFrame(raf)
      release()
    }
  }, [dim])
}
