import { useEffect, useLayoutEffect, useState } from 'react'

const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

/** Viewport height, or 0 when the environment reports nothing usable
 *  (a hidden or occluded tab, a headless capture, a zero-size embed). */
const viewportH = () => document.documentElement.clientHeight || window.innerHeight || 0

/**
 * Livery motion — viewport entrances and scroll telemetry.
 *
 * Driven here rather than with CSS scroll timelines: the app's root is
 * height-constrained (html,body,#root{height:100%}), so scroll()/view() can't
 * resolve a scrollport against it.
 *
 * Effects are no-ops under prefers-reduced-motion, and none may assume
 * the first measurement it takes is usable: a hidden tab delivers no animation
 * frames and can report a zero client height, so both re-sync when the document
 * becomes visible or is resized.
 */
export function useLiveryMotion(routeKey: string) {
  const [motionEnabled, setMotionEnabled] = useState(() => !reduced())

  // Respond immediately when the OS preference changes, including while a
  // section is waiting to enter. Stop decorative loops in background tabs.
  useEffect(() => {
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)')
    const syncPreference = () => setMotionEnabled(!preference.matches)
    const syncVisibility = () => {
      document.documentElement.toggleAttribute('data-motion-paused', document.hidden)
    }
    syncPreference()
    syncVisibility()
    preference.addEventListener('change', syncPreference)
    document.addEventListener('visibilitychange', syncVisibility)
    return () => {
      preference.removeEventListener('change', syncPreference)
      document.removeEventListener('visibilitychange', syncVisibility)
      document.documentElement.removeAttribute('data-motion-paused')
    }
  }, [])

  // page scroll reads out along the livery bar under the topbar
  useEffect(() => {
    if (!motionEnabled) return
    const de = document.documentElement
    let raf = 0

    const update = () => {
      raf = 0
      const max = de.scrollHeight - viewportH()
      const p = max > 8 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0
      de.style.setProperty('--scroll-progress', p.toFixed(4))
    }

    // A hidden document never delivers animation frames, so a plain rAF latch
    // would stick on and freeze the bar for the life of the page. Write through
    // directly instead, and re-sync on the way back to visible.
    const schedule = () => {
      if (document.hidden) {
        if (raf) { cancelAnimationFrame(raf); raf = 0 }
        update()
        return
      }
      if (!raf) raf = requestAnimationFrame(update)
    }

    update()
    window.addEventListener('scroll', schedule, { passive: true })
    window.addEventListener('resize', schedule)
    document.addEventListener('visibilitychange', schedule)
    return () => {
      window.removeEventListener('scroll', schedule)
      window.removeEventListener('resize', schedule)
      document.removeEventListener('visibilitychange', schedule)
      if (raf) cancelAnimationFrame(raf)
      de.style.removeProperty('--scroll-progress')
    }
  }, [motionEnabled, routeKey])

  // the page itself acknowledges a route change (unless a 3D page swap is
  // already carrying it in — see lib/swap.ts)
  useEffect(() => {
    if (!motionEnabled || document.documentElement.dataset.pageSwap) return
    const el = document.querySelector<HTMLElement>('.content')
    if (!el) return
    // restart the animation: drop the class, force a reflow, re-add
    el.classList.remove('lv-route')
    void el.offsetWidth
    el.classList.add('lv-route')
    return () => el.classList.remove('lv-route')
  }, [routeKey, motionEnabled])

  // Stagger the initial viewport before paint; reveal later sections only when
  // reached. Pending sections stay readable even if an observer never fires.
  useLayoutEffect(() => {
    if (!motionEnabled || !('IntersectionObserver' in window)) return

    let io: IntersectionObserver | null = null
    let mutations: MutationObserver | null = null
    const armed = new Set<HTMLElement>()
    const root = document.querySelector<HTMLElement>('.content')
    if (!root) return
    const surfaces = '.card, .overview-stats, .grid:not(.overview-stats) > .stat, .tbl-scroll, .theory-sec, .screen-rec, .finding'

    const reveal = (el: HTMLElement, delay = 0) => {
      el.style.setProperty('--reveal-delay', `${delay}ms`)
      el.classList.remove('lv-pending')
      el.classList.add('lv-show')
      io?.unobserve(el)
    }

    const arm = () => {
      // Wait for a usable viewport; pending sections keep their normal styles.
      const vh = viewportH()
      if (vh < 200 || document.hidden) return false

      const obs = new IntersectionObserver(
        (entries) => {
          entries.filter((e) => e.isIntersecting)
            .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)
            .forEach((e, i) => reveal(e.target as HTMLElement, Math.min(i * 80, 240)))
        },
        { rootMargin: '0px 0px -24px 0px' },
      )
      io = obs

      const collect = () => {
        // A 3D page swap rolls the whole page in; sections already on screen
        // arrive with it rather than each fading up inside the rolling page.
        // Read per collection: cards that arrive later still get an entrance.
        const swapping = !!document.documentElement.dataset.pageSwap
        const targets = Array.from(root.querySelectorAll<HTMLElement>(surfaces))
          .filter((el) => !armed.has(el) && !el.parentElement?.closest(surfaces))
          .map((el) => ({ el, rect: el.getBoundingClientRect() }))
        let visibleIndex = 0
        for (const { el, rect } of targets) {
          armed.add(el)
          if (rect.bottom <= 64) continue
          if (rect.top < viewportH() - 24) {
            if (!swapping) reveal(el, 90 + Math.min(visibleIndex++ * 90, 360))
          } else {
            el.classList.add('lv-pending')
            obs.observe(el)
          }
        }
      }
      collect()
      // New cards from filters or async data get the same entrance without
      // replaying existing sections when a field's text changes.
      mutations = new MutationObserver((records) => {
        if (records.some((r) => Array.from(r.addedNodes).some((n) =>
          n instanceof HTMLElement && (n.matches(surfaces) || n.querySelector(surfaces)),
        ))) collect()
      })
      mutations.observe(root, { childList: true, subtree: true })
      return true
    }

    const revealFocused = (event: FocusEvent) => {
      const el = (event.target as HTMLElement).closest<HTMLElement>('.lv-pending,.lv-show')
      if (!el) return
      // Settle permanently on interaction, rather than toggling animation:none
      // with :focus-within and accidentally replaying the entrance on blur.
      io?.unobserve(el)
      el.classList.remove('lv-pending', 'lv-show')
      el.style.removeProperty('--reveal-delay')
    }
    root.addEventListener('focusin', revealFocused)

    // Arming fails on a tab that is hidden or not yet laid out; retry when the
    // environment reports something we can actually measure against.
    let retry: (() => void) | null = null
    const detachRetry = () => {
      if (!retry) return
      window.removeEventListener('resize', retry)
      document.removeEventListener('visibilitychange', retry)
      retry = null
    }
    if (!arm()) {
      retry = () => { if (arm()) detachRetry() }
      window.addEventListener('resize', retry)
      document.addEventListener('visibilitychange', retry)
    }

    return () => {
      detachRetry()
      io?.disconnect()
      mutations?.disconnect()
      root.removeEventListener('focusin', revealFocused)
      for (const el of armed) {
        el.classList.remove('lv-pending', 'lv-show')
        el.style.removeProperty('--reveal-delay')
      }
    }
  }, [routeKey, motionEnabled])
}
