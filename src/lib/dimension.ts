import { useSyncExternalStore } from 'react'
import { flushSync } from 'react-dom'

/**
 * Dimension — the interface renders flat (2D, the default workstation) or,
 * on request, as a physical one (3D): lit slabs, keycap controls, pointer
 * tilt, a floor to stand on. Everything 3D lives in depth.css behind
 * html[data-dim="3d"], so one attribute swaps between them.
 *
 * It is an external store rather than React state so any component can read
 * it without prop-drilling, and so the swap can run inside a View Transition,
 * which needs the DOM update to happen synchronously inside its callback.
 *
 * Keep KEY and the default in sync with index.html's pre-paint script.
 */
export type Dim = '3d' | '2d'

const KEY = 'williamslab.dim'
const REDUCED = '(prefers-reduced-motion: reduce)'

type TransitionDoc = Document & {
  startViewTransition?: (update: () => void) => { finished: Promise<void> }
}

function saved(): Dim | null {
  try {
    const v = localStorage.getItem(KEY)
    return v === '3d' || v === '2d' ? v : null
  } catch {
    return null
  }
}

// Flat is the default; 3D is opt-in (and remembered once chosen).
const fallback = (): Dim => '2d'

let current: Dim = saved() ?? fallback()
document.documentElement.dataset.dim = current

const listeners = new Set<() => void>()
const subscribe = (fn: () => void) => {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

export const getDim = () => current

export function useDim(): Dim {
  return useSyncExternalStore(subscribe, getDim, getDim)
}

function commit(next: Dim, persist: boolean) {
  current = next
  document.documentElement.dataset.dim = next
  if (persist) {
    try {
      localStorage.setItem(KEY, next)
    } catch {
      // the choice still holds for this session
    }
  }
  listeners.forEach((l) => l())
}

/**
 * Swap dimension live. Where View Transitions exist the browser snapshots the
 * outgoing interface and the CSS in depth.css folds it into the incoming one;
 * otherwise — or for reduced motion, or a hidden tab — the swap is instant.
 */
export function setDim(next: Dim) {
  if (next === current) return
  const doc = document as TransitionDoc
  if (!doc.startViewTransition || window.matchMedia(REDUCED).matches || document.hidden) {
    flushSync(() => commit(next, true))
    return
  }
  const root = document.documentElement
  root.dataset.dimSwap = next
  const t = doc.startViewTransition(() => flushSync(() => commit(next, true)))
  t.finished.finally(() => {
    delete root.dataset.dimSwap
  })
}

export const toggleDim = () => setDim(current === '3d' ? '2d' : '3d')

