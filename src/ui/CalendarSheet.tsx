import { useState } from 'react'
import {
  addDays, addMonths, currentStreak, dayOfMonth, daysInMonth, firstOfMonth, longTitle, longestStreak, monthTitle,
  solveFor, solvedCount, weekdayOf, type CalendarDay, type SolveKind,
} from '../core'
import { useApp } from '../app/AppContext'
import { Icon } from './Icon'
import { Sheet } from './Sheet'

const WEEKDAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S']

function status(solve: SolveKind | undefined, isFuture: boolean): string {
  if (solve === 'onDay') return 'solved on the day'
  if (solve === 'catchUp') return 'solved later'
  return isFuture ? 'not available yet' : 'not solved'
}

/** Month view of Daily Puzzles: On-Day Solves filled, Catch-Up Solves outlined, future days locked. */
export function CalendarSheet() {
  const { controller, today } = useApp()
  const { dailyLog } = controller.profile
  const [month, setMonth] = useState<CalendarDay>(firstOfMonth(today))
  const canGoForward = month < firstOfMonth(today)

  return (
    <Sheet title="Calendar" onClose={() => controller.openSheet(null)}>
      <div className="summary">
        <div><Icon name="flame" fill /><strong className="tabular">{currentStreak(dailyLog, today)}</strong><small>Streak</small></div>
        <div><Icon name="trophy" /><strong className="tabular">{longestStreak(dailyLog)}</strong><small>Longest Streak</small></div>
        <div><Icon name="check" /><strong className="tabular">{solvedCount(dailyLog)}</strong><small>Solved</small></div>
      </div>
      <div className="month-header">
        <button type="button" className="icon-btn" aria-label="Previous month" onClick={() => setMonth(firstOfMonth(addMonths(month, -1)))}>
          <Icon name="left" />
        </button>
        <h3 aria-live="polite">{monthTitle(month)}</h3>
        <button type="button" className="icon-btn" aria-label="Next month" disabled={!canGoForward} onClick={() => setMonth(firstOfMonth(addMonths(month, 1)))}>
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
          const solve = solveFor(dailyLog, day)
          const isFuture = day > today
          const inProgress = solve === undefined && !isFuture && controller.profile.hasDailyInProgress(day)
          return (
            <button
              key={day}
              type="button"
              className={`cal-day${solve ? ` ${solve}` : ''}${day === today ? ' today' : ''}`}
              disabled={isFuture || solve !== undefined}
              aria-label={`${longTitle(day)}, ${status(solve, isFuture)}${inProgress ? ', in progress' : ''}`}
              onClick={() => controller.openDaily(day)}
            >
              {dayOfMonth(day)}
              {inProgress && <i className="dot" />}
            </button>
          )
        })}
      </div>
      <div className="legend" aria-hidden="true">
        <span><i className="swatch onDay" /> On the day</span>
        <span><i className="swatch catchUp" /> Caught up</span>
      </div>
    </Sheet>
  )
}
