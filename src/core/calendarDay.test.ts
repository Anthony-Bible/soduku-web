import fc from 'fast-check'
import { describe, expect, test } from 'vitest'
import {
  addDays, addMonths, civil, dayFromDate, dayFromYMD, daysInMonth, firstOfMonth, startOfWeek, weekdayOf,
} from './calendarDay'
import { arbDay } from './fixtures'

describe('CalendarDay', () => {
  test('civil and dayFromYMD are inverses', () => {
    fc.assert(
      fc.property(arbDay, (d) => {
        const c = civil(d)
        expect(dayFromYMD(c.year, c.month, c.day)).toBe(d)
      }),
    )
  })

  test('known dates', () => {
    expect(dayFromYMD(1970, 1, 1)).toBe(0)
    expect(weekdayOf(dayFromYMD(2026, 11, 2))).toBe(0) // Monday
    expect(weekdayOf(dayFromYMD(2026, 11, 1))).toBe(6) // Sunday
    expect(weekdayOf(dayFromYMD(1970, 1, 1))).toBe(3) // Thursday
    expect(daysInMonth(dayFromYMD(2024, 2, 10))).toBe(29)
    expect(daysInMonth(dayFromYMD(2026, 2, 10))).toBe(28)
    expect(daysInMonth(dayFromYMD(2026, 12, 10))).toBe(31)
  })

  test('uses the local calendar date of a Date', () => {
    expect(dayFromDate(new Date(2026, 9, 31, 23, 59, 59))).toBe(dayFromYMD(2026, 10, 31))
    expect(dayFromDate(new Date(2026, 10, 1, 0, 0, 0))).toBe(dayFromYMD(2026, 11, 1))
  })

  test('weekday advances by one a day and start of week is a Monday at most 6 days back', () => {
    fc.assert(
      fc.property(arbDay, (d) => {
        expect(weekdayOf(addDays(d, 1))).toBe((weekdayOf(d) + 1) % 7)
        expect(weekdayOf(startOfWeek(d))).toBe(0)
        expect(d - startOfWeek(d)).toBeLessThanOrEqual(6)
      }),
    )
  })

  test('addMonths clamps to the month length and lands in the right month', () => {
    expect(civil(addMonths(dayFromYMD(2026, 1, 31), 1))).toEqual({ year: 2026, month: 2, day: 28 })
    expect(civil(addMonths(dayFromYMD(2026, 1, 15), -2))).toEqual({ year: 2025, month: 11, day: 15 })
    fc.assert(
      fc.property(arbDay, fc.integer({ min: -30, max: 30 }), (d, n) => {
        const c = civil(d)
        const r = civil(addMonths(d, n))
        expect((r.year * 12 + r.month) - (c.year * 12 + c.month)).toBe(n)
        expect(r.day).toBeLessThanOrEqual(c.day)
        expect(firstOfMonth(d)).toBeLessThanOrEqual(d)
      }),
    )
  })
})
