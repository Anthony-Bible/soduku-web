import { currentStreak, longestStreak, solvedCount, type CalendarDay, type DailyLog } from '../core'
import { Icon } from './Icon'

/** The Streak, Longest Streak and Solved count above a Calendar. */
export function StreakSummary({ log, today }: { log: DailyLog; today: CalendarDay }) {
  return (
    <div className="summary">
      <div><Icon name="flame" fill /><strong className="tabular">{currentStreak(log, today)}</strong><small>Streak</small></div>
      <div><Icon name="trophy" /><strong className="tabular">{longestStreak(log)}</strong><small>Longest Streak</small></div>
      <div><Icon name="check" /><strong className="tabular">{solvedCount(log)}</strong><small>Solved</small></div>
    </div>
  )
}

/** The flame badge on a Daily Puzzle card. */
export function StreakBadge({ streak }: { streak: number }) {
  return (
    <span className={`streak${streak > 0 ? ' active' : ''}`}>
      <Icon name="flame" fill={streak > 0} /> <span className="tabular" aria-hidden="true">{streak}</span>
      <span className="sr-only">{`Streak ${streak} ${streak === 1 ? 'day' : 'days'}`}</span>
    </span>
  )
}
