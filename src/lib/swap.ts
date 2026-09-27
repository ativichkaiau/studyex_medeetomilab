import { useCallback, useEffect, useRef } from 'react'
import { flushSync } from 'react-dom'
import { useLocation, useNavigate } from 'react-router-dom'
import { getDim } from './dimension'

/**
 * Page swap — in 3D, changing page rolls the old one away on a drum and the
 * new one in, in the direction of travel through the nav (depth.css animates
 * the View Transition this starts). The sidebar, topbar and assistant are
 * captured as their own layers so they hold still while the page turns; the
 * topbar title flips like a split-flap and the active nav key slides to its
 * new slot.
 *
 * Every in-app link swaps (one delegated click listener), and programmatic
 * navigation can opt in through useSwapNavigate(). Anything else — flat 2D,
 * reduced motion, a hidden tab, no View Transitions, or a dimension swap
 * already in flight — navigates exactly as before.
 */

type TransitionDoc = Document & {
  startViewTransition?: (update: () => void) => { finished: Promise<void> }
}

const REDUCED = '(prefers-reduced-motion: reduce)'
let order: string[] = []

/** The nav order, top to bottom — it decides which way the drum turns. */
export const setRouteOrder = (routes: string[]) => {
  order = routes
}

const rank = (path: string) => order.indexOf(path)

const canSwap = () => {
  const doc = document as TransitionDoc
  return !!doc.startViewTransition && getDim() === '3d' && !window.matchMedia(REDUCED).matches
    && !document.hidden && !document.documentElement.dataset.dimSwap
}

export function runSwap(from: string, to: string, go: () => void) {
  if (from === to || !canSwap()) {
    go()
    return
  }
  const root = document.documentElement
  const a = rank(from)
  const b = rank(to)
  root.dataset.pageSwap = a >= 0 && b >= 0 && b < a ? 'up' : 'down'
  const t = (document as TransitionDoc).startViewTransition!(() => flushSync(go))
  t.finished.finally(() => {
    delete root.dataset.pageSwap
  })
}

/** navigate() that swaps in 3D. */
export function useSwapNavigate() {
  const nav = useNavigate()
  const loc = useLocation()
  const here = useRef(loc.pathname)
  here.current = loc.pathname
  return useCallback((to: string) => runSwap(here.current, to.split(/[?#]/)[0], () => nav(to)), [nav])
}

/**
 * Route every in-app link through the swap. Runs in the capture phase, ahead
 * of React Router's own handler, which then sees defaultPrevented and stands
 * down; the link's other onClick handlers (e.g. closing the drawer) still run.
 */
export function useLinkSwap() {
  const swapTo = useSwapNavigate()
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
      const a = (e.target as Element | null)?.closest?.<HTMLAnchorElement>('a[href^="#/"]')
      if (!a || (a.target && a.target !== '_self') || a.hasAttribute('download') || !canSwap()) return
      e.preventDefault()
      swapTo(a.getAttribute('href')!.slice(1))
    }
    document.addEventListener('click', onClick, true)
    return () => document.removeEventListener('click', onClick, true)
  }, [swapTo])
}
