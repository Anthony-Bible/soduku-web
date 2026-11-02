import fc from 'fast-check'
import { describe, expect, test } from 'vitest'
import { dayFromYMD } from './calendarDay'
import {
  currentStreak, emptyDailyLog, isFullMonth, isPerfectWeek, longestStreak, recordOpen, recordSolve, solveFor,
  solvedCount, type DailyLog,
} from './dailyLog'

const T = dayFromYMD(2026, 11, 4) // a Wednesday

/** Opens a day on `openedOn` and solves it. */
const solveDay = (log: DailyLog, day: number, openedOn: number): DailyLog =>
  recordSolve(recordOpen(log, day, openedOn), day)

describe('DailyLog', () => {
  test('a day first opened on its own day is an On-Day Solve, however late it lands', () => {
    const log = solveDay(emptyDailyLog(), T, T)
    expect(solveFor(log, T)).toBe('onDay')
  })

  test('a past day first opened later is a Catch-Up Solve', () => {
    expect(solveFor(solveDay(emptyDailyLog(), T - 1, T), T - 1)).toBe('catchUp')
  })

  test('future days cannot be opened and an unopened day cannot be solved', () => {
    expect(recordOpen(emptyDailyLog(), T + 1, T)).toEqual(emptyDailyLog())
    expect(recordSolve(emptyDailyLog(), T)).toEqual(emptyDailyLog())
  })

  test('the first opening fixes the kind; reopening or re-solving changes nothing', () => {
    let log = recordOpen(emptyDailyLog(), T - 1, T)
    log = recordOpen(log, T - 1, T - 1 + 5) // later reopen ignored
    log = recordSolve(log, T - 1)
    expect(recordSolve(log, T - 1)).toEqual(log)
    expect(solveFor(log, T - 1)).toBe('catchUp')
  })

  test('Streak counts consecutive On-Day Solves ending today or yesterday', () => {
    let log = emptyDailyLog()
    for (const d of [T - 3, T - 2, T - 1]) log = solveDay(log, d, d)
    expect(currentStreak(log, T)).toBe(3) // today not solved yet: ends yesterday
    log = solveDay(log, T, T)
    expect(currentStreak(log, T)).toBe(4)
    expect(currentStreak(log, T + 2)).toBe(0) // a gap breaks it
    expect(longestStreak(log)).toBe(4)
  })

  test('a Catch-Up Solve never extends or repairs a Streak', () => {
    let log = emptyDailyLog()
    for (const d of [T - 4, T - 3, T - 1]) log = solveDay(log, d, d)
    const before = { streak: currentStreak(log, T), longest: longestStreak(log) }
    log = solveDay(log, T - 2, T) // fills the gap, but as a Catch-Up
    expect(currentStreak(log, T)).toBe(before.streak)
    expect(longestStreak(log)).toBe(before.longest)
  })

  test('property: over any solve history, Streak <= Longest Streak <= On-Day count; catch-ups never change them', () => {
    const history = fc.array(
      fc.record({ offset: fc.integer({ min: 0, max: 60 }), lateBy: fc.integer({ min: 0, max: 3 }) }),
      { maxLength: 80 },
    )
    fc.assert(
      fc.property(history, (events) => {
        const today = 1000
        let log = emptyDailyLog()
        for (const e of events) {
          const day = today - e.offset
          const openedOn = Math.min(today, day + e.lateBy)
          const before = { s: currentStreak(log, today), l: longestStreak(log) }
          const wasSolved = solveFor(log, day) !== undefined
          log = solveDay(log, day, openedOn)
          const kind = solveFor(log, day)
          if (!wasSolved && kind === 'catchUp') {
            expect(currentStreak(log, today)).toBe(before.s)
            expect(longestStreak(log)).toBe(before.l)
          }
          expect(longestStreak(log)).toBeGreaterThanOrEqual(before.l) // never decreases
        }
        const onDay = Object.values(log.solves).filter((k) => k === 'onDay').length
        expect(currentStreak(log, today)).toBeLessThanOrEqual(longestStreak(log))
        expect(longestStreak(log)).toBeLessThanOrEqual(onDay)
        expect(solvedCount(log)).toBeGreaterThanOrEqual(onDay)
      }),
    )
  })

  test('Perfect Week needs seven On-Day Solves Monday to Sunday', () => {
    const monday = dayFromYMD(2026, 11, 2)
    let log = emptyDailyLog()
    for (let i = 0; i < 6; i++) log = solveDay(log, monday + i, monday + i)
    expect(isPerfectWeek(log, monday + 3)).toBe(false)
    log = solveDay(log, monday + 6, monday + 6)
    expect(isPerfectWeek(log, monday + 3)).toBe(true)
  })

  test('Perfect Week does not count a Catch-Up Solve but Full Month does', () => {
    const first = dayFromYMD(2026, 2, 1) // 28 days
    let log = emptyDailyLog()
    for (let i = 0; i < 28; i++) log = solveDay(log, first + i, i === 10 ? first + 20 : first + i)
    expect(isFullMonth(log, first + 5)).toBe(true)
    expect(isPerfectWeek(log, first + 10)).toBe(false)
    expect(isFullMonth(log, first - 1)).toBe(false)
  })
})
