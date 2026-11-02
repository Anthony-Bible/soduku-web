import type { CalendarDay } from './calendarDay'
import { addDays, daysInMonth, firstOfMonth, startOfWeek } from './calendarDay'

/** onDay: first opened on its own day, however late it was finished. catchUp: first opened after its day ended. */
export type SolveKind = 'onDay' | 'catchUp'

/** The record of which Daily Puzzles were opened and solved. Plain data; every function returns a new log. */
export interface DailyLog {
  /** Daily Puzzle day -> the day it was first opened. */
  readonly firstOpened: Readonly<Record<number, number>>
  readonly solves: Readonly<Record<number, SolveKind>>
}

export const emptyDailyLog = (): DailyLog => ({ firstOpened: {}, solves: {} })

/** Records the first time a day's Daily Puzzle is opened. A future day is ignored. */
export function recordOpen(log: DailyLog, day: CalendarDay, today: CalendarDay): DailyLog {
  if (day > today || log.firstOpened[day] !== undefined) return log
  return { ...log, firstOpened: { ...log.firstOpened, [day]: today } }
}

/** Marks a day solved. The kind is fixed by its first opening; later solves change nothing. */
export function recordSolve(log: DailyLog, day: CalendarDay): DailyLog {
  const opened = log.firstOpened[day]
  if (log.solves[day] !== undefined || opened === undefined) return log
  return { ...log, solves: { ...log.solves, [day]: opened === day ? 'onDay' : 'catchUp' } }
}

export const solveFor = (log: DailyLog, day: CalendarDay): SolveKind | undefined => log.solves[day]
export const wasOpened = (log: DailyLog, day: CalendarDay): boolean => log.firstOpened[day] !== undefined
export const solvedDays = (log: DailyLog): CalendarDay[] =>
  Object.keys(log.solves).map(Number).sort((a, b) => a - b)
export const solvedCount = (log: DailyLog): number => Object.keys(log.solves).length

/** Consecutive On-Day Solves ending today, or ending yesterday if today is not solved yet. */
export function currentStreak(log: DailyLog, today: CalendarDay): number {
  let cursor = log.solves[today] === 'onDay' ? today : addDays(today, -1)
  let count = 0
  while (log.solves[cursor] === 'onDay') {
    count++
    cursor = addDays(cursor, -1)
  }
  return count
}

/** The longest run of On-Day Solves ever. On-Day Solves are never removed, so this never decreases. */
export function longestStreak(log: DailyLog): number {
  const days = Object.entries(log.solves)
    .filter(([, k]) => k === 'onDay')
    .map(([d]) => Number(d))
    .sort((a, b) => a - b)
  let best = 0
  let run = 0
  let previous: number | undefined
  for (const d of days) {
    run = previous !== undefined && d === previous + 1 ? run + 1 : 1
    best = Math.max(best, run)
    previous = d
  }
  return best
}

/** Every day of the Monday-Sunday week containing `day` has an On-Day Solve. */
export function isPerfectWeek(log: DailyLog, day: CalendarDay): boolean {
  const monday = startOfWeek(day)
  return [0, 1, 2, 3, 4, 5, 6].every((i) => log.solves[monday + i] === 'onDay')
}

/** Every day of the month containing `day` is solved, On-Day or Catch-Up. */
export function isFullMonth(log: DailyLog, day: CalendarDay): boolean {
  const first = firstOfMonth(day)
  const n = daysInMonth(first)
  for (let i = 0; i < n; i++) if (log.solves[first + i] === undefined) return false
  return true
}
