import { useState, type ReactNode } from 'react'
import {
  addDays, addMonths, dayOfMonth, daysInMonth, firstOfMonth, longTitle, monthTitle, solveFor, weekdayOf,
  type CalendarDay, type DailyLog, type SolveKind,
} from '../core'
import { Icon } from './Icon'

const WEEKDAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S']

function status(solve: SolveKind | undefined, isFuture: boolean): string {
  if (solve === 'onDay') return 'solved on the day'
  if (solve === 'catchUp') return 'solved later'
  return isFuture ? 'not available yet' : 'not solved'
}

/**
 * The month view both games' Calendars share: On-Day Solves filled, Catch-Up Solves outlined, future days
 * locked. An unsolved day is opened with `onOpen`; a solved day is selected, and `children` (the result) show
 * beneath the grid for the selected day.
 */
export function CalendarMonth({ log, today, inProgress, extra, badge, selected, onSelect, onOpen, children }: {
  log: DailyLog
  today: CalendarDay
  inProgress: (day: CalendarDay) => boolean
  /** Extra words for a day's accessible name, e.g. its stars. */
  extra?: (day: CalendarDay) => string
  /** Small text drawn inside a solved day's circle. */
  badge?: (day: CalendarDay) => string
  selected: CalendarDay | null
  onSelect: (day: CalendarDay | null) => void
  onOpen: (day: CalendarDay) => void
  children?: ReactNode
}) {
  const [month, setMonth] = useState<CalendarDay>(firstOfMonth(today))
  const canGoForward = month < firstOfMonth(today)
  const changeMonth = (m: CalendarDay) => {
    setMonth(firstOfMonth(m))
    onSelect(null)
  }
  return (
    <>
      <div className="month-header">
        <button type="button" className="icon-btn" aria-label="Previous month" onClick={() => changeMonth(addMonths(month, -1))}>
          <Icon name="left" />
        </button>
        <h3 aria-live="polite">{monthTitle(month)}</h3>
        <button type="button" className="icon-btn" aria-label="Next month" disabled={!canGoForward} onClick={() => changeMonth(addMonths(month, 1))}>
          <Icon name="right" />
        </button>
      </div>
      <div className="cal-grid">
        {WEEKDAYS.map((w, i) => (
          <span key={i} className="cal-weekday" aria-hidden="true">{w}</span>
        ))}
        {Array.from({ length: weekdayOf(month) }, (_, i) => <span key={`pad${i}`} />)}
        {Array.from({ length: daysInMonth(month) }, (_, i) => {
          const day = addDays(month, i)
          const solve = solveFor(log, day)
          const isFuture = day > today
          const underway = solve === undefined && !isFuture && inProgress(day)
          const more = solve !== undefined ? extra?.(day) : undefined
          return (
            <button
              key={day}
              type="button"
              className={`cal-day${solve ? ` ${solve}` : ''}${day === today ? ' today' : ''}`}
              disabled={isFuture}
              aria-label={`${longTitle(day)}, ${status(solve, isFuture)}${more ? `, ${more}` : ''}${underway ? ', in progress' : ''}`}
              aria-pressed={solve === undefined ? undefined : day === selected}
              onClick={() => (solve === undefined ? onOpen(day) : onSelect(day))}
            >
              {dayOfMonth(day)}
              {underway && <i className="dot" />}
              {solve !== undefined && badge && <span className="cal-badge" aria-hidden="true">{badge(day)}</span>}
            </button>
          )
        })}
      </div>
      {children}
      <div className="legend" aria-hidden="true">
        <span><i className="swatch onDay" /> On the day</span>
        <span><i className="swatch catchUp" /> Caught up</span>
      </div>
    </>
  )
}
