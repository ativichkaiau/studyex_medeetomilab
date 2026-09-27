import { useCallback, useEffect, useRef } from 'react'
import { flushSync } from 'react-dom'
import { useLocation, useNavigate } from 'react-router-dom'
import { getDim } from './dimension'
import { prefetchRoute } from '../routes'

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

/**
 * One card's moment, when a decision changes it: in 3D the card flies off if
 * the change takes it out of the list (a screening record leaving its
 * filter), or turns over to show its new state if it stays (a finding
 * resolved, a hypothesis re-graded). signatures.css animates it by `kind`;
 * the rest of the page holds still. Plain update wherever a page swap
 * wouldn't run.
 */
export function cardSwap(el: Element | null, kind: string, update: () => void) {
  if (!(el instanceof HTMLElement) || !canSwap() || document.documentElement.dataset.pageSwap) {
    update()
    return
  }
  const root = document.documentElement
  el.style.setProperty('view-transition-name', 'card-swap')
  root.dataset.cardSwap = kind
  const t = (document as TransitionDoc).startViewTransition!(() => flushSync(update))
  t.finished.finally(() => {
    delete root.dataset.cardSwap
    el.style.removeProperty('view-transition-name')
  })
}

/** navigate() that swaps in 3D. */
export function useSwapNavigate() {
  const nav = useNavigate()
  const loc = useLocation()
  const here = useRef(loc.pathname)
  here.current = loc.pathname
  return useCallback((to: string) => {
    const path = to.split(/[?#]/)[0]
    prefetchRoute(path)
    runSwap(here.current, path, () => nav(to))
  }, [nav])
}

/**
 * Route every in-app link through the swap. Runs in the capture phase, ahead
 * of React Router's own handler, which then sees defaultPrevented and stands
 * down; the link's other onClick handlers (e.g. closing the drawer) still run.
 * Hovering or focusing a link starts loading its page, so the swap can carry
 * the page itself.
 */
export function useLinkSwap() {
  const swapTo = useSwapNavigate()
  useEffect(() => {
    const onIntent = (e: Event) => {
      const a = (e.target as Element | null)?.closest?.<HTMLAnchorElement>('a[href^="#/"]')
      if (a) prefetchRoute(a.getAttribute('href')!.slice(1).split(/[?#]/)[0])
    }
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
      const a = (e.target as Element | null)?.closest?.<HTMLAnchorElement>('a[href^="#/"]')
      if (!a || (a.target && a.target !== '_self') || a.hasAttribute('download') || !canSwap()) return
      e.preventDefault()
      swapTo(a.getAttribute('href')!.slice(1))
    }
    document.addEventListener('click', onClick, true)
    document.addEventListener('pointerover', onIntent, { passive: true })
    document.addEventListener('focusin', onIntent)
    return () => {
      document.removeEventListener('click', onClick, true)
      document.removeEventListener('pointerover', onIntent)
      document.removeEventListener('focusin', onIntent)
    }
  }, [swapTo])
}
