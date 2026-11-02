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
