import { useRef, type KeyboardEvent, type ReactNode } from 'react'
import { solveFor } from '../core'
import { useApp } from '../app/AppContext'
import type { Tab } from '../app/controller'

const TABS: { id: Tab; label: string }[] = [
  { id: 'sudoku', label: 'Sudoku' },
  { id: 'lettergrid', label: 'Lettergrid' },
]

/** The Sudoku | Lettergrid switch at the top of Home. A dot marks a game whose Daily for today is unsolved. */
export function HomeTabs({ children }: { children: ReactNode }) {
  const { controller, tab, today } = useApp()
  const profile = controller.profile
  const unsolved: Record<Tab, boolean> = {
    sudoku: solveFor(profile.dailyLog, today) === undefined,
    lettergrid: solveFor(profile.lettergridLog, today) === undefined,
  }
  const refs = useRef<Record<Tab, HTMLButtonElement | null>>({ sudoku: null, lettergrid: null })
  const choose = (id: Tab, focus: boolean) => {
    controller.setTab(id)
    if (focus) refs.current[id]?.focus()
  }
  const onKeyDown = (e: KeyboardEvent) => {
    const at = TABS.findIndex((t) => t.id === tab)
    const to =
      e.key === 'ArrowRight' ? (at + 1) % TABS.length : e.key === 'ArrowLeft' ? (at + TABS.length - 1) % TABS.length : e.key === 'Home' ? 0 : e.key === 'End' ? TABS.length - 1 : -1
    if (to < 0) return
    e.preventDefault()
    choose(TABS[to].id, true)
  }
  return (
    <>
      <div className="tabs" role="tablist" aria-label="Game" onKeyDown={onKeyDown}>
        {TABS.map((t) => (
          <button
            key={t.id}
            ref={(el) => {
              refs.current[t.id] = el
            }}
            type="button"
            role="tab"
            id={`tab-${t.id}`}
            aria-selected={tab === t.id}
            aria-controls={tab === t.id ? 'home-panel' : undefined}
            tabIndex={tab === t.id ? 0 : -1}
            className={`tab${tab === t.id ? ' selected' : ''}`}
            onClick={() => choose(t.id, false)}
          >
            {t.label}
            {unsolved[t.id] && (
              <>
                <span className="tab-dot" aria-hidden="true" />
                <span className="sr-only">, today&apos;s Daily Puzzle unsolved</span>
              </>
            )}
          </button>
        ))}
      </div>
      <div role="tabpanel" id="home-panel" aria-labelledby={`tab-${tab}`} className="tab-panel">
        {children}
      </div>
    </>
  )
}
