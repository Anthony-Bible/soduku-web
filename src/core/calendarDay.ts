/**
 * A proleptic-Gregorian calendar date with no time or time zone, as days since 1970-01-01.
 * Build one from a Date with `dayFromDate` so "today" means the player's own local day.
 */
export type CalendarDay = number

/** 0 = Monday ... 6 = Sunday. */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6

/** Days-from-civil (H. Hinnant). `month` is 1...12, `day` is 1...31. */
export function dayFromYMD(year: number, month: number, day: number): CalendarDay {
  const y = month <= 2 ? year - 1 : year
  const era = Math.floor(y / 400)
  const yoe = y - era * 400
  const mp = month > 2 ? month - 3 : month + 9
  const doy = Math.floor((153 * mp + 2) / 5) + day - 1
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy
  return era * 146097 + doe - 719468
}

/** The local calendar date of `date`. */
export const dayFromDate = (date: Date): CalendarDay =>
  dayFromYMD(date.getFullYear(), date.getMonth() + 1, date.getDate())

export function civil(day: CalendarDay): { year: number; month: number; day: number } {
  const z = day + 719468
  const era = Math.floor(z / 146097)
  const doe = z - era * 146097
  const yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365)
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100))
  const mp = Math.floor((5 * doy + 2) / 153)
  const d = doy - Math.floor((153 * mp + 2) / 5) + 1
  const m = mp < 10 ? mp + 3 : mp - 9
  return { year: yoe + era * 400 + (m <= 2 ? 1 : 0), month: m, day: d }
}

export const yearOf = (day: CalendarDay): number => civil(day).year
export const monthOf = (day: CalendarDay): number => civil(day).month
export const dayOfMonth = (day: CalendarDay): number => civil(day).day

export function weekdayOf(day: CalendarDay): Weekday {
  // 1970-01-01 was a Thursday (3).
  return ((((day + 3) % 7) + 7) % 7) as Weekday
}

export const addDays = (day: CalendarDay, n: number): CalendarDay => day + n
export const startOfWeek = (day: CalendarDay): CalendarDay => day - weekdayOf(day)
export const firstOfMonth = (day: CalendarDay): CalendarDay => {
  const c = civil(day)
  return dayFromYMD(c.year, c.month, 1)
}

export function daysInMonth(day: CalendarDay): number {
  const { year, month } = civil(day)
  const next = month === 12 ? dayFromYMD(year + 1, 1, 1) : dayFromYMD(year, month + 1, 1)
  return next - dayFromYMD(year, month, 1)
}

/** The same day of the month `months` away, clamped to that month's length. */
export function addMonths(day: CalendarDay, months: number): CalendarDay {
  const { year, month, day: d } = civil(day)
  const total = year * 12 + (month - 1) + months
  const ny = Math.floor(total / 12)
  const nm = total - ny * 12 + 1
  const first = dayFromYMD(ny, nm, 1)
  return first + Math.min(d, daysInMonth(first)) - 1
}

const utcDate = (day: CalendarDay): Date => new Date(day * 86_400_000)
const fmt = (opts: Intl.DateTimeFormatOptions) => (day: CalendarDay): string =>
  new Intl.DateTimeFormat(undefined, { ...opts, timeZone: 'UTC' }).format(utcDate(day))

/** "Saturday, October 31, 2026" */
export const longTitle = fmt({ weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
/** "Oct 31" */
export const shortTitle = fmt({ month: 'short', day: 'numeric' })
/** "October 2026" */
export const monthTitle = fmt({ month: 'long', year: 'numeric' })
