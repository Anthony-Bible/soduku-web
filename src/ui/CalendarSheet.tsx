import { useState } from 'react'
import {
  currentStreak, dailyResult, displayName, longTitle, longestStreak, solveFor, solvedCount,
  type CalendarDay, type SolveKind, type WinResult,
} from '../core'
import { useApp } from '../app/AppContext'
import { CalendarMonth } from './CalendarMonth'
import { Icon } from './Icon'
import { Sheet } from './Sheet'
import { formatElapsed } from './format'
import { useShare } from './useShare'

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
  const [selected, setSelected] = useState<CalendarDay | null>(null)
  const selectedSolve = selected === null ? undefined : solveFor(dailyLog, selected)

  return (
    <Sheet title="Calendar" onClose={() => controller.openSheet(null)}>
      <div className="summary">
        <div><Icon name="flame" fill /><strong className="tabular">{currentStreak(dailyLog, today)}</strong><small>Streak</small></div>
        <div><Icon name="trophy" /><strong className="tabular">{longestStreak(dailyLog)}</strong><small>Longest Streak</small></div>
        <div><Icon name="check" /><strong className="tabular">{solvedCount(dailyLog)}</strong><small>Solved</small></div>
      </div>
      <CalendarMonth
        log={dailyLog}
        today={today}
        inProgress={(day) => controller.profile.hasDailyInProgress(day)}
        selected={selected}
        onSelect={setSelected}
        onOpen={(day) => controller.openDaily(day)}
      >
        {selected !== null && selectedSolve !== undefined && (
          <DayResult
            key={selected}
            day={selected}
            solve={selectedSolve}
            result={dailyResult(controller.profile.syncDoc(), selected)}
          />
        )}
      </CalendarMonth>
    </Sheet>
  )
}
