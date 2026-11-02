import { weekdayOf, type CalendarDay } from './calendarDay'
import type { Difficulty } from './difficulty'
import { generate, type Puzzle } from './generator'
import { mix64 } from './random'

/** Bump only together with a new seeding/generation path that leaves earlier dates unchanged (ADR 0001). */
export const GENERATOR_VERSION = 1n

/** Mon-Tue Easy, Wed-Thu Medium, Fri-Sat Hard, Sun Expert. */
export function dailyDifficulty(day: CalendarDay): Difficulty {
  const w = weekdayOf(day)
  if (w <= 1) return 'easy'
  if (w <= 3) return 'medium'
  if (w <= 5) return 'hard'
  return 'expert'
}

/** A SplitMix64 finalizer over (version, date): stable, and distinct for distinct dates. */
export function dailySeed(day: CalendarDay): bigint {
  const ordinal = BigInt.asUintN(64, BigInt(day))
  return mix64((GENERATOR_VERSION << 48n) ^ ordinal ^ 0xda11_7000_0000_0000n)
}

export const dailyPuzzle = (day: CalendarDay): Puzzle => generate(dailyDifficulty(day), dailySeed(day))
