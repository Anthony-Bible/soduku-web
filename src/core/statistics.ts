import { DIFFICULTIES, type Difficulty } from './difficulty'

export interface DifficultyStats {
  readonly played: number
  readonly won: number
  readonly bestTimeSeconds: number | null
}

/** Per-difficulty counts of Games played and won, derived from Game records. A Daily Puzzle counts under its weekday's difficulty. */
export type Statistics = Readonly<Record<Difficulty, DifficultyStats>>

const ZERO: DifficultyStats = { played: 0, won: 0, bestTimeSeconds: null }

export const emptyStatistics = (): Statistics => ({ easy: ZERO, medium: ZERO, hard: ZERO, expert: ZERO })

export const totalPlayed = (s: Statistics): number => DIFFICULTIES.reduce((n, d) => n + s[d].played, 0)
export const totalWon = (s: Statistics): number => DIFFICULTIES.reduce((n, d) => n + s[d].won, 0)

export function winRatePercent(s: DifficultyStats): number {
  return s.played > 0 ? Math.round((s.won / s.played) * 100) : 0
}

/**
 * Lettergrid's Statistics, counted from its Daily log: only the counted solve of each day (the earliest
 * finished, ADR 0003) contributes. `parReached[i]` is how many counted solves reached Par tier i+1 (one to
 * three stars), so a three-star solve counts toward all three.
 */
export interface LettergridStatistics {
  /** Daily Puzzles solved, On-Day or Catch-Up; opening one without finishing it doesn't count. */
  readonly dailiesPlayed: number
  readonly bestScore: number | null
  readonly parReached: readonly [one: number, two: number, three: number]
}

