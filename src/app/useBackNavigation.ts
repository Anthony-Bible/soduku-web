import { useEffect, useRef } from 'react'
import { closeTopModalOnBack } from '../ui/useFocusTrap'
import type { AppController } from './controller'

/**
 * Wires the system Back gesture/button to the app's own screens: the Game screen and every Sheet get a
 * history entry, so Back closes the Sheet or returns Home instead of leaving the app.
 */
export function useBackNavigation(controller: AppController, level: number): void {
  const pushed = useRef(0)
  const ignorePop = useRef(0)
  const rewound = useRef(false)

  useEffect(() => {
    // After a reload, the browser keeps our old pushState entries while the app restarts at Home.
    // Rewind past them so the next Back leaves the app instead of landing on a dead entry.
    try {
      const stale = (window.history.state as { sudokuLevel?: unknown } | null)?.sudokuLevel
      if (!rewound.current && typeof stale === 'number' && stale > 0 && pushed.current === 0) {
        rewound.current = true
        ignorePop.current++
        window.history.go(-stale)
      }
    } catch {
      // History unavailable.
    }
  }, [])

  useEffect(() => {
    const onPop = () => {
      if (ignorePop.current > 0) {
        ignorePop.current--
        return
      }
      if (pushed.current === 0) return
      if (closeTopModalOnBack()) {
        try {
          window.history.pushState({ sudokuLevel: pushed.current }, '')
        } catch {
          // ignore
        }
        return
      }
      pushed.current--
      const { sheet } = controller.getSnapshot()
      if (sheet) controller.openSheet(null)
      else controller.goHome()
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [controller])

  useEffect(() => {
    try {
      while (pushed.current < level) {
        window.history.pushState({ sudokuLevel: pushed.current + 1 }, '')
        pushed.current++
      }
      if (pushed.current > level) {
        const n = pushed.current - level
        pushed.current = level
        ignorePop.current++
        window.history.go(-n)
      }
    } catch {
      // History unavailable: Back just leaves the page.
    }
  }, [level])
}
