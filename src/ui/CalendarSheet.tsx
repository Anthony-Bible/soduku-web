import { useState } from 'react'
import {
  addDays, addMonths, currentStreak, dailyResult, dayOfMonth, daysInMonth, displayName, firstOfMonth, longTitle,
  longestStreak, monthTitle, solveFor, solvedCount, weekdayOf, type CalendarDay, type SolveKind, type WinResult,
} from '../core'
import { useApp } from '../app/AppContext'
import { Icon } from './Icon'
import { Sheet } from './Sheet'
import { formatElapsed } from './format'
import { useShare } from './useShare'

const WEEKDAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S']

function status(solve: SolveKind | undefined, isFuture: boolean): string {
  if (solve === 'onDay') return 'solved on the day'
  if (solve === 'catchUp') return 'solved later'
  return isFuture ? 'not available yet' : 'not solved'
}

/** A solved day's result, with Share. The Streak goes in the Share text only for today's Daily Puzzle. */
function DayResult({ day, solve, result }: { day: CalendarDay; solve: SolveKind; result: WinResult | null }) {
  const { controller, today } = useApp()
  const share = useShare({
    difficulty: result?.difficulty ?? 'easy',
    seconds: result?.seconds ?? 0,
    mistakes: result?.mistakes ?? 0,
    hintsUsed: result?.hintsUsed ?? 0,
    dailyDay: day,
    streak: day === today ? controller.profile.currentStreak(today) : 0,
  })
  return (
    <section className="day-result" aria-label="Daily Puzzle result">
      <h3>
        {longTitle(day)}
        {result && ` · ${displayName(result.difficulty)}`}
      </h3>
      <p className="muted">{solve === 'onDay' ? 'Solved on the day' : 'Solved later'}</p>
      {result && (
        <>
          <p className="tabular">
            ⏱ {formatElapsed(result.seconds)} · Mistakes {result.mistakes} · Hints used {result.hintsUsed}
          </p>
          {share.button}
          {share.message}
        </>
      )}
    </section>
  )
}

/**
 * Month view of Daily Puzzles: On-Day Solves filled, Catch-Up Solves outlined, future days locked. An
 * unsolved day opens its puzzle; a solved day shows its result underneath.
 */
export function CalendarSheet() {
  const { controller, today } = useApp()
  const { dailyLog } = controller.profile
  const [month, setMonth] = useState<CalendarDay>(firstOfMonth(today))
  const [selected, setSelected] = useState<CalendarDay | null>(null)
  const canGoForward = month < firstOfMonth(today)
  const changeMonth = (m: CalendarDay) => {
    setMonth(firstOfMonth(m))
    setSelected(null)
  }
  const selectedSolve = selected === null ? undefined : solveFor(dailyLog, selected)

  return (
    <Sheet title="Calendar" onClose={() => controller.openSheet(null)}>
      <div className="summary">
        <div><Icon name="flame" fill /><strong className="tabular">{currentStreak(dailyLog, today)}</strong><small>Streak</small></div>
        <div><Icon name="trophy" /><strong className="tabular">{longestStreak(dailyLog)}</strong><small>Longest Streak</small></div>
        <div><Icon name="check" /><strong className="tabular">{solvedCount(dailyLog)}</strong><small>Solved</small></div>
      </div>
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
          const solve = solveFor(dailyLog, day)
          const isFuture = day > today
          const inProgress = solve === undefined && !isFuture && controller.profile.hasDailyInProgress(day)
          return (
            <button
              key={day}
              type="button"
              className={`cal-day${solve ? ` ${solve}` : ''}${day === today ? ' today' : ''}`}
              disabled={isFuture}
              aria-label={`${longTitle(day)}, ${status(solve, isFuture)}${inProgress ? ', in progress' : ''}`}
              aria-pressed={solve === undefined ? undefined : day === selected}
              onClick={() => (solve === undefined ? controller.openDaily(day) : setSelected(day))}
            >
              {dayOfMonth(day)}
              {inProgress && <i className="dot" />}
            </button>
          )
        })}
      </div>
      {selected !== null && selectedSolve !== undefined && (
        <DayResult
          key={selected}
          day={selected}
          solve={selectedSolve}
          result={dailyResult(controller.profile.syncDoc(), selected)}
        />
      )}
      <div className="legend" aria-hidden="true">
        <span><i className="swatch onDay" /> On the day</span>
        <span><i className="swatch catchUp" /> Caught up</span>
      </div>
    </Sheet>
  )
}
